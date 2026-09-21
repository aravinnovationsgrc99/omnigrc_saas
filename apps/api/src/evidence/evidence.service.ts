import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { ResourceAuthorizationService } from '../auth/resource-authorization.service';
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
    organizationId: string,
    uploadedById: string,
    file: { originalname: string; buffer: Buffer; mimetype: string },
    dto: CreateEvidenceUploadDto,
  ): Promise<EvidenceDto> {
    if (!file || !file.buffer) {
      throw new BadRequestException('Binary proof file is required for upload.');
    }

    // 1. Verify resource ownership and cross-tenant invariants if target resource specified
    if (dto.targetResourceType && dto.targetResourceId) {
      await this.verifyResourceBelongsToOrg(organizationId, dto.targetResourceType, dto.targetResourceId);
    }

    // 2. Save file to storage abstraction & calculate checksum
    const saved = await this.storageService.saveFile(file, organizationId);

    // 3. Scan file
    const scanStatus = await this.scannerService.scanFile(saved.storageKey, file.buffer);

    // 4. Calculate retention if retentionDays provided
    let retentionUntil: Date | null = null;
    if (dto.retentionDays && dto.retentionDays > 0) {
      retentionUntil = new Date(Date.now() + dto.retentionDays * 24 * 60 * 60 * 1000);
    }

    // 5. Determine evidence type
    let evidenceType = dto.evidenceType || EvidenceType.DOCUMENT;
    if (!dto.evidenceType) {
      if (saved.mimeType.startsWith('image/')) evidenceType = EvidenceType.IMAGE;
      else if (saved.mimeType.includes('excel') || saved.mimeType.includes('spreadsheet') || saved.mimeType.includes('csv'))
        evidenceType = EvidenceType.SPREADSHEET;
    }

    // 6. Create Evidence record in database
    const evidence = await this.prisma.evidence.create({
      data: {
        organizationId,
        title: dto.title.trim(),
        description: dto.description?.trim() || null,
        evidenceType,
        fileName: saved.originalFileName,
        fileSize: saved.fileSize,
        mimeType: saved.mimeType,
        storageKey: saved.storageKey,
        checksum: saved.checksum,
        status: scanStatus === EvidenceScanStatus.QUARANTINED ? EvidenceStatus.QUARANTINED : EvidenceStatus.ACTIVE,
        scanStatus,
        uploadedById,
        retentionUntil,
      },
    });

    // 7. Create explicit association if target specified
    if (dto.targetResourceType && dto.targetResourceId) {
      await this.createAssociationRecord(organizationId, evidence.id, dto.targetResourceType, dto.targetResourceId);
    }

    // 8. Attach framework reference if requested
    if (dto.frameworkReferenceId) {
      const ref = await this.prisma.frameworkReference.findUnique({
        where: { id: dto.frameworkReferenceId },
      });
      if (ref) {
        await this.prisma.evidenceFrameworkReference.create({
          data: {
            evidenceId: evidence.id,
            frameworkReferenceId: dto.frameworkReferenceId,
          },
        });
      }
    }

    // 9. Log audit event
    await this.auditLogsService.log({
      organizationId,
      actorId: uploadedById,
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

    return this.mapToDto(evidence.id);
  }

  async findAll(organizationId: string, query: EvidenceVaultQueryDto): Promise<PaginatedEvidenceDto> {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const search = query.search?.trim().toLowerCase();
    const status = query.status || EvidenceStatus.ACTIVE;

    // Fetch canonical evidence items
    const evidences = await this.prisma.evidence.findMany({
      where: {
        organizationId,
        deletedAt: null,
        ...(query.evidenceType && { evidenceType: query.evidenceType }),
        ...(status && { status }),
      },
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
      orderBy: { createdAt: 'desc' },
    });

    const uploaderIds = Array.from(new Set(evidences.map((e) => e.uploadedById)));
    const users = await this.prisma.user.findMany({
      where: { id: { in: uploaderIds } },
      select: { id: true, name: true, email: true },
    });
    const userMap = new Map(users.map((u) => [u.id, u.name || u.email]));

    let dtos: EvidenceDto[] = evidences.map((e) => {
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
        frameworkReferences: e.frameworkReferences.map((fr) => ({
          id: fr.frameworkReference.id,
          identifier: fr.frameworkReference.identifier,
          title: fr.frameworkReference.title,
        })),
      };
    });

    // Reconcile legacy AuditEvidence records if domain is AUDIT or unspecified
    if (!query.domain || query.domain === 'AUDIT' || query.domain === 'ALL') {
      const legacyAuditEvidences = await this.prisma.auditEvidence.findMany({
        where: { organizationId },
        include: { checkItem: true, finding: true },
      });

      for (const leg of legacyAuditEvidences) {
        // Skip if already represented in canonical evidences
        if (!dtos.some((d) => d.id === leg.id)) {
          const associations: ResourceAssociationDto[] = [];
          if (leg.checkItem) associations.push({ resourceType: 'AUDIT_CHECK', resourceId: leg.checkItemId!, resourceTitle: leg.checkItem.title });
          if (leg.finding) associations.push({ resourceType: 'AUDIT_FINDING', resourceId: leg.findingId!, resourceTitle: leg.finding.title });

          dtos.push({
            id: leg.id,
            organizationId: leg.organizationId,
            title: leg.fileName,
            description: `Audit Proof Reference`,
            evidenceType: EvidenceType.DOCUMENT,
            fileName: leg.fileName,
            fileSize: leg.fileSize || 0,
            mimeType: leg.mimeType || 'application/octet-stream',
            storageKey: leg.fileUrl,
            checksum: null,
            status: EvidenceStatus.ACTIVE,
            scanStatus: EvidenceScanStatus.CLEAN,
            uploadedById: leg.uploadedById,
            uploaderName: 'Audit System',
            retentionUntil: null,
            createdAt: leg.createdAt.toISOString(),
            updatedAt: leg.createdAt.toISOString(),
            associations,
          });
        }
      }
    }

    // Search filtering
    if (search) {
      dtos = dtos.filter(
        (d) =>
          d.title.toLowerCase().includes(search) ||
          d.fileName.toLowerCase().includes(search) ||
          (d.description && d.description.toLowerCase().includes(search)) ||
          d.associations.some((a) => a.resourceTitle && a.resourceTitle.toLowerCase().includes(search)),
      );
    }

    dtos.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const total = dtos.length;
    const startIndex = (page - 1) * limit;
    const paginatedItems = dtos.slice(startIndex, startIndex + limit);

    return {
      items: paginatedItems,
      total,
      page,
      limit,
    };
  }

  async findOne(organizationId: string, evidenceId: string): Promise<EvidenceDto> {
    const dto = await this.mapToDto(evidenceId);
    if (dto.organizationId !== organizationId) {
      throw new NotFoundException(`Evidence record "${evidenceId}" not found.`);
    }
    return dto;
  }

  async downloadEvidence(
    organizationId: string,
    evidenceId: string,
    userContext: { userId: string; role: Role; departmentIds?: string[]; projectIds?: string[] },
    res: Response,
  ): Promise<void> {
    const evidence = await this.prisma.evidence.findFirst({
      where: { id: evidenceId, organizationId, deletedAt: null },
      include: {
        controlAssociations: true,
        riskAssociations: true,
        policyAssociations: true,
        auditCheckAssociations: true,
        auditFindingAssociations: true,
        vendorAssociations: true,
        vulnerabilityAssociations: true,
        incidentAssociations: true,
      },
    });

    if (!evidence) {
      // Check legacy audit evidence fallback
      const legacy = await this.prisma.auditEvidence.findFirst({
        where: { id: evidenceId, organizationId },
      });
      if (!legacy) throw new NotFoundException(`Evidence record "${evidenceId}" not found.`);

      // Stream URL redirect or error if purely external
      res.redirect(legacy.fileUrl);
      return;
    }

    if (evidence.status === EvidenceStatus.QUARANTINED || evidence.scanStatus === EvidenceScanStatus.QUARANTINED) {
      throw new ForbiddenException(`Evidence file "${evidence.title}" is QUARANTINED due to malware scan policy.`);
    }

    // Stream file securely from storage service
    const { stream } = this.storageService.getFileStream(evidence.storageKey);

    // Audit log
    await this.auditLogsService.log({
      organizationId,
      actorId: userContext.userId,
      action: 'EVIDENCE_DOWNLOADED',
      entityType: 'Evidence',
      entityId: evidence.id,
      metadata: { fileName: evidence.fileName, title: evidence.title },
    });

    res.setHeader('Content-Type', evidence.mimeType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(evidence.fileName)}"`);
    stream.pipe(res);
  }

  async attachEvidence(
    organizationId: string,
    actorId: string,
    evidenceId: string,
    resourceType: 'CONTROL' | 'RISK' | 'POLICY' | 'AUDIT_CHECK' | 'AUDIT_FINDING' | 'VENDOR' | 'VULNERABILITY' | 'INCIDENT',
    resourceId: string,
  ): Promise<EvidenceDto> {
    const evidence = await this.prisma.evidence.findFirst({
      where: { id: evidenceId, organizationId, deletedAt: null },
    });
    if (!evidence) throw new NotFoundException(`Evidence "${evidenceId}" not found.`);

    await this.verifyResourceBelongsToOrg(organizationId, resourceType, resourceId);
    await this.createAssociationRecord(organizationId, evidenceId, resourceType, resourceId);

    await this.auditLogsService.log({
      organizationId,
      actorId,
      action: 'EVIDENCE_ATTACHED',
      entityType: 'Evidence',
      entityId: evidenceId,
      metadata: { resourceType, resourceId },
    });

    return this.mapToDto(evidenceId);
  }

  async detachEvidence(
    organizationId: string,
    actorId: string,
    evidenceId: string,
    resourceType: 'CONTROL' | 'RISK' | 'POLICY' | 'AUDIT_CHECK' | 'AUDIT_FINDING' | 'VENDOR' | 'VULNERABILITY' | 'INCIDENT',
    resourceId: string,
  ): Promise<EvidenceDto> {
    const evidence = await this.prisma.evidence.findFirst({
      where: { id: evidenceId, organizationId, deletedAt: null },
    });
    if (!evidence) throw new NotFoundException(`Evidence "${evidenceId}" not found.`);

    await this.removeAssociationRecord(evidenceId, resourceType, resourceId);

    await this.auditLogsService.log({
      organizationId,
      actorId,
      action: 'EVIDENCE_DETACHED',
      entityType: 'Evidence',
      entityId: evidenceId,
      metadata: { resourceType, resourceId },
    });

    return this.mapToDto(evidenceId);
  }

  async archiveEvidence(organizationId: string, actorId: string, evidenceId: string): Promise<EvidenceDto> {
    const evidence = await this.prisma.evidence.findFirst({
      where: { id: evidenceId, organizationId, deletedAt: null },
    });
    if (!evidence) throw new NotFoundException(`Evidence "${evidenceId}" not found.`);

    await this.prisma.evidence.update({
      where: { id: evidenceId },
      data: { status: EvidenceStatus.ARCHIVED, deletedAt: new Date() },
    });

    await this.auditLogsService.log({
      organizationId,
      actorId,
      action: 'EVIDENCE_ARCHIVED',
      entityType: 'Evidence',
      entityId: evidenceId,
      metadata: { title: evidence.title },
    });

    return this.mapToDto(evidenceId);
  }

  // --------------------------------------------------
  // HELPER METHODS
  // --------------------------------------------------

  private async verifyResourceBelongsToOrg(
    organizationId: string,
    resourceType: string,
    resourceId: string,
  ): Promise<void> {
    let exists = false;

    switch (resourceType) {
      case 'CONTROL':
        exists = !!(await this.prisma.control.findFirst({ where: { id: resourceId, organizationId } }));
        break;
      case 'RISK':
        exists = !!(await this.prisma.risk.findFirst({ where: { id: resourceId, organizationId } }));
        break;
      case 'POLICY':
        exists = !!(await this.prisma.policy.findFirst({ where: { id: resourceId, organizationId } }));
        break;
      case 'AUDIT_CHECK':
        exists = !!(await this.prisma.auditCheckItem.findFirst({ where: { id: resourceId, organizationId } }));
        break;
      case 'AUDIT_FINDING':
        exists = !!(await this.prisma.auditFinding.findFirst({ where: { id: resourceId, organizationId } }));
        break;
      case 'VENDOR':
        exists = !!(await this.prisma.vendor.findFirst({ where: { id: resourceId, organizationId } }));
        break;
      case 'VULNERABILITY':
        exists = !!(await this.prisma.vulnerability.findFirst({ where: { id: resourceId, organizationId } }));
        break;
      case 'INCIDENT':
        exists = !!(await this.prisma.incident.findFirst({ where: { id: resourceId, organizationId } }));
        break;
      default:
        throw new BadRequestException(`Unsupported resource type "${resourceType}".`);
    }

    if (!exists) {
      throw new NotFoundException(
        `Target resource "${resourceType}" with ID "${resourceId}" not found in current organization context.`,
      );
    }
  }

  private async createAssociationRecord(
    organizationId: string,
    evidenceId: string,
    resourceType: string,
    resourceId: string,
  ): Promise<void> {
    try {
      switch (resourceType) {
        case 'CONTROL':
          await this.prisma.controlEvidence.create({ data: { organizationId, evidenceId, controlId: resourceId } });
          break;
        case 'RISK':
          await this.prisma.riskEvidence.create({ data: { organizationId, evidenceId, riskId: resourceId } });
          break;
        case 'POLICY':
          await this.prisma.policyEvidence.create({ data: { organizationId, evidenceId, policyId: resourceId } });
          break;
        case 'AUDIT_CHECK':
          await this.prisma.auditCheckItemEvidence.create({ data: { organizationId, evidenceId, checkItemId: resourceId } });
          break;
        case 'AUDIT_FINDING':
          await this.prisma.auditFindingEvidence.create({ data: { organizationId, evidenceId, findingId: resourceId } });
          break;
        case 'VENDOR':
          await this.prisma.vendorEvidence.create({ data: { organizationId, evidenceId, vendorId: resourceId } });
          break;
        case 'VULNERABILITY':
          await this.prisma.vulnerabilityEvidence.create({ data: { organizationId, evidenceId, vulnerabilityId: resourceId } });
          break;
        case 'INCIDENT':
          await this.prisma.incidentEvidence.create({ data: { organizationId, evidenceId, incidentId: resourceId } });
          break;
      }
    } catch {
      // Ignore duplicate association attempts
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

    const user = await this.prisma.user.findUnique({ where: { id: e.uploadedById } });

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
    };
  }
}
