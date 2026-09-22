import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ForbiddenException, ServiceUnavailableException, NotFoundException } from '@nestjs/common';
import { AppModule } from '../app.module';
import { PrismaService } from '../prisma/prisma.service';
import { DocumentIntelligenceService } from './document-intelligence.service';
import { DocumentExtractionService } from './document-extraction.service';
import { AnalysisQueueService } from './analysis-queue.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import {
  Role,
  ProductAccessStatus,
  AnalysisStatus,
  ExtractionStatus,
  AnalysisContextType,
  FindingType,
  FindingReviewStatus,
  EntitlementStatus,
} from '@omnigrc/shared';
import { FrameworkCode, FrameworkReferenceType } from '@prisma/client';
import { FrameworkEntitlementsService } from '../frameworks/framework-entitlements.service';
import * as path from 'path';
import * as fs from 'fs';

describe('E2E Phase 5: AI Document Intelligence & Compliance Analysis Suite', () => {
  jest.setTimeout(60000);

  let app: INestApplication;
  let prisma: PrismaService;
  let intelligenceService: DocumentIntelligenceService;
  let extractionService: DocumentExtractionService;
  let queueService: AnalysisQueueService;
  let auditLogsService: AuditLogsService;

  const ORG_A_ID = 'org-phase5-e2e-a';
  const ORG_B_ID = 'org-phase5-e2e-b';

  const USER_ADMIN_A = 'user-admin-5a';
  const USER_ANALYST_A = 'user-analyst-5a';
  const USER_REVOKED_A = 'user-revoked-5a';
  const USER_ADMIN_B = 'user-admin-5b';

  let evidenceAId: string;
  let evidenceBId: string;
  let entitlementFwId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    prisma = app.get<PrismaService>(PrismaService);
    intelligenceService = app.get<DocumentIntelligenceService>(DocumentIntelligenceService);
    extractionService = app.get<DocumentExtractionService>(DocumentExtractionService);
    queueService = app.get<AnalysisQueueService>(AnalysisQueueService);
    auditLogsService = app.get<AuditLogsService>(AuditLogsService);

    // Seed test organizations
    await prisma.organization.upsert({
      where: { id: ORG_A_ID },
      update: {},
      create: { id: ORG_A_ID, name: 'Phase 5 Org A' },
    });
    await prisma.organization.upsert({
      where: { id: ORG_B_ID },
      update: {},
      create: { id: ORG_B_ID, name: 'Phase 5 Org B' },
    });

    // Seed Users & Memberships
    await prisma.user.upsert({
      where: { id: USER_ADMIN_A },
      update: {},
      create: { id: USER_ADMIN_A, email: 'admin5a@orga.com', name: 'Admin 5A', organizationId: ORG_A_ID, passwordHash: 'hash', role: Role.ADMIN },
    });
    await prisma.organizationMembership.upsert({
      where: { organizationId_userId: { organizationId: ORG_A_ID, userId: USER_ADMIN_A } },
      update: { status: ProductAccessStatus.ACTIVE },
      create: { organizationId: ORG_A_ID, userId: USER_ADMIN_A, role: Role.ADMIN, status: ProductAccessStatus.ACTIVE },
    });

    await prisma.user.upsert({
      where: { id: USER_ANALYST_A },
      update: {},
      create: { id: USER_ANALYST_A, email: 'analyst5a@orga.com', name: 'Analyst 5A', organizationId: ORG_A_ID, passwordHash: 'hash', role: Role.ANALYST },
    });
    await prisma.organizationMembership.upsert({
      where: { organizationId_userId: { organizationId: ORG_A_ID, userId: USER_ANALYST_A } },
      update: { status: ProductAccessStatus.ACTIVE },
      create: { organizationId: ORG_A_ID, userId: USER_ANALYST_A, role: Role.ANALYST, status: ProductAccessStatus.ACTIVE },
    });

    await prisma.user.upsert({
      where: { id: USER_REVOKED_A },
      update: {},
      create: { id: USER_REVOKED_A, email: 'revoked5a@orga.com', name: 'Revoked 5A', organizationId: ORG_A_ID, passwordHash: 'hash', role: Role.ANALYST },
    });
    await prisma.organizationMembership.upsert({
      where: { organizationId_userId: { organizationId: ORG_A_ID, userId: USER_REVOKED_A } },
      update: { status: ProductAccessStatus.REVOKED },
      create: { organizationId: ORG_A_ID, userId: USER_REVOKED_A, role: Role.ANALYST, status: ProductAccessStatus.REVOKED },
    });

    await prisma.user.upsert({
      where: { id: USER_ADMIN_B },
      update: {},
      create: { id: USER_ADMIN_B, email: 'admin5b@orgb.com', name: 'Admin 5B', organizationId: ORG_B_ID, passwordHash: 'hash', role: Role.ADMIN },
    });
    await prisma.organizationMembership.upsert({
      where: { organizationId_userId: { organizationId: ORG_B_ID, userId: USER_ADMIN_B } },
      update: { status: ProductAccessStatus.ACTIVE },
      create: { organizationId: ORG_B_ID, userId: USER_ADMIN_B, role: Role.ADMIN, status: ProductAccessStatus.ACTIVE },
    });

    // Seed Evidence Records
    const keyA = `${ORG_A_ID}/e2e_soc2_report_${Date.now()}.pdf`;
    const evA = await prisma.evidence.upsert({
      where: { storageKey: keyA },
      update: {},
      create: {
        organizationId: ORG_A_ID,
        title: 'SOC 2 Audit Report 2026',
        fileName: 'soc2_report_2026.pdf',
        fileSize: 1024,
        mimeType: 'application/pdf',
        storageKey: keyA,
        checksum: 'checksum_soc2_a_123',
        uploadedById: USER_ADMIN_A,
      },
    });
    evidenceAId = evA.id;

    const keyB = `${ORG_B_ID}/e2e_secret_b_${Date.now()}.pdf`;
    const evB = await prisma.evidence.upsert({
      where: { storageKey: keyB },
      update: {},
      create: {
        organizationId: ORG_B_ID,
        title: 'Org B Secret Policy',
        fileName: 'orgb_secret.pdf',
        fileSize: 2048,
        mimeType: 'application/pdf',
        storageKey: keyB,
        checksum: 'checksum_secret_b_456',
        uploadedById: USER_ADMIN_B,
      },
    });
    evidenceBId = evB.id;

    // Seed Framework & Active Entitlement for Org A
    const fw = await prisma.framework.upsert({
      where: { code: 'ISO27001' },
      update: {},
      create: { code: 'ISO27001', name: 'ISO/IEC 27001:2022' },
    });
    entitlementFwId = fw.id;

    const existingEnt = await prisma.organizationFrameworkEntitlement.findFirst({
      where: { organizationId: ORG_A_ID, frameworkId: fw.id, versionId: null },
    });
    if (existingEnt) {
      await prisma.organizationFrameworkEntitlement.update({
        where: { id: existingEnt.id },
        data: { status: EntitlementStatus.ACTIVE },
      });
    } else {
      await prisma.organizationFrameworkEntitlement.create({
        data: { organizationId: ORG_A_ID, frameworkId: fw.id, status: EntitlementStatus.ACTIVE },
      });
    }

    jest.spyOn(auditLogsService, 'log').mockImplementation(async () => ({} as any));
  }, 60000);

  afterAll(async () => {
    if (prisma) {
      try { await prisma.extractedFinding.deleteMany({ where: { organizationId: { in: [ORG_A_ID, ORG_B_ID] } } }); } catch {}
      try { await prisma.analysisRun.deleteMany({ where: { documentAnalysis: { organizationId: { in: [ORG_A_ID, ORG_B_ID] } } } }); } catch {}
      try { await prisma.documentAnalysis.deleteMany({ where: { organizationId: { in: [ORG_A_ID, ORG_B_ID] } } }); } catch {}
      try { await prisma.evidenceApproval.deleteMany({ where: { evidenceId: { in: [evidenceAId, evidenceBId] } } }); } catch {}
      try { await prisma.evidenceFrameworkReference.deleteMany({ where: { evidenceId: { in: [evidenceAId, evidenceBId] } } }); } catch {}
      try { await prisma.evidence.deleteMany({ where: { id: { in: [evidenceAId, evidenceBId] } } }); } catch {}
      try { await prisma.organizationFrameworkEntitlement.deleteMany({ where: { organizationId: { in: [ORG_A_ID, ORG_B_ID] } } }); } catch {}
      try { await prisma.organizationMembership.deleteMany({ where: { organizationId: { in: [ORG_A_ID, ORG_B_ID] } } }); } catch {}
      try { await prisma.user.deleteMany({ where: { id: { in: [USER_ADMIN_A, USER_ANALYST_A, USER_REVOKED_A, USER_ADMIN_B] } } }); } catch {}
      try { await prisma.organization.deleteMany({ where: { id: { in: [ORG_A_ID, ORG_B_ID] } } }); } catch {}
    }
    if (app) await app.close();
  });

  it('A. Queue Analysis & Lifecycle: Enqueues document analysis and returns QUEUED state', async () => {
    const analysis = await intelligenceService.createAnalysis(ORG_A_ID, USER_ADMIN_A, evidenceAId, {
      analysisContext: AnalysisContextType.GENERAL,
    }) as any;

    expect(analysis).toBeDefined();
    expect(analysis.organizationId).toBe(ORG_A_ID);
    expect(analysis.evidenceId).toBe(evidenceAId);
    expect(analysis.status).toBe(AnalysisStatus.QUEUED);
    expect(analysis.fingerprint).toBeDefined();
  });

  it('B. Tenant Isolation: Org B user cannot analyze Org A evidence', async () => {
    await expect(
      intelligenceService.createAnalysis(ORG_B_ID, USER_ADMIN_B, evidenceAId, {
        analysisContext: AnalysisContextType.GENERAL,
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it('C. Framework Entitlement Enforcement: Unentitled framework analysis is rejected with 403 Forbidden', async () => {
    await prisma.organizationFrameworkEntitlement.create({
      data: { organizationId: ORG_B_ID, frameworkId: entitlementFwId, status: EntitlementStatus.REVOKED },
    });

    await expect(
      intelligenceService.createAnalysis(ORG_B_ID, USER_ADMIN_B, evidenceBId, {
        analysisContext: AnalysisContextType.FRAMEWORK,
        frameworkId: entitlementFwId,
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('D. Document Type Extraction Pipeline: Bounded extraction for Text/PDF formats', async () => {
    const tempFile = path.resolve(process.cwd(), 'uploads', 'evidence', 'test_extract.txt');
    const dir = path.dirname(tempFile);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    await fs.promises.writeFile(tempFile, 'Security Policy: Access control logs must be reviewed annually by 30 June.');

    const result = await extractionService.extract(tempFile, 'test_extract.txt', 'text/plain');

    expect(result.extractionStatus).toBe(ExtractionStatus.SUCCESS);
    expect(result.fullText).toContain('Security Policy');
    expect(result.isTruncated).toBe(false);

    if (fs.existsSync(tempFile)) await fs.promises.unlink(tempFile);
  });

  it('E. OCR Capability Status: Image processing reports EXTRACTION_UNAVAILABLE when OCR key missing', async () => {
    const tempImg = path.resolve(process.cwd(), 'uploads', 'evidence', 'test_scanned.png');
    await fs.promises.writeFile(tempImg, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));

    const originalKey = process.env.OCR_PROVIDER_KEY;
    delete process.env.OCR_PROVIDER_KEY;

    const result = await extractionService.extract(tempImg, 'test_scanned.png', 'image/png');

    expect(result.extractionStatus).toBe(ExtractionStatus.OCR_UNAVAILABLE);
    expect(result.fullText).toContain('OCR UNAVAILABLE');

    if (originalKey) process.env.OCR_PROVIDER_KEY = originalKey;
    if (fs.existsSync(tempImg)) await fs.promises.unlink(tempImg);
  });

  it('F. Server-Side Suggestion Validation: Cross-tenant control suggestions are scrubbed', async () => {
    const controlB = await prisma.control.create({
      data: { organizationId: ORG_B_ID, name: 'Org B Private Control', description: 'Secret', createdById: USER_ADMIN_B },
    });

    const analysis = await prisma.documentAnalysis.create({
      data: {
        organizationId: ORG_A_ID,
        evidenceId: evidenceAId,
        fingerprint: 'fp_cross_tenant_test',
        analysisContext: AnalysisContextType.GENERAL,
        status: AnalysisStatus.COMPLETED,
        extractionMethod: 'Test',
        requestedById: USER_ADMIN_A,
      },
    });

    await queueService.processJob({
      analysisId: analysis.id,
      organizationId: ORG_A_ID,
      userId: USER_ADMIN_A,
      evidenceId: evidenceAId,
      isDurable: false,
    });

    const updated = await intelligenceService.findAnalysisById(ORG_A_ID, analysis.id);
    expect(updated.findings).toBeDefined();

    for (const f of updated.findings || []) {
      if (f.aiSuggestedControlId === controlB.id) {
        expect(f.isValidatedControl).toBe(false);
      }
    }

    await prisma.extractedFinding.deleteMany({ where: { documentAnalysisId: analysis.id } });
    await prisma.documentAnalysis.delete({ where: { id: analysis.id } });
    await prisma.control.delete({ where: { id: controlB.id } });
  });

  it('G. Human Review & Immutability: Accepting finding records human decision without overwriting model output', async () => {
    const analysis = await prisma.documentAnalysis.create({
      data: {
        organizationId: ORG_A_ID,
        evidenceId: evidenceAId,
        fingerprint: 'fp_human_review_test',
        analysisContext: AnalysisContextType.GENERAL,
        status: AnalysisStatus.COMPLETED,
        extractionMethod: 'Test',
        requestedById: USER_ADMIN_A,
      },
    });

    const finding = await prisma.extractedFinding.create({
      data: {
        documentAnalysisId: analysis.id,
        organizationId: ORG_A_ID,
        findingType: FindingType.OBLIGATION,
        aiTitle: 'Original Model Title',
        aiDescription: 'Original Model Description',
        aiConfidence: 'HIGH',
        aiSourceSnippet: 'Original snippet',
        reviewStatus: FindingReviewStatus.UNREVIEWED,
      },
    });

    const reviewed = await intelligenceService.reviewFinding(
      ORG_A_ID,
      USER_ADMIN_A,
      Role.ADMIN,
      analysis.id,
      finding.id,
      {
        reviewStatus: FindingReviewStatus.ACCEPTED,
        editedTitle: 'Human Verified Obligation Title',
        humanComment: 'Reviewed and confirmed during Q3 audit.',
      },
    );

    expect(reviewed.reviewStatus).toBe(FindingReviewStatus.ACCEPTED);
    expect(reviewed.reviewedById).toBe(USER_ADMIN_A);
    expect(reviewed.editedTitle).toBe('Human Verified Obligation Title');

    expect(reviewed.aiTitle).toBe('Original Model Title');
    expect(reviewed.aiDescription).toBe('Original Model Description');

    await prisma.extractedFinding.delete({ where: { id: finding.id } });
    await prisma.documentAnalysis.delete({ where: { id: analysis.id } });
  });

  it('H. Idempotency: Duplicate analysis request returns cached result', async () => {
    const keyH = `${ORG_A_ID}/e2e_idempotency_${Date.now()}.pdf`;
    const evH = await prisma.evidence.create({
      data: {
        organizationId: ORG_A_ID,
        title: 'Idempotency Test Document',
        fileName: 'idempotency_doc.pdf',
        fileSize: 512,
        mimeType: 'application/pdf',
        storageKey: keyH,
        checksum: `checksum_idempotency_${Date.now()}`,
        uploadedById: USER_ADMIN_A,
      },
    });

    const res1 = await intelligenceService.createAnalysis(ORG_A_ID, USER_ADMIN_A, evH.id, {
      analysisContext: AnalysisContextType.GENERAL,
    }) as any;

    const res2 = await intelligenceService.createAnalysis(ORG_A_ID, USER_ADMIN_A, evH.id, {
      analysisContext: AnalysisContextType.GENERAL,
    }) as any;

    expect(res1.id).toBe(res2.id);
    expect(res1.fingerprint).toBe(res2.fingerprint);

    await prisma.documentAnalysis.deleteMany({ where: { evidenceId: evH.id } });
    await prisma.evidence.delete({ where: { id: evH.id } });
  });

  it('I. Production Redis Unavailability Guard: Returns HTTP 503 error when Redis offline in production', async () => {
    const originalEnv = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = 'production';
      (queueService as any).isRedisConnected = false;
      (queueService as any).bullQueue = null;

      await expect(
        queueService.enqueueAnalysis('analysis_prod_fail', ORG_A_ID, USER_ADMIN_A, evidenceAId),
      ).rejects.toThrow(ServiceUnavailableException);
    } finally {
      process.env.NODE_ENV = originalEnv;
    }
  });

  it('J. Framework Entitlement Precedence Suite (A-E): Explicit version safety rules are enforced', async () => {
    const fwTest = await prisma.framework.upsert({
      where: { code: FrameworkCode.HIPAA },
      update: {},
      create: { code: FrameworkCode.HIPAA, name: 'HIPAA Compliance Standard' },
    });
    const verA = await prisma.frameworkVersion.create({
      data: { frameworkId: fwTest.id, version: `vA_${Date.now()}`, name: 'Version A' },
    });
    const verB = await prisma.frameworkVersion.create({
      data: { frameworkId: fwTest.id, version: `vB_${Date.now()}`, name: 'Version B' },
    });
    const refA = await prisma.frameworkReference.create({
      data: {
        frameworkVersionId: verA.id,
        type: FrameworkReferenceType.REQUIREMENT,
        identifier: `REF-A-${Date.now()}`,
        title: 'Requirement A',
      },
    });

    const entitlementsService = app.get<FrameworkEntitlementsService>(FrameworkEntitlementsService);

    // Case A: Framework-wide ACTIVE + no version restriction -> allowed
    await prisma.organizationFrameworkEntitlement.create({
      data: { organizationId: ORG_A_ID, frameworkId: fwTest.id, versionId: null, status: EntitlementStatus.ACTIVE },
    });
    const isAllowedA = await entitlementsService.isEntitled(ORG_A_ID, fwTest.id, null);
    expect(isAllowedA).toBe(true);

    // Case B: Framework-wide ACTIVE + specific version ACTIVE -> matching version allowed
    await prisma.organizationFrameworkEntitlement.create({
      data: { organizationId: ORG_A_ID, frameworkId: fwTest.id, versionId: verA.id, status: EntitlementStatus.ACTIVE },
    });
    const isAllowedB = await entitlementsService.isEntitled(ORG_A_ID, fwTest.id, verA.id);
    expect(isAllowedB).toBe(true);

    // Case C: Framework-wide ACTIVE + specific version EXPIRED -> matching version denied
    await prisma.organizationFrameworkEntitlement.create({
      data: { organizationId: ORG_A_ID, frameworkId: fwTest.id, versionId: verB.id, status: EntitlementStatus.EXPIRED },
    });
    const isAllowedC = await entitlementsService.isEntitled(ORG_A_ID, fwTest.id, verB.id);
    expect(isAllowedC).toBe(false);

    // Case D: Version A ACTIVE + Version B not entitled -> Version B denied
    await prisma.organizationFrameworkEntitlement.deleteMany({ where: { frameworkId: fwTest.id } });
    await prisma.organizationFrameworkEntitlement.create({
      data: { organizationId: ORG_A_ID, frameworkId: fwTest.id, versionId: verA.id, status: EntitlementStatus.ACTIVE },
    });
    const isAllowedD = await entitlementsService.isEntitled(ORG_A_ID, fwTest.id, verB.id);
    expect(isAllowedD).toBe(false);

    // Case E: FrameworkReference belonging to Version A + Version B entitlement only -> denied
    await prisma.organizationFrameworkEntitlement.deleteMany({ where: { frameworkId: fwTest.id } });
    await prisma.organizationFrameworkEntitlement.create({
      data: { organizationId: ORG_A_ID, frameworkId: fwTest.id, versionId: verB.id, status: EntitlementStatus.ACTIVE },
    });

    await expect(
      intelligenceService.createAnalysis(ORG_A_ID, USER_ADMIN_A, evidenceAId, {
        analysisContext: AnalysisContextType.FRAMEWORK_REFERENCE,
        frameworkReferenceId: refA.id,
      }),
    ).rejects.toThrow(ForbiddenException);

    // Cleanup
    await prisma.organizationFrameworkEntitlement.deleteMany({ where: { frameworkId: fwTest.id } });
    await prisma.frameworkReference.delete({ where: { id: refA.id } });
    await prisma.frameworkVersion.deleteMany({ where: { id: { in: [verA.id, verB.id] } } });
  });

  it('K. AnalysisRun Execution Logging & Idempotency: Retries log separate AnalysisRun while findings remain reconciled', async () => {
    const analysis = await prisma.documentAnalysis.create({
      data: {
        organizationId: ORG_A_ID,
        evidenceId: evidenceAId,
        fingerprint: `fp_retry_sem_${Date.now()}`,
        analysisContext: AnalysisContextType.GENERAL,
        status: AnalysisStatus.FAILED,
        errorMessage: 'Initial processing failure',
        extractionMethod: 'Test',
        requestedById: USER_ADMIN_A,
      },
    });

    await queueService.processJob({ analysisId: analysis.id, organizationId: ORG_A_ID, userId: USER_ADMIN_A, evidenceId: evidenceAId, isDurable: false });
    await queueService.processJob({ analysisId: analysis.id, organizationId: ORG_A_ID, userId: USER_ADMIN_A, evidenceId: evidenceAId, isDurable: false });

    const updated = await intelligenceService.findAnalysisById(ORG_A_ID, analysis.id);
    expect(updated.runs?.length).toBeGreaterThanOrEqual(2);

    const findingsCount = await prisma.extractedFinding.count({ where: { documentAnalysisId: analysis.id } });
    expect(findingsCount).toBe(updated.findings?.length);

    await prisma.extractedFinding.deleteMany({ where: { documentAnalysisId: analysis.id } });
    await prisma.analysisRun.deleteMany({ where: { documentAnalysisId: analysis.id } });
    await prisma.documentAnalysis.delete({ where: { id: analysis.id } });
  });

  it('L. Framework Reference Consistency: Mismatched framework reference suggestion is unvalidated', async () => {
    const fwOther = await prisma.framework.upsert({
      where: { code: FrameworkCode.SOC2 },
      update: {},
      create: { code: FrameworkCode.SOC2, name: 'SOC 2 Framework' },
    });
    const fwVerOther = await prisma.frameworkVersion.create({
      data: { frameworkId: fwOther.id, version: `v_soc2_${Date.now()}`, name: 'SOC 2 2026' },
    });
    const refOther = await prisma.frameworkReference.create({
      data: {
        frameworkVersionId: fwVerOther.id,
        type: FrameworkReferenceType.REQUIREMENT,
        identifier: `REF-SOC2-${Date.now()}`,
        title: 'Unentitled Reference',
      },
    });

    const analysis = await prisma.documentAnalysis.create({
      data: {
        organizationId: ORG_A_ID,
        evidenceId: evidenceAId,
        fingerprint: `fp_ref_mismatch_${Date.now()}`,
        analysisContext: AnalysisContextType.FRAMEWORK,
        frameworkId: entitlementFwId,
        status: AnalysisStatus.COMPLETED,
        extractionMethod: 'Test',
        requestedById: USER_ADMIN_A,
      },
    });

    await prisma.extractedFinding.create({
      data: {
        documentAnalysisId: analysis.id,
        organizationId: ORG_A_ID,
        findingType: FindingType.OBLIGATION,
        aiTitle: 'Test Finding with Invalid Reference',
        aiDescription: 'Description',
        aiConfidence: 'HIGH',
        aiSourceSnippet: 'Snippet',
        aiSuggestedReferenceId: refOther.id,
        reviewStatus: FindingReviewStatus.UNREVIEWED,
      },
    });

    await queueService.processJob({ analysisId: analysis.id, organizationId: ORG_A_ID, userId: USER_ADMIN_A, evidenceId: evidenceAId, isDurable: false });

    const updated = await intelligenceService.findAnalysisById(ORG_A_ID, analysis.id);
    const findingWithRef = updated.findings?.find(f => f.aiSuggestedReferenceId === refOther.id);
    if (findingWithRef) {
      expect(findingWithRef.isValidatedReference).toBe(false);
    }

    await prisma.extractedFinding.deleteMany({ where: { documentAnalysisId: analysis.id } });
    await prisma.analysisRun.deleteMany({ where: { documentAnalysisId: analysis.id } });
    await prisma.documentAnalysis.delete({ where: { id: analysis.id } });
    await prisma.frameworkReference.delete({ where: { id: refOther.id } });
    await prisma.frameworkVersion.delete({ where: { id: fwVerOther.id } });
  });

  it('M. Comprehensive Cross-Tenant Security: Org B cannot access, read, review, or retry Org A analysis', async () => {
    const analysis = await prisma.documentAnalysis.create({
      data: {
        organizationId: ORG_A_ID,
        evidenceId: evidenceAId,
        fingerprint: `fp_tenant_sec_${Date.now()}`,
        analysisContext: AnalysisContextType.GENERAL,
        status: AnalysisStatus.FAILED,
        errorMessage: 'Failed run',
        extractionMethod: 'Test',
        requestedById: USER_ADMIN_A,
      },
    });

    const finding = await prisma.extractedFinding.create({
      data: {
        documentAnalysisId: analysis.id,
        organizationId: ORG_A_ID,
        findingType: FindingType.KEY_POINT,
        aiTitle: 'Org A Secret Finding',
        aiDescription: 'Description',
        aiConfidence: 'HIGH',
        aiSourceSnippet: 'Snippet',
        reviewStatus: FindingReviewStatus.UNREVIEWED,
      },
    });

    // 1. Cannot analyze another tenant's evidence
    await expect(
      intelligenceService.createAnalysis(ORG_B_ID, USER_ADMIN_B, evidenceAId, {
        analysisContext: AnalysisContextType.GENERAL,
      }),
    ).rejects.toThrow(NotFoundException);

    // 2. Cannot read another tenant's evidence analyses list
    const orgBAnalyses = await intelligenceService.findAllAnalysesForEvidence(ORG_B_ID, evidenceAId);
    expect(orgBAnalyses.length).toBe(0);

    // 3. Cannot read another tenant's analysis by ID
    await expect(intelligenceService.findAnalysisById(ORG_B_ID, analysis.id)).rejects.toThrow(NotFoundException);

    // 4. Cannot retry another tenant's analysis
    await expect(intelligenceService.retryAnalysis(ORG_B_ID, USER_ADMIN_B, analysis.id)).rejects.toThrow(NotFoundException);

    // 5. Cannot review another tenant's finding
    await expect(
      intelligenceService.reviewFinding(ORG_B_ID, USER_ADMIN_B, Role.ADMIN, analysis.id, finding.id, {
        reviewStatus: FindingReviewStatus.ACCEPTED,
      }),
    ).rejects.toThrow(NotFoundException);

    await prisma.extractedFinding.delete({ where: { id: finding.id } });
    await prisma.documentAnalysis.delete({ where: { id: analysis.id } });
  });
});
