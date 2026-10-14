import { Injectable, ExecutionContext, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { requestLocalStorage } from '../audit/request-context';

@Injectable()
export class OperatorJwtGuard extends AuthGuard('operator-jwt') {
  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest();
    // Generate or extract request correlation ID
    request.correlationId =
      (request.headers['x-correlation-id'] as string) ||
      `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    const isExplicitDevOrTest =
      process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test';
    const adminKeyHeader = request.headers['x-control-plane-admin-key'] as string;
    const expectedAdminKey =
      process.env.CONTROL_PLANE_ADMIN_KEY || 'arav-cp-admin-dev-key';

    // In explicit dev/test environments only, accept static admin key as system fallback
    if (isExplicitDevOrTest && adminKeyHeader) {
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
        requestLocalStorage.enterWith({
          actorId: sysUser.id,
          actorRole: sysUser.role,
          ipAddress: request.ip || request.headers['x-forwarded-for'],
          correlationId: request.correlationId,
        });
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
      if (req) {
        req.operator = operator;
        requestLocalStorage.enterWith({
          actorId: operator.id || operator.sub,
          actorRole: operator.role,
          ipAddress: req.ip || req.headers['x-forwarded-for'],
          correlationId: req.correlationId,
        });

        // Server-enforced MFA re-enrollment restriction:
        if (operator.isMfaRestricted) {
          const rawPath = (req.path || req.url || '').split('?')[0];
          const normalizedPath = rawPath.replace(/\/+/g, '/').replace(/\/+$/, '').toLowerCase();
          const method = (req.method || '').toUpperCase();

          const isAllowed =
            (method === 'GET' && normalizedPath === '/v1/operator-auth/me') ||
            (method === 'POST' && normalizedPath === '/v1/operator-auth/mfa/setup') ||
            (method === 'POST' && normalizedPath === '/v1/operator-auth/mfa/verify') ||
            (method === 'POST' && normalizedPath === '/v1/operator-auth/logout');

          if (!isAllowed) {
            throw new ForbiddenException(
              'MFA re-enrollment required: full operator administrative access is restricted until MFA setup and verification are completed',
            );
          }
        }
      }
    }
    return operator;
  }
}
