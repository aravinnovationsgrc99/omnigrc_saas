import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { CreateDepartmentDto, UpdateDepartmentDto, DepartmentDto } from '@omnigrc/shared';

@Injectable()
export class DepartmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogs: AuditLogsService,
  ) {}

  async findAll(organizationId: string): Promise<DepartmentDto[]> {
    const depts = await this.prisma.department.findMany({
      where: { organizationId },
      include: {
        _count: {
          select: { projects: true, memberships: true },
        },
      },
      orderBy: { name: 'asc' },
    });

    return depts.map((d) => ({
      id: d.id,
      organizationId: d.organizationId,
      name: d.name,
      code: d.code,
      description: d.description,
      createdAt: d.createdAt.toISOString(),
      updatedAt: d.updatedAt.toISOString(),
      projectsCount: d._count.projects,
      membersCount: d._count.memberships,
    }));
  }

  async findOne(organizationId: string, id: string): Promise<DepartmentDto> {
    const d = await this.prisma.department.findFirst({
      where: { id, organizationId },
      include: {
        _count: { select: { projects: true, memberships: true } },
      },
    });

    if (!d) {
      throw new NotFoundException(`Department with ID "${id}" not found.`);
    }

    return {
      id: d.id,
      organizationId: d.organizationId,
      name: d.name,
      code: d.code,
      description: d.description,
      createdAt: d.createdAt.toISOString(),
      updatedAt: d.updatedAt.toISOString(),
      projectsCount: d._count.projects,
      membersCount: d._count.memberships,
    };
  }

  async create(organizationId: string, actorUserId: string, dto: CreateDepartmentDto): Promise<DepartmentDto> {
    if (!dto.name || !dto.name.trim()) {
      throw new BadRequestException('Department name is required');
    }

    const existing = await this.prisma.department.findUnique({
      where: {
        organizationId_name: {
          organizationId,
          name: dto.name.trim(),
        },
      },
    });

    if (existing) {
      throw new BadRequestException(`Department with name "${dto.name}" already exists in organization.`);
    }

    const dept = await this.prisma.department.create({
      data: {
        organizationId,
        name: dto.name.trim(),
        code: dto.code ? dto.code.trim().toUpperCase() : null,
        description: dto.description || null,
      },
    });

    await this.auditLogs.log({
      action: 'DEPARTMENT_CREATED',
      organizationId,
      actorId: actorUserId,
      entityType: 'Department',
      entityId: dept.id,
      metadata: { name: dept.name, code: dept.code },
    });

    return {
      id: dept.id,
      organizationId: dept.organizationId,
      name: dept.name,
      code: dept.code,
      description: dept.description,
      createdAt: dept.createdAt.toISOString(),
      updatedAt: dept.updatedAt.toISOString(),
      projectsCount: 0,
      membersCount: 0,
    };
  }

  async update(organizationId: string, actorUserId: string, id: string, dto: UpdateDepartmentDto): Promise<DepartmentDto> {
    const dept = await this.prisma.department.findFirst({ where: { id, organizationId } });
    if (!dept) {
      throw new NotFoundException(`Department with ID "${id}" not found.`);
    }

    const updated = await this.prisma.department.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name.trim() }),
        ...(dto.code !== undefined && { code: dto.code ? dto.code.trim().toUpperCase() : null }),
        ...(dto.description !== undefined && { description: dto.description }),
      },
      include: {
        _count: { select: { projects: true, memberships: true } },
      },
    });

    await this.auditLogs.log({
      action: 'DEPARTMENT_UPDATED',
      organizationId,
      actorId: actorUserId,
      entityType: 'Department',
      entityId: updated.id,
      metadata: { previous: { name: dept.name }, new: { name: updated.name } },
    });

    return {
      id: updated.id,
      organizationId: updated.organizationId,
      name: updated.name,
      code: updated.code,
      description: updated.description,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
      projectsCount: updated._count.projects,
      membersCount: updated._count.memberships,
    };
  }

  async remove(organizationId: string, actorUserId: string, id: string): Promise<void> {
    const dept = await this.prisma.department.findFirst({ where: { id, organizationId } });
    if (!dept) {
      throw new NotFoundException(`Department with ID "${id}" not found.`);
    }

    await this.prisma.department.delete({ where: { id } });

    await this.auditLogs.log({
      action: 'DEPARTMENT_DELETED',
      organizationId,
      actorId: actorUserId,
      entityType: 'Department',
      entityId: id,
      metadata: { name: dept.name },
    });
  }
}
