import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ForbiddenException, BadRequestException, HttpException, HttpStatus } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../app.module';
import { PrismaService } from '../prisma/prisma.service';
import { LicenseVerificationService } from '../license-verification/license-verification.service';
import { FrameworkEntitlementsService } from '../frameworks/framework-entitlements.service';
import { generateDevSignedLicenseArtifact, Role, DeploymentModel, InvitationStatus } from '@omnigrc/shared';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';

describe('E2E Multi-Organization Provisioning & License Gate Suite', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let licenseVerificationService: LicenseVerificationService;
  let frameworkEntitlementsService: FrameworkEntitlementsService;

  const M2M_SECRET = process.env.CONTROL_PLANE_PROVISIONING_SECRET || 'omnigrc-dev-control-plane-secret-change-in-prod';

  // Test Organization IDs & Deployment IDs
  const TEST_ORG_A_ID = 'test-org-a-1111-1111-111111111111';
  const TEST_ORG_B_ID = 'test-org-b-2222-2222-222222222222';
  const DEPLOY_A_ID = 'deploy-cp-a-1111-111111111111';
  const DEPLOY_B_ID = 'deploy-cp-b-2222-222222222222';

  beforeAll(async () => {
    jest.setTimeout(30000);
    process.env.ENFORCE_LICENSE_IN_TEST = 'true';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    prisma = app.get(PrismaService);
    licenseVerificationService = app.get(LicenseVerificationService);
    frameworkEntitlementsService = app.get(FrameworkEntitlementsService);

    // Clean up test organizations if previously existing
    await prisma.invitation.deleteMany({
      where: { organizationId: { in: [TEST_ORG_A_ID, TEST_ORG_B_ID] } },
    });
    await prisma.organization.deleteMany({
      where: { id: { in: [TEST_ORG_A_ID, TEST_ORG_B_ID] } },
    });
  });

  afterAll(async () => {
    await prisma.invitation.deleteMany({
      where: { organizationId: { in: [TEST_ORG_A_ID, TEST_ORG_B_ID] } },
    });
    await prisma.organization.deleteMany({
      where: { id: { in: [TEST_ORG_A_ID, TEST_ORG_B_ID] } },
    });
    delete process.env.ENFORCE_LICENSE_IN_TEST;
    await app.close();
  });

  describe('1. Public Registration Block & M2M Security', () => {
    it('should reject public organization creation via POST /auth/register with HTTP 403 ORGANIZATION_CREATION_RESTRICTED', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          organizationName: 'Unauthorized Public Org',
          name: 'Attacker User',
          email: 'attacker@unauthorized.com',
          password: 'Password123!',
        })
        .expect(403);

      expect(res.body.code).toBe('ORGANIZATION_CREATION_RESTRICTED');
      expect(res.body.message).toContain('Organization creation is restricted');
    });

    it('should reject unauthorized calls to POST /provisioning/saas without x-control-plane-secret with HTTP 403 M2M_SECRET_REQUIRED', async () => {
      const res = await request(app.getHttpServer())
        .post('/provisioning/saas')
        .send({
          controlPlaneDeploymentId: 'unauthorized-deploy-999',
          subscriptionId: 'sub-unauthorized',
          customerEmail: 'customer@test.com',
          organizationName: 'Fake Customer Org',
        })
        .expect(403);

      expect(res.body.code).toBe('M2M_SECRET_REQUIRED');
    });
  });

  describe('2. Authoritative SaaS Provisioning & Idempotency', () => {
    it('should successfully provision a new SaaS organization via Control Plane M2M secret', async () => {
      const res = await request(app.getHttpServer())
        .post('/provisioning/saas')
        .set('x-control-plane-secret', M2M_SECRET)
        .send({
          controlPlaneDeploymentId: DEPLOY_A_ID,
          subscriptionId: 'sub-saas-org-a-100',
          customerEmail: 'admin@orga.com',
          customerName: 'Admin Org A',
          organizationName: 'Organization Alpha',
          primaryRegion: 'India',
        })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.isExisting).toBe(false);
      expect(res.body.controlPlaneDeploymentId).toBe(DEPLOY_A_ID);
      expect(res.body.adminEmail).toBe('admin@orga.com');

      // Override the generated Organization ID for deterministic testing
      await prisma.organization.update({
        where: { id: res.body.organizationId },
        data: { id: TEST_ORG_A_ID },
      });
    });

    it('should handle repeated provisioning calls with the same deployment ID idempotently', async () => {
      const res = await request(app.getHttpServer())
        .post('/provisioning/saas')
        .set('x-control-plane-secret', M2M_SECRET)
        .send({
          controlPlaneDeploymentId: DEPLOY_A_ID,
          subscriptionId: 'sub-saas-org-a-100',
          customerEmail: 'admin@orga.com',
          customerName: 'Admin Org A',
          organizationName: 'Organization Alpha',
        })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.isExisting).toBe(true);
      expect(res.body.organizationId).toBe(TEST_ORG_A_ID);
    });
  });

  describe('3. Multi-Organization License Gate Isolation Matrix', () => {
    let passwordHash: string;

    beforeAll(async () => {
      passwordHash = await bcrypt.hash('Password123!', 10);

      // Create Org B manually in DB (Unlicensed)
      await prisma.organization.create({
        data: {
          id: TEST_ORG_B_ID,
          name: 'Organization Beta',
          users: {
            create: {
              name: 'Admin Org B',
              email: 'admin@orgb.com',
              passwordHash,
              role: Role.ADMIN,
            },
          },
          deployment: {
            create: {
              controlPlaneDeploymentId: DEPLOY_B_ID,
              modelType: DeploymentModel.SAAS_MULTI_TENANT,
            },
          },
        },
      });
    });

    it('Scenario A: Both Org A and Org B are UNLICENSED -> Login rejected for both with 403 ORGANIZATION_NOT_LICENSED', async () => {
      const resA = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'admin@orga.com', password: 'OmniGRC@Admin2026!' })
        .expect(403);

      expect(resA.body.code).toBe('ORGANIZATION_NOT_LICENSED');

      const resB = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'admin@orgb.com', password: 'Password123!' })
        .expect(403);

      expect(resB.body.code).toBe('ORGANIZATION_NOT_LICENSED');
    });

    it('Scenario B: Org A is LICENSED, Org B is UNLICENSED -> Org A login succeeds, Org B login fails', async () => {
      // Issue signed artifact strictly bound to Org A
      const artifactA = generateDevSignedLicenseArtifact({
        deploymentId: DEPLOY_A_ID,
        organizationId: TEST_ORG_A_ID,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        entitlements: [{ code: 'SOC2', name: 'SOC 2', enabled: true }],
      });

      await licenseVerificationService.saveVerifiedStateForOrganization(TEST_ORG_A_ID, DEPLOY_A_ID, artifactA);

      // Org A login must succeed
      const loginA = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'admin@orga.com', password: 'OmniGRC@Admin2026!' })
        .expect(200);

      expect(loginA.body.user.email).toBe('admin@orga.com');
      expect(loginA.body.organization.licenseState).toBe('VALID');

      // Org B login must STILL fail with 403 ORGANIZATION_NOT_LICENSED
      const loginB = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'admin@orgb.com', password: 'Password123!' })
        .expect(403);

      expect(loginB.body.code).toBe('ORGANIZATION_NOT_LICENSED');
    });

    it('Scenario C: Identity Mismatch Protection -> Org A license artifact cannot be saved or used for Org B', async () => {
      const artifactA = generateDevSignedLicenseArtifact({
        deploymentId: DEPLOY_A_ID,
        organizationId: TEST_ORG_A_ID,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      });

      // Attempting to save Org A's artifact for Org B must throw BadRequestException
      await expect(
        licenseVerificationService.saveVerifiedStateForOrganization(TEST_ORG_B_ID, DEPLOY_B_ID, artifactA),
      ).rejects.toThrow(BadRequestException);
    });

    it('Scenario D: Both Org A and Org B Licensed Independently -> Both logins succeed with their distinct entitlement sets', async () => {
      const artifactB = generateDevSignedLicenseArtifact({
        deploymentId: DEPLOY_B_ID,
        organizationId: TEST_ORG_B_ID,
        expiresAt: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(),
        entitlements: [{ code: 'ISO27001', name: 'ISO 27001', enabled: true }],
      });

      await licenseVerificationService.saveVerifiedStateForOrganization(TEST_ORG_B_ID, DEPLOY_B_ID, artifactB);

      const loginA = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'admin@orga.com', password: 'OmniGRC@Admin2026!' })
        .expect(200);

      const loginB = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'admin@orgb.com', password: 'Password123!' })
        .expect(200);

      expect(loginA.body.organization.licenseState).toBe('VALID');
      expect(loginB.body.organization.licenseState).toBe('VALID');
    });
  });

  describe('4. Suspended and Revoked License Gating', () => {
    it('should block logins and requests for SUSPENDED organization with 403 PRODUCT_ACCESS_REVOKED', async () => {
      const suspendedArtifact = generateDevSignedLicenseArtifact({
        deploymentId: DEPLOY_B_ID,
        organizationId: TEST_ORG_B_ID,
        status: 'SUSPENDED' as any,
      });

      await licenseVerificationService.saveVerifiedStateForOrganization(TEST_ORG_B_ID, DEPLOY_B_ID, suspendedArtifact);

      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'admin@orgb.com', password: 'Password123!' })
        .expect(403);

      expect(res.body.code).toBe('PRODUCT_ACCESS_REVOKED');
      expect(res.body.message).toContain('suspended or revoked');
    });

    it('should block logins and requests for REVOKED organization with 403 PRODUCT_ACCESS_REVOKED', async () => {
      const revokedArtifact = generateDevSignedLicenseArtifact({
        deploymentId: DEPLOY_B_ID,
        organizationId: TEST_ORG_B_ID,
        status: 'REVOKED' as any,
      });

      await licenseVerificationService.saveVerifiedStateForOrganization(TEST_ORG_B_ID, DEPLOY_B_ID, revokedArtifact);

      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'admin@orgb.com', password: 'Password123!' })
        .expect(403);

      expect(res.body.code).toBe('PRODUCT_ACCESS_REVOKED');
    });
  });

  describe('5. License Expiration & Read-Only Mode Semantics', () => {
    let orgAToken: string;

    beforeAll(async () => {
      // Issue EXPIRED signed artifact for Org A
      const expiredArtifact = generateDevSignedLicenseArtifact({
        deploymentId: DEPLOY_A_ID,
        organizationId: TEST_ORG_A_ID,
        expiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(), // Expired 1 day ago
      });

      await licenseVerificationService.saveVerifiedStateForOrganization(TEST_ORG_A_ID, DEPLOY_A_ID, expiredArtifact);
    });

    it('should allow user of EXPIRED organization to log in and enter read-only mode (200 OK)', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'admin@orga.com', password: 'OmniGRC@Admin2026!' })
        .expect(200);

      expect(res.body.organization.licenseState).toBe('EXPIRED');
      expect(res.body.organization.isReadOnly).toBe(true);
      orgAToken = res.body.tokens.accessToken;
    });

    it('should allow GET read requests for user of EXPIRED organization', async () => {
      const res = await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${orgAToken}`)
        .expect(200);

      expect(res.body.user.email).toBe('admin@orga.com');
      expect(res.body.organization.isReadOnly).toBe(true);
    });

    it('should block write mutations for user of EXPIRED organization with HTTP 402 LICENSE_EXPIRED', async () => {
      const res = await request(app.getHttpServer())
        .post('/assets')
        .set('Authorization', `Bearer ${orgAToken}`)
        .send({
          name: 'Forbidden Read-Only Asset',
          type: 'SOFTWARE',
          owner: 'Admin Org A',
        })
        .expect(402);

      expect(res.body.code).toBe('LICENSE_EXPIRED');
      expect(res.body.message).toContain('operating in read-only mode');
    });

    it('should report active state as false for background worker/cron checks when license is EXPIRED', async () => {
      const evaluated = await licenseVerificationService.getEvaluatedStateForOrganization(TEST_ORG_A_ID);
      expect(evaluated.state).toBe('EXPIRED');
      const isLicenseActive = evaluated.state === 'VALID';
      expect(isLicenseActive).toBe(false);
    });
  });

  describe('6. Framework Entitlement & Member Onboarding Isolation', () => {
    beforeAll(async () => {
      // Re-license Org A as ACTIVE with SOC2 entitlement only
      const validArtifactA = generateDevSignedLicenseArtifact({
        deploymentId: DEPLOY_A_ID,
        organizationId: TEST_ORG_A_ID,
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
        entitlements: [{ code: 'SOC2', name: 'SOC 2', enabled: true }],
      });

      await licenseVerificationService.saveVerifiedStateForOrganization(TEST_ORG_A_ID, DEPLOY_A_ID, validArtifactA);
    });

    it('should isolate framework entitlements: Org A has SOC2 enabled but NOT ISO27001', async () => {
      const hasSoc2 = await frameworkEntitlementsService.isEntitled(TEST_ORG_A_ID, 'SOC2');
      const hasIso = await frameworkEntitlementsService.isEntitled(TEST_ORG_A_ID, 'ISO27001');

      expect(hasSoc2).toBe(true);
      expect(hasIso).toBe(false);
    });

    it('should support invited user onboarding into Org A, inheriting Org A license state without creating a new organization', async () => {
      const rawToken = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

      await prisma.invitation.create({
        data: {
          id: 'inv-test-orga-user',
          organizationId: TEST_ORG_A_ID,
          email: 'invited.analyst@orga.com',
          role: Role.ANALYST,
          tokenHash,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          status: InvitationStatus.PENDING,
          invitedById: (await prisma.user.findFirst({ where: { organizationId: TEST_ORG_A_ID } }))!.id,
        },
      });

      const acceptRes = await request(app.getHttpServer())
        .post('/auth/invitations/accept')
        .send({
          token: rawToken,
          password: 'NewMemberPassword123!',
          name: 'Invited Analyst User',
        })
        .expect(200);

      expect(acceptRes.body.user.email).toBe('invited.analyst@orga.com');
      expect(acceptRes.body.user.organizationId).toBe(TEST_ORG_A_ID);

      // Invited user logging in inherits Org A's ACTIVE license state
      const loginRes = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'invited.analyst@orga.com', password: 'NewMemberPassword123!' })
        .expect(200);

      expect(loginRes.body.organization.licenseState).toBe('VALID');
      expect(loginRes.body.user.organizationId).toBe(TEST_ORG_A_ID);
    });
  });

  describe('7. Real Test Organizations Org A & Org B Preservation', () => {
    it('should confirm existing Org A (3bda52cd-87d0-46f4-bedc-d13d528e28ba) and Org B (3a7590c7-33cf-4b8e-bb56-9c604a7a0acc) records exist and were untouched', async () => {
      const realOrgA = await prisma.organization.findUnique({
        where: { id: '3bda52cd-87d0-46f4-bedc-d13d528e28ba' },
      });
      const realOrgB = await prisma.organization.findUnique({
        where: { id: '3a7590c7-33cf-4b8e-bb56-9c604a7a0acc' },
      });

      expect(realOrgA).not.toBeNull();
      expect(realOrgA?.name).toBe('ARAV INNOVATIONS');

      expect(realOrgB).not.toBeNull();
      expect(realOrgB?.name).toBe('Arav Innovations');
    });
  });
});
