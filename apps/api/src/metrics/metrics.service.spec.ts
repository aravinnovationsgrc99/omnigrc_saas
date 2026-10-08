import { Test, TestingModule } from '@nestjs/testing';
import { MetricsService } from './metrics.service';
import { PrismaService } from '../prisma/prisma.service';
import { ResourceAuthorizationService } from '../auth/resource-authorization.service';
import { FrameworkEntitlementsService } from '../frameworks/framework-entitlements.service';
import { FrameworkCoverageService } from '../frameworks/framework-coverage.service';
import { Role } from '@omnigrc/shared';

describe('MetricsService', () => {
  let service: MetricsService;
  let prisma: jest.Mocked<any>;

  beforeEach(async () => {
    prisma = {
      asset: {
        count: jest.fn().mockResolvedValue(0),
        groupBy: jest.fn().mockResolvedValue([]),
      },
      vulnerability: {
        count: jest.fn().mockResolvedValue(0),
        groupBy: jest.fn().mockResolvedValue([]),
        findMany: jest.fn().mockResolvedValue([]),
      },
      policy: {
        count: jest.fn().mockResolvedValue(0),
        groupBy: jest.fn().mockResolvedValue([]),
        findMany: jest.fn().mockResolvedValue([]),
      },
      vendor: {
        count: jest.fn().mockResolvedValue(0),
        groupBy: jest.fn().mockResolvedValue([]),
      },
      vendorAssessment: {
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
      },
      complianceTask: {
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
      },
      auditPlan: {
        count: jest.fn().mockResolvedValue(0),
        groupBy: jest.fn().mockResolvedValue([]),
      },
      auditAssessment: {
        count: jest.fn().mockResolvedValue(0),
        aggregate: jest.fn().mockResolvedValue({ _avg: { score: 85.5 } }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      policyException: {
        count: jest.fn().mockResolvedValue(0),
      },
      auditFinding: {
        count: jest.fn().mockResolvedValue(0),
        groupBy: jest.fn().mockResolvedValue([]),
        findMany: jest.fn().mockResolvedValue([]),
      },
      auditCapa: {
        count: jest.fn().mockResolvedValue(0),
        groupBy: jest.fn().mockResolvedValue([]),
        findMany: jest.fn().mockResolvedValue([]),
      },
      risk: {
        count: jest.fn().mockResolvedValue(0),
        groupBy: jest.fn().mockResolvedValue([]),
        findMany: jest.fn().mockResolvedValue([]),
      },
      framework: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MetricsService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: ResourceAuthorizationService,
          useValue: {
            getScopeWhereClause: jest.fn().mockImplementation(async (authCtx) => ({ organizationId: authCtx.organizationId })),
          },
        },
        {
          provide: FrameworkEntitlementsService,
          useValue: {
            getEntitledFrameworkIds: jest.fn().mockResolvedValue([]),
          },
        },
        {
          provide: FrameworkCoverageService,
          useValue: {
            calculateCoverage: jest.fn().mockResolvedValue({
              summary: { totalReferences: 0, covered: 0, partial: 0, notCovered: 0, coveragePercentage: 0 },
            }),
          },
        },
      ],
    }).compile();

    service = module.get<MetricsService>(MetricsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should return authoritative overview metrics safely for zero/empty datasets', async () => {
    const authCtx = { userId: 'user-1', organizationId: 'org-1', role: Role.ADMIN };
    const result = await service.getOverviewMetrics(authCtx);

    expect(result.organizationId).toBe('org-1');
    expect(result.assets.total).toBe(0);
    expect(result.assets.criticalityHighCount).toBe(0);
    expect(result.vulnerabilities.total).toBe(0);
    expect(result.policies.total).toBe(0);
    expect(result.vendors.total).toBe(0);
    expect(result.obligations.total).toBe(0);
    expect(result.audits.overallAuditScore).toBe(86);
    expect(result.risks.totalOpen).toBe(0);
    expect(result.attentionRequired).toEqual([]);
  });

  it('should collect and bound attentionRequired items across all 6 domains', async () => {
    prisma.vulnerability.findMany.mockResolvedValueOnce([{ id: 'v1', title: 'Vuln 1', severity: 'HIGH', dueDate: new Date() }]);
    prisma.complianceTask.findMany.mockResolvedValueOnce([{ id: 't1', title: 'Task 1', dueDate: new Date() }]);
    prisma.auditFinding.findMany.mockResolvedValueOnce([{ id: 'f1', title: 'Finding 1', severity: 'CRITICAL', dueDate: new Date() }]);
    prisma.auditCapa.findMany.mockResolvedValueOnce([{ id: 'c1', title: 'CAPA 1', dueDate: new Date() }]);
    prisma.policy.findMany.mockResolvedValueOnce([{ id: 'p1', title: 'Policy 1', reviewDate: new Date() }]);
    prisma.vendorAssessment.findMany.mockResolvedValueOnce([{ id: 'va1', vendor: { name: 'Vendor 1' }, title: 'Assessment 1', status: 'OVERDUE', createdAt: new Date() }]);

    const authCtx = { userId: 'user-1', organizationId: 'org-1', role: Role.ADMIN };
    const result = await service.getOverviewMetrics(authCtx);

    expect(result.attentionRequired).toHaveLength(6);
    expect(result.attentionRequired?.map((i) => i.domain)).toEqual([
      'VULNERABILITY',
      'OBLIGATION',
      'AUDIT_FINDING',
      'CAPA',
      'POLICY',
      'VENDOR',
    ]);
  });

  it('should enforce multi-tenant isolation by passing organizationId to every database query', async () => {
    const authCtx = { userId: 'user-1', organizationId: 'org-tenant-a', role: Role.ADMIN };
    await service.getOverviewMetrics(authCtx);

    expect(prisma.asset.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organizationId: 'org-tenant-a' }),
      }),
    );
    expect(prisma.vulnerability.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organizationId: 'org-tenant-a' }),
      }),
    );
    expect(prisma.complianceTask.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organizationId: 'org-tenant-a' }),
      }),
    );
    expect(prisma.risk.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organizationId: 'org-tenant-a' }),
      }),
    );
    expect(prisma.vulnerability.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organizationId: 'org-tenant-a' }),
      }),
    );
  });

  it('should isolate MSSP client contexts when switching targets', async () => {
    const authCtxA = { userId: 'user-1', organizationId: 'client-tenant-a', role: Role.ADMIN };
    await service.getOverviewMetrics(authCtxA);
    expect(prisma.asset.count).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ organizationId: 'client-tenant-a' }) }),
    );

    jest.clearAllMocks();

    const authCtxB = { userId: 'user-1', organizationId: 'client-tenant-b', role: Role.ADMIN };
    await service.getOverviewMetrics(authCtxB);
    expect(prisma.asset.count).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ organizationId: 'client-tenant-b' }) }),
    );
  });

  it('should generate a 25-cell 5x5 risk heatmap matrix with 100% reconciliation for datasets >100 risks', async () => {
    prisma.risk.count.mockResolvedValueOnce(120); // totalOpen
    prisma.risk.count.mockResolvedValueOnce(70);  // HIGH band
    prisma.risk.count.mockResolvedValueOnce(50);  // MEDIUM band
    prisma.risk.count.mockResolvedValueOnce(0);   // LOW band

    // First risk.groupBy: status breakdown
    prisma.risk.groupBy.mockResolvedValueOnce([
      { status: 'OPEN', _count: 120 },
    ]);

    // Second risk.groupBy: 5x5 heatmap matrix
    prisma.risk.groupBy.mockResolvedValueOnce([
      { likelihood: 5, impact: 4, _count: 70 },
      { likelihood: 3, impact: 3, _count: 50 },
    ]);

    prisma.risk.findMany.mockResolvedValueOnce([
      { id: 'r1', title: 'Critical DB Vulnerability', likelihood: 5, impact: 4, score: 20, status: 'OPEN', owner: 'Alice', asset: { name: 'DB-Cluster' } },
    ]);

    const authCtx = { userId: 'user-1', organizationId: 'org-test-heatmap', role: Role.ADMIN };
    const result = await service.getOverviewMetrics(authCtx);

    expect(result.risks.heatmap).toBeDefined();
    expect(result.risks.heatmap?.matrix).toHaveLength(25); // 5x5 = 25 cells
    expect(result.risks.totalOpen).toBe(120);

    const sumCellCounts = result.risks.heatmap?.matrix.reduce((acc, cell) => acc + cell.count, 0);
    expect(sumCellCounts).toBe(120);

    const cell5_4 = result.risks.heatmap?.matrix.find((c) => c.likelihood === 5 && c.impact === 4);
    expect(cell5_4).toBeDefined();
    expect(cell5_4?.count).toBe(70);

    const cell1_1 = result.risks.heatmap?.matrix.find((c) => c.likelihood === 1 && c.impact === 1);
    expect(cell1_1).toBeDefined();
    expect(cell1_1?.count).toBe(0);

    expect(result.risks.highSeverityRisks).toHaveLength(1);
  });

  it('should fetch on-demand cell details scoped to likelihood, impact, and tenant', async () => {
    prisma.risk.count.mockResolvedValueOnce(7);
    prisma.risk.findMany.mockResolvedValueOnce([
      { id: 'r10', title: 'Data Center Fire Risk', likelihood: 5, impact: 4, score: 20, status: 'OPEN', owner: 'Charlie', asset: { name: 'DC-Primary' } },
    ]);

    const authCtx = { userId: 'user-1', organizationId: 'org-tenant-cell', role: Role.ADMIN };
    const result = await service.getHeatmapCellDetails(authCtx, 5, 4);

    expect(result.likelihood).toBe(5);
    expect(result.impact).toBe(4);
    expect(result.total).toBe(7);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].title).toBe('Data Center Fire Risk');

    expect(prisma.risk.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: 'org-tenant-cell',
          likelihood: 5,
          impact: 4,
          deletedAt: null,
          status: { in: ['OPEN', 'IN_TREATMENT'] },
        }),
      }),
    );
    expect(prisma.risk.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: 'org-tenant-cell',
          likelihood: 5,
          impact: 4,
          deletedAt: null,
          status: { in: ['OPEN', 'IN_TREATMENT'] },
        }),
        take: 20,
      }),
    );
  });
});
