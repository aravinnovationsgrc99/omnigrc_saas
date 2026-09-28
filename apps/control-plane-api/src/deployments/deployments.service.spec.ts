import { Test, TestingModule } from '@nestjs/testing';
import { DeploymentsService } from './deployments.service';
import { ControlPlanePrismaService } from '../prisma/prisma.service';
import { LicenseSigningService } from '../licenses/license-signing.service';
import { ControlPlaneAuditLogsService } from '../audit/audit-logs.service';
import { NotFoundException, BadRequestException, UnauthorizedException } from '@nestjs/common';
import {
  DeploymentModel,
  DeploymentEnvironment,
  ActivationState,
  InfrastructureOwner,
} from '@omnigrc/shared';
import * as bcrypt from 'bcrypt';

describe('DeploymentsService (CP-6.4 Operational Control)', () => {
  let service: DeploymentsService;
  let prisma: jest.Mocked<any>;
  let audit: jest.Mocked<any>;
  let signingService: jest.Mocked<any>;

  beforeEach(async () => {
    prisma = {
      $transaction: jest.fn((cb) => cb(prisma)),
      deployment: {
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      license: {
        update: jest.fn().mockResolvedValue({}),
      },
      controlPlaneAuditLog: {
        findMany: jest.fn(),
        create: jest.fn().mockResolvedValue({}),
      },
    };

    audit = {
      log: jest.fn().mockResolvedValue({}),
    };

    signingService = {
      signLicenseArtifact: jest.fn().mockReturnValue({
        formatVersion: '1.0',
        keyId: 'ed25519-key-1',
        algorithm: 'Ed25519',
        payload: { sequence: 5 },
        signature: 'sig_test_123',
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DeploymentsService,
        { provide: ControlPlanePrismaService, useValue: prisma },
        { provide: ControlPlaneAuditLogsService, useValue: audit },
        { provide: LicenseSigningService, useValue: signingService },
      ],
    }).compile();

    service = module.get<DeploymentsService>(DeploymentsService);
  });

  describe('createDeployment', () => {
    it('should create MSSP_SHARED deployment with ARAV infrastructure ownership and hashed secret', async () => {
      prisma.deployment.create.mockImplementationOnce(async ({ data }: any) => ({
        id: 'dep-mssp-1',
        organizationId: data.organizationId,
        customerId: data.customerId || null,
        commercialAgreementId: data.commercialAgreementId || null,
        deploymentModel: data.deploymentModel,
        environment: data.environment,
        version: data.version,
        activationState: data.activationState,
        infrastructureOwner: data.infrastructureOwner,
        registrationSecretHash: data.registrationSecretHash,
        licenseId: null,
        lastCheckInAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }));

      const res = await service.createDeployment({
        organizationId: 'org-acme',
        deploymentModel: DeploymentModel.MSSP_SHARED,
        environment: DeploymentEnvironment.PRODUCTION,
        version: '1.0.0',
      });

      expect(res.id).toBe('dep-mssp-1');
      expect(res.infrastructureOwner).toBe(InfrastructureOwner.ARAV);
      expect(res.activationState).toBe(ActivationState.PENDING);
      expect(res.registrationSecret).toBeDefined();
      expect(audit.log).toHaveBeenCalledWith('DEPLOYMENT_CREATED', 'Deployment', 'dep-mssp-1', expect.anything());
    });

    it('should create SELF_HOSTED deployment with CUSTOMER infrastructure ownership', async () => {
      prisma.deployment.create.mockImplementationOnce(async ({ data }: any) => ({
        id: 'dep-self-1',
        organizationId: data.organizationId,
        deploymentModel: data.deploymentModel,
        environment: data.environment,
        version: data.version,
        activationState: data.activationState,
        infrastructureOwner: data.infrastructureOwner,
        registrationSecretHash: data.registrationSecretHash,
        licenseId: null,
        lastCheckInAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }));

      const res = await service.createDeployment({
        organizationId: 'org-acme',
        deploymentModel: DeploymentModel.SELF_HOSTED,
      });

      expect(res.infrastructureOwner).toBe(InfrastructureOwner.CUSTOMER);
      expect(res.registrationSecret).toBeDefined();
    });
  });

  describe('findAll & findOne', () => {
    it('should return list of deployments filtered by query without exposing secrets', async () => {
      prisma.deployment.findMany.mockResolvedValueOnce([
        {
          id: 'dep-1',
          organizationId: 'org-1',
          deploymentModel: 'MSSP_SHARED',
          environment: 'PRODUCTION',
          version: '1.0.0',
          activationState: 'ACTIVE',
          infrastructureOwner: 'ARAV',
          registrationSecretHash: 'secret_hash_value',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      const res = await service.findAll({ organizationId: 'org-1' });

      expect(res).toHaveLength(1);
      expect(res[0].id).toBe('dep-1');
      expect((res[0] as any).registrationSecret).toBeUndefined();
      expect((res[0] as any).registrationSecretHash).toBeUndefined();
    });

    it('should throw NotFoundException if deployment is missing', async () => {
      prisma.deployment.findUnique.mockResolvedValueOnce(null);

      await expect(service.findOne('dep-nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('activate', () => {
    it('should verify secret, issue signed artifact, and transition state to ACTIVE', async () => {
      const rawSecret = 'secret_valid_12345';
      const secretHash = await bcrypt.hash(rawSecret, 10);

      prisma.deployment.findUnique.mockResolvedValueOnce({
        id: 'dep-1',
        organizationId: 'org-acme',
        activationState: 'PENDING',
        registrationSecretHash: secretHash,
        createdAt: new Date(),
        license: {
          id: 'lic-1',
          status: 'ACTIVE',
          product: 'OMNIGRC',
          startsAt: new Date(Date.now() - 3600000),
          expiresAt: new Date(Date.now() + 86400000),
          maxDeployments: 5,
          entitlements: [],
        },
      });

      prisma.deployment.update.mockResolvedValueOnce({
        id: 'dep-1',
        activationState: 'ACTIVE',
      });

      const res = await service.activate('dep-1', { registrationSecret: rawSecret });

      expect(res.success).toBe(true);
      expect(res.activationState).toBe(ActivationState.ACTIVE);
      expect(res.artifact).toBeDefined();
      expect(signingService.signLicenseArtifact).toHaveBeenCalled();
    });

    it('should reject activation if secret is invalid', async () => {
      const secretHash = await bcrypt.hash('secret_correct', 10);

      prisma.deployment.findUnique.mockResolvedValueOnce({
        id: 'dep-1',
        activationState: 'PENDING',
        registrationSecretHash: secretHash,
        license: { id: 'lic-1', status: 'ACTIVE' },
      });

      await expect(
        service.activate('dep-1', { registrationSecret: 'secret_wrong' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should reject activation for DECOMMISSIONED deployment', async () => {
      prisma.deployment.findUnique.mockResolvedValueOnce({
        id: 'dep-1',
        activationState: 'DECOMMISSIONED',
        registrationSecretHash: 'hash',
      });

      await expect(
        service.activate('dep-1', { registrationSecret: 'secret' }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('updateState', () => {
    it('should update state, increment license sequence, and log audit record with reason', async () => {
      prisma.deployment.findUnique.mockResolvedValueOnce({
        id: 'dep-1',
        organizationId: 'org-acme',
        licenseId: 'lic-100',
        activationState: 'ACTIVE',
      });

      prisma.deployment.update.mockResolvedValueOnce({
        id: 'dep-1',
        organizationId: 'org-acme',
        licenseId: 'lic-100',
        deploymentModel: 'MSSP_SHARED',
        environment: 'PRODUCTION',
        version: '1.0.0',
        activationState: 'SUSPENDED',
        infrastructureOwner: 'ARAV',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const res = await service.updateState('dep-1', {
        activationState: ActivationState.SUSPENDED,
        reason: 'Maintenance and security review suspension',
      });

      expect(res.activationState).toBe(ActivationState.SUSPENDED);
      expect(prisma.license.update).toHaveBeenCalledWith({
        where: { id: 'lic-100' },
        data: { sequence: { increment: 1 } },
      });
      expect(prisma.controlPlaneAuditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'DEPLOYMENT_STATE_CHANGED',
            entityId: 'dep-1',
            metadata: expect.objectContaining({
              previousState: 'ACTIVE',
              newState: 'SUSPENDED',
              reason: 'Maintenance and security review suspension',
            }),
          }),
        }),
      );
    });

    it('should increment license sequence when reactivating SUSPENDED -> ACTIVE', async () => {
      prisma.deployment.findUnique.mockResolvedValueOnce({
        id: 'dep-1',
        organizationId: 'org-acme',
        licenseId: 'lic-100',
        activationState: 'SUSPENDED',
      });

      prisma.deployment.update.mockResolvedValueOnce({
        id: 'dep-1',
        organizationId: 'org-acme',
        licenseId: 'lic-100',
        deploymentModel: 'MSSP_SHARED',
        environment: 'PRODUCTION',
        version: '1.0.0',
        activationState: 'ACTIVE',
        infrastructureOwner: 'ARAV',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const res = await service.updateState('dep-1', {
        activationState: ActivationState.ACTIVE,
        reason: 'Reactivating deployment after review',
      });

      expect(res.activationState).toBe(ActivationState.ACTIVE);
      expect(prisma.license.update).toHaveBeenCalledWith({
        where: { id: 'lic-100' },
        data: { sequence: { increment: 1 } },
      });
    });

    it('should prevent state mutation of DECOMMISSIONED deployment', async () => {
      prisma.deployment.findUnique.mockResolvedValueOnce({
        id: 'dep-1',
        activationState: 'DECOMMISSIONED',
      });

      await expect(
        service.updateState('dep-1', { activationState: ActivationState.ACTIVE }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('getDeploymentHistory', () => {
    it('should fetch audit history logs for deployment', async () => {
      prisma.deployment.findUnique.mockResolvedValueOnce({ id: 'dep-1' });
      prisma.controlPlaneAuditLog.findMany.mockResolvedValueOnce([
        {
          id: 'log-1',
          actorId: 'op-1',
          actorRole: 'OPERATIONS_ENGINEER',
          action: 'DEPLOYMENT_STATE_CHANGED',
          entityType: 'Deployment',
          entityId: 'dep-1',
          createdAt: new Date(),
        },
      ]);

      const history = await service.getDeploymentHistory('dep-1');

      expect(history).toHaveLength(1);
      expect(history[0].action).toBe('DEPLOYMENT_STATE_CHANGED');
    });
  });
});
