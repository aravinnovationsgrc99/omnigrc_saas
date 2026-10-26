import { Injectable, Logger } from '@nestjs/common';
import {
  AuditCheckResult,
  ControlGapOutcome,
  DeterminationType,
  EvidenceScanStatus,
  EvidenceStatus,
  EvidenceSufficiencyOutcome,
  MappingStatus,
  ObligationConfidence,
  TaskStatus,
} from '@prisma/client';

export interface EvaluatedControlRecord {
  id: string;
  name: string;
  category: string | null;
  deletedAt: Date | null;
  auditCheckItems?: Array<{
    id: string;
    title: string;
    result: AuditCheckResult;
    updatedAt: Date;
  }>;
  complianceTasks?: Array<{
    id: string;
    title: string;
    status: TaskStatus;
    dueDate: Date | null;
  }>;
  evidenceAssociations?: Array<{
    evidence: {
      id: string;
      title: string;
      fileName: string;
      fileSize: number;
      mimeType: string;
      storageKey: string;
      checksum: string | null;
      status: EvidenceStatus;
      scanStatus: EvidenceScanStatus;
      createdAt: Date;
      retentionUntil: Date | null;
      deletedAt: Date | null;
      approvalAssociations?: any[];
    };
  }>;
}

export interface EvaluatedMappingRecord {
  id: string;
  controlId: string;
  status: MappingStatus;
  rationale: string;
  frameworkReferenceId?: string | null;
}

export interface EvaluatedObligationRecord {
  id: string;
  obligationIdentifier?: string | null;
  title: string;
  obligationWording: string;
  requiredAction?: string | null;
  affectedActor?: string | null;
  publicationId?: string | null;
  publicationVersionId?: string | null;
}

export interface ControlGapDetermination {
  gapOutcome: ControlGapOutcome;
  evidenceOutcome: EvidenceSufficiencyOutcome;
  determinationType: DeterminationType;
  confidence: ObligationConfidence;
  gapRationale: string;
  evidenceRationale: string;
  ruleMatched: string;
  evaluatedRecords: Record<string, any>;
}

@Injectable()
export class ControlGapEngineService {
  private readonly logger = new Logger(ControlGapEngineService.name);

