import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
  Optional,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { ResourceAuthorizationService, ResourceAuthContext } from '../auth/resource-authorization.service';
import { ApprovalEngineService } from '../approval/approval-engine.service';
import {
  CreatePolicyDto,
  UpdatePolicyDto,
  CreatePolicyVersionDto,
  CreatePolicyExceptionDto,
  PolicyQueryDto,
  AttestPolicyDto,
  SubmitPolicyApprovalDto,
  AiDraftPolicyDto,
  SharePolicyDto,
  ImportPolicyDocDto,
} from './dto/policies.dto';
import {
  PolicyDto,
  PaginatedPoliciesDto,
  PolicyStatus,
  PolicyVersionDto,
  PolicyAttestationDto,
  PolicyExceptionDto,
  PolicyExceptionStatus,
  PolicyCategoryDto,
  PolicyAttestationSummaryDto,
  Role,
  NotificationType,
} from '@omnigrc/shared';
import { NotificationsService } from '../notifications/notifications.service';
import { ClaudeProvider } from '../controls/ai/claude.provider';
import { GeminiProvider } from '../controls/ai/gemini.provider';

export const DEFAULT_POLICY_CATEGORIES = [
  'Information Security',
  'Data Privacy',
  'Access Control',
  'Acceptable Use',
  'Incident Response',
  'Business Continuity',
  'Vendor Management',
  'Compliance',
];

