import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { FrameworkEntitlementsService } from '../framework-entitlements.service';
import { REQUIRE_FRAMEWORK_ENTITLEMENT_KEY } from '../decorators/require-framework-entitlement.decorator';

@Injectable()
export class FrameworkEntitlementGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly frameworkEntitlementsService: FrameworkEntitlementsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const paramName = this.reflector.getAllAndOverride<string>(
      REQUIRE_FRAMEWORK_ENTITLEMENT_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!paramName) {
      return true; // No explicit framework requirement on this handler
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    // Derived STRICTLY from authenticated server-side JWT context
    if (!user || !user.organizationId) {
      throw new UnauthorizedException('Unauthenticated request: missing organization context.');
    }

    const organizationId = user.organizationId;

    // Resolve framework identifier from route params, query, or body
    const frameworkIdOrCode =
      request.params?.[paramName] ||
      request.query?.[paramName] ||
      request.body?.[paramName];

    if (!frameworkIdOrCode) {
      return true; // No framework identifier supplied in request
    }

    await this.frameworkEntitlementsService.assertEntitled(organizationId, frameworkIdOrCode);
    return true;
  }
}
