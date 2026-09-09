import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { RegionalPodDto, PodRegion, PodStatus } from '@omnigrc/shared';

@Injectable()
export class RegionalPodsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  async getPodsForOrganization(organizationId: string): Promise<RegionalPodDto[]> {
    const pods = await this.prisma.regionalPod.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'asc' },
    });

    return pods.map((p) => ({
      id: p.id,
      region: p.region as PodRegion,
      status: p.status as PodStatus,
      organizationId: p.organizationId,
    }));
  }

  async updateStatus(
    organizationId: string,
    actorId: string,
    podId: string,
    targetStatus: PodStatus,
  ): Promise<RegionalPodDto> {
    const pod = await this.prisma.regionalPod.findFirst({
      where: { id: podId, organizationId },
    });

    if (!pod) {
      throw new NotFoundException('Regional pod not found');
    }

    if (pod.status === targetStatus) {
      return {
        id: pod.id,
        region: pod.region as PodRegion,
        status: pod.status as PodStatus,
        organizationId: pod.organizationId,
      };
    }

    // Active Pod Guard: Refuse to deactivate if this is the only active pod for the organization
    if (targetStatus === PodStatus.INACTIVE && pod.status === PodStatus.ACTIVE) {
      const activeCount = await this.prisma.regionalPod.count({
        where: { organizationId, status: PodStatus.ACTIVE },
      });

      if (activeCount <= 1) {
        throw new BadRequestException(
          "Cannot deactivate the organization's last active regional pod. At least one active regional pod must be maintained.",
        );
      }
    }

    const updated = await this.prisma.regionalPod.update({
      where: { id: podId },
      data: { status: targetStatus },
    });

    const action = targetStatus === PodStatus.ACTIVE ? 'REGIONAL_POD_ACTIVATED' : 'REGIONAL_POD_DEACTIVATED';
    await this.auditLogsService.log({
      organizationId,
      actorId,
      action,
      entityType: 'REGIONAL_POD',
      entityId: pod.id,
      metadata: {
        region: pod.region,
        previousStatus: pod.status,
        newStatus: targetStatus,
      },
    });

    return {
      id: updated.id,
      region: updated.region as PodRegion,
      status: updated.status as PodStatus,
      organizationId: updated.organizationId,
    };
  }
}
