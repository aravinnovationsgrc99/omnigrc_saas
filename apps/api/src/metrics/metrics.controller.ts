import { Controller, Get, Query, ParseIntPipe, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { MetricsService } from './metrics.service';
import { OverviewMetricsDto, HeatmapCellDetailsDto } from '@omnigrc/shared';
import { ResourceAuthContext } from '../auth/resource-authorization.service';

@Controller('metrics')
@UseGuards(JwtAuthGuard)
export class MetricsController {
  constructor(private readonly metricsService: MetricsService) {}

  @Get('overview')
  async getOverviewMetrics(
    @CurrentUser() user: any,
  ): Promise<OverviewMetricsDto> {
    const authCtx: ResourceAuthContext = {
      userId: user.userId,
      organizationId: user.organizationId,
      role: user.role,
    };
    return this.metricsService.getOverviewMetrics(authCtx);
  }

  @Get('risks/heatmap-cell')
  async getHeatmapCellDetails(
    @CurrentUser() user: any,
    @Query('likelihood', ParseIntPipe) likelihood: number,
    @Query('impact', ParseIntPipe) impact: number,
  ): Promise<HeatmapCellDetailsDto> {
    const authCtx: ResourceAuthContext = {
      userId: user.userId,
      organizationId: user.organizationId,
      role: user.role,
    };
    return this.metricsService.getHeatmapCellDetails(authCtx, likelihood, impact);
  }
}
