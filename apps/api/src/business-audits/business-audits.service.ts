import { Injectable, NotFoundException, BadRequestException, ForbiddenException, ConflictException, Optional } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ResourceAuthorizationService, ResourceAuthContext } from '../auth/resource-authorization.service';
import { FrameworkEntitlementsService } from '../frameworks/framework-entitlements.service';
import { TenantContext } from '../tenant/tenant.context';
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
  ControlTestExecutionDto,
  PaginatedControlTestsDto,
  ControlTestingSummaryDto,
  ControlEffectivenessStatus,
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
import { CreateControlTestDto, ControlTestQueryDto } from '../controls/dto/controls.dto';

@Injectable()
export class BusinessAuditsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogsService: AuditLogsService,
    private readonly notificationsService: NotificationsService,
    private readonly resourceAuthService: ResourceAuthorizationService,
    @Optional()
    private readonly frameworkEntitlementsService?: FrameworkEntitlementsService,
  ) {}

  // --------------------------------------------------
  // AUDIT PLANS
  // --------------------------------------------------

  private async validateFrameworkScope(
    organizationId: string,
    frameworkId?: string | null,
    frameworkVersionId?: string | null,
    frameworkReferenceIds?: string[],
    frameworkCode?: string | null,
  ): Promise<{ frameworkId?: string | null; frameworkVersionId?: string | null; frameworkCode?: string | null }> {
    let targetFwId = frameworkId;
    let resolvedCode = frameworkCode;

    if (!targetFwId && frameworkCode) {
      const fwByCode = await this.prisma.framework.findFirst({
        where: { code: frameworkCode as any },
      });
      if (fwByCode) {
        targetFwId = fwByCode.id;
      }
    }

    if (!targetFwId && frameworkReferenceIds && frameworkReferenceIds.length > 0) {
      throw new BadRequestException('Cannot assign framework references without a valid framework');
    }

    if (targetFwId) {
      const fw = await this.prisma.framework.findUnique({
        where: { id: targetFwId },
      });
      if (!fw) {
        throw new NotFoundException(`Framework with ID "${targetFwId}" not found`);
      }
      resolvedCode = fw.code;

      if (this.frameworkEntitlementsService) {
        await this.frameworkEntitlementsService.assertEntitled(organizationId, targetFwId, frameworkVersionId);
      }

      if (frameworkVersionId) {
        const ver = await this.prisma.frameworkVersion.findFirst({
          where: { id: frameworkVersionId, frameworkId: targetFwId },
        });
        if (!ver) {
          throw new BadRequestException(`Framework Version "${frameworkVersionId}" does not belong to Framework "${targetFwId}"`);
        }
      }

      if (frameworkReferenceIds && frameworkReferenceIds.length > 0) {
        const refs = await this.prisma.frameworkReference.findMany({
          where: {
            id: { in: frameworkReferenceIds },
            ...(frameworkVersionId
              ? { frameworkVersionId }
              : { frameworkVersion: { frameworkId: targetFwId } }),
          },
          select: { id: true },
        });

        if (refs.length !== frameworkReferenceIds.length) {
          throw new BadRequestException('One or more selected framework references do not belong to the selected framework/version');
        }
      }
    }

    return {
      frameworkId: targetFwId || null,
      frameworkVersionId: frameworkVersionId || null,
      frameworkCode: resolvedCode || null,
    };
  }

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

    const fwScope = await this.validateFrameworkScope(
      authCtx.organizationId,
      dto.frameworkId,
      dto.frameworkVersionId,
      dto.frameworkReferenceIds,
      dto.frameworkCode,
    );

    const plan = await this.prisma.$transaction(async (tx: any) => {
      const createdPlan = await tx.auditPlan.create({
        data: {
          organizationId: authCtx.organizationId,
          departmentId: dto.departmentId || null,
          projectId: dto.projectId || null,
          title: dto.title,
          objective: dto.objective,
          scope: dto.scope,
          frameworkCode: fwScope.frameworkCode,
          frameworkId: fwScope.frameworkId,
          frameworkVersionId: fwScope.frameworkVersionId,
          ownerId: dto.ownerId,
          plannedStartDate: dto.plannedStartDate ? new Date(dto.plannedStartDate) : null,
          plannedEndDate: dto.plannedEndDate ? new Date(dto.plannedEndDate) : null,
          status: AuditPlanStatus.DRAFT,
          createdById: authCtx.userId,
        },
      });

      if (dto.frameworkReferenceIds && dto.frameworkReferenceIds.length > 0) {
        await tx.auditPlanFrameworkReference.createMany({
          data: dto.frameworkReferenceIds.map((refId) => ({
            auditPlanId: createdPlan.id,
            frameworkReferenceId: refId,
          })),
          skipDuplicates: true,
        });
      }

      return createdPlan;
    });

    await this.auditLogsService.log({
      organizationId: authCtx.organizationId,
      actorId: authCtx.userId,
      action: 'AUDIT_PLAN_CREATED',
      entityType: 'AuditPlan',
      entityId: plan.id,
      metadata: {
        title: plan.title,
        frameworkCode: plan.frameworkCode,
        frameworkId: plan.frameworkId,
        frameworkVersionId: plan.frameworkVersionId,
        referenceCount: dto.frameworkReferenceIds?.length || 0,
        departmentId: plan.departmentId,
        projectId: plan.projectId,
      },
    });

    const created = await this.prisma.auditPlan.findFirst({
      where: { id: plan.id },
      include: {
        schedules: true,
        assessments: true,
        frameworkRef: true,
        versionRef: true,
        scopeReferences: {
          include: { frameworkReference: true },
        },
      },
    });

    return this.mapPlanToDto(created || plan);
  }

  async findAllPlans(
    authCtx: ResourceAuthContext,
    query: {
      page?: number;
      limit?: number;
      status?: AuditPlanStatus;
      search?: string;
      frameworkId?: string;
      frameworkCode?: string;
      frameworkReferenceId?: string;
    },
  ): Promise<PaginatedAuditPlansDto> {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;
    const skip = (page - 1) * limit;

    const scopeWhere = await this.resourceAuthService.getScopeWhereClause(authCtx);

    const where: any = { ...scopeWhere };
    if (query.status) where.status = query.status;
    if (query.frameworkId) where.frameworkId = query.frameworkId;
    if (query.frameworkCode) where.frameworkCode = query.frameworkCode;
    if (query.frameworkReferenceId) {
      where.scopeReferences = {
        some: { frameworkReferenceId: query.frameworkReferenceId },
      };
    }
    if (query.search && query.search.trim()) {
      const searchTerm = query.search.trim();
      const searchConditions = [
        { title: { contains: searchTerm, mode: 'insensitive' } },
        { objective: { contains: searchTerm, mode: 'insensitive' } },
        { frameworkCode: { contains: searchTerm, mode: 'insensitive' } },
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
        include: {
          schedules: true,
          assessments: true,
          frameworkRef: true,
          versionRef: true,
          scopeReferences: {
            include: { frameworkReference: true },
          },
        },
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
        frameworkRef: true,
        versionRef: true,
        scopeReferences: {
          include: { frameworkReference: true },
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
      include: {
        scopeReferences: true,
      },
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

    const isScopeFieldPresent =
      dto.frameworkId !== undefined ||
      dto.frameworkVersionId !== undefined ||
      dto.frameworkReferenceIds !== undefined ||
      dto.frameworkCode !== undefined;

    let fwScope: { frameworkId?: string | null; frameworkVersionId?: string | null; frameworkCode?: string | null } | undefined;
    let shouldSyncReferences = false;
    let targetReferenceIds: string[] = [];

    if (isScopeFieldPresent) {
      const isFrameworkIdChanged = dto.frameworkId !== undefined && dto.frameworkId !== existing.frameworkId;
      const isFrameworkCodeChanged = dto.frameworkCode !== undefined && dto.frameworkCode !== existing.frameworkCode;
      const isVersionIdChanged = dto.frameworkVersionId !== undefined && dto.frameworkVersionId !== existing.frameworkVersionId;
      const isScopeChanged = isFrameworkIdChanged || isFrameworkCodeChanged || isVersionIdChanged;

      let targetFwId: string | undefined | null;
      if (dto.frameworkId !== undefined) {
        targetFwId = dto.frameworkId;
      } else if (dto.frameworkCode !== undefined && !existing.frameworkId) {
        targetFwId = undefined;
      } else {
        targetFwId = existing.frameworkId || undefined;
      }

      let targetVerId: string | undefined | null;
      if (dto.frameworkVersionId !== undefined) {
        targetVerId = dto.frameworkVersionId;
      } else if (isFrameworkIdChanged || isFrameworkCodeChanged) {
        // Framework changed, previous version cannot belong to new framework
        targetVerId = null;
      } else {
        targetVerId = existing.frameworkVersionId || undefined;
      }

      let targetCode: string | undefined | null;
      if (dto.frameworkCode !== undefined) {
        targetCode = dto.frameworkCode;
      } else if (isFrameworkIdChanged) {
        targetCode = undefined;
      } else {
        targetCode = existing.frameworkCode || undefined;
      }

      if (dto.frameworkReferenceIds !== undefined) {
        // Explicitly provided (either populated array or empty array to clear)
        targetReferenceIds = dto.frameworkReferenceIds;
        shouldSyncReferences = true;
      } else if (isScopeChanged) {
        // Framework or version changed without supplying replacement clause IDs.
        // Transactionally clear old incompatible clauses.
        targetReferenceIds = [];
        shouldSyncReferences = true;
      } else {
        // Scope did not change and frameworkReferenceIds was omitted.
        // Preserve existing clause associations.
        shouldSyncReferences = false;
      }

      fwScope = await this.validateFrameworkScope(
        authCtx.organizationId,
        targetFwId,
        targetVerId,
        shouldSyncReferences ? targetReferenceIds : undefined,
        targetCode,
      );
    }

    const updated = await this.prisma.$transaction(async (tx: any) => {
      const plan = await tx.auditPlan.update({
        where: { id },
        data: {
          ...(dto.title && { title: dto.title }),
          ...(dto.objective !== undefined && { objective: dto.objective }),
          ...(dto.scope !== undefined && { scope: dto.scope }),
          ...(dto.ownerId && { ownerId: dto.ownerId }),
          ...(dto.plannedStartDate !== undefined && { plannedStartDate: dto.plannedStartDate ? new Date(dto.plannedStartDate) : null }),
          ...(dto.plannedEndDate !== undefined && { plannedEndDate: dto.plannedEndDate ? new Date(dto.plannedEndDate) : null }),
          ...(dto.status && { status: dto.status }),
          ...(dto.departmentId !== undefined && { departmentId: dto.departmentId }),
          ...(dto.projectId !== undefined && { projectId: dto.projectId }),
          ...(fwScope && {
            frameworkId: fwScope.frameworkId,
            frameworkVersionId: fwScope.frameworkVersionId,
            frameworkCode: fwScope.frameworkCode,
          }),
        },
      });

      if (shouldSyncReferences) {
        await tx.auditPlanFrameworkReference.deleteMany({
          where: { auditPlanId: id },
        });

        if (targetReferenceIds.length > 0) {
          await tx.auditPlanFrameworkReference.createMany({
            data: targetReferenceIds.map((refId) => ({
              auditPlanId: id,
              frameworkReferenceId: refId,
            })),
            skipDuplicates: true,
          });
        }
      }

      return plan;
    });

    await this.auditLogsService.log({
      organizationId: authCtx.organizationId,
      actorId: authCtx.userId,
      action: 'AUDIT_PLAN_UPDATED',
      entityType: 'AuditPlan',
      entityId: id,
      metadata: {
        status: updated.status,
        frameworkId: updated.frameworkId,
        frameworkVersionId: updated.frameworkVersionId,
        frameworkCode: updated.frameworkCode,
        referencesUpdated: shouldSyncReferences,
        referenceCount: shouldSyncReferences ? targetReferenceIds.length : existing.scopeReferences?.length || 0,
      },
    });

    const reloaded = await this.prisma.auditPlan.findFirst({
      where: { id },
      include: {
        schedules: true,
        assessments: true,
        frameworkRef: true,
        versionRef: true,
        scopeReferences: {
          include: { frameworkReference: true },
        },
      },
    });

    return this.mapPlanToDto(reloaded || updated);
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
      frameworkId: p.frameworkId || null,
      frameworkVersionId: p.frameworkVersionId || null,
      frameworkName: p.frameworkRef?.name || null,
      versionName: p.versionRef?.version || p.versionRef?.name || null,
      ownerId: p.ownerId,
      plannedStartDate: p.plannedStartDate ? p.plannedStartDate.toISOString() : null,
      plannedEndDate: p.plannedEndDate ? p.plannedEndDate.toISOString() : null,
      status: p.status as AuditPlanStatus,
      createdById: p.createdById,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
      schedules: p.schedules ? p.schedules.map((s: any) => this.mapScheduleToDto(s)) : [],
      assessments: p.assessments ? p.assessments.map((a: any) => this.mapAssessmentToDto(a)) : [],
      scopeReferences: p.scopeReferences
        ? p.scopeReferences.map((sr: any) => ({
            id: sr.id,
            frameworkReferenceId: sr.frameworkReferenceId,
            identifier: sr.frameworkReference?.identifier,
            title: sr.frameworkReference?.title,
            type: sr.frameworkReference?.type,
            description: sr.frameworkReference?.description,
          }))
        : [],
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

  // --------------------------------------------------
  // CONTROL TESTING CONTEXTUAL EXTENSIONS (PHASE 3 INC 4.1)
  // --------------------------------------------------

  async getTestsForControl(
    authCtx: ResourceAuthContext,
    controlId: string,
    query?: ControlTestQueryDto,
  ): Promise<PaginatedControlTestsDto> {
    const scopeWhere = await this.resourceAuthService.getScopeWhereClause(authCtx);
    const control = await this.prisma.control.findFirst({
      where: { id: controlId, ...scopeWhere, deletedAt: null },
    });

    if (!control) {
      throw new NotFoundException(`Control "${controlId}" not found or out of scope.`);
    }

    const page = Math.max(1, Number(query?.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query?.limit) || 20));
    const skip = (page - 1) * limit;

    const where: any = {
      controlId,
      organizationId: authCtx.organizationId,
    };

    if (query?.result) {
      where.result = query.result;
    }

    if (query?.assessmentId) {
      where.assessmentId = query.assessmentId;
    }

    if (query?.search && query.search.trim()) {
      const s = query.search.trim();
      where.OR = [
        { title: { contains: s, mode: 'insensitive' } },
        { description: { contains: s, mode: 'insensitive' } },
        { notes: { contains: s, mode: 'insensitive' } },
        { assessment: { summary: { contains: s, mode: 'insensitive' } } },
        { assessment: { auditPlan: { title: { contains: s, mode: 'insensitive' } } } },
      ];
    }

    const [items, total, allCheckItemsForControl] = await Promise.all([
      this.prisma.auditCheckItem.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
        include: {
          assessment: {
            include: {
              auditPlan: {
                select: { id: true, title: true, frameworkCode: true, status: true },
              },
            },
          },
          findings: {
            select: { id: true, title: true, severity: true, status: true },
          },
          evidenceAssociations: {
            include: {
              evidence: {
                select: { id: true, title: true, fileName: true, scanStatus: true, status: true },
              },
            },
          },
        },
      }),
      this.prisma.auditCheckItem.count({ where }),
      this.prisma.auditCheckItem.findMany({
        where: { controlId, organizationId: authCtx.organizationId },
        orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
        select: { result: true, updatedAt: true },
      }),
    ]);

    // Metric Summary Calculation
    const totalTests = allCheckItemsForControl.length;
    const effectiveCount = allCheckItemsForControl.filter((i) => i.result === AuditCheckResult.COMPLIANT).length;
    const partiallyEffectiveCount = allCheckItemsForControl.filter(
      (i) => i.result === AuditCheckResult.PARTIALLY_COMPLIANT,
    ).length;
    const ineffectiveCount = allCheckItemsForControl.filter((i) => i.result === AuditCheckResult.NON_COMPLIANT).length;
    const notEvaluatedCount = allCheckItemsForControl.filter(
      (i) => i.result === AuditCheckResult.NOT_EVALUATED,
    ).length;
    const notApplicableCount = allCheckItemsForControl.filter(
      (i) => i.result === AuditCheckResult.NOT_APPLICABLE,
    ).length;

    const latestEvaluated = allCheckItemsForControl.find((i) => i.result !== AuditCheckResult.NOT_EVALUATED);
    const latestItem = allCheckItemsForControl[0] || null;
    const latestTestResult = (latestEvaluated?.result || latestItem?.result || null) as AuditCheckResult | null;
    const latestTestedAt = latestEvaluated?.updatedAt
      ? latestEvaluated.updatedAt.toISOString()
      : latestItem?.updatedAt
      ? latestItem.updatedAt.toISOString()
      : null;

    let overallEffectiveness: ControlEffectivenessStatus = 'NOT_TESTED';
    if (latestTestResult === AuditCheckResult.COMPLIANT) {
      overallEffectiveness = 'EFFECTIVE';
    } else if (latestTestResult === AuditCheckResult.PARTIALLY_COMPLIANT) {
      overallEffectiveness = 'PARTIALLY_EFFECTIVE';
    } else if (latestTestResult === AuditCheckResult.NON_COMPLIANT) {
      overallEffectiveness = 'INEFFECTIVE';
    } else if (latestTestResult === AuditCheckResult.NOT_APPLICABLE) {
      overallEffectiveness = 'NOT_APPLICABLE';
    }

    // Lookup user display names
    const creatorIds = Array.from(new Set(items.map((i) => i.createdById).filter(Boolean)));
    const userMap = new Map<string, string>();
    if (creatorIds.length > 0) {
      const users = await TenantContext.runWithDisplayNameLookup(() =>
        this.prisma.user.findMany({
          where: { id: { in: creatorIds } },
          select: { id: true, name: true, email: true },
        }),
      );
      for (const u of users) {
        userMap.set(u.id, u.name || u.email);
      }
    }

    const mappedItems: ControlTestExecutionDto[] = items.map((item) =>
      this.mapCheckItemToControlTestExecutionDto(item, controlId, userMap),
    );

    const totalPages = Math.ceil(total / limit) || 1;

    return {
      items: mappedItems,
      total,
      page,
      limit,
      totalPages,
      summary: {
        totalTests,
        effectiveCount,
        partiallyEffectiveCount,
        ineffectiveCount,
        notEvaluatedCount,
        notApplicableCount,
        overallEffectiveness,
        latestTestResult,
        latestTestedAt,
      },
    };
  }

  async createCheckItemForControl(
    authCtx: ResourceAuthContext,
    controlId: string,
    dto: CreateControlTestDto,
  ): Promise<ControlTestExecutionDto> {
    const scopeWhere = await this.resourceAuthService.getScopeWhereClause(authCtx);
    const control = await this.prisma.control.findFirst({
      where: { id: controlId, ...scopeWhere, deletedAt: null },
    });

    if (!control) {
      throw new NotFoundException(`Control "${controlId}" not found or out of scope.`);
    }

    if (!dto?.assessmentId) {
      throw new BadRequestException('assessmentId is required in request body.');
    }

    const assessment = await this.prisma.auditAssessment.findFirst({
      where: { id: dto.assessmentId, organizationId: authCtx.organizationId },
      include: { auditPlan: true },
    });

    if (!assessment) {
      throw new NotFoundException(`Audit assessment "${dto.assessmentId}" not found or out of scope.`);
    }

    await this.resourceAuthService.assertResourceAccess(authCtx, assessment.auditPlan);

    if (assessment.status === AuditAssessmentStatus.COMPLETED) {
      throw new BadRequestException(
        `Audit assessment "${dto.assessmentId}" is marked COMPLETED and cannot accept new test items.`,
      );
    }

    if (
      assessment.auditPlan.status === AuditPlanStatus.COMPLETED ||
      assessment.auditPlan.status === AuditPlanStatus.ARCHIVED
    ) {
      throw new BadRequestException(
        `Audit plan "${assessment.auditPlan.id}" is in status "${assessment.auditPlan.status}" and cannot accept new test items.`,
      );
    }

    const createdItem = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.auditCheckItem.findFirst({
        where: {
          assessmentId: dto.assessmentId,
          controlId,
          organizationId: authCtx.organizationId,
        },
      });

      if (existing) {
        throw new ConflictException(
          `Control "${controlId}" is already registered as a check item in assessment "${dto.assessmentId}". Duplicate check items within the same assessment run are rejected.`,
        );
      }

      const testTitle = dto.title?.trim() || `Evaluate Control: ${control.name}`;
      const testDesc = dto.description !== undefined ? dto.description : control.description;
      const testResult = dto.result || AuditCheckResult.NOT_EVALUATED;
      const testNotes = dto.notes !== undefined ? dto.notes : null;

      const newCheckItem = await tx.auditCheckItem.create({
        data: {
          organizationId: authCtx.organizationId,
          assessmentId: dto.assessmentId,
          controlId,
          title: testTitle,
          description: testDesc,
          result: testResult,
          notes: testNotes,
          createdById: authCtx.userId,
        },
        include: {
          assessment: {
            include: {
              auditPlan: {
                select: { id: true, title: true, frameworkCode: true, status: true },
              },
            },
          },
          findings: {
            select: { id: true, title: true, severity: true, status: true },
          },
          evidenceAssociations: {
            include: {
              evidence: {
                select: { id: true, title: true, fileName: true, scanStatus: true, status: true },
              },
            },
          },
        },
      });

      const allCheckItems = await tx.auditCheckItem.findMany({
        where: { assessmentId: dto.assessmentId },
        select: { result: true },
      });
      const newScore = calculateAuditScore(
        allCheckItems.map((i) => ({ result: i.result as unknown as AuditCheckResult })),
      );
      await tx.auditAssessment.update({
        where: { id: dto.assessmentId },
        data: { score: newScore },
      });

      return newCheckItem;
    });

    await this.auditLogsService.log({
      organizationId: authCtx.organizationId,
      actorId: authCtx.userId,
      action: 'CONTROL_TEST_ADDED',
      entityType: 'AuditCheckItem',
      entityId: createdItem.id,
      metadata: {
        controlId,
        assessmentId: dto.assessmentId,
        result: createdItem.result,
      },
    });

    return this.mapCheckItemToControlTestExecutionDto(createdItem, controlId);
  }

  private mapCheckItemToControlTestExecutionDto(
    item: any,
    fallbackControlId: string,
    userMap?: Map<string, string>,
  ): ControlTestExecutionDto {
    return {
      id: item.id,
      organizationId: item.organizationId,
      controlId: item.controlId || fallbackControlId,
      assessmentId: item.assessmentId,
      assessmentTitle: item.assessment?.summary || undefined,
      assessmentStatus: item.assessment?.status as AuditAssessmentStatus,
      auditPlanId: item.assessment?.auditPlanId || item.assessment?.auditPlan?.id || '',
      auditPlanTitle: item.assessment?.auditPlan?.title || 'Untitled Audit Plan',
      frameworkCode: item.assessment?.auditPlan?.frameworkCode || null,
      title: item.title,
      description: item.description,
      result: item.result as unknown as AuditCheckResult,
      notes: item.notes,
      auditorId: item.assessment?.auditorId || null,
      createdById: item.createdById,
      createdByName: userMap?.get(item.createdById) || item.createdById,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
      findingsCount: item.findings?.length || 0,
      evidenceCount: item.evidenceAssociations?.length || 0,
      findings: (item.findings || []).map((f: any) => ({
        id: f.id,
        title: f.title,
        severity: f.severity,
        status: f.status,
      })),
      evidence: (item.evidenceAssociations || []).map((ea: any) => ({
        id: ea.evidence.id,
        title: ea.evidence.title,
        fileName: ea.evidence.fileName,
        scanStatus: ea.evidence.scanStatus,
        status: ea.evidence.status,
      })),
    };
  }
}
