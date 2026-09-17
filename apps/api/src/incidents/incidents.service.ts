import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
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
  ) {}

  async findAll(
    organizationId: string,
    query: IncidentQueryDto,
  ): Promise<PaginatedIncidentsDto> {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const skip = (page - 1) * limit;

    const where: any = {
      organizationId,
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
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
        { rootCause: { contains: search, mode: 'insensitive' } },
        { owner: { contains: search, mode: 'insensitive' } },
      ];
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

  async findOne(organizationId: string, id: string): Promise<IncidentDto> {
    const incident = await this.prisma.incident.findFirst({
      where: { id, organizationId, deletedAt: null },
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
    organizationId: string,
    createdById: string,
    dto: CreateIncidentDto,
  ): Promise<IncidentDto> {
    if (dto.affectedAssetId) {
      const asset = await this.prisma.asset.findFirst({
        where: { id: dto.affectedAssetId, organizationId, deletedAt: null },
      });
      if (!asset) {
        throw new NotFoundException(`Affected asset ${dto.affectedAssetId} not found in tenant organization.`);
      }
    }

    const incident = await this.prisma.incident.create({
      data: {
        organizationId,
        createdById,
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
      organizationId,
      actorId: createdById,
      action: 'INCIDENT_CREATED',
      entityType: 'Incident',
      entityId: incident.id,
      metadata: { title: incident.title, severity: incident.severity },
    });

    return this.mapToDto(incident);
  }

  async update(
    organizationId: string,
    userId: string,
    id: string,
    dto: UpdateIncidentDto,
  ): Promise<IncidentDto> {
    const existing = await this.prisma.incident.findFirst({
      where: { id, organizationId, deletedAt: null },
    });

    if (!existing) {
      throw new NotFoundException(`Incident with ID ${id} not found.`);
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
    if (dto.affectedAssetId) {
      const asset = await this.prisma.asset.findFirst({
        where: { id: dto.affectedAssetId, organizationId, deletedAt: null },
      });
      if (!asset) {
        throw new NotFoundException(`Affected asset ${dto.affectedAssetId} not found in tenant organization.`);
      }
      data.affectedAssetId = dto.affectedAssetId;
    } else if (dto.affectedAssetId === null) {
      data.affectedAssetId = null;
    }

    // Automatically stamp containedAt/resolvedAt on status transition if not explicitly provided
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
      organizationId,
      actorId: userId,
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
    };
  }
}
