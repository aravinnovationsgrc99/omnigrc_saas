import { Test, TestingModule } from '@nestjs/testing';
import { MetricsService } from './metrics.service';
import { PrismaService } from '../prisma/prisma.service';

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
      },
      policy: {
        count: jest.fn().mockResolvedValue(0),
        groupBy: jest.fn().mockResolvedValue([]),
      },
      vendor: {
        count: jest.fn().mockResolvedValue(0),
        groupBy: jest.fn().mockResolvedValue([]),
      },
      vendorAssessment: {
        count: jest.fn().mockResolvedValue(0),
      },
      complianceTask: {
        count: jest.fn().mockResolvedValue(0),
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
      },
      auditCapa: {
        count: jest.fn().mockResolvedValue(0),
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
    const result = await service.getOverviewMetrics('org-1');

    expect(result.organizationId).toBe('org-1');
    expect(result.assets.total).toBe(0);
    expect(result.assets.criticalityHighCount).toBe(0);
    expect(result.vulnerabilities.total).toBe(0);
    expect(result.policies.total).toBe(0);
    expect(result.vendors.total).toBe(0);
    expect(result.obligations.total).toBe(0);
    expect(result.obligations.completionRate).toBe(0);
    expect(result.audits.overallAuditScore).toBe(85.5);
    expect(result.risks.totalOpen).toBe(0);
  });

  it('should enforce multi-tenant isolation by passing organizationId to every database query', async () => {
    await service.getOverviewMetrics('org-tenant-a');

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
  });

  it('should isolate MSSP client contexts when switching targets', async () => {
    await service.getOverviewMetrics('client-tenant-a');
    expect(prisma.asset.count).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ organizationId: 'client-tenant-a' }) }),
    );

    jest.clearAllMocks();

    await service.getOverviewMetrics('client-tenant-b');
    expect(prisma.asset.count).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ organizationId: 'client-tenant-b' }) }),
    );
  });
});
