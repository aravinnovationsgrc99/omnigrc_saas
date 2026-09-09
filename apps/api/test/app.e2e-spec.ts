import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

describe('OMNiGRC Phase 1-8 Straight-Line Smoke E2E Test', () => {
  let app: INestApplication;
  let accessToken: string;
  let organizationId: string;
  let assetId: string;
  let riskId: string;
  let controlId: string;
  let taskId: string;

  const testEmail = `e2e_admin_${Date.now()}@omnigrc-test.com`;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('Phase 8: GET /health - system observability', async () => {
    const res = await request(app.getHttpServer()).get('/health').expect(200);

    expect(res.body.status).toBeDefined();
    expect(res.body.services.database.status).toBe('up');
  });

  it('Phase 1: POST /auth/register - Register Organization & Admin User', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        organizationName: 'Smoke Test Org',
        name: 'Smoke Admin',
        email: testEmail,
        password: 'Password123!',
        primaryRegion: 'India',
      })
      .expect(201);

    expect(res.body.tokens.accessToken).toBeDefined();
    expect(res.body.organization.name).toBe('Smoke Test Org');

    accessToken = res.body.tokens.accessToken;
    organizationId = res.body.organization.id;
  });

  it('Phase 1: POST /auth/login - Authenticate registered admin', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        email: testEmail,
        password: 'Password123!',
      })
      .expect(200);

    expect(res.body.tokens.accessToken).toBeDefined();
    accessToken = res.body.tokens.accessToken;
  });

  it('Phase 2: POST /assets - Create Asset linked to Organization', async () => {
    const res = await request(app.getHttpServer())
      .post('/assets')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        name: 'Primary Database Server',
        type: 'DATA_STORE',
        owner: 'SecOps Team',
        criticality: 'HIGH',
        vendorName: 'AWS RDS',
        dataResidencyRegion: 'India',
      })
      .expect(201);

    expect(res.body.id).toBeDefined();
    expect(res.body.name).toBe('Primary Database Server');
    assetId = res.body.id;
  });

  it('Phase 3: POST /risks - Create Risk linked to Asset', async () => {
    const res = await request(app.getHttpServer())
      .post('/risks')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        title: 'Unauthorized Database Access Risk',
        description: 'Risk of unencrypted or unauthenticated access',
        likelihood: 4,
        impact: 5,
        status: 'OPEN',
        owner: 'CISO',
        assetId: assetId,
      })
      .expect(201);

    expect(res.body.id).toBeDefined();
    expect(res.body.score).toBe(20);
    expect(res.body.scoreBand).toBe('HIGH');
    riskId = res.body.id;
  });

  it('Phase 4: POST /controls - Create Control for Framework', async () => {
    const res = await request(app.getHttpServer())
      .post('/controls')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        code: 'ISO-A.9.2.1',
        title: 'User Registration and De-registration Policy',
        description: 'Strict onboarding and offboarding access controls',
        framework: 'ISO27001',
        category: 'Access Control',
        owner: 'Identity Team',
      })
      .expect(201);

    expect(res.body.id).toBeDefined();
    expect(res.body.code).toBe('ISO-A.9.2.1');
    controlId = res.body.id;
  });

  it('Phase 4: POST /controls/mapping/suggest - AI Control Mapping suggestion', async () => {
    const res = await request(app.getHttpServer())
      .post('/controls/mapping/suggest')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        sourceFramework: 'ISO27001',
        targetFramework: 'SOC2',
      })
      .expect(200);

    expect(res.body.suggestedMappings).toBeDefined();
    expect(res.body.aiProviderUsed).toBeDefined();
  });

  it('Phase 5: POST /compliance-tasks - Create Compliance Task linked to Control', async () => {
    const res = await request(app.getHttpServer())
      .post('/compliance-tasks')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        title: 'Audit User Access Logs for Q3',
        description: 'Verify all deactivated users have active access revoked',
        status: 'NOT_STARTED',
        owner: 'Compliance Analyst',
        controlId: controlId,
      })
      .expect(201);

    expect(res.body.id).toBeDefined();
    expect(res.body.title).toBe('Audit User Access Logs for Q3');
    taskId = res.body.id;
  });

  it('Phase 5: PATCH /compliance-tasks/:id/status - Move Task through Board', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/compliance-tasks/${taskId}/status`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        status: 'IN_PROGRESS',
      })
      .expect(200);

    expect(res.body.status).toBe('IN_PROGRESS');
  });

  it('Phase 6: GET /audit-log - Audit Log Explorer verification', async () => {
    const res = await request(app.getHttpServer())
      .get('/audit-log')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(res.body.items).toBeDefined();
    expect(res.body.total).toBeGreaterThanOrEqual(5);
  });

  it('Phase 8: POST /auth/onboarding/complete - Complete Onboarding Wizard', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/onboarding/complete')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        primaryFramework: 'ISO27001',
      })
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.onboardingCompleted).toBe(true);
  });
});
