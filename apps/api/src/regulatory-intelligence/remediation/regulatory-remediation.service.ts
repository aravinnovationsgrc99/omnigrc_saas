import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogsService } from '../../audit-logs/audit-logs.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { RegulatoryControlGapService } from '../gaps/regulatory-control-gap.service';
import {
  CreateRemediationDto,
  AssignRemediationDto,
  UpdateRemediationStatusDto,
  RemediationApprovalDto,
  RemediationApprovalAction,
  CompleteRemediationDto,
  VerifyRemediationDto,
  RiskAcceptRemediationDto,
  QueryRemediationDto,
  RegulatoryRemediationSummaryDto,
  RegulatoryRemediationStatus,
  RemediationPriority,
} from '../dto/remediation.dto';
import { TaskStatus, Role, ControlGapOutcome, EvidenceSufficiencyOutcome } from '@prisma/client';
import { NotificationType } from '@omnigrc/shared';

@Injectable()
export class RegulatoryRemediationService {
  private readonly logger = new Logger(RegulatoryRemediationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogsService: AuditLogsService,
    private readonly notificationsService: NotificationsService,
    private readonly controlGapService: RegulatoryControlGapService,
  ) {}

  /**
   * 1. Propose and create a remediation task from a reviewed Phase 6 gap assessment.
   */
  async createRemediation(organizationId: string, actorId: string, dto: CreateRemediationDto) {
    // 1. Validate gap assessment belongs to tenant
    const assessment = await this.prisma.regulatoryControlGapAssessment.findFirst({
      where: { id: dto.assessmentId, organizationId },
      include: {
        obligation: true,
        control: true,
      },
    });

    if (!assessment) {
      throw new NotFoundException(`Regulatory control-gap assessment "${dto.assessmentId}" not found in this organization.`);
    }

    // 2. Must be human-reviewed
    if (!assessment.isHumanReviewed) {
      throw new BadRequestException('Gap assessment must be human-reviewed before proposing remediation.');
    }

    // 3. Must represent an actionable gap or deficiency (unless explicit override provided)
    const isCompliant =
      assessment.gapOutcome === ControlGapOutcome.IMPLEMENTED &&
      assessment.evidenceOutcome === EvidenceSufficiencyOutcome.SUFFICIENT;

    if (isCompliant && !dto.allowCompliantOverride) {
      throw new BadRequestException(
        'Gap assessment is already assessed as compliant with sufficient evidence. Set allowCompliantOverride and provide overrideRationale to propose remediation.',
      );
    }

    if (isCompliant && dto.allowCompliantOverride && !dto.overrideRationale) {
      throw new BadRequestException('overrideRationale is required when creating remediation for a compliant finding.');
    }

    // 4. Duplicate prevention: check for active remediation task on this finding
    const existingActiveTask = await this.prisma.regulatoryRemediationTask.findFirst({
      where: {
        assessmentId: dto.assessmentId,
        organizationId,
        status: {
          notIn: [
            RegulatoryRemediationStatus.VERIFIED_CLOSED,
            RegulatoryRemediationStatus.REJECTED,
            RegulatoryRemediationStatus.RISK_ACCEPTED,
          ],
        },
      },
    });

    if (existingActiveTask) {
      throw new ConflictException(
        `An active remediation task (${existingActiveTask.id}) already exists for gap assessment "${dto.assessmentId}".`,
      );
    }

    // 5. Verify assigned user belongs to this tenant
    const assignee = await this.prisma.user.findFirst({
      where: { id: dto.assignedToId, organizationId },
    });

    if (!assignee) {
      throw new NotFoundException(`Assigned user "${dto.assignedToId}" not found in this organization.`);
    }

    // 6. Extract legal compliance deadline from verified obligation (never fabricated)
    const regulatoryDeadline = assessment.obligation?.complianceDeadline || null;
    const internalDueDate = dto.internalDueDate ? new Date(dto.internalDueDate) : null;

    // 7. Initial status
    const initialStatus = dto.requiresApproval
      ? RegulatoryRemediationStatus.AWAITING_APPROVAL
      : RegulatoryRemediationStatus.PROPOSED;

    // 8-10. Transactional creation: ComplianceTask + RegulatoryRemediationTask + RegulatoryRemediationHistory
    let remediationTask: any;
    try {
      remediationTask = await this.prisma.$transaction(async (tx) => {
        const complianceTask = await tx.complianceTask.create({
          data: {
            organizationId,
            title: dto.title,
            description: dto.description,
            owner: assignee.name || assignee.email,
            dueDate: internalDueDate,
            controlId: assessment.controlId || null,
            obligationReference: assessment.obligation?.obligationIdentifier || assessment.obligation?.id || null,
            createdById: actorId,
            status: TaskStatus.NOT_STARTED,
          },
        });

        const createdRemediation = await tx.regulatoryRemediationTask.create({
          data: {
            organizationId,
            complianceTaskId: complianceTask.id,
            assessmentId: dto.assessmentId,
            obligationId: assessment.obligationId,
            controlId: assessment.controlId,
            mappingId: assessment.mappingId,
            publicationId: assessment.publicationId,
            publicationVersionId: assessment.publicationVersionId,
            applicabilityId: assessment.applicabilityId,
            status: initialStatus,
            priority: dto.priority || RemediationPriority.MEDIUM,
            initialGapOutcome: assessment.gapOutcome,
            initialEvidenceOutcome: assessment.evidenceOutcome,
            title: dto.title,
            description: dto.description,
            acceptanceCriteria: dto.acceptanceCriteria,
            internalDueDate,
            regulatoryDeadline,
            assignedToId: dto.assignedToId,
            assignedById: actorId,
            requiresApproval: !!dto.requiresApproval,
          },
          include: {
            complianceTask: true,
            obligation: true,
            control: true,
          },
        });

        await tx.regulatoryRemediationHistory.create({
          data: {
            remediationTaskId: createdRemediation.id,
            organizationId,
            previousStatus: null,
            newStatus: initialStatus,
            action: 'CREATED',
            actorId,
            rationale: dto.overrideRationale || 'Remediation task proposed from reviewed control-gap finding.',
            snapshotPayload: {
              assessmentId: dto.assessmentId,
              initialGapOutcome: assessment.gapOutcome,
              initialEvidenceOutcome: assessment.evidenceOutcome,
              internalDueDate: internalDueDate ? internalDueDate.toISOString() : null,
              regulatoryDeadline: regulatoryDeadline ? regulatoryDeadline.toISOString() : null,
              priority: createdRemediation.priority,
            },
          },
        });

        return createdRemediation;
      });
    } catch (err: any) {
      if (err?.code === 'P2002' || err?.message?.includes('active_assessment')) {
        throw new ConflictException(
          `An active remediation task already exists for gap assessment "${dto.assessmentId}".`,
        );
      }
      throw err;
    }

    // 11. Notify assignee
    await this.notificationsService.notify({
      organizationId,
      userId: dto.assignedToId,
      type: NotificationType.TASK_ASSIGNED,
      message: `Assigned remediation task: "${dto.title}" for obligation ${assessment.obligation?.obligationIdentifier || ''}.`,
      entityType: 'RegulatoryRemediationTask',
      entityId: remediationTask.id,
    });

    // 12. Audit Log
    await this.auditLogsService.log({
      organizationId,
      actorId,
      action: 'REGULATORY_REMEDIATION_CREATED',
      entityType: 'RegulatoryRemediationTask',
      entityId: remediationTask.id,
      metadata: {
        assessmentId: dto.assessmentId,
        complianceTaskId: remediationTask.complianceTaskId,
        status: initialStatus,
        priority: remediationTask.priority,
        assignedToId: dto.assignedToId,
        regulatoryDeadline: regulatoryDeadline ? regulatoryDeadline.toISOString() : null,
      },
    });

    return remediationTask;
  }

