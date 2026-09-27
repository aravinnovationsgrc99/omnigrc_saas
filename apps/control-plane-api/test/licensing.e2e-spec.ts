import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { ControlPlanePrismaService } from '../src/prisma/prisma.service';
import { OperatorRole } from '@prisma/control-plane-client';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';

describe('CP-5 Licensing & Commercial Control E2E Suite', () => {
  jest.setTimeout(60000);

  let app: INestApplication;
  let prisma: ControlPlanePrismaService;
  let jwtService: JwtService;

  let commercialOperatorToken: string;
  let readOnlyAuditorToken: string;
  let customerId: string;
  let commercialAgreementId: string;
  let licenseId: string;
  let deploymentId: string;

  beforeAll(async () => {
    (global as any).fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue({ status: 'ACCEPTED' }),
    });

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    prisma = moduleFixture.get<ControlPlanePrismaService>(ControlPlanePrismaService);
    jwtService = moduleFixture.get<JwtService>(JwtService);

    const secret = process.env.OPERATOR_JWT_SECRET || process.env.JWT_SECRET || 'arav-operator-dev-jwt-secret-key-2026';

    const createOperatorAndSession = async (email: string, role: OperatorRole, name: string) => {
      const op = await prisma.operator.upsert({
        where: { email },
        update: { role },
        create: {
          email,
          passwordHash: await argon2.hash('OperatorPass123!'),
          fullName: name,
          role,
          mfaEnabled: true,
        },
      });

      const session = await prisma.operatorSession.create({
        data: {
          operatorId: op.id,
          refreshTokenHash: 'hash_123',
          ipAddress: '127.0.0.1',
          userAgent: 'e2e-test',
          familyId: `fam_${Date.now()}_${Math.random()}`,
          expiresAt: new Date(Date.now() + 86400000),
        },
      });

      const token = jwtService.sign(
        { sub: op.id, email: op.email, role: op.role, sessionId: session.id, type: 'OPERATOR_ACCESS' },
        {
          secret,
          expiresIn: '1h',
          issuer: 'OMNiGRC Control Plane',
          audience: 'omnigrc-operator-api',
        },
      );

      return token;
    };

    commercialOperatorToken = await createOperatorAndSession('comm-op-cp5@arav.internal', OperatorRole.COMMERCIAL_OPERATOR, 'Commercial Op');
    readOnlyAuditorToken = await createOperatorAndSession('read-auditor-cp5@arav.internal', OperatorRole.READ_ONLY_AUDITOR, 'Read Auditor');

    // Create Commercial Customer and Agreement
    const customer = await prisma.customer.create({
      data: { name: 'CP5 Test Enterprise Customer' },
    });
    customerId = customer.id;

    const agreement = await prisma.commercialAgreement.create({
      data: { customerId },
    });
    commercialAgreementId = agreement.id;

    // Create a Test Deployment
    const deployment = await prisma.deployment.create({
      data: {
        organizationId: `org-cp5-${Date.now()}`,
        customerId,
        commercialAgreementId,
        deploymentModel: 'PRIVATE_MSSP',
        environment: 'PRODUCTION',
        infrastructureOwner: 'ARAV',
        registrationSecretHash: 'secret-hash',
      },
    });
    deploymentId = deployment.id;
  });

  afterAll(async () => {
    if (customerId) {
      await prisma.customer.delete({ where: { id: customerId } }).catch(() => {});
    }
    await app.close();
  });

  it('1. POST /v1/licenses — Create commercial license as COMMERCIAL_OPERATOR', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/licenses')
      .set('Authorization', `Bearer ${commercialOperatorToken}`)
      .send({
        commercialAgreementId,
        product: 'OMNIGRC',
        startsAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 30 * 86400000).toISOString(),
        maxDeployments: 2,
      })
      .expect(201);

    expect(res.body.id).toBeDefined();
    expect(res.body.status).toBe('TRIAL');
    licenseId = res.body.id;
  });

  it('2. POST /v1/licenses — Reject license creation by READ_ONLY_AUDITOR (403 Forbidden)', async () => {
    await request(app.getHttpServer())
      .post('/v1/licenses')
      .set('Authorization', `Bearer ${readOnlyAuditorToken}`)
      .send({
        commercialAgreementId,
        startsAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 30 * 86400000).toISOString(),
      })
      .expect(403);
  });

  it('3. POST /v1/licenses/:id/deployments — Associate Deployment with License', async () => {
    const res = await request(app.getHttpServer())
      .post(`/v1/licenses/${licenseId}/deployments`)
      .set('Authorization', `Bearer ${commercialOperatorToken}`)
      .send({ deploymentId })
      .expect(200);

    expect(res.body.licenseId).toBe(licenseId);
  });

  it('4. POST /v1/licenses/:id/entitlements — Grant Framework Entitlement', async () => {
    const res = await request(app.getHttpServer())
      .post(`/v1/licenses/${licenseId}/entitlements`)
      .set('Authorization', `Bearer ${commercialOperatorToken}`)
      .send({
        code: 'ISO27001',
        name: 'ISO 27001 Framework',
        enabled: true,
      })
      .expect(200);

    expect(res.body.code).toBe('ISO27001');
    expect(res.body.enabled).toBe(true);
  });

  it('5. GET /v1/licenses/:id/artifact — Issue Signed Ed25519 License Artifact', async () => {
    const res = await request(app.getHttpServer())
      .get(`/v1/licenses/${licenseId}/artifact`)
      .set('Authorization', `Bearer ${commercialOperatorToken}`)
      .expect(200);

    expect(res.body.algorithm).toBe('Ed25519');
    expect(res.body.signature).toBeDefined();
    expect(res.body.payload.licenseId).toBe(licenseId);
    expect(res.body.payload.sequence).toBeGreaterThanOrEqual(1);
    expect(res.body.payload.entitlements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'ISO27001', enabled: true }),
      ]),
    );
  });

  it('6. POST /v1/licenses/:id/suspend — Suspend commercial license', async () => {
    const res = await request(app.getHttpServer())
      .post(`/v1/licenses/${licenseId}/suspend`)
      .set('Authorization', `Bearer ${commercialOperatorToken}`)
      .send({ reason: 'Non-payment suspension' })
      .expect(200);

    expect(res.body.status).toBe('SUSPENDED');
  });

  it('7. POST /v1/licenses/:id/reactivate — Reactivate suspended license', async () => {
    const res = await request(app.getHttpServer())
      .post(`/v1/licenses/${licenseId}/reactivate`)
      .set('Authorization', `Bearer ${commercialOperatorToken}`)
      .send({ reason: 'Account brought current' })
      .expect(200);

    expect(res.body.status).toBe('ACTIVE');
  });

  it('8. POST /v1/licenses/:id/revoke — Revoke commercial license (Terminal)', async () => {
    const res = await request(app.getHttpServer())
      .post(`/v1/licenses/${licenseId}/revoke`)
      .set('Authorization', `Bearer ${commercialOperatorToken}`)
      .send({ reason: 'Contract termination' })
      .expect(200);

    expect(res.body.status).toBe('REVOKED');
  });

  it('9. POST /v1/licenses/:id/reactivate — Reject reactivating a REVOKED license (400 Bad Request)', async () => {
    await request(app.getHttpServer())
      .post(`/v1/licenses/${licenseId}/reactivate`)
      .set('Authorization', `Bearer ${commercialOperatorToken}`)
      .send({ reason: 'Attempting invalid reactivation' })
      .expect(400);
  });
});
