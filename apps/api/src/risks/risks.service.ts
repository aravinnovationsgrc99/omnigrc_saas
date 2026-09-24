import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { ResourceAuthorizationService, ResourceAuthContext } from '../auth/resource-authorization.service';
import { CreateRiskDto, UpdateRiskDto, RiskQueryDto } from './dto/risks.dto';
import { RiskDto, PaginatedRisksDto, HeatmapSummaryDto, HeatmapCellDto, RiskStatus, RiskScoreBand } from '@omnigrc/shared';

@Injectable()
export class RisksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogsService: AuditLogsService,
    private readonly resourceAuthService: ResourceAuthorizationService,
  ) {}

  public static getScoreBand(score: number): RiskScoreBand {
    if (score >= 15) return RiskScoreBand.HIGH;
    if (score >= 8) return RiskScoreBand.MEDIUM;
    return RiskScoreBand.LOW;
  }

  async findAll(authCtx: ResourceAuthContext, query: RiskQueryDto): Promise<PaginatedRisksDto> {
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

    if (query.likelihood) {
      where.likelihood = query.likelihood;
    }

    if (query.impact) {
      where.impact = query.impact;
    }

    if (query.scoreBand) {
      if (query.scoreBand === RiskScoreBand.LOW) {
        where.score = { lte: 6 };
      } else if (query.scoreBand === RiskScoreBand.MEDIUM) {
        where.score = { gte: 8, lte: 12 };
      } else if (query.scoreBand === RiskScoreBand.HIGH) {
        where.score = { gte: 15 };
      }
    }

    if (query.search && query.search.trim()) {
      const searchTerm = query.search.trim();
      const searchConditions = [
        { title: { contains: searchTerm, mode: 'insensitive' } },
        { owner: { contains: searchTerm, mode: 'insensitive' } },
        { description: { contains: searchTerm, mode: 'insensitive' } },
        { treatmentPlan: { contains: searchTerm, mode: 'insensitive' } },
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
      this.prisma.risk.findMany({
        where,
        skip,
        take: limit,
        orderBy: { score: 'desc' },
        include: { asset: { select: { name: true } } },
      }),
      this.prisma.risk.count({ where }),
    ]);

    return {
      items: items.map(this.mapToDto),
      total,
      page,
      limit,
    };
  }

  async getOpenCount(authCtx: ResourceAuthContext): Promise<{ count: number }> {
    const scopeWhere = await this.resourceAuthService.getScopeWhereClause(authCtx);
    const count = await this.prisma.risk.count({
      where: {
        ...scopeWhere,
        deletedAt: null,
        status: { not: RiskStatus.CLOSED },
      },
    });
    return { count };
  }

  async getHeatmapSummary(authCtx: ResourceAuthContext): Promise<HeatmapSummaryDto> {
    const scopeWhere = await this.resourceAuthService.getScopeWhereClause(authCtx);
    const activeRisks = await this.prisma.risk.findMany({
      where: {
        ...scopeWhere,
        deletedAt: null,
        status: { not: RiskStatus.CLOSED },
      },
      select: { likelihood: true, impact: true },
    });

    const countsMap = new Map<string, number>();
    for (const r of activeRisks) {
      const key = `${r.likelihood}_${r.impact}`;
      countsMap.set(key, (countsMap.get(key) || 0) + 1);
    }

    const matrix: HeatmapCellDto[] = [];
    for (let l = 1; l <= 5; l++) {
      for (let i = 1; i <= 5; i++) {
        const score = l * i;
        matrix.push({
          likelihood: l,
          impact: i,
          count: countsMap.get(`${l}_${i}`) || 0,
          score,
          scoreBand: RisksService.getScoreBand(score),
        });
      }
    }

    return {
      matrix,
      totalOpenCount: activeRisks.length,
    };
  }

  async findOne(authCtx: ResourceAuthContext, id: string): Promise<RiskDto> {
    const scopeWhere = await this.resourceAuthService.getScopeWhereClause(authCtx);
    const risk = await this.prisma.risk.findFirst({
      where: { id, ...scopeWhere, deletedAt: null },
      include: { asset: { select: { name: true } } },
    });

    if (!risk) {
      throw new NotFoundException(`Risk with ID "${id}" not found`);
    }

    return this.mapToDto(risk);
  }

  async getAuditLogs(authCtx: ResourceAuthContext, riskId: string) {
    const scopeWhere = await this.resourceAuthService.getScopeWhereClause(authCtx);
    const risk = await this.prisma.risk.findFirst({
      where: { id: riskId, ...scopeWhere, deletedAt: null },
    });

    if (!risk) {
      throw new NotFoundException(`Risk with ID "${riskId}" not found`);
    }

    return this.prisma.auditLogEntry.findMany({
      where: {
        organizationId: authCtx.organizationId,
        entityType: 'Risk',
        entityId: riskId,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(authCtx: ResourceAuthContext, dto: CreateRiskDto): Promise<RiskDto> {
    await this.resourceAuthService.authorize(authCtx, {
      action: 'WRITE',
      departmentId: dto.departmentId,
      projectId: dto.projectId,
    });

    const score = dto.likelihood * dto.impact;

    const risk = await this.prisma.risk.create({
      data: {
        organizationId: authCtx.organizationId,
        departmentId: dto.departmentId || null,
        projectId: dto.projectId || null,
        title: dto.title,
        description: dto.description || null,
        likelihood: dto.likelihood,
        impact: dto.impact,
        score,
        status: dto.status || RiskStatus.OPEN,
        owner: dto.owner,
        assetId: dto.assetId || null,
        treatmentPlan: dto.treatmentPlan || null,
        createdById: authCtx.userId,
      },
      include: { asset: { select: { name: true } } },
    });

    await this.auditLogsService.log({
      organizationId: authCtx.organizationId,
      actorId: authCtx.userId,
      action: 'RISK_CREATED',
      entityType: 'Risk',
      entityId: risk.id,
      metadata: {
        title: risk.title,
        score: risk.score,
        status: risk.status,
        departmentId: risk.departmentId,
        projectId: risk.projectId,
      },
    });

    return this.mapToDto(risk);
  }

  async update(authCtx: ResourceAuthContext, id: string, dto: UpdateRiskDto): Promise<RiskDto> {
    const scopeWhere = await this.resourceAuthService.getScopeWhereClause(authCtx);
    const existing = await this.prisma.risk.findFirst({
      where: { id, ...scopeWhere, deletedAt: null },
    });

    if (!existing) {
      throw new NotFoundException(`Risk with ID "${id}" not found`);
    }

    if (dto.departmentId || dto.projectId) {
      await this.resourceAuthService.authorize(authCtx, {
        action: 'WRITE',
        departmentId: dto.departmentId,
        projectId: dto.projectId,
      });
    }

    const likelihood = dto.likelihood !== undefined ? dto.likelihood : existing.likelihood;
    const impact = dto.impact !== undefined ? dto.impact : existing.impact;
    const score = likelihood * impact;

    const changedFields: string[] = [];
    if (dto.title !== undefined && dto.title !== existing.title) changedFields.push('title');
    if (dto.likelihood !== undefined && dto.likelihood !== existing.likelihood) changedFields.push('likelihood');
    if (dto.impact !== undefined && dto.impact !== existing.impact) changedFields.push('impact');
    if (dto.status !== undefined && dto.status !== existing.status) changedFields.push('status');
    if (dto.owner !== undefined && dto.owner !== existing.owner) changedFields.push('owner');
    if (dto.assetId !== undefined && dto.assetId !== existing.assetId) changedFields.push('assetId');
    if (dto.departmentId !== undefined && dto.departmentId !== existing.departmentId) changedFields.push('departmentId');
    if (dto.projectId !== undefined && dto.projectId !== existing.projectId) changedFields.push('projectId');
    if (dto.treatmentPlan !== undefined && dto.treatmentPlan !== existing.treatmentPlan) changedFields.push('treatmentPlan');

    const updated = await this.prisma.risk.update({
      where: { id },
      data: {
        ...(dto.title !== undefined && { title: dto.title }),
        ...(dto.description !== undefined && { description: dto.description }),
        likelihood,
        impact,
        score,
        ...(dto.status !== undefined && { status: dto.status }),
        ...(dto.owner !== undefined && { owner: dto.owner }),
        ...(dto.assetId !== undefined && { assetId: dto.assetId || null }),
        ...(dto.departmentId !== undefined && { departmentId: dto.departmentId || null }),
        ...(dto.projectId !== undefined && { projectId: dto.projectId || null }),
        ...(dto.treatmentPlan !== undefined && { treatmentPlan: dto.treatmentPlan }),
      },
      include: { asset: { select: { name: true } } },
    });

    if (changedFields.length > 0) {
      const isStatusChangeOnly = changedFields.length === 1 && changedFields[0] === 'status';
      await this.auditLogsService.log({
        organizationId: authCtx.organizationId,
        actorId: authCtx.userId,
        action: isStatusChangeOnly ? 'RISK_STATUS_CHANGED' : 'RISK_UPDATED',
        entityType: 'Risk',
        entityId: updated.id,
        metadata: {
          title: updated.title,
          status: updated.status,
          changedFields,
        },
      });
    }

    return this.mapToDto(updated);
  }

  async softDelete(authCtx: ResourceAuthContext, id: string): Promise<{ success: boolean }> {
    const scopeWhere = await this.resourceAuthService.getScopeWhereClause(authCtx);
    const existing = await this.prisma.risk.findFirst({
      where: { id, ...scopeWhere, deletedAt: null },
    });

    if (!existing) {
      throw new NotFoundException(`Risk with ID "${id}" not found`);
    }

    await this.prisma.risk.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    await this.auditLogsService.log({
      organizationId: authCtx.organizationId,
      actorId: authCtx.userId,
      action: 'RISK_DELETED',
      entityType: 'Risk',
      entityId: existing.id,
      metadata: {
        title: existing.title,
      },
    });

    return { success: true };
  }

  private mapToDto(risk: any): RiskDto {
    const score = risk.score;
    return {
      id: risk.id,
      organizationId: risk.organizationId,
      departmentId: risk.departmentId || null,
      projectId: risk.projectId || null,
      title: risk.title,
      description: risk.description,
      likelihood: risk.likelihood,
      impact: risk.impact,
      score,
      scoreBand: RisksService.getScoreBand(score),
      status: risk.status as RiskStatus,
      owner: risk.owner,
      assetId: risk.assetId,
      assetName: risk.asset?.name || null,
      treatmentPlan: risk.treatmentPlan,
      createdAt: risk.createdAt.toISOString(),
      updatedAt: risk.updatedAt.toISOString(),
      createdById: risk.createdById,
      deletedAt: risk.deletedAt ? risk.deletedAt.toISOString() : null,
    };
  }
}
