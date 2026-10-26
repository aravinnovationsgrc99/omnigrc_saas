import { Injectable, Logger } from '@nestjs/common';
import {
  ApplicabilityOutcome,
  DeterminationType,
  ApplicabilityConfidence,
} from '@prisma/client';

export interface EvaluatedOrganizationProfile {
  organizationId: string;
  name: string;
  primaryRegion: string;
  operatingJurisdictions: string[];
  industrySector: string | null;
  regulatedEntityTypes: string[];
  handlesPersonalData: boolean;
  handlesPaymentData: boolean;
  isSignificantDataFiduciary: boolean;
  annualTurnoverBand: string | null;
  employeeCountBand: string | null;
  customAttributes?: Record<string, any> | null;
}

export interface EvaluatedObligationContext {
  obligationId: string;
  obligationIdentifier?: string | null;
  title: string;
  obligationWording: string;
  requiredAction?: string | null;
  affectedActor?: string | null;
  effectiveDate?: Date | null;
  complianceDeadline?: Date | null;
  jurisdiction?: string | null;
  issuingAuthority?: string | null;
  instrumentType?: string | null;
}

export interface ApplicabilityDetermination {
  outcome: ApplicabilityOutcome;
  determinationType: DeterminationType;
  confidence: ApplicabilityConfidence;
  rationale: string;
  ruleMatched: string;
  evaluatedAttributes: Record<string, any>;
  obligationCriteriaSnapshot: Record<string, any>;
}

@Injectable()
export class ApplicabilityEngineService {
  private readonly logger = new Logger(ApplicabilityEngineService.name);

