import { Injectable, NotFoundException, ForbiddenException, BadRequestException, Optional } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { ResourceAuthorizationService, ResourceAuthContext } from '../auth/resource-authorization.service';
import { ApprovalEngineService } from '../approval/approval-engine.service';
import {
  IncidentDto,
  CreateIncidentDto,
  UpdateIncidentDto,
  IncidentQueryDto,
  PaginatedIncidentsDto,
  IncidentSeverity,
  IncidentStatus,
  IncidentActionDto,
  CreateIncidentActionDto,
  UpdateIncidentActionDto,
  NotificationType,
} from '@omnigrc/shared';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class IncidentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogsService: AuditLogsService,
    private readonly resourceAuthService: ResourceAuthorizationService,
    @Optional() private readonly approvalEngineService?: ApprovalEngineService,
    @Optional() private readonly notificationsService?: NotificationsService,
  ) {}

  async findAll(
    authCtx: ResourceAuthContext,
    query: IncidentQueryDto,
  ): Promise<PaginatedIncidentsDto> {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const skip = (page - 1) * limit;

    const scopeWhere = await this.resourceAuthService.getScopeWhereClause(authCtx);

    const where: any = {
      ...scopeWhere,
      deletedAt: null,
    };

    if (query.severity) {
      where.severity = query.severity;
    }

    if (query.status) {
      where.status = query.status;
    }

    if (query.category) {
      where.category = query.category;
    }

    if (query.priority) {
      where.priority = query.priority;
    }

    if (query.search?.trim()) {
      const search = query.search.trim();
      const searchConditions = [
        { title: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
        { category: { contains: search, mode: 'insensitive' } },
        { priority: { contains: search, mode: 'insensitive' } },
        { rootCause: { contains: search, mode: 'insensitive' } },
        { investigationDetails: { contains: search, mode: 'insensitive' } },
        { owner: { contains: search, mode: 'insensitive' } },
        { businessUnit: { contains: search, mode: 'insensitive' } },
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
      this.prisma.incident.findMany({
        where,
        include: {
          affectedAsset: { select: { id: true, name: true } },
          actions: true,
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.incident.count({ where }),
    ]);

    return {
      items: items.map((inc) => this.mapToDto(inc)),
      total,
      page,
      limit,
    };
  }

  async findOne(authCtx: ResourceAuthContext, id: string): Promise<IncidentDto> {
    const scopeWhere = await this.resourceAuthService.getScopeWhereClause(authCtx);
    const incident = await this.prisma.incident.findFirst({
      where: { id, ...scopeWhere, deletedAt: null },
      include: {
        affectedAsset: { select: { id: true, name: true } },
        actions: true,
      },
    });

    if (!incident) {
      throw new NotFoundException(`Incident with ID ${id} not found.`);
    }

    return this.mapToDto(incident);
  }

  async create(
    authCtx: ResourceAuthContext,
    dto: CreateIncidentDto,
  ): Promise<IncidentDto> {
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

    if (dto.affectedAssetId) {
      const scopeWhere = await this.resourceAuthService.getScopeWhereClause(authCtx);
      const asset = await this.prisma.asset.findFirst({
        where: { id: dto.affectedAssetId, ...scopeWhere, deletedAt: null },
      });
      if (!asset) {
        throw new NotFoundException(`Affected asset ${dto.affectedAssetId} not found or out of scope.`);
      }
    }

    const initialStatus = (dto.status || IncidentStatus.OPEN) as any;

    const incident = await this.prisma.incident.create({
      data: {
        organizationId: authCtx.organizationId,
        departmentId: dto.departmentId || null,
        projectId: dto.projectId || null,
        createdById: authCtx.userId,
        title: dto.title,
        description: dto.description || null,
        category: dto.category || null,
        priority: dto.priority || null,
        severity: (dto.severity || IncidentSeverity.MEDIUM) as any,
        status: initialStatus,
        owner: dto.owner || 'Unassigned',
        businessUnit: dto.businessUnit || null,
        detectedAt: dto.detectedAt ? new Date(dto.detectedAt) : new Date(),
        containedAt: dto.containedAt ? new Date(dto.containedAt) : (initialStatus === IncidentStatus.CONTAINED ? new Date() : null),
        resolvedAt: dto.resolvedAt ? new Date(dto.resolvedAt) : (initialStatus === IncidentStatus.RESOLVED ? new Date() : null),
        dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
        rootCause: dto.rootCause || null,
        investigationDetails: dto.investigationDetails || null,
        affectedAssetId: dto.affectedAssetId || null,
      },
      include: {
        affectedAsset: { select: { id: true, name: true } },
        actions: true,
      },
    });

    await this.auditLogsService.log({
      organizationId: authCtx.organizationId,
      actorId: authCtx.userId,
      action: 'INCIDENT_CREATED',
      entityType: 'Incident',
      entityId: incident.id,
      metadata: {
        title: incident.title,
        severity: incident.severity,
        status: incident.status,
        category: incident.category,
        priority: incident.priority,
      },
    });

    if (this.notificationsService && incident.owner && incident.owner !== 'Unassigned') {
      await this.notificationsService.notify({
        organizationId: authCtx.organizationId,
        userId: incident.owner,
        type: NotificationType.TASK_ASSIGNED,
        message: `New incident assigned: "${incident.title}" (Severity: ${incident.severity}).`,
        entityType: 'Incident',
        entityId: incident.id,
      });
    }

    return this.mapToDto(incident);
  }

  async update(
    authCtx: ResourceAuthContext,
    id: string,
    dto: UpdateIncidentDto,
  ): Promise<IncidentDto> {
    const scopeWhere = await this.resourceAuthService.getScopeWhereClause(authCtx);
    const existing = await this.prisma.incident.findFirst({
      where: { id, ...scopeWhere, deletedAt: null },
    });

    if (!existing) {
      throw new NotFoundException(`Incident with ID ${id} not found.`);
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

    // Lifecycle State Transition & RCA Invariant Validation
    if (dto.status !== undefined && dto.status !== existing.status) {
      if (existing.status === IncidentStatus.CLOSED && dto.status !== IncidentStatus.OPEN) {
        throw new BadRequestException('Closed incidents can only be transitioned to OPEN (reopened).');
      }

      if (dto.status === IncidentStatus.CLOSED && existing.status !== IncidentStatus.RESOLVED) {
        throw new BadRequestException('Incident must be in RESOLVED status before it can be closed.');
      }

      if (dto.status === IncidentStatus.RESOLVED) {
        const rootCause = dto.rootCause !== undefined ? dto.rootCause : existing.rootCause;
        const invDetails = dto.investigationDetails !== undefined ? dto.investigationDetails : existing.investigationDetails;
        if (!rootCause && !invDetails) {
          throw new BadRequestException('Cannot mark incident as RESOLVED without recording root cause analysis or investigation details.');
        }
      }
    }

    const data: any = {};
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.category !== undefined) data.category = dto.category;
    if (dto.priority !== undefined) data.priority = dto.priority;
    if (dto.severity !== undefined) data.severity = dto.severity;
    if (dto.status !== undefined) data.status = dto.status;
    if (dto.owner !== undefined) data.owner = dto.owner;
    if (dto.businessUnit !== undefined) data.businessUnit = dto.businessUnit;
    if (dto.detectedAt !== undefined) data.detectedAt = new Date(dto.detectedAt);
    if (dto.containedAt !== undefined)
      data.containedAt = dto.containedAt ? new Date(dto.containedAt) : null;
    if (dto.resolvedAt !== undefined)
      data.resolvedAt = dto.resolvedAt ? new Date(dto.resolvedAt) : null;
    if (dto.dueDate !== undefined) data.dueDate = dto.dueDate ? new Date(dto.dueDate) : null;
    if (dto.rootCause !== undefined) data.rootCause = dto.rootCause;
    if (dto.investigationDetails !== undefined) data.investigationDetails = dto.investigationDetails;
    if (dto.departmentId !== undefined) data.departmentId = dto.departmentId;
    if (dto.projectId !== undefined) data.projectId = dto.projectId;

    if (dto.affectedAssetId) {
      const asset = await this.prisma.asset.findFirst({
        where: { id: dto.affectedAssetId, ...scopeWhere, deletedAt: null },
      });
      if (!asset) {
        throw new NotFoundException(`Affected asset ${dto.affectedAssetId} not found or out of scope.`);
      }
      data.affectedAssetId = dto.affectedAssetId;
    } else if (dto.affectedAssetId === null) {
      data.affectedAssetId = null;
    }

    if (dto.status === IncidentStatus.CONTAINED && !data.containedAt && !existing.containedAt) {
      data.containedAt = new Date();
    }
    if (dto.status === IncidentStatus.RESOLVED && !data.resolvedAt && !existing.resolvedAt) {
      data.resolvedAt = new Date();
    }

    const updated = await this.prisma.incident.update({
      where: { id },
      data,
      include: {
        affectedAsset: { select: { id: true, name: true } },
        actions: true,
      },
    });

    await this.auditLogsService.log({
      organizationId: authCtx.organizationId,
      actorId: authCtx.userId,
      action: 'INCIDENT_UPDATED',
      entityType: 'Incident',
      entityId: updated.id,
      metadata: { status: updated.status, severity: updated.severity, category: updated.category },
    });

    if (this.notificationsService && dto.status !== undefined && dto.status !== existing.status) {
      const recipient = updated.owner && updated.owner !== 'Unassigned' ? updated.owner : existing.createdById;
      if (recipient) {
        await this.notificationsService.notify({
          organizationId: authCtx.organizationId,
          userId: recipient,
          type: NotificationType.TASK_ASSIGNED,
          message: `Incident "${updated.title}" status changed from ${existing.status} to ${updated.status}.`,
          entityType: 'Incident',
          entityId: updated.id,
        });
      }
    }

    if (this.notificationsService && dto.status === IncidentStatus.CLOSED && existing.status !== IncidentStatus.CLOSED) {
      const recipient = updated.owner && updated.owner !== 'Unassigned' ? updated.owner : existing.createdById;
      if (recipient) {
        await this.notificationsService.notify({
          organizationId: authCtx.organizationId,
          userId: recipient,
          type: NotificationType.TASK_ASSIGNED,
          message: `Incident "${updated.title}" has been closed.`,
          entityType: 'Incident',
          entityId: updated.id,
        });
      }
    }

    return this.mapToDto(updated);
  }

  // --- INCIDENT ACTIONS / CAPA ---

  async createAction(
    authCtx: ResourceAuthContext,
    incidentId: string,
    dto: CreateIncidentActionDto,
  ): Promise<IncidentActionDto> {
    const scopeWhere = await this.resourceAuthService.getScopeWhereClause(authCtx);
    const incident = await this.prisma.incident.findFirst({
      where: { id: incidentId, ...scopeWhere, deletedAt: null },
    });
    if (!incident) throw new NotFoundException(`Incident with ID "${incidentId}" not found.`);

    const action = await this.prisma.incidentAction.create({
      data: {
        organizationId: authCtx.organizationId,
        incidentId,
        title: dto.title.trim(),
        description: dto.description?.trim() || null,
        actionType: dto.actionType || 'CORRECTIVE',
        owner: dto.owner.trim(),
        dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
        status: (dto.status as any) || 'OPEN',
      },
    });

    await this.auditLogsService.log({
      organizationId: authCtx.organizationId,
      actorId: authCtx.userId,
      action: 'INCIDENT_ACTION_CREATED',
      entityType: 'IncidentAction',
      entityId: action.id,
      metadata: { incidentId, title: action.title, actionType: action.actionType },
    });

    return {
      id: action.id,
      organizationId: action.organizationId,
      incidentId: action.incidentId,
      title: action.title,
      description: action.description,
      actionType: action.actionType,
      owner: action.owner,
      dueDate: action.dueDate ? action.dueDate.toISOString() : null,
      status: action.status,
      completedAt: action.completedAt ? action.completedAt.toISOString() : null,
      createdAt: action.createdAt.toISOString(),
      updatedAt: action.updatedAt.toISOString(),
    };
  }

  async getActions(authCtx: ResourceAuthContext, incidentId: string): Promise<IncidentActionDto[]> {
    const scopeWhere = await this.resourceAuthService.getScopeWhereClause(authCtx);
    const incident = await this.prisma.incident.findFirst({
      where: { id: incidentId, ...scopeWhere, deletedAt: null },
    });
    if (!incident) throw new NotFoundException(`Incident with ID "${incidentId}" not found.`);

    const actions = await this.prisma.incidentAction.findMany({
      where: { incidentId, organizationId: authCtx.organizationId },
      orderBy: { createdAt: 'desc' },
    });

    return actions.map((a) => ({
      id: a.id,
      organizationId: a.organizationId,
      incidentId: a.incidentId,
      title: a.title,
      description: a.description,
      actionType: a.actionType,
      owner: a.owner,
      dueDate: a.dueDate ? a.dueDate.toISOString() : null,
      status: a.status,
      completedAt: a.completedAt ? a.completedAt.toISOString() : null,
      createdAt: a.createdAt.toISOString(),
      updatedAt: a.updatedAt.toISOString(),
    }));
  }

  async updateAction(
    authCtx: ResourceAuthContext,
    incidentId: string,
    actionId: string,
    dto: UpdateIncidentActionDto,
  ): Promise<IncidentActionDto> {
    const scopeWhere = await this.resourceAuthService.getScopeWhereClause(authCtx);
    const incident = await this.prisma.incident.findFirst({
      where: { id: incidentId, ...scopeWhere, deletedAt: null },
    });
    if (!incident) throw new NotFoundException(`Incident with ID "${incidentId}" not found.`);

    const existing = await this.prisma.incidentAction.findFirst({
      where: { id: actionId, incidentId, organizationId: authCtx.organizationId },
    });
    if (!existing) throw new NotFoundException(`Action with ID "${actionId}" not found on incident.`);

    const completedAt = dto.status === 'COMPLETED' || dto.status === 'CLOSED'
      ? (existing.completedAt || new Date())
      : (dto.status ? null : existing.completedAt);

    const updated = await this.prisma.incidentAction.update({
      where: { id: actionId },
      data: {
        ...(dto.title !== undefined && { title: dto.title.trim() }),
        ...(dto.description !== undefined && { description: dto.description?.trim() }),
        ...(dto.actionType !== undefined && { actionType: dto.actionType }),
        ...(dto.owner !== undefined && { owner: dto.owner.trim() }),
        ...(dto.dueDate !== undefined && { dueDate: dto.dueDate ? new Date(dto.dueDate) : null }),
        ...(dto.status !== undefined && { status: dto.status as any }),
        completedAt,
      },
    });

    await this.auditLogsService.log({
      organizationId: authCtx.organizationId,
      actorId: authCtx.userId,
      action: 'INCIDENT_ACTION_UPDATED',
      entityType: 'IncidentAction',
      entityId: updated.id,
      metadata: { incidentId, status: updated.status },
    });

    return {
      id: updated.id,
      organizationId: updated.organizationId,
      incidentId: updated.incidentId,
      title: updated.title,
      description: updated.description,
      actionType: updated.actionType,
      owner: updated.owner,
      dueDate: updated.dueDate ? updated.dueDate.toISOString() : null,
      status: updated.status,
      completedAt: updated.completedAt ? updated.completedAt.toISOString() : null,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    };
  }

  async deleteAction(authCtx: ResourceAuthContext, incidentId: string, actionId: string): Promise<{ success: boolean }> {
    const scopeWhere = await this.resourceAuthService.getScopeWhereClause(authCtx);
    const incident = await this.prisma.incident.findFirst({
      where: { id: incidentId, ...scopeWhere, deletedAt: null },
    });
    if (!incident) throw new NotFoundException(`Incident with ID "${incidentId}" not found.`);

    await this.prisma.incidentAction.deleteMany({
      where: { id: actionId, incidentId, organizationId: authCtx.organizationId },
    });

    return { success: true };
  }

  // --- EVIDENCE ASSOCIATIONS ---

  async attachEvidence(authCtx: ResourceAuthContext, incidentId: string, evidenceId: string) {
    await this.findOne(authCtx, incidentId);
    const evidence = await this.prisma.evidence.findFirst({
      where: { id: evidenceId, organizationId: authCtx.organizationId, deletedAt: null },
    });
    if (!evidence) throw new NotFoundException(`Evidence "${evidenceId}" not found.`);

    const assoc = await this.prisma.incidentEvidence.create({
      data: {
        organizationId: authCtx.organizationId,
        incidentId,
        evidenceId,
      },
    });

    await this.auditLogsService.log({
      organizationId: authCtx.organizationId,
      actorId: authCtx.userId,
      action: 'INCIDENT_EVIDENCE_ATTACHED',
      entityType: 'Incident',
      entityId: incidentId,
      metadata: { evidenceId },
    });

    return assoc;
  }

  async detachEvidence(authCtx: ResourceAuthContext, incidentId: string, evidenceId: string) {
    await this.findOne(authCtx, incidentId);
    await this.prisma.incidentEvidence.deleteMany({
      where: { incidentId, evidenceId, organizationId: authCtx.organizationId },
    });
    return { success: true };
  }

  // --- APPROVAL WORKFLOW INTEGRATION ---

  async submitForApproval(
    authCtx: ResourceAuthContext,
    incidentId: string,
    dto: { purpose: 'INCIDENT_RESOLUTION' | 'INCIDENT_CLOSURE'; workflowId?: string; title?: string; dueDays?: number },
  ) {
    const incident = await this.findOne(authCtx, incidentId);
    if (!this.approvalEngineService) {
      throw new BadRequestException('Approval engine service is not available.');
    }

    const title = dto.title?.trim() || `Incident Approval: ${incident.title} (${dto.purpose})`;
    const instance = await this.approvalEngineService.createApprovalInstance(
      authCtx.organizationId,
      authCtx.userId,
      {
        title,
        description: incident.description || undefined,
        resourceType: 'INCIDENT',
        resourceId: incident.id,
        workflowId: dto.workflowId,
        purpose: dto.purpose as any,
        dueDays: dto.dueDays || 7,
      },
    );

    await this.auditLogsService.log({
      organizationId: authCtx.organizationId,
      actorId: authCtx.userId,
      action: 'INCIDENT_APPROVAL_SUBMITTED',
      entityType: 'Incident',
      entityId: incident.id,
      metadata: { approvalInstanceId: instance.id, purpose: dto.purpose },
    });

    return instance;
  }

  private mapToDto(inc: any): IncidentDto {
    return {
      id: inc.id,
      organizationId: inc.organizationId,
      departmentId: inc.departmentId || null,
      projectId: inc.projectId || null,
      title: inc.title,
      description: inc.description,
      category: inc.category || null,
      priority: inc.priority || null,
      severity: inc.severity as IncidentSeverity,
      status: inc.status as IncidentStatus,
      owner: inc.owner,
      businessUnit: inc.businessUnit || null,
      detectedAt: inc.detectedAt ? (typeof inc.detectedAt === 'string' ? inc.detectedAt : inc.detectedAt.toISOString()) : new Date().toISOString(),
      containedAt: inc.containedAt ? (typeof inc.containedAt === 'string' ? inc.containedAt : inc.containedAt.toISOString()) : null,
      resolvedAt: inc.resolvedAt ? (typeof inc.resolvedAt === 'string' ? inc.resolvedAt : inc.resolvedAt.toISOString()) : null,
      dueDate: inc.dueDate ? (typeof inc.dueDate === 'string' ? inc.dueDate : inc.dueDate.toISOString()) : null,
      rootCause: inc.rootCause,
      investigationDetails: inc.investigationDetails || null,
      affectedAssetId: inc.affectedAssetId,
      affectedAssetName: inc.affectedAsset?.name || null,
      actions: inc.actions ? inc.actions.map((a: any) => ({
        id: a.id,
        organizationId: a.organizationId,
        incidentId: a.incidentId,
        title: a.title,
        description: a.description,
        actionType: a.actionType,
        owner: a.owner,
        dueDate: a.dueDate ? (typeof a.dueDate === 'string' ? a.dueDate : a.dueDate.toISOString()) : null,
        status: a.status,
        completedAt: a.completedAt ? (typeof a.completedAt === 'string' ? a.completedAt : a.completedAt.toISOString()) : null,
        createdAt: typeof a.createdAt === 'string' ? a.createdAt : a.createdAt.toISOString(),
        updatedAt: typeof a.updatedAt === 'string' ? a.updatedAt : a.updatedAt.toISOString(),
      })) : [],
      createdById: inc.createdById,
      createdAt: inc.createdAt ? (typeof inc.createdAt === 'string' ? inc.createdAt : inc.createdAt.toISOString()) : new Date().toISOString(),
      updatedAt: inc.updatedAt ? (typeof inc.updatedAt === 'string' ? inc.updatedAt : inc.updatedAt.toISOString()) : new Date().toISOString(),
    };
  }
}
