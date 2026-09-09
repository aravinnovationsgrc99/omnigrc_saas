import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateComplianceTaskDto, UpdateComplianceTaskDto, ComplianceTaskQueryDto } from './dto/compliance-tasks.dto';
import { ComplianceTaskDto, PaginatedComplianceTasksDto, TaskStatus, ComplianceTaskSummaryDto, NotificationType } from '@omnigrc/shared';

@Injectable()
export class ComplianceTasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogsService: AuditLogsService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async findAll(organizationId: string, query: ComplianceTaskQueryDto): Promise<PaginatedComplianceTasksDto> {
    const page = query.page || 1;
    const limit = query.limit || 100; // default large limit for Kanban board view
    const skip = (page - 1) * limit;

    const where: any = {
      organizationId,
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
      where.OR = [
        { title: { contains: searchTerm, mode: 'insensitive' } },
        { owner: { contains: searchTerm, mode: 'insensitive' } },
        { description: { contains: searchTerm, mode: 'insensitive' } },
      ];
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

  async getDashboardSummary(organizationId: string): Promise<ComplianceTaskSummaryDto> {
    const now = new Date();
    const d30 = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const d60 = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);
    const d90 = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);

    const openTasks = await this.prisma.complianceTask.findMany({
      where: {
        organizationId,
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

  async getDueThisWeekCount(organizationId: string): Promise<{ count: number }> {
    const now = new Date();
    const next7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const count = await this.prisma.complianceTask.count({
      where: {
        organizationId,
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

  async findOne(organizationId: string, id: string): Promise<ComplianceTaskDto> {
    const task = await this.prisma.complianceTask.findFirst({
      where: { id, organizationId, deletedAt: null },
      include: { control: { select: { name: true } } },
    });

    if (!task) {
      throw new NotFoundException(`Compliance task with ID "${id}" not found`);
    }

    return this.mapToDto(task);
  }

  async create(organizationId: string, userId: string, dto: CreateComplianceTaskDto): Promise<ComplianceTaskDto> {
    const task = await this.prisma.complianceTask.create({
      data: {
        organizationId,
        title: dto.title,
        description: dto.description || null,
        status: dto.status || TaskStatus.NOT_STARTED,
        owner: dto.owner,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
        controlId: dto.controlId || null,
        createdById: userId,
      },
      include: { control: { select: { name: true } } },
    });

    await this.auditLogsService.log({
      organizationId,
      actorId: userId,
      action: 'COMPLIANCE_TASK_CREATED',
      entityType: 'ComplianceTask',
      entityId: task.id,
      metadata: {
        title: task.title,
        status: task.status,
        owner: task.owner,
        dueDate: task.dueDate ? task.dueDate.toISOString() : null,
      },
    });

    await this.notificationsService.notify({
      organizationId,
      userId,
      type: NotificationType.TASK_ASSIGNED,
      message: `New compliance task assigned: "${task.title}" (Owner: ${task.owner}).`,
      entityType: 'COMPLIANCE_TASK',
      entityId: task.id,
    });

    return this.mapToDto(task);
  }

  async update(organizationId: string, userId: string, id: string, dto: UpdateComplianceTaskDto): Promise<ComplianceTaskDto> {
    const existing = await this.prisma.complianceTask.findFirst({
      where: { id, organizationId, deletedAt: null },
    });

    if (!existing) {
      throw new NotFoundException(`Compliance task with ID "${id}" not found`);
    }

    const changedFields: string[] = [];
    if (dto.title !== undefined && dto.title !== existing.title) changedFields.push('title');
    if (dto.description !== undefined && dto.description !== existing.description) changedFields.push('description');
    if (dto.status !== undefined && dto.status !== existing.status) changedFields.push('status');
    if (dto.owner !== undefined && dto.owner !== existing.owner) changedFields.push('owner');
    if (dto.dueDate !== undefined && dto.dueDate !== (existing.dueDate ? existing.dueDate.toISOString() : null)) changedFields.push('dueDate');
    if (dto.controlId !== undefined && dto.controlId !== existing.controlId) changedFields.push('controlId');

    const updated = await this.prisma.complianceTask.update({
      where: { id },
      data: {
        ...(dto.title !== undefined && { title: dto.title }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.status !== undefined && { status: dto.status }),
        ...(dto.owner !== undefined && { owner: dto.owner }),
        ...(dto.dueDate !== undefined && { dueDate: dto.dueDate ? new Date(dto.dueDate) : null }),
        ...(dto.controlId !== undefined && { controlId: dto.controlId || null }),
      },
      include: { control: { select: { name: true } } },
    });

    if (changedFields.length > 0) {
      const isStatusChangeOnly = changedFields.length === 1 && changedFields[0] === 'status';
      await this.auditLogsService.log({
        organizationId,
        actorId: userId,
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

  /**
   * Dedicated status change endpoint for Kanban drag-and-drop
   */
  async updateStatus(organizationId: string, userId: string, id: string, status: TaskStatus): Promise<ComplianceTaskDto> {
    const existing = await this.prisma.complianceTask.findFirst({
      where: { id, organizationId, deletedAt: null },
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
      organizationId,
      actorId: userId,
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

  async softDelete(organizationId: string, userId: string, id: string): Promise<{ success: boolean }> {
    const existing = await this.prisma.complianceTask.findFirst({
      where: { id, organizationId, deletedAt: null },
    });

    if (!existing) {
      throw new NotFoundException(`Compliance task with ID "${id}" not found`);
    }

    await this.prisma.complianceTask.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    await this.auditLogsService.log({
      organizationId,
      actorId: userId,
      action: 'COMPLIANCE_TASK_DELETED',
      entityType: 'ComplianceTask',
      entityId: existing.id,
      metadata: {
        title: existing.title,
      },
    });

    return { success: true };
  }

  async getAuditLogs(organizationId: string, taskId: string) {
    const task = await this.prisma.complianceTask.findFirst({
      where: { id: taskId, organizationId },
    });

    if (!task) {
      throw new NotFoundException(`Compliance task with ID "${taskId}" not found`);
    }

    return this.prisma.auditLogEntry.findMany({
      where: {
        organizationId,
        entityType: 'ComplianceTask',
        entityId: taskId,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  private mapToDto(task: any): ComplianceTaskDto {
    return {
      id: task.id,
      organizationId: task.organizationId,
      title: task.title,
      description: task.description,
      status: task.status as TaskStatus,
      owner: task.owner,
      dueDate: task.dueDate ? task.dueDate.toISOString() : null,
      controlId: task.controlId,
      controlName: task.control?.name || null,
      createdAt: task.createdAt.toISOString(),
      updatedAt: task.updatedAt.toISOString(),
      createdById: task.createdById,
      deletedAt: task.deletedAt ? task.deletedAt.toISOString() : null,
    };
  }
}
