import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { ControlPlanePrismaService } from '../src/prisma/prisma.service';
import {
  LicenseStatus,
  LicenseProduct,
  DeploymentModel,
  DeploymentEnvironment,
} from '@omnigrc/shared';

describe('Phase 4 — Control Plane License + Entitlement E2E Test Suite', () => {
  jest.setTimeout(60000);

  let app: INestApplication;
  let prisma: ControlPlanePrismaService;

  const validAdminHeader = { 'x-control-plane-admin-key': 'arav-cp-admin-dev-key' };
  const invalidAdminHeader = { 'x-control-plane-admin-key': 'wrong-fake-key-12345' };

  let customerId: string;
  let commercialAgreementId: string;
  let customerId2: string;
  let commercialAgreementId2: string;
  let licenseId: string;
  let entitlementId: string;

  let deployment1Id: string;
  let deployment2Id: string;
  let deployment3Id: string;
  let crossCustomerDeploymentId: string;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    prisma = moduleRef.get<ControlPlanePrismaService>(ControlPlanePrismaService);

    // Setup Test Customer 1 & Commercial Agreement 1
    const cust1 = await prisma.customer.create({ data: { name: 'Acme Corp Phase4 Test' } });
    customerId = cust1.id;
    const agree1 = await prisma.commercialAgreement.create({ data: { customerId } });
    commercialAgreementId = agree1.id;

    // Setup Test Customer 2 & Commercial Agreement 2 (for cross-customer tests)
    const cust2 = await prisma.customer.create({ data: { name: 'Beta Corp Cross Customer Test' } });
    customerId2 = cust2.id;
    const agree2 = await prisma.commercialAgreement.create({ data: { customerId: customerId2 } });
    commercialAgreementId2 = agree2.id;
  });

  afterAll(async () => {
    if (prisma) {
      if (customerId) await prisma.customer.delete({ where: { id: customerId } }).catch(() => {});
      if (customerId2) await prisma.customer.delete({ where: { id: customerId2 } }).catch(() => {});
    }
    if (app) {
      await app.close();
    }
  });

  // --- ENTITLEMENT TESTS ---

  it('1. Entitlement can be created', async () => {
    // First create a temporary license for entitlement test
    const now = new Date();
    const future = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const tempLicense = await prisma.license.create({
      data: {
        commercialAgreementId,
        product: LicenseProduct.OMNIGRC,
        status: LicenseStatus.ACTIVE,
        startsAt: now,
        expiresAt: future,
        maxDeployments: 2,
      },
    });

    licenseId = tempLicense.id;

    const res = await request(app.getHttpServer())
      .post('/v1/entitlements')
      .set(validAdminHeader)
      .send({
        licenseId,
        code: 'FEATURE_MSSP_PORTAL',
        name: 'MSSP Provider Dashboard Access',
        value: { maxChildTenants: 50, enabledFeatures: ['AUDIT_LOGS', 'CONTEXT_SWITCH'] },
        enabled: true,
      })
      .expect(201);

    expect(res.body.id).toBeDefined();
    expect(res.body.licenseId).toBe(licenseId);
    expect(res.body.code).toBe('FEATURE_MSSP_PORTAL');
    expect(res.body.enabled).toBe(true);
    expect(res.body.value).toEqual({ maxChildTenants: 50, enabledFeatures: ['AUDIT_LOGS', 'CONTEXT_SWITCH'] });

    entitlementId = res.body.id;
  });

  it('2. Entitlement can be retrieved', async () => {
    const res = await request(app.getHttpServer())
      .get(`/v1/entitlements/${entitlementId}`)
      .set(validAdminHeader)
      .expect(200);

    expect(res.body.id).toBe(entitlementId);
    expect(res.body.code).toBe('FEATURE_MSSP_PORTAL');
  });

  it('3. Invalid entitlement data is rejected', async () => {
    // Missing required code & name
    await request(app.getHttpServer())
      .post('/v1/entitlements')
      .set(validAdminHeader)
      .send({
        licenseId,
        code: '',
        name: '',
      })
      .expect(400);
  });

  // --- LICENSE TESTS ---

  it('4. License can be created linked to CommercialAgreement', async () => {
    const startsAt = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();

    const res = await request(app.getHttpServer())
      .post('/v1/licenses')
      .set(validAdminHeader)
      .send({
        commercialAgreementId,
        product: LicenseProduct.OMNIGRC,
        status: LicenseStatus.ACTIVE,
        startsAt,
        expiresAt,
        maxDeployments: 2,
      })
      .expect(201);

    expect(res.body.id).toBeDefined();
    expect(res.body.commercialAgreementId).toBe(commercialAgreementId);
    expect(res.body.maxDeployments).toBe(2);
    expect(res.body.status).toBe(LicenseStatus.ACTIVE);
  });

  it('5. License status supports TRIAL / ACTIVE / EXPIRED', async () => {
    const startsAt = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();

    // Trial license
    const trialRes = await request(app.getHttpServer())
      .post('/v1/licenses')
      .set(validAdminHeader)
      .send({
        commercialAgreementId,
        status: LicenseStatus.TRIAL,
        startsAt,
        expiresAt,
        maxDeployments: 1,
      })
      .expect(201);

    expect(trialRes.body.status).toBe(LicenseStatus.TRIAL);

    // Expired license
    const expiredRes = await request(app.getHttpServer())
      .post('/v1/licenses')
      .set(validAdminHeader)
      .send({
        commercialAgreementId,
        status: LicenseStatus.EXPIRED,
        startsAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
        expiresAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
        maxDeployments: 1,
      })
      .expect(201);

    expect(expiredRes.body.status).toBe(LicenseStatus.EXPIRED);
  });

  it('6. Invalid date ranges are rejected (expiresAt <= startsAt)', async () => {
    const now = new Date();
    const past = new Date(now.getTime() - 10000);

    await request(app.getHttpServer())
      .post('/v1/licenses')
      .set(validAdminHeader)
      .send({
        commercialAgreementId,
        startsAt: now.toISOString(),
        expiresAt: past.toISOString(), // expires before start
        maxDeployments: 1,
      })
      .expect(400);
  });

  it('7. Negative or zero maxDeployments is rejected', async () => {
    const startsAt = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    await request(app.getHttpServer())
      .post('/v1/licenses')
      .set(validAdminHeader)
      .send({
        commercialAgreementId,
        startsAt,
        expiresAt,
        maxDeployments: 0, // Invalid
      })
      .expect(400);
  });

  // --- DEPLOYMENT ASSOCIATION TESTS ---

  it('8. Deployment can be associated with a valid License', async () => {
    // Create deployment 1 tied to customer1 & agreement1
    const dep1 = await request(app.getHttpServer())
      .post('/v1/deployments')
      .set(validAdminHeader)
      .send({
        organizationId: `org-dep1-${Date.now()}`,
        customerId,
        commercialAgreementId,
        deploymentModel: DeploymentModel.MSSP_SHARED,
        environment: DeploymentEnvironment.PRODUCTION,
      })
      .expect(201);

    deployment1Id = dep1.body.id;

    // Associate deployment 1 with licenseId (which has maxDeployments = 2)
    const res = await request(app.getHttpServer())
      .post(`/v1/licenses/${licenseId}/deployments`)
      .set(validAdminHeader)
      .send({ deploymentId: deployment1Id })
      .expect(200);

    expect(res.body.id).toBe(deployment1Id);
    expect(res.body.licenseId).toBe(licenseId);
  });

  it('9. Deployment cannot be associated with a License belonging to another customer scope', async () => {
    // Create deployment tied to Customer 2 (cross customer)
    const crossDep = await request(app.getHttpServer())
      .post('/v1/deployments')
      .set(validAdminHeader)
      .send({
        organizationId: `org-cross-${Date.now()}`,
        customerId: customerId2, // Customer 2
        commercialAgreementId: commercialAgreementId2, // Agreement 2
        deploymentModel: DeploymentModel.SELF_HOSTED,
        environment: DeploymentEnvironment.PRODUCTION,
      })
      .expect(201);

    crossCustomerDeploymentId = crossDep.body.id;

    // Attempting to associate Customer 2's deployment with Customer 1's license must fail
    await request(app.getHttpServer())
      .post(`/v1/licenses/${licenseId}/deployments`)
      .set(validAdminHeader)
      .send({ deploymentId: crossCustomerDeploymentId })
      .expect(400);
  });

  it('10. One License can support multiple Deployments (up to maxDeployments)', async () => {
    // Create deployment 2 for Customer 1
    const dep2 = await request(app.getHttpServer())
      .post('/v1/deployments')
      .set(validAdminHeader)
      .send({
        organizationId: `org-dep2-${Date.now()}`,
        customerId,
        commercialAgreementId,
        deploymentModel: DeploymentModel.PRIVATE_MSSP,
        environment: DeploymentEnvironment.UAT,
      })
      .expect(201);

    deployment2Id = dep2.body.id;

    // Associate 2nd deployment with licenseId (maxDeployments = 2)
    const res = await request(app.getHttpServer())
      .post(`/v1/licenses/${licenseId}/deployments`)
      .set(validAdminHeader)
      .send({ deploymentId: deployment2Id })
      .expect(200);

    expect(res.body.licenseId).toBe(licenseId);
  });

  it('11. Deployment allowance is respected at Control Plane registry level (maxDeployments cap)', async () => {
    // Create deployment 3 for Customer 1
    const dep3 = await request(app.getHttpServer())
      .post('/v1/deployments')
      .set(validAdminHeader)
      .send({
        organizationId: `org-dep3-${Date.now()}`,
        customerId,
        commercialAgreementId,
        deploymentModel: DeploymentModel.MSSP_SHARED,
        environment: DeploymentEnvironment.DR,
      })
      .expect(201);

    deployment3Id = dep3.body.id;

    // Attempting to associate 3rd deployment when maxDeployments = 2 must be rejected with 400 Bad Request
    await request(app.getHttpServer())
      .post(`/v1/licenses/${licenseId}/deployments`)
      .set(validAdminHeader)
      .send({ deploymentId: deployment3Id })
      .expect(400);
  });

  // --- SECURITY TESTS ---

  it('12. Missing Control Plane admin key fails with 401 Unauthorized', async () => {
    await request(app.getHttpServer())
      .post('/v1/licenses')
      // No x-control-plane-admin-key header
      .send({
        commercialAgreementId,
        startsAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      })
      .expect(401);
  });

  it('13. Invalid Control Plane admin key fails with 403 Forbidden', async () => {
    await request(app.getHttpServer())
      .get('/v1/licenses')
      .set(invalidAdminHeader)
      .expect(403);
  });
});
