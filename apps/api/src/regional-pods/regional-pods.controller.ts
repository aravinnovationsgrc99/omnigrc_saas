import { Controller, Get, Patch, Param, Body, UseGuards } from '@nestjs/common';
import { RegionalPodsService } from './regional-pods.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Role, JwtPayload, PodStatus } from '@omnigrc/shared';

@Controller('regional-pods')
@UseGuards(JwtAuthGuard, RolesGuard)
export class RegionalPodsController {
  constructor(private readonly regionalPodsService: RegionalPodsService) {}

  @Get()
  @Roles(Role.ADMIN, Role.ANALYST)
  async getRegionalPods(@CurrentUser('organizationId') organizationId: string) {
    return this.regionalPodsService.getPodsForOrganization(organizationId);
  }

  @Patch(':id')
  @Roles(Role.ADMIN)
  async updateStatus(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body('status') status: PodStatus,
  ) {
    return this.regionalPodsService.updateStatus(user.organizationId, user.sub, id, status);
  }
}
