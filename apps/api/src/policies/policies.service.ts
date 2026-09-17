import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import {
  CreatePolicyDto,
  UpdatePolicyDto,
  CreatePolicyVersionDto,
  CreatePolicyExceptionDto,
  PolicyQueryDto,
} from './dto/policies.dto';
import {
  PolicyDto,
  PaginatedPoliciesDto,
  PolicyStatus,
  PolicyVersionDto,
  PolicyAttestationDto,
  PolicyExceptionDto,
  PolicyExceptionStatus,
  Role,
} from '@omnigrc/shared';

@Injectable()
export class PoliciesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  async findAll(organizationId: string, query: PolicyQueryDto): Promise<PaginatedPoliciesDto> {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const skip = (page - 1) * limit;

    const where: any = {
      organizationId,
      deletedAt: null,
    };

    if (query.status) {
      where.status = query.status;
    }

    if (query.category) {
      where.category = query.category;
    }

    if (query.search && query.search.trim()) {
      const searchTerm = query.search.trim();
      where.OR = [
        { title: { contains: searchTerm, mode: 'insensitive' } },
        { code: { contains: searchTerm, mode: 'insensitive' } },
        { category: { contains: searchTerm, mode: 'insensitive' } },
        { description: { contains: searchTerm, mode: 'insensitive' } },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.policy.findMany({
        where,
        skip,
        take: limit,
        orderBy: { updatedAt: 'desc' },
        include: {
          publishedVersion: true,
          versions: { orderBy: { createdAt: 'desc' }, take: 5 },
          exceptions: { where: { status: PolicyExceptionStatus.PENDING } },
        },
      }),
      this.prisma.policy.count({ where }),
    ]);

