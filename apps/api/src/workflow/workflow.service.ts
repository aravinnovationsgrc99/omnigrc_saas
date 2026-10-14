import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FrameworkEntitlementsService } from '../frameworks/framework-entitlements.service';
import { RemediationService } from '../remediation/remediation.service';
import { EffectiveServiceStateResolver } from '../service-control/effective-service-state-resolver.service';
import {
  GrcLifecycleDto,
  GrcLifecycleStageDto,
  WorkflowNextActionDto,
  WorkflowPrerequisitesDto,
  WorkflowAttentionSummaryDto,
  WorkflowAttentionItemDto,
  Role,
  EvidenceScanStatus,
  EvidenceStatus,
  ApprovalInstanceStatus,
  AuditCheckResult,
  ControlEffectivenessStatus,
  FindingStatus,
} from '@omnigrc/shared';

const DOMAIN_CAPABILITY_MAP: Record<string, string> = {
  CONTROL: 'GRC_CORE_CONTROLS',
  RISK: 'GRC_CORE_RISKS',
  POLICY: 'POLICIES_MODULE',
  AUDIT_FINDING: 'BUSINESS_AUDITS',
  VENDOR_ASSESSMENT: 'VENDOR_RISK',
  VENDOR: 'VENDOR_RISK',
  VULNERABILITY: 'VULNERABILITY_MGMT',
  INCIDENT: 'INCIDENT_MGMT',
};

