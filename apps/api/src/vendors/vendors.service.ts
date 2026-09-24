import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { ResourceAuthorizationService, ResourceAuthContext } from '../auth/resource-authorization.service';
import { CreateVendorDto, UpdateVendorDto, VendorQueryDto, CreateVendorAssessmentDto } from './dto/vendors.dto';
import { VendorDto, PaginatedVendorsDto, VendorCriticality, VendorStatus, VendorAssessmentDto, VendorAssessmentStatus } from '@omnigrc/shared';

@Injectable()
export class VendorsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogsService: AuditLogsService,
    private readonly resourceAuthService: ResourceAuthorizationService,
  ) {}

  async findAll(authCtx: ResourceAuthContext, query: VendorQueryDto): Promise<PaginatedVendorsDto> {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const skip = (page - 1) * limit;

    const scopeWhere = await this.resourceAuthService.getScopeWhereClause(authCtx);

    const where: any = {
      ...scopeWhere,
      deletedAt: null,
    };

    if (query.criticality) {
      where.criticality = query.criticality;
    }

    if (query.status) {
      where.status = query.status;
    }

    if (query.search && query.search.trim()) {
      const searchTerm = query.search.trim();
      const searchConditions = [
        { name: { contains: searchTerm, mode: 'insensitive' } },
        { owner: { contains: searchTerm, mode: 'insensitive' } },
        { category: { contains: searchTerm, mode: 'insensitive' } },
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
      this.prisma.vendor.findMany({
        where,
        skip,
        take: limit,
        orderBy: { updatedAt: 'desc' },
        include: {
          assessments: true,
          _count: { select: { assets: true } },
        },
      }),
      this.prisma.vendor.count({ where }),
    ]);

    return {
      items: items.map(this.mapToDto),
      total,
      page,
      limit,
    };
  }

  async findOne(authCtx: ResourceAuthContext, id: string): Promise<VendorDto> {
    const scopeWhere = await this.resourceAuthService.getScopeWhereClause(authCtx);
    const vendor = await this.prisma.vendor.findFirst({
      where: {
        id,
        ...scopeWhere,
        deletedAt: null,
      },
      include: {
        assessments: true,
        _count: { select: { assets: true } },
      },
    });

    if (!vendor) {
      throw new NotFoundException(`Vendor with ID "${id}" not found`);
    }

    return this.mapToDto(vendor);
  }

  async create(authCtx: ResourceAuthContext, dto: CreateVendorDto): Promise<VendorDto> {
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

    const nextReviewDate = new Date();
    nextReviewDate.setDate(nextReviewDate.getDate() + (dto.reviewCadenceDays || 365));

    const vendor = await this.prisma.vendor.create({
      data: {
        organizationId: authCtx.organizationId,
        departmentId: dto.departmentId || null,
        projectId: dto.projectId || null,
        name: dto.name,
        description: dto.description || null,
        category: dto.category || null,
        criticality: dto.criticality || VendorCriticality.MEDIUM,
        status: dto.status || VendorStatus.ACTIVE,
        owner: dto.owner,
        department: dto.department || null,
        reviewCadenceDays: dto.reviewCadenceDays || 365,
        nextReviewDate,
        websiteUrl: dto.websiteUrl || null,
        createdById: authCtx.userId,
      },
    });

    await this.auditLogsService.log({
      organizationId: authCtx.organizationId,
      actorId: authCtx.userId,
      action: 'VENDOR_CREATED',
      entityType: 'Vendor',
      entityId: vendor.id,
      metadata: {
        name: vendor.name,
        criticality: vendor.criticality,
        owner: vendor.owner,
        departmentId: vendor.departmentId,
        projectId: vendor.projectId,
      },
    });

    return this.mapToDto(vendor);
  }

  async update(authCtx: ResourceAuthContext, id: string, dto: UpdateVendorDto): Promise<VendorDto> {
    const scopeWhere = await this.resourceAuthService.getScopeWhereClause(authCtx);
    const existing = await this.prisma.vendor.findFirst({
      where: { id, ...scopeWhere, deletedAt: null },
    });

    if (!existing) {
      throw new NotFoundException(`Vendor with ID "${id}" not found`);
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

    const updated = await this.prisma.vendor.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.category !== undefined && { category: dto.category }),
        ...(dto.criticality !== undefined && { criticality: dto.criticality }),
        ...(dto.status !== undefined && { status: dto.status }),
        ...(dto.owner !== undefined && { owner: dto.owner }),
        ...(dto.department !== undefined && { department: dto.department }),
        ...(dto.reviewCadenceDays !== undefined && { reviewCadenceDays: dto.reviewCadenceDays }),
        ...(dto.websiteUrl !== undefined && { websiteUrl: dto.websiteUrl }),
        ...(dto.departmentId !== undefined && { departmentId: dto.departmentId }),
        ...(dto.projectId !== undefined && { projectId: dto.projectId }),
      },
      include: {
        assessments: true,
        _count: { select: { assets: true } },
      },
    });

    await this.auditLogsService.log({
      organizationId: authCtx.organizationId,
      actorId: authCtx.userId,
      action: 'VENDOR_UPDATED',
      entityType: 'Vendor',
      entityId: updated.id,
      metadata: {
        name: updated.name,
      },
    });

    return this.mapToDto(updated);
  }

  async softDelete(authCtx: ResourceAuthContext, id: string): Promise<{ success: boolean }> {
    const scopeWhere = await this.resourceAuthService.getScopeWhereClause(authCtx);
    const existing = await this.prisma.vendor.findFirst({
      where: { id, ...scopeWhere, deletedAt: null },
    });

    if (!existing) {
      throw new NotFoundException(`Vendor with ID "${id}" not found`);
    }

    await this.prisma.vendor.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    await this.auditLogsService.log({
      organizationId: authCtx.organizationId,
      actorId: authCtx.userId,
      action: 'VENDOR_DELETED',
      entityType: 'Vendor',
      entityId: existing.id,
      metadata: {
        name: existing.name,
      },
    });

    return { success: true };
  }

  async createAssessment(
    authCtx: ResourceAuthContext,
    vendorId: string,
    dto: CreateVendorAssessmentDto,
  ): Promise<VendorAssessmentDto> {
    const scopeWhere = await this.resourceAuthService.getScopeWhereClause(authCtx);
    const vendor = await this.prisma.vendor.findFirst({
      where: { id: vendorId, ...scopeWhere, deletedAt: null },
    });

    if (!vendor) {
      throw new NotFoundException(`Vendor with ID "${vendorId}" not found`);
    }

    const assessment = await this.prisma.vendorAssessment.create({
      data: {
        organizationId: authCtx.organizationId,
        vendorId,
        title: dto.title,
        score: dto.score !== undefined ? dto.score : null,
        status: dto.status || VendorAssessmentStatus.SCHEDULED,
        evaluatorId: dto.evaluatorId,
        riskId: dto.riskId || null,
        complianceTaskId: dto.complianceTaskId || null,
        completedAt: dto.status === VendorAssessmentStatus.COMPLETED ? new Date() : null,
      },
    });

    if (dto.status === VendorAssessmentStatus.COMPLETED) {
      const nextReviewDate = new Date();
      nextReviewDate.setDate(nextReviewDate.getDate() + vendor.reviewCadenceDays);
      await this.prisma.vendor.update({
        where: { id: vendorId },
        data: {
          lastReviewedAt: new Date(),
          nextReviewDate,
        },
      });
    }

    await this.auditLogsService.log({
      organizationId: authCtx.organizationId,
      actorId: authCtx.userId,
      action: 'VENDOR_ASSESSMENT_CREATED',
      entityType: 'VendorAssessment',
      entityId: assessment.id,
      metadata: {
        vendorName: vendor.name,
        title: assessment.title,
        status: assessment.status,
      },
    });

    return {
      id: assessment.id,
      organizationId: assessment.organizationId,
      vendorId: assessment.vendorId,
      title: assessment.title,
      score: assessment.score,
      status: assessment.status as VendorAssessmentStatus,
      evaluatorId: assessment.evaluatorId,
      riskId: assessment.riskId,
      complianceTaskId: assessment.complianceTaskId,
      completedAt: assessment.completedAt ? assessment.completedAt.toISOString() : null,
      createdAt: assessment.createdAt.toISOString(),
      updatedAt: assessment.updatedAt.toISOString(),
    };
  }

  async migrateAssetVendors(authCtx: ResourceAuthContext): Promise<{ migratedCount: number }> {
    const scopeWhere = await this.resourceAuthService.getScopeWhereClause(authCtx);
    const assetsWithVendors = await this.prisma.asset.findMany({
      where: {
        ...scopeWhere,
        deletedAt: null,
        vendorName: { not: null },
        vendorId: null,
      },
      select: { id: true, vendorName: true, owner: true },
    });

    let count = 0;
    for (const asset of assetsWithVendors) {
      if (!asset.vendorName || !asset.vendorName.trim()) continue;
      const vName = asset.vendorName.trim();

      let vendor = await this.prisma.vendor.findFirst({
        where: { organizationId: authCtx.organizationId, name: { equals: vName, mode: 'insensitive' }, deletedAt: null },
      });

      if (!vendor) {
        vendor = await this.prisma.vendor.create({
          data: {
            organizationId: authCtx.organizationId,
            name: vName,
            owner: asset.owner || 'System',
            criticality: VendorCriticality.MEDIUM,
            status: VendorStatus.ACTIVE,
            createdById: authCtx.userId,
          },
        });
        count++;
      }

      await this.prisma.asset.update({
        where: { id: asset.id },
        data: { vendorId: vendor.id },
      });
    }

    return { migratedCount: count };
  }

  private mapToDto(vendor: any): VendorDto {
    return {
      id: vendor.id,
      organizationId: vendor.organizationId,
      departmentId: vendor.departmentId || null,
      projectId: vendor.projectId || null,
      name: vendor.name,
      description: vendor.description,
      category: vendor.category,
      criticality: vendor.criticality as VendorCriticality,
      status: vendor.status as VendorStatus,
      owner: vendor.owner,
      department: vendor.department,
      reviewCadenceDays: vendor.reviewCadenceDays,
      lastReviewedAt: vendor.lastReviewedAt ? vendor.lastReviewedAt.toISOString() : null,
      nextReviewDate: vendor.nextReviewDate ? vendor.nextReviewDate.toISOString() : null,
      websiteUrl: vendor.websiteUrl,
      createdById: vendor.createdById,
      createdAt: vendor.createdAt.toISOString(),
      updatedAt: vendor.updatedAt.toISOString(),
      assessments: vendor.assessments ? vendor.assessments.map((a: any) => ({
        id: a.id,
        organizationId: a.organizationId,
        vendorId: a.vendorId,
        title: a.title,
        score: a.score,
        status: a.status as VendorAssessmentStatus,
        evaluatorId: a.evaluatorId,
        riskId: a.riskId,
        complianceTaskId: a.complianceTaskId,
        completedAt: a.completedAt ? a.completedAt.toISOString() : null,
        createdAt: a.createdAt.toISOString(),
        updatedAt: a.updatedAt.toISOString(),
      })) : [],
      assetCount: vendor._count?.assets || 0,
    } as any;
  }
}
