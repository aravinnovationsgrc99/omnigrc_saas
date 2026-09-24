import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { ResourceAuthorizationService, ResourceAuthContext } from '../auth/resource-authorization.service';
import { CreateVulnerabilityDto, UpdateVulnerabilityDto, VulnerabilityQueryDto } from './dto/vulnerabilities.dto';
import { VulnerabilityDto, PaginatedVulnerabilitiesDto, VulnerabilitySeverity, VulnerabilityStatus } from '@omnigrc/shared';

@Injectable()
export class VulnerabilitiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogsService: AuditLogsService,
    private readonly resourceAuthService: ResourceAuthorizationService,
  ) {}

  async findAll(authCtx: ResourceAuthContext, query: VulnerabilityQueryDto): Promise<PaginatedVulnerabilitiesDto> {
    const page = query.page || 1;
    const limit = query.limit || 20;
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

    if (query.assetId) {
      where.affectedAssets = {
        some: { assetId: query.assetId },
      };
    }

    if (query.search && query.search.trim()) {
      const searchTerm = query.search.trim();
      const searchConditions = [
        { title: { contains: searchTerm, mode: 'insensitive' } },
        { cveId: { contains: searchTerm, mode: 'insensitive' } },
        { remediationOwner: { contains: searchTerm, mode: 'insensitive' } },
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

  async findOne(authCtx: ResourceAuthContext, id: string): Promise<VulnerabilityDto> {
    const scopeWhere = await this.resourceAuthService.getScopeWhereClause(authCtx);
    const vuln = await this.prisma.vulnerability.findFirst({
      where: {
        id,
        ...scopeWhere,
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

  async create(authCtx: ResourceAuthContext, dto: CreateVulnerabilityDto): Promise<VulnerabilityDto> {
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

    // Validate that affected assets belong to user's authorized scope
    if (dto.assetIds && dto.assetIds.length > 0) {
      const scopeWhere = await this.resourceAuthService.getScopeWhereClause(authCtx);
      const assets = await this.prisma.asset.findMany({
        where: { id: { in: dto.assetIds }, ...scopeWhere, deletedAt: null },
      });
      if (assets.length !== dto.assetIds.length) {
        throw new NotFoundException('One or more affected assets not found or out of scope.');
      }
    }

    const vuln = await this.prisma.vulnerability.create({
      data: {
        organizationId: authCtx.organizationId,
        departmentId: dto.departmentId || null,
        projectId: dto.projectId || null,
        cveId: dto.cveId || null,
        title: dto.title,
        description: dto.description || null,
        severity: dto.severity,
        status: dto.status || VulnerabilityStatus.OPEN,
        remediationOwner: dto.remediationOwner,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
        remediationNotes: dto.remediationNotes || null,
        createdById: authCtx.userId,
        affectedAssets: {
          create: dto.assetIds.map((assetId) => ({
            organizationId: authCtx.organizationId,
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
      organizationId: authCtx.organizationId,
      actorId: authCtx.userId,
      action: 'VULNERABILITY_CREATED',
      entityType: 'Vulnerability',
      entityId: vuln.id,
      metadata: {
        title: vuln.title,
        cveId: vuln.cveId,
        severity: vuln.severity,
        assetCount: dto.assetIds.length,
        departmentId: vuln.departmentId,
        projectId: vuln.projectId,
      },
    });

    return this.mapToDto(vuln);
  }

  async update(authCtx: ResourceAuthContext, id: string, dto: UpdateVulnerabilityDto): Promise<VulnerabilityDto> {
    const scopeWhere = await this.resourceAuthService.getScopeWhereClause(authCtx);
    const existing = await this.prisma.vulnerability.findFirst({
      where: { id, ...scopeWhere, deletedAt: null },
    });

    if (!existing) {
      throw new NotFoundException(`Vulnerability with ID "${id}" not found`);
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

    if (dto.assetIds !== undefined) {
      const assets = await this.prisma.asset.findMany({
        where: { id: { in: dto.assetIds }, ...scopeWhere, deletedAt: null },
      });
      if (assets.length !== dto.assetIds.length) {
        throw new NotFoundException('One or more affected assets not found or out of scope.');
      }

      await this.prisma.vulnerabilityAsset.deleteMany({
        where: { vulnerabilityId: id },
      });
      await this.prisma.vulnerabilityAsset.createMany({
        data: dto.assetIds.map((assetId) => ({
          organizationId: authCtx.organizationId,
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
        ...(dto.departmentId !== undefined && { departmentId: dto.departmentId }),
        ...(dto.projectId !== undefined && { projectId: dto.projectId }),
        lastSeenAt: new Date(),
      },
      include: {
        affectedAssets: {
          include: { asset: { select: { id: true, name: true } } },
        },
      },
    });

    await this.auditLogsService.log({
      organizationId: authCtx.organizationId,
      actorId: authCtx.userId,
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

  async softDelete(authCtx: ResourceAuthContext, id: string): Promise<{ success: boolean }> {
    const scopeWhere = await this.resourceAuthService.getScopeWhereClause(authCtx);
    const existing = await this.prisma.vulnerability.findFirst({
      where: { id, ...scopeWhere, deletedAt: null },
    });

    if (!existing) {
      throw new NotFoundException(`Vulnerability with ID "${id}" not found`);
    }

    await this.prisma.vulnerability.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    await this.auditLogsService.log({
      organizationId: authCtx.organizationId,
      actorId: authCtx.userId,
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
      departmentId: vuln.departmentId || null,
      projectId: vuln.projectId || null,
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
    } as any;
  }
}
