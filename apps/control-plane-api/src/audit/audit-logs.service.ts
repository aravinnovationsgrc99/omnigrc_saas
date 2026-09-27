import { Injectable, Logger } from '@nestjs/common';
import { ControlPlanePrismaService } from '../prisma/prisma.service';
import { RedactionService } from './redaction.service';

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

    const redactedMetadata = params.metadata ? this.redactionService.redact(params.metadata) : {};

    this.logger.log(
      `Audit [${params.result || 'SUCCESS'}]: ${params.action} on ${params.entityType}:${params.entityId} ` +
        `by actor:${params.actorId || 'SYSTEM'} (${params.actorRole || 'N/A'})`,
    );

    return this.prisma.controlPlaneAuditLog.create({
      data: {
        action: params.action,
        entityType: params.entityType,
        entityId: params.entityId,
        actorId: params.actorId || null,
        actorRole: params.actorRole || null,
        ipAddress: params.ipAddress || null,
        correlationId: params.correlationId || null,
        result: params.result || 'SUCCESS',
        metadata: redactedMetadata,
      },
    });
  }
}
