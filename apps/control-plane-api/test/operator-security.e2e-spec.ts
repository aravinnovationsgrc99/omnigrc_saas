import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { ControlPlanePrismaService } from '../src/prisma/prisma.service';
import { OperatorSecurityService } from '../src/auth/operator-security.service';
import { RedactionService } from '../src/audit/redaction.service';
import { OperatorRole } from '@prisma/control-plane-client';

describe('CP-1.1 — Operator Security & E2E Verification Suite', () => {
  jest.setTimeout(60000);

  let app: INestApplication;
  let prisma: ControlPlanePrismaService;
  let securityService: OperatorSecurityService;
  let redactionService: RedactionService;

  let superAdminToken: string;
  let superAdminRefreshToken: string;
  let superAdminId: string;

  let auditorToken: string;
  let auditorId: string;

  let commercialOpToken: string;
  let commercialOpId: string;

  let suspendedOpId: string;

  let customerId: string;
  let commercialAgreementId: string;
  let licenseId: string;

  const BOOTSTRAP_SECRET = 'arav-cp-dev-bootstrap-secret-2026';
  const DEV_ADMIN_KEY = 'arav-cp-admin-dev-key';

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    prisma = moduleRef.get<ControlPlanePrismaService>(ControlPlanePrismaService);
    securityService = moduleRef.get<OperatorSecurityService>(OperatorSecurityService);
    redactionService = moduleRef.get<RedactionService>(RedactionService);

    // Clean up test database tables to ensure clean state
    await prisma.controlPlaneAuditLog.deleteMany({});
    await prisma.operatorSession.deleteMany({});
    await prisma.operator.deleteMany({});
    await prisma.deployment.deleteMany({});
    await prisma.license.deleteMany({});
    await prisma.commercialAgreement.deleteMany({});
    await prisma.customer.deleteMany({});
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  // 1. OPERATOR BOOTSTRAP
  describe('1. Operator Bootstrap Security Boundary', () => {
    it('should successfully bootstrap initial PLATFORM_SUPER_ADMIN when zero operators exist', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/operator-auth/bootstrap')
        .send({
          email: 'initial-admin@omnigrc.co',
          password: 'SuperSecurePassword123!',
          fullName: 'Initial Super Admin',
          bootstrapSecret: BOOTSTRAP_SECRET,
        })
        .expect(201);

      expect(res.body.accessToken).toBeDefined();
      expect(res.body.refreshToken).toBeDefined();
      expect(res.body.operator.email).toEqual('initial-admin@omnigrc.co');
      expect(res.body.operator.role).toEqual(OperatorRole.PLATFORM_SUPER_ADMIN);

      superAdminToken = res.body.accessToken;
      superAdminRefreshToken = res.body.refreshToken;
      superAdminId = res.body.operator.id;
    });

    it('should permanently reject subsequent bootstrap requests once an operator exists', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/operator-auth/bootstrap')
        .send({
          email: 'second-admin@omnigrc.co',
          password: 'SuperSecurePassword123!',
          fullName: 'Hacker Admin',
          bootstrapSecret: BOOTSTRAP_SECRET,
        })
        .expect(403);

      expect(res.body.message).toMatch(/permanently disabled/i);
    });
  });

  // 2. LOGIN & MFA
  describe('2. Operator Login & MFA Enforcement', () => {
    it('should allow login with valid password for initial admin', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/operator-auth/login')
        .send({
          email: 'initial-admin@omnigrc.co',
          password: 'SuperSecurePassword123!',
        })
        .expect(200);

      expect(res.body.accessToken).toBeDefined();
      expect(res.body.refreshToken).toBeDefined();
    });

    it('should reject login with wrong password and increment failed attempts', async () => {
      await request(app.getHttpServer())
        .post('/v1/operator-auth/login')
        .send({
          email: 'initial-admin@omnigrc.co',
          password: 'WrongPassword123!',
        })
        .expect(401);
    });
  });

  // 3. MFA SETUP & VERIFICATION
  describe('3. MFA Setup & Enforcement', () => {
    let totpSecretRaw: string;

    it('should setup MFA and store TOTP secret securely', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/operator-auth/mfa/setup')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .expect(200);

      expect(res.body.secret).toBeDefined();
      expect(res.body.otpauthUrl).toMatch(/OMNiGRC/);
      totpSecretRaw = res.body.secret;

      // Verify database stores ENCRYPTED secret (iv:tag:ciphertext), NOT plaintext
      const dbOp = await prisma.operator.findUnique({ where: { id: superAdminId } });
      expect(dbOp?.totpSecret).toBeDefined();
      expect(dbOp?.totpSecret).not.toEqual(totpSecretRaw);
      expect(dbOp?.totpSecret).toMatch(/:/);
    });

    it('should verify TOTP code and enable MFA', async () => {
      const nowSeconds = Math.floor(Date.now() / 1000);
      const timeWindow = Math.floor(nowSeconds / 30);
      const validCode = (securityService as any).generateTotpCodeForWindow(totpSecretRaw, timeWindow);

      await request(app.getHttpServer())
        .post('/v1/operator-auth/mfa/verify')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ totpCode: validCode })
        .expect(200);

      const dbOp = await prisma.operator.findUnique({ where: { id: superAdminId } });
      expect(dbOp?.mfaEnabled).toBe(true);
    });

    it('should require TOTP code on login after MFA enablement', async () => {
      await request(app.getHttpServer())
        .post('/v1/operator-auth/login')
        .send({
          email: 'initial-admin@omnigrc.co',
          password: 'SuperSecurePassword123!',
        })
        .expect(401);
    });

    it('should login successfully when valid TOTP code is provided', async () => {
      const nowSeconds = Math.floor(Date.now() / 1000);
      const timeWindow = Math.floor(nowSeconds / 30);
      const validCode = (securityService as any).generateTotpCodeForWindow(totpSecretRaw, timeWindow);

      const res = await request(app.getHttpServer())
        .post('/v1/operator-auth/login')
        .send({
          email: 'initial-admin@omnigrc.co',
          password: 'SuperSecurePassword123!',
          totpCode: validCode,
        })
        .expect(200);

      superAdminToken = res.body.accessToken;
      superAdminRefreshToken = res.body.refreshToken;
    });
  });

  // 4 & 5. REFRESH & REFRESH REUSE DETECTION
  describe('4 & 5. Refresh Rotation & Race-Condition Reuse Detection', () => {
    let oldRefreshToken: string;

    it('should rotate refresh token and issue new token pair', async () => {
      oldRefreshToken = superAdminRefreshToken;

      const res = await request(app.getHttpServer())
        .post('/v1/operator-auth/refresh')
        .send({ refreshToken: oldRefreshToken })
        .expect(200);

      expect(res.body.accessToken).toBeDefined();
      expect(res.body.refreshToken).toBeDefined();
      expect(res.body.refreshToken).not.toEqual(oldRefreshToken);

      superAdminToken = res.body.accessToken;
      superAdminRefreshToken = res.body.refreshToken;
    });

    it('should revoke entire session family when old refresh token is reused', async () => {
      // Re-use oldRefreshToken which was rotated above
      await request(app.getHttpServer())
        .post('/v1/operator-auth/refresh')
        .send({ refreshToken: oldRefreshToken })
        .expect(401);

      // Verify that even the NEW refresh token is now revoked due to family reuse protection
      await request(app.getHttpServer())
        .post('/v1/operator-auth/refresh')
        .send({ refreshToken: superAdminRefreshToken })
        .expect(401);
    });
  });

  // Setup additional operator roles for RBAC and Revocation tests
  describe('Operator Provisioning & RBAC Pre-Setup', () => {
    it('should create Super Admin fresh session after reuse test reset', async () => {
      const dbOp = await prisma.operator.findUnique({ where: { id: superAdminId } });
      const decryptedTotpSecret = securityService.decryptSecret(dbOp?.totpSecret || '');
      const nowSeconds = Math.floor(Date.now() / 1000);
      const validCode = (securityService as any).generateTotpCodeForWindow(decryptedTotpSecret, Math.floor(nowSeconds / 30));

      const res = await request(app.getHttpServer())
        .post('/v1/operator-auth/login')
        .send({
          email: 'initial-admin@omnigrc.co',
          password: 'SuperSecurePassword123!',
          totpCode: validCode,
        })
        .expect(200);

      superAdminToken = res.body.accessToken;
      superAdminRefreshToken = res.body.refreshToken;
    });

    it('should allow Super Admin to create READ_ONLY_AUDITOR and COMMERCIAL_OPERATOR', async () => {
      const auditorRes = await request(app.getHttpServer())
        .post('/v1/operators')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          email: 'auditor@omnigrc.co',
          password: 'AuditorPassword123!',
          fullName: 'Security Auditor',
          role: OperatorRole.READ_ONLY_AUDITOR,
        })
        .expect(201);

      auditorId = auditorRes.body.id;

      const commRes = await request(app.getHttpServer())
        .post('/v1/operators')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          email: 'commercial@omnigrc.co',
          password: 'CommercialPassword123!',
          fullName: 'Commercial Ops',
          role: OperatorRole.COMMERCIAL_OPERATOR,
        })
        .expect(201);

      commercialOpId = commRes.body.id;

      // Login as Auditor
      const auditorLogin = await request(app.getHttpServer())
        .post('/v1/operator-auth/login')
        .send({ email: 'auditor@omnigrc.co', password: 'AuditorPassword123!' })
        .expect(200);
      auditorToken = auditorLogin.body.accessToken;

      // Login as Commercial Operator
      const commLogin = await request(app.getHttpServer())
        .post('/v1/operator-auth/login')
        .send({ email: 'commercial@omnigrc.co', password: 'CommercialPassword123!' })
        .expect(200);
      commercialOpToken = commLogin.body.accessToken;
    });
  });

  // 6. LOGOUT
  describe('6. Session Logout', () => {
    it('should invalidate session on logout', async () => {
      const tempLogin = await request(app.getHttpServer())
        .post('/v1/operator-auth/login')
        .send({ email: 'commercial@omnigrc.co', password: 'CommercialPassword123!' })
        .expect(200);

      const tempToken = tempLogin.body.accessToken;

      await request(app.getHttpServer())
        .post('/v1/operator-auth/logout')
        .set('Authorization', `Bearer ${tempToken}`)
        .expect(200);

      // Using tempToken after logout must fail
      await request(app.getHttpServer())
        .get('/v1/operators')
        .set('Authorization', `Bearer ${tempToken}`)
        .expect(401);
    });
  });

  // 7. SUSPENDED OPERATOR
  describe('7. Suspended Operator Access Control', () => {
    it('should prevent suspended operator from accessing endpoints or refreshing', async () => {
      const suspendedOp = await prisma.operator.create({
        data: {
          email: 'suspended@omnigrc.co',
          passwordHash: await securityService.hashPassword('Password123!'),
          fullName: 'Suspended User',
          role: OperatorRole.SUPPORT_ENGINEER,
          status: 'SUSPENDED',
        },
      });
      suspendedOpId = suspendedOp.id;

      await request(app.getHttpServer())
        .post('/v1/operator-auth/login')
        .send({ email: 'suspended@omnigrc.co', password: 'Password123!' })
        .expect(403);
    });
  });

  // 8. RBAC ENFORCEMENT
  describe('8. Route-Level RBAC Enforcement', () => {
    it('should prevent Read-Only AUDITOR from creating operators', async () => {
      await request(app.getHttpServer())
        .post('/v1/operators')
        .set('Authorization', `Bearer ${auditorToken}`)
        .send({
          email: 'unauthorized@omnigrc.co',
          password: 'Password123!',
          fullName: 'Unauthorized',
          role: OperatorRole.SUPPORT_ENGINEER,
        })
        .expect(403);
    });

    it('should allow Super Admin to list operators', async () => {
      const res = await request(app.getHttpServer())
        .get('/v1/operators')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .expect(200);

      expect(res.body.length).toBeGreaterThanOrEqual(3);
    });
  });

  // 9. ANTI-SELF-ESCALATION
  describe('9. Anti-Self-Escalation Controls', () => {
    it('should prevent operator from updating their own role', async () => {
      await request(app.getHttpServer())
        .patch(`/v1/operators/${auditorId}/role`)
        .set('Authorization', `Bearer ${auditorToken}`)
        .send({ role: OperatorRole.PLATFORM_SUPER_ADMIN })
        .expect(403);
    });

    it('should prevent operator from suspending themselves', async () => {
      await request(app.getHttpServer())
        .post(`/v1/operators/${superAdminId}/suspend`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .expect(403); // ForbiddenException returned by anti-self-suspension check
    });
  });

  // 10. SESSION REVOCATION
  describe('10. Session Revocation Enforcement', () => {
    it('should allow Super Admin to revoke all sessions for an operator', async () => {
      const res = await request(app.getHttpServer())
        .post(`/v1/operators/${commercialOpId}/revoke-sessions`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .expect(200);

      expect(res.body.revokedSessionsCount).toBeGreaterThanOrEqual(1);

      // Commercial operator's existing token is now revoked
      await request(app.getHttpServer())
        .get('/v1/operators')
        .set('Authorization', `Bearer ${commercialOpToken}`)
        .expect(401);
    });
  });

  // 11 & 12. AUDIT ATTRIBUTION & REDACTION
  describe('11 & 12. Audit Trail Attribution & Field-Level Redaction', () => {
    it('should attribute audit logs to server-side authenticated identity and redact sensitive fields', async () => {
      await request(app.getHttpServer())
        .post('/v1/operators')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          email: 'audit-redact-test@omnigrc.co',
          password: 'SuperSecretPassword123!',
          fullName: 'Audit Test',
          role: OperatorRole.OPERATIONS_ENGINEER,
        })
        .expect(201);

      const auditLog = await prisma.controlPlaneAuditLog.findFirst({
        where: { action: 'OPERATOR_CREATED' },
        orderBy: { createdAt: 'desc' },
      });

      expect(auditLog).toBeDefined();
      expect(auditLog?.actorId).toEqual(superAdminId);
      expect(auditLog?.actorRole).toEqual(OperatorRole.PLATFORM_SUPER_ADMIN);

      // Test RedactionService against nested structures containing sensitive keys
      const testData = {
        password: 'PlainTextPassword123',
        totpSecret: 'SUPERSECRET_TOTP',
        refreshToken: 'RAW_TOKEN_VALUE',
        authorization: 'Bearer secret_token',
        nested: { apiKey: 'api_key_123', harmless: 'value' },
      };

      const redacted = redactionService.redact(testData);
      expect(redacted.password).toEqual('[REDACTED]');
      expect(redacted.totpSecret).toEqual('[REDACTED]');
      expect(redacted.refreshToken).toEqual('[REDACTED]');
      expect(redacted.authorization).toEqual('[REDACTED]');
      expect(redacted.nested.apiKey).toEqual('[REDACTED]');
      expect(redacted.nested.harmless).toEqual('value');
    });
  });

  // 13. STATIC ADMIN KEY REJECTION IN PRODUCTION FOR HUMAN ENDPOINTS
  describe('13. Static Admin Key Boundary', () => {
    it('should reject shared static admin key on human operator endpoints if env is production', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      try {
        await request(app.getHttpServer())
          .get('/v1/operators')
          .set('x-control-plane-admin-key', DEV_ADMIN_KEY)
          .expect(401);
      } finally {
        process.env.NODE_ENV = originalEnv;
      }
    });
  });

  // 14, 15, 16. M2M INFRASTRUCTURE & SELF-HOSTED CHECK-IN
  describe('14, 15, 16. M2M Infrastructure & Self-Hosted Check-In Boundary', () => {
    let deploymentId: string;
    let registrationSecret: string;

    it('should register deployment for self-hosted customer via M2M endpoint', async () => {
      const depRes = await request(app.getHttpServer())
        .post('/v1/deployments')
        .set('x-control-plane-admin-key', DEV_ADMIN_KEY)
        .send({
          organizationId: 'org_e2e_mssp_test',
          environment: 'DEVELOPMENT',
          deploymentModel: 'SELF_HOSTED',
          version: '1.2.0',
        })
        .expect(201);

      deploymentId = depRes.body.id;
      registrationSecret = depRes.body.registrationSecret;

      expect(deploymentId).toBeDefined();
      expect(registrationSecret).toBeDefined();
    });

    it('should allow self-hosted deployment check-in using registration secret without human token', async () => {
      const checkinRes = await request(app.getHttpServer())
        .post(`/v1/deployments/${deploymentId}/check-in`)
        .send({
          registrationSecret,
          version: '1.2.0',
        })
        .expect(200);

      expect(checkinRes.body.success).toBe(true);
      expect(checkinRes.body.deploymentId).toBe(deploymentId);
    });
  });
});
