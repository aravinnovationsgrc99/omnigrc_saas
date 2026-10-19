import { Test, TestingModule } from '@nestjs/testing';
import { ReportsService } from './reports.service';
import { ReportsRegistry } from './reports.registry';
import { ExcelExportService } from './excel-export.service';
import { PrismaService } from '../prisma/prisma.service';
import { MetricsService } from '../metrics/metrics.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { ResourceAuthorizationService } from '../auth/resource-authorization.service';
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
  let prisma: any;
  let metricsService: jest.Mocked<any>;
  let auditLogsService: jest.Mocked<any>;
  let resourceAuthService: jest.Mocked<any>;

  const authCtx = { userId: 'user-1', organizationId: 'org-test-id', role: Role.ADMIN };

  beforeEach(async () => {
    prisma = {
      vulnerability: {
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
        groupBy: jest.fn().mockResolvedValue([]),
      },
      asset: {
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
      },
      policy: {
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
      },
      vendor: {
        count: jest.fn().mockResolvedValue(0),
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
      auditFinding: {
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
      },
      risk: {
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
        groupBy: jest.fn().mockResolvedValue([]),
      },
      vendorAssessment: {
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
      },
      incident: {
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
        groupBy: jest.fn().mockResolvedValue([]),
      },
      organizationMembership: {
        count: jest.fn().mockResolvedValue(0),
      },
    };

    metricsService = {
      getOverviewMetrics: jest.fn().mockResolvedValue({
        timestamp: new Date().toISOString(),
        organizationId: 'org-test-id',
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

    resourceAuthService = {
      getScopeWhereClause: jest.fn().mockImplementation((ctx) => Promise.resolve({ organizationId: ctx.organizationId })),
      assertCanAccess: jest.fn().mockResolvedValue(true),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportsService,
        ReportsRegistry,
        ExcelExportService,
        { provide: PrismaService, useValue: prisma },
        { provide: MetricsService, useValue: metricsService },
        { provide: AuditLogsService, useValue: auditLogsService },
        { provide: ResourceAuthorizationService, useValue: resourceAuthService },
      ],
    }).compile();

    service = module.get<ReportsService>(ReportsService);
    registry = module.get<ReportsRegistry>(ReportsRegistry);
    excelExportService = module.get<ExcelExportService>(ExcelExportService);
  });

  describe('Registry & Report Catalogue Definitions', () => {
    it('should resolve all 23 report definitions and reject unknown report types', () => {
      const definitions = service.getReportDefinitions();
      expect(definitions.length).toBe(23);

      const allReportTypes = Object.values(ReportType);
      expect(allReportTypes.length).toBe(23);

      allReportTypes.forEach((type) => {
        const def = service.getReportDefinition(type);
        expect(def).toBeDefined();
        expect(def.id).toBe(type);
        expect(def.title).toBeTruthy();
        expect(def.columns.length).toBeGreaterThan(0);
        expect(def.exportFormats).toEqual(expect.arrayContaining(['csv', 'xlsx']));
      });

      expect(() => service.getReportDefinition('unknown_type' as any)).toThrow(NotFoundException);
    });
  });

  describe('Core Base Reports (8 Reports)', () => {
    it('should consume Phase 13 MetricsService for Executive GRC Posture without duplicate DB queries', async () => {
      const report = await service.getReport(authCtx, ReportType.EXECUTIVE_GRC_POSTURE, {});

      expect(metricsService.getOverviewMetrics).toHaveBeenCalledWith(authCtx);
      expect(report.data.length).toBeGreaterThan(0);
      expect(report.data.find((r) => r.metricName === 'Total Assets')?.metricValue).toBe(10);
      expect(report.data.find((r) => r.metricName === 'Overall Audit Score')?.metricValue).toBe(92.5);
    });

    it('should enforce multi-tenant isolation and MSSP context for Vulnerability Report', async () => {
      const pastDate = new Date(Date.now() - 5 * 86400000);
      prisma.vulnerability.count.mockResolvedValue(1);
      prisma.vulnerability.findMany.mockResolvedValue([
        {
          id: 'vuln-1',
          title: 'Remote Code Execution',
          cveId: 'CVE-2026-1234',
          severity: VulnerabilitySeverity.CRITICAL,
          status: VulnerabilityStatus.OPEN,
          remediationOwner: 'SecOps Team',
          dueDate: pastDate,
          discoveredAt: pastDate,
          affectedAssets: [{ id: 'asset-1' }, { id: 'asset-2' }],
        },
      ]);

      const report = await service.getReport(authCtx, ReportType.VULNERABILITY_REPORT, { overdue: true });

      expect(prisma.vulnerability.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ organizationId: 'org-test-id' }),
        }),
      );
      expect(prisma.vulnerability.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ organizationId: 'org-test-id' }),
        }),
      );
      expect(report.data[0].affectedAssetCount).toBe(2);
      expect(report.data[0].isOverdue).toBe(true);
    });

    it('should query and return Asset Inventory Report with tenant filter', async () => {
      prisma.asset.count.mockResolvedValue(1);
      prisma.asset.findMany.mockResolvedValue([
        {
          id: 'asset-1',
          name: 'Core DB Primary',
          type: 'DATA_STORE',
          environment: 'PRODUCTION',
          criticality: 'HIGH',
          isManaged: true,
          owner: 'DBA Team',
          vendorName: 'AWS',
          dataResidencyRegion: 'INDIA',
          createdAt: new Date('2026-01-01'),
        },
      ]);

      const report = await service.getReport(authCtx, ReportType.ASSET_INVENTORY_REPORT, {});

      expect(prisma.asset.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ organizationId: 'org-test-id' }),
        }),
      );
      expect(report.data[0].name).toBe('Core DB Primary');
      expect(report.data[0].vendorName).toBe('AWS');
    });

    it('should query Policy Governance Report and correctly flag overdue reviews', async () => {
      const pastReviewDate = new Date(Date.now() - 400 * 86400000);
      prisma.policy.count.mockResolvedValue(1);
      prisma.policy.findMany.mockResolvedValue([
        {
          id: 'pol-1',
          code: 'POL-SEC-01',
          title: 'Information Security Policy',
          category: 'SECURITY',
          status: 'PUBLISHED',
          reviewCadenceDays: 365,
          reviewDate: pastReviewDate,
          publishedVersion: { versionNumber: '1.0' },
          versions: [{ versionNumber: '1.0' }],
          createdAt: new Date('2025-01-01'),
        },
      ]);

      const report = await service.getReport(authCtx, ReportType.POLICY_GOVERNANCE_REPORT, {});

      expect(prisma.policy.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ organizationId: 'org-test-id', deletedAt: null }),
        }),
      );
      expect(report.data[0].isReviewOverdue).toBe(true);
      expect(report.data[0].publishedVersionNumber).toBe('1.0');
    });

    it('should query Vendor Risk Report and determine review overdue status', async () => {
      const pastReview = new Date(Date.now() - 400 * 86400000);
      prisma.vendor.count.mockResolvedValue(1);
      prisma.vendor.findMany.mockResolvedValue([
        {
          id: 'vendor-1',
          name: 'Cloudflare',
          category: 'INFRASTRUCTURE',
          criticality: 'HIGH',
          status: 'ACTIVE',
          owner: 'IT Ops',
          reviewCadenceDays: 180,
          lastReviewedAt: pastReview,
          createdAt: new Date('2025-01-01'),
          assessments: [],
        },
      ]);

      const report = await service.getReport(authCtx, ReportType.VENDOR_RISK_REPORT, {});

      expect(prisma.vendor.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ organizationId: 'org-test-id', deletedAt: null }),
        }),
      );
      expect(report.data[0].isReviewRequired).toBe(true);
      expect(report.data[0].name).toBe('Cloudflare');
    });

    it('should enforce authoritative obligation task predicate in Compliance Obligation Report', async () => {
      await service.getReport(authCtx, ReportType.COMPLIANCE_OBLIGATION_REPORT, {});

      expect(prisma.complianceTask.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: 'org-test-id',
            OR: [
              { cadence: { not: ObligationCadence.ONE_OFF } },
              { obligationReference: { not: null } },
            ],
          }),
        }),
      );
    });

    it('should use stored AuditAssessment.score for Business Audit Report without re-calculating scores', async () => {
      prisma.auditPlan.count.mockResolvedValue(1);
      prisma.auditPlan.findMany.mockResolvedValue([
        {
          id: 'plan-1',
          title: 'ISO 27001 Audit',
          frameworkCode: 'ISO27001',
          status: AuditPlanStatus.IN_PROGRESS,
          ownerId: 'user-1',
          createdAt: new Date('2026-01-01'),
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

      const report = await service.getReport(authCtx, ReportType.BUSINESS_AUDIT_REPORT, {});

      expect(prisma.auditPlan.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ organizationId: 'org-test-id' }),
        }),
      );
      expect(report.data[0].latestAssessmentScore).toBe(88.5);
      expect(report.data[0].findingsOpen).toBe(1);
      expect(report.data[0].capaOpenCount).toBe(1);
    });

    it('should calculate Risk Score Bands in Risk Register Report', async () => {
      prisma.risk.count.mockResolvedValue(2);
      prisma.risk.findMany.mockResolvedValue([
        {
          id: 'risk-1',
          title: 'Data Loss',
          category: 'SECURITY',
          status: 'OPEN',
          likelihood: 5,
          impact: 4,
          score: 20,
          residualScore: 10,
          treatmentStrategy: 'MITIGATE',
          owner: 'CISO',
          createdAt: new Date('2026-01-01'),
        },
        {
          id: 'risk-2',
          title: 'Minor Outage',
          category: 'OPERATIONAL',
          status: 'OPEN',
          likelihood: 2,
          impact: 2,
          score: 4,
          residualScore: null,
          treatmentStrategy: 'ACCEPT',
          owner: 'Ops',
          createdAt: new Date('2026-01-01'),
        },
      ]);

      const report = await service.getReport(authCtx, ReportType.RISK_REGISTER_REPORT, {});

      expect(prisma.risk.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ organizationId: 'org-test-id', deletedAt: null }),
        }),
      );
      expect(report.data[0].scoreBand).toBe(RiskScoreBand.HIGH);
      expect(report.data[1].scoreBand).toBe(RiskScoreBand.LOW);
    });
  });

  describe('Phase 4B - Audit Management Reports (Criteria 1-3)', () => {
    it('AUDIT_STATUS_SUMMARY: should enforce tenant isolation, calculate assessment states and latest score', async () => {
      prisma.auditPlan.count.mockResolvedValue(1);
      prisma.auditPlan.findMany.mockResolvedValue([
        {
          id: 'plan-10',
          title: 'SOC 2 Type II Plan',
          frameworkRef: { code: 'SOC2' },
          status: 'IN_PROGRESS',
          ownerId: 'auditor-1',
          plannedStartDate: new Date('2026-02-01'),
          plannedEndDate: new Date('2026-04-30'),
          assessments: [
            {
              status: 'COMPLETED',
              score: 95.0,
              findings: [
                { id: 'f-1', status: 'CLOSED', dueDate: null },
                { id: 'f-2', status: 'OPEN', dueDate: new Date() },
              ],
            },
            {
              status: 'IN_PROGRESS',
              score: 80.0,
              findings: [
                { id: 'f-3', status: 'UNDER_REVIEW', dueDate: null },
              ],
            },
          ],
        },
      ]);

      const report = await service.getReport(authCtx, ReportType.AUDIT_STATUS_SUMMARY, {});

      expect(prisma.auditPlan.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ organizationId: 'org-test-id' }),
        }),
      );
      const row = report.data[0];
      expect(row.frameworkCode).toBe('SOC2');
      expect(row.assessmentCount).toBe(2);
      expect(row.completedAssessments).toBe(1);
      expect(row.inProgressAssessments).toBe(1);
      expect(row.findingsTotal).toBe(3);
      expect(row.findingsOpen).toBe(2); // f-2 and f-3 are open
      expect(row.latestScore).toBe(95.0);
    });

    it('AUDIT_FINDINGS: should calculate ageing days, overdue status, and capa count', async () => {
      const tenDaysAgo = new Date(Date.now() - 10 * 86400000);
      const threeDaysAgo = new Date(Date.now() - 3 * 86400000);

      prisma.auditFinding.count.mockResolvedValue(1);
      prisma.auditFinding.findMany.mockResolvedValue([
        {
          id: 'find-1',
          title: 'Unencrypted S3 Bucket',
          severity: 'HIGH',
          status: 'OPEN',
          ownerId: 'devops-lead',
          dueDate: threeDaysAgo,
          createdAt: tenDaysAgo,
          assessment: { auditPlan: { title: 'Cloud Infrastructure Audit' } },
          capas: [{ id: 'capa-1' }, { id: 'capa-2' }],
        },
      ]);

      const report = await service.getReport(authCtx, ReportType.AUDIT_FINDINGS, { overdue: true });

      expect(prisma.auditFinding.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ organizationId: 'org-test-id' }),
        }),
      );
      const row = report.data[0];
      expect(row.auditPlanTitle).toBe('Cloud Infrastructure Audit');
      expect(row.ageingDays).toBeGreaterThanOrEqual(9);
      expect(row.isOverdue).toBe(true);
      expect(row.capaCount).toBe(2);
    });

    it('AUDIT_COMPLIANCE_CLOSURE: should calculate open vs closed CAPAs and closure dates', async () => {
      const closedDate = new Date('2026-03-01T12:00:00Z');
      prisma.auditFinding.count.mockResolvedValue(1);
      prisma.auditFinding.findMany.mockResolvedValue([
        {
          id: 'find-closed',
          title: 'Weak Password Policy',
          severity: 'MEDIUM',
          status: 'CLOSED',
          ownerId: 'it-sec',
          dueDate: new Date('2026-02-15'),
          createdAt: new Date('2026-01-01'),
          verifiedAt: closedDate,
          updatedAt: closedDate,
          assessment: { auditPlan: { title: 'Q1 Internal Audit' } },
          capas: [
            { id: 'capa-1', status: 'CLOSED' },
            { id: 'capa-2', status: 'VERIFIED' },
            { id: 'capa-3', status: 'OPEN' },
          ],
        },
      ]);

      const report = await service.getReport(authCtx, ReportType.AUDIT_COMPLIANCE_CLOSURE, {});

      expect(prisma.auditFinding.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ organizationId: 'org-test-id' }),
        }),
      );
      const row = report.data[0];
      expect(row.openCapaCount).toBe(1);
      expect(row.closedCapaCount).toBe(2);
      expect(row.closedAt).toBe('2026-03-01');
      expect(row.isOverdue).toBe(false);
    });
  });

  describe('Phase 4B - Policy Management Reports (Criteria 4-6)', () => {
    it('POLICY_STATUS: should return policy status, draft vs published version metadata', async () => {
      prisma.policy.count.mockResolvedValue(1);
      prisma.policy.findMany.mockResolvedValue([
        {
          id: 'pol-status-1',
          code: 'POL-ACCESS-01',
          title: 'Access Control Policy',
          category: 'IAM',
          status: 'DRAFT',
          createdAt: new Date('2026-01-10'),
          publishedVersion: null,
          versions: [{ versionNumber: '0.2' }],
        },
      ]);

      const report = await service.getReport(authCtx, ReportType.POLICY_STATUS, {});

      expect(prisma.policy.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ organizationId: 'org-test-id', deletedAt: null }),
        }),
      );
      const row = report.data[0];
      expect(row.currentVersionNumber).toBe('0.2');
      expect(row.publishedVersionNumber).toBe('N/A');
    });

    it('POLICY_REVIEW_EXPIRY: should compute next review date, days until review, and overdueReview filter', async () => {
      const pastReview = new Date(Date.now() - 400 * 86400000);
      prisma.policy.findMany.mockResolvedValue([
        {
          id: 'pol-exp-1',
          code: 'POL-BCP-01',
          title: 'Disaster Recovery Plan',
          status: 'PUBLISHED',
          reviewCadenceDays: 365,
          reviewDate: pastReview,
          createdAt: new Date('2024-01-01'),
        },
      ]);

      const report = await service.getReport(authCtx, ReportType.POLICY_REVIEW_EXPIRY, { overdueReview: true });

      expect(prisma.policy.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ organizationId: 'org-test-id', deletedAt: null }),
        }),
      );
      expect(report.data.length).toBe(1);
      expect(report.data[0].isReviewOverdue).toBe(true);
      expect(report.data[0].daysUntilNextReview).toBeLessThan(0);
    });

    it('POLICY_ACKNOWLEDGEMENT: should enforce zero-denominator safety and compute completion rates accurately', async () => {
      // Case 1: Zero org members (safe division test - no NaN)
      prisma.organizationMembership.count.mockResolvedValue(0);
      prisma.policy.findMany.mockResolvedValue([
        {
          id: 'pol-ack-1',
          code: 'POL-CODE-01',
          title: 'Code of Conduct',
          status: 'PUBLISHED',
          publishedVersion: {
            versionNumber: '1.0',
            attestations: [],
          },
        },
      ]);

      const reportZero = await service.getReport(authCtx, ReportType.POLICY_ACKNOWLEDGEMENT, {});
      expect(reportZero.data[0].acknowledgementRate).toBe(0);
      expect(reportZero.data[0].pendingCount).toBe(0);
      expect(Number.isNaN(reportZero.data[0].acknowledgementRate)).toBe(false);

      // Case 2: 10 org members, 7 attestations => 70.0% completion rate
      prisma.organizationMembership.count.mockResolvedValue(10);
      prisma.policy.findMany.mockResolvedValue([
        {
          id: 'pol-ack-2',
          code: 'POL-CODE-01',
          title: 'Code of Conduct',
          status: 'PUBLISHED',
          publishedVersion: {
            versionNumber: '1.0',
            attestations: new Array(7).fill({ userId: 'u' }),
          },
        },
      ]);

      const reportTen = await service.getReport(authCtx, ReportType.POLICY_ACKNOWLEDGEMENT, {});
      expect(reportTen.data[0].totalOrgMembers).toBe(10);
      expect(reportTen.data[0].acknowledgedCount).toBe(7);
      expect(reportTen.data[0].pendingCount).toBe(3);
      expect(reportTen.data[0].acknowledgementRate).toBe(70);
    });
  });

  describe('Phase 4B - Risk Management Reports (Criteria 7-8)', () => {
    it('RISK_HEATMAP: should aggregate risk matrix distribution via DB-level groupBy and sort by combined score desc', async () => {
      prisma.risk.groupBy.mockResolvedValue([
        { likelihood: 4, impact: 4, _count: { id: 3 } }, // score = 16 -> HIGH
        { likelihood: 3, impact: 3, _count: { id: 5 } }, // score = 9 -> MEDIUM
        { likelihood: 1, impact: 2, _count: { id: 2 } }, // score = 2 -> LOW
      ]);

      const report = await service.getReport(authCtx, ReportType.RISK_HEATMAP, {});

      expect(prisma.risk.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          by: ['likelihood', 'impact'],
          where: expect.objectContaining({ organizationId: 'org-test-id', deletedAt: null }),
        }),
      );
      expect(report.data.length).toBe(3);
      expect(report.data[0].scoreBand).toBe(RiskScoreBand.HIGH);
      expect(report.data[0].count).toBe(3);
      expect(report.data[1].scoreBand).toBe(RiskScoreBand.MEDIUM);
      expect(report.data[2].scoreBand).toBe(RiskScoreBand.LOW);
    });

    it('RISK_TREATMENT_AGEING: should compute ageing days, treatment overdue flag, and residual scores', async () => {
      const pastTreatmentDate = new Date(Date.now() - 5 * 86400000);
      const pastCreatedDate = new Date(Date.now() - 30 * 86400000);

      prisma.risk.count.mockResolvedValue(1);
      prisma.risk.findMany.mockResolvedValue([
        {
          id: 'risk-treat-1',
          title: 'Unpatched Gateway',
          owner: 'Network Admin',
          score: 16,
          residualScore: 8,
          treatmentStrategy: 'MITIGATE',
          treatmentOwner: 'SysAdmin Team',
          treatmentStatus: 'IN_PROGRESS',
          treatmentDueDate: pastTreatmentDate,
          createdAt: pastCreatedDate,
        },
      ]);

      const report = await service.getReport(authCtx, ReportType.RISK_TREATMENT_AGEING, { overdue: true });

      expect(prisma.risk.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: 'org-test-id',
            treatmentDueDate: expect.any(Object),
          }),
        }),
      );
      const row = report.data[0];
      expect(row.scoreBand).toBe(RiskScoreBand.HIGH);
      expect(row.residualScore).toBe(8);
      expect(row.isTreatmentOverdue).toBe(true);
      expect(row.ageingDays).toBeGreaterThanOrEqual(29);
    });
  });

  describe('Phase 4B - Vendor Management Reports (Criteria 9-10)', () => {
    it('VENDOR_ASSESSMENT: should report assessment status, questionnaire completion, and action counts', async () => {
      prisma.vendorAssessment.count.mockResolvedValue(1);
      prisma.vendorAssessment.findMany.mockResolvedValue([
        {
          id: 'va-1',
          title: 'Annual Security Review',
          status: 'IN_REVIEW',
          score: 78.5,
          completedAt: null,
          createdAt: new Date('2026-02-01'),
          vendor: { name: 'Datadog', criticality: 'HIGH' },
          actions: [
            { id: 'act-1', status: 'OPEN' },
            { id: 'act-2', status: 'CLOSED' },
          ],
          questionnaireSubmissions: [
            { id: 'qs-1', status: 'SUBMITTED' },
            { id: 'qs-2', status: 'DRAFT' },
          ],
        },
      ]);

      const report = await service.getReport(authCtx, ReportType.VENDOR_ASSESSMENT, {});

      expect(prisma.vendorAssessment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ organizationId: 'org-test-id' }),
        }),
      );
      const row = report.data[0];
      expect(row.vendorName).toBe('Datadog');
      expect(row.vendorCriticality).toBe('HIGH');
      expect(row.questionnaireCount).toBe(2);
      expect(row.submittedQuestionnaires).toBe(1);
      expect(row.openActionCount).toBe(1);
      expect(row.score).toBe(78.5);
    });

    it('VENDOR_REVIEW_RENEWAL: should compute next review date, days until review, and requiringReview filter', async () => {
      const pastReview = new Date(Date.now() - 400 * 86400000);
      prisma.vendor.findMany.mockResolvedValue([
        {
          id: 'v-renewal-1',
          name: 'Okta Identity',
          category: 'SECURITY',
          criticality: 'CRITICAL',
          status: 'ACTIVE',
          owner: 'IAM Lead',
          reviewCadenceDays: 365,
          lastReviewedAt: pastReview,
          nextReviewDate: null,
          createdAt: new Date('2024-01-01'),
          assessments: [{ id: 'ass-pending' }],
        },
      ]);

      const report = await service.getReport(authCtx, ReportType.VENDOR_REVIEW_RENEWAL, { requiringReview: true });

      expect(prisma.vendor.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ organizationId: 'org-test-id', deletedAt: null }),
        }),
      );
      expect(report.data.length).toBe(1);
      const row = report.data[0];
      expect(row.isReviewOverdue).toBe(true);
      expect(row.openAssessmentCount).toBe(1);
    });
  });

  describe('Phase 4B - Vulnerability Management Reports (Criteria 11-12)', () => {
    it('VULNERABILITY_SUMMARY: should return aggregated severity matrix with zero-denominator safety', async () => {
      prisma.vulnerability.groupBy
        .mockResolvedValueOnce([
          { severity: VulnerabilitySeverity.CRITICAL, status: VulnerabilityStatus.OPEN, _count: { id: 4 } },
          { severity: VulnerabilitySeverity.CRITICAL, status: VulnerabilityStatus.RESOLVED, _count: { id: 2 } },
          { severity: VulnerabilitySeverity.HIGH, status: VulnerabilityStatus.OPEN, _count: { id: 3 } },
        ])
        .mockResolvedValueOnce([
          { severity: VulnerabilitySeverity.CRITICAL, _count: { id: 1 } },
        ]);

      const report = await service.getReport(authCtx, ReportType.VULNERABILITY_SUMMARY, {});

      expect(report.data.length).toBe(4); // CRITICAL, HIGH, MEDIUM, LOW
      const criticalRow = report.data.find((r) => r.severity === VulnerabilitySeverity.CRITICAL);
      expect(criticalRow?.count).toBe(6);
      expect(criticalRow?.openCount).toBe(4);
      expect(criticalRow?.resolvedCount).toBe(2);
      expect(criticalRow?.overdueCount).toBe(1);

      // MEDIUM has 0 entries in DB -> zero-safe row
      const mediumRow = report.data.find((r) => r.severity === VulnerabilitySeverity.MEDIUM);
      expect(mediumRow?.count).toBe(0);
      expect(mediumRow?.openCount).toBe(0);
      expect(mediumRow?.overdueCount).toBe(0);
    });

    it('VULNERABILITY_SLA_AGEING: should calculate ageing days from discoveredAt and SLA overdue breach', async () => {
      const discoveredDate = new Date(Date.now() - 15 * 86400000);
      const dueDate = new Date(Date.now() - 2 * 86400000);

      prisma.vulnerability.count.mockResolvedValue(1);
      prisma.vulnerability.findMany.mockResolvedValue([
        {
          id: 'v-sla-1',
          title: 'SQL Injection in Auth Service',
          cveId: 'CVE-2026-9999',
          severity: VulnerabilitySeverity.CRITICAL,
          status: VulnerabilityStatus.OPEN,
          remediationOwner: 'Backend Team',
          discoveredAt: discoveredDate,
          dueDate: dueDate,
        },
      ]);

      const report = await service.getReport(authCtx, ReportType.VULNERABILITY_SLA_AGEING, { overdue: true });

      expect(prisma.vulnerability.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ organizationId: 'org-test-id', deletedAt: null }),
        }),
      );
      const row = report.data[0];
      expect(row.ageingDays).toBeGreaterThanOrEqual(14);
      expect(row.isOverdue).toBe(true);
    });
  });

  describe('Phase 4B - Incident Management Reports (Criteria 13-15)', () => {
    it('INCIDENT_SUMMARY: should group incidents by severity and count status breakdown safely', async () => {
      prisma.incident.groupBy.mockResolvedValue([
        { severity: 'CRITICAL', status: 'OPEN', _count: { id: 2 } },
        { severity: 'CRITICAL', status: 'RESOLVED', _count: { id: 1 } },
        { severity: 'HIGH', status: 'IN_PROGRESS', _count: { id: 3 } },
      ]);

      const report = await service.getReport(authCtx, ReportType.INCIDENT_SUMMARY, {});

      expect(prisma.incident.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          by: ['severity', 'status'],
          where: expect.objectContaining({ organizationId: 'org-test-id', deletedAt: null }),
        }),
      );
      expect(report.data.length).toBe(4); // CRITICAL, HIGH, MEDIUM, LOW
      const crit = report.data.find((r) => r.severity === 'CRITICAL');
      expect(crit?.count).toBe(3);
      expect(crit?.openCount).toBe(2);
      expect(crit?.resolvedCount).toBe(1);

      const low = report.data.find((r) => r.severity === 'LOW');
      expect(low?.count).toBe(0);
      expect(low?.openCount).toBe(0);
    });

    it('INCIDENT_SLA_AGEING: should compute ageing days from detectedAt and flag overdue incidents', async () => {
      const detectedDate = new Date(Date.now() - 8 * 86400000);
      const dueDate = new Date(Date.now() - 1 * 86400000);

      prisma.incident.count.mockResolvedValue(1);
      prisma.incident.findMany.mockResolvedValue([
        {
          id: 'inc-1',
          title: 'DDoS on Public Gateway',
          category: 'SECURITY',
          severity: 'HIGH',
          priority: 'P1',
          status: 'IN_PROGRESS',
          owner: 'SOC Lead',
          businessUnit: 'Engineering',
          detectedAt: detectedDate,
          dueDate: dueDate,
        },
      ]);

      const report = await service.getReport(authCtx, ReportType.INCIDENT_SLA_AGEING, { overdue: true });

      expect(prisma.incident.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ organizationId: 'org-test-id', deletedAt: null }),
        }),
      );
      const row = report.data[0];
      expect(row.ageingDays).toBeGreaterThanOrEqual(7);
      expect(row.isOverdue).toBe(true);
    });

    it('INCIDENT_RCA_CLOSURE: should truncate root cause to 120 chars and tally corrective actions', async () => {
      const longRootCause = 'A'.repeat(200);
      prisma.incident.count.mockResolvedValue(1);
      prisma.incident.findMany.mockResolvedValue([
        {
          id: 'inc-rca-1',
          title: 'Payment Gateway Timeout',
          severity: 'HIGH',
          status: 'CLOSED',
          owner: 'Payments Team',
          rootCause: longRootCause,
          resolvedAt: new Date('2026-03-01'),
          updatedAt: new Date('2026-03-02'),
          detectedAt: new Date('2026-02-28'),
          actions: [
            { id: 'act-1', status: 'CLOSED', actionType: 'CORRECTIVE' },
            { id: 'act-2', status: 'OPEN', actionType: 'PREVENTIVE' },
          ],
        },
      ]);

      const report = await service.getReport(authCtx, ReportType.INCIDENT_RCA_CLOSURE, {});

      expect(prisma.incident.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ organizationId: 'org-test-id', deletedAt: null }),
        }),
      );
      const row = report.data[0];
      expect(row.rootCauseProvided).toBe(true);
      expect(row.rootCauseSummary.length).toBe(121); // 120 chars + ellipsis
      expect(row.correctiveActionCount).toBe(2);
      expect(row.openActionCount).toBe(1);
      expect(row.closedAt).toBe('2026-03-02');
    });
  });

  describe('Universal Zero-Denominator Safety & Empty Dataset Resilience', () => {
    it('should return valid zero structures for all 23 reports on completely empty database tables', async () => {
      const allTypes = Object.values(ReportType);

      for (const reportType of allTypes) {
        const result = await service.getReport(authCtx, reportType, {});
        expect(result).toBeDefined();
        expect(result.reportType).toBe(reportType);
        expect(result.organizationId).toBe('org-test-id');
        expect(Array.isArray(result.data)).toBe(true);

        // Verify zero NaN or crash values in every field of generated rows
        for (const row of result.data) {
          for (const [key, value] of Object.entries(row)) {
            expect(Number.isNaN(value)).toBe(false);
            expect(value).not.toBeUndefined();
          }
        }
      }
    });
  });

  describe('Universal Export Compatibility (Excel .xlsx & CSV)', () => {
    it('should cleanly export all 23 reports to both XLSX and CSV formats without undefined column errors', async () => {
      const allTypes = Object.values(ReportType);

      for (const reportType of allTypes) {
        // Test CSV export
        const csvExport = await service.exportReport(authCtx, reportType, { format: 'csv' });
        expect(csvExport.buffer).toBeInstanceOf(Buffer);
        expect(csvExport.buffer.length).toBeGreaterThan(0);
        expect(csvExport.filename).toContain(`${reportType}_`);
        expect(csvExport.filename.endsWith('.csv')).toBe(true);
        expect(csvExport.contentType).toBe('text/csv');

        // Test Excel (.xlsx) export
        const xlsxExport = await service.exportReport(authCtx, reportType, { format: 'xlsx' });
        expect(xlsxExport.buffer).toBeInstanceOf(Buffer);
        expect(xlsxExport.buffer.length).toBeGreaterThan(0);
        expect(xlsxExport.filename).toContain(`${reportType}_`);
        expect(xlsxExport.filename.endsWith('.xlsx')).toBe(true);
        expect(xlsxExport.contentType).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      }

      // Verify that audit logs recorded all 46 export invocations (23 reports * 2 formats)
      expect(auditLogsService.log).toHaveBeenCalledTimes(46);
    });
  });

  describe('Security & Utility Hardening', () => {
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

      // Clean numbers, booleans, and dates bypass string formula sanitization
      expect(excelExportService.sanitizeCell(100)).toBe(100);
      expect(excelExportService.sanitizeCell(-50)).toBe(-50);
      expect(excelExportService.sanitizeCell(true)).toBe('Yes');
      expect(excelExportService.sanitizeCell(false)).toBe('No');
    }, 30000);

    it('should emit REPORT_EXPORTED audit entry on export download and zero audit logs on interactive report views', async () => {
      // Interactive View
      await service.getReport(authCtx, ReportType.ASSET_INVENTORY_REPORT, {});
      expect(auditLogsService.log).not.toHaveBeenCalled();

      // Export Download
      const exportResult = await service.exportReport(authCtx, ReportType.ASSET_INVENTORY_REPORT, { format: 'csv' });

      expect(exportResult.filename).toContain('asset_inventory_report');
      expect(exportResult.contentType).toBe('text/csv');
      expect(auditLogsService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: 'org-test-id',
          actorId: 'user-1',
          action: 'REPORT_EXPORTED',
          entityType: 'Report',
          entityId: ReportType.ASSET_INVENTORY_REPORT,
          metadata: expect.objectContaining({ format: 'csv' }),
        }),
      );
    });
  });
});
