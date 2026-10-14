import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { EvidenceService } from '../src/evidence/evidence.service';
import { Role, OrgType, ProductAccessStatus, EvidenceType } from '@omnigrc/shared';

describe('MSSP Phase 2 — Context Switching Security Test Suite', () => {
  jest.setTimeout(60000);

  let app: INestApplication;
  let prisma: PrismaService;
  let jwtService: JwtService;
  let evidenceService: EvidenceService;

  let msspAOrgId: string;
  let msspBOrgId: string;
  let clientA1OrgId: string;
  let clientB1OrgId: string;
  let standaloneOrgId: string;

  let msspAUserId: string;
  let msspAAnalystId: string;
  let clientA1UserId: string;

  let msspAUserToken: string;
  let msspAAnalystToken: string;
  let clientA1UserToken: string;
  let standaloneUserToken: string;

  let clientA1AssetId: string;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    prisma = moduleRef.get<PrismaService>(PrismaService);
    jwtService = moduleRef.get<JwtService>(JwtService);
    evidenceService = moduleRef.get<EvidenceService>(EvidenceService);

    // 1. Create MSSP A Provider Organization
    const msspA = await prisma.organization.create({
      data: {
        name: 'MSSP Provider Org A',
        type: OrgType.MSSP_PROVIDER,
        primaryRegion: 'India',
      },
    });
    msspAOrgId = msspA.id;

    // 2. Create MSSP B Provider Organization
    const msspB = await prisma.organization.create({
      data: {
        name: 'MSSP Provider Org B',
        type: OrgType.MSSP_PROVIDER,
        primaryRegion: 'UK',
      },
    });
    msspBOrgId = msspB.id;

    // 3. Create CLIENT A1 Organization (managed by MSSP A)
    const clientA1 = await prisma.organization.create({
      data: {
        name: 'Client A1 Tenant (Managed by MSSP A)',
        type: OrgType.CLIENT_TENANT,
        parentOrganizationId: msspAOrgId,
        primaryRegion: 'India',
      },
    });
    clientA1OrgId = clientA1.id;

    // 4. Create CLIENT B1 Organization (managed by MSSP B)
    const clientB1 = await prisma.organization.create({
      data: {
        name: 'Client B1 Tenant (Managed by MSSP B)',
        type: OrgType.CLIENT_TENANT,
        parentOrganizationId: msspBOrgId,
        primaryRegion: 'UK',
      },
    });
    clientB1OrgId = clientB1.id;

    // 5. Create Standalone Unrelated Organization
    const standalone = await prisma.organization.create({
      data: {
        name: 'Standalone Unrelated Org',
        type: OrgType.STANDALONE,
        primaryRegion: 'EU',
      },
    });
    standaloneOrgId = standalone.id;

    // 6. Create MSSP A Admin User
    const msspAUser = await prisma.user.create({
      data: {
        organizationId: msspAOrgId,
        name: 'MSSP A Admin User',
        email: `msspa-admin-${Date.now()}@msspa.com`,
        passwordHash: '$2b$10$e84.fakeHashForTestingOnly',
        role: Role.MSSP_ADMIN,
      },
    });

    // 7. Create MSSP A Analyst User
    const msspAAnalyst = await prisma.user.create({
      data: {
        organizationId: msspAOrgId,
        name: 'MSSP A Analyst User',
        email: `msspa-analyst-${Date.now()}@msspa.com`,
        passwordHash: '$2b$10$e84.fakeHashForTestingOnly',
        role: Role.MSSP_ANALYST,
      },
    });

    // 8. Create Client A1 User (Normal ANALYST)
    const clientA1User = await prisma.user.create({
      data: {
        organizationId: clientA1OrgId,
        name: 'Client A1 Analyst User',
        email: `clienta1-${Date.now()}@clienta1.com`,
        passwordHash: '$2b$10$e84.fakeHashForTestingOnly',
        role: Role.ANALYST,
      },
    });

    // 9. Create Standalone Org Admin User
    const standaloneUser = await prisma.user.create({
      data: {
        organizationId: standaloneOrgId,
        name: 'Standalone Admin User',
        email: `standalone-${Date.now()}@standalone.com`,
        passwordHash: '$2b$10$e84.fakeHashForTestingOnly',
        role: Role.ADMIN,
      },
    });

    // 10. Create confidential Asset inside CLIENT A1
    const assetA1 = await prisma.asset.create({
      data: {
        organizationId: clientA1OrgId,
        name: 'Confidential Client A1 Financial Database',
        type: 'DATA_STORE',
        owner: 'Client A1 Finance Team',
        criticality: 'HIGH',
        createdById: clientA1User.id,
      },
    });
    clientA1AssetId = assetA1.id;

    // Generate Initial JWTs
    msspAUserId = msspAUser.id;
    msspAAnalystId = msspAAnalyst.id;
    clientA1UserId = clientA1User.id;

    msspAUserToken = jwtService.sign({
      sub: msspAUser.id,
      email: msspAUser.email,
      organizationId: msspAOrgId,
      role: msspAUser.role,
    });

    msspAAnalystToken = jwtService.sign({
      sub: msspAAnalyst.id,
      email: msspAAnalyst.email,
      organizationId: msspAOrgId,
      role: msspAAnalyst.role,
    });

    clientA1UserToken = jwtService.sign({
      sub: clientA1User.id,
      email: clientA1User.email,
      organizationId: clientA1OrgId,
      role: clientA1User.role,
    });

    standaloneUserToken = jwtService.sign({
      sub: standaloneUser.id,
      email: standaloneUser.email,
      organizationId: standaloneOrgId,
      role: standaloneUser.role,
    });
  });

  afterAll(async () => {
    if (prisma && msspAOrgId) {
      const orgIds = [msspAOrgId, msspBOrgId, clientA1OrgId, clientB1OrgId, standaloneOrgId];
      await prisma.organizationMembership.deleteMany({ where: { organizationId: { in: orgIds } } });
      await prisma.evidence.deleteMany({ where: { organizationId: { in: orgIds } } });
      await prisma.asset.deleteMany({ where: { organizationId: { in: orgIds } } });
      await prisma.user.deleteMany({ where: { organizationId: { in: orgIds } } });
      await prisma.auditLogEntry.deleteMany({ where: { organizationId: { in: orgIds } } });
      await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
    }
    if (app) {
      await app.close();
    }
  });

  it('Test 1 — Valid switch: MSSP A user can switch to managed CLIENT A1', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/switch-context')
      .set('Authorization', `Bearer ${msspAUserToken}`)
      .send({ targetOrganizationId: clientA1OrgId })
      .expect(200);

    expect(res.body.accessToken).toBeDefined();
    expect(res.body.expiresIn).toBe('15m');
    expect(res.body.targetOrganization.id).toBe(clientA1OrgId);
    expect(res.body.actingViaMsspId).toBe(msspAOrgId);
  });

  it('Test 2 — Customer data accessible only after explicit switch', async () => {
    // Before switch: MSSP A user cannot see CLIENT A1 asset
    const beforeRes = await request(app.getHttpServer())
      .get('/assets')
      .set('Authorization', `Bearer ${msspAUserToken}`)
      .expect(200);

    const beforeItems = Array.isArray(beforeRes.body.items) ? beforeRes.body.items : (Array.isArray(beforeRes.body) ? beforeRes.body : []);
    expect(beforeItems.find((a: any) => a.id === clientA1AssetId)).toBeUndefined();

    // Perform explicit switch
    const switchRes = await request(app.getHttpServer())
      .post('/auth/switch-context')
      .set('Authorization', `Bearer ${msspAUserToken}`)
      .send({ targetOrganizationId: clientA1OrgId })
      .expect(200);

    const contextToken = switchRes.body.accessToken;

    // After switch with context token: MSSP A user can access CLIENT A1 asset
    const afterRes = await request(app.getHttpServer())
      .get('/assets')
      .set('Authorization', `Bearer ${contextToken}`)
      .expect(200);

    const afterItems = Array.isArray(afterRes.body.items) ? afterRes.body.items : (Array.isArray(afterRes.body) ? afterRes.body : []);
    const foundAsset = afterItems.find((a: any) => a.id === clientA1AssetId);
    expect(foundAsset).toBeDefined();
    expect(foundAsset.name).toBe('Confidential Client A1 Financial Database');
  });

  it('Test 3 — Cross-MSSP attack: MSSP A user MUST NOT switch to CLIENT B1 (managed by MSSP B)', async () => {
    await request(app.getHttpServer())
      .post('/auth/switch-context')
      .set('Authorization', `Bearer ${msspAUserToken}`)
      .send({ targetOrganizationId: clientB1OrgId })
      .expect(403);
  });

  it('Test 4 — Unrelated organization: MSSP A user MUST NOT switch to STANDALONE org', async () => {
    await request(app.getHttpServer())
      .post('/auth/switch-context')
      .set('Authorization', `Bearer ${msspAUserToken}`)
      .send({ targetOrganizationId: standaloneOrgId })
      .expect(403);
  });

  it('Test 5 — Invalid target: Switching to non-existent org ID fails safely with 404', async () => {
    await request(app.getHttpServer())
      .post('/auth/switch-context')
      .set('Authorization', `Bearer ${msspAUserToken}`)
      .send({ targetOrganizationId: 'non-existent-uuid-12345' })
      .expect(404);
  });

  it('Test 6 — Non-MSSP user: Standard ADMIN or ANALYST cannot switch context', async () => {
    await request(app.getHttpServer())
      .post('/auth/switch-context')
      .set('Authorization', `Bearer ${standaloneUserToken}`)
      .send({ targetOrganizationId: clientA1OrgId })
      .expect(403);
  });

  it('Test 7 — Child cannot be used as an MSSP: CLIENT_TENANT user cannot switch context', async () => {
    await request(app.getHttpServer())
      .post('/auth/switch-context')
      .set('Authorization', `Bearer ${clientA1UserToken}`)
      .send({ targetOrganizationId: standaloneOrgId })
      .expect(403);
  });

  it('Test 8 — JWT claims verification: Token contains target organizationId and actingViaMsspId', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/switch-context')
      .set('Authorization', `Bearer ${msspAAnalystToken}`)
      .send({ targetOrganizationId: clientA1OrgId })
      .expect(200);

    const token = res.body.accessToken;
    const decoded: any = jwtService.decode(token);

    expect(decoded.organizationId).toBe(clientA1OrgId);
    expect(decoded.actingViaMsspId).toBe(msspAOrgId);
    expect(decoded.organizationIds).toBeUndefined(); // Must NOT contain multi-org array
    expect(decoded.role).toBe(Role.MSSP_ANALYST);
  });

  it('Test 9 — Tenant isolation after context switch', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/switch-context')
      .set('Authorization', `Bearer ${msspAUserToken}`)
      .send({ targetOrganizationId: clientA1OrgId })
      .expect(200);

    const contextToken = res.body.accessToken;

    // Perform query with context token -> should strictly return CLIENT A1 data only
    const assetsRes = await request(app.getHttpServer())
      .get('/assets')
      .set('Authorization', `Bearer ${contextToken}`)
      .expect(200);

    const items = Array.isArray(assetsRes.body.items) ? assetsRes.body.items : (Array.isArray(assetsRes.body) ? assetsRes.body : []);
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((item: any) => item.organizationId === clientA1OrgId)).toBe(true);
  });

  it('Test 10 — Token refresh isolation: Home refresh token cannot extend context session indefinitely', async () => {
    // Perform context switch
    const switchRes = await request(app.getHttpServer())
      .post('/auth/switch-context')
      .set('Authorization', `Bearer ${msspAUserToken}`)
      .send({ targetOrganizationId: clientA1OrgId })
      .expect(200);

    // Verify response does NOT issue a refresh token for context session
    expect(switchRes.body.refreshToken).toBeUndefined();
  });

  it('Test 11 — Audit log verification for successful and failed context switches', async () => {
    // 1. Perform successful context switch
    await request(app.getHttpServer())
      .post('/auth/switch-context')
      .set('Authorization', `Bearer ${msspAUserToken}`)
      .send({ targetOrganizationId: clientA1OrgId })
      .expect(200);

    // Query Audit Logs for MSSP A Org
    const logs = await prisma.auditLogEntry.findMany({
      where: {
        organizationId: msspAOrgId,
        action: 'MSSP_CONTEXT_SWITCHED',
      },
      orderBy: { createdAt: 'desc' },
    });

    expect(logs.length).toBeGreaterThan(0);
    const log = logs[0];
    expect(log.action).toBe('MSSP_CONTEXT_SWITCHED');
    expect(log.entityId).toBe(clientA1OrgId);
    expect((log.metadata as any).sourceOrganizationId).toBe(msspAOrgId);
    expect((log.metadata as any).targetOrganizationId).toBe(clientA1OrgId);
  });

  it('Test 12 — ACTIVE membership in target organization permits context switching and does not mutate it', async () => {
    // Create explicit ACTIVE membership
    const membership = await prisma.organizationMembership.create({
      data: {
        organizationId: clientA1OrgId,
        userId: msspAUserId,
        role: Role.MSSP_ADMIN,
        status: ProductAccessStatus.ACTIVE,
      },
    });

    try {
      const res = await request(app.getHttpServer())
        .post('/auth/switch-context')
        .set('Authorization', `Bearer ${msspAUserToken}`)
        .send({ targetOrganizationId: clientA1OrgId })
        .expect(200);

      expect(res.body.accessToken).toBeDefined();

      // Ensure membership was not mutated
      const fetched = await prisma.organizationMembership.findUnique({
        where: { id: membership.id },
      });
      expect(fetched?.status).toBe(ProductAccessStatus.ACTIVE);
      expect(fetched?.role).toBe(Role.MSSP_ADMIN);
    } finally {
      await prisma.organizationMembership.delete({ where: { id: membership.id } });
    }
  });

  it('Test 13 — SUSPENDED membership in target organization causes switch-context to be rejected (403)', async () => {
    const membership = await prisma.organizationMembership.create({
      data: {
        organizationId: clientA1OrgId,
        userId: msspAUserId,
        role: Role.MSSP_ADMIN,
        status: ProductAccessStatus.SUSPENDED,
      },
    });

    try {
      const res = await request(app.getHttpServer())
        .post('/auth/switch-context')
        .set('Authorization', `Bearer ${msspAUserToken}`)
        .send({ targetOrganizationId: clientA1OrgId })
        .expect(403);

      expect(res.body.code).toBe('PRODUCT_ACCESS_REVOKED');
      expect(res.body.productAccessStatus).toBe(ProductAccessStatus.SUSPENDED);

      // Verify membership remains SUSPENDED and was NOT reactivated
      const fetched = await prisma.organizationMembership.findUnique({
        where: { id: membership.id },
      });
      expect(fetched?.status).toBe(ProductAccessStatus.SUSPENDED);
    } finally {
      await prisma.organizationMembership.delete({ where: { id: membership.id } });
    }
  });

  it('Test 14 — REVOKED membership in target organization causes switch-context to be rejected (403)', async () => {
    const membership = await prisma.organizationMembership.create({
      data: {
        organizationId: clientA1OrgId,
        userId: msspAUserId,
        role: Role.MSSP_ADMIN,
        status: ProductAccessStatus.REVOKED,
      },
    });

    try {
      const res = await request(app.getHttpServer())
        .post('/auth/switch-context')
        .set('Authorization', `Bearer ${msspAUserToken}`)
        .send({ targetOrganizationId: clientA1OrgId })
        .expect(403);

      expect(res.body.code).toBe('PRODUCT_ACCESS_REVOKED');
      expect(res.body.productAccessStatus).toBe(ProductAccessStatus.REVOKED);

      // Verify membership remains REVOKED and was NOT reactivated
      const fetched = await prisma.organizationMembership.findUnique({
        where: { id: membership.id },
      });
      expect(fetched?.status).toBe(ProductAccessStatus.REVOKED);
    } finally {
      await prisma.organizationMembership.delete({ where: { id: membership.id } });
    }
  });

  it('Test 15 — Context switching does NOT reactivate or overwrite existing REVOKED membership', async () => {
    const membership = await prisma.organizationMembership.create({
      data: {
        organizationId: clientA1OrgId,
        userId: msspAAnalystId,
        role: Role.MSSP_ANALYST,
        status: ProductAccessStatus.REVOKED,
      },
    });

    try {
      // Attempt switch context
      await request(app.getHttpServer())
        .post('/auth/switch-context')
        .set('Authorization', `Bearer ${msspAAnalystToken}`)
        .send({ targetOrganizationId: clientA1OrgId })
        .expect(403);

      // Re-verify database state: must strictly remain REVOKED
      const current = await prisma.organizationMembership.findUnique({
        where: { id: membership.id },
      });
      expect(current?.status).toBe(ProductAccessStatus.REVOKED);
    } finally {
      await prisma.organizationMembership.delete({ where: { id: membership.id } });
    }
  });

  it('Test 16 — Live revocation: Previously issued context token is immediately rejected if membership is revoked', async () => {
    // 1. Issue context token while authorized
    const switchRes = await request(app.getHttpServer())
      .post('/auth/switch-context')
      .set('Authorization', `Bearer ${msspAUserToken}`)
      .send({ targetOrganizationId: clientA1OrgId })
      .expect(200);

    const contextToken = switchRes.body.accessToken;

    // Verify token works initially
    await request(app.getHttpServer())
      .get('/assets')
      .set('Authorization', `Bearer ${contextToken}`)
      .expect(200);

    // 2. Client administrator explicitly REVOKES the MSSP user's membership in client org
    const membership = await prisma.organizationMembership.create({
      data: {
        organizationId: clientA1OrgId,
        userId: msspAUserId,
        role: Role.MSSP_ADMIN,
        status: ProductAccessStatus.REVOKED,
      },
    });

    try {
      // 3. Subsequent request with the previously issued context token MUST be rejected
      const failRes = await request(app.getHttpServer())
        .get('/assets')
        .set('Authorization', `Bearer ${contextToken}`)
        .expect(401);

      expect(failRes.body.code).toBe('PRODUCT_ACCESS_REVOKED');
    } finally {
      await prisma.organizationMembership.delete({ where: { id: membership.id } });
    }
  });

  it('Test 17 — Finding 3 User Scoping: Generic user queries in client tenant do NOT leak home-MSSP users', async () => {
    // Perform context switch to CLIENT A1
    const switchRes = await request(app.getHttpServer())
      .post('/auth/switch-context')
      .set('Authorization', `Bearer ${msspAUserToken}`)
      .send({ targetOrganizationId: clientA1OrgId })
      .expect(200);

    const contextToken = switchRes.body.accessToken;

    // When querying organization members in client tenant via context token:
    const membersRes = await request(app.getHttpServer())
      .get('/organization-members')
      .set('Authorization', `Bearer ${contextToken}`)
      .expect(200);

    const members = Array.isArray(membersRes.body) ? membersRes.body : [];
    // Must NOT contain MSSP A users who have no membership in Client A1
    const leakedMsspUser = members.find((m: any) => m.userId === msspAUserId || m.email?.includes('msspa'));
    expect(leakedMsspUser).toBeUndefined();

    // Client A1's user must be returned
    const clientUser = members.find((m: any) => m.userId === clientA1UserId);
    expect(clientUser).toBeDefined();

    // Identity check: Current user can still be resolved by explicit ID
    const meRes = await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${contextToken}`)
      .expect(200);

    expect(meRes.body.user.id).toBe(msspAUserId);
    expect(meRes.body.organization.id).toBe(msspAOrgId);
  });

  it('Test 18 — Ephemeral delegation invariant: No persistent OrganizationMembership row is created during switch or subsequent authorized requests', async () => {
    // 1. Precondition: Verify zero membership rows exist for msspAAnalyst in clientA1OrgId
    const initialMembership = await prisma.organizationMembership.findUnique({
      where: {
        organizationId_userId: {
          organizationId: clientA1OrgId,
          userId: msspAAnalystId,
        },
      },
    });
    expect(initialMembership).toBeNull();

    const initialTotalCount = await prisma.organizationMembership.count({
      where: { organizationId: clientA1OrgId },
    });

    // 2. Perform context switch without any membership row in target org
    const switchRes = await request(app.getHttpServer())
      .post('/auth/switch-context')
      .set('Authorization', `Bearer ${msspAAnalystToken}`)
      .send({ targetOrganizationId: clientA1OrgId })
      .expect(200);

    expect(switchRes.body.accessToken).toBeDefined();
    const contextToken = switchRes.body.accessToken;

    // 3. Invariant: Assert switch-context did NOT create a persistent membership row
    const postSwitchMembership = await prisma.organizationMembership.findUnique({
      where: {
        organizationId_userId: {
          organizationId: clientA1OrgId,
          userId: msspAAnalystId,
        },
      },
    });
    expect(postSwitchMembership).toBeNull();

    const postSwitchTotalCount = await prisma.organizationMembership.count({
      where: { organizationId: clientA1OrgId },
    });
    expect(postSwitchTotalCount).toBe(initialTotalCount);

    // 4. Perform subsequent authorized requests with the ephemeral context token
    // (a) Read customer assets
    const assetsRes = await request(app.getHttpServer())
      .get('/assets')
      .set('Authorization', `Bearer ${contextToken}`)
      .expect(200);
    expect(assetsRes.body).toBeDefined();

    // (b) Read identity / me
    const meRes = await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${contextToken}`)
      .expect(200);
    expect(meRes.body.user.id).toBe(msspAAnalystId);

    // 5. Invariant: Assert subsequent authorized requests did NOT create any persistent membership row
    const postRequestMembership = await prisma.organizationMembership.findUnique({
      where: {
        organizationId_userId: {
          organizationId: clientA1OrgId,
          userId: msspAAnalystId,
        },
      },
    });
    expect(postRequestMembership).toBeNull();

    const postRequestTotalCount = await prisma.organizationMembership.count({
      where: { organizationId: clientA1OrgId },
    });
    expect(postRequestTotalCount).toBe(initialTotalCount);
  });

  it('Test 19 — Prisma User scoping: Legitimate DB foreign-key display-name resolution succeeds for MSSP delegate', async () => {
    // 1. Seed an evidence record in Client A1 uploaded by the MSSP Analyst
    const evidence = await prisma.evidence.create({
      data: {
        organizationId: clientA1OrgId,
        title: 'Network Penetration Audit Report',
        fileName: 'pentest-report.pdf',
        fileSize: 1024,
        mimeType: 'application/pdf',
        storageKey: 'evidence/pentest-report.pdf',
        checksum: 'sha256-test-checksum',
        evidenceType: EvidenceType.DOCUMENT,
        status: 'ACTIVE',
        uploadedById: msspAAnalystId, // MSSP Analyst from home org msspAOrgId
      },
    });

    try {
      // 2. Perform context switch to Client A1
      const switchRes = await request(app.getHttpServer())
        .post('/auth/switch-context')
        .set('Authorization', `Bearer ${msspAAnalystToken}`)
        .send({ targetOrganizationId: clientA1OrgId })
        .expect(200);

      const contextToken = switchRes.body.accessToken;

      // 3. Query evidence vault as MSSP delegate
      const vaultRes = await request(app.getHttpServer())
        .get('/evidence/vault')
        .set('Authorization', `Bearer ${contextToken}`)
        .expect(200);
      expect(vaultRes.body).toBeDefined();

      // 4. Verify display-name resolution: uploader's name is properly resolved via EvidenceService
      const authCtx = {
        userId: msspAAnalystId,
        organizationId: clientA1OrgId,
        role: Role.MSSP_ANALYST,
        actingViaMsspId: msspAOrgId,
      };
      const allEvidence = await evidenceService.findAll(authCtx, {});
      const item = allEvidence.items.find((i) => i.id === evidence.id);
      expect(item).toBeDefined();
      expect(item?.uploaderName).toBe('MSSP A Analyst User');
    } finally {
      await prisma.evidence.delete({ where: { id: evidence.id } });
    }
  });

  it('Test 20 — Prisma User scoping: Attempt to access or modify unrelated home-organization user from client context is rejected', async () => {
    // 1. Create an unrelated user in MSSP A home organization who has NEVER been in Client A1
    const unrelatedMsspUser = await prisma.user.create({
      data: {
        organizationId: msspAOrgId,
        name: 'Unrelated Home MSSP Specialist',
        email: `unrelated-${Date.now()}@msspa.com`,
        passwordHash: '$2b$10$e84.fakeHashForTestingOnly',
        role: Role.MSSP_ANALYST,
      },
    });

    try {
      // 2. Switch context to Client A1 as MSSP Admin
      const switchRes = await request(app.getHttpServer())
        .post('/auth/switch-context')
        .set('Authorization', `Bearer ${msspAUserToken}`)
        .send({ targetOrganizationId: clientA1OrgId })
        .expect(200);

      const contextToken = switchRes.body.accessToken;

      // 3. Attempt to fetch unrelated home user via client-tenant organization-members endpoint
      const getRes = await request(app.getHttpServer())
        .get(`/organization-members/${unrelatedMsspUser.id}`)
        .set('Authorization', `Bearer ${contextToken}`)
        .expect(404);

      expect(getRes.body.message).toContain('not found');

      // 4. Attempt to modify unrelated home user access via client-tenant context
      await request(app.getHttpServer())
        .patch(`/organization-members/${unrelatedMsspUser.id}/access`)
        .set('Authorization', `Bearer ${contextToken}`)
        .send({ role: Role.ADMIN })
        .expect(404);

      // Verify unrelated home user was NOT modified in database
      const freshUnrelated = await prisma.user.findUnique({
        where: { id: unrelatedMsspUser.id },
      });
      expect(freshUnrelated?.role).toBe(Role.MSSP_ANALYST);

      // 5. Verification: Authenticated self-lookup STILL succeeds on the exact same context token
      const meRes = await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${contextToken}`)
        .expect(200);

      expect(meRes.body.user.id).toBe(msspAUserId);
      expect(meRes.body.organization.id).toBe(msspAOrgId);
    } finally {
      await prisma.user.delete({ where: { id: unrelatedMsspUser.id } });
    }
  });
});
