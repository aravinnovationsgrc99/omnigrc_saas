import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FrameworkEntitlementsService } from '../frameworks/framework-entitlements.service';
import { RemediationService } from '../remediation/remediation.service';
import {
  GrcLifecycleDto,
  GrcLifecycleStageDto,
  WorkflowAttentionSummaryDto,
  WorkflowAttentionItemDto,
  Role,
  EvidenceScanStatus,
  EvidenceStatus,
  ApprovalInstanceStatus,
} from '@omnigrc/shared';

@Injectable()
export class WorkflowService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly frameworkEntitlementsService: FrameworkEntitlementsService,
    private readonly remediationService: RemediationService,
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
    let resourceTitle = `${normalizedType} #${resourceId}`;
    let authoritativeStatus = 'OPEN';
    let frameworkRefId: string | null = null;

    // 1. Fetch Primary Resource Details & Ownership Verification
    switch (normalizedType) {
      case 'CONTROL': {
        const c = await this.prisma.control.findFirst({
          where: { id: resourceId, organizationId, deletedAt: null },
          include: { mappings: { include: { frameworkReference: true } } },
        });
        if (!c) throw new NotFoundException(`Control "${resourceId}" not found.`);
        resourceTitle = c.name;
        authoritativeStatus = c.mappings[0]?.status || 'UNMAPPED';
        frameworkRefId = c.mappings[0]?.frameworkReferenceId || null;
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

    // 2. Fetch Linked Framework Reference Context
    let frameworkReference: GrcLifecycleDto['frameworkReference'] = null;
    if (frameworkRefId) {
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

    // 3. Fetch Linked Evidence Vault Items
    const evidenceAssociations = await this.fetchEvidenceForResource(organizationId, normalizedType, resourceId);
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

    // 4. Fetch AI Analyses & Extracted Findings for Attached Evidence
    const evidenceIds = evidences.map((e) => e.id);
    const aiAnalysesRecords = await this.prisma.documentAnalysis.findMany({
      where: {
        organizationId,
        ...(evidenceIds.length > 0 ? { evidenceId: { in: evidenceIds } } : { id: 'none' }),
      },
      include: { findings: true },
    });

    const aiAnalyses = aiAnalysesRecords.map((a) => {
      const unreviewedCount = a.findings.filter((f) => f.reviewStatus === 'UNREVIEWED').length;
      return {
        id: a.id,
        status: a.status,
        findingsCount: a.findings.length,
        unreviewedCount,
      };
    });

    // 5. Fetch Approvals & Decisions
    const approvalInstances = await this.prisma.approvalInstance.findMany({
      where: {
        organizationId,
        resourceType: normalizedType,
        resourceId,
      },
      include: { decisions: true },
      orderBy: { createdAt: 'desc' },
    });

    const approvals = approvalInstances.map((ai) => ({
      id: ai.id,
      title: ai.title,
      status: ai.status,
      purpose: ai.purpose || null,
    }));

    // 6. Fetch Remediation Actions
    const remediationsData = await this.remediationService.findAll(organizationId, {
      limit: 100,
    });
    const resourceRemediations = remediationsData.items.filter(
      (r) => r.sourceId === resourceId || (normalizedType === 'AUDIT_FINDING' && r.sourceType === 'AUDIT_CAPA'),
    );

    const remediations = resourceRemediations.map((r) => ({
      id: r.id,
      title: r.title,
      status: r.status,
      owner: r.owner,
      dueDate: r.dueDate ? (typeof r.dueDate === 'string' ? r.dueDate : (r.dueDate as any).toISOString()) : null,
      isOverdue: r.isOverdue,
    }));

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
        status: evidences.length === 0 ? 'PENDING' : hasQuarantinedEvidence ? 'WARNING' : 'COMPLETED',
        label: `${evidences.length} Evidence Vault Items Attached`,
        details: hasQuarantinedEvidence ? 'Contains quarantined evidence!' : evidences.length > 0 ? 'All evidence verified CLEAN' : 'No proof attached',
      },
      {
        stage: 'AI_ANALYSIS',
        status: aiAnalyses.length === 0 ? 'NOT_APPLICABLE' : aiAnalyses.some((a) => a.status === 'COMPLETED') ? 'COMPLETED' : 'IN_PROGRESS',
        label: aiAnalyses.length > 0 ? `${aiAnalyses.length} AI Analyses Completed` : 'No AI Analysis Triggered',
        details: aiAnalyses.length > 0 ? `${aiAnalyses.reduce((acc, curr) => acc + curr.findingsCount, 0)} findings extracted` : null,
      },
      {
        stage: 'APPROVAL',
        status: approvals.length === 0 ? 'NOT_APPLICABLE' : hasRejectedApproval ? 'BLOCKED' : hasPendingApproval ? 'IN_PROGRESS' : 'COMPLETED',
        label: approvals.length > 0 ? `Approval: ${approvals[0].status}` : 'No Approval Workflow Required',
        details: approvals.length > 0 ? `Purpose: ${approvals[0].purpose || 'General'}` : null,
      },
      {
        stage: 'REMEDIATION',
        status: remediations.length === 0 ? 'NOT_APPLICABLE' : hasOverdueRemediation ? 'WARNING' : remediations.every((r) => r.status === 'COMPLETED' || r.status === 'CLOSED') ? 'COMPLETED' : 'IN_PROGRESS',
        label: remediations.length > 0 ? `${remediations.length} Action Items` : 'No Remediation Pending',
        details: hasOverdueRemediation ? 'Contains overdue remediation action!' : null,
      },
      {
        stage: 'AUTHORITATIVE_STATE',
        status: isBlocked ? 'BLOCKED' : 'COMPLETED',
        label: `Authoritative State: ${authoritativeStatus}`,
        details: isBlocked ? blockedReason : 'Lifecycle fully synchronized and authoritative',
      },
    ];

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
    };
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

    // 1. Pending Approvals Assigned to User/Role
    const pendingApprovals = await this.prisma.approvalInstance.findMany({
      where: {
        organizationId,
        status: { in: ['PENDING', 'IN_REVIEW'] },
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

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

    // 2. Overdue Remediations
    const remediationsData = await this.remediationService.findAll(organizationId, {
      overdueOnly: true,
      limit: 20,
    });

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

    // 3. Unreviewed AI Findings
    const unreviewedFindings = await this.prisma.extractedFinding.findMany({
      where: {
        organizationId,
        reviewStatus: 'UNREVIEWED',
      },
      orderBy: { createdAt: 'desc' },
      take: 15,
    });

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

    // 4. Pending Scan or Quarantined Evidence
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

    const pendingApprovalsCount = pendingApprovals.length;
    const overdueRemediationsCount = remediationsData.total;
    const unreviewedAiFindingsCount = unreviewedFindings.length;

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
