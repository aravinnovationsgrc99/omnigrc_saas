import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RegionalPodDto, PodRegion, PodStatus } from '@omnigrc/shared';

@Injectable()
export class RegionalPodsService {
  constructor(private readonly prisma: PrismaService) {}

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
}
