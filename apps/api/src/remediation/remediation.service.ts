import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  RemediationActionDto,
  RemediationQueryDto,
  PaginatedRemediationActionsDto,
} from '@omnigrc/shared';

@Injectable()
export class RemediationService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(
    organizationId: string,
    query: RemediationQueryDto,
  ): Promise<PaginatedRemediationActionsDto> {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const search = query.search?.trim().toLowerCase();
    const statusFilter = query.status?.toUpperCase();
    const ownerFilter = query.owner?.trim().toLowerCase();
    const overdueOnly = query.overdueOnly === true || String(query.overdueOnly) === 'true';
    const sourceTypeFilter = query.sourceType;

    const now = new Date();
    const actions: RemediationActionDto[] = [];

    // 1. Audit CAPAs
    if (!sourceTypeFilter || sourceTypeFilter === 'AUDIT_CAPA') {
      const capas = await this.prisma.auditCapa.findMany({
        where: {
          organizationId,
          status: { in: ['OPEN', 'IN_PROGRESS'] },
        },
        include: {
          finding: true,
        },
        orderBy: { createdAt: 'desc' },
      });

      for (const capa of capas) {
        const isOverdue = capa.dueDate ? new Date(capa.dueDate) < now : false;
        actions.push({
          id: `capa-${capa.id}`,
          sourceType: 'AUDIT_CAPA',
          sourceId: capa.id,
          title: capa.title || capa.correctiveAction,
          description: `Corrective Action: ${capa.correctiveAction}${
            capa.preventiveAction ? ` | Preventive: ${capa.preventiveAction}` : ''
          }`,
          organizationId: capa.organizationId,
          owner: capa.ownerId,
          status: capa.status,
          priorityOrSeverity: capa.finding?.severity || 'MEDIUM',
          dueDate: capa.dueDate ? capa.dueDate.toISOString() : null,
          isOverdue,
          originatingDomain: 'Audit',
          sourceReferenceUrl: `/audits?findingId=${capa.findingId}`,
        });
      }
    }

    // 2. Vulnerability Remediations
    if (!sourceTypeFilter || sourceTypeFilter === 'VULNERABILITY') {
      const vulns = await this.prisma.vulnerability.findMany({
        where: {
          organizationId,
          deletedAt: null,
          status: { in: ['OPEN', 'IN_REMEDIATION'] },
        },
        orderBy: { createdAt: 'desc' },
      });

      for (const v of vulns) {
        const isOverdue = v.dueDate ? new Date(v.dueDate) < now : false;
        actions.push({
          id: `vuln-${v.id}`,
          sourceType: 'VULNERABILITY',
          sourceId: v.id,
          title: v.cveId ? `${v.cveId}: ${v.title}` : v.title,
          description: v.remediationNotes || v.description || 'Vulnerability remediation pending.',
          organizationId: v.organizationId,
          owner: v.remediationOwner,
          status: v.status,
          priorityOrSeverity: v.severity,
          dueDate: v.dueDate ? v.dueDate.toISOString() : null,
          isOverdue,
          originatingDomain: 'Vulnerability',
          sourceReferenceUrl: `/vulnerabilities?id=${v.id}`,
        });
      }
    }

    // 3. Risk Treatments
    if (!sourceTypeFilter || sourceTypeFilter === 'RISK_TREATMENT') {
      const risks = await this.prisma.risk.findMany({
        where: {
          organizationId,
          deletedAt: null,
          status: { in: ['OPEN', 'IN_TREATMENT'] },
          treatmentPlan: { not: null },
        },
        orderBy: { createdAt: 'desc' },
      });

      for (const r of risks) {
        actions.push({
          id: `risk-${r.id}`,
          sourceType: 'RISK_TREATMENT',
          sourceId: r.id,
          title: `Risk Treatment: ${r.title}`,
          description: r.treatmentPlan || r.description || 'Risk treatment plan in progress.',
          organizationId: r.organizationId,
          owner: r.owner,
          status: r.status,
          priorityOrSeverity: r.score >= 15 ? 'HIGH' : r.score >= 8 ? 'MEDIUM' : 'LOW',
          dueDate: null,
          isOverdue: false,
          originatingDomain: 'Risk',
          sourceReferenceUrl: `/risks?id=${r.id}`,
        });
      }
    }

    // Filter normalized actions
    let filtered = actions;

    if (search) {
      filtered = filtered.filter(
        (a) =>
          a.title.toLowerCase().includes(search) ||
          (a.description && a.description.toLowerCase().includes(search)) ||
          (a.owner && a.owner.toLowerCase().includes(search)),
      );
    }

    if (statusFilter) {
      filtered = filtered.filter((a) => a.status.toUpperCase() === statusFilter);
    }

    if (ownerFilter) {
      filtered = filtered.filter((a) => a.owner && a.owner.toLowerCase().includes(ownerFilter));
    }

    if (overdueOnly) {
      filtered = filtered.filter((a) => a.isOverdue);
    }

    // Sort by due date (items with due dates first, then overdue, then null due dates)
    filtered.sort((a, b) => {
      if (a.isOverdue && !b.isOverdue) return -1;
      if (!a.isOverdue && b.isOverdue) return 1;
      if (a.dueDate && b.dueDate) {
        return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
      }
      if (a.dueDate) return -1;
      if (b.dueDate) return 1;
      return 0;
    });

    const total = filtered.length;
    const startIndex = (page - 1) * limit;
    const items = filtered.slice(startIndex, startIndex + limit);

    return {
      items,
      total,
      page,
      limit,
    };
  }
}
