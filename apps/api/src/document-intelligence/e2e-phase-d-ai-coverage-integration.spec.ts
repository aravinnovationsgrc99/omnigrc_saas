import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
import { AppModule } from '../app.module';
import { PrismaService } from '../prisma/prisma.service';
import { DocumentIntelligenceService } from './document-intelligence.service';
import { FrameworkCoverageService } from '../frameworks/framework-coverage.service';
import { FrameworkEntitlementsService } from '../frameworks/framework-entitlements.service';
import { AnalysisQueueService } from './analysis-queue.service';
import { ResourceAuthContext } from '../auth/resource-authorization.service';
import {
  Role,
  AnalysisStatus,
  FindingReviewStatus,
  FindingType,
  MappingStatus,
  EntitlementStatus,
} from '@omnigrc/shared';
import { FrameworkCode } from '@prisma/client';

describe('Phase D — AI Document Intelligence → Framework/Control/Coverage Integration', () => {
  jest.setTimeout(60000);

  let prisma: PrismaService;
  let intelligenceService: DocumentIntelligenceService;
  let coverageService: FrameworkCoverageService;
  let entitlementsService: FrameworkEntitlementsService;
  let queueService: AnalysisQueueService;

  const ORG_ID = 'org-phase-d-tenant-alpha';
  const OTHER_ORG_ID = 'org-phase-d-tenant-beta';

  const adminAuthCtx: ResourceAuthContext = {
    userId: 'user-admin-d1',
    organizationId: ORG_ID,
    role: Role.ADMIN,
  };

  const auditorAuthCtx: ResourceAuthContext = {
    userId: 'user-auditor-d1',
    organizationId: ORG_ID,
    role: Role.EXTERNAL_AUDITOR,
  };

  const otherOrgAuthCtx: ResourceAuthContext = {
    userId: 'user-admin-d2',
    organizationId: OTHER_ORG_ID,
    role: Role.ADMIN,
  };

  let frameworkId: string;
  let versionId: string;
  let referenceId: string;
  let controlId: string;
  let evidenceId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    prisma = moduleFixture.get<PrismaService>(PrismaService);
    intelligenceService = moduleFixture.get<DocumentIntelligenceService>(DocumentIntelligenceService);
    coverageService = moduleFixture.get<FrameworkCoverageService>(FrameworkCoverageService);
    entitlementsService = moduleFixture.get<FrameworkEntitlementsService>(FrameworkEntitlementsService);
    queueService = moduleFixture.get<AnalysisQueueService>(AnalysisQueueService);

    // Seed test orgs
    await prisma.organization.upsert({ where: { id: ORG_ID }, update: {}, create: { id: ORG_ID, name: 'Phase D Org Alpha' } });
    await prisma.organization.upsert({ where: { id: OTHER_ORG_ID }, update: {}, create: { id: OTHER_ORG_ID, name: 'Phase D Org Beta' } });

    // Seed Users & Memberships for authorization checks
    await prisma.user.upsert({
      where: { id: adminAuthCtx.userId },
      update: {},
      create: { id: adminAuthCtx.userId, email: 'admind1@alpha.com', name: 'Admin D1', organizationId: ORG_ID, passwordHash: 'hash', role: Role.ADMIN },
    });
    await prisma.organizationMembership.upsert({
      where: { organizationId_userId: { organizationId: ORG_ID, userId: adminAuthCtx.userId } },
      update: { status: 'ACTIVE' },
      create: { organizationId: ORG_ID, userId: adminAuthCtx.userId, role: Role.ADMIN, status: 'ACTIVE' },
    });

    await prisma.user.upsert({
      where: { id: auditorAuthCtx.userId },
      update: {},
      create: { id: auditorAuthCtx.userId, email: 'auditord1@alpha.com', name: 'Auditor D1', organizationId: ORG_ID, passwordHash: 'hash', role: Role.EXTERNAL_AUDITOR },
    });
    await prisma.organizationMembership.upsert({
      where: { organizationId_userId: { organizationId: ORG_ID, userId: auditorAuthCtx.userId } },
      update: { status: 'ACTIVE' },
      create: { organizationId: ORG_ID, userId: auditorAuthCtx.userId, role: Role.EXTERNAL_AUDITOR, status: 'ACTIVE' },
    });

    await prisma.user.upsert({
      where: { id: otherOrgAuthCtx.userId },
      update: {},
      create: { id: otherOrgAuthCtx.userId, email: 'admind2@beta.com', name: 'Admin D2', organizationId: OTHER_ORG_ID, passwordHash: 'hash', role: Role.ADMIN },
    });
    await prisma.organizationMembership.upsert({
      where: { organizationId_userId: { organizationId: OTHER_ORG_ID, userId: otherOrgAuthCtx.userId } },
      update: { status: 'ACTIVE' },
      create: { organizationId: OTHER_ORG_ID, userId: otherOrgAuthCtx.userId, role: Role.ADMIN, status: 'ACTIVE' },
    });

    // Seed framework, version, reference
    const fw = await prisma.framework.upsert({
      where: { code: FrameworkCode.ISO27001 },
      update: {},
      create: { code: FrameworkCode.ISO27001, name: 'ISO/IEC 27001:2022' },
    });
    frameworkId = fw.id;

    const ver = await prisma.frameworkVersion.upsert({
      where: { frameworkId_version: { frameworkId: fw.id, version: '2022-PHASE-D' } },
      update: {},
      create: { frameworkId: fw.id, version: '2022-PHASE-D', name: 'ISO 27001:2022 Phase D', status: 'ACTIVE' },
    });
    versionId = ver.id;

    const ref = await prisma.frameworkReference.upsert({
      where: { frameworkVersionId_identifier: { frameworkVersionId: ver.id, identifier: 'A.5.15' } },
      update: {},
      create: {
        frameworkVersionId: ver.id,
        identifier: 'A.5.15',
        title: 'Access Control Policy',
        type: 'CONTROL',
        sortOrder: 1,
      },
    });
    referenceId = ref.id;

    // Grant entitlement for ORG_ID
    const existingEnt = await prisma.organizationFrameworkEntitlement.findFirst({
      where: { organizationId: ORG_ID, frameworkId: fw.id, versionId: null },
    });
    if (existingEnt) {
      await prisma.organizationFrameworkEntitlement.update({
        where: { id: existingEnt.id },
        data: { status: EntitlementStatus.ACTIVE },
      });
    } else {
      await prisma.organizationFrameworkEntitlement.create({
        data: { organizationId: ORG_ID, frameworkId: fw.id, versionId: null, status: EntitlementStatus.ACTIVE },
      });
    }

    // Seed Control
    const ctrl = await prisma.control.create({
      data: {
        organizationId: ORG_ID,
        name: 'Access Control Policy Implementation',
        description: 'Organizational access control policies and rules.',
        category: 'ACCESS_CONTROL',
        createdById: adminAuthCtx.userId,
      },
    });
    controlId = ctrl.id;

    // Seed Evidence (ACTIVE + CLEAN)
    const ev = await prisma.evidence.create({
      data: {
        organizationId: ORG_ID,
        title: 'Signed Access Control Policy 2026',
        fileName: 'access_control_policy.pdf',
        fileSize: 1024,
        mimeType: 'application/pdf',
        storageKey: `${ORG_ID}/ev_phase_d_${Date.now()}.pdf`,
        checksum: 'checksum_phase_d_001',
        uploadedById: adminAuthCtx.userId,
        status: 'ACTIVE',
        scanStatus: 'CLEAN',
      },
    });
    evidenceId = ev.id;
  });

  describe('1. Advisory AI Suggestion Lifecycle & Human Review', () => {
    let analysisId: string;
    let findingId: string;

    it('should create document analysis and enqueue AI findings', async () => {
      const result = (await intelligenceService.createAnalysis(adminAuthCtx, evidenceId, {
        analysisContext: 'FRAMEWORK' as any,
        frameworkId,
        frameworkVersionId: versionId,
      })) as any;

      expect(result.id).toBeDefined();
      analysisId = result.id;

      // Seed mock extracted finding
      const finding = await prisma.extractedFinding.create({
        data: {
          documentAnalysisId: analysisId,
          organizationId: ORG_ID,
          findingType: FindingType.CONTROL_IMPLICATION,
          aiTitle: 'Suggested Access Control Reference Mapping',
          aiDescription: 'Document explicitly defines organizational access control rules.',
          aiConfidence: 'HIGH',
          aiSuggestedFrameworkCode: 'ISO27001',
          aiSuggestedReferenceId: referenceId,
          aiSuggestedControlId: controlId,
          aiSourceSnippet: 'Access control rules shall be defined and documented.',
          aiSourcePage: 1,
          reviewStatus: FindingReviewStatus.UNREVIEWED,
        },
      });
      findingId = finding.id;
    });

    it('should allow authorized reviewer to review and ACCEPT an AI suggestion', async () => {
      const reviewed = await intelligenceService.reviewFinding(adminAuthCtx, analysisId, findingId, {
        reviewStatus: FindingReviewStatus.ACCEPTED,
        humanComment: 'Confirmed by Lead Security Auditor.',
      });

      expect(reviewed.reviewStatus).toBe('ACCEPTED');
      expect(reviewed.reviewedById).toBe(adminAuthCtx.userId);
    });

    it('should reject review attempts by External Auditors (403 Forbidden)', async () => {
      await expect(
        intelligenceService.reviewFinding(auditorAuthCtx, analysisId, findingId, {
          reviewStatus: FindingReviewStatus.REJECTED,
        }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('2. Authoritative Relationship Conversion', () => {
    let analysisId: string;
    let findingId: string;

    beforeEach(async () => {
      const analysis = await prisma.documentAnalysis.create({
        data: {
          organizationId: ORG_ID,
          evidenceId,
          fingerprint: `fp_conv_${Date.now()}_${Math.random()}`,
          analysisContext: 'FRAMEWORK',
          frameworkId,
          frameworkVersionId: versionId,
          extractionMethod: 'TestExtractor',
          requestedById: adminAuthCtx.userId,
        },
      });
      analysisId = analysis.id;

      const finding = await prisma.extractedFinding.create({
        data: {
          documentAnalysisId: analysisId,
          organizationId: ORG_ID,
          findingType: FindingType.CONTROL_IMPLICATION,
          aiTitle: 'Suggested Mapping',
          aiDescription: 'Suggested access control mapping',
          aiConfidence: 'HIGH',
          aiSuggestedReferenceId: referenceId,
          aiSuggestedControlId: controlId,
          reviewStatus: FindingReviewStatus.ACCEPTED,
        },
      });
      findingId = finding.id;
    });

    it('should convert accepted finding to authoritative CONTROL_MAPPING', async () => {
      const res = await intelligenceService.convertFindingToAction(adminAuthCtx, analysisId, findingId, {
        conversionType: 'CONTROL_MAPPING',
        controlId,
        frameworkReferenceId: referenceId,
      });

      expect(res.actionType).toBe('CONTROL_MAPPING');

      const mapping = await prisma.controlFrameworkMapping.findUnique({
        where: { controlId_frameworkReferenceId: { controlId, frameworkReferenceId: referenceId } },
      });

      expect(mapping).toBeDefined();
      expect(mapping?.status).toBe(MappingStatus.APPROVED);
    });

    it('should convert accepted finding to authoritative EVIDENCE_REFERENCE', async () => {
      const res = await intelligenceService.convertFindingToAction(adminAuthCtx, analysisId, findingId, {
        conversionType: 'EVIDENCE_REFERENCE',
        frameworkReferenceId: referenceId,
      });

      expect(res.actionType).toBe('EVIDENCE_REFERENCE');

      const evRef = await prisma.evidenceFrameworkReference.findUnique({
        where: { evidenceId_frameworkReferenceId: { evidenceId, frameworkReferenceId: referenceId } },
      });

      expect(evRef).toBeDefined();
    });

    it('should convert accepted finding to authoritative EVIDENCE_CONTROL', async () => {
      const res = await intelligenceService.convertFindingToAction(adminAuthCtx, analysisId, findingId, {
        conversionType: 'EVIDENCE_CONTROL',
        controlId,
      });

      expect(res.actionType).toBe('EVIDENCE_CONTROL');

      const ctrlEv = await prisma.controlEvidence.findUnique({
        where: { controlId_evidenceId: { controlId, evidenceId } },
      });

      expect(ctrlEv).toBeDefined();
    });

    it('should enforce idempotency on repeated conversion attempts', async () => {
      await intelligenceService.convertFindingToAction(adminAuthCtx, analysisId, findingId, {
        conversionType: 'EVIDENCE_REFERENCE',
        frameworkReferenceId: referenceId,
      });

      await expect(
        intelligenceService.convertFindingToAction(adminAuthCtx, analysisId, findingId, {
          conversionType: 'EVIDENCE_REFERENCE',
          frameworkReferenceId: referenceId,
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('3. Phase C Coverage Integration & Semantics', () => {
    it('should NOT calculate COVERED from AI suggestion alone (advisory only)', async () => {
      // Create new reference with no mapping or evidence
      const unmappedRef = await prisma.frameworkReference.upsert({
        where: { frameworkVersionId_identifier: { frameworkVersionId: versionId, identifier: 'A.5.16' } },
        create: {
          frameworkVersionId: versionId,
          identifier: 'A.5.16',
          title: 'Identity Management Policy',
          type: 'CONTROL',
          sortOrder: 2,
        },
        update: {},
      });

      // AI creates an unreviewed suggestion
      const analysis = await prisma.documentAnalysis.create({
        data: {
          organizationId: ORG_ID,
          evidenceId,
          fingerprint: `fp_cov_test_${Date.now()}`,
          analysisContext: 'FRAMEWORK',
          frameworkId,
          frameworkVersionId: versionId,
          extractionMethod: 'TestExtractor',
          requestedById: adminAuthCtx.userId,
        },
      });

      await prisma.extractedFinding.create({
        data: {
          documentAnalysisId: analysis.id,
          organizationId: ORG_ID,
          findingType: FindingType.CONTROL_IMPLICATION,
          aiTitle: 'Suggested Identity Management Mapping',
          aiDescription: 'Identity management rules detected in text.',
          aiConfidence: 'HIGH',
          aiSuggestedReferenceId: unmappedRef.id,
          aiSuggestedControlId: controlId,
          reviewStatus: FindingReviewStatus.UNREVIEWED,
        },
      });

      // Request coverage calculation
      const coverage = await coverageService.calculateCoverage(adminAuthCtx, frameworkId, { versionId });
      const refCov = coverage.references.find((r) => r.referenceId === unmappedRef.id);

      expect(refCov).toBeDefined();
      expect(refCov?.status).toBe('NOT_COVERED');
    });

    it('should calculate COVERED after human converts suggestion to authoritative mapping + clean active evidence', async () => {
      // Establish authoritative mapping
      await prisma.controlFrameworkMapping.upsert({
        where: { controlId_frameworkReferenceId: { controlId, frameworkReferenceId: referenceId } },
        create: { controlId, frameworkReferenceId: referenceId, status: MappingStatus.APPROVED },
        update: { status: MappingStatus.APPROVED },
      });

      // Link clean active evidence
      await prisma.evidenceFrameworkReference.upsert({
        where: { evidenceId_frameworkReferenceId: { evidenceId, frameworkReferenceId: referenceId } },
        create: { evidenceId, frameworkReferenceId: referenceId },
        update: {},
      });

      // Calculate coverage via FrameworkCoverageService
      const coverage = await coverageService.calculateCoverage(adminAuthCtx, frameworkId, { versionId });
      const refCov = coverage.references.find((r) => r.referenceId === referenceId);

      expect(refCov).toBeDefined();
      expect(refCov?.status).toBe('COVERED');
    });
  });

  describe('4. Entitlement & Security Restrictions', () => {
    it('should reject analysis against unentitled framework (403 Forbidden)', async () => {
      // Explicitly set revoked entitlement for OTHER_ORG_ID
      const existingRev = await prisma.organizationFrameworkEntitlement.findFirst({
        where: { organizationId: OTHER_ORG_ID, frameworkId },
      });
      if (existingRev) {
        await prisma.organizationFrameworkEntitlement.update({
          where: { id: existingRev.id },
          data: { status: EntitlementStatus.REVOKED },
        });
      } else {
        await prisma.organizationFrameworkEntitlement.create({
          data: { organizationId: OTHER_ORG_ID, frameworkId, versionId: null, status: EntitlementStatus.REVOKED },
        });
      }

      const evOther = await prisma.evidence.create({
        data: {
          organizationId: OTHER_ORG_ID,
          title: 'Org Beta Evidence',
          fileName: 'beta.pdf',
          fileSize: 512,
          mimeType: 'application/pdf',
          storageKey: `${OTHER_ORG_ID}/beta_${Date.now()}.pdf`,
          uploadedById: otherOrgAuthCtx.userId,
          status: 'ACTIVE',
          scanStatus: 'CLEAN',
        },
      });

      await expect(
        intelligenceService.createAnalysis(otherOrgAuthCtx, evOther.id, {
          analysisContext: 'FRAMEWORK' as any,
          frameworkId,
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should abort worker execution if framework entitlement was revoked while job was queued', async () => {
      // Revoke entitlement
      await prisma.organizationFrameworkEntitlement.updateMany({
        where: { organizationId: ORG_ID, frameworkId },
        data: { status: EntitlementStatus.REVOKED },
      });

      const analysis = await prisma.documentAnalysis.create({
        data: {
          organizationId: ORG_ID,
          evidenceId,
          fingerprint: `fp_worker_revoke_${Date.now()}`,
          analysisContext: 'FRAMEWORK',
          frameworkId,
          frameworkVersionId: versionId,
          status: AnalysisStatus.QUEUED,
          extractionMethod: 'TestExtractor',
          requestedById: adminAuthCtx.userId,
        },
      });

      // Process job
      await queueService.processJob({
        analysisId: analysis.id,
        organizationId: ORG_ID,
        userId: adminAuthCtx.userId,
        evidenceId,
        isDurable: false,
      });

      const updated = await prisma.documentAnalysis.findUnique({ where: { id: analysis.id } });
      expect(updated?.status).toBe(AnalysisStatus.FAILED);
      expect(updated?.errorMessage).toContain('UNAUTHORIZED_FRAMEWORK_ENTITLEMENT');

      // Re-enable entitlement for cleanup
      await prisma.organizationFrameworkEntitlement.updateMany({
        where: { organizationId: ORG_ID, frameworkId },
        data: { status: EntitlementStatus.ACTIVE },
      });
    });
  });
});
