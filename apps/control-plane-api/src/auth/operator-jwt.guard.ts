import { Injectable, ExecutionContext, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class OperatorJwtGuard extends AuthGuard('operator-jwt') {
  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest();
    // Generate or extract request correlation ID
    request.correlationId =
      (request.headers['x-correlation-id'] as string) ||
      `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    const isProduction =
      process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'staging';
    const adminKeyHeader = request.headers['x-control-plane-admin-key'] as string;
    const expectedAdminKey =
      process.env.CONTROL_PLANE_ADMIN_KEY || 'arav-cp-admin-dev-key';

    // In dev/test environments only, accept static admin key as system fallback
    if (!isProduction && adminKeyHeader) {
      if (adminKeyHeader === expectedAdminKey) {
        const sysUser = {
          id: 'sys_admin_dev',
          email: 'system-dev@omnigrc.co',
          fullName: 'System Dev Admin',
          role: 'PLATFORM_SUPER_ADMIN',
          status: 'ACTIVE',
          sessionId: 'sys_session_dev',
        };
        request.user = sysUser;
        request.operator = sysUser;
        return true;
      } else {
        throw new ForbiddenException('Invalid Control Plane administrative key');
      }
    }

    return super.canActivate(context);
  }

  handleRequest(err: any, operator: any, info: any, context?: ExecutionContext) {
    if (err || !operator) {
      throw err || new UnauthorizedException(info?.message || 'Operator authentication required');
    }
    if (context) {
      const req = context.switchToHttp().getRequest();
      if (req) req.operator = operator;
    }
    return operator;
  }
}
