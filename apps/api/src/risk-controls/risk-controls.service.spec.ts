import { Test, TestingModule } from '@nestjs/testing';
import { RiskControlsService } from './risk-controls.service';
import { PrismaService } from '../prisma/prisma.service';
import { ResourceAuthorizationService } from '../auth/resource-authorization.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { Role, RiskControlMitigationType, RiskStatus } from '@omnigrc/shared';

describe('RiskControlsService', () => {
  let service: RiskControlsService;
  let prisma: jest.Mocked<any>;
  let resourceAuthService: jest.Mocked<any>;
  let auditLogsService: jest.Mocked<any>;

  const authCtx = {
    userId: 'user-1',
    organizationId: 'org-1',
    role: Role.ADMIN,
  };

  beforeEach(async () => {
    prisma = {
      risk: {
        findFirst: jest.fn(),
      },
      control: {
        findFirst: jest.fn(),
      },
      riskControl: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        upsert: jest.fn(),
        delete: jest.fn(),
      },
    };

    resourceAuthService = {
      getScopeWhereClause: jest.fn().mockImplementation(async (ctx: any) => ({
        organizationId: ctx.organizationId,
      })),
      authorize: jest.fn().mockResolvedValue(undefined),
    };

    auditLogsService = {
      log: jest.fn().mockResolvedValue({}),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RiskControlsService,
        { provide: PrismaService, useValue: prisma },
        { provide: ResourceAuthorizationService, useValue: resourceAuthService },
        { provide: AuditLogsService, useValue: auditLogsService },
      ],
    }).compile();

    service = module.get<RiskControlsService>(RiskControlsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('associate', () => {
    it('should create a valid same-tenant association with default mitigationType and audit log', async () => {
      const mockRisk = { id: 'risk-1', organizationId: 'org-1', title: 'Data Breach' };
      const mockControl = { id: 'ctrl-1', organizationId: 'org-1', name: 'Encryption at Rest' };
      const mockAssoc = {
        id: 'rc-1',
        organizationId: 'org-1',
        riskId: 'risk-1',
        controlId: 'ctrl-1',
        mitigationType: RiskControlMitigationType.PREVENTATIVE,
        notes: null,
        createdAt: new Date(),
        control: mockControl,
      };

      prisma.risk.findFirst.mockResolvedValue(mockRisk);
      prisma.control.findFirst.mockResolvedValue(mockControl);
      prisma.riskControl.upsert.mockResolvedValue(mockAssoc);

      const result = await service.associate(authCtx, 'risk-1', 'ctrl-1', {});

      expect(prisma.risk.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: 'risk-1', organizationId: 'org-1', deletedAt: null }),
        }),
      );
      expect(prisma.control.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: 'ctrl-1', organizationId: 'org-1', deletedAt: null }),
        }),
      );
      expect(prisma.riskControl.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { riskId_controlId: { riskId: 'risk-1', controlId: 'ctrl-1' } },
          create: expect.objectContaining({
            organizationId: 'org-1',
            riskId: 'risk-1',
            controlId: 'ctrl-1',
            mitigationType: RiskControlMitigationType.PREVENTATIVE,
          }),
        }),
      );
      expect(auditLogsService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'RISK_CONTROL_ASSOCIATED',
          organizationId: 'org-1',
          entityId: 'rc-1',
        }),
      );
      expect(result.controlName).toBe('Encryption at Rest');
    });

    it('should handle duplicate repeated association requests idempotently via upsert', async () => {
      const mockRisk = { id: 'risk-1', organizationId: 'org-1', title: 'Data Breach' };
      const mockControl = { id: 'ctrl-1', organizationId: 'org-1', name: 'Encryption' };
      const mockAssoc = {
        id: 'rc-1',
        organizationId: 'org-1',
        riskId: 'risk-1',
        controlId: 'ctrl-1',
        mitigationType: RiskControlMitigationType.DETECTIVE,
        notes: 'Updated notes',
        createdAt: new Date(),
        control: mockControl,
      };

      prisma.risk.findFirst.mockResolvedValue(mockRisk);
      prisma.control.findFirst.mockResolvedValue(mockControl);
      prisma.riskControl.upsert.mockResolvedValue(mockAssoc);

      const result = await service.associate(authCtx, 'risk-1', 'ctrl-1', {
        mitigationType: RiskControlMitigationType.DETECTIVE,
        notes: 'Updated notes',
      });

      expect(prisma.riskControl.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { riskId_controlId: { riskId: 'risk-1', controlId: 'ctrl-1' } },
          update: expect.objectContaining({
            mitigationType: RiskControlMitigationType.DETECTIVE,
            notes: 'Updated notes',
          }),
        }),
      );
      expect(result.mitigationType).toBe(RiskControlMitigationType.DETECTIVE);
    });

    it('should preserve existing CORRECTIVE mitigationType and update notes when mitigationType is omitted during update', async () => {
      const mockRisk = { id: 'risk-1', organizationId: 'org-1' };
      const mockControl = { id: 'ctrl-1', organizationId: 'org-1', name: 'Firewall' };
      const mockAssoc = {
        id: 'rc-1',
        organizationId: 'org-1',
        riskId: 'risk-1',
        controlId: 'ctrl-1',
        mitigationType: RiskControlMitigationType.CORRECTIVE,
        notes: 'Updated remediation notes',
        control: mockControl,
      };

      prisma.risk.findFirst.mockResolvedValue(mockRisk);
      prisma.control.findFirst.mockResolvedValue(mockControl);
      prisma.riskControl.upsert.mockResolvedValue(mockAssoc);

      const result = await service.associate(authCtx, 'risk-1', 'ctrl-1', {
        notes: 'Updated remediation notes',
      });

      expect(prisma.riskControl.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: {
            notes: 'Updated remediation notes',
          },
        }),
      );
      const updateArg = prisma.riskControl.upsert.mock.calls[0][0].update;
      expect(updateArg.mitigationType).toBeUndefined();
      expect(result.mitigationType).toBe(RiskControlMitigationType.CORRECTIVE);
      expect(result.notes).toBe('Updated remediation notes');
    });

    it('should preserve existing DETECTIVE mitigationType when mitigationType is omitted during update', async () => {
      const mockRisk = { id: 'risk-1', organizationId: 'org-1' };
      const mockControl = { id: 'ctrl-1', organizationId: 'org-1', name: 'SIEM' };
      const mockAssoc = {
        id: 'rc-1',
        organizationId: 'org-1',
        riskId: 'risk-1',
        controlId: 'ctrl-1',
        mitigationType: RiskControlMitigationType.DETECTIVE,
        notes: 'Existing notes',
        control: mockControl,
      };

      prisma.risk.findFirst.mockResolvedValue(mockRisk);
      prisma.control.findFirst.mockResolvedValue(mockControl);
      prisma.riskControl.upsert.mockResolvedValue(mockAssoc);

      const result = await service.associate(authCtx, 'risk-1', 'ctrl-1', {});

      const updateArg = prisma.riskControl.upsert.mock.calls[0][0].update;
      expect(updateArg.mitigationType).toBeUndefined();
      expect(result.mitigationType).toBe(RiskControlMitigationType.DETECTIVE);
    });

    it('should update mitigationType when explicitly supplied in update payload', async () => {
      const mockRisk = { id: 'risk-1', organizationId: 'org-1' };
      const mockControl = { id: 'ctrl-1', organizationId: 'org-1', name: 'VPN' };
      const mockAssoc = {
        id: 'rc-1',
        organizationId: 'org-1',
        riskId: 'risk-1',
        controlId: 'ctrl-1',
        mitigationType: RiskControlMitigationType.COMPENSATING,
        notes: null,
        control: mockControl,
      };

      prisma.risk.findFirst.mockResolvedValue(mockRisk);
      prisma.control.findFirst.mockResolvedValue(mockControl);
      prisma.riskControl.upsert.mockResolvedValue(mockAssoc);

      const result = await service.associate(authCtx, 'risk-1', 'ctrl-1', {
        mitigationType: RiskControlMitigationType.COMPENSATING,
      });

      expect(prisma.riskControl.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({
            mitigationType: RiskControlMitigationType.COMPENSATING,
          }),
        }),
      );
      expect(result.mitigationType).toBe(RiskControlMitigationType.COMPENSATING);
    });

    it('should default to PREVENTATIVE in create when mitigationType is omitted for a new association', async () => {
      const mockRisk = { id: 'risk-1', organizationId: 'org-1' };
      const mockControl = { id: 'ctrl-1', organizationId: 'org-1', name: 'Auth' };
      const mockAssoc = {
        id: 'rc-1',
        organizationId: 'org-1',
        riskId: 'risk-1',
        controlId: 'ctrl-1',
        mitigationType: RiskControlMitigationType.PREVENTATIVE,
        notes: null,
        control: mockControl,
      };

      prisma.risk.findFirst.mockResolvedValue(mockRisk);
      prisma.control.findFirst.mockResolvedValue(mockControl);
      prisma.riskControl.upsert.mockResolvedValue(mockAssoc);

      const result = await service.associate(authCtx, 'risk-1', 'ctrl-1', {});

      expect(prisma.riskControl.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            mitigationType: RiskControlMitigationType.PREVENTATIVE,
          }),
        }),
      );
      expect(result.mitigationType).toBe(RiskControlMitigationType.PREVENTATIVE);
    });

    it('should preserve existing notes by passing undefined in update when notes are omitted', async () => {
      const mockRisk = { id: 'risk-1', organizationId: 'org-1' };
      const mockControl = { id: 'ctrl-1', organizationId: 'org-1', name: 'Auth' };
      const mockAssoc = {
        id: 'rc-1',
        organizationId: 'org-1',
        riskId: 'risk-1',
        controlId: 'ctrl-1',
        mitigationType: RiskControlMitigationType.CORRECTIVE,
        notes: 'Original unchanged note',
        control: mockControl,
      };

      prisma.risk.findFirst.mockResolvedValue(mockRisk);
      prisma.control.findFirst.mockResolvedValue(mockControl);
      prisma.riskControl.upsert.mockResolvedValue(mockAssoc);

      const result = await service.associate(authCtx, 'risk-1', 'ctrl-1', {
        mitigationType: RiskControlMitigationType.CORRECTIVE,
      });

      const updateArg = prisma.riskControl.upsert.mock.calls[0][0].update;
      expect(updateArg.notes).toBeUndefined();
      expect(result.notes).toBe('Original unchanged note');
    });

    it('should reject association if Risk belongs to another tenant (404 Not Found)', async () => {
      prisma.risk.findFirst.mockResolvedValue(null); // Not found in caller's tenant
      prisma.control.findFirst.mockResolvedValue({ id: 'ctrl-1', organizationId: 'org-1' });

      await expect(service.associate(authCtx, 'cross-tenant-risk', 'ctrl-1', {})).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.riskControl.upsert).not.toHaveBeenCalled();
    });

    it('should reject association if Control belongs to another tenant (404 Not Found)', async () => {
      prisma.risk.findFirst.mockResolvedValue({ id: 'risk-1', organizationId: 'org-1' });
      prisma.control.findFirst.mockResolvedValue(null); // Not found in caller's tenant

      await expect(service.associate(authCtx, 'risk-1', 'cross-tenant-control', {})).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.riskControl.upsert).not.toHaveBeenCalled();
    });

    it('should ignore any client-attempted organizationId spoofing and use authCtx.organizationId', async () => {
      const mockRisk = { id: 'risk-1', organizationId: 'org-1' };
      const mockControl = { id: 'ctrl-1', organizationId: 'org-1' };
      prisma.risk.findFirst.mockResolvedValue(mockRisk);
      prisma.control.findFirst.mockResolvedValue(mockControl);
      prisma.riskControl.upsert.mockResolvedValue({
        id: 'rc-1',
        organizationId: 'org-1',
        riskId: 'risk-1',
        controlId: 'ctrl-1',
        mitigationType: RiskControlMitigationType.PREVENTATIVE,
        control: mockControl,
      });

      // Pass an untrusted payload that attempts to inject a victim organizationId
      const spoofedPayload: any = { controlId: 'ctrl-1', organizationId: 'victim-org-999' };
      await service.associate(authCtx, 'risk-1', 'ctrl-1', spoofedPayload);

      // Verifies that create always uses authCtx.organizationId ('org-1')
      expect(prisma.riskControl.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            organizationId: 'org-1',
          }),
        }),
      );
    });
  });

  describe('disassociate', () => {
    it('should remove only the association record without modifying Risk or Control', async () => {
      const mockAssoc = {
        id: 'rc-1',
        organizationId: 'org-1',
        riskId: 'risk-1',
        controlId: 'ctrl-1',
      };

      prisma.riskControl.findFirst.mockResolvedValue(mockAssoc);
      prisma.riskControl.delete.mockResolvedValue(mockAssoc);

      const result = await service.disassociate(authCtx, 'risk-1', 'ctrl-1');

      expect(prisma.riskControl.findFirst).toHaveBeenCalledWith({
        where: {
          riskId: 'risk-1',
          controlId: 'ctrl-1',
          organizationId: 'org-1',
        },
      });
      expect(prisma.riskControl.delete).toHaveBeenCalledWith({
        where: { id: 'rc-1' },
      });
      expect(auditLogsService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'RISK_CONTROL_DISASSOCIATED',
          organizationId: 'org-1',
          entityId: 'rc-1',
        }),
      );
      expect(result.success).toBe(true);
    });

    it('should throw 404 NotFoundException if association does not exist in caller tenant', async () => {
      prisma.riskControl.findFirst.mockResolvedValue(null);

      await expect(service.disassociate(authCtx, 'risk-1', 'ctrl-non-existent')).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.riskControl.delete).not.toHaveBeenCalled();
    });
  });

  describe('getControlsForRisk', () => {
    it('should return paginated list of associated controls for a valid risk', async () => {
      const mockRisk = { id: 'risk-1', organizationId: 'org-1', title: 'Data Breach' };
      const mockAssocs = [
        {
          id: 'rc-1',
          controlId: 'ctrl-1',
          mitigationType: RiskControlMitigationType.PREVENTATIVE,
          notes: 'Primary control',
          createdAt: new Date(),
          control: {
            id: 'ctrl-1',
            name: 'Access Control',
            description: 'Enforce MFA',
            category: 'Access',
          },
        },
      ];

      prisma.risk.findFirst.mockResolvedValue(mockRisk);
      prisma.riskControl.findMany.mockResolvedValue(mockAssocs);
      prisma.riskControl.count.mockResolvedValue(1);

      const result = await service.getControlsForRisk(authCtx, 'risk-1', { page: 1, limit: 10 });

      expect(result.total).toBe(1);
      expect(result.items[0].controlName).toBe('Access Control');
      expect(result.items[0].mitigationType).toBe(RiskControlMitigationType.PREVENTATIVE);
    });

    it('should reject getControlsForRisk if risk does not exist in tenant', async () => {
      prisma.risk.findFirst.mockResolvedValue(null);

      await expect(service.getControlsForRisk(authCtx, 'risk-unknown')).rejects.toThrow(NotFoundException);
      expect(prisma.riskControl.findMany).not.toHaveBeenCalled();
    });
  });

  describe('getRisksForControl', () => {
    it('should return paginated list of associated risks for a valid control', async () => {
      const mockControl = { id: 'ctrl-1', organizationId: 'org-1', name: 'Access Control' };
      const mockAssocs = [
        {
          id: 'rc-1',
          riskId: 'risk-1',
          mitigationType: RiskControlMitigationType.PREVENTATIVE,
          notes: null,
          createdAt: new Date(),
          risk: {
            id: 'risk-1',
            title: 'Unauthorized Access',
            score: 16,
            status: RiskStatus.OPEN,
            owner: 'SecOps',
          },
        },
      ];

      prisma.control.findFirst.mockResolvedValue(mockControl);
      prisma.riskControl.findMany.mockResolvedValue(mockAssocs);
      prisma.riskControl.count.mockResolvedValue(1);

      const result = await service.getRisksForControl(authCtx, 'ctrl-1', { page: 1, limit: 10 });

      expect(result.total).toBe(1);
      expect(result.items[0].riskTitle).toBe('Unauthorized Access');
      expect(result.items[0].riskScoreBand).toBe('HIGH');
    });

    it('should reject getRisksForControl if control does not exist in tenant', async () => {
      prisma.control.findFirst.mockResolvedValue(null);

      await expect(service.getRisksForControl(authCtx, 'ctrl-unknown')).rejects.toThrow(NotFoundException);
      expect(prisma.riskControl.findMany).not.toHaveBeenCalled();
    });
  });
});
