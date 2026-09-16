import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { LicenseVerificationService } from '../../license-verification/license-verification.service';
import {
  REQUIRES_ACTIVE_LICENSE_KEY,
  BYPASS_LICENSE_CHECK_KEY,
} from '../decorators/requires-active-license.decorator';

@Injectable()
export class LicenseWriteGuard implements CanActivate {
  private readonly logger = new Logger(LicenseWriteGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly licenseVerificationService: LicenseVerificationService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const handler = context.getHandler();
    const targetClass = context.getClass();

    // 1. Check explicit Bypass decorator
    const isBypassed = this.reflector.getAllAndOverride<boolean>(
      BYPASS_LICENSE_CHECK_KEY,
      [handler, targetClass],
    );
    if (isBypassed) {
      return true;
    }

    // 2. Check explicit RequiresActiveLicense decorator
    const requiresLicense = this.reflector.getAllAndOverride<boolean>(
      REQUIRES_ACTIVE_LICENSE_KEY,
      [handler, targetClass],
    );

    const request = context.switchToHttp().getRequest();
    const method = (request?.method || 'GET').toUpperCase();

    // Read methods (GET, HEAD, OPTIONS) do not require active write license unless explicitly requested
    const isReadMethod = ['GET', 'HEAD', 'OPTIONS'].includes(method);

    if (!requiresLicense && isReadMethod) {
      return true;
    }

    // Allow JwtAuthGuard to process unauthenticated requests first so unauthenticated calls return 401 Unauthorized
    if (!request?.headers?.authorization && !request?.user) {
      return true;
    }



    // 3. Evaluate License State
    const evaluated = await this.licenseVerificationService.getEvaluatedState();

    if (evaluated.state === 'VALID') {
      return true;
    }

    if (evaluated.state === 'EXPIRED') {
      this.logger.warn(
        `LicenseWriteGuard BLOCKED write mutation for path "${request?.url}" (License EXPIRED at ${evaluated.expiresAt})`,
      );
      throw new HttpException(
        {
          statusCode: HttpStatus.PAYMENT_REQUIRED,
          error: 'Payment Required',
          message: 'License has expired. Application is operating in read-only mode.',
          code: 'LICENSE_EXPIRED',
          expiresAt: evaluated.expiresAt,
        },
        HttpStatus.PAYMENT_REQUIRED,
      );
    }

    // INVALID_OR_UNAVAILABLE State
    this.logger.warn(
      `LicenseWriteGuard BLOCKED request for path "${request?.url}" (License state INVALID_OR_UNAVAILABLE: ${evaluated.reason})`,
    );
    throw new HttpException(
      {
        statusCode: HttpStatus.SERVICE_UNAVAILABLE,
        error: 'Service Unavailable',
        message: 'Valid software license state is unavailable. Please verify deployment registration.',
        code: 'LICENSE_UNAVAILABLE',
        reason: evaluated.reason,
      },
      HttpStatus.SERVICE_UNAVAILABLE,
    );
  }
}
