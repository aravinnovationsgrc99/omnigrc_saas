import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@omnigrc/shared';
import { ROLES_KEY } from '../decorators/roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest();
    if (!user || !user.role) {
      return false;
    }

    const userRoleStr = String(user.role);
    const requiredRolesStr = requiredRoles.map((r) => String(r));

    if (requiredRolesStr.includes(userRoleStr)) {
      return true;
    }

    if (userRoleStr === 'MSSP_ADMIN' && requiredRolesStr.includes('ADMIN')) {
      return true;
    }

    if (userRoleStr === 'MSSP_ANALYST' && requiredRolesStr.includes('ANALYST')) {
      return true;
    }

    return false;
  }
}
