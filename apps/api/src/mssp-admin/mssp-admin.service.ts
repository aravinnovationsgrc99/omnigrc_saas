import { Injectable, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MsspClientSummaryDto, OrgType } from '@omnigrc/shared';

@Injectable()
export class MsspAdminService {
  constructor(private readonly prisma: PrismaService) {}

  async getManagedClients(msspOrganizationId: string): Promise<MsspClientSummaryDto[]> {
    const msspOrg = await this.prisma.organization.findUnique({
      where: { id: msspOrganizationId },
    });

    if (!msspOrg || msspOrg.type !== OrgType.MSSP_PROVIDER) {
      throw new ForbiddenException('Authenticated organization is not an MSSP Provider.');
    }

    const clients = await this.prisma.organization.findMany({
      where: { parentOrganizationId: msspOrganizationId },
      orderBy: { name: 'asc' },
    });

    const summaries: MsspClientSummaryDto[] = [];

    for (const client of clients) {
      const [userCount, openRiskCount, openIncidentCount, tasks] = await Promise.all([
        this.prisma.user.count({ where: { organizationId: client.id } }),
        this.prisma.risk.count({
          where: { organizationId: client.id, deletedAt: null, status: { in: ['OPEN', 'IN_TREATMENT'] as any[] } },
        }),
        this.prisma.incident.count({
          where: { organizationId: client.id, deletedAt: null, status: { in: ['OPEN', 'IN_INVESTIGATION'] as any[] } },
        }),
        this.prisma.complianceTask.findMany({
          where: { organizationId: client.id, deletedAt: null },
          select: { status: true },
        }),
      ]);

      const totalTasks = tasks.length;
      const completedTasks = tasks.filter((t) => t.status === 'COMPLETE').length;
      const completionRate = totalTasks > 0 ? Number(((completedTasks / totalTasks) * 100).toFixed(1)) : 0;

      summaries.push({
        id: client.id,
        name: client.name,
        type: client.type as OrgType,
        primaryRegion: client.primaryRegion,
        primaryFramework: client.primaryFramework,
        createdAt: client.createdAt.toISOString(),
        userCount,
        openRiskCount,
        openIncidentCount,
        complianceCompletionRate: completionRate,
      });
    }

    return summaries;
  }
}
