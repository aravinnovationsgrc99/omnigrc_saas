import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { Role, OrgType } from '@prisma/client';
import { JwtService } from '@nestjs/jwt';
import * as crypto from 'crypto';

describe('CP-2 — Data Plane Organization Control State Enforcement E2E', () => {
  jest.setTimeout(60000);

  let app: INestApplication;
  let prisma: PrismaService;
  let jwtService: JwtService;

  const m2mSecret =
    process.env.CONTROL_PLANE_M2M_SECRET ||
    process.env.CONTROL_PLANE_PROVISIONING_SECRET ||
    'omnigrc-dev-control-plane-secret-change-in-prod';

  const secret = process.env.JWT_SECRET || 'omnigrc-dev-secret-key-change-in-prod';

  const orgActiveId = `org_cp2_act_${Date.now()}`;
  const orgSuspendedId = `org_cp2_susp_${Date.now()}`;
  const orgDisabledId = `org_cp2_dis_${Date.now()}`;

  let activeUserToken: string;
  let suspendedUserToken: string;
  let disabledUserToken: string;

  function createSignal(
    orgId: string,
    targetState: string,
    sequence: string,
  ) {
    const id = `sig_${Date.now()}_${Math.random()}`;
    const timestamp = new Date().toISOString();
    const issuer = 'arav-control-plane';

    const canonicalString = `id:${id}|organizationId:${orgId}|targetState:${targetState}|sequence:${sequence}|timestamp:${timestamp}|issuer:${issuer}`;
    const signature = crypto
      .createHmac('sha256', m2mSecret)
      .update(canonicalString)
      .digest('hex');

    return {
      id,
      organizationId: orgId,
      targetState,
      sequence,
      timestamp,
      reason: `E2E state projection signal to ${targetState}`,
      issuer,
      signature,
    };
  }

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    prisma = moduleRef.get<PrismaService>(PrismaService);
    jwtService = moduleRef.get<JwtService>(JwtService);

    // Create test organizations
    await prisma.organization.create({
      data: { id: orgActiveId, name: 'CP2 Active Org', type: OrgType.STANDALONE },
    });

    await prisma.organization.create({
      data: { id: orgSuspendedId, name: 'CP2 Suspended Org', type: OrgType.STANDALONE },
    });

    await prisma.organization.create({
      data: { id: orgDisabledId, name: 'CP2 Disabled Org', type: OrgType.STANDALONE },
    });

    // Create test users
    const userActive = await prisma.user.create({
      data: {
        email: `user_act_${Date.now()}@test.com`,
        name: 'Active User',
        passwordHash: 'hash',
        role: Role.ADMIN,
        organizationId: orgActiveId,
      },
    });

    const userSuspended = await prisma.user.create({
      data: {
        email: `user_susp_${Date.now()}@test.com`,
        name: 'Suspended User',
        passwordHash: 'hash',
        role: Role.ADMIN,
        organizationId: orgSuspendedId,
      },
    });

    const userDisabled = await prisma.user.create({
      data: {
        email: `user_dis_${Date.now()}@test.com`,
        name: 'Disabled User',
        passwordHash: 'hash',
        role: Role.ADMIN,
        organizationId: orgDisabledId,
      },
    });

    // Issue JWT tokens
    activeUserToken = jwtService.sign(
      { sub: userActive.id, email: userActive.email, organizationId: orgActiveId, role: Role.ADMIN },
      { secret, expiresIn: '1h' },
    );

    suspendedUserToken = jwtService.sign(
      { sub: userSuspended.id, email: userSuspended.email, organizationId: orgSuspendedId, role: Role.ADMIN },
      { secret, expiresIn: '1h' },
    );

    disabledUserToken = jwtService.sign(
      { sub: userDisabled.id, email: userDisabled.email, organizationId: orgDisabledId, role: Role.ADMIN },
      { secret, expiresIn: '1h' },
    );

    // Project Control States
    await prisma.organizationControlStateProjection.create({
      data: { organizationId: orgActiveId, state: 'ACTIVE', sequence: 1n },
    });

    await prisma.organizationControlStateProjection.create({
      data: { organizationId: orgSuspendedId, state: 'SUSPENDED', sequence: 1n },
    });

    await prisma.organizationControlStateProjection.create({
      data: { organizationId: orgDisabledId, state: 'DISABLED', sequence: 1n },
    });
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  describe('1. M2M Control Signal Receiver', () => {
    it('should reject M2M signal without x-control-plane-secret header with HTTP 403', async () => {
      const signal = createSignal(orgActiveId, 'ACTIVE', '2');
      await request(app.getHttpServer())
        .post('/v1/control-signals/organization-state')
        .send(signal)
        .expect(403);
    });

    it('should ingest valid signed M2M signal and update projected control state', async () => {
      const signal = createSignal(orgActiveId, 'ACTIVE', '2');
      const res = await request(app.getHttpServer())
        .post('/v1/control-signals/organization-state')
        .set('x-control-plane-secret', m2mSecret)
        .send(signal)
        .expect(200);

      expect(res.body.status).toBe('ACCEPTED');
      expect(res.body.sequence).toBe('2');
    });

    it('should reject stale sequence signal with HTTP 409 Conflict', async () => {
      const signal = createSignal(orgActiveId, 'ACTIVE', '1'); // sequence 1 <= current sequence 2
      await request(app.getHttpServer())
        .post('/v1/control-signals/organization-state')
        .set('x-control-plane-secret', m2mSecret)
        .send(signal)
        .expect(409);
    });
  });

  describe('2. Request Enforcement by Organization State', () => {
    it('should allow read (GET) operations on ACTIVE organization with HTTP 200', async () => {
      await request(app.getHttpServer())
        .get('/risks')
        .set('Authorization', `Bearer ${activeUserToken}`)
        .expect(200);
    });

    it('should allow read (GET) operations on SUSPENDED organization with HTTP 200', async () => {
      await request(app.getHttpServer())
        .get('/risks')
        .set('Authorization', `Bearer ${suspendedUserToken}`)
        .expect(200);
    });

    it('should reject mutating (POST) operations on SUSPENDED organization with HTTP 423 Locked', async () => {
      const res = await request(app.getHttpServer())
        .post('/risks')
        .set('Authorization', `Bearer ${suspendedUserToken}`)
        .send({
          title: 'Suspended Org Risk',
          category: 'COMPLIANCE',
          description: 'Testing write rejection on suspended org',
        })
        .expect(423);

      expect(res.body.code).toBe('ORGANIZATION_SUSPENDED');
    });

    it('should reject read (GET) operations on DISABLED organization with HTTP 403 Forbidden', async () => {
      const res = await request(app.getHttpServer())
        .get('/risks')
        .set('Authorization', `Bearer ${disabledUserToken}`)
        .expect(403);

      expect(res.body.code).toBe('ORGANIZATION_DISABLED');
    });

    it('should reject mutating (POST) operations on DISABLED organization with HTTP 403 Forbidden', async () => {
      const res = await request(app.getHttpServer())
        .post('/risks')
        .set('Authorization', `Bearer ${disabledUserToken}`)
        .send({
          title: 'Disabled Org Risk',
          category: 'COMPLIANCE',
        })
        .expect(403);

      expect(res.body.code).toBe('ORGANIZATION_DISABLED');
    });
  });
});
