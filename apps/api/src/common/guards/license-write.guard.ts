import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  ForbiddenException,
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

    const request = context.switchToHttp().getRequest();
    const method = (request?.method || 'GET').toUpperCase();
    const requiresActiveLicense = this.reflector.getAllAndOverride<boolean>(
      REQUIRES_ACTIVE_LICENSE_KEY,
      [handler, targetClass],
    );

    // organizationId strictly comes from already authenticated/verified request principal (request.user)
    const organizationId = request?.user?.organizationId || process.env.ORGANIZATION_ID;

    if (!organizationId) {
      return true;
    }

    // 2. Evaluate Organization License State server-side
    const evaluated = await this.licenseVerificationService.getEvaluatedStateForOrganization(organizationId);

    if (evaluated.state === 'VALID') {
      return true;
    }

    if (evaluated.state === 'UNLICENSED' || evaluated.state === 'INVALID_OR_UNAVAILABLE') {
      this.logger.warn(
        `LicenseWriteGuard BLOCKED request for org "${organizationId}" on path "${request?.url}" (State: UNLICENSED / ${evaluated.reason})`,
      );
      throw new ForbiddenException({
        statusCode: HttpStatus.FORBIDDEN,
        error: 'Forbidden',
        message: "Your organization is not currently licensed for OMNiGRC. Please contact your organization's administrator or Arav Innovations.",
        code: 'ORGANIZATION_NOT_LICENSED',
        reason: evaluated.reason,
      });
    }

    if (evaluated.state === 'SUSPENDED' || evaluated.state === 'REVOKED') {
      this.logger.warn(
        `LicenseWriteGuard BLOCKED request for org "${organizationId}" on path "${request?.url}" (State: ${evaluated.state})`,
      );
      throw new ForbiddenException({
        statusCode: HttpStatus.FORBIDDEN,
        error: 'Forbidden',
        message: 'Product access for this organization has been suspended or revoked.',
        code: 'PRODUCT_ACCESS_REVOKED',
      });
    }

    if (evaluated.state === 'EXPIRED') {
      const isReadMethod = ['GET', 'HEAD', 'OPTIONS'].includes(method);
      const isWriteMutation = !isReadMethod || requiresActiveLicense;

      if (!isWriteMutation) {
        // Expired read-only policy: allow login, reads, and exports
        return true;
      }

      this.logger.warn(
        `LicenseWriteGuard BLOCKED write/operation for org "${organizationId}" on path "${request?.url}" (License EXPIRED at ${evaluated.expiresAt})`,
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

    return true;
  }
}