    return {
      items: items.map(this.mapToDto),
      total,
      page,
      limit,
    };
  }

  async findOne(organizationId: string, id: string): Promise<PolicyDto> {
    const policy = await this.prisma.policy.findFirst({
      where: { id, organizationId, deletedAt: null },
      include: {
        publishedVersion: true,
        versions: { orderBy: { createdAt: 'desc' } },
        exceptions: true,
      },
    });

    if (!policy) {
      throw new NotFoundException(`Policy with ID "${id}" not found`);
    }

    return this.mapToDto(policy);
  }

  async create(organizationId: string, userId: string, dto: CreatePolicyDto): Promise<PolicyDto> {
    const existingCode = await this.prisma.policy.findFirst({
      where: { organizationId, code: dto.code, deletedAt: null },
    });

    if (existingCode) {
      throw new BadRequestException(`Policy with code "${dto.code}" already exists in this organization`);
    }

    // Create Policy and initial 1.0 PolicyVersion
    const policy = await this.prisma.policy.create({
      data: {
        organizationId,
        code: dto.code,
        title: dto.title,
        description: dto.description || null,
        category: dto.category,
        status: PolicyStatus.DRAFT,
        ownerId: dto.ownerId,
        businessUnit: dto.businessUnit || null,
        reviewCadenceDays: dto.reviewCadenceDays || 365,
        createdById: userId,
        versions: {
          create: {
            versionNumber: '1.0',
            content: dto.initialContent,
            changeLog: 'Initial policy draft created',
            createdById: userId,
          },
        },
      },
      include: {
        publishedVersion: true,
        versions: true,
      },
    });

    await this.auditLogsService.log({
      organizationId,
      actorId: userId,
      action: 'POLICY_CREATED',
      entityType: 'Policy',
      entityId: policy.id,
      metadata: {
        code: policy.code,
        title: policy.title,
        status: policy.status,
      },
    });

    return this.mapToDto(policy);
  }

  async updateMetadata(organizationId: string, userId: string, id: string, dto: UpdatePolicyDto): Promise<PolicyDto> {
    const existing = await this.prisma.policy.findFirst({
      where: { id, organizationId, deletedAt: null },
    });

    if (!existing) {
      throw new NotFoundException(`Policy with ID "${id}" not found`);
    }

    const updated = await this.prisma.policy.update({
      where: { id },
      data: {
        ...(dto.code !== undefined && { code: dto.code }),
        ...(dto.title !== undefined && { title: dto.title }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.category !== undefined && { category: dto.category }),
        ...(dto.ownerId !== undefined && { ownerId: dto.ownerId }),
        ...(dto.businessUnit !== undefined && { businessUnit: dto.businessUnit }),
        ...(dto.reviewCadenceDays !== undefined && { reviewCadenceDays: dto.reviewCadenceDays }),
      },
      include: {
        publishedVersion: true,
        versions: { orderBy: { createdAt: 'desc' } },
      },
    });

    await this.auditLogsService.log({
      organizationId,
      actorId: userId,
      action: 'POLICY_UPDATED',
      entityType: 'Policy',
      entityId: updated.id,
      metadata: { code: updated.code, title: updated.title },
    });

    return this.mapToDto(updated);
  }

  async createVersion(
    organizationId: string,
    userId: string,
    policyId: string,
    dto: CreatePolicyVersionDto,
  ): Promise<PolicyVersionDto> {
    const policy = await this.prisma.policy.findFirst({
      where: { id: policyId, organizationId, deletedAt: null },
    });

    if (!policy) {
      throw new NotFoundException(`Policy with ID "${policyId}" not found`);
    }

    const existingVersion = await this.prisma.policyVersion.findUnique({
      where: {
        policyId_versionNumber: {
          policyId,
          versionNumber: dto.versionNumber,
        },
      },
    });

    if (existingVersion) {
      throw new BadRequestException(
        `Policy version "${dto.versionNumber}" already exists for policy "${policy.code}"`,
      );
    }

    const version = await this.prisma.policyVersion.create({
      data: {
        policyId,
        versionNumber: dto.versionNumber,
        content: dto.content,
        changeLog: dto.changeLog || null,
        createdById: userId,
      },
    });

    await this.auditLogsService.log({
      organizationId,
      actorId: userId,
      action: 'POLICY_VERSION_CREATED',
      entityType: 'PolicyVersion',
      entityId: version.id,
      metadata: {
        policyCode: policy.code,
        versionNumber: version.versionNumber,
      },
    });

    return {
      id: version.id,
      policyId: version.policyId,
      versionNumber: version.versionNumber,
      content: version.content,
      changeLog: version.changeLog,
      createdById: version.createdById,
      createdAt: version.createdAt.toISOString(),
    };
  }

  // --- EXPLICIT AUTHORIZATION-CONTROLLED LIFECYCLE TRANSITIONS ---

  async submitForReview(organizationId: string, userId: string, id: string): Promise<PolicyDto> {
    const policy = await this.prisma.policy.findFirst({
      where: { id, organizationId, deletedAt: null },
    });

    if (!policy) throw new NotFoundException(`Policy with ID "${id}" not found`);
    if (policy.status !== PolicyStatus.DRAFT) {
      throw new BadRequestException(`Cannot submit policy for review from state "${policy.status}". Must be DRAFT.`);
    }

    const updated = await this.prisma.policy.update({
      where: { id },
      data: { status: PolicyStatus.UNDER_REVIEW },
      include: { publishedVersion: true, versions: true },
    });

    await this.auditLogsService.log({
      organizationId,
      actorId: userId,
      action: 'POLICY_SUBMITTED_FOR_REVIEW',
      entityType: 'Policy',
      entityId: id,
      metadata: { code: updated.code, newStatus: updated.status },
    });

    return this.mapToDto(updated);
  }

  async approve(organizationId: string, userId: string, userRole: Role, id: string): Promise<PolicyDto> {
    if (userRole !== Role.ADMIN && userRole !== Role.MSSP_ADMIN) {
      throw new ForbiddenException('Only ADMIN users can approve policy documents');
    }

    const policy = await this.prisma.policy.findFirst({
      where: { id, organizationId, deletedAt: null },
    });

    if (!policy) throw new NotFoundException(`Policy with ID "${id}" not found`);
    if (policy.status !== PolicyStatus.UNDER_REVIEW) {
      throw new BadRequestException(`Cannot approve policy from state "${policy.status}". Must be UNDER_REVIEW.`);
    }

    const updated = await this.prisma.policy.update({
      where: { id },
      data: { status: PolicyStatus.APPROVED },
      include: { publishedVersion: true, versions: true },
    });

    await this.auditLogsService.log({
      organizationId,
      actorId: userId,
      action: 'POLICY_APPROVED',
      entityType: 'Policy',
      entityId: id,
      metadata: { code: updated.code, newStatus: updated.status },
    });

    return this.mapToDto(updated);
  }

  async publish(organizationId: string, userId: string, id: string, versionId?: string): Promise<PolicyDto> {
    const policy = await this.prisma.policy.findFirst({
      where: { id, organizationId, deletedAt: null },
      include: { versions: { orderBy: { createdAt: 'desc' } } },
    });

    if (!policy) throw new NotFoundException(`Policy with ID "${id}" not found`);
    if (policy.status !== PolicyStatus.APPROVED) {
      throw new BadRequestException(`Cannot publish policy from state "${policy.status}". Must be APPROVED.`);
    }

    const versionToPublish = versionId
      ? policy.versions.find((v) => v.id === versionId)
      : policy.versions[0];

    if (!versionToPublish) {
      throw new BadRequestException('No policy version available to publish');
    }

    const effectiveDate = new Date();
    const reviewDate = new Date();
    reviewDate.setDate(reviewDate.getDate() + policy.reviewCadenceDays);

    const updated = await this.prisma.policy.update({
      where: { id },
      data: {
        status: PolicyStatus.PUBLISHED,
        publishedVersionId: versionToPublish.id,
        effectiveDate,
        reviewDate,
      },
      include: { publishedVersion: true, versions: true },
    });

    await this.auditLogsService.log({
      organizationId,
      actorId: userId,
      action: 'POLICY_PUBLISHED',
      entityType: 'Policy',
      entityId: id,
      metadata: {
        code: updated.code,
        versionNumber: versionToPublish.versionNumber,
        effectiveDate: effectiveDate.toISOString(),
      },
    });

    return this.mapToDto(updated);
  }

  async retire(organizationId: string, userId: string, id: string): Promise<PolicyDto> {
    const policy = await this.prisma.policy.findFirst({
      where: { id, organizationId, deletedAt: null },
    });

    if (!policy) throw new NotFoundException(`Policy with ID "${id}" not found`);
    if (policy.status !== PolicyStatus.PUBLISHED) {
      throw new BadRequestException(`Cannot retire policy from state "${policy.status}". Must be PUBLISHED.`);
    }

    const updated = await this.prisma.policy.update({
      where: { id },
      data: { status: PolicyStatus.RETIRED },
      include: { publishedVersion: true, versions: true },
    });

    await this.auditLogsService.log({
      organizationId,
      actorId: userId,
      action: 'POLICY_RETIRED',
      entityType: 'Policy',
      entityId: id,
      metadata: { code: updated.code, newStatus: updated.status },
    });

    return this.mapToDto(updated);
  }

  // --- ATTESTATION & EXCEPTION ---

  async attestVersion(
    organizationId: string,
    userId: string,
    versionId: string,
    ipAddress?: string,
  ): Promise<PolicyAttestationDto> {
    const version = await this.prisma.policyVersion.findUnique({
      where: { id: versionId },
      include: { policy: true },
    });

    if (!version || version.policy.organizationId !== organizationId) {
      throw new NotFoundException(`Policy version with ID "${versionId}" not found`);
    }

    const existingAttestation = await this.prisma.policyAttestation.findUnique({
      where: {
        policyVersionId_userId: {
          policyVersionId: versionId,
          userId,
        },
      },
    });

    if (existingAttestation) {
      throw new BadRequestException('You have already attested to this policy version.');
    }

    const attestation = await this.prisma.policyAttestation.create({
      data: {
        organizationId,
        policyVersionId: versionId,
        userId,
        ipAddress: ipAddress || null,
      },
    });

    await this.auditLogsService.log({
      organizationId,
      actorId: userId,
      action: 'POLICY_ATTESTED',
      entityType: 'PolicyAttestation',
      entityId: attestation.id,
      metadata: {
        policyCode: version.policy.code,
        versionNumber: version.versionNumber,
      },
    });

    return {
      id: attestation.id,
      organizationId: attestation.organizationId,
      policyVersionId: attestation.policyVersionId,
      userId: attestation.userId,
      attestedAt: attestation.attestedAt.toISOString(),
      ipAddress: attestation.ipAddress,
    };
  }

  async createException(
    organizationId: string,
    userId: string,
    policyId: string,
    dto: CreatePolicyExceptionDto,
  ): Promise<PolicyExceptionDto> {
    const policy = await this.prisma.policy.findFirst({
      where: { id: policyId, organizationId, deletedAt: null },
    });

    if (!policy) throw new NotFoundException(`Policy with ID "${policyId}" not found`);

    const exception = await this.prisma.policyException.create({
      data: {
        organizationId,
        policyId,
        title: dto.title,
        reason: dto.reason,
        requestedById: userId,
        status: PolicyExceptionStatus.PENDING,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
      },
    });

    await this.auditLogsService.log({
      organizationId,
      actorId: userId,
      action: 'POLICY_EXCEPTION_REQUESTED',
      entityType: 'PolicyException',
      entityId: exception.id,
      metadata: { policyCode: policy.code, title: exception.title },
    });

    return {
      id: exception.id,
      organizationId: exception.organizationId,
      policyId: exception.policyId,
      title: exception.title,
      reason: exception.reason,
      requestedById: exception.requestedById,
      approvedById: exception.approvedById,
      status: exception.status as PolicyExceptionStatus,
      expiresAt: exception.expiresAt ? exception.expiresAt.toISOString() : null,
      createdAt: exception.createdAt.toISOString(),
      updatedAt: exception.updatedAt.toISOString(),
    };
  }

  private toIsoString(date: any): string {
    if (!date) return new Date().toISOString();
    if (date instanceof Date) return date.toISOString();
    return new Date(date).toISOString();
  }

  private mapToDto(policy: any): PolicyDto {
    return {
      id: policy.id,
      organizationId: policy.organizationId,
      code: policy.code,
      title: policy.title,
      description: policy.description,
      category: policy.category,
      status: policy.status as PolicyStatus,
      ownerId: policy.ownerId,
      businessUnit: policy.businessUnit,
      publishedVersionId: policy.publishedVersionId,
      publishedVersion: policy.publishedVersion ? {
        id: policy.publishedVersion.id,
        policyId: policy.publishedVersion.policyId,
        versionNumber: policy.publishedVersion.versionNumber,
        content: policy.publishedVersion.content,
        changeLog: policy.publishedVersion.changeLog,
        createdById: policy.publishedVersion.createdById,
        createdAt: this.toIsoString(policy.publishedVersion.createdAt),
      } : null,
      versions: policy.versions ? policy.versions.map((v: any) => ({
        id: v.id,
        policyId: v.policyId,
        versionNumber: v.versionNumber,
        content: v.content,
        changeLog: v.changeLog,
        createdById: v.createdById,
        createdAt: this.toIsoString(v.createdAt),
      })) : [],
      effectiveDate: policy.effectiveDate ? this.toIsoString(policy.effectiveDate) : null,
      reviewDate: policy.reviewDate ? this.toIsoString(policy.reviewDate) : null,
      reviewCadenceDays: policy.reviewCadenceDays,
      createdById: policy.createdById,
      createdAt: this.toIsoString(policy.createdAt),
      updatedAt: this.toIsoString(policy.updatedAt),
    };
  }
}
