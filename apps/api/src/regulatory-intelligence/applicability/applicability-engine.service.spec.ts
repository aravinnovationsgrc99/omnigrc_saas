import {
  ApplicabilityEngineService,
  EvaluatedOrganizationProfile,
  EvaluatedObligationContext,
} from './applicability-engine.service';
import {
  ApplicabilityOutcome,
  DeterminationType,
  ApplicabilityConfidence,
} from '@prisma/client';

describe('ApplicabilityEngineService (Deterministic Assessment Logic & Rules)', () => {
  let engine: ApplicabilityEngineService;

  const baseProfile: EvaluatedOrganizationProfile = {
    organizationId: 'org-test-1',
    name: 'Bharat Fintech Solutions Ltd',
    primaryRegion: 'India',
    operatingJurisdictions: ['INDIA'],
    industrySector: 'BANKING',
    regulatedEntityTypes: ['COMMERCIAL_BANK', 'DATA_FIDUCIARY'],
    handlesPersonalData: true,
    handlesPaymentData: true,
    isSignificantDataFiduciary: false,
    annualTurnoverBand: '100CR_500CR',
    employeeCountBand: '500_1000',
  };

  const baseObligation: EvaluatedObligationContext = {
    obligationId: 'ob-rbi-1',
    obligationIdentifier: 'RBI-CYBER-SEC-3',
    title: 'Network Segmentation for Payment Infrastructure',
    obligationWording: 'All Commercial Banks shall isolate critical payment switch networks.',
    requiredAction: 'Isolate critical payment switch networks',
    affectedActor: 'Commercial Banks',
    effectiveDate: new Date('2026-04-01'),
    complianceDeadline: new Date('2026-12-31'),
    jurisdiction: 'INDIA',
    issuingAuthority: 'Reserve Bank of India (RBI)',
    instrumentType: 'DIRECTIVE',
  };

  beforeEach(() => {
    engine = new ApplicabilityEngineService();
  });

  describe('1. Missing Attributes & Insufficient Information Outcomes', () => {
    it('should return INSUFFICIENT_INFORMATION when organization operating jurisdictions are completely missing', () => {
      const missingJurisdictionProfile: EvaluatedOrganizationProfile = {
        ...baseProfile,
        operatingJurisdictions: [],
        primaryRegion: '',
      };

      const res = engine.evaluateApplicability(missingJurisdictionProfile, baseObligation);

      expect(res.outcome).toBe(ApplicabilityOutcome.INSUFFICIENT_INFORMATION);
      expect(res.ruleMatched).toBe('MISSING_JURISDICTION_ATTRIBUTE');
      expect(res.rationale).toContain('operating jurisdictions and primary region are not configured');
    });

    it('should return INSUFFICIENT_INFORMATION when evaluating specialized sector mandate but organization sector is unconfigured', () => {
      const unconfiguredSectorProfile: EvaluatedOrganizationProfile = {
        ...baseProfile,
        industrySector: null,
        regulatedEntityTypes: [],
      };

      const res = engine.evaluateApplicability(unconfiguredSectorProfile, baseObligation);

      expect(res.outcome).toBe(ApplicabilityOutcome.INSUFFICIENT_INFORMATION);
      expect(res.ruleMatched).toBe('MISSING_SECTOR_OR_ENTITY_TYPE_ATTRIBUTE');
      expect(res.rationale).toContain('sector and regulated entity types are not configured');
    });
  });

  describe('2. Jurisdiction Territorial Nexus Enforcement', () => {
    it('should return NOT_APPLICABLE with HIGH confidence on territorial jurisdiction mismatch', () => {
      const uaeObligation: EvaluatedObligationContext = {
        ...baseObligation,
        obligationId: 'ob-uae-1',
        title: 'UAE Federal Data Protection Mandate',
        jurisdiction: 'UAE_GCC',
        issuingAuthority: 'UAE Data Office',
      };

      const res = engine.evaluateApplicability(baseProfile, uaeObligation);

      expect(res.outcome).toBe(ApplicabilityOutcome.NOT_APPLICABLE);
      expect(res.ruleMatched).toBe('JURISDICTION_MISMATCH');
      expect(res.confidence).toBe(ApplicabilityConfidence.HIGH);
      expect(res.rationale).toContain("do not include target jurisdiction 'UAE_GCC'");
    });

    it('should return APPLICABLE for Global Standard obligations (ISO/SOC2) regardless of jurisdiction', () => {
      const isoObligation: EvaluatedObligationContext = {
        ...baseObligation,
        obligationId: 'ob-iso-1',
        title: 'ISO 27001 Access Control Standard',
        jurisdiction: 'GLOBAL_STANDARDS',
        issuingAuthority: 'ISO/IEC',
      };

      const res = engine.evaluateApplicability(baseProfile, isoObligation);

      expect(res.outcome).toBe(ApplicabilityOutcome.APPLICABLE);
      expect(res.ruleMatched).toBe('GLOBAL_STANDARD_BASELINE');
    });
  });

  describe('3. Specialized Sector & Regulated Actor Matching', () => {
    it('should return APPLICABLE when organization sector and entity type match banking mandate', () => {
      const res = engine.evaluateApplicability(baseProfile, baseObligation);

      expect(res.outcome).toBe(ApplicabilityOutcome.APPLICABLE);
      expect(res.ruleMatched).toBe('BANKING_SECTOR_MATCH');
      expect(res.determinationType).toBe(DeterminationType.RULE_DERIVED);
      expect(res.confidence).toBe(ApplicabilityConfidence.HIGH);
    });

    it('should return NOT_APPLICABLE when organization is from a different sector (e.g. Healthcare vs Banking)', () => {
      const healthcareProfile: EvaluatedOrganizationProfile = {
        ...baseProfile,
        industrySector: 'HEALTHCARE',
        regulatedEntityTypes: ['HOSPITAL', 'DATA_FIDUCIARY'],
      };

      const res = engine.evaluateApplicability(healthcareProfile, baseObligation);

      expect(res.outcome).toBe(ApplicabilityOutcome.NOT_APPLICABLE);
      expect(res.ruleMatched).toBe('SECTOR_CRITERIA_MISMATCH');
      expect(res.rationale).toContain('are not banking institutions');
    });

    it('should return APPLICABLE for NBFC entity type when evaluating NBFC directions', () => {
      const nbfcObligation: EvaluatedObligationContext = {
        ...baseObligation,
        obligationId: 'ob-nbfc-1',
        title: 'NBFC Scale Based Regulation Cyber Mandate',
        affectedActor: 'Non-Banking Financial Companies (NBFCs)',
      };

      const nbfcProfile: EvaluatedOrganizationProfile = {
        ...baseProfile,
        industrySector: 'FINANCIAL_SERVICES',
        regulatedEntityTypes: ['NBFC'],
      };

      const res = engine.evaluateApplicability(nbfcProfile, nbfcObligation);

      expect(res.outcome).toBe(ApplicabilityOutcome.APPLICABLE);
      expect(res.ruleMatched).toBe('NBFC_SECTOR_MATCH');
    });
  });

  describe('4. Data Protection & Universal Mandates', () => {
    it('should return APPLICABLE for Data Fiduciary mandate when organization operates in jurisdiction and handles personal data', () => {
      const dpdpObligation: EvaluatedObligationContext = {
        ...baseObligation,
        obligationId: 'ob-dpdp-1',
        title: 'Consent Architecture for Personal Data Processing',
        affectedActor: 'Data Fiduciaries',
      };

      const res = engine.evaluateApplicability(baseProfile, dpdpObligation);

      expect(res.outcome).toBe(ApplicabilityOutcome.APPLICABLE);
      expect(res.ruleMatched).toBe('DATA_FIDUCIARY_UNIVERSAL_APPLICABILITY');
    });

    it('should return NOT_APPLICABLE when organization profile explicitly declares no personal data processed', () => {
      const dpdpObligation: EvaluatedObligationContext = {
        ...baseObligation,
        obligationId: 'ob-dpdp-1',
        affectedActor: 'Data Fiduciaries',
      };

      const noPersonalDataProfile: EvaluatedOrganizationProfile = {
        ...baseProfile,
        handlesPersonalData: false,
      };

      const res = engine.evaluateApplicability(noPersonalDataProfile, dpdpObligation);

      expect(res.outcome).toBe(ApplicabilityOutcome.NOT_APPLICABLE);
      expect(res.ruleMatched).toBe('PERSONAL_DATA_EXEMPTION');
    });

    it('should enforce Significant Data Fiduciary (SDF) criteria accurately', () => {
      const sdfObligation: EvaluatedObligationContext = {
        ...baseObligation,
        obligationId: 'ob-sdf-1',
        affectedActor: 'Designated Significant Data Fiduciaries',
      };

      // Non-SDF profile
      const resNonSdf = engine.evaluateApplicability(baseProfile, sdfObligation);
      expect(resNonSdf.outcome).toBe(ApplicabilityOutcome.NOT_APPLICABLE);
      expect(resNonSdf.ruleMatched).toBe('NON_SDF_EXCLUSION');

      // SDF profile
      const sdfProfile: EvaluatedOrganizationProfile = {
        ...baseProfile,
        isSignificantDataFiduciary: true,
      };
      const resSdf = engine.evaluateApplicability(sdfProfile, sdfObligation);
      expect(resSdf.outcome).toBe(ApplicabilityOutcome.APPLICABLE);
      expect(resSdf.ruleMatched).toBe('SIGNIFICANT_DATA_FIDUCIARY_MATCH');
    });
  });

  describe('5. Ambiguous Actor Criteria & Future Effective Dates', () => {
    it('should return REQUIRES_REVIEW when actor criteria is ambiguous in matching jurisdiction', () => {
      const ambiguousObligation: EvaluatedObligationContext = {
        ...baseObligation,
        affectedActor: null, // Unspecified actor
      };

      const res = engine.evaluateApplicability(baseProfile, ambiguousObligation);

      expect(res.outcome).toBe(ApplicabilityOutcome.REQUIRES_REVIEW);
      expect(res.ruleMatched).toBe('AMBIGUOUS_ACTOR_CRITERIA_REQUIRES_REVIEW');
      expect(res.rationale).toContain('requires human legal and compliance review');
    });

    it('should append future-effective advisory note when effectiveDate is in the future', () => {
      const futureDate = new Date();
      futureDate.setFullYear(futureDate.getFullYear() + 1);

      const futureObligation: EvaluatedObligationContext = {
        ...baseObligation,
        effectiveDate: futureDate,
      };

      const res = engine.evaluateApplicability(baseProfile, futureObligation);

      expect(res.outcome).toBe(ApplicabilityOutcome.APPLICABLE);
      expect(res.rationale).toContain('Future-effective regulation. Becomes actively enforceable on');
    });
  });
});
