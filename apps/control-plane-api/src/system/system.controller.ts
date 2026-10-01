import { Controller, Get, UseGuards } from '@nestjs/common';
import { OperatorRole } from '@prisma/control-plane-client';
import { OperatorJwtGuard } from '../auth/operator-jwt.guard';
import { OperatorRbacGuard } from '../auth/operator-rbac.guard';
import { RequireOperatorRoles } from '../auth/operator-roles.decorator';
import { ControlPlaneSystemService } from './system.service';

@Controller('v1/system')
@UseGuards(OperatorJwtGuard, OperatorRbacGuard)
export class SystemController {
  constructor(private readonly systemService: ControlPlaneSystemService) {}

  /**
   * Return derived read-only system overview metadata.
   * Scoped to authorized Control Plane auditor roles: PLATFORM_SUPER_ADMIN, SECURITY_AUDIT, READ_ONLY_AUDITOR.
   */
  @Get('overview')
  @RequireOperatorRoles(
    OperatorRole.PLATFORM_SUPER_ADMIN,
    OperatorRole.SECURITY_AUDIT,
    OperatorRole.READ_ONLY_AUDITOR,
  )
  async getSystemOverview() {
    return this.systemService.getSystemOverview();
  }

  /**
   * Return derived cryptographic key registry metadata.
   * Scoped to authorized Control Plane auditor roles: PLATFORM_SUPER_ADMIN, SECURITY_AUDIT, READ_ONLY_AUDITOR.
   */
  @Get('key-registry')
  @RequireOperatorRoles(
    OperatorRole.PLATFORM_SUPER_ADMIN,
    OperatorRole.SECURITY_AUDIT,
    OperatorRole.READ_ONLY_AUDITOR,
  )
  async getKeyRegistry() {
    return this.systemService.getKeyRegistry();
  }
}
