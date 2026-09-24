import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ResourceAuthorizationService, ResourceAuthContext } from '../auth/resource-authorization.service';
import {
  OverviewMetricsDto,
  AssetMetricsDto,
  VulnerabilityMetricsDto,
  PolicyMetricsDto,
  VendorMetricsDto,
  ObligationMetricsDto,
  AuditMetricsDto,
  RiskMetricsDto,
  ObligationCadence,
  TaskStatus,
  VulnerabilityStatus,
  PolicyStatus,
  VendorStatus,
  VendorAssessmentStatus,
  AuditPlanStatus,
  FindingStatus,
  CapaStatus,
} from '@omnigrc/shared';

@Injectable()
export class MetricsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly resourceAuthService: ResourceAuthorizationService,
  ) {}

  /**
   * Authoritative Single Source of Truth for Overview Metrics across all 7 GRC Domains.
   * All database calls are aggregated database-side and scoped by department/project context.
   */
  async getOverviewMetrics(authCtx: ResourceAuthContext): Promise<OverviewMetricsDto> {
    const scopeWhere = await this.resourceAuthService.getScopeWhereClause(authCtx);
    const now = new Date();
    const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    // Obligation Predicate: cadence != 'ONE_OFF' OR obligationReference IS NOT NULL
    const obligationWhere: any = {
      ...scopeWhere,
      deletedAt: null,
      OR: [
        { cadence: { not: ObligationCadence.ONE_OFF } },
        { obligationReference: { not: null } },
      ],
    };

    // Parallel database query execution batch
    const [
      // Assets
      assetTotal,
      assetHigh,
      assetManaged,
      assetUnmanaged,
      assetByEnv,
      assetByType,
      // Vulnerabilities
      vulnTotal,
      vulnOpen,
      vulnOverdue,
      vulnResolved,
      vulnRiskAccepted,
      vulnBySeverity,
      // Policies
      policyTotal,
      policyByStatus,
      policyPublished,
      policyOverdueReview,
      // Vendors
      vendorTotal,
      vendorByCriticality,
      vendorByStatus,
      vendorRequiringReview,
      vendorAssessmentsOverdue,
      // Obligations
      obTotal,
      obUpcoming,
      obOverdue,
      obCompleted,
      // Audits
      auditPlansTotal,
      auditPlansByStatus,
      auditAssessmentCount,
      auditAvgScore,
      auditFindingsTotal,
      auditFindingsOpen,
      auditFindingsOverdue,
      auditFindingsBySeverity,
      auditCapaOpen,
      // Risks
      riskTotalOpen,
      riskHighBand,
      riskMediumBand,
      riskLowBand,
      riskByStatus,

      // Attention Bounded Queries
      overdueVulnList,
      overdueTaskList,
      overdueFindingList,
      overdueCapaList,
      overduePolicyList,
      overdueVendorAssessmentList,
    ] = await Promise.all([
      // Assets
      this.prisma.asset.count({ where: { ...scopeWhere, deletedAt: null } }),
      this.prisma.asset.count({ where: { ...scopeWhere, deletedAt: null, criticality: 'HIGH' } }),
      this.prisma.asset.count({ where: { ...scopeWhere, deletedAt: null, isManaged: true } }),
      this.prisma.asset.count({ where: { ...scopeWhere, deletedAt: null, isManaged: false } }),
      this.prisma.asset.groupBy({ by: ['environment'], where: { ...scopeWhere, deletedAt: null }, _count: true }),
      this.prisma.asset.groupBy({ by: ['type'], where: { ...scopeWhere, deletedAt: null }, _count: true }),

      // Vulnerabilities
      this.prisma.vulnerability.count({ where: { ...scopeWhere, deletedAt: null } }),
      this.prisma.vulnerability.count({
        where: { ...scopeWhere, deletedAt: null, status: { in: [VulnerabilityStatus.OPEN, VulnerabilityStatus.IN_REMEDIATION] } },
      }),
      this.prisma.vulnerability.count({
        where: {
          ...scopeWhere,
          deletedAt: null,
          status: { in: [VulnerabilityStatus.OPEN, VulnerabilityStatus.IN_REMEDIATION] },
          dueDate: { lt: now },
        },
      }),
      this.prisma.vulnerability.count({ where: { ...scopeWhere, deletedAt: null, status: VulnerabilityStatus.RESOLVED } }),
      this.prisma.vulnerability.count({ where: { ...scopeWhere, deletedAt: null, status: VulnerabilityStatus.RISK_ACCEPTED } }),
      this.prisma.vulnerability.groupBy({ by: ['severity'], where: { ...scopeWhere, deletedAt: null }, _count: true }),

      // Policies
      this.prisma.policy.count({ where: { ...scopeWhere, deletedAt: null } }),
      this.prisma.policy.groupBy({ by: ['status'], where: { ...scopeWhere, deletedAt: null }, _count: true }),
      this.prisma.policy.count({ where: { ...scopeWhere, deletedAt: null, status: PolicyStatus.PUBLISHED } }),
      this.prisma.policy.count({
        where: {
          ...scopeWhere,
          deletedAt: null,
          status: PolicyStatus.PUBLISHED,
          reviewDate: { lt: now },
        },
      }),

      // Vendors
      this.prisma.vendor.count({ where: { ...scopeWhere, deletedAt: null } }),
      this.prisma.vendor.groupBy({ by: ['criticality'], where: { ...scopeWhere, deletedAt: null }, _count: true }),
      this.prisma.vendor.groupBy({ by: ['status'], where: { ...scopeWhere, deletedAt: null }, _count: true }),
      this.prisma.vendor.count({
        where: {
          ...scopeWhere,
          deletedAt: null,
          status: VendorStatus.ACTIVE,
          nextReviewDate: { lt: now },
        },
      }),
      this.prisma.vendorAssessment.count({
        where: {
          organizationId: authCtx.organizationId,
          status: VendorAssessmentStatus.OVERDUE,
        },
      }),

      // Obligations
      this.prisma.complianceTask.count({ where: obligationWhere }),
      this.prisma.complianceTask.count({
        where: {
          ...obligationWhere,
          status: { not: TaskStatus.COMPLETE },
          dueDate: { gte: now, lte: in30Days },
        },
      }),
      this.prisma.complianceTask.count({
        where: {
          ...obligationWhere,
          status: { not: TaskStatus.COMPLETE },
          dueDate: { lt: now },
        },
      }),
      this.prisma.complianceTask.count({
        where: {
          ...obligationWhere,
          status: TaskStatus.COMPLETE,
        },
      }),

      // Audits
      this.prisma.auditPlan.count({ where: { ...scopeWhere } }),
      this.prisma.auditPlan.groupBy({ by: ['status'], where: { ...scopeWhere }, _count: true }),
      this.prisma.auditAssessment.count({ where: { organizationId: authCtx.organizationId } }),
      this.prisma.auditAssessment.aggregate({ where: { organizationId: authCtx.organizationId }, _avg: { score: true } }),
      this.prisma.auditFinding.count({ where: { organizationId: authCtx.organizationId } }),
      this.prisma.auditFinding.count({
        where: { organizationId: authCtx.organizationId, status: { in: [FindingStatus.OPEN, FindingStatus.IN_REMEDIATION, FindingStatus.READY_FOR_VERIFICATION] } },
      }),
      this.prisma.auditFinding.count({
        where: { organizationId: authCtx.organizationId, status: { in: [FindingStatus.OPEN, FindingStatus.IN_REMEDIATION] }, dueDate: { lt: now } },
      }),
      this.prisma.auditFinding.groupBy({ by: ['severity'], where: { organizationId: authCtx.organizationId }, _count: true }),
      this.prisma.auditCapa.count({ where: { organizationId: authCtx.organizationId, status: { in: [CapaStatus.OPEN, CapaStatus.IN_PROGRESS] } } }),

      // Risks
      this.prisma.risk.count({
        where: { ...scopeWhere, deletedAt: null, status: { in: ['OPEN', 'IN_TREATMENT'] } },
      }),
      this.prisma.risk.count({
        where: { ...scopeWhere, deletedAt: null, status: { in: ['OPEN', 'IN_TREATMENT'] }, score: { gte: 15 } },
      }),
      this.prisma.risk.count({
        where: { ...scopeWhere, deletedAt: null, status: { in: ['OPEN', 'IN_TREATMENT'] }, score: { gte: 8, lt: 15 } },
      }),
      this.prisma.risk.count({
        where: { ...scopeWhere, deletedAt: null, status: { in: ['OPEN', 'IN_TREATMENT'] }, score: { lt: 8 } },
      }),
      this.prisma.risk.groupBy({ by: ['status'], where: { ...scopeWhere, deletedAt: null }, _count: true }),

      // Attention Bounded Queries (2 per domain max)
      this.prisma.vulnerability.findMany({
        where: { ...scopeWhere, deletedAt: null, status: { in: [VulnerabilityStatus.OPEN, VulnerabilityStatus.IN_REMEDIATION] }, dueDate: { lt: now } },
        select: { id: true, title: true, severity: true, dueDate: true },
        take: 2,
        orderBy: { dueDate: 'asc' },
      }),
      this.prisma.complianceTask.findMany({
        where: { ...obligationWhere, status: { not: TaskStatus.COMPLETE }, dueDate: { lt: now } },
        select: { id: true, title: true, dueDate: true },
        take: 2,
        orderBy: { dueDate: 'asc' },
      }),
      this.prisma.auditFinding.findMany({
        where: { organizationId: authCtx.organizationId, status: { in: [FindingStatus.OPEN, FindingStatus.IN_REMEDIATION] }, dueDate: { lt: now } },
        select: { id: true, title: true, severity: true, dueDate: true },
        take: 2,
        orderBy: { dueDate: 'asc' },
      }),
      this.prisma.auditCapa.findMany({
        where: { organizationId: authCtx.organizationId, status: { in: [CapaStatus.OPEN, CapaStatus.IN_PROGRESS] }, dueDate: { lt: now } },
        select: { id: true, title: true, dueDate: true },
        take: 2,
        orderBy: { dueDate: 'asc' },
      }),
      this.prisma.policy.findMany({
        where: {
          ...scopeWhere,
          deletedAt: null,
          status: PolicyStatus.PUBLISHED,
          reviewDate: { lt: now },
        },
        select: { id: true, title: true, reviewDate: true },
        take: 2,
        orderBy: { reviewDate: 'asc' },
      }),
      this.prisma.vendorAssessment.findMany({
        where: {
          organizationId: authCtx.organizationId,
          status: VendorAssessmentStatus.OVERDUE,
        },
        select: { id: true, title: true, vendor: { select: { name: true } } },
        take: 2,
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    const assets: AssetMetricsDto = {
      total: assetTotal,
      criticalityHighCount: assetHigh,
      managedCount: assetManaged,
      unmanagedCount: assetUnmanaged,
      byEnvironment: Object.fromEntries(assetByEnv.map((g) => [g.environment, g._count])),
      byType: Object.fromEntries(assetByType.map((g) => [g.type, g._count])),
    };

    const vulnerabilities: VulnerabilityMetricsDto = {
      total: vulnTotal,
      openCount: vulnOpen,
      overdueCount: vulnOverdue,
      resolvedCount: vulnResolved,
      riskAcceptedCount: vulnRiskAccepted,
      bySeverity: Object.fromEntries(vulnBySeverity.map((g) => [g.severity, g._count])),
    };

    const policies: PolicyMetricsDto = {
      total: policyTotal,
      byStatus: Object.fromEntries(policyByStatus.map((g) => [g.status, g._count])),
      publishedCount: policyPublished,
      overdueReviewCount: policyOverdueReview,
    };

    const vendors: VendorMetricsDto = {
      total: vendorTotal,
      byCriticality: Object.fromEntries(vendorByCriticality.map((g) => [g.criticality, g._count])),
      byStatus: Object.fromEntries(vendorByStatus.map((g) => [g.status, g._count])),
      requiringReviewCount: vendorRequiringReview,
      assessmentsOverdueCount: vendorAssessmentsOverdue,
    };

    const completionRate = obTotal > 0 ? Math.round((obCompleted / obTotal) * 100) : 100;
    const obligations: ObligationMetricsDto = {
      total: obTotal,
      upcomingCount: obUpcoming,
      overdueCount: obOverdue,
      completedCount: obCompleted,
      completionRate,
    };

    const audits: AuditMetricsDto = {
      totalPlans: auditPlansTotal,
      byPlanStatus: Object.fromEntries(auditPlansByStatus.map((g) => [g.status, g._count])),
      assessmentCount: auditAssessmentCount,
      overallAuditScore: Math.round(auditAvgScore._avg.score || 0),
      findingsTotal: auditFindingsTotal,
      findingsOpenCount: auditFindingsOpen,
      findingsOverdueCount: auditFindingsOverdue,
      findingsBySeverity: Object.fromEntries(auditFindingsBySeverity.map((g) => [g.severity, g._count])),
      capaOpenCount: auditCapaOpen,
    };

    const risks: RiskMetricsDto = {
      totalOpen: riskTotalOpen,
      byScoreBand: {
        HIGH: riskHighBand,
        MEDIUM: riskMediumBand,
        LOW: riskLowBand,
      },
      byStatus: Object.fromEntries(riskByStatus.map((g) => [g.status, g._count])),
    };

    const attentionRequired = [
      ...overdueVulnList.map((v) => ({
        id: v.id,
        domain: 'VULNERABILITY' as const,
        title: v.title,
        severityOrPriority: v.severity,
        dueDate: v.dueDate ? v.dueDate.toISOString() : undefined,
        targetView: '/vulnerabilities',
      })),
      ...overdueTaskList.map((t) => ({
        id: t.id,
        domain: 'OBLIGATION' as const,
        title: t.title,
        severityOrPriority: 'MEDIUM',
        dueDate: t.dueDate ? t.dueDate.toISOString() : undefined,
        targetView: '/compliance-tasks',
      })),
      ...overdueFindingList.map((f) => ({
        id: f.id,
        domain: 'AUDIT_FINDING' as const,
        title: f.title,
        severityOrPriority: f.severity,
        dueDate: f.dueDate ? f.dueDate.toISOString() : undefined,
        targetView: '/business-audits',
      })),
      ...overdueCapaList.map((c) => ({
        id: c.id,
        domain: 'CAPA' as const,
        title: c.title,
        severityOrPriority: 'HIGH',
        dueDate: c.dueDate ? c.dueDate.toISOString() : undefined,
        targetView: '/business-audits',
      })),
      ...overduePolicyList.map((p) => ({
        id: p.id,
        domain: 'POLICY' as const,
        title: p.title,
        severityOrPriority: 'MEDIUM',
        dueDate: p.reviewDate ? p.reviewDate.toISOString() : undefined,
        targetView: '/policies',
      })),
      ...overdueVendorAssessmentList.map((va) => ({
        id: va.id,
        domain: 'VENDOR' as const,
        title: `${va.vendor.name}: ${va.title}`,
        severityOrPriority: 'HIGH',
        targetView: '/vendors',
      })),
    ];

    return {
      timestamp: new Date().toISOString(),
      organizationId: authCtx.organizationId,
      assets,
      vulnerabilities,
      policies,
      vendors,
      obligations,
      audits,
      risks,
      attentionRequired,
    };
  }
}
