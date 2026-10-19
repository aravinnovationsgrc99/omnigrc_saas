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

  it('should resolve and map frameworkVersionId from authoritative frameworkReference', async () => {
    const mockRiskWithRef = {
      id: 'risk-fw-ver',
      organizationId: 'org-1',
      title: 'Cloud Access Risk',
      likelihood: 3,
      impact: 4,
      score: 12,
      scoreBand: 'MEDIUM',
      status: RiskStatus.OPEN,
      owner: 'SecOps',
      frameworkId: 'fw-iso',
      frameworkReferenceId: 'ref-a51',
      framework: { code: 'ISO27001', name: 'ISO/IEC 27001' },
      frameworkReference: {
        identifier: 'A.5.1',
        title: 'Policies for information security',
        frameworkVersionId: 'ver-iso-2022',
      },
      createdAt: new Date(),
      updatedAt: new Date(),
      createdById: 'user-1',
    };

    prisma.risk.findFirst.mockResolvedValue(mockRiskWithRef);

    const authCtx = { userId: 'user-1', organizationId: 'org-1', role: Role.ADMIN };
    const result = await service.findOne(authCtx, 'risk-fw-ver');

    expect(result.frameworkId).toBe('fw-iso');
    expect(result.frameworkReferenceId).toBe('ref-a51');
    expect(result.frameworkVersionId).toBe('ver-iso-2022');
    expect(result.referenceIdentifier).toBe('A.5.1');
  });

  it('should allow updating risk with a compatible framework reference from another version', async () => {
    const existingRisk = {
      id: 'risk-edit-ver',
      organizationId: 'org-1',
      title: 'Legacy Risk',
      likelihood: 2,
      impact: 3,
      score: 6,
      status: RiskStatus.OPEN,
      owner: 'SecOps',
      frameworkId: 'fw-iso',
      frameworkReferenceId: 'ref-old',
      createdAt: new Date(),
      updatedAt: new Date(),
      createdById: 'user-1',
    };

    prisma.risk.findFirst.mockResolvedValue(existingRisk);
    prisma.frameworkReference.findUnique.mockResolvedValue({
      id: 'ref-new-2022',
      identifier: 'A.5.1',
      frameworkVersion: {
        id: 'ver-2022',
        frameworkId: 'fw-iso',
      },
    });
    prisma.risk.update.mockResolvedValue({
      ...existingRisk,
      frameworkReferenceId: 'ref-new-2022',
      frameworkReference: {
        identifier: 'A.5.1',
        title: 'Policies for information security',
        frameworkVersionId: 'ver-2022',
      },
    });

    const authCtx = { userId: 'user-1', organizationId: 'org-1', role: Role.ADMIN };
    const updated = await service.update(authCtx, 'risk-edit-ver', {
      frameworkId: 'fw-iso',
      frameworkReferenceId: 'ref-new-2022',
    });

    expect(updated.frameworkReferenceId).toBe('ref-new-2022');
    expect(updated.frameworkVersionId).toBe('ver-2022');
    expect(prisma.risk.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'risk-edit-ver' },
        data: expect.objectContaining({
          frameworkId: 'fw-iso',
          frameworkReferenceId: 'ref-new-2022',
        }),
      }),
    );
  });

  it('should reject risk update when new framework reference belongs to a different framework', async () => {
    const existingRisk = {
      id: 'risk-mismatch',
      organizationId: 'org-1',
      title: 'Risk to Update',
      likelihood: 2,
      impact: 3,
      score: 6,
      status: RiskStatus.OPEN,
      owner: 'SecOps',
      frameworkId: 'fw-iso',
      frameworkReferenceId: 'ref-iso',
    };

    prisma.risk.findFirst.mockResolvedValue(existingRisk);
    prisma.frameworkReference.findUnique.mockResolvedValue({
      id: 'ref-gdpr-art5',
      identifier: 'Art.5',
      frameworkVersion: {
        frameworkId: 'fw-gdpr',
      },
    });

    const authCtx = { userId: 'user-1', organizationId: 'org-1', role: Role.ADMIN };
    await expect(
      service.update(authCtx, 'risk-mismatch', {
        frameworkId: 'fw-iso',
        frameworkReferenceId: 'ref-gdpr-art5',
      }),
    ).rejects.toThrow('Framework reference "Art.5" does not belong to the selected framework.');
  });

  describe('Phase 2: Risk Taxonomy, Residual Risk & Treatment Workflows', () => {
    it('should calculate inherent and residual risk scores on creation', async () => {
      const mockCreated = {
        id: 'risk-res-1',
        organizationId: 'org-1',
        title: 'Residual Risk Test',
        category: 'INFORMATION_SECURITY',
        likelihood: 4,
        impact: 4,
        score: 16,
        residualLikelihood: 2,
        residualImpact: 3,
        residualScore: 6,
        status: RiskStatus.OPEN,
        owner: 'SecOps',
        treatmentPlan: 'Implement MFA and EDR',
        treatmentStrategy: 'MITIGATE',
        treatmentOwner: 'SecLead',
        treatmentDueDate: new Date('2026-12-31'),
        treatmentStatus: 'IN_PROGRESS',
        createdAt: new Date(),
        updatedAt: new Date(),
        createdById: 'user-1',
      };

      prisma.risk.create.mockResolvedValue(mockCreated);

      const authCtx = { userId: 'user-1', organizationId: 'org-1', role: Role.ADMIN };
      const result = await service.create(authCtx, {
        title: 'Residual Risk Test',
        category: 'INFORMATION_SECURITY',
        likelihood: 4,
        impact: 4,
        residualLikelihood: 2,
        residualImpact: 3,
        owner: 'SecOps',
        treatmentPlan: 'Implement MFA and EDR',
        treatmentStrategy: 'MITIGATE',
        treatmentOwner: 'SecLead',
      });

      expect(result.score).toBe(16);
      expect(result.scoreBand).toBe('HIGH');
      expect(result.residualScore).toBe(6);
      expect(result.residualScoreBand).toBe('LOW');
      expect(result.category).toBe('INFORMATION_SECURITY');
      expect(result.treatmentStrategy).toBe('MITIGATE');
      expect(result.treatmentOwner).toBe('SecLead');
    });

    it('should reject transition to IN_TREATMENT without a treatment plan or strategy', async () => {
      const existing = {
        id: 'risk-no-plan',
        organizationId: 'org-1',
        title: 'Unplanned Risk',
        likelihood: 3,
        impact: 3,
        score: 9,
        status: RiskStatus.OPEN,
        treatmentPlan: null,
        treatmentStrategy: null,
      };
      prisma.risk.findFirst.mockResolvedValue(existing);

      const authCtx = { userId: 'user-1', organizationId: 'org-1', role: Role.ADMIN };
      await expect(
        service.update(authCtx, 'risk-no-plan', {
          status: RiskStatus.IN_TREATMENT,
        }),
      ).rejects.toThrow('Cannot transition risk to IN_TREATMENT without a defined treatment plan or strategy.');
    });

    it('should reject invalid transition from CLOSED to non-OPEN status', async () => {
      const closedRisk = {
        id: 'risk-closed',
        organizationId: 'org-1',
        title: 'Closed Risk',
        likelihood: 1,
        impact: 1,
        score: 1,
        status: RiskStatus.CLOSED,
        treatmentPlan: 'Done',
      };
      prisma.risk.findFirst.mockResolvedValue(closedRisk);

      const authCtx = { userId: 'user-1', organizationId: 'org-1', role: Role.ADMIN };
      await expect(
        service.update(authCtx, 'risk-closed', {
          status: RiskStatus.IN_TREATMENT,
        }),
      ).rejects.toThrow('Closed risks can only be transitioned to OPEN (reopened).');
    });

    it('should filter risks by category in findAll', async () => {
      prisma.risk.findMany.mockResolvedValue([]);
      prisma.risk.count.mockResolvedValue(0);

      const authCtx = { userId: 'user-1', organizationId: 'org-1', role: Role.ADMIN };
      await service.findAll(authCtx, { category: 'FINANCIAL' });

      expect(prisma.risk.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ category: 'FINANCIAL' }),
        }),
      );
    });

    it('should submit risk for approval when approvalEngineService is available', async () => {
      const mockRisk = {
        id: 'risk-app-1',
        organizationId: 'org-1',
        title: 'Risk for Signoff',
        description: 'Requires executive acceptance',
        likelihood: 5,
        impact: 4,
        score: 20,
        status: RiskStatus.OPEN,
      };
      prisma.risk.findFirst.mockResolvedValue(mockRisk);

      const mockApprovalEngine = {
        createApprovalInstance: jest.fn().mockResolvedValue({
          id: 'app-ins-1',
          status: 'PENDING',
          title: 'Risk Approval: Risk for Signoff (RISK_ACCEPTANCE)',
        }),
      };

      (service as any).approvalEngineService = mockApprovalEngine;

      const authCtx = { userId: 'user-1', organizationId: 'org-1', role: Role.ADMIN };
      const res = await service.submitForApproval(authCtx, 'risk-app-1', {
        purpose: 'RISK_ACCEPTANCE' as any,
      });

      expect(res.id).toBe('app-ins-1');
      expect(mockApprovalEngine.createApprovalInstance).toHaveBeenCalledWith(
        'org-1',
        'user-1',
        expect.objectContaining({
          resourceType: 'RISK',
          resourceId: 'risk-app-1',
          purpose: 'RISK_ACCEPTANCE',
        }),
      );
      expect(auditLogsService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'RISK_APPROVAL_SUBMITTED',
          entityId: 'risk-app-1',
        }),
      );
    });
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
