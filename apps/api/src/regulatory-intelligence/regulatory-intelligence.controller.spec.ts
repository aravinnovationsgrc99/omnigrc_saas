import { RegulatoryIntelligenceController } from './regulatory-intelligence.controller';
import { PrismaService } from '../prisma/prisma.service';
import { RegulatoryCatalogueService } from './catalogue/regulatory-catalogue.service';
import { RegulatoryIngestionService } from './regulatory-ingestion.service';
import { RegulatoryDocumentStorageService } from './storage/regulatory-document-storage.service';
import { RegulatoryObligationService } from './obligations/regulatory-obligation.service';
import { RegulatoryApplicabilityService } from './applicability/regulatory-applicability.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { ManualIntakeReviewStatus, RegulatoryObligationStatus, ApplicabilityOutcome } from '@prisma/client';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { Readable } from 'stream';

describe('RegulatoryIntelligenceController (Internal API & Tenant Isolation)', () => {
  let controller: RegulatoryIntelligenceController;
  let mockPrisma: any;
  let mockCatalogueService: jest.Mocked<RegulatoryCatalogueService>;
  let mockIngestionService: jest.Mocked<RegulatoryIngestionService>;
  let mockDocumentStorage: jest.Mocked<RegulatoryDocumentStorageService>;
  let mockAuditLogs: jest.Mocked<AuditLogsService>;
  let mockObligationService: jest.Mocked<RegulatoryObligationService>;
  let mockApplicabilityService: jest.Mocked<RegulatoryApplicabilityService>;

  beforeEach(() => {
    mockPrisma = {
      regulatorySource: {
        findMany: jest.fn(),
        count: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      regulatoryPublication: {
        findMany: jest.fn(),
        count: jest.fn(),
        findUnique: jest.fn(),
      },
      manualSourceIntake: {
        create: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      regulatoryCatalogueEntry: {
        findUnique: jest.fn(),
      },
    };

    mockCatalogueService = {
      findAll: jest.fn(),
      findOne: jest.fn(),
      seedCatalogue: jest.fn(),
    } as any;

    mockIngestionService = {
      syncSource: jest.fn(),
    } as any;

    mockDocumentStorage = {
      saveDocument: jest.fn(),
      getFileStream: jest.fn(),
    } as any;

    mockAuditLogs = {
      log: jest.fn().mockResolvedValue({} as any),
    } as any;

    mockObligationService = {
      extractCandidateObligations: jest.fn(),
      listObligations: jest.fn(),
      getObligation: jest.fn(),
      reviewObligation: jest.fn(),
      createManualObligation: jest.fn(),
    } as any;

    mockApplicabilityService = {
      assessObligation: jest.fn(),
      assessAllForOrganization: jest.fn(),
      listAssessments: jest.fn(),
      getAssessment: jest.fn(),
      reviewOrOverrideAssessment: jest.fn(),
      getOrBuildProfile: jest.fn(),
      updateProfile: jest.fn(),
    } as any;

    controller = new RegulatoryIntelligenceController(
      mockPrisma,
      mockCatalogueService,
      mockIngestionService,
      mockDocumentStorage,
      mockAuditLogs,
      mockObligationService,
      mockApplicabilityService,
    );
  });

  describe('1. Regulatory Sources Endpoints', () => {
    it('should list configured regulatory sources with pagination', async () => {
      mockPrisma.regulatorySource.findMany.mockResolvedValueOnce([
        { id: 'src-1', regulatorCode: 'RBI', displayName: 'RBI Feed', isEnabled: true },
      ]);
      mockPrisma.regulatorySource.count.mockResolvedValueOnce(1);

      const res = await controller.listSources({ page: 1, limit: 10 });

      expect(res.items).toHaveLength(1);
      expect(res.total).toBe(1);
      expect(res.page).toBe(1);
      expect(res.limit).toBe(10);
      expect(res.totalPages).toBe(1);
    });

    it('should return a single source detail by ID', async () => {
      mockPrisma.regulatorySource.findUnique.mockResolvedValueOnce({
        id: 'src-1',
        regulatorCode: 'RBI',
        displayName: 'RBI Feed',
      });

      const res = await controller.getSource('src-1');
      expect(res.id).toBe('src-1');
      expect(res.regulatorCode).toBe('RBI');
    });

    it('should trigger authorized source sync with actor context', async () => {
      mockIngestionService.syncSource.mockResolvedValueOnce({
        sourceId: 'src-1',
        regulatorCode: 'RBI',
        success: true,
        totalDiscovered: 5,
        newPublicationsCount: 2,
        newVersionsCount: 1,
        unchangedCount: 2,
        diagnostics: {},
      });

      const res = await controller.triggerSourceSync('src-1', 'admin-user', 'org-123');
      expect(res.success).toBe(true);
      expect(mockIngestionService.syncSource).toHaveBeenCalledWith('src-1', {
        actorId: 'admin-user',
        organizationId: 'org-123',
      });
    });

    it('should toggle regulatory source enabled state with audit log', async () => {
      mockPrisma.regulatorySource.findUnique.mockResolvedValueOnce({
        id: 'src-1',
        isEnabled: true,
        regulatorCode: 'RBI',
      });
      mockPrisma.regulatorySource.update.mockResolvedValueOnce({
        id: 'src-1',
        isEnabled: false,
        regulatorCode: 'RBI',
      });

      const res = await controller.toggleSource('src-1', { isEnabled: false }, 'admin-user', 'org-123');
      expect(res.isEnabled).toBe(false);
      expect(mockAuditLogs.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'REGULATORY_SOURCE_TOGGLED',
          entityId: 'src-1',
          metadata: expect.objectContaining({
            previousState: true,
            newState: false,
          }),
        }),
      );
    });
  });

  describe('2. Multi-Region Coverage Catalogue Endpoints', () => {
    it('should query catalogue entries with filtering', async () => {
      mockCatalogueService.findAll.mockResolvedValueOnce({
        items: [{ id: 'cat-1', code: 'IN_DPDP_ACT_2023', displayName: 'DPDP Act' } as any],
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1,
      });

      const res = await controller.listCatalogue({ jurisdiction: 'INDIA' });
      expect(res.items).toHaveLength(1);
      expect(mockCatalogueService.findAll).toHaveBeenCalledWith({ jurisdiction: 'INDIA' });
    });

    it('should fetch single catalogue entry by ID or code', async () => {
      mockCatalogueService.findOne.mockResolvedValueOnce({
        id: 'cat-1',
        code: 'IN_DPDP_ACT_2023',
        displayName: 'DPDP Act',
      } as any);

      const res = await controller.getCatalogueEntry('IN_DPDP_ACT_2023');
      expect(res.code).toBe('IN_DPDP_ACT_2023');
    });
  });

  describe('3. Regulatory Publications Endpoints', () => {
    it('should list publications with search and pagination filters', async () => {
      mockPrisma.regulatoryPublication.findMany.mockResolvedValueOnce([
        { id: 'pub-1', title: 'FEMA Directions', publicationNumber: 'RBI/2026/01' },
      ]);
      mockPrisma.regulatoryPublication.count.mockResolvedValueOnce(1);

      const res = await controller.listPublications({ search: 'FEMA' });
      expect(res.items).toHaveLength(1);
      expect(res.total).toBe(1);
    });

    it('should return publication detail with full immutable version history', async () => {
      mockPrisma.regulatoryPublication.findUnique.mockResolvedValueOnce({
        id: 'pub-1',
        title: 'FEMA Directions',
        currentVersionNumber: 2,
        versions: [
          { versionNumber: 2, contentSha256: 'hash-v2', supersededAt: null },
          { versionNumber: 1, contentSha256: 'hash-v1', supersededAt: new Date() },
        ],
      });

      const res = await controller.getPublication('pub-1');
      expect(res.id).toBe('pub-1');
      expect(res.versions).toHaveLength(2);
      expect(res.versions[0].versionNumber).toBe(2);
      expect(res.versions[1].versionNumber).toBe(1);
    });
  });

  describe('4. Manual Source Intake Endpoints & Tenant Isolation (SEC-01)', () => {
    it('should create manual intake scoped to authenticated user organization and storage path', async () => {
      mockPrisma.regulatoryCatalogueEntry.findUnique.mockResolvedValueOnce({
        id: 'cat-iso',
        code: 'GLOBAL_ISO_27001',
      });

      mockDocumentStorage.saveDocument.mockResolvedValueOnce({
        storageKey: 'tenants/org-123/docs/uuid-iso.pdf',
        checksum: 'sha256-iso-doc',
        fileSize: 4096,
        mimeType: 'application/pdf',
        originalFileName: 'iso27001-guidance.pdf',
      });

      mockPrisma.manualSourceIntake.create.mockResolvedValueOnce({
        id: 'intake-1',
        organizationId: 'org-123',
        title: 'ISO 27001 Implementation Guide',
        checksum: 'sha256-iso-doc',
        storageKey: 'tenants/org-123/docs/uuid-iso.pdf',
        reviewStatus: ManualIntakeReviewStatus.PENDING_REVIEW,
      });

      const dummyBase64 = Buffer.from('PDF dummy content').toString('base64');

      const res = await controller.createManualIntake(
        {
          catalogueEntryId: 'cat-iso',
          title: 'ISO 27001 Implementation Guide',
          fileName: 'iso27001-guidance.pdf',
          fileContentBase64: dummyBase64,
          mimeType: 'application/pdf',
          provenanceNotes: 'Official copy downloaded from standard portal',
        },
        'analyst-1',
        'org-123',
      );

      expect(res.id).toBe('intake-1');
      expect(mockDocumentStorage.saveDocument).toHaveBeenCalledWith(
        expect.anything(),
        'org-123',
      );
      expect(mockPrisma.manualSourceIntake.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            organizationId: 'org-123',
            catalogueEntryId: 'cat-iso',
          }),
        }),
      );
      expect(mockAuditLogs.log).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: 'org-123',
          action: 'MANUAL_REGULATORY_INTAKE_CREATED',
          entityId: 'intake-1',
        }),
      );
    });

    it('should reject manual intake creation when organization context is missing', async () => {
      await expect(
        controller.createManualIntake(
          {
            catalogueEntryId: 'cat-iso',
            title: 'Test Doc',
            fileName: 'test.pdf',
            fileContentBase64: 'base64',
          },
          'analyst-1',
          '',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should list manual intakes scoped strictly to caller organization', async () => {
      mockPrisma.manualSourceIntake.findMany.mockResolvedValueOnce([
        { id: 'intake-1', organizationId: 'org-123', title: 'Doc 1' },
      ]);

      const res = await controller.listManualIntakes('org-123');
      expect(res).toHaveLength(1);
      expect(mockPrisma.manualSourceIntake.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: 'org-123',
          }),
        }),
      );
    });

    it('should retrieve single manual intake scoped to organization', async () => {
      mockPrisma.manualSourceIntake.findFirst.mockResolvedValueOnce({
        id: 'intake-1',
        organizationId: 'org-123',
        title: 'Doc 1',
      });

      const res = await controller.getManualIntake('intake-1', 'org-123');
      expect(res.id).toBe('intake-1');
      expect(mockPrisma.manualSourceIntake.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'intake-1', organizationId: 'org-123' },
        }),
      );
    });

    it('should throw NotFoundException on getManualIntake if intake belongs to another tenant', async () => {
      // Record not found in org-123
      mockPrisma.manualSourceIntake.findFirst.mockResolvedValueOnce(null);

      await expect(controller.getManualIntake('intake-belonging-to-org-456', 'org-123')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should stream manual intake file for authorized tenant', async () => {
      mockPrisma.manualSourceIntake.findFirst.mockResolvedValueOnce({
        id: 'intake-1',
        organizationId: 'org-123',
        storageKey: 'tenants/org-123/docs/doc.pdf',
        mimeType: 'application/pdf',
        fileName: 'doc.pdf',
      });

      const mockReadable = new Readable();
      mockReadable._read = () => {};
      mockReadable.push('mock file content');
      mockReadable.push(null);

      mockDocumentStorage.getFileStream.mockReturnValueOnce({
        stream: mockReadable as any,
        filePath: '/tmp/doc.pdf',
      });

      const mockRes = {
        set: jest.fn(),
      };

      const res = await controller.getManualIntakeFile('intake-1', 'org-123', mockRes);
      expect(res).toBeDefined();
      expect(mockRes.set).toHaveBeenCalledWith({
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename="doc.pdf"',
      });
      expect(mockDocumentStorage.getFileStream).toHaveBeenCalledWith(
        'tenants/org-123/docs/doc.pdf',
        'org-123',
      );
    });

    it('should prevent cross-tenant review when record belongs to a different organization (SEC-01)', async () => {
      // User from org-999 attempts to review intake-1 belonging to org-123
      mockPrisma.manualSourceIntake.findFirst.mockResolvedValueOnce(null);

      await expect(
        controller.reviewManualIntake(
          'intake-1',
          {
            status: ManualIntakeReviewStatus.ACCEPTED,
            reviewNotes: 'Unauthorized cross-tenant attempt',
          },
          'admin-user',
          'org-999',
        ),
      ).rejects.toThrow(NotFoundException);

      expect(mockPrisma.manualSourceIntake.update).not.toHaveBeenCalled();
    });

    it('should successfully review manual intake when tenant ownership is verified', async () => {
      mockPrisma.manualSourceIntake.findFirst.mockResolvedValueOnce({
        id: 'intake-1',
        organizationId: 'org-123',
        reviewStatus: ManualIntakeReviewStatus.PENDING_REVIEW,
      });

      mockPrisma.manualSourceIntake.update.mockResolvedValueOnce({
        id: 'intake-1',
        reviewStatus: ManualIntakeReviewStatus.ACCEPTED,
        reviewNotes: 'Verified official document',
      });

      const res = await controller.reviewManualIntake(
        'intake-1',
        {
          status: ManualIntakeReviewStatus.ACCEPTED,
          reviewNotes: 'Verified official document',
        },
        'admin-user',
        'org-123',
      );

      expect(res.reviewStatus).toBe(ManualIntakeReviewStatus.ACCEPTED);
      expect(mockAuditLogs.log).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: 'org-123',
          action: 'MANUAL_REGULATORY_INTAKE_REVIEWED',
        }),
      );
    });
  });

  describe('5. Regulatory Obligations Endpoints (Phase 3)', () => {
    it('should trigger obligation extraction for a publication', async () => {
      mockObligationService.extractCandidateObligations.mockResolvedValueOnce({
        publicationId: 'pub-100',
        totalCandidatesExtracted: 3,
        newlyCreatedCount: 3,
        existingRetainedCount: 0,
      });

      const res = await controller.extractPublicationObligations(
        'pub-100',
        { forceReextract: false },
        'analyst-1',
        'org-123',
      );

      expect(res.publicationId).toBe('pub-100');
      expect(res.totalCandidatesExtracted).toBe(3);
      expect(mockObligationService.extractCandidateObligations).toHaveBeenCalledWith(
        'pub-100',
        'analyst-1',
        'org-123',
        false,
      );
    });

    it('should list obligations with query filters', async () => {
      mockObligationService.listObligations.mockResolvedValueOnce({
        items: [{ id: 'ob-1', title: 'Data Encryption Mandate' } as any],
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1,
      });

      const res = await controller.listObligations(
        { status: RegulatoryObligationStatus.CANDIDATE },
        'org-123',
      );

      expect(res.items).toHaveLength(1);
      expect(mockObligationService.listObligations).toHaveBeenCalledWith(
        { status: RegulatoryObligationStatus.CANDIDATE },
        'org-123',
      );
    });

    it('should get a single obligation by ID', async () => {
      mockObligationService.getObligation.mockResolvedValueOnce({
        id: 'ob-1',
        title: 'Data Encryption Mandate',
      } as any);

      const res = await controller.getObligation('ob-1', 'org-123');
      expect(res.id).toBe('ob-1');
      expect(mockObligationService.getObligation).toHaveBeenCalledWith('ob-1', 'org-123');
    });

    it('should submit human review for an obligation', async () => {
      mockObligationService.reviewObligation.mockResolvedValueOnce({
        id: 'ob-1',
        status: RegulatoryObligationStatus.VERIFIED,
        isHumanVerified: true,
      } as any);

      const res = await controller.reviewObligation(
        'ob-1',
        {
          status: RegulatoryObligationStatus.VERIFIED,
          reviewNotes: 'Verified against authoritative section',
        },
        'analyst-1',
        'org-123',
      );

      expect(res.status).toBe(RegulatoryObligationStatus.VERIFIED);
      expect(mockObligationService.reviewObligation).toHaveBeenCalledWith(
        'ob-1',
        expect.objectContaining({ status: RegulatoryObligationStatus.VERIFIED }),
        'analyst-1',
        'org-123',
      );
    });

    it('should create manual obligation', async () => {
      mockObligationService.createManualObligation.mockResolvedValueOnce({
        id: 'ob-man-1',
        title: 'Manual Requirement',
        isHumanVerified: true,
      } as any);

      const res = await controller.createManualObligation(
        {
          publicationId: 'pub-100',
          title: 'Manual Requirement',
          obligationWording: 'Must audit backups quarterly.',
        },
        'admin-1',
        'org-123',
      );

      expect(res.id).toBe('ob-man-1');
      expect(mockObligationService.createManualObligation).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Manual Requirement' }),
        'admin-1',
        'org-123',
      );
    });
  });

  describe('6. Regulatory Applicability Endpoints (Phase 4)', () => {
    it('should trigger applicability assessment for a specific obligation', async () => {
      mockApplicabilityService.assessObligation.mockResolvedValueOnce({
        id: 'asm-1',
        outcome: ApplicabilityOutcome.APPLICABLE,
      } as any);

      const res = await controller.triggerApplicabilityAssessment(
        { obligationId: 'ob-1', forceReassess: false },
        'analyst-1',
        'org-123',
      );

      expect((res as any)?.id).toBe('asm-1');
      expect(mockApplicabilityService.assessObligation).toHaveBeenCalledWith(
        'org-123',
        'ob-1',
        'analyst-1',
        false,
      );
    });

    it('should trigger batch assessment for all obligations in organization', async () => {
      mockApplicabilityService.assessAllForOrganization.mockResolvedValueOnce({
        organizationId: 'org-123',
        totalEvaluated: 10,
        applicableCount: 4,
        notApplicableCount: 3,
        requiresReviewCount: 2,
        insufficientInfoCount: 1,
      });

      const res = await controller.triggerApplicabilityAssessment(
        { forceReassess: true },
        'analyst-1',
        'org-123',
      );

      expect((res as any)?.totalEvaluated).toBe(10);
      expect(mockApplicabilityService.assessAllForOrganization).toHaveBeenCalledWith(
        'org-123',
        'analyst-1',
        undefined,
        true,
      );
    });

    it('should reject assessment trigger when organization context is missing', async () => {
      await expect(
        controller.triggerApplicabilityAssessment({}, 'analyst-1', ''),
      ).rejects.toThrow(BadRequestException);
    });

    it('should list applicability assessments scoped to organization', async () => {
      mockApplicabilityService.listAssessments.mockResolvedValueOnce({
        items: [{ id: 'asm-1', outcome: ApplicabilityOutcome.APPLICABLE } as any],
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1,
      });

      const res = await controller.listApplicabilityAssessments(
        { outcome: ApplicabilityOutcome.APPLICABLE },
        'org-123',
      );

      expect(res.items).toHaveLength(1);
      expect(mockApplicabilityService.listAssessments).toHaveBeenCalledWith(
        'org-123',
        { outcome: ApplicabilityOutcome.APPLICABLE },
      );
    });

    it('should retrieve single assessment by ID', async () => {
      mockApplicabilityService.getAssessment.mockResolvedValueOnce({
        id: 'asm-1',
        outcome: ApplicabilityOutcome.APPLICABLE,
      } as any);

      const res = await controller.getApplicabilityAssessment('asm-1', 'org-123');
      expect(res.id).toBe('asm-1');
      expect(mockApplicabilityService.getAssessment).toHaveBeenCalledWith('asm-1', 'org-123');
    });

    it('should review or override applicability assessment', async () => {
      mockApplicabilityService.reviewOrOverrideAssessment.mockResolvedValueOnce({
        id: 'asm-1',
        outcome: ApplicabilityOutcome.NOT_APPLICABLE,
        isHumanReviewed: true,
      } as any);

      const res = await controller.reviewApplicabilityAssessment(
        'asm-1',
        {
          outcome: ApplicabilityOutcome.NOT_APPLICABLE,
          reviewNotes: 'Entity is a holding company exempt from direct banking direction.',
        },
        'analyst-1',
        'org-123',
      );

      expect(res.outcome).toBe(ApplicabilityOutcome.NOT_APPLICABLE);
      expect(mockApplicabilityService.reviewOrOverrideAssessment).toHaveBeenCalledWith(
        'asm-1',
        'org-123',
        expect.objectContaining({ outcome: ApplicabilityOutcome.NOT_APPLICABLE }),
        'analyst-1',
      );
    });
  });

  describe('7. Organization Compliance Profile Endpoints (Phase 4)', () => {
    it('should get organization compliance profile', async () => {
      mockApplicabilityService.getOrBuildProfile.mockResolvedValueOnce({
        organizationId: 'org-123',
        industrySector: 'BANKING',
      } as any);

      const res = await controller.getOrganizationProfile('org-123');
      expect(res.organizationId).toBe('org-123');
      expect(mockApplicabilityService.getOrBuildProfile).toHaveBeenCalledWith('org-123');
    });

    it('should update organization compliance profile', async () => {
      mockApplicabilityService.updateProfile.mockResolvedValueOnce({
        id: 'cp-1',
        organizationId: 'org-123',
        industrySector: 'FINANCIAL_SERVICES',
      } as any);

      const res = await controller.updateOrganizationProfile(
        {
          industrySector: 'FINANCIAL_SERVICES',
          operatingJurisdictions: ['INDIA'],
        },
        'admin-1',
        'org-123',
      );

      expect(res.industrySector).toBe('FINANCIAL_SERVICES');
      expect(mockApplicabilityService.updateProfile).toHaveBeenCalledWith(
        'org-123',
        expect.objectContaining({ industrySector: 'FINANCIAL_SERVICES' }),
        'admin-1',
      );
    });
  });
});
