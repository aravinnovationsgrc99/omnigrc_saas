import { Injectable, Logger } from '@nestjs/common';
import { GrcDomain } from '@omnigrc/shared';

export enum GrcQueryIntent {
  COMPLIANCE_POSTURE = 'COMPLIANCE_POSTURE',
  INEFFECTIVE_OR_FAILING_CONTROLS = 'INEFFECTIVE_OR_FAILING_CONTROLS',
  HIGHEST_RISKS = 'HIGHEST_RISKS',
  OVERDUE_AUDIT_FINDINGS = 'OVERDUE_AUDIT_FINDINGS',
  HIGH_RISK_OR_EXPIRING_VENDORS = 'HIGH_RISK_OR_EXPIRING_VENDORS',
  REGULATORY_UPDATES = 'REGULATORY_UPDATES',
  UNMAPPED_OBLIGATIONS = 'UNMAPPED_OBLIGATIONS',
  OVERDUE_REMEDIATION = 'OVERDUE_REMEDIATION',
  POLICY_GOVERNANCE = 'POLICY_GOVERNANCE',
  PRIORITY_ACTIONS = 'PRIORITY_ACTIONS',
  ENTITY_SPECIFIC = 'ENTITY_SPECIFIC',
  GENERAL_GRC = 'GENERAL_GRC',
}

export interface ExtractedEntities {
  frameworks: string[];
  controlCodes: string[];
  vendorNames: string[];
  riskTerms: string[];
  policyTerms: string[];
  auditTerms: string[];
  regulatoryTerms: string[];
}

export interface QueryAnalysisResult {
  rawQuery: string;
  normalizedQuery: string;
  intent: GrcQueryIntent;
  domain: GrcDomain;
  entities: ExtractedEntities;
  isFollowUp: boolean;
  followUpTargetDomain?: GrcDomain;
  explanation: {
    intentIdentified: string;
    rationale: string;
    scopeApplied: string;
  };
}

@Injectable()
export class GrcNlpService {
  private readonly logger = new Logger(GrcNlpService.name);

  // Common framework patterns
  private readonly frameworkPatterns: Record<string, RegExp> = {
    'ISO 27001': /\b(iso\s*27001|iso27001|isms)\b/i,
    'SOC 2': /\b(soc\s*2|soc2|ssae\s*18)\b/i,
    'GDPR': /\b(gdpr|general\s*data\s*protection)\b/i,
    'DPDP': /\b(dpdp|digital\s*personal\s*data)\b/i,
    'HIPAA': /\b(hipaa|health\s*insurance\s*portability)\b/i,
    'ISO 42001': /\b(iso\s*42001|iso42001|ai\s*management)\b/i,
    'RBI': /\b(rbi|reserve\s*bank|rbi\s*cyber|master\s*direction)\b/i,
    'PCI-DSS': /\b(pci\s*dss|pci-dss|cardholder)\b/i,
  };

