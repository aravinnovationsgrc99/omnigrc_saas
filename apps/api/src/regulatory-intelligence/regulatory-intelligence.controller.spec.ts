import { RegulatoryIntelligenceController } from './regulatory-intelligence.controller';
import { PrismaService } from '../prisma/prisma.service';
import { RegulatoryCatalogueService } from './catalogue/regulatory-catalogue.service';
import { RegulatoryIngestionService } from './regulatory-ingestion.service';
import { RegulatoryDocumentStorageService } from './storage/regulatory-document-storage.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { ManualIntakeReviewStatus } from '@prisma/client';

describe('RegulatoryIntelligenceController (Internal API)', () => {
  let controller: RegulatoryIntelligenceController;
  let mockPrisma: any;
  let mockCatalogueService: jest.Mocked<RegulatoryCatalogueService>;
  let mockIngestionService: jest.Mocked<RegulatoryIngestionService>;
  let mockDocumentStorage: jest.Mocked<RegulatoryDocumentStorageService>;
  let mockAuditLogs: jest.Mocked<AuditLogsService>;

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
    } as any;

    mockAuditLogs = {
      log: jest.fn().mockResolvedValue({} as any),
    } as any;

    controller = new RegulatoryIntelligenceController(
      mockPrisma,
      mockCatalogueService,
      mockIngestionService,
      mockDocumentStorage,
      mockAuditLogs,
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
        newVersionsCount: 0,
        unchangedCount: 3,
        diagnostics: {},
      });

      const res = await controller.triggerSourceSync('src-1', 'admin-user', 'org-123');

      expect(mockIngestionService.syncSource).toHaveBeenCalledWith('src-1', {
        actorId: 'admin-user',
        organizationId: 'org-123',
      });
      expect(res.success).toBe(true);
      expect(res.newPublicationsCount).toBe(2);
    });

    it('should toggle source enabled status and emit audit log', async () => {
      mockPrisma.regulatorySource.findUnique.mockResolvedValueOnce({
        id: 'src-1',
        isEnabled: true,
        regulatorCode: 'RBI',
      });
      mockPrisma.regulatorySource.update.mockResolvedValueOnce({
        id: 'src-1',
        isEnabled: false,
      });

      const res = await controller.toggleSource('src-1', { isEnabled: false }, 'admin-user', 'org-123');

      expect(res.isEnabled).toBe(false);
      expect(mockAuditLogs.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'REGULATORY_SOURCE_TOGGLED',
          entityId: 'src-1',
        }),
      );
    });
  });

  describe('2. Coverage Catalogue Endpoints', () => {
    it('should delegate catalogue query to RegulatoryCatalogueService', async () => {
      mockCatalogueService.findAll.mockResolvedValueOnce({
        items: [{ code: 'IN_DPDP_ACT_2023', displayName: 'DPDP Act 2023' }] as any,
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1,
      });

      const res = await controller.listCatalogue({ jurisdiction: 'INDIA' });

      expect(mockCatalogueService.findAll).toHaveBeenCalledWith({ jurisdiction: 'INDIA' });
      expect(res.items).toHaveLength(1);
    });

    it('should delegate catalogue detail retrieval to RegulatoryCatalogueService', async () => {
      mockCatalogueService.findOne.mockResolvedValueOnce({
        id: 'cat-1',
        code: 'IN_RBI_CYBER_RESILIENCE',
        displayName: 'RBI IT Governance',
      } as any);

      const res = await controller.getCatalogueEntry('IN_RBI_CYBER_RESILIENCE');

      expect(mockCatalogueService.findOne).toHaveBeenCalledWith('IN_RBI_CYBER_RESILIENCE');
      expect(res.code).toBe('IN_RBI_CYBER_RESILIENCE');
    });
  });

  describe('3. Publications & Version History Endpoints', () => {
    it('should list publications with pagination and search filtering', async () => {
      mockPrisma.regulatoryPublication.findMany.mockResolvedValueOnce([
        { id: 'pub-1', title: 'Delegation of Powers', publicationNumber: 'RBI/2026/1' },
      ]);
      mockPrisma.regulatoryPublication.count.mockResolvedValueOnce(1);

      const res = await controller.listPublications({ search: 'Powers', page: 1, limit: 10 });

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

  describe('4. Manual Source Intake Endpoints', () => {
    it('should create manual intake with base64 document, provenance, and audit log', async () => {
      mockPrisma.regulatoryCatalogueEntry.findUnique.mockResolvedValueOnce({
        id: 'cat-iso',
        code: 'GLOBAL_ISO_27001',
      });

      mockDocumentStorage.saveDocument.mockResolvedValueOnce({
        storageKey: 'docs/iso27001-guidance.pdf',
        checksum: 'sha256-iso-doc',
        fileSize: 4096,
        mimeType: 'application/pdf',
        originalFileName: 'iso27001-guidance.pdf',
      });

      mockPrisma.manualSourceIntake.create.mockResolvedValueOnce({
        id: 'intake-1',
        title: 'ISO 27001 Implementation Guide',
        checksum: 'sha256-iso-doc',
        storageKey: 'docs/iso27001-guidance.pdf',
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
      expect(res.reviewStatus).toBe(ManualIntakeReviewStatus.PENDING_REVIEW);
      expect(mockAuditLogs.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'MANUAL_REGULATORY_INTAKE_CREATED',
          entityId: 'intake-1',
        }),
      );
    });

    it('should review and update manual intake status', async () => {
      mockPrisma.manualSourceIntake.findUnique.mockResolvedValueOnce({
        id: 'intake-1',
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
          action: 'MANUAL_REGULATORY_INTAKE_REVIEWED',
        }),
      );
    });
  });
});
