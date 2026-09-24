import {
  AuditPlanStatus,
  AuditScheduleStatus,
  AuditAssessmentStatus,
  AuditCheckResult,
  FindingStatus,
  CapaStatus,
  VulnerabilitySeverity,
  ObligationCadence,
} from '@omnigrc/shared';

export class CreateAuditPlanDto {
  title: string;
  objective?: string;
  scope?: string;
  frameworkCode?: string;
  ownerId: string;
  plannedStartDate?: string;
  plannedEndDate?: string;
  departmentId?: string;
  projectId?: string;
}

export class UpdateAuditPlanDto {
  title?: string;
  objective?: string;
  scope?: string;
  frameworkCode?: string;
  ownerId?: string;
  plannedStartDate?: string;
  plannedEndDate?: string;
  status?: AuditPlanStatus;
  departmentId?: string;
  projectId?: string;
}

export class CreateAuditScheduleDto {
  auditPlanId: string;
  scheduledStartDate: string;
  scheduledEndDate: string;
  leadAuditorId: string;
  recurrence?: ObligationCadence;
}

export class CreateAuditAssessmentDto {
  auditPlanId: string;
  scheduleId?: string;
  auditorId: string;
  summary?: string;
}

export class UpdateCheckItemDto {
  result?: AuditCheckResult;
  notes?: string;
}

export class CreateAuditFindingDto {
  assessmentId: string;
  checkItemId?: string;
  title: string;
  description?: string;
  severity: VulnerabilitySeverity;
  ownerId: string;
  dueDate?: string;
  riskId?: string;
  remediationPlan?: string;
}

export class UpdateAuditFindingDto {
  title?: string;
  description?: string;
  severity?: VulnerabilitySeverity;
  status?: FindingStatus;
  ownerId?: string;
  dueDate?: string;
  remediationPlan?: string;
  verificationNotes?: string;
}

export class CreateAuditCapaDto {
  findingId: string;
  title: string;
  correctiveAction: string;
  preventiveAction?: string;
  ownerId: string;
  dueDate?: string;
}

export class UpdateAuditCapaDto {
  title?: string;
  correctiveAction?: string;
  preventiveAction?: string;
  ownerId?: string;
  dueDate?: string;
  status?: CapaStatus;
}

export class CreateAuditEvidenceDto {
  checkItemId?: string;
  findingId?: string;
  fileName: string;
  fileUrl: string;
  fileSize?: number;
  mimeType?: string;
}