  /**
   * 2. Reassign remediation task.
   */
  async assignRemediation(organizationId: string, actorId: string, id: string, dto: AssignRemediationDto) {
    const task = await this.prisma.regulatoryRemediationTask.findFirst({
      where: { id, organizationId },
    });

    if (!task) {
      throw new NotFoundException(`Remediation task "${id}" not found.`);
    }

    if (
      task.status === RegulatoryRemediationStatus.VERIFIED_CLOSED ||
      task.status === RegulatoryRemediationStatus.REJECTED ||
      task.status === RegulatoryRemediationStatus.RISK_ACCEPTED
    ) {
      throw new BadRequestException(`Cannot reassign a closed or terminal remediation task (${task.status}).`);
    }

    const newAssignee = await this.prisma.user.findFirst({
      where: { id: dto.assignedToId, organizationId },
    });

    if (!newAssignee) {
      throw new NotFoundException(`Assigned user "${dto.assignedToId}" not found in this organization.`);
    }

    const previousAssigneeId = task.assignedToId;

    const updated = await this.prisma.$transaction(async (tx) => {
      const taskUpdated = await tx.regulatoryRemediationTask.update({
        where: { id },
        data: {
          assignedToId: dto.assignedToId,
        },
        include: { complianceTask: true },
      });

      // Sync ComplianceTask owner
      await tx.complianceTask.update({
        where: { id: task.complianceTaskId },
        data: { owner: newAssignee.name || newAssignee.email },
      });

      await tx.regulatoryRemediationHistory.create({
        data: {
          remediationTaskId: id,
          organizationId,
          previousStatus: task.status,
          newStatus: task.status,
          action: 'ASSIGNED',
          actorId,
          rationale: dto.rationale || `Reassigned from ${previousAssigneeId} to ${dto.assignedToId}`,
          snapshotPayload: { previousAssigneeId, newAssigneeId: dto.assignedToId },
        },
      });

      return taskUpdated;
    });

    await this.notificationsService.notify({
      organizationId,
      userId: dto.assignedToId,
      type: NotificationType.TASK_ASSIGNED,
      message: `Reassigned remediation task: "${task.title}".`,
      entityType: 'RegulatoryRemediationTask',
      entityId: id,
    });

    await this.auditLogsService.log({
      organizationId,
      actorId,
      action: 'REGULATORY_REMEDIATION_ASSIGNED',
      entityType: 'RegulatoryRemediationTask',
      entityId: id,
      metadata: { previousAssigneeId, newAssigneeId: dto.assignedToId, rationale: dto.rationale },
    });

    return updated;
  }

