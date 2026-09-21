import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { CreateProjectDto, UpdateProjectDto, ProjectDto } from '@omnigrc/shared';

@Injectable()
export class ProjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogs: AuditLogsService,
  ) {}

  async findAll(organizationId: string, departmentId?: string): Promise<ProjectDto[]> {
    const where: any = { organizationId };
    if (departmentId) {
      where.departmentId = departmentId;
    }

    const projects = await this.prisma.project.findMany({
      where,
      include: {
        department: { select: { name: true } },
        _count: { select: { memberships: true } },
      },
      orderBy: { name: 'asc' },
    });

    return projects.map((p) => ({
      id: p.id,
      organizationId: p.organizationId,
      departmentId: p.departmentId,
      departmentName: p.department.name,
      name: p.name,
      code: p.code,
      description: p.description,
      status: p.status as any,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
      assignedUsersCount: p._count.memberships,
    }));
  }

  async findOne(organizationId: string, id: string): Promise<ProjectDto> {
    const p = await this.prisma.project.findFirst({
      where: { id, organizationId },
      include: {
        department: { select: { name: true } },
        _count: { select: { memberships: true } },
      },
    });

    if (!p) {
      throw new NotFoundException(`Project with ID "${id}" not found.`);
    }

    return {
      id: p.id,
      organizationId: p.organizationId,
      departmentId: p.departmentId,
      departmentName: p.department.name,
      name: p.name,
      code: p.code,
      description: p.description,
      status: p.status as any,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
      assignedUsersCount: p._count.memberships,
    };
  }

  async create(organizationId: string, actorUserId: string, dto: CreateProjectDto): Promise<ProjectDto> {
    if (!dto.departmentId || !dto.name || !dto.name.trim()) {
      throw new BadRequestException('departmentId and Project name are required');
    }

    // Cross-tenant invariant check: Department must belong to same organization
    const dept = await this.prisma.department.findFirst({
      where: { id: dto.departmentId, organizationId },
    });

    if (!dept) {
      throw new ForbiddenException('Target department does not belong to your organization tenant.');
    }

    const existing = await this.prisma.project.findUnique({
      where: {
        departmentId_name: {
          departmentId: dto.departmentId,
          name: dto.name.trim(),
        },
      },
    });

    if (existing) {
      throw new BadRequestException(`Project with name "${dto.name}" already exists in department.`);
    }

    const proj = await this.prisma.project.create({
      data: {
        organizationId,
        departmentId: dto.departmentId,
        name: dto.name.trim(),
        code: dto.code ? dto.code.trim().toUpperCase() : null,
        description: dto.description || null,
        status: dto.status || 'ACTIVE',
      },
      include: {
        department: { select: { name: true } },
      },
    });

    await this.auditLogs.log({
      action: 'PROJECT_CREATED',
      organizationId,
      actorId: actorUserId,
      entityType: 'Project',
      entityId: proj.id,
      metadata: { name: proj.name, departmentId: proj.departmentId },
    });

    return {
      id: proj.id,
      organizationId: proj.organizationId,
      departmentId: proj.departmentId,
      departmentName: proj.department.name,
      name: proj.name,
      code: proj.code,
      description: proj.description,
      status: proj.status as any,
      createdAt: proj.createdAt.toISOString(),
      updatedAt: proj.updatedAt.toISOString(),
      assignedUsersCount: 0,
    };
  }

  async update(organizationId: string, actorUserId: string, id: string, dto: UpdateProjectDto): Promise<ProjectDto> {
    const proj = await this.prisma.project.findFirst({ where: { id, organizationId } });
    if (!proj) {
      throw new NotFoundException(`Project with ID "${id}" not found.`);
    }

    const updated = await this.prisma.project.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name.trim() }),
        ...(dto.code !== undefined && { code: dto.code ? dto.code.trim().toUpperCase() : null }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.status !== undefined && { status: dto.status }),
      },
      include: {
        department: { select: { name: true } },
        _count: { select: { memberships: true } },
      },
    });

    await this.auditLogs.log({
      action: 'PROJECT_UPDATED',
      organizationId,
      actorId: actorUserId,
      entityType: 'Project',
      entityId: updated.id,
      metadata: { previous: { name: proj.name }, new: { name: updated.name } },
    });

    return {
      id: updated.id,
      organizationId: updated.organizationId,
      departmentId: updated.departmentId,
      departmentName: updated.department.name,
      name: updated.name,
      code: updated.code,
      description: updated.description,
      status: updated.status as any,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
      assignedUsersCount: updated._count.memberships,
    };
  }

  async remove(organizationId: string, actorUserId: string, id: string): Promise<void> {
    const proj = await this.prisma.project.findFirst({ where: { id, organizationId } });
    if (!proj) {
      throw new NotFoundException(`Project with ID "${id}" not found.`);
    }

    await this.prisma.project.delete({ where: { id } });

    await this.auditLogs.log({
      action: 'PROJECT_DELETED',
      organizationId,
      actorId: actorUserId,
      entityType: 'Project',
      entityId: id,
      metadata: { name: proj.name },
    });
  }
}
