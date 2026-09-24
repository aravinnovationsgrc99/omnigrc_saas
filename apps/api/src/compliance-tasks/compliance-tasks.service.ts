import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ResourceAuthorizationService, ResourceAuthContext } from '../auth/resource-authorization.service';
import { CreateComplianceTaskDto, UpdateComplianceTaskDto, ComplianceTaskQueryDto } from './dto/compliance-tasks.dto';
import { ComplianceTaskDto, PaginatedComplianceTasksDto, TaskStatus, ComplianceTaskSummaryDto, NotificationType, ObligationCadence } from '@omnigrc/shared';

@Injectable()
export class ComplianceTasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogsService: AuditLogsService,
    private readonly notificationsService: NotificationsService,
    private readonly resourceAuthService: ResourceAuthorizationService,
  ) {}

  async findAll(authCtx: ResourceAuthContext, query: ComplianceTaskQueryDto): Promise<PaginatedComplianceTasksDto> {
    const page = query.page || 1;
    const limit = query.limit || 100;
    const skip = (page - 1) * limit;

    const scopeWhere = await this.resourceAuthService.getScopeWhereClause(authCtx);

    const where: any = {
      ...scopeWhere,
      deletedAt: null,
    };

    if (query.status) {
      where.status = query.status;
    }

    if (query.controlId) {
      where.controlId = query.controlId;
    }

    if (query.search && query.search.trim()) {
      const searchTerm = query.search.trim();
      const searchConditions = [
        { title: { contains: searchTerm, mode: 'insensitive' } },
        { owner: { contains: searchTerm, mode: 'insensitive' } },
        { description: { contains: searchTerm, mode: 'insensitive' } },
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
      this.prisma.complianceTask.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ status: 'asc' }, { dueDate: 'asc' }],
        include: { control: { select: { name: true } } },
      }),
      this.prisma.complianceTask.count({ where }),
    ]);

    return {
      items: items.map(this.mapToDto),
      total,
      page,
      limit,
    };
  }

  async getDashboardSummary(authCtx: ResourceAuthContext): Promise<ComplianceTaskSummaryDto> {
    const scopeWhere = await this.resourceAuthService.getScopeWhereClause(authCtx);
    const now = new Date();
    const d30 = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const d60 = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);
    const d90 = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);

    const openTasks = await this.prisma.complianceTask.findMany({
      where: {
        ...scopeWhere,
        deletedAt: null,
        status: { not: TaskStatus.COMPLETE },
      },
      select: { dueDate: true },
    });

    let overdue = 0;
    let due30 = 0;
    let due60 = 0;
    let due90 = 0;

    for (const t of openTasks) {
      if (!t.dueDate) continue;

      if (t.dueDate < now) {
        overdue++;
      } else if (t.dueDate <= d30) {
        due30++;
      } else if (t.dueDate <= d60) {
        due60++;
      } else if (t.dueDate <= d90) {
        due90++;
      }
    }

    return {
      overdue,
      due30,
      due60,
      due90,
      totalOpen: openTasks.length,
    };
  }

  async getDueThisWeekCount(authCtx: ResourceAuthContext): Promise<{ count: number }> {
    const scopeWhere = await this.resourceAuthService.getScopeWhereClause(authCtx);
    const now = new Date();
    const next7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const count = await this.prisma.complianceTask.count({
      where: {
        ...scopeWhere,
        deletedAt: null,
        status: { not: TaskStatus.COMPLETE },
        dueDate: {
          gte: new Date(now.setHours(0, 0, 0, 0)),
          lte: next7Days,
        },
      },
    });

    return { count };
  }

  async findOne(authCtx: ResourceAuthContext, id: string): Promise<ComplianceTaskDto> {
    const scopeWhere = await this.resourceAuthService.getScopeWhereClause(authCtx);
    const task = await this.prisma.complianceTask.findFirst({
      where: { id, ...scopeWhere, deletedAt: null },
      include: { control: { select: { name: true } } },
    });

    if (!task) {
      throw new NotFoundException(`Compliance task with ID "${id}" not found`);
    }

    return this.mapToDto(task);
  }

  async create(authCtx: ResourceAuthContext, dto: CreateComplianceTaskDto): Promise<ComplianceTaskDto> {
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

    if (dto.controlId) {
      const scopeWhere = await this.resourceAuthService.getScopeWhereClause(authCtx);
      const control = await this.prisma.control.findFirst({
        where: { id: dto.controlId, ...scopeWhere, deletedAt: null },
      });
      if (!control) {
        throw new NotFoundException(`Control "${dto.controlId}" not found or out of scope.`);
      }
    }

    const task = await this.prisma.complianceTask.create({
      data: {
        organizationId: authCtx.organizationId,
        departmentId: dto.departmentId || null,
        projectId: dto.projectId || null,
        title: dto.title,
        description: dto.description || null,
        status: dto.status || TaskStatus.NOT_STARTED,
        owner: dto.owner,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
        controlId: dto.controlId || null,
        cadence: dto.cadence || ObligationCadence.ONE_OFF,
        category: dto.category || null,
        obligationReference: dto.obligationReference || null,
        createdById: authCtx.userId,
      },
      include: { control: { select: { name: true } } },
    });

    await this.auditLogsService.log({
      organizationId: authCtx.organizationId,
      actorId: authCtx.userId,
      action: 'COMPLIANCE_TASK_CREATED',
      entityType: 'ComplianceTask',
      entityId: task.id,
      metadata: {
        title: task.title,
        status: task.status,
        owner: task.owner,
        dueDate: task.dueDate ? task.dueDate.toISOString() : null,
        cadence: task.cadence,
        departmentId: task.departmentId,
        projectId: task.projectId,
      },
    });

    await this.notificationsService.notify({
      organizationId: authCtx.organizationId,
      userId: authCtx.userId,
      type: NotificationType.TASK_ASSIGNED,
      message: `New compliance task assigned: "${task.title}" (Owner: ${task.owner}).`,
      entityType: 'COMPLIANCE_TASK',
      entityId: task.id,
    });

    return this.mapToDto(task);
  }

  async update(authCtx: ResourceAuthContext, id: string, dto: UpdateComplianceTaskDto): Promise<ComplianceTaskDto> {
    const scopeWhere = await this.resourceAuthService.getScopeWhereClause(authCtx);
    const existing = await this.prisma.complianceTask.findFirst({
      where: { id, ...scopeWhere, deletedAt: null },
    });

    if (!existing) {
      throw new NotFoundException(`Compliance task with ID "${id}" not found`);
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

    if (dto.controlId) {
      const control = await this.prisma.control.findFirst({
        where: { id: dto.controlId, ...scopeWhere, deletedAt: null },
      });
      if (!control) {
        throw new NotFoundException(`Control "${dto.controlId}" not found or out of scope.`);
      }
    }

    const changedFields: string[] = [];
    if (dto.title !== undefined && dto.title !== existing.title) changedFields.push('title');
    if (dto.description !== undefined && dto.description !== existing.description) changedFields.push('description');
    if (dto.status !== undefined && dto.status !== existing.status) changedFields.push('status');
    if (dto.owner !== undefined && dto.owner !== existing.owner) changedFields.push('owner');
    if (dto.dueDate !== undefined && dto.dueDate !== (existing.dueDate ? existing.dueDate.toISOString() : null)) changedFields.push('dueDate');
    if (dto.controlId !== undefined && dto.controlId !== existing.controlId) changedFields.push('controlId');
    if (dto.cadence !== undefined && dto.cadence !== existing.cadence) changedFields.push('cadence');

    let lastCompletedAt = existing.lastCompletedAt;
    let nextDueDate = existing.nextDueDate;

    const newStatus = dto.status !== undefined ? dto.status : existing.status;
    const effectiveCadence = dto.cadence !== undefined ? dto.cadence : existing.cadence;
    const baseDueDate = dto.dueDate !== undefined ? (dto.dueDate ? new Date(dto.dueDate) : null) : existing.dueDate;

    if (newStatus === TaskStatus.COMPLETE && existing.status !== TaskStatus.COMPLETE) {
      lastCompletedAt = new Date();
      if (effectiveCadence !== ObligationCadence.ONE_OFF && baseDueDate) {
        nextDueDate = this.calculateNextDueDate(baseDueDate, effectiveCadence);
      }
    }

    const updated = await this.prisma.complianceTask.update({
      where: { id },
      data: {
        ...(dto.title !== undefined && { title: dto.title }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.status !== undefined && { status: dto.status }),
        ...(dto.owner !== undefined && { owner: dto.owner }),
        ...(dto.dueDate !== undefined && { dueDate: dto.dueDate ? new Date(dto.dueDate) : null }),
        ...(dto.controlId !== undefined && { controlId: dto.controlId || null }),
        ...(dto.cadence !== undefined && { cadence: dto.cadence }),
        ...(dto.category !== undefined && { category: dto.category }),
        ...(dto.obligationReference !== undefined && { obligationReference: dto.obligationReference }),
        ...(dto.departmentId !== undefined && { departmentId: dto.departmentId }),
        ...(dto.projectId !== undefined && { projectId: dto.projectId }),
        lastCompletedAt,
        nextDueDate,
      },
      include: { control: { select: { name: true } } },
    });

    if (changedFields.length > 0) {
      const isStatusChangeOnly = changedFields.length === 1 && changedFields[0] === 'status';
      await this.auditLogsService.log({
        organizationId: authCtx.organizationId,
        actorId: authCtx.userId,
        action: isStatusChangeOnly ? 'COMPLIANCE_TASK_STATUS_CHANGED' : 'COMPLIANCE_TASK_UPDATED',
        entityType: 'ComplianceTask',
        entityId: updated.id,
        metadata: {
          title: updated.title,
          status: updated.status,
          changedFields,
        },
      });
    }

    return this.mapToDto(updated);
  }

  async updateStatus(authCtx: ResourceAuthContext, id: string, status: TaskStatus): Promise<ComplianceTaskDto> {
    const scopeWhere = await this.resourceAuthService.getScopeWhereClause(authCtx);
    const existing = await this.prisma.complianceTask.findFirst({
      where: { id, ...scopeWhere, deletedAt: null },
    });

    if (!existing) {
      throw new NotFoundException(`Compliance task with ID "${id}" not found`);
    }

    if (existing.status === status) {
      return this.mapToDto(existing);
    }

    const updated = await this.prisma.complianceTask.update({
      where: { id },
      data: { status },
      include: { control: { select: { name: true } } },
    });

    await this.auditLogsService.log({
      organizationId: authCtx.organizationId,
      actorId: authCtx.userId,
      action: 'COMPLIANCE_TASK_STATUS_CHANGED',
      entityType: 'ComplianceTask',
      entityId: updated.id,
      metadata: {
        title: updated.title,
        previousStatus: existing.status,
        newStatus: updated.status,
      },
    });

    return this.mapToDto(updated);
  }

  async softDelete(authCtx: ResourceAuthContext, id: string): Promise<{ success: boolean }> {
    const scopeWhere = await this.resourceAuthService.getScopeWhereClause(authCtx);
    const existing = await this.prisma.complianceTask.findFirst({
      where: { id, ...scopeWhere, deletedAt: null },
    });

    if (!existing) {
      throw new NotFoundException(`Compliance task with ID "${id}" not found`);
    }

    await this.prisma.complianceTask.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    await this.auditLogsService.log({
      organizationId: authCtx.organizationId,
      actorId: authCtx.userId,
      action: 'COMPLIANCE_TASK_DELETED',
      entityType: 'ComplianceTask',
      entityId: existing.id,
      metadata: {
        title: existing.title,
      },
    });

    return { success: true };
  }

  async getAuditLogs(authCtx: ResourceAuthContext, taskId: string) {
    const scopeWhere = await this.resourceAuthService.getScopeWhereClause(authCtx);
    const task = await this.prisma.complianceTask.findFirst({
      where: { id: taskId, ...scopeWhere },
    });

    if (!task) {
      throw new NotFoundException(`Compliance task with ID "${taskId}" not found`);
    }

    return this.prisma.auditLogEntry.findMany({
      where: {
        organizationId: authCtx.organizationId,
        entityType: 'ComplianceTask',
        entityId: taskId,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  private calculateNextDueDate(baseDate: Date, cadence: string): Date {
    const next = new Date(baseDate);
    if (cadence === ObligationCadence.MONTHLY) {
      next.setMonth(next.getMonth() + 1);
    } else if (cadence === ObligationCadence.QUARTERLY) {
      next.setMonth(next.getMonth() + 3);
    } else if (cadence === ObligationCadence.ANNUAL) {
      next.setFullYear(next.getFullYear() + 1);
    }
    return next;
  }

  private mapToDto(task: any): ComplianceTaskDto {
    return {
      id: task.id,
      organizationId: task.organizationId,
      departmentId: task.departmentId || null,
      projectId: task.projectId || null,
      title: task.title,
      description: task.description,
      status: task.status as TaskStatus,
      owner: task.owner,
      dueDate: task.dueDate ? task.dueDate.toISOString() : null,
      controlId: task.controlId,
      controlName: task.control?.name || null,
      cadence: task.cadence || ObligationCadence.ONE_OFF,
      category: task.category || null,
      obligationReference: task.obligationReference || null,
      lastCompletedAt: task.lastCompletedAt ? task.lastCompletedAt.toISOString() : null,
      nextDueDate: task.nextDueDate ? task.nextDueDate.toISOString() : null,
      createdAt: task.createdAt.toISOString(),
      updatedAt: task.updatedAt.toISOString(),
      createdById: task.createdById,
      deletedAt: task.deletedAt ? task.deletedAt.toISOString() : null,
    } as any;
  }
}