  /**
   * Performs intent classification, entity extraction, normalization, and follow-up detection.
   */
  public analyzeQuery(
    rawQuery: string,
    history?: { role: string; content: string }[],
    pageContext?: { module?: string; resourceType?: string; resourceTitle?: string; resourceId?: string },
  ): QueryAnalysisResult {
    const normalized = this.normalizeQueryText(rawQuery);
    const entities = this.extractEntities(normalized);
    const followUp = this.detectFollowUp(normalized, history);

    let intent = this.classifyIntent(normalized, entities);
    let domain = this.resolveDomainFromIntent(intent);

    // If page context is provided and intent was generic, specialize intent to the active page
    if (pageContext?.module && (intent === GrcQueryIntent.GENERAL_GRC || intent === GrcQueryIntent.ENTITY_SPECIFIC)) {
      if (pageContext.module.includes('vendor')) {
        intent = GrcQueryIntent.HIGH_RISK_OR_EXPIRING_VENDORS;
        domain = 'vendor';
      } else if (pageContext.module.includes('control')) {
        intent = GrcQueryIntent.INEFFECTIVE_OR_FAILING_CONTROLS;
        domain = 'compliance';
      } else if (pageContext.module.includes('audit')) {
        intent = GrcQueryIntent.OVERDUE_AUDIT_FINDINGS;
        domain = 'audit';
      } else if (pageContext.module.includes('regulatory')) {
        intent = GrcQueryIntent.REGULATORY_UPDATES;
        domain = 'regulatory';
      } else if (pageContext.module.includes('risk')) {
        intent = GrcQueryIntent.HIGHEST_RISKS;
        domain = 'risk';
      } else if (pageContext.module.includes('polic')) {
        intent = GrcQueryIntent.POLICY_GOVERNANCE;
        domain = 'governance';
      }
    }

    // Follow-up inheritance: if user asks "Which of these have expired evidence?" and previous was about vendors
    if (followUp.isFollowUp && followUp.previousDomain) {
      domain = followUp.previousDomain;
      if (domain === 'vendor') {
        intent = GrcQueryIntent.HIGH_RISK_OR_EXPIRING_VENDORS;
      } else if (domain === 'compliance' || domain === 'general') {
        intent = GrcQueryIntent.INEFFECTIVE_OR_FAILING_CONTROLS;
      }
    }

    const explanation = {
      intentIdentified: intent,
      rationale: this.getIntentRationale(intent, entities, followUp.isFollowUp),
      scopeApplied: `Domain: ${domain.toUpperCase()} | Tenant-scoped authorized live data`,
    };

    return {
      rawQuery,
      normalizedQuery: normalized,
      intent,
      domain,
      entities,
      isFollowUp: followUp.isFollowUp,
      followUpTargetDomain: followUp.previousDomain,
      explanation,
    };
  }

  /**
   * Normalizes colloquial phrasing to canonical GRC concepts.
   */
  private normalizeQueryText(text: string): string {
    if (!text) return '';
    let s = text.trim();

    // Normalizations
    s = s.replace(/\bwhere\s+are\s+we\s+non[- ]?compliant\b/gi, 'what are our compliance gaps and failing controls');
    s = s.replace(/\bwhat\s+needs\s+attention\s+for\s+compliance\b/gi, 'what is our compliance posture and failing controls');
    s = s.replace(/\bwhich\s+controls\s+are\s+broken\b/gi, 'which controls are ineffective or failing');
    s = s.replace(/\bwho\s+messed\s+up\s+audits\b/gi, 'which audit findings are overdue');
    s = s.replace(/\bshow\s+me\s+bad\s+vendors\b/gi, 'which vendors have high residual risk');
    s = s.replace(/\bwhat\s+did\s+rbi\s+change\b/gi, 'what regulatory updates from RBI could affect us');
    s = s.replace(/\bwhat\s+should\s+we\s+do\s+this\s+week\b/gi, 'what are the most important GRC actions to prioritize this week');

    return s;
  }

  /**
   * Extracts referenced frameworks, control identifiers, vendor names, etc.
   */
  private extractEntities(text: string): ExtractedEntities {
    const frameworks: string[] = [];
    for (const [name, regex] of Object.entries(this.frameworkPatterns)) {
      if (regex.test(text)) {
        frameworks.push(name);
      }
    }

    // Control codes like AC-1, IA-2, CC6.1, A.9.1.1, CTRL-01
    const controlMatches = text.match(/\b([A-Z]{1,4}[-._]\d{1,3}(\.\d{1,2})?|CTRL[-_]\d{1,4})\b/gi) || [];
    const controlCodes = Array.from(new Set(controlMatches.map((c) => c.toUpperCase())));

    // Recognized vendor names or keywords
    const vendorMatches = text.match(/\b(aws|amazon\s*web\s*services|snowflake|datadog|slack|salesforce|crowdstrike|github|google\s*cloud|gcp|azure|microsoft)\b/gi) || [];
    const vendorNames = Array.from(new Set(vendorMatches.map((v) => v.trim())));

    // Risk terms (e.g., RK-01, ransomware, phishing, data breach)
    const riskMatches = text.match(/\b(rk[-_]\d{1,4}|ransomware|phishing|data\s*breach|insider\s*threat|supply\s*chain)\b/gi) || [];
    const riskTerms = Array.from(new Set(riskMatches.map((r) => r.trim())));

    // Policy terms
    const policyMatches = text.match(/\b(acceptable\s*use|access\s*control|password|incident\s*response|disaster\s*recovery|remote\s*work|data\s*retention)\s*policy\b/gi) || [];
    const policyTerms = Array.from(new Set(policyMatches.map((p) => p.trim())));

    // Audit terms
    const auditMatches = text.match(/\b(internal\s*audit|external\s*audit|surveillance\s*audit|fy\d{2,4}\s*audit)\b/gi) || [];
    const auditTerms = Array.from(new Set(auditMatches.map((a) => a.trim())));

    // Regulatory terms
    const regMatches = text.match(/\b(circular|master\s*direction|directive|advisory|guideline|rbi\s*notification)\b/gi) || [];
    const regulatoryTerms = Array.from(new Set(regMatches.map((r) => r.trim())));

    return {
      frameworks,
      controlCodes,
      vendorNames,
      riskTerms,
      policyTerms,
      auditTerms,
      regulatoryTerms,
    };
  }

