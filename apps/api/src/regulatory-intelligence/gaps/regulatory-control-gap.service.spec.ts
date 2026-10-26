import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import {
  ApplicabilityOutcome,
  ControlGapOutcome,
  DeterminationType,
  EvidenceSufficiencyOutcome,
  MappingStatus,
  ObligationConfidence,
  RegulatoryObligationStatus,
} from '@prisma/client';
import { RegulatoryControlGapService } from './regulatory-control-gap.service';
import { ControlGapEngineService } from './control-gap-engine.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogsService } from '../../audit-logs/audit-logs.service';

describe('RegulatoryControlGapService (Lifecycle, Tenancy & Audit)', () => {
  let service: RegulatoryControlGapService;
  let mockPrisma: any;
  let mockAuditLogs: any;
  let mockEngine: any;

  const mockOrgId = 'org-tenant-1';
  const mockActorId = 'compliance-officer-1';

  const mockObligation = {
    id: 'ob-1',
    obligationIdentifier: 'RBI-CYBER-SEC-4',
    title: 'Network Switch Boundary Isolation',
    obligationWording: 'Commercial Banks shall isolate switches.',
    affectedActor: 'Commercial Banks',
    status: RegulatoryObligationStatus.VERIFIED,
    isHumanVerified: true,
    publicationId: 'pub-1',
    publicationVersionId: 'pub-v1',
  };

  const mockApplicability = {
    id: 'asm-app-1',
    organizationId: mockOrgId,
    obligationId: 'ob-1',
    outcome: ApplicabilityOutcome.APPLICABLE,
  };

  const mockMapping = {
    id: 'map-1',
    organizationId: mockOrgId,
    obligationId: 'ob-1',
    controlId: 'ctrl-1',
    status: MappingStatus.APPROVED,
    rationale: 'Segmentation control maps to switch isolation.',
    control: {
      id: 'ctrl-1',
      name: 'Network Boundary Segmentation',
      category: 'NETWORK_SECURITY',
      deletedAt: null,
      auditCheckItems: [],
      complianceTasks: [],
      evidenceAssociations: [],
    },
  };

  beforeEach(async () => {
    mockPrisma = {
      regulatoryObligation: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
      },
      regulatoryApplicabilityAssessment: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
      },
      regulatoryObligationControlMapping: {
        findFirst: jest.fn(),
      },
      regulatoryControlGapAssessment: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        upsert: jest.fn(),
        update: jest.fn(),
      },
      regulatoryControlGapAssessmentHistory: {
        create: jest.fn(),
      },
      $transaction: jest.fn(async (cb) => cb(mockPrisma)),
    };

    mockAuditLogs = {
      log: jest.fn().mockResolvedValue({} as any),
    };

    mockEngine = {
      evaluateGapAndSufficiency: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RegulatoryControlGapService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditLogsService, useValue: mockAuditLogs },
        { provide: ControlGapEngineService, useValue: mockEngine },
      ],
    }).compile();

    service = module.get<RegulatoryControlGapService>(RegulatoryControlGapService);
  });

  describe('1. Single Obligation Gap Assessment & Eligibility', () => {
    it('should reject gap assessment if obligation is not assessed as APPLICABLE', async () => {
      mockPrisma.regulatoryObligation.findUnique.mockResolvedValueOnce(mockObligation);
      mockPrisma.regulatoryApplicabilityAssessment.findUnique.mockResolvedValueOnce(null); // Not applicable

      await expect(
        service.assessObligationGap(mockOrgId, 'ob-1', mockActorId),
      ).rejects.toThrow(BadRequestException);
    });

    it('should assess NO_MAPPING when no approved mapping exists for applicable obligation', async () => {
      mockPrisma.regulatoryObligation.findUnique.mockResolvedValueOnce(mockObligation);
      mockPrisma.regulatoryApplicabilityAssessment.findUnique.mockResolvedValueOnce(
        mockApplicability,
      );
      mockPrisma.regulatoryObligationControlMapping.findFirst.mockResolvedValueOnce(null); // No mapping

      mockEngine.evaluateGapAndSufficiency.mockReturnValueOnce({
        gapOutcome: ControlGapOutcome.NO_MAPPING,
        evidenceOutcome: EvidenceSufficiencyOutcome.NOT_ASSESSED,
        determinationType: DeterminationType.RULE_DERIVED,
        confidence: ObligationConfidence.HIGH,
        gapRationale: 'No approved control mapping exists.',
        evidenceRationale: 'Evidence not assessed without control.',
        ruleMatched: 'NO_APPROVED_CONTROL_MAPPING',
        evaluatedRecords: {},
      });

      mockPrisma.regulatoryControlGapAssessment.findUnique.mockResolvedValueOnce(null);
      mockPrisma.regulatoryControlGapAssessment.upsert.mockResolvedValueOnce({
        id: 'gap-asm-1',
        organizationId: mockOrgId,
        obligationId: 'ob-1',
        gapOutcome: ControlGapOutcome.NO_MAPPING,
        evidenceOutcome: EvidenceSufficiencyOutcome.NOT_ASSESSED,
        reassessmentCount: 0,
      });

      const res = await service.assessObligationGap(mockOrgId, 'ob-1', mockActorId);

      expect(res.gapOutcome).toBe(ControlGapOutcome.NO_MAPPING);
      expect(res.evidenceOutcome).toBe(EvidenceSufficiencyOutcome.NOT_ASSESSED);
      expect(mockPrisma.regulatoryControlGapAssessmentHistory.create).toHaveBeenCalled();
      expect(mockAuditLogs.log).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: mockOrgId,
          action: 'REGULATORY_CONTROL_GAP_ASSESSED',
        }),
      );
    });

    it('should assess IMPLEMENTED with SUFFICIENT evidence when control records verify compliance', async () => {
      mockPrisma.regulatoryObligation.findUnique.mockResolvedValueOnce(mockObligation);
      mockPrisma.regulatoryApplicabilityAssessment.findUnique.mockResolvedValueOnce(
        mockApplicability,
      );
      mockPrisma.regulatoryObligationControlMapping.findFirst.mockResolvedValueOnce(mockMapping);

      mockEngine.evaluateGapAndSufficiency.mockReturnValueOnce({
        gapOutcome: ControlGapOutcome.IMPLEMENTED,
        evidenceOutcome: EvidenceSufficiencyOutcome.SUFFICIENT,
        determinationType: DeterminationType.RULE_DERIVED,
        confidence: ObligationConfidence.HIGH,
        gapRationale: 'Control audit check item verified COMPLIANT.',
        evidenceRationale: 'Clean, verified evidence attached.',
        ruleMatched: 'AUDIT_CHECK_COMPLIANT',
        evaluatedRecords: {},
      });

      mockPrisma.regulatoryControlGapAssessment.findUnique.mockResolvedValueOnce(null);
      mockPrisma.regulatoryControlGapAssessment.upsert.mockResolvedValueOnce({
        id: 'gap-asm-2',
        organizationId: mockOrgId,
        obligationId: 'ob-1',
        gapOutcome: ControlGapOutcome.IMPLEMENTED,
        evidenceOutcome: EvidenceSufficiencyOutcome.SUFFICIENT,
        reassessmentCount: 0,
      });

      const res = await service.assessObligationGap(mockOrgId, 'ob-1', mockActorId);

      expect(res.gapOutcome).toBe(ControlGapOutcome.IMPLEMENTED);
      expect(res.evidenceOutcome).toBe(EvidenceSufficiencyOutcome.SUFFICIENT);
    });

    it('should return existing assessment idempotently when outcomes are unchanged and not forced', async () => {
      mockPrisma.regulatoryObligation.findUnique.mockResolvedValueOnce(mockObligation);
      mockPrisma.regulatoryApplicabilityAssessment.findUnique.mockResolvedValueOnce(
        mockApplicability,
      );
      mockPrisma.regulatoryObligationControlMapping.findFirst.mockResolvedValueOnce(mockMapping);

      mockEngine.evaluateGapAndSufficiency.mockReturnValueOnce({
        gapOutcome: ControlGapOutcome.IMPLEMENTED,
        evidenceOutcome: EvidenceSufficiencyOutcome.SUFFICIENT,
        determinationType: DeterminationType.RULE_DERIVED,
        confidence: ObligationConfidence.HIGH,
        gapRationale: 'Unchanged.',
        evidenceRationale: 'Unchanged.',
        ruleMatched: 'AUDIT_CHECK_COMPLIANT',
        evaluatedRecords: {},
      });

      const existingAssessment = {
        id: 'gap-asm-existing',
        organizationId: mockOrgId,
        obligationId: 'ob-1',
        gapOutcome: ControlGapOutcome.IMPLEMENTED,
        evidenceOutcome: EvidenceSufficiencyOutcome.SUFFICIENT,
      };

      mockPrisma.regulatoryControlGapAssessment.findUnique.mockResolvedValueOnce(
        existingAssessment,
      );

      const res = await service.assessObligationGap(mockOrgId, 'ob-1', mockActorId, false);

      expect(res.id).toBe('gap-asm-existing');
      expect(mockPrisma.regulatoryControlGapAssessment.upsert).not.toHaveBeenCalled();
    });
  });

  describe('2. Batch Organization Gap Assessment', () => {
    it('should evaluate all applicable obligations and return breakdown metrics', async () => {
      mockPrisma.regulatoryApplicabilityAssessment.findMany.mockResolvedValueOnce([
        { obligationId: 'ob-1' },
        { obligationId: 'ob-2' },
      ]);

      // Mock individual assessments
      jest.spyOn(service, 'assessObligationGap')
        .mockResolvedValueOnce({
          id: 'gap-1',
          gapOutcome: ControlGapOutcome.IMPLEMENTED,
          evidenceOutcome: EvidenceSufficiencyOutcome.SUFFICIENT,
        } as any)
        .mockResolvedValueOnce({
          id: 'gap-2',
          gapOutcome: ControlGapOutcome.NO_MAPPING,
          evidenceOutcome: EvidenceSufficiencyOutcome.NOT_ASSESSED,
        } as any);

      const res = await service.assessOrganizationGaps(mockOrgId, mockActorId);

      expect(res.totalEvaluated).toBe(2);
      expect(res.gapOutcomes[ControlGapOutcome.IMPLEMENTED]).toBe(1);
      expect(res.gapOutcomes[ControlGapOutcome.NO_MAPPING]).toBe(1);
      expect(res.evidenceOutcomes[EvidenceSufficiencyOutcome.SUFFICIENT]).toBe(1);
      expect(res.evidenceOutcomes[EvidenceSufficiencyOutcome.NOT_ASSESSED]).toBe(1);
    });
  });

  describe('3. Human Review & Overrides with Historical Audit Trail', () => {
    it('should allow compliance officer to override gap finding with mandatory review notes', async () => {
      const existingAssessment = {
        id: 'gap-1',
        organizationId: mockOrgId,
        gapOutcome: ControlGapOutcome.PARTIALLY_IMPLEMENTED,
        evidenceOutcome: EvidenceSufficiencyOutcome.INSUFFICIENT,
        gapRationale: 'Original gap rationale.',
        evidenceRationale: 'Original evidence rationale.',
        reassessmentCount: 0,
      };

      mockPrisma.regulatoryControlGapAssessment.findFirst.mockResolvedValueOnce(
        existingAssessment,
      );

      mockPrisma.regulatoryControlGapAssessment.update.mockResolvedValueOnce({
        ...existingAssessment,
        gapOutcome: ControlGapOutcome.IMPLEMENTED,
        isHumanReviewed: true,
        reassessmentCount: 1,
      });

      const res = await service.reviewOrOverrideGapAssessment(
        'gap-1',
        mockOrgId,
        {
          gapOutcome: ControlGapOutcome.IMPLEMENTED,
          reviewNotes: 'Compensating technical controls verify full operational implementation.',
        },
        mockActorId,
      );

      expect(res.gapOutcome).toBe(ControlGapOutcome.IMPLEMENTED);
      expect(mockPrisma.regulatoryControlGapAssessmentHistory.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            assessmentId: 'gap-1',
            previousGapOutcome: ControlGapOutcome.PARTIALLY_IMPLEMENTED,
            newGapOutcome: ControlGapOutcome.IMPLEMENTED,
            determinationType: DeterminationType.HUMAN_OVERRIDDEN,
          }),
        }),
      );
      expect(mockAuditLogs.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'REGULATORY_CONTROL_GAP_REVIEWED',
        }),
      );
    });

    it('should reject review when assessment belongs to another organization (SEC-01)', async () => {
      mockPrisma.regulatoryControlGapAssessment.findFirst.mockResolvedValueOnce(null);

      await expect(
        service.reviewOrOverrideGapAssessment(
          'gap-other-tenant',
          mockOrgId,
          {
            gapOutcome: ControlGapOutcome.IMPLEMENTED,
            reviewNotes: 'Unauthorized attempt',
          },
          mockActorId,
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('4. Gap Summary Metrics Distribution', () => {
    it('should calculate accurate metrics distribution across gap and evidence states', async () => {
      mockPrisma.regulatoryControlGapAssessment.findMany.mockResolvedValueOnce([
        { gapOutcome: ControlGapOutcome.IMPLEMENTED, evidenceOutcome: EvidenceSufficiencyOutcome.SUFFICIENT },
        { gapOutcome: ControlGapOutcome.NO_MAPPING, evidenceOutcome: EvidenceSufficiencyOutcome.NOT_ASSESSED },
        { gapOutcome: ControlGapOutcome.PARTIALLY_IMPLEMENTED, evidenceOutcome: EvidenceSufficiencyOutcome.STALE },
      ]);

      const res = await service.getGapSummary(mockOrgId);

      expect(res.totalAssessed).toBe(3);
      expect(res.unmappedObligationsCount).toBe(1);
      expect(res.partiallyOrNotImplementedCount).toBe(1);
      expect(res.implementedCount).toBe(1);
      expect(res.gapOutcomes.IMPLEMENTED).toBe(1);
      expect(res.evidenceOutcomes.SUFFICIENT).toBe(1);
      expect(res.evidenceOutcomes.STALE).toBe(1);
    });
  });
});
