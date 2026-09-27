import { Test, TestingModule } from '@nestjs/testing';
import { LicensesService } from './licenses.service';
import { ControlPlanePrismaService } from '../prisma/prisma.service';
import { ControlPlaneAuditLogsService } from '../audit/audit-logs.service';
import { LicenseSigningService } from './license-signing.service';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { LicenseStatus, LicenseProduct } from '@omnigrc/shared';

describe('LicensesService (CP-5 Commercial Control Lifecycle)', () => {
  let service: LicensesService;
  let prisma: jest.Mocked<any>;
  let audit: jest.Mocked<any>;
  let signingService: jest.Mocked<any>;

  beforeEach(async () => {
    prisma = {
      $transaction: jest.fn((cb) => cb(prisma)),
      commercialAgreement: { findUnique: jest.fn() },
      license: {
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      deployment: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        count: jest.fn(),
        update: jest.fn(),
      },
      entitlement: {
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
    };

    audit = {
      log: jest.fn().mockResolvedValue({}),
    };

    signingService = {
      signLicenseArtifact: jest.fn().mockReturnValue({
        formatVersion: '1.0',
        keyId: 'key-1',
        algorithm: 'Ed25519',
        payload: { sequence: 1 },
        signature: 'sig-123',
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LicensesService,
        { provide: ControlPlanePrismaService, useValue: prisma },
        { provide: ControlPlaneAuditLogsService, useValue: audit },
        { provide: LicenseSigningService, useValue: signingService },
      ],
    }).compile();

    service = module.get<LicensesService>(LicensesService);
  });

  describe('createLicense', () => {
    it('should create a new commercial license when agreement exists', async () => {
      prisma.commercialAgreement.findUnique.mockResolvedValueOnce({ id: 'agr-1' });
      prisma.license.create.mockResolvedValueOnce({
        id: 'lic-1',
        commercialAgreementId: 'agr-1',
        product: 'OMNIGRC',
        status: 'TRIAL',
        sequence: BigInt(1),
        issuedAt: new Date(),
        startsAt: new Date(),
        expiresAt: new Date(Date.now() + 86400000),
        maxDeployments: 2,
        createdAt: new Date(),
        updatedAt: new Date(),
        entitlements: [],
      });

      const res = await service.createLicense({
        commercialAgreementId: 'agr-1',
        startsAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
        maxDeployments: 2,
      });

      expect(res.id).toBe('lic-1');
      expect(audit.log).toHaveBeenCalledWith('LICENSE_CREATED', 'License', 'lic-1', expect.anything());
    });

    it('should throw NotFoundException if commercial agreement does not exist', async () => {
      prisma.commercialAgreement.findUnique.mockResolvedValueOnce(null);

      await expect(
        service.createLicense({
          commercialAgreementId: 'agr-nonexistent',
          startsAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 86400000).toISOString(),
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateLicense', () => {
    it('should update commercial metadata and increment sequence', async () => {
      prisma.license.findUnique
        .mockResolvedValueOnce({ id: 'lic-1', status: 'ACTIVE', expiresAt: new Date(Date.now() + 86400000) })
        .mockResolvedValueOnce({
          id: 'lic-1',
          commercialAgreementId: 'agr-1',
          product: 'OMNIGRC',
          status: 'ACTIVE',
          sequence: BigInt(2),
          issuedAt: new Date(),
          startsAt: new Date(),
          expiresAt: new Date(Date.now() + 86400000),
          maxDeployments: 5,
          createdAt: new Date(),
          updatedAt: new Date(),
          entitlements: [],
          deployments: [],
        });

      prisma.license.update.mockResolvedValueOnce({
        id: 'lic-1',
        sequence: BigInt(2),
      });

      const res = await service.updateLicense('lic-1', { maxDeployments: 5 });

      expect(prisma.license.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'lic-1' },
          data: expect.objectContaining({
            maxDeployments: 5,
            sequence: { increment: 1 },
          }),
        }),
      );
      expect(audit.log).toHaveBeenCalledWith('LICENSE_UPDATED', 'License', 'lic-1', expect.anything());
    });
  });

  describe('suspendLicense, reactivateLicense, revokeLicense', () => {
    it('should suspend an active license and log audit', async () => {
      prisma.license.findUnique
        .mockResolvedValueOnce({ id: 'lic-1', status: 'ACTIVE', expiresAt: new Date(Date.now() + 86400000) })
        .mockResolvedValueOnce({
          id: 'lic-1',
          commercialAgreementId: 'agr-1',
          product: 'OMNIGRC',
          status: 'SUSPENDED',
          sequence: BigInt(2),
          issuedAt: new Date(),
          startsAt: new Date(),
          expiresAt: new Date(Date.now() + 86400000),
          maxDeployments: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
          entitlements: [],
          deployments: [],
        });

      prisma.license.update.mockResolvedValueOnce({ id: 'lic-1', sequence: BigInt(2) });

      const res = await service.suspendLicense('lic-1', 'Payment delinquent');

      expect(res.status).toBe(LicenseStatus.SUSPENDED);
      expect(audit.log).toHaveBeenCalledWith('LICENSE_SUSPENDED', 'License', 'lic-1', expect.anything());
    });

    it('should reactivate a suspended non-expired license', async () => {
      prisma.license.findUnique
        .mockResolvedValueOnce({ id: 'lic-1', status: 'SUSPENDED', expiresAt: new Date(Date.now() + 86400000) })
        .mockResolvedValueOnce({
          id: 'lic-1',
          commercialAgreementId: 'agr-1',
          product: 'OMNIGRC',
          status: 'ACTIVE',
          sequence: BigInt(3),
          issuedAt: new Date(),
          startsAt: new Date(),
          expiresAt: new Date(Date.now() + 86400000),
          maxDeployments: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
          entitlements: [],
          deployments: [],
        });

      prisma.license.update.mockResolvedValueOnce({ id: 'lic-1', sequence: BigInt(3) });

      const res = await service.reactivateLicense('lic-1', 'Payment settled');

      expect(res.status).toBe(LicenseStatus.ACTIVE);
      expect(audit.log).toHaveBeenCalledWith('LICENSE_REACTIVATED', 'License', 'lic-1', expect.anything());
    });

    it('should reject reactivating a REVOKED license', async () => {
      prisma.license.findUnique.mockResolvedValueOnce({
        id: 'lic-1',
        status: 'REVOKED',
        expiresAt: new Date(Date.now() + 86400000),
      });

      await expect(service.reactivateLicense('lic-1')).rejects.toThrow(BadRequestException);
    });

    it('should revoke a license and set terminal state', async () => {
      prisma.license.findUnique
        .mockResolvedValueOnce({ id: 'lic-1', status: 'ACTIVE', expiresAt: new Date(Date.now() + 86400000) })
        .mockResolvedValueOnce({
          id: 'lic-1',
          commercialAgreementId: 'agr-1',
          product: 'OMNIGRC',
          status: 'REVOKED',
          sequence: BigInt(4),
          issuedAt: new Date(),
          startsAt: new Date(),
          expiresAt: new Date(Date.now() + 86400000),
          maxDeployments: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
          entitlements: [],
          deployments: [],
        });

      prisma.license.update.mockResolvedValueOnce({ id: 'lic-1', sequence: BigInt(4) });

      const res = await service.revokeLicense('lic-1', 'Contract breach');

      expect(res.status).toBe(LicenseStatus.REVOKED);
      expect(audit.log).toHaveBeenCalledWith('LICENSE_REVOKED', 'License', 'lic-1', expect.anything());
    });
  });

  describe('associateDeployment & disassociateDeployment', () => {
    it('should enforce maxDeployments cap', async () => {
      prisma.license.findUnique.mockResolvedValueOnce({
        id: 'lic-1',
        maxDeployments: 1,
        commercialAgreement: { customerId: 'cust-1', id: 'agr-1' },
      });
      prisma.deployment.findUnique.mockResolvedValueOnce({
        id: 'dep-2',
        customerId: 'cust-1',
        commercialAgreementId: 'agr-1',
        licenseId: 'lic-other',
      });
      prisma.deployment.count.mockResolvedValueOnce(1); // Already 1 associated

      await expect(service.associateDeployment('lic-1', 'dep-2')).rejects.toThrow(BadRequestException);
    });

    it('should reject cross-customer deployment association', async () => {
      prisma.license.findUnique.mockResolvedValueOnce({
        id: 'lic-1',
        maxDeployments: 5,
        commercialAgreement: { customerId: 'cust-1', id: 'agr-1' },
      });
      prisma.deployment.findUnique.mockResolvedValueOnce({
        id: 'dep-2',
        customerId: 'cust-DIFFERENT',
        commercialAgreementId: 'agr-1',
      });

      await expect(service.associateDeployment('lic-1', 'dep-2')).rejects.toThrow(BadRequestException);
    });
  });

  describe('grantOrUpdateEntitlement & revokeEntitlement', () => {
    it('should grant a new entitlement and increment license sequence', async () => {
      prisma.license.findUnique.mockResolvedValueOnce({ id: 'lic-1' });
      prisma.entitlement.findFirst.mockResolvedValueOnce(null);
      prisma.entitlement.create.mockResolvedValueOnce({
        id: 'ent-1',
        licenseId: 'lic-1',
        code: 'ISO27001',
        name: 'ISO 27001 Framework',
        enabled: true,
      });

      const res = await service.grantOrUpdateEntitlement('lic-1', {
        code: 'ISO27001',
        name: 'ISO 27001 Framework',
      });

      expect(res.code).toBe('ISO27001');
      expect(prisma.license.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'lic-1' },
          data: { sequence: { increment: 1 } },
        }),
      );
      expect(audit.log).toHaveBeenCalledWith('ENTITLEMENT_CREATED', 'Entitlement', 'ent-1', expect.anything());
    });

    it('should revoke an existing entitlement and increment sequence', async () => {
      prisma.entitlement.findFirst.mockResolvedValueOnce({
        id: 'ent-1',
        licenseId: 'lic-1',
        code: 'ISO27001',
        enabled: true,
      });
      prisma.entitlement.update.mockResolvedValueOnce({
        id: 'ent-1',
        licenseId: 'lic-1',
        code: 'ISO27001',
        enabled: false,
      });

      const res = await service.revokeEntitlement('lic-1', 'ISO27001');

      expect(res.enabled).toBe(false);
      expect(prisma.license.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'lic-1' },
          data: { sequence: { increment: 1 } },
        }),
      );
      expect(audit.log).toHaveBeenCalledWith('ENTITLEMENT_REVOKED', 'Entitlement', 'ent-1', expect.anything());
    });

    it('should suspend an active entitlement via suspendEntitlement', async () => {
      prisma.entitlement.findFirst.mockResolvedValueOnce({
        id: 'ent-1',
        licenseId: 'lic-1',
        code: 'SOC2',
        enabled: true,
      });
      prisma.entitlement.update.mockResolvedValueOnce({
        id: 'ent-1',
        licenseId: 'lic-1',
        code: 'SOC2',
        enabled: false,
      });

      const res = await service.suspendEntitlement('lic-1', 'SOC2');

      expect(res.enabled).toBe(false);
      expect(prisma.license.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'lic-1' },
          data: { sequence: { increment: 1 } },
        }),
      );
      expect(audit.log).toHaveBeenCalledWith('ENTITLEMENT_SUSPENDED', 'Entitlement', 'ent-1', expect.anything());
    });

    it('should reactivate a suspended entitlement via reactivateEntitlement', async () => {
      prisma.entitlement.findFirst.mockResolvedValueOnce({
        id: 'ent-1',
        licenseId: 'lic-1',
        code: 'SOC2',
        enabled: false,
      });
      prisma.entitlement.update.mockResolvedValueOnce({
        id: 'ent-1',
        licenseId: 'lic-1',
        code: 'SOC2',
        enabled: true,
      });

      const res = await service.reactivateEntitlement('lic-1', 'SOC2');

      expect(res.enabled).toBe(true);
      expect(prisma.license.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'lic-1' },
          data: { sequence: { increment: 1 } },
        }),
      );
      expect(audit.log).toHaveBeenCalledWith('ENTITLEMENT_REACTIVATED', 'Entitlement', 'ent-1', expect.anything());
    });
  });
});

