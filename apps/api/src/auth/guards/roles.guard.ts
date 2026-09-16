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

    const userRole = user.role as Role;
    if (requiredRoles.includes(userRole)) {
      return true;
    }

    if (userRole === Role.MSSP_ADMIN && requiredRoles.includes(Role.ADMIN)) {
      return true;
    }

    if (userRole === Role.MSSP_ANALYST && requiredRoles.includes(Role.ANALYST)) {
      return true;
    }

    return false;
  }
}
