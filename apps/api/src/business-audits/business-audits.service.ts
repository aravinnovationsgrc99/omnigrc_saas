import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ResourceAuthorizationService, ResourceAuthContext } from '../auth/resource-authorization.service';
import {
  AuditPlanStatus,
  AuditScheduleStatus,
  AuditAssessmentStatus,
  AuditCheckResult,
  FindingStatus,
  CapaStatus,
  NotificationType,
  calculateAuditScore,
  AuditPlanDto,
  AuditScheduleDto,
  AuditAssessmentDto,
  AuditFindingDto,
  AuditCapaDto,
  PaginatedAuditPlansDto,
  PaginatedAuditFindingsDto,
} from '@omnigrc/shared';
import {
  CreateAuditPlanDto,
  UpdateAuditPlanDto,
  CreateAuditScheduleDto,
  CreateAuditAssessmentDto,
  UpdateCheckItemDto,
  CreateAuditFindingDto,
  UpdateAuditFindingDto,
  CreateAuditCapaDto,
  UpdateAuditCapaDto,
  CreateAuditEvidenceDto,
} from './dto/business-audits.dto';

@Injectable()
export class BusinessAuditsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogsService: AuditLogsService,
    private readonly notificationsService: NotificationsService,
    private readonly resourceAuthService: ResourceAuthorizationService,
  ) {}

  // --------------------------------------------------
  // AUDIT PLANS
  // --------------------------------------------------

  async createPlan(authCtx: ResourceAuthContext, dto: CreateAuditPlanDto): Promise<AuditPlanDto> {
    await this.resourceAuthService.authorize(authCtx, {
      action: 'WRITE',
      departmentId: dto.departmentId,
      projectId: dto.projectId,
    });

    await this.resourceAuthService.validateHierarchyInvariants(
      authCtx.organizationId,
      dto.departmentId,
      dto.projectId,
    );

    const plan = await this.prisma.auditPlan.create({
      data: {
        organizationId: authCtx.organizationId,
        departmentId: dto.departmentId || null,
        projectId: dto.projectId || null,
        title: dto.title,
        objective: dto.objective,
        scope: dto.scope,
        frameworkCode: dto.frameworkCode,
        ownerId: dto.ownerId,
        plannedStartDate: dto.plannedStartDate ? new Date(dto.plannedStartDate) : null,
        plannedEndDate: dto.plannedEndDate ? new Date(dto.plannedEndDate) : null,
        status: AuditPlanStatus.DRAFT,
        createdById: authCtx.userId,
      },
    });

    await this.auditLogsService.log({
      organizationId: authCtx.organizationId,
      actorId: authCtx.userId,
      action: 'AUDIT_PLAN_CREATED',
      entityType: 'AuditPlan',
      entityId: plan.id,
      metadata: { title: plan.title, frameworkCode: plan.frameworkCode, departmentId: plan.departmentId, projectId: plan.projectId },
    });

    return this.mapPlanToDto(plan);
  }

  async findAllPlans(
    authCtx: ResourceAuthContext,
    query: { page?: number; limit?: number; status?: AuditPlanStatus; search?: string },
  ): Promise<PaginatedAuditPlansDto> {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;
    const skip = (page - 1) * limit;

    const scopeWhere = await this.resourceAuthService.getScopeWhereClause(authCtx);

    const where: any = { ...scopeWhere };
    if (query.status) where.status = query.status;
    if (query.search && query.search.trim()) {
      const searchTerm = query.search.trim();
      const searchConditions = [
        { title: { contains: searchTerm, mode: 'insensitive' } },
        { objective: { contains: searchTerm, mode: 'insensitive' } },
      ];

      if (where.OR) {
        where.AND = [
          { OR: where.OR },
          { OR: searchConditions },
        ];
        delete where.OR;
      } else {
        where.OR = searchConditions;
      }
    }

    const [items, total] = await Promise.all([
      this.prisma.auditPlan.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: { schedules: true, assessments: true },
      }),
      this.prisma.auditPlan.count({ where }),
    ]);

    return {
      items: items.map((p) => this.mapPlanToDto(p)),
      total,
      page,
      limit,
    };
  }

  async findOnePlan(authCtx: ResourceAuthContext, id: string): Promise<AuditPlanDto> {
    const scopeWhere = await this.resourceAuthService.getScopeWhereClause(authCtx);
    const plan = await this.prisma.auditPlan.findFirst({
      where: { id, ...scopeWhere },
      include: {
        schedules: true,
        assessments: {
          include: {
            checkItems: { include: { evidence: true } },
            findings: { include: { capas: true, evidence: true } },
          },
        },
      },
    });

    if (!plan) throw new NotFoundException(`Audit Plan with ID "${id}" not found`);
    return this.mapPlanToDto(plan);
  }

  async updatePlan(authCtx: ResourceAuthContext, id: string, dto: UpdateAuditPlanDto): Promise<AuditPlanDto> {
    const scopeWhere = await this.resourceAuthService.getScopeWhereClause(authCtx);
    const existing = await this.prisma.auditPlan.findFirst({
      where: { id, ...scopeWhere },
    });

    if (!existing) throw new NotFoundException(`Audit Plan with ID "${id}" not found`);

    if (dto.departmentId !== undefined || dto.projectId !== undefined) {
      const targetDeptId = dto.departmentId !== undefined ? dto.departmentId : existing.departmentId || undefined;
      const targetProjId = dto.projectId !== undefined ? dto.projectId : existing.projectId || undefined;

      await this.resourceAuthService.authorize(authCtx, {
        action: 'WRITE',
        departmentId: targetDeptId,
        projectId: targetProjId,
      });

      await this.resourceAuthService.validateHierarchyInvariants(
        authCtx.organizationId,
        targetDeptId,
        targetProjId,
      );
    }

    const updated = await this.prisma.auditPlan.update({
      where: { id },
      data: {
        ...(dto.title && { title: dto.title }),
        ...(dto.objective !== undefined && { objective: dto.objective }),
        ...(dto.scope !== undefined && { scope: dto.scope }),
        ...(dto.frameworkCode !== undefined && { frameworkCode: dto.frameworkCode }),
        ...(dto.ownerId && { ownerId: dto.ownerId }),
        ...(dto.plannedStartDate !== undefined && { plannedStartDate: dto.plannedStartDate ? new Date(dto.plannedStartDate) : null }),
        ...(dto.plannedEndDate !== undefined && { plannedEndDate: dto.plannedEndDate ? new Date(dto.plannedEndDate) : null }),
        ...(dto.status && { status: dto.status }),
        ...(dto.departmentId !== undefined && { departmentId: dto.departmentId }),
        ...(dto.projectId !== undefined && { projectId: dto.projectId }),
      },
    });

    await this.auditLogsService.log({
      organizationId: authCtx.organizationId,
      actorId: authCtx.userId,
      action: 'AUDIT_PLAN_UPDATED',
      entityType: 'AuditPlan',
      entityId: id,
      metadata: { status: updated.status },
    });

    return this.mapPlanToDto(updated);
  }

  // --------------------------------------------------
  // AUDIT SCHEDULES
  // --------------------------------------------------

  async createSchedule(authCtx: ResourceAuthContext, dto: CreateAuditScheduleDto): Promise<AuditScheduleDto> {
    const plan = await this.findOnePlan(authCtx, dto.auditPlanId);

    const schedule = await this.prisma.auditSchedule.create({
      data: {
        organizationId: authCtx.organizationId,
        auditPlanId: dto.auditPlanId,
        scheduledStartDate: new Date(dto.scheduledStartDate),
        scheduledEndDate: new Date(dto.scheduledEndDate),
        leadAuditorId: dto.leadAuditorId,
        recurrence: dto.recurrence || null,
        status: AuditScheduleStatus.SCHEDULED,
      },
    });

    await this.notificationsService.notify({
      organizationId: authCtx.organizationId,
      userId: dto.leadAuditorId,
      type: NotificationType.TASK_ASSIGNED,
      message: `You have been assigned as Lead Auditor for an upcoming Audit Schedule.`,
      entityType: 'AuditSchedule',
      entityId: schedule.id,
    });

    await this.auditLogsService.log({
      organizationId: authCtx.organizationId,
      actorId: authCtx.userId,
      action: 'AUDIT_SCHEDULE_CREATED',
      entityType: 'AuditSchedule',
      entityId: schedule.id,
      metadata: { leadAuditorId: schedule.leadAuditorId },
    });

    return this.mapScheduleToDto(schedule);
  }

  // --------------------------------------------------
  // AUDIT ASSESSMENTS & EXECUTION
  // --------------------------------------------------

  async createAssessment(authCtx: ResourceAuthContext, dto: CreateAuditAssessmentDto): Promise<AuditAssessmentDto> {
    const plan = await this.findOnePlan(authCtx, dto.auditPlanId);

    const scopeWhere = await this.resourceAuthService.getScopeWhereClause(authCtx);

    const controls = await this.prisma.control.findMany({
      where: { ...scopeWhere, deletedAt: null },
      take: 20,
    });

    const assessment = await this.prisma.$transaction(async (tx) => {
      const newAssessment = await tx.auditAssessment.create({
        data: {
          organizationId: authCtx.organizationId,
          auditPlanId: dto.auditPlanId,
          scheduleId: dto.scheduleId || null,
          auditorId: dto.auditorId,
          summary: dto.summary,
          status: AuditAssessmentStatus.IN_PROGRESS,
          score: 0,
          createdById: authCtx.userId,
        },
      });

      const checkItemsData = controls.map((c) => ({
        organizationId: authCtx.organizationId,
        assessmentId: newAssessment.id,
        controlId: c.id,
        title: `Evaluate Control: ${c.name}`,
        description: c.description,
        result: AuditCheckResult.NOT_EVALUATED,
        createdById: authCtx.userId,
      }));

      if (checkItemsData.length > 0) {
        await tx.auditCheckItem.createMany({ data: checkItemsData });
      }

      return tx.auditAssessment.findUnique({
        where: { id: newAssessment.id },
        include: { checkItems: true },
      });
    });

    await this.prisma.auditPlan.update({
      where: { id: dto.auditPlanId },
      data: { status: AuditPlanStatus.IN_PROGRESS },
    });

    await this.auditLogsService.log({
      organizationId: authCtx.organizationId,
      actorId: authCtx.userId,
      action: 'AUDIT_ASSESSMENT_STARTED',
      entityType: 'AuditAssessment',
      entityId: assessment!.id,
      metadata: { auditorId: dto.auditorId },
    });

    return this.mapAssessmentToDto(assessment);
  }

  async evaluateCheckItem(authCtx: ResourceAuthContext, checkItemId: string, dto: UpdateCheckItemDto): Promise<any> {
    const checkItem = await this.prisma.auditCheckItem.findFirst({
      where: { id: checkItemId, organizationId: authCtx.organizationId },
      include: { assessment: { include: { auditPlan: true, checkItems: true } } },
    });

    if (!checkItem) throw new NotFoundException(`AuditCheckItem "${checkItemId}" not found`);

    await this.resourceAuthService.assertResourceAccess(authCtx, checkItem.assessment.auditPlan);

    const updatedCheckItem = await this.prisma.auditCheckItem.update({
      where: { id: checkItemId },
      data: {
        ...(dto.result && { result: dto.result }),
        ...(dto.notes !== undefined && { notes: dto.notes }),
      },
    });

    const allCheckItems = await this.prisma.auditCheckItem.findMany({
      where: { assessmentId: checkItem.assessmentId },
    });

    const newScore = calculateAuditScore(
      allCheckItems.map((i) => ({ result: i.result as unknown as AuditCheckResult })),
    );

    await this.prisma.auditAssessment.update({
      where: { id: checkItem.assessmentId },
      data: { score: newScore },
    });

    return updatedCheckItem;
  }

  // --------------------------------------------------
  // FINDINGS & CAPA
  // --------------------------------------------------

  async createFinding(authCtx: ResourceAuthContext, dto: CreateAuditFindingDto): Promise<AuditFindingDto> {
    const assessment = await this.prisma.auditAssessment.findFirst({
      where: { id: dto.assessmentId, organizationId: authCtx.organizationId },
      include: { auditPlan: true },
    });

    if (!assessment) throw new NotFoundException(`Audit Assessment "${dto.assessmentId}" not found`);

    await this.resourceAuthService.assertResourceAccess(authCtx, assessment.auditPlan);

    const finding = await this.prisma.auditFinding.create({
      data: {
        organizationId: authCtx.organizationId,
        assessmentId: dto.assessmentId,
        checkItemId: dto.checkItemId || null,
        title: dto.title,
        description: dto.description,
        severity: dto.severity,
        status: FindingStatus.OPEN,
        ownerId: dto.ownerId,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
        riskId: dto.riskId || null,
        remediationPlan: dto.remediationPlan,
        createdById: authCtx.userId,
      },
    });

    await this.auditLogsService.log({
      organizationId: authCtx.organizationId,
      actorId: authCtx.userId,
      action: 'AUDIT_FINDING_CREATED',
      entityType: 'AuditFinding',
      entityId: finding.id,
      metadata: { title: finding.title, severity: finding.severity },
    });

    return this.mapFindingToDto(finding);
  }

  async updateFindingStatus(
    authCtx: ResourceAuthContext,
    id: string,
    dto: UpdateAuditFindingDto,
  ): Promise<AuditFindingDto> {
    const finding = await this.prisma.auditFinding.findFirst({
      where: { id, organizationId: authCtx.organizationId },
      include: { assessment: { include: { auditPlan: true } } },
    });

    if (!finding) throw new NotFoundException(`Audit Finding "${id}" not found`);

    await this.resourceAuthService.assertResourceAccess(authCtx, finding.assessment.auditPlan);

    const updated = await this.prisma.auditFinding.update({
      where: { id },
      data: {
        ...(dto.title && { title: dto.title }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.severity && { severity: dto.severity }),
        ...(dto.status && { status: dto.status }),
        ...(dto.ownerId && { ownerId: dto.ownerId }),
        ...(dto.dueDate !== undefined && { dueDate: dto.dueDate ? new Date(dto.dueDate) : null }),
        ...(dto.remediationPlan !== undefined && { remediationPlan: dto.remediationPlan }),
        ...(dto.verificationNotes !== undefined && { verificationNotes: dto.verificationNotes }),
      },
    });

    await this.auditLogsService.log({
      organizationId: authCtx.organizationId,
      actorId: authCtx.userId,
      action: 'AUDIT_FINDING_UPDATED',
      entityType: 'AuditFinding',
      entityId: id,
      metadata: { status: updated.status },
    });

    return this.mapFindingToDto(updated);
  }

  async verifyFinding(
    authCtx: ResourceAuthContext,
    id: string,
    status: FindingStatus.VERIFIED | FindingStatus.CLOSED,
    verificationNotes?: string,
  ): Promise<AuditFindingDto> {
    const finding = await this.prisma.auditFinding.findFirst({
      where: { id, organizationId: authCtx.organizationId },
      include: { assessment: { include: { auditPlan: true } } },
    });

    if (!finding) throw new NotFoundException(`Audit Finding "${id}" not found`);

    await this.resourceAuthService.assertResourceAccess(authCtx, finding.assessment.auditPlan);

    if (finding.status !== FindingStatus.READY_FOR_VERIFICATION && finding.status !== FindingStatus.IN_REMEDIATION) {
      throw new BadRequestException(`Finding must be IN_REMEDIATION or READY_FOR_VERIFICATION before verification/closure.`);
    }

    const updated = await this.prisma.auditFinding.update({
      where: { id },
      data: {
        status,
        verifiedById: authCtx.userId,
        verifiedAt: new Date(),
        verificationNotes: verificationNotes || finding.verificationNotes,
      },
    });

    await this.auditLogsService.log({
      organizationId: authCtx.organizationId,
      actorId: authCtx.userId,
      action: status === FindingStatus.VERIFIED ? 'AUDIT_FINDING_VERIFIED' : 'AUDIT_FINDING_CLOSED',
      entityType: 'AuditFinding',
      entityId: id,
      metadata: { status },
    });

    return this.mapFindingToDto(updated);
  }

  async createCapa(authCtx: ResourceAuthContext, dto: CreateAuditCapaDto): Promise<AuditCapaDto> {
    const finding = await this.prisma.auditFinding.findFirst({
      where: { id: dto.findingId, organizationId: authCtx.organizationId },
      include: { assessment: { include: { auditPlan: true } } },
    });

    if (!finding) throw new NotFoundException(`Audit Finding "${dto.findingId}" not found`);

    await this.resourceAuthService.assertResourceAccess(authCtx, finding.assessment.auditPlan);

    const capa = await this.prisma.auditCapa.create({
      data: {
        organizationId: authCtx.organizationId,
        findingId: dto.findingId,
        title: dto.title,
        correctiveAction: dto.correctiveAction,
        preventiveAction: dto.preventiveAction,
        ownerId: dto.ownerId,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
        status: CapaStatus.OPEN,
      },
    });

    return this.mapCapaToDto(capa);
  }

  async addEvidence(authCtx: ResourceAuthContext, dto: CreateAuditEvidenceDto): Promise<any> {
    if (dto.checkItemId) {
      const checkItem = await this.prisma.auditCheckItem.findFirst({
        where: { id: dto.checkItemId, organizationId: authCtx.organizationId },
        include: { assessment: { include: { auditPlan: true } } },
      });
      if (!checkItem) throw new NotFoundException(`AuditCheckItem "${dto.checkItemId}" not found`);
      await this.resourceAuthService.assertResourceAccess(authCtx, checkItem.assessment.auditPlan);
    }

    if (dto.findingId) {
      const finding = await this.prisma.auditFinding.findFirst({
        where: { id: dto.findingId, organizationId: authCtx.organizationId },
        include: { assessment: { include: { auditPlan: true } } },
      });
      if (!finding) throw new NotFoundException(`AuditFinding "${dto.findingId}" not found`);
      await this.resourceAuthService.assertResourceAccess(authCtx, finding.assessment.auditPlan);
    }

    return this.prisma.auditEvidence.create({
      data: {
        organizationId: authCtx.organizationId,
        checkItemId: dto.checkItemId || null,
        findingId: dto.findingId || null,
        fileName: dto.fileName,
        fileUrl: dto.fileUrl,
        fileSize: dto.fileSize || null,
        mimeType: dto.mimeType || null,
        uploadedById: authCtx.userId,
      },
    });
  }

  // --------------------------------------------------
  // MAPPER HELPERS
  // --------------------------------------------------

  private mapPlanToDto(p: any): AuditPlanDto {
    return {
      id: p.id,
      organizationId: p.organizationId,
      departmentId: p.departmentId || null,
      projectId: p.projectId || null,
      title: p.title,
      objective: p.objective,
      scope: p.scope,
      frameworkCode: p.frameworkCode,
      ownerId: p.ownerId,
      plannedStartDate: p.plannedStartDate ? p.plannedStartDate.toISOString() : null,
      plannedEndDate: p.plannedEndDate ? p.plannedEndDate.toISOString() : null,
      status: p.status as AuditPlanStatus,
      createdById: p.createdById,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
      schedules: p.schedules ? p.schedules.map((s: any) => this.mapScheduleToDto(s)) : [],
      assessments: p.assessments ? p.assessments.map((a: any) => this.mapAssessmentToDto(a)) : [],
    } as any;
  }

  private mapScheduleToDto(s: any): AuditScheduleDto {
    return {
      id: s.id,
      organizationId: s.organizationId,
      auditPlanId: s.auditPlanId,
      scheduledStartDate: s.scheduledStartDate.toISOString(),
      scheduledEndDate: s.scheduledEndDate.toISOString(),
      leadAuditorId: s.leadAuditorId,
      status: s.status as AuditScheduleStatus,
      recurrence: s.recurrence,
      nextAuditDate: s.nextAuditDate ? s.nextAuditDate.toISOString() : null,
      createdAt: s.createdAt.toISOString(),
      updatedAt: s.updatedAt.toISOString(),
    };
  }

  private mapAssessmentToDto(a: any): AuditAssessmentDto {
    return {
      id: a.id,
      organizationId: a.organizationId,
      auditPlanId: a.auditPlanId,
      scheduleId: a.scheduleId,
      auditorId: a.auditorId,
      status: a.status as AuditAssessmentStatus,
      score: a.score,
      summary: a.summary,
      startedAt: a.startedAt.toISOString(),
      completedAt: a.completedAt ? a.completedAt.toISOString() : null,
      createdById: a.createdById,
      createdAt: a.createdAt.toISOString(),
      updatedAt: a.updatedAt.toISOString(),
      checkItems: a.checkItems ? a.checkItems.map((c: any) => ({
        id: c.id,
        organizationId: c.organizationId,
        assessmentId: c.assessmentId,
        controlId: c.controlId,
        title: c.title,
        description: c.description,
        result: c.result as AuditCheckResult,
        notes: c.notes,
        createdById: c.createdById,
        createdAt: c.createdAt.toISOString(),
        updatedAt: c.updatedAt.toISOString(),
      })) : [],
      findings: a.findings ? a.findings.map((f: any) => this.mapFindingToDto(f)) : [],
    };
  }

  private mapFindingToDto(f: any): AuditFindingDto {
    return {
      id: f.id,
      organizationId: f.organizationId,
      assessmentId: f.assessmentId,
      checkItemId: f.checkItemId,
      title: f.title,
      description: f.description,
      severity: f.severity,
      status: f.status as FindingStatus,
      ownerId: f.ownerId,
      dueDate: f.dueDate ? f.dueDate.toISOString() : null,
      riskId: f.riskId,
      remediationPlan: f.remediationPlan,
      verificationNotes: f.verificationNotes,
      verifiedById: f.verifiedById,
      verifiedAt: f.verifiedAt ? f.verifiedAt.toISOString() : null,
      createdById: f.createdById,
      createdAt: f.createdAt.toISOString(),
      updatedAt: f.updatedAt.toISOString(),
      capas: f.capas ? f.capas.map((c: any) => this.mapCapaToDto(c)) : [],
    };
  }

  private mapCapaToDto(c: any): AuditCapaDto {
    return {
      id: c.id,
      organizationId: c.organizationId,
      findingId: c.findingId,
      title: c.title,
      correctiveAction: c.correctiveAction,
      preventiveAction: c.preventiveAction,
      ownerId: c.ownerId,
      dueDate: c.dueDate ? c.dueDate.toISOString() : null,
      status: c.status as CapaStatus,
      completedAt: c.completedAt ? c.completedAt.toISOString() : null,
      verifiedById: c.verifiedById,
      verifiedAt: c.verifiedAt ? c.verifiedAt.toISOString() : null,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
    };
  }
}
