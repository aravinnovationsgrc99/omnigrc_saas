import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { REQUIRE_CAPABILITY_KEY, CapabilityRequirements } from '../decorators/require-capability.decorator';
import { EffectiveServiceStateResolver } from '../../service-control/effective-service-state-resolver.service';

@Injectable()
export class ServiceCapabilityGuard implements CanActivate {
  private readonly logger = new Logger(ServiceCapabilityGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly effectiveServiceStateResolver: EffectiveServiceStateResolver,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requirement = this.reflector.getAllAndOverride<CapabilityRequirements>(
      REQUIRE_CAPABILITY_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requirement) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const organizationId =
      request.params?.organizationId ||
      request.params?.orgId ||
      request.body?.organizationId ||
      request.user?.organizationId ||
      request.headers['x-organization-id'] ||
      process.env.ORGANIZATION_ID;

    if (!organizationId) {
      // System routes or routes without organization context are checked against global state
      const resolved = await this.effectiveServiceStateResolver.resolveEffectiveState(
        '',
        requirement.capabilityCode,
      );

      if (!resolved.isAvailable) {
        this.logger.warn(
          `ServiceCapabilityGuard BLOCKED request for capability [${requirement.capabilityCode}] (Global Reason: ${resolved.reason})`,
        );
        throw new ForbiddenException({
          statusCode: HttpStatus.FORBIDDEN,
          error: 'Forbidden',
          message: `Service capability [${requirement.capabilityCode}] is not available.`,
          code: 'CAPABILITY_DISABLED',
          capability: requirement.capabilityCode,
          state: resolved.effectiveState,
          reason: resolved.reason,
          source: resolved.source,
        });
      }
      return true;
    }

    const resolved = await this.effectiveServiceStateResolver.resolveEffectiveState(
      organizationId,
      requirement.capabilityCode,
    );

    if (!resolved.isAvailable) {
      if (resolved.reason?.includes('INVALID_OR_UNAVAILABLE')) {
        throw new HttpException(
          {
            statusCode: HttpStatus.SERVICE_UNAVAILABLE,
            error: 'Service Unavailable',
            message: 'License verification state is currently unavailable or invalid.',
            code: 'LICENSE_UNAVAILABLE',
            reason: resolved.reason,
          },
          HttpStatus.SERVICE_UNAVAILABLE,
        );
      }

      this.logger.warn(
        `ServiceCapabilityGuard BLOCKED request for org "${organizationId}" on capability [${requirement.capabilityCode}] (${resolved.source}: ${resolved.reason})`,
      );
      throw new ForbiddenException({
        statusCode: HttpStatus.FORBIDDEN,
        error: 'Forbidden',
        message: `Service capability [${requirement.capabilityCode}] is not available for this organization.`,
        code: 'CAPABILITY_DISABLED',
        capability: requirement.capabilityCode,
        state: resolved.effectiveState,
        reason: resolved.reason,
        source: resolved.source,
      });
    }

    return true;
  }
}