  /**
   * 3. Update task status, progress, blockers, or due dates.
   */
  async updateStatus(organizationId: string, actorId: string, id: string, dto: UpdateRemediationStatusDto) {
    const task = await this.prisma.regulatoryRemediationTask.findFirst({
      where: { id, organizationId },
    });

    if (!task) {
      throw new NotFoundException(`Remediation task "${id}" not found.`);
    }

    if (
      task.status === RegulatoryRemediationStatus.VERIFIED_CLOSED ||
      task.status === RegulatoryRemediationStatus.REJECTED ||
      task.status === RegulatoryRemediationStatus.RISK_ACCEPTED
    ) {
      throw new BadRequestException(`Cannot modify a terminal remediation task (${task.status}).`);
    }

    let nextStatus: RegulatoryRemediationStatus = task.status;
    let blockedReason = task.blockedReason;
    let unblockedReason = task.unblockedReason;

    if (dto.status && dto.status !== task.status) {
      // Validate transition
      if (dto.status === RegulatoryRemediationStatus.VERIFIED_CLOSED) {
        throw new BadRequestException('Cannot transition directly to VERIFIED_CLOSED. Use the /verify endpoint.');
      }
      if (dto.status === RegulatoryRemediationStatus.APPROVED) {
        throw new BadRequestException('Cannot transition directly to APPROVED. Use the /approval endpoint.');
      }
      if (dto.status === RegulatoryRemediationStatus.BLOCKED && !dto.blockedReason) {
        throw new BadRequestException('blockedReason is required when moving task to BLOCKED status.');
      }
      if (task.status === RegulatoryRemediationStatus.BLOCKED && dto.status === RegulatoryRemediationStatus.IN_PROGRESS && !dto.unblockedReason) {
        throw new BadRequestException('unblockedReason is required when unblocking a task.');
      }

      nextStatus = dto.status;
      if (dto.blockedReason) blockedReason = dto.blockedReason;
      if (dto.unblockedReason) unblockedReason = dto.unblockedReason;
    }

    // Sync underlying ComplianceTask status
    let complianceStatus: TaskStatus | undefined;
    if (nextStatus === RegulatoryRemediationStatus.IN_PROGRESS || nextStatus === RegulatoryRemediationStatus.BLOCKED) {
      complianceStatus = TaskStatus.IN_PROGRESS;
    }

    const nextInternalDueDate = dto.internalDueDate ? new Date(dto.internalDueDate) : task.internalDueDate;
    const nextPriority = dto.priority || task.priority;

    const updated = await this.prisma.$transaction(async (tx) => {
      const taskUpdated = await tx.regulatoryRemediationTask.update({
        where: { id },
        data: {
          status: nextStatus,
          progressNotes: dto.progressNotes || task.progressNotes,
          blockedReason,
          unblockedReason,
          internalDueDate: nextInternalDueDate,
          priority: nextPriority,
        },
        include: { complianceTask: true },
      });

      if (complianceStatus || dto.internalDueDate) {
        await tx.complianceTask.update({
          where: { id: task.complianceTaskId },
          data: {
            ...(complianceStatus && { status: complianceStatus }),
            ...(dto.internalDueDate && { dueDate: nextInternalDueDate }),
          },
        });
      }

      await tx.regulatoryRemediationHistory.create({
        data: {
          remediationTaskId: id,
          organizationId,
          previousStatus: task.status,
          newStatus: nextStatus,
          action: 'STATUS_CHANGED',
          actorId,
          rationale: dto.overrideRationale || dto.progressNotes || dto.blockedReason || dto.unblockedReason,
          snapshotPayload: {
            previousStatus: task.status,
            newStatus: nextStatus,
            internalDueDate: nextInternalDueDate ? nextInternalDueDate.toISOString() : null,
            priority: nextPriority,
          },
        },
      });

      return taskUpdated;
    });

    await this.auditLogsService.log({
      organizationId,
      actorId,
      action: 'REGULATORY_REMEDIATION_STATUS_CHANGED',
      entityType: 'RegulatoryRemediationTask',
      entityId: id,
      metadata: {
        previousStatus: task.status,
        newStatus: nextStatus,
        internalDueDate: nextInternalDueDate ? nextInternalDueDate.toISOString() : null,
        priority: nextPriority,
      },
    });

    return updated;
  }

