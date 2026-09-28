import { Test, TestingModule } from '@nestjs/testing';
import { BreakGlassService } from './break-glass.service';
import { ControlPlanePrismaService } from '../prisma/prisma.service';
import { OperatorSecurityService } from '../auth/operator-security.service';
import { ControlPlaneAuditLogsService } from '../audit/audit-logs.service';
import { OrganizationControlService } from '../organization-control/organization-control.service';
import { ServiceControlService } from '../service-control/service-control.service';
import { DeploymentsService } from '../deployments/deployments.service';
import { LicensesService } from '../licenses/licenses.service';
import {
  NotFoundException,
  BadRequestException,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { ControlState, ServiceStateEnum } from '@prisma/control-plane-client';
import {
  BreakGlassStatus,
  BreakGlassOperation,
  ActivationState,
  LicenseStatus,
} from '@omnigrc/shared';

describe('BreakGlassService (CP-6.5.1 Break-Glass Forensic Hardening & Verification)', () => {
  let service: BreakGlassService;
  let prisma: jest.Mocked<any>;
  let operatorSecurityService: jest.Mocked<any>;
  let auditLogsService: jest.Mocked<any>;
  let orgControlService: jest.Mocked<any>;
  let serviceControlService: jest.Mocked<any>;
  let deploymentsService: jest.Mocked<any>;
  let licensesService: jest.Mocked<any>;

  beforeEach(async () => {
    prisma = {
      operator: {
        findUnique: jest.fn(),
      },
      deployment: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
      },
      breakGlassSession: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
      },
    };

    operatorSecurityService = {
      verifyTotpCode: jest.fn().mockReturnValue(true),
    };

    auditLogsService = {
      log: jest.fn().mockResolvedValue({}),
    };

    orgControlService = {
      transitionState: jest.fn().mockResolvedValue({ organizationId: 'org-1', state: ControlState.SUSPENDED }),
    };

    serviceControlService = {
      setOrganizationServiceOverride: jest.fn().mockResolvedValue({ serviceCode: 'AI_AGENT', overrideState: ServiceStateEnum.DISABLED }),
      updateGlobalServiceState: jest.fn().mockResolvedValue({ serviceCode: 'AI_AGENT', state: ServiceStateEnum.DISABLED }),
    };

    deploymentsService = {
      updateState: jest.fn().mockResolvedValue({ id: 'dep-1', activationState: ActivationState.SUSPENDED }),
      getLicenseArtifact: jest.fn().mockResolvedValue({
        success: true,
        deploymentId: 'dep-1',
        activationState: ActivationState.ACTIVE,
        artifact: {
          formatVersion: '1.0',
          keyId: 'arav-license-v1-2026',
          algorithm: 'Ed25519',
          payload: {
            licenseId: 'lic-1',
            status: LicenseStatus.ACTIVE,
            sequence: 5,
            deploymentId: 'dep-1',
            organizationId: 'org-acme',
            deploymentState: 'ACTIVE',
            entitlements: [{ code: 'ISO27001', enabled: true }],
          },
        },
      }),
    };

    licensesService = {
      findOne: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BreakGlassService,
        { provide: ControlPlanePrismaService, useValue: prisma },
        { provide: OperatorSecurityService, useValue: operatorSecurityService },
        { provide: ControlPlaneAuditLogsService, useValue: auditLogsService },
        { provide: OrganizationControlService, useValue: orgControlService },
        { provide: ServiceControlService, useValue: serviceControlService },
        { provide: DeploymentsService, useValue: deploymentsService },
        { provide: LicensesService, useValue: licensesService },
      ],
    }).compile();

    service = module.get<BreakGlassService>(BreakGlassService);
  });

  describe('requestSession', () => {
    it('should create standard Break-Glass session in REQUESTED state with valid TOTP MFA', async () => {
      prisma.operator.findUnique.mockResolvedValueOnce({
        id: 'op-1',
        fullName: 'Operator One',
        totpSecret: 'SECRET_TOTP',
        mfaEnabled: true,
      });

      prisma.breakGlassSession.create.mockResolvedValueOnce({
        id: 'bg-100',
        requesterOperatorId: 'op-1',
        status: 'REQUESTED',
        operation: 'EMERGENCY_ORG_SUSPEND',
        reason: 'Emergency security audit and incident investigation',
        targetOrganizationId: 'org-acme',
        expiresAt: new Date(Date.now() + 900000),
        isSingleOperatorEmergency: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        requesterOperator: { fullName: 'Operator One' },
      });

      const res = await service.requestSession('op-1', {
        operation: BreakGlassOperation.EMERGENCY_ORG_SUSPEND,
        reason: 'Emergency security audit and incident investigation',
        targetOrganizationId: 'org-acme',
        totpCode: '123456',
      });

      expect(res.id).toBe('bg-100');
      expect(res.status).toBe(BreakGlassStatus.REQUESTED);
      expect(operatorSecurityService.verifyTotpCode).toHaveBeenCalledWith('SECRET_TOTP', '123456');
      expect(auditLogsService.log).toHaveBeenCalledWith(
        'BREAK_GLASS_SESSION_REQUESTED',
        'BreakGlassSession',
        'bg-100',
        expect.anything(),
      );
    });

    it('should reject request if MFA TOTP code is invalid', async () => {
      prisma.operator.findUnique.mockResolvedValueOnce({
        id: 'op-1',
        totpSecret: 'SECRET_TOTP',
        mfaEnabled: true,
      });
      operatorSecurityService.verifyTotpCode.mockReturnValueOnce(false);

      await expect(
        service.requestSession('op-1', {
          operation: BreakGlassOperation.EMERGENCY_ORG_SUSPEND,
          reason: 'Reason string for testing at least 10 chars',
          targetOrganizationId: 'org-acme',
          totpCode: '000000',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should reject request if reason is shorter than 10 characters', async () => {
      prisma.operator.findUnique.mockResolvedValueOnce({
        id: 'op-1',
        totpSecret: 'SECRET_TOTP',
        mfaEnabled: true,
      });

      await expect(
        service.requestSession('op-1', {
          operation: BreakGlassOperation.EMERGENCY_ORG_SUSPEND,
          reason: 'Short',
          targetOrganizationId: 'org-acme',
          totpCode: '123456',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should support single-operator emergency mode with typed confirmation', async () => {
      prisma.operator.findUnique.mockResolvedValueOnce({
        id: 'op-1',
        totpSecret: 'SECRET_TOTP',
        mfaEnabled: true,
      });

      prisma.breakGlassSession.create.mockResolvedValueOnce({
        id: 'bg-101',
        requesterOperatorId: 'op-1',
        approverOperatorId: 'op-1',
        status: 'APPROVED',
        operation: 'EMERGENCY_ORG_SUSPEND',
        reason: 'Severe active security breach incident requiring immediate lockdown',
        targetOrganizationId: 'org-acme',
        isSingleOperatorEmergency: true,
        postEventReviewStatus: 'PENDING_REVIEW',
        expiresAt: new Date(Date.now() + 900000),
        approvedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const res = await service.requestSession('op-1', {
        operation: BreakGlassOperation.EMERGENCY_ORG_SUSPEND,
        reason: 'Severe active security breach incident requiring immediate lockdown',
        targetOrganizationId: 'org-acme',
        isSingleOperatorEmergency: true,
        emergencyConfirmationText: 'CONFIRM EMERGENCY OVERRIDE ORG-ACME',
        totpCode: '123456',
      });

      expect(res.status).toBe(BreakGlassStatus.APPROVED);
      expect(res.isSingleOperatorEmergency).toBe(true);
      expect(res.postEventReviewStatus).toBe('PENDING_REVIEW');
    });

    it('should reject single-operator emergency mode if typed confirmation text does not match target', async () => {
      prisma.operator.findUnique.mockResolvedValueOnce({
        id: 'op-1',
        totpSecret: 'SECRET_TOTP',
        mfaEnabled: true,
      });

      await expect(
        service.requestSession('op-1', {
          operation: BreakGlassOperation.EMERGENCY_ORG_SUSPEND,
          reason: 'Severe active security breach incident requiring immediate lockdown',
          targetOrganizationId: 'org-acme',
          isSingleOperatorEmergency: true,
          emergencyConfirmationText: 'CONFIRM WRONG OVERRIDE',
          totpCode: '123456',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('approveSession (Separation of Duties)', () => {
    it('should reject self-approval when requester attempts to approve their own request', async () => {
      prisma.breakGlassSession.findUnique.mockResolvedValueOnce({
        id: 'bg-100',
        requesterOperatorId: 'op-1',
        status: 'REQUESTED',
        expiresAt: new Date(Date.now() + 900000),
      });

      await expect(
        service.approveSession('bg-100', 'op-1', { totpCode: '123456' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should allow second operator to approve a requested Break-Glass session', async () => {
      prisma.breakGlassSession.findUnique.mockResolvedValueOnce({
        id: 'bg-100',
        requesterOperatorId: 'op-1',
        status: 'REQUESTED',
        operation: 'EMERGENCY_ORG_SUSPEND',
        expiresAt: new Date(Date.now() + 900000),
      });

      prisma.operator.findUnique.mockResolvedValueOnce({
        id: 'op-2',
        totpSecret: 'SECRET_TOTP_2',
        mfaEnabled: true,
      });

      prisma.breakGlassSession.update.mockResolvedValueOnce({
        id: 'bg-100',
        requesterOperatorId: 'op-1',
        approverOperatorId: 'op-2',
        status: 'APPROVED',
        approvedAt: new Date(),
        expiresAt: new Date(Date.now() + 900000),
      });

      const res = await service.approveSession('bg-100', 'op-2', { totpCode: '654321' });

      expect(res.status).toBe(BreakGlassStatus.APPROVED);
      expect(res.approverOperatorId).toBe('op-2');
      expect(auditLogsService.log).toHaveBeenCalledWith(
        'BREAK_GLASS_SESSION_APPROVED',
        'BreakGlassSession',
        'bg-100',
        expect.anything(),
      );
    });
  });

  describe('executeAction & Scope Forensics', () => {
    it('should execute EMERGENCY_ORG_SUSPEND action on an approved break-glass session', async () => {
      prisma.breakGlassSession.findUnique.mockResolvedValueOnce({
        id: 'bg-100',
        status: 'APPROVED',
        operation: 'EMERGENCY_ORG_SUSPEND',
        targetOrganizationId: 'org-acme',
        reason: 'Critical incident lockdown',
        expiresAt: new Date(Date.now() + 900000),
      });

      prisma.breakGlassSession.update.mockResolvedValueOnce({
        id: 'bg-100',
        status: 'EXECUTED',
        executorOperatorId: 'op-1',
        executedAt: new Date(),
        expiresAt: new Date(Date.now() + 900000),
      });

      const res = await service.executeAction('bg-100', 'op-1', {});

      expect(res.success).toBe(true);
      expect(orgControlService.transitionState).toHaveBeenCalledWith(
        'org-acme',
        expect.objectContaining({ targetState: ControlState.SUSPENDED }),
        expect.anything(),
      );
      expect(auditLogsService.log).toHaveBeenCalledWith(
        'BREAK_GLASS_ACTION_EXECUTED',
        'BreakGlassSession',
        'bg-100',
        expect.anything(),
      );
    });

    it('should execute EMERGENCY_DEPLOYMENT_SUSPEND when target deployment matches session organization', async () => {
      prisma.breakGlassSession.findUnique.mockResolvedValueOnce({
        id: 'bg-102',
        status: 'APPROVED',
        operation: 'EMERGENCY_DEPLOYMENT_SUSPEND',
        targetOrganizationId: 'org-acme',
        targetDeploymentId: 'dep-99',
        reason: 'Rogue deployment suspension',
        expiresAt: new Date(Date.now() + 900000),
      });

      prisma.deployment.findUnique.mockResolvedValueOnce({
        id: 'dep-99',
        organizationId: 'org-acme',
      });

      prisma.breakGlassSession.update.mockResolvedValueOnce({
        id: 'bg-102',
        status: 'EXECUTED',
        executorOperatorId: 'op-1',
        executedAt: new Date(),
        expiresAt: new Date(Date.now() + 900000),
      });

      const res = await service.executeAction('bg-102', 'op-1', {});

      expect(res.success).toBe(true);
      expect(deploymentsService.updateState).toHaveBeenCalledWith(
        'dep-99',
        expect.objectContaining({ activationState: ActivationState.SUSPENDED }),
      );
    });

    it('should reject execution when target deployment belongs to another organization (Cross-Tenant Scope Violation)', async () => {
      prisma.breakGlassSession.findUnique.mockResolvedValueOnce({
        id: 'bg-103',
        status: 'APPROVED',
        operation: 'EMERGENCY_DEPLOYMENT_SUSPEND',
        targetOrganizationId: 'org-A',
        targetDeploymentId: 'dep-B',
        reason: 'Unauthorized cross-tenant attempt',
        expiresAt: new Date(Date.now() + 900000),
      });

      prisma.deployment.findUnique.mockResolvedValueOnce({
        id: 'dep-B',
        organizationId: 'org-B', // Belongs to Org B!
      });

      await expect(service.executeAction('bg-103', 'op-1', {})).rejects.toThrow(ForbiddenException);
    });

    it('should execute EMERGENCY_LICENSE_RECONCILE and return authoritative artifact', async () => {
      prisma.breakGlassSession.findUnique.mockResolvedValueOnce({
        id: 'bg-104',
        status: 'APPROVED',
        operation: 'EMERGENCY_LICENSE_RECONCILE',
        targetOrganizationId: 'org-acme',
        targetDeploymentId: 'dep-1',
        reason: 'License synchronization recovery',
        expiresAt: new Date(Date.now() + 900000),
      });

      prisma.deployment.findUnique.mockResolvedValueOnce({
        id: 'dep-1',
        organizationId: 'org-acme',
      });

      prisma.breakGlassSession.update.mockResolvedValueOnce({
        id: 'bg-104',
        status: 'EXECUTED',
        executorOperatorId: 'op-1',
        executedAt: new Date(),
        expiresAt: new Date(Date.now() + 900000),
      });

      const res = await service.executeAction('bg-104', 'op-1', {});

      expect(res.success).toBe(true);
      expect(deploymentsService.getLicenseArtifact).toHaveBeenCalledWith('dep-1');
    });

    it('should handle idempotency and return executed result on duplicate execution request', async () => {
      prisma.breakGlassSession.findUnique.mockResolvedValueOnce({
        id: 'bg-100',
        status: 'EXECUTED',
        operation: 'EMERGENCY_ORG_SUSPEND',
        targetOrganizationId: 'org-acme',
        expiresAt: new Date(Date.now() + 900000),
      });

      const res = await service.executeAction('bg-100', 'op-1', {});

      expect(res.success).toBe(true);
      expect(res.result.message).toContain('Action already executed idempotently');
    });

    it('should reject execution of expired break-glass session', async () => {
      prisma.breakGlassSession.findUnique.mockResolvedValueOnce({
        id: 'bg-100',
        status: 'APPROVED',
        expiresAt: new Date(Date.now() - 1000),
      });

      prisma.breakGlassSession.update.mockResolvedValueOnce({});

      await expect(service.executeAction('bg-100', 'op-1', {})).rejects.toThrow(BadRequestException);
    });
  });

  describe('reviewEmergencySession & Separation of Duties', () => {
    it('should perform mandatory post-event review when executed by authorized SECURITY_AUDIT operator', async () => {
      prisma.breakGlassSession.findUnique.mockResolvedValueOnce({
        id: 'bg-101',
        isSingleOperatorEmergency: true,
        postEventReviewStatus: 'PENDING_REVIEW',
        requesterOperatorId: 'op-exec',
        executorOperatorId: 'op-exec',
      });

      prisma.operator.findUnique.mockResolvedValueOnce({
        id: 'op-auditor',
        role: 'SECURITY_AUDIT',
      });

      prisma.breakGlassSession.update.mockResolvedValueOnce({
        id: 'bg-101',
        isSingleOperatorEmergency: true,
        postEventReviewStatus: 'REVIEWED_APPROVED',
        postEventReviewedBy: 'op-auditor',
        postEventReviewedAt: new Date(),
        postEventNotes: 'Reviewed incident logs. Single operator emergency intervention justified.',
      });

      const res = await service.reviewEmergencySession('bg-101', 'op-auditor', {
        postEventReviewStatus: 'REVIEWED_APPROVED',
        notes: 'Reviewed incident logs. Single operator emergency intervention justified.',
      });

      expect(res.postEventReviewStatus).toBe('REVIEWED_APPROVED');
      expect(auditLogsService.log).toHaveBeenCalledWith(
        'BREAK_GLASS_POST_EVENT_REVIEWED',
        'BreakGlassSession',
        'bg-101',
        expect.anything(),
      );
    });

    it('should reject post-event review when executor attempts to self-review their own emergency action', async () => {
      prisma.breakGlassSession.findUnique.mockResolvedValueOnce({
        id: 'bg-101',
        isSingleOperatorEmergency: true,
        postEventReviewStatus: 'PENDING_REVIEW',
        requesterOperatorId: 'op-exec',
        executorOperatorId: 'op-exec',
      });

      prisma.operator.findUnique.mockResolvedValueOnce({
        id: 'op-exec',
        role: 'PLATFORM_SUPER_ADMIN',
      });

      await expect(
        service.reviewEmergencySession('bg-101', 'op-exec', {
          postEventReviewStatus: 'REVIEWED_APPROVED',
          notes: 'Self review attempt',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should reject post-event review when attempted by unauthorized role', async () => {
      prisma.breakGlassSession.findUnique.mockResolvedValueOnce({
        id: 'bg-101',
        isSingleOperatorEmergency: true,
        postEventReviewStatus: 'PENDING_REVIEW',
        requesterOperatorId: 'op-exec',
        executorOperatorId: 'op-exec',
      });

      prisma.operator.findUnique.mockResolvedValueOnce({
        id: 'op-dev',
        role: 'OPERATIONS_ENGINEER',
      });

      await expect(
        service.reviewEmergencySession('bg-101', 'op-dev', {
          postEventReviewStatus: 'REVIEWED_APPROVED',
          notes: 'Unauthorized review attempt',
        }),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
