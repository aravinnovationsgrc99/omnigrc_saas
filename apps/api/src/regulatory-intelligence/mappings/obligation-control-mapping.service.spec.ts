import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import {
  ApplicabilityOutcome,
  MappingStatus,
  ObligationConfidence,
  ObligationMappingMethod,
  RegulatoryObligationStatus,
} from '@prisma/client';
import { ObligationControlMappingService } from './obligation-control-mapping.service';
import { MappingSuggestionEngineService } from './mapping-suggestion-engine.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogsService } from '../../audit-logs/audit-logs.service';

describe('ObligationControlMappingService (Lifecycle, Tenancy & Audit)', () => {
  let service: ObligationControlMappingService;
  let mockPrisma: any;
  let mockAuditLogs: any;
  let mockSuggestionEngine: any;

  const mockOrgId = 'org-tenant-1';
  const mockOtherOrgId = 'org-tenant-2';
  const mockActorId = 'analyst-1';

  const mockControl = {
    id: 'ctrl-1',
    organizationId: mockOrgId,
    name: 'Network Boundary Segmentation',
    description: 'Isolates core networks.',
    category: 'NETWORK_SECURITY',
    deletedAt: null,
  };

  const mockObligation = {
    id: 'ob-1',
    organizationId: null, // Global official obligation
    publicationId: 'pub-rbi-1',
    publicationVersionId: 'pub-v1',
    title: 'Network Switch Isolation',
    obligationWording: 'Commercial Banks shall isolate switches.',
    affectedActor: 'Commercial Banks',
    sourceExcerpt: 'Section 4: Switch isolation mandatory.',
    status: RegulatoryObligationStatus.VERIFIED,
    isHumanVerified: true,
    publication: {
      id: 'pub-rbi-1',
      currentVersionNumber: 1,
    },
  };

  const mockApplicabilityAssessment = {
    id: 'asm-1',
    organizationId: mockOrgId,
    obligationId: 'ob-1',
    outcome: ApplicabilityOutcome.APPLICABLE,
  };

  beforeEach(async () => {
    mockPrisma = {
      control: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
      },
      regulatoryObligation: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
      },
      regulatoryPublicationVersion: {
        findFirst: jest.fn(),
      },
      regulatoryApplicabilityAssessment: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
      },
      regulatoryObligationControlMapping: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        count: jest.fn(),
      },
      regulatoryObligationControlMappingHistory: {
        create: jest.fn(),
      },
      $transaction: jest.fn(async (cb) => cb(mockPrisma)),
    };

    mockAuditLogs = {
      log: jest.fn().mockResolvedValue({} as any),
    };

    mockSuggestionEngine = {
      suggestMappingsForObligation: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ObligationControlMappingService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditLogsService, useValue: mockAuditLogs },
        { provide: MappingSuggestionEngineService, useValue: mockSuggestionEngine },
      ],
    }).compile();

    service = module.get<ObligationControlMappingService>(
      ObligationControlMappingService,
    );
  });

  describe('1. Create Mapping & Eligibility Validation', () => {
    it('should create confirmed mapping (APPROVED) when obligation is human-verified and assessed as APPLICABLE', async () => {
      mockPrisma.control.findFirst.mockResolvedValueOnce(mockControl);
      mockPrisma.regulatoryObligation.findUnique.mockResolvedValueOnce(mockObligation);
      mockPrisma.regulatoryPublicationVersion.findFirst.mockResolvedValueOnce({ id: 'pub-v1' });
      mockPrisma.regulatoryApplicabilityAssessment.findUnique.mockResolvedValueOnce(
        mockApplicabilityAssessment,
      );
      mockPrisma.regulatoryObligationControlMapping.findUnique.mockResolvedValueOnce(null);

      mockPrisma.regulatoryObligationControlMapping.create.mockResolvedValueOnce({
        id: 'map-1',
        organizationId: mockOrgId,
        obligationId: 'ob-1',
        controlId: 'ctrl-1',
        status: MappingStatus.APPROVED,
        mappingMethod: ObligationMappingMethod.HUMAN_AUTHORED,
        rationale: 'Control enforces network boundary segmentation matching RBI directive.',
      });

      const res = await service.createMapping(
        mockOrgId,
        {
          obligationId: 'ob-1',
          controlId: 'ctrl-1',
          rationale: 'Control enforces network boundary segmentation matching RBI directive.',
        },
        mockActorId,
      );

      expect(res.status).toBe(MappingStatus.APPROVED);
      expect(mockPrisma.regulatoryObligationControlMapping.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            organizationId: mockOrgId,
            obligationId: 'ob-1',
            controlId: 'ctrl-1',
            status: MappingStatus.APPROVED,
          }),
        }),
      );
      expect(mockPrisma.regulatoryObligationControlMappingHistory.create).toHaveBeenCalled();
      expect(mockAuditLogs.log).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: mockOrgId,
          action: 'REGULATORY_OBLIGATION_CONTROL_MAPPED',
        }),
      );
    });

    it('should force mapping into SUGGESTED state when obligation is not verified or not assessed as APPLICABLE', async () => {
      const unverifiedObligation = {
        ...mockObligation,
        status: RegulatoryObligationStatus.CANDIDATE,
        isHumanVerified: false,
      };

      mockPrisma.control.findFirst.mockResolvedValueOnce(mockControl);
      mockPrisma.regulatoryObligation.findUnique.mockResolvedValueOnce(unverifiedObligation);
      mockPrisma.regulatoryPublicationVersion.findFirst.mockResolvedValueOnce({ id: 'pub-v1' });
      mockPrisma.regulatoryApplicabilityAssessment.findUnique.mockResolvedValueOnce(null); // No assessment
      mockPrisma.regulatoryObligationControlMapping.findUnique.mockResolvedValueOnce(null);

      mockPrisma.regulatoryObligationControlMapping.create.mockResolvedValueOnce({
        id: 'map-2',
        organizationId: mockOrgId,
        obligationId: 'ob-1',
        controlId: 'ctrl-1',
        status: MappingStatus.SUGGESTED,
        mappingMethod: ObligationMappingMethod.HUMAN_AUTHORED,
      });

      const res = await service.createMapping(
        mockOrgId,
        {
          obligationId: 'ob-1',
          controlId: 'ctrl-1',
          rationale: 'Proposed alignment pending verification.',
        },
        mockActorId,
      );

      expect(res.status).toBe(MappingStatus.SUGGESTED);
      expect(mockPrisma.regulatoryObligationControlMapping.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: MappingStatus.SUGGESTED,
          }),
        }),
      );
    });

    it('should prevent cross-tenant mapping when obligation belongs to another organization (SEC-01)', async () => {
      const privateOtherTenantObligation = {
        ...mockObligation,
        organizationId: mockOtherOrgId, // Belongs to different tenant
      };

      mockPrisma.control.findFirst.mockResolvedValueOnce(mockControl);
      mockPrisma.regulatoryObligation.findUnique.mockResolvedValueOnce(privateOtherTenantObligation);

      await expect(
        service.createMapping(
          mockOrgId,
          {
            obligationId: 'ob-1',
            controlId: 'ctrl-1',
            rationale: 'Attempted cross-tenant mapping.',
          },
          mockActorId,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should reject mapping when control does not exist in organization', async () => {
      mockPrisma.control.findFirst.mockResolvedValueOnce(null); // Control not found

      await expect(
        service.createMapping(
          mockOrgId,
          {
            obligationId: 'ob-1',
            controlId: 'ctrl-missing',
            rationale: 'Non-existent control.',
          },
          mockActorId,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('should handle duplicate mapping idempotently by returning existing active mapping', async () => {
      const existingMapping = {
        id: 'map-existing',
        organizationId: mockOrgId,
        obligationId: 'ob-1',
        controlId: 'ctrl-1',
        status: MappingStatus.APPROVED,
      };

      mockPrisma.control.findFirst.mockResolvedValueOnce(mockControl);
      mockPrisma.regulatoryObligation.findUnique.mockResolvedValueOnce(mockObligation);
      mockPrisma.regulatoryPublicationVersion.findFirst.mockResolvedValueOnce({ id: 'pub-v1' });
      mockPrisma.regulatoryApplicabilityAssessment.findUnique.mockResolvedValueOnce(
        mockApplicabilityAssessment,
      );
      mockPrisma.regulatoryObligationControlMapping.findUnique.mockResolvedValueOnce(
        existingMapping,
      );

      const res = await service.createMapping(
        mockOrgId,
        {
          obligationId: 'ob-1',
          controlId: 'ctrl-1',
          rationale: 'Re-submitting existing mapping.',
        },
        mockActorId,
      );

      expect(res.id).toBe('map-existing');
      expect(mockPrisma.regulatoryObligationControlMapping.create).not.toHaveBeenCalled();
    });

    it('should support one-to-many mapping: mapping one obligation to multiple controls', async () => {
      const secondControl = { ...mockControl, id: 'ctrl-2', name: 'Firewall Policy Management' };

      // First mapping
      mockPrisma.control.findFirst.mockResolvedValueOnce(mockControl);
      mockPrisma.regulatoryObligation.findUnique.mockResolvedValueOnce(mockObligation);
      mockPrisma.regulatoryPublicationVersion.findFirst.mockResolvedValueOnce({ id: 'pub-v1' });
      mockPrisma.regulatoryApplicabilityAssessment.findUnique.mockResolvedValueOnce(
        mockApplicabilityAssessment,
      );
      mockPrisma.regulatoryObligationControlMapping.findUnique.mockResolvedValueOnce(null);
      mockPrisma.regulatoryObligationControlMapping.create.mockResolvedValueOnce({
        id: 'map-ob1-ctrl1',
        obligationId: 'ob-1',
        controlId: 'ctrl-1',
      });

      const res1 = await service.createMapping(
        mockOrgId,
        { obligationId: 'ob-1', controlId: 'ctrl-1', rationale: 'Primary segmentation control.' },
        mockActorId,
      );

      // Second mapping for same obligation to different control
      mockPrisma.control.findFirst.mockResolvedValueOnce(secondControl);
      mockPrisma.regulatoryObligation.findUnique.mockResolvedValueOnce(mockObligation);
      mockPrisma.regulatoryPublicationVersion.findFirst.mockResolvedValueOnce({ id: 'pub-v1' });
      mockPrisma.regulatoryApplicabilityAssessment.findUnique.mockResolvedValueOnce(
        mockApplicabilityAssessment,
      );
      mockPrisma.regulatoryObligationControlMapping.findUnique.mockResolvedValueOnce(null);
      mockPrisma.regulatoryObligationControlMapping.create.mockResolvedValueOnce({
        id: 'map-ob1-ctrl2',
        obligationId: 'ob-1',
        controlId: 'ctrl-2',
      });

      const res2 = await service.createMapping(
        mockOrgId,
        { obligationId: 'ob-1', controlId: 'ctrl-2', rationale: 'Secondary firewall control.' },
        mockActorId,
      );

      expect(res1.id).toBe('map-ob1-ctrl1');
      expect(res2.id).toBe('map-ob1-ctrl2');
    });

    it('should support many-to-many mapping: mapping multiple obligations to one control', async () => {
      const secondObligation = {
        ...mockObligation,
        id: 'ob-2',
        title: 'Network Perimeter Access Rules',
      };

      mockPrisma.control.findFirst.mockResolvedValueOnce(mockControl);
      mockPrisma.regulatoryObligation.findUnique.mockResolvedValueOnce(secondObligation);
      mockPrisma.regulatoryPublicationVersion.findFirst.mockResolvedValueOnce({ id: 'pub-v1' });
      mockPrisma.regulatoryApplicabilityAssessment.findUnique.mockResolvedValueOnce(
        mockApplicabilityAssessment,
      );
      mockPrisma.regulatoryObligationControlMapping.findUnique.mockResolvedValueOnce(null);
      mockPrisma.regulatoryObligationControlMapping.create.mockResolvedValueOnce({
        id: 'map-ob2-ctrl1',
        obligationId: 'ob-2',
        controlId: 'ctrl-1',
      });

      const res = await service.createMapping(
        mockOrgId,
        { obligationId: 'ob-2', controlId: 'ctrl-1', rationale: 'Same control covers second obligation.' },
        mockActorId,
      );

      expect(res.id).toBe('map-ob2-ctrl1');
    });
  });

  describe('2. Mapping Suggestions Engine Integration', () => {
    it('should generate suggested mappings for applicable obligations using deterministic rules', async () => {
      mockPrisma.regulatoryApplicabilityAssessment.findMany.mockResolvedValueOnce([
        { obligationId: 'ob-1' },
      ]);
      mockPrisma.regulatoryObligation.findMany.mockResolvedValueOnce([mockObligation]);
      mockPrisma.control.findMany.mockResolvedValueOnce([
        { ...mockControl, mappings: [] },
      ]);

      mockSuggestionEngine.suggestMappingsForObligation.mockReturnValueOnce([
        {
          controlId: 'ctrl-1',
          frameworkReferenceId: null,
          status: MappingStatus.SUGGESTED,
          mappingMethod: ObligationMappingMethod.RULE_SUGGESTED,
          confidence: ObligationConfidence.HIGH,
          rationale: 'Network segmentation alignment.',
          ruleMatched: 'NETWORK_SEGMENTATION_ALIGNMENT',
        },
      ]);

      mockPrisma.regulatoryObligationControlMapping.findUnique.mockResolvedValueOnce(null);
      mockPrisma.regulatoryObligationControlMapping.create.mockResolvedValueOnce({
        id: 'sug-1',
      });

      const res = await service.suggestMappings(mockOrgId, {}, mockActorId);

      expect(res.suggestionsCreated).toBe(1);
      expect(mockPrisma.regulatoryObligationControlMapping.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: MappingStatus.SUGGESTED,
            mappingMethod: ObligationMappingMethod.RULE_SUGGESTED,
            ruleMatched: 'NETWORK_SEGMENTATION_ALIGNMENT',
          }),
        }),
      );
      expect(mockAuditLogs.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'REGULATORY_OBLIGATION_MAPPINGS_SUGGESTED',
        }),
      );
    });
  });

  describe('3. Human Review & Overrides with Historical Audit Trail', () => {
    it('should approve suggested mapping and immutably record historical transition', async () => {
      const existingMapping = {
        id: 'map-1',
        organizationId: mockOrgId,
        obligationId: 'ob-1',
        controlId: 'ctrl-1',
        status: MappingStatus.SUGGESTED,
        rationale: 'Suggested alignment.',
        confidence: ObligationConfidence.MEDIUM,
        reassessmentCount: 0,
        obligation: mockObligation,
      };

      mockPrisma.regulatoryObligationControlMapping.findFirst.mockResolvedValueOnce(
        existingMapping,
      );

      mockPrisma.regulatoryObligationControlMapping.update.mockResolvedValueOnce({
        ...existingMapping,
        status: MappingStatus.APPROVED,
        reviewNotes: 'Reviewed and approved by compliance lead.',
        reassessmentCount: 1,
      });

      const res = await service.reviewOrOverrideMapping(
        'map-1',
        mockOrgId,
        {
          status: MappingStatus.APPROVED,
          reviewNotes: 'Reviewed and approved by compliance lead.',
        },
        mockActorId,
      );

      expect(res.status).toBe(MappingStatus.APPROVED);
      expect(mockPrisma.regulatoryObligationControlMappingHistory.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            mappingId: 'map-1',
            previousStatus: MappingStatus.SUGGESTED,
            newStatus: MappingStatus.APPROVED,
            actorId: mockActorId,
          }),
        }),
      );
      expect(mockAuditLogs.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'REGULATORY_OBLIGATION_MAPPING_REVIEWED',
        }),
      );
    });

    it('should override mapping with revised rationale and track previous state', async () => {
      const existingMapping = {
        id: 'map-1',
        organizationId: mockOrgId,
        status: MappingStatus.APPROVED,
        rationale: 'Original rationale.',
        confidence: ObligationConfidence.HIGH,
        reassessmentCount: 1,
        obligation: mockObligation,
      };

      mockPrisma.regulatoryObligationControlMapping.findFirst.mockResolvedValueOnce(
        existingMapping,
      );

      mockPrisma.regulatoryObligationControlMapping.update.mockResolvedValueOnce({
        ...existingMapping,
        status: MappingStatus.OVERRIDDEN,
        rationale: 'Revised legal rationale.',
        reassessmentCount: 2,
      });

      const res = await service.reviewOrOverrideMapping(
        'map-1',
        mockOrgId,
        {
          status: MappingStatus.OVERRIDDEN,
          reviewNotes: 'Revising rationale to reflect updated scope.',
          revisedRationale: 'Revised legal rationale.',
        },
        mockActorId,
      );

      expect(res.status).toBe(MappingStatus.OVERRIDDEN);
      expect(mockPrisma.regulatoryObligationControlMappingHistory.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            previousStatus: MappingStatus.APPROVED,
            newStatus: MappingStatus.OVERRIDDEN,
            previousRationale: 'Original rationale.',
            newRationale: 'Revised legal rationale.',
          }),
        }),
      );
    });

    it('should reject review when mapping belongs to another organization (cross-tenant protection)', async () => {
      mockPrisma.regulatoryObligationControlMapping.findFirst.mockResolvedValueOnce(null);

      await expect(
        service.reviewOrOverrideMapping(
          'map-other-tenant',
          mockOrgId,
          {
            status: MappingStatus.APPROVED,
            reviewNotes: 'Unauthorized cross-tenant attempt',
          },
          mockActorId,
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('4. Mapping Coverage Reporting (Unmapped Obligations)', () => {
    it('should accurately calculate mapping coverage and report unmapped obligations without creating tasks', async () => {
      mockPrisma.regulatoryApplicabilityAssessment.findMany.mockResolvedValueOnce([
        {
          obligationId: 'ob-1',
          obligation: { id: 'ob-1', title: 'Network Switch Isolation', affectedActor: 'Banks' },
        },
        {
          obligationId: 'ob-2',
          obligation: { id: 'ob-2', title: 'Consent Architecture', affectedActor: 'Fiduciaries' },
        },
        {
          obligationId: 'ob-3',
          obligation: { id: 'ob-3', title: 'Incident Reporting', affectedActor: 'Entities' },
        },
      ]);

      // ob-1 has an approved mapping, ob-2 and ob-3 are unmapped
      mockPrisma.regulatoryObligationControlMapping.findMany.mockResolvedValueOnce([
        { obligationId: 'ob-1' },
      ]);

      const res = await service.getMappingCoverage(mockOrgId);

      expect(res.totalApplicableObligations).toBe(3);
      expect(res.mappedObligationsCount).toBe(1);
      expect(res.unmappedObligationsCount).toBe(2);
      expect(res.coveragePercentage).toBe(33);
      expect(res.unmappedObligations).toHaveLength(2);
      expect(res.unmappedObligations.map((o) => o.obligationId)).toEqual(['ob-2', 'ob-3']);
    });
  });
});
