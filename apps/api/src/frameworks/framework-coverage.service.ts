import { Injectable, NotFoundException, ForbiddenException, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FrameworkEntitlementsService } from './framework-entitlements.service';
import { ResourceAuthorizationService, ResourceAuthContext } from '../auth/resource-authorization.service';
import { EffectiveServiceStateResolver } from '../service-control/effective-service-state-resolver.service';
import {
  FrameworkCoverageResultDto,
  FrameworkReferenceCoverageDto,
  FrameworkGapQueryDto,
  CoverageStatus,
  MappingStatus,
  FrameworkCode,
  AuditCheckResult,
  ControlEffectivenessStatus,
  FindingStatus,
  ReferenceTestingSummaryDto,
  MappedControlSummaryDto,
} from '@omnigrc/shared';

@Injectable()
export class FrameworkCoverageService {
  private readonly logger = new Logger(FrameworkCoverageService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly frameworkEntitlementsService: FrameworkEntitlementsService,
    private readonly resourceAuthService: ResourceAuthorizationService,
    @Optional()
    private readonly effectiveResolver?: EffectiveServiceStateResolver,
  ) {}

  /**
   * Calculate Framework Coverage and Gap Analysis server-side.
   * Strictly enforces:
   * 1. Commercial framework licensing/entitlements via FrameworkEntitlementsService.
   * 2. Organization tenant isolation & Phase B department/project resource authorization.
   * 3. Deterministic coverage semantics: COVERED | PARTIAL | NOT_COVERED.
   * 4. Zero fabrication of normative text (preserves DB values).
   */
  async calculateCoverage(
    authCtx: ResourceAuthContext,
    frameworkIdOrCode: string,
    query?: FrameworkGapQueryDto,
  ): Promise<FrameworkCoverageResultDto> {
    const { organizationId } = authCtx;
    const versionId = query?.versionId;

    // 1. Commercial Licensing Entitlement Assertion
    await this.frameworkEntitlementsService.assertEntitled(organizationId, frameworkIdOrCode, versionId);

    // 2. Resolve Framework Entity
    const isEnumCode = Object.values(FrameworkCode).includes(frameworkIdOrCode as FrameworkCode);
    const framework = await this.prisma.framework.findFirst({
      where: isEnumCode
        ? { OR: [{ id: frameworkIdOrCode }, { code: frameworkIdOrCode as FrameworkCode }] }
        : { id: frameworkIdOrCode },
      select: { id: true, code: true, name: true },
    });

    if (!framework) {
      throw new NotFoundException(`Framework "${frameworkIdOrCode}" not found.`);
    }

    // 3. Resolve Applicable Framework Version
    let targetVersion: { id: string; version: string; name: string } | null = null;
    if (versionId) {
      targetVersion = await this.prisma.frameworkVersion.findFirst({
        where: { id: versionId, frameworkId: framework.id },
        select: { id: true, version: true, name: true },
      });
      if (!targetVersion) {
        throw new NotFoundException(`Framework version "${versionId}" not found for framework "${framework.code}".`);
      }
    } else {
      // Pick active version or latest
      targetVersion = await this.prisma.frameworkVersion.findFirst({
        where: { frameworkId: framework.id, status: 'ACTIVE' },
        orderBy: { version: 'desc' },
        select: { id: true, version: true, name: true },
      });

      if (!targetVersion) {
        targetVersion = await this.prisma.frameworkVersion.findFirst({
          where: { frameworkId: framework.id },
          orderBy: { createdAt: 'desc' },
          select: { id: true, version: true, name: true },
        });
      }
    }

    if (!targetVersion) {
      return {
        framework: { id: framework.id, code: framework.code, name: framework.name },
        version: { id: '', version: 'N/A', name: 'No Version' },
        summary: { totalReferences: 0, covered: 0, partial: 0, notCovered: 0, coveragePercentage: 0 },
        references: [],
      };
    }

    // 4. Phase B Resource Authorization Scope Filter
    const scopeWhere = await this.resourceAuthService.getScopeWhereClause(authCtx);

    // 5. Query All References in Version
    const references = await this.prisma.frameworkReference.findMany({
      where: { frameworkVersionId: targetVersion.id },
      orderBy: [{ sortOrder: 'asc' }, { identifier: 'asc' }],
    });

    if (references.length === 0) {
      return {
        framework: { id: framework.id, code: framework.code, name: framework.name },
        version: { id: targetVersion.id, version: targetVersion.version, name: targetVersion.name },
        summary: { totalReferences: 0, covered: 0, partial: 0, notCovered: 0, coveragePercentage: 0 },
        references: [],
      };
    }

    const refIds = references.map((r) => r.id);
    const refIdentifiers = references.map((r) => r.identifier);

    // 6. Fetch Framework Clauses for matching legacy clause mappings
    const frameworkClauses = await this.prisma.frameworkClause.findMany({
      where: { frameworkId: framework.id, code: { in: refIdentifiers } },
      select: { id: true, code: true },
    });
    const clauseIdToCodeMap = new Map(frameworkClauses.map((c) => [c.id, c.code]));

    // 7. Query Mapped Controls bounded by Phase B Scope & Not Deleted
    const controlMappings = await this.prisma.controlFrameworkMapping.findMany({
      where: {
        control: { ...scopeWhere, deletedAt: null },
        OR: [
          { frameworkReferenceId: { in: refIds } },
          { frameworkClauseId: { in: frameworkClauses.map((c) => c.id) } },
        ],
      },
      include: {
        control: {
          select: {
            id: true,
            name: true,
            description: true,
            category: true,
            departmentId: true,
            projectId: true,
            evidenceAssociations: {
              include: {
                evidence: {
                  select: { id: true, title: true, fileName: true, status: true, scanStatus: true, deletedAt: true },
                },
              },
            },
            approvalAssociations: {
              include: {
                approvalInstance: {
                  select: { id: true, title: true, status: true, purpose: true },
                },
              },
            },
          },
        },
      },
    });

    // 8. Query Direct Evidence for References bounded by Tenant & Not Deleted
    const directEvidences = await this.prisma.evidenceFrameworkReference.findMany({
      where: {
        frameworkReferenceId: { in: refIds },
        evidence: { organizationId, deletedAt: null },
      },
      include: {
        evidence: {
          select: { id: true, title: true, fileName: true, status: true, scanStatus: true },
        },
      },
    });

    // 9. Query Direct Approvals for References
    const directApprovals = await this.prisma.approvalInstance.findMany({
      where: {
        frameworkReferenceId: { in: refIds },
        organizationId,
      },
      select: { id: true, title: true, status: true, purpose: true, frameworkReferenceId: true },
    });

    // 10. Query Batched Control Testing Outcomes (Respects BUSINESS_AUDITS Capability & Tenant Isolation)
    const allMappedControlIds = Array.from(
      new Set(
        controlMappings
          .filter((m) => m.status !== MappingStatus.REJECTED)
          .map((m) => m.control.id),
      ),
    );

    let isTestingAvailable = true;
    if (this.effectiveResolver) {
      try {
        const auditCap = await this.effectiveResolver.resolveEffectiveState(organizationId, 'BUSINESS_AUDITS');
        isTestingAvailable = auditCap.isAvailable;
      } catch (err) {
        this.logger.warn(`Failed to resolve BUSINESS_AUDITS capability for org ${organizationId}: ${err}`);
        isTestingAvailable = false;
      }
    }

    const controlTestMap = new Map<
      string,
      {
        latestTestResult: AuditCheckResult | null;
        effectivenessStatus: ControlEffectivenessStatus;
        hasUnresolvedFinding: boolean;
        hasFailedTest: boolean;
        hasPartialTest: boolean;
      }
    >();

    if (isTestingAvailable && allMappedControlIds.length > 0 && this.prisma.auditCheckItem) {
      const checkItems = await this.prisma.auditCheckItem.findMany({
        where: {
          controlId: { in: allMappedControlIds },
          organizationId,
        },
        orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
        select: {
          id: true,
          controlId: true,
          result: true,
          updatedAt: true,
          findings: {
            select: { id: true, status: true },
          },
        },
      });

      const checkItemsByControl = new Map<string, typeof checkItems>();
      for (const item of checkItems) {
        if (!item.controlId) continue;
        const list = checkItemsByControl.get(item.controlId) || [];
        list.push(item);
        checkItemsByControl.set(item.controlId, list);
      }

      for (const controlId of allMappedControlIds) {
        const items = checkItemsByControl.get(controlId) || [];
        const latestEvaluated = items.find((i) => i.result !== AuditCheckResult.NOT_EVALUATED);
        const latestItem = items[0] || null;
        const latestTestResult = (latestEvaluated?.result || latestItem?.result || null) as AuditCheckResult | null;

        let effectivenessStatus: ControlEffectivenessStatus = 'NOT_TESTED';
        if (latestTestResult === AuditCheckResult.COMPLIANT) {
          effectivenessStatus = 'EFFECTIVE';
        } else if (latestTestResult === AuditCheckResult.PARTIALLY_COMPLIANT) {
          effectivenessStatus = 'PARTIALLY_EFFECTIVE';
        } else if (latestTestResult === AuditCheckResult.NON_COMPLIANT) {
          effectivenessStatus = 'INEFFECTIVE';
        } else if (latestTestResult === AuditCheckResult.NOT_APPLICABLE) {
          effectivenessStatus = 'NOT_APPLICABLE';
        }

        const unresolvedFindings = items
          .flatMap((i) => i.findings || [])
          .filter((f) => f.status !== FindingStatus.CLOSED && f.status !== FindingStatus.VERIFIED);
        const hasUnresolvedFinding = unresolvedFindings.length > 0;
        const hasFailedTest = latestEvaluated?.result === AuditCheckResult.NON_COMPLIANT;
        const hasPartialTest = latestEvaluated?.result === AuditCheckResult.PARTIALLY_COMPLIANT;

        controlTestMap.set(controlId, {
          latestTestResult,
          effectivenessStatus,
          hasUnresolvedFinding,
          hasFailedTest,
          hasPartialTest,
        });
      }
    }

    // Map data to references
    const referenceResults: FrameworkReferenceCoverageDto[] = references.map((ref) => {
      // Find matching control mappings
      const matchingMappings = controlMappings.filter((m) => {
        if (m.frameworkReferenceId === ref.id) return true;
        if (m.frameworkClauseId && clauseIdToCodeMap.get(m.frameworkClauseId) === ref.identifier) return true;
        return false;
      });

      // Filter non-rejected mappings
      const activeMappings = matchingMappings.filter((m) => m.status !== MappingStatus.REJECTED);
      const validHumanMappings = activeMappings.filter(
        (m) => m.status === MappingStatus.APPROVED || m.status === MappingStatus.OVERRIDDEN,
      );

      // Collect mapped controls with operational testing posture
      const mappedControls: MappedControlSummaryDto[] = activeMappings.map((m) => {
        const t = controlTestMap.get(m.control.id);
        return {
          controlId: m.control.id,
          name: m.control.name,
          description: m.control.description,
          category: m.control.category,
          mappingStatus: m.status,
          departmentId: m.control.departmentId,
          projectId: m.control.projectId,
          latestTestResult: t?.latestTestResult || null,
          effectivenessStatus: t?.effectivenessStatus || 'NOT_TESTED',
          hasUnresolvedFinding: t?.hasUnresolvedFinding || false,
        };
      });

      // Collect evidence
      const controlEvidenceList = activeMappings.flatMap((m) =>
        m.control.evidenceAssociations
          .filter((ea) => !ea.evidence.deletedAt)
          .map((ea) => ea.evidence),
      );

      const directEvidenceList = directEvidences
        .filter((de) => de.frameworkReferenceId === ref.id)
        .map((de) => de.evidence);

      const combinedEvidence = [...controlEvidenceList, ...directEvidenceList];
      // Deduplicate evidence by ID
      const uniqueEvidenceMap = new Map<string, typeof combinedEvidence[0]>();
      for (const ev of combinedEvidence) {
        uniqueEvidenceMap.set(ev.id, ev);
      }
      const uniqueEvidence = Array.from(uniqueEvidenceMap.values());

      const cleanActiveEvidenceCount = uniqueEvidence.filter(
        (ev) => ev.status === 'ACTIVE' && ev.scanStatus === 'CLEAN',
      ).length;

      const evidenceSummary = {
        totalCount: uniqueEvidence.length,
        cleanActiveCount: cleanActiveEvidenceCount,
        evidences: uniqueEvidence.map((ev) => ({
          id: ev.id,
          title: ev.title,
          fileName: ev.fileName,
          status: ev.status,
          scanStatus: ev.scanStatus,
        })),
      };

      // Collect approvals
      const controlApprovals = activeMappings.flatMap((m) =>
        m.control.approvalAssociations.map((aa) => aa.approvalInstance),
      );
      const refDirectApprovals = directApprovals.filter((da) => da.frameworkReferenceId === ref.id);
      const combinedApprovals = [...controlApprovals, ...refDirectApprovals];

      const uniqueApprovalMap = new Map<string, typeof combinedApprovals[0]>();
      for (const app of combinedApprovals) {
        uniqueApprovalMap.set(app.id, app);
      }
      const uniqueApprovals = Array.from(uniqueApprovalMap.values());

      let overallApprovalStatus: string | null = null;
      let hasApproval = false;

      if (uniqueApprovals.length > 0) {
        const isAnyRejected = uniqueApprovals.some(
          (a) => a.status === 'REJECTED' || a.status === 'CHANGES_REQUESTED',
        );
        const isAnyApproved = uniqueApprovals.some((a) => a.status === 'APPROVED');
        const isAnyPending = uniqueApprovals.some(
          (a) => a.status === 'PENDING' || a.status === 'IN_REVIEW' || a.status === 'DRAFT',
        );

        if (isAnyRejected) {
          overallApprovalStatus = 'REJECTED';
        } else if (isAnyApproved) {
          overallApprovalStatus = 'APPROVED';
          hasApproval = true;
        } else if (isAnyPending) {
          overallApprovalStatus = 'PENDING';
        } else {
          overallApprovalStatus = uniqueApprovals[0].status;
        }
      }

      const approvalSummary = {
        hasApproval,
        status: overallApprovalStatus,
        instances: uniqueApprovals.map((a) => ({
          id: a.id,
          title: a.title,
          status: a.status,
          purpose: a.purpose,
        })),
      };

      // Calculate Operational Testing Impact on Coverage
      const refControlIds = activeMappings.map((m) => m.control.id);
      const isAnyControlFailed = refControlIds.some((cid) => controlTestMap.get(cid)?.hasFailedTest);
      const isAnyControlPartial = refControlIds.some((cid) => controlTestMap.get(cid)?.hasPartialTest);
      const isAnyControlFindingUnresolved = refControlIds.some((cid) => controlTestMap.get(cid)?.hasUnresolvedFinding);

      const refTestingList = refControlIds.map((cid) => controlTestMap.get(cid)).filter(Boolean);
      const testingSummary: ReferenceTestingSummaryDto = {
        totalTests: refTestingList.length,
        isTestingAvailable,
        hasFailures: isAnyControlFailed,
        hasUnresolvedFindings: isAnyControlFindingUnresolved,
        latestTestResult: refTestingList[0]?.latestTestResult || null,
      };

      // Calculate Coverage Status deterministically:
      // Must have valid human sign-off mapping, clean active evidence, satisfied approval,
      // and NO operational test failures, partial compliance blockers, or unresolved findings.
      let status: CoverageStatus = 'NOT_COVERED';

      if (activeMappings.length === 0) {
        status = 'NOT_COVERED';
      } else {
        const isMappingValid = validHumanMappings.length > 0;
        const hasCleanEvidence = cleanActiveEvidenceCount > 0;
        const isApprovalSatisfied = overallApprovalStatus === null || overallApprovalStatus === 'APPROVED';
        const hasTestingBlocker = isTestingAvailable && (isAnyControlFailed || isAnyControlPartial || isAnyControlFindingUnresolved);

        if (isMappingValid && hasCleanEvidence && isApprovalSatisfied && !hasTestingBlocker) {
          status = 'COVERED';
        } else {
          status = 'PARTIAL';
        }
      }

      return {
        referenceId: ref.id,
        code: ref.identifier,
        title: ref.title,
        type: ref.type,
        status,
        normativeText: ref.normativeText || null, // NO FABRICATION
        mappedControlsCount: mappedControls.length,
        mappedControls,
        evidenceSummary,
        approvalSummary,
        testingSummary,
      };
    });

    // Filtering by status, type, search
    let filteredReferences = referenceResults;

    if (query?.status) {
      filteredReferences = filteredReferences.filter((r) => r.status === query.status);
    }

    if (query?.type) {
      filteredReferences = filteredReferences.filter(
        (r) => r.type.toUpperCase() === query.type!.toUpperCase(),
      );
    }

    if (query?.search && query.search.trim()) {
      const q = query.search.trim().toLowerCase();
      filteredReferences = filteredReferences.filter(
        (r) => r.code.toLowerCase().includes(q) || r.title.toLowerCase().includes(q),
      );
    }

    // Calculate Summary Metrics from overall reference list (unfiltered)
    const totalReferences = referenceResults.length;
    const covered = referenceResults.filter((r) => r.status === 'COVERED').length;
    const partial = referenceResults.filter((r) => r.status === 'PARTIAL').length;
    const notCovered = referenceResults.filter((r) => r.status === 'NOT_COVERED').length;
    const coveragePercentage =
      totalReferences > 0 ? Math.round((covered / totalReferences) * 1000) / 10 : 0;

    return {
      framework: {
        id: framework.id,
        code: framework.code,
        name: framework.name,
      },
      version: {
        id: targetVersion.id,
        version: targetVersion.version,
        name: targetVersion.name,
      },
      summary: {
        totalReferences,
        covered,
        partial,
        notCovered,
        coveragePercentage,
      },
      references: filteredReferences,
    };
  }

  /**
   * Server-side Gap Analysis.
   * Returns references where status is PARTIAL or NOT_COVERED (or matching explicit status filter).
   */
  async getGaps(
    authCtx: ResourceAuthContext,
    frameworkIdOrCode: string,
    query?: FrameworkGapQueryDto,
  ): Promise<FrameworkCoverageResultDto> {
    const fullCoverage = await this.calculateCoverage(authCtx, frameworkIdOrCode, query);

    // If query.status is specified, it was already applied.
    // If query.status is NOT specified, default gap analysis filters out 'COVERED' references.
    let gapReferences = fullCoverage.references;
    if (!query?.status) {
      gapReferences = gapReferences.filter((r) => r.status === 'PARTIAL' || r.status === 'NOT_COVERED');
    }

    return {
      ...fullCoverage,
      references: gapReferences,
    };
  }
}
