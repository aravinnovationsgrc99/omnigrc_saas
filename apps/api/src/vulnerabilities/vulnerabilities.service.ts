import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { CreateVulnerabilityDto, UpdateVulnerabilityDto, VulnerabilityQueryDto } from './dto/vulnerabilities.dto';
import { VulnerabilityDto, PaginatedVulnerabilitiesDto, VulnerabilitySeverity, VulnerabilityStatus } from '@omnigrc/shared';

@Injectable()
export class VulnerabilitiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  async findAll(organizationId: string, query: VulnerabilityQueryDto): Promise<PaginatedVulnerabilitiesDto> {
    const page = query.page || 1;
    const limit = query.limit || 20;
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

    if (query.assetId) {
      where.affectedAssets = {
        some: { assetId: query.assetId },
      };
    }

    if (query.search && query.search.trim()) {
      const searchTerm = query.search.trim();
      where.OR = [
        { title: { contains: searchTerm, mode: 'insensitive' } },
        { cveId: { contains: searchTerm, mode: 'insensitive' } },
        { remediationOwner: { contains: searchTerm, mode: 'insensitive' } },
        { description: { contains: searchTerm, mode: 'insensitive' } },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.vulnerability.findMany({
        where,
        skip,
        take: limit,
        orderBy: { updatedAt: 'desc' },
        include: {
          affectedAssets: {
            include: { asset: { select: { id: true, name: true } } },
          },
        },
      }),
      this.prisma.vulnerability.count({ where }),
    ]);

    return {
      items: items.map(this.mapToDto),
      total,
      page,
      limit,
    };
  }

  async findOne(organizationId: string, id: string): Promise<VulnerabilityDto> {
    const vuln = await this.prisma.vulnerability.findFirst({
      where: {
        id,
        organizationId,
        deletedAt: null,
      },
      include: {
        affectedAssets: {
          include: { asset: { select: { id: true, name: true } } },
        },
      },
    });

    if (!vuln) {
      throw new NotFoundException(`Vulnerability with ID "${id}" not found`);
    }

    return this.mapToDto(vuln);
  }

  async create(organizationId: string, userId: string, dto: CreateVulnerabilityDto): Promise<VulnerabilityDto> {
    const vuln = await this.prisma.vulnerability.create({
      data: {
        organizationId,
        cveId: dto.cveId || null,
        title: dto.title,
        description: dto.description || null,
        severity: dto.severity,
        status: dto.status || VulnerabilityStatus.OPEN,
        remediationOwner: dto.remediationOwner,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
        remediationNotes: dto.remediationNotes || null,
        createdById: userId,
        affectedAssets: {
          create: dto.assetIds.map((assetId) => ({
            organizationId,
            assetId,
          })),
        },
      },
      include: {
        affectedAssets: {
          include: { asset: { select: { id: true, name: true } } },
        },
      },
    });

    await this.auditLogsService.log({
      organizationId,
      actorId: userId,
      action: 'VULNERABILITY_CREATED',
      entityType: 'Vulnerability',
      entityId: vuln.id,
      metadata: {
        title: vuln.title,
        cveId: vuln.cveId,
        severity: vuln.severity,
        assetCount: dto.assetIds.length,
      },
    });

    return this.mapToDto(vuln);
  }

  async update(organizationId: string, userId: string, id: string, dto: UpdateVulnerabilityDto): Promise<VulnerabilityDto> {
    const existing = await this.prisma.vulnerability.findFirst({
      where: { id, organizationId, deletedAt: null },
    });

    if (!existing) {
      throw new NotFoundException(`Vulnerability with ID "${id}" not found`);
    }

    // Update asset relations if assetIds supplied
    if (dto.assetIds !== undefined) {
      await this.prisma.vulnerabilityAsset.deleteMany({
        where: { vulnerabilityId: id },
      });
      await this.prisma.vulnerabilityAsset.createMany({
        data: dto.assetIds.map((assetId) => ({
          organizationId,
          vulnerabilityId: id,
          assetId,
        })),
      });
    }

    const updated = await this.prisma.vulnerability.update({
      where: { id },
      data: {
        ...(dto.cveId !== undefined && { cveId: dto.cveId }),
        ...(dto.title !== undefined && { title: dto.title }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.severity !== undefined && { severity: dto.severity }),
        ...(dto.status !== undefined && { status: dto.status }),
        ...(dto.remediationOwner !== undefined && { remediationOwner: dto.remediationOwner }),
        ...(dto.dueDate !== undefined && { dueDate: dto.dueDate ? new Date(dto.dueDate) : null }),
        ...(dto.remediationNotes !== undefined && { remediationNotes: dto.remediationNotes }),
        lastSeenAt: new Date(),
      },
      include: {
        affectedAssets: {
          include: { asset: { select: { id: true, name: true } } },
        },
      },
    });

    await this.auditLogsService.log({
      organizationId,
      actorId: userId,
      action: 'VULNERABILITY_UPDATED',
      entityType: 'Vulnerability',
      entityId: updated.id,
      metadata: {
        title: updated.title,
        status: updated.status,
      },
    });

    return this.mapToDto(updated);
  }

  async softDelete(organizationId: string, userId: string, id: string): Promise<{ success: boolean }> {
    const existing = await this.prisma.vulnerability.findFirst({
      where: { id, organizationId, deletedAt: null },
    });

    if (!existing) {
      throw new NotFoundException(`Vulnerability with ID "${id}" not found`);
    }

    await this.prisma.vulnerability.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    await this.auditLogsService.log({
      organizationId,
      actorId: userId,
      action: 'VULNERABILITY_DELETED',
      entityType: 'Vulnerability',
      entityId: existing.id,
      metadata: {
        title: existing.title,
      },
    });

    return { success: true };
  }

  private mapToDto(vuln: any): VulnerabilityDto {
    return {
      id: vuln.id,
      organizationId: vuln.organizationId,
      cveId: vuln.cveId,
      title: vuln.title,
      description: vuln.description,
      severity: vuln.severity as VulnerabilitySeverity,
      status: vuln.status as VulnerabilityStatus,
      discoveredAt: vuln.discoveredAt.toISOString(),
      lastSeenAt: vuln.lastSeenAt.toISOString(),
      remediationOwner: vuln.remediationOwner,
      dueDate: vuln.dueDate ? vuln.dueDate.toISOString() : null,
      remediationNotes: vuln.remediationNotes,
      createdById: vuln.createdById,
      createdAt: vuln.createdAt.toISOString(),
      updatedAt: vuln.updatedAt.toISOString(),
      affectedAssets: vuln.affectedAssets ? vuln.affectedAssets.map((va: any) => ({
        id: va.id,
        assetId: va.assetId,
        assetName: va.asset?.name || '',
      })) : [],
    };
  }
}
