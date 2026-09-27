import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { ControlPlanePrismaService } from '../src/prisma/prisma.service';
import { OperatorRole } from '@prisma/control-plane-client';
import { JwtService } from '@nestjs/jwt';

describe('CP-3 — Service Control E2E Security Suite (Control Plane)', () => {
  jest.setTimeout(60000);

  let app: INestApplication;
  let prisma: ControlPlanePrismaService;
  let jwtService: JwtService;

  let superAdminToken: string;
  let auditorToken: string;

  const testOrgId = `org_e2e_cp3_${Date.now()}`;

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

    const createOperatorToken = async (email: string, role: OperatorRole, name: string) => {
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
          userAgent: 'e2e-test',
          familyId: `fam_${op.id}`,
          expiresAt: new Date(Date.now() + 3600000),
        },
      });

      return jwtService.sign(
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
    };

    superAdminToken = await createOperatorToken('superadmin_cp3_e2e@arav.io', OperatorRole.PLATFORM_SUPER_ADMIN, 'Super Admin');
    auditorToken = await createOperatorToken('auditor_cp3_e2e@arav.io', OperatorRole.READ_ONLY_AUDITOR, 'Auditor');

    // Create target OrganizationControlState for override tests
    await prisma.organizationControlState.upsert({
      where: { organizationId: testOrgId },
      update: {},
      create: {
        organizationId: testOrgId,
        state: 'ACTIVE',
        reason: 'E2E setup',
      },
    });
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.organizationServiceOverride.deleteMany({ where: { organizationId: testOrgId } });
      await prisma.organizationControlState.deleteMany({ where: { organizationId: testOrgId } });
    }
    if (app) {
      await app.close();
    }
  });

  describe('GET /v1/services (List Service Catalog)', () => {
    it('1. Unauthenticated operator -> 401', async () => {
      await request(app.getHttpServer())
        .get('/v1/services')
        .expect(401);
    });

    it('2. Authorized operator -> 200 with service catalog array', async () => {
      const res = await request(app.getHttpServer())
        .get('/v1/services')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThanOrEqual(18);
    });
  });

  describe('PUT /v1/services/:code/global-state (Update Global Service State)', () => {
    it('3. Insufficient operator role (READ_ONLY_AUDITOR) -> 403', async () => {
      await request(app.getHttpServer())
        .put('/v1/services/AI_DOC_INTELLIGENCE/global-state')
        .set('Authorization', `Bearer ${auditorToken}`)
        .send({
          state: 'DISABLED',
          reason: 'Attempting unauthorized global shutdown',
        })
        .expect(403);
    });

    it('4. Invalid reason (< 10 chars) -> 400 REASON_TOO_SHORT', async () => {
      await request(app.getHttpServer())
        .put('/v1/services/AI_DOC_INTELLIGENCE/global-state')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          state: 'DISABLED',
          reason: 'short',
        })
        .expect(400);
    });

    it('5. Trivial reason ("testing123") -> 400 REASON_TOO_TRIVIAL', async () => {
      await request(app.getHttpServer())
        .put('/v1/services/AI_DOC_INTELLIGENCE/global-state')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          state: 'DISABLED',
          reason: 'testing123 testing123',
        })
        .expect(400);
    });

    it('6. Authorized operator (SUPER_ADMIN) with valid reason -> 200 SUCCESS', async () => {
      const res = await request(app.getHttpServer())
        .put('/v1/services/AI_DOC_INTELLIGENCE/global-state')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          state: 'DISABLED',
          reason: 'Platform maintenance for document AI infrastructure upgrade',
        })
        .expect(200);

      expect(res.body.capabilityCode).toBe('AI_DOC_INTELLIGENCE');
      expect(res.body.state).toBe('DISABLED');
    });

    it('7. Duplicate request with same idempotencyKey -> 200 (idempotent)', async () => {
      const key = `idem_global_${Date.now()}`;
      const payload = {
        state: 'DISABLED',
        reason: 'Emergency security audit on AI services',
        idempotencyKey: key,
      };

      const res1 = await request(app.getHttpServer())
        .put('/v1/services/AI_GRC_CHAT/global-state')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send(payload)
        .expect(200);

      const res2 = await request(app.getHttpServer())
        .put('/v1/services/AI_GRC_CHAT/global-state')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send(payload)
        .expect(200);

      expect(res2.body.idempotent).toBe(true);
    });

    it('8. Same idempotencyKey with different target state -> 409 Conflict', async () => {
      const key = `idem_global_conflict_${Date.now()}`;

      await request(app.getHttpServer())
        .put('/v1/services/AI_CONTROL_MAPPING/global-state')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          state: 'DISABLED',
          reason: 'Security maintenance on control mapping',
          idempotencyKey: key,
        })
        .expect(200);

      await request(app.getHttpServer())
        .put('/v1/services/AI_CONTROL_MAPPING/global-state')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          state: 'AVAILABLE',
          reason: 'Security maintenance on control mapping',
          idempotencyKey: key,
        })
        .expect(409);
    });
  });

  describe('PUT /v1/organizations/:orgId/services/:code (Set Organization Service Override)', () => {
    it('9. Commercial Primacy Rule: Reject AVAILABLE override when global state is COMMERCIAL_DISABLED -> 400', async () => {
      // Set global state to COMMERCIAL_DISABLED first
      await request(app.getHttpServer())
        .put('/v1/services/AI_DOC_INTELLIGENCE/global-state')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          state: 'COMMERCIAL_DISABLED',
          reason: 'Commercial licensing tier restriction global disablement',
        })
        .expect(200);

      // Attempt to set Org override to AVAILABLE
      const res = await request(app.getHttpServer())
        .put(`/v1/organizations/${testOrgId}/services/AI_DOC_INTELLIGENCE`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          overrideState: 'AVAILABLE',
          reason: 'Customer requesting activation override',
        })
        .expect(400);

      expect(res.body.code).toBe('INVALID_OVERRIDE_PRIMACY');
    });

    it('10. Authorized override to DISABLED when global state is AVAILABLE -> 200 SUCCESS', async () => {
      // Re-enable global state to AVAILABLE
      await request(app.getHttpServer())
        .put('/v1/services/AI_DOC_INTELLIGENCE/global-state')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          state: 'AVAILABLE',
          reason: 'Maintenance window completed. Restoring service.',
        })
        .expect(200);

      const res = await request(app.getHttpServer())
        .put(`/v1/organizations/${testOrgId}/services/AI_DOC_INTELLIGENCE`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          overrideState: 'DISABLED',
          reason: 'Customer requested disabling AI Document Intelligence for compliance team',
        })
        .expect(200);

      expect(res.body.organizationId).toBe(testOrgId);
      expect(res.body.capabilityCode).toBe('AI_DOC_INTELLIGENCE');
      expect(res.body.overrideState).toBe('DISABLED');
    });

    it('11. DELETE /v1/organizations/:orgId/services/:code (Clear Override) -> 200 SUCCESS', async () => {
      const res = await request(app.getHttpServer())
        .delete(`/v1/organizations/${testOrgId}/services/AI_DOC_INTELLIGENCE`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .expect(200);

      expect(res.body.cleared).toBe(true);
    });
  });
});
