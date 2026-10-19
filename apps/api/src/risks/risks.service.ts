import { Injectable, NotFoundException, BadRequestException, Optional } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { ResourceAuthorizationService, ResourceAuthContext } from '../auth/resource-authorization.service';
import { FrameworkEntitlementsService } from '../frameworks/framework-entitlements.service';
import { ApprovalEngineService } from '../approval/approval-engine.service';
import { CreateRiskDto, UpdateRiskDto, RiskQueryDto, SubmitRiskApprovalDto } from './dto/risks.dto';
import { RiskDto, PaginatedRisksDto, HeatmapSummaryDto, HeatmapCellDto, RiskStatus, RiskScoreBand } from '@omnigrc/shared';

@Injectable()
export class RisksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogsService: AuditLogsService,
    private readonly resourceAuthService: ResourceAuthorizationService,
    @Optional() private readonly frameworkEntitlementsService?: FrameworkEntitlementsService,
    @Optional() private readonly approvalEngineService?: ApprovalEngineService,
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

    if (query.assetId) {
      where.assetId = query.assetId;
    }

    if (query.status) {
      where.status = query.status;
    }

    if (query.category) {
      where.category = query.category;
    }

    if (query.likelihood) {
      where.likelihood = query.likelihood;
    }

    if (query.impact) {
      where.impact = query.impact;
    }

    if (query.frameworkId) {
      where.frameworkId = query.frameworkId;
    }

    if (query.frameworkReferenceId) {
      where.frameworkReferenceId = query.frameworkReferenceId;
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
        { category: { contains: searchTerm, mode: 'insensitive' } },
        { treatmentPlan: { contains: searchTerm, mode: 'insensitive' } },
        { treatmentStrategy: { contains: searchTerm, mode: 'insensitive' } },
        { treatmentOwner: { contains: searchTerm, mode: 'insensitive' } },
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
        include: {
          asset: { select: { name: true } },
          framework: { select: { code: true, name: true } },
          frameworkReference: { select: { identifier: true, title: true, frameworkVersionId: true } },
        },
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
      include: {
        asset: { select: { name: true } },
        framework: { select: { code: true, name: true } },
        frameworkReference: { select: { identifier: true, title: true, frameworkVersionId: true } },
      },
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

  private async validateFrameworkAndReference(
    authCtx: ResourceAuthContext,
    frameworkId?: string | null,
    frameworkReferenceId?: string | null,
  ): Promise<{ resolvedFrameworkId: string | null; resolvedFrameworkReferenceId: string | null }> {
    if (!frameworkReferenceId && !frameworkId) {
      return { resolvedFrameworkId: null, resolvedFrameworkReferenceId: null };
    }

    if (frameworkReferenceId) {
      const ref = await this.prisma.frameworkReference.findUnique({
        where: { id: frameworkReferenceId },
        include: {
          frameworkVersion: {
            select: { id: true, frameworkId: true },
          },
        },
      });

      if (!ref) {
        throw new NotFoundException(`Framework reference "${frameworkReferenceId}" not found.`);
      }

      const versionFwId = ref.frameworkVersion.frameworkId;

      if (frameworkId && frameworkId !== versionFwId) {
        throw new BadRequestException(
          `Framework reference "${ref.identifier}" does not belong to the selected framework.`,
        );
      }

      const targetFwId = frameworkId || versionFwId;
      if (this.frameworkEntitlementsService) {
        await this.frameworkEntitlementsService.assertEntitled(authCtx.organizationId, targetFwId);
      }

      return {
        resolvedFrameworkId: targetFwId,
        resolvedFrameworkReferenceId: ref.id,
      };
    }

    if (frameworkId) {
      if (this.frameworkEntitlementsService) {
        await this.frameworkEntitlementsService.assertEntitled(authCtx.organizationId, frameworkId);
      }
      return {
        resolvedFrameworkId: frameworkId,
        resolvedFrameworkReferenceId: null,
      };
    }

    return { resolvedFrameworkId: null, resolvedFrameworkReferenceId: null };
  }

  async create(authCtx: ResourceAuthContext, dto: CreateRiskDto): Promise<RiskDto> {
    await this.resourceAuthService.authorize(authCtx, {
      action: 'WRITE',
      departmentId: dto.departmentId,
      projectId: dto.projectId,
    });

    const { resolvedFrameworkId, resolvedFrameworkReferenceId } = await this.validateFrameworkAndReference(
      authCtx,
      dto.frameworkId,
      dto.frameworkReferenceId,
    );

    const score = dto.likelihood * dto.impact;

    let residualScore: number | null = null;
    if (dto.residualLikelihood && dto.residualImpact) {
      residualScore = dto.residualLikelihood * dto.residualImpact;
    }

    const initialStatus = dto.status || RiskStatus.OPEN;
    if (initialStatus === RiskStatus.IN_TREATMENT && !dto.treatmentPlan && !dto.treatmentStrategy) {
      throw new BadRequestException('Cannot set risk status to IN_TREATMENT without a defined treatment plan or strategy.');
    }

    const risk = await this.prisma.risk.create({
      data: {
        organizationId: authCtx.organizationId,
        departmentId: dto.departmentId || null,
        projectId: dto.projectId || null,
        title: dto.title,
        description: dto.description || null,
        category: dto.category || null,
        likelihood: dto.likelihood,
        impact: dto.impact,
        score,
        residualLikelihood: dto.residualLikelihood || null,
        residualImpact: dto.residualImpact || null,
        residualScore,
        status: initialStatus,
        owner: dto.owner,
        assetId: dto.assetId || null,
        frameworkId: resolvedFrameworkId,
        frameworkReferenceId: resolvedFrameworkReferenceId,
        treatmentPlan: dto.treatmentPlan || null,
        treatmentStrategy: dto.treatmentStrategy || null,
        treatmentOwner: dto.treatmentOwner || null,
        treatmentDueDate: dto.treatmentDueDate ? new Date(dto.treatmentDueDate) : null,
        treatmentStatus: dto.treatmentStatus || (initialStatus === RiskStatus.IN_TREATMENT ? 'IN_PROGRESS' : 'NOT_STARTED'),
        createdById: authCtx.userId,
      },
      include: {
        asset: { select: { name: true } },
        framework: { select: { code: true, name: true } },
        frameworkReference: { select: { identifier: true, title: true, frameworkVersionId: true } },
      },
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
        category: risk.category,
        residualScore: risk.residualScore,
        departmentId: risk.departmentId,
        projectId: risk.projectId,
        frameworkId: risk.frameworkId,
        frameworkReferenceId: risk.frameworkReferenceId,
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

    // Permitted state transitions validation
    if (dto.status !== undefined && dto.status !== existing.status) {
      if (existing.status === RiskStatus.CLOSED && dto.status !== RiskStatus.OPEN) {
        throw new BadRequestException('Closed risks can only be transitioned to OPEN (reopened).');
      }
      if (dto.status === RiskStatus.IN_TREATMENT) {
        const plan = dto.treatmentPlan !== undefined ? dto.treatmentPlan : existing.treatmentPlan;
        const strategy = dto.treatmentStrategy !== undefined ? dto.treatmentStrategy : existing.treatmentStrategy;
        if (!plan && !strategy) {
          throw new BadRequestException('Cannot transition risk to IN_TREATMENT without a defined treatment plan or strategy.');
        }
      }
    }

    let targetFwId = dto.frameworkId !== undefined ? dto.frameworkId : existing.frameworkId;
    let targetRefId = dto.frameworkReferenceId !== undefined ? dto.frameworkReferenceId : existing.frameworkReferenceId;

    if (dto.frameworkId !== undefined || dto.frameworkReferenceId !== undefined) {
      const validated = await this.validateFrameworkAndReference(authCtx, targetFwId, targetRefId);
      targetFwId = validated.resolvedFrameworkId;
      targetRefId = validated.resolvedFrameworkReferenceId;
    }

    const likelihood = dto.likelihood !== undefined ? dto.likelihood : existing.likelihood;
    const impact = dto.impact !== undefined ? dto.impact : existing.impact;
    const score = likelihood * impact;

    const resLikelihood = dto.residualLikelihood !== undefined ? dto.residualLikelihood : existing.residualLikelihood;
    const resImpact = dto.residualImpact !== undefined ? dto.residualImpact : existing.residualImpact;
    let residualScore: number | null = null;
    if (resLikelihood && resImpact) {
      residualScore = resLikelihood * resImpact;
    }

    const changedFields: string[] = [];
    if (dto.title !== undefined && dto.title !== existing.title) changedFields.push('title');
    if (dto.category !== undefined && dto.category !== existing.category) changedFields.push('category');
    if (dto.likelihood !== undefined && dto.likelihood !== existing.likelihood) changedFields.push('likelihood');
    if (dto.impact !== undefined && dto.impact !== existing.impact) changedFields.push('impact');
    if (dto.residualLikelihood !== undefined && dto.residualLikelihood !== existing.residualLikelihood) changedFields.push('residualLikelihood');
    if (dto.residualImpact !== undefined && dto.residualImpact !== existing.residualImpact) changedFields.push('residualImpact');
    if (dto.status !== undefined && dto.status !== existing.status) changedFields.push('status');
    if (dto.owner !== undefined && dto.owner !== existing.owner) changedFields.push('owner');
    if (dto.assetId !== undefined && dto.assetId !== existing.assetId) changedFields.push('assetId');
    if (dto.departmentId !== undefined && dto.departmentId !== existing.departmentId) changedFields.push('departmentId');
    if (dto.projectId !== undefined && dto.projectId !== existing.projectId) changedFields.push('projectId');
    if (targetFwId !== existing.frameworkId) changedFields.push('frameworkId');
    if (targetRefId !== existing.frameworkReferenceId) changedFields.push('frameworkReferenceId');
    if (dto.treatmentPlan !== undefined && dto.treatmentPlan !== existing.treatmentPlan) changedFields.push('treatmentPlan');
    if (dto.treatmentStrategy !== undefined && dto.treatmentStrategy !== existing.treatmentStrategy) changedFields.push('treatmentStrategy');
    if (dto.treatmentOwner !== undefined && dto.treatmentOwner !== existing.treatmentOwner) changedFields.push('treatmentOwner');
    if (dto.treatmentDueDate !== undefined) changedFields.push('treatmentDueDate');
    if (dto.treatmentStatus !== undefined && dto.treatmentStatus !== existing.treatmentStatus) changedFields.push('treatmentStatus');

    const updated = await this.prisma.risk.update({
      where: { id },
      data: {
        ...(dto.title !== undefined && { title: dto.title }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.category !== undefined && { category: dto.category }),
        likelihood,
        impact,
        score,
        ...(dto.residualLikelihood !== undefined && { residualLikelihood: dto.residualLikelihood }),
        ...(dto.residualImpact !== undefined && { residualImpact: dto.residualImpact }),
        residualScore,
        ...(dto.status !== undefined && { status: dto.status }),
        ...(dto.owner !== undefined && { owner: dto.owner }),
        ...(dto.assetId !== undefined && { assetId: dto.assetId || null }),
        ...(dto.departmentId !== undefined && { departmentId: dto.departmentId || null }),
        ...(dto.projectId !== undefined && { projectId: dto.projectId || null }),
        frameworkId: targetFwId || null,
        frameworkReferenceId: targetRefId || null,
        ...(dto.treatmentPlan !== undefined && { treatmentPlan: dto.treatmentPlan }),
        ...(dto.treatmentStrategy !== undefined && { treatmentStrategy: dto.treatmentStrategy }),
        ...(dto.treatmentOwner !== undefined && { treatmentOwner: dto.treatmentOwner }),
        ...(dto.treatmentDueDate !== undefined && { treatmentDueDate: dto.treatmentDueDate ? new Date(dto.treatmentDueDate) : null }),
        ...(dto.treatmentStatus !== undefined && { treatmentStatus: dto.treatmentStatus }),
      },
      include: {
        asset: { select: { name: true } },
        framework: { select: { code: true, name: true } },
        frameworkReference: { select: { identifier: true, title: true, frameworkVersionId: true } },
      },
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

  async submitForApproval(
    authCtx: ResourceAuthContext,
    riskId: string,
    dto: SubmitRiskApprovalDto,
  ) {
    const scopeWhere = await this.resourceAuthService.getScopeWhereClause(authCtx);
    const risk = await this.prisma.risk.findFirst({
      where: { id: riskId, ...scopeWhere, deletedAt: null },
    });

    if (!risk) {
      throw new NotFoundException(`Risk with ID "${riskId}" not found`);
    }

    if (!this.approvalEngineService) {
      throw new BadRequestException('Approval engine service is not available.');
    }

    const title = dto.title?.trim() || `Risk Approval: ${risk.title} (${dto.purpose})`;
    const instance = await this.approvalEngineService.createApprovalInstance(
      authCtx.organizationId,
      authCtx.userId,
      {
        title,
        description: dto.description?.trim() || risk.description || undefined,
        resourceType: 'RISK',
        resourceId: risk.id,
        workflowId: dto.workflowId,
        purpose: dto.purpose as any,
        dueDays: dto.dueDays || 14,
      },
    );

    await this.auditLogsService.log({
      organizationId: authCtx.organizationId,
      actorId: authCtx.userId,
      action: 'RISK_APPROVAL_SUBMITTED',
      entityType: 'Risk',
      entityId: risk.id,
      metadata: {
        approvalInstanceId: instance.id,
        purpose: dto.purpose,
      },
    });

    return instance;
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
    const residualScore = risk.residualScore;
    return {
      id: risk.id,
      organizationId: risk.organizationId,
      departmentId: risk.departmentId || null,
      projectId: risk.projectId || null,
      title: risk.title,
      description: risk.description,
      category: risk.category || null,
      likelihood: risk.likelihood,
      impact: risk.impact,
      score,
      scoreBand: RisksService.getScoreBand(score),
      residualLikelihood: risk.residualLikelihood ?? null,
      residualImpact: risk.residualImpact ?? null,
      residualScore: residualScore ?? null,
      residualScoreBand: residualScore ? RisksService.getScoreBand(residualScore) : null,
      status: risk.status as RiskStatus,
      owner: risk.owner,
      assetId: risk.assetId,
      assetName: risk.asset?.name || null,
      frameworkId: risk.frameworkId || null,
      frameworkCode: risk.framework?.code || null,
      frameworkVersionId: risk.frameworkReference?.frameworkVersionId || null,
      frameworkReferenceId: risk.frameworkReferenceId || null,
      referenceIdentifier: risk.frameworkReference?.identifier || null,
      referenceTitle: risk.frameworkReference?.title || null,
      treatmentPlan: risk.treatmentPlan,
      treatmentStrategy: risk.treatmentStrategy || null,
      treatmentOwner: risk.treatmentOwner || null,
      treatmentDueDate: risk.treatmentDueDate ? (typeof risk.treatmentDueDate === 'string' ? risk.treatmentDueDate : risk.treatmentDueDate.toISOString()) : null,
      treatmentStatus: risk.treatmentStatus || null,
      createdAt: typeof risk.createdAt === 'string' ? risk.createdAt : risk.createdAt.toISOString(),
      updatedAt: typeof risk.updatedAt === 'string' ? risk.updatedAt : risk.updatedAt.toISOString(),
      createdById: risk.createdById,
      deletedAt: risk.deletedAt ? (typeof risk.deletedAt === 'string' ? risk.deletedAt : risk.deletedAt.toISOString()) : null,
    };
  }
}
