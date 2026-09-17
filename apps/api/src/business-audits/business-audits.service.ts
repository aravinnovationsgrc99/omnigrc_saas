import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { NotificationsService } from '../notifications/notifications.service';
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
  ) {}

  // --------------------------------------------------
  // AUDIT PLANS
  // --------------------------------------------------

  async createPlan(organizationId: string, createdById: string, dto: CreateAuditPlanDto): Promise<AuditPlanDto> {
    const plan = await this.prisma.auditPlan.create({
      data: {
        organizationId,
        title: dto.title,
        objective: dto.objective,
        scope: dto.scope,
        frameworkCode: dto.frameworkCode,
        ownerId: dto.ownerId,
        plannedStartDate: dto.plannedStartDate ? new Date(dto.plannedStartDate) : null,
        plannedEndDate: dto.plannedEndDate ? new Date(dto.plannedEndDate) : null,
        status: AuditPlanStatus.DRAFT,
        createdById,
      },
    });

    await this.auditLogsService.log({
      organizationId,
      actorId: createdById,
      action: 'AUDIT_PLAN_CREATED',
      entityType: 'AuditPlan',
      entityId: plan.id,
      metadata: { title: plan.title, frameworkCode: plan.frameworkCode },
    });

    return this.mapPlanToDto(plan);
  }

  async findAllPlans(
    organizationId: string,
    query: { page?: number; limit?: number; status?: AuditPlanStatus; search?: string },
  ): Promise<PaginatedAuditPlansDto> {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;
    const skip = (page - 1) * limit;

    const where: any = { organizationId };
    if (query.status) where.status = query.status;
    if (query.search) {
      where.OR = [
        { title: { contains: query.search, mode: 'insensitive' } },
        { objective: { contains: query.search, mode: 'insensitive' } },
      ];
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

  async findOnePlan(organizationId: string, id: string): Promise<AuditPlanDto> {
    const plan = await this.prisma.auditPlan.findFirst({
      where: { id, organizationId },
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

  async updatePlan(organizationId: string, id: string, actorId: string, dto: UpdateAuditPlanDto): Promise<AuditPlanDto> {
    await this.findOnePlan(organizationId, id);

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
      },
    });

    await this.auditLogsService.log({
      organizationId,
      actorId,
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

  async createSchedule(organizationId: string, actorId: string, dto: CreateAuditScheduleDto): Promise<AuditScheduleDto> {
    await this.findOnePlan(organizationId, dto.auditPlanId);

    const schedule = await this.prisma.auditSchedule.create({
      data: {
        organizationId,
        auditPlanId: dto.auditPlanId,
        scheduledStartDate: new Date(dto.scheduledStartDate),
        scheduledEndDate: new Date(dto.scheduledEndDate),
        leadAuditorId: dto.leadAuditorId,
        recurrence: dto.recurrence || null,
        status: AuditScheduleStatus.SCHEDULED,
      },
    });

    await this.notificationsService.notify({
      organizationId,
      userId: dto.leadAuditorId,
      type: NotificationType.TASK_ASSIGNED,
      message: `You have been assigned as Lead Auditor for an upcoming Audit Schedule.`,
      entityType: 'AuditSchedule',
      entityId: schedule.id,
    });

    await this.auditLogsService.log({
      organizationId,
      actorId,
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

  async createAssessment(organizationId: string, createdById: string, dto: CreateAuditAssessmentDto): Promise<AuditAssessmentDto> {
    const plan = await this.findOnePlan(organizationId, dto.auditPlanId);

    // Auto-populate check items from mapped controls or standard framework controls if available
    const controls = await this.prisma.control.findMany({
      where: { organizationId, deletedAt: null },
      take: 20,
    });

    const assessment = await this.prisma.$transaction(async (tx) => {
      const newAssessment = await tx.auditAssessment.create({
        data: {
          organizationId,
          auditPlanId: dto.auditPlanId,
          scheduleId: dto.scheduleId || null,
          auditorId: dto.auditorId,
          summary: dto.summary,
          status: AuditAssessmentStatus.IN_PROGRESS,
          score: 0,
          createdById,
        },
      });

      // Create check items
      const checkItemsData = controls.map((c) => ({
        organizationId,
        assessmentId: newAssessment.id,
        controlId: c.id,
        title: `Evaluate Control: ${c.name}`,
        description: c.description,
        result: AuditCheckResult.NOT_EVALUATED,
        createdById,
      }));

      if (checkItemsData.length > 0) {
        await tx.auditCheckItem.createMany({ data: checkItemsData });
      }

      return tx.auditAssessment.findUnique({
        where: { id: newAssessment.id },
        include: { checkItems: true },
      });
    });

    // Mark plan status IN_PROGRESS
    await this.prisma.auditPlan.update({
      where: { id: dto.auditPlanId },
      data: { status: AuditPlanStatus.IN_PROGRESS },
    });

    await this.auditLogsService.log({
      organizationId,
      actorId: createdById,
      action: 'AUDIT_ASSESSMENT_STARTED',
      entityType: 'AuditAssessment',
      entityId: assessment!.id,
      metadata: { auditorId: dto.auditorId },
    });

    return this.mapAssessmentToDto(assessment);
  }

  async evaluateCheckItem(organizationId: string, checkItemId: string, actorId: string, dto: UpdateCheckItemDto): Promise<any> {
    const checkItem = await this.prisma.auditCheckItem.findFirst({
      where: { id: checkItemId, organizationId },
      include: { assessment: { include: { checkItems: true } } },
    });

    if (!checkItem) throw new NotFoundException(`AuditCheckItem "${checkItemId}" not found`);

    const updatedCheckItem = await this.prisma.auditCheckItem.update({
      where: { id: checkItemId },
      data: {
        ...(dto.result && { result: dto.result }),
        ...(dto.notes !== undefined && { notes: dto.notes }),
      },
    });

    // Recalculate authoritative assessment score
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

  async createFinding(organizationId: string, createdById: string, dto: CreateAuditFindingDto): Promise<AuditFindingDto> {
    const finding = await this.prisma.auditFinding.create({
      data: {
        organizationId,
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
        createdById,
      },
    });

    await this.auditLogsService.log({
      organizationId,
      actorId: createdById,
      action: 'AUDIT_FINDING_CREATED',
      entityType: 'AuditFinding',
      entityId: finding.id,
      metadata: { title: finding.title, severity: finding.severity },
    });

    return this.mapFindingToDto(finding);
  }

  async updateFindingStatus(
    organizationId: string,
    id: string,
    actorId: string,
    dto: UpdateAuditFindingDto,
  ): Promise<AuditFindingDto> {
    const finding = await this.prisma.auditFinding.findFirst({
      where: { id, organizationId },
    });

    if (!finding) throw new NotFoundException(`Audit Finding "${id}" not found`);

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
      organizationId,
      actorId,
      action: 'AUDIT_FINDING_UPDATED',
      entityType: 'AuditFinding',
      entityId: id,
      metadata: { status: updated.status },
    });

    return this.mapFindingToDto(updated);
  }

  async verifyFinding(
    organizationId: string,
    id: string,
    verifiedById: string,
    status: FindingStatus.VERIFIED | FindingStatus.CLOSED,
    verificationNotes?: string,
  ): Promise<AuditFindingDto> {
    const finding = await this.prisma.auditFinding.findFirst({
      where: { id, organizationId },
    });

    if (!finding) throw new NotFoundException(`Audit Finding "${id}" not found`);

    if (finding.status !== FindingStatus.READY_FOR_VERIFICATION && finding.status !== FindingStatus.IN_REMEDIATION) {
      throw new BadRequestException(`Finding must be IN_REMEDIATION or READY_FOR_VERIFICATION before verification/closure.`);
    }

    const updated = await this.prisma.auditFinding.update({
      where: { id },
      data: {
        status,
        verifiedById,
        verifiedAt: new Date(),
        verificationNotes: verificationNotes || finding.verificationNotes,
      },
    });

    await this.auditLogsService.log({
      organizationId,
      actorId: verifiedById,
      action: status === FindingStatus.VERIFIED ? 'AUDIT_FINDING_VERIFIED' : 'AUDIT_FINDING_CLOSED',
      entityType: 'AuditFinding',
      entityId: id,
      metadata: { status },
    });

    return this.mapFindingToDto(updated);
  }

  async createCapa(organizationId: string, dto: CreateAuditCapaDto): Promise<AuditCapaDto> {
    const capa = await this.prisma.auditCapa.create({
      data: {
        organizationId,
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

  async addEvidence(organizationId: string, uploadedById: string, dto: CreateAuditEvidenceDto): Promise<any> {
    return this.prisma.auditEvidence.create({
      data: {
        organizationId,
        checkItemId: dto.checkItemId || null,
        findingId: dto.findingId || null,
        fileName: dto.fileName,
        fileUrl: dto.fileUrl,
        fileSize: dto.fileSize || null,
        mimeType: dto.mimeType || null,
        uploadedById,
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
    };
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
