import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MetricsService } from '../metrics/metrics.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { ExcelExportService } from './excel-export.service';
import { ReportsRegistry } from './reports.registry';
import {
  ReportQueryDto,
  ReportResponseDto,
  ReportType,
  VulnerabilitySeverity,
  VulnerabilityStatus,
  AssetType,
  AssetEnvironment,
  AssetCriticality,
  PolicyStatus,
  VendorCriticality,
  VendorStatus,
  ObligationCadence,
  TaskStatus,
  AuditPlanStatus,
  RiskStatus,
  RiskScoreBand,
} from '@omnigrc/shared';

import { ResourceAuthorizationService, ResourceAuthContext } from '../auth/resource-authorization.service';

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly metricsService: MetricsService,
    private readonly auditLogsService: AuditLogsService,
    private readonly excelExportService: ExcelExportService,
    private readonly reportsRegistry: ReportsRegistry,
    private readonly resourceAuthService: ResourceAuthorizationService,
  ) {}

  public getReportDefinitions() {
    return this.reportsRegistry.getAll();
  }

  public getReportDefinition(reportType: ReportType) {
    const def = this.reportsRegistry.get(reportType);
    if (!def) {
      throw new NotFoundException(`Unknown report type: ${reportType}`);
    }
    return def;
  }

  async getReport(
    authCtx: ResourceAuthContext,
    reportType: ReportType,
    query: ReportQueryDto,
    isExport = false,
  ): Promise<ReportResponseDto> {
    const { organizationId } = authCtx;
    const scopeWhere = await this.resourceAuthService.getScopeWhereClause(authCtx);
    const meta = this.getReportDefinition(reportType);
    const page = Math.max(Number(query.page) || 1, 1);
    const limit = isExport ? 5000 : Math.min(Math.max(Number(query.limit) || 20, 1), 100);
    const skip = (page - 1) * limit;

    const validatedSortBy = this.reportsRegistry.validateSortField(reportType, query.sortBy);
    const sortDirection = query.sortDirection === 'asc' ? 'asc' : 'desc';

    let total = 0;
    let rows: Record<string, any>[] = [];

    switch (reportType) {
      case ReportType.EXECUTIVE_GRC_POSTURE: {
        const overview = await this.metricsService.getOverviewMetrics(authCtx);
        rows = [
          { domain: 'Assets', metricName: 'Total Assets', metricValue: overview.assets.total, unit: 'count' },
          { domain: 'Assets', metricName: 'High Criticality Assets', metricValue: overview.assets.criticalityHighCount, unit: 'count' },
          { domain: 'Assets', metricName: 'Managed Assets', metricValue: overview.assets.managedCount, unit: 'count' },
          { domain: 'Assets', metricName: 'Unmanaged Assets', metricValue: overview.assets.unmanagedCount, unit: 'count' },

          { domain: 'Vulnerabilities', metricName: 'Total Tracked', metricValue: overview.vulnerabilities.total, unit: 'count' },
          { domain: 'Vulnerabilities', metricName: 'Open Vulnerabilities', metricValue: overview.vulnerabilities.openCount, unit: 'count' },
          { domain: 'Vulnerabilities', metricName: 'SLA Overdue', metricValue: overview.vulnerabilities.overdueCount, unit: 'count' },
          { domain: 'Vulnerabilities', metricName: 'Resolved', metricValue: overview.vulnerabilities.resolvedCount, unit: 'count' },

          { domain: 'Policies', metricName: 'Total Policies', metricValue: overview.policies.total, unit: 'count' },
          { domain: 'Policies', metricName: 'Published Policies', metricValue: overview.policies.publishedCount, unit: 'count' },
          { domain: 'Policies', metricName: 'Review Overdue', metricValue: overview.policies.overdueReviewCount, unit: 'count' },

          { domain: 'Vendors', metricName: 'Total Vendors', metricValue: overview.vendors.total, unit: 'count' },
          { domain: 'Vendors', metricName: 'Review Required', metricValue: overview.vendors.requiringReviewCount, unit: 'count' },
          { domain: 'Vendors', metricName: 'Overdue Assessments', metricValue: overview.vendors.assessmentsOverdueCount, unit: 'count' },

          { domain: 'Obligations', metricName: 'Total Obligation Tasks', metricValue: overview.obligations.total, unit: 'count' },
          { domain: 'Obligations', metricName: 'Completed Tasks', metricValue: overview.obligations.completedCount, unit: 'count' },
          { domain: 'Obligations', metricName: 'Completion Rate', metricValue: overview.obligations.completionRate, unit: '%' },

          { domain: 'Business Audits', metricName: 'Total Audit Plans', metricValue: overview.audits.totalPlans, unit: 'count' },
          { domain: 'Business Audits', metricName: 'Active Assessments', metricValue: overview.audits.assessmentCount, unit: 'count' },
          { domain: 'Business Audits', metricName: 'Overall Audit Score', metricValue: overview.audits.overallAuditScore, unit: '%' },

          { domain: 'Risks', metricName: 'Total Open Risks', metricValue: overview.risks.totalOpen, unit: 'count' },
          { domain: 'Risks', metricName: 'High Score Band', metricValue: overview.risks.byScoreBand.HIGH, unit: 'count' },
          { domain: 'Risks', metricName: 'Medium Score Band', metricValue: overview.risks.byScoreBand.MEDIUM, unit: 'count' },
          { domain: 'Risks', metricName: 'Low Score Band', metricValue: overview.risks.byScoreBand.LOW, unit: 'count' },
        ];
        total = rows.length;
        break;
      }

      case ReportType.VULNERABILITY_REPORT: {
        const where: any = { organizationId, deletedAt: null };
        if (query.severity) where.severity = query.severity;
        if (query.status) where.status = query.status;
        if (query.overdue) {
          where.dueDate = { lt: new Date() };
          where.status = { notIn: [VulnerabilityStatus.RESOLVED, VulnerabilityStatus.RISK_ACCEPTED] };
        }
        if (query.search) {
          where.OR = [
            { title: { contains: query.search, mode: 'insensitive' } },
            { cveId: { contains: query.search, mode: 'insensitive' } },
          ];
        }

        const [count, items] = await Promise.all([
          this.prisma.vulnerability.count({ where }),
          this.prisma.vulnerability.findMany({
            where,
            include: { affectedAssets: { select: { id: true } } },
            orderBy: validatedSortBy ? { [validatedSortBy]: sortDirection } : { createdAt: 'desc' },
            skip,
            take: limit,
          }),
        ]);

        total = count;
        const now = new Date();
        rows = items.map((v) => {
          const isOverdue =
            Boolean(v.dueDate) &&
            new Date(v.dueDate!) < now &&
            v.status !== VulnerabilityStatus.RESOLVED &&
            v.status !== VulnerabilityStatus.RISK_ACCEPTED;

          return {
            id: v.id,
            title: v.title,
            cveId: v.cveId || 'N/A',
            severity: v.severity,
            status: v.status,
            affectedAssetCount: v.affectedAssets?.length || 0,
            remediationOwner: v.remediationOwner,
            dueDate: v.dueDate ? new Date(v.dueDate).toISOString().split('T')[0] : 'N/A',
            isOverdue,
            discoveredAt: new Date(v.discoveredAt).toISOString().split('T')[0],
          };
        });
        break;
      }

      case ReportType.ASSET_INVENTORY_REPORT: {
        const where: any = { organizationId, deletedAt: null };
        if (query.type) where.type = query.type;
        if (query.environment) where.environment = query.environment;
        if (query.criticality) where.criticality = query.criticality;
        if (query.overdue !== undefined || (query as any).isManaged !== undefined) {
          const managedBool = (query as any).isManaged !== undefined ? (query as any).isManaged : query.overdue;
          if (typeof managedBool === 'boolean' || managedBool === 'true' || managedBool === 'false') {
            where.isManaged = managedBool === true || managedBool === 'true';
          }
        }
        if (query.search) {
          where.OR = [
            { name: { contains: query.search, mode: 'insensitive' } },
            { vendorName: { contains: query.search, mode: 'insensitive' } },
            { owner: { contains: query.search, mode: 'insensitive' } },
          ];
        }

        const [count, items] = await Promise.all([
          this.prisma.asset.count({ where }),
          this.prisma.asset.findMany({
            where,
            orderBy: validatedSortBy ? { [validatedSortBy]: sortDirection } : { createdAt: 'desc' },
            skip,
            take: limit,
          }),
        ]);

        total = count;
        rows = items.map((a) => ({
          id: a.id,
          name: a.name,
          type: a.type,
          environment: a.environment,
          criticality: a.criticality,
          isManaged: a.isManaged,
          owner: a.owner,
          vendorName: a.vendorName || 'N/A',
          dataResidencyRegion: a.dataResidencyRegion || 'N/A',
          createdAt: new Date(a.createdAt).toISOString().split('T')[0],
        }));
        break;
      }

      case ReportType.POLICY_GOVERNANCE_REPORT: {
        const where: any = { organizationId, deletedAt: null };
        if (query.status) where.status = query.status;
        if (query.search) {
          where.OR = [
            { title: { contains: query.search, mode: 'insensitive' } },
            { code: { contains: query.search, mode: 'insensitive' } },
            { category: { contains: query.search, mode: 'insensitive' } },
          ];
        }

        const items = await this.prisma.policy.findMany({
          where,
          include: { publishedVersion: true },
          orderBy: validatedSortBy ? { [validatedSortBy]: sortDirection } : { createdAt: 'desc' },
        });

        const now = new Date();
        const mapped = items.map((p) => {
          let isReviewOverdue = false;
          if (p.reviewDate) {
            isReviewOverdue = new Date(p.reviewDate) < now;
          } else {
            const nextRev = new Date(p.createdAt);
            nextRev.setDate(nextRev.getDate() + (p.reviewCadenceDays || 365));
            isReviewOverdue = nextRev < now;
          }

          return {
            id: p.id,
            code: p.code,
            title: p.title,
            category: p.category,
            status: p.status,
            publishedVersionNumber: p.publishedVersion?.versionNumber || 'N/A',
            reviewCadenceDays: p.reviewCadenceDays,
            reviewDate: p.reviewDate ? new Date(p.reviewDate).toISOString().split('T')[0] : 'N/A',
            isReviewOverdue,
            createdAt: new Date(p.createdAt).toISOString().split('T')[0],
          };
        });

        const filtered = query.overdueReview
          ? mapped.filter((item) => item.isReviewOverdue)
          : mapped;

        total = filtered.length;
        rows = filtered.slice(skip, skip + limit);
        break;
      }

      case ReportType.VENDOR_RISK_REPORT: {
        const where: any = { organizationId, deletedAt: null };
        if (query.criticality) where.criticality = query.criticality;
        if (query.status) where.status = query.status;
        if (query.search) {
          where.OR = [
            { name: { contains: query.search, mode: 'insensitive' } },
            { category: { contains: query.search, mode: 'insensitive' } },
            { owner: { contains: query.search, mode: 'insensitive' } },
          ];
        }

        const items = await this.prisma.vendor.findMany({
          where,
          include: { assessments: { select: { id: true } } },
          orderBy: validatedSortBy ? { [validatedSortBy]: sortDirection } : { createdAt: 'desc' },
        });

        const now = new Date();
        const mapped = items.map((v) => {
          let isReviewRequired = false;
          if (v.nextReviewDate) {
            isReviewRequired = new Date(v.nextReviewDate) < now;
          } else {
            const lastRev = v.lastReviewedAt ? new Date(v.lastReviewedAt) : new Date(v.createdAt);
            const nextRev = new Date(lastRev);
            nextRev.setDate(nextRev.getDate() + (v.reviewCadenceDays || 365));
            isReviewRequired = nextRev < now;
          }

          return {
            id: v.id,
            name: v.name,
            category: v.category || 'N/A',
            criticality: v.criticality,
            status: v.status,
            owner: v.owner,
            reviewCadenceDays: v.reviewCadenceDays,
            lastReviewedAt: v.lastReviewedAt ? new Date(v.lastReviewedAt).toISOString().split('T')[0] : 'N/A',
            nextReviewDate: v.nextReviewDate ? new Date(v.nextReviewDate).toISOString().split('T')[0] : 'N/A',
            isReviewRequired,
            assessmentCount: v.assessments?.length || 0,
          };
        });

        const filtered = query.requiringReview
          ? mapped.filter((item) => item.isReviewRequired)
          : mapped;

        total = filtered.length;
        rows = filtered.slice(skip, skip + limit);
        break;
      }

      case ReportType.COMPLIANCE_OBLIGATION_REPORT: {
        // Authoritative obligation predicate: cadence != ONE_OFF OR obligationReference IS NOT NULL
        const where: any = {
          organizationId,
          deletedAt: null,
          OR: [
            { cadence: { not: ObligationCadence.ONE_OFF } },
            { obligationReference: { not: null } },
          ],
        };

        if (query.status) where.status = query.status;
        if (query.cadence) where.cadence = query.cadence;
        if (query.search) {
          where.AND = [
            {
              OR: [
                { title: { contains: query.search, mode: 'insensitive' } },
                { obligationReference: { contains: query.search, mode: 'insensitive' } },
                { owner: { contains: query.search, mode: 'insensitive' } },
              ],
            },
          ];
        }

        const now = new Date();
        if (query.overdue) {
          where.dueDate = { lt: now };
          where.status = { not: TaskStatus.COMPLETE };
        } else if (query.upcoming) {
          const in30 = new Date(now);
          in30.setDate(in30.getDate() + 30);
          where.dueDate = { gte: now, lte: in30 };
          where.status = { not: TaskStatus.COMPLETE };
        }

        const [count, items] = await Promise.all([
          this.prisma.complianceTask.count({ where }),
          this.prisma.complianceTask.findMany({
            where,
            include: { control: { select: { name: true } } },
            orderBy: validatedSortBy ? { [validatedSortBy]: sortDirection } : { dueDate: 'asc' },
            skip,
            take: limit,
          }),
        ]);

        total = count;
        rows = items.map((t) => {
          const isOverdue = Boolean(t.dueDate) && new Date(t.dueDate!) < now && t.status !== TaskStatus.COMPLETE;

          return {
            id: t.id,
            title: t.title,
            obligationReference: t.obligationReference || 'N/A',
            cadence: t.cadence,
            status: t.status,
            owner: t.owner,
            controlName: t.control?.name || 'N/A',
            dueDate: t.dueDate ? new Date(t.dueDate).toISOString().split('T')[0] : 'N/A',
            isOverdue,
            lastCompletedAt: t.lastCompletedAt ? new Date(t.lastCompletedAt).toISOString().split('T')[0] : 'N/A',
          };
        });
        break;
      }

      case ReportType.BUSINESS_AUDIT_REPORT: {
        const where: any = { organizationId };
        if (query.status) where.status = query.status;
        if (query.search) {
          where.OR = [
            { title: { contains: query.search, mode: 'insensitive' } },
            { objective: { contains: query.search, mode: 'insensitive' } },
            { scope: { contains: query.search, mode: 'insensitive' } },
          ];
        }

        const [count, plans] = await Promise.all([
          this.prisma.auditPlan.count({ where }),
          this.prisma.auditPlan.findMany({
            where,
            include: {
              assessments: {
                include: {
                  findings: {
                    include: { capas: true },
                  },
                },
                orderBy: { createdAt: 'desc' },
              },
            },
            orderBy: validatedSortBy ? { [validatedSortBy]: sortDirection } : { createdAt: 'desc' },
            skip,
            take: limit,
          }),
        ]);

        total = count;
        const now = new Date();
        rows = plans.map((p) => {
          const assessments = p.assessments || [];
          const latestAssessment = assessments[0];
          const storedScore = latestAssessment?.score || 0;

          let findingsTotal = 0;
          let findingsOpen = 0;
          let findingsOverdue = 0;
          let capaOpenCount = 0;

          assessments.forEach((ass) => {
            (ass.findings || []).forEach((f) => {
              findingsTotal++;
              if (f.status !== 'CLOSED' && f.status !== 'VERIFIED') {
                findingsOpen++;
                if (f.dueDate && new Date(f.dueDate) < now) {
                  findingsOverdue++;
                }
              }
              (f.capas || []).forEach((c) => {
                if (c.status !== 'CLOSED' && c.status !== 'VERIFIED') {
                  capaOpenCount++;
                }
              });
            });
          });

          return {
            id: p.id,
            title: p.title,
            frameworkCode: p.frameworkCode || 'N/A',
            status: p.status,
            ownerId: p.ownerId,
            assessmentCount: assessments.length,
            latestAssessmentScore: storedScore,
            findingsTotal,
            findingsOpen,
            findingsOverdue,
            capaOpenCount,
          };
        });
        break;
      }

      case ReportType.RISK_REGISTER_REPORT: {
        const where: any = { organizationId, deletedAt: null };
        if (query.status) where.status = query.status;
        if (query.scoreBand) {
          if (query.scoreBand === RiskScoreBand.HIGH) where.score = { gte: 15 };
          else if (query.scoreBand === RiskScoreBand.MEDIUM) where.score = { gte: 8, lte: 14 };
          else if (query.scoreBand === RiskScoreBand.LOW) where.score = { gte: 1, lte: 7 };
        }
        if (query.search) {
          where.OR = [
            { title: { contains: query.search, mode: 'insensitive' } },
            { owner: { contains: query.search, mode: 'insensitive' } },
            { treatmentPlan: { contains: query.search, mode: 'insensitive' } },
          ];
        }

        const [count, items] = await Promise.all([
          this.prisma.risk.count({ where }),
          this.prisma.risk.findMany({
            where,
            include: { asset: { select: { name: true } } },
            orderBy: validatedSortBy ? { [validatedSortBy]: sortDirection } : { createdAt: 'desc' },
            skip,
            take: limit,
          }),
        ]);

        total = count;
        rows = items.map((r) => {
          let band = RiskScoreBand.LOW;
          if (r.score >= 15) band = RiskScoreBand.HIGH;
          else if (r.score >= 8) band = RiskScoreBand.MEDIUM;

          return {
            id: r.id,
            title: r.title,
            owner: r.owner,
            likelihood: r.likelihood,
            impact: r.impact,
            score: r.score,
            scoreBand: band,
            status: r.status,
            assetName: r.asset?.name || 'N/A',
            treatmentPlan: r.treatmentPlan || 'N/A',
            createdAt: new Date(r.createdAt).toISOString().split('T')[0],
          };
        });
        break;
      }

      default:
        throw new BadRequestException(`Report type '${reportType}' is not implemented.`);
    }

    return {
      reportType,
      generatedAt: new Date().toISOString(),
      organizationId,
      appliedFilters: {
        search: query.search || null,
        sortBy: validatedSortBy || null,
        sortDirection,
        status: query.status || null,
        severity: query.severity || null,
        criticality: query.criticality || null,
        environment: query.environment || null,
        type: query.type || null,
        cadence: query.cadence || null,
        scoreBand: query.scoreBand || null,
        overdue: query.overdue ?? null,
      },
      total,
      page,
      limit,
      data: rows,
    };
  }

  async exportReport(
    authCtx: ResourceAuthContext,
    reportType: ReportType,
    query: ReportQueryDto,
  ): Promise<{ buffer: Buffer; filename: string; contentType: string }> {
    const { organizationId, userId } = authCtx;
    const meta = this.getReportDefinition(reportType);
    const format = query.format === 'xlsx' ? 'xlsx' : 'csv';

    const reportData = await this.getReport(authCtx, reportType, query, true);

    let buffer: Buffer;
    let filename: string;
    let contentType: string;

    const timestamp = new Date().toISOString().split('T')[0];

    if (format === 'xlsx') {
      buffer = await this.excelExportService.generateXlsxBuffer(
        meta.title,
        meta.columns,
        reportData.data,
      );
      filename = `${reportType}_${timestamp}.xlsx`;
      contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    } else {
      buffer = this.excelExportService.generateCsvBuffer(meta.columns, reportData.data);
      filename = `${reportType}_${timestamp}.csv`;
      contentType = 'text/csv';
    }

    await this.auditLogsService.log({
      organizationId,
      actorId: userId,
      action: 'REPORT_EXPORTED',
      entityType: 'Report',
      entityId: reportType,
      metadata: {
        format,
        rowCount: reportData.data.length,
        appliedFilters: reportData.appliedFilters,
      },
    });

    return { buffer, filename, contentType };
  }
}
