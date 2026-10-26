import {
  ControlGapEngineService,
  EvaluatedControlRecord,
  EvaluatedMappingRecord,
  EvaluatedObligationRecord,
} from './control-gap-engine.service';
import {
  AuditCheckResult,
  ControlGapOutcome,
  EvidenceScanStatus,
  EvidenceStatus,
  EvidenceSufficiencyOutcome,
  MappingStatus,
  TaskStatus,
} from '@prisma/client';

describe('ControlGapEngineService (Deterministic Gap & Evidence Logic)', () => {
  let engine: ControlGapEngineService;

  const baseObligation: EvaluatedObligationRecord = {
    id: 'ob-1',
    obligationIdentifier: 'RBI-CYBER-SEC-4',
    title: 'Network Switch Boundary Isolation',
    obligationWording: 'Commercial Banks shall isolate switches.',
    affectedActor: 'Commercial Banks',
  };

  const baseMapping: EvaluatedMappingRecord = {
    id: 'map-1',
    controlId: 'ctrl-1',
    status: MappingStatus.APPROVED,
    rationale: 'Network boundary control maps to switch isolation mandate.',
  };

  const baseControl: EvaluatedControlRecord = {
    id: 'ctrl-1',
    name: 'Network Boundary Segmentation',
    category: 'NETWORK_SECURITY',
    deletedAt: null,
    auditCheckItems: [],
    complianceTasks: [],
    evidenceAssociations: [],
  };

  beforeEach(() => {
    engine = new ControlGapEngineService();
  });

  describe('1. Control-Gap Outcome Determinations', () => {
    it('should determine NO_MAPPING when no mapping exists for applicable obligation', () => {
      const res = engine.evaluateGapAndSufficiency(baseObligation, null, null);

      expect(res.gapOutcome).toBe(ControlGapOutcome.NO_MAPPING);
      expect(res.evidenceOutcome).toBe(EvidenceSufficiencyOutcome.NOT_ASSESSED);
      expect(res.ruleMatched).toBe('NO_APPROVED_CONTROL_MAPPING');
      expect(res.gapRationale).toContain('has no approved internal control mapping');
    });

    it('should determine NO_MAPPING when mapping exists but status is SUGGESTED or REJECTED', () => {
      const suggestedMapping: EvaluatedMappingRecord = {
        ...baseMapping,
        status: MappingStatus.SUGGESTED,
      };

      const res = engine.evaluateGapAndSufficiency(baseObligation, suggestedMapping, baseControl);

      expect(res.gapOutcome).toBe(ControlGapOutcome.NO_MAPPING);
      expect(res.ruleMatched).toBe('NO_APPROVED_CONTROL_MAPPING');
    });

    it('should determine CONTROL_INELIGIBLE when approved control has been soft-deleted', () => {
      const deletedControl: EvaluatedControlRecord = {
        ...baseControl,
        deletedAt: new Date('2026-01-01'),
      };

      const res = engine.evaluateGapAndSufficiency(baseObligation, baseMapping, deletedControl);

      expect(res.gapOutcome).toBe(ControlGapOutcome.CONTROL_INELIGIBLE);
      expect(res.evidenceOutcome).toBe(EvidenceSufficiencyOutcome.NOT_ASSESSED);
      expect(res.ruleMatched).toBe('CONTROL_DELETED_OR_INACTIVE');
    });

    it('should determine NOT_IMPLEMENTED when operational audit check item is NON_COMPLIANT', () => {
      const nonCompliantControl: EvaluatedControlRecord = {
        ...baseControl,
        auditCheckItems: [
          {
            id: 'chk-1',
            title: 'Quarterly Switch Segmentation Audit',
            result: AuditCheckResult.NON_COMPLIANT,
            updatedAt: new Date(),
          },
        ],
      };

      const res = engine.evaluateGapAndSufficiency(baseObligation, baseMapping, nonCompliantControl);

      expect(res.gapOutcome).toBe(ControlGapOutcome.NOT_IMPLEMENTED);
      expect(res.ruleMatched).toBe('AUDIT_CHECK_NON_COMPLIANT');
      expect(res.gapRationale).toContain('failed operational audit evaluation');
    });

    it('should determine PARTIALLY_IMPLEMENTED when audit check item is PARTIALLY_COMPLIANT', () => {
      const partialControl: EvaluatedControlRecord = {
        ...baseControl,
        auditCheckItems: [
          {
            id: 'chk-1',
            title: 'VLAN Access Controls',
            result: AuditCheckResult.PARTIALLY_COMPLIANT,
            updatedAt: new Date(),
          },
        ],
      };

      const res = engine.evaluateGapAndSufficiency(baseObligation, baseMapping, partialControl);

      expect(res.gapOutcome).toBe(ControlGapOutcome.PARTIALLY_IMPLEMENTED);
      expect(res.ruleMatched).toBe('AUDIT_CHECK_PARTIALLY_COMPLIANT');
    });

    it('should determine IMPLEMENTED when operational audit check item is COMPLIANT', () => {
      const compliantControl: EvaluatedControlRecord = {
        ...baseControl,
        auditCheckItems: [
          {
            id: 'chk-1',
            title: 'Annual Perimeter Penetration Test',
            result: AuditCheckResult.COMPLIANT,
            updatedAt: new Date(),
          },
        ],
      };

      const res = engine.evaluateGapAndSufficiency(baseObligation, baseMapping, compliantControl);

      expect(res.gapOutcome).toBe(ControlGapOutcome.IMPLEMENTED);
      expect(res.ruleMatched).toBe('AUDIT_CHECK_COMPLIANT');
    });

    it('should evaluate task status when no audit check items exist (all COMPLETE -> IMPLEMENTED)', () => {
      const taskCompleteControl: EvaluatedControlRecord = {
        ...baseControl,
        complianceTasks: [
          {
            id: 'tsk-1',
            title: 'Deploy Switch Access Rules',
            status: TaskStatus.COMPLETE,
            dueDate: new Date(),
          },
        ],
      };

      const res = engine.evaluateGapAndSufficiency(baseObligation, baseMapping, taskCompleteControl);

      expect(res.gapOutcome).toBe(ControlGapOutcome.IMPLEMENTED);
      expect(res.ruleMatched).toBe('COMPLIANCE_TASKS_COMPLETE');
    });

    it('should determine UNKNOWN_IMPLEMENTATION when neither audit checks nor tasks exist', () => {
      const res = engine.evaluateGapAndSufficiency(baseObligation, baseMapping, baseControl);

      expect(res.gapOutcome).toBe(ControlGapOutcome.UNKNOWN_IMPLEMENTATION);
      expect(res.ruleMatched).toBe('NO_IMPLEMENTATION_RECORDS');
    });
  });

  describe('2. Evidence Sufficiency Determinations', () => {
    it('should determine INSUFFICIENT when zero evidence records are attached to control', () => {
      const res = engine.evaluateGapAndSufficiency(baseObligation, baseMapping, baseControl);

      expect(res.evidenceOutcome).toBe(EvidenceSufficiencyOutcome.INSUFFICIENT);
      expect(res.evidenceRationale).toContain('No evidence artifacts or documentation are attached');
    });

    it('should determine UNVERIFIED when attached evidence has not passed security scan', () => {
      const unverifiedEvidenceControl: EvaluatedControlRecord = {
        ...baseControl,
        evidenceAssociations: [
          {
            evidence: {
              id: 'ev-1',
              title: 'Switch Configuration Export',
              fileName: 'switch-config.txt',
              fileSize: 2048,
              mimeType: 'text/plain',
              storageKey: 'tenants/org-1/ev-1.txt',
              checksum: 'sha-1',
              status: EvidenceStatus.PENDING,
              scanStatus: EvidenceScanStatus.PENDING_SCAN,
              createdAt: new Date(),
              retentionUntil: null,
              deletedAt: null,
            },
          },
        ],
      };

      const res = engine.evaluateGapAndSufficiency(
        baseObligation,
        baseMapping,
        unverifiedEvidenceControl,
      );

      expect(res.evidenceOutcome).toBe(EvidenceSufficiencyOutcome.UNVERIFIED);
      expect(res.evidenceRationale).toContain('has not passed malware verification');
    });

    it('should determine STALE when attached evidence is older than 1 year or expired', () => {
      const twoYearsAgo = new Date();
      twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);

      const staleEvidenceControl: EvaluatedControlRecord = {
        ...baseControl,
        evidenceAssociations: [
          {
            evidence: {
              id: 'ev-1',
              title: 'Old Firewall Rulesheet',
              fileName: 'firewall-2024.pdf',
              fileSize: 4096,
              mimeType: 'application/pdf',
              storageKey: 'tenants/org-1/old.pdf',
              checksum: 'sha-old',
              status: EvidenceStatus.ACTIVE,
              scanStatus: EvidenceScanStatus.CLEAN,
              createdAt: twoYearsAgo,
              retentionUntil: null,
              deletedAt: null,
            },
          },
        ],
      };

      const res = engine.evaluateGapAndSufficiency(
        baseObligation,
        baseMapping,
        staleEvidenceControl,
      );

      expect(res.evidenceOutcome).toBe(EvidenceSufficiencyOutcome.STALE);
      expect(res.evidenceRationale).toContain('exceeds the 1-year freshness window');
    });

    it('should determine SUFFICIENT when evidence is clean, active, and within freshness window', () => {
      const freshEvidenceControl: EvaluatedControlRecord = {
        ...baseControl,
        evidenceAssociations: [
          {
            evidence: {
              id: 'ev-fresh-1',
              title: 'Q3 2026 Core Switch Firewall Configuration',
              fileName: 'q3-firewall-config.pdf',
              fileSize: 8192,
              mimeType: 'application/pdf',
              storageKey: 'tenants/org-1/q3.pdf',
              checksum: 'sha256-verified-clean',
              status: EvidenceStatus.ACTIVE,
              scanStatus: EvidenceScanStatus.CLEAN,
              createdAt: new Date(),
              retentionUntil: null,
              deletedAt: null,
            },
          },
        ],
      };

      const res = engine.evaluateGapAndSufficiency(
        baseObligation,
        baseMapping,
        freshEvidenceControl,
      );

      expect(res.evidenceOutcome).toBe(EvidenceSufficiencyOutcome.SUFFICIENT);
      expect(res.evidenceRationale).toContain('Verified, clean evidence artifacts');
    });
  });
});
