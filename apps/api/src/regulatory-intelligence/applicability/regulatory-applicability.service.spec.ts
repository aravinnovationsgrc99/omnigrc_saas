import { RegulatoryApplicabilityService } from './regulatory-applicability.service';
import { ApplicabilityEngineService } from './applicability-engine.service';
import { AuditLogsService } from '../../audit-logs/audit-logs.service';
import {
  ApplicabilityOutcome,
  DeterminationType,
  ApplicabilityConfidence,
} from '@prisma/client';
import { NotFoundException } from '@nestjs/common';

describe('RegulatoryApplicabilityService (Assessment Lifecycle, Tenant Scoping & Overrides)', () => {
  let service: RegulatoryApplicabilityService;
  let engine: ApplicabilityEngineService;
  let mockPrisma: any;
  let mockAuditLogs: jest.Mocked<AuditLogsService>;

  const mockOrg = {
    id: 'org-tenant-1',
    name: 'Bharat Fintech Ltd',
    primaryRegion: 'India',
    complianceProfile: {
      id: 'cp-1',
      organizationId: 'org-tenant-1',
      operatingJurisdictions: ['INDIA'],
      industrySector: 'BANKING',
      regulatedEntityTypes: ['COMMERCIAL_BANK'],
      handlesPersonalData: true,
      handlesPaymentData: true,
      isSignificantDataFiduciary: false,
    },
  };

  const mockObligation = {
    id: 'ob-1',
    publicationId: 'pub-1',
    publicationVersionId: 'ver-1',
    catalogueEntryId: 'cat-1',
    obligationIdentifier: 'RBI-CYBER-01',
    title: 'Isolate Payment Infrastructure',
    obligationWording: 'All Commercial Banks shall isolate critical payment networks.',
    requiredAction: 'Isolate payment switch networks',
    affectedActor: 'Commercial Banks',
    effectiveDate: new Date('2026-04-01'),
    complianceDeadline: new Date('2026-12-31'),
    organizationId: null, // Global public obligation
    catalogueEntry: {
      id: 'cat-1',
      code: 'IN_RBI_CYBER_RESILIENCE',
      jurisdiction: 'INDIA',
      issuingAuthority: 'RBI',
      instrumentType: 'DIRECTIVE',
    },
    publication: {
      id: 'pub-1',
      title: 'RBI Master Direction',
    },
  };

  beforeEach(() => {
    mockPrisma = {
      organization: {
        findUnique: jest.fn(),
      },
      organizationComplianceProfile: {
        upsert: jest.fn(),
      },
      regulatoryObligation: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
      },
      regulatoryApplicabilityAssessment: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      regulatoryApplicabilityHistory: {
        create: jest.fn(),
      },
      $transaction: jest.fn().mockImplementation((cb) => cb(mockPrisma)),
    };

    mockAuditLogs = {
      log: jest.fn().mockResolvedValue({} as any),
    } as any;

    engine = new ApplicabilityEngineService();
    service = new RegulatoryApplicabilityService(mockPrisma, engine, mockAuditLogs);
  });

  describe('1. Organization Compliance Profile Management', () => {
    it('should resolve organization profile from complianceProfile relation', async () => {
      mockPrisma.organization.findUnique.mockResolvedValueOnce(mockOrg);

      const profile = await service.getOrBuildProfile('org-tenant-1');

      expect(profile.organizationId).toBe('org-tenant-1');
      expect(profile.industrySector).toBe('BANKING');
      expect(profile.operatingJurisdictions).toEqual(['INDIA']);
      expect(profile.regulatedEntityTypes).toContain('COMMERCIAL_BANK');
    });

    it('should build fallback profile when complianceProfile is unconfigured', async () => {
      mockPrisma.organization.findUnique.mockResolvedValueOnce({
        id: 'org-tenant-2',
        name: 'New Tenant Inc',
        primaryRegion: 'India',
        complianceProfile: null,
      });

      const profile = await service.getOrBuildProfile('org-tenant-2');

      expect(profile.organizationId).toBe('org-tenant-2');
      expect(profile.operatingJurisdictions).toEqual(['INDIA']);
      expect(profile.industrySector).toBeNull();
      expect(profile.regulatedEntityTypes).toEqual([]);
    });

    it('should update compliance profile and record audit event', async () => {
      mockPrisma.organization.findUnique.mockResolvedValueOnce(mockOrg);
      mockPrisma.organizationComplianceProfile.upsert.mockResolvedValueOnce({
        id: 'cp-1',
        organizationId: 'org-tenant-1',
        operatingJurisdictions: ['INDIA', 'SINGAPORE'],
        industrySector: 'FINANCIAL_SERVICES',
        regulatedEntityTypes: ['COMMERCIAL_BANK', 'PAYMENT_OPERATOR'],
      });

      const updated = await service.updateProfile(
        'org-tenant-1',
        {
          operatingJurisdictions: ['INDIA', 'SINGAPORE'],
          industrySector: 'FINANCIAL_SERVICES',
          regulatedEntityTypes: ['COMMERCIAL_BANK', 'PAYMENT_OPERATOR'],
        },
        'admin-user',
      );

      expect(updated.operatingJurisdictions).toContain('SINGAPORE');
      expect(mockAuditLogs.log).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: 'org-tenant-1',
          action: 'ORGANIZATION_COMPLIANCE_PROFILE_UPDATED',
        }),
      );
    });
  });

  describe('2. Applicability Assessment Creation & Idempotency', () => {
    it('should evaluate obligation and create initial assessment record', async () => {
      mockPrisma.organization.findUnique.mockResolvedValueOnce(mockOrg);
      mockPrisma.regulatoryObligation.findUnique.mockResolvedValueOnce(mockObligation);
      mockPrisma.regulatoryApplicabilityAssessment.findUnique.mockResolvedValueOnce(null); // No prior assessment

      mockPrisma.regulatoryApplicabilityAssessment.create.mockResolvedValueOnce({
        id: 'asm-1',
        organizationId: 'org-tenant-1',
        obligationId: 'ob-1',
        outcome: ApplicabilityOutcome.APPLICABLE,
        determinationType: DeterminationType.RULE_DERIVED,
        ruleMatched: 'BANKING_SECTOR_MATCH',
      });

      const res = await service.assessObligation('org-tenant-1', 'ob-1', 'analyst-1');

      expect(res).not.toBeNull();
      expect(res!.outcome).toBe(ApplicabilityOutcome.APPLICABLE);
      expect(mockPrisma.regulatoryApplicabilityAssessment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            organizationId: 'org-tenant-1',
            obligationId: 'ob-1',
            outcome: ApplicabilityOutcome.APPLICABLE,
            determinationType: DeterminationType.RULE_DERIVED,
          }),
        }),
      );

      expect(mockAuditLogs.log).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: 'org-tenant-1',
          action: 'REGULATORY_APPLICABILITY_ASSESSED',
        }),
      );
    });

    it('should return existing assessment idempotently when outcome is unchanged and not forced', async () => {
      mockPrisma.organization.findUnique.mockResolvedValueOnce(mockOrg);
      mockPrisma.regulatoryObligation.findUnique.mockResolvedValueOnce(mockObligation);

      const existingAssessment = {
        id: 'asm-1',
        organizationId: 'org-tenant-1',
        obligationId: 'ob-1',
        outcome: ApplicabilityOutcome.APPLICABLE,
        determinationType: DeterminationType.RULE_DERIVED,
        isHumanReviewed: false,
      };

      mockPrisma.regulatoryApplicabilityAssessment.findUnique.mockResolvedValueOnce(existingAssessment);

      const res = await service.assessObligation('org-tenant-1', 'ob-1', 'analyst-1', false);

      expect(res).toBe(existingAssessment);
      expect(mockPrisma.regulatoryApplicabilityAssessment.create).not.toHaveBeenCalled();
      expect(mockPrisma.regulatoryApplicabilityAssessment.update).not.toHaveBeenCalled();
    });

    it('should preserve previous outcome in history when reassessment changes outcome', async () => {
      // Change profile to Healthcare so banking obligation becomes NOT_APPLICABLE
      const healthcareOrg = {
        ...mockOrg,
        complianceProfile: {
          ...mockOrg.complianceProfile,
          industrySector: 'HEALTHCARE',
          regulatedEntityTypes: ['HOSPITAL'],
        },
      };

      mockPrisma.organization.findUnique.mockResolvedValueOnce(healthcareOrg);
      mockPrisma.regulatoryObligation.findUnique.mockResolvedValueOnce(mockObligation);

      const existingAssessment = {
        id: 'asm-1',
        organizationId: 'org-tenant-1',
        obligationId: 'ob-1',
        outcome: ApplicabilityOutcome.APPLICABLE, // Previously Applicable
        determinationType: DeterminationType.RULE_DERIVED,
        isHumanReviewed: false,
        evaluatedAttributes: {},
        reassessmentCount: 0,
      };

      mockPrisma.regulatoryApplicabilityAssessment.findUnique
        .mockResolvedValueOnce(existingAssessment) // Check in assessObligation
        .mockResolvedValueOnce({
          ...existingAssessment,
          outcome: ApplicabilityOutcome.NOT_APPLICABLE,
          reassessmentCount: 1,
        }); // Return updated after transaction

      const res = await service.assessObligation('org-tenant-1', 'ob-1', 'analyst-1', true);

      expect(res).not.toBeNull();
      expect(res!.outcome).toBe(ApplicabilityOutcome.NOT_APPLICABLE);

      // Verify historical audit trail was recorded
      expect(mockPrisma.regulatoryApplicabilityHistory.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            assessmentId: 'asm-1',
            organizationId: 'org-tenant-1',
            previousOutcome: ApplicabilityOutcome.APPLICABLE,
            newOutcome: ApplicabilityOutcome.NOT_APPLICABLE,
          }),
        }),
      );

      expect(mockAuditLogs.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'REGULATORY_APPLICABILITY_REASSESSED',
        }),
      );
    });
  });

  describe('3. Human Review & Decision Override Workflow', () => {
    it('should override rule-derived outcome, record history, and stamp reviewer details', async () => {
      const existingAssessment = {
        id: 'asm-1',
        organizationId: 'org-tenant-1',
        obligationId: 'ob-1',
        outcome: ApplicabilityOutcome.REQUIRES_REVIEW,
        determinationType: DeterminationType.RULE_DERIVED,
        rationale: 'Ambiguous actor criteria',
        evaluatedAttributes: {},
        reassessmentCount: 0,
      };

      mockPrisma.regulatoryApplicabilityAssessment.findFirst.mockResolvedValueOnce(existingAssessment);

      mockPrisma.regulatoryApplicabilityAssessment.update.mockResolvedValueOnce({
        ...existingAssessment,
        outcome: ApplicabilityOutcome.APPLICABLE,
        determinationType: DeterminationType.HUMAN_OVERRIDDEN,
        isHumanReviewed: true,
        reviewedById: 'legal-counsel-1',
        reviewNotes: 'Confirmed by legal counsel that subsidiary operations trigger this clause.',
      });

      const updated = await service.reviewOrOverrideAssessment(
        'asm-1',
        'org-tenant-1',
        {
          outcome: ApplicabilityOutcome.APPLICABLE,
          reviewNotes: 'Confirmed by legal counsel that subsidiary operations trigger this clause.',
          overrideReason: 'Subsidiary payment gateway operation triggers RBI directive.',
        },
        'legal-counsel-1',
      );

      expect(updated.outcome).toBe(ApplicabilityOutcome.APPLICABLE);
      expect(updated.determinationType).toBe(DeterminationType.HUMAN_OVERRIDDEN);
      expect(updated.isHumanReviewed).toBe(true);

      // Verify history snapshot created
      expect(mockPrisma.regulatoryApplicabilityHistory.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            previousOutcome: ApplicabilityOutcome.REQUIRES_REVIEW,
            newOutcome: ApplicabilityOutcome.APPLICABLE,
            determinationType: DeterminationType.HUMAN_OVERRIDDEN,
          }),
        }),
      );

      expect(mockAuditLogs.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'REGULATORY_APPLICABILITY_OVERRIDDEN',
        }),
      );
    });

    it('should record HUMAN_CONFIRMED when human reviewer affirms the rule-derived outcome', async () => {
      const existingAssessment = {
        id: 'asm-1',
        organizationId: 'org-tenant-1',
        obligationId: 'ob-1',
        outcome: ApplicabilityOutcome.APPLICABLE,
        determinationType: DeterminationType.RULE_DERIVED,
        evaluatedAttributes: {},
        reassessmentCount: 0,
      };

      mockPrisma.regulatoryApplicabilityAssessment.findFirst.mockResolvedValueOnce(existingAssessment);
      mockPrisma.regulatoryApplicabilityAssessment.update.mockResolvedValueOnce({
        ...existingAssessment,
        determinationType: DeterminationType.HUMAN_CONFIRMED,
        isHumanReviewed: true,
      });

      const updated = await service.reviewOrOverrideAssessment(
        'asm-1',
        'org-tenant-1',
        {
          outcome: ApplicabilityOutcome.APPLICABLE,
          reviewNotes: 'Affirmed rule match for commercial bank operations.',
        },
        'compliance-officer-1',
      );

      expect(updated.determinationType).toBe(DeterminationType.HUMAN_CONFIRMED);
      expect(mockAuditLogs.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'REGULATORY_APPLICABILITY_REVIEWED',
        }),
      );
    });
  });

  describe('4. Multi-Tenant Isolation & Cross-Tenant Denial', () => {
    it('should prevent cross-tenant retrieval of assessment records', async () => {
      // Assessment belongs to org-tenant-1; caller is org-tenant-999
      mockPrisma.regulatoryApplicabilityAssessment.findFirst.mockResolvedValueOnce(null);

      await expect(service.getAssessment('asm-1', 'org-tenant-999')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should prevent cross-tenant override attempt', async () => {
      mockPrisma.regulatoryApplicabilityAssessment.findFirst.mockResolvedValueOnce(null);

      await expect(
        service.reviewOrOverrideAssessment(
          'asm-1',
          'org-tenant-999',
          {
            outcome: ApplicabilityOutcome.NOT_APPLICABLE,
            reviewNotes: 'Unauthorized cross-tenant attempt',
          },
          'attacker-user',
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