@Injectable()
export class PoliciesService {
  // Phase 4: Durable Policy Categories persistent store via PrismaService

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogsService: AuditLogsService,
    private readonly resourceAuthService: ResourceAuthorizationService,
    @Optional() private readonly approvalEngineService?: ApprovalEngineService,
    @Optional() private readonly notificationsService?: NotificationsService,
    @Optional() private readonly claudeProvider?: ClaudeProvider,
    @Optional() private readonly geminiProvider?: GeminiProvider,
  ) {
    this.mapToDto = this.mapToDto.bind(this);
  }

  async findAll(authCtx: ResourceAuthContext, query: PolicyQueryDto): Promise<PaginatedPoliciesDto> {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const skip = (page - 1) * limit;

    const scopeWhere = await this.resourceAuthService.getScopeWhereClause(authCtx);

    const where: any = {
      ...scopeWhere,
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
      const searchConditions = [
        { title: { contains: searchTerm, mode: 'insensitive' } },
        { code: { contains: searchTerm, mode: 'insensitive' } },
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
      items: items.map((p) => this.mapToDto(p)),
      total,
      page,
      limit,
    };
  }

  async findOne(authCtx: ResourceAuthContext, id: string): Promise<PolicyDto> {
    const scopeWhere = await this.resourceAuthService.getScopeWhereClause(authCtx);
    const policy = await this.prisma.policy.findFirst({
      where: { id, ...scopeWhere, deletedAt: null },
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

  async create(authCtx: ResourceAuthContext, dto: CreatePolicyDto): Promise<PolicyDto> {
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

    const existingCode = await this.prisma.policy.findFirst({
      where: { organizationId: authCtx.organizationId, code: dto.code, deletedAt: null },
    });

    if (existingCode) {
      throw new BadRequestException(`Policy with code "${dto.code}" already exists in this organization`);
    }

    const policy = await this.prisma.policy.create({
      data: {
        organizationId: authCtx.organizationId,
        departmentId: dto.departmentId || null,
        projectId: dto.projectId || null,
        code: dto.code,
        title: dto.title,
        description: dto.description || null,
        category: dto.category,
        status: PolicyStatus.DRAFT,
        ownerId: dto.ownerId,
        businessUnit: dto.businessUnit || null,
        reviewCadenceDays: dto.reviewCadenceDays || 365,
        createdById: authCtx.userId,
        versions: {
          create: {
            versionNumber: '1.0',
            content: dto.initialContent,
            changeLog: 'Initial policy draft created',
            createdById: authCtx.userId,
          },
        },
      },
      include: {
        publishedVersion: true,
        versions: true,
      },
    });

    await this.auditLogsService.log({
      organizationId: authCtx.organizationId,
      actorId: authCtx.userId,
      action: 'POLICY_CREATED',
      entityType: 'Policy',
      entityId: policy.id,
      metadata: {
        code: policy.code,
        title: policy.title,
        status: policy.status,
        departmentId: policy.departmentId,
        projectId: policy.projectId,
      },
    });

    if (this.notificationsService && policy.ownerId) {
      await this.notificationsService.notify({
        organizationId: authCtx.organizationId,
        userId: policy.ownerId,
        type: NotificationType.TASK_ASSIGNED,
        message: `You have been assigned as the owner of Policy "${policy.title}" (${policy.code}).`,
        entityType: 'Policy',
        entityId: policy.id,
      });
    }

    return this.mapToDto(policy);
  }

  async updateMetadata(authCtx: ResourceAuthContext, id: string, dto: UpdatePolicyDto): Promise<PolicyDto> {
    if (
      dto.expectedVersion === undefined ||
      dto.expectedVersion === null ||
      typeof dto.expectedVersion !== 'number' ||
      dto.expectedVersion < 1
    ) {
      throw new BadRequestException('expectedVersion is mandatory and must be a positive integer');
    }

    const scopeWhere = await this.resourceAuthService.getScopeWhereClause(authCtx);
    const existing = await this.prisma.policy.findFirst({
      where: { id, ...scopeWhere, deletedAt: null },
    });

    if (!existing) {
      throw new NotFoundException(`Policy with ID "${id}" not found`);
    }

    if (dto.expectedUpdatedAt) {
      const expected = new Date(dto.expectedUpdatedAt).getTime();
      const current = new Date(existing.updatedAt).getTime();
      if (Math.abs(current - expected) > 1000) {
        throw new ConflictException(
          'Policy was updated by another user. Please reload the latest changes.',
        );
      }
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

    if (dto.content !== undefined) {
      if (existing.status !== PolicyStatus.DRAFT) {
        throw new BadRequestException(
          `Cannot directly update content of policy in "${existing.status}" status. Please create a new version.`,
        );
      }
      const latestVersion = await this.prisma.policyVersion.findFirst({
        where: { policyId: id },
        orderBy: { createdAt: 'desc' },
      });
      if (latestVersion) {
        await this.prisma.policyVersion.update({
          where: { id: latestVersion.id },
          data: { content: dto.content },
        });
      }
    }

    // ATOMIC CONDITIONAL UPDATE at database level
    const whereClause: any = {
      id,
      organizationId: authCtx.organizationId,
      deletedAt: null,
    };

    if (dto.expectedVersion !== undefined) {
      whereClause.version = dto.expectedVersion;
    }

    const updateResult = await this.prisma.policy.updateMany({
      where: whereClause,
      data: {
        ...(dto.code !== undefined && { code: dto.code }),
        ...(dto.title !== undefined && { title: dto.title }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.category !== undefined && { category: dto.category }),
        ...(dto.ownerId !== undefined && { ownerId: dto.ownerId }),
        ...(dto.businessUnit !== undefined && { businessUnit: dto.businessUnit }),
        ...(dto.reviewCadenceDays !== undefined && { reviewCadenceDays: dto.reviewCadenceDays }),
        ...(dto.departmentId !== undefined && { departmentId: dto.departmentId }),
        ...(dto.projectId !== undefined && { projectId: dto.projectId }),
        version: { increment: 1 },
      },
    });

    if (updateResult.count === 0) {
      const current = await this.prisma.policy.findFirst({
        where: { id, organizationId: authCtx.organizationId, deletedAt: null },
        select: { id: true, version: true },
      });
      if (!current) {
        throw new NotFoundException(`Policy with ID "${id}" not found`);
      }
      throw new ConflictException(
        `Policy revision conflict: expected version ${dto.expectedVersion}, but current version is ${current.version}. Please reload the latest changes.`,
      );
    }

    const updated = await this.prisma.policy.findUniqueOrThrow({
      where: { id },
      include: {
        publishedVersion: true,
        versions: { orderBy: { createdAt: 'desc' } },
        _count: {
          select: {
            controlAssociations: true,
          },
        },
      },
    });

    await this.auditLogsService.log({
      organizationId: authCtx.organizationId,
      actorId: authCtx.userId,
      action: 'POLICY_UPDATED',
      entityType: 'Policy',
      entityId: updated.id,
      metadata: { code: updated.code, title: updated.title, newVersion: updated.version },
    });

    if (this.notificationsService && dto.ownerId && dto.ownerId !== existing.ownerId) {
      await this.notificationsService.notify({
        organizationId: authCtx.organizationId,
        userId: dto.ownerId,
        type: NotificationType.TASK_ASSIGNED,
        message: `You have been assigned as the owner of Policy "${updated.title}" (${updated.code}).`,
        entityType: 'Policy',
        entityId: updated.id,
      });
    }

    return this.mapToDto(updated);
  }

  async listCategories(authCtx: ResourceAuthContext): Promise<PolicyCategoryDto[]> {
    const scopeWhere = await this.resourceAuthService.getScopeWhereClause(authCtx);

    const [counts, customDbCategories] = await Promise.all([
      this.prisma.policy.groupBy({
        by: ['category'],
        where: {
          ...scopeWhere,
          deletedAt: null,
        },
        _count: {
          id: true,
        },
      }),
      this.prisma.policyCategory
        ? this.prisma.policyCategory.findMany({
            where: { organizationId: authCtx.organizationId },
          }).catch(() => [])
        : Promise.resolve([]),
    ]);

    // 1. Aggregate policy counts using a normalized case-insensitive key
    const countMap = new Map<string, number>();
    counts.forEach((c) => {
      if (c.category && c.category.trim()) {
        const normKey = c.category.trim().toLowerCase();
        countMap.set(normKey, (countMap.get(normKey) || 0) + c._count.id);
      }
    });

    // 2. Resolve canonical display name and default designation per normalized category key
    // Precedence: System Defaults > Durable PolicyCategory DB Records > Historical Policy Fallback
    const categoryRegistry = new Map<string, { id: string; name: string; isDefault: boolean }>();

    // Step 2a: Seed system default categories (authoritative casing and isDefault = true)
    DEFAULT_POLICY_CATEGORIES.forEach((def) => {
      const trimmed = def.trim();
      const normKey = trimmed.toLowerCase();
      categoryRegistry.set(normKey, {
        id: trimmed,
        name: trimmed,
        isDefault: true,
      });
    });

    // Step 2b: Durable PolicyCategory DB records (canonical custom categories take precedence over historical strings)
    customDbCategories.forEach((cat: any) => {
      if (cat.name && cat.name.trim()) {
        const trimmed = cat.name.trim();
        const normKey = trimmed.toLowerCase();
        // If not already a system default, record the durable custom category
        if (!categoryRegistry.has(normKey)) {
          categoryRegistry.set(normKey, {
            id: cat.id || trimmed,
            name: trimmed,
            isDefault: Boolean(cat.isDefault),
          });
        }
      }
    });

    // Step 2c: Fallback for historical legacy categories not in durable store or system defaults
    // Sort deterministically with binary comparison (preferring uppercase/title-case representations)
    const sortedCounts = [...counts]
      .filter((c) => Boolean(c.category && c.category.trim()))
      .sort((a, b) =>
        a.category.trim() < b.category.trim() ? -1 : a.category.trim() > b.category.trim() ? 1 : 0,
      );

    sortedCounts.forEach((c) => {
      const trimmed = c.category.trim();
      const normKey = trimmed.toLowerCase();
      if (!categoryRegistry.has(normKey)) {
        categoryRegistry.set(normKey, {
          id: trimmed,
          name: trimmed,
          isDefault: false,
        });
      }
    });

    // 3. Sort unified categories alphabetically by display name and map with aggregated counts
    return Array.from(categoryRegistry.values())
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((entry) => ({
        id: entry.id,
        name: entry.name,
        isDefault: entry.isDefault,
        policyCount: countMap.get(entry.name.toLowerCase()) || 0,
      }));
  }

  async createCategory(authCtx: ResourceAuthContext, name: string): Promise<PolicyCategoryDto> {
    const normalized = name ? name.trim() : '';
    if (!normalized) {
      throw new BadRequestException('Category name cannot be empty');
    }

    // Check duplicate against system defaults
    const isDefault = DEFAULT_POLICY_CATEGORIES.some(
      (def) => def.toLowerCase() === normalized.toLowerCase(),
    );
    if (isDefault) {
      throw new BadRequestException(`Policy category "${normalized}" already exists in this organization`);
    }

    // Check duplicate against persistent tenant categories
    if (this.prisma.policyCategory) {
      const existing = await this.prisma.policyCategory.findFirst({
        where: {
          organizationId: authCtx.organizationId,
          name: { equals: normalized, mode: 'insensitive' },
        },
      });
      if (existing) {
        throw new BadRequestException(`Policy category "${normalized}" already exists in this organization`);
      }
    }

    const created = this.prisma.policyCategory
      ? await this.prisma.policyCategory.create({
          data: {
            organizationId: authCtx.organizationId,
            name: normalized,
            isDefault: false,
          },
        })
      : { id: normalized, name: normalized, isDefault: false };

    await this.auditLogsService.log({
      organizationId: authCtx.organizationId,
      actorId: authCtx.userId,
      action: 'POLICY_CATEGORY_CREATED',
      entityType: 'PolicyCategory',
      entityId: created.id || normalized,
      metadata: { name: normalized },
    });

    return {
      id: created.id || normalized,
      name: normalized,
      isDefault: false,
      policyCount: 0,
    };
  }

  async renameCategory(
    authCtx: ResourceAuthContext,
    currentName: string,
    newName: string,
  ): Promise<PolicyCategoryDto> {
    const trimmedCurrent = currentName ? currentName.trim() : '';
    const trimmedNew = newName ? newName.trim() : '';

    if (!trimmedNew) {
      throw new BadRequestException('New category name cannot be empty');
    }

    if (trimmedCurrent.toLowerCase() !== trimmedNew.toLowerCase()) {
      const existingCategories = await this.listCategories(authCtx);
      const isDuplicate = existingCategories.some(
        (c) => c.name.toLowerCase() === trimmedNew.toLowerCase(),
      );
      if (isDuplicate) {
        throw new BadRequestException(`Category "${trimmedNew}" already exists`);
      }
    }

    const scopeWhere = await this.resourceAuthService.getScopeWhereClause(authCtx);
    const updateResult = await this.prisma.policy.updateMany({
      where: {
        ...scopeWhere,
        category: trimmedCurrent,
        deletedAt: null,
      },
      data: {
        category: trimmedNew,
      },
    });

    // Update persistent policyCategory record if available
    if (this.prisma.policyCategory) {
      const updateCatResult = await this.prisma.policyCategory.updateMany({
        where: {
          organizationId: authCtx.organizationId,
          name: { equals: trimmedCurrent, mode: 'insensitive' },
        },
        data: {
          name: trimmedNew,
        },
      });

      // If category wasn't explicitly stored yet, create it if not a default
      if (
        updateCatResult.count === 0 &&
        !DEFAULT_POLICY_CATEGORIES.some((def) => def.toLowerCase() === trimmedNew.toLowerCase())
      ) {
        await this.prisma.policyCategory
          .create({
            data: {
              organizationId: authCtx.organizationId,
              name: trimmedNew,
              isDefault: false,
            },
          })
          .catch(() => null);
      }
    }

    await this.auditLogsService.log({
      organizationId: authCtx.organizationId,
      actorId: authCtx.userId,
      action: 'POLICY_CATEGORY_RENAMED',
      entityType: 'PolicyCategory',
      entityId: trimmedNew,
      metadata: {
        oldName: trimmedCurrent,
        newName: trimmedNew,
        updatedPoliciesCount: updateResult.count,
      },
    });

    return {
      id: trimmedNew,
      name: trimmedNew,
      isDefault: DEFAULT_POLICY_CATEGORIES.some(
        (def) => def.toLowerCase() === trimmedNew.toLowerCase(),
      ),
      policyCount: updateResult.count,
    };
  }

  async deleteCategory(
    authCtx: ResourceAuthContext,
    categoryName: string,
  ): Promise<{ success: boolean; message: string }> {
    const normalized = categoryName ? categoryName.trim() : '';
    if (!normalized) {
      throw new BadRequestException('Category name cannot be empty');
    }

    const isDefault = DEFAULT_POLICY_CATEGORIES.some(
      (def) => def.toLowerCase() === normalized.toLowerCase(),
    );
    if (isDefault) {
      throw new BadRequestException(
        `System default category "${normalized}" cannot be removed.`,
      );
    }

    const scopeWhere = await this.resourceAuthService.getScopeWhereClause(authCtx);

    const activeCount = await this.prisma.policy.count({
      where: {
        ...scopeWhere,
        category: normalized,
        deletedAt: null,
      },
    });

    if (activeCount > 0) {
      throw new BadRequestException(
        `Cannot delete category "${normalized}" because it is currently assigned to ${activeCount} active policy/policies. Please reassign or update these policies before deleting the category.`,
      );
    }

    // Delete from persistent database table
    if (this.prisma.policyCategory) {
      await this.prisma.policyCategory.deleteMany({
        where: {
          organizationId: authCtx.organizationId,
          name: { equals: normalized, mode: 'insensitive' },
        },
      });
    }

    await this.auditLogsService.log({
      organizationId: authCtx.organizationId,
      actorId: authCtx.userId,
      action: 'POLICY_CATEGORY_DELETED',
      entityType: 'PolicyCategory',
      entityId: normalized,
      metadata: { name: normalized },
    });

    return {
      success: true,
      message: `Policy category "${normalized}" successfully deleted.`,
    };
  }

  async createVersion(
    authCtx: ResourceAuthContext,
    policyId: string,
    dto: CreatePolicyVersionDto,
  ): Promise<PolicyVersionDto> {
    if (
      dto.expectedVersion === undefined ||
      dto.expectedVersion === null ||
      typeof dto.expectedVersion !== 'number' ||
      dto.expectedVersion < 1
    ) {
      throw new BadRequestException('expectedVersion is mandatory and must be a positive integer');
    }

    const scopeWhere = await this.resourceAuthService.getScopeWhereClause(authCtx);
    const policy = await this.prisma.policy.findFirst({
      where: { id: policyId, ...scopeWhere, deletedAt: null },
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

    const version = await this.prisma.$transaction(async (tx) => {
      const v = await tx.policyVersion.create({
        data: {
          policyId,
          versionNumber: dto.versionNumber,
          content: dto.content,
          changeLog: dto.changeLog || null,
          createdById: authCtx.userId,
        },
      });

      const updateResult = await tx.policy.updateMany({
        where: {
          id: policyId,
          organizationId: authCtx.organizationId,
          deletedAt: null,
          version: dto.expectedVersion,
        },
        data: { version: { increment: 1 } },
      });

      if (updateResult.count === 0) {
        const current = await tx.policy.findFirst({
          where: { id: policyId, organizationId: authCtx.organizationId, deletedAt: null },
          select: { version: true },
        });
        if (!current) throw new NotFoundException(`Policy with ID "${policyId}" not found`);
        throw new ConflictException(
          `Policy revision conflict: expected version ${dto.expectedVersion}, but current version is ${current.version}. Please reload the latest changes.`,
        );
      }

      await this.auditLogsService.log(
        {
          organizationId: authCtx.organizationId,
          actorId: authCtx.userId,
          action: 'POLICY_VERSION_CREATED',
          entityType: 'PolicyVersion',
          entityId: v.id,
          metadata: {
            policyCode: policy.code,
            versionNumber: v.versionNumber,
          },
        },
        tx,
      );

      return v;
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

  async submitForReview(authCtx: ResourceAuthContext, id: string, expectedVersion: number): Promise<PolicyDto> {
    if (authCtx.role === Role.EXTERNAL_AUDITOR) {
      throw new ForbiddenException('External auditors cannot submit policies for review');
    }

    if (
      expectedVersion === undefined ||
      expectedVersion === null ||
      typeof expectedVersion !== 'number' ||
      expectedVersion < 1
    ) {
      throw new BadRequestException('expectedVersion is mandatory and must be a positive integer');
    }

    const scopeWhere = await this.resourceAuthService.getScopeWhereClause(authCtx);
    const policy = await this.prisma.policy.findFirst({
      where: { id, ...scopeWhere, deletedAt: null },
    });

    if (!policy) throw new NotFoundException(`Policy with ID "${id}" not found`);
    if (policy.status !== PolicyStatus.DRAFT) {
      throw new BadRequestException(`Cannot submit policy for review from state "${policy.status}". Must be DRAFT.`);
    }

    return this.prisma.$transaction(async (tx) => {
      const updateResult = await tx.policy.updateMany({
        where: {
          id,
          organizationId: authCtx.organizationId,
          deletedAt: null,
          status: PolicyStatus.DRAFT,
          version: expectedVersion,
        },
        data: {
          status: PolicyStatus.UNDER_REVIEW,
          version: { increment: 1 },
        },
      });

      if (updateResult.count === 0) {
        const current = await tx.policy.findFirst({
          where: { id, organizationId: authCtx.organizationId, deletedAt: null },
          select: { id: true, status: true, version: true },
        });
        if (!current) throw new NotFoundException(`Policy with ID "${id}" not found`);
        if (current.status !== PolicyStatus.DRAFT) {
          throw new BadRequestException(`Cannot submit policy for review from state "${current.status}". Must be DRAFT.`);
        }
        throw new ConflictException(
          `Policy revision conflict: expected version ${expectedVersion}, but current version is ${current.version}. Please reload the latest changes.`,
        );
      }

      const updated = await tx.policy.findUniqueOrThrow({
        where: { id },
        include: {
          publishedVersion: true,
          versions: true,
          _count: { select: { controlAssociations: true } },
        },
      });

      await this.auditLogsService.log(
        {
          organizationId: authCtx.organizationId,
          actorId: authCtx.userId,
          action: 'POLICY_SUBMITTED_FOR_REVIEW',
          entityType: 'Policy',
          entityId: id,
          metadata: {
            code: updated.code,
            previousStatus: policy.status,
            newStatus: updated.status,
            version: updated.version,
          },
        },
        tx,
      );

      return this.mapToDto(updated);
    });
  }

  async approve(authCtx: ResourceAuthContext, id: string, expectedVersion: number): Promise<PolicyDto> {
    if (authCtx.role !== Role.ADMIN && authCtx.role !== Role.MSSP_ADMIN) {
      throw new ForbiddenException('Only ADMIN users can approve policy documents');
    }

    if (
      expectedVersion === undefined ||
      expectedVersion === null ||
      typeof expectedVersion !== 'number' ||
      expectedVersion < 1
    ) {
      throw new BadRequestException('expectedVersion is mandatory and must be a positive integer');
    }

    const scopeWhere = await this.resourceAuthService.getScopeWhereClause(authCtx);
    const policy = await this.prisma.policy.findFirst({
      where: { id, ...scopeWhere, deletedAt: null },
    });

    if (!policy) throw new NotFoundException(`Policy with ID "${id}" not found`);
    if (policy.status !== PolicyStatus.UNDER_REVIEW) {
      throw new BadRequestException(`Cannot approve policy from state "${policy.status}". Must be UNDER_REVIEW.`);
    }

    const updatedDto = await this.prisma.$transaction(async (tx) => {
      const updateResult = await tx.policy.updateMany({
        where: {
          id,
          organizationId: authCtx.organizationId,
          deletedAt: null,
          status: PolicyStatus.UNDER_REVIEW,
          version: expectedVersion,
        },
        data: {
          status: PolicyStatus.APPROVED,
          version: { increment: 1 },
        },
      });

      if (updateResult.count === 0) {
        const current = await tx.policy.findFirst({
          where: { id, organizationId: authCtx.organizationId, deletedAt: null },
          select: { id: true, status: true, version: true },
        });
        if (!current) throw new NotFoundException(`Policy with ID "${id}" not found`);
        if (current.status !== PolicyStatus.UNDER_REVIEW) {
          throw new BadRequestException(`Cannot approve policy from state "${current.status}". Must be UNDER_REVIEW.`);
        }
        throw new ConflictException(
          `Policy revision conflict: expected version ${expectedVersion}, but current version is ${current.version}. Please reload the latest changes.`,
        );
      }

      const updated = await tx.policy.findUniqueOrThrow({
        where: { id },
        include: {
          publishedVersion: true,
          versions: true,
          _count: { select: { controlAssociations: true } },
        },
      });

      await this.auditLogsService.log(
        {
          organizationId: authCtx.organizationId,
          actorId: authCtx.userId,
          action: 'POLICY_APPROVED',
          entityType: 'Policy',
          entityId: id,
          metadata: {
            code: updated.code,
            previousStatus: policy.status,
            newStatus: updated.status,
            version: updated.version,
          },
        },
        tx,
      );

      return this.mapToDto(updated);
    });

    if (this.notificationsService && updatedDto.ownerId) {
      await this.notificationsService.notify({
        organizationId: authCtx.organizationId,
        userId: updatedDto.ownerId,
        type: NotificationType.TASK_ASSIGNED,
        message: `Policy "${updatedDto.title}" (${updatedDto.code}) has been approved.`,
        entityType: 'Policy',
        entityId: id,
      });
    }

    return updatedDto;
  }

  async reject(
    authCtx: ResourceAuthContext,
    id: string,
    reason?: string,
    expectedVersion?: number,
  ): Promise<PolicyDto> {
    if (authCtx.role !== Role.ADMIN && authCtx.role !== Role.MSSP_ADMIN) {
      throw new ForbiddenException('Only ADMIN users can reject policy documents');
    }

    if (!reason || !reason.trim()) {
      throw new BadRequestException('A non-empty rejection reason is required to reject a policy under review');
    }

    if (
      expectedVersion === undefined ||
      expectedVersion === null ||
      typeof expectedVersion !== 'number' ||
      expectedVersion < 1
    ) {
      throw new BadRequestException('expectedVersion is mandatory and must be a positive integer');
    }

    const scopeWhere = await this.resourceAuthService.getScopeWhereClause(authCtx);
    const policy = await this.prisma.policy.findFirst({
      where: { id, ...scopeWhere, deletedAt: null },
    });

    if (!policy) throw new NotFoundException(`Policy with ID "${id}" not found`);
    if (policy.status !== PolicyStatus.UNDER_REVIEW) {
      throw new BadRequestException(`Cannot reject policy from state "${policy.status}". Must be UNDER_REVIEW.`);
    }

    const updatedDto = await this.prisma.$transaction(async (tx) => {
      const updateResult = await tx.policy.updateMany({
        where: {
          id,
          organizationId: authCtx.organizationId,
          deletedAt: null,
          status: PolicyStatus.UNDER_REVIEW,
          version: expectedVersion,
        },
        data: {
          status: PolicyStatus.DRAFT,
          version: { increment: 1 },
        },
      });

      if (updateResult.count === 0) {
        const current = await tx.policy.findFirst({
          where: { id, organizationId: authCtx.organizationId, deletedAt: null },
          select: { id: true, status: true, version: true },
        });
        if (!current) throw new NotFoundException(`Policy with ID "${id}" not found`);
        if (current.status !== PolicyStatus.UNDER_REVIEW) {
          throw new BadRequestException(`Cannot reject policy from state "${current.status}". Must be UNDER_REVIEW.`);
        }
        throw new ConflictException(
          `Policy revision conflict: expected version ${expectedVersion}, but current version is ${current.version}. Please reload the latest changes.`,
        );
      }

      const updated = await tx.policy.findUniqueOrThrow({
        where: { id },
        include: {
          publishedVersion: true,
          versions: true,
          _count: {
            select: {
              controlAssociations: true,
            },
          },
        },
      });

      await this.auditLogsService.log(
        {
          organizationId: authCtx.organizationId,
          actorId: authCtx.userId,
          action: 'POLICY_REJECTED',
          entityType: 'Policy',
          entityId: id,
          metadata: {
            code: updated.code,
            previousStatus: policy.status,
            newStatus: updated.status,
            version: updated.version,
            reason: reason.trim(),
          },
        },
        tx,
      );

      return this.mapToDto(updated);
    });

    if (this.notificationsService && updatedDto.ownerId) {
      await this.notificationsService.notify({
        organizationId: authCtx.organizationId,
        userId: updatedDto.ownerId,
        type: NotificationType.TASK_ASSIGNED,
        message: `Policy "${updatedDto.title}" (${updatedDto.code}) review was rejected and returned to Draft. Reason: ${reason.trim()}`,
        entityType: 'Policy',
        entityId: id,
      });
    }

    return updatedDto;
  }

  async publish(
    authCtx: ResourceAuthContext,
    id: string,
    versionId?: string,
    expectedVersion?: number,
  ): Promise<PolicyDto> {
    if (authCtx.role !== Role.ADMIN && authCtx.role !== Role.MSSP_ADMIN) {
      throw new ForbiddenException('Only ADMIN users can publish policy documents');
    }

    if (
      expectedVersion === undefined ||
      expectedVersion === null ||
      typeof expectedVersion !== 'number' ||
      expectedVersion < 1
    ) {
      throw new BadRequestException('expectedVersion is mandatory and must be a positive integer');
    }

    const scopeWhere = await this.resourceAuthService.getScopeWhereClause(authCtx);
    const policy = await this.prisma.policy.findFirst({
      where: { id, ...scopeWhere, deletedAt: null },
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

    return this.prisma.$transaction(async (tx) => {
      const updateResult = await tx.policy.updateMany({
        where: {
          id,
          organizationId: authCtx.organizationId,
          deletedAt: null,
          status: PolicyStatus.APPROVED,
          version: expectedVersion,
        },
        data: {
          status: PolicyStatus.PUBLISHED,
          publishedVersionId: versionToPublish.id,
          effectiveDate,
          reviewDate,
          version: { increment: 1 },
        },
      });

      if (updateResult.count === 0) {
        const current = await tx.policy.findFirst({
          where: { id, organizationId: authCtx.organizationId, deletedAt: null },
          select: { id: true, status: true, version: true },
        });
        if (!current) throw new NotFoundException(`Policy with ID "${id}" not found`);
        if (current.status !== PolicyStatus.APPROVED) {
          throw new BadRequestException(`Cannot publish policy from state "${current.status}". Must be APPROVED.`);
        }
        throw new ConflictException(
          `Policy revision conflict: expected version ${expectedVersion}, but current version is ${current.version}. Please reload the latest changes.`,
        );
      }

      const updated = await tx.policy.findUniqueOrThrow({
        where: { id },
        include: {
          publishedVersion: true,
          versions: true,
          _count: { select: { controlAssociations: true } },
        },
      });

      await this.auditLogsService.log(
        {
          organizationId: authCtx.organizationId,
          actorId: authCtx.userId,
          action: 'POLICY_PUBLISHED',
          entityType: 'Policy',
          entityId: id,
          metadata: {
            code: updated.code,
            versionNumber: versionToPublish.versionNumber,
            effectiveDate: effectiveDate.toISOString(),
            previousStatus: policy.status,
            newStatus: updated.status,
            version: updated.version,
          },
        },
        tx,
      );

      return this.mapToDto(updated);
    });
  }

  async retire(authCtx: ResourceAuthContext, id: string, expectedVersion: number): Promise<PolicyDto> {
    if (authCtx.role !== Role.ADMIN && authCtx.role !== Role.MSSP_ADMIN) {
      throw new ForbiddenException('Only ADMIN users can retire policy documents');
    }

    if (
      expectedVersion === undefined ||
      expectedVersion === null ||
      typeof expectedVersion !== 'number' ||
      expectedVersion < 1
    ) {
      throw new BadRequestException('expectedVersion is mandatory and must be a positive integer');
    }

    const scopeWhere = await this.resourceAuthService.getScopeWhereClause(authCtx);
    const policy = await this.prisma.policy.findFirst({
      where: { id, ...scopeWhere, deletedAt: null },
    });

    if (!policy) throw new NotFoundException(`Policy with ID "${id}" not found`);
    if (policy.status !== PolicyStatus.PUBLISHED) {
      throw new BadRequestException(`Cannot retire policy from state "${policy.status}". Must be PUBLISHED.`);
    }

    return this.prisma.$transaction(async (tx) => {
      const updateResult = await tx.policy.updateMany({
        where: {
          id,
          organizationId: authCtx.organizationId,
          deletedAt: null,
          status: PolicyStatus.PUBLISHED,
          version: expectedVersion,
        },
        data: {
          status: PolicyStatus.RETIRED,
          version: { increment: 1 },
        },
      });

      if (updateResult.count === 0) {
        const current = await tx.policy.findFirst({
          where: { id, organizationId: authCtx.organizationId, deletedAt: null },
          select: { id: true, status: true, version: true },
        });
        if (!current) throw new NotFoundException(`Policy with ID "${id}" not found`);
        if (current.status !== PolicyStatus.PUBLISHED) {
          throw new BadRequestException(`Cannot retire policy from state "${current.status}". Must be PUBLISHED.`);
        }
        throw new ConflictException(
          `Policy revision conflict: expected version ${expectedVersion}, but current version is ${current.version}. Please reload the latest changes.`,
        );
      }

      const updated = await tx.policy.findUniqueOrThrow({
        where: { id },
        include: {
          publishedVersion: true,
          versions: true,
          _count: { select: { controlAssociations: true } },
        },
      });

      await this.auditLogsService.log(
        {
          organizationId: authCtx.organizationId,
          actorId: authCtx.userId,
          action: 'POLICY_RETIRED',
          entityType: 'Policy',
          entityId: id,
          metadata: {
            code: updated.code,
            previousStatus: policy.status,
            newStatus: updated.status,
            version: updated.version,
          },
        },
        tx,
      );

      return this.mapToDto(updated);
    });
  }

  async attestVersion(
    authCtx: ResourceAuthContext,
    versionId: string,
    ipAddress?: string,
  ): Promise<PolicyAttestationDto> {
    const scopeWhere = await this.resourceAuthService.getScopeWhereClause(authCtx);
    const version = await this.prisma.policyVersion.findUnique({
      where: { id: versionId },
      include: { policy: true },
    });

    if (!version) {
      throw new NotFoundException(`Policy version with ID "${versionId}" not found`);
    }

    await this.resourceAuthService.assertResourceAccess(authCtx, version.policy);

    const existingAttestation = await this.prisma.policyAttestation.findUnique({
      where: {
        policyVersionId_userId: {
          policyVersionId: versionId,
          userId: authCtx.userId,
        },
      },
    });

    if (existingAttestation) {
      throw new BadRequestException('You have already attested to this policy version.');
    }

    const attestation = await this.prisma.policyAttestation.create({
      data: {
        organizationId: authCtx.organizationId,
        policyVersionId: versionId,
        userId: authCtx.userId,
        ipAddress: ipAddress || null,
      },
    });

    await this.auditLogsService.log({
      organizationId: authCtx.organizationId,
      actorId: authCtx.userId,
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

  async attestPolicy(
    authCtx: ResourceAuthContext,
    policyId: string,
    ipAddress?: string,
  ): Promise<PolicyAttestationDto> {
    const scopeWhere = await this.resourceAuthService.getScopeWhereClause(authCtx);
    const policy = await this.prisma.policy.findFirst({
      where: { id: policyId, ...scopeWhere, deletedAt: null },
      include: { publishedVersion: true },
    });

    if (!policy) {
      throw new NotFoundException(`Policy with ID "${policyId}" not found`);
    }

    if (policy.status !== PolicyStatus.PUBLISHED || !policy.publishedVersionId) {
      throw new BadRequestException(`Policy "${policy.code}" is not published or has no published version.`);
    }

    // Check duplicate attestation for this specific published version
    const existing = await this.prisma.policyAttestation.findUnique({
      where: {
        policyVersionId_userId: {
          policyVersionId: policy.publishedVersionId,
          userId: authCtx.userId,
        },
      },
    });

    if (existing) {
      // Idempotent return of existing acknowledgement
      return {
        id: existing.id,
        organizationId: existing.organizationId,
        policyVersionId: existing.policyVersionId,
        userId: existing.userId,
        attestedAt: existing.attestedAt.toISOString(),
        ipAddress: existing.ipAddress,
      };
    }

    const attestation = await this.prisma.policyAttestation.create({
      data: {
        organizationId: authCtx.organizationId,
        policyVersionId: policy.publishedVersionId,
        userId: authCtx.userId,
        ipAddress: ipAddress || null,
      },
    });

    await this.auditLogsService.log({
      organizationId: authCtx.organizationId,
      actorId: authCtx.userId,
      action: 'POLICY_ATTESTED',
      entityType: 'PolicyAttestation',
      entityId: attestation.id,
      metadata: {
        policyCode: policy.code,
        versionId: policy.publishedVersionId,
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

  async getPolicyAttestations(
    authCtx: ResourceAuthContext,
    policyId: string,
    versionId?: string,
  ): Promise<PolicyAttestationDto[]> {
    const scopeWhere = await this.resourceAuthService.getScopeWhereClause(authCtx);
    const policy = await this.prisma.policy.findFirst({
      where: { id: policyId, ...scopeWhere, deletedAt: null },
      include: { versions: true },
    });

    if (!policy) {
      throw new NotFoundException(`Policy with ID "${policyId}" not found`);
    }

    const targetVersionIds = versionId
      ? [versionId]
      : policy.versions.map((v) => v.id);

    const attestations = await this.prisma.policyAttestation.findMany({
      where: {
        organizationId: authCtx.organizationId,
        policyVersionId: { in: targetVersionIds },
      },
      orderBy: { attestedAt: 'desc' },
    });

    return attestations.map((a) => ({
      id: a.id,
      organizationId: a.organizationId,
      policyVersionId: a.policyVersionId,
      userId: a.userId,
      attestedAt: a.attestedAt.toISOString(),
      ipAddress: a.ipAddress,
    }));
  }

  async getPolicyAcknowledgementSummary(
    authCtx: ResourceAuthContext,
    policyId: string,
  ): Promise<PolicyAttestationSummaryDto> {
    const scopeWhere = await this.resourceAuthService.getScopeWhereClause(authCtx);
    const policy = await this.prisma.policy.findFirst({
      where: { id: policyId, ...scopeWhere, deletedAt: null },
      include: { publishedVersion: true },
    });

    if (!policy) {
      throw new NotFoundException(`Policy with ID "${policyId}" not found`);
    }

    if (!policy.publishedVersionId || !policy.publishedVersion) {
      return {
        policyId: policy.id,
        policyCode: policy.code,
        policyTitle: policy.title,
        versionId: '',
        versionNumber: 'None',
        totalEligibleUsers: 0,
        attestedUsersCount: 0,
        pendingUsersCount: 0,
        compliancePercentage: 0,
        attestations: [],
      };
    }

    const [totalUsers, attestations] = await Promise.all([
      this.prisma.organizationMembership.count({
        where: { organizationId: authCtx.organizationId },
      }),
      this.prisma.policyAttestation.findMany({
        where: {
          organizationId: authCtx.organizationId,
          policyVersionId: policy.publishedVersionId,
        },
        orderBy: { attestedAt: 'desc' },
      }),
    ]);

    const attestedCount = attestations.length;
    const totalEligible = Math.max(totalUsers, attestedCount);
    const pendingCount = Math.max(0, totalEligible - attestedCount);
    const compliancePct = totalEligible > 0 ? Math.round((attestedCount / totalEligible) * 100) : 0;

    return {
      policyId: policy.id,
      policyCode: policy.code,
      policyTitle: policy.title,
      versionId: policy.publishedVersion.id,
      versionNumber: policy.publishedVersion.versionNumber,
      totalEligibleUsers: totalEligible,
      attestedUsersCount: attestedCount,
      pendingUsersCount: pendingCount,
      compliancePercentage: compliancePct,
      attestations: attestations.map((a) => ({
        id: a.id,
        userId: a.userId,
        attestedAt: a.attestedAt.toISOString(),
        ipAddress: a.ipAddress,
      })),
    };
  }

  async getMyPendingPolicies(authCtx: ResourceAuthContext): Promise<PolicyDto[]> {
    const scopeWhere = await this.resourceAuthService.getScopeWhereClause(authCtx);

    // 1. All published policies for organization
    const publishedPolicies = await this.prisma.policy.findMany({
      where: {
        ...scopeWhere,
        status: PolicyStatus.PUBLISHED,
        publishedVersionId: { not: null },
        deletedAt: null,
      },
      include: {
        publishedVersion: true,
        versions: { orderBy: { createdAt: 'desc' } },
      },
      orderBy: { updatedAt: 'desc' },
    });

    // 2. All attestations for this user in this organization
    const myAttestations = await this.prisma.policyAttestation.findMany({
      where: {
        organizationId: authCtx.organizationId,
        userId: authCtx.userId,
      },
      select: { policyVersionId: true },
    });
    const attestedVersionIds = new Set(myAttestations.map((a) => a.policyVersionId));

    // 3. Filter to policies where current published version is NOT attested
    const pending = publishedPolicies.filter(
      (p) => p.publishedVersionId && !attestedVersionIds.has(p.publishedVersionId),
    );

    return pending.map((p) => this.mapToDto(p));
  }

  async submitForApproval(
    authCtx: ResourceAuthContext,
    policyId: string,
    dto: SubmitPolicyApprovalDto,
  ) {
    const scopeWhere = await this.resourceAuthService.getScopeWhereClause(authCtx);
    const policy = await this.prisma.policy.findFirst({
      where: { id: policyId, ...scopeWhere, deletedAt: null },
    });

    if (!policy) throw new NotFoundException(`Policy with ID "${policyId}" not found`);

    if (!this.approvalEngineService) {
      throw new BadRequestException('Approval engine service is not available.');
    }

    const title = dto.title?.trim() || `Policy Approval: ${policy.code} - ${policy.title}`;
    const instance = await this.approvalEngineService.createApprovalInstance(
      authCtx.organizationId,
      authCtx.userId,
      {
        title,
        description: policy.description || `Approval request for policy ${policy.code}`,
        resourceType: 'POLICY',
        resourceId: policy.id,
        workflowId: dto.workflowId,
        purpose: 'POLICY_APPROVAL' as any,
        dueDays: dto.dueDays || 7,
      },
    );

    await this.auditLogsService.log({
      organizationId: authCtx.organizationId,
      actorId: authCtx.userId,
      action: 'POLICY_APPROVAL_SUBMITTED',
      entityType: 'Policy',
      entityId: policy.id,
      metadata: { approvalInstanceId: instance.id },
    });

    if (this.notificationsService && policy.ownerId) {
      await this.notificationsService.notify({
        organizationId: authCtx.organizationId,
        userId: policy.ownerId,
        type: NotificationType.TASK_ASSIGNED,
        message: `Policy "${policy.title}" (${policy.code}) has been submitted for approval.`,
        entityType: 'Policy',
        entityId: policy.id,
      });
    }

    return instance;
  }

  async createException(
    authCtx: ResourceAuthContext,
    policyId: string,
    dto: CreatePolicyExceptionDto,
  ): Promise<PolicyExceptionDto> {
    const scopeWhere = await this.resourceAuthService.getScopeWhereClause(authCtx);
    const policy = await this.prisma.policy.findFirst({
      where: { id: policyId, ...scopeWhere, deletedAt: null },
    });

    if (!policy) throw new NotFoundException(`Policy with ID "${policyId}" not found`);

    const exception = await this.prisma.policyException.create({
      data: {
        organizationId: authCtx.organizationId,
        policyId,
        title: dto.title,
        reason: dto.reason,
        requestedById: authCtx.userId,
        status: PolicyExceptionStatus.PENDING,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
      },
    });

    await this.auditLogsService.log({
      organizationId: authCtx.organizationId,
      actorId: authCtx.userId,
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

  async generateAiDraft(
    authCtx: ResourceAuthContext,
    dto: AiDraftPolicyDto,
  ): Promise<{
    content: string;
    suggestedTitle: string;
    suggestedCode: string;
    suggestedCategory: string;
    suggestedCadenceDays: number;
    providerUsed: string;
  }> {
    const org = await this.prisma.organization.findUnique({
      where: { id: authCtx.organizationId },
      select: { name: true },
    });
    const companyName = dto.companyContext || org?.name || 'Enterprise Organization';
    const category = dto.category || 'Information Security';
    const title = dto.title.trim();
    const policyType = dto.policyType || 'INTERNAL';
    const standard = dto.standardOrFramework || 'ISO 27001 / SOC 2 / NIST CSF';
    const depth = dto.pageDepth || 'STANDARD';

    // Formulate structured prompt for GRC policy creation
    const systemPrompt = `You are an elite enterprise Governance, Risk, and Compliance (GRC) architect and lead policy author for ${companyName}.
Your objective is to generate an authoritative, audit-ready, standard-aligned GRC policy document formatted cleanly in GitHub Flavored Markdown.
The policy must adhere strictly to modern compliance frameworks including ${standard}.
Always produce formal sections:
1. Document Control & Version History (table with Version, Date, Author, Change Summary)
2. Purpose & Objective
3. Scope & Target Audience (${dto.targetAudience || 'All full-time employees, contractors, third-party vendors, and system administrators'})
4. Policy Statements & Requirements (bulleted or numbered clauses with clear SHALL/MUST terminology)
5. Roles & Responsibilities (RACI or role table: Executive Leadership, CISO / SecOps, Line Managers, All Personnel)
6. Exceptions, Waivers & Escalation Procedure
7. Compliance Monitoring, Auditing & Enforcement (penalties for non-compliance)
8. Review Cadence & Document Maintenance
Do not output preamble or conversational filler. Return only the complete Markdown document.`;

    const userPrompt = `Generate a ${depth} enterprise ${category} policy document titled "${title}".
Policy Classification: ${policyType}
Company Context: ${companyName}
Applicable Regulatory / Security Standards: ${standard}
Key Specific Requirements to Incorporate:
${dto.keyRequirements || 'Standard enterprise controls, zero trust access principles, audit logging, incident notification SLAs, and data protection rules.'}`;

    let content = '';
    let providerUsed = 'GRC Template Generator';

    // 1. Try Claude first (User preferred for Policy Drafting)
    if (this.claudeProvider && this.claudeProvider.isAvailable()) {
      try {
        content = await this.claudeProvider.generateText(systemPrompt, userPrompt);
        providerUsed = 'Claude (Anthropic)';
      } catch (err: any) {
        // Fallback to Gemini if Claude call fails
      }
    }

    // 2. Fallback to Gemini if content empty
    if (!content && this.geminiProvider && this.geminiProvider.isAvailable()) {
      try {
        content = await this.geminiProvider.generateText(systemPrompt, userPrompt);
        providerUsed = 'Gemini (Google)';
      } catch (err: any) {
        // Fallback to deterministic template
      }
    }

    // 3. Fallback to rich deterministic template if AI providers unavailable in local environment
    if (!content) {
      const catCode = category.slice(0, 3).toUpperCase();
      content = `# ${title}

## 1. Document Control & Metadata
| Property | Value |
| :--- | :--- |
| **Organization** | ${companyName} |
| **Classification** | ${policyType} |
| **Applicable Standards** | ${standard} |
| **Effective Date** | ${new Date().toISOString().split('T')[0]} |
| **Review Cadence** | Annual (365 Days) |
| **Document Owner** | Chief Information Security Officer (CISO) |

### Version History
| Version | Date | Author | Description of Changes |
| :--- | :--- | :--- | :--- |
| 1.0 | ${new Date().toISOString().split('T')[0]} | GRC Lead | Initial Draft generated for review |

---

## 2. Purpose & Objectives
The purpose of this ${title} is to define the mandatory requirements and baseline practices for ${companyName} to safeguard information assets, uphold data integrity, and guarantee operational continuity. This policy aligns with the security benchmarks specified in **${standard}**.

Key objectives include:
* Ensuring adequate protection against unauthorized access, disclosure, alteration, and disruption.
* Demonstrating adherence to regulatory requirements and contractual obligations.
* Establishing clear accountability for data custody and system governance.

---

## 3. Scope & Target Audience
This policy applies to:
* All personnel, including permanent employees, temporary contractors, interns, and third-party vendors accessing ${companyName} infrastructure or processing company information.
* All corporate endpoints, cloud platforms, networks, data repositories, and on-premise hardware.
* Scope classification: **${policyType}**.

---

## 4. Policy Statements & Requirements

### 4.1 Governance & Operational Baseline
1. All users **MUST** authenticate via centralized Single Sign-On (SSO) with Multi-Factor Authentication (MFA) enabled for all corporate systems and services.
2. Access rights **SHALL** follow the Principle of Least Privilege (PoLP) and role-based access control (RBAC).
3. Privilege access reviews **MUST** occur quarterly, with immediate deprovisioning upon employee or contractor separation within 24 hours.

### 4.2 Security Controls & Asset Protection
1. All corporate workstations and mobile devices accessing enterprise systems **MUST** be enrolled in Mobile Device Management (MDM) with disk encryption (AES-256) active.
2. Critical security patches and high-severity vulnerability fixes **MUST** be deployed within 14 calendar days of vendor release.
3. Production data **SHALL NOT** be utilized in non-production, staging, or testing environments without approved cryptographic masking.

### 4.3 Incident Response & Escalation
1. Any suspected or confirmed security breach, unauthorized access, or loss of corporate assets **MUST** be reported immediately (within 60 minutes) to the Security Operations Center (SOC).
2. The Incident Response Team **SHALL** initiate containment protocols in accordance with the Incident Management Playbook.

---

## 5. Roles & Responsibilities
| Role | Responsibility |
| :--- | :--- |
| **Executive Leadership** | Approves policy, allocates resources, and enforces corporate accountability. |
| **CISO & Security Team** | Maintains policy, conducts vulnerability assessments, and monitors compliance metrics. |
| **Department Managers** | Ensures direct reports complete mandatory policy acknowledgements and adhere to controls. |
| **All Personnel** | Adheres to policy rules, completes training, and reports anomalies promptly. |

---

## 6. Exceptions & Waivers
Any temporary deviation or business exception to this policy **MUST** be formally requested via the OMNiGRC Policy Exception Workflow.
* Exceptions require written approval from the CISO and designated Risk Owner.
* Approved waivers expire after a maximum of 180 days, requiring reassessment and compensatory security controls.

---

## 7. Compliance Monitoring & Enforcement
* Compliance with this policy is subject to ongoing automated telemetry, periodic internal audits, and external assessments.
* Violations of this policy may result in disciplinary action up to and including revocation of system access, termination of employment, and legal proceedings where applicable.

---

## 8. Review Schedule
This policy shall be formally reviewed at least annually or following material architectural or regulatory modifications to ensure ongoing fitness and alignment with **${standard}**.`;
    }

    // Code suggestion: POL-{CAT_PREFIX}-{RANDOM_3_DIGITS}
    const catPrefix = category.replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase() || 'GEN';
    const randomNum = Math.floor(100 + Math.random() * 900);
    const suggestedCode = `POL-${catPrefix}-${randomNum}`;

    await this.auditLogsService.log({
      organizationId: authCtx.organizationId,
      actorId: authCtx.userId,
      action: 'POLICY_AI_DRAFT_GENERATED',
      entityType: 'Policy',
      entityId: suggestedCode,
      metadata: {
        title,
        category,
        standard,
        providerUsed,
      },
    });

    return {
      content,
      suggestedTitle: title,
      suggestedCode,
      suggestedCategory: category,
      suggestedCadenceDays: 365,
      providerUsed,
    };
  }

  async validatePolicyWithAi(
    authCtx: ResourceAuthContext,
    id: string,
  ): Promise<{
    policyId: string;
    policyCode: string;
    overallScore: number;
    status: 'PASSED' | 'NEEDS_REVISION' | 'DEFICIENT';
    findings: Array<{
      severity: 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';
      section: string;
      title: string;
      description: string;
      recommendation: string;
    }>;
    validatedAt: string;
    modelUsed: string;
  }> {
    const scopeWhere = await this.resourceAuthService.getScopeWhereClause(authCtx);
    const policy = await this.prisma.policy.findFirst({
      where: { id, ...scopeWhere, deletedAt: null },
      include: {
        publishedVersion: true,
        versions: { orderBy: { createdAt: 'desc' }, take: 1 },
        controlAssociations: true,
      },
    });

    if (!policy) throw new NotFoundException(`Policy with ID "${id}" not found`);

    const content =
      policy.versions?.[0]?.content ||
      policy.publishedVersion?.content ||
      policy.description ||
      '';

    let overallScore = 85;
    let status: 'PASSED' | 'NEEDS_REVISION' | 'DEFICIENT' = 'PASSED';
    let findings: Array<{
      severity: 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';
      section: string;
      title: string;
      description: string;
      recommendation: string;
    }> = [];
    let modelUsed = 'Gemini (Google)';

    const systemPrompt = `You are an elite ISO 27001 / SOC 2 / NIST GRC lead auditor reviewing an organizational security policy.
Evaluate the policy text for:
1. Completeness of Purpose, Scope, Specific Requirements, Roles, Exception Handling, Enforcement.
2. Clear normative language (MUST, SHALL, PROHIBITED).
3. Measurability and audit readiness.
Respond in valid JSON only matching schema:
{
  "overallScore": number (0-100),
  "status": "PASSED" | "NEEDS_REVISION" | "DEFICIENT",
  "findings": [
    {
      "severity": "HIGH" | "MEDIUM" | "LOW" | "INFO",
      "section": string,
      "title": string,
      "description": string,
      "recommendation": string
    }
  ]
}`;

    const userPrompt = `Evaluate this policy document:
Title: "${policy.title}"
Code: "${policy.code}"
Category: "${policy.category}"
Content:
${content.slice(0, 12000)}`;

    let aiRaw = '';
    // Priority 1: Gemini (User preferred for Policy Validation)
    if (this.geminiProvider && this.geminiProvider.isAvailable()) {
      try {
        aiRaw = await this.geminiProvider.generateText(systemPrompt, userPrompt);
        modelUsed = 'Gemini 1.5 Flash';
      } catch (err) {
        // Fallback
      }
    }

    if (!aiRaw && this.claudeProvider && this.claudeProvider.isAvailable()) {
      try {
        aiRaw = await this.claudeProvider.generateText(systemPrompt, userPrompt);
        modelUsed = 'Claude Haiku';
      } catch (err) {
        // Fallback
      }
    }

    if (aiRaw) {
      try {
        const cleanJson = aiRaw.replace(/```json/gi, '').replace(/```/g, '').trim();
        const parsed = JSON.parse(cleanJson);
        if (typeof parsed.overallScore === 'number') overallScore = parsed.overallScore;
        if (parsed.status) status = parsed.status;
        if (Array.isArray(parsed.findings)) findings = parsed.findings;
      } catch {
        // Fallback to rule-based analysis below
      }
    }

    // If findings list is empty, perform heuristic GRC section checklist
    if (findings.length === 0) {
      const lower = content.toLowerCase();
      const hasPurpose = lower.includes('purpose') || lower.includes('objective');
      const hasScope = lower.includes('scope');
      const hasRoles = lower.includes('responsibilit') || lower.includes('raci');
      const hasExceptions = lower.includes('exception') || lower.includes('waiver');
      const hasEnforcement = lower.includes('enforce') || lower.includes('violation') || lower.includes('disciplinary');
      const hasControls = policy.controlAssociations && policy.controlAssociations.length > 0;

      let deductions = 0;
      if (!hasPurpose) {
        deductions += 15;
        findings.push({
          severity: 'HIGH',
          section: 'Purpose & Objectives',
          title: 'Missing Explicit Purpose Statement',
          description: 'The document lacks a dedicated Purpose section clarifying regulatory rationale.',
          recommendation: 'Add Section 2 outlining specific business objectives and regulatory drivers.',
        });
      }
      if (!hasScope) {
        deductions += 15;
        findings.push({
          severity: 'HIGH',
          section: 'Scope',
          title: 'Unclear Target Audience & System Boundary',
          description: 'No explicit Scope section defining applicable users, infrastructure, or data boundaries.',
          recommendation: 'Explicitly specify whether contractors, mobile devices, and cloud tenants are covered.',
        });
      }
      if (!hasRoles) {
        deductions += 10;
        findings.push({
          severity: 'MEDIUM',
          section: 'Governance',
          title: 'Roles & Responsibilities Undefined',
          description: 'Lacks role breakdown for Line Managers, CISO, and General Personnel.',
          recommendation: 'Include a RACI matrix or role assignment table.',
        });
      }
      if (!hasExceptions) {
        deductions += 10;
        findings.push({
          severity: 'MEDIUM',
          section: 'Compliance',
          title: 'No Formal Exception Handling Clause',
          description: 'Lacks a documented waiver or exception protocol for legacy systems.',
          recommendation: 'State that exceptions require written CISO signoff with a 180-day maximum duration.',
        });
      }
      if (!hasEnforcement) {
        deductions += 10;
        findings.push({
          severity: 'LOW',
          section: 'Enforcement',
          title: 'Missing Disciplinary Actions Specification',
          description: 'Consequences for willful non-compliance are not stipulated.',
          recommendation: 'Add standard HR escalation and disciplinary action reference.',
        });
      }
      if (!hasControls) {
        findings.push({
          severity: 'INFO',
          section: 'Framework Mapping',
          title: 'No Associated Controls Mapped',
          description: 'Policy is not linked to any security catalogue controls in OMNiGRC.',
          recommendation: 'Map this policy to ISO 27001 or SOC 2 controls using the Mapped Controls panel.',
        });
      }

      overallScore = Math.max(35, 100 - deductions);
      status = overallScore >= 80 ? 'PASSED' : overallScore >= 60 ? 'NEEDS_REVISION' : 'DEFICIENT';
      modelUsed = 'OMNiGRC Automated Heuristic Validator';
    }

    await this.auditLogsService.log({
      organizationId: authCtx.organizationId,
      actorId: authCtx.userId,
      action: 'POLICY_AI_VALIDATED',
      entityType: 'Policy',
      entityId: policy.id,
      metadata: {
        overallScore,
        status,
        findingsCount: findings.length,
        modelUsed,
      },
    });

    return {
      policyId: policy.id,
      policyCode: policy.code,
      overallScore,
      status,
      findings,
      validatedAt: new Date().toISOString(),
      modelUsed,
    };
  }

  async sharePolicy(
    authCtx: ResourceAuthContext,
    id: string,
    dto: SharePolicyDto,
  ): Promise<{
    success: boolean;
    sentToCount: number;
    recipients: string[];
    message: string;
  }> {
    const scopeWhere = await this.resourceAuthService.getScopeWhereClause(authCtx);
    const policy = await this.prisma.policy.findFirst({
      where: { id, ...scopeWhere, deletedAt: null },
      include: { publishedVersion: true, versions: { take: 1, orderBy: { createdAt: 'desc' } } },
    });

    if (!policy) throw new NotFoundException(`Policy with ID "${id}" not found`);

    const validEmails = dto.recipientEmails.filter((e) => typeof e === 'string' && e.includes('@'));
    if (validEmails.length === 0) {
      throw new BadRequestException('At least one valid recipient email address must be provided');
    }

    if (this.notificationsService) {
      for (const email of validEmails) {
        await this.notificationsService.notify({
          organizationId: authCtx.organizationId,
          userId: email,
          type: NotificationType.TASK_ASSIGNED,
          message: dto.message || `Policy "${policy.title}" (${policy.code}) was shared with you for review.`,
          entityType: 'Policy',
          entityId: policy.id,
        });
      }
    }

    await this.auditLogsService.log({
      organizationId: authCtx.organizationId,
      actorId: authCtx.userId,
      action: 'POLICY_SHARED',
      entityType: 'Policy',
      entityId: policy.id,
      metadata: {
        recipients: validEmails,
        customMessage: dto.message,
      },
    });

    return {
      success: true,
      sentToCount: validEmails.length,
      recipients: validEmails,
      message: `Policy successfully shared with ${validEmails.length} recipient(s).`,
    };
  }

  async importDocumentContent(
    authCtx: ResourceAuthContext,
    dto: ImportPolicyDocDto,
  ): Promise<{
    extractedContent: string;
    suggestedTitle?: string;
    wordCount: number;
  }> {
    let clean = dto.content.trim();
    if (clean.length === 0) {
      throw new BadRequestException('Document content cannot be empty');
    }

    let suggestedTitle: string | undefined;
    const firstLine = clean.split('\n')[0].replace(/^[#\s*_-]+/, '').trim();
    if (firstLine && firstLine.length < 120) {
      suggestedTitle = firstLine;
    }

    const words = clean.split(/\s+/).filter(Boolean).length;

    await this.auditLogsService.log({
      organizationId: authCtx.organizationId,
      actorId: authCtx.userId,
      action: 'POLICY_DOCUMENT_IMPORTED',
      entityType: 'Policy',
      entityId: dto.filename || 'import',
      metadata: { filename: dto.filename, fileType: dto.fileType, words },
    });

    return {
      extractedContent: clean,
      suggestedTitle,
      wordCount: words,
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
      departmentId: policy.departmentId || null,
      projectId: policy.projectId || null,
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
      version: policy.version ?? 1,
      mappedControlCount: policy._count?.controlAssociations ?? policy.controlAssociations?.length ?? 0,
    } as any;
  }
}
