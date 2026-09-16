import { Injectable, Logger } from '@nestjs/common';
import { ControlPlanePrismaService } from '../prisma/prisma.service';

@Injectable()
export class ControlPlaneAuditLogsService {
  private readonly logger = new Logger(ControlPlaneAuditLogsService.name);

  constructor(private readonly prisma: ControlPlanePrismaService) {}

  async log(action: string, entityType: string, entityId: string, metadata?: any) {
    this.logger.log(`Audit: ${action} on ${entityType}:${entityId}`);
    return this.prisma.controlPlaneAuditLog.create({
      data: {
        action,
        entityType,
        entityId,
        metadata: metadata || {},
      },
    });
  }
}
