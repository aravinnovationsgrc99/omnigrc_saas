import { Controller, Get, Put, Body, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequiresActiveLicense } from '../common/decorators/requires-active-license.decorator';
import { DashboardService } from './dashboard.service';
import { UpdateDashboardPreferenceDto } from './dto/dashboard.dto';
import { UserDashboardPreferenceDto } from '@omnigrc/shared';

@Controller('dashboard')
@UseGuards(JwtAuthGuard)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('preferences')
  async getUserPreference(
    @CurrentUser('id') userId: string,
    @CurrentUser('organizationId') organizationId: string,
    @CurrentUser() user?: any,
  ): Promise<UserDashboardPreferenceDto> {
    const effectiveUserId = userId || user?.userId || user?.id || user?.sub;
    const effectiveOrgId = organizationId || user?.organizationId;
    return this.dashboardService.getUserPreference(effectiveUserId, effectiveOrgId);
  }

  @Put('preferences')
  @RequiresActiveLicense()
  async updateUserPreference(
    @CurrentUser('id') userId: string,
    @CurrentUser('organizationId') organizationId: string,
    @Body() dto: UpdateDashboardPreferenceDto,
    @CurrentUser() user?: any,
  ): Promise<UserDashboardPreferenceDto> {
    const effectiveUserId = userId || user?.userId || user?.id || user?.sub;
    const effectiveOrgId = organizationId || user?.organizationId;
    return this.dashboardService.updateUserPreference(effectiveUserId, effectiveOrgId, dto);
  }
}
