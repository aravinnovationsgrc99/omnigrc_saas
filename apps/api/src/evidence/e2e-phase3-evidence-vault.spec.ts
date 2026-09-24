import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ForbiddenException, BadRequestException, NotFoundException } from '@nestjs/common';
import { AppModule } from '../app.module';
import { PrismaService } from '../prisma/prisma.service';
import { EvidenceService } from './evidence.service';
import { EvidenceStorageService } from './evidence-storage.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { Role, ProductAccessStatus, EvidenceType, EvidenceStatus } from '@omnigrc/shared';

describe('E2E Phase 3: Universal Evidence & Proof Vault Suite', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let evidenceService: EvidenceService;
  let storageService: EvidenceStorageService;
  let auditLogsService: AuditLogsService;

  const ORG_A_ID = 'org-phase3-e2e-a';
  const ORG_B_ID = 'org-phase3-e2e-b';

  const USER_ADMIN_A = 'user-admin-3a';
  const USER_ANALYST_A = 'user-analyst-3a';
  const USER_AUDITOR_A = 'user-auditor-3a';
  const USER_ADMIN_B = 'user-admin-3b';

  let controlAId: string;
  let controlBId: string;
  let evidenceAId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    prisma = app.get<PrismaService>(PrismaService);
    evidenceService = app.get<EvidenceService>(EvidenceService);
    storageService = app.get<EvidenceStorageService>(EvidenceStorageService);
    auditLogsService = app.get<AuditLogsService>(AuditLogsService);

    // Seed test organizations & memberships
    await prisma.organization.upsert({
      where: { id: ORG_A_ID },
      update: {},
      create: { id: ORG_A_ID, name: 'Phase 3 Org A' },
    });
    await prisma.organization.upsert({
      where: { id: ORG_B_ID },
      update: {},
      create: { id: ORG_B_ID, name: 'Phase 3 Org B' },
    });

    // Seed Users & Memberships
    await prisma.user.upsert({
      where: { id: USER_ADMIN_A },
      update: {},
      create: { id: USER_ADMIN_A, email: 'admin3a@orga.com', name: 'Admin 3A', organizationId: ORG_A_ID, passwordHash: 'hash', role: Role.ADMIN },
    });
    await prisma.organizationMembership.upsert({
      where: { organizationId_userId: { organizationId: ORG_A_ID, userId: USER_ADMIN_A } },
      update: { status: ProductAccessStatus.ACTIVE },
      create: { organizationId: ORG_A_ID, userId: USER_ADMIN_A, role: Role.ADMIN, status: ProductAccessStatus.ACTIVE },
    });

    await prisma.user.upsert({
      where: { id: USER_ANALYST_A },
      update: {},
      create: { id: USER_ANALYST_A, email: 'analyst3a@orga.com', name: 'Analyst 3A', organizationId: ORG_A_ID, passwordHash: 'hash', role: Role.ANALYST },
    });
    await prisma.organizationMembership.upsert({
      where: { organizationId_userId: { organizationId: ORG_A_ID, userId: USER_ANALYST_A } },
      update: { status: ProductAccessStatus.ACTIVE },
      create: { organizationId: ORG_A_ID, userId: USER_ANALYST_A, role: Role.ANALYST, status: ProductAccessStatus.ACTIVE },
    });

    await prisma.user.upsert({
      where: { id: USER_AUDITOR_A },
      update: {},
      create: { id: USER_AUDITOR_A, email: 'auditor3a@orga.com', name: 'Auditor 3A', organizationId: ORG_A_ID, passwordHash: 'hash', role: Role.EXTERNAL_AUDITOR },
    });
    await prisma.organizationMembership.upsert({
      where: { organizationId_userId: { organizationId: ORG_A_ID, userId: USER_AUDITOR_A } },
      update: { status: ProductAccessStatus.ACTIVE },
      create: { organizationId: ORG_A_ID, userId: USER_AUDITOR_A, role: Role.EXTERNAL_AUDITOR, status: ProductAccessStatus.ACTIVE },
    });

    await prisma.user.upsert({
      where: { id: USER_ADMIN_B },
      update: {},
      create: { id: USER_ADMIN_B, email: 'admin3b@orgb.com', name: 'Admin 3B', organizationId: ORG_B_ID, passwordHash: 'hash', role: Role.ADMIN },
    });
    await prisma.organizationMembership.upsert({
      where: { organizationId_userId: { organizationId: ORG_B_ID, userId: USER_ADMIN_B } },
      update: { status: ProductAccessStatus.ACTIVE },
      create: { organizationId: ORG_B_ID, userId: USER_ADMIN_B, role: Role.ADMIN, status: ProductAccessStatus.ACTIVE },
    });

    // Seed test controls
    const cA = await prisma.control.create({
      data: { organizationId: ORG_A_ID, name: 'Access Control Policy Audit', description: 'Test Control Org A', createdById: USER_ADMIN_A },
    });
    controlAId = cA.id;

    const cB = await prisma.control.create({
      data: { organizationId: ORG_B_ID, name: 'Org B Secret Control', description: 'Test Control Org B', createdById: USER_ADMIN_B },
    });
    controlBId = cB.id;

    jest.spyOn(auditLogsService, 'log').mockImplementation(async () => ({} as any));
  });

  afterAll(async () => {
    await prisma.controlEvidence.deleteMany({ where: { organizationId: { in: [ORG_A_ID, ORG_B_ID] } } });
    await prisma.evidence.deleteMany({ where: { organizationId: { in: [ORG_A_ID, ORG_B_ID] } } });
    await prisma.control.deleteMany({ where: { id: { in: [controlAId, controlBId] } } });
    await prisma.organizationMembership.deleteMany({ where: { organizationId: { in: [ORG_A_ID, ORG_B_ID] } } });
    await prisma.user.deleteMany({ where: { id: { in: [USER_ADMIN_A, USER_ANALYST_A, USER_AUDITOR_A, USER_ADMIN_B] } } });
    await prisma.organization.deleteMany({ where: { id: { in: [ORG_A_ID, ORG_B_ID] } } });
    await app.close();
  });

  it('A. Secure Upload: Uploads valid proof PDF and generates checksum & storageKey', async () => {
    const validPdfBuffer = Buffer.from('%PDF-1.4 Fake PDF Content for Evidence Testing');
    const file = {
      originalname: 'soc2_audit_proof.pdf',
      buffer: validPdfBuffer,
      mimetype: 'application/pdf',
    };

    const authCtxA = { userId: USER_ADMIN_A, organizationId: ORG_A_ID, role: Role.ADMIN };
    const evidence = await evidenceService.createAndUpload(
      authCtxA,
      file,
      {
        title: 'SOC 2 Type II Audit Proof Document',
        description: 'Signed audit evidence for Q3',
        targetResourceType: 'CONTROL',
        targetResourceId: controlAId,
      },
    );

    expect(evidence).toBeDefined();
    expect(evidence.id).toBeDefined();
    expect(evidence.organizationId).toBe(ORG_A_ID);
    expect(evidence.fileName).toBe('soc2_audit_proof.pdf');
    expect(evidence.checksum).toBeDefined();
    expect(evidence.status).toBe(EvidenceStatus.ACTIVE);
    expect(evidence.associations.length).toBe(1);
    expect(evidence.associations[0].resourceId).toBe(controlAId);

    evidenceAId = evidence.id;
  });

  it('B. File Format & Signature Validation: Rejects invalid file extension or magic signature mismatch', async () => {
    // 1. Invalid extension .exe
    const exeBuffer = Buffer.from('MZ Executable file');
    const authCtxA = { userId: USER_ADMIN_A, organizationId: ORG_A_ID, role: Role.ADMIN };
    await expect(
      evidenceService.createAndUpload(
        authCtxA,
        { originalname: 'malware.exe', buffer: exeBuffer, mimetype: 'application/x-msdownload' } as any,
        { title: 'Malicious File' },
      ),
    ).rejects.toThrow(BadRequestException);

    // 2. Extension mismatch (.pdf extension containing raw fake text without %PDF- signature)
    const fakePdfBuffer = Buffer.from('NOT A PDF FILE HEADER');
    await expect(
      evidenceService.createAndUpload(
        authCtxA,
        { originalname: 'fake.pdf', buffer: fakePdfBuffer, mimetype: 'application/pdf' } as any,
        { title: 'Fake PDF' },
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('C. Tenant Isolation: Org B user cannot retrieve or access Org A evidence', async () => {
    const authCtxB = { userId: USER_ADMIN_B, organizationId: ORG_B_ID, role: Role.ADMIN };
    await expect(
      evidenceService.findOne(authCtxB, evidenceAId),
    ).rejects.toThrow(NotFoundException);
  });

  it('D. Cross-Tenant Attachment Rejection: Cannot attach Org A evidence to Org B control', async () => {
    const authCtxA = { userId: USER_ADMIN_A, organizationId: ORG_A_ID, role: Role.ADMIN };
    await expect(
      evidenceService.attachEvidence(authCtxA, evidenceAId, 'CONTROL', controlBId),
    ).rejects.toThrow(NotFoundException);
  });

  it('E. Vault Query: Returns paginated canonical evidence items with resource associations', async () => {
    const authCtxA = { userId: USER_ADMIN_A, organizationId: ORG_A_ID, role: Role.ADMIN };
    const res = await evidenceService.findAll(authCtxA, { page: 1, limit: 10 });
    expect(res.items.length).toBeGreaterThanOrEqual(1);
    const item = res.items.find((i) => i.id === evidenceAId);
    expect(item).toBeDefined();
    expect(item?.associations[0].resourceId).toBe(controlAId);
  });

  it('F. Detach & Re-attach: Detaching evidence leaves canonical evidence intact', async () => {
    const authCtxA = { userId: USER_ADMIN_A, organizationId: ORG_A_ID, role: Role.ADMIN };
    await evidenceService.detachEvidence(authCtxA, evidenceAId, 'CONTROL', controlAId);

    const updated = await evidenceService.findOne(authCtxA, evidenceAId);
    expect(updated.associations.length).toBe(0);

    await evidenceService.attachEvidence(authCtxA, evidenceAId, 'CONTROL', controlAId);
    const reattached = await evidenceService.findOne(authCtxA, evidenceAId);
    expect(reattached.associations.length).toBe(1);
  }, 30000);

  it('G. Audit Log Events: Operations trigger structured audit log entries', async () => {
    expect(auditLogsService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'EVIDENCE_UPLOADED',
        organizationId: ORG_A_ID,
        actorId: USER_ADMIN_A,
      }),
    );
  });
});
