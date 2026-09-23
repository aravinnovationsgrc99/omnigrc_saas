import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Logger,
} from '@nestjs/common';

@Injectable()
export class ControlPlaneM2MGuard implements CanActivate {
  private readonly logger = new Logger(ControlPlaneM2MGuard.name);

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const providedSecret = request.headers['x-control-plane-secret'];

    const expectedSecret =
      process.env.CONTROL_PLANE_PROVISIONING_SECRET ||
      'omnigrc-dev-control-plane-secret-change-in-prod';

    if (!providedSecret || providedSecret !== expectedSecret) {
      this.logger.warn(
        `SECURITY: Unauthorized M2M provisioning attempt from IP ${request.ip} to ${request.url}`,
      );
      throw new ForbiddenException({
        statusCode: 403,
        error: 'Forbidden',
        message: 'M2M authentication failed. Provisioning endpoints require an authoritative Control Plane secret.',
        code: 'M2M_SECRET_REQUIRED',
      });
    }

    return true;
  }
}