  /**
   * 4. Approve or reject remediation task awaiting governance signoff.
   */
  async handleApproval(
    organizationId: string,
    actorId: string,
    actorRole: string,
    id: string,
    dto: RemediationApprovalDto,
  ) {
    const task = await this.prisma.regulatoryRemediationTask.findFirst({
      where: { id, organizationId },
    });

    if (!task) {
      throw new NotFoundException(`Remediation task "${id}" not found.`);
    }

    if (task.status !== RegulatoryRemediationStatus.AWAITING_APPROVAL) {
      throw new BadRequestException(`Task is in "${task.status}" status, not AWAITING_APPROVAL.`);
    }

    if (actorRole !== Role.ADMIN && actorRole !== Role.MSSP_ADMIN) {
      throw new ForbiddenException('Only ADMIN or MSSP_ADMIN roles can approve or reject remediation tasks.');
    }

    // Segregation of duties: Creator cannot approve their own submission unless Admin
    if (actorRole !== Role.ADMIN && task.assignedById === actorId) {
      throw new ForbiddenException('Segregation of duties: Proposer cannot approve their own remediation task.');
    }

    const now = new Date();

    if (dto.action === RemediationApprovalAction.APPROVE) {
      const updated = await this.prisma.$transaction(async (tx) => {
        const taskUpdated = await tx.regulatoryRemediationTask.update({
          where: { id },
          data: {
            status: RegulatoryRemediationStatus.APPROVED,
            approvedById: actorId,
            approvedAt: now,
            approvalNotes: dto.approvalNotes || null,
          },
          include: { complianceTask: true },
        });

        await tx.regulatoryRemediationHistory.create({
          data: {
            remediationTaskId: id,
            organizationId,
            previousStatus: task.status,
            newStatus: RegulatoryRemediationStatus.APPROVED,
            action: 'APPROVED',
            actorId,
            rationale: dto.approvalNotes || 'Remediation task approved by compliance officer.',
          },
        });

        return taskUpdated;
      });

      await this.auditLogsService.log({
        organizationId,
        actorId,
        action: 'REGULATORY_REMEDIATION_APPROVED',
        entityType: 'RegulatoryRemediationTask',
        entityId: id,
        metadata: { approvedById: actorId, approvedAt: now.toISOString(), approvalNotes: dto.approvalNotes },
      });

      return updated;
    } else {
      if (!dto.rejectionReason) {
        throw new BadRequestException('rejectionReason is mandatory when rejecting a remediation task.');
      }

      const updated = await this.prisma.$transaction(async (tx) => {
        const taskUpdated = await tx.regulatoryRemediationTask.update({
          where: { id },
          data: {
            status: RegulatoryRemediationStatus.REJECTED,
            rejectedById: actorId,
            rejectedAt: now,
            rejectionReason: dto.rejectionReason,
          },
          include: { complianceTask: true },
        });

        const rejectedAnnotation = `[REJECTED: ${dto.rejectionReason}]`;
        const currentDesc = task.description || '';
        await tx.complianceTask.update({
          where: { id: task.complianceTaskId },
          data: {
            status: TaskStatus.COMPLETE,
            description: `${rejectedAnnotation} ${currentDesc}`.trim(),
          },
        });

        await tx.regulatoryRemediationHistory.create({
          data: {
            remediationTaskId: id,
            organizationId,
            previousStatus: task.status,
            newStatus: RegulatoryRemediationStatus.REJECTED,
            action: 'REJECTED',
            actorId,
            rationale: dto.rejectionReason,
          },
        });

        return taskUpdated;
      });

      await this.auditLogsService.log({
        organizationId,
        actorId,
        action: 'REGULATORY_REMEDIATION_REJECTED',
        entityType: 'RegulatoryRemediationTask',
        entityId: id,
        metadata: { rejectedById: actorId, rejectedAt: now.toISOString(), rejectionReason: dto.rejectionReason },
      });

      return updated;
    }
  }

