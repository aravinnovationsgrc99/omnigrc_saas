import {
  CanActivate,
  ExecutionContext,
  Injectable,
  InternalServerErrorException,
  Logger,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { Request } from 'express';
import * as crypto from 'crypto';

const DEV_ADMIN_KEY = 'arav-cp-admin-dev-key';
const logger = new Logger('ControlPlaneAdminGuard');

@Injectable()
export class ControlPlaneAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const configuredKey = process.env.CONTROL_PLANE_ADMIN_KEY;
    const isProduction =
      process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'staging';

    // Phase 10 Security: Fail-closed in production when key is not explicitly configured.
    // This prevents the hardcoded dev fallback from being usable in any production deployment.
    if (!configuredKey && isProduction) {
      logger.error(
        'SECURITY: CONTROL_PLANE_ADMIN_KEY is not set in a production/staging environment. ' +
          'All administrative requests will be rejected.',
      );
      throw new InternalServerErrorException(
        'Control Plane administrative key is not configured for this environment.',
      );
    }

    const expectedAdminKey = configuredKey || DEV_ADMIN_KEY;

    const request = context.switchToHttp().getRequest<Request>();

    // Accept x-control-plane-admin-key header or authorization Bearer token
    let key = request.headers['x-control-plane-admin-key'] as string | undefined;
    if (!key && request.headers.authorization?.startsWith('Bearer ')) {
      key = request.headers.authorization.split(' ')[1];
    }

    if (!key) {
      throw new UnauthorizedException(
        'Missing required Control Plane administrative key (x-control-plane-admin-key)',
      );
    }

    // Phase 10 Security: Use timing-safe comparison to prevent timing oracle attacks.
    // Keys are padded/hashed to equal length before comparison.
    const isValid = timingSafeStringEqual(key, expectedAdminKey);

    if (!isValid) {
      throw new ForbiddenException('Invalid Control Plane administrative key');
    }

    return true;
  }
}

/**
 * Constant-time string equality comparison using HMAC to avoid length-based timing oracles.
 * Both operands are HMAC'd with the same ephemeral key so the comparison is always over
 * fixed-length (32-byte) outputs, preventing an attacker from inferring key length or prefix.
 */
function timingSafeStringEqual(a: string, b: string): boolean {
  try {
    const hmacKey = crypto.randomBytes(32);
    const hmacA = crypto.createHmac('sha256', hmacKey).update(a).digest();
    const hmacB = crypto.createHmac('sha256', hmacKey).update(b).digest();
    return crypto.timingSafeEqual(hmacA, hmacB);
  } catch {
    return false;
  }
}

