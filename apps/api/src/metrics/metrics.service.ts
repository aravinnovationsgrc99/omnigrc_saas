import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
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
  AuditPlanStatus,
  FindingStatus,
  CapaStatus,
} from '@omnigrc/shared';

@Injectable()
export class MetricsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Authoritative Single Source of Truth for Overview Metrics across all 7 GRC Domains.
   * All database calls are aggregated database-side and executed in a single parallel batch.
   */
  async getOverviewMetrics(organizationId: string): Promise<OverviewMetricsDto> {
    const now = new Date();
    const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    // Obligation Predicate: cadence != 'ONE_OFF' OR obligationReference IS NOT NULL
    const obligationWhere: any = {
      organizationId,
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
    ] = await Promise.all([
      // Assets
      this.prisma.asset.count({ where: { organizationId, deletedAt: null } }),
      this.prisma.asset.count({ where: { organizationId, deletedAt: null, criticality: 'HIGH' } }),
      this.prisma.asset.count({ where: { organizationId, deletedAt: null, isManaged: true } }),
      this.prisma.asset.count({ where: { organizationId, deletedAt: null, isManaged: false } }),
      this.prisma.asset.groupBy({ by: ['environment'], where: { organizationId, deletedAt: null }, _count: true }),
      this.prisma.asset.groupBy({ by: ['type'], where: { organizationId, deletedAt: null }, _count: true }),

      // Vulnerabilities
      this.prisma.vulnerability.count({ where: { organizationId, deletedAt: null } }),
      this.prisma.vulnerability.count({
        where: { organizationId, deletedAt: null, status: { in: [VulnerabilityStatus.OPEN, VulnerabilityStatus.IN_REMEDIATION] } },
      }),
      this.prisma.vulnerability.count({
        where: {
          organizationId,
          deletedAt: null,
          status: { in: [VulnerabilityStatus.OPEN, VulnerabilityStatus.IN_REMEDIATION] },
          dueDate: { lt: now },
        },
      }),
      this.prisma.vulnerability.count({ where: { organizationId, deletedAt: null, status: VulnerabilityStatus.RESOLVED } }),
      this.prisma.vulnerability.count({ where: { organizationId, deletedAt: null, status: VulnerabilityStatus.RISK_ACCEPTED } }),
      this.prisma.vulnerability.groupBy({ by: ['severity'], where: { organizationId, deletedAt: null }, _count: true }),

      // Policies
      this.prisma.policy.count({ where: { organizationId, deletedAt: null } }),
      this.prisma.policy.groupBy({ by: ['status'], where: { organizationId, deletedAt: null }, _count: true }),
      this.prisma.policy.count({ where: { organizationId, deletedAt: null, status: PolicyStatus.PUBLISHED } }),
      this.prisma.policy.count({
        where: {
          organizationId,
          deletedAt: null,
          status: PolicyStatus.PUBLISHED,
          OR: [
            { reviewDate: { lt: now } },
            { reviewDate: null, createdAt: { lt: new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000) } },
          ],
        },
      }),

      // Vendors
      this.prisma.vendor.count({ where: { organizationId, deletedAt: null } }),
      this.prisma.vendor.groupBy({ by: ['criticality'], where: { organizationId, deletedAt: null }, _count: true }),
      this.prisma.vendor.groupBy({ by: ['status'], where: { organizationId, deletedAt: null }, _count: true }),
      this.prisma.vendor.count({
        where: {
          organizationId,
          deletedAt: null,
          status: VendorStatus.ACTIVE,
          OR: [
            { nextReviewDate: { lt: now } },
            { nextReviewDate: null, lastReviewedAt: { lt: new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000) } },
          ],
        },
      }),
      this.prisma.vendorAssessment.count({
        where: {
          organizationId,
          OR: [
            { status: 'OVERDUE' },
            { status: { not: 'COMPLETED' }, createdAt: { lt: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000) } },
          ],
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
      this.prisma.auditPlan.count({ where: { organizationId } }),
      this.prisma.auditPlan.groupBy({ by: ['status'], where: { organizationId }, _count: true }),
      this.prisma.auditAssessment.count({ where: { organizationId } }),
      this.prisma.auditAssessment.aggregate({ where: { organizationId }, _avg: { score: true } }),
      this.prisma.auditFinding.count({ where: { organizationId } }),
      this.prisma.auditFinding.count({
        where: { organizationId, status: { in: [FindingStatus.OPEN, FindingStatus.IN_REMEDIATION, FindingStatus.READY_FOR_VERIFICATION] } },
      }),
      this.prisma.auditFinding.count({
        where: { organizationId, status: { in: [FindingStatus.OPEN, FindingStatus.IN_REMEDIATION] }, dueDate: { lt: now } },
      }),
      this.prisma.auditFinding.groupBy({ by: ['severity'], where: { organizationId }, _count: true }),
      this.prisma.auditCapa.count({ where: { organizationId, status: { in: [CapaStatus.OPEN, CapaStatus.IN_PROGRESS] } } }),

      // Risks
      this.prisma.risk.count({
        where: { organizationId, deletedAt: null, status: { in: ['OPEN', 'IN_TREATMENT'] } },
      }),
      this.prisma.risk.count({
        where: { organizationId, deletedAt: null, status: { in: ['OPEN', 'IN_TREATMENT'] }, score: { gte: 15 } },
      }),
      this.prisma.risk.count({
        where: { organizationId, deletedAt: null, status: { in: ['OPEN', 'IN_TREATMENT'] }, score: { gte: 8, lt: 15 } },
      }),
      this.prisma.risk.count({
        where: { organizationId, deletedAt: null, status: { in: ['OPEN', 'IN_TREATMENT'] }, score: { lt: 8 } },
      }),
      this.prisma.risk.groupBy({ by: ['status'], where: { organizationId, deletedAt: null }, _count: true }),
    ]);

    // Format groupBy results into dictionaries
    const assetByEnvMap: Record<string, number> = {};
    assetByEnv.forEach((item) => (assetByEnvMap[item.environment] = item._count));

    const assetByTypeMap: Record<string, number> = {};
    assetByType.forEach((item) => (assetByTypeMap[item.type] = item._count));

    const vulnBySevMap: Record<string, number> = {};
    vulnBySeverity.forEach((item) => (vulnBySevMap[item.severity] = item._count));

    const policyByStatusMap: Record<string, number> = {};
    policyByStatus.forEach((item) => (policyByStatusMap[item.status] = item._count));

    const vendorByCritMap: Record<string, number> = {};
    vendorByCriticality.forEach((item) => (vendorByCritMap[item.criticality] = item._count));

    const vendorByStatusMap: Record<string, number> = {};
    vendorByStatus.forEach((item) => (vendorByStatusMap[item.status] = item._count));

    const auditPlansByStatusMap: Record<string, number> = {};
    auditPlansByStatus.forEach((item) => (auditPlansByStatusMap[item.status] = item._count));

    const auditFindingsBySevMap: Record<string, number> = {};
    auditFindingsBySeverity.forEach((item) => (auditFindingsBySevMap[item.severity] = item._count));

    const riskByStatusMap: Record<string, number> = {};
    riskByStatus.forEach((item) => (riskByStatusMap[item.status] = item._count));

    const obCompletionRate = obTotal > 0 ? Number(((obCompleted / obTotal) * 100).toFixed(2)) : 0;
    const overallAuditScore = auditAvgScore._avg.score ? Number(auditAvgScore._avg.score.toFixed(2)) : 0;

    return {
      timestamp: now.toISOString(),
      organizationId,
      assets: {
        total: assetTotal,
        criticalityHighCount: assetHigh,
        managedCount: assetManaged,
        unmanagedCount: assetUnmanaged,
        byEnvironment: assetByEnvMap,
        byType: assetByTypeMap,
      },
      vulnerabilities: {
        total: vulnTotal,
        openCount: vulnOpen,
        overdueCount: vulnOverdue,
        resolvedCount: vulnResolved,
        riskAcceptedCount: vulnRiskAccepted,
        bySeverity: vulnBySevMap,
      },
      policies: {
        total: policyTotal,
        publishedCount: policyPublished,
        overdueReviewCount: policyOverdueReview,
        byStatus: policyByStatusMap,
      },
      vendors: {
        total: vendorTotal,
        requiringReviewCount: vendorRequiringReview,
        assessmentsOverdueCount: vendorAssessmentsOverdue,
        byCriticality: vendorByCritMap,
        byStatus: vendorByStatusMap,
      },
      obligations: {
        total: obTotal,
        upcomingCount: obUpcoming,
        overdueCount: obOverdue,
        completedCount: obCompleted,
        completionRate: obCompletionRate,
      },
      audits: {
        totalPlans: auditPlansTotal,
        assessmentCount: auditAssessmentCount,
        overallAuditScore,
        findingsTotal: auditFindingsTotal,
        findingsOpenCount: auditFindingsOpen,
        findingsOverdueCount: auditFindingsOverdue,
        capaOpenCount: auditCapaOpen,
        byPlanStatus: auditPlansByStatusMap,
        findingsBySeverity: auditFindingsBySevMap,
      },
      risks: {
        totalOpen: riskTotalOpen,
        byScoreBand: {
          HIGH: riskHighBand,
          MEDIUM: riskMediumBand,
          LOW: riskLowBand,
        },
        byStatus: riskByStatusMap,
      },
    };
  }
}
