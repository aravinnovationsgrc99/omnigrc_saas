import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { ResourceAuthorizationService, ResourceAuthContext } from '../auth/resource-authorization.service';
import {
  IncidentDto,
  CreateIncidentDto,
  UpdateIncidentDto,
  IncidentQueryDto,
  PaginatedIncidentsDto,
  IncidentSeverity,
  IncidentStatus,
} from '@omnigrc/shared';

@Injectable()
export class IncidentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogsService: AuditLogsService,
    private readonly resourceAuthService: ResourceAuthorizationService,
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

    if (query.search?.trim()) {
      const search = query.search.trim();
      const searchConditions = [
        { title: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
        { rootCause: { contains: search, mode: 'insensitive' } },
        { owner: { contains: search, mode: 'insensitive' } },
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
      },
    });

    if (!incident) {
      throw new NotFoundException(`Incident with ID ${id} not found.`);
    }

    return this.mapToDto(incident);
  }

  async create(
    authCtx: ResourceAuthContext,
    dto: CreateIncidentDto & { departmentId?: string; projectId?: string },
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

    const incident = await this.prisma.incident.create({
      data: {
        organizationId: authCtx.organizationId,
        departmentId: dto.departmentId || null,
        projectId: dto.projectId || null,
        createdById: authCtx.userId,
        title: dto.title,
        description: dto.description || null,
        severity: (dto.severity || IncidentSeverity.MEDIUM) as any,
        status: (dto.status || IncidentStatus.OPEN) as any,
        owner: dto.owner || 'Unassigned',
        detectedAt: dto.detectedAt ? new Date(dto.detectedAt) : new Date(),
        containedAt: dto.containedAt ? new Date(dto.containedAt) : null,
        resolvedAt: dto.resolvedAt ? new Date(dto.resolvedAt) : null,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
        rootCause: dto.rootCause || null,
        affectedAssetId: dto.affectedAssetId || null,
      },
      include: {
        affectedAsset: { select: { id: true, name: true } },
      },
    });

    await this.auditLogsService.log({
      organizationId: authCtx.organizationId,
      actorId: authCtx.userId,
      action: 'INCIDENT_CREATED',
      entityType: 'Incident',
      entityId: incident.id,
      metadata: { title: incident.title, severity: incident.severity },
    });

    return this.mapToDto(incident);
  }

  async update(
    authCtx: ResourceAuthContext,
    id: string,
    dto: UpdateIncidentDto & { departmentId?: string; projectId?: string },
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

    const data: any = {};
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.severity !== undefined) data.severity = dto.severity;
    if (dto.status !== undefined) data.status = dto.status;
    if (dto.owner !== undefined) data.owner = dto.owner;
    if (dto.detectedAt !== undefined) data.detectedAt = new Date(dto.detectedAt);
    if (dto.containedAt !== undefined)
      data.containedAt = dto.containedAt ? new Date(dto.containedAt) : null;
    if (dto.resolvedAt !== undefined)
      data.resolvedAt = dto.resolvedAt ? new Date(dto.resolvedAt) : null;
    if (dto.dueDate !== undefined) data.dueDate = dto.dueDate ? new Date(dto.dueDate) : null;
    if (dto.rootCause !== undefined) data.rootCause = dto.rootCause;
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
      },
    });

    await this.auditLogsService.log({
      organizationId: authCtx.organizationId,
      actorId: authCtx.userId,
      action: 'INCIDENT_UPDATED',
      entityType: 'Incident',
      entityId: updated.id,
      metadata: { status: updated.status, severity: updated.severity },
    });

    return this.mapToDto(updated);
  }

  private mapToDto(inc: any): IncidentDto {
    return {
      id: inc.id,
      organizationId: inc.organizationId,
      departmentId: inc.departmentId || null,
      projectId: inc.projectId || null,
      title: inc.title,
      description: inc.description,
      severity: inc.severity as IncidentSeverity,
      status: inc.status as IncidentStatus,
      owner: inc.owner,
      detectedAt: inc.detectedAt.toISOString(),
      containedAt: inc.containedAt ? inc.containedAt.toISOString() : null,
      resolvedAt: inc.resolvedAt ? inc.resolvedAt.toISOString() : null,
      dueDate: inc.dueDate ? inc.dueDate.toISOString() : null,
      rootCause: inc.rootCause,
      affectedAssetId: inc.affectedAssetId,
      affectedAssetName: inc.affectedAsset?.name || null,
      createdById: inc.createdById,
      createdAt: inc.createdAt.toISOString(),
      updatedAt: inc.updatedAt.toISOString(),
    } as any;
  }
}
