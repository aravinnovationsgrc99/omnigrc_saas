import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { CreateRiskDto, UpdateRiskDto, RiskQueryDto } from './dto/risks.dto';
import { RiskDto, PaginatedRisksDto, HeatmapSummaryDto, HeatmapCellDto, RiskStatus, RiskScoreBand } from '@omnigrc/shared';

@Injectable()
export class RisksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  public static getScoreBand(score: number): RiskScoreBand {
    if (score >= 15) return RiskScoreBand.HIGH;
    if (score >= 8) return RiskScoreBand.MEDIUM;
    return RiskScoreBand.LOW;
  }

  async findAll(organizationId: string, query: RiskQueryDto): Promise<PaginatedRisksDto> {
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
      where.OR = [
        { title: { contains: searchTerm, mode: 'insensitive' } },
        { owner: { contains: searchTerm, mode: 'insensitive' } },
        { description: { contains: searchTerm, mode: 'insensitive' } },
        { treatmentPlan: { contains: searchTerm, mode: 'insensitive' } },
      ];
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

  async getOpenCount(organizationId: string): Promise<{ count: number }> {
    const count = await this.prisma.risk.count({
      where: {
        organizationId,
        deletedAt: null,
        status: { not: RiskStatus.CLOSED },
      },
    });
    return { count };
  }

  async getHeatmapSummary(organizationId: string): Promise<HeatmapSummaryDto> {
    const activeRisks = await this.prisma.risk.findMany({
      where: {
        organizationId,
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

  async findOne(organizationId: string, id: string): Promise<RiskDto> {
    const risk = await this.prisma.risk.findFirst({
      where: { id, organizationId, deletedAt: null },
      include: { asset: { select: { name: true } } },
    });

    if (!risk) {
      throw new NotFoundException(`Risk with ID "${id}" not found`);
    }

    return this.mapToDto(risk);
  }

  async getAuditLogs(organizationId: string, riskId: string) {
    const risk = await this.prisma.risk.findFirst({
      where: { id: riskId, organizationId },
    });

    if (!risk) {
      throw new NotFoundException(`Risk with ID "${riskId}" not found`);
    }

    return this.prisma.auditLogEntry.findMany({
      where: {
        organizationId,
        entityType: 'Risk',
        entityId: riskId,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(organizationId: string, userId: string, dto: CreateRiskDto): Promise<RiskDto> {
    const score = dto.likelihood * dto.impact;

    const risk = await this.prisma.risk.create({
      data: {
        organizationId,
        title: dto.title,
        description: dto.description || null,
        likelihood: dto.likelihood,
        impact: dto.impact,
        score,
        status: dto.status || RiskStatus.OPEN,
        owner: dto.owner,
        assetId: dto.assetId || null,
        treatmentPlan: dto.treatmentPlan || null,
        createdById: userId,
      },
      include: { asset: { select: { name: true } } },
    });

    await this.auditLogsService.log({
      organizationId,
      actorId: userId,
      action: 'RISK_CREATED',
      entityType: 'Risk',
      entityId: risk.id,
      metadata: {
        title: risk.title,
        score: risk.score,
        status: risk.status,
      },
    });

    return this.mapToDto(risk);
  }

  async update(organizationId: string, userId: string, id: string, dto: UpdateRiskDto): Promise<RiskDto> {
    const existing = await this.prisma.risk.findFirst({
      where: { id, organizationId, deletedAt: null },
    });

    if (!existing) {
      throw new NotFoundException(`Risk with ID "${id}" not found`);
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
        ...(dto.treatmentPlan !== undefined && { treatmentPlan: dto.treatmentPlan }),
      },
      include: { asset: { select: { name: true } } },
    });

    if (changedFields.length > 0) {
      const isStatusChangeOnly = changedFields.length === 1 && changedFields[0] === 'status';
      await this.auditLogsService.log({
        organizationId,
        actorId: userId,
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

  async softDelete(organizationId: string, userId: string, id: string): Promise<{ success: boolean }> {
    const existing = await this.prisma.risk.findFirst({
      where: { id, organizationId, deletedAt: null },
    });

    if (!existing) {
      throw new NotFoundException(`Risk with ID "${id}" not found`);
    }

    await this.prisma.risk.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    await this.auditLogsService.log({
      organizationId,
      actorId: userId,
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
