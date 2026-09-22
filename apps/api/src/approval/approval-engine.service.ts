import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  ApprovalWorkflowDto,
  CreateApprovalWorkflowDto,
  ApprovalInstanceDto,
  CreateApprovalInstanceDto,
  MakeApprovalDecisionDto,
  ApprovalQueryDto,
  PaginatedApprovalsDto,
  ApprovalWorkflowStatus,
  ApprovalInstanceStatus,
  ApprovalStepStatus,
  ApproverType,
  DecisionAction,
  Role,
  NotificationType,
} from '@omnigrc/shared';

@Injectable()
export class ApprovalEngineService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogsService: AuditLogsService,
    private readonly notificationsService: NotificationsService,
  ) {}

  // --------------------------------------------------
  // WORKFLOW DEFINITIONS
  // --------------------------------------------------

  async createWorkflow(
    organizationId: string,
    createdById: string,
    dto: CreateApprovalWorkflowDto,
  ): Promise<ApprovalWorkflowDto> {
    if (!dto.steps || dto.steps.length === 0) {
      throw new BadRequestException('Approval workflow must contain at least one step.');
    }

    const workflow = await this.prisma.approvalWorkflow.create({
      data: {
        organizationId,
        name: dto.name.trim(),
        description: dto.description?.trim() || null,
        applicableResourceType: dto.applicableResourceType,
        status: ApprovalWorkflowStatus.ACTIVE,
        allowSelfApproval: dto.allowSelfApproval ?? false,
        steps: {
          create: dto.steps.map((s, idx) => ({
            stepNumber: s.stepNumber || idx + 1,
            name: s.name,
            approverType: s.approverType || ApproverType.ROLE,
            targetRole: s.targetRole || Role.ADMIN,
            targetDepartmentId: s.targetDepartmentId || null,
            targetProjectId: s.targetProjectId || null,
            specificUserId: s.specificUserId || null,
            dueDays: s.dueDays || null,
          })),
        },
      },
      include: { steps: { orderBy: { stepNumber: 'asc' } } },
    });

    await this.auditLogsService.log({
      organizationId,
      actorId: createdById,
      action: 'APPROVAL_WORKFLOW_CREATED',
      entityType: 'ApprovalWorkflow',
      entityId: workflow.id,
      metadata: { name: workflow.name, applicableResourceType: workflow.applicableResourceType },
    });

    return this.mapWorkflowToDto(workflow);
  }

  async findAllWorkflows(organizationId: string): Promise<ApprovalWorkflowDto[]> {
    const workflows = await this.prisma.approvalWorkflow.findMany({
      where: { organizationId },
      include: { steps: { orderBy: { stepNumber: 'asc' } } },
      orderBy: { createdAt: 'desc' },
    });
    return workflows.map((w) => this.mapWorkflowToDto(w));
  }

  // --------------------------------------------------
  // APPROVAL INSTANCES & EXECUTION
  // --------------------------------------------------

  async createApprovalInstance(
    organizationId: string,
    requesterId: string,
    dto: CreateApprovalInstanceDto,
  ): Promise<ApprovalInstanceDto> {
    // 1. Verify resource ownership
    await this.verifyResourceBelongsToOrg(organizationId, dto.resourceType, dto.resourceId);

    // 1b. Evidence Security Gate: If evidence is target resource, enforce ACTIVE + CLEAN
    if (dto.resourceType === 'EVIDENCE') {
      const ev = await this.prisma.evidence.findFirst({
        where: { id: dto.resourceId, organizationId },
      });
      if (ev && (ev.status !== 'ACTIVE' || ev.scanStatus !== 'CLEAN')) {
        throw new BadRequestException(
          `Quarantined, unverified, or inactive evidence (status: ${ev.status}, scanStatus: ${ev.scanStatus}) cannot satisfy approval requirements.`,
        );
      }
    }

    // 2. Fetch or resolve workflow
    let workflow = dto.workflowId
      ? await this.prisma.approvalWorkflow.findFirst({
          where: { id: dto.workflowId, organizationId, status: ApprovalWorkflowStatus.ACTIVE },
          include: { steps: { orderBy: { stepNumber: 'asc' } } },
        })
      : await this.prisma.approvalWorkflow.findFirst({
          where: { organizationId, applicableResourceType: dto.resourceType, status: ApprovalWorkflowStatus.ACTIVE },
          include: { steps: { orderBy: { stepNumber: 'asc' } } },
        });

    // Default 1-step Admin workflow if no custom workflow configured
    const stepsData = workflow?.steps && workflow.steps.length > 0
      ? workflow.steps.map((s) => ({
          stepNumber: s.stepNumber,
          name: s.name,
          approverType: s.approverType,
          targetRole: s.targetRole,
          targetDepartmentId: s.targetDepartmentId,
          targetProjectId: s.targetProjectId,
          specificUserId: s.specificUserId,
          status: s.stepNumber === 1 ? ApprovalStepStatus.ACTIVE : ApprovalStepStatus.PENDING,
          activatedAt: s.stepNumber === 1 ? new Date() : null,
        }))
      : [
          {
            stepNumber: 1,
            name: 'Management Review',
            approverType: ApproverType.ROLE,
            targetRole: Role.ADMIN,
            targetDepartmentId: null,
            targetProjectId: null,
            specificUserId: null,
            status: ApprovalStepStatus.ACTIVE,
            activatedAt: new Date(),
          },
        ];

    let dueAt: Date | null = null;
    if (dto.dueDays && dto.dueDays > 0) {
      dueAt = new Date(Date.now() + dto.dueDays * 24 * 60 * 60 * 1000);
    }

    const instance = await this.prisma.approvalInstance.create({
      data: {
        organizationId,
        workflowId: workflow?.id || null,
        title: dto.title.trim(),
        description: dto.description?.trim() || null,
        resourceType: dto.resourceType,
        resourceId: dto.resourceId,
        requesterId,
        status: ApprovalInstanceStatus.PENDING,
        purpose: (dto.purpose as any) || null,
        currentStepNumber: 1,
        dueAt,
        frameworkReferenceId: dto.frameworkReferenceId || null,
        steps: {
          create: stepsData,
        },
      },
      include: {
        steps: { orderBy: { stepNumber: 'asc' } },
        decisions: true,
      },
    });

    // Attach typed resource relation
    await this.createApprovalResourceRelation(organizationId, instance.id, dto.resourceType, dto.resourceId);

    // Audit Log & Notification
    await this.auditLogsService.log({
      organizationId,
      actorId: requesterId,
      action: 'APPROVAL_SUBMITTED',
      entityType: 'ApprovalInstance',
      entityId: instance.id,
      metadata: { title: instance.title, resourceType: dto.resourceType, resourceId: dto.resourceId },
    });

    return this.mapInstanceToDto(instance.id, requesterId);
  }

  async findAllInstances(
    organizationId: string,
    userContext: { userId: string; role: Role; departmentIds: string[]; projectIds: string[] },
    query: ApprovalQueryDto,
  ): Promise<PaginatedApprovalsDto> {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const search = query.search?.trim().toLowerCase();

    const instances = await this.prisma.approvalInstance.findMany({
      where: {
        organizationId,
        ...(query.status && { status: query.status }),
        ...(query.resourceType && { resourceType: query.resourceType }),
        ...(query.submittedByMe && { requesterId: userContext.userId }),
      },
      include: {
        steps: { orderBy: { stepNumber: 'asc' } },
        decisions: { orderBy: { createdAt: 'desc' } },
      },
      orderBy: { createdAt: 'desc' },
    });

    let dtos = await Promise.all(
      instances.map((ins) => this.mapInstanceToDto(ins.id, userContext.userId, userContext)),
    );

    if (query.assignedToMe) {
      dtos = dtos.filter((d) => d.canUserApprove === true);
    }

    if (search) {
      dtos = dtos.filter(
        (d) =>
          d.title.toLowerCase().includes(search) ||
          (d.description && d.description.toLowerCase().includes(search)) ||
          d.resourceType.toLowerCase().includes(search),
      );
    }

    const total = dtos.length;
    const startIndex = (page - 1) * limit;
    const paginatedItems = dtos.slice(startIndex, startIndex + limit);

    return {
      items: paginatedItems,
      total,
      page,
      limit,
    };
  }

  async findOneInstance(
    organizationId: string,
    instanceId: string,
    userContext?: { userId: string; role: Role; departmentIds: string[]; projectIds: string[] },
  ): Promise<ApprovalInstanceDto> {
    const instance = await this.prisma.approvalInstance.findFirst({
      where: { id: instanceId, organizationId },
    });

    if (!instance) {
      throw new NotFoundException(`Approval instance "${instanceId}" not found.`);
    }

    return this.mapInstanceToDto(instanceId, userContext?.userId || '', userContext);
  }

  async makeDecision(
    organizationId: string,
    actorId: string,
    userContext: { userId: string; role: Role; departmentIds: string[]; projectIds: string[] },
    instanceId: string,
    dto: MakeApprovalDecisionDto,
  ): Promise<ApprovalInstanceDto> {
    const instance = await this.prisma.approvalInstance.findFirst({
      where: { id: instanceId, organizationId },
      include: {
        workflow: true,
        steps: { orderBy: { stepNumber: 'asc' } },
      },
    });

    if (!instance) {
      throw new NotFoundException(`Approval instance "${instanceId}" not found.`);
    }

    if (instance.status === ApprovalInstanceStatus.APPROVED || instance.status === ApprovalInstanceStatus.REJECTED || instance.status === ApprovalInstanceStatus.CANCELLED) {
      throw new BadRequestException(`Approval instance "${instanceId}" is already finalized (${instance.status}).`);
    }

    const activeStep = instance.steps.find((s) => s.stepNumber === instance.currentStepNumber);
    if (!activeStep) {
      throw new BadRequestException(`No active step found for approval instance at step ${instance.currentStepNumber}.`);
    }

    // 1. Separation of Duties Check
    const allowSelf = instance.workflow?.allowSelfApproval ?? false;
    if (!allowSelf && instance.requesterId === actorId) {
      throw new ForbiddenException(`Separation of Duties violation: Requester cannot approve their own request.`);
    }

    // 2. Approver Authorization Evaluation
    const isAuthorized = this.canUserApproveStep(activeStep as any, userContext);
    if (!isAuthorized) {
      throw new ForbiddenException(`User is not authorized to act on step ${activeStep.stepNumber} (${activeStep.name}).`);
    }

    // 3. Record Immutable Decision Log
    const decision = await this.prisma.approvalDecision.create({
      data: {
        organizationId,
        approvalInstanceId: instance.id,
        stepId: activeStep.id,
        actorId,
        action: dto.action,
        comment: dto.comment?.trim() || null,
      },
    });

    // 4. Process State Machine Transition
    let nextStatus: ApprovalInstanceStatus = instance.status as unknown as ApprovalInstanceStatus;
    let nextStepNumber = instance.currentStepNumber;
    let completedAt: Date | null = null;

    if (dto.action === DecisionAction.APPROVE) {
      await this.prisma.approvalInstanceStep.update({
        where: { id: activeStep.id },
        data: { status: ApprovalStepStatus.APPROVED, completedAt: new Date() },
      });

      const nextStep = instance.steps.find((s) => s.stepNumber === instance.currentStepNumber + 1);
      if (nextStep) {
        nextStepNumber = nextStep.stepNumber;
        nextStatus = ApprovalInstanceStatus.IN_REVIEW;
        await this.prisma.approvalInstanceStep.update({
          where: { id: nextStep.id },
          data: { status: ApprovalStepStatus.ACTIVE, activatedAt: new Date() },
        });
      } else {
        // Final Step Approved!
        nextStatus = ApprovalInstanceStatus.APPROVED;
        completedAt = new Date();
        await this.executeResourceStatusCallback(organizationId, instance, DecisionAction.APPROVE);
      }
    } else if (dto.action === DecisionAction.REJECT) {
      await this.prisma.approvalInstanceStep.update({
        where: { id: activeStep.id },
        data: { status: ApprovalStepStatus.REJECTED, completedAt: new Date() },
      });
      nextStatus = ApprovalInstanceStatus.REJECTED;
      completedAt = new Date();
      await this.executeResourceStatusCallback(organizationId, instance, DecisionAction.REJECT);
    } else if (dto.action === DecisionAction.REQUEST_CHANGES) {
      await this.prisma.approvalInstanceStep.update({
        where: { id: activeStep.id },
        data: { status: ApprovalStepStatus.CHANGES_REQUESTED },
      });
      nextStatus = ApprovalInstanceStatus.CHANGES_REQUESTED;
      await this.executeResourceStatusCallback(organizationId, instance, DecisionAction.REQUEST_CHANGES);
    }

    await this.prisma.approvalInstance.update({
      where: { id: instance.id },
      data: {
        status: nextStatus as any,
        currentStepNumber: nextStepNumber,
        completedAt,
      },
    });

    // 5. Emit Audit Log & Notification
    await this.auditLogsService.log({
      organizationId,
      actorId,
      action: `APPROVAL_${dto.action}`,
      entityType: 'ApprovalInstance',
      entityId: instance.id,
      metadata: { action: dto.action, stepNumber: activeStep.stepNumber, newStatus: nextStatus },
    });

    await this.notificationsService.notify({
      organizationId,
      userId: instance.requesterId,
      type: NotificationType.TASK_ASSIGNED,
      message: `Approval decision updated for "${instance.title}": ${dto.action}`,
      entityType: 'ApprovalInstance',
      entityId: instance.id,
    });

    return this.mapInstanceToDto(instance.id, actorId, userContext);
  }

  async cancelInstance(organizationId: string, requesterId: string, instanceId: string): Promise<ApprovalInstanceDto> {
    const instance = await this.prisma.approvalInstance.findFirst({
      where: { id: instanceId, organizationId },
    });

    if (!instance) throw new NotFoundException(`Approval instance "${instanceId}" not found.`);

    if (instance.requesterId !== requesterId) {
      throw new ForbiddenException('Only the original requester can cancel an approval request.');
    }

    await this.prisma.approvalInstance.update({
      where: { id: instanceId },
      data: { status: ApprovalInstanceStatus.CANCELLED, completedAt: new Date() },
    });

    await this.auditLogsService.log({
      organizationId,
      actorId: requesterId,
      action: 'APPROVAL_CANCELLED',
      entityType: 'ApprovalInstance',
      entityId: instanceId,
      metadata: { title: instance.title },
    });

    return this.mapInstanceToDto(instanceId, requesterId);
  }

  // --------------------------------------------------
  // HELPER METHODS & AUTHORIZATION EVALUATION
  // --------------------------------------------------

  public canUserApproveStep(
    step: { approverType: ApproverType; targetRole?: Role | null; targetDepartmentId?: string | null; targetProjectId?: string | null; specificUserId?: string | null },
    userContext?: { userId: string; role: Role; departmentIds: string[]; projectIds: string[] },
  ): boolean {
    if (!userContext) return false;

    // External auditor cannot approve unless step explicitly configured for auditor
    if (userContext.role === Role.EXTERNAL_AUDITOR && step.targetRole !== Role.EXTERNAL_AUDITOR) {
      return false;
    }

    if (step.approverType === ApproverType.ROLE) {
      return userContext.role === step.targetRole || userContext.role === Role.ADMIN;
    } else if (step.approverType === ApproverType.ORGANIZATION_AUTHORITY) {
      return userContext.role === Role.ADMIN || userContext.role === Role.MSSP_ADMIN;
    } else if (step.approverType === ApproverType.SPECIFIC_USER) {
      return userContext.userId === step.specificUserId;
    } else if (step.approverType === ApproverType.DEPARTMENT) {
      if (userContext.role === Role.ADMIN) return true;
      return step.targetDepartmentId ? userContext.departmentIds.includes(step.targetDepartmentId) : false;
    } else if (step.approverType === ApproverType.PROJECT) {
      if (userContext.role === Role.ADMIN) return true;
      return step.targetProjectId ? userContext.projectIds.includes(step.targetProjectId) : false;
    }

    return false;
  }

  private async executeResourceStatusCallback(
    organizationId: string,
    instance: { resourceType: string; resourceId: string; purpose?: string | null },
    action: DecisionAction,
  ): Promise<void> {
    try {
      const { resourceType, resourceId, purpose } = instance;

      if (resourceType === 'POLICY') {
        let targetStatus = 'APPROVED';
        if (action === DecisionAction.REJECT) targetStatus = 'DRAFT';
        else if (action === DecisionAction.REQUEST_CHANGES) targetStatus = 'UNDER_REVIEW';
        await this.prisma.policy.updateMany({
          where: { id: resourceId, organizationId },
          data: { status: targetStatus as any },
        });
      } else if (resourceType === 'POLICY_EXCEPTION') {
        let targetStatus = 'APPROVED';
        if (action === DecisionAction.REJECT) targetStatus = 'REJECTED';
        else if (action === DecisionAction.REQUEST_CHANGES) targetStatus = 'PENDING';
        await this.prisma.policyException.updateMany({
          where: { id: resourceId, organizationId },
          data: { status: targetStatus as any },
        });
      } else if (resourceType === 'RISK') {
        let targetStatus = 'IN_TREATMENT';
        if (purpose === 'RISK_ACCEPTANCE') {
          targetStatus = action === DecisionAction.APPROVE ? 'ACCEPTED' : 'OPEN';
        } else {
          targetStatus = action === DecisionAction.APPROVE ? 'IN_TREATMENT' : 'OPEN';
        }
        await this.prisma.risk.updateMany({
          where: { id: resourceId, organizationId },
          data: { status: targetStatus as any },
        });
      } else if (resourceType === 'CONTROL' || resourceType === 'CONTROL_MAPPING') {
        let targetStatus = 'APPROVED';
        if (action === DecisionAction.REJECT) targetStatus = 'REJECTED';
        else if (action === DecisionAction.REQUEST_CHANGES) targetStatus = 'OVERRIDDEN';
        await this.prisma.controlFrameworkMapping.updateMany({
          where: { controlId: resourceId, control: { organizationId } },
          data: { status: targetStatus as any },
        });
      } else if (resourceType === 'AUDIT_FINDING') {
        let targetStatus = 'VERIFIED';
        if (purpose === 'FINDING_CLOSURE') {
          targetStatus = action === DecisionAction.APPROVE ? 'CLOSED' : 'IN_REMEDIATION';
        } else {
          targetStatus = action === DecisionAction.APPROVE ? 'VERIFIED' : 'IN_REMEDIATION';
        }
        await this.prisma.auditFinding.updateMany({
          where: { id: resourceId, organizationId },
          data: { status: targetStatus as any, ...(action === DecisionAction.APPROVE ? { verifiedAt: new Date() } : {}) },
        });
      } else if (resourceType === 'VENDOR_ASSESSMENT') {
        let targetStatus = 'COMPLETED';
        if (action === DecisionAction.REJECT || action === DecisionAction.REQUEST_CHANGES) {
          targetStatus = 'IN_PROGRESS';
        }
        await this.prisma.vendorAssessment.updateMany({
          where: { id: resourceId, organizationId },
          data: { status: targetStatus as any, ...(action === DecisionAction.APPROVE ? { completedAt: new Date() } : {}) },
        });
      } else if (resourceType === 'VULNERABILITY') {
        let targetStatus = 'RESOLVED';
        if (purpose === 'VULNERABILITY_RISK_ACCEPTANCE') {
          targetStatus = action === DecisionAction.APPROVE ? 'RISK_ACCEPTED' : 'OPEN';
        } else {
          targetStatus = action === DecisionAction.APPROVE ? 'RESOLVED' : 'IN_REMEDIATION';
        }
        await this.prisma.vulnerability.updateMany({
          where: { id: resourceId, organizationId },
          data: { status: targetStatus as any },
        });
      } else if (resourceType === 'INCIDENT') {
        let targetStatus = 'RESOLVED';
        if (purpose === 'INCIDENT_CLOSURE') {
          targetStatus = action === DecisionAction.APPROVE ? 'CLOSED' : 'IN_PROGRESS';
        } else {
          targetStatus = action === DecisionAction.APPROVE ? 'RESOLVED' : 'IN_PROGRESS';
        }
        await this.prisma.incident.updateMany({
          where: { id: resourceId, organizationId },
          data: { status: targetStatus as any, ...(action === DecisionAction.APPROVE ? { resolvedAt: new Date() } : {}) },
        });
      } else if (resourceType === 'EVIDENCE') {
        let targetStatus = 'ACTIVE';
        if (action === DecisionAction.REJECT) targetStatus = 'QUARANTINED';
        await this.prisma.evidence.updateMany({
          where: { id: resourceId, organizationId },
          data: { status: targetStatus as any },
        });
      }
    } catch {
      // Non-fatal callback execution
    }
  }

  private async verifyResourceBelongsToOrg(organizationId: string, resourceType: string, resourceId: string): Promise<void> {
    let exists = false;
    switch (resourceType) {
      case 'CONTROL':
        exists = !!(await this.prisma.control.findFirst({ where: { id: resourceId, organizationId } }));
        break;
      case 'RISK':
        exists = !!(await this.prisma.risk.findFirst({ where: { id: resourceId, organizationId } }));
        break;
      case 'POLICY':
        exists = !!(await this.prisma.policy.findFirst({ where: { id: resourceId, organizationId } }));
        break;
      case 'AUDIT_FINDING':
        exists = !!(await this.prisma.auditFinding.findFirst({ where: { id: resourceId, organizationId } }));
        break;
      case 'VENDOR_ASSESSMENT':
        exists = !!(await this.prisma.vendorAssessment.findFirst({ where: { id: resourceId, organizationId } }));
        break;
      case 'VULNERABILITY':
        exists = !!(await this.prisma.vulnerability.findFirst({ where: { id: resourceId, organizationId } }));
        break;
      case 'INCIDENT':
        exists = !!(await this.prisma.incident.findFirst({ where: { id: resourceId, organizationId } }));
        break;
      case 'POLICY_EXCEPTION':
        exists = !!(await this.prisma.policyException.findFirst({ where: { id: resourceId, organizationId } }));
        break;
      case 'EVIDENCE':
        exists = !!(await this.prisma.evidence.findFirst({ where: { id: resourceId, organizationId } }));
        break;
      default:
        exists = true;
    }

    if (!exists) {
      throw new NotFoundException(`Resource "${resourceType}" with ID "${resourceId}" not found in organization context.`);
    }
  }

  private async createApprovalResourceRelation(organizationId: string, approvalInstanceId: string, resourceType: string, resourceId: string): Promise<void> {
    try {
      switch (resourceType) {
        case 'CONTROL':
          await this.prisma.controlApproval.create({ data: { organizationId, approvalInstanceId, controlId: resourceId } });
          break;
        case 'RISK':
          await this.prisma.riskApproval.create({ data: { organizationId, approvalInstanceId, riskId: resourceId } });
          break;
        case 'POLICY':
          await this.prisma.policyApproval.create({ data: { organizationId, approvalInstanceId, policyId: resourceId } });
          break;
        case 'AUDIT_FINDING':
          await this.prisma.auditFindingApproval.create({ data: { organizationId, approvalInstanceId, findingId: resourceId } });
          break;
        case 'VENDOR_ASSESSMENT':
          await this.prisma.vendorAssessmentApproval.create({ data: { organizationId, approvalInstanceId, vendorAssessmentId: resourceId } });
          break;
        case 'VULNERABILITY':
          await this.prisma.vulnerabilityApproval.create({ data: { organizationId, approvalInstanceId, vulnerabilityId: resourceId } });
          break;
        case 'INCIDENT':
          await this.prisma.incidentApproval.create({ data: { organizationId, approvalInstanceId, incidentId: resourceId } });
          break;
        case 'POLICY_EXCEPTION':
          await this.prisma.policyExceptionApproval.create({ data: { organizationId, approvalInstanceId, policyExceptionId: resourceId } });
          break;
        case 'EVIDENCE':
          await this.prisma.evidenceApproval.create({ data: { organizationId, approvalInstanceId, evidenceId: resourceId } });
          break;
      }
    } catch {
      // Ignore duplicate mapping attempts
    }
  }

  private mapWorkflowToDto(w: any): ApprovalWorkflowDto {
    return {
      id: w.id,
      organizationId: w.organizationId,
      name: w.name,
      description: w.description,
      applicableResourceType: w.applicableResourceType,
      status: w.status as ApprovalWorkflowStatus,
      allowSelfApproval: w.allowSelfApproval,
      steps: w.steps ? w.steps.map((s: any) => ({
        id: s.id,
        stepNumber: s.stepNumber,
        name: s.name,
        approverType: s.approverType as ApproverType,
        targetRole: s.targetRole as Role,
        targetDepartmentId: s.targetDepartmentId,
        targetProjectId: s.targetProjectId,
        specificUserId: s.specificUserId,
        dueDays: s.dueDays,
      })) : [],
      createdAt: w.createdAt.toISOString(),
      updatedAt: w.updatedAt.toISOString(),
    };
  }

  private async mapInstanceToDto(
    instanceId: string,
    currentUserId: string,
    userContext?: { userId: string; role: Role; departmentIds: string[]; projectIds: string[] },
  ): Promise<ApprovalInstanceDto> {
    const ins = await this.prisma.approvalInstance.findUnique({
      where: { id: instanceId },
      include: {
        steps: { orderBy: { stepNumber: 'asc' } },
        decisions: { orderBy: { createdAt: 'desc' } },
      },
    });

    if (!ins) throw new NotFoundException(`Approval instance "${instanceId}" not found.`);

    const requester = await this.prisma.user.findUnique({ where: { id: ins.requesterId } });
    const decisionUserIds = Array.from(new Set(ins.decisions.map((d) => d.actorId)));
    const decisionUsers = await this.prisma.user.findMany({ where: { id: { in: decisionUserIds } } });
    const userMap = new Map(decisionUsers.map((u) => [u.id, u.name || u.email]));

    const activeStep = ins.steps.find((s) => s.stepNumber === ins.currentStepNumber);
    let canUserApprove = false;
    if (activeStep && userContext && ins.status !== ApprovalInstanceStatus.APPROVED && ins.status !== ApprovalInstanceStatus.REJECTED && ins.status !== ApprovalInstanceStatus.CANCELLED) {
      canUserApprove = this.canUserApproveStep(activeStep as any, userContext);
    }

    return {
      id: ins.id,
      organizationId: ins.organizationId,
      workflowId: ins.workflowId,
      title: ins.title,
      description: ins.description,
      resourceType: ins.resourceType,
      resourceId: ins.resourceId,
      requesterId: ins.requesterId,
      requesterName: requester ? requester.name || requester.email : 'Unknown Requester',
      status: ins.status as ApprovalInstanceStatus,
      purpose: ins.purpose as any,
      currentStepNumber: ins.currentStepNumber,
      dueAt: ins.dueAt ? ins.dueAt.toISOString() : null,
      frameworkReferenceId: ins.frameworkReferenceId,
      createdAt: ins.createdAt.toISOString(),
      updatedAt: ins.updatedAt.toISOString(),
      completedAt: ins.completedAt ? ins.completedAt.toISOString() : null,
      canUserApprove,
      steps: ins.steps.map((s) => ({
        id: s.id,
        stepNumber: s.stepNumber,
        name: s.name,
        approverType: s.approverType as ApproverType,
        targetRole: s.targetRole as Role,
        targetDepartmentId: s.targetDepartmentId,
        targetProjectId: s.targetProjectId,
        specificUserId: s.specificUserId,
        status: s.status as ApprovalStepStatus,
        activatedAt: s.activatedAt ? s.activatedAt.toISOString() : null,
        completedAt: s.completedAt ? s.completedAt.toISOString() : null,
      })),
      decisions: ins.decisions.map((d) => ({
        id: d.id,
        organizationId: d.organizationId,
        approvalInstanceId: d.approvalInstanceId,
        stepId: d.stepId,
        actorId: d.actorId,
        actorName: userMap.get(d.actorId) || 'Reviewer',
        action: d.action as DecisionAction,
        comment: d.comment,
        createdAt: d.createdAt.toISOString(),
      })),
    };
  }
}
