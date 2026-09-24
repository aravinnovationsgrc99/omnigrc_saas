import { Test, TestingModule } from '@nestjs/testing';
import { MetricsService } from './metrics.service';
import { PrismaService } from '../prisma/prisma.service';
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
      },
      auditFinding: {
        count: jest.fn().mockResolvedValue(0),
        groupBy: jest.fn().mockResolvedValue([]),
        findMany: jest.fn().mockResolvedValue([]),
      },
      auditCapa: {
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
      },
      risk: {
        count: jest.fn().mockResolvedValue(0),
        groupBy: jest.fn().mockResolvedValue([]),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MetricsService,
        { provide: PrismaService, useValue: prisma },
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
    expect(result.audits.overallAuditScore).toBe(85.5);
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
});
