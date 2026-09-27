import { Test, TestingModule } from '@nestjs/testing';
import { ServiceControlService, OperatorContext } from './service-control.service';
import { ControlPlanePrismaService } from '../prisma/prisma.service';
import { ControlPlaneAuditLogsService } from '../audit/audit-logs.service';
import { BadRequestException } from '@nestjs/common';

describe('ServiceControlService (Control Plane)', () => {
  let service: ServiceControlService;
  let prisma: any;
  let auditLogsService: any;

  const mockOperator: OperatorContext = {
    id: 'op-1',
    role: 'PLATFORM_SUPER_ADMIN' as any,
    email: 'admin@arav.io',
  };

  const mockPrisma = {
    serviceCatalog: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      count: jest.fn(),
    },
    globalServiceState: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      upsert: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
    },
    organizationServiceOverride: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      upsert: jest.fn(),
      delete: jest.fn(),
    },
    serviceStateTransitionLog: {
      create: jest.fn(),
      findUnique: jest.fn(),
    },
    customerOrganization: {
      findUnique: jest.fn(),
    },
    $transaction: jest.fn((cb) => cb(mockPrisma)),
  };

  const mockAuditLogsService = {
    log: jest.fn().mockResolvedValue(true),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ServiceControlService,
        { provide: ControlPlanePrismaService, useValue: mockPrisma },
        { provide: ControlPlaneAuditLogsService, useValue: mockAuditLogsService },
      ],
    }).compile();

    service = module.get<ServiceControlService>(ServiceControlService);
    prisma = module.get(ControlPlanePrismaService);
    auditLogsService = module.get(ControlPlaneAuditLogsService);
  });

  describe('onModuleInit & seedCatalog', () => {
    it('should seed catalog if capability does not exist', async () => {
      mockPrisma.serviceCatalog.findUnique.mockResolvedValue(null);
      mockPrisma.serviceCatalog.create.mockResolvedValue({ id: 'cat-1' });
      mockPrisma.globalServiceState.create.mockResolvedValue({});

      await service.onModuleInit();

      expect(mockPrisma.serviceCatalog.findUnique).toHaveBeenCalledTimes(18);
      expect(mockPrisma.serviceCatalog.create).toHaveBeenCalledTimes(18);
    });
  });

  describe('listServices', () => {
    it('should return service catalog list with formatted global state sequence', async () => {
      mockPrisma.serviceCatalog.findMany.mockResolvedValue([
        {
          id: 'cat-1',
          code: 'AI_DOC_INTELLIGENCE',
          name: 'AI Document Intelligence',
          globalState: { capabilityCode: 'AI_DOC_INTELLIGENCE', state: 'AVAILABLE', sequence: 1n },
        },
      ]);

      const result = await service.listServices();
      expect(result).toHaveLength(1);
      expect(result[0].code).toBe('AI_DOC_INTELLIGENCE');
      expect(result[0].globalState.sequence).toBe('1');
    });
  });

  describe('updateGlobalServiceState', () => {
    it('should update global state and record transition log and audit event', async () => {
      mockPrisma.serviceCatalog.findUnique.mockResolvedValue({
        id: 'cat-1',
        code: 'AI_DOC_INTELLIGENCE',
        globalState: { serviceId: 'cat-1', state: 'AVAILABLE', sequence: 1n },
      });
      mockPrisma.globalServiceState.update.mockResolvedValue({
        serviceId: 'cat-1',
        state: 'DISABLED',
        sequence: 2n,
        updatedAt: new Date(),
      });

      const result = await service.updateGlobalServiceState(
        'AI_DOC_INTELLIGENCE',
        {
          state: 'DISABLED' as any,
          reason: 'Emergency platform maintenance due to downstream service outage',
        },
        mockOperator,
      );

      expect(result.capabilityCode).toBe('AI_DOC_INTELLIGENCE');
      expect(result.state).toBe('DISABLED');
      expect(mockPrisma.serviceStateTransitionLog.create).toHaveBeenCalled();
      expect(mockAuditLogsService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'SERVICE_GLOBAL_STATE_CHANGED',
        }),
      );
    });
  });

  describe('setOrganizationServiceOverride', () => {
    it('should reject overriding to AVAILABLE if global state is COMMERCIAL_DISABLED (Primacy Rule)', async () => {
      mockPrisma.serviceCatalog.findUnique.mockResolvedValue({
        id: 'cat-1',
        code: 'AI_DOC_INTELLIGENCE',
        isOrgOverridePermitted: true,
        globalState: { serviceId: 'cat-1', state: 'COMMERCIAL_DISABLED', sequence: 1n },
      });

      await expect(
        service.setOrganizationServiceOverride(
          'org-1',
          'AI_DOC_INTELLIGENCE',
          {
            overrideState: 'AVAILABLE' as any,
            reason: 'Customer requested activation of AI features',
          },
          mockOperator,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should allow override to DISABLED when global state is AVAILABLE', async () => {
      mockPrisma.serviceCatalog.findUnique.mockResolvedValue({
        id: 'cat-1',
        code: 'AI_DOC_INTELLIGENCE',
        isOrgOverridePermitted: true,
        globalState: { serviceId: 'cat-1', state: 'AVAILABLE', sequence: 1n },
      });
      mockPrisma.organizationServiceOverride.findUnique.mockResolvedValue(null);
      mockPrisma.organizationServiceOverride.upsert.mockResolvedValue({
        organizationId: 'org-1',
        serviceId: 'cat-1',
        overrideState: 'DISABLED',
        sequence: 1n,
        reason: 'Customer cost savings request',
        updatedAt: new Date(),
      });

      const result = await service.setOrganizationServiceOverride(
        'org-1',
        'AI_DOC_INTELLIGENCE',
        {
          overrideState: 'DISABLED' as any,
          reason: 'Customer cost savings request',
        },
        mockOperator,
      );

      expect(result.overrideState).toBe('DISABLED');
      expect(mockAuditLogsService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'ORGANIZATION_SERVICE_OVERRIDE_SET',
        }),
      );
    });
  });

  describe('clearOrganizationServiceOverride', () => {
    it('should delete override record and generate audit event', async () => {
      mockPrisma.serviceCatalog.findUnique.mockResolvedValue({
        id: 'cat-1',
        code: 'AI_DOC_INTELLIGENCE',
      });
      mockPrisma.organizationServiceOverride.findUnique.mockResolvedValue({
        organizationId: 'org-1',
        serviceId: 'cat-1',
        overrideState: 'DISABLED',
        sequence: 1n,
      });
      mockPrisma.organizationServiceOverride.delete.mockResolvedValue({});

      const result = await service.clearOrganizationServiceOverride(
        'org-1',
        'AI_DOC_INTELLIGENCE',
        mockOperator,
      );

      expect(result.cleared).toBe(true);
      expect(mockAuditLogsService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'ORGANIZATION_SERVICE_OVERRIDE_CLEARED',
        }),
      );
    });
  });
});
