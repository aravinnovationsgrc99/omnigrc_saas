import { Injectable, Logger } from '@nestjs/common';
import {
  MappingStatus,
  ObligationConfidence,
  ObligationMappingMethod,
} from '@prisma/client';

export interface EvaluatedControlContext {
  id: string;
  organizationId: string;
  name: string;
  description: string;
  category: string | null;
  mappings?: Array<{
    frameworkReferenceId?: string | null;
    frameworkReference?: {
      identifier: string;
      title: string;
    } | null;
  }>;
}

export interface EvaluatedObligationMappingInput {
  obligationId: string;
  obligationIdentifier?: string | null;
  title: string;
  obligationWording: string;
  requiredAction?: string | null;
  affectedActor?: string | null;
  jurisdiction?: string | null;
  publicationId?: string | null;
  publicationVersionId?: string | null;
}

export interface SuggestedMappingCandidate {
  controlId: string;
  frameworkReferenceId?: string | null;
  status: MappingStatus;
  mappingMethod: ObligationMappingMethod;
  confidence: ObligationConfidence;
  rationale: string;
  ruleMatched: string;
}

interface DomainRuleDef {
  domain: string;
  ruleMatched: string;
  obligationKeywords: string[];
  controlCategories: string[];
  controlKeywords: string[];
  rationaleTemplate: (controlName: string) => string;
}

@Injectable()
export class MappingSuggestionEngineService {
  private readonly logger = new Logger(MappingSuggestionEngineService.name);

  private readonly domainRules: DomainRuleDef[] = [
    {
      domain: 'NETWORK_SECURITY',
      ruleMatched: 'NETWORK_SEGMENTATION_ALIGNMENT',
      obligationKeywords: [
        'network',
        'segmentation',
        'switch',
        'isolated network',
        'perimeter',
        'firewall',
        'demilitarized',
        'dmz',
      ],
      controlCategories: ['NETWORK_SECURITY', 'INFRASTRUCTURE_SECURITY', 'SECURITY'],
      controlKeywords: ['network', 'segmentation', 'firewall', 'perimeter', 'isolation', 'switch'],
      rationaleTemplate: (name) =>
        `Regulatory mandate specifies network architecture and boundary isolation. Organizational control '${name}' provides technical perimeter enforcement and network segmentation.`,
    },
    {
      domain: 'DATA_PROTECTION',
      ruleMatched: 'DATA_PROTECTION_GOVERNANCE_ALIGNMENT',
      obligationKeywords: [
        'data fiduciary',
        'consent',
        'personal data',
        'data principal',
        'erasure',
        'privacy',
        'dpdp',
        'pii',
        'data controller',
      ],
      controlCategories: ['DATA_PROTECTION', 'PRIVACY', 'COMPLIANCE'],
      controlKeywords: ['personal data', 'consent', 'privacy', 'pii', 'data protection', 'data subject'],
      rationaleTemplate: (name) =>
        `Regulatory obligation imposes personal data governance and processing limitations. Organizational control '${name}' governs personal data lifecycle, consent verification, and privacy safeguards.`,
    },
    {
      domain: 'INCIDENT_RESPONSE',
      ruleMatched: 'INCIDENT_RESPONSE_PROCEDURE_ALIGNMENT',
      obligationKeywords: [
        'incident',
        'breach',
        'cert-in',
        '6-hour',
        '6 hour',
        'forensic',
        'containment',
        'reporting',
        'unauthorized access notification',
      ],
      controlCategories: ['INCIDENT_RESPONSE', 'SECURITY_OPERATIONS', 'SECURITY'],
      controlKeywords: ['incident', 'breach', 'escalation', 'containment', 'notification', 'security operations'],
      rationaleTemplate: (name) =>
        `Mandate establishes mandatory response and escalation timelines for security breaches. Organizational control '${name}' operationalizes incident triage, containment, and notification protocols.`,
    },
    {
      domain: 'ACCESS_CONTROL',
      ruleMatched: 'ACCESS_CONTROL_MFA_ALIGNMENT',
      obligationKeywords: [
        'access control',
        'multi-factor',
        'mfa',
        'two-factor',
        'privileged user',
        'credential',
        'least privilege',
        'authentication',
      ],
      controlCategories: ['ACCESS_CONTROL', 'IDENTITY_AND_ACCESS', 'SECURITY'],
      controlKeywords: ['access control', 'mfa', 'multi-factor', 'privileged', 'credential', 'iam', 'least privilege'],
      rationaleTemplate: (name) =>
        `Regulatory directive requires stringent access authorization and multi-factor authentication. Organizational control '${name}' enforces user authentication, least privilege, and credential governance.`,
    },
    {
      domain: 'BUSINESS_CONTINUITY',
      ruleMatched: 'BUSINESS_CONTINUITY_RESILIENCE_ALIGNMENT',
      obligationKeywords: [
        'business continuity',
        'disaster recovery',
        'bcp',
        'rto',
        'rpo',
        'backup restoration',
        'contingency plan',
        'operational resilience',
      ],
      controlCategories: ['BUSINESS_CONTINUITY', 'DISASTER_RECOVERY', 'OPERATIONS'],
      controlKeywords: ['business continuity', 'disaster recovery', 'bcp', 'backup', 'failover', 'resilience'],
      rationaleTemplate: (name) =>
        `Regulatory standard enforces operational resilience and disaster recovery safeguards. Organizational control '${name}' operationalizes backup redundancies, failover readiness, and business continuity procedures.`,
    },
    {
      domain: 'VENDOR_MANAGEMENT',
      ruleMatched: 'VENDOR_RISK_MANAGEMENT_ALIGNMENT',
      obligationKeywords: [
        'third-party',
        'third party',
        'outsourcing risk',
        'vendor risk',
        'supplier security',
        'subcontractor due diligence',
        'supply chain risk',
      ],
      controlCategories: ['VENDOR_MANAGEMENT', 'THIRD_PARTY_RISK', 'SUPPLY_CHAIN'],
      controlKeywords: ['vendor', 'third party', 'outsourcing', 'supplier', 'due diligence', 'contractor'],
      rationaleTemplate: (name) =>
        `Regulatory directive governs third-party dependencies and vendor risk governance. Organizational control '${name}' provides third-party due diligence, contractual security requirements, and supplier monitoring.`,
    },
  ];

