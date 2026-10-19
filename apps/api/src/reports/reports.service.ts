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
        if (query.frameworkId) {
          where.frameworkId = query.frameworkId;
        } else if (query.frameworkCode) {
          where.OR = [
            { frameworkCode: query.frameworkCode },
            { frameworkRef: { code: query.frameworkCode } },
          ];
        }
        if (query.search) {
          const searchClause = [
            { title: { contains: query.search, mode: 'insensitive' } },
            { objective: { contains: query.search, mode: 'insensitive' } },
            { scope: { contains: query.search, mode: 'insensitive' } },
          ];
          if (where.OR) {
            where.AND = [{ OR: where.OR }, { OR: searchClause }];
            delete where.OR;
          } else {
            where.OR = searchClause;
          }
        }

        const [count, plans] = await Promise.all([
          this.prisma.auditPlan.count({ where }),
          this.prisma.auditPlan.findMany({
            where,
            include: {
              frameworkRef: { select: { code: true, name: true } },
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
            frameworkCode: p.frameworkRef?.code || p.frameworkCode || 'N/A',
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
        if (query.frameworkReferenceId) {
          where.frameworkReferenceId = query.frameworkReferenceId;
        } else if (query.frameworkId) {
          where.frameworkReference = {
            frameworkVersion: { frameworkId: query.frameworkId },
          };
        }
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

      // ─── Phase 4B: Workbook-required reports ──────────────────────────────

      // Criterion 1: Audit Status & Summary Report
      case ReportType.AUDIT_STATUS_SUMMARY: {
        const where: any = { organizationId };
        if (query.status) where.status = query.status;
        if (query.frameworkId) where.frameworkId = query.frameworkId;
        else if (query.frameworkCode) {
          where.OR = [
            { frameworkCode: query.frameworkCode },
            { frameworkRef: { code: query.frameworkCode } },
          ];
        }
        if (query.search) {
          const sc = [
            { title: { contains: query.search, mode: 'insensitive' } },
            { objective: { contains: query.search, mode: 'insensitive' } },
          ];
          if (where.OR) { where.AND = [{ OR: where.OR }, { OR: sc }]; delete where.OR; }
          else where.OR = sc;
        }

        const [count, plans] = await Promise.all([
          this.prisma.auditPlan.count({ where }),
          this.prisma.auditPlan.findMany({
            where,
            include: {
              frameworkRef: { select: { code: true } },
              assessments: {
                include: { findings: { select: { id: true, status: true, dueDate: true } } },
                orderBy: { createdAt: 'desc' },
              },
            },
            orderBy: validatedSortBy ? { [validatedSortBy]: sortDirection } : { createdAt: 'desc' },
            skip,
            take: limit,
          }),
        ]);

        const now = new Date();
        total = count;
        rows = plans.map((p) => {
          const assessments = p.assessments || [];
          const completedAssessments = assessments.filter((a) => a.status === 'COMPLETED').length;
          const inProgressAssessments = assessments.filter((a) => a.status === 'IN_PROGRESS').length;
          const latestScore = assessments[0]?.score ?? 0;

          let findingsTotal = 0;
          let findingsOpen = 0;
          assessments.forEach((a) => {
            (a.findings || []).forEach((f) => {
              findingsTotal++;
              if (f.status !== 'CLOSED' && f.status !== 'VERIFIED') findingsOpen++;
            });
          });

          return {
            id: p.id,
            title: p.title,
            frameworkCode: p.frameworkRef?.code || p.frameworkCode || 'N/A',
            status: p.status,
            ownerId: p.ownerId,
            plannedStartDate: p.plannedStartDate ? new Date(p.plannedStartDate).toISOString().split('T')[0] : 'N/A',
            plannedEndDate: p.plannedEndDate ? new Date(p.plannedEndDate).toISOString().split('T')[0] : 'N/A',
            assessmentCount: assessments.length,
            completedAssessments,
            inProgressAssessments,
            findingsTotal,
            findingsOpen,
            latestScore,
          };
        });
        break;
      }

      // Criterion 2: Audit Findings Report
      case ReportType.AUDIT_FINDINGS: {
        const where: any = { organizationId };
        if (query.status) where.status = query.status;
        if (query.severity) where.severity = query.severity;
        if (query.search) {
          where.OR = [
            { title: { contains: query.search, mode: 'insensitive' } },
            { description: { contains: query.search, mode: 'insensitive' } },
          ];
        }

        const now = new Date();
        if (query.overdue) {
          where.dueDate = { lt: now };
          where.status = { notIn: ['CLOSED', 'VERIFIED'] };
        }

        const [count, findings] = await Promise.all([
          this.prisma.auditFinding.count({ where }),
          this.prisma.auditFinding.findMany({
            where,
            include: {
              assessment: { include: { auditPlan: { select: { title: true } } } },
              capas: { select: { id: true } },
            },
            orderBy: validatedSortBy && ['createdAt', 'severity', 'status', 'dueDate'].includes(validatedSortBy)
              ? { [validatedSortBy]: sortDirection }
              : { createdAt: 'desc' },
            skip,
            take: limit,
          }),
        ]);

        total = count;
        rows = findings.map((f) => {
          const ageingDays = Math.floor((now.getTime() - new Date(f.createdAt).getTime()) / 86400000);
          const isOverdue = Boolean(f.dueDate) && new Date(f.dueDate!) < now && f.status !== 'CLOSED' && f.status !== 'VERIFIED';
          return {
            id: f.id,
            title: f.title,
            severity: f.severity,
            status: f.status,
            ownerId: f.ownerId,
            auditPlanTitle: f.assessment?.auditPlan?.title || 'N/A',
            dueDate: f.dueDate ? new Date(f.dueDate).toISOString().split('T')[0] : 'N/A',
            ageingDays,
            isOverdue,
            capaCount: f.capas?.length || 0,
            createdAt: new Date(f.createdAt).toISOString().split('T')[0],
          };
        });
        break;
      }

      // Criterion 3: Audit Compliance/Closure Report
      case ReportType.AUDIT_COMPLIANCE_CLOSURE: {
        const where: any = { organizationId };
        if (query.status) where.status = query.status;
        if (query.search) {
          where.OR = [
            { title: { contains: query.search, mode: 'insensitive' } },
          ];
        }

        const now = new Date();
        if (query.overdue) {
          where.dueDate = { lt: now };
          where.status = { notIn: ['CLOSED', 'VERIFIED'] };
        }

        const [count, findings] = await Promise.all([
          this.prisma.auditFinding.count({ where }),
          this.prisma.auditFinding.findMany({
            where,
            include: {
              assessment: { include: { auditPlan: { select: { title: true } } } },
              capas: { select: { id: true, status: true } },
            },
            orderBy: validatedSortBy && ['createdAt', 'status', 'dueDate'].includes(validatedSortBy)
              ? { [validatedSortBy]: sortDirection }
              : { createdAt: 'desc' },
            skip,
            take: limit,
          }),
        ]);

        total = count;
        rows = findings.map((f) => {
          const isOverdue = Boolean(f.dueDate) && new Date(f.dueDate!) < now && f.status !== 'CLOSED' && f.status !== 'VERIFIED';
          const openCapaCount = (f.capas || []).filter((c) => c.status !== 'CLOSED' && c.status !== 'VERIFIED').length;
          const closedCapaCount = (f.capas || []).filter((c) => c.status === 'CLOSED' || c.status === 'VERIFIED').length;
          const closedAt = (f.status === 'CLOSED' || f.status === 'VERIFIED') ? f.verifiedAt ?? f.updatedAt : null;

          return {
            id: f.id,
            title: f.title,
            auditPlanTitle: f.assessment?.auditPlan?.title || 'N/A',
            severity: f.severity,
            status: f.status,
            ownerId: f.ownerId,
            dueDate: f.dueDate ? new Date(f.dueDate).toISOString().split('T')[0] : 'N/A',
            isOverdue,
            openCapaCount,
            closedCapaCount,
            closedAt: closedAt ? new Date(closedAt).toISOString().split('T')[0] : 'N/A',
            createdAt: new Date(f.createdAt).toISOString().split('T')[0],
          };
        });
        break;
      }

      // Criterion 4: Policy Status Report
      case ReportType.POLICY_STATUS: {
        const where: any = { organizationId, deletedAt: null };
        if (query.status) where.status = query.status;
        if (query.search) {
          where.OR = [
            { title: { contains: query.search, mode: 'insensitive' } },
            { code: { contains: query.search, mode: 'insensitive' } },
            { category: { contains: query.search, mode: 'insensitive' } },
          ];
        }

        const [count, policies] = await Promise.all([
          this.prisma.policy.count({ where }),
          this.prisma.policy.findMany({
            where,
            include: {
              publishedVersion: { select: { versionNumber: true } },
              versions: { orderBy: { createdAt: 'desc' }, take: 1, select: { versionNumber: true } },
            },
            orderBy: validatedSortBy ? { [validatedSortBy]: sortDirection } : { createdAt: 'desc' },
            skip,
            take: limit,
          }),
        ]);

        total = count;
        rows = policies.map((p) => ({
          id: p.id,
          code: p.code,
          title: p.title,
          category: p.category,
          status: p.status,
          currentVersionNumber: (p as any).versions?.[0]?.versionNumber || 'N/A',
          publishedVersionNumber: p.publishedVersion?.versionNumber || 'N/A',
          createdAt: new Date(p.createdAt).toISOString().split('T')[0],
        }));
        break;
      }

      // Criterion 5: Policy Review & Expiry Report
      case ReportType.POLICY_REVIEW_EXPIRY: {
        const where: any = { organizationId, deletedAt: null };
        if (query.status) where.status = query.status;
        if (query.search) {
          where.OR = [
            { title: { contains: query.search, mode: 'insensitive' } },
            { code: { contains: query.search, mode: 'insensitive' } },
          ];
        }

        const policies = await this.prisma.policy.findMany({
          where,
          include: { publishedVersion: { select: { versionNumber: true } } },
          orderBy: { createdAt: 'desc' },
        });

        const now = new Date();
        const mapped = policies.map((p) => {
          // Determine last review date and next review date
          const lastReviewDate = p.reviewDate ? new Date(p.reviewDate) : null;
          let nextReviewDate: Date;
          if (lastReviewDate) {
            nextReviewDate = new Date(lastReviewDate);
            nextReviewDate.setDate(nextReviewDate.getDate() + (p.reviewCadenceDays || 365));
          } else {
            nextReviewDate = new Date(p.createdAt);
            nextReviewDate.setDate(nextReviewDate.getDate() + (p.reviewCadenceDays || 365));
          }
          const isReviewOverdue = nextReviewDate < now;
          const daysUntilNextReview = Math.ceil((nextReviewDate.getTime() - now.getTime()) / 86400000);

          return {
            id: p.id,
            code: p.code,
            title: p.title,
            status: p.status,
            reviewCadenceDays: p.reviewCadenceDays,
            lastReviewDate: lastReviewDate ? lastReviewDate.toISOString().split('T')[0] : 'N/A',
            nextReviewDate: nextReviewDate.toISOString().split('T')[0],
            isReviewOverdue,
            daysUntilNextReview,
          };
        });

        const filtered = query.overdueReview ? mapped.filter((p) => p.isReviewOverdue) : mapped;
        total = filtered.length;
        rows = filtered.slice(skip, skip + limit);
        break;
      }

      // Criterion 6: Policy Acknowledgement Report
      case ReportType.POLICY_ACKNOWLEDGEMENT: {
        const where: any = { organizationId, deletedAt: null };
        if (query.status) where.status = query.status;
        if (query.search) {
          where.OR = [
            { title: { contains: query.search, mode: 'insensitive' } },
            { code: { contains: query.search, mode: 'insensitive' } },
          ];
        }

        // Count total org members (denominators for acknowledgement rates)
        const [totalOrgMembers, policies] = await Promise.all([
          this.prisma.organizationMembership.count({
            where: { organizationId, status: 'ACTIVE' },
          }),
          this.prisma.policy.findMany({
            where,
            include: {
              publishedVersion: {
                select: {
                  versionNumber: true,
                  attestations: { select: { userId: true } },
                },
              },
            },
            orderBy: validatedSortBy ? { [validatedSortBy]: sortDirection } : { createdAt: 'desc' },
          }),
        ]);

        const all = policies.map((p) => {
          const attestations = p.publishedVersion?.attestations || [];
          const acknowledgedCount = attestations.length;
          const pendingCount = Math.max(0, totalOrgMembers - acknowledgedCount);
          // Safe division: denominator is totalOrgMembers
          const acknowledgementRate = totalOrgMembers > 0
            ? Math.round((acknowledgedCount / totalOrgMembers) * 10000) / 100
            : 0;

          return {
            id: p.id,
            code: p.code,
            title: p.title,
            status: p.status,
            publishedVersionNumber: p.publishedVersion?.versionNumber || 'N/A',
            totalOrgMembers,
            acknowledgedCount,
            pendingCount,
            acknowledgementRate,
          };
        });

        total = all.length;
        rows = all.slice(skip, skip + limit);
        break;
      }

      // Criterion 7: Risk Heatmap / Risk Summary Report
      // Returns aggregated rows grouped by (likelihood, impact) bucket, ordered by score desc.
      // Each row represents a matrix cell in the heatmap.
      case ReportType.RISK_HEATMAP: {
        const where: any = { organizationId, deletedAt: null };
        if (query.status) where.status = query.status;

        // Use Prisma groupBy to aggregate at DB level (avoids full table scan in memory)
        const grouped = await this.prisma.risk.groupBy({
          by: ['likelihood', 'impact'],
          where,
          _count: { id: true },
          orderBy: [{ likelihood: 'desc' }, { impact: 'desc' }],
        });

        rows = grouped.map((g) => {
          const score = g.likelihood * g.impact;
          let scoreBand: string;
          if (score >= 15) scoreBand = RiskScoreBand.HIGH;
          else if (score >= 8) scoreBand = RiskScoreBand.MEDIUM;
          else scoreBand = RiskScoreBand.LOW;

          return {
            likelihood: g.likelihood,
            impact: g.impact,
            scoreBand,
            count: g._count.id,
          };
        });

        total = rows.length;
        // Sort by descending combined score as default
        rows.sort((a, b) => (b.likelihood * b.impact) - (a.likelihood * a.impact));
        // Apply pagination to aggregated results
        total = rows.length;
        rows = rows.slice(skip, skip + limit);
        break;
      }

      // Criterion 8: Risk Treatment & Ageing Report
      case ReportType.RISK_TREATMENT_AGEING: {
        const where: any = { organizationId, deletedAt: null };
        if (query.status) where.status = query.status;
        if (query.search) {
          where.OR = [
            { title: { contains: query.search, mode: 'insensitive' } },
            { owner: { contains: query.search, mode: 'insensitive' } },
            { treatmentOwner: { contains: query.search, mode: 'insensitive' } },
          ];
        }

        const now = new Date();
        if (query.overdue) {
          // Overdue treatments: dueDate < now and treatment not completed/accepted
          where.treatmentDueDate = { lt: now };
          where.treatmentStatus = { notIn: ['ACCEPTED', 'COMPLETED', 'CLOSED'] };
        }

        const [count, risks] = await Promise.all([
          this.prisma.risk.count({ where }),
          this.prisma.risk.findMany({
            where,
            include: { asset: { select: { name: true } } },
            orderBy: validatedSortBy && ['createdAt', 'title', 'treatmentDueDate', 'score'].includes(validatedSortBy)
              ? { [validatedSortBy]: sortDirection }
              : { treatmentDueDate: 'asc' },
            skip,
            take: limit,
          }),
        ]);

        total = count;
        rows = risks.map((r) => {
          let band: string;
          if (r.score >= 15) band = RiskScoreBand.HIGH;
          else if (r.score >= 8) band = RiskScoreBand.MEDIUM;
          else band = RiskScoreBand.LOW;

          const ageingDays = Math.floor((now.getTime() - new Date(r.createdAt).getTime()) / 86400000);
          const isTreatmentOverdue = Boolean(r.treatmentDueDate) &&
            new Date(r.treatmentDueDate!) < now &&
            !['ACCEPTED', 'COMPLETED', 'CLOSED'].includes(r.treatmentStatus || '');

          return {
            id: r.id,
            title: r.title,
            owner: r.owner,
            score: r.score,
            scoreBand: band,
            residualScore: r.residualScore ?? 'N/A',
            treatmentStrategy: r.treatmentStrategy || 'N/A',
            treatmentOwner: r.treatmentOwner || 'N/A',
            treatmentStatus: r.treatmentStatus || 'N/A',
            treatmentDueDate: r.treatmentDueDate ? new Date(r.treatmentDueDate).toISOString().split('T')[0] : 'N/A',
            isTreatmentOverdue,
            ageingDays,
          };
        });
        break;
      }

      // Criterion 9: Vendor Assessment Report
      case ReportType.VENDOR_ASSESSMENT: {
        const assessmentWhere: any = { organizationId };
        if (query.status) assessmentWhere.status = query.status;
        if (query.search) {
          assessmentWhere.OR = [
            { title: { contains: query.search, mode: 'insensitive' } },
            { vendor: { name: { contains: query.search, mode: 'insensitive' } } },
          ];
        }

        // Criticality filter goes to vendor
        const vendorFilter = query.criticality ? { criticality: query.criticality, deletedAt: null } : { deletedAt: null };

        const [count, assessments] = await Promise.all([
          this.prisma.vendorAssessment.count({
            where: { ...assessmentWhere, vendor: vendorFilter },
          }),
          this.prisma.vendorAssessment.findMany({
            where: { ...assessmentWhere, vendor: vendorFilter },
            include: {
              vendor: { select: { name: true, criticality: true } },
              actions: { select: { id: true, status: true } },
              questionnaireSubmissions: { select: { id: true, status: true } },
            },
            orderBy: validatedSortBy && ['createdAt', 'status', 'score'].includes(validatedSortBy)
              ? { [validatedSortBy]: sortDirection }
              : { createdAt: 'desc' },
            skip,
            take: limit,
          }),
        ]);

        total = count;
        rows = assessments.map((a) => {
          const openActionCount = (a.actions || []).filter(
            (act) => act.status !== 'CLOSED' && act.status !== 'VERIFIED',
          ).length;
          const submittedQuestionnaires = (a.questionnaireSubmissions || []).filter(
            (q) => q.status === 'SUBMITTED' || q.status === 'REVIEWED',
          ).length;

          return {
            id: a.id,
            vendorName: a.vendor?.name || 'N/A',
            vendorCriticality: a.vendor?.criticality || 'N/A',
            title: a.title,
            status: a.status,
            score: a.score ?? 'N/A',
            questionnaireCount: a.questionnaireSubmissions?.length || 0,
            submittedQuestionnaires,
            openActionCount,
            completedAt: a.completedAt ? new Date(a.completedAt).toISOString().split('T')[0] : 'N/A',
            createdAt: new Date(a.createdAt).toISOString().split('T')[0],
          };
        });
        break;
      }

      // Criterion 10: Vendor Review & Renewal Report
      case ReportType.VENDOR_REVIEW_RENEWAL: {
        const where: any = { organizationId, deletedAt: null };
        if (query.criticality) where.criticality = query.criticality;
        if (query.status) where.status = query.status;
        if (query.search) {
          where.OR = [
            { name: { contains: query.search, mode: 'insensitive' } },
            { category: { contains: query.search, mode: 'insensitive' } },
          ];
        }

        const vendors = await this.prisma.vendor.findMany({
          where,
          include: {
            assessments: {
              where: { status: { notIn: ['COMPLETED', 'CANCELLED'] as any } },
              select: { id: true },
            },
          },
          orderBy: { createdAt: 'desc' },
        });

        const now = new Date();
        const mapped = vendors.map((v) => {
          let nextReviewDate: Date;
          if (v.nextReviewDate) {
            nextReviewDate = new Date(v.nextReviewDate);
          } else {
            const base = v.lastReviewedAt ? new Date(v.lastReviewedAt) : new Date(v.createdAt);
            nextReviewDate = new Date(base);
            nextReviewDate.setDate(nextReviewDate.getDate() + (v.reviewCadenceDays || 365));
          }

          const isReviewOverdue = nextReviewDate < now;
          const daysUntilReview = Math.ceil((nextReviewDate.getTime() - now.getTime()) / 86400000);

          return {
            id: v.id,
            name: v.name,
            category: v.category || 'N/A',
            criticality: v.criticality,
            status: v.status,
            owner: v.owner,
            lastReviewedAt: v.lastReviewedAt ? new Date(v.lastReviewedAt).toISOString().split('T')[0] : 'N/A',
            nextReviewDate: nextReviewDate.toISOString().split('T')[0],
            isReviewOverdue,
            daysUntilReview,
            openAssessmentCount: v.assessments?.length || 0,
          };
        });

        const filtered = query.requiringReview ? mapped.filter((v) => v.isReviewOverdue) : mapped;
        total = filtered.length;
        rows = filtered.slice(skip, skip + limit);
        break;
      }

      // Criterion 11: Vulnerability Summary Report (grouped by severity)
      case ReportType.VULNERABILITY_SUMMARY: {
        const where: any = { organizationId, deletedAt: null };
        // Note: severity/status filters narrow which severities are shown (display all by default)

        // Use groupBy to aggregate counts at database level
        const allSeverities = [
          VulnerabilitySeverity.CRITICAL,
          VulnerabilitySeverity.HIGH,
          VulnerabilitySeverity.MEDIUM,
          VulnerabilitySeverity.LOW,
        ];

        const now = new Date();

        // Parallel queries for each status bucket
        const [bySeverityGroups, overdueGroups] = await Promise.all([
          // Group by severity × status to build the full matrix in one round-trip
          this.prisma.vulnerability.groupBy({
            by: ['severity', 'status'],
            where,
            _count: { id: true },
          }),
          // Overdue: dueDate < now AND not terminal
          this.prisma.vulnerability.groupBy({
            by: ['severity'],
            where: {
              ...where,
              dueDate: { lt: now },
              status: { notIn: [VulnerabilityStatus.RESOLVED, VulnerabilityStatus.RISK_ACCEPTED] },
            },
            _count: { id: true },
          }),
        ]);

        // Build lookup maps
        const overdueMap = new Map(overdueGroups.map((g) => [g.severity, g._count.id]));

        // Build one row per severity
        const severityRows = allSeverities.map((sev) => {
          const rowGroups = bySeverityGroups.filter((g) => g.severity === sev);
          const total = rowGroups.reduce((s, g) => s + g._count.id, 0);
          const openCount = rowGroups.filter((g) => g.status === VulnerabilityStatus.OPEN).reduce((s, g) => s + g._count.id, 0);
          const inRemediationCount = rowGroups.filter((g) => g.status === VulnerabilityStatus.IN_REMEDIATION).reduce((s, g) => s + g._count.id, 0);
          const resolvedCount = rowGroups.filter((g) => g.status === VulnerabilityStatus.RESOLVED).reduce((s, g) => s + g._count.id, 0);
          const riskAcceptedCount = rowGroups.filter((g) => g.status === VulnerabilityStatus.RISK_ACCEPTED).reduce((s, g) => s + g._count.id, 0);
          const overdueCount = overdueMap.get(sev) || 0;

          return { severity: sev, count: total, openCount, inRemediationCount, resolvedCount, riskAcceptedCount, overdueCount };
        });

        // Apply optional severity filter after aggregation
        const filtered = query.severity ? severityRows.filter((r) => r.severity === query.severity) : severityRows;
        total = filtered.length;
        rows = filtered.slice(skip, skip + limit);
        break;
      }

      // Criterion 12: Vulnerability SLA & Ageing Report
      case ReportType.VULNERABILITY_SLA_AGEING: {
        const where: any = { organizationId, deletedAt: null };
        if (query.severity) where.severity = query.severity;
        if (query.status) where.status = query.status;
        const now = new Date();
        if (query.overdue) {
          where.dueDate = { lt: now };
          where.status = { notIn: [VulnerabilityStatus.RESOLVED, VulnerabilityStatus.RISK_ACCEPTED] };
        }
        if (query.search) {
          where.OR = [
            { title: { contains: query.search, mode: 'insensitive' } },
            { cveId: { contains: query.search, mode: 'insensitive' } },
          ];
        }

        const [count, vulns] = await Promise.all([
          this.prisma.vulnerability.count({ where }),
          this.prisma.vulnerability.findMany({
            where,
            orderBy: validatedSortBy && ['createdAt', 'severity', 'dueDate'].includes(validatedSortBy)
              ? { [validatedSortBy]: sortDirection }
              : { dueDate: 'asc' },
            skip,
            take: limit,
          }),
        ]);

        total = count;
        rows = vulns.map((v) => {
          const ageingDays = Math.floor((now.getTime() - new Date(v.discoveredAt).getTime()) / 86400000);
          const isOverdue = Boolean(v.dueDate) &&
            new Date(v.dueDate!) < now &&
            v.status !== VulnerabilityStatus.RESOLVED &&
            v.status !== VulnerabilityStatus.RISK_ACCEPTED;

          return {
            id: v.id,
            title: v.title,
            cveId: v.cveId || 'N/A',
            severity: v.severity,
            status: v.status,
            remediationOwner: v.remediationOwner || 'N/A',
            discoveredAt: new Date(v.discoveredAt).toISOString().split('T')[0],
            dueDate: v.dueDate ? new Date(v.dueDate).toISOString().split('T')[0] : 'N/A',
            ageingDays,
            isOverdue,
          };
        });
        break;
      }

      // Criterion 13: Incident Summary Report (grouped by severity)
      case ReportType.INCIDENT_SUMMARY: {
        const baseWhere: any = { organizationId, deletedAt: null };

        const allSeverities = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];

        const groupedIncidents = await this.prisma.incident.groupBy({
          by: ['severity', 'status'],
          where: baseWhere,
          _count: { id: true },
        });

        const severityRows = allSeverities.map((sev) => {
          const rowGroups = groupedIncidents.filter((g) => g.severity === sev);
          const count = rowGroups.reduce((s, g) => s + g._count.id, 0);
          const openCount = rowGroups.filter((g) => g.status === 'OPEN').reduce((s, g) => s + g._count.id, 0);
          const inProgressCount = rowGroups.filter((g) => g.status === 'IN_PROGRESS').reduce((s, g) => s + g._count.id, 0);
          const containedCount = rowGroups.filter((g) => g.status === 'CONTAINED').reduce((s, g) => s + g._count.id, 0);
          const resolvedCount = rowGroups.filter((g) => g.status === 'RESOLVED').reduce((s, g) => s + g._count.id, 0);
          const closedCount = rowGroups.filter((g) => g.status === 'CLOSED').reduce((s, g) => s + g._count.id, 0);

          return { severity: sev, count, openCount, inProgressCount, containedCount, resolvedCount, closedCount };
        });

        const filtered = query.severity ? severityRows.filter((r) => r.severity === query.severity) : severityRows;
        total = filtered.length;
        rows = filtered.slice(skip, skip + limit);
        break;
      }

      // Criterion 14: Incident SLA & Ageing Report
      case ReportType.INCIDENT_SLA_AGEING: {
        const where: any = { organizationId, deletedAt: null };
        if (query.status) where.status = query.status;
        if (query.severity) where.severity = query.severity;
        const now = new Date();
        if (query.overdue) {
          where.dueDate = { lt: now };
          where.status = { notIn: ['RESOLVED', 'CLOSED'] };
        }
        if (query.search) {
          where.OR = [
            { title: { contains: query.search, mode: 'insensitive' } },
            { category: { contains: query.search, mode: 'insensitive' } },
            { owner: { contains: query.search, mode: 'insensitive' } },
          ];
        }

        const [count, incidents] = await Promise.all([
          this.prisma.incident.count({ where }),
          this.prisma.incident.findMany({
            where,
            orderBy: validatedSortBy && ['createdAt', 'severity', 'dueDate'].includes(validatedSortBy)
              ? { [validatedSortBy]: sortDirection }
              : { dueDate: 'asc' },
            skip,
            take: limit,
          }),
        ]);

        total = count;
        rows = incidents.map((i) => {
          const ageingDays = Math.floor((now.getTime() - new Date(i.detectedAt).getTime()) / 86400000);
          const isOverdue = Boolean(i.dueDate) &&
            new Date(i.dueDate!) < now &&
            i.status !== 'RESOLVED' &&
            i.status !== 'CLOSED';

          return {
            id: i.id,
            title: i.title,
            category: i.category || 'N/A',
            severity: i.severity,
            priority: i.priority || 'N/A',
            status: i.status,
            owner: i.owner,
            businessUnit: i.businessUnit || 'N/A',
            detectedAt: new Date(i.detectedAt).toISOString().split('T')[0],
            dueDate: i.dueDate ? new Date(i.dueDate).toISOString().split('T')[0] : 'N/A',
            ageingDays,
            isOverdue,
          };
        });
        break;
      }

      // Criterion 15: Incident RCA & Closure Report
      case ReportType.INCIDENT_RCA_CLOSURE: {
        const where: any = { organizationId, deletedAt: null };
        if (query.status) where.status = query.status;
        if (query.severity) where.severity = query.severity;
        if (query.search) {
          where.OR = [
            { title: { contains: query.search, mode: 'insensitive' } },
            { owner: { contains: query.search, mode: 'insensitive' } },
          ];
        }

        const [count, incidents] = await Promise.all([
          this.prisma.incident.count({ where }),
          this.prisma.incident.findMany({
            where,
            include: {
              actions: { select: { id: true, status: true, actionType: true } },
            },
            orderBy: validatedSortBy && ['createdAt', 'severity', 'status', 'resolvedAt'].includes(validatedSortBy)
              ? { [validatedSortBy]: sortDirection }
              : { resolvedAt: 'desc' },
            skip,
            take: limit,
          }),
        ]);

        total = count;
        rows = incidents.map((i) => {
          const allActions = i.actions || [];
          const correctiveActionCount = allActions.length;
          const openActionCount = allActions.filter(
            (a) => a.status !== 'CLOSED' && a.status !== 'VERIFIED',
          ).length;

          // rootCause field holds the investigation root cause text
          const rootCauseProvided = Boolean(i.rootCause && i.rootCause.trim().length > 0);
          // Truncate to 120 chars for the summary column
          const rootCauseSummary = rootCauseProvided
            ? i.rootCause!.length > 120 ? `${i.rootCause!.substring(0, 120)}…` : i.rootCause!
            : 'N/A';

          return {
            id: i.id,
            title: i.title,
            severity: i.severity,
            status: i.status,
            owner: i.owner,
            rootCauseProvided,
            rootCauseSummary,
            correctiveActionCount,
            openActionCount,
            resolvedAt: i.resolvedAt ? new Date(i.resolvedAt).toISOString().split('T')[0] : 'N/A',
            closedAt: i.status === 'CLOSED' ? new Date(i.updatedAt).toISOString().split('T')[0] : 'N/A',
            detectedAt: new Date(i.detectedAt).toISOString().split('T')[0],
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
        frameworkId: query.frameworkId || null,
        frameworkCode: query.frameworkCode || null,
        frameworkReferenceId: query.frameworkReferenceId || null,
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
