import {
  MappingSuggestionEngineService,
  EvaluatedControlContext,
  EvaluatedObligationMappingInput,
} from './mapping-suggestion-engine.service';
import {
  MappingStatus,
  ObligationConfidence,
  ObligationMappingMethod,
} from '@prisma/client';

describe('MappingSuggestionEngineService (Deterministic Suggestion Rules)', () => {
  let engine: MappingSuggestionEngineService;

  const mockControls: EvaluatedControlContext[] = [
    {
      id: 'ctrl-net-1',
      organizationId: 'org-tenant-1',
      name: 'Critical Network Boundary Segmentation',
      description: 'Isolates internal core banking and payment processing switch networks via firewalls.',
      category: 'NETWORK_SECURITY',
      mappings: [
        {
          frameworkReferenceId: 'ref-iso-a820',
          frameworkReference: {
            identifier: 'A.8.20',
            title: 'Network Security',
          },
        },
      ],
    },
    {
      id: 'ctrl-priv-1',
      organizationId: 'org-tenant-1',
      name: 'Data Principal Consent & Rights Management',
      description: 'Manages user consent records, withdrawal workflows, and personal data privacy inventory.',
      category: 'DATA_PROTECTION',
      mappings: [],
    },
    {
      id: 'ctrl-inc-1',
      organizationId: 'org-tenant-1',
      name: 'Cybersecurity Incident Response and Escalation',
      description: 'Enforces 6-hour incident containment, logging, triage, and regulatory breach notification procedures.',
      category: 'INCIDENT_RESPONSE',
      mappings: [],
    },
    {
      id: 'ctrl-iam-1',
      organizationId: 'org-tenant-1',
      name: 'Privileged Access Control & MFA',
      description: 'Enforces multi-factor authentication and role-based access for administrative systems.',
      category: 'ACCESS_CONTROL',
      mappings: [],
    },
    {
      id: 'ctrl-bcp-1',
      organizationId: 'org-tenant-1',
      name: 'Business Continuity & Disaster Recovery',
      description: 'Automated daily backup replication, RTO/RPO metrics, and failover disaster recovery procedures.',
      category: 'BUSINESS_CONTINUITY',
      mappings: [],
    },
    {
      id: 'ctrl-vrm-1',
      organizationId: 'org-tenant-1',
      name: 'Vendor & Third-Party Risk Due Diligence',
      description: 'Contractual security clauses, supplier audits, and outsourcing risk assessments.',
      category: 'VENDOR_MANAGEMENT',
      mappings: [],
    },
  ];

  beforeEach(() => {
    engine = new MappingSuggestionEngineService();
  });

  describe('1. Thematic Alignment & Rule Matching', () => {
    it('should suggest network security control for network segmentation mandate with HIGH confidence', () => {
      const obligation: EvaluatedObligationMappingInput = {
        obligationId: 'ob-net-1',
        title: 'Isolation of Core Payment Switches and Network Perimeter',
        obligationWording: 'All Commercial Banks shall isolate critical payment switch networks from public-facing infrastructure.',
        requiredAction: 'Isolate payment switch networks using firewalls and network segmentation',
        affectedActor: 'Commercial Banks',
      };

      const suggestions = engine.suggestMappingsForObligation(obligation, mockControls);

      expect(suggestions).toHaveLength(1);
      expect(suggestions[0].controlId).toBe('ctrl-net-1');
      expect(suggestions[0].confidence).toBe(ObligationConfidence.HIGH);
      expect(suggestions[0].status).toBe(MappingStatus.SUGGESTED);
      expect(suggestions[0].mappingMethod).toBe(ObligationMappingMethod.RULE_SUGGESTED);
      expect(suggestions[0].ruleMatched).toBe('NETWORK_SEGMENTATION_ALIGNMENT');
      expect(suggestions[0].rationale).toContain('Critical Network Boundary Segmentation');
      expect(suggestions[0].frameworkReferenceId).toBe('ref-iso-a820');
    });

    it('should suggest personal data protection control for DPDP consent mandate', () => {
      const obligation: EvaluatedObligationMappingInput = {
        obligationId: 'ob-dpdp-1',
        title: 'Notice and Consent Architecture for Data Fiduciaries',
        obligationWording: 'Every Data Fiduciary shall provide clear notice and obtain verifiable consent before personal data processing.',
        requiredAction: 'Implement notice and consent workflow',
        affectedActor: 'Data Fiduciaries',
      };

      const suggestions = engine.suggestMappingsForObligation(obligation, mockControls);

      expect(suggestions).toHaveLength(1);
      expect(suggestions[0].controlId).toBe('ctrl-priv-1');
      expect(suggestions[0].ruleMatched).toBe('DATA_PROTECTION_GOVERNANCE_ALIGNMENT');
      expect(suggestions[0].confidence).toBe(ObligationConfidence.HIGH);
    });

    it('should suggest incident response control for CERT-In 6-hour incident reporting obligation', () => {
      const obligation: EvaluatedObligationMappingInput = {
        obligationId: 'ob-cert-1',
        title: 'Mandatory 6-Hour Cybersecurity Incident Reporting',
        obligationWording: 'All service providers, intermediaries, and corporate bodies shall report cybersecurity incidents to CERT-In within 6 hours.',
        requiredAction: 'Report incidents within 6-hour window',
        affectedActor: 'Intermediaries and Corporate Entities',
      };

      const suggestions = engine.suggestMappingsForObligation(obligation, mockControls);

      expect(suggestions).toHaveLength(1);
      expect(suggestions[0].controlId).toBe('ctrl-inc-1');
      expect(suggestions[0].ruleMatched).toBe('INCIDENT_RESPONSE_PROCEDURE_ALIGNMENT');
      expect(suggestions[0].confidence).toBe(ObligationConfidence.HIGH);
    });

    it('should suggest access control for MFA and privileged credential requirements', () => {
      const obligation: EvaluatedObligationMappingInput = {
        obligationId: 'ob-iam-1',
        title: 'Mandatory Multi-Factor Authentication for Privileged Access',
        obligationWording: 'Regulated entities must implement multi-factor authentication (MFA) for all administrative and privileged user access.',
        requiredAction: 'Enforce MFA on privileged access',
        affectedActor: 'Regulated Entities',
      };

      const suggestions = engine.suggestMappingsForObligation(obligation, mockControls);

      expect(suggestions).toHaveLength(1);
      expect(suggestions[0].controlId).toBe('ctrl-iam-1');
      expect(suggestions[0].ruleMatched).toBe('ACCESS_CONTROL_MFA_ALIGNMENT');
    });
  });

  describe('2. Unmapped Obligations & Defensible Matching Limits', () => {
    it('should return empty suggestions when no defensible control match exists (never force a match)', () => {
      const obligation: EvaluatedObligationMappingInput = {
        obligationId: 'ob-env-1',
        title: 'Corporate Environmental Carbon Footprint Disclosure',
        obligationWording: 'Entities shall disclose annual Scope 1 and Scope 2 greenhouse gas emissions.',
        requiredAction: 'Disclose emissions report',
        affectedActor: 'Listed Entities',
      };

      const suggestions = engine.suggestMappingsForObligation(obligation, mockControls);

      // Verify that engine strictly refuses to force an irrelevant control match
      expect(suggestions).toHaveLength(0);
    });

    it('should return empty suggestions when organization has zero configured controls', () => {
      const obligation: EvaluatedObligationMappingInput = {
        obligationId: 'ob-net-1',
        title: 'Network Boundary Segmentation',
        obligationWording: 'All Banks shall isolate networks.',
      };

      const suggestions = engine.suggestMappingsForObligation(obligation, []);
      expect(suggestions).toHaveLength(0);
    });
  });
});
