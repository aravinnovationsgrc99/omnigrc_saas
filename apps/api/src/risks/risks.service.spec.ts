import { Test, TestingModule } from '@nestjs/testing';
import { RisksService } from './risks.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { NotFoundException } from '@nestjs/common';
import { RiskStatus, Role } from '@omnigrc/shared';

describe('RisksService', () => {
  let service: RisksService;
  let prisma: jest.Mocked<any>;
  let auditLogsService: jest.Mocked<any>;

  beforeEach(async () => {
    prisma = {
      risk: {
        findMany: jest.fn(),
        count: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
    };

    auditLogsService = {
      log: jest.fn().mockResolvedValue({}),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RisksService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditLogsService, useValue: auditLogsService },
      ],
    }).compile();

    service = module.get<RisksService>(RisksService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should list risks scoped to tenant organizationId', async () => {
    const mockRisk = {
      id: 'risk-1',
      organizationId: 'org-1',
      title: 'Data Breach Risk',
      likelihood: 4,
      impact: 5,
      score: 20,
      scoreBand: 'HIGH',
      status: RiskStatus.OPEN,
      owner: 'Risk Officer',
      createdAt: new Date(),
      updatedAt: new Date(),
      createdById: 'user-1',
    };

    prisma.risk.findMany.mockResolvedValue([mockRisk]);
    prisma.risk.count.mockResolvedValue(1);

    const authCtx = { userId: 'user-1', organizationId: 'org-1', role: Role.ADMIN };
    const result = await service.findAll(authCtx, {});

    expect(prisma.risk.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: 'org-1',
        }),
      }),
    );
    expect(result.items[0].title).toBe('Data Breach Risk');
    expect(result.items[0].score).toBe(20);
  });

  it('should calculate risk score automatically on creation and log audit event', async () => {
    const createdRisk = {
      id: 'risk-new',
      organizationId: 'org-1',
      title: 'Phishing Risk',
      likelihood: 3,
      impact: 3,
      score: 9,
      scoreBand: 'MEDIUM',
      status: RiskStatus.OPEN,
      owner: 'SecOps',
      createdAt: new Date(),
      updatedAt: new Date(),
      createdById: 'user-1',
    };

    prisma.risk.create.mockResolvedValue(createdRisk);

    const authCtx = { userId: 'user-1', organizationId: 'org-1', role: Role.ADMIN };
    const res = await service.create(authCtx, {
      title: 'Phishing Risk',
      likelihood: 3,
      impact: 3,
      owner: 'SecOps',
    });

    expect(res.score).toBe(9);
    expect(res.scoreBand).toBe('MEDIUM');
    expect(auditLogsService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'RISK_CREATED',
        organizationId: 'org-1',
      }),
    );
  });
});
