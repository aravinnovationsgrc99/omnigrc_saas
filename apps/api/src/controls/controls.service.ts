import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { NotificationsService } from '../notifications/notifications.service';
import { FrameworkEntitlementsService } from '../frameworks/framework-entitlements.service';
import { ResourceAuthorizationService, ResourceAuthContext } from '../auth/resource-authorization.service';
import { CreateControlDto, UpdateControlDto, ControlQueryDto, SignOffMappingDto } from './dto/controls.dto';
import { ControlDto, PaginatedControlsDto, MappingStatus, ControlFrameworkMappingDto, FrameworkCode, NotificationType } from '@omnigrc/shared';

@Injectable()
export class ControlsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogsService: AuditLogsService,
    private readonly notificationsService: NotificationsService,
    private readonly frameworkEntitlementsService: FrameworkEntitlementsService,
    private readonly resourceAuthService: ResourceAuthorizationService,
  ) {}

  async findAll(authCtx: ResourceAuthContext, query: ControlQueryDto): Promise<PaginatedControlsDto> {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const skip = (page - 1) * limit;

    const scopeWhere = await this.resourceAuthService.getScopeWhereClause(authCtx);

    const where: any = {
      ...scopeWhere,
      deletedAt: null,
    };

    if (query.category) {
      where.category = query.category;
    }

    if (query.status) {
      where.mappings = {
        some: { status: query.status },
      };
    }

    if (query.search && query.search.trim()) {
      const searchTerm = query.search.trim();
      const searchConditions = [
        { name: { contains: searchTerm, mode: 'insensitive' } },
        { description: { contains: searchTerm, mode: 'insensitive' } },
        { category: { contains: searchTerm, mode: 'insensitive' } },
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
      this.prisma.control.findMany({
        where,
        skip,
        take: limit,
        orderBy: { updatedAt: 'desc' },
        include: {
          mappings: {
            include: {
              frameworkClause: {
                include: { framework: { select: { code: true } } },
              },
              frameworkReference: {
                include: { frameworkVersion: { include: { framework: { select: { code: true } } } } },
              },
            },
          },
        },
      }),
      this.prisma.control.count({ where }),
    ]);

    return {
      items: items.map((item) => this.mapToDto(item)),
      total,
      page,
      limit,
    };
  }

  async getApprovedCount(authCtx: ResourceAuthContext): Promise<{ count: number }> {
    const scopeWhere = await this.resourceAuthService.getScopeWhereClause(authCtx);
    const count = await this.prisma.controlFrameworkMapping.count({
      where: {
        control: { ...scopeWhere, deletedAt: null },
        status: MappingStatus.APPROVED,
      },
    });
    return { count };
  }

  async findOne(authCtx: ResourceAuthContext, id: string): Promise<ControlDto> {
    const scopeWhere = await this.resourceAuthService.getScopeWhereClause(authCtx);
    const control = await this.prisma.control.findFirst({
      where: { id, ...scopeWhere, deletedAt: null },
      include: {
        mappings: {
          include: {
            frameworkClause: {
              include: { framework: { select: { code: true } } },
            },
            frameworkReference: {
              include: { frameworkVersion: { include: { framework: { select: { code: true } } } } },
            },
          },
        },
      },
    });

    if (!control) {
      throw new NotFoundException(`Control with ID "${id}" not found`);
    }

    return this.mapToDto(control);
  }

  async getAllFrameworkClauses(organizationId?: string) {
    let entitledFrameworkIds: string[] | null = null;
    if (organizationId) {
      entitledFrameworkIds = await this.frameworkEntitlementsService.getEntitledFrameworkIds(organizationId);
    }

    const clauses = await this.prisma.frameworkClause.findMany({
      where: entitledFrameworkIds !== null ? { frameworkId: { in: entitledFrameworkIds } } : {},
      include: {
        framework: { select: { code: true, name: true } },
      },
      orderBy: [{ frameworkId: 'asc' }, { code: 'asc' }],
    });

    return clauses.map((c) => ({
      id: c.id,
      frameworkId: c.frameworkId,
      frameworkCode: c.framework.code as FrameworkCode,
      frameworkName: c.framework.name,
      code: c.code,
      title: c.title,
      createdAt: c.createdAt.toISOString(),
    }));
  }

  async getFrameworks(organizationId?: string) {
    let entitledFrameworkIds: string[] | null = null;
    if (organizationId) {
      entitledFrameworkIds = await this.frameworkEntitlementsService.getEntitledFrameworkIds(organizationId);
    }

    const frameworks = await this.prisma.framework.findMany({
      where: entitledFrameworkIds !== null ? { id: { in: entitledFrameworkIds } } : {},
      include: {
        _count: { select: { clauses: true } },
      },
      orderBy: { code: 'asc' },
    });

    return frameworks.map((f) => ({
      id: f.id,
      code: f.code as FrameworkCode,
      name: f.name,
      clauseCount: f._count.clauses,
      createdAt: f.createdAt.toISOString(),
    }));
  }

  async create(authCtx: ResourceAuthContext, dto: CreateControlDto): Promise<ControlDto> {
    await this.resourceAuthService.authorize(authCtx, {
      action: 'WRITE',
      departmentId: dto.departmentId,
      projectId: dto.projectId,
    });

    const name = dto.name || dto.title || dto.code || 'Untitled Control';
    const control = await this.prisma.control.create({
      data: {
        organizationId: authCtx.organizationId,
        departmentId: dto.departmentId || null,
        projectId: dto.projectId || null,
        name,
        description: dto.description,
        category: dto.category || null,
        createdById: authCtx.userId,
      },

      include: {
        mappings: {
          include: {
            frameworkClause: {
              include: { framework: { select: { code: true } } },
            },
            frameworkReference: {
              include: { frameworkVersion: { include: { framework: { select: { code: true } } } } },
            },
          },
        },
      },
    });

    await this.auditLogsService.log({
      organizationId: authCtx.organizationId,
      actorId: authCtx.userId,
      action: 'CONTROL_CREATED',
      entityType: 'Control',
      entityId: control.id,
      metadata: {
        name: control.name,
        category: control.category,
        departmentId: control.departmentId,
        projectId: control.projectId,
      },
    });

    const result = this.mapToDto(control);
    if (dto.code) {
      result.code = dto.code;
    }
    return result;
  }

  async update(authCtx: ResourceAuthContext, id: string, dto: UpdateControlDto): Promise<ControlDto> {
    const scopeWhere = await this.resourceAuthService.getScopeWhereClause(authCtx);
    const existing = await this.prisma.control.findFirst({
      where: { id, ...scopeWhere, deletedAt: null },
    });

    if (!existing) {
      throw new NotFoundException(`Control with ID "${id}" not found`);
    }

    if (dto.departmentId || dto.projectId) {
      await this.resourceAuthService.authorize(authCtx, {
        action: 'WRITE',
        departmentId: dto.departmentId,
        projectId: dto.projectId,
      });
    }

    const changedFields: string[] = [];
    if (dto.name !== undefined && dto.name !== existing.name) changedFields.push('name');
    if (dto.description !== undefined && dto.description !== existing.description) changedFields.push('description');
    if (dto.category !== undefined && dto.category !== existing.category) changedFields.push('category');
    if (dto.departmentId !== undefined && dto.departmentId !== existing.departmentId) changedFields.push('departmentId');
    if (dto.projectId !== undefined && dto.projectId !== existing.projectId) changedFields.push('projectId');

    const updated = await this.prisma.control.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.category !== undefined && { category: dto.category }),
        ...(dto.departmentId !== undefined && { departmentId: dto.departmentId || null }),
        ...(dto.projectId !== undefined && { projectId: dto.projectId || null }),
      },
      include: {
        mappings: {
          include: {
            frameworkClause: {
              include: { framework: { select: { code: true } } },
            },
            frameworkReference: {
              include: { frameworkVersion: { include: { framework: { select: { code: true } } } } },
            },
          },
        },
      },
    });

    if (changedFields.length > 0) {
      await this.auditLogsService.log({
        organizationId: authCtx.organizationId,
        actorId: authCtx.userId,
        action: 'CONTROL_UPDATED',
        entityType: 'Control',
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
    const existing = await this.prisma.control.findFirst({
      where: { id, ...scopeWhere, deletedAt: null },
    });

    if (!existing) {
      throw new NotFoundException(`Control with ID "${id}" not found`);
    }

    await this.prisma.control.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    await this.auditLogsService.log({
      organizationId: authCtx.organizationId,
      actorId: authCtx.userId,
      action: 'CONTROL_DELETED',
      entityType: 'Control',
      entityId: existing.id,
      metadata: {
        name: existing.name,
      },
    });

    return { success: true };
  }

  /**
   * Human sign-off: body is { decision: 'APPROVE' | 'OVERRIDE', overrideClauseId?, note? }
   */
  async signOffMapping(
    authCtx: ResourceAuthContext,
    controlId: string,
    mappingId: string,
    dto: SignOffMappingDto,
  ): Promise<ControlFrameworkMappingDto> {
    const { userId, organizationId } = authCtx;
    const scopeWhere = await this.resourceAuthService.getScopeWhereClause(authCtx);
    const control = await this.prisma.control.findFirst({
      where: { id: controlId, ...scopeWhere, deletedAt: null },
    });

    if (!control) {
      throw new NotFoundException(`Control with ID "${controlId}" not found`);
    }

    const mapping = await this.prisma.controlFrameworkMapping.findFirst({
      where: { id: mappingId, controlId },
      include: {
        frameworkClause: {
          include: { framework: { select: { code: true } } },
        },
        frameworkReference: {
          include: { frameworkVersion: { include: { framework: { select: { code: true } } } } },
        },
      },
    });

    if (!mapping) {
      throw new NotFoundException(`Mapping with ID "${mappingId}" not found for this control`);
    }

    if (dto.decision === 'APPROVE') {
      const updated = await this.prisma.controlFrameworkMapping.update({
        where: { id: mappingId },
        data: {
          status: MappingStatus.APPROVED,
          reviewedById: userId,
          reviewedAt: new Date(),
        },
        include: {
          frameworkClause: {
            include: { framework: { select: { code: true } } },
          },
          frameworkReference: {
            include: { frameworkVersion: { include: { framework: { select: { code: true } } } } },
          },
        },
      });

      await this.auditLogsService.log({
        organizationId,
        actorId: userId,
        action: 'MAPPING_APPROVED',
        entityType: 'Control',
        entityId: controlId,
        metadata: {
          controlId,
          mappingId,
          reviewedById: userId,
          frameworkCode: updated.frameworkClause?.framework?.code || updated.frameworkReference?.frameworkVersion?.framework?.code,
          clauseCode: updated.frameworkClause?.code || updated.frameworkReference?.identifier,
          confidenceScore: updated.confidenceScore,
          modelTier: updated.modelTier,
        },
      });

      return this.mapMappingToDto(updated);
    } else if (dto.decision === 'OVERRIDE') {
      if (!dto.overrideClauseId) {
        throw new BadRequestException('overrideClauseId is required when overriding a mapping');
      }

      const newClause = await this.prisma.frameworkClause.findUnique({
        where: { id: dto.overrideClauseId },
        include: { framework: { select: { id: true, code: true } } },
      });

      if (!newClause) {
        throw new NotFoundException(`Framework clause with ID "${dto.overrideClauseId}" not found`);
      }

      await this.frameworkEntitlementsService.assertEntitled(organizationId, newClause.frameworkId);

      const updated = await this.prisma.controlFrameworkMapping.update({
        where: { id: mappingId },
        data: {
          frameworkClauseId: dto.overrideClauseId,
          status: MappingStatus.OVERRIDDEN,
          confidenceScore: null, // Cleared because it is now a human decision
          reviewedById: userId,
          reviewedAt: new Date(),
        },
        include: {
          frameworkClause: {
            include: { framework: { select: { code: true } } },
          },
        },
      });

      await this.auditLogsService.log({
        organizationId,
        actorId: userId,
        action: 'MAPPING_OVERRIDDEN',
        entityType: 'Control',
        entityId: controlId,
        metadata: {
          controlId,
          mappingId,
          reviewedById: userId,
          overrideClauseId: dto.overrideClauseId,
          newClauseCode: newClause.code,
          frameworkCode: newClause.framework.code,
          note: dto.note || null,
        },
      });

      await this.notificationsService.notify({
        organizationId,
        type: NotificationType.MAPPING_OVERRIDDEN,
        message: `Framework clause mapping for control "${control.name}" was manually overridden (Clause: ${newClause.code}).`,
        entityType: 'CONTROL_MAPPING',
        entityId: mappingId,
      });

      return this.mapMappingToDto(updated);
    } else {
      throw new BadRequestException(`Invalid decision: ${dto.decision}`);
    }
  }

  async getAuditLogs(authCtx: ResourceAuthContext, controlId: string) {
    const scopeWhere = await this.resourceAuthService.getScopeWhereClause(authCtx);
    const control = await this.prisma.control.findFirst({
      where: { id: controlId, ...scopeWhere, deletedAt: null },
    });

    if (!control) {
      throw new NotFoundException(`Control with ID "${controlId}" not found`);
    }

    return this.prisma.auditLogEntry.findMany({
      where: {
        organizationId: authCtx.organizationId,
        entityType: 'Control',
        entityId: controlId,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  private mapToDto(control: any): ControlDto {
    return {
      id: control.id,
      organizationId: control.organizationId,
      departmentId: control.departmentId || null,
      projectId: control.projectId || null,
      name: control.name,
      description: control.description,
      category: control.category,
      createdAt: control.createdAt.toISOString(),
      updatedAt: control.updatedAt.toISOString(),
      createdById: control.createdById,
      deletedAt: control.deletedAt ? control.deletedAt.toISOString() : null,
      mappings: control.mappings ? control.mappings.map((m: any) => this.mapMappingToDto(m)) : [],
    };
  }

  private mapMappingToDto(m: any): ControlFrameworkMappingDto {
    const frameworkCode =
      m.frameworkClause?.framework?.code ||
      m.frameworkReference?.frameworkVersion?.framework?.code;

    return {
      id: m.id,
      controlId: m.controlId,
      frameworkClauseId: m.frameworkClauseId,
      frameworkReferenceId: m.frameworkReferenceId,
      clauseCode: m.frameworkClause?.code || m.frameworkReference?.identifier,
      clauseTitle: m.frameworkClause?.title || m.frameworkReference?.title,
      referenceIdentifier: m.frameworkReference?.identifier,
      referenceTitle: m.frameworkReference?.title,
      referenceType: m.frameworkReference?.type,
      frameworkCode: frameworkCode as FrameworkCode,
      status: m.status as MappingStatus,
      confidenceScore: m.confidenceScore,
      modelTier: m.modelTier,
      reviewedById: m.reviewedById,
      reviewedAt: m.reviewedAt ? m.reviewedAt.toISOString() : null,
      createdAt: m.createdAt.toISOString(),
    };
  }
}
