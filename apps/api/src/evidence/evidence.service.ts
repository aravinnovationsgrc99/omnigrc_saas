import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { ResourceAuthorizationService, ResourceAuthContext } from '../auth/resource-authorization.service';
import { TenantContext } from '../tenant/tenant.context';
import { EvidenceStorageService } from './evidence-storage.service';
import { EvidenceScannerService } from './evidence-scanner.service';
import {
  EvidenceDto,
  CreateEvidenceUploadDto,
  EvidenceVaultQueryDto,
  PaginatedEvidenceDto,
  EvidenceType,
  EvidenceStatus,
  EvidenceScanStatus,
  ResourceAssociationDto,
  Role,
  ControlEvidenceAssociationDto,
  PaginatedControlEvidenceAssociationsDto,
  ControlEvidenceQueryDto,
  TargetResourceItemDto,
} from '@omnigrc/shared';
import { Response } from 'express';

@Injectable()
export class EvidenceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogsService: AuditLogsService,
    private readonly resourceAuthService: ResourceAuthorizationService,
    private readonly storageService: EvidenceStorageService,
    private readonly scannerService: EvidenceScannerService,
  ) {}

  async createAndUpload(
    authCtx: ResourceAuthContext,
    file: { originalname: string; buffer: Buffer; mimetype: string },
    dto: CreateEvidenceUploadDto & { departmentId?: string; projectId?: string },
  ): Promise<EvidenceDto> {
    if (!file || !file.buffer) {
      throw new BadRequestException('Binary proof file is required for upload.');
    }

    await this.resourceAuthService.authorize(authCtx, {
      action: 'WRITE',
      departmentId: dto.departmentId,
      projectId: dto.projectId,
    });

    if (dto.targetResourceType && dto.targetResourceId) {
      await this.verifyResourceBelongsToOrg(authCtx, dto.targetResourceType, dto.targetResourceId);
    }

    const saved = await this.storageService.saveFile(file, authCtx.organizationId);

    try {
      const scanStatus = await this.scannerService.scanFile(saved.storageKey, file.buffer);

      let status: EvidenceStatus;
      if (scanStatus === EvidenceScanStatus.CLEAN) {
        status = EvidenceStatus.ACTIVE;
      } else if (scanStatus === EvidenceScanStatus.QUARANTINED || scanStatus === EvidenceScanStatus.SCAN_FAILED) {
        status = EvidenceStatus.QUARANTINED;
      } else {
        // PENDING_SCAN
        status = EvidenceStatus.PENDING;
      }

      let retentionUntil: Date | null = null;
      if (dto.retentionDays && dto.retentionDays > 0) {
        retentionUntil = new Date(Date.now() + dto.retentionDays * 24 * 60 * 60 * 1000);
      }

      let evidenceType = dto.evidenceType || EvidenceType.DOCUMENT;
      if (!dto.evidenceType) {
        if (saved.mimeType.startsWith('image/')) evidenceType = EvidenceType.IMAGE;
        else if (saved.mimeType.includes('excel') || saved.mimeType.includes('spreadsheet') || saved.mimeType.includes('csv'))
          evidenceType = EvidenceType.SPREADSHEET;
      }

      const executeTx = async (tx: any) => {
        const ev = await tx.evidence.create({
          data: {
            organizationId: authCtx.organizationId,
            departmentId: dto.departmentId || null,
            projectId: dto.projectId || null,
            title: dto.title.trim(),
            description: dto.description?.trim() || null,
            evidenceType,
            fileName: saved.originalFileName,
            fileSize: saved.fileSize,
            mimeType: saved.mimeType,
            storageKey: saved.storageKey,
            checksum: saved.checksum,
            status,
            scanStatus,
            uploadedById: authCtx.userId,
            retentionUntil,
          },
        });

        if (dto.targetResourceType && dto.targetResourceId) {
          await this.createAssociationRecord(authCtx.organizationId, ev.id, dto.targetResourceType, dto.targetResourceId, tx);
        }

        if (dto.frameworkReferenceId) {
          const ref = await tx.frameworkReference.findUnique({
            where: { id: dto.frameworkReferenceId },
          });
          if (ref) {
            await tx.evidenceFrameworkReference.create({
              data: {
                evidenceId: ev.id,
                frameworkReferenceId: dto.frameworkReferenceId,
              },
            });
          }
        }

        return ev;
      };

      const evidence = typeof (this.prisma as any).$transaction === 'function'
        ? await (this.prisma as any).$transaction(executeTx)
        : await executeTx(this.prisma);

      try {
        await this.auditLogsService.log({
          organizationId: authCtx.organizationId,
          actorId: authCtx.userId,
          action: 'EVIDENCE_UPLOADED',
          entityType: 'Evidence',
          entityId: evidence.id,
          metadata: {
            title: evidence.title,
            fileName: evidence.fileName,
            fileSize: evidence.fileSize,
            checksum: evidence.checksum,
            targetResourceType: dto.targetResourceType || null,
            targetResourceId: dto.targetResourceId || null,
          },
        });
      } catch {
        // Non-fatal logging failure: does not invalidate committed evidence
      }

      return this.mapToDto(evidence.id);
    } catch (err: any) {
      // Storage compensation: remove orphaned file on disk if DB persistence or association fails
      const deleteSuccess = await this.storageService.deleteFile(saved.storageKey);
      if (!deleteSuccess) {
        // Cleanup failed: record an observable orphan alert
        try {
          await this.auditLogsService.log({
            organizationId: authCtx.organizationId,
            actorId: authCtx.userId,
            action: 'STORAGE_ORPHAN_CLEANUP_FAILED',
            entityType: 'Evidence',
            entityId: 'uncommitted',
            metadata: {
              storageKey: saved.storageKey,
              fileName: saved.originalFileName,
              dbError: err?.message || 'DB Error',
              reason: 'Database write failed and automatic storage cleanup failed to delete file',
            },
          });
        } catch {
          // ignore non-fatal audit log error during compensation
        }
      }
      throw err;
    }
  }

  async findAll(authCtx: ResourceAuthContext, query: EvidenceVaultQueryDto): Promise<PaginatedEvidenceDto> {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const skip = (page - 1) * limit;
    const search = query.search?.trim();
    const status = query.status || EvidenceStatus.ACTIVE;

    const scopeWhere = await this.resourceAuthService.getScopeWhereClause(authCtx);

    const where: any = {
      ...scopeWhere,
      deletedAt: null,
      ...(query.evidenceType && { evidenceType: query.evidenceType }),
      ...(status && { status }),
    };

    if (query.frameworkReferenceId) {
      where.frameworkReferences = {
        some: { frameworkReferenceId: query.frameworkReferenceId },
      };
    } else if (query.frameworkId) {
      where.frameworkReferences = {
        some: {
          frameworkReference: {
            frameworkVersion: { frameworkId: query.frameworkId },
          },
        },
      };
    }

    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { fileName: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }

    const shouldIncludeLegacy =
      (!query.domain || query.domain === 'AUDIT') &&
      !query.frameworkId &&
      !query.frameworkReferenceId &&
      typeof (this.prisma as any).auditEvidence?.findMany === 'function';

    if (!shouldIncludeLegacy) {
      const globalSkip = (page - 1) * limit;
      const [evidences, total] = await Promise.all([
        this.prisma.evidence.findMany({
          where,
          skip: globalSkip,
          take: limit,
          include: {
            controlAssociations: { include: { control: true } },
            riskAssociations: { include: { risk: true } },
            policyAssociations: { include: { policy: true } },
            auditCheckAssociations: { include: { checkItem: true } },
            auditFindingAssociations: { include: { finding: true } },
            vendorAssociations: { include: { vendor: true } },
            vulnerabilityAssociations: { include: { vulnerability: true } },
            incidentAssociations: { include: { incident: true } },
            frameworkReferences: {
              include: {
                frameworkReference: {
                  include: {
                    frameworkVersion: {
                      include: { framework: true },
                    },
                  },
                },
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        }),
        this.prisma.evidence.count({ where }),
      ]);

      const uploaderIds = Array.from(new Set(evidences.map((e) => e.uploadedById)));
      const users = (await TenantContext.runWithDisplayNameLookup(() =>
        this.prisma.user.findMany({
          where: { id: { in: uploaderIds } },
          select: { id: true, name: true, email: true },
        }),
      )) || [];
      const userMap = new Map((users || []).map((u) => [u.id, u.name || u.email]));

      const items: EvidenceDto[] = evidences.map((e) => {
        const associations: ResourceAssociationDto[] = [];
        e.controlAssociations?.forEach((ca: any) => associations.push({ resourceType: 'CONTROL', resourceId: ca.controlId, resourceTitle: ca.control?.name }));
        e.riskAssociations?.forEach((ra: any) => associations.push({ resourceType: 'RISK', resourceId: ra.riskId, resourceTitle: ra.risk?.title }));
        e.policyAssociations?.forEach((pa: any) => associations.push({ resourceType: 'POLICY', resourceId: pa.policyId, resourceTitle: pa.policy?.title }));
        e.auditCheckAssociations?.forEach((aca: any) => associations.push({ resourceType: 'AUDIT_CHECK', resourceId: aca.checkItemId, resourceTitle: aca.checkItem?.title }));
        e.auditFindingAssociations?.forEach((afa: any) => associations.push({ resourceType: 'AUDIT_FINDING', resourceId: afa.findingId, resourceTitle: afa.finding?.title }));
        e.vendorAssociations?.forEach((va: any) => associations.push({ resourceType: 'VENDOR', resourceId: va.vendorId, resourceTitle: va.vendor?.name }));
        e.vulnerabilityAssociations?.forEach((vua: any) => associations.push({ resourceType: 'VULNERABILITY', resourceId: vua.vulnerabilityId, resourceTitle: vua.vulnerability?.title }));
        e.incidentAssociations?.forEach((ia: any) => associations.push({ resourceType: 'INCIDENT', resourceId: ia.incidentId, resourceTitle: ia.incident?.title }));

        return {
          id: e.id,
          organizationId: e.organizationId,
          departmentId: e.departmentId || null,
          projectId: e.projectId || null,
          title: e.title,
          description: e.description,
          evidenceType: e.evidenceType as EvidenceType,
          fileName: e.fileName,
          fileSize: e.fileSize,
          mimeType: e.mimeType,
          storageKey: e.storageKey,
          checksum: e.checksum,
          status: e.status as EvidenceStatus,
          scanStatus: e.scanStatus as EvidenceScanStatus,
          uploadedById: e.uploadedById,
          uploaderName: userMap.get(e.uploadedById) || 'Unknown User',
          retentionUntil: e.retentionUntil ? e.retentionUntil.toISOString() : null,
          createdAt: e.createdAt.toISOString(),
          updatedAt: e.updatedAt.toISOString(),
          associations,
          frameworkReferences: (e.frameworkReferences || []).map((fr: any) => ({
            id: fr.frameworkReference.id,
            identifier: fr.frameworkReference.identifier,
            title: fr.frameworkReference.title,
            frameworkCode: fr.frameworkReference.frameworkVersion?.framework?.code || undefined,
            frameworkName: fr.frameworkReference.frameworkVersion?.framework?.name || undefined,
          })),
        } as any;
      });

      return {
        items,
        total,
        page,
        limit,
      };
    }

    // 1. Calculate canonical and legacy counts
    const legacyWhere: any = { organizationId: authCtx.organizationId };
    if (search) {
      legacyWhere.OR = [
        { fileName: { contains: search, mode: 'insensitive' } },
        { fileUrl: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [canonicalCount, legacyCount] = await Promise.all([
      this.prisma.evidence.count({ where }),
      this.prisma.auditEvidence.count({ where: legacyWhere }),
    ]);

    const total = canonicalCount + legacyCount;
    const globalSkip = (page - 1) * limit;

    // 2. Partitioned Fetching: Canonical Slice
    let evidences: any[] = [];
    if (globalSkip < canonicalCount || (canonicalCount === 0 && globalSkip === 0)) {
      const takeCanonical = canonicalCount === 0 ? limit : Math.min(limit, canonicalCount - globalSkip);
      evidences = await this.prisma.evidence.findMany({
        where,
        skip: globalSkip,
        take: takeCanonical,
        include: {
          controlAssociations: { include: { control: true } },
          riskAssociations: { include: { risk: true } },
          policyAssociations: { include: { policy: true } },
          auditCheckAssociations: { include: { checkItem: true } },
          auditFindingAssociations: { include: { finding: true } },
          vendorAssociations: { include: { vendor: true } },
          vulnerabilityAssociations: { include: { vulnerability: true } },
          incidentAssociations: { include: { incident: true } },
          frameworkReferences: {
            include: {
              frameworkReference: {
                include: {
                  frameworkVersion: {
                    include: { framework: true },
                  },
                },
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      });
    }

    // 4. Map Canonical DTOs
    const uploaderIds = Array.from(new Set(evidences.map((e) => e.uploadedById)));
    const users = (await TenantContext.runWithDisplayNameLookup(() =>
      this.prisma.user.findMany({
        where: { id: { in: uploaderIds } },
        select: { id: true, name: true, email: true },
      }),
    )) || [];
    const userMap = new Map((users || []).map((u) => [u.id, u.name || u.email]));

    const canonicalDtos: EvidenceDto[] = evidences.map((e) => {
      const associations: ResourceAssociationDto[] = [];
      e.controlAssociations?.forEach((ca: any) => associations.push({ resourceType: 'CONTROL', resourceId: ca.controlId, resourceTitle: ca.control?.name }));
      e.riskAssociations?.forEach((ra: any) => associations.push({ resourceType: 'RISK', resourceId: ra.riskId, resourceTitle: ra.risk?.title }));
      e.policyAssociations?.forEach((pa: any) => associations.push({ resourceType: 'POLICY', resourceId: pa.policyId, resourceTitle: pa.policy?.title }));
      e.auditCheckAssociations?.forEach((aca: any) => associations.push({ resourceType: 'AUDIT_CHECK', resourceId: aca.checkItemId, resourceTitle: aca.checkItem?.title }));
      e.auditFindingAssociations?.forEach((afa: any) => associations.push({ resourceType: 'AUDIT_FINDING', resourceId: afa.findingId, resourceTitle: afa.finding?.title }));
      e.vendorAssociations?.forEach((va: any) => associations.push({ resourceType: 'VENDOR', resourceId: va.vendorId, resourceTitle: va.vendor?.name }));
      e.vulnerabilityAssociations?.forEach((vua: any) => associations.push({ resourceType: 'VULNERABILITY', resourceId: vua.vulnerabilityId, resourceTitle: vua.vulnerability?.title }));
      e.incidentAssociations?.forEach((ia: any) => associations.push({ resourceType: 'INCIDENT', resourceId: ia.incidentId, resourceTitle: ia.incident?.title }));

      return {
        id: e.id,
        organizationId: e.organizationId,
        departmentId: e.departmentId || null,
        projectId: e.projectId || null,
        title: e.title,
        description: e.description,
        evidenceType: e.evidenceType as EvidenceType,
        fileName: e.fileName,
        fileSize: e.fileSize,
        mimeType: e.mimeType,
        storageKey: e.storageKey,
        checksum: e.checksum,
        status: e.status as EvidenceStatus,
        scanStatus: e.scanStatus as EvidenceScanStatus,
        uploadedById: e.uploadedById,
        uploaderName: userMap.get(e.uploadedById) || 'Unknown User',
        retentionUntil: e.retentionUntil ? e.retentionUntil.toISOString() : null,
        createdAt: e.createdAt.toISOString(),
        updatedAt: e.updatedAt.toISOString(),
        associations,
        frameworkReferences: (e.frameworkReferences || []).map((fr: any) => ({
          id: fr.frameworkReference.id,
          identifier: fr.frameworkReference.identifier,
          title: fr.frameworkReference.title,
          frameworkCode: fr.frameworkReference.frameworkVersion?.framework?.code || undefined,
          frameworkName: fr.frameworkReference.frameworkVersion?.framework?.name || undefined,
        })),
      } as any;
    });

    // 5. Partitioned Fetching: Legacy Slice
    const numLegacyNeeded = limit - canonicalDtos.length;
    let legacyDtos: EvidenceDto[] = [];
    if (numLegacyNeeded > 0 && legacyCount > 0 && typeof (this.prisma as any).auditEvidence?.findMany === 'function') {
      const legacySkip = Math.max(0, globalSkip - canonicalCount);
      const legacyRecords = await this.prisma.auditEvidence.findMany({
        where: legacyWhere,
        include: { checkItem: true, finding: true },
        orderBy: { createdAt: 'desc' },
        skip: legacySkip,
        take: numLegacyNeeded,
      });

      // Deduplicate: If legacy fileUrl references a canonical record ID, omit duplicate
      const canonicalIds = new Set(canonicalDtos.map((c) => c.id));
      const filteredLegacy = legacyRecords.filter(
        (leg: any) => !canonicalIds.has(leg.id) && !Array.from(canonicalIds).some((canId) => leg.fileUrl?.includes(canId)),
      );

      // Resolve legacy uploaders if present
      const legacyUploaderIds = Array.from(new Set(filteredLegacy.map((l: any) => l.uploadedById).filter(Boolean))) as string[];
      const missingUploaderIds = legacyUploaderIds.filter((id) => !userMap.has(id));
      if (missingUploaderIds.length > 0 && typeof (this.prisma as any).user?.findMany === 'function') {
        const extraUsers = (await TenantContext.runWithDisplayNameLookup(() =>
          this.prisma.user.findMany({
            where: { id: { in: missingUploaderIds } },
            select: { id: true, name: true, email: true },
          })
        )) || [];
        extraUsers.forEach((u: any) => userMap.set(u.id, u.name || u.email));
      }

      legacyDtos = filteredLegacy.map((leg: any) => ({
        id: leg.id,
        organizationId: leg.organizationId,
        departmentId: null,
        projectId: null,
        title: leg.fileName,
        description: leg.mimeType ? `Legacy Audit Evidence (${leg.mimeType})` : 'Legacy Audit Evidence',
        evidenceType: EvidenceType.DOCUMENT,
        fileName: leg.fileName,
        fileSize: leg.fileSize || 0,
        mimeType: leg.mimeType || 'application/octet-stream',
        storageKey: leg.fileUrl,
        checksum: null,
        status: EvidenceStatus.ACTIVE,
        scanStatus: EvidenceScanStatus.CLEAN,
        uploadedById: leg.uploadedById,
        uploaderName: (leg.uploadedById && userMap.get(leg.uploadedById)) || 'Legacy Auditor',
        retentionUntil: null,
        createdAt: leg.createdAt.toISOString(),
        updatedAt: leg.createdAt.toISOString(),
        associations: [
          ...(leg.checkItemId ? [{ resourceType: 'AUDIT_CHECK' as const, resourceId: leg.checkItemId, resourceTitle: leg.checkItem?.title }] : []),
          ...(leg.findingId ? [{ resourceType: 'AUDIT_FINDING' as const, resourceId: leg.findingId, resourceTitle: leg.finding?.title }] : []),
        ],
        frameworkReferences: [],
      }));
    }

    return {
      items: [...canonicalDtos, ...legacyDtos],
      total,
      page,
      limit,
    };
  }

  async getTargetResources(
    authCtx: ResourceAuthContext,
    type: string,
    search?: string,
  ): Promise<TargetResourceItemDto[]> {
    if (!type || type.toUpperCase() === 'NONE') {
      return [];
    }

    const scopeWhere = await this.resourceAuthService.getScopeWhereClause(authCtx);
    const searchTerm = search?.trim();
    const upperType = type.toUpperCase().trim();

    switch (upperType) {
      case 'CONTROL': {
        const where: any = { ...scopeWhere, deletedAt: null };
        if (searchTerm) {
          where.OR = [
            { name: { contains: searchTerm, mode: 'insensitive' } },
            { description: { contains: searchTerm, mode: 'insensitive' } },
          ];
        }
        const controls = await this.prisma.control.findMany({
          where,
          select: { id: true, name: true, category: true, description: true },
          take: 50,
          orderBy: { name: 'asc' },
        });
        return controls.map((c) => ({
          id: c.id,
          name: c.name,
          code: c.category || undefined,
          type: 'CONTROL',
          details: c.description ? c.description.slice(0, 80) : undefined,
        }));
      }

      case 'RISK': {
        const where: any = { ...scopeWhere, deletedAt: null };
        if (searchTerm) {
          where.title = { contains: searchTerm, mode: 'insensitive' };
        }
        const risks = await this.prisma.risk.findMany({
          where,
          select: { id: true, title: true, score: true, status: true },
          take: 50,
          orderBy: { score: 'desc' },
        });
        return risks.map((r) => ({
          id: r.id,
          name: r.title,
          code: `Score: ${r.score}`,
          type: 'RISK',
          details: `Status: ${r.status}`,
        }));
      }

      case 'POLICY': {
        const where: any = { ...scopeWhere, deletedAt: null };
        if (searchTerm) {
          where.OR = [
            { title: { contains: searchTerm, mode: 'insensitive' } },
            { code: { contains: searchTerm, mode: 'insensitive' } },
          ];
        }
        const policies = await this.prisma.policy.findMany({
          where,
          select: { id: true, title: true, code: true, status: true },
          take: 50,
          orderBy: { title: 'asc' },
        });
        return policies.map((p) => ({
          id: p.id,
          name: p.title,
          code: p.code || undefined,
          type: 'POLICY',
          details: `Status: ${p.status}`,
        }));
      }

      case 'VENDOR': {
        const where: any = { ...scopeWhere, deletedAt: null };
        if (searchTerm) {
          where.name = { contains: searchTerm, mode: 'insensitive' };
        }
        const vendors = await this.prisma.vendor.findMany({
          where,
          select: { id: true, name: true, criticality: true, category: true },
          take: 50,
          orderBy: { name: 'asc' },
        });
        return vendors.map((v) => ({
          id: v.id,
          name: v.name,
          code: v.criticality,
          type: 'VENDOR',
          details: v.category || undefined,
        }));
      }

      case 'VULNERABILITY': {
        const where: any = { ...scopeWhere, deletedAt: null };
        if (searchTerm) {
          where.title = { contains: searchTerm, mode: 'insensitive' };
        }
        const vulns = await this.prisma.vulnerability.findMany({
          where,
          select: { id: true, title: true, severity: true, status: true },
          take: 50,
          orderBy: { createdAt: 'desc' },
        });
        return vulns.map((v) => ({
          id: v.id,
          name: v.title,
          code: v.severity,
          type: 'VULNERABILITY',
          details: `Status: ${v.status}`,
        }));
      }

      case 'INCIDENT': {
        const where: any = { ...scopeWhere, deletedAt: null };
        if (searchTerm) {
          where.title = { contains: searchTerm, mode: 'insensitive' };
        }
        const incidents = await this.prisma.incident.findMany({
          where,
          select: { id: true, title: true, severity: true, status: true },
          take: 50,
          orderBy: { createdAt: 'desc' },
        });
        return incidents.map((i) => ({
          id: i.id,
          name: i.title,
          code: i.severity,
          type: 'INCIDENT',
          details: `Status: ${i.status}`,
        }));
      }

      case 'AUDIT_CHECK': {
        const where: any = { organizationId: authCtx.organizationId };
        if (searchTerm) {
          where.OR = [
            { title: { contains: searchTerm, mode: 'insensitive' } },
            { description: { contains: searchTerm, mode: 'insensitive' } },
          ];
        }
        const checks = await this.prisma.auditCheckItem.findMany({
          where,
          select: {
            id: true,
            title: true,
            result: true,
            description: true,
            assessment: {
              select: {
                auditPlan: { select: { title: true } },
              },
            },
          },
          take: 50,
          orderBy: { createdAt: 'desc' },
        });
        return checks.map((c: any) => ({
          id: c.id,
          name: c.title,
          code: c.result,
          type: 'AUDIT_CHECK',
          details: c.assessment?.auditPlan?.title
            ? `Audit: ${c.assessment.auditPlan.title}`
            : (c.description ? c.description.slice(0, 80) : undefined),
        }));
      }

      case 'AUDIT_FINDING': {
        const where: any = { organizationId: authCtx.organizationId };
        if (searchTerm) {
          where.OR = [
            { title: { contains: searchTerm, mode: 'insensitive' } },
            { description: { contains: searchTerm, mode: 'insensitive' } },
          ];
        }
        const findings = await this.prisma.auditFinding.findMany({
          where,
          select: {
            id: true,
            title: true,
            severity: true,
            status: true,
            description: true,
            assessment: {
              select: {
                auditPlan: { select: { title: true } },
              },
            },
          },
          take: 50,
          orderBy: { createdAt: 'desc' },
        });
        return findings.map((f: any) => ({
          id: f.id,
          name: f.title,
          code: `${f.severity} / ${f.status}`,
          type: 'AUDIT_FINDING',
          details: f.assessment?.auditPlan?.title
            ? `Audit: ${f.assessment.auditPlan.title}`
            : (f.description ? f.description.slice(0, 80) : undefined),
        }));
      }

      default:
        throw new BadRequestException(`Unsupported resource type "${type}".`);
    }
  }

  async findOne(authCtx: ResourceAuthContext, evidenceId: string): Promise<EvidenceDto> {
    const scopeWhere = await this.resourceAuthService.getScopeWhereClause(authCtx);
    const evidence = await this.prisma.evidence.findFirst({
      where: { id: evidenceId, ...scopeWhere, deletedAt: null },
    });

    if (!evidence) {
      // Legacy AuditEvidence fallback
      const legacy = typeof (this.prisma as any).auditEvidence?.findFirst === 'function'
        ? await this.prisma.auditEvidence.findFirst({
            where: { id: evidenceId, organizationId: authCtx.organizationId },
            include: {
              checkItem: true,
              finding: true,
            },
          })
        : null;

      if (!legacy) {
        throw new NotFoundException(`Evidence record "${evidenceId}" not found.`);
      }

      const associations: ResourceAssociationDto[] = [];
      if (legacy.checkItemId) {
        associations.push({
          resourceType: 'AUDIT_CHECK',
          resourceId: legacy.checkItemId,
          resourceTitle: legacy.checkItem?.title || undefined,
        });
      }
      if (legacy.findingId) {
        associations.push({
          resourceType: 'AUDIT_FINDING',
          resourceId: legacy.findingId,
          resourceTitle: legacy.finding?.title || undefined,
        });
      }

      let uploaderName = 'Legacy Auditor';
      if (legacy.uploadedById) {
        const u = await TenantContext.runWithDisplayNameLookup(() =>
          typeof (this.prisma as any).user?.findUnique === 'function' ? this.prisma.user.findUnique({
            where: { id: legacy.uploadedById },
            select: { id: true, name: true, email: true },
          }) : Promise.resolve(null),
        );
        if (u) {
          uploaderName = u.name || u.email || 'Legacy Auditor';
        }
      }

      let calculatedChecksum: string | null = null;
      if (legacy.fileUrl && !legacy.fileUrl.startsWith('http://') && !legacy.fileUrl.startsWith('https://')) {
        try {
          const exists = await this.storageService.exists(legacy.fileUrl);
          if (exists) {
            const integrity = await this.storageService.verifyIntegrity(legacy.fileUrl, '');
            calculatedChecksum = integrity.actualChecksum;
          }
        } catch {
          // Keep null if unavailable
        }
      }

      return {
        id: legacy.id,
        organizationId: legacy.organizationId,
        departmentId: null,
        projectId: null,
        title: legacy.fileName,
        description: legacy.mimeType ? `Legacy Audit Evidence (${legacy.mimeType})` : 'Legacy Audit Evidence',
        evidenceType: EvidenceType.DOCUMENT,
        fileName: legacy.fileName,
        fileSize: legacy.fileSize || 0,
        mimeType: legacy.mimeType || 'application/octet-stream',
        storageKey: legacy.fileUrl,
        checksum: calculatedChecksum,
        status: EvidenceStatus.ACTIVE,
        scanStatus: EvidenceScanStatus.CLEAN,
        uploadedById: legacy.uploadedById,
        uploaderName,
        retentionUntil: null,
        createdAt: legacy.createdAt.toISOString(),
        updatedAt: legacy.createdAt.toISOString(),
        associations,
        frameworkReferences: [],
      } as any;
    }

    return this.mapToDto(evidenceId);
  }

  public isAllowedLegacyDestination(rawUrl: string): boolean {
    if (!rawUrl || typeof rawUrl !== 'string') return false;
    const url = rawUrl.trim();
    if (!url) return false;

    // Reject protocol-relative URLs (e.g. //attacker.com/malware)
    if (url.startsWith('//')) return false;

    // Reject backslashes (Windows path separator / UNC path evasion)
    if (url.includes('\\')) return false;

    // Reject filesystem paths or hazardous schemes
    if (url.startsWith('file:') || url.startsWith('javascript:') || url.startsWith('data:') || /^[a-zA-Z]:/.test(url)) {
      return false;
    }

    // Reject directory traversal
    if (url.includes('..')) return false;

    // Relative URL within application (must start with single '/')
    if (url.startsWith('/')) {
      return true;
    }

    // Absolute HTTP/HTTPS URL with strict host allowlist
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return false;
      }

      const hostname = parsed.hostname.toLowerCase();
      const envHosts = (process.env.ALLOWED_LEGACY_EVIDENCE_HOSTS || '')
        .split(',')
        .map((h) => h.trim().toLowerCase())
        .filter(Boolean);

      const defaultAllowedHosts = [
        'vault.omnigrc.internal',
        'localhost',
        '127.0.0.1',
      ];

      const allowedHosts = new Set([...defaultAllowedHosts, ...envHosts]);
      if (allowedHosts.has(hostname) || hostname.endsWith('.omnigrc.internal')) {
        return true;
      }

      return false;
    } catch {
      return false;
    }
  }

  async downloadEvidence(
    authCtx: ResourceAuthContext,
    evidenceId: string,
    res: Response,
  ): Promise<void> {
    const scopeWhere = await this.resourceAuthService.getScopeWhereClause(authCtx);
    const evidence = await this.prisma.evidence.findFirst({
      where: { id: evidenceId, ...scopeWhere, deletedAt: null },
    });

    if (!evidence) {
      const legacy = typeof (this.prisma as any).auditEvidence?.findFirst === 'function'
        ? await this.prisma.auditEvidence.findFirst({
            where: { id: evidenceId, organizationId: authCtx.organizationId },
          })
        : null;
      if (!legacy) throw new NotFoundException(`Evidence record "${evidenceId}" not found.`);

      const url = (legacy.fileUrl || '').trim();
      if (!url) {
        throw new BadRequestException(`Legacy evidence record "${evidenceId}" has no valid fileUrl or storage destination.`);
      }

      if (!this.isAllowedLegacyDestination(url)) {
        throw new BadRequestException(`Unapproved or unsafe legacy evidence redirect destination: "${legacy.fileUrl}".`);
      }

      await this.auditLogsService.log({
        organizationId: authCtx.organizationId,
        actorId: authCtx.userId,
        action: 'EVIDENCE_DOWNLOADED',
        entityType: 'AuditEvidence',
        entityId: legacy.id,
        metadata: {
          fileName: legacy.fileName,
          fileUrl: legacy.fileUrl,
          isLegacy: true,
        },
      });

      res.redirect(legacy.fileUrl);
      return;
    }

    if (evidence.status === EvidenceStatus.QUARANTINED || evidence.scanStatus === EvidenceScanStatus.QUARANTINED) {
      throw new ForbiddenException(`Evidence file "${evidence.title}" is QUARANTINED due to malware scan policy.`);
    }

    if (evidence.scanStatus === EvidenceScanStatus.SCAN_FAILED) {
      throw new ForbiddenException(`Evidence file "${evidence.title}" cannot be downloaded: malware scan failed.`);
    }

    if (evidence.status === EvidenceStatus.PENDING || evidence.scanStatus === EvidenceScanStatus.PENDING_SCAN) {
      throw new ForbiddenException(`Evidence file "${evidence.title}" is PENDING_SCAN and cannot be downloaded until verified clean.`);
    }

    // Integrity verification: ensure file on disk matches stored cryptographic baseline
    if (evidence.checksum) {
      const integrity = await this.storageService.verifyIntegrity(evidence.storageKey, evidence.checksum);
      if (!integrity.matched) {
        await this.auditLogsService.log({
          organizationId: authCtx.organizationId,
          actorId: authCtx.userId,
          action: 'EVIDENCE_TAMPER_DETECTED',
          entityType: 'Evidence',
          entityId: evidence.id,
          metadata: {
            fileName: evidence.fileName,
            expectedChecksum: evidence.checksum,
            actualChecksum: integrity.actualChecksum,
            alert: 'CRITICAL: Cryptographic integrity violation detected during download attempt.',
          },
        });
        throw new InternalServerErrorException(
          `Evidence integrity check failed: file checksum does not match cryptographic baseline for "${evidence.fileName}". Possible tampering or corruption detected.`,
        );
      }
    }

    const { stream } = this.storageService.getFileStream(evidence.storageKey);

    await this.auditLogsService.log({
      organizationId: authCtx.organizationId,
      actorId: authCtx.userId,
      action: 'EVIDENCE_DOWNLOADED',
      entityType: 'Evidence',
      entityId: evidence.id,
      metadata: { fileName: evidence.fileName, title: evidence.title },
    });

    const safeFileName = encodeURIComponent(evidence.fileName).replace(/['()]/g, escape);
    res.setHeader('Content-Type', evidence.mimeType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${safeFileName}"; filename*=UTF-8''${safeFileName}`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'");
    res.setHeader('X-Download-Options', 'noopen');
    res.setHeader('Cache-Control', 'private, no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    stream.pipe(res);
  }

  async verifyEvidenceIntegrity(
    authCtx: ResourceAuthContext,
    evidenceId: string,
  ): Promise<{ id: string; fileName: string; matched: boolean; expectedChecksum: string; actualChecksum: string }> {
    const scopeWhere = await this.resourceAuthService.getScopeWhereClause(authCtx);
    const evidence = await this.prisma.evidence.findFirst({
      where: { id: evidenceId, ...scopeWhere, deletedAt: null },
    });

    if (!evidence) {
      throw new NotFoundException(`Evidence record "${evidenceId}" not found or out of authorized scope.`);
    }

    if (!evidence.checksum) {
      throw new BadRequestException(`Evidence record "${evidenceId}" has no recorded checksum.`);
    }

    const integrity = await this.storageService.verifyIntegrity(evidence.storageKey, evidence.checksum);
    if (!integrity.matched) {
      await this.auditLogsService.log({
        organizationId: authCtx.organizationId,
        actorId: authCtx.userId,
        action: 'EVIDENCE_TAMPER_DETECTED',
        entityType: 'Evidence',
        entityId: evidence.id,
        metadata: {
          fileName: evidence.fileName,
          expectedChecksum: evidence.checksum,
          actualChecksum: integrity.actualChecksum,
        },
      });
    }

    return {
      id: evidence.id,
      fileName: evidence.fileName,
      matched: integrity.matched,
      expectedChecksum: evidence.checksum,
      actualChecksum: integrity.actualChecksum,
    };
  }

  async attachEvidence(
    authCtx: ResourceAuthContext,
    evidenceId: string,
    resourceType: 'CONTROL' | 'RISK' | 'POLICY' | 'AUDIT_CHECK' | 'AUDIT_FINDING' | 'VENDOR' | 'VULNERABILITY' | 'INCIDENT',
    resourceId: string,
  ): Promise<EvidenceDto> {
    const scopeWhere = await this.resourceAuthService.getScopeWhereClause(authCtx);
    const evidence = await this.prisma.evidence.findFirst({
      where: { id: evidenceId, ...scopeWhere, deletedAt: null },
    });
    if (!evidence) throw new NotFoundException(`Evidence "${evidenceId}" not found.`);

    await this.verifyResourceBelongsToOrg(authCtx, resourceType, resourceId);
    await this.createAssociationRecord(authCtx.organizationId, evidenceId, resourceType, resourceId);

    await this.auditLogsService.log({
      organizationId: authCtx.organizationId,
      actorId: authCtx.userId,
      action: 'EVIDENCE_ATTACHED',
      entityType: 'Evidence',
      entityId: evidenceId,
      metadata: { resourceType, resourceId },
    });

    return this.mapToDto(evidenceId);
  }

  async detachEvidence(
    authCtx: ResourceAuthContext,
    evidenceId: string,
    resourceType: 'CONTROL' | 'RISK' | 'POLICY' | 'AUDIT_CHECK' | 'AUDIT_FINDING' | 'VENDOR' | 'VULNERABILITY' | 'INCIDENT',
    resourceId: string,
  ): Promise<EvidenceDto> {
    const scopeWhere = await this.resourceAuthService.getScopeWhereClause(authCtx);
    const evidence = await this.prisma.evidence.findFirst({
      where: { id: evidenceId, ...scopeWhere, deletedAt: null },
    });
    if (!evidence) throw new NotFoundException(`Evidence "${evidenceId}" not found.`);

    await this.verifyResourceBelongsToOrg(authCtx, resourceType, resourceId);
    await this.removeAssociationRecord(evidenceId, resourceType, resourceId);

    await this.auditLogsService.log({
      organizationId: authCtx.organizationId,
      actorId: authCtx.userId,
      action: 'EVIDENCE_DETACHED',
      entityType: 'Evidence',
      entityId: evidenceId,
      metadata: { resourceType, resourceId },
    });

    return this.mapToDto(evidenceId);
  }

  async getEvidenceForControl(
    authCtx: ResourceAuthContext,
    controlId: string,
    query?: ControlEvidenceQueryDto,
  ): Promise<PaginatedControlEvidenceAssociationsDto> {
    const scopeWhere = await this.resourceAuthService.getScopeWhereClause(authCtx);
    const control = await this.prisma.control.findFirst({
      where: { id: controlId, ...scopeWhere, deletedAt: null },
    });
    if (!control) {
      throw new NotFoundException(`Control "${controlId}" not found or out of scope.`);
    }

    const page = Math.max(1, Number(query?.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query?.limit) || 20));
    const search = query?.search?.trim().toLowerCase();

    const joins = await this.prisma.controlEvidence.findMany({
      where: {
        controlId,
        organizationId: authCtx.organizationId,
        evidence: {
          deletedAt: null,
        },
      },
      include: {
        evidence: true,
      },
      orderBy: { attachedAt: 'desc' },
    });

    const uploaderIds = Array.from(new Set(joins.map((j) => j.evidence.uploadedById)));
    const users = await TenantContext.runWithDisplayNameLookup(() =>
      this.prisma.user.findMany({
        where: { id: { in: uploaderIds } },
        select: { id: true, name: true, email: true },
      }),
    );
    const userMap = new Map(users.map((u) => [u.id, u.name || u.email]));

    let items: ControlEvidenceAssociationDto[] = joins.map((j) => ({
      id: j.id,
      controlId: j.controlId,
      evidenceId: j.evidenceId,
      attachedAt: j.attachedAt.toISOString(),
      title: j.evidence.title,
      description: j.evidence.description,
      evidenceType: j.evidence.evidenceType as EvidenceType,
      fileName: j.evidence.fileName,
      fileSize: j.evidence.fileSize,
      mimeType: j.evidence.mimeType,
      status: j.evidence.status as EvidenceStatus,
      scanStatus: j.evidence.scanStatus as EvidenceScanStatus,
      checksum: j.evidence.checksum,
      uploadedById: j.evidence.uploadedById,
      uploaderName: userMap.get(j.evidence.uploadedById) || 'Unknown User',
      isValidComplianceEvidence:
        j.evidence.status === EvidenceStatus.ACTIVE &&
        j.evidence.scanStatus === EvidenceScanStatus.CLEAN,
    }));

    if (search) {
      items = items.filter(
        (i) =>
          i.title.toLowerCase().includes(search) ||
          i.fileName.toLowerCase().includes(search) ||
          (i.description && i.description.toLowerCase().includes(search)),
      );
    }

    const total = items.length;
    const startIndex = (page - 1) * limit;
    const paginatedItems = items.slice(startIndex, startIndex + limit);

    return {
      items: paginatedItems,
      total,
      page,
      limit,
    };
  }


  async archiveEvidence(authCtx: ResourceAuthContext, evidenceId: string): Promise<EvidenceDto> {
    const scopeWhere = await this.resourceAuthService.getScopeWhereClause(authCtx);
    const evidence = await this.prisma.evidence.findFirst({
      where: { id: evidenceId, ...scopeWhere, deletedAt: null },
    });
    if (!evidence) throw new NotFoundException(`Evidence "${evidenceId}" not found.`);

    await this.prisma.evidence.update({
      where: { id: evidenceId },
      data: { status: EvidenceStatus.ARCHIVED, deletedAt: new Date() },
    });

    await this.auditLogsService.log({
      organizationId: authCtx.organizationId,
      actorId: authCtx.userId,
      action: 'EVIDENCE_ARCHIVED',
      entityType: 'Evidence',
      entityId: evidenceId,
      metadata: { title: evidence.title },
    });

    return this.mapToDto(evidenceId);
  }

  private async verifyResourceBelongsToOrg(
    authCtx: ResourceAuthContext,
    resourceType: string,
    resourceId: string,
  ): Promise<void> {
    const scopeWhere = await this.resourceAuthService.getScopeWhereClause(authCtx);
    let exists = false;

    switch (resourceType) {
      case 'CONTROL':
        exists = !!(await this.prisma.control.findFirst({ where: { id: resourceId, ...scopeWhere } }));
        break;
      case 'RISK':
        exists = !!(await this.prisma.risk.findFirst({ where: { id: resourceId, ...scopeWhere } }));
        break;
      case 'POLICY':
        exists = !!(await this.prisma.policy.findFirst({ where: { id: resourceId, ...scopeWhere } }));
        break;
      case 'AUDIT_CHECK': {
        const checkItem = await this.prisma.auditCheckItem.findFirst({
          where: { id: resourceId, organizationId: authCtx.organizationId },
          include: { assessment: { include: { auditPlan: true } } },
        });
        exists = !!checkItem;
        if (checkItem?.assessment?.auditPlan && typeof this.resourceAuthService?.assertResourceAccess === 'function') {
          await this.resourceAuthService.assertResourceAccess(authCtx, checkItem.assessment.auditPlan);
        }
        break;
      }
      case 'AUDIT_FINDING': {
        const finding = await this.prisma.auditFinding.findFirst({
          where: { id: resourceId, organizationId: authCtx.organizationId },
          include: { assessment: { include: { auditPlan: true } } },
        });
        exists = !!finding;
        if (finding?.assessment?.auditPlan && typeof this.resourceAuthService?.assertResourceAccess === 'function') {
          await this.resourceAuthService.assertResourceAccess(authCtx, finding.assessment.auditPlan);
        }
        break;
      }
      case 'VENDOR':
        exists = !!(await this.prisma.vendor.findFirst({ where: { id: resourceId, ...scopeWhere } }));
        break;
      case 'VULNERABILITY':
        exists = !!(await this.prisma.vulnerability.findFirst({ where: { id: resourceId, ...scopeWhere } }));
        break;
      case 'INCIDENT':
        exists = !!(await this.prisma.incident.findFirst({ where: { id: resourceId, ...scopeWhere } }));
        break;
      default:
        throw new BadRequestException(`Unsupported resource type "${resourceType}".`);
    }

    if (!exists) {
      throw new NotFoundException(
        `Target resource "${resourceType}" with ID "${resourceId}" not found or out of scope.`,
      );
    }
  }

  private async createAssociationRecord(
    organizationId: string,
    evidenceId: string,
    resourceType: string,
    resourceId: string,
    client: any = this.prisma,
  ): Promise<void> {
    try {
      switch (resourceType) {
        case 'CONTROL':
          await client.controlEvidence.create({ data: { organizationId, evidenceId, controlId: resourceId } });
          break;
        case 'RISK':
          await client.riskEvidence.create({ data: { organizationId, evidenceId, riskId: resourceId } });
          break;
        case 'POLICY':
          await client.policyEvidence.create({ data: { organizationId, evidenceId, policyId: resourceId } });
          break;
        case 'AUDIT_CHECK':
          await client.auditCheckItemEvidence.create({ data: { organizationId, evidenceId, checkItemId: resourceId } });
          break;
        case 'AUDIT_FINDING':
          await client.auditFindingEvidence.create({ data: { organizationId, evidenceId, findingId: resourceId } });
          break;
        case 'VENDOR':
          await client.vendorEvidence.create({ data: { organizationId, evidenceId, vendorId: resourceId } });
          break;
        case 'VULNERABILITY':
          await client.vulnerabilityEvidence.create({ data: { organizationId, evidenceId, vulnerabilityId: resourceId } });
          break;
        case 'INCIDENT':
          await client.incidentEvidence.create({ data: { organizationId, evidenceId, incidentId: resourceId } });
          break;
      }
    } catch (err: any) {
      if (err?.code !== 'P2002') {
        throw err;
      }
    }
  }

  private async removeAssociationRecord(evidenceId: string, resourceType: string, resourceId: string): Promise<void> {
    switch (resourceType) {
      case 'CONTROL':
        await this.prisma.controlEvidence.deleteMany({ where: { evidenceId, controlId: resourceId } });
        break;
      case 'RISK':
        await this.prisma.riskEvidence.deleteMany({ where: { evidenceId, riskId: resourceId } });
        break;
      case 'POLICY':
        await this.prisma.policyEvidence.deleteMany({ where: { evidenceId, policyId: resourceId } });
        break;
      case 'AUDIT_CHECK':
        await this.prisma.auditCheckItemEvidence.deleteMany({ where: { evidenceId, checkItemId: resourceId } });
        break;
      case 'AUDIT_FINDING':
        await this.prisma.auditFindingEvidence.deleteMany({ where: { evidenceId, findingId: resourceId } });
        break;
      case 'VENDOR':
        await this.prisma.vendorEvidence.deleteMany({ where: { evidenceId, vendorId: resourceId } });
        break;
      case 'VULNERABILITY':
        await this.prisma.vulnerabilityEvidence.deleteMany({ where: { evidenceId, vulnerabilityId: resourceId } });
        break;
      case 'INCIDENT':
        await this.prisma.incidentEvidence.deleteMany({ where: { evidenceId, incidentId: resourceId } });
        break;
    }
  }

  private async mapToDto(evidenceId: string): Promise<EvidenceDto> {
    const e = await this.prisma.evidence.findUnique({
      where: { id: evidenceId },
      include: {
        controlAssociations: { include: { control: true } },
        riskAssociations: { include: { risk: true } },
        policyAssociations: { include: { policy: true } },
        auditCheckAssociations: { include: { checkItem: true } },
        auditFindingAssociations: { include: { finding: true } },
        vendorAssociations: { include: { vendor: true } },
        vulnerabilityAssociations: { include: { vulnerability: true } },
        incidentAssociations: { include: { incident: true } },
        frameworkReferences: { include: { frameworkReference: true } },
      },
    });

    if (!e) throw new NotFoundException(`Evidence record "${evidenceId}" not found.`);

    const user = await TenantContext.runWithDisplayNameLookup(() =>
      this.prisma.user.findUnique({
        where: { id: e.uploadedById },
        select: { id: true, name: true, email: true },
      }),
    );

    const associations: ResourceAssociationDto[] = [];
    e.controlAssociations.forEach((ca) => associations.push({ resourceType: 'CONTROL', resourceId: ca.controlId, resourceTitle: ca.control.name }));
    e.riskAssociations.forEach((ra) => associations.push({ resourceType: 'RISK', resourceId: ra.riskId, resourceTitle: ra.risk.title }));
    e.policyAssociations.forEach((pa) => associations.push({ resourceType: 'POLICY', resourceId: pa.policyId, resourceTitle: pa.policy.title }));
    e.auditCheckAssociations.forEach((aca) => associations.push({ resourceType: 'AUDIT_CHECK', resourceId: aca.checkItemId, resourceTitle: aca.checkItem.title }));
    e.auditFindingAssociations.forEach((afa) => associations.push({ resourceType: 'AUDIT_FINDING', resourceId: afa.findingId, resourceTitle: afa.finding.title }));
    e.vendorAssociations.forEach((va) => associations.push({ resourceType: 'VENDOR', resourceId: va.vendorId, resourceTitle: va.vendor.name }));
    e.vulnerabilityAssociations.forEach((vua) => associations.push({ resourceType: 'VULNERABILITY', resourceId: vua.vulnerabilityId, resourceTitle: vua.vulnerability.title }));
    e.incidentAssociations.forEach((ia) => associations.push({ resourceType: 'INCIDENT', resourceId: ia.incidentId, resourceTitle: ia.incident.title }));

    return {
      id: e.id,
      organizationId: e.organizationId,
      departmentId: e.departmentId || null,
      projectId: e.projectId || null,
      title: e.title,
      description: e.description,
      evidenceType: e.evidenceType as EvidenceType,
      fileName: e.fileName,
      fileSize: e.fileSize,
      mimeType: e.mimeType,
      storageKey: e.storageKey,
      checksum: e.checksum,
      status: e.status as EvidenceStatus,
      scanStatus: e.scanStatus as EvidenceScanStatus,
      uploadedById: e.uploadedById,
      uploaderName: user ? user.name || user.email : 'Unknown User',
      retentionUntil: e.retentionUntil ? e.retentionUntil.toISOString() : null,
      createdAt: e.createdAt.toISOString(),
      updatedAt: e.updatedAt.toISOString(),
      associations,
      frameworkReferences: e.frameworkReferences.map((fr) => ({
        id: fr.frameworkReference.id,
        identifier: fr.frameworkReference.identifier,
        title: fr.frameworkReference.title,
      })),
    } as any;
  }
}
