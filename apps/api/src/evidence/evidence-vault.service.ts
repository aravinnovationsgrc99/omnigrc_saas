import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  EvidenceVaultItemDto,
  EvidenceVaultQueryDto,
  PaginatedEvidenceVaultDto,
} from '@omnigrc/shared';

@Injectable()
export class EvidenceVaultService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(
    organizationId: string,
    query: EvidenceVaultQueryDto,
  ): Promise<PaginatedEvidenceVaultDto> {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const search = query.search?.trim().toLowerCase();
    const domainFilter = query.domain;

    const items: EvidenceVaultItemDto[] = [];

    // 1. Audit Evidence records (legacy)
    if (!domainFilter || domainFilter === 'AUDIT') {
      const auditEvidences = await this.prisma.auditEvidence.findMany({
        where: { organizationId },
        include: {
          checkItem: true,
          finding: true,
        },
        orderBy: { createdAt: 'desc' },
      });

      for (const ev of auditEvidences) {
        let assocRef = '';
        if (ev.checkItem) assocRef = `Audit Check: ${ev.checkItem.title}`;
        else if (ev.finding) assocRef = `Audit Finding: ${ev.finding.title}`;

        items.push({
          id: `audit-ev-${ev.id}`,
          title: ev.fileName,
          description: ev.mimeType ? `MIME: ${ev.mimeType}` : 'Audit Evidence file reference.',
          sourceDomain: 'AUDIT',
          sourceEntityId: ev.checkItemId || ev.findingId || null,
          evidenceUrl: ev.fileUrl,
          fileSize: ev.fileSize || null,
          mimeType: ev.mimeType || null,
          uploadedById: ev.uploadedById,
          createdAt: ev.createdAt.toISOString(),
          associatedReference: assocRef || null,
        });
      }
    }

    // 2. Canonical Evidence Vault records mapped to legacy format
    const canonicalEvidences = await this.prisma.evidence.findMany({
      where: { organizationId, deletedAt: null },
      include: {
        controlAssociations: { include: { control: true } },
        auditCheckAssociations: { include: { checkItem: true } },
        auditFindingAssociations: { include: { finding: true } },
        policyAssociations: { include: { policy: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    for (const ev of canonicalEvidences) {
      let domain: 'AUDIT' | 'CONTROL' | 'POLICY' | 'TASK' | 'INCIDENT' = 'AUDIT';
      let assocRef = '';
      let sourceEntityId: string | null = null;

      if (ev.auditCheckAssociations && ev.auditCheckAssociations.length > 0) {
        domain = 'AUDIT';
        const ca = ev.auditCheckAssociations[0];
        sourceEntityId = ca.checkItemId;
        assocRef = `Audit Check: ${ca.checkItem?.title || ca.checkItemId}`;
      } else if (ev.auditFindingAssociations && ev.auditFindingAssociations.length > 0) {
        domain = 'AUDIT';
        const fa = ev.auditFindingAssociations[0];
        sourceEntityId = fa.findingId;
        assocRef = `Audit Finding: ${fa.finding?.title || fa.findingId}`;
      } else if (ev.controlAssociations && ev.controlAssociations.length > 0) {
        domain = 'CONTROL';
        const ctrl = ev.controlAssociations[0];
        sourceEntityId = ctrl.controlId;
        assocRef = `Control: ${ctrl.control?.name || ctrl.controlId}`;
      } else if (ev.policyAssociations && ev.policyAssociations.length > 0) {
        domain = 'POLICY';
        const pol = ev.policyAssociations[0];
        sourceEntityId = pol.policyId;
        assocRef = `Policy: ${pol.policy?.title || pol.policyId}`;
      }

      if (!domainFilter || domainFilter === domain) {
        items.push({
          id: ev.id,
          title: ev.title || ev.fileName,
          description: ev.description || (ev.mimeType ? `MIME: ${ev.mimeType}` : null),
          sourceDomain: domain,
          sourceEntityId,
          evidenceUrl: `/evidence/${ev.id}/download`,
          fileSize: ev.fileSize,
          mimeType: ev.mimeType,
          uploadedById: ev.uploadedById,
          createdAt: ev.createdAt.toISOString(),
          associatedReference: assocRef || null,
        });
      }
    }

    // Filter by search query
    let filtered = items;
    if (search) {
      filtered = filtered.filter(
        (i) =>
          i.title.toLowerCase().includes(search) ||
          (i.description && i.description.toLowerCase().includes(search)) ||
          (i.associatedReference && i.associatedReference.toLowerCase().includes(search)),
      );
    }

    // Sort by created date descending
    filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const total = filtered.length;
    const startIndex = (page - 1) * limit;
    const paginatedItems = filtered.slice(startIndex, startIndex + limit);

    return {
      items: paginatedItems,
      total,
      page,
      limit,
    };
  }
}