  /**
   * 5. Submit completion notes and supporting evidence references.
   */
  async completeRemediation(organizationId: string, actorId: string, id: string, dto: CompleteRemediationDto) {
    const task = await this.prisma.regulatoryRemediationTask.findFirst({
      where: { id, organizationId },
    });

    if (!task) {
      throw new NotFoundException(`Remediation task "${id}" not found.`);
    }

    if (
      task.status !== RegulatoryRemediationStatus.IN_PROGRESS &&
      task.status !== RegulatoryRemediationStatus.APPROVED
    ) {
      throw new BadRequestException(
        `Task must be in IN_PROGRESS or APPROVED status to submit completion. Current status: "${task.status}".`,
      );
    }

    // Validate evidence references belong to tenant
    let validatedEvidence: any[] = [];
    if (dto.evidenceIds && dto.evidenceIds.length > 0) {
      const items = await this.prisma.evidence.findMany({
        where: {
          id: { in: dto.evidenceIds },
          organizationId,
          deletedAt: null,
        },
        select: {
          id: true,
          status: true,
          scanStatus: true,
          retentionUntil: true,
          createdAt: true,
        },
      });

      if (items.length !== dto.evidenceIds.length) {
        throw new BadRequestException(
          'One or more referenced evidence items do not exist, are soft-deleted, or belong to another organization.',
        );
      }
      validatedEvidence = items;
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const taskUpdated = await tx.regulatoryRemediationTask.update({
        where: { id },
        data: {
          status: RegulatoryRemediationStatus.COMPLETED,
          completionNotes: dto.completionNotes,
          evidenceReferences: validatedEvidence,
        },
        include: { complianceTask: true },
      });

      // Sync ComplianceTask status to UNDER_REVIEW
      await tx.complianceTask.update({
        where: { id: task.complianceTaskId },
        data: { status: TaskStatus.UNDER_REVIEW },
      });

      await tx.regulatoryRemediationHistory.create({
        data: {
          remediationTaskId: id,
          organizationId,
          previousStatus: task.status,
          newStatus: RegulatoryRemediationStatus.COMPLETED,
          action: 'COMPLETED',
          actorId,
          rationale: dto.completionNotes,
          snapshotPayload: { evidenceCount: validatedEvidence.length, evidenceIds: dto.evidenceIds },
        },
      });

      return taskUpdated;
    });

