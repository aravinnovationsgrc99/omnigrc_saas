import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class OrganizationControlStateGuard implements CanActivate {
  private readonly logger = new Logger(OrganizationControlStateGuard.name);

  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();

    // Do not enforce organization control state on M2M control signal endpoint itself
    const path = request.path || request.url || '';
    if (path.includes('/v1/control-signals/') || path.includes('/health')) {
      return true;
    }

    // Resolve target organizationId from context
    const organizationId =
      request.params?.organizationId ||
      request.params?.orgId ||
      request.body?.organizationId ||
      request.user?.organizationId ||
      request.headers['x-organization-id'];

    if (!organizationId) {
      return true;
    }

    // Lookup projected control state
    const projection = await this.prisma.organizationControlStateProjection.findUnique({
      where: { organizationId },
    });

    // If no projection stored, default state is ACTIVE
    const state = projection ? projection.state : 'ACTIVE';

    if (state === 'ACTIVE') {
      return true;
    }

    const method = (request.method || 'GET').toUpperCase();
    const isReadOperation = ['GET', 'HEAD', 'OPTIONS'].includes(method);

    if (state === 'SUSPENDED') {
      if (isReadOperation) {
        return true;
      }
      this.logger.warn(`Blocked mutating request [${method} ${path}] for SUSPENDED org ${organizationId}`);
      throw new HttpException(
        {
          statusCode: 423,
          error: 'Locked',
          message: 'Organization is currently suspended. Write and mutating operations are disabled.',
          code: 'ORGANIZATION_SUSPENDED',
          organizationId,
        },
        423,
      );
    }

    if (state === 'DISABLED') {
      this.logger.warn(`Blocked request [${method} ${path}] for DISABLED org ${organizationId}`);
      throw new ForbiddenException({
        statusCode: 403,
        error: 'Forbidden',
        message: 'Organization API access is disabled by platform authority.',
        code: 'ORGANIZATION_DISABLED',
        organizationId,
      });
    }

    if (state === 'DECOMMISSIONED') {
      this.logger.warn(`Blocked request [${method} ${path}] for DECOMMISSIONED org ${organizationId}`);
      throw new ForbiddenException({
        statusCode: 403,
        error: 'Forbidden',
        message: 'Organization has been decommissioned. Access permanently revoked.',
        code: 'ORGANIZATION_DECOMMISSIONED',
        organizationId,
      });
    }

    return true;
  }
}