  /**
   * Deterministically evaluates whether a regulatory obligation applies to an organization
   * based strictly on explicit organization attributes and authoritative regulatory criteria.
   * Never infers NOT_APPLICABLE from missing data.
   */
  public evaluateApplicability(
    profile: EvaluatedOrganizationProfile,
    obligation: EvaluatedObligationContext,
  ): ApplicabilityDetermination {
    const orgJurisdictions = (profile.operatingJurisdictions || []).map((j) => j.toUpperCase().trim());
    const targetJurisdiction = (obligation.jurisdiction || 'GLOBAL_STANDARDS').toUpperCase().trim();
    const actorLower = (obligation.affectedActor || '').toLowerCase().trim();

    const evaluatedAttributes = {
      organizationId: profile.organizationId,
      name: profile.name,
      primaryRegion: profile.primaryRegion,
      operatingJurisdictions: orgJurisdictions,
      industrySector: profile.industrySector,
      regulatedEntityTypes: profile.regulatedEntityTypes,
      handlesPersonalData: profile.handlesPersonalData,
      handlesPaymentData: profile.handlesPaymentData,
      isSignificantDataFiduciary: profile.isSignificantDataFiduciary,
    };

    const obligationCriteriaSnapshot = {
      obligationId: obligation.obligationId,
      obligationIdentifier: obligation.obligationIdentifier,
      title: obligation.title,
      affectedActor: obligation.affectedActor,
      effectiveDate: obligation.effectiveDate?.toISOString() || null,
      complianceDeadline: obligation.complianceDeadline?.toISOString() || null,
      jurisdiction: targetJurisdiction,
      issuingAuthority: obligation.issuingAuthority,
    };

    // 1. Missing Jurisdiction Attributes
    if (orgJurisdictions.length === 0 && !profile.primaryRegion) {
      return {
        outcome: ApplicabilityOutcome.INSUFFICIENT_INFORMATION,
        determinationType: DeterminationType.RULE_DERIVED,
        confidence: ApplicabilityConfidence.LOW,
        rationale:
          'Organization operating jurisdictions and primary region are not configured. Territorial nexus cannot be verified.',
        ruleMatched: 'MISSING_JURISDICTION_ATTRIBUTE',
        evaluatedAttributes,
        obligationCriteriaSnapshot,
      };
    }

    // 2. Global Standards Handling (e.g. ISO 27001, SOC 2, NIST)
    if (targetJurisdiction === 'GLOBAL_STANDARDS') {
      return {
        outcome: ApplicabilityOutcome.APPLICABLE,
        determinationType: DeterminationType.RULE_DERIVED,
        confidence: ApplicabilityConfidence.HIGH,
        rationale:
          'International standard applies globally. Applicable as an enterprise cybersecurity and governance baseline.',
        ruleMatched: 'GLOBAL_STANDARD_BASELINE',
        evaluatedAttributes,
        obligationCriteriaSnapshot,
      };
    }

    // 3. Jurisdiction Check (Territorial Nexus)
    const isJurisdictionMatch =
      orgJurisdictions.includes(targetJurisdiction) ||
      (profile.primaryRegion && profile.primaryRegion.toUpperCase() === targetJurisdiction);

    if (!isJurisdictionMatch) {
      return {
        outcome: ApplicabilityOutcome.NOT_APPLICABLE,
        determinationType: DeterminationType.RULE_DERIVED,
        confidence: ApplicabilityConfidence.HIGH,
        rationale: `Organization operating jurisdictions [${orgJurisdictions.join(', ') || profile.primaryRegion}] do not include target jurisdiction '${targetJurisdiction}'. No territorial regulatory nexus exists.`,
        ruleMatched: 'JURISDICTION_MISMATCH',
        evaluatedAttributes,
        obligationCriteriaSnapshot,
      };
    }

    // Jurisdiction matches — now evaluate actor and sector criteria within the jurisdiction

    // 4. Data Protection Universal Mandates (e.g. DPDP Act, GDPR Data Fiduciaries / Controllers)
    const isSdfActor =
      actorLower.includes('significant data fiduciary') ||
      actorLower.includes('significant data fiduciaries') ||
      actorLower.includes('sdf');

    const isDataProtectionActor =
      isSdfActor ||
      actorLower.includes('data fiduciary') ||
      actorLower.includes('data fiduciaries') ||
      actorLower.includes('data controller');

    if (isDataProtectionActor) {
      if (profile.handlesPersonalData === false) {
        return {
          outcome: ApplicabilityOutcome.NOT_APPLICABLE,
          determinationType: DeterminationType.RULE_DERIVED,
          confidence: ApplicabilityConfidence.HIGH,
          rationale:
            'Organization profile explicitly declares that no personal data is processed or collected (handlesPersonalData: false). Exempt from Data Fiduciary obligations.',
          ruleMatched: 'PERSONAL_DATA_EXEMPTION',
          evaluatedAttributes,
          obligationCriteriaSnapshot,
        };
      }

      if (isSdfActor) {
        if (profile.isSignificantDataFiduciary) {
          return {
            outcome: ApplicabilityOutcome.APPLICABLE,
            determinationType: DeterminationType.RULE_DERIVED,
            confidence: ApplicabilityConfidence.HIGH,
            rationale:
              'Organization is classified as a Significant Data Fiduciary (SDF) in India. Specific enhanced obligations apply.',
            ruleMatched: 'SIGNIFICANT_DATA_FIDUCIARY_MATCH',
            evaluatedAttributes,
            obligationCriteriaSnapshot,
          };
        } else {
          return {
            outcome: ApplicabilityOutcome.NOT_APPLICABLE,
            determinationType: DeterminationType.RULE_DERIVED,
            confidence: ApplicabilityConfidence.HIGH,
            rationale:
              'Obligation applies strictly to Significant Data Fiduciaries (SDFs). Organization is not designated as an SDF.',
            ruleMatched: 'NON_SDF_EXCLUSION',
            evaluatedAttributes,
            obligationCriteriaSnapshot,
          };
        }
      }

      return {
        outcome: ApplicabilityOutcome.APPLICABLE,
        determinationType: DeterminationType.RULE_DERIVED,
        confidence: ApplicabilityConfidence.HIGH,
        rationale: this.appendEffectiveDateNotice(
          `Organization operates in jurisdiction '${targetJurisdiction}' and processes digital personal data, qualifying as a Data Fiduciary.`,
          obligation.effectiveDate,
        ),
        ruleMatched: 'DATA_FIDUCIARY_UNIVERSAL_APPLICABILITY',
        evaluatedAttributes,
        obligationCriteriaSnapshot,
      };
    }

    // 5. General Cyber & Incident Reporting Mandates (e.g. CERT-In 6-hour reporting)
    if (
      actorLower.includes('intermediary') ||
      actorLower.includes('intermediaries') ||
      actorLower.includes('system provider') ||
      actorLower === 'regulated entities'
    ) {
      // General corporate & intermediary mandate in jurisdiction
      return {
        outcome: ApplicabilityOutcome.APPLICABLE,
        determinationType: DeterminationType.RULE_DERIVED,
        confidence: ApplicabilityConfidence.HIGH,
        rationale: this.appendEffectiveDateNotice(
          `General cybersecurity direction applies to all corporate bodies, system providers, and intermediaries in jurisdiction '${targetJurisdiction}'.`,
          obligation.effectiveDate,
        ),
        ruleMatched: 'CYBERSECURITY_MANDATE_ALL_ENTITIES',
        evaluatedAttributes,
        obligationCriteriaSnapshot,
      };
    }

    // 6. Specialized Regulated Actor Matching (NBFCs, Banking, Insurance, Capital Markets)
    const isNbfcActor =
      actorLower.includes('nbfc') ||
      actorLower.includes('non-banking') ||
      actorLower.includes('non banking');

    const isBankingActor =
      !isNbfcActor &&
      (actorLower.includes('commercial bank') ||
        actorLower.includes('banking') ||
        /\bbanks?\b/.test(actorLower));

    const isInsuranceActor =
      actorLower.includes('insurer') ||
      actorLower.includes('insurance') ||
      actorLower.includes('reinsurer');

    const isPaymentActor =
      actorLower.includes('payment system') ||
      actorLower.includes('payment aggregator') ||
      actorLower.includes('payment operator');

    if (isNbfcActor || isBankingActor || isInsuranceActor || isPaymentActor) {
      // Check if organization has configured sector and entity types
      const orgSector = (profile.industrySector || '').toUpperCase();
      const orgEntityTypes = (profile.regulatedEntityTypes || []).map((t) => t.toUpperCase());

      // If organization sector and entity types are completely unconfigured:
      if (!profile.industrySector && orgEntityTypes.length === 0) {
        return {
          outcome: ApplicabilityOutcome.INSUFFICIENT_INFORMATION,
          determinationType: DeterminationType.RULE_DERIVED,
          confidence: ApplicabilityConfidence.MEDIUM,
          rationale: `Obligation targets specialized sector actor '${obligation.affectedActor}' in jurisdiction '${targetJurisdiction}'. Organization operates in '${targetJurisdiction}', but sector and regulated entity types are not configured. Cannot verify applicability without profile attributes.`,
          ruleMatched: 'MISSING_SECTOR_OR_ENTITY_TYPE_ATTRIBUTE',
          evaluatedAttributes,
          obligationCriteriaSnapshot,
        };
      }

      // Check NBFC Match
      if (isNbfcActor) {
        if (
          orgEntityTypes.includes('NBFC') ||
          orgSector === 'NBFC' ||
          orgEntityTypes.includes('NON_BANKING_FINANCIAL_COMPANY')
        ) {
          return {
            outcome: ApplicabilityOutcome.APPLICABLE,
            determinationType: DeterminationType.RULE_DERIVED,
            confidence: ApplicabilityConfidence.HIGH,
            rationale: this.appendEffectiveDateNotice(
              `Organization profile lists regulated entity type 'NBFC' matching directive criteria for '${obligation.affectedActor}'.`,
              obligation.effectiveDate,
            ),
            ruleMatched: 'NBFC_SECTOR_MATCH',
            evaluatedAttributes,
            obligationCriteriaSnapshot,
          };
        } else {
          return {
            outcome: ApplicabilityOutcome.NOT_APPLICABLE,
            determinationType: DeterminationType.RULE_DERIVED,
            confidence: ApplicabilityConfidence.HIGH,
            rationale: `Obligation targets NBFC entities. Organization is not registered as an NBFC.`,
            ruleMatched: 'NON_NBFC_EXCLUSION',
            evaluatedAttributes,
            obligationCriteriaSnapshot,
          };
        }
      }

      // Check Banking Match
      if (isBankingActor) {
        if (
          orgEntityTypes.includes('COMMERCIAL_BANK') ||
          orgEntityTypes.includes('BANK') ||
          orgSector === 'BANKING'
        ) {
          return {
            outcome: ApplicabilityOutcome.APPLICABLE,
            determinationType: DeterminationType.RULE_DERIVED,
            confidence: ApplicabilityConfidence.HIGH,
            rationale: this.appendEffectiveDateNotice(
              `Organization profile lists sector 'BANKING' / entity type 'COMMERCIAL_BANK' matching regulatory directive criteria for '${obligation.affectedActor}'.`,
              obligation.effectiveDate,
            ),
            ruleMatched: 'BANKING_SECTOR_MATCH',
            evaluatedAttributes,
            obligationCriteriaSnapshot,
          };
        } else {
          return {
            outcome: ApplicabilityOutcome.NOT_APPLICABLE,
            determinationType: DeterminationType.RULE_DERIVED,
            confidence: ApplicabilityConfidence.HIGH,
            rationale: `Obligation specifically mandates banking institutions. Organization sector '${profile.industrySector}' and entity types [${orgEntityTypes.join(', ')}] are not banking institutions.`,
            ruleMatched: 'SECTOR_CRITERIA_MISMATCH',
            evaluatedAttributes,
            obligationCriteriaSnapshot,
          };
        }
      }

      // Check Insurance Match
      if (isInsuranceActor) {
        if (
          orgEntityTypes.includes('INSURER') ||
          orgEntityTypes.includes('REINSURER') ||
          orgSector === 'INSURANCE'
        ) {
          return {
            outcome: ApplicabilityOutcome.APPLICABLE,
            determinationType: DeterminationType.RULE_DERIVED,
            confidence: ApplicabilityConfidence.HIGH,
            rationale: this.appendEffectiveDateNotice(
              `Organization profile lists sector 'INSURANCE' matching IRDAI criteria for '${obligation.affectedActor}'.`,
              obligation.effectiveDate,
            ),
            ruleMatched: 'INSURANCE_SECTOR_MATCH',
            evaluatedAttributes,
            obligationCriteriaSnapshot,
          };
        } else {
          return {
            outcome: ApplicabilityOutcome.NOT_APPLICABLE,
            determinationType: DeterminationType.RULE_DERIVED,
            confidence: ApplicabilityConfidence.HIGH,
            rationale: `Obligation targets Insurers and Reinsurers. Organization is not in the insurance sector.`,
            ruleMatched: 'NON_INSURANCE_EXCLUSION',
            evaluatedAttributes,
            obligationCriteriaSnapshot,
          };
        }
      }
    }

    // 7. Ambiguous or Unspecified Actor Criteria within Matching Jurisdiction
    return {
      outcome: ApplicabilityOutcome.REQUIRES_REVIEW,
      determinationType: DeterminationType.RULE_DERIVED,
      confidence: ApplicabilityConfidence.MEDIUM,
      rationale: `Obligation jurisdiction '${targetJurisdiction}' matches organization presence, but actor criteria '${obligation.affectedActor || 'Unspecified'}' requires human legal and compliance review to determine operational applicability.`,
      ruleMatched: 'AMBIGUOUS_ACTOR_CRITERIA_REQUIRES_REVIEW',
      evaluatedAttributes,
      obligationCriteriaSnapshot,
    };
  }

  /**
   * Appends future effective date advisory notice to assessment rationale.
   */
  private appendEffectiveDateNotice(baseRationale: string, effectiveDate?: Date | null): string {
    if (!effectiveDate) return baseRationale;
    const now = new Date();
    if (effectiveDate > now) {
      const dateStr = effectiveDate.toISOString().split('T')[0];
      return `${baseRationale} (Note: Future-effective regulation. Becomes actively enforceable on ${dateStr}).`;
    }
    return baseRationale;
  }
}
