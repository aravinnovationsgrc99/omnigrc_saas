import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateControlDto, UpdateControlDto, ControlQueryDto, SignOffMappingDto } from './dto/controls.dto';
import { ControlDto, PaginatedControlsDto, MappingStatus, ControlFrameworkMappingDto, FrameworkCode, NotificationType } from '@omnigrc/shared';

@Injectable()
export class ControlsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogsService: AuditLogsService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async findAll(organizationId: string, query: ControlQueryDto): Promise<PaginatedControlsDto> {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const skip = (page - 1) * limit;

    const where: any = {
      organizationId,
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
      where.OR = [
        { name: { contains: searchTerm, mode: 'insensitive' } },
        { description: { contains: searchTerm, mode: 'insensitive' } },
        { category: { contains: searchTerm, mode: 'insensitive' } },
      ];
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

  async getApprovedCount(organizationId: string): Promise<{ count: number }> {
    const count = await this.prisma.controlFrameworkMapping.count({
      where: {
        control: { organizationId, deletedAt: null },
        status: MappingStatus.APPROVED,
      },
    });
    return { count };
  }

  async findOne(organizationId: string, id: string): Promise<ControlDto> {
    const control = await this.prisma.control.findFirst({
      where: { id, organizationId, deletedAt: null },
      include: {
        mappings: {
          include: {
            frameworkClause: {
              include: { framework: { select: { code: true } } },
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

  async getAllFrameworkClauses() {
    const clauses = await this.prisma.frameworkClause.findMany({
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

  async getFrameworks() {
    const frameworks = await this.prisma.framework.findMany({
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

  async create(organizationId: string, userId: string, dto: CreateControlDto): Promise<ControlDto> {
    const control = await this.prisma.control.create({
      data: {
        organizationId,
        name: dto.name,
        description: dto.description,
        category: dto.category || null,
        createdById: userId,
      },
      include: {
        mappings: {
          include: {
            frameworkClause: {
              include: { framework: { select: { code: true } } },
            },
          },
        },
      },
    });

    await this.auditLogsService.log({
      organizationId,
      actorId: userId,
      action: 'CONTROL_CREATED',
      entityType: 'Control',
      entityId: control.id,
      metadata: {
        name: control.name,
        category: control.category,
      },
    });

    return this.mapToDto(control);
  }

  async update(organizationId: string, userId: string, id: string, dto: UpdateControlDto): Promise<ControlDto> {
    const existing = await this.prisma.control.findFirst({
      where: { id, organizationId, deletedAt: null },
    });

    if (!existing) {
      throw new NotFoundException(`Control with ID "${id}" not found`);
    }

    const changedFields: string[] = [];
    if (dto.name !== undefined && dto.name !== existing.name) changedFields.push('name');
    if (dto.description !== undefined && dto.description !== existing.description) changedFields.push('description');
    if (dto.category !== undefined && dto.category !== existing.category) changedFields.push('category');

    const updated = await this.prisma.control.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.category !== undefined && { category: dto.category }),
      },
      include: {
        mappings: {
          include: {
            frameworkClause: {
              include: { framework: { select: { code: true } } },
            },
          },
        },
      },
    });

    if (changedFields.length > 0) {
      await this.auditLogsService.log({
        organizationId,
        actorId: userId,
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

  async softDelete(organizationId: string, userId: string, id: string): Promise<{ success: boolean }> {
    const existing = await this.prisma.control.findFirst({
      where: { id, organizationId, deletedAt: null },
    });

    if (!existing) {
      throw new NotFoundException(`Control with ID "${id}" not found`);
    }

    await this.prisma.control.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    await this.auditLogsService.log({
      organizationId,
      actorId: userId,
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
   * RBAC NOTE: Both ADMIN and ANALYST can approve/override for now (leave as open question for business tightening).
   */
  async signOffMapping(
    organizationId: string,
    userId: string,
    controlId: string,
    mappingId: string,
    dto: SignOffMappingDto,
  ): Promise<ControlFrameworkMappingDto> {
    const control = await this.prisma.control.findFirst({
      where: { id: controlId, organizationId, deletedAt: null },
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
          frameworkCode: updated.frameworkClause.framework.code,
          clauseCode: updated.frameworkClause.code,
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
        include: { framework: { select: { code: true } } },
      });

      if (!newClause) {
        throw new NotFoundException(`Framework clause with ID "${dto.overrideClauseId}" not found`);
      }

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

  async getAuditLogs(organizationId: string, controlId: string) {
    const control = await this.prisma.control.findFirst({
      where: { id: controlId, organizationId },
    });

    if (!control) {
      throw new NotFoundException(`Control with ID "${controlId}" not found`);
    }

    return this.prisma.auditLogEntry.findMany({
      where: {
        organizationId,
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
    return {
      id: m.id,
      controlId: m.controlId,
      frameworkClauseId: m.frameworkClauseId,
      clauseCode: m.frameworkClause?.code,
      clauseTitle: m.frameworkClause?.title,
      frameworkCode: m.frameworkClause?.framework?.code as FrameworkCode,
      status: m.status as MappingStatus,
      confidenceScore: m.confidenceScore,
      modelTier: m.modelTier,
      reviewedById: m.reviewedById,
      reviewedAt: m.reviewedAt ? m.reviewedAt.toISOString() : null,
      createdAt: m.createdAt.toISOString(),
    };
  }
}
