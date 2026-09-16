import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { ControlPlanePrismaService } from '../src/prisma/prisma.service';
import { DEV_LICENSE_PUBLIC_KEY } from '../src/licenses/license-signing.service';
import { jcsCanonicalize, LicenseStatus, DeploymentModel } from '@omnigrc/shared';
import * as crypto from 'crypto';

describe('Phase 5 — Control Plane Activation & Verification E2E Test Suite', () => {
  jest.setTimeout(60000);

  let app: INestApplication;
  let prisma: ControlPlanePrismaService;

  const validAdminHeader = { 'x-control-plane-admin-key': 'arav-cp-admin-dev-key' };

  let customerId: string;
  let commercialAgreementId: string;
  let activeLicenseId: string;
  let trialLicenseId: string;
  let expiredLicenseId: string;

  let activeDeploymentId: string;
  let activeDeploymentSecret: string;

  let trialDeploymentId: string;
  let trialDeploymentSecret: string;

  let expiredDeploymentId: string;
  let expiredDeploymentSecret: string;

  let unassociatedDeploymentId: string;
  let unassociatedDeploymentSecret: string;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    prisma = moduleRef.get<ControlPlanePrismaService>(ControlPlanePrismaService);

    // Setup Customer & Commercial Agreement
    const customer = await prisma.customer.create({ data: { name: 'Phase5 Activation Corp' } });
    customerId = customer.id;
    const agreement = await prisma.commercialAgreement.create({ data: { customerId } });
    commercialAgreementId = agreement.id;

    // 1. Create Active License
    const now = new Date();
    const activeLic = await prisma.license.create({
      data: {
        commercialAgreementId,
        status: LicenseStatus.ACTIVE as any,
        startsAt: new Date(now.getTime() - 24 * 3600 * 1000),
        expiresAt: new Date(now.getTime() + 30 * 24 * 3600 * 1000),
        maxDeployments: 5,
        entitlements: {
          create: [{ code: 'SOC2', name: 'SOC 2 Framework', enabled: true }],
        },
      },
    });
    activeLicenseId = activeLic.id;

    // 2. Create Trial License
    const trialLic = await prisma.license.create({
      data: {
        commercialAgreementId,
        status: LicenseStatus.TRIAL as any,
        startsAt: new Date(now.getTime() - 24 * 3600 * 1000),
        expiresAt: new Date(now.getTime() + 14 * 24 * 3600 * 1000),
        maxDeployments: 5,
        entitlements: {
          create: [{ code: 'ISO27001', name: 'ISO 27001 Framework', enabled: true }],
        },
      },
    });
    trialLicenseId = trialLic.id;

    // 3. Create Expired License
    const expiredLic = await prisma.license.create({
      data: {
        commercialAgreementId,
        status: LicenseStatus.EXPIRED as any,
        startsAt: new Date(now.getTime() - 60 * 24 * 3600 * 1000),
        expiresAt: new Date(now.getTime() - 10 * 24 * 3600 * 1000),
        maxDeployments: 5,
      },
    });
    expiredLicenseId = expiredLic.id;

    // Create Active Deployment via API
    const resActiveDep = await request(app.getHttpServer())
      .post('/v1/deployments')
      .set(validAdminHeader)
      .send({
        organizationId: 'org_active_test',
        customerId,
        commercialAgreementId,
        deploymentModel: DeploymentModel.SELF_HOSTED,
      })
      .expect(201);

    activeDeploymentId = resActiveDep.body.id;
    activeDeploymentSecret = resActiveDep.body.registrationSecret;

    // Associate Active License
    await request(app.getHttpServer())
      .post(`/v1/licenses/${activeLicenseId}/deployments`)
      .set(validAdminHeader)
      .send({ deploymentId: activeDeploymentId })
      .expect(200);

    // Create Trial Deployment via API
    const resTrialDep = await request(app.getHttpServer())
      .post('/v1/deployments')
      .set(validAdminHeader)
      .send({
        organizationId: 'org_trial_test',
        customerId,
        commercialAgreementId,
        deploymentModel: DeploymentModel.SELF_HOSTED,
      })
      .expect(201);

    trialDeploymentId = resTrialDep.body.id;
    trialDeploymentSecret = resTrialDep.body.registrationSecret;

    // Associate Trial License
    await request(app.getHttpServer())
      .post(`/v1/licenses/${trialLicenseId}/deployments`)
      .set(validAdminHeader)
      .send({ deploymentId: trialDeploymentId })
      .expect(200);

    // Create Expired Deployment via API
    const resExpDep = await request(app.getHttpServer())
      .post('/v1/deployments')
      .set(validAdminHeader)
      .send({
        organizationId: 'org_expired_test',
        customerId,
        commercialAgreementId,
        deploymentModel: DeploymentModel.SELF_HOSTED,
      })
      .expect(201);

    expiredDeploymentId = resExpDep.body.id;
    expiredDeploymentSecret = resExpDep.body.registrationSecret;

    // Associate Expired License
    await request(app.getHttpServer())
      .post(`/v1/licenses/${expiredLicenseId}/deployments`)
      .set(validAdminHeader)
      .send({ deploymentId: expiredDeploymentId })
      .expect(200);

    // Create Unassociated Deployment
    const resUnassoc = await request(app.getHttpServer())
      .post('/v1/deployments')
      .set(validAdminHeader)
      .send({
        organizationId: 'org_unassoc_test',
        customerId,
        commercialAgreementId,
        deploymentModel: DeploymentModel.SELF_HOSTED,
      })
      .expect(201);

    unassociatedDeploymentId = resUnassoc.body.id;
    unassociatedDeploymentSecret = resUnassoc.body.registrationSecret;
  });

  afterAll(async () => {
    if (prisma && customerId) {
      await prisma.customer.delete({ where: { id: customerId } }).catch(() => {});
    }
    if (app) {
      await app.close();
    }
  });

  describe('POST /v1/deployments/:id/activate', () => {
    it('should successfully activate a deployment associated with an ACTIVE license and return a valid Ed25519 signed artifact', async () => {
      const res = await request(app.getHttpServer())
        .post(`/v1/deployments/${activeDeploymentId}/activate`)
        .send({ registrationSecret: activeDeploymentSecret })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.activationState).toBe('ACTIVE');
      expect(res.body.artifact).toBeDefined();
      expect(res.body.artifact.algorithm).toBe('Ed25519');
      expect(res.body.artifact.payload.deploymentId).toBe(activeDeploymentId);
      expect(res.body.artifact.payload.status).toBe('ACTIVE');

      // Verify Ed25519 signature
      const canonicalJson = jcsCanonicalize(res.body.artifact.payload);
      const isValid = crypto.verify(
        null,
        Buffer.from(canonicalJson, 'utf-8'),
        DEV_LICENSE_PUBLIC_KEY,
        Buffer.from(res.body.artifact.signature, 'base64'),
      );
      expect(isValid).toBe(true);
    });

    it('should successfully activate a deployment associated with a TRIAL license', async () => {
      const res = await request(app.getHttpServer())
        .post(`/v1/deployments/${trialDeploymentId}/activate`)
        .send({ registrationSecret: trialDeploymentSecret })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.activationState).toBe('ACTIVE');
      expect(res.body.artifact.payload.status).toBe('TRIAL');
    });

    it('should reject activation for an EXPIRED license with 400 Bad Request', async () => {
      const res = await request(app.getHttpServer())
        .post(`/v1/deployments/${expiredDeploymentId}/activate`)
        .send({ registrationSecret: expiredDeploymentSecret })
        .expect(400);

      expect(res.body.message).toMatch(/status is EXPIRED|expired/i);
    });

    it('should reject activation with invalid registration secret with 401 Unauthorized', async () => {
      await request(app.getHttpServer())
        .post(`/v1/deployments/${activeDeploymentId}/activate`)
        .send({ registrationSecret: 'wrong_secret_12345' })
        .expect(401);
    });

    it('should reject activation for unassociated deployment with 400 Bad Request', async () => {
      await request(app.getHttpServer())
        .post(`/v1/deployments/${unassociatedDeploymentId}/activate`)
        .send({ registrationSecret: unassociatedDeploymentSecret })
        .expect(400);
    });

    it('should be idempotent and allow repeated activation calls with valid secret', async () => {
      const res1 = await request(app.getHttpServer())
        .post(`/v1/deployments/${activeDeploymentId}/activate`)
        .send({ registrationSecret: activeDeploymentSecret })
        .expect(200);

      const res2 = await request(app.getHttpServer())
        .post(`/v1/deployments/${activeDeploymentId}/activate`)
        .send({ registrationSecret: activeDeploymentSecret })
        .expect(200);

      expect(res1.body.artifact.signature).toEqual(res2.body.artifact.signature);
    });
  });

  describe('GET /v1/deployments/:id/license-artifact', () => {
    it('should allow admin to fetch the signed license artifact', async () => {
      const res = await request(app.getHttpServer())
        .get(`/v1/deployments/${activeDeploymentId}/license-artifact`)
        .set(validAdminHeader)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.artifact.payload.deploymentId).toBe(activeDeploymentId);
    });
  });

  describe('POST /v1/deployments/:id/check-in', () => {
    it('should return updated license artifact during check-in for ACTIVE deployment', async () => {
      const res = await request(app.getHttpServer())
        .post(`/v1/deployments/${activeDeploymentId}/check-in`)
        .send({ registrationSecret: activeDeploymentSecret, version: '1.1.0' })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.artifact).toBeDefined();
      expect(res.body.artifact.payload.deploymentId).toBe(activeDeploymentId);
    });
  });
});
