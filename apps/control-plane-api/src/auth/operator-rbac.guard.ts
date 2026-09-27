import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { OperatorRole } from '@prisma/control-plane-client';
import { OPERATOR_ROLES_KEY } from './operator-roles.decorator';

@Injectable()
export class OperatorRbacGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<OperatorRole[]>(
      OPERATOR_ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const operator = request.operator || request.user;

    if (!operator) {
      throw new UnauthorizedException('Operator authentication required');
    }

    if (operator.status === 'SUSPENDED') {
      throw new ForbiddenException('Operator account is suspended');
    }

    // PLATFORM_SUPER_ADMIN has full platform administrative authority
    if (operator.role === OperatorRole.PLATFORM_SUPER_ADMIN) {
      return true;
    }

    const hasRole = requiredRoles.includes(operator.role);
    if (!hasRole) {
      throw new ForbiddenException(
        `Operator role [${operator.role}] is not authorized to perform this operation. Required role: [${requiredRoles.join(', ')}]`,
      );
    }

    return true;
  }
}
