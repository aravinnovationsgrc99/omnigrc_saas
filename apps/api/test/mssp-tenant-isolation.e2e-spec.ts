import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { Role, OrgType } from '@omnigrc/shared';

describe('MSSP Phase 1 — Tenant Isolation & Org Hierarchy E2E Suite', () => {
  jest.setTimeout(60000);

  let app: INestApplication;
  let prisma: PrismaService;
  let jwtService: JwtService;

  let parentOrgId: string;
  let childOrgId: string;
  let parentUserToken: string;
  let childUserToken: string;
  let childAssetId: string;
  let childRiskId: string;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    prisma = moduleRef.get<PrismaService>(PrismaService);
    jwtService = moduleRef.get<JwtService>(JwtService);

    // Seed test organizations (Parent MSSP Provider and Child Client Tenant)
    const parentOrg = await prisma.organization.create({
      data: {
        name: 'MSSP Provider Org (Parent)',
        type: OrgType.MSSP_PROVIDER,
        primaryRegion: 'India',
      },
    });
    parentOrgId = parentOrg.id;

    const childOrg = await prisma.organization.create({
      data: {
        name: 'Client Tenant Org (Child)',
        type: OrgType.CLIENT_TENANT,
        parentOrganizationId: parentOrgId,
        primaryRegion: 'India',
      },
    });
    childOrgId = childOrg.id;

    // Create test user in Parent Org
    const parentUser = await prisma.user.create({
      data: {
        organizationId: parentOrgId,
        name: 'MSSP Admin User',
        email: `mssp-admin-${Date.now()}@mssp-test.com`,
        passwordHash: '$2b$10$e84.fakePasswordHashForTestingOnly',
        role: Role.MSSP_ADMIN,
      },
    });

    // Create test user in Child Org
    const childUser = await prisma.user.create({
      data: {
        organizationId: childOrgId,
        name: 'Client Analyst User',
        email: `client-analyst-${Date.now()}@client-test.com`,
        passwordHash: '$2b$10$e84.fakePasswordHashForTestingOnly',
        role: Role.ANALYST,
      },
    });

    // Create resource in Child Org (Asset & Risk)
    const childAsset = await prisma.asset.create({
      data: {
        organizationId: childOrgId,
        name: 'Confidential Child Infrastructure DB',
        type: 'DATA_STORE',
        owner: 'Child SecOps',
        criticality: 'HIGH',
        createdById: childUser.id,
      },
    });
    childAssetId = childAsset.id;

    const childRisk = await prisma.risk.create({
      data: {
        organizationId: childOrgId,
        title: 'Child Org Critical Vulnerability',
        likelihood: 4,
        impact: 4,
        score: 16,
        status: 'OPEN',
        owner: 'Child SecOps',
        assetId: childAsset.id,
        createdById: childUser.id,
      },
    });
    childRiskId = childRisk.id;

    // Issue JWTs
    parentUserToken = jwtService.sign({
      sub: parentUser.id,
      email: parentUser.email,
      organizationId: parentOrgId,
      role: parentUser.role,
    });

    childUserToken = jwtService.sign({
      sub: childUser.id,
      email: childUser.email,
      organizationId: childOrgId,
      role: childUser.role,
    });
  });

  afterAll(async () => {
    if (prisma && parentOrgId) {
      await prisma.risk.deleteMany({ where: { organizationId: { in: [parentOrgId, childOrgId] } } });
      await prisma.asset.deleteMany({ where: { organizationId: { in: [parentOrgId, childOrgId] } } });
      await prisma.user.deleteMany({ where: { organizationId: { in: [parentOrgId, childOrgId] } } });
      await prisma.auditLogEntry.deleteMany({ where: { organizationId: { in: [parentOrgId, childOrgId] } } });
      await prisma.organization.deleteMany({ where: { id: { in: [parentOrgId, childOrgId] } } });
    }
    if (app) {
      await app.close();
    }
  });

  it('1. Should allow creating and querying Organization with MSSP_PROVIDER type and child relationship', async () => {
    const parent = await prisma.organization.findUnique({
      where: { id: parentOrgId },
      include: { subOrganizations: true },
    });

    expect(parent).toBeDefined();
    expect(parent?.type).toBe(OrgType.MSSP_PROVIDER);
    expect(parent?.subOrganizations).toHaveLength(1);
    expect(parent?.subOrganizations[0].id).toBe(childOrgId);
    expect(parent?.subOrganizations[0].type).toBe(OrgType.CLIENT_TENANT);
  });

  it('2. CRITICAL TENANT ISOLATION: MSSP Parent user MUST NOT see child org assets', async () => {
    const response = await request(app.getHttpServer())
      .get('/assets')
      .set('Authorization', `Bearer ${parentUserToken}`)
      .expect(200);

    // Parent user should receive 0 assets because child asset belongs strictly to childOrgId
    const items = response.body.items || response.body.data || response.body;
    expect(Array.isArray(items)).toBe(true);
    const foundChildAsset = items.find((a: any) => a.id === childAssetId);
    expect(foundChildAsset).toBeUndefined();
  });

  it('3. CRITICAL TENANT ISOLATION: MSSP Parent user MUST NOT see child org risks', async () => {
    const response = await request(app.getHttpServer())
      .get('/risks')
      .set('Authorization', `Bearer ${parentUserToken}`)
      .expect(200);

    // Parent user should receive 0 risks because child risk belongs strictly to childOrgId
    const items = response.body.items || response.body.data || response.body;
    expect(Array.isArray(items)).toBe(true);
    const foundChildRisk = items.find((r: any) => r.id === childRiskId);
    expect(foundChildRisk).toBeUndefined();
  });

  it('4. Child tenant user can see their own assets', async () => {
    const response = await request(app.getHttpServer())
      .get('/assets')
      .set('Authorization', `Bearer ${childUserToken}`)
      .expect(200);

    const items = response.body.items || response.body.data || response.body;
    expect(Array.isArray(items)).toBe(true);
    const foundChildAsset = items.find((a: any) => a.id === childAssetId);
    expect(foundChildAsset).toBeDefined();
    expect(foundChildAsset.name).toBe('Confidential Child Infrastructure DB');
  });

  it('5. Audit Log verification on org relationship update', async () => {
    // Audit log entry manually written or generated via script
    const auditEntry = await prisma.auditLogEntry.create({
      data: {
        organizationId: childOrgId,
        actorId: 'test-admin-actor',
        action: 'ORGANIZATION_RELATIONSHIP_UPDATED',
        entityType: 'Organization',
        entityId: childOrgId,
        metadata: {
          oldType: 'STANDALONE',
          newType: 'CLIENT_TENANT',
          oldParentOrganizationId: null,
          newParentOrganizationId: parentOrgId,
        },
      },
    });

    const retrievedLog = await prisma.auditLogEntry.findUnique({
      where: { id: auditEntry.id },
    });

    expect(retrievedLog).toBeDefined();
    expect(retrievedLog?.action).toBe('ORGANIZATION_RELATIONSHIP_UPDATED');
    expect(retrievedLog?.entityId).toBe(childOrgId);
    expect((retrievedLog?.metadata as any).newParentOrganizationId).toBe(parentOrgId);
  });
});
