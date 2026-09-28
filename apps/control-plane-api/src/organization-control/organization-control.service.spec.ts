import { Test, TestingModule } from '@nestjs/testing';
import { OrganizationControlService } from './organization-control.service';
import { ControlPlanePrismaService } from '../prisma/prisma.service';
import { ControlPlaneAuditLogsService } from '../audit/audit-logs.service';
import { ControlState, OperatorRole } from '@prisma/control-plane-client';
import { BadRequestException, ConflictException } from '@nestjs/common';

describe('OrganizationControlService', () => {
  let service: OrganizationControlService;
  let prisma: ControlPlanePrismaService;
  let auditLogsService: ControlPlaneAuditLogsService;

  const mockPrisma = {
    organizationControlState: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
    },
    organizationStateTransitionLog: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
    },
    $transaction: jest.fn((callback) => callback(mockPrisma)),
  };

  const mockAuditLogsService = {
    log: jest.fn(),
  };

  const superAdminOperator = {
    id: 'op_super_admin',
    role: OperatorRole.PLATFORM_SUPER_ADMIN,
    email: 'admin@arav.io',
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    (global as any).fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue({ status: 'ACCEPTED' }),
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrganizationControlService,
        { provide: ControlPlanePrismaService, useValue: mockPrisma },
        { provide: ControlPlaneAuditLogsService, useValue: mockAuditLogsService },
      ],
    }).compile();

    service = module.get<OrganizationControlService>(OrganizationControlService);
    prisma = module.get<ControlPlanePrismaService>(ControlPlanePrismaService);
    auditLogsService = module.get<ControlPlaneAuditLogsService>(ControlPlaneAuditLogsService);
  });

  describe('State Machine Transitions', () => {
    it('should allow valid transition PENDING -> ACTIVE with sequence increment', async () => {
      mockPrisma.organizationStateTransitionLog.findUnique.mockResolvedValue(null);
      mockPrisma.organizationControlState.findUnique.mockResolvedValue({
        organizationId: 'org_1',
        state: ControlState.PENDING,
        sequence: 1n,
      });

      mockPrisma.organizationControlState.update.mockResolvedValue({
        organizationId: 'org_1',
        state: ControlState.ACTIVE,
        reason: 'Initial onboarding completed by operations team',
        sequence: 2n,
        updatedAt: new Date(),
      });

      const res = await service.transitionState(
        'org_1',
        {
          targetState: ControlState.ACTIVE,
          reason: 'Initial onboarding completed by operations team',
        },
        superAdminOperator,
      );

      expect(res.state).toBe(ControlState.ACTIVE);
      expect(res.sequence).toBe('2');
      expect(mockAuditLogsService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'ORGANIZATION_STATE_CHANGED',
          entityId: 'org_1',
        }),
      );
      expect((global as any).fetch).toHaveBeenCalled();
    });

    it('should allow ACTIVE -> SUSPENDED', async () => {
      mockPrisma.organizationStateTransitionLog.findUnique.mockResolvedValue(null);
      mockPrisma.organizationControlState.findUnique.mockResolvedValue({
        organizationId: 'org_1',
        state: ControlState.ACTIVE,
        sequence: 2n,
      });

      mockPrisma.organizationControlState.update.mockResolvedValue({
        organizationId: 'org_1',
        state: ControlState.SUSPENDED,
        reason: 'Temporary investigation of compliance violation',
        sequence: 3n,
        updatedAt: new Date(),
      });

      const res = await service.transitionState(
        'org_1',
        {
          targetState: ControlState.SUSPENDED,
          reason: 'Temporary investigation of compliance violation',
        },
        superAdminOperator,
      );

      expect(res.state).toBe(ControlState.SUSPENDED);
    });

    it('should reject illegal transition PENDING -> SUSPENDED', async () => {
      mockPrisma.organizationStateTransitionLog.findUnique.mockResolvedValue(null);
      mockPrisma.organizationControlState.findUnique.mockResolvedValue({
        organizationId: 'org_1',
        state: ControlState.PENDING,
        sequence: 1n,
      });

      await expect(
        service.transitionState(
          'org_1',
          {
            targetState: ControlState.SUSPENDED,
            reason: 'Invalid direct jump from pending to suspended',
          },
          superAdminOperator,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject outward transition from DECOMMISSIONED (terminal state)', async () => {
      mockPrisma.organizationStateTransitionLog.findUnique.mockResolvedValue(null);
      mockPrisma.organizationControlState.findUnique.mockResolvedValue({
        organizationId: 'org_1',
        state: ControlState.DECOMMISSIONED,
        sequence: 5n,
      });

      await expect(
        service.transitionState(
          'org_1',
          {
            targetState: ControlState.ACTIVE,
            reason: 'Attempting to reactivate decommissioned org',
          },
          superAdminOperator,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('Reason Validation', () => {
    it('should reject reasons shorter than 10 characters', async () => {
      await expect(
        service.transitionState(
          'org_1',
          {
            targetState: ControlState.ACTIVE,
            reason: 'Short',
          },
          superAdminOperator,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject trivial/spam reasons', async () => {
      await expect(
        service.transitionState(
          'org_1',
          {
            targetState: ControlState.ACTIVE,
            reason: 'testing123456',
          },
          superAdminOperator,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('Idempotency & Concurrency', () => {
    it('should return idempotent success when identical key and targetState are resubmitted', async () => {
      mockPrisma.organizationStateTransitionLog.findUnique.mockResolvedValue({
        id: 'log_1',
        organizationId: 'org_1',
        newState: ControlState.ACTIVE,
        idempotencyKey: 'idem_key_123',
      });

      mockPrisma.organizationControlState.findUnique.mockResolvedValue({
        organizationId: 'org_1',
        state: ControlState.ACTIVE,
        sequence: 2n,
      });

      const res = await service.transitionState(
        'org_1',
        {
          targetState: ControlState.ACTIVE,
          reason: 'Valid operational reason for activation',
          idempotencyKey: 'idem_key_123',
        },
        superAdminOperator,
      );

      expect(res.idempotent).toBe(true);
      expect(mockPrisma.organizationControlState.update).not.toHaveBeenCalled();
    });

    it('should reject conflicting idempotencyKey used for a different transition', async () => {
      mockPrisma.organizationStateTransitionLog.findUnique.mockResolvedValue({
        id: 'log_1',
        organizationId: 'org_1',
        newState: ControlState.SUSPENDED,
        idempotencyKey: 'idem_key_123',
      });

      await expect(
        service.transitionState(
          'org_1',
          {
            targetState: ControlState.DISABLED,
            reason: 'Conflicting transition using same idempotency key',
            idempotencyKey: 'idem_key_123',
          },
          superAdminOperator,
        ),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('getTransitionHistory', () => {
    it('should return transition logs for organization ordered by sequence desc', async () => {
      mockPrisma.organizationStateTransitionLog.findMany.mockResolvedValue([
        {
          id: 'log_2',
          organizationId: 'org_1',
          previousState: ControlState.PENDING,
          newState: ControlState.ACTIVE,
          reason: 'Initial activation',
          sequence: 2n,
          operatorId: 'op_1',
          operatorRole: 'PLATFORM_SUPER_ADMIN',
          createdAt: new Date(),
        },
      ]);

      const logs = await service.getTransitionHistory('org_1');
      expect(logs).toHaveLength(1);
      expect(logs[0].sequence).toBe('2');
      expect(logs[0].newState).toBe(ControlState.ACTIVE);
    });
  });
});