    await this.auditLogsService.log({
      organizationId,
      actorId,
      action: 'REGULATORY_REMEDIATION_COMPLETED',
      entityType: 'RegulatoryRemediationTask',
      entityId: id,
      metadata: { completionNotes: dto.completionNotes, evidenceCount: validatedEvidence.length },
    });

    return updated;
  }

  /**
   * 6. Verify and close remediation task (does NOT equate completion to automatic compliance).
   */
  async verifyAndClose(
    organizationId: string,
    actorId: string,
    actorRole: string,
    id: string,
    dto: VerifyRemediationDto,
  ) {
    const task = await this.prisma.regulatoryRemediationTask.findFirst({
      where: { id, organizationId },
    });

    if (!task) {
      throw new NotFoundException(`Remediation task "${id}" not found.`);
    }

    if (task.status !== RegulatoryRemediationStatus.COMPLETED) {
      throw new BadRequestException(
        `Remediation task must be in COMPLETED status before verification. Current status: "${task.status}".`,
      );
    }

    if (actorRole !== Role.ADMIN && actorRole !== Role.MSSP_ADMIN) {
      throw new ForbiddenException('Only ADMIN or MSSP_ADMIN roles can verify and close remediation tasks.');
    }

    // Enforce independent verification: the task creator or assigned owner cannot verify their own work
    if ((task.assignedById && task.assignedById === actorId) || (task.assignedToId && task.assignedToId === actorId)) {
      throw new ForbiddenException(
        'Independent verification required: the task creator or assigned owner cannot verify their own remediation task.',
      );
    }

    const now = new Date();

    // Handle failed verification: return task to actionable state (IN_PROGRESS) with recorded reason
    if (dto.verified === false) {
      const reason = dto.rejectionReason || dto.verificationNotes;
      if (!reason || reason.trim().length < 5) {
        throw new BadRequestException('A specific reason or notes must be provided when verification fails.');
      }

      const updated = await this.prisma.$transaction(async (tx) => {
        const taskUpdated = await tx.regulatoryRemediationTask.update({
          where: { id },
          data: {
            status: RegulatoryRemediationStatus.IN_PROGRESS,
            verificationNotes: reason,
            reassessmentRequested: false,
          },
          include: { complianceTask: true },
        });

        // Return ComplianceTask to IN_PROGRESS so it is actionable
        await tx.complianceTask.update({
          where: { id: task.complianceTaskId },
          data: {
            status: TaskStatus.IN_PROGRESS,
          },
        });

        await tx.regulatoryRemediationHistory.create({
          data: {
            remediationTaskId: id,
            organizationId,
            previousStatus: task.status,
            newStatus: RegulatoryRemediationStatus.IN_PROGRESS,
            action: 'VERIFICATION_REJECTED',
            actorId,
            rationale: reason,
          },
        });

        return taskUpdated;
      });

      await this.auditLogsService.log({
        organizationId,
        actorId,
        action: 'REGULATORY_REMEDIATION_VERIFICATION_REJECTED',
        entityType: 'RegulatoryRemediationTask',
        entityId: id,
        metadata: {
          rejectedById: actorId,
          rejectedAt: now.toISOString(),
          reason,
        },
      });

      return updated;
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const taskUpdated = await tx.regulatoryRemediationTask.update({
        where: { id },
        data: {
          status: RegulatoryRemediationStatus.VERIFIED_CLOSED,
          verifiedById: actorId,
          verifiedAt: now,
          verificationNotes: dto.verificationNotes,
          reassessmentRequested: !!dto.reassessmentRequested,
        },
        include: { complianceTask: true },
      });

      // Mark ComplianceTask as COMPLETE
      await tx.complianceTask.update({
        where: { id: task.complianceTaskId },
        data: {
          status: TaskStatus.COMPLETE,
          lastCompletedAt: now,
        },
      });

      await tx.regulatoryRemediationHistory.create({
        data: {
          remediationTaskId: id,
          organizationId,
          previousStatus: task.status,
          newStatus: RegulatoryRemediationStatus.VERIFIED_CLOSED,
          action: 'VERIFIED_CLOSED',
          actorId,
          rationale: dto.verificationNotes,
          snapshotPayload: { reassessmentRequested: !!dto.reassessmentRequested },
        },
      });

      return taskUpdated;
    });

    await this.auditLogsService.log({
      organizationId,
      actorId,
      action: 'REGULATORY_REMEDIATION_VERIFIED_CLOSED',
      entityType: 'RegulatoryRemediationTask',
      entityId: id,
      metadata: {
        verifiedById: actorId,
        verifiedAt: now.toISOString(),
        reassessmentRequested: !!dto.reassessmentRequested,
      },
    });

    // If reassessment is explicitly requested, trigger the Phase 6 assessment engine
    if (dto.reassessmentRequested) {
      try {
        await this.controlGapService.assessObligationGap(organizationId, task.obligationId, actorId, true);
        this.logger.log(`Triggered explicit Phase 6 reassessment for obligation ${task.obligationId} upon closure.`);
      } catch (err: any) {
        this.logger.warn(`Reassessment trigger failed for obligation ${task.obligationId}: ${err?.message}`);
      }
    }

    return updated;
  }

  /**
   * 7. Accept risk / document exception for finding without silent suppression.
   */
  async acceptRisk(organizationId: string, actorId: string, actorRole: string, id: string, dto: RiskAcceptRemediationDto) {
    const task = await this.prisma.regulatoryRemediationTask.findFirst({
      where: { id, organizationId },
    });

    if (!task) {
      throw new NotFoundException(`Remediation task "${id}" not found.`);
    }

    if (
      task.status === RegulatoryRemediationStatus.VERIFIED_CLOSED ||
      task.status === RegulatoryRemediationStatus.REJECTED ||
      task.status === RegulatoryRemediationStatus.RISK_ACCEPTED
    ) {
      throw new BadRequestException(`Cannot accept risk on a closed or terminal remediation task (${task.status}).`);
    }

    if (actorRole !== Role.ADMIN && actorRole !== Role.MSSP_ADMIN) {
      throw new ForbiddenException('Only ADMIN or MSSP_ADMIN roles can approve risk acceptance.');
    }

    const now = new Date();

    const updated = await this.prisma.$transaction(async (tx) => {
      const taskUpdated = await tx.regulatoryRemediationTask.update({
        where: { id },
        data: {
          status: RegulatoryRemediationStatus.RISK_ACCEPTED,
          riskAcceptedById: actorId,
          riskAcceptedAt: now,
          riskAcceptanceRationale: dto.riskAcceptanceRationale,
        },
        include: { complianceTask: true },
      });

      const riskAcceptedAnnotation = `[RISK ACCEPTED: ${dto.riskAcceptanceRationale}]`;
      const currentDesc = task.description || '';
      await tx.complianceTask.update({
        where: { id: task.complianceTaskId },
        data: {
          status: TaskStatus.COMPLETE,
          description: `${riskAcceptedAnnotation} ${currentDesc}`.trim(),
        },
      });

      await tx.regulatoryRemediationHistory.create({
        data: {
          remediationTaskId: id,
          organizationId,
          previousStatus: task.status,
          newStatus: RegulatoryRemediationStatus.RISK_ACCEPTED,
          action: 'RISK_ACCEPTED',
          actorId,
          rationale: dto.riskAcceptanceRationale,
        },
      });

      return taskUpdated;
    });

    await this.auditLogsService.log({
      organizationId,
      actorId,
      action: 'REGULATORY_REMEDIATION_RISK_ACCEPTED',
      entityType: 'RegulatoryRemediationTask',
      entityId: id,
      metadata: {
        riskAcceptedById: actorId,
        riskAcceptedAt: now.toISOString(),
        rationale: dto.riskAcceptanceRationale,
      },
    });

    return updated;
  }

  /**
   * 8. List remediation tasks with pagination, search, and scoping.
   */
  async findAll(organizationId: string, query: QueryRemediationDto) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const skip = (page - 1) * limit;

    const where: any = { organizationId };

    if (query.status) where.status = query.status;
    if (query.priority) where.priority = query.priority;
    if (query.assessmentId) where.assessmentId = query.assessmentId;
    if (query.obligationId) where.obligationId = query.obligationId;
    if (query.controlId) where.controlId = query.controlId;
    if (query.assignedToId) where.assignedToId = query.assignedToId;

    if (query.overdueOnly) {
      where.internalDueDate = { lt: new Date() };
      where.status = {
        notIn: [
          RegulatoryRemediationStatus.VERIFIED_CLOSED,
          RegulatoryRemediationStatus.REJECTED,
          RegulatoryRemediationStatus.RISK_ACCEPTED,
        ],
      };
    }

    if (query.search && query.search.trim()) {
      const term = query.search.trim();
      where.OR = [
        { title: { contains: term, mode: 'insensitive' } },
        { description: { contains: term, mode: 'insensitive' } },
        { acceptanceCriteria: { contains: term, mode: 'insensitive' } },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.regulatoryRemediationTask.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
        include: {
          complianceTask: true,
          obligation: { select: { id: true, obligationIdentifier: true, title: true, complianceDeadline: true } },
          control: { select: { id: true, name: true, category: true } },
        },
      }),
      this.prisma.regulatoryRemediationTask.count({ where }),
    ]);

    return {
      items,
      total,
      page,
      limit,
    };
  }

  /**
   * 9. Retrieve single remediation task with full history and provenance.
   */
  async findOne(organizationId: string, id: string) {
    const task = await this.prisma.regulatoryRemediationTask.findFirst({
      where: { id, organizationId },
      include: {
        complianceTask: true,
        assessment: true,
        obligation: true,
        control: true,
        mapping: true,
        history: {
          orderBy: { recordedAt: 'desc' },
        },
      },
    });

    if (!task) {
      throw new NotFoundException(`Remediation task "${id}" not found.`);
    }

    return task;
  }

  /**
   * 10. Dashboard summary and overdue distributions.
   */
  async getSummary(organizationId: string): Promise<RegulatoryRemediationSummaryDto> {
    const tasks = await this.prisma.regulatoryRemediationTask.findMany({
      where: { organizationId },
      select: {
        status: true,
        priority: true,
        internalDueDate: true,
        regulatoryDeadline: true,
      },
    });

    const now = new Date();
    const byStatus: Record<RegulatoryRemediationStatus, number> = {
      [RegulatoryRemediationStatus.PROPOSED]: 0,
      [RegulatoryRemediationStatus.AWAITING_APPROVAL]: 0,
      [RegulatoryRemediationStatus.APPROVED]: 0,
      [RegulatoryRemediationStatus.IN_PROGRESS]: 0,
      [RegulatoryRemediationStatus.BLOCKED]: 0,
      [RegulatoryRemediationStatus.COMPLETED]: 0,
      [RegulatoryRemediationStatus.VERIFIED_CLOSED]: 0,
      [RegulatoryRemediationStatus.REJECTED]: 0,
      [RegulatoryRemediationStatus.RISK_ACCEPTED]: 0,
    };

    const byPriority: Record<RemediationPriority, number> = {
      [RemediationPriority.LOW]: 0,
      [RemediationPriority.MEDIUM]: 0,
      [RemediationPriority.HIGH]: 0,
      [RemediationPriority.CRITICAL]: 0,
    };

    let internalOverdueCount = 0;
    let regulatoryOverdueCount = 0;

    const closedStatuses = new Set<RegulatoryRemediationStatus>([
      RegulatoryRemediationStatus.VERIFIED_CLOSED,
      RegulatoryRemediationStatus.REJECTED,
      RegulatoryRemediationStatus.RISK_ACCEPTED,
    ]);

    for (const t of tasks) {
      byStatus[t.status]++;
      byPriority[t.priority]++;

      if (!closedStatuses.has(t.status)) {
        if (t.internalDueDate && t.internalDueDate < now) {
          internalOverdueCount++;
        }
        if (t.regulatoryDeadline && t.regulatoryDeadline < now) {
          regulatoryOverdueCount++;
        }
      }
    }

    return {
      totalTasks: tasks.length,
      byStatus,
      byPriority,
      internalOverdueCount,
      regulatoryOverdueCount,
    };
  }
}
