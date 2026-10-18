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
          evidenceAssociations: {
            include: { evidence: true },
            orderBy: { attachedAt: 'desc' },
          },
        },
      }),
      this.prisma.vulnerability.count({ where }),
    ]);

    const ownerCandidates = items.map((i) => i.remediationOwner);
    const { userMap, deptMap } = await this.resolveOwnerLookups(authCtx.organizationId, ownerCandidates);

    return {
      items: items.map((item) => this.mapToDto(item, userMap, deptMap)),
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
        evidenceAssociations: {
          include: { evidence: true },
          orderBy: { attachedAt: 'desc' },
        },
      },
    });

    if (!vuln) {
      throw new NotFoundException(`Vulnerability with ID "${id}" not found`);
    }

    const { userMap, deptMap } = await this.resolveOwnerLookups(
      authCtx.organizationId,
      [vuln.remediationOwner],
    );

    return this.mapToDto(vuln, userMap, deptMap);
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
        evidenceAssociations: {
          include: { evidence: true },
          orderBy: { attachedAt: 'desc' },
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

    const { userMap, deptMap } = await this.resolveOwnerLookups(
      authCtx.organizationId,
      [vuln.remediationOwner],
    );

    return this.mapToDto(vuln, userMap, deptMap);
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
        evidenceAssociations: {
          include: { evidence: true },
          orderBy: { attachedAt: 'desc' },
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

    const { userMap, deptMap } = await this.resolveOwnerLookups(
      authCtx.organizationId,
      [updated.remediationOwner],
    );

    return this.mapToDto(updated, userMap, deptMap);
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

  // --- EVIDENCE ATTACHMENT & SUPPORTING DOCUMENTS ---

  async getEvidence(authCtx: ResourceAuthContext, vulnerabilityId: string) {
    const scopeWhere = await this.resourceAuthService.getScopeWhereClause(authCtx);
    const vuln = await this.prisma.vulnerability.findFirst({
      where: { id: vulnerabilityId, ...scopeWhere, deletedAt: null },
      include: {
        evidenceAssociations: {
          include: { evidence: true },
          orderBy: { attachedAt: 'desc' },
        },
      },
    });

    if (!vuln) {
      throw new NotFoundException(`Vulnerability with ID "${vulnerabilityId}" not found`);
    }

    return vuln.evidenceAssociations.map((ea) => ({
      id: ea.evidence.id,
      title: ea.evidence.title,
      fileName: ea.evidence.fileName,
      fileSize: ea.evidence.fileSize,
      mimeType: ea.evidence.mimeType,
      status: ea.evidence.status,
      scanStatus: ea.evidence.scanStatus,
      attachedAt: ea.attachedAt.toISOString(),
    }));
  }

  async attachEvidence(authCtx: ResourceAuthContext, vulnerabilityId: string, evidenceId: string): Promise<VulnerabilityDto> {
    const scopeWhere = await this.resourceAuthService.getScopeWhereClause(authCtx);
    const [vuln, evidence] = await Promise.all([
      this.prisma.vulnerability.findFirst({
        where: { id: vulnerabilityId, ...scopeWhere, deletedAt: null },
      }),
      this.prisma.evidence.findFirst({
        where: { id: evidenceId, ...scopeWhere, deletedAt: null },
      }),
    ]);

    if (!vuln) {
      throw new NotFoundException(`Vulnerability with ID "${vulnerabilityId}" not found`);
    }
    if (!evidence) {
      throw new NotFoundException(`Evidence with ID "${evidenceId}" not found or out of scope`);
    }

    await this.prisma.vulnerabilityEvidence.upsert({
      where: {
        vulnerabilityId_evidenceId: {
          vulnerabilityId,
          evidenceId,
        },
      },
      create: {
        organizationId: authCtx.organizationId,
        vulnerabilityId,
        evidenceId,
      },
      update: {},
    });

    await this.auditLogsService.log({
      organizationId: authCtx.organizationId,
      actorId: authCtx.userId,
      action: 'VULNERABILITY_EVIDENCE_ATTACHED',
      entityType: 'Vulnerability',
      entityId: vulnerabilityId,
      metadata: { evidenceId, evidenceTitle: evidence.title },
    });

    return this.findOne(authCtx, vulnerabilityId);
  }

  async detachEvidence(authCtx: ResourceAuthContext, vulnerabilityId: string, evidenceId: string): Promise<{ success: boolean }> {
    const scopeWhere = await this.resourceAuthService.getScopeWhereClause(authCtx);
    const vuln = await this.prisma.vulnerability.findFirst({
      where: { id: vulnerabilityId, ...scopeWhere, deletedAt: null },
    });

    if (!vuln) {
      throw new NotFoundException(`Vulnerability with ID "${vulnerabilityId}" not found`);
    }

    await this.prisma.vulnerabilityEvidence.deleteMany({
      where: {
        vulnerabilityId,
        evidenceId,
      },
    });

    await this.auditLogsService.log({
      organizationId: authCtx.organizationId,
      actorId: authCtx.userId,
      action: 'VULNERABILITY_EVIDENCE_DETACHED',
      entityType: 'Vulnerability',
      entityId: vulnerabilityId,
      metadata: { evidenceId },
    });

    return { success: true };
  }

  private async resolveOwnerLookups(
    organizationId: string,
    ownerCandidateIds: string[],
  ): Promise<{ userMap: Map<string, any>; deptMap: Map<string, any> }> {
    const filtered = Array.from(new Set(ownerCandidateIds.filter(Boolean)));
    if (filtered.length === 0) {
      return { userMap: new Map(), deptMap: new Map() };
    }

    const [users, depts] = await Promise.all([
      this.prisma.user.findMany({
        where: { organizationId, id: { in: filtered } },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
        },
      }),
      this.prisma.department.findMany({
        where: { organizationId, id: { in: filtered } },
        select: { id: true, name: true },
      }),
    ]);

    const userMap = new Map<string, any>((users || []).map((u) => [u.id, u]));
    const deptMap = new Map<string, any>((depts || []).map((d) => [d.id, d]));
    return { userMap, deptMap };
  }

  private toIsoString(date: any): string {
    if (!date) return new Date().toISOString();
    if (date instanceof Date) return date.toISOString();
    return new Date(date).toISOString();
  }

  private mapToDto(
    vuln: any,
    userMap?: Map<string, any>,
    deptMap?: Map<string, any>,
  ): VulnerabilityDto {
    let ownerId: string | null = null;
    let ownerName: string = vuln.remediationOwner || 'Unassigned';
    let ownerEmail: string | undefined = undefined;
    let ownerRole: string | undefined = undefined;
    let teamName: string | null = null;

    if (vuln.remediationOwner) {
      const user = userMap?.get(vuln.remediationOwner);
      const dept = deptMap?.get(vuln.remediationOwner);
      if (user) {
        ownerId = user.id;
        ownerName = user.name || user.email;
        ownerEmail = user.email;
        ownerRole = user.role;
        teamName = user.department?.name || null;
      } else if (dept) {
        ownerId = dept.id;
        ownerName = dept.name;
        teamName = dept.name;
      }
    }

    const evidences = vuln.evidenceAssociations
      ? vuln.evidenceAssociations.map((ea: any) => ({
          id: ea.evidence.id,
          title: ea.evidence.title,
          fileName: ea.evidence.fileName,
          fileSize: ea.evidence.fileSize,
          mimeType: ea.evidence.mimeType,
          status: ea.evidence.status,
          scanStatus: ea.evidence.scanStatus,
          attachedAt: this.toIsoString(ea.attachedAt),
        }))
      : [];

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
      discoveredAt: this.toIsoString(vuln.discoveredAt),
      lastSeenAt: this.toIsoString(vuln.lastSeenAt),
      remediationOwner: vuln.remediationOwner,
      remediationOwnerId: ownerId,
      remediationOwnerName: ownerName,
      remediationOwnerEmail: ownerEmail,
      remediationOwnerRole: ownerRole,
      remediationTeamName: teamName,
      dueDate: vuln.dueDate ? this.toIsoString(vuln.dueDate) : null,
      remediationNotes: vuln.remediationNotes,
      createdById: vuln.createdById,
      createdAt: this.toIsoString(vuln.createdAt),
      updatedAt: this.toIsoString(vuln.updatedAt),
      affectedAssets: vuln.affectedAssets
        ? vuln.affectedAssets.map((va: any) => ({
            id: va.id,
            assetId: va.assetId,
            assetName: va.asset?.name || '',
          }))
        : [],
      evidences,
    } as any;
  }
}
