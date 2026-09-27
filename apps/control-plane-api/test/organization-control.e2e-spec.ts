import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { ControlPlanePrismaService } from '../src/prisma/prisma.service';
import { OperatorRole, ControlState } from '@prisma/control-plane-client';
import { JwtService } from '@nestjs/jwt';

describe('CP-2 — Organization Control State E2E Suite', () => {
  jest.setTimeout(60000);

  let app: INestApplication;
  let prisma: ControlPlanePrismaService;
  let jwtService: JwtService;

  let superAdminToken: string;
  let opsEngineerToken: string;
  let commercialOpToken: string;
  let auditorToken: string;

  const testOrgId = `org_e2e_cp2_${Date.now()}`;

  beforeAll(async () => {
    (global as any).fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue({ status: 'ACCEPTED' }),
    });

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    prisma = moduleRef.get<ControlPlanePrismaService>(ControlPlanePrismaService);
    jwtService = moduleRef.get<JwtService>(JwtService);

    const secret = process.env.OPERATOR_JWT_SECRET || process.env.JWT_SECRET || 'arav-operator-dev-jwt-secret-key-2026';

    const createOperatorAndSession = async (email: string, role: OperatorRole, name: string) => {
      const op = await prisma.operator.upsert({
        where: { email },
        update: { role },
        create: {
          email,
          passwordHash: 'hash',
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
          userAgent: 'test',
          familyId: `fam_${op.id}`,
          expiresAt: new Date(Date.now() + 3600000),
        },
      });

      const token = jwtService.sign(
        {
          sub: op.id,
          email: op.email,
          role: op.role,
          sessionId: session.id,
          type: 'OPERATOR_ACCESS',
        },
        {
          secret,
          expiresIn: '1h',
          issuer: 'OMNiGRC Control Plane',
          audience: 'omnigrc-operator-api',
        },
      );

      return token;
    };

    superAdminToken = await createOperatorAndSession('superadmin_cp2@arav.io', OperatorRole.PLATFORM_SUPER_ADMIN, 'Super Admin');
    opsEngineerToken = await createOperatorAndSession('ops_cp2@arav.io', OperatorRole.OPERATIONS_ENGINEER, 'Ops Engineer');
    commercialOpToken = await createOperatorAndSession('commercial_cp2@arav.io', OperatorRole.COMMERCIAL_OPERATOR, 'Commercial Op');
    auditorToken = await createOperatorAndSession('auditor_cp2@arav.io', OperatorRole.READ_ONLY_AUDITOR, 'Auditor');
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  describe('1. Unauthenticated & Authorization Boundaries', () => {
    it('should reject unauthenticated requests with HTTP 401', async () => {
      await request(app.getHttpServer())
        .get('/v1/organizations')
        .expect(401);
    });

    it('should allow Read-Only Auditor to view organization control states', async () => {
      await request(app.getHttpServer())
        .get('/v1/organizations')
        .set('Authorization', `Bearer ${auditorToken}`)
        .expect(200);
    });

    it('should reject state transition mutation by Read-Only Auditor with HTTP 403', async () => {
      await request(app.getHttpServer())
        .post(`/v1/organizations/${testOrgId}/control-state/transition`)
        .set('Authorization', `Bearer ${auditorToken}`)
        .send({
          targetState: ControlState.ACTIVE,
          reason: 'Unauthorized mutation attempt by auditor',
        })
        .expect(403);
    });

    it('should reject state transition mutation by Commercial Operator with HTTP 403', async () => {
      await request(app.getHttpServer())
        .post(`/v1/organizations/${testOrgId}/control-state/transition`)
        .set('Authorization', `Bearer ${commercialOpToken}`)
        .send({
          targetState: ControlState.ACTIVE,
          reason: 'Unauthorized mutation attempt by commercial operator',
        })
        .expect(403);
    });
  });

  describe('2. State Transition Machine & Reason Requirements', () => {
    it('should initialize organization state as PENDING on first lookup', async () => {
      const res = await request(app.getHttpServer())
        .get(`/v1/organizations/${testOrgId}/control-state`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .expect(200);

      expect(res.body.state).toBe(ControlState.PENDING);
      expect(res.body.sequence).toBe('1');
    });

    it('should reject transition if reason is less than 10 characters', async () => {
      await request(app.getHttpServer())
        .post(`/v1/organizations/${testOrgId}/control-state/transition`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          targetState: ControlState.ACTIVE,
          reason: 'Short',
        })
        .expect(400);
    });

    it('should reject transition if reason is trivial/spam', async () => {
      await request(app.getHttpServer())
        .post(`/v1/organizations/${testOrgId}/control-state/transition`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          targetState: ControlState.ACTIVE,
          reason: 'testing123456',
        })
        .expect(400);
    });

    it('should allow Super Admin to execute PENDING -> ACTIVE transition', async () => {
      const res = await request(app.getHttpServer())
        .post(`/v1/organizations/${testOrgId}/control-state/transition`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          targetState: ControlState.ACTIVE,
          reason: 'Valid operational onboarding of primary organization',
          idempotencyKey: `idem_act_${Date.now()}`,
        })
        .expect(200);

      expect(res.body.state).toBe(ControlState.ACTIVE);
      expect(res.body.previousState).toBe(ControlState.PENDING);
      expect(res.body.sequence).toBe('2');
    });

    it('should allow Operations Engineer to execute ACTIVE -> SUSPENDED transition', async () => {
      const res = await request(app.getHttpServer())
        .post(`/v1/organizations/${testOrgId}/control-state/transition`)
        .set('Authorization', `Bearer ${opsEngineerToken}`)
        .send({
          targetState: ControlState.SUSPENDED,
          reason: 'Operational suspension for compliance audit review',
        })
        .expect(200);

      expect(res.body.state).toBe(ControlState.SUSPENDED);
      expect(res.body.previousState).toBe(ControlState.ACTIVE);
      expect(res.body.sequence).toBe('3');
    });

    it('should reject illegal state transition SUSPENDED -> PENDING with HTTP 400', async () => {
      await request(app.getHttpServer())
        .post(`/v1/organizations/${testOrgId}/control-state/transition`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          targetState: ControlState.PENDING,
          reason: 'Illegal backward state transition to pending',
        })
        .expect(400);
    });

    it('should allow SUSPENDED -> ACTIVE reactivation', async () => {
      const res = await request(app.getHttpServer())
        .post(`/v1/organizations/${testOrgId}/control-state/transition`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          targetState: ControlState.ACTIVE,
          reason: 'Reactivation after successful audit verification',
        })
        .expect(200);

      expect(res.body.state).toBe(ControlState.ACTIVE);
      expect(res.body.sequence).toBe('4');
    });

    it('should allow ACTIVE -> DISABLED transition', async () => {
      const res = await request(app.getHttpServer())
        .post(`/v1/organizations/${testOrgId}/control-state/transition`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          targetState: ControlState.DISABLED,
          reason: 'Platform security team emergency disablement',
        })
        .expect(200);

      expect(res.body.state).toBe(ControlState.DISABLED);
      expect(res.body.sequence).toBe('5');
    });

    it('should allow DISABLED -> DECOMMISSIONED transition', async () => {
      const res = await request(app.getHttpServer())
        .post(`/v1/organizations/${testOrgId}/control-state/transition`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          targetState: ControlState.DECOMMISSIONED,
          reason: 'Permanent contract termination and customer offboarding',
        })
        .expect(200);

      expect(res.body.state).toBe(ControlState.DECOMMISSIONED);
      expect(res.body.sequence).toBe('6');
    });

    it('should reject any transition out of DECOMMISSIONED terminal state with HTTP 400', async () => {
      await request(app.getHttpServer())
        .post(`/v1/organizations/${testOrgId}/control-state/transition`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          targetState: ControlState.ACTIVE,
          reason: 'Attempting to revive decommissioned organization',
        })
        .expect(400);
    });
  });

  describe('3. Audit Trail Persistence', () => {
    it('should record append-only state transition audit logs in database', async () => {
      const logs = await prisma.controlPlaneAuditLog.findMany({
        where: {
          entityType: 'ORGANIZATION_CONTROL_STATE',
          entityId: testOrgId,
        },
      });

      expect(logs.length).toBeGreaterThanOrEqual(5);
    });
  });
});