  /**
   * Deterministically evaluates control implementation gaps and evidence sufficiency
   * based on explicit system records and verifiable evidence metadata.
   */
  public evaluateGapAndSufficiency(
    obligation: EvaluatedObligationRecord,
    mapping?: EvaluatedMappingRecord | null,
    control?: EvaluatedControlRecord | null,
  ): ControlGapDetermination {
    const evaluatedRecords = {
      obligationId: obligation.id,
      obligationIdentifier: obligation.obligationIdentifier,
      obligationTitle: obligation.title,
      mappingId: mapping?.id || null,
      mappingStatus: mapping?.status || null,
      controlId: control?.id || null,
      controlName: control?.name || null,
      controlCategory: control?.category || null,
      controlDeletedAt: control?.deletedAt?.toISOString() || null,
      auditChecksCount: control?.auditCheckItems?.length || 0,
      tasksCount: control?.complianceTasks?.length || 0,
      evidenceCount: control?.evidenceAssociations?.length || 0,
    };

    // 1. Case: No approved control mapping exists
    if (!mapping || mapping.status !== MappingStatus.APPROVED) {
      return {
        gapOutcome: ControlGapOutcome.NO_MAPPING,
        evidenceOutcome: EvidenceSufficiencyOutcome.NOT_ASSESSED,
        determinationType: DeterminationType.RULE_DERIVED,
        confidence: ObligationConfidence.HIGH,
        gapRationale:
          'Regulatory obligation is assessed as applicable to the organization, but has no approved internal control mapping. No defensive control is currently assigned to satisfy this mandate.',
        evidenceRationale:
          'Evidence sufficiency cannot be assessed without an assigned organizational control.',
        ruleMatched: 'NO_APPROVED_CONTROL_MAPPING',
        evaluatedRecords,
      };
    }

    // 2. Case: Control is missing, soft-deleted, or inactive
    if (!control || control.deletedAt !== null) {
      return {
        gapOutcome: ControlGapOutcome.CONTROL_INELIGIBLE,
        evidenceOutcome: EvidenceSufficiencyOutcome.NOT_ASSESSED,
        determinationType: DeterminationType.RULE_DERIVED,
        confidence: ObligationConfidence.HIGH,
        gapRationale: `Approved control mapping references control '${control?.name || mapping.controlId}' which has been deleted or deactivated in the system.`,
        evidenceRationale:
          'Control is deleted or inactive; evidence sufficiency is not evaluated.',
        ruleMatched: 'CONTROL_DELETED_OR_INACTIVE',
        evaluatedRecords,
      };
    }

    // 3. Evaluate Control Implementation State
    let gapOutcome: ControlGapOutcome = ControlGapOutcome.UNKNOWN_IMPLEMENTATION;
    let gapRationale = '';
    let gapRule = 'NO_IMPLEMENTATION_RECORDS';

    const checkItems = control.auditCheckItems || [];
    const evaluatedCheck = checkItems.find((i) => i.result !== AuditCheckResult.NOT_EVALUATED);

    if (evaluatedCheck) {
      if (evaluatedCheck.result === AuditCheckResult.NON_COMPLIANT) {
        gapOutcome = ControlGapOutcome.NOT_IMPLEMENTED;
        gapRationale = `Control '${control.name}' failed operational audit evaluation with result 'NON_COMPLIANT' (Check item: '${evaluatedCheck.title}'). Control is documented but operational testing failed.`;
        gapRule = 'AUDIT_CHECK_NON_COMPLIANT';
      } else if (evaluatedCheck.result === AuditCheckResult.PARTIALLY_COMPLIANT) {
        gapOutcome = ControlGapOutcome.PARTIALLY_IMPLEMENTED;
        gapRationale = `Control '${control.name}' was evaluated with result 'PARTIALLY_COMPLIANT' in operational audit check '${evaluatedCheck.title}'. Operational deficiencies exist.`;
        gapRule = 'AUDIT_CHECK_PARTIALLY_COMPLIANT';
      } else if (evaluatedCheck.result === AuditCheckResult.COMPLIANT) {
        gapOutcome = ControlGapOutcome.IMPLEMENTED;
        gapRationale = `Operational audit evaluation verified control compliance (COMPLIANT) for control '${control.name}'.`;
        gapRule = 'AUDIT_CHECK_COMPLIANT';
      }
    } else {
      // Evaluate Compliance Tasks if no audit check item exists
      const tasks = control.complianceTasks || [];
      if (tasks.length > 0) {
        const allComplete = tasks.every((t) => t.status === TaskStatus.COMPLETE);
        const anyInProgress = tasks.some(
          (t) => t.status === TaskStatus.IN_PROGRESS || t.status === TaskStatus.UNDER_REVIEW,
        );
        const allNotStarted = tasks.every((t) => t.status === TaskStatus.NOT_STARTED);

        if (allComplete) {
          gapOutcome = ControlGapOutcome.IMPLEMENTED;
          gapRationale = `All implementation tasks for control '${control.name}' are marked COMPLETE.`;
          gapRule = 'COMPLIANCE_TASKS_COMPLETE';
        } else if (anyInProgress) {
          gapOutcome = ControlGapOutcome.PARTIALLY_IMPLEMENTED;
          gapRationale = `Implementation tasks for control '${control.name}' are currently IN_PROGRESS or UNDER_REVIEW.`;
          gapRule = 'COMPLIANCE_TASKS_IN_PROGRESS';
        } else if (allNotStarted) {
          gapOutcome = ControlGapOutcome.NOT_IMPLEMENTED;
          gapRationale = `Implementation tasks for control '${control.name}' have status NOT_STARTED.`;
          gapRule = 'COMPLIANCE_TASKS_NOT_STARTED';
        }
      } else {
        gapOutcome = ControlGapOutcome.UNKNOWN_IMPLEMENTATION;
        gapRationale = `Control '${control.name}' is registered and mapped, but lacks recorded operational audit evaluations or compliance tasks. Implementation status cannot be verified.`;
        gapRule = 'NO_IMPLEMENTATION_RECORDS';
      }
    }

    // 4. Evaluate Evidence Sufficiency
    let evidenceOutcome: EvidenceSufficiencyOutcome = EvidenceSufficiencyOutcome.NOT_ASSESSED;
    let evidenceRationale = '';
    const evidenceAssocs = control.evidenceAssociations || [];

    if (evidenceAssocs.length === 0) {
      evidenceOutcome = EvidenceSufficiencyOutcome.INSUFFICIENT;
      evidenceRationale = `No evidence artifacts or documentation are attached to control '${control.name}'.`;
    } else {
      const now = new Date();
      const oneYearAgo = new Date();
      oneYearAgo.setDate(oneYearAgo.getDate() - 365);

      const evidences = evidenceAssocs.map((a) => a.evidence);
      const activeEvidences = evidences.filter(
        (e) => e.deletedAt === null && e.status !== EvidenceStatus.DELETED,
      );

      if (activeEvidences.length === 0) {
        evidenceOutcome = EvidenceSufficiencyOutcome.INSUFFICIENT;
        evidenceRationale = `All attached evidence records for control '${control.name}' have been deleted.`;
      } else {
        const unverified = activeEvidences.find(
          (e) =>
            e.scanStatus === EvidenceScanStatus.QUARANTINED ||
            e.scanStatus === EvidenceScanStatus.SCAN_FAILED ||
            e.scanStatus === EvidenceScanStatus.PENDING_SCAN,
        );

        const expiredOrStale = activeEvidences.find((e) => {
          const isExpired = e.retentionUntil && new Date(e.retentionUntil) < now;
          const isOlderThanYear = new Date(e.createdAt) < oneYearAgo;
          return isExpired || isOlderThanYear;
        });

        if (unverified) {
          evidenceOutcome = EvidenceSufficiencyOutcome.UNVERIFIED;
          evidenceRationale = `Attached evidence '${unverified.title}' has not passed malware verification (scanStatus: ${unverified.scanStatus}).`;
        } else if (expiredOrStale) {
          evidenceOutcome = EvidenceSufficiencyOutcome.STALE;
          const dateStr = new Date(expiredOrStale.createdAt).toISOString().split('T')[0];
          evidenceRationale = `Attached evidence '${expiredOrStale.title}' exceeds the 1-year freshness window (uploaded ${dateStr}) or has expired retention. Fresh evidence is required.`;
        } else {
          evidenceOutcome = EvidenceSufficiencyOutcome.SUFFICIENT;
          const sample = activeEvidences[0];
          evidenceRationale = `Verified, clean evidence artifacts ('${sample.title}') are active and within valid freshness thresholds.`;
        }
      }
    }

    return {
      gapOutcome,
      evidenceOutcome,
      determinationType: DeterminationType.RULE_DERIVED,
      confidence: ObligationConfidence.HIGH,
      gapRationale,
      evidenceRationale,
      ruleMatched: gapRule,
      evaluatedRecords,
    };
  }
}
