import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { ResourceAuthorizationService, ResourceAuthContext } from '../auth/resource-authorization.service';
import { CreateAssetDto, UpdateAssetDto, AssetQueryDto } from './dto/assets.dto';
import { AssetDto, PaginatedAssetsDto, PaginatedRisksDto, AssetType, AssetCriticality } from '@omnigrc/shared';
import { RisksService } from '../risks/risks.service';
import { RiskQueryDto } from '../risks/dto/risks.dto';

@Injectable()
export class AssetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogsService: AuditLogsService,
    private readonly resourceAuthService: ResourceAuthorizationService,
    private readonly risksService: RisksService,
  ) {}

  async findAll(authCtx: ResourceAuthContext, query: AssetQueryDto): Promise<PaginatedAssetsDto> {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const skip = (page - 1) * limit;

    const scopeWhere = await this.resourceAuthService.getScopeWhereClause(authCtx);

    const where: any = {
      ...scopeWhere,
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
      const searchConditions = [
        { name: { contains: searchTerm, mode: 'insensitive' } },
        { owner: { contains: searchTerm, mode: 'insensitive' } },
        { vendorName: { contains: searchTerm, mode: 'insensitive' } },
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

  async count(authCtx: ResourceAuthContext): Promise<{ count: number }> {
    const scopeWhere = await this.resourceAuthService.getScopeWhereClause(authCtx);
    const count = await this.prisma.asset.count({
      where: {
        ...scopeWhere,
        deletedAt: null,
      },
    });
    return { count };
  }

  async findOne(authCtx: ResourceAuthContext, id: string): Promise<AssetDto> {
    const scopeWhere = await this.resourceAuthService.getScopeWhereClause(authCtx);
    const asset = await this.prisma.asset.findFirst({
      where: {
        id,
        ...scopeWhere,
        deletedAt: null,
      },
    });

    if (!asset) {
      throw new NotFoundException(`Asset with ID "${id}" not found`);
    }

    return this.mapToDto(asset);
  }

  async getAuditLogs(authCtx: ResourceAuthContext, assetId: string) {
    const scopeWhere = await this.resourceAuthService.getScopeWhereClause(authCtx);
    const asset = await this.prisma.asset.findFirst({
      where: { id: assetId, ...scopeWhere },
    });

    if (!asset) {
      throw new NotFoundException(`Asset with ID "${assetId}" not found`);
    }

    return this.prisma.auditLogEntry.findMany({
      where: {
        organizationId: authCtx.organizationId,
        entityType: 'Asset',
        entityId: assetId,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getRisksForAsset(
    authCtx: ResourceAuthContext,
    assetId: string,
    query: RiskQueryDto,
  ): Promise<PaginatedRisksDto> {
    // Validate asset belongs to organization and scope; throws NotFoundException if missing or cross-tenant
    await this.findOne(authCtx, assetId);
    return this.risksService.findAll(authCtx, { ...query, assetId });
  }

  async create(authCtx: ResourceAuthContext, dto: CreateAssetDto): Promise<AssetDto> {
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

    await this.validateOwner(authCtx, dto.owner);

    const asset = await this.prisma.asset.create({
      data: {
        organizationId: authCtx.organizationId,
        departmentId: dto.departmentId || null,
        projectId: dto.projectId || null,
        name: dto.name,
        type: dto.type,
        description: dto.description || null,
        owner: dto.owner,
        criticality: dto.criticality,
        vendorName: dto.vendorName || null,
        dataResidencyRegion: dto.dataResidencyRegion || null,
        department: dto.department || null,
        environment: dto.environment || 'PRODUCTION',
        isManaged: dto.isManaged !== undefined ? dto.isManaged : true,
        lastScannedAt: dto.lastScannedAt ? new Date(dto.lastScannedAt) : null,
        maintenanceDueDate: dto.maintenanceDueDate ? new Date(dto.maintenanceDueDate) : null,
        vendorId: dto.vendorId || null,
        createdById: authCtx.userId,
      },
    });

    await this.auditLogsService.log({
      organizationId: authCtx.organizationId,
      actorId: authCtx.userId,
      action: 'ASSET_CREATED',
      entityType: 'Asset',
      entityId: asset.id,
      metadata: {
        name: asset.name,
        type: asset.type,
        criticality: asset.criticality,
        owner: asset.owner,
        environment: asset.environment,
        departmentId: asset.departmentId,
        projectId: asset.projectId,
      },
    });

    return this.mapToDto(asset);
  }

  async update(authCtx: ResourceAuthContext, id: string, dto: UpdateAssetDto): Promise<AssetDto> {
    const scopeWhere = await this.resourceAuthService.getScopeWhereClause(authCtx);
    const existing = await this.prisma.asset.findFirst({
      where: { id, ...scopeWhere, deletedAt: null },
    });

    if (!existing) {
      throw new NotFoundException(`Asset with ID "${id}" not found`);
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

    if (dto.owner !== undefined) {
      await this.validateOwner(authCtx, dto.owner);
    }

    const changedFields: string[] = [];
    if (dto.name !== undefined && dto.name !== existing.name) changedFields.push('name');
    if (dto.type !== undefined && dto.type !== existing.type) changedFields.push('type');
    if (dto.description !== undefined && dto.description !== existing.description) changedFields.push('description');
    if (dto.owner !== undefined && dto.owner !== existing.owner) changedFields.push('owner');
    if (dto.criticality !== undefined && dto.criticality !== existing.criticality) changedFields.push('criticality');
    if (dto.vendorName !== undefined && dto.vendorName !== existing.vendorName) changedFields.push('vendorName');
    if (dto.dataResidencyRegion !== undefined && dto.dataResidencyRegion !== existing.dataResidencyRegion) changedFields.push('dataResidencyRegion');
    if (dto.department !== undefined && dto.department !== existing.department) changedFields.push('department');
    if (dto.environment !== undefined && dto.environment !== existing.environment) changedFields.push('environment');
    if (dto.isManaged !== undefined && dto.isManaged !== existing.isManaged) changedFields.push('isManaged');
    if (dto.vendorId !== undefined && dto.vendorId !== existing.vendorId) changedFields.push('vendorId');
    if (dto.departmentId !== undefined && dto.departmentId !== existing.departmentId) changedFields.push('departmentId');
    if (dto.projectId !== undefined && dto.projectId !== existing.projectId) changedFields.push('projectId');

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
        ...(dto.department !== undefined && { department: dto.department }),
        ...(dto.environment !== undefined && { environment: dto.environment }),
        ...(dto.isManaged !== undefined && { isManaged: dto.isManaged }),
        ...(dto.lastScannedAt !== undefined && { lastScannedAt: dto.lastScannedAt ? new Date(dto.lastScannedAt) : null }),
        ...(dto.maintenanceDueDate !== undefined && { maintenanceDueDate: dto.maintenanceDueDate ? new Date(dto.maintenanceDueDate) : null }),
        ...(dto.vendorId !== undefined && { vendorId: dto.vendorId }),
        ...(dto.departmentId !== undefined && { departmentId: dto.departmentId }),
        ...(dto.projectId !== undefined && { projectId: dto.projectId }),
      },
    });

    if (changedFields.length > 0) {
      await this.auditLogsService.log({
        organizationId: authCtx.organizationId,
        actorId: authCtx.userId,
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

  async softDelete(authCtx: ResourceAuthContext, id: string): Promise<{ success: boolean }> {
    const scopeWhere = await this.resourceAuthService.getScopeWhereClause(authCtx);
    const existing = await this.prisma.asset.findFirst({
      where: { id, ...scopeWhere, deletedAt: null },
    });

    if (!existing) {
      throw new NotFoundException(`Asset with ID "${id}" not found`);
    }

    await this.prisma.asset.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    await this.auditLogsService.log({
      organizationId: authCtx.organizationId,
      actorId: authCtx.userId,
      action: 'ASSET_DELETED',
      entityType: 'Asset',
      entityId: existing.id,
      metadata: {
        name: existing.name,
      },
    });

    return { success: true };
  }

  private async validateOwner(authCtx: ResourceAuthContext, owner?: string): Promise<void> {
    if (!owner || !owner.trim()) return;

    const trimmed = owner.trim();
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmed);
    const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);

    if (isUuid) {
      const user = await this.prisma.user.findFirst({
        where: { id: trimmed },
        include: {
          memberships: {
            where: { organizationId: authCtx.organizationId },
          },
        },
      });

      if (!user) {
        throw new BadRequestException(`Assigned owner user ID "${trimmed}" not found`);
      }
      if (user.organizationId !== authCtx.organizationId) {
        throw new BadRequestException('Assigned owner does not belong to this organization');
      }
      const activeMembership = user.memberships?.find(
        (m: any) => m.organizationId === authCtx.organizationId && m.status === 'ACTIVE',
      );
      if (user.memberships && user.memberships.length > 0 && !activeMembership) {
        throw new BadRequestException('Assigned owner does not have active membership in this organization');
      }
      return;
    }

    if (isEmail) {
      const user = await this.prisma.user.findFirst({
        where: { email: trimmed.toLowerCase() },
        include: {
          memberships: {
            where: { organizationId: authCtx.organizationId },
          },
        },
      });

      if (!user) {
        throw new BadRequestException(`Assigned owner email "${trimmed}" not found`);
      }
      if (user.organizationId !== authCtx.organizationId) {
        throw new BadRequestException('Assigned owner does not belong to this organization');
      }
      const activeMembership = user.memberships?.find(
        (m: any) => m.organizationId === authCtx.organizationId && m.status === 'ACTIVE',
      );
      if (user.memberships && user.memberships.length > 0 && !activeMembership) {
        throw new BadRequestException('Assigned owner does not have active membership in this organization');
      }
      return;
    }

    // Free-text legacy or team owner (e.g. "DevOps Team", "SecOps")
    if (trimmed.length > 100) {
      throw new BadRequestException('Owner name cannot exceed 100 characters');
    }
  }

  private mapToDto(asset: any): AssetDto {
    return {
      id: asset.id,
      organizationId: asset.organizationId,
      departmentId: asset.departmentId || null,
      projectId: asset.projectId || null,
      name: asset.name,
      type: asset.type as AssetType,
      description: asset.description,
      owner: asset.owner,
      criticality: asset.criticality as AssetCriticality,
      vendorName: asset.vendorName,
      dataResidencyRegion: asset.dataResidencyRegion,
      department: asset.department || null,
      environment: asset.environment || 'PRODUCTION',
      isManaged: asset.isManaged !== undefined ? asset.isManaged : true,
      lastScannedAt: asset.lastScannedAt ? asset.lastScannedAt.toISOString() : null,
      maintenanceDueDate: asset.maintenanceDueDate ? asset.maintenanceDueDate.toISOString() : null,
      vendorId: asset.vendorId || null,
      createdAt: asset.createdAt.toISOString(),
      updatedAt: asset.updatedAt.toISOString(),
      createdById: asset.createdById,
      deletedAt: asset.deletedAt ? asset.deletedAt.toISOString() : null,
    } as any;
  }
}
