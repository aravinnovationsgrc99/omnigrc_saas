import {
  Injectable,
  Logger,
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { ControlState, OperatorRole } from '@prisma/control-plane-client';
import { ControlPlanePrismaService } from '../prisma/prisma.service';
import { ControlPlaneAuditLogsService } from '../audit/audit-logs.service';
import { OrganizationTransitionDto } from './dto/organization-transition.dto';
import * as crypto from 'crypto';

export interface OperatorContext {
  id: string;
  role: OperatorRole;
  email: string;
}

const LEGAL_TRANSITIONS: Record<ControlState, ControlState[]> = {
  [ControlState.PENDING]: [ControlState.ACTIVE, ControlState.DISABLED],
  [ControlState.ACTIVE]: [ControlState.SUSPENDED, ControlState.DISABLED],
  [ControlState.SUSPENDED]: [ControlState.ACTIVE, ControlState.DISABLED],
  [ControlState.DISABLED]: [ControlState.ACTIVE, ControlState.DECOMMISSIONED],
  [ControlState.DECOMMISSIONED]: [], // Terminal state
};

const TRIVIAL_REASONS = [
  'test',
  'xxxxxxxxxx',
  'ok ok ok ok ok',
  '1234567890',
  'asdfghjkl;',
  'testing123',
  'change state',
];

@Injectable()
export class OrganizationControlService {
  private readonly logger = new Logger(OrganizationControlService.name);

  constructor(
    private readonly prisma: ControlPlanePrismaService,
    private readonly auditLogsService: ControlPlaneAuditLogsService,
  ) {}

  /**
   * Fetch current control state for an organization
   */
  async getControlState(organizationId: string) {
    let stateRecord = await this.prisma.organizationControlState.findUnique({
      where: { organizationId },
    });

    if (!stateRecord) {
      // Default initial state is PENDING
      stateRecord = await this.prisma.organizationControlState.create({
        data: {
          organizationId,
          state: ControlState.PENDING,
          reason: 'Initial organization control state creation',
          sequence: 1n,
        },
      });
    }

    return {
      ...stateRecord,
      sequence: stateRecord.sequence.toString(),
    };
  }

  /**
   * List all organization control states
   */
  async listControlStates() {
    const records = await this.prisma.organizationControlState.findMany({
      orderBy: { updatedAt: 'desc' },
    });

    return records.map((r) => ({
      ...r,
      sequence: r.sequence.toString(),
    }));
  }

  /**
   * Server-side authoritative state machine transition
   */
  async transitionState(
    organizationId: string,
    dto: OrganizationTransitionDto,
    operator: OperatorContext,
    ipAddress?: string,
    correlationId?: string,
  ) {
    const { targetState, reason, idempotencyKey } = dto;

    // 1. Reason Validation (Minimum 10 chars, reject trivial spam)
    const cleanedReason = reason.trim();
    if (cleanedReason.length < 10) {
      throw new BadRequestException({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Reason must be at least 10 characters long',
        code: 'REASON_TOO_SHORT',
      });
    }

    if (TRIVIAL_REASONS.some((t) => cleanedReason.toLowerCase().includes(t))) {
      throw new BadRequestException({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Reason provided is trivial or invalid. A meaningful operational reason is required.',
        code: 'REASON_TOO_TRIVIAL',
      });
    }

    // 2. Idempotency Check
    if (idempotencyKey) {
      const existingLog = await this.prisma.organizationStateTransitionLog.findUnique({
        where: { idempotencyKey },
      });

      if (existingLog) {
        if (existingLog.newState === targetState && existingLog.organizationId === organizationId) {
          this.logger.log(
            `Idempotent transition match for idempotencyKey "${idempotencyKey}". Returning existing state.`,
          );
          const currentState = await this.getControlState(organizationId);
          return {
            idempotent: true,
            state: currentState,
          };
        } else {
          throw new ConflictException({
            statusCode: 409,
            error: 'Conflict',
            message: `Idempotency key "${idempotencyKey}" was previously used for a different transition.`,
            code: 'IDEMPOTENCY_KEY_REUSE_CONFLICT',
          });
        }
      }
    }

    // 3. Perform Transactional State Machine Transition
    const result = await this.prisma.$transaction(async (tx) => {
      let currentRecord = await tx.organizationControlState.findUnique({
        where: { organizationId },
      });

      if (!currentRecord) {
        currentRecord = await tx.organizationControlState.create({
          data: {
            organizationId,
            state: ControlState.PENDING,
            reason: 'Initial organization control state auto-created',
            sequence: 1n,
          },
        });
      }

      const currentState = currentRecord.state;

      // Same state requested without idempotency key
      if (currentState === targetState) {
        return {
          noChange: true,
          record: currentRecord,
        };
      }

      // Legal state machine transition check
      const allowedNextStates = LEGAL_TRANSITIONS[currentState] || [];
      if (!allowedNextStates.includes(targetState)) {
        throw new BadRequestException({
          statusCode: 400,
          error: 'Bad Request',
          message: `Illegal state transition from [${currentState}] to [${targetState}]. Allowed transitions: [${allowedNextStates.join(', ') || 'NONE (Terminal State)'}]`,
          code: 'INVALID_STATE_TRANSITION',
        });
      }

      // Increment sequence counter monotonically
      const nextSequence = currentRecord.sequence + 1n;

      // Update authoritative state
      const updatedRecord = await tx.organizationControlState.update({
        where: { organizationId },
        data: {
          state: targetState,
          reason: cleanedReason,
          sequence: nextSequence,
          updatedByOperatorId: operator.id,
        },
      });

      // Create append-only transition log
      await tx.organizationStateTransitionLog.create({
        data: {
          organizationId,
          previousState: currentState,
          newState: targetState,
          reason: cleanedReason,
          sequence: nextSequence,
          idempotencyKey: idempotencyKey || null,
          operatorId: operator.id,
          operatorRole: operator.role,
        },
      });

      return {
        noChange: false,
        previousState: currentState,
        record: updatedRecord,
      };
    });

    const finalRecord = result.record;
    const responseSequence = finalRecord.sequence.toString();

    // 4. Record Audit Event
    await this.auditLogsService.log({
      action: 'ORGANIZATION_STATE_CHANGED',
      entityType: 'ORGANIZATION_CONTROL_STATE',
      entityId: organizationId,
      actorId: operator.id,
      actorRole: operator.role,
      ipAddress,
      correlationId,
      result: 'SUCCESS',
      metadata: {
        previousState: result.previousState || finalRecord.state,
        newState: targetState,
        reason: cleanedReason,
        sequence: responseSequence,
        idempotencyKey: idempotencyKey || null,
      },
    });

    // 5. Propagate M2M Signal to Data Plane
    const propagationResult = await this.propagateStateToDataPlane({
      organizationId,
      targetState,
      sequence: responseSequence,
      reason: cleanedReason,
      correlationId: correlationId || `corr_${Date.now()}`,
    });

    return {
      idempotent: false,
      organizationId,
      state: finalRecord.state,
      previousState: result.previousState || finalRecord.state,
      sequence: responseSequence,
      reason: cleanedReason,
      updatedAt: finalRecord.updatedAt,
      propagation: propagationResult,
    };
  }

  /**
   * Dispatch authenticated M2M control signal to Data Plane
   */
  public async propagateStateToDataPlane(params: {
    organizationId: string;
    targetState: ControlState;
    sequence: string;
    reason: string;
    correlationId: string;
  }) {
    const isProduction = process.env.NODE_ENV === 'production';
    const m2mSecret = process.env.CONTROL_PLANE_M2M_SECRET || process.env.CONTROL_PLANE_PROVISIONING_SECRET;

    if (isProduction && !m2mSecret) {
      this.logger.error('CRITICAL: CONTROL_PLANE_M2M_SECRET environment variable is missing in production.');
      throw new Error('PRODUCTION SECURITY ERROR: CONTROL_PLANE_M2M_SECRET is required in production.');
    }

    const dataPlaneUrl = process.env.DATA_PLANE_URL || 'http://localhost:3000';
    const endpoint = `${dataPlaneUrl.replace(/\/$/, '')}/v1/control-signals/organization-state`;
    const secret = m2mSecret || 'omnigrc-dev-control-plane-secret-change-in-prod';

    const signalId = `sig_${crypto.randomUUID()}`;
    const timestamp = new Date().toISOString();
    const issuer = 'arav-control-plane';

    // Canonical string for HMAC-SHA256
    const canonicalString = `id:${signalId}|organizationId:${params.organizationId}|targetState:${params.targetState}|sequence:${params.sequence}|timestamp:${timestamp}|issuer:${issuer}`;

    const signature = crypto
      .createHmac('sha256', secret)
      .update(canonicalString)
      .digest('hex');

    const payload = {
      id: signalId,
      organizationId: params.organizationId,
      targetState: params.targetState,
      sequence: params.sequence,
      timestamp,
      reason: params.reason,
      correlationId: params.correlationId,
      issuer,
      signature,
    };

    try {
      this.logger.log(
        `Dispatching M2M control signal [${params.targetState}] (Seq: ${params.sequence}) for Org ${params.organizationId} to ${endpoint}`,
      );

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-control-plane-secret': secret,
        },
        body: JSON.stringify(payload),
      });

      const responseData = await res.json().catch(() => null);

      return {
        status: res.ok ? 'DELIVERED' : 'FAILED_PROPAGATION',
        statusCode: res.status,
        dataPlaneResponse: responseData,
      };
    } catch (error: any) {
      this.logger.warn(
        `Data Plane state signal propagation warning for Org ${params.organizationId}: ${error.message}. (Failure-safe: Control Plane retains authoritative state).`,
      );
      return {
        status: 'FAILED_PROPAGATION',
        error: error.message,
      };
    }
  }
}
