import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { ControlPlanePrismaService } from '../src/prisma/prisma.service';
import {
  DeploymentModel,
  DeploymentEnvironment,
  ActivationState,
  InfrastructureOwner,
  LicenseStatus,
  LicenseProduct,
} from '@omnigrc/shared';

describe('Phase 7 — Private MSSP Provisioning Workflow E2E Test Suite', () => {
  jest.setTimeout(60000);

  let app: INestApplication;
  let prisma: ControlPlanePrismaService;

  const adminKeyHeader = { 'x-control-plane-admin-key': 'arav-cp-admin-dev-key' };
  const targetOrgId = `private-mssp-org-${Date.now()}`;

  let customerId: string;
  let commercialAgreementId: string;
  let licenseId: string;
  let deploymentId: string;
  let registrationSecret: string;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    prisma = moduleRef.get<ControlPlanePrismaService>(ControlPlanePrismaService);
  });

  afterAll(async () => {
    if (prisma && deploymentId) {
      await prisma.deployment.deleteMany({ where: { id: deploymentId } });
    }
    if (prisma && customerId) {
      await prisma.customer.deleteMany({ where: { id: customerId } });
    }
    if (app) {
      await app.close();
    }
  });

  it('1. Operator creates Customer entity (POST /v1/customers)', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/customers')
      .set(adminKeyHeader)
      .send({ name: 'Acme Private MSSP Client' })
      .expect(201);

    expect(res.body.id).toBeDefined();
    expect(res.body.name).toBe('Acme Private MSSP Client');
    customerId = res.body.id;
  });

  it('2. Operator creates CommercialAgreement entity (POST /v1/commercial-agreements)', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/commercial-agreements')
      .set(adminKeyHeader)
      .send({ customerId })
      .expect(201);

    expect(res.body.id).toBeDefined();
    expect(res.body.customerId).toBe(customerId);
    commercialAgreementId = res.body.id;
  });

  it('3. Operator creates License & Entitlements (POST /v1/licenses & POST /v1/entitlements)', async () => {
    const licRes = await request(app.getHttpServer())
      .post('/v1/licenses')
      .set(adminKeyHeader)
      .send({
        commercialAgreementId,
        product: LicenseProduct.OMNIGRC,
        status: LicenseStatus.ACTIVE,
        startsAt: new Date(Date.now() - 86400000).toISOString(),
        expiresAt: new Date(Date.now() + 30 * 86400000).toISOString(),
        maxDeployments: 1,
      })
      .expect(201);

    expect(licRes.body.id).toBeDefined();
    licenseId = licRes.body.id;

    // Entitlement creation
    const entRes = await request(app.getHttpServer())
      .post('/v1/entitlements')
      .set(adminKeyHeader)
      .send({
        licenseId,
        code: 'AI_MAPPING',
        name: 'AI Automated Control Mapping',
        enabled: true,
      })
      .expect(201);

    expect(entRes.body.id).toBeDefined();
  });

  it('4. Operator registers PRIVATE_MSSP Deployment with ARAV infrastructure ownership (POST /v1/deployments)', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/deployments')
      .set(adminKeyHeader)
      .send({
        organizationId: targetOrgId,
        customerId,
        commercialAgreementId,
        deploymentModel: DeploymentModel.PRIVATE_MSSP,
        environment: DeploymentEnvironment.PRODUCTION,
        version: '1.5.0',
      })
      .expect(201);

    expect(res.body.id).toBeDefined();
    expect(res.body.deploymentModel).toBe(DeploymentModel.PRIVATE_MSSP);
    expect(res.body.infrastructureOwner).toBe(InfrastructureOwner.ARAV);
    expect(res.body.activationState).toBe(ActivationState.PENDING);
    expect(res.body.registrationSecret).toBeDefined();

    deploymentId = res.body.id;
    registrationSecret = res.body.registrationSecret;
  });

  it('5. Operator associates License with Deployment (POST /v1/licenses/:id/deployments)', async () => {
    const res = await request(app.getHttpServer())
      .post(`/v1/licenses/${licenseId}/deployments`)
      .set(adminKeyHeader)
      .send({ deploymentId, licenseId })
      .expect(200);

    expect(res.body.licenseId).toBe(licenseId);
  });

  it('6. Data Plane triggers Activation Handshake (POST /v1/deployments/:id/activate)', async () => {
    const res = await request(app.getHttpServer())
      .post(`/v1/deployments/${deploymentId}/activate`)
      .send({ registrationSecret })
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.activationState).toBe(ActivationState.ACTIVE);
    expect(res.body.artifact).toBeDefined();
    expect(res.body.artifact.signature).toBeDefined();
    expect(res.body.artifact.payload.deploymentId).toBe(deploymentId);
    expect(res.body.artifact.payload.organizationId).toBe(targetOrgId);
  });

  it('7. Data Plane performs Check-In Handshake (POST /v1/deployments/:id/check-in)', async () => {
    const res = await request(app.getHttpServer())
      .post(`/v1/deployments/${deploymentId}/check-in`)
      .send({ registrationSecret, version: '1.5.0' })
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.deploymentId).toBe(deploymentId);
    expect(res.body.activationState).toBe(ActivationState.ACTIVE);
  });
});
