import { RegulatoryObligationService } from './regulatory-obligation.service';
import { ObligationExtractorService } from './obligation-extractor.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogsService } from '../../audit-logs/audit-logs.service';
import {
  RegulatoryObligationStatus,
  ObligationExtractionMethod,
  ObligationConfidence,
} from '@prisma/client';
import { NotFoundException } from '@nestjs/common';

describe('RegulatoryObligationService (Lifecycle, Idempotency & Tenant Scoping)', () => {
  let service: RegulatoryObligationService;
  let extractor: ObligationExtractorService;
  let mockPrisma: any;
  let mockAuditLogs: jest.Mocked<AuditLogsService>;

  const mockPublication = {
    id: 'pub-100',
    sourceId: 'src-1',
    catalogueEntryId: 'cat-rbi',
    title: 'RBI Master Direction on Cyber Resilience',
    publicationNumber: 'RBI/2026/01',
    canonicalUrl: 'https://www.rbi.org.in/item/100',
    currentDocumentMetadata: {
      description: 'Banks shall implement network segmentation.',
    },
    versions: [{ id: 'ver-1', versionNumber: 1 }],
    manualIntakes: [],
  };

  beforeEach(() => {
    mockPrisma = {
      regulatoryPublication: {
        findUnique: jest.fn(),
      },
      regulatoryObligation: {
        findUnique: jest.fn(),
        create: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        update: jest.fn(),
      },
    };

    mockAuditLogs = {
      log: jest.fn().mockResolvedValue({} as any),
    } as any;

    extractor = new ObligationExtractorService();
    service = new RegulatoryObligationService(mockPrisma, extractor, mockAuditLogs);
  });

  describe('1. Candidate Obligation Extraction & Idempotency', () => {
    it('should extract and persist candidate obligations with status CANDIDATE', async () => {
      mockPrisma.regulatoryPublication.findUnique.mockResolvedValueOnce(mockPublication);
      mockPrisma.regulatoryObligation.findUnique.mockResolvedValue(null); // No previous candidates

      const res = await service.extractCandidateObligations('pub-100', 'analyst-1');

      expect(res.publicationId).toBe('pub-100');
      expect(res.totalCandidatesExtracted).toBeGreaterThan(0);
      expect(res.newlyCreatedCount).toBe(res.totalCandidatesExtracted);
      expect(res.existingRetainedCount).toBe(0);

      expect(mockPrisma.regulatoryObligation.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            publicationId: 'pub-100',
            status: RegulatoryObligationStatus.CANDIDATE,
            isHumanVerified: false,
            extractionMethod: ObligationExtractionMethod.RULE_BASED,
          }),
        }),
      );

      expect(mockAuditLogs.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'REGULATORY_OBLIGATIONS_EXTRACTED',
          entityId: 'pub-100',
        }),
      );
    });

    it('should operate idempotently and retain existing records on repeated extraction runs', async () => {
      mockPrisma.regulatoryPublication.findUnique.mockResolvedValueOnce(mockPublication);
      // Simulate that candidates already exist in the database
      mockPrisma.regulatoryObligation.findUnique.mockResolvedValue({
        id: 'existing-ob-1',
        fingerprint: 'mock-fp',
      });

      const res = await service.extractCandidateObligations('pub-100', 'analyst-1');

      expect(res.newlyCreatedCount).toBe(0);
      expect(res.existingRetainedCount).toBe(res.totalCandidatesExtracted);
      expect(mockPrisma.regulatoryObligation.create).not.toHaveBeenCalled();
    });

    it('should reject extraction if publication belongs to a different tenant manual intake', async () => {
      mockPrisma.regulatoryPublication.findUnique.mockResolvedValueOnce({
        ...mockPublication,
        manualIntakes: [{ id: 'intake-1', organizationId: 'org-tenant-A' }],
      });

      // User from org-tenant-B attempts to extract obligations
      await expect(
        service.extractCandidateObligations('pub-100', 'user-b', 'org-tenant-B'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('2. Query & Multi-Tenant Authorization', () => {
    it('should query obligations scoped to global records and caller organization', async () => {
      mockPrisma.regulatoryObligation.findMany.mockResolvedValueOnce([
        { id: 'ob-1', title: 'Global Requirement', organizationId: null },
        { id: 'ob-2', title: 'Tenant Requirement', organizationId: 'org-123' },
      ]);
      mockPrisma.regulatoryObligation.count.mockResolvedValueOnce(2);

      const res = await service.listObligations({ page: 1, limit: 20 }, 'org-123');

      expect(res.items).toHaveLength(2);
      expect(mockPrisma.regulatoryObligation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: [{ organizationId: null }, { organizationId: 'org-123' }],
          }),
        }),
      );
    });

    it('should retrieve single obligation and prevent cross-tenant disclosure', async () => {
      mockPrisma.regulatoryObligation.findUnique.mockResolvedValueOnce({
        id: 'ob-cross',
        organizationId: 'org-foreign',
        title: 'Secret Tenant Policy Requirement',
      });

      await expect(service.getObligation('ob-cross', 'org-my-tenant')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('3. Human Review & Verification Workflow', () => {
    it('should transition candidate to VERIFIED and stamp human reviewer details', async () => {
      mockPrisma.regulatoryObligation.findUnique.mockResolvedValueOnce({
        id: 'ob-1',
        publicationId: 'pub-100',
        title: 'Candidate Obligation',
        obligationWording: 'Banks shall implement segmentation.',
        status: RegulatoryObligationStatus.CANDIDATE,
        isHumanVerified: false,
        organizationId: null,
      });

      mockPrisma.regulatoryObligation.update.mockResolvedValueOnce({
        id: 'ob-1',
        status: RegulatoryObligationStatus.VERIFIED,
        isHumanVerified: true,
        verifiedById: 'compliance-officer-1',
        reviewNotes: 'Verified against official Master Direction section 4.2',
      });

      const updated = await service.reviewObligation(
        'ob-1',
        {
          status: RegulatoryObligationStatus.VERIFIED,
          reviewNotes: 'Verified against official Master Direction section 4.2',
          correctedAction: 'Implement physical and logical network segmentation for payment core',
        },
        'compliance-officer-1',
      );

      expect(updated.status).toBe(RegulatoryObligationStatus.VERIFIED);
      expect(updated.isHumanVerified).toBe(true);

      expect(mockPrisma.regulatoryObligation.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'ob-1' },
          data: expect.objectContaining({
            status: RegulatoryObligationStatus.VERIFIED,
            isHumanVerified: true,
            verifiedById: 'compliance-officer-1',
            requiredAction: 'Implement physical and logical network segmentation for payment core',
          }),
        }),
      );

      expect(mockAuditLogs.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'REGULATORY_OBLIGATION_REVIEWED',
          entityId: 'ob-1',
        }),
      );
    });

    it('should allow marking an obligation as REJECTED without marking human verified', async () => {
      mockPrisma.regulatoryObligation.findUnique.mockResolvedValueOnce({
        id: 'ob-noise',
        status: RegulatoryObligationStatus.CANDIDATE,
        isHumanVerified: false,
        organizationId: null,
      });

      mockPrisma.regulatoryObligation.update.mockResolvedValueOnce({
        id: 'ob-noise',
        status: RegulatoryObligationStatus.REJECTED,
        isHumanVerified: false,
        reviewNotes: 'Informational preamble only; no actionable mandate',
      });

      const updated = await service.reviewObligation(
        'ob-noise',
        {
          status: RegulatoryObligationStatus.REJECTED,
          reviewNotes: 'Informational preamble only; no actionable mandate',
        },
        'analyst-1',
      );

      expect(updated.status).toBe(RegulatoryObligationStatus.REJECTED);
      expect(updated.isHumanVerified).toBe(false);
    });
  });

  describe('4. Manual Obligation Entry', () => {
    it('should create authenticated manual obligation with immediate VERIFIED status', async () => {
      mockPrisma.regulatoryPublication.findUnique.mockResolvedValueOnce(mockPublication);
      mockPrisma.regulatoryObligation.create.mockResolvedValueOnce({
        id: 'ob-man-1',
        title: 'Manual Requirement Entry',
        extractionMethod: ObligationExtractionMethod.MANUAL_ENTRY,
        status: RegulatoryObligationStatus.VERIFIED,
        isHumanVerified: true,
      });

      const created = await service.createManualObligation(
        {
          publicationId: 'pub-100',
          title: 'Manual Requirement Entry',
          obligationWording: 'Regulated entities must conduct bi-annual tabletop exercises.',
          requiredAction: 'Conduct bi-annual tabletop exercises',
          affectedActor: 'Regulated Entities',
        },
        'ciso-1',
        'org-123',
      );

      expect(created.id).toBe('ob-man-1');
      expect(mockPrisma.regulatoryObligation.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            organizationId: 'org-123',
            extractionMethod: ObligationExtractionMethod.MANUAL_ENTRY,
            status: RegulatoryObligationStatus.VERIFIED,
            isHumanVerified: true,
            verifiedById: 'ciso-1',
          }),
        }),
      );
    });
  });
});
