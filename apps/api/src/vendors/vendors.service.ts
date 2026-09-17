import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { CreateVendorDto, UpdateVendorDto, VendorQueryDto, CreateVendorAssessmentDto } from './dto/vendors.dto';
import { VendorDto, PaginatedVendorsDto, VendorCriticality, VendorStatus, VendorAssessmentDto, VendorAssessmentStatus } from '@omnigrc/shared';

@Injectable()
export class VendorsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  async findAll(organizationId: string, query: VendorQueryDto): Promise<PaginatedVendorsDto> {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const skip = (page - 1) * limit;

    const where: any = {
      organizationId,
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
      where.OR = [
        { name: { contains: searchTerm, mode: 'insensitive' } },
        { owner: { contains: searchTerm, mode: 'insensitive' } },
        { category: { contains: searchTerm, mode: 'insensitive' } },
        { description: { contains: searchTerm, mode: 'insensitive' } },
      ];
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

  async findOne(organizationId: string, id: string): Promise<VendorDto> {
    const vendor = await this.prisma.vendor.findFirst({
      where: {
        id,
        organizationId,
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

  async create(organizationId: string, userId: string, dto: CreateVendorDto): Promise<VendorDto> {
    const nextReviewDate = new Date();
    nextReviewDate.setDate(nextReviewDate.getDate() + (dto.reviewCadenceDays || 365));

    const vendor = await this.prisma.vendor.create({
      data: {
        organizationId,
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
        createdById: userId,
      },
    });

    await this.auditLogsService.log({
      organizationId,
      actorId: userId,
      action: 'VENDOR_CREATED',
      entityType: 'Vendor',
      entityId: vendor.id,
      metadata: {
        name: vendor.name,
        criticality: vendor.criticality,
        owner: vendor.owner,
      },
    });

    return this.mapToDto(vendor);
  }

  async update(organizationId: string, userId: string, id: string, dto: UpdateVendorDto): Promise<VendorDto> {
    const existing = await this.prisma.vendor.findFirst({
      where: { id, organizationId, deletedAt: null },
    });

    if (!existing) {
      throw new NotFoundException(`Vendor with ID "${id}" not found`);
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
      },
      include: {
        assessments: true,
        _count: { select: { assets: true } },
      },
    });

    await this.auditLogsService.log({
      organizationId,
      actorId: userId,
      action: 'VENDOR_UPDATED',
      entityType: 'Vendor',
      entityId: updated.id,
      metadata: {
        name: updated.name,
      },
    });

    return this.mapToDto(updated);
  }

  async softDelete(organizationId: string, userId: string, id: string): Promise<{ success: boolean }> {
    const existing = await this.prisma.vendor.findFirst({
      where: { id, organizationId, deletedAt: null },
    });

    if (!existing) {
      throw new NotFoundException(`Vendor with ID "${id}" not found`);
    }

    await this.prisma.vendor.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    await this.auditLogsService.log({
      organizationId,
      actorId: userId,
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
    organizationId: string,
    userId: string,
    vendorId: string,
    dto: CreateVendorAssessmentDto,
  ): Promise<VendorAssessmentDto> {
    const vendor = await this.prisma.vendor.findFirst({
      where: { id: vendorId, organizationId, deletedAt: null },
    });

    if (!vendor) {
      throw new NotFoundException(`Vendor with ID "${vendorId}" not found`);
    }

    const assessment = await this.prisma.vendorAssessment.create({
      data: {
        organizationId,
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

    // Update vendor last reviewed date if assessment is completed
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
      organizationId,
      actorId: userId,
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

  /**
   * Safe data migration: Populate Vendor records from distinct Asset.vendorName values per tenant.
   * Preserves existing string vendorName on assets and links vendorId when created.
   */
  async migrateAssetVendors(organizationId: string, userId: string): Promise<{ migratedCount: number }> {
    const assetsWithVendors = await this.prisma.asset.findMany({
      where: {
        organizationId,
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

      // Find or create Vendor record per tenant for exact name
      let vendor = await this.prisma.vendor.findFirst({
        where: { organizationId, name: { equals: vName, mode: 'insensitive' }, deletedAt: null },
      });

      if (!vendor) {
        vendor = await this.prisma.vendor.create({
          data: {
            organizationId,
            name: vName,
            owner: asset.owner || 'System',
            criticality: VendorCriticality.MEDIUM,
            status: VendorStatus.ACTIVE,
            createdById: userId,
          },
        });
        count++;
      }

      // Update asset vendorId link while preserving vendorName string
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
    };
  }
}
