import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ControlPlanePrismaService } from '../prisma/prisma.service';
import { RedactionService } from './redaction.service';
import { requestLocalStorage } from './request-context';

export interface AuditLogParams {
  action: string;
  entityType: string;
  entityId: string;
  actorId?: string;
  actorRole?: string;
  ipAddress?: string;
  correlationId?: string;
  result?: 'SUCCESS' | 'FAILURE' | 'DENIED';
  metadata?: any;
}

export interface QueryAuditLogsDto {
  actorId?: string;
  actorRole?: string;
  action?: string;
  entityType?: string;
  entityId?: string;
  organizationId?: string;
  result?: string;
  search?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
}

@Injectable()
export class ControlPlaneAuditLogsService {
  private readonly logger = new Logger(ControlPlaneAuditLogsService.name);

  constructor(
    private readonly prisma: ControlPlanePrismaService,
    private readonly redactionService: RedactionService,
  ) {}

  async log(
    actionOrParams: string | AuditLogParams,
    entityType?: string,
    entityId?: string,
    metadata?: any,
  ) {
    let params: AuditLogParams;

    if (typeof actionOrParams === 'string') {
      params = {
        action: actionOrParams,
        entityType: entityType || 'SYSTEM',
        entityId: entityId || 'UNKNOWN',
        metadata,
      };
    } else {
      params = actionOrParams;
    }

    const store = requestLocalStorage.getStore();
    const actorId = params.actorId || store?.actorId || null;
    const actorRole = params.actorRole || store?.actorRole || null;
    const ipAddress = params.ipAddress || store?.ipAddress || null;
    const correlationId = params.correlationId || store?.correlationId || null;

    const redactedMetadata = params.metadata ? this.redactionService.redact(params.metadata) : {};

    this.logger.log(
      `Audit [${params.result || 'SUCCESS'}]: ${params.action} on ${params.entityType}:${params.entityId} ` +
        `by actor:${actorId || 'SYSTEM'} (${actorRole || 'N/A'})`,
    );

    return this.prisma.controlPlaneAuditLog.create({
      data: {
        action: params.action,
        entityType: params.entityType,
        entityId: params.entityId,
        actorId,
        actorRole,
        ipAddress,
        correlationId,
        result: params.result || 'SUCCESS',
        metadata: redactedMetadata,
      },
    });
  }

  /**
   * List Control Plane audit logs with server-side filtering and bounded pagination.
   */
  async findAll(query: QueryAuditLogsDto) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const skip = (page - 1) * limit;

    const where: any = {};

    if (query.actorId) {
      where.actorId = query.actorId;
    }

    if (query.actorRole) {
      where.actorRole = query.actorRole;
    }

    if (query.action) {
      where.action = query.action;
    }

    if (query.entityType) {
      where.entityType = query.entityType;
    }

    if (query.entityId) {
      where.entityId = query.entityId;
    }

    if (query.result) {
      where.result = query.result;
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

    if (query.search && query.search.trim()) {
      const term = query.search.trim();
      where.OR = [
        { action: { contains: term, mode: 'insensitive' } },
        { entityType: { contains: term, mode: 'insensitive' } },
        { entityId: { contains: term, mode: 'insensitive' } },
        { correlationId: { contains: term, mode: 'insensitive' } },
        { actorId: { contains: term, mode: 'insensitive' } },
      ];
    }

    const [total, records] = await Promise.all([
      this.prisma.controlPlaneAuditLog.count({ where }),
      this.prisma.controlPlaneAuditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
    ]);

    const redactedRecords = records.map((r) => ({
      ...r,
      metadata: r.metadata ? this.redactionService.redact(r.metadata) : null,
    }));

    return {
      data: redactedRecords,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        hasNextPage: page * limit < total,
        hasPreviousPage: page > 1,
      },
    };
  }

  /**
   * Find single Control Plane audit log record by ID.
   */
  async findOne(id: string) {
    const record = await this.prisma.controlPlaneAuditLog.findUnique({
      where: { id },
    });

    if (!record) {
      throw new NotFoundException(`Control Plane audit log entry with ID "${id}" not found.`);
    }

    return {
      ...record,
      metadata: record.metadata ? this.redactionService.redact(record.metadata) : null,
    };
  }
}
