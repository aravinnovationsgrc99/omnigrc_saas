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

  async findPaginatedForOrg(
    organizationId: string,
    query: {
      page?: number;
      limit?: number;
      search?: string;
      entityType?: string;
      action?: string;
      actorId?: string;
      startDate?: string;
      endDate?: string;
    },
  ) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const skip = (page - 1) * limit;

    const where: any = { organizationId };

    if (query.entityType) {
      where.entityType = { contains: query.entityType, mode: 'insensitive' };
    }

    if (query.action) {
      where.action = { contains: query.action, mode: 'insensitive' };
    }

    if (query.actorId) {
      where.actorId = query.actorId;
    }

    if (query.startDate || query.endDate) {
      where.createdAt = {};
      if (query.startDate) {
        where.createdAt.gte = new Date(query.startDate);
      }
      if (query.endDate) {
        where.createdAt.lte = new Date(query.endDate);
      }
    }

    if (query.search) {
      const searchStr = query.search.trim();
      where.OR = [
        { action: { contains: searchStr, mode: 'insensitive' } },
        { entityType: { contains: searchStr, mode: 'insensitive' } },
        { entityId: { contains: searchStr, mode: 'insensitive' } },
        { actorId: { contains: searchStr, mode: 'insensitive' } },
      ];
    }

    const [entries, total] = await Promise.all([
      this.prisma.auditLogEntry.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.auditLogEntry.count({ where }),
    ]);

    const totalPages = Math.ceil(total / limit) || 1;

    return {
      items: entries.map((e) => ({
        id: e.id,
        organizationId: e.organizationId,
        actorId: e.actorId,
        action: e.action,
        entityType: e.entityType,
        entityId: e.entityId,
        metadata: (e.metadata as Record<string, any>) || {},
        createdAt: e.createdAt.toISOString(),
      })),
      total,
      page,
      limit,
      totalPages,
    };
  }
}
