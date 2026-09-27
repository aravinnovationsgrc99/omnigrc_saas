import {
  Injectable,
  Logger,
  BadRequestException,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GlobalServiceSignalDto } from './dto/global-service-signal.dto';
import { OrgServiceOverrideSignalDto } from './dto/org-service-override-signal.dto';
import * as crypto from 'crypto';

@Injectable()
export class ServiceControlSignalService {
  private readonly logger = new Logger(ServiceControlSignalService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Process incoming Global Service State control signal from CP
   */
  async processGlobalServiceSignal(dto: GlobalServiceSignalDto, headerSecret?: string) {
    const { id, capabilityCode, targetState, sequence: sequenceStr, timestamp, issuer, signature } = dto;

    const m2mSecret = this.getM2MSecret(headerSecret);

    // 1. Verify HMAC Signature
    const canonicalString = `id:${id}|capabilityCode:${capabilityCode}|targetState:${targetState}|sequence:${sequenceStr}|timestamp:${timestamp}|issuer:${issuer}`;
    this.verifyHmacSignature(canonicalString, signature, m2mSecret, capabilityCode);

    // 2. Timestamp Freshness Check
    this.verifyTimestampFreshness(timestamp, capabilityCode);

    const incomingSeq = BigInt(sequenceStr);

    // 3. Update Projection with Monotonic Sequence Check
    const projection = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.globalServiceStateProjection.findUnique({
        where: { capabilityCode },
      });

      if (existing) {
        if (incomingSeq <= existing.sequence) {
          this.logger.warn(
            `Rejected stale global service signal (Incoming: ${incomingSeq} <= Projected: ${existing.sequence}) for capability [${capabilityCode}]`,
          );
          throw new ConflictException({
            statusCode: 409,
            error: 'Conflict',
            message: `Incoming signal sequence (${incomingSeq}) is older or equal to current sequence (${existing.sequence}).`,
            code: 'STALE_CONTROL_SIGNAL',
          });
        }

        return tx.globalServiceStateProjection.update({
          where: { capabilityCode },
          data: {
            state: targetState,
            sequence: incomingSeq,
            receivedAt: new Date(),
          },
        });
      } else {
        return tx.globalServiceStateProjection.create({
          data: {
            capabilityCode,
            state: targetState,
            sequence: incomingSeq,
            receivedAt: new Date(),
          },
        });
      }
    });

    this.logger.log(
      `Updated Global Service Projection for capability [${capabilityCode}] -> [${projection.state}] (Seq: ${projection.sequence.toString()})`,
    );