  /**
   * Classifies user intent into canonical GRC categories.
   */
  private classifyIntent(normalized: string, entities: ExtractedEntities): GrcQueryIntent {
    const lower = normalized.toLowerCase();

    // 10 Mandatory Standard Question Intents
    if (lower.includes('prioritize this week') || lower.includes('priority') && (lower.includes('action') || lower.includes('grc action') || lower.includes('week') || lower.includes('urgent'))) {
      return GrcQueryIntent.PRIORITY_ACTIONS;
    }
    if ((lower.includes('polic') || lower.includes('governance')) && (lower.includes('review') || lower.includes('approval') || lower.includes('renewal') || lower.includes('expire') || lower.includes('attestation') || lower.includes('owner'))) {
      return GrcQueryIntent.POLICY_GOVERNANCE;
    }
    if ((lower.includes('remediation') || lower.includes('capa')) && (lower.includes('overdue') || lower.includes('owner') || lower.includes('task') || lower.includes('deadline'))) {
      return GrcQueryIntent.OVERDUE_REMEDIATION;
    }
    if (lower.includes('obligation') && (lower.includes('unmapped') || lower.includes('not mapped') || lower.includes('control') || lower.includes('gap'))) {
      return GrcQueryIntent.UNMAPPED_OBLIGATIONS;
    }
    if (lower.includes('regulatory') && (lower.includes('update') || lower.includes('affect') || lower.includes('publication') || lower.includes('circular') || lower.includes('change'))) {
      return GrcQueryIntent.REGULATORY_UPDATES;
    }
    if (lower.includes('vendor') || lower.includes('third-party') || lower.includes('third party')) {
      return GrcQueryIntent.HIGH_RISK_OR_EXPIRING_VENDORS;
    }
    if (lower.includes('audit') && (lower.includes('finding') || lower.includes('unresolved') || lower.includes('overdue') || lower.includes('observation'))) {
      return GrcQueryIntent.OVERDUE_AUDIT_FINDINGS;
    }
    if (lower.includes('risk')) {
      return GrcQueryIntent.HIGHEST_RISKS;
    }
    if (lower.includes('control') && (lower.includes('ineffective') || lower.includes('failing') || lower.includes('missing evidence') || lower.includes('broken') || lower.includes('not tested'))) {
      return GrcQueryIntent.INEFFECTIVE_OR_FAILING_CONTROLS;
    }
    if (lower.includes('compliance posture') || lower.includes('posture across') || lower.includes('active framework') || lower.includes('overall compliance')) {
      return GrcQueryIntent.COMPLIANCE_POSTURE;
    }

    // Specific entity target
    if (lower.includes('vulnerab') || lower.includes('cve')) return GrcQueryIntent.INEFFECTIVE_OR_FAILING_CONTROLS;
    if (lower.includes('incident')) return GrcQueryIntent.HIGHEST_RISKS;
    if (lower.includes('audit plan') || lower.includes('upcoming audit') || lower.includes('scheduled audit')) return GrcQueryIntent.OVERDUE_AUDIT_FINDINGS;
    if (entities.vendorNames.length > 0) return GrcQueryIntent.HIGH_RISK_OR_EXPIRING_VENDORS;
    if (entities.controlCodes.length > 0) return GrcQueryIntent.INEFFECTIVE_OR_FAILING_CONTROLS;
    if (entities.frameworks.length > 0 && (lower.includes('posture') || lower.includes('gap') || lower.includes('readiness'))) {
      return GrcQueryIntent.COMPLIANCE_POSTURE;
    }
    if (entities.policyTerms.length > 0) return GrcQueryIntent.POLICY_GOVERNANCE;
    if (entities.riskTerms.length > 0) return GrcQueryIntent.HIGHEST_RISKS;

    // General GRC fallback
    return GrcQueryIntent.GENERAL_GRC;
  }

