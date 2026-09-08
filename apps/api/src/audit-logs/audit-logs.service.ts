import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * CONVENTION & COMPLIANCE MANDATE (AI API Flow doc Section 5 / SOW Audit Trail):
 * The AuditLogEntry table MUST ONLY EVER store metadata (e.g. event action, IDs, diff keys, timing),
 * and NEVER raw entity content or full request payloads. This prevents accidental exposure of PII,
 * credentials, or sensitive data in persistent immutable logs.
 *
 * Furthermore, AuditLogService is strictly write-only and read-only.
 * NO UPDATE OR DELETE METHODS are provided or permitted at the service layer to preserve immutability.
 */
@Injectable()
export class AuditLogsService {
  constructor(private readonly prisma: PrismaService) {}

  async log(params: {
    organizationId: string;
    actorId: string;
    action: string;
    entityType: string;
    entityId: string;
    metadata: Record<string, any>;
  }) {
    return this.prisma.auditLogEntry.create({
      data: {
        organizationId: params.organizationId,
        actorId: params.actorId,
        action: params.action,
        entityType: params.entityType,
        entityId: params.entityId,
        metadata: params.metadata || {},
      },
    });
  }

  async findAllForOrg(organizationId: string) {
    return this.prisma.auditLogEntry.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
    });
  }
}
