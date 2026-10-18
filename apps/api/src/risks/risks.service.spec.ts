import { Test, TestingModule } from '@nestjs/testing';
import { RisksService } from './risks.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { RiskStatus, Role } from '@omnigrc/shared';

import { ResourceAuthorizationService } from '../auth/resource-authorization.service';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { RiskQueryDto } from './dto/risks.dto';

describe('RisksService', () => {
  let service: RisksService;
  let prisma: jest.Mocked<any>;
  let auditLogsService: jest.Mocked<any>;
  let resourceAuthService: jest.Mocked<any>;

  beforeEach(async () => {
    prisma = {
      risk: {
        findMany: jest.fn(),
        count: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      frameworkReference: {
        findUnique: jest.fn(),
      },
    };

    auditLogsService = {
      log: jest.fn().mockResolvedValue({}),
    };

    resourceAuthService = {
      getScopeWhereClause: jest.fn().mockImplementation(async (ctx: any) => ({
        organizationId: ctx.organizationId,
      })),
      authorize: jest.fn().mockResolvedValue(undefined),
    };

    const frameworkEntitlementsService = {
      assertEntitled: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RisksService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditLogsService, useValue: auditLogsService },
        { provide: ResourceAuthorizationService, useValue: resourceAuthService },
        { provide: 'FrameworkEntitlementsService', useValue: frameworkEntitlementsService },
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

  it('should filter risks by assetId while maintaining organization scoping in findAll', async () => {
    const mockRisk = {
      id: 'risk-asset-1',
      organizationId: 'org-1',
      title: 'Database Data Leak Risk',
      likelihood: 4,
      impact: 4,
      score: 16,
      scoreBand: 'HIGH',
      status: RiskStatus.OPEN,
      owner: 'DBA',
      assetId: 'asset-123',
      createdAt: new Date(),
      updatedAt: new Date(),
      createdById: 'user-1',
    };

    prisma.risk.findMany.mockResolvedValue([mockRisk]);
    prisma.risk.count.mockResolvedValue(1);

    const authCtx = { userId: 'user-1', organizationId: 'org-1', role: Role.ADMIN };
    const result = await service.findAll(authCtx, { assetId: 'asset-123' });

    expect(prisma.risk.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: 'org-1',
          deletedAt: null,
          assetId: 'asset-123',
        }),
      }),
    );
    expect(result.items.length).toBe(1);
    expect(result.items[0].assetId).toBe('asset-123');
  });

  it('should return empty list when no risks match the specified assetId', async () => {
    prisma.risk.findMany.mockResolvedValue([]);
    prisma.risk.count.mockResolvedValue(0);

    const authCtx = { userId: 'user-1', organizationId: 'org-1', role: Role.ADMIN };
    const result = await service.findAll(authCtx, { assetId: 'non-existent-asset' });

    expect(prisma.risk.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: 'org-1',
          deletedAt: null,
          assetId: 'non-existent-asset',
        }),
      }),
    );
    expect(result.items.length).toBe(0);
    expect(result.total).toBe(0);
  });

  it('should filter risks by frameworkReferenceId while maintaining tenant isolation', async () => {
    prisma.risk.findMany.mockResolvedValue([]);
    prisma.risk.count.mockResolvedValue(0);

    const authCtx = { userId: 'user-1', organizationId: 'org-1', role: Role.ADMIN };
    await service.findAll(authCtx, { frameworkReferenceId: 'ref-iso-sec5' });

    expect(prisma.risk.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: 'org-1',
          deletedAt: null,
          frameworkReferenceId: 'ref-iso-sec5',
        }),
      }),
    );
  });

  it('should filter risks by frameworkId via relational traversal', async () => {
    prisma.risk.findMany.mockResolvedValue([]);
    prisma.risk.count.mockResolvedValue(0);

    const authCtx = { userId: 'user-1', organizationId: 'org-1', role: Role.ADMIN };
    await service.findAll(authCtx, { frameworkId: 'fw-hipaa' });

    expect(prisma.risk.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: 'org-1',
          deletedAt: null,
          frameworkId: 'fw-hipaa',
        }),
      }),
    );
  });

  it('should reject risk creation when framework reference does not exist', async () => {
    prisma.frameworkReference.findUnique.mockResolvedValue(null);

    const authCtx = { userId: 'user-1', organizationId: 'org-1', role: Role.ADMIN };
    await expect(
      service.create(authCtx, {
        title: 'GDPR Clause Risk',
        owner: 'DPO',
        likelihood: 3,
        impact: 3,
        frameworkId: 'fw-gdpr',
        frameworkReferenceId: 'non-existent-ref',
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it('should reject risk creation when framework reference belongs to a different framework', async () => {
    prisma.frameworkReference.findUnique.mockResolvedValue({
      id: 'ref-iso',
      frameworkVersion: {
        frameworkId: 'fw-iso27001',
      },
    });

    const authCtx = { userId: 'user-1', organizationId: 'org-1', role: Role.ADMIN };
    await expect(
      service.create(authCtx, {
        title: 'Mismatched Risk',
        owner: 'SecOps',
        likelihood: 3,
        impact: 3,
        frameworkId: 'fw-gdpr',
        frameworkReferenceId: 'ref-iso',
      }),
    ).rejects.toThrow(BadRequestException);
  });
});

describe('RiskQueryDto validation', () => {
  it('accepts a valid optional assetId', async () => {
    const dto = plainToInstance(RiskQueryDto, { assetId: 'asset-123' });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('accepts query without assetId (existing queries continue to work)', async () => {
    const dto = plainToInstance(RiskQueryDto, { page: 1, limit: 10 });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('rejects invalid non-string assetId', async () => {
    const dto = plainToInstance(RiskQueryDto, { assetId: 12345 });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    const assetIdError = errors.find((e) => e.property === 'assetId');
    expect(assetIdError).toBeDefined();
    expect(assetIdError?.constraints?.isString).toBeDefined();
  });
});
