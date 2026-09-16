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
} from '@omnigrc/shared';
import * as bcrypt from 'bcrypt';

describe('Phase 3 — Control Plane Foundation & Deployment Registry E2E Test Suite', () => {
  jest.setTimeout(60000);

  let app: INestApplication;
  let prisma: ControlPlanePrismaService;

  const adminKeyHeader = { 'x-control-plane-admin-key': 'arav-cp-admin-dev-key' };

  let sharedDeploymentId: string;
  let sharedSecret: string;
  let selfHostedDeploymentId: string;
  let selfHostedSecret: string;
  let targetOrgId: string;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    prisma = moduleRef.get<ControlPlanePrismaService>(ControlPlanePrismaService);
    targetOrgId = `org-test-${Date.now()}`;
  });

  afterAll(async () => {
    if (prisma && targetOrgId) {
      await prisma.deployment.deleteMany({ where: { organizationId: targetOrgId } });
    }
    if (app) {
      await app.close();
    }
  });

  it('1. Create MSSP_SHARED Deployment: verifies ARAV infrastructure ownership', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/deployments')
      .set(adminKeyHeader)
      .send({
        organizationId: targetOrgId,
        deploymentModel: DeploymentModel.MSSP_SHARED,
        environment: DeploymentEnvironment.PRODUCTION,
        version: '1.2.0',
      })
      .expect(201);

    expect(res.body.id).toBeDefined();
    expect(res.body.organizationId).toBe(targetOrgId);
    expect(res.body.deploymentModel).toBe(DeploymentModel.MSSP_SHARED);
    expect(res.body.infrastructureOwner).toBe(InfrastructureOwner.ARAV);
    expect(res.body.activationState).toBe(ActivationState.PENDING);
    expect(res.body.registrationSecret).toBeDefined();

    sharedDeploymentId = res.body.id;
    sharedSecret = res.body.registrationSecret;
  });

  it('2. Create SELF_HOSTED Deployment: verifies CUSTOMER infrastructure ownership', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/deployments')
      .set(adminKeyHeader)
      .send({
        organizationId: targetOrgId,
        deploymentModel: DeploymentModel.SELF_HOSTED,
        environment: DeploymentEnvironment.PRODUCTION,
        version: '1.0.0-customer',
      })
      .expect(201);

    expect(res.body.id).toBeDefined();
    expect(res.body.deploymentModel).toBe(DeploymentModel.SELF_HOSTED);
    expect(res.body.infrastructureOwner).toBe(InfrastructureOwner.CUSTOMER);
    expect(res.body.registrationSecret).toBeDefined();

    selfHostedDeploymentId = res.body.id;
    selfHostedSecret = res.body.registrationSecret;
  });

  it('3. Security Check: registration secret is stored as a cryptographic hash in DB, not plaintext', async () => {
    const dbRecord = await prisma.deployment.findUnique({
      where: { id: sharedDeploymentId },
    });

    expect(dbRecord).toBeDefined();
    expect(dbRecord?.registrationSecretHash).not.toBe(sharedSecret);
    const matches = await bcrypt.compare(sharedSecret, dbRecord!.registrationSecretHash);
    expect(matches).toBe(true);
  });

  it('4. Valid Deployment Check-In: updates lastCheckInAt and version', async () => {
    const res = await request(app.getHttpServer())
      .post(`/v1/deployments/${sharedDeploymentId}/check-in`)
      .send({
        registrationSecret: sharedSecret,
        version: '1.2.1',
      })
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.deploymentId).toBe(sharedDeploymentId);
    expect(res.body.version).toBe('1.2.1');
    expect(res.body.lastCheckInAt).toBeDefined();
  });

  it('5. Invalid Deployment Check-In: fails safely with 401 Unauthorized', async () => {
    await request(app.getHttpServer())
      .post(`/v1/deployments/${sharedDeploymentId}/check-in`)
      .send({
        registrationSecret: 'invalid-wrong-secret-12345',
        version: '1.2.1',
      })
      .expect(401);
  });

  it('6. Activation State Updates: supports state transitions without license enforcement', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/v1/deployments/${sharedDeploymentId}/state`)
      .set(adminKeyHeader)
      .send({ activationState: ActivationState.ACTIVE })
      .expect(200);

    expect(res.body.activationState).toBe(ActivationState.ACTIVE);
  });

  it('7. Query Deployments by Organization ID', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/deployments')
      .set(adminKeyHeader)
      .query({ organizationId: targetOrgId })
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(2);
    // Verify plaintext secret is NOT present in list query
    expect(res.body[0].registrationSecret).toBeUndefined();
  });
});
