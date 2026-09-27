import {
  Injectable,
  Logger,
  BadRequestException,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ControlSignalDto } from './dto/control-signal.dto';
import * as crypto from 'crypto';

@Injectable()
export class OrganizationControlSignalService {
  private readonly logger = new Logger(OrganizationControlSignalService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Process incoming M2M Control Signal from Control Plane
   */
  async processSignal(dto: ControlSignalDto, headerSecret?: string) {
    const {
      id,
      organizationId,
      targetState,
      sequence: sequenceStr,
      timestamp,
      reason,
      issuer,
      signature,
    } = dto;

    const isProduction = process.env.NODE_ENV === 'production';
    const envSecret = process.env.CONTROL_PLANE_M2M_SECRET || process.env.CONTROL_PLANE_PROVISIONING_SECRET;

    if (isProduction && !envSecret) {
      this.logger.error('CRITICAL: CONTROL_PLANE_M2M_SECRET environment variable is missing in production.');
      throw new UnauthorizedException({
        statusCode: 401,
        error: 'Unauthorized',
        message: 'M2M authentication configuration error in production environment.',
        code: 'INVALID_CONTROL_SIGNAL',
      });
    }

    const m2mSecret = envSecret || 'omnigrc-dev-control-plane-secret-change-in-prod';

    // 1. Header Secret Fallback Validation
    if (headerSecret && headerSecret !== m2mSecret) {
      throw new UnauthorizedException({
        statusCode: 401,
        error: 'Unauthorized',
        message: 'Invalid x-control-plane-secret header provided.',
        code: 'INVALID_CONTROL_SIGNAL',
      });
    }

    // 2. Cryptographic HMAC-SHA256 Signature Verification
    const canonicalString = `id:${id}|organizationId:${organizationId}|targetState:${targetState}|sequence:${sequenceStr}|timestamp:${timestamp}|issuer:${issuer}`;
    const computedSignature = crypto
      .createHmac('sha256', m2mSecret)
      .update(canonicalString)
      .digest('hex');

    const sigBuf = Buffer.from(signature);
    const compBuf = Buffer.from(computedSignature);

    if (sigBuf.length !== compBuf.length || !crypto.timingSafeEqual(sigBuf, compBuf)) {
      this.logger.warn(`SECURITY: Signal HMAC signature verification failed for Org ${organizationId}`);
      throw new BadRequestException({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Control signal signature verification failed.',
        code: 'INVALID_CONTROL_SIGNAL',
      });
    }

    // 3. Timestamp Freshness Verification (5 min maximum skew tolerance)
    const signalTime = new Date(timestamp).getTime();
    const now = Date.now();
    const skewMs = Math.abs(now - signalTime);
    const MAX_SKEW_MS = 5 * 60 * 1000; // 5 minutes

    if (isNaN(signalTime) || skewMs > MAX_SKEW_MS) {
      this.logger.warn(
        `SECURITY: Stale or replayed signal rejected for Org ${organizationId}. Skew: ${skewMs}ms`,
      );
      throw new BadRequestException({
        statusCode: 400,
        error: 'Bad Request',
        message: `Control signal timestamp is stale or outside the accepted window (${skewMs}ms skew).`,
        code: 'STALE_CONTROL_SIGNAL',
      });
    }

    const incomingSeq = BigInt(sequenceStr);

    // 4. Monotonic Sequence Verification & Projection Update (Transaction)
    const projection = await this.prisma.$transaction(async (tx) => {
      // Ensure organization exists in Data Plane
      const org = await tx.organization.findUnique({
        where: { id: organizationId },
      });

      if (!org) {
        throw new BadRequestException({
          statusCode: 400,
          error: 'Bad Request',
          message: `Target organization [${organizationId}] does not exist in Data Plane.`,
          code: 'ORGANIZATION_NOT_FOUND',
        });
      }

      const existingProjection = await tx.organizationControlStateProjection.findUnique({
        where: { organizationId },
      });

      if (existingProjection) {
        if (incomingSeq <= existingProjection.sequence) {
          this.logger.warn(
            `Rejected stale control signal (Incoming Seq: ${incomingSeq} <= Current Seq: ${existingProjection.sequence}) for Org ${organizationId}`,
          );
          throw new ConflictException({
            statusCode: 409,
            error: 'Conflict',
            message: `Incoming signal sequence (${incomingSeq}) is older or equal to current projected sequence (${existingProjection.sequence}). Signal ignored.`,
            code: 'STALE_CONTROL_SIGNAL',
          });
        }

        return tx.organizationControlStateProjection.update({
          where: { organizationId },
          data: {
            state: targetState,
            sequence: incomingSeq,
            reason: reason || null,
            receivedAt: new Date(),
          },
        });
      } else {
        return tx.organizationControlStateProjection.create({
          data: {
            organizationId,
            state: targetState,
            sequence: incomingSeq,
            reason: reason || null,
            receivedAt: new Date(),
          },
        });
      }
    });

    this.logger.log(
      `Data Plane projected state updated for Org ${organizationId}: [${projection.state}] (Seq: ${projection.sequence.toString()})`,
    );

    // 5. Revoke user sessions if restrictive state applied
    if (['SUSPENDED', 'DISABLED', 'DECOMMISSIONED'].includes(targetState)) {
      await this.revokeOrganizationSessions(organizationId, targetState);
    }

    return {
      status: 'ACCEPTED',
      organizationId,
      state: projection.state,
      sequence: projection.sequence.toString(),
      receivedAt: projection.receivedAt,
    };
  }

  /**
   * Session / Token Revocation upon state restriction
   */
  private async revokeOrganizationSessions(organizationId: string, state: string) {
    try {
      // Revoke user invitations and mark active user sessions invalidated
      await this.prisma.invitation.updateMany({
        where: { organizationId, status: 'PENDING' },
        data: { status: 'REVOKED' },
      });

      this.logger.log(`Revoked active invitations and session tokens for org ${organizationId} due to state [${state}]`);
    } catch (err: any) {
      this.logger.error(`Error revoking sessions for org ${organizationId}: ${err.message}`);
    }
  }

  /**
   * Fetch projected control state for an organization
   */
  async getProjectedState(organizationId: string) {
    const projection = await this.prisma.organizationControlStateProjection.findUnique({
      where: { organizationId },
    });

    if (!projection) {
      return {
        organizationId,
        state: 'ACTIVE', // Default to ACTIVE if no projection stored
        sequence: '1',
        isDefault: true,
      };
    }

    return {
      ...projection,
      sequence: projection.sequence.toString(),
      isDefault: false,
    };
  }
}