  /**
   * Maps intent to canonical domain.
   */
  private resolveDomainFromIntent(intent: GrcQueryIntent): GrcDomain {
    switch (intent) {
      case GrcQueryIntent.COMPLIANCE_POSTURE:
      case GrcQueryIntent.INEFFECTIVE_OR_FAILING_CONTROLS:
        return 'compliance';
      case GrcQueryIntent.HIGHEST_RISKS:
        return 'risk';
      case GrcQueryIntent.OVERDUE_AUDIT_FINDINGS:
        return 'audit';
      case GrcQueryIntent.HIGH_RISK_OR_EXPIRING_VENDORS:
        return 'vendor';
      case GrcQueryIntent.REGULATORY_UPDATES:
      case GrcQueryIntent.UNMAPPED_OBLIGATIONS:
        return 'regulatory';
      case GrcQueryIntent.OVERDUE_REMEDIATION:
        return 'remediation';
      case GrcQueryIntent.POLICY_GOVERNANCE:
        return 'governance';
      case GrcQueryIntent.PRIORITY_ACTIONS:
      case GrcQueryIntent.GENERAL_GRC:
      case GrcQueryIntent.ENTITY_SPECIFIC:
      default:
        return 'general';
    }
  }

  /**
   * Detects follow-up questions referencing previous answers (e.g. "which of these", "what about them").
   */
  private detectFollowUp(
    normalized: string,
    history?: { role: string; content: string }[],
  ): { isFollowUp: boolean; previousDomain?: GrcDomain } {
    if (!history || history.length === 0) {
      return { isFollowUp: false };
    }

    const lower = normalized.toLowerCase();
    const isAnaphoric =
      lower.startsWith('which of these') ||
      lower.startsWith('which of those') ||
      lower.startsWith('what about them') ||
      lower.startsWith('show me more about these') ||
      lower.includes('of these') ||
      lower.includes('of those') ||
      lower.includes('that one') ||
      lower.includes('about that') ||
      lower.includes('more about') ||
      lower.includes('tell me more') ||
      lower.includes('who owns it');

    if (!isAnaphoric) {
      return { isFollowUp: false };
    }

    // Inspect last assistant or user message
    const lastMsg = history[history.length - 1]?.content.toLowerCase() || '';
    if (lastMsg.includes('vendor') || lastMsg.includes('third party')) return { isFollowUp: true, previousDomain: 'vendor' };
    if (lastMsg.includes('control')) return { isFollowUp: true, previousDomain: 'compliance' };
    if (lastMsg.includes('risk')) return { isFollowUp: true, previousDomain: 'risk' };
    if (lastMsg.includes('audit')) return { isFollowUp: true, previousDomain: 'audit' };
    if (lastMsg.includes('policy')) return { isFollowUp: true, previousDomain: 'governance' };
    if (lastMsg.includes('obligation') || lastMsg.includes('regulatory')) return { isFollowUp: true, previousDomain: 'regulatory' };

    return { isFollowUp: true, previousDomain: 'general' };
  }

  private getIntentRationale(intent: GrcQueryIntent, entities: ExtractedEntities, isFollowUp: boolean): string {
    if (isFollowUp) {
      return 'Follow-up query referencing entities from prior conversation step.';
    }
    if (entities.frameworks.length > 0) {
      return `Targeted compliance evaluation for framework(s): ${entities.frameworks.join(', ')}.`;
    }
    if (entities.vendorNames.length > 0) {
      return `Targeted third-party evaluation for vendor(s): ${entities.vendorNames.join(', ')}.`;
    }
    if (entities.controlCodes.length > 0) {
      return `Specific security control inspection for code(s): ${entities.controlCodes.join(', ')}.`;
    }
    return `Classified as ${intent} based on semantic terminology in user prompt.`;
  }
}
