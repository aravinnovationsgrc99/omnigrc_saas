import { Controller, Get, UseGuards } from '@nestjs/common';
import { MsspAdminService } from './mssp-admin.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { MsspClientSummaryDto, Role } from '@omnigrc/shared';
import { RequireCapability } from '../common/decorators/require-capability.decorator';

@Controller('mssp-admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@RequireCapability('MSSP_PORTAL')
export class MsspAdminController {
  constructor(private readonly msspAdminService: MsspAdminService) {}

  @Get('clients')
  @Roles(Role.MSSP_ADMIN, Role.MSSP_ANALYST, Role.ADMIN)
  async getManagedClients(
    @CurrentUser('organizationId') organizationId: string,
  ): Promise<MsspClientSummaryDto[]> {
    return this.msspAdminService.getManagedClients(organizationId);
  }
}
