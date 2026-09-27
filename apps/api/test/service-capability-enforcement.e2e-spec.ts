import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { Role, OrgType } from '@prisma/client';
import { JwtService } from '@nestjs/jwt';
import * as crypto from 'crypto';

describe('CP-3 — Data Plane Service Capability Enforcement E2E', () => {
  jest.setTimeout(60000);

  let app: INestApplication;
  let prisma: PrismaService;
  let jwtService: JwtService;

  const m2mSecret =
    process.env.CONTROL_PLANE_M2M_SECRET ||
    process.env.CONTROL_PLANE_PROVISIONING_SECRET ||
    'omnigrc-dev-control-plane-secret-change-in-prod';

  const secret = process.env.JWT_SECRET || 'omnigrc-dev-secret-key-change-in-prod';

  const testOrgAId = `org_cp3_a_${Date.now()}`;
  const testOrgBId = `org_cp3_b_${Date.now()}`;

  let userTokenOrgA: string;
  let userTokenOrgB: string;

  function createGlobalSignal(
    capabilityCode: string,
    targetState: string,
    sequence: string,
    timestampOverride?: string,
    signatureOverride?: string,
  ) {
    const id = `sig_g_${Date.now()}_${Math.random().toString().slice(2, 6)}`;
    const timestamp = timestampOverride || new Date().toISOString();
    const issuer = 'arav-control-plane';

    const canonicalString = `id:${id}|capabilityCode:${capabilityCode}|targetState:${targetState}|sequence:${sequence}|timestamp:${timestamp}|issuer:${issuer}`;
    const signature =
      signatureOverride ||
      crypto.createHmac('sha256', m2mSecret).update(canonicalString).digest('hex');

    return {
      id,
      capabilityCode,
      targetState,
      sequence,
      timestamp,
      issuer,
      signature,
    };
  }

  function createOrgOverrideSignal(
    orgId: string,
    capabilityCode: string,
    targetState: string,
    sequence: string,
    timestampOverride?: string,
    signatureOverride?: string,
  ) {
    const id = `sig_o_${Date.now()}_${Math.random().toString().slice(2, 6)}`;
    const timestamp = timestampOverride || new Date().toISOString();
    const issuer = 'arav-control-plane';

    const canonicalString = `id:${id}|organizationId:${orgId}|capabilityCode:${capabilityCode}|targetState:${targetState}|sequence:${sequence}|timestamp:${timestamp}|issuer:${issuer}`;
    const signature =
      signatureOverride ||
      crypto.createHmac('sha256', m2mSecret).update(canonicalString).digest('hex');

    return {
      id,
      organizationId: orgId,
      capabilityCode,
      targetState,
      sequence,
      timestamp,
      reason: 'E2E test override signal',
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

    // Create Test Organizations A & B
    await prisma.organization.upsert({
      where: { id: testOrgAId },
      update: {},
      create: {
        id: testOrgAId,
        name: 'CP-3 Test Org A',
        type: OrgType.STANDALONE,
      },
    });

    await prisma.organization.upsert({
      where: { id: testOrgBId },
      update: {},
      create: {
        id: testOrgBId,
        name: 'CP-3 Test Org B',
        type: OrgType.STANDALONE,
      },
    });

    // Create User Tokens for Org A & Org B
    const userA = await prisma.user.upsert({
      where: { email: `usera_cp3_${Date.now()}@test.co` },
      update: {},
      create: {
        email: `usera_cp3_${Date.now()}@test.co`,
        name: 'User A',
        passwordHash: '$2b$10$dummyhashplaceholderforpassword',
        organizationId: testOrgAId,
        role: Role.ADMIN,
      },
    });

    const userB = await prisma.user.upsert({
      where: { email: `userb_cp3_${Date.now()}@test.co` },
      update: {},
      create: {
        email: `userb_cp3_${Date.now()}@test.co`,
        name: 'User B',
        passwordHash: '$2b$10$dummyhashplaceholderforpassword',
        organizationId: testOrgBId,
        role: Role.ADMIN,
      },
    });

    userTokenOrgA = jwtService.sign(
      { sub: userA.id, email: userA.email, organizationId: testOrgAId, role: Role.ADMIN },
      { secret },
    );

    userTokenOrgB = jwtService.sign(
      { sub: userB.id, email: userB.email, organizationId: testOrgBId, role: Role.ADMIN },
      { secret },
    );
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.organizationServiceOverrideProjection.deleteMany({
        where: { organizationId: { in: [testOrgAId, testOrgBId] } },
      });
      await prisma.globalServiceStateProjection.deleteMany({
        where: { capabilityCode: { in: ['VENDOR_RISK', 'INCIDENT_MGMT'] } },
      });
      await prisma.user.deleteMany({
        where: { organizationId: { in: [testOrgAId, testOrgBId] } },
      });
      await prisma.organization.deleteMany({
        where: { id: { in: [testOrgAId, testOrgBId] } },
      });
    }
    if (app) {
      await app.close();
    }
  });

  describe('1. Control Signal Ingestion Endpoint Security', () => {
    it('1a. Invalid HMAC signature -> 400 Bad Request', async () => {
      const signal = createGlobalSignal('VENDOR_RISK', 'DISABLED', '10', undefined, 'invalid_signature_hex');

      await request(app.getHttpServer())
        .post('/v1/control-signals/global-service-state')
        .set('x-control-plane-secret', m2mSecret)
        .send(signal)
        .expect(400);
    });

    it('1b. Stale timestamp (> 5 min skew) -> 400 Bad Request', async () => {
      const staleTimestamp = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      const signal = createGlobalSignal('VENDOR_RISK', 'DISABLED', '10', staleTimestamp);

      await request(app.getHttpServer())
        .post('/v1/control-signals/global-service-state')
        .set('x-control-plane-secret', m2mSecret)
        .send(signal)
        .expect(400);
    });

    it('1c. Valid Global Service Signal -> 200 ACCEPTED', async () => {
      const signal = createGlobalSignal('VENDOR_RISK', 'AVAILABLE', '100');

      const res = await request(app.getHttpServer())
        .post('/v1/control-signals/global-service-state')
        .set('x-control-plane-secret', m2mSecret)
        .send(signal)
        .expect(200);

      expect(res.body.status).toBe('ACCEPTED');
      expect(res.body.capabilityCode).toBe('VENDOR_RISK');
    });

    it('1d. Stale sequence signal (incoming <= projected) -> 409 Conflict', async () => {
      const staleSignal = createGlobalSignal('VENDOR_RISK', 'DISABLED', '50'); // 50 < 100

      await request(app.getHttpServer())
        .post('/v1/control-signals/global-service-state')
        .set('x-control-plane-secret', m2mSecret)
        .send(staleSignal)
        .expect(409);
    });

    it('1e. Valid Org Service Override Signal -> 200 ACCEPTED', async () => {
      const signal = createOrgOverrideSignal(testOrgAId, 'VENDOR_RISK', 'DISABLED', '10');

      const res = await request(app.getHttpServer())
        .post('/v1/control-signals/organization-service-override')
        .set('x-control-plane-secret', m2mSecret)
        .send(signal)
        .expect(200);

      expect(res.body.status).toBe('ACCEPTED');
      expect(res.body.organizationId).toBe(testOrgAId);
    });
  });

  describe('2. Runtime Capability Enforcement via ServiceCapabilityGuard', () => {
    it('2a. Org A with VENDOR_RISK override DISABLED -> GET /vendors blocked with 403 CAPABILITY_DISABLED', async () => {
      const res = await request(app.getHttpServer())
        .get('/vendors')
        .set('Authorization', `Bearer ${userTokenOrgA}`)
        .expect(403);

      expect(res.body.code).toBe('CAPABILITY_DISABLED');
      expect(res.body.capability).toBe('VENDOR_RISK');
    });

    it('2b. Tenant Isolation: Org B without override -> GET /vendors succeeds', async () => {
      await request(app.getHttpServer())
        .get('/vendors')
        .set('Authorization', `Bearer ${userTokenOrgB}`)
        .expect(200);
    });

    it('2c. Global Disable of INCIDENT_MGMT -> GET /incidents blocked for both Org A & Org B', async () => {
      // Send global signal to disable INCIDENT_MGMT
      const signal = createGlobalSignal('INCIDENT_MGMT', 'DISABLED', '200');

      await request(app.getHttpServer())
        .post('/v1/control-signals/global-service-state')
        .set('x-control-plane-secret', m2mSecret)
        .send(signal)
        .expect(200);

      // Org A blocked
      await request(app.getHttpServer())
        .get('/incidents')
        .set('Authorization', `Bearer ${userTokenOrgA}`)
        .expect(403);

      // Org B blocked
      await request(app.getHttpServer())
        .get('/incidents')
        .set('Authorization', `Bearer ${userTokenOrgB}`)
        .expect(403);
    });

    it('2d. Clear Org A override for VENDOR_RISK -> GET /vendors succeeds for Org A', async () => {
      const clearSignal = createOrgOverrideSignal(testOrgAId, 'VENDOR_RISK', 'INHERIT', '50');

      await request(app.getHttpServer())
        .post('/v1/control-signals/organization-service-override')
        .set('x-control-plane-secret', m2mSecret)
        .send(clearSignal)
        .expect(200);

      await request(app.getHttpServer())
        .get('/vendors')
        .set('Authorization', `Bearer ${userTokenOrgA}`)
        .expect(200);
    });
  });
});
