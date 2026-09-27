import { Injectable, Logger } from '@nestjs/common';
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
}
