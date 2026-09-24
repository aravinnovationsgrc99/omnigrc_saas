import { Test, TestingModule } from '@nestjs/testing';
import { ReportsService } from './reports.service';
import { ReportsRegistry } from './reports.registry';
import { ExcelExportService } from './excel-export.service';
import { PrismaService } from '../prisma/prisma.service';
import { MetricsService } from '../metrics/metrics.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import {
  ReportType,
  ObligationCadence,
  VulnerabilitySeverity,
  VulnerabilityStatus,
  RiskScoreBand,
  AuditPlanStatus,
  Role,
} from '@omnigrc/shared';
import { NotFoundException } from '@nestjs/common';

describe('ReportsService', () => {
  let service: ReportsService;
  let registry: ReportsRegistry;
  let excelExportService: ExcelExportService;
  let prisma: jest.Mocked<any>;
  let metricsService: jest.Mocked<any>;
  let auditLogsService: jest.Mocked<any>;

  beforeEach(async () => {
    prisma = {
      vulnerability: {
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
      },
      asset: {
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
      },
      policy: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      vendor: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      complianceTask: {
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
      },
      auditPlan: {
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
      },
      risk: {
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    metricsService = {
      getOverviewMetrics: jest.fn().mockResolvedValue({
        timestamp: new Date().toISOString(),
        organizationId: 'org-a',
        assets: { total: 10, criticalityHighCount: 2, managedCount: 8, unmanagedCount: 2, byEnvironment: {}, byType: {} },
        vulnerabilities: { total: 5, openCount: 3, overdueCount: 1, resolvedCount: 1, riskAcceptedCount: 0, bySeverity: {} },
        policies: { total: 4, publishedCount: 3, overdueReviewCount: 0, byStatus: {} },
        vendors: { total: 2, requiringReviewCount: 0, assessmentsOverdueCount: 0, byCriticality: {}, byStatus: {} },
        obligations: { total: 6, upcomingCount: 2, overdueCount: 0, completedCount: 4, completionRate: 66.67 },
        audits: { totalPlans: 1, assessmentCount: 1, overallAuditScore: 92.5, findingsTotal: 2, findingsOpen: 1, findingsOverdue: 0, capaOpenCount: 0, byPlanStatus: {}, findingsBySeverity: {} },
        risks: { totalOpen: 3, byScoreBand: { HIGH: 1, MEDIUM: 1, LOW: 1 }, byStatus: {} },
      }),
    };

    auditLogsService = {
      log: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportsService,
        ReportsRegistry,
        ExcelExportService,
        { provide: PrismaService, useValue: prisma },
        { provide: MetricsService, useValue: metricsService },
        { provide: AuditLogsService, useValue: auditLogsService },
      ],
    }).compile();

    service = module.get<ReportsService>(ReportsService);
    registry = module.get<ReportsRegistry>(ReportsRegistry);
    excelExportService = module.get<ExcelExportService>(ExcelExportService);
  });

  it('should resolve all 8 known report definitions and reject unknown report types', () => {
    const definitions = service.getReportDefinitions();
    expect(definitions.length).toBe(8);

    expect(service.getReportDefinition(ReportType.EXECUTIVE_GRC_POSTURE)).toBeDefined();
    expect(service.getReportDefinition(ReportType.VULNERABILITY_REPORT)).toBeDefined();
    expect(service.getReportDefinition(ReportType.COMPLIANCE_OBLIGATION_REPORT)).toBeDefined();

    expect(() => service.getReportDefinition('unknown_type' as any)).toThrow(NotFoundException);
  });

  it('should consume Phase 13 MetricsService for Executive GRC Posture without duplicate DB queries', async () => {
    const authCtx = { userId: 'user-1', organizationId: 'org-a', role: Role.ADMIN };
    const report = await service.getReport(authCtx, ReportType.EXECUTIVE_GRC_POSTURE, {});

    expect(metricsService.getOverviewMetrics).toHaveBeenCalledWith(authCtx);
    expect(report.data.length).toBeGreaterThan(0);
    expect(report.data.find((r) => r.metricName === 'Total Assets')?.metricValue).toBe(10);
    expect(report.data.find((r) => r.metricName === 'Overall Audit Score')?.metricValue).toBe(92.5);
  });

  it('should enforce multi-tenant isolation and MSSP context by passing organizationId to Prisma queries', async () => {
    const authCtx = { userId: 'user-1', organizationId: 'client-a-id', role: Role.ADMIN };
    await service.getReport(authCtx, ReportType.VULNERABILITY_REPORT, {});

    expect(prisma.vulnerability.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organizationId: 'client-a-id' }),
      }),
    );
    expect(prisma.vulnerability.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organizationId: 'client-a-id' }),
      }),
    );
  });

  it('should enforce authoritative obligation task predicate (cadence != ONE_OFF OR obligationReference IS NOT NULL)', async () => {
    const authCtx = { userId: 'user-1', organizationId: 'org-a', role: Role.ADMIN };
    await service.getReport(authCtx, ReportType.COMPLIANCE_OBLIGATION_REPORT, {});

    expect(prisma.complianceTask.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: 'org-a',
          OR: [
            { cadence: { not: ObligationCadence.ONE_OFF } },
            { obligationReference: { not: null } },
          ],
        }),
      }),
    );
  });

  it('should use stored AuditAssessment.score for Business Audit Report without re-calculating scores', async () => {
    prisma.auditPlan.findMany.mockResolvedValue([
      {
        id: 'plan-1',
        title: 'ISO 27001 Audit',
        frameworkCode: 'ISO27001',
        status: AuditPlanStatus.IN_PROGRESS,
        ownerId: 'user-1',
        assessments: [
          {
            id: 'ass-1',
            score: 88.5,
            findings: [
              { status: 'OPEN', dueDate: null, capas: [{ status: 'OPEN' }] },
            ],
          },
        ],
      },
    ]);

    const authCtx = { userId: 'user-1', organizationId: 'org-a', role: Role.ADMIN };
    const report = await service.getReport(authCtx, ReportType.BUSINESS_AUDIT_REPORT, {});

    expect(report.data[0].latestAssessmentScore).toBe(88.5);
    expect(report.data[0].findingsOpen).toBe(1);
    expect(report.data[0].capaOpenCount).toBe(1);
  });

  it('should validate allowlisted sortBy fields and fallback to report default for arbitrary fields', () => {
    const validSort = registry.validateSortField(ReportType.VULNERABILITY_REPORT, 'severity');
    const invalidSort = registry.validateSortField(ReportType.VULNERABILITY_REPORT, 'malicious_sql_column');

    expect(validSort).toBe('severity');
    expect(invalidSort).toBe('createdAt'); // Fallback default
  });

  it('should apply smart formula injection protection to string cells starting with =, +, -, @ while keeping numbers/dates clean', () => {
    expect(excelExportService.sanitizeCell('=SUM(1,2)')).toBe("'=SUM(1,2)");
    expect(excelExportService.sanitizeCell('+12345')).toBe("'+12345");
    expect(excelExportService.sanitizeCell('-12345')).toBe("'-12345");
    expect(excelExportService.sanitizeCell('@CMD')).toBe("'@CMD");

    // Clean numbers and dates bypass string formula sanitization
    expect(excelExportService.sanitizeCell(100)).toBe(100);
    expect(excelExportService.sanitizeCell(-50)).toBe(-50);
    expect(excelExportService.sanitizeCell(true)).toBe('Yes');
  });

  it('should emit REPORT_EXPORTED audit entry on export download and zero audit logs on interactive report views', async () => {
    // Interactive View
    const authCtx = { userId: 'user-1', organizationId: 'org-a', role: Role.ADMIN };
    await service.getReport(authCtx, ReportType.ASSET_INVENTORY_REPORT, {});
    expect(auditLogsService.log).not.toHaveBeenCalled();

    // Export Download
    const exportResult = await service.exportReport(authCtx, ReportType.ASSET_INVENTORY_REPORT, { format: 'csv' });

    expect(exportResult.filename).toContain('asset_inventory_report');
    expect(exportResult.contentType).toBe('text/csv');
    expect(auditLogsService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org-a',
        actorId: 'user-1',
        action: 'REPORT_EXPORTED',
        entityType: 'Report',
        entityId: ReportType.ASSET_INVENTORY_REPORT,
        metadata: expect.objectContaining({ format: 'csv' }),
      }),
    );
  });
});
