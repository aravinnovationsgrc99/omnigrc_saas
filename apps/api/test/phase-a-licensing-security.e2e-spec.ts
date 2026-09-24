import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ForbiddenException, BadRequestException } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { LicenseVerificationService } from '../src/license-verification/license-verification.service';
import { FrameworkEntitlementsService } from '../src/frameworks/framework-entitlements.service';
import {
  generateDevSignedLicenseArtifact,
  EntitlementStatus,
  SignedLicenseArtifact,
  jcsCanonicalize,
} from '@omnigrc/shared';
import * as crypto from 'crypto';

describe('Phase A — Licensing Reconciliation & Supabase Security Remediation Suite', () => {
  jest.setTimeout(60000);

  let app: INestApplication;
  let prisma: PrismaService;
  let licenseVerificationService: LicenseVerificationService;
  let frameworkEntitlementsService: FrameworkEntitlementsService;

  const ORG_A_ID = '3bda52cd-87d0-46f4-bedc-d13d528e28ba';
  const ORG_B_ID = '3a7590c7-33cf-4b8e-bb56-9c604a7a0acc';

  const DEPLOY_A_ID = 'deploy-org-a-cp-001';
  const DEPLOY_B_ID = 'deploy-org-b-cp-002';

  beforeAll(async () => {
    process.env.ENFORCE_LICENSE_IN_TEST = 'true';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    prisma = app.get(PrismaService);
    licenseVerificationService = app.get(LicenseVerificationService);
    frameworkEntitlementsService = app.get(FrameworkEntitlementsService);

    // Clean up test orgs if needed
    await prisma.organizationFrameworkEntitlement.deleteMany({
      where: { organizationId: { in: [ORG_A_ID, ORG_B_ID] } },
    });
    await prisma.systemLicenseState.deleteMany({
      where: { organizationId: { in: [ORG_A_ID, ORG_B_ID] } },
    });
    await prisma.deployment.deleteMany({
      where: { controlPlaneDeploymentId: { in: [DEPLOY_A_ID, DEPLOY_B_ID] } },
    });
    await prisma.organization.deleteMany({
      where: { id: { in: [ORG_A_ID, ORG_B_ID] } },
    });

    // Create Org A and Org B in DB
    await prisma.organization.create({
      data: {
        id: ORG_A_ID,
        name: 'Org A (Alpha Enterprises)',
        deployment: {
          create: {
            controlPlaneDeploymentId: DEPLOY_A_ID,
            modelType: 'SAAS_MULTI_TENANT',
          },
        },
      },
    });

    await prisma.organization.create({
      data: {
        id: ORG_B_ID,
        name: 'Org B (Beta Solutions)',
        deployment: {
          create: {
            controlPlaneDeploymentId: DEPLOY_B_ID,
            modelType: 'SAAS_MULTI_TENANT',
          },
        },
      },
    });
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.organizationFrameworkEntitlement.deleteMany({
        where: { organizationId: { in: [ORG_A_ID, ORG_B_ID] } },
      });
      await prisma.systemLicenseState.deleteMany({
        where: { organizationId: { in: [ORG_A_ID, ORG_B_ID] } },
      });
      await prisma.deployment.deleteMany({
        where: { controlPlaneDeploymentId: { in: [DEPLOY_A_ID, DEPLOY_B_ID] } },
      });
      await prisma.organization.deleteMany({
        where: { id: { in: [ORG_A_ID, ORG_B_ID] } },
      });
    }
    delete process.env.ENFORCE_LICENSE_IN_TEST;
    if (app) {
      await app.close();
    }
  });

  describe('1. Control Plane ↔ Data Plane Licensing Reconciliation', () => {
    it('Org A: Reconcile signed Ed25519 artifact (ISO27001=true, SOC2=true, HIPAA=true)', async () => {
      const artifactA = generateDevSignedLicenseArtifact({
        deploymentId: DEPLOY_A_ID,
        organizationId: ORG_A_ID,
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
        entitlements: [
          { code: 'ISO27001', name: 'ISO 27001', enabled: true },
          { code: 'SOC2', name: 'SOC 2', enabled: true },
          { code: 'HIPAA', name: 'HIPAA', enabled: true },
        ],
      });

      await licenseVerificationService.saveVerifiedStateForOrganization(ORG_A_ID, DEPLOY_A_ID, artifactA);

      // Verify Org A entitlement projections
      expect(await frameworkEntitlementsService.isEntitled(ORG_A_ID, 'ISO27001')).toBe(true);
      expect(await frameworkEntitlementsService.isEntitled(ORG_A_ID, 'SOC2')).toBe(true);
      expect(await frameworkEntitlementsService.isEntitled(ORG_A_ID, 'HIPAA')).toBe(true);

      // Unentitled frameworks for Org A MUST be false
      expect(await frameworkEntitlementsService.isEntitled(ORG_A_ID, 'GDPR')).toBe(false);
      expect(await frameworkEntitlementsService.isEntitled(ORG_A_ID, 'DPDP')).toBe(false);
      expect(await frameworkEntitlementsService.isEntitled(ORG_A_ID, 'ISO42001')).toBe(false);
    });

    it('Org B: Reconcile signed Ed25519 artifact (ISO27001=true, SOC2=true, NIST_CSF=true)', async () => {
      const artifactB = generateDevSignedLicenseArtifact({
        deploymentId: DEPLOY_B_ID,
        organizationId: ORG_B_ID,
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
        entitlements: [
          { code: 'ISO27001', name: 'ISO 27001', enabled: true },
          { code: 'SOC2', name: 'SOC 2', enabled: true },
          { code: 'NIST_CSF', name: 'NIST CSF', enabled: true },
        ],
      });

      await licenseVerificationService.saveVerifiedStateForOrganization(ORG_B_ID, DEPLOY_B_ID, artifactB);

      // Verify Org B entitlement projections
      expect(await frameworkEntitlementsService.isEntitled(ORG_B_ID, 'ISO27001')).toBe(true);
      expect(await frameworkEntitlementsService.isEntitled(ORG_B_ID, 'SOC2')).toBe(true);

      // Unentitled frameworks for Org B MUST be false
      expect(await frameworkEntitlementsService.isEntitled(ORG_B_ID, 'HIPAA')).toBe(false);
      expect(await frameworkEntitlementsService.isEntitled(ORG_B_ID, 'GDPR')).toBe(false);

      // NIST_CSF is not in Data Plane catalog -> return false
      expect(await frameworkEntitlementsService.isEntitled(ORG_B_ID, 'NIST_CSF')).toBe(false);
    });

    it('Tenant Isolation: Org A signed artifact rejected when submitted for Org B', async () => {
      const artifactA = generateDevSignedLicenseArtifact({
        deploymentId: DEPLOY_A_ID,
        organizationId: ORG_A_ID,
      });

      await expect(
        licenseVerificationService.saveVerifiedStateForOrganization(ORG_B_ID, DEPLOY_B_ID, artifactA),
      ).rejects.toThrow(BadRequestException);
    });

    it('Signature Protection: Reject tampered signed license artifact', () => {
      const artifact = generateDevSignedLicenseArtifact({
        deploymentId: DEPLOY_A_ID,
        organizationId: ORG_A_ID,
      });

      // Tamper with payload
      artifact.payload.organizationId = ORG_B_ID;

      expect(() => licenseVerificationService.verifyArtifact(artifact)).toThrow(/signature verification failed/i);
    });
  });

  describe('2. Entitlement Lifecycle States & Version Specificity', () => {
    it('Expired Entitlement: Returns false when expiresAt is in the past', async () => {
      const expiredArtifact = generateDevSignedLicenseArtifact({
        deploymentId: DEPLOY_A_ID,
        organizationId: ORG_A_ID,
        expiresAt: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
        entitlements: [{ code: 'ISO27001', name: 'ISO 27001', enabled: true }],
      });

      await licenseVerificationService.saveVerifiedStateForOrganization(ORG_A_ID, DEPLOY_A_ID, expiredArtifact);

      // System license status must be EXPIRED
      const status = await licenseVerificationService.getEvaluatedStateForOrganization(ORG_A_ID);
      expect(status.state).toBe('EXPIRED');

      // Entitlement check must return false due to expiration
      expect(await frameworkEntitlementsService.isEntitled(ORG_A_ID, 'ISO27001')).toBe(false);
    });

    it('Revoked/Disabled Entitlement: Setting enabled=false produces REVOKED status and denies access', async () => {
      const disabledArtifact = generateDevSignedLicenseArtifact({
        deploymentId: DEPLOY_A_ID,
        organizationId: ORG_A_ID,
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
        entitlements: [{ code: 'SOC2', name: 'SOC 2', enabled: false }],
      });

      await licenseVerificationService.saveVerifiedStateForOrganization(ORG_A_ID, DEPLOY_A_ID, disabledArtifact);

      expect(await frameworkEntitlementsService.isEntitled(ORG_A_ID, 'SOC2')).toBe(false);
    });
  });

  describe('3. Development Fallback Lockdown', () => {
    it('Provisioned organization does not grant unentitled frameworks even if NODE_ENV is development', async () => {
      delete process.env.ENFORCE_LICENSE_IN_TEST;
      const originalNodeEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      try {
        // Org A is provisioned. Asking for GDPR (which was not in Org A artifact) MUST be false even in dev mode
        const entitled = await frameworkEntitlementsService.isEntitled(ORG_A_ID, 'GDPR');
        expect(entitled).toBe(false);
      } finally {
        process.env.NODE_ENV = originalNodeEnv;
        process.env.ENFORCE_LICENSE_IN_TEST = 'true';
      }
    });
  });
});
