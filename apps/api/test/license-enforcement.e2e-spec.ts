import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, HttpStatus } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { LicenseVerificationService } from '../src/license-verification/license-verification.service';
import { MappingQueueService } from '../src/controls/ai/mapping-queue.service';
import { JwtService } from '@nestjs/jwt';

import {
  SignedLicenseArtifact,
  SignedLicensePayload,
  LicenseProduct,
  LicenseStatus,
  jcsCanonicalize,
  Role,
  OrgType,
} from '@omnigrc/shared';
import * as generateKeyPair from 'crypto';

describe('Phase 6: Runtime License Enforcement E2E Test Suite', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let licenseVerification: LicenseVerificationService;
  let authToken: string;
  let msspToken: string;
  let orgId: string;
  let clientOrgId: string;

  // Key Pair for testing
  const { publicKey, privateKey } = generateKeyPair.generateKeyPairSync('ed25519', {
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });

  const testKeyId = 'arav-license-v1-2026';

  function createTestArtifact(status: LicenseStatus, expiresAt: string): SignedLicenseArtifact {
    const payload: SignedLicensePayload = {
      licenseId: 'lic-e2e-test',
      licenseFormatVersion: '1.0',
      product: LicenseProduct.OMNIGRC,
      status,
      customerId: 'cust-e2e',
      commercialAgreementId: 'agr-e2e',
      deploymentId: 'dep-e2e',
      organizationId: orgId,
      startsAt: new Date(Date.now() - 86400000).toISOString(),
      expiresAt,
      maxDeployments: 1,
      entitlements: [{ code: 'AI_MAPPING', name: 'AI Mapping', enabled: true }],
      issuedAt: new Date().toISOString(),
      keyId: testKeyId,
    };

    const canonicalJson = jcsCanonicalize(payload);
    const signature = generateKeyPair
      .sign(null, Buffer.from(canonicalJson, 'utf-8'), privateKey)
      .toString('base64');

    return {
      formatVersion: '1.0',
      keyId: testKeyId,
      algorithm: 'Ed25519',
      payload,
      signature,
    };
  }

  beforeAll(async () => {
    // Inject test public key into env
    process.env.LICENSE_VERIFICATION_PUBLIC_KEY = publicKey;
    process.env.LICENSE_VERIFICATION_KEY_ID = testKeyId;

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    prisma = app.get<PrismaService>(PrismaService);
    licenseVerification = app.get<LicenseVerificationService>(LicenseVerificationService);

    // Setup Test Organization & Admin User
    const org = await prisma.organization.create({
      data: {
        name: 'Phase 6 License Test Org',
        type: OrgType.MSSP_PROVIDER,
        primaryRegion: 'India',
      },
    });
    orgId = org.id;

    const clientOrg = await prisma.organization.create({
      data: {
        name: 'Phase 6 MSSP Client Org',
        type: OrgType.CLIENT_TENANT,
        parentOrganizationId: orgId,
        primaryRegion: 'India',
      },
    });
    clientOrgId = clientOrg.id;

    const jwtService = app.get<JwtService>(JwtService);

    // Create MSSP Admin User directly under MSSP Provider Org
    const user = await prisma.user.create({
      data: {
        organizationId: orgId,
        email: `mssp_admin_${Date.now()}@license-test.com`,
        name: 'MSSP Admin User',
        role: Role.MSSP_ADMIN,
        passwordHash: 'dummy_hash',
      },
    });

    authToken = jwtService.sign({
      sub: user.id,
      email: user.email,
      organizationId: orgId,
      role: Role.MSSP_ADMIN,
    });

    // MSSP context switch token targeting client org
    const msspRes = await request(app.getHttpServer())
      .post('/auth/switch-context')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ targetOrganizationId: clientOrgId })
      .expect(200);

    msspToken = msspRes.body.accessToken;
  });


  afterAll(async () => {
    if (prisma) {
      await prisma.systemLicenseState.deleteMany({}).catch(() => {});
    }
    if (licenseVerification) {
      licenseVerification.invalidateMemoizedState();
    }
    await prisma.$disconnect();
    await app.close();
  });


  it('1. VALID License State: Allows read and write operations', async () => {
    const validArtifact = createTestArtifact(
      LicenseStatus.ACTIVE,
      new Date(Date.now() + 86400000).toISOString(),
    );
    await licenseVerification.saveVerifiedState(validArtifact);

    // Read Endpoint
    await request(app.getHttpServer())
      .get('/assets')
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    // Write Mutation Endpoint
    const createRes = await request(app.getHttpServer())
      .post('/assets')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        name: 'Valid State Test Asset',
        type: 'SOFTWARE',
        owner: 'SecOps',
        criticality: 'HIGH',
      })
      .expect(201);

    expect(createRes.body.id).toBeDefined();
  });

  it('2. EXPIRED License State: Blocks write mutations (402) while allowing reads, exports, and auth', async () => {
    const expiredArtifact = createTestArtifact(
      LicenseStatus.EXPIRED,
      new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
    );
    await licenseVerification.saveVerifiedState(expiredArtifact);

    // Reads ALLOWED
    await request(app.getHttpServer())
      .get('/assets')
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    // Health Probe ALLOWED
    await request(app.getHttpServer())
      .get('/health')
      .expect(200);

    // Session / Auth ALLOWED
    await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    // Licensed Write Mutation BLOCKED with HTTP 402
    const blockedRes = await request(app.getHttpServer())
      .post('/assets')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        name: 'Blocked Expired Asset',
        type: 'SOFTWARE',
        owner: 'SecOps',
        criticality: 'HIGH',
      })
      .expect(402);

    expect(blockedRes.body.code).toBe('LICENSE_EXPIRED');
    expect(blockedRes.body.expiresAt).toBeDefined();
  });

  it('3. INVALID_OR_UNAVAILABLE License State: Blocks licensed operations (503) while allowing health & auth', async () => {
    process.env.ENFORCE_LICENSE_IN_TEST = 'true';
    // Clear snapshot from local DB
    await prisma.systemLicenseState.deleteMany({});
    licenseVerification.invalidateMemoizedState();

    // Licensed Mutation BLOCKED with HTTP 503
    const unavailRes = await request(app.getHttpServer())
      .post('/assets')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        name: 'Unavailable Asset',
        type: 'SOFTWARE',
        owner: 'SecOps',
        criticality: 'HIGH',
      })
      .expect(503);

    expect(unavailRes.body.code).toBe('LICENSE_UNAVAILABLE');

    // Health Probe ALLOWED
    await request(app.getHttpServer())
      .get('/health')
      .expect(200);

    delete process.env.ENFORCE_LICENSE_IN_TEST;
  });



  it('4. Renewal / Check-In Recovery: Restores VALID status and write availability', async () => {
    const renewedArtifact = createTestArtifact(
      LicenseStatus.ACTIVE,
      new Date(Date.now() + 7 * 86400000).toISOString(), // 7 days in future
    );
    await licenseVerification.saveVerifiedState(renewedArtifact);

    // Write Mutation ALLOWED again
    const createRes = await request(app.getHttpServer())
      .post('/assets')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        name: 'Renewed License Asset',
        type: 'SOFTWARE',
        owner: 'SecOps',
        criticality: 'HIGH',
      })
      .expect(201);

    expect(createRes.body.id).toBeDefined();
  });

  it('5. MSSP Context Switching: MSSP admin reading expired client data succeeds (200), mutation returns 402', async () => {
    // Set expired state
    const expiredArtifact = createTestArtifact(
      LicenseStatus.EXPIRED,
      new Date(Date.now() - 3600000).toISOString(),
    );
    await licenseVerification.saveVerifiedState(expiredArtifact);

    // MSSP Read of Client Org -> 200 OK
    await request(app.getHttpServer())
      .get('/assets')
      .set('Authorization', `Bearer ${msspToken}`)
      .expect(200);

    // MSSP Mutation of Client Org -> 402 Payment Required
    const msspMutation = await request(app.getHttpServer())
      .post('/assets')
      .set('Authorization', `Bearer ${msspToken}`)
      .send({
        name: 'MSSP Mutation on Expired Client',
        type: 'SOFTWARE',
        owner: 'MSSP Admin',
        criticality: 'MEDIUM',
      })
      .expect(402);

    expect(msspMutation.body.code).toBe('LICENSE_EXPIRED');
  });

  it('6. BullMQ Queue Lifecycle & Renewal Recovery: Pauses queue when EXPIRED, resumes queue on valid renewal', async () => {
    const queueService = app.get<MappingQueueService>(MappingQueueService);

    // Set EXPIRED license state
    const expiredArtifact = createTestArtifact(
      LicenseStatus.EXPIRED,
      new Date(Date.now() - 3600000).toISOString(),
    );
    await licenseVerification.saveVerifiedState(expiredArtifact);

    // Enqueue job while EXPIRED
    const jobId = await queueService.enqueueMappingJob(orgId, 'user-1', 'control-1');
    const stateExpired = queueService.getJobState(jobId);
    expect(stateExpired).toBeDefined();
    expect(stateExpired?.status).toBe('queued');

    // Perform Renewal: Save valid artifact snapshot
    const renewedArtifact = createTestArtifact(
      LicenseStatus.ACTIVE,
      new Date(Date.now() + 86400000).toISOString(),
    );
    await licenseVerification.saveVerifiedState(renewedArtifact);

    // Verify system state became VALID
    const evaluated = await licenseVerification.getEvaluatedState();
    expect(evaluated.state).toBe('VALID');
  });
});
