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

    // 1. Audit Evidence records
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
