import {
  Injectable,
  CanActivate,
  ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ResourceAuthorizationService } from '../resource-authorization.service';
import {
  RESOURCE_SCOPE_KEY,
  ResourceScopeMetadataOptions,
} from '../decorators/require-resource-scope.decorator';

@Injectable()
export class ResourceAuthorizationGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly resourceAuthService: ResourceAuthorizationService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const metaOptions = this.reflector.getAllAndOverride<ResourceScopeMetadataOptions>(
      RESOURCE_SCOPE_KEY,
      [context.getHandler(), context.getClass()],
    );

    // If endpoint has no @RequireResourceScope metadata, allow request (or rely on JwtAuthGuard/RolesGuard)
    if (!metaOptions) {
      return true;
    }

    const req = context.switchToHttp().getRequest();
    const user = req.user;

    if (!user) {
      return false;
    }

    const organizationId = user.organizationId;
    const userId = user.sub || user.id;
    const role = user.role;

    // Extract departmentId or projectId if present in request query or params
    const departmentId = req.query?.departmentId || req.params?.departmentId || req.body?.departmentId;
    const projectId = req.query?.projectId || req.params?.projectId || req.body?.projectId;

    await this.resourceAuthService.authorize(
      { userId, organizationId, role },
      {
        action: metaOptions.action,
        scopeType: metaOptions.scopeType,
        isSettingsMutation: metaOptions.isSettingsMutation,
        departmentId: typeof departmentId === 'string' ? departmentId : undefined,
        projectId: typeof projectId === 'string' ? projectId : undefined,
      },
    );

    return true;
  }
}
