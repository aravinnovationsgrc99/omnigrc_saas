import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { Request } from 'express';

@Injectable()
export class ControlPlaneAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    
    // Accept x-control-plane-admin-key or authorization Bearer if it matches admin key
    let key = request.headers['x-control-plane-admin-key'] as string;
    if (!key && request.headers.authorization?.startsWith('Bearer ')) {
      key = request.headers.authorization.split(' ')[1];
    }

    const expectedAdminKey =
      process.env.CONTROL_PLANE_ADMIN_KEY || 'arav-cp-admin-dev-key';

    if (!key) {
      throw new UnauthorizedException(
        'Missing required Control Plane administrative key (x-control-plane-admin-key)',
      );
    }

    if (key !== expectedAdminKey) {
      throw new ForbiddenException('Invalid Control Plane administrative key');
    }

    return true;
  }
}