@Injectable()
export class WorkflowService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly frameworkEntitlementsService: FrameworkEntitlementsService,
    private readonly remediationService: RemediationService,
    private readonly effectiveResolver: EffectiveServiceStateResolver,
  ) {}

  /**
   * Get Unified End-to-End GRC Lifecycle Graph for a Resource
   */
  async getLifecycle(
    organizationId: string,
    resourceType: string,
    resourceId: string,
  ): Promise<GrcLifecycleDto> {
    const normalizedType = resourceType.toUpperCase();

    // 0. Primary Domain Capability Enforcement (Fail-Closed)
    const primaryCapCode = DOMAIN_CAPABILITY_MAP[normalizedType];
    if (!primaryCapCode) {
      throw new ForbiddenException(`Unknown or unsupported resource domain: "${resourceType}".`);
    }

    const primaryCapState = await this.effectiveResolver.resolveEffectiveState(organizationId, primaryCapCode);
    if (!primaryCapState.isAvailable) {
      throw new ForbiddenException(
        `Service capability [${primaryCapCode}] for domain "${normalizedType}" is not available: ${primaryCapState.reason}`,
      );
    }

    // Resolve sub-domain capability states in parallel
    const [
      frameworkCap,
      evidenceCap,
      aiCap,
      approvalCap,
      tasksCap,
      auditCap,
    ] = await Promise.all([
      this.effectiveResolver.resolveEffectiveState(organizationId, 'FRAMEWORK_LIBRARY'),
      this.effectiveResolver.resolveEffectiveState(organizationId, 'EVIDENCE_VAULT'),
      this.effectiveResolver.resolveEffectiveState(organizationId, 'AI_DOC_INTELLIGENCE'),
      this.effectiveResolver.resolveEffectiveState(organizationId, 'APPROVAL_ENGINE'),
      this.effectiveResolver.resolveEffectiveState(organizationId, 'GRC_CORE_TASKS'),
      this.effectiveResolver.resolveEffectiveState(organizationId, 'BUSINESS_AUDITS'),
    ]);

    let resourceTitle = `${normalizedType} #${resourceId}`;
    let authoritativeStatus = 'OPEN';
    let frameworkRefId: string | null = null;
    let controlMappings: Array<{ id: string; status: string; frameworkReferenceId?: string | null }> = [];

    // 1. Fetch Primary Resource Details & Ownership Verification
    switch (normalizedType) {
      case 'CONTROL': {
        const c = await this.prisma.control.findFirst({
          where: { id: resourceId, organizationId, deletedAt: null },
          include: { mappings: { include: { frameworkReference: true } } },
        });
        if (!c) throw new NotFoundException(`Control "${resourceId}" not found.`);
        resourceTitle = c.name;
        controlMappings = c.mappings || [];
        const approvedMapping = controlMappings.find(
          (m: any) => m.status === 'APPROVED' || m.status === 'OVERRIDDEN',
        );
        const primaryMapping = approvedMapping || controlMappings[0] || null;
        authoritativeStatus = primaryMapping?.status || 'UNMAPPED';
        frameworkRefId = primaryMapping?.frameworkReferenceId || null;
        break;
      }
      case 'RISK': {
        const r = await this.prisma.risk.findFirst({
          where: { id: resourceId, organizationId, deletedAt: null },
        });
        if (!r) throw new NotFoundException(`Risk "${resourceId}" not found.`);
        resourceTitle = r.title;
        authoritativeStatus = r.status;
        break;
      }
      case 'POLICY': {
        const p = await this.prisma.policy.findFirst({
          where: { id: resourceId, organizationId, deletedAt: null },
        });
        if (!p) throw new NotFoundException(`Policy "${resourceId}" not found.`);
        resourceTitle = p.title;
        authoritativeStatus = p.status;
        break;
      }
      case 'AUDIT_FINDING': {
        const f = await this.prisma.auditFinding.findFirst({
          where: { id: resourceId, organizationId },
        });
        if (!f) throw new NotFoundException(`Audit finding "${resourceId}" not found.`);
        resourceTitle = f.title;
        authoritativeStatus = f.status;
        break;
      }
      case 'VENDOR_ASSESSMENT': {
        const va = await this.prisma.vendorAssessment.findFirst({
          where: { id: resourceId, organizationId },
        });
        if (!va) throw new NotFoundException(`Vendor Assessment "${resourceId}" not found.`);
        resourceTitle = va.title;
        authoritativeStatus = va.status;
        break;
      }
      case 'VULNERABILITY': {
        const v = await this.prisma.vulnerability.findFirst({
          where: { id: resourceId, organizationId, deletedAt: null },
        });
        if (!v) throw new NotFoundException(`Vulnerability "${resourceId}" not found.`);
        resourceTitle = v.title;
        authoritativeStatus = v.status;
        break;
      }
      case 'INCIDENT': {
        const inc = await this.prisma.incident.findFirst({
          where: { id: resourceId, organizationId, deletedAt: null },
        });
        if (!inc) throw new NotFoundException(`Incident "${resourceId}" not found.`);
        resourceTitle = inc.title;
        authoritativeStatus = inc.status;
        break;
      }
      default: {
        resourceTitle = `${normalizedType} Item`;
        authoritativeStatus = 'ACTIVE';
      }
    }

    // 2. Fetch Linked Framework Reference Context (Respects FRAMEWORK_LIBRARY Capability)
    let frameworkReference: GrcLifecycleDto['frameworkReference'] = null;
    if (frameworkRefId && frameworkCap.isAvailable) {
      const ref = await this.prisma.frameworkReference.findFirst({
        where: { id: frameworkRefId },
        include: { frameworkVersion: { include: { framework: true } } },
      });
      if (ref && ref.frameworkVersion) {
        // Enforce Entitlement Check
        const isEntitled = await this.frameworkEntitlementsService.isEntitled(
          organizationId,
          ref.frameworkVersion.frameworkId,
          ref.frameworkVersionId,
        );
        if (isEntitled) {
          frameworkReference = {
            id: ref.id,
            identifier: ref.identifier,
            title: ref.title,
            frameworkCode: ref.frameworkVersion.framework.code,
          };
        }
      }
    }

    // 3. Fetch Linked Evidence Vault Items (Respects EVIDENCE_VAULT Capability)
    const evidenceAssociations = evidenceCap.isAvailable
      ? await this.fetchEvidenceForResource(organizationId, normalizedType, resourceId)
      : [];
    const evidences = evidenceAssociations.map((e) => {
      const isValidProof = e.status === EvidenceStatus.ACTIVE && e.scanStatus === EvidenceScanStatus.CLEAN;
      return {
        id: e.id,
        title: e.title,
        fileName: e.fileName,
        scanStatus: e.scanStatus,
        status: e.status,
        isValidProof,
      };
    });

    // 4. Fetch AI Analyses & Extracted Findings for Attached Evidence (Respects AI_DOC_INTELLIGENCE Capability)
    const evidenceIds = evidences.map((e) => e.id);
    const aiAnalysesRecords = (aiCap.isAvailable && evidenceIds.length > 0)
      ? await this.prisma.documentAnalysis.findMany({
          where: {
            organizationId,
            evidenceId: { in: evidenceIds },
          },
          include: { findings: true },
        })
      : [];

    const aiAnalyses = aiAnalysesRecords.map((a) => {
      const unreviewedCount = a.findings.filter((f) => f.reviewStatus === 'UNREVIEWED').length;
      return {
        id: a.id,
        status: a.status,
        findingsCount: a.findings.length,
        unreviewedCount,
      };
    });

    // 5. Fetch Approvals & Decisions (Respects APPROVAL_ENGINE Capability)
    const approvalInstances = approvalCap.isAvailable
      ? await this.prisma.approvalInstance.findMany({
          where: {
            organizationId,
            resourceType: normalizedType,
            resourceId,
          },
          include: { decisions: true },
          orderBy: { createdAt: 'desc' },
        })
      : [];

    const approvals = approvalInstances.map((ai) => ({
      id: ai.id,
      title: ai.title,
      status: ai.status,
      purpose: ai.purpose || null,
    }));

    // 6. Fetch Remediation Actions (Respects GRC_CORE_TASKS Capability)
    let remediations: Array<{
      id: string;
      title: string;
      status: string;
      owner: string;
      dueDate: string | null;
      isOverdue: boolean;
    }> = [];

    if (tasksCap.isAvailable) {
      const remediationsData = await this.remediationService.findAll(organizationId, {
        limit: 100,
      });
      const resourceRemediations = remediationsData.items.filter(
        (r) => r.sourceId === resourceId || (normalizedType === 'AUDIT_FINDING' && r.sourceType === 'AUDIT_CAPA'),
      );

      remediations = resourceRemediations.map((r) => ({
        id: r.id,
        title: r.title,
        status: r.status,
        owner: r.owner || 'Unassigned',
        dueDate: r.dueDate ? (typeof r.dueDate === 'string' ? r.dueDate : (r.dueDate as any).toISOString()) : null,
        isOverdue: r.isOverdue,
      }));
    }

    // 6.5. Fetch Control Testing State & Operational Outcomes (Respects BUSINESS_AUDITS Capability)
    let controlTestingState: {
      isAvailable: boolean;
      totalTests: number;
      latestResult: AuditCheckResult | null;
      effectivenessStatus: ControlEffectivenessStatus;
      unresolvedFindingsCount: number;
      isFailed: boolean;
      isPartial: boolean;
      hasUnresolvedFindings: boolean;
    } | null = null;

    if (normalizedType === 'CONTROL') {
      if (!auditCap.isAvailable) {
        controlTestingState = {
          isAvailable: false,
          totalTests: 0,
          latestResult: null,
          effectivenessStatus: 'NOT_TESTED',
          unresolvedFindingsCount: 0,
          isFailed: false,
          isPartial: false,
          hasUnresolvedFindings: false,
        };
      } else {
        const checkItems = this.prisma.auditCheckItem
          ? await this.prisma.auditCheckItem.findMany({
              where: { controlId: resourceId, organizationId },
              orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
              include: {
                findings: { select: { id: true, status: true } },
              },
            })
          : [];

        const latestEvaluated = checkItems.find((i) => i.result !== AuditCheckResult.NOT_EVALUATED);
        const latestItem = checkItems[0] || null;
        const latestResult = (latestEvaluated?.result || latestItem?.result || null) as AuditCheckResult | null;

        let effectivenessStatus: ControlEffectivenessStatus = 'NOT_TESTED';
        if (latestResult === AuditCheckResult.COMPLIANT) {
          effectivenessStatus = 'EFFECTIVE';
        } else if (latestResult === AuditCheckResult.PARTIALLY_COMPLIANT) {
          effectivenessStatus = 'PARTIALLY_EFFECTIVE';
        } else if (latestResult === AuditCheckResult.NON_COMPLIANT) {
          effectivenessStatus = 'INEFFECTIVE';
        } else if (latestResult === AuditCheckResult.NOT_APPLICABLE) {
          effectivenessStatus = 'NOT_APPLICABLE';
        }

        const unresolvedFindings = checkItems
          .flatMap((i) => i.findings || [])
          .filter((f) => f.status !== FindingStatus.CLOSED && f.status !== FindingStatus.VERIFIED);

        const isFailed = latestEvaluated?.result === AuditCheckResult.NON_COMPLIANT;
        const isPartial = latestEvaluated?.result === AuditCheckResult.PARTIALLY_COMPLIANT;
        const hasUnresolvedFindings = unresolvedFindings.length > 0;

        controlTestingState = {
          isAvailable: true,
          totalTests: checkItems.length,
          latestResult,
          effectivenessStatus,
          unresolvedFindingsCount: unresolvedFindings.length,
          isFailed,
          isPartial,
          hasUnresolvedFindings,
        };
      }
    }

    // 7. Compute Lifecycle Stages & Blocker Status
    let isBlocked = false;
    let blockedReason: string | null = null;

    const hasQuarantinedEvidence = evidences.some((e) => e.scanStatus === EvidenceScanStatus.QUARANTINED);
    const hasRejectedApproval = approvals.some((a) => a.status === ApprovalInstanceStatus.REJECTED);
    const hasPendingApproval = approvals.some((a) => a.status === ApprovalInstanceStatus.PENDING || a.status === ApprovalInstanceStatus.IN_REVIEW);
    const hasOverdueRemediation = remediations.some((r) => r.isOverdue);

    if (hasQuarantinedEvidence) {
      isBlocked = true;
      blockedReason = 'Quarantined or unverified evidence attached to resource.';
    } else if (hasRejectedApproval) {
      isBlocked = true;
      blockedReason = 'Approval request rejected by authority.';
    } else if (hasOverdueRemediation) {
      isBlocked = true;
      blockedReason = 'Overdue remediation action pending completion.';
    } else if (controlTestingState?.isFailed) {
      isBlocked = true;
      blockedReason = 'Control failed latest operational audit test (NON_COMPLIANT).';
    }

    const stages: GrcLifecycleStageDto[] = [
      {
        stage: 'REQUIREMENT',
        status: frameworkReference ? 'COMPLETED' : 'NOT_APPLICABLE',
        label: frameworkReference ? `Mapped to ${frameworkReference.frameworkCode} (${frameworkReference.identifier})` : 'General Obligation',
        details: frameworkReference ? frameworkReference.title : 'No specific framework reference linked',
      },
      {
        stage: 'CONTROL_RISK_POLICY',
        status: 'COMPLETED',
        label: `${normalizedType}: ${resourceTitle}`,
        details: `Authoritative Status: ${authoritativeStatus}`,
      },
      {
        stage: 'EVIDENCE',
        status: !evidenceCap.isAvailable ? 'NOT_APPLICABLE' : evidences.length === 0 ? 'PENDING' : hasQuarantinedEvidence ? 'WARNING' : 'COMPLETED',
        label: !evidenceCap.isAvailable ? 'Evidence Vault Disabled' : `${evidences.length} Evidence Vault Items Attached`,
        details: !evidenceCap.isAvailable ? 'Evidence Vault capability is disabled' : hasQuarantinedEvidence ? 'Contains quarantined evidence!' : evidences.length > 0 ? 'All evidence verified CLEAN' : 'No proof attached',
      },
      {
        stage: 'AI_ANALYSIS',
        status: !aiCap.isAvailable || aiAnalyses.length === 0 ? 'NOT_APPLICABLE' : aiAnalyses.some((a) => a.status === 'COMPLETED') ? 'COMPLETED' : 'IN_PROGRESS',
        label: !aiCap.isAvailable ? 'AI Analysis Disabled' : aiAnalyses.length > 0 ? `${aiAnalyses.length} AI Analyses Completed` : 'No AI Analysis Triggered',
        details: !aiCap.isAvailable ? 'AI Document Intelligence capability is disabled' : aiAnalyses.length > 0 ? `${aiAnalyses.reduce((acc, curr) => acc + curr.findingsCount, 0)} findings extracted` : null,
      },
      {
        stage: 'APPROVAL',
        status: !approvalCap.isAvailable || approvals.length === 0 ? 'NOT_APPLICABLE' : hasRejectedApproval ? 'BLOCKED' : hasPendingApproval ? 'IN_PROGRESS' : 'COMPLETED',
        label: !approvalCap.isAvailable ? 'Approval Engine Disabled' : approvals.length > 0 ? `Approval: ${approvals[0].status}` : 'No Approval Workflow Required',
        details: !approvalCap.isAvailable ? 'Approval Engine capability is disabled' : approvals.length > 0 ? `Purpose: ${approvals[0].purpose || 'General'}` : null,
      },
    ];

    if (normalizedType === 'CONTROL') {
      let testStageStatus: GrcLifecycleStageDto['status'] = 'NOT_APPLICABLE';
      let testStageLabel = 'Control Testing Disabled';
      let testStageDetails: string | null = 'Business Audits capability is disabled or unentitled';
      let testBlockerReason: string | null = null;

      if (controlTestingState?.isAvailable) {
        if (controlTestingState.totalTests === 0) {
          testStageStatus = 'PENDING';
          testStageLabel = 'Untested Control';
          testStageDetails = 'No audit check items registered for this control';
        } else if (controlTestingState.isFailed) {
          testStageStatus = 'BLOCKED';
          testStageLabel = 'Control Test Failed (NON_COMPLIANT)';
          testStageDetails = 'Latest operational test evaluated as NON_COMPLIANT';
          testBlockerReason = 'Latest audit evaluation determined control is non-compliant.';
        } else if (controlTestingState.hasUnresolvedFindings) {
          testStageStatus = 'WARNING';
          testStageLabel = `Deficiencies Found (${controlTestingState.unresolvedFindingsCount} Open Findings)`;
          testStageDetails = 'Control test has linked audit findings pending remediation';
          testBlockerReason = 'Audit findings remain open or in remediation.';
        } else if (controlTestingState.isPartial) {
          testStageStatus = 'WARNING';
          testStageLabel = 'Partially Compliant (PARTIALLY_COMPLIANT)';
          testStageDetails = 'Latest evaluation showed partial operational compliance';
        } else if (controlTestingState.latestResult === AuditCheckResult.COMPLIANT) {
          testStageStatus = 'COMPLETED';
          testStageLabel = 'Control Test Effective (COMPLIANT)';
          testStageDetails = 'Latest audit evaluation confirmed operational effectiveness';
        } else if (controlTestingState.latestResult === AuditCheckResult.NOT_APPLICABLE) {
          testStageStatus = 'NOT_APPLICABLE';
          testStageLabel = 'Control Test Not Applicable (NOT_APPLICABLE)';
          testStageDetails = 'Audit assessment marked this control check item as not applicable';
        } else {
          testStageStatus = 'IN_PROGRESS';
          testStageLabel = 'Control Testing In Progress (NOT_EVALUATED)';
          testStageDetails = 'Check item registered in assessment, awaiting evaluation';
        }
      }

      stages.push({
        stage: 'CONTROL_TESTING',
        status: testStageStatus,
        label: testStageLabel,
        details: testStageDetails,
        blockerReason: testBlockerReason,
      });
    }

    stages.push(
      {
        stage: 'REMEDIATION',
        status: !tasksCap.isAvailable || remediations.length === 0 ? 'NOT_APPLICABLE' : hasOverdueRemediation ? 'WARNING' : remediations.every((r) => r.status === 'COMPLETED' || r.status === 'CLOSED') ? 'COMPLETED' : 'IN_PROGRESS',
        label: !tasksCap.isAvailable ? 'Remediation/Tasks Disabled' : remediations.length > 0 ? `${remediations.length} Action Items` : 'No Remediation Pending',
        details: !tasksCap.isAvailable ? 'Compliance Tasks capability is disabled' : hasOverdueRemediation ? 'Contains overdue remediation action!' : null,
      },
      {
        stage: 'AUTHORITATIVE_STATE',
        status: isBlocked ? 'BLOCKED' : 'COMPLETED',
        label: `Authoritative State: ${authoritativeStatus}`,
        details: isBlocked ? blockedReason : 'Lifecycle fully synchronized and authoritative',
      },
    );

    // 8. Compute Authoritative Next Action & Prerequisites Checklist
    let nextAction: WorkflowNextActionDto | null = null;
    let prerequisites: WorkflowPrerequisitesDto | null = null;

    if (normalizedType === 'CONTROL') {
      const approvedMapping = controlMappings.find(
        (m: any) => m.status === 'APPROVED' || m.status === 'OVERRIDDEN',
      );
      const isMapped = Boolean(
        approvedMapping &&
        frameworkReference &&
        approvedMapping.frameworkReferenceId === frameworkReference.id,
      );
      const hasCleanEvidence = evidences.length > 0 && !hasQuarantinedEvidence;
      const isTestingEffective =
        controlTestingState?.isAvailable &&
        controlTestingState.latestResult === AuditCheckResult.COMPLIANT &&
        !controlTestingState.isFailed &&
        !controlTestingState.hasUnresolvedFindings;
      const isApprovalComplete = approvals.length === 0 || approvals.every((a) => a.status === 'APPROVED');
      const isRemediationClean = !hasOverdueRemediation;

      const prereqItems = [
        {
          id: 'prereq-framework-mapping',
          title: 'Framework Mapping',
          isSatisfied: isMapped,
          reason: isMapped
            ? `Mapped to ${frameworkReference?.frameworkCode} (${frameworkReference?.identifier})`
            : controlMappings.some((m: any) => m.status === 'SUGGESTED')
            ? 'Framework mapping is suggested and requires governance approval.'
            : controlMappings.some((m: any) => m.status === 'REJECTED')
            ? 'Framework mapping was rejected by governance reviewer.'
            : 'Control is unmapped to any compliance framework standard.',
          responsibleParty: 'Governance Analyst',
        },
        {
          id: 'prereq-evidence-proof',
          title: 'Implementation Proof & Clean Evidence',
          isSatisfied: hasCleanEvidence,
          reason: hasQuarantinedEvidence
            ? 'Contains quarantined evidence with malware risk.'
            : evidences.length === 0
            ? 'No implementation proof attached to this control.'
            : `${evidences.length} clean proof artifacts attached.`,
          responsibleParty: 'Control Owner',
        },
        {
          id: 'prereq-operational-testing',
          title: 'Operational Control Testing',
          isSatisfied: Boolean(isTestingEffective),
          reason: !controlTestingState?.isAvailable
            ? 'Business Audits module is unentitled or disabled.'
            : controlTestingState.isFailed
            ? 'Failed latest operational test (NON_COMPLIANT).'
            : controlTestingState.hasUnresolvedFindings
            ? `${controlTestingState.unresolvedFindingsCount} open audit findings require remediation.`
            : controlTestingState.totalTests === 0
            ? 'Zero operational audit tests registered.'
            : controlTestingState.latestResult === AuditCheckResult.NOT_EVALUATED || controlTestingState.latestResult === null
            ? 'Audit check items registered but unevaluated.'
            : controlTestingState.isPartial
            ? 'Partially compliant test outcome.'
            : 'Operational effectiveness confirmed (COMPLIANT).',
          responsibleParty: 'Lead Auditor',
        },
        {
          id: 'prereq-approvals',
          title: 'Governance Sign-Off',
          isSatisfied: isApprovalComplete,
          reason: hasRejectedApproval
            ? 'Approval request was rejected.'
            : hasPendingApproval
            ? 'Governance approval is pending review.'
            : 'Sign-off requirement satisfied.',
          responsibleParty: 'Designated Approvers',
        },
        {
          id: 'prereq-remediation',
          title: 'Action Plans & Remediation',
          isSatisfied: isRemediationClean,
          reason: hasOverdueRemediation
            ? 'Overdue corrective remediation action plan.'
            : 'Zero overdue corrective tasks.',
          responsibleParty: 'Remediation Assignee',
        },
      ];

      prerequisites = {
        totalCount: prereqItems.length,
        satisfiedCount: prereqItems.filter((p) => p.isSatisfied).length,
        items: prereqItems,
      };

      if (hasQuarantinedEvidence) {
        nextAction = {
          title: 'Replace Quarantined Proof Artifact',
          description: 'A linked file was quarantined due to malware or signature failure. Remove or replace it to restore verified proof.',
          actionType: 'RESOLVE_BLOCKER',
          targetView: 'evidence',
          buttonLabel: 'Go to Evidence Vault',
          isBlocked: true,
          responsibleParty: 'Control Owner / SecOps',
          priority: 'CRITICAL',
        };
      } else if (hasRejectedApproval) {
        nextAction = {
          title: 'Address Approval Rejection',
          description: 'Governance approval for this control was rejected. Review decision comments and resubmit for evaluation.',
          actionType: 'RESOLVE_BLOCKER',
          targetView: 'approvals',
          buttonLabel: 'Open Approval Center',
          isBlocked: true,
          responsibleParty: 'Control Owner',
          priority: 'CRITICAL',
        };
      } else if (hasOverdueRemediation) {
        nextAction = {
          title: 'Resolve Overdue Action Plan',
          description: 'An active corrective remediation plan for this control is overdue. Complete task to lift workflow blocker.',
          actionType: 'COMPLETE_REMEDIATION',
          targetView: 'remediation',
          buttonLabel: 'Open Action Plans',
          isBlocked: true,
          responsibleParty: 'Remediation Assignee',
          priority: 'CRITICAL',
        };
      } else if (controlTestingState?.isFailed) {
        nextAction = {
          title: 'Remediate Operational Testing Failure',
          description: 'Latest operational test evaluated as NON_COMPLIANT. Remediate control deficiency and re-execute test.',
          actionType: 'RESOLVE_BLOCKER',
          targetView: 'audits',
          buttonLabel: 'View Audit Records',
          isBlocked: true,
          responsibleParty: 'Control Owner / Auditor',
          priority: 'HIGH',
        };
      } else if (hasPendingApproval) {
        nextAction = {
          title: 'Await Governance Approval Decision',
          description: 'Approval instance is currently pending review by designated authorities in the Approval Center.',
          actionType: 'AWAIT_APPROVAL',
          targetView: 'approvals',
          buttonLabel: 'Open Approval Center',
          isBlocked: false,
          responsibleParty: 'Designated Approvers',
          priority: 'HIGH',
        };
      } else if (controlTestingState?.hasUnresolvedFindings) {
        nextAction = {
          title: 'Remediate Open Audit Deficiencies',
          description: `${controlTestingState.unresolvedFindingsCount} audit findings remain open. Track corrective action plan to closure.`,
          actionType: 'COMPLETE_REMEDIATION',
          targetView: 'remediation',
          buttonLabel: 'View Deficiencies',
          isBlocked: false,
          responsibleParty: 'Remediation Owner',
          priority: 'MEDIUM',
        };
      } else if (!isMapped && frameworkCap.isAvailable) {
        const hasSuggested = controlMappings.some((m: any) => m.status === 'SUGGESTED');
        nextAction = {
          title: hasSuggested
            ? 'Review and Approve Suggested Framework Mapping'
            : 'Map Control to Compliance Framework Clause',
          description: hasSuggested
            ? 'A compliance mapping has been suggested. Review and approve the mapping to satisfy governance requirements.'
            : 'Associate this control with relevant clauses in your entitled framework library.',
          actionType: 'MAP_FRAMEWORK',
          targetView: 'controls',
          buttonLabel: hasSuggested ? 'Review Mapping' : 'Map Framework Clause',
          isBlocked: false,
          responsibleParty: 'Governance Analyst',
          priority: 'MEDIUM',
        };
      } else if (evidences.length === 0 && evidenceCap.isAvailable) {
        nextAction = {
          title: 'Attach Compliance Proof from Vault',
          description: 'Demonstrate operational design by linking verified clean evidence artifacts to this control.',
          actionType: 'ATTACH_EVIDENCE',
          targetView: 'evidence',
          buttonLabel: 'Attach Proof Artifact',
          isBlocked: false,
          responsibleParty: 'Control Owner',
          priority: 'MEDIUM',
        };
      } else if (!controlTestingState?.isAvailable) {
        nextAction = {
          title: 'Operational Testing Unavailable',
          description: 'Operational control testing cannot be performed because the Business Audits module is unentitled or disabled. Effectiveness remains unverified.',
          actionType: 'TESTING_UNAVAILABLE',
          buttonLabel: 'Testing Unavailable',
          isBlocked: false,
          responsibleParty: 'Commercial Administrator',
          priority: 'LOW',
        };
      } else if (controlTestingState.totalTests === 0) {
        nextAction = {
          title: 'Register Control for Operational Audit Testing',
          description: 'Zero test executions recorded. Add control check item to an active audit assessment to test effectiveness.',
          actionType: 'EXECUTE_TEST',
          targetView: 'audits',
          buttonLabel: 'Schedule in Audits',
          isBlocked: false,
          responsibleParty: 'Lead Auditor',
          priority: 'MEDIUM',
        };
      } else if (controlTestingState.latestResult === AuditCheckResult.NOT_EVALUATED || controlTestingState.latestResult === null) {
        nextAction = {
          title: 'Evaluate Operational Control Testing',
          description: 'Operational audit check items are registered but unevaluated. Complete audit evaluation to determine effectiveness.',
          actionType: 'EXECUTE_TEST',
          targetView: 'audits',
          buttonLabel: 'Evaluate in Audits',
          isBlocked: false,
          responsibleParty: 'Lead Auditor',
          priority: 'MEDIUM',
        };
      } else if (controlTestingState.isPartial) {
        nextAction = {
          title: 'Remediate Partial Compliance Testing Outcome',
          description: 'Latest operational test evaluated as PARTIALLY_COMPLIANT. Remediate partial deficiencies and re-test to establish full compliance.',
          actionType: 'EXECUTE_TEST',
          targetView: 'audits',
          buttonLabel: 'Review in Audits',
          isBlocked: false,
          responsibleParty: 'Control Owner / Auditor',
          priority: 'HIGH',
        };
      } else {
        nextAction = {
          title: 'Control Operating Effectively',
          description: 'All workflow prerequisites are satisfied. Mapped, clean proof verified, and operational testing confirmed compliant.',
          actionType: 'LIFECYCLE_COMPLETE',
          buttonLabel: 'Authoritative',
          isBlocked: false,
          responsibleParty: 'Governance Team',
          priority: 'LOW',
        };
      }
    } else if (normalizedType === 'RISK') {
      const isApprovalComplete = approvals.length === 0 || approvals.every((a) => a.status === 'APPROVED');
      const isRemediationClean = !hasOverdueRemediation;

      const prereqItems = [
        {
          id: 'prereq-risk-assessment',
          title: 'Risk Scoring & Assessment',
          isSatisfied: authoritativeStatus !== 'OPEN',
          reason: authoritativeStatus === 'OPEN' ? 'Risk is currently in OPEN unassessed state.' : `Authoritative status: ${authoritativeStatus}`,
          responsibleParty: 'Risk Owner',
        },
        {
          id: 'prereq-risk-approval',
          title: 'Treatment Plan Approval',
          isSatisfied: isApprovalComplete,
          reason: hasRejectedApproval ? 'Treatment plan rejected.' : hasPendingApproval ? 'Treatment pending approval.' : 'Approved.',
          responsibleParty: 'Risk Committee',
        },
        {
          id: 'prereq-risk-remediation',
          title: 'Action Plans & Remediation',
          isSatisfied: isRemediationClean,
          reason: hasOverdueRemediation ? 'Overdue remediation task.' : 'Tasks on schedule.',
          responsibleParty: 'Action Assignee',
        },
      ];

      prerequisites = {
        totalCount: prereqItems.length,
        satisfiedCount: prereqItems.filter((p) => p.isSatisfied).length,
        items: prereqItems,
      };

      if (hasOverdueRemediation) {
        nextAction = {
          title: 'Complete Overdue Risk Treatment Task',
          description: 'A corrective action item for this risk has breached its SLA due date.',
          actionType: 'COMPLETE_REMEDIATION',
          targetView: 'remediation',
          buttonLabel: 'Open Action Plans',
          isBlocked: true,
          responsibleParty: 'Action Assignee',
          priority: 'CRITICAL',
        };
      } else if (hasRejectedApproval) {
        nextAction = {
          title: 'Address Treatment Rejection',
          description: 'Risk treatment acceptance or exception request was rejected.',
          actionType: 'RESOLVE_BLOCKER',
          targetView: 'approvals',
          buttonLabel: 'Open Approval Center',
          isBlocked: true,
          responsibleParty: 'Risk Owner',
          priority: 'CRITICAL',
        };
      } else if (hasPendingApproval) {
        nextAction = {
          title: 'Await Risk Sign-off',
          description: 'Treatment plan or risk exception is pending review.',
          actionType: 'AWAIT_APPROVAL',
          targetView: 'approvals',
          buttonLabel: 'Open Approval Center',
          isBlocked: false,
          responsibleParty: 'Risk Committee',
          priority: 'HIGH',
        };
      } else {
        nextAction = {
          title: 'Risk Posture Monitored',
          description: 'Risk assessment complete, mitigating controls operating, and treatment plan monitored.',
          actionType: 'LIFECYCLE_COMPLETE',
          buttonLabel: 'Monitored',
          isBlocked: false,
          responsibleParty: 'Risk Manager',
          priority: 'LOW',
        };
      }
    }

    return {
      resourceType: normalizedType,
      resourceId,
      resourceTitle,
      organizationId,
      authoritativeStatus,
      isBlocked,
      blockedReason,
      frameworkReference,
      stages,
      evidences,
      aiAnalyses,
      approvals,
      remediations,
      testing: controlTestingState
        ? {
            isAvailable: controlTestingState.isAvailable,
            totalTests: controlTestingState.totalTests,
            latestResult: controlTestingState.latestResult,
            effectivenessStatus: controlTestingState.effectivenessStatus,
            unresolvedFindingsCount: controlTestingState.unresolvedFindingsCount,
          }
        : null,
      nextAction,
      prerequisites,
    };
  }

  /**
   * Get Unified End-to-End Control Lifecycle Graph directly
   */
  async getControlLifecycle(organizationId: string, controlId: string): Promise<GrcLifecycleDto> {
    return this.getLifecycle(organizationId, 'CONTROL', controlId);
  }

  /**
   * Get Bounded Actionable Attention Items for User & Tenant
   */
  async getAttentionSummary(
    organizationId: string,
    userId: string,
    role: Role,
  ): Promise<WorkflowAttentionSummaryDto> {
    const items: WorkflowAttentionItemDto[] = [];

    // Evaluate sub-domain capability states in parallel
    const [
      approvalCap,
      tasksCap,
      aiCap,
      evidenceCap,
    ] = await Promise.all([
      this.effectiveResolver.resolveEffectiveState(organizationId, 'APPROVAL_ENGINE'),
      this.effectiveResolver.resolveEffectiveState(organizationId, 'GRC_CORE_TASKS'),
      this.effectiveResolver.resolveEffectiveState(organizationId, 'AI_DOC_INTELLIGENCE'),
      this.effectiveResolver.resolveEffectiveState(organizationId, 'EVIDENCE_VAULT'),
    ]);

    let pendingApprovalsCount = 0;
    let overdueRemediationsCount = 0;
    let unreviewedAiFindingsCount = 0;

    // 1. Pending Approvals Assigned to User/Role (Respects APPROVAL_ENGINE Capability)
    if (approvalCap.isAvailable) {
      const pendingApprovals = await this.prisma.approvalInstance.findMany({
        where: {
          organizationId,
          status: { in: ['PENDING', 'IN_REVIEW'] },
        },
        orderBy: { createdAt: 'desc' },
        take: 20,
      });

      pendingApprovalsCount = pendingApprovals.length;
      for (const pa of pendingApprovals) {
        items.push({
          id: `app-${pa.id}`,
          category: 'PENDING_APPROVAL',
          title: pa.title,
          description: `Approval required for ${pa.resourceType} #${pa.resourceId}`,
          resourceType: pa.resourceType,
          resourceId: pa.resourceId,
          priority: 'HIGH',
          createdAt: pa.createdAt.toISOString(),
          dueDate: pa.dueAt ? pa.dueAt.toISOString() : null,
        });
      }
    }

    // 2. Overdue Remediations (Respects GRC_CORE_TASKS Capability)
    if (tasksCap.isAvailable) {
      const remediationsData = await this.remediationService.findAll(organizationId, {
        overdueOnly: true,
        limit: 20,
      });

      overdueRemediationsCount = remediationsData.total;
      for (const r of remediationsData.items) {
        items.push({
          id: `rem-${r.id}`,
          category: 'OVERDUE_REMEDIATION',
          title: r.title,
          description: r.description || `Overdue ${r.originatingDomain} action item`,
          resourceType: r.sourceType,
          resourceId: r.sourceId,
          priority: r.priorityOrSeverity === 'HIGH' || r.priorityOrSeverity === 'CRITICAL' ? 'CRITICAL' : 'HIGH',
          createdAt: new Date().toISOString(),
          dueDate: r.dueDate ? (typeof r.dueDate === 'string' ? r.dueDate : (r.dueDate as any).toISOString()) : null,
        });
      }
    }

    // 3. Unreviewed AI Findings (Respects AI_DOC_INTELLIGENCE Capability)
    if (aiCap.isAvailable) {
      const unreviewedFindings = await this.prisma.extractedFinding.findMany({
        where: {
          organizationId,
          reviewStatus: 'UNREVIEWED',
        },
        orderBy: { createdAt: 'desc' },
        take: 15,
      });

      unreviewedAiFindingsCount = unreviewedFindings.length;
      for (const uf of unreviewedFindings) {
        items.push({
          id: `ai-${uf.id}`,
          category: 'UNREVIEWED_AI_FINDING',
          title: uf.aiTitle,
          description: uf.aiDescription,
          resourceType: 'EVIDENCE',
          resourceId: uf.documentAnalysisId,
          priority: 'MEDIUM',
          createdAt: uf.createdAt.toISOString(),
        });
      }
    }

    // 4. Pending Scan or Quarantined Evidence (Respects EVIDENCE_VAULT Capability)
    if (evidenceCap.isAvailable) {
      const unverifiedEvidences = await this.prisma.evidence.findMany({
        where: {
          organizationId,
          scanStatus: { in: ['PENDING_SCAN', 'QUARANTINED'] },
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
      });

      for (const ev of unverifiedEvidences) {
        items.push({
          id: `ev-${ev.id}`,
          category: 'UNSCANNED_EVIDENCE',
          title: `Evidence ${ev.scanStatus}: ${ev.title}`,
          description: `File "${ev.fileName}" is currently in ${ev.scanStatus} posture.`,
          resourceType: 'EVIDENCE',
          resourceId: ev.id,
          priority: ev.scanStatus === 'QUARANTINED' ? 'CRITICAL' : 'MEDIUM',
          createdAt: ev.createdAt.toISOString(),
        });
      }
    }

    return {
      items: items.slice(0, 50),
      total: items.length,
      pendingApprovalsCount,
      overdueRemediationsCount,
      unreviewedAiFindingsCount,
    };
  }

  private async fetchEvidenceForResource(organizationId: string, resourceType: string, resourceId: string) {
    switch (resourceType) {
      case 'CONTROL': {
        const joins = await this.prisma.controlEvidence.findMany({
          where: { controlId: resourceId, organizationId },
          include: { evidence: true },
        });
        return joins.map((j) => j.evidence);
      }
      case 'RISK': {
        const joins = await this.prisma.riskEvidence.findMany({
          where: { riskId: resourceId, organizationId },
          include: { evidence: true },
        });
        return joins.map((j) => j.evidence);
      }
      case 'POLICY': {
        const joins = await this.prisma.policyEvidence.findMany({
          where: { policyId: resourceId, organizationId },
          include: { evidence: true },
        });
        return joins.map((j) => j.evidence);
      }
      case 'AUDIT_FINDING': {
        const joins = await this.prisma.auditFindingEvidence.findMany({
          where: { findingId: resourceId, organizationId },
          include: { evidence: true },
        });
        return joins.map((j) => j.evidence);
      }
      case 'VENDOR': {
        const joins = await this.prisma.vendorEvidence.findMany({
          where: { vendorId: resourceId, organizationId },
          include: { evidence: true },
        });
        return joins.map((j) => j.evidence);
      }
      case 'VULNERABILITY': {
        const joins = await this.prisma.vulnerabilityEvidence.findMany({
          where: { vulnerabilityId: resourceId, organizationId },
          include: { evidence: true },
        });
        return joins.map((j) => j.evidence);
      }
      case 'INCIDENT': {
        const joins = await this.prisma.incidentEvidence.findMany({
          where: { incidentId: resourceId, organizationId },
          include: { evidence: true },
        });
        return joins.map((j) => j.evidence);
      }
      default:
        return [];
    }
  }
}
