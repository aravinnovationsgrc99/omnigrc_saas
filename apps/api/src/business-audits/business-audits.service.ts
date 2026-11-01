import { Injectable, NotFoundException, BadRequestException, ForbiddenException, ConflictException, InternalServerErrorException, Optional } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ResourceAuthorizationService, ResourceAuthContext } from '../auth/resource-authorization.service';
import { FrameworkEntitlementsService } from '../frameworks/framework-entitlements.service';
import { TenantContext } from '../tenant/tenant.context';
import {
  ProductAccessStatus,
  Role,
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
  VulnerabilitySeverity,
  CapaApplicability,
  AuditFindingLifecycleAction,
  AuditFindingVerificationHistoryDto,
} from '@omnigrc/shared';
import {
  ReopenAuditFindingDto,
  VerifyAuditFindingDto,
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

export type AuditResponsibility =
  | 'PLAN_OWNER'
  | 'LEAD_AUDITOR'
  | 'ASSESSMENT_AUDITOR'
  | 'FINDING_OWNER'
  | 'CAPA_OWNER'
  | 'VERIFIER';

@Injectable()
export class BusinessAuditsService {
  private static readonly VALID_FINDING_TRANSITIONS: Record<FindingStatus, FindingStatus[]> = {
    [FindingStatus.OPEN]: [FindingStatus.IN_REMEDIATION],
    [FindingStatus.IN_REMEDIATION]: [FindingStatus.READY_FOR_VERIFICATION],
    [FindingStatus.READY_FOR_VERIFICATION]: [FindingStatus.VERIFIED, FindingStatus.CLOSED, FindingStatus.IN_REMEDIATION],
    [FindingStatus.VERIFIED]: [FindingStatus.CLOSED, FindingStatus.IN_REMEDIATION],
    [FindingStatus.CLOSED]: [FindingStatus.IN_REMEDIATION],
  };

  private checkOptimisticLock(entityName: string, actualUpdatedAt: Date, expectedUpdatedAt?: string): void {
    if (!expectedUpdatedAt) return;
    const expectedTime = new Date(expectedUpdatedAt).getTime();
    const actualTime = actualUpdatedAt.getTime();
    if (isNaN(expectedTime) || actualTime !== expectedTime) {
      throw new ConflictException({
        statusCode: 409,
        error: 'Conflict',
        message: `${entityName} has been modified concurrently. Please refresh the latest state before retrying.`,
        code: 'STALE_RECORD_CONFLICT',
        serverUpdatedAt: actualUpdatedAt.toISOString(),
        expectedUpdatedAt,
      });
    }
  }

  private assertRoleEligible(
    userId: string,
    role: Role | string,
    responsibility: AuditResponsibility,
  ): void {
    const ALLOWED: Record<AuditResponsibility, (Role | string)[]> = {
      PLAN_OWNER: [Role.ADMIN, Role.ANALYST, Role.MSSP_ADMIN, Role.MSSP_ANALYST],
      LEAD_AUDITOR: [Role.ADMIN, Role.ANALYST, Role.EXTERNAL_AUDITOR, Role.MSSP_ADMIN, Role.MSSP_ANALYST],
      ASSESSMENT_AUDITOR: [Role.ADMIN, Role.ANALYST, Role.EXTERNAL_AUDITOR, Role.MSSP_ADMIN, Role.MSSP_ANALYST],
      FINDING_OWNER: [Role.ADMIN, Role.ANALYST, Role.MSSP_ADMIN, Role.MSSP_ANALYST],
      CAPA_OWNER: [Role.ADMIN, Role.ANALYST, Role.MSSP_ADMIN, Role.MSSP_ANALYST],
      VERIFIER: [Role.ADMIN, Role.MSSP_ADMIN],
    };

    const allowedRoles = ALLOWED[responsibility] || [];
    if (!allowedRoles.includes(role as Role)) {
      throw new BadRequestException(
        `User "${userId}" with role "${role}" is not eligible for assignment as ${responsibility}. Allowed roles: ${allowedRoles.join(', ')}.`,
      );
    }
  }

  private async assertEligibleUser(
    organizationId: string,
    userIdOrMembershipId: string,
    responsibility: AuditResponsibility,
  ): Promise<string> {
    if (!userIdOrMembershipId || typeof userIdOrMembershipId !== 'string' || !userIdOrMembershipId.trim()) {
      throw new BadRequestException(`A valid user ID is required for responsibility "${responsibility}".`);
    }
    const rawId = userIdOrMembershipId.trim();

    // 1. Check organization membership if available
    let membership: any = null;
    if (this.prisma.organizationMembership) {
      try {
        membership = await this.prisma.organizationMembership.findFirst({
          where: {
            organizationId,
            OR: [{ userId: rawId }, { id: rawId }],
          },
          include: { user: true },
        });
      } catch {
        membership = null;
      }
    }

    if (membership) {
      if (membership.status !== 'ACTIVE' && membership.status !== ProductAccessStatus.ACTIVE) {
        throw new BadRequestException(
          `User "${membership.userId}" is not active in this organization (membership status: ${membership.status}).`,
        );
      }
      const role = membership.role || membership.user?.role || Role.ANALYST;
      this.assertRoleEligible(membership.userId, role, responsibility);
      return membership.userId;
    }

    // 2. Fallback to User table (e.g. implicit home organization member)
    let user: any = null;
    if (this.prisma.user) {
      try {
        user = await this.prisma.user.findFirst({
          where: { id: rawId },
        });
      } catch {
        user = null;
      }
    }

    if (user) {
      if (user.organizationId !== organizationId) {
        throw new BadRequestException(
          `User "${rawId}" belongs to another organization tenant (cross-tenant assignment prohibited).`,
        );
      }
      const role = user.role || Role.ANALYST;
      this.assertRoleEligible(user.id, role, responsibility);
      return user.id;
    }

    // 3. Neither membership nor user record found
    throw new BadRequestException(`User "${rawId}" was not found in this organization tenant.`);
  }
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogsService: AuditLogsService,
    private readonly notificationsService: NotificationsService,
    private readonly resourceAuthService: ResourceAuthorizationService,
    @Optional()
    private readonly frameworkEntitlementsService?: FrameworkEntitlementsService,
  ) {}

  private async resolveUserMap(
    organizationId: string,
    candidateIds: (string | null | undefined)[],
  ): Promise<Map<string, { name: string; email: string; role?: string }>> {
    const userMap = new Map<string, { name: string; email: string; role?: string }>();
    const validIds = Array.from(
      new Set(
        candidateIds.filter((id): id is string => Boolean(id) && typeof id === 'string' && id.trim().length > 0),
      ),
    );
    if (validIds.length === 0) return userMap;

    const users = await TenantContext.runWithDisplayNameLookup(() =>
      this.prisma.user.findMany({
        where: { id: { in: validIds }, organizationId },
        select: { id: true, name: true, email: true, role: true },
      }),
    );

    for (const u of users) {
      userMap.set(u.id, { name: u.name, email: u.email, role: u.role });
    }
    return userMap;
  }

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

    const resolvedOwnerId = await this.assertEligibleUser(
      authCtx.organizationId,
      dto.ownerId,
      'PLAN_OWNER',
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
          ownerId: resolvedOwnerId,
          plannedStartDate: dto.plannedStartDate ? new Date(dto.plannedStartDate) : null,
          plannedEndDate: dto.plannedEndDate ? new Date(dto.plannedEndDate) : null,
          status: AuditPlanStatus.DRAFT,
          version: 1,
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
        departmentRef: true,
        scopeReferences: {
          include: { frameworkReference: true },
        },
      },
    });

    if (this.notificationsService?.notify && plan.ownerId) {
      await this.notificationsService.notify({
        organizationId: authCtx.organizationId,
        userId: plan.ownerId,
        type: NotificationType.TASK_ASSIGNED,
        message: `Audit plan "${plan.title}" has been submitted/created.`,
        entityType: 'AuditPlan',
        entityId: plan.id,
      });
    }

    const userMap = await this.resolveUserMap(authCtx.organizationId, [(created || plan).ownerId]);
    return this.mapPlanToDto(created || plan, userMap);
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
          departmentRef: true,
          scopeReferences: {
            include: { frameworkReference: true },
          },
        },
      }),
      this.prisma.auditPlan.count({ where }),
    ]);

    const candidateUserIds = items.map((p) => p.ownerId).filter(Boolean);
    const userMap = await this.resolveUserMap(authCtx.organizationId, candidateUserIds);

    return {
      items: items.map((p) => this.mapPlanToDto(p, userMap)),
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
            checkItems: {
              include: {
                evidence: true,
                evidenceAssociations: {
                  include: { evidence: true },
                },
              },
            },
            findings: {
              include: {
                capas: true,
                evidence: true,
                evidenceAssociations: {
                  include: { evidence: true },
                },
              },
            },
          },
        },
        frameworkRef: true,
        versionRef: true,
        departmentRef: true,
        scopeReferences: {
          include: { frameworkReference: true },
        },
      },
    });

    if (!plan) throw new NotFoundException(`Audit Plan with ID "${id}" not found`);

    const candidateUserIds: string[] = [plan.ownerId, plan.createdById];
    for (const a of plan.assessments || []) {
      if (a.auditorId) candidateUserIds.push(a.auditorId);
      if (a.createdById) candidateUserIds.push(a.createdById);
      for (const f of a.findings || []) {
        if (f.ownerId) candidateUserIds.push(f.ownerId);
        if (f.verifiedById) candidateUserIds.push(f.verifiedById);
        for (const c of f.capas || []) {
          if (c.ownerId) candidateUserIds.push(c.ownerId);
          if (c.verifiedById) candidateUserIds.push(c.verifiedById);
        }
      }
    }

    const userMap = await this.resolveUserMap(authCtx.organizationId, candidateUserIds);
    return this.mapPlanToDto(plan, userMap);
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

    if (dto.expectedUpdatedAt) {
      this.checkOptimisticLock('AuditPlan', existing.updatedAt, dto.expectedUpdatedAt);
    }

    if (dto.expectedVersion !== undefined) {
      if (existing.version !== undefined && existing.version !== dto.expectedVersion) {
        throw new ConflictException({
          statusCode: 409,
          error: 'Conflict',
          message: 'AuditPlan has been modified concurrently. Please refresh the latest state before retrying.',
          code: 'STALE_RECORD_CONFLICT',
        });
      }
    }

    let resolvedOwnerId: string | undefined;
    if (dto.ownerId) {
      resolvedOwnerId = await this.assertEligibleUser(
        authCtx.organizationId,
        dto.ownerId,
        'PLAN_OWNER',
      );
    }

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

    if (dto.status === AuditPlanStatus.COMPLETED) {
      if (existing.status !== AuditPlanStatus.IN_PROGRESS) {
        throw new BadRequestException('Cannot complete an audit plan that has not been started. Audit status must be IN_PROGRESS.');
      }

      if (existing.frameworkCode === 'UNSPECIFIED') {
        throw new BadRequestException('Cannot complete audit plan with an UNSPECIFIED framework baseline.');
      }

      const fullPlan = await this.prisma.auditPlan.findFirst({
        where: { id, ...scopeWhere },
        include: {
          assessments: {
            include: {
              checkItems: true,
              findings: true,
            },
          },
        },
      });

      if (!fullPlan || fullPlan.assessments.length === 0) {
        throw new BadRequestException('Cannot complete audit plan without at least one executed assessment run.');
      }

      const allCheckItems = fullPlan.assessments.flatMap((a: any) => a.checkItems || []);
      if (allCheckItems.length === 0) {
        throw new BadRequestException('Cannot complete audit plan without any evaluation checklist items.');
      }

      const unevaluated = allCheckItems.filter((ci: any) => ci.result === AuditCheckResult.NOT_EVALUATED);
      if (unevaluated.length > 0) {
        throw new BadRequestException(
          `Cannot complete audit: ${unevaluated.length} checklist item(s) remain unevaluated. All items must be evaluated.`,
        );
      }

      const allFindings = fullPlan.assessments.flatMap((a: any) => a.findings || []);
      const unresolved = allFindings.filter(
        (f: any) => f.status === FindingStatus.OPEN || f.status === FindingStatus.IN_REMEDIATION,
      );
      if (unresolved.length > 0) {
        throw new BadRequestException(
          `Cannot complete audit: ${unresolved.length} finding(s) remain open or in remediation. Findings must be ready for verification, verified, or closed.`,
        );
      }
    }

    const targetVersion = dto.expectedVersion !== undefined ? dto.expectedVersion : existing.version;

    const updated = await this.prisma.$transaction(async (tx: any) => {
      if (typeof tx.auditPlan?.updateMany === 'function') {
        const updateResult = await tx.auditPlan.updateMany({
          where: {
            id,
            organizationId: authCtx.organizationId,
            version: targetVersion,
          },
          data: {
            version: { increment: 1 },
          },
        });

        if (updateResult && updateResult.count === 0) {
          const currentPlan = await tx.auditPlan.findFirst({
            where: { id, organizationId: authCtx.organizationId },
            select: { id: true, version: true },
          });
          if (!currentPlan) {
            throw new NotFoundException(`Audit Plan with ID "${id}" not found`);
          }
          throw new ConflictException({
            statusCode: 409,
            error: 'Conflict',
            message: 'AuditPlan has been modified concurrently. Please refresh the latest state before retrying.',
            code: 'STALE_RECORD_CONFLICT',
          });
        }
      }

      const plan = await tx.auditPlan.update({
        where: { id },
        data: {
          ...(dto.title && { title: dto.title }),
          ...(dto.objective !== undefined && { objective: dto.objective }),
          ...(dto.scope !== undefined && { scope: dto.scope }),
          ...(resolvedOwnerId && { ownerId: resolvedOwnerId }),
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
          version: { increment: 1 },
        },
      });

      if (dto.status === AuditPlanStatus.COMPLETED) {
        await tx.auditAssessment.updateMany({
          where: { auditPlanId: id, status: AuditAssessmentStatus.IN_PROGRESS },
          data: { status: AuditAssessmentStatus.COMPLETED, completedAt: new Date() },
        });
      }

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
      action: dto.status === AuditPlanStatus.COMPLETED ? 'AUDIT_PLAN_COMPLETED' : 'AUDIT_PLAN_UPDATED',
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
        departmentRef: true,
        scopeReferences: {
          include: { frameworkReference: true },
        },
      },
    });

    if (this.notificationsService?.notify && dto.status === AuditPlanStatus.PLANNED && existing.status !== AuditPlanStatus.PLANNED) {
      if (updated.ownerId) {
        await this.notificationsService.notify({
          organizationId: authCtx.organizationId,
          userId: updated.ownerId,
          type: NotificationType.TASK_ASSIGNED,
          message: `Audit plan "${updated.title}" has been approved/planned.`,
          entityType: 'AuditPlan',
          entityId: id,
        });
      }
    }

    if (this.notificationsService?.notify && dto.status === AuditPlanStatus.COMPLETED && existing.status !== AuditPlanStatus.COMPLETED) {
      if (updated.ownerId) {
        await this.notificationsService.notify({
          organizationId: authCtx.organizationId,
          userId: updated.ownerId,
          type: NotificationType.TASK_ASSIGNED,
          message: `Audit plan "${updated.title}" has been completed/closed.`,
          entityType: 'AuditPlan',
          entityId: id,
        });
      }
    }

    const userMap = await this.resolveUserMap(authCtx.organizationId, [(reloaded || updated).ownerId]);
    return this.mapPlanToDto(reloaded || updated, userMap);
  }

  async getPlanHistory(authCtx: ResourceAuthContext, planId: string): Promise<any[]> {
    const plan = await this.findOnePlan(authCtx, planId);
    if (!plan) throw new NotFoundException(`Audit Plan with ID "${planId}" not found`);

    const assessmentIds = (plan.assessments || []).map((a) => a.id);
    const findingIds = (plan.assessments || []).flatMap((a) => (a.findings || []).map((f) => f.id));
    const capaIds = (plan.assessments || []).flatMap((a) =>
      (a.findings || []).flatMap((f) => (f.capas || []).map((c) => c.id)),
    );

    const relatedEntityIds = [planId, ...assessmentIds, ...findingIds, ...capaIds];

    const logs = await this.prisma.auditLogEntry.findMany({
      where: {
        organizationId: authCtx.organizationId,
        entityId: { in: relatedEntityIds },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    const actorIds = Array.from(new Set(logs.map((l: any) => l.actorId).filter(Boolean)));
    const userMap = await this.resolveUserMap(authCtx.organizationId, actorIds);

    return logs.map((log: any) => ({
      id: log.id,
      action: log.action,
      entityType: log.entityType,
      entityId: log.entityId,
      actorId: log.actorId,
      actorName: userMap.get(log.actorId)?.name || userMap.get(log.actorId)?.email || 'System User',
      metadata: log.metadata,
      createdAt: log.createdAt.toISOString(),
    }));
  }

  // --------------------------------------------------
  // AUDIT SCHEDULES
  // --------------------------------------------------

  async createSchedule(authCtx: ResourceAuthContext, dto: CreateAuditScheduleDto): Promise<AuditScheduleDto> {
    const plan = await this.findOnePlan(authCtx, dto.auditPlanId);

    const resolvedLeadAuditorId = await this.assertEligibleUser(
      authCtx.organizationId,
      dto.leadAuditorId,
      'LEAD_AUDITOR',
    );

    const schedule = await this.prisma.auditSchedule.create({
      data: {
        organizationId: authCtx.organizationId,
        auditPlanId: dto.auditPlanId,
        scheduledStartDate: new Date(dto.scheduledStartDate),
        scheduledEndDate: new Date(dto.scheduledEndDate),
        leadAuditorId: resolvedLeadAuditorId,
        recurrence: dto.recurrence || null,
        status: AuditScheduleStatus.SCHEDULED,
      },
    });

    if (this.notificationsService?.notify) {
      await this.notificationsService.notify({
        organizationId: authCtx.organizationId,
        userId: dto.leadAuditorId,
        type: NotificationType.TASK_ASSIGNED,
        message: `You have been assigned as Lead Auditor for an upcoming Audit Schedule.`,
        entityType: 'AuditSchedule',
        entityId: schedule.id,
      });
    }

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

    const resolvedAuditorId = await this.assertEligibleUser(
      authCtx.organizationId,
      dto.auditorId,
      'ASSESSMENT_AUDITOR',
    );

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
          auditorId: resolvedAuditorId,
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

    if (this.notificationsService?.notify && dto.auditorId) {
      await this.notificationsService.notify({
        organizationId: authCtx.organizationId,
        userId: dto.auditorId,
        type: NotificationType.TASK_ASSIGNED,
        message: `You have been assigned as Auditor for an upcoming Audit Assessment.`,
        entityType: 'AuditAssessment',
        entityId: assessment!.id,
      });
    }

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

    const resolvedOwnerId = await this.assertEligibleUser(
      authCtx.organizationId,
      dto.ownerId,
      'FINDING_OWNER',
    );

    let capaApplicability = dto.capaApplicability || CapaApplicability.UNASSESSED;
    let capaRationale: string | null = null;

    if (dto.capaApplicability === CapaApplicability.NOT_REQUIRED || dto.capaRequired === false) {
      if (!dto.capaRationale || !dto.capaRationale.trim()) {
        throw new BadRequestException(
          'A documented rationale is required when CAPA is marked as not required (capaRequired: false).',
        );
      }
      capaApplicability = CapaApplicability.NOT_REQUIRED;
      capaRationale = dto.capaRationale.trim();
    } else if (dto.capaApplicability === CapaApplicability.REQUIRED || dto.capaRequired === true) {
      capaApplicability = CapaApplicability.REQUIRED;
      capaRationale = dto.capaRationale?.trim() || null;
    }

    const remediationPlan = dto.remediationPlan ? dto.remediationPlan.trim() : null;

    const finding = await this.prisma.auditFinding.create({
      data: {
        organizationId: authCtx.organizationId,
        assessmentId: dto.assessmentId,
        checkItemId: dto.checkItemId || null,
        title: dto.title,
        description: dto.description,
        severity: dto.severity,
        status: FindingStatus.OPEN,
        ownerId: resolvedOwnerId,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
        riskId: dto.riskId || null,
        remediationPlan,
        capaApplicability,
        capaRationale,
        version: 1,
        createdById: authCtx.userId,
      },
      include: {
        capas: true,
        evidence: true,
        evidenceAssociations: { include: { evidence: true } },
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

    const userMap = await this.resolveUserMap(authCtx.organizationId, [finding.ownerId]);
    return this.mapFindingToDto(finding, userMap);
  }

  async updateFindingStatus(
    authCtx: ResourceAuthContext,
    id: string,
    dto: UpdateAuditFindingDto,
  ): Promise<AuditFindingDto> {
    const finding = await this.prisma.auditFinding.findFirst({
      where: { id, organizationId: authCtx.organizationId },
      include: {
        assessment: { include: { auditPlan: true } },
        capas: true,
        evidence: true,
        evidenceAssociations: { include: { evidence: true } },
      },
    });

    if (!finding) throw new NotFoundException(`Audit Finding "${id}" not found`);

    await this.resourceAuthService.assertResourceAccess(authCtx, finding.assessment.auditPlan);

    if (dto.expectedUpdatedAt) {
      this.checkOptimisticLock('AuditFinding', finding.updatedAt, dto.expectedUpdatedAt);
    }

    if (dto.expectedVersion !== undefined) {
      if (finding.version !== undefined && finding.version !== dto.expectedVersion) {
        throw new ConflictException({
          statusCode: 409,
          error: 'Conflict',
          message: 'AuditFinding has been modified concurrently. Please refresh the latest state before retrying.',
          code: 'STALE_RECORD_CONFLICT',
        });
      }
    }

    if (finding.status === FindingStatus.VERIFIED || finding.status === FindingStatus.CLOSED) {
      throw new BadRequestException(
        `Findings in ${finding.status} status can only be modified through controlled reopening.`,
      );
    }

    if (dto.status === FindingStatus.VERIFIED || dto.status === FindingStatus.CLOSED) {
      throw new BadRequestException('Formal verification and closure must be performed via the dedicated verify endpoint.');
    }

    let resolvedOwnerId: string | undefined;
    if (dto.ownerId) {
      resolvedOwnerId = await this.assertEligibleUser(
        authCtx.organizationId,
        dto.ownerId,
        'FINDING_OWNER',
      );
    }

    let targetCapaApplicability: CapaApplicability | undefined = dto.capaApplicability;
    let targetCapaRationale: string | null | undefined = dto.capaRationale !== undefined ? (dto.capaRationale?.trim() || null) : undefined;

    if (dto.capaRequired === false || targetCapaApplicability === CapaApplicability.NOT_REQUIRED) {
      targetCapaApplicability = CapaApplicability.NOT_REQUIRED;
      const effectiveRationale = targetCapaRationale ?? finding.capaRationale;
      const legacyTagMatch = finding.remediationPlan?.match(/\[NO_CAPA_REQUIRED:\s*([^\]]+)\]/);
      const effectiveLegacyRationale = legacyTagMatch ? legacyTagMatch[1].trim() : null;
      const finalRationale = effectiveRationale || effectiveLegacyRationale;
      if (!finalRationale) {
        throw new BadRequestException(
          'A documented rationale is required when CAPA is marked as not required (capaRequired: false).',
        );
      }
      targetCapaRationale = finalRationale;
    } else if (dto.capaRequired === true || targetCapaApplicability === CapaApplicability.REQUIRED) {
      targetCapaApplicability = CapaApplicability.REQUIRED;
    }

    if (dto.status && dto.status !== finding.status) {
      const allowedNext = BusinessAuditsService.VALID_FINDING_TRANSITIONS[finding.status as FindingStatus] || [];
      if (!allowedNext.includes(dto.status)) {
        throw new BadRequestException(
          `Invalid finding status transition from "${finding.status}" to "${dto.status}". Findings must follow the lifecycle: OPEN -> IN_REMEDIATION -> READY_FOR_VERIFICATION -> VERIFIED -> CLOSED.`,
        );
      }

      if (dto.status === FindingStatus.READY_FOR_VERIFICATION) {
        const capas = await this.prisma.auditCapa.findMany({
          where: { findingId: id },
        });
        if (capas.length > 0) {
          const incomplete = capas.filter((c: any) => c.status !== CapaStatus.COMPLETED);
          if (incomplete.length > 0) {
            throw new BadRequestException(
              `Cannot advance finding to READY_FOR_VERIFICATION: ${incomplete.length} CAPA item(s) are still incomplete. All CAPAs must be COMPLETED before verification.`,
            );
          }
        } else {
          const effectiveApplicability = targetCapaApplicability !== undefined ? targetCapaApplicability : finding.capaApplicability;
          const effectivePlan = dto.remediationPlan !== undefined ? dto.remediationPlan : finding.remediationPlan;
          const isCapaExplicitlyNotRequired =
            effectiveApplicability === CapaApplicability.NOT_REQUIRED ||
            dto.capaRequired === false ||
            Boolean(finding.capaRationale) ||
            Boolean(effectivePlan && effectivePlan.includes('[NO_CAPA_REQUIRED:'));
          if (!isCapaExplicitlyNotRequired) {
            throw new BadRequestException(
              'Cannot advance finding to READY_FOR_VERIFICATION without either completing associated CAPA actions or providing a documented non-applicability rationale.',
            );
          }
        }
      }
    }


    const updatedRemediationPlan = dto.remediationPlan !== undefined ? dto.remediationPlan : finding.remediationPlan;
    const targetVersion = dto.expectedVersion !== undefined ? dto.expectedVersion : finding.version;
    const isStatusChanged = Boolean(dto.status && dto.status !== finding.status);

    const updated = await this.prisma.$transaction(async (tx: any) => {
      if (typeof tx.auditFinding?.updateMany === 'function') {
        const updateResult = await tx.auditFinding.updateMany({
          where: {
            id,
            organizationId: authCtx.organizationId,
            version: targetVersion,
          },
          data: {
            version: { increment: 1 },
          },
        });

        if (updateResult && updateResult.count === 0) {
          const currentFinding = await tx.auditFinding.findFirst({
            where: { id, organizationId: authCtx.organizationId },
            select: { id: true, version: true },
          });
          if (!currentFinding) {
            throw new NotFoundException(`Audit Finding "${id}" not found`);
          }
          throw new ConflictException({
            statusCode: 409,
            error: 'Conflict',
            message: 'AuditFinding has been modified concurrently. Please refresh the latest state before retrying.',
            code: 'STALE_RECORD_CONFLICT',
          });
        }
      }

      const findingRecord = await tx.auditFinding.update({
        where: { id },
        data: {
          ...(dto.title && { title: dto.title }),
          ...(dto.description !== undefined && { description: dto.description }),
          ...(dto.severity && { severity: dto.severity }),
          ...(dto.status && { status: dto.status }),
          ...(resolvedOwnerId && { ownerId: resolvedOwnerId }),
          ...(dto.dueDate !== undefined && { dueDate: dto.dueDate ? new Date(dto.dueDate) : null }),
          ...(updatedRemediationPlan !== undefined && { remediationPlan: updatedRemediationPlan }),
          ...(targetCapaApplicability !== undefined && { capaApplicability: targetCapaApplicability }),
          ...(targetCapaRationale !== undefined && { capaRationale: targetCapaRationale }),
          ...(dto.verificationNotes !== undefined && { verificationNotes: dto.verificationNotes }),
          version: { increment: 1 },
        },
        include: {
          capas: true,
          evidence: true,
          evidenceAssociations: { include: { evidence: true } },
          verificationHistories: { orderBy: { createdAt: 'desc' } },
        },
      });

      if (isStatusChanged) {
        if (tx.auditFindingVerificationHistory?.create) {
          await tx.auditFindingVerificationHistory.create({
            data: {
              organizationId: authCtx.organizationId,
              findingId: id,
              action: AuditFindingLifecycleAction.STATUS_TRANSITIONED,
              priorStatus: finding.status as FindingStatus,
              newStatus: dto.status as FindingStatus,
              actorId: authCtx.userId,
              notes: dto.verificationNotes || null,
            },
          });
        }
      }

      return findingRecord;
    });

    await this.auditLogsService.log({
      organizationId: authCtx.organizationId,
      actorId: authCtx.userId,
      action: 'AUDIT_FINDING_UPDATED',
      entityType: 'AuditFinding',
      entityId: id,
      metadata: { status: updated.status },
    });

    const userMap = await this.resolveUserMap(authCtx.organizationId, [updated.ownerId, updated.verifiedById]);
    return this.mapFindingToDto(updated, userMap);
  }

  async verifyFinding(
    authCtx: ResourceAuthContext,
    id: string,
    statusOrDto: FindingStatus.VERIFIED | FindingStatus.CLOSED | FindingStatus.IN_REMEDIATION | VerifyAuditFindingDto,
    legacyNotes?: string,
  ): Promise<AuditFindingDto> {
    let targetStatus: FindingStatus;
    let verificationNotes: string | undefined;
    let expectedUpdatedAt: string | undefined;
    let expectedVersion: number | undefined;

    if (typeof statusOrDto === 'object' && statusOrDto !== null) {
      targetStatus = (statusOrDto.status as FindingStatus) || FindingStatus.VERIFIED;
      verificationNotes = statusOrDto.verificationNotes;
      expectedUpdatedAt = statusOrDto.expectedUpdatedAt;
      expectedVersion = statusOrDto.expectedVersion;
    } else {
      targetStatus = statusOrDto || FindingStatus.VERIFIED;
      verificationNotes = legacyNotes;
    }

    // 1. Assert verifier role eligibility
    await this.assertEligibleUser(authCtx.organizationId, authCtx.userId, 'VERIFIER');

    // 2. Fetch finding with plan and capas
    const finding = await this.prisma.auditFinding.findFirst({
      where: { id, organizationId: authCtx.organizationId },
      include: {
        assessment: { include: { auditPlan: true } },
        capas: true,
        evidence: true,
        evidenceAssociations: { include: { evidence: true } },
      },
    });

    if (!finding) throw new NotFoundException(`Audit Finding "${id}" not found`);

    await this.resourceAuthService.assertResourceAccess(authCtx, finding.assessment.auditPlan);

    // 3. Optimistic concurrency check
    if (expectedUpdatedAt) {
      this.checkOptimisticLock('AuditFinding', finding.updatedAt, expectedUpdatedAt);
    }

    if (expectedVersion !== undefined) {
      if (finding.version !== undefined && finding.version !== expectedVersion) {
        throw new ConflictException({
          statusCode: 409,
          error: 'Conflict',
          message: 'AuditFinding has been modified concurrently. Please refresh the latest state before retrying.',
          code: 'STALE_RECORD_CONFLICT',
        });
      }
    }

    // 4. Segregation of Duties (SoD)
    if (finding.ownerId === authCtx.userId) {
      throw new ForbiddenException({
        statusCode: 403,
        error: 'Forbidden',
        message: 'Segregation of duties violation: Finding owner cannot verify or close their own finding.',
        code: 'SEGREGATION_OF_DUTIES_VIOLATION',
      });
    }

    const isCapaOwner = (finding.capas || []).some((c: any) => c.ownerId === authCtx.userId);
    if (isCapaOwner) {
      throw new ForbiddenException({
        statusCode: 403,
        error: 'Forbidden',
        message: 'Segregation of duties violation: A CAPA owner cannot verify or close this finding.',
        code: 'SEGREGATION_OF_DUTIES_VIOLATION',
      });
    }

    // 5. Verification status handling
    if (targetStatus === FindingStatus.VERIFIED || targetStatus === FindingStatus.CLOSED) {
      if (
        finding.status !== FindingStatus.READY_FOR_VERIFICATION &&
        finding.status !== FindingStatus.IN_REMEDIATION &&
        !(finding.status === FindingStatus.VERIFIED && targetStatus === FindingStatus.CLOSED)
      ) {
        throw new BadRequestException(
          `Finding must be READY_FOR_VERIFICATION or IN_REMEDIATION before verification/closure (current status: ${finding.status}).`,
        );
      }

      // Check CAPA completion prerequisites
      if (finding.capas && finding.capas.length > 0) {
        const incomplete = finding.capas.filter((c: any) => c.status !== CapaStatus.COMPLETED);
        if (incomplete.length > 0) {
          throw new BadRequestException(
            `Cannot verify finding: ${incomplete.length} CAPA item(s) are not completed.`,
          );
        }
      } else {
        const hasRationale = Boolean(
          finding.capaApplicability === CapaApplicability.NOT_REQUIRED ||
          finding.capaRationale ||
          (finding.remediationPlan &&
            (finding.remediationPlan.includes('[NO_CAPA_REQUIRED:') || finding.remediationPlan.trim().length > 0)),
        );
        if (!hasRationale) {
          throw new BadRequestException(
            'Cannot verify finding without either completed CAPAs or a documented non-applicability rationale.',
          );
        }
      }

      const targetVersion = expectedVersion !== undefined ? expectedVersion : finding.version;

      const updated = await this.prisma.$transaction(async (tx: any) => {
        if (typeof tx.auditFinding?.updateMany === 'function') {
          const updateResult = await tx.auditFinding.updateMany({
            where: {
              id,
              organizationId: authCtx.organizationId,
              version: targetVersion,
            },
            data: {
              version: { increment: 1 },
            },
          });

          if (updateResult && updateResult.count === 0) {
            const currentFinding = await tx.auditFinding.findFirst({
              where: { id, organizationId: authCtx.organizationId },
              select: { id: true, version: true },
            });
            if (!currentFinding) {
              throw new NotFoundException(`Audit Finding "${id}" not found`);
            }
            throw new ConflictException({
              statusCode: 409,
              error: 'Conflict',
              message: 'AuditFinding has been modified concurrently. Please refresh the latest state before retrying.',
              code: 'STALE_RECORD_CONFLICT',
            });
          }
        }

        const findingRecord = await tx.auditFinding.update({
          where: { id },
          data: {
            status: targetStatus,
            verifiedById: authCtx.userId,
            verifiedAt: new Date(),
            verificationNotes: verificationNotes !== undefined ? verificationNotes : finding.verificationNotes,
            version: { increment: 1 },
          },
          include: {
            capas: true,
            evidence: true,
            evidenceAssociations: { include: { evidence: true } },
            verificationHistories: { orderBy: { createdAt: 'desc' } },
          },
        });

        if (tx.auditFindingVerificationHistory?.create) {
          await tx.auditFindingVerificationHistory.create({
            data: {
              organizationId: authCtx.organizationId,
              findingId: id,
              action: AuditFindingLifecycleAction.VERIFICATION_PASSED,
              priorStatus: finding.status as FindingStatus,
              newStatus: targetStatus,
              actorId: authCtx.userId,
              notes: verificationNotes || null,
            },
          });
        }

        return findingRecord;
      });

      await this.auditLogsService.log({
        organizationId: authCtx.organizationId,
        actorId: authCtx.userId,
        action: targetStatus === FindingStatus.VERIFIED ? 'AUDIT_FINDING_VERIFIED' : 'AUDIT_FINDING_CLOSED',
        entityType: 'AuditFinding',
        entityId: id,
        metadata: { status: targetStatus, verifierId: authCtx.userId },
      });

      const userMap = await this.resolveUserMap(authCtx.organizationId, [updated.ownerId, updated.verifiedById]);
      return this.mapFindingToDto(updated, userMap);
    } else if (targetStatus === FindingStatus.IN_REMEDIATION) {
      // Verification Rejection / Failure
      if (!verificationNotes || !verificationNotes.trim()) {
        throw new BadRequestException(
          'Verification notes explaining the deficiency/failure are required when rejecting verification.',
        );
      }

      const failureTimestamp = new Date().toISOString();
      const rejectionNote = `[VERIFICATION REJECTED ${failureTimestamp} by ${authCtx.userId}]: ${verificationNotes.trim()}`;
      const updatedNotes = finding.verificationNotes
        ? `${finding.verificationNotes}\n${rejectionNote}`
        : rejectionNote;

      const targetVersion = expectedVersion !== undefined ? expectedVersion : finding.version;

      const updated = await this.prisma.$transaction(async (tx: any) => {
        if (typeof tx.auditFinding?.updateMany === 'function') {
          const updateResult = await tx.auditFinding.updateMany({
            where: {
              id,
              organizationId: authCtx.organizationId,
              version: targetVersion,
            },
            data: {
              version: { increment: 1 },
            },
          });

          if (updateResult && updateResult.count === 0) {
            const currentFinding = await tx.auditFinding.findFirst({
              where: { id, organizationId: authCtx.organizationId },
              select: { id: true, version: true },
            });
            if (!currentFinding) {
              throw new NotFoundException(`Audit Finding "${id}" not found`);
            }
            throw new ConflictException({
              statusCode: 409,
              error: 'Conflict',
              message: 'AuditFinding has been modified concurrently. Please refresh the latest state before retrying.',
              code: 'STALE_RECORD_CONFLICT',
            });
          }
        }

        const findingRecord = await tx.auditFinding.update({
          where: { id },
          data: {
            status: FindingStatus.IN_REMEDIATION,
            verificationNotes: updatedNotes,
            version: { increment: 1 },
          },
          include: {
            capas: true,
            evidence: true,
            evidenceAssociations: { include: { evidence: true } },
            verificationHistories: { orderBy: { createdAt: 'desc' } },
          },
        });

        if (tx.auditFindingVerificationHistory?.create) {
          await tx.auditFindingVerificationHistory.create({
            data: {
              organizationId: authCtx.organizationId,
              findingId: id,
              action: AuditFindingLifecycleAction.VERIFICATION_REJECTED,
              priorStatus: finding.status as FindingStatus,
              newStatus: FindingStatus.IN_REMEDIATION,
              actorId: authCtx.userId,
              notes: verificationNotes.trim(),
              reason: 'Verification rejected by auditor',
            },
          });
        }

        return findingRecord;
      });

      await this.auditLogsService.log({
        organizationId: authCtx.organizationId,
        actorId: authCtx.userId,
        action: 'AUDIT_FINDING_VERIFICATION_FAILED',
        entityType: 'AuditFinding',
        entityId: id,
        metadata: {
          priorStatus: finding.status,
          newStatus: FindingStatus.IN_REMEDIATION,
          notes: verificationNotes.trim(),
          verifierId: authCtx.userId,
        },
      });

      if (this.notificationsService?.notify && updated.ownerId) {
        await this.notificationsService.notify({
          organizationId: authCtx.organizationId,
          userId: updated.ownerId,
          type: NotificationType.TASK_ASSIGNED,
          message: `Verification for finding "${updated.title}" was rejected: ${verificationNotes.trim()}`,
          entityType: 'AuditFinding',
          entityId: id,
        }).catch(() => {});
      }

      const userMap = await this.resolveUserMap(authCtx.organizationId, [updated.ownerId, updated.verifiedById]);
      return this.mapFindingToDto(updated, userMap);
    } else {
      throw new BadRequestException(`Invalid verification status "${targetStatus}".`);
    }
  }

  async reopenFinding(
    authCtx: ResourceAuthContext,
    id: string,
    dto: ReopenAuditFindingDto,
  ): Promise<AuditFindingDto> {
    const finding = await this.prisma.auditFinding.findFirst({
      where: { id, organizationId: authCtx.organizationId },
      include: {
        assessment: {
          include: {
            auditPlan: {
              include: { schedules: true },
            },
          },
        },
        capas: true,
        evidence: true,
        evidenceAssociations: { include: { evidence: true } },
      },
    });

    if (!finding) throw new NotFoundException(`Audit Finding "${id}" not found`);

    await this.resourceAuthService.assertResourceAccess(authCtx, finding.assessment.auditPlan);

    if (dto.expectedUpdatedAt) {
      this.checkOptimisticLock('AuditFinding', finding.updatedAt, dto.expectedUpdatedAt);
    }

    if (dto.expectedVersion !== undefined) {
      if (finding.version !== undefined && finding.version !== dto.expectedVersion) {
        throw new ConflictException({
          statusCode: 409,
          error: 'Conflict',
          message: 'AuditFinding has been modified concurrently. Please refresh the latest state before retrying.',
          code: 'STALE_RECORD_CONFLICT',
        });
      }
    }

    if (finding.status !== FindingStatus.VERIFIED && finding.status !== FindingStatus.CLOSED) {
      throw new BadRequestException(
        `Only VERIFIED or CLOSED findings can be reopened. Finding "${id}" is currently in status "${finding.status}".`,
      );
    }

    if (!dto.reason || typeof dto.reason !== 'string' || !dto.reason.trim()) {
      throw new BadRequestException('A documented justification/reason is required to reopen a finding.');
    }

    const isAdmin = authCtx.role === Role.ADMIN || authCtx.role === Role.MSSP_ADMIN;
    const isOwner = finding.ownerId === authCtx.userId;
    const isPlanOwner = finding.assessment?.auditPlan?.ownerId === authCtx.userId;
    const isLeadAuditor = finding.assessment?.auditPlan?.schedules?.some((s: any) => s.leadAuditorId === authCtx.userId);
    const isAssessmentAuditor = finding.assessment?.auditorId === authCtx.userId;

    if (!isAdmin && !isOwner && !isPlanOwner && !isLeadAuditor && !isAssessmentAuditor) {
      throw new ForbiddenException(
        'You are not authorized to reopen this finding. Reopening requires lead auditor, finding owner, or administrator privileges.',
      );
    }

    const priorStatus = finding.status;
    const reopenTimestamp = new Date().toISOString();
    const reopenNote = `[REOPENED ${reopenTimestamp} by ${authCtx.userId}]: ${dto.reason.trim()}`;
    const updatedNotes = finding.verificationNotes
      ? `${finding.verificationNotes}\n${reopenNote}`
      : reopenNote;

    const targetVersion = dto.expectedVersion !== undefined ? dto.expectedVersion : finding.version;

    const updated = await this.prisma.$transaction(async (tx: any) => {
      if (typeof tx.auditFinding?.updateMany === 'function') {
        const updateResult = await tx.auditFinding.updateMany({
          where: {
            id,
            organizationId: authCtx.organizationId,
            version: targetVersion,
          },
          data: {
            version: { increment: 1 },
          },
        });

        if (updateResult && updateResult.count === 0) {
          const currentFinding = await tx.auditFinding.findFirst({
            where: { id, organizationId: authCtx.organizationId },
            select: { id: true, version: true },
          });
          if (!currentFinding) {
            throw new NotFoundException(`Audit Finding "${id}" not found`);
          }
          throw new ConflictException({
            statusCode: 409,
            error: 'Conflict',
            message: 'AuditFinding has been modified concurrently. Please refresh the latest state before retrying.',
            code: 'STALE_RECORD_CONFLICT',
          });
        }
      }

      const findingRecord = await tx.auditFinding.update({
        where: { id },
        data: {
          status: FindingStatus.IN_REMEDIATION,
          verificationNotes: updatedNotes,
          version: { increment: 1 },
        },
        include: {
          capas: true,
          evidence: true,
          evidenceAssociations: { include: { evidence: true } },
          verificationHistories: { orderBy: { createdAt: 'desc' } },
        },
      });

      if (tx.auditFindingVerificationHistory?.create) {
        await tx.auditFindingVerificationHistory.create({
          data: {
            organizationId: authCtx.organizationId,
            findingId: id,
            action: AuditFindingLifecycleAction.FINDING_REOPENED,
            priorStatus,
            newStatus: FindingStatus.IN_REMEDIATION,
            actorId: authCtx.userId,
            reason: dto.reason.trim(),
            notes: reopenNote,
          },
        });
      }

      return findingRecord;
    });

    await this.auditLogsService.log({
      organizationId: authCtx.organizationId,
      actorId: authCtx.userId,
      action: 'AUDIT_FINDING_REOPENED',
      entityType: 'AuditFinding',
      entityId: id,
      metadata: {
        priorStatus,
        newStatus: FindingStatus.IN_REMEDIATION,
        reason: dto.reason.trim(),
        userId: authCtx.userId,
        timestamp: reopenTimestamp,
      },
    });

    const userMap = await this.resolveUserMap(authCtx.organizationId, [updated.ownerId, updated.verifiedById]);
    return this.mapFindingToDto(updated, userMap);
  }

  async createCapa(authCtx: ResourceAuthContext, dto: CreateAuditCapaDto): Promise<AuditCapaDto> {
    const finding = await this.prisma.auditFinding.findFirst({
      where: { id: dto.findingId, organizationId: authCtx.organizationId },
      include: { assessment: { include: { auditPlan: true } } },
    });

    if (!finding) throw new NotFoundException(`Audit Finding "${dto.findingId}" not found`);

    await this.resourceAuthService.assertResourceAccess(authCtx, finding.assessment.auditPlan);

    const resolvedOwnerId = await this.assertEligibleUser(
      authCtx.organizationId,
      dto.ownerId,
      'CAPA_OWNER',
    );

    if (finding.status === FindingStatus.VERIFIED || finding.status === FindingStatus.CLOSED) {
      throw new BadRequestException(
        `Cannot add CAPA to a finding in "${finding.status}" status. Reopen the finding first.`,
      );
    }

    const capa = await this.prisma.$transaction(async (tx: any) => {
      const newCapa = await tx.auditCapa.create({
        data: {
          organizationId: authCtx.organizationId,
          findingId: dto.findingId,
          title: dto.title.trim(),
          correctiveAction: dto.correctiveAction.trim(),
          preventiveAction: dto.preventiveAction?.trim() || null,
          ownerId: resolvedOwnerId,
          dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
          status: CapaStatus.OPEN,
          version: 1,
        },
      });

      if (finding.status === FindingStatus.OPEN || finding.status === FindingStatus.READY_FOR_VERIFICATION) {
        await tx.auditFinding.update({
          where: { id: dto.findingId },
          data: {
            status: FindingStatus.IN_REMEDIATION,
            version: { increment: 1 },
          },
        });
        if (tx.auditFindingVerificationHistory?.create) {
          await tx.auditFindingVerificationHistory.create({
            data: {
              organizationId: authCtx.organizationId,
              findingId: dto.findingId,
              capaId: newCapa.id,
              action: AuditFindingLifecycleAction.STATUS_TRANSITIONED,
              priorStatus: finding.status as FindingStatus,
              newStatus: FindingStatus.IN_REMEDIATION,
              actorId: authCtx.userId,
              notes: 'Finding transitioned to IN_REMEDIATION upon addition of CAPA.',
            },
          });
        }
      }

      return newCapa;
    });

    await this.auditLogsService.log({
      organizationId: authCtx.organizationId,
      actorId: authCtx.userId,
      action: 'AUDIT_CAPA_CREATED',
      entityType: 'AuditCapa',
      entityId: capa.id,
      metadata: { findingId: dto.findingId, title: capa.title, ownerId: capa.ownerId },
    });

    const userMap = await this.resolveUserMap(authCtx.organizationId, [capa.ownerId]);
    return this.mapCapaToDto(capa, userMap);
  }

  async updateCapa(
    authCtx: ResourceAuthContext,
    id: string,
    dto: UpdateAuditCapaDto,
  ): Promise<AuditCapaDto> {
    const capa = await this.prisma.auditCapa.findFirst({
      where: { id, organizationId: authCtx.organizationId },
      include: { finding: { include: { assessment: { include: { auditPlan: true } } } } },
    });

    if (!capa) throw new NotFoundException(`Audit CAPA with ID "${id}" not found`);

    await this.resourceAuthService.assertResourceAccess(authCtx, capa.finding.assessment.auditPlan);

    if (dto.expectedUpdatedAt) {
      this.checkOptimisticLock('AuditCapa', capa.updatedAt, dto.expectedUpdatedAt);
    }

    if (dto.expectedVersion !== undefined) {
      if (capa.version !== undefined && capa.version !== dto.expectedVersion) {
        throw new ConflictException({
          statusCode: 409,
          error: 'Conflict',
          message: 'AuditCapa has been modified concurrently. Please refresh the latest state before retrying.',
          code: 'STALE_RECORD_CONFLICT',
        });
      }
    }

    let resolvedOwnerId: string | undefined;
    if (dto.ownerId !== undefined) {
      resolvedOwnerId = await this.assertEligibleUser(
        authCtx.organizationId,
        dto.ownerId,
        'CAPA_OWNER',
      );
    }

    const targetVersion = dto.expectedVersion !== undefined ? dto.expectedVersion : capa.version;

    const updated = await this.prisma.$transaction(async (tx: any) => {
      if (typeof tx.auditCapa?.updateMany === 'function') {
        const updateResult = await tx.auditCapa.updateMany({
          where: {
            id,
            organizationId: authCtx.organizationId,
            version: targetVersion,
          },
          data: {
            version: { increment: 1 },
          },
        });

        if (updateResult && updateResult.count === 0) {
          const currentCapa = await tx.auditCapa.findFirst({
            where: { id, organizationId: authCtx.organizationId },
            select: { id: true, version: true },
          });
          if (!currentCapa) {
            throw new NotFoundException(`Audit CAPA with ID "${id}" not found`);
          }
          throw new ConflictException({
            statusCode: 409,
            error: 'Conflict',
            message: 'AuditCapa has been modified concurrently. Please refresh the latest state before retrying.',
            code: 'STALE_RECORD_CONFLICT',
          });
        }
      }

      const capaRecord = await tx.auditCapa.update({
        where: { id },
        data: {
          ...(dto.title !== undefined && { title: dto.title.trim() }),
          ...(dto.correctiveAction !== undefined && { correctiveAction: dto.correctiveAction.trim() }),
          ...(dto.preventiveAction !== undefined && { preventiveAction: dto.preventiveAction?.trim() || null }),
          ...(resolvedOwnerId !== undefined && { ownerId: resolvedOwnerId }),
          ...(dto.dueDate !== undefined && { dueDate: dto.dueDate ? new Date(dto.dueDate) : null }),
          ...(dto.status !== undefined && { status: dto.status }),
          ...(dto.status === CapaStatus.COMPLETED && { completedAt: new Date() }),
          version: { increment: 1 },
        },
      });

      if (dto.status !== undefined) {
        if (typeof tx.$queryRaw !== 'function') {
          throw new InternalServerErrorException(
            'Database transaction client does not support raw SQL queries for row locking. Parent finding synchronization aborted.',
          );
        }

        // Acquire exclusive row lock on parent finding scoped to organization
        const lockedRows: any = await tx.$queryRaw`SELECT id FROM audit_findings WHERE id = ${capa.findingId} AND "organizationId" = ${authCtx.organizationId} FOR UPDATE`;

        if (!Array.isArray(lockedRows) || lockedRows.length === 0) {
          throw new NotFoundException(
            `Parent Audit Finding "${capa.findingId}" not found or does not belong to organization "${authCtx.organizationId}".`,
          );
        }

        const lockedFinding = await tx.auditFinding.findFirst({
          where: { id: capa.findingId, organizationId: authCtx.organizationId },
        });
        const currentFindingStatus = lockedFinding?.status ?? capa.finding?.status;

        let allCapas: any[] = [];
        if (typeof tx.auditCapa?.findMany === 'function') {
          allCapas = (await tx.auditCapa.findMany({
            where: { findingId: capa.findingId },
          })) || [];
        }

        let isAllCompleted = false;
        if (Array.isArray(allCapas) && allCapas.length > 0) {
          const remainingIncomplete = allCapas.filter((c: any) =>
            (c.id === id ? dto.status : c.status) !== CapaStatus.COMPLETED,
          );
          isAllCompleted = remainingIncomplete.length === 0;
        } else if (typeof tx.auditCapa?.count === 'function') {
          const remainingCount = await tx.auditCapa.count({
            where: {
              findingId: capa.findingId,
              status: { in: [CapaStatus.OPEN, CapaStatus.IN_PROGRESS] },
            },
          });
          isAllCompleted = remainingCount === 0;
        }

        if (isAllCompleted) {
          if (currentFindingStatus === FindingStatus.IN_REMEDIATION) {
            await tx.auditFinding.update({
              where: { id: capa.findingId },
              data: {
                status: FindingStatus.READY_FOR_VERIFICATION,
                version: { increment: 1 },
              },
            });
            if (tx.auditFindingVerificationHistory?.create) {
              await tx.auditFindingVerificationHistory.create({
                data: {
                  organizationId: authCtx.organizationId,
                  findingId: capa.findingId,
                  capaId: id,
                  action: AuditFindingLifecycleAction.STATUS_TRANSITIONED,
                  priorStatus: FindingStatus.IN_REMEDIATION,
                  newStatus: FindingStatus.READY_FOR_VERIFICATION,
                  actorId: authCtx.userId,
                  notes: 'All CAPAs completed. Finding automatically transitioned to READY_FOR_VERIFICATION.',
                },
              });
            }
          }
        } else {
          if (currentFindingStatus === FindingStatus.READY_FOR_VERIFICATION) {
            await tx.auditFinding.update({
              where: { id: capa.findingId },
              data: {
                status: FindingStatus.IN_REMEDIATION,
                version: { increment: 1 },
              },
            });
            if (tx.auditFindingVerificationHistory?.create) {
              await tx.auditFindingVerificationHistory.create({
                data: {
                  organizationId: authCtx.organizationId,
                  findingId: capa.findingId,
                  capaId: id,
                  action: AuditFindingLifecycleAction.STATUS_TRANSITIONED,
                  priorStatus: FindingStatus.READY_FOR_VERIFICATION,
                  newStatus: FindingStatus.IN_REMEDIATION,
                  actorId: authCtx.userId,
                  notes: 'CAPA status reverted from COMPLETED. Finding returned to IN_REMEDIATION.',
                },
              });
            }
          }
        }
      }

      return capaRecord;
    });

    await this.auditLogsService.log({
      organizationId: authCtx.organizationId,
      actorId: authCtx.userId,
      action: 'AUDIT_CAPA_UPDATED',
      entityType: 'AuditCapa',
      entityId: id,
      metadata: { status: updated.status, title: updated.title, findingId: capa.findingId },
    });

    const userMap = await this.resolveUserMap(authCtx.organizationId, [updated.ownerId, updated.verifiedById]);
    return this.mapCapaToDto(updated, userMap);
  }

  async findAllFindings(
    authCtx: ResourceAuthContext,
    query: {
      page?: number;
      limit?: number;
      status?: FindingStatus;
      severity?: VulnerabilitySeverity;
      search?: string;
      planId?: string;
      assessmentId?: string;
    },
  ): Promise<PaginatedAuditFindingsDto> {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const skip = (page - 1) * limit;

    const scopeWhere = await this.resourceAuthService.getScopeWhereClause(authCtx);

    const where: any = {
      organizationId: authCtx.organizationId,
      ...scopeWhere,
    };

    if (query.status) where.status = query.status;
    if (query.severity) where.severity = query.severity;
    if (query.assessmentId) where.assessmentId = query.assessmentId;
    if (query.planId) {
      where.assessment = { auditPlanId: query.planId };
    }

    if (query.search && query.search.trim()) {
      const term = query.search.trim();
      where.OR = [
        { title: { contains: term, mode: 'insensitive' } },
        { description: { contains: term, mode: 'insensitive' } },
        { remediationPlan: { contains: term, mode: 'insensitive' } },
        { ownerId: { contains: term, mode: 'insensitive' } },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.auditFinding.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          capas: true,
          evidence: true,
          evidenceAssociations: {
            include: { evidence: true },
          },
          assessment: {
            include: {
              auditPlan: true,
            },
          },
          verificationHistories: {
            orderBy: { createdAt: 'desc' },
          },
        },
      }),
      this.prisma.auditFinding.count({ where }),
    ]);

    const candidateIds: string[] = [];
    for (const item of items) {
      if (item.ownerId) candidateIds.push(item.ownerId);
      if (item.verifiedById) candidateIds.push(item.verifiedById);
      for (const c of item.capas || []) {
        if (c.ownerId) candidateIds.push(c.ownerId);
        if (c.verifiedById) candidateIds.push(c.verifiedById);
      }
    }
    const userMap = await this.resolveUserMap(authCtx.organizationId, candidateIds);

    return {
      items: items.map((f: any) => this.mapFindingToDto(f, userMap)),
      total,
      page,
      limit,
    };
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

    // Canonical universal Evidence Vault association
    if (dto.evidenceId) {
      const canonical = await this.prisma.evidence.findFirst({
        where: { id: dto.evidenceId, organizationId: authCtx.organizationId, deletedAt: null },
      });
      if (!canonical) {
        throw new NotFoundException(`Canonical Evidence "${dto.evidenceId}" not found or out of scope`);
      }

      if (dto.checkItemId) {
        await this.prisma.auditCheckItemEvidence.create({
          data: {
            organizationId: authCtx.organizationId,
            checkItemId: dto.checkItemId,
            evidenceId: dto.evidenceId,
          },
        }).catch((err) => {
          if (err?.code !== 'P2002') throw err;
        });
      }

      if (dto.findingId) {
        await this.prisma.auditFindingEvidence.create({
          data: {
            organizationId: authCtx.organizationId,
            findingId: dto.findingId,
            evidenceId: dto.evidenceId,
          },
        }).catch((err) => {
          if (err?.code !== 'P2002') throw err;
        });
      }

      // Return canonical evidence projection without creating a duplicate shadow row in audit_evidences
      return {
        id: canonical.id,
        organizationId: canonical.organizationId,
        checkItemId: dto.checkItemId || null,
        findingId: dto.findingId || null,
        fileName: canonical.fileName,
        fileUrl: `/evidence/${canonical.id}/download`,
        fileSize: canonical.fileSize,
        mimeType: canonical.mimeType,
        uploadedById: canonical.uploadedById,
        createdAt: this.toIso(canonical.createdAt),
      };
    }

    // Legacy AuditEvidence creation path for backward compatibility
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

  private mapPlanToDto(p: any, userMap?: Map<string, { name: string; email: string; role?: string }>): AuditPlanDto {
    const userInfo = userMap?.get(p.ownerId);
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
      ownerName: userInfo?.name || null,
      ownerEmail: userInfo?.email || null,
      ownerRole: userInfo?.role || null,
      teamName: p.departmentRef?.name || null,
      plannedStartDate: p.plannedStartDate ? p.plannedStartDate.toISOString() : null,
      plannedEndDate: p.plannedEndDate ? p.plannedEndDate.toISOString() : null,
      status: p.status as AuditPlanStatus,
      createdById: p.createdById,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
      version: p.version ?? 1,
      schedules: p.schedules ? p.schedules.map((s: any) => this.mapScheduleToDto(s)) : [],
      assessments: p.assessments ? p.assessments.map((a: any) => this.mapAssessmentToDto(a, userMap)) : [],
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

  private toIso(val: any): string {
    if (!val) return new Date().toISOString();
    return val instanceof Date ? val.toISOString() : new Date(val).toISOString();
  }

  private toNullableIso(val: any): string | null {
    if (!val) return null;
    return val instanceof Date ? val.toISOString() : new Date(val).toISOString();
  }

  private mapAssessmentToDto(a: any, userMap?: Map<string, { name: string; email: string; role?: string }>): AuditAssessmentDto {
    const auditorInfo = userMap?.get(a.auditorId);
    return {
      id: a.id,
      organizationId: a.organizationId,
      auditPlanId: a.auditPlanId,
      scheduleId: a.scheduleId,
      auditorId: a.auditorId,
      auditorName: auditorInfo?.name || null,
      auditorEmail: auditorInfo?.email || null,
      status: a.status as AuditAssessmentStatus,
      score: a.score,
      summary: a.summary,
      startedAt: this.toIso(a.startedAt),
      completedAt: this.toNullableIso(a.completedAt),
      createdById: a.createdById,
      createdAt: this.toIso(a.createdAt),
      updatedAt: this.toIso(a.updatedAt),
      checkItems: a.checkItems ? a.checkItems.map((c: any) => {
        const canonicalEv = (c.evidenceAssociations || []).filter((ea: any) => ea.evidence).map((ea: any) => ({
          id: ea.evidence.id,
          organizationId: ea.evidence.organizationId,
          checkItemId: c.id,
          findingId: null,
          fileName: ea.evidence.fileName,
          fileUrl: `/evidence/${ea.evidence.id}/download`,
          fileSize: ea.evidence.fileSize,
          mimeType: ea.evidence.mimeType,
          uploadedById: ea.evidence.uploadedById,
          createdAt: this.toIso(ea.evidence.createdAt),
        }));
        const canonicalIds = new Set(canonicalEv.map((item: any) => item.id));

        const legacyEv = (c.evidence || [])
          .filter((e: any) => !canonicalIds.has(e.id) && !Array.from(canonicalIds).some((canId) => e.fileUrl?.includes(canId)))
          .map((e: any) => ({
            id: e.id,
            organizationId: e.organizationId,
            checkItemId: e.checkItemId,
            findingId: e.findingId,
            fileName: e.fileName,
            fileUrl: e.fileUrl,
            fileSize: e.fileSize,
            mimeType: e.mimeType,
            uploadedById: e.uploadedById,
            createdAt: this.toIso(e.createdAt),
          }));

        return {
          id: c.id,
          organizationId: c.organizationId,
          assessmentId: c.assessmentId,
          controlId: c.controlId,
          title: c.title,
          description: c.description,
          result: c.result as AuditCheckResult,
          notes: c.notes,
          evidence: [...legacyEv, ...canonicalEv],
          createdById: c.createdById,
          createdAt: this.toIso(c.createdAt),
          updatedAt: this.toIso(c.updatedAt),
        };
      }) : [],
      findings: a.findings ? a.findings.map((f: any) => this.mapFindingToDto(f, userMap)) : [],
    };
  }

  private mapFindingToDto(f: any, userMap?: Map<string, { name: string; email: string; role?: string }>): AuditFindingDto {
    const ownerInfo = userMap?.get(f.ownerId);
    const verifierInfo = f.verifiedById ? userMap?.get(f.verifiedById) : undefined;
    const canonicalEv = (f.evidenceAssociations || []).filter((ea: any) => ea.evidence).map((ea: any) => ({
      id: ea.evidence.id,
      organizationId: ea.evidence.organizationId,
      checkItemId: null,
      findingId: f.id,
      fileName: ea.evidence.fileName,
      fileUrl: `/evidence/${ea.evidence.id}/download`,
      fileSize: ea.evidence.fileSize,
      mimeType: ea.evidence.mimeType,
      uploadedById: ea.evidence.uploadedById,
      createdAt: this.toIso(ea.evidence.createdAt),
    }));
    const canonicalIds = new Set(canonicalEv.map((item: any) => item.id));

    const legacyEv = (f.evidence || [])
      .filter((e: any) => !canonicalIds.has(e.id) && !Array.from(canonicalIds).some((canId) => e.fileUrl?.includes(canId)))
      .map((e: any) => ({
        id: e.id,
        organizationId: e.organizationId,
        checkItemId: e.checkItemId,
        findingId: e.findingId,
        fileName: e.fileName,
        fileUrl: e.fileUrl,
        fileSize: e.fileSize,
        mimeType: e.mimeType,
        uploadedById: e.uploadedById,
        createdAt: this.toIso(e.createdAt),
      }));

    let capaApplicability = (f.capaApplicability as CapaApplicability) || CapaApplicability.UNASSESSED;
    let capaRationale: string | null = f.capaRationale || null;
    let remediationPlan: string | null = f.remediationPlan || null;

    if (remediationPlan && remediationPlan.includes('[NO_CAPA_REQUIRED:')) {
      const match = remediationPlan.match(/\[NO_CAPA_REQUIRED:\s*([^\]]+)\]/);
      if (match) {
        if (!capaRationale) capaRationale = match[1].trim();
        if (capaApplicability === CapaApplicability.UNASSESSED) {
          capaApplicability = CapaApplicability.NOT_REQUIRED;
        }
      }
      remediationPlan = remediationPlan.replace(/\[NO_CAPA_REQUIRED:[^\]]*\]\s*/g, '').trim() || null;
    }

    const capaRequired = capaApplicability !== CapaApplicability.NOT_REQUIRED;

    const verificationHistories: AuditFindingVerificationHistoryDto[] = (f.verificationHistories || []).map((h: any) => ({
      id: h.id,
      organizationId: h.organizationId,
      findingId: h.findingId,
      action: h.action,
      priorStatus: h.priorStatus,
      newStatus: h.newStatus,
      actorId: h.actorId,
      actorName: userMap?.get(h.actorId)?.name || null,
      actorEmail: userMap?.get(h.actorId)?.email || null,
      reason: h.reason || null,
      notes: h.notes || null,
      createdAt: this.toIso(h.createdAt),
    }));

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
      ownerName: ownerInfo?.name || null,
      ownerEmail: ownerInfo?.email || null,
      dueDate: this.toNullableIso(f.dueDate),
      riskId: f.riskId,
      remediationPlan,
      capaApplicability,
      capaRequired,
      capaRationale,
      version: f.version ?? 1,
      verificationNotes: f.verificationNotes,
      verifiedById: f.verifiedById,
      verifiedByName: verifierInfo?.name || verifierInfo?.email || null,
      verifiedAt: this.toNullableIso(f.verifiedAt),
      createdById: f.createdById,
      createdAt: this.toIso(f.createdAt),
      updatedAt: this.toIso(f.updatedAt),
      capas: f.capas ? f.capas.map((c: any) => this.mapCapaToDto(c, userMap)) : [],
      evidence: [...legacyEv, ...canonicalEv],
      verificationHistories,
    };
  }

  private mapCapaToDto(c: any, userMap?: Map<string, { name: string; email: string; role?: string }>): AuditCapaDto {
    const ownerInfo = userMap?.get(c.ownerId);
    const verifierInfo = c.verifiedById ? userMap?.get(c.verifiedById) : undefined;
    return {
      id: c.id,
      organizationId: c.organizationId,
      findingId: c.findingId,
      title: c.title,
      correctiveAction: c.correctiveAction,
      preventiveAction: c.preventiveAction,
      ownerId: c.ownerId,
      ownerName: ownerInfo?.name || null,
      ownerEmail: ownerInfo?.email || null,
      dueDate: this.toNullableIso(c.dueDate),
      status: c.status as CapaStatus,
      completedAt: this.toNullableIso(c.completedAt),
      verifiedById: c.verifiedById,
      verifiedByName: verifierInfo?.name || verifierInfo?.email || null,
      verifiedAt: this.toNullableIso(c.verifiedAt),
      createdAt: this.toIso(c.createdAt),
      updatedAt: this.toIso(c.updatedAt),
      version: c.version ?? 1,
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