  /**
   * Deterministically identifies candidate control mappings for an eligible regulatory obligation.
   * Never forces a match if defensible criteria are not met.
   */
  public suggestMappingsForObligation(
    obligation: EvaluatedObligationMappingInput,
    availableControls: EvaluatedControlContext[],
  ): SuggestedMappingCandidate[] {
    const combinedObligationText = `${obligation.title} ${obligation.obligationWording} ${obligation.requiredAction || ''} ${obligation.affectedActor || ''}`.toLowerCase();

    // 1. Identify which domain rule(s) apply to this obligation
    const matchedRules = this.domainRules.filter((rule) =>
      rule.obligationKeywords.some((kw) => this.matchesKeyword(combinedObligationText, kw)),
    );

    if (matchedRules.length === 0) {
      this.logger.debug(
        `No domain rule criteria matched for obligation '${obligation.title}'. Leaving unmapped.`,
      );
      return [];
    }

    const suggestions: SuggestedMappingCandidate[] = [];

    // 2. Evaluate available controls against matched domain rules
    for (const rule of matchedRules) {
      for (const control of availableControls) {
        const controlCategory = (control.category || '').toUpperCase();
        const controlText = `${control.name} ${control.description}`.toLowerCase();

        const categoryMatches = rule.controlCategories.some((cat) => controlCategory.includes(cat));
        const keywordMatches = rule.controlKeywords.some((kw) => this.matchesKeyword(controlText, kw));

        // High confidence: Both category matches and specific keyword matches
        // Medium confidence: Strong keyword match even if category is generalized
        if (categoryMatches && keywordMatches) {
          const frameworkRefId = control.mappings?.[0]?.frameworkReferenceId || null;

          suggestions.push({
            controlId: control.id,
            frameworkReferenceId: frameworkRefId,
            status: MappingStatus.SUGGESTED,
            mappingMethod: ObligationMappingMethod.RULE_SUGGESTED,
            confidence: ObligationConfidence.HIGH,
            rationale: rule.rationaleTemplate(control.name),
            ruleMatched: rule.ruleMatched,
          });
        } else if (keywordMatches) {
          const frameworkRefId = control.mappings?.[0]?.frameworkReferenceId || null;

          suggestions.push({
            controlId: control.id,
            frameworkReferenceId: frameworkRefId,
            status: MappingStatus.SUGGESTED,
            mappingMethod: ObligationMappingMethod.RULE_SUGGESTED,
            confidence: ObligationConfidence.MEDIUM,
            rationale: rule.rationaleTemplate(control.name),
            ruleMatched: rule.ruleMatched,
          });
        }
      }
    }

    // Deduplicate suggestions by controlId (pick highest confidence)
    const uniqueMap = new Map<string, SuggestedMappingCandidate>();
    for (const s of suggestions) {
      const existing = uniqueMap.get(s.controlId);
      if (!existing || (existing.confidence === ObligationConfidence.MEDIUM && s.confidence === ObligationConfidence.HIGH)) {
        uniqueMap.set(s.controlId, s);
      }
    }

    return Array.from(uniqueMap.values());
  }

  /**
   * Helper that tests keyword matching with word-boundary awareness for short acronyms.
   */
  private matchesKeyword(text: string, kw: string): boolean {
    const cleanKw = kw.toLowerCase().trim();
    if (cleanKw.length <= 4 && !cleanKw.includes(' ')) {
      const regex = new RegExp(`\\b${cleanKw}\\b`, 'i');
      return regex.test(text);
    }
    return text.includes(cleanKw);
  }
}