    return {
      status: 'ACCEPTED',
      capabilityCode,
      state: projection.state,
      sequence: projection.sequence.toString(),
      receivedAt: projection.receivedAt,
    };
  }

  /**
   * Process incoming Organization Service Override control signal from CP
   */
  async processOrgServiceOverrideSignal(dto: OrgServiceOverrideSignalDto, headerSecret?: string) {
    const {
      id,
      organizationId,
      capabilityCode,
      targetState,
      reason,
      sequence: sequenceStr,
      timestamp,
      issuer,
      signature,
    } = dto;

    const m2mSecret = this.getM2MSecret(headerSecret);

    // 1. Verify HMAC Signature
    const canonicalString = `id:${id}|organizationId:${organizationId}|capabilityCode:${capabilityCode}|targetState:${targetState}|sequence:${sequenceStr}|timestamp:${timestamp}|issuer:${issuer}`;
    this.verifyHmacSignature(canonicalString, signature, m2mSecret, `${organizationId}:${capabilityCode}`);

    // 2. Timestamp Freshness Check
    this.verifyTimestampFreshness(timestamp, `${organizationId}:${capabilityCode}`);

    const incomingSeq = BigInt(sequenceStr);

    // 3. Update Projection with Monotonic Sequence Check
    const result = await this.prisma.$transaction(async (tx) => {
      // Ensure organization exists
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

      const existing = await tx.organizationServiceOverrideProjection.findUnique({
        where: {
          organizationId_capabilityCode: {
            organizationId,
            capabilityCode,
          },
        },
      });

      const isClearOverride = targetState === 'INHERIT' || targetState === 'CLEARED';

      if (existing) {
        if (incomingSeq <= existing.sequence) {
          this.logger.warn(
            `Rejected stale org service override signal (Incoming: ${incomingSeq} <= Projected: ${existing.sequence}) for Org ${organizationId}, capability [${capabilityCode}]`,
          );
          throw new ConflictException({
            statusCode: 409,
            error: 'Conflict',
            message: `Incoming signal sequence (${incomingSeq}) is older or equal to current sequence (${existing.sequence}).`,
            code: 'STALE_CONTROL_SIGNAL',
          });
        }

        if (isClearOverride) {
          await tx.organizationServiceOverrideProjection.delete({
            where: {
              organizationId_capabilityCode: {
                organizationId,
                capabilityCode,
              },
            },
          });
          return { cleared: true, state: 'INHERIT', sequence: incomingSeq, receivedAt: new Date() };
        }

        const updated = await tx.organizationServiceOverrideProjection.update({
          where: {
            organizationId_capabilityCode: {
              organizationId,
              capabilityCode,
            },
          },
          data: {
            overrideState: targetState as any,
            sequence: incomingSeq,
            reason: reason || null,
            receivedAt: new Date(),
          },
        });
        return { cleared: false, state: updated.overrideState, sequence: updated.sequence, receivedAt: updated.receivedAt };
      } else {
        if (isClearOverride) {
          return { cleared: true, state: 'INHERIT', sequence: incomingSeq, receivedAt: new Date() };
        }

        const created = await tx.organizationServiceOverrideProjection.create({
          data: {
            organizationId,
            capabilityCode,
            overrideState: targetState as any,
            sequence: incomingSeq,
            reason: reason || null,
            receivedAt: new Date(),
          },
        });
        return { cleared: false, state: created.overrideState, sequence: created.sequence, receivedAt: created.receivedAt };
      }
    });

    this.logger.log(
      `Updated Org Service Override Projection for Org ${organizationId}, capability [${capabilityCode}] -> [${result.state}] (Seq: ${result.sequence.toString()})`,
    );

    return {
      status: 'ACCEPTED',
      organizationId,
      capabilityCode,
      state: result.state,
      sequence: result.sequence.toString(),
      receivedAt: result.receivedAt,
    };
  }

  private getM2MSecret(headerSecret?: string): string {
    const isProduction = process.env.NODE_ENV === 'production';
    const envSecret = process.env.CONTROL_PLANE_M2M_SECRET || process.env.CONTROL_PLANE_PROVISIONING_SECRET;

    if (isProduction && !envSecret) {
      this.logger.error('CRITICAL: CONTROL_PLANE_M2M_SECRET environment variable missing in production.');
      throw new UnauthorizedException({
        statusCode: 401,
        error: 'Unauthorized',
        message: 'M2M authentication configuration error in production environment.',
        code: 'INVALID_CONTROL_SIGNAL',
      });
    }

    const secret = envSecret || 'omnigrc-dev-control-plane-secret-change-in-prod';

    if (headerSecret && headerSecret !== secret) {
      throw new UnauthorizedException({
        statusCode: 401,
        error: 'Unauthorized',
        message: 'Invalid x-control-plane-secret header provided.',
        code: 'INVALID_CONTROL_SIGNAL',
      });
    }

    return secret;
  }

  private verifyHmacSignature(canonicalString: string, signature: string, secret: string, targetId: string) {
    const computedSignature = crypto
      .createHmac('sha256', secret)
      .update(canonicalString)
      .digest('hex');

    const sigBuf = Buffer.from(signature);
    const compBuf = Buffer.from(computedSignature);

    if (sigBuf.length !== compBuf.length || !crypto.timingSafeEqual(sigBuf, compBuf)) {
      this.logger.warn(`SECURITY: Signal HMAC signature verification failed for target [${targetId}]`);
      throw new BadRequestException({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Control signal signature verification failed.',
        code: 'INVALID_CONTROL_SIGNAL',
      });
    }
  }

  private verifyTimestampFreshness(timestampStr: string, targetId: string) {
    const signalTime = new Date(timestampStr).getTime();
    const now = Date.now();
    const skewMs = Math.abs(now - signalTime);
    const MAX_SKEW_MS = 5 * 60 * 1000; // 5 minutes

    if (isNaN(signalTime) || skewMs > MAX_SKEW_MS) {
      this.logger.warn(
        `SECURITY: Stale or replayed signal rejected for target [${targetId}]. Skew: ${skewMs}ms`,
      );
      throw new BadRequestException({
        statusCode: 400,
        error: 'Bad Request',
        message: `Control signal timestamp is stale or outside the accepted window (${skewMs}ms skew).`,
        code: 'STALE_CONTROL_SIGNAL',
      });
    }
  }
}
