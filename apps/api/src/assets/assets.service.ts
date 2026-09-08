import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { CreateAssetDto, UpdateAssetDto, AssetQueryDto } from './dto/assets.dto';
import { AssetDto, PaginatedAssetsDto, AssetType, AssetCriticality } from '@omnigrc/shared';

@Injectable()
export class AssetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  async findAll(organizationId: string, query: AssetQueryDto): Promise<PaginatedAssetsDto> {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const skip = (page - 1) * limit;

    const where: any = {
      organizationId,
      deletedAt: null,
    };

    if (query.type) {
      where.type = query.type;
    }

    if (query.criticality) {
      where.criticality = query.criticality;
    }

    if (query.search && query.search.trim()) {
      const searchTerm = query.search.trim();
      where.OR = [
        { name: { contains: searchTerm, mode: 'insensitive' } },
        { owner: { contains: searchTerm, mode: 'insensitive' } },
        { vendorName: { contains: searchTerm, mode: 'insensitive' } },
        { description: { contains: searchTerm, mode: 'insensitive' } },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.asset.findMany({
        where,
        skip,
        take: limit,
        orderBy: { updatedAt: 'desc' },
      }),
      this.prisma.asset.count({ where }),
    ]);

    return {
      items: items.map(this.mapToDto),
      total,
      page,
      limit,
    };
  }

  async count(organizationId: string): Promise<{ count: number }> {
    const count = await this.prisma.asset.count({
      where: {
        organizationId,
        deletedAt: null,
      },
    });
    return { count };
  }

  async findOne(organizationId: string, id: string): Promise<AssetDto> {
    const asset = await this.prisma.asset.findFirst({
      where: {
        id,
        organizationId,
        deletedAt: null,
      },
    });

    if (!asset) {
      throw new NotFoundException(`Asset with ID "${id}" not found`);
    }

    return this.mapToDto(asset);
  }

  async getAuditLogs(organizationId: string, assetId: string) {
    // Verify asset exists or was deleted within tenant
    const asset = await this.prisma.asset.findFirst({
      where: { id: assetId, organizationId },
    });

    if (!asset) {
      throw new NotFoundException(`Asset with ID "${assetId}" not found`);
    }

    return this.prisma.auditLogEntry.findMany({
      where: {
        organizationId,
        entityType: 'Asset',
        entityId: assetId,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(organizationId: string, userId: string, dto: CreateAssetDto): Promise<AssetDto> {
    const asset = await this.prisma.asset.create({
      data: {
        organizationId,
        name: dto.name,
        type: dto.type,
        description: dto.description || null,
        owner: dto.owner,
        criticality: dto.criticality,
        vendorName: dto.vendorName || null,
        dataResidencyRegion: dto.dataResidencyRegion || null,
        createdById: userId,
      },
    });

    await this.auditLogsService.log({
      organizationId,
      actorId: userId,
      action: 'ASSET_CREATED',
      entityType: 'Asset',
      entityId: asset.id,
      metadata: {
        name: asset.name,
        type: asset.type,
        criticality: asset.criticality,
        owner: asset.owner,
      },
    });

    return this.mapToDto(asset);
  }

  async update(organizationId: string, userId: string, id: string, dto: UpdateAssetDto): Promise<AssetDto> {
    const existing = await this.prisma.asset.findFirst({
      where: { id, organizationId, deletedAt: null },
    });

    if (!existing) {
      throw new NotFoundException(`Asset with ID "${id}" not found`);
    }

    // Determine changed field names for non-sensitive audit metadata
    const changedFields: string[] = [];
    if (dto.name !== undefined && dto.name !== existing.name) changedFields.push('name');
    if (dto.type !== undefined && dto.type !== existing.type) changedFields.push('type');
    if (dto.description !== undefined && dto.description !== existing.description) changedFields.push('description');
    if (dto.owner !== undefined && dto.owner !== existing.owner) changedFields.push('owner');
    if (dto.criticality !== undefined && dto.criticality !== existing.criticality) changedFields.push('criticality');
    if (dto.vendorName !== undefined && dto.vendorName !== existing.vendorName) changedFields.push('vendorName');
    if (dto.dataResidencyRegion !== undefined && dto.dataResidencyRegion !== existing.dataResidencyRegion) changedFields.push('dataResidencyRegion');

    const updated = await this.prisma.asset.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.type !== undefined && { type: dto.type }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.owner !== undefined && { owner: dto.owner }),
        ...(dto.criticality !== undefined && { criticality: dto.criticality }),
        ...(dto.vendorName !== undefined && { vendorName: dto.vendorName }),
        ...(dto.dataResidencyRegion !== undefined && { dataResidencyRegion: dto.dataResidencyRegion }),
      },
    });

    if (changedFields.length > 0) {
      await this.auditLogsService.log({
        organizationId,
        actorId: userId,
        action: 'ASSET_UPDATED',
        entityType: 'Asset',
        entityId: updated.id,
        metadata: {
          name: updated.name,
          changedFields,
        },
      });
    }

    return this.mapToDto(updated);
  }

  async softDelete(organizationId: string, userId: string, id: string): Promise<{ success: boolean }> {
    const existing = await this.prisma.asset.findFirst({
      where: { id, organizationId, deletedAt: null },
    });

    if (!existing) {
      throw new NotFoundException(`Asset with ID "${id}" not found`);
    }

    await this.prisma.asset.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    await this.auditLogsService.log({
      organizationId,
      actorId: userId,
      action: 'ASSET_DELETED',
      entityType: 'Asset',
      entityId: existing.id,
      metadata: {
        name: existing.name,
      },
    });

    return { success: true };
  }

  private mapToDto(asset: any): AssetDto {
    return {
      id: asset.id,
      organizationId: asset.organizationId,
      name: asset.name,
      type: asset.type as AssetType,
      description: asset.description,
      owner: asset.owner,
      criticality: asset.criticality as AssetCriticality,
      vendorName: asset.vendorName,
      dataResidencyRegion: asset.dataResidencyRegion,
      createdAt: asset.createdAt.toISOString(),
      updatedAt: asset.updatedAt.toISOString(),
      createdById: asset.createdById,
      deletedAt: asset.deletedAt ? asset.deletedAt.toISOString() : null,
    };
  }
}
