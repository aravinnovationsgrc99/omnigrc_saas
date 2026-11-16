import { Controller, Get, Query, ParseIntPipe, UseGuards, HttpException, HttpStatus } from '@nestjs/common';
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
      userId: user.userId || user.id || user.sub,
      organizationId: user.organizationId,
      role: user.role,
    };

    let timer: NodeJS.Timeout | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('METRICS_TIMEOUT')), 25000);
    });

    try {
      const result = await Promise.race([
        this.metricsService.getOverviewMetrics(authCtx),
        timeoutPromise,
      ]);
      if (timer) clearTimeout(timer);
      return result;
    } catch (err: any) {
      if (timer) clearTimeout(timer);
      if (err.message === 'METRICS_TIMEOUT') {
        throw new HttpException(
          { message: 'Metrics query took too long. Please retry.' },
          HttpStatus.REQUEST_TIMEOUT,
        );
      }
      throw err;
    }
  }

  @Get('risks/heatmap-cell')
  async getHeatmapCellDetails(
    @CurrentUser() user: any,
    @Query('likelihood', ParseIntPipe) likelihood: number,
    @Query('impact', ParseIntPipe) impact: number,
  ): Promise<HeatmapCellDetailsDto> {
    const authCtx: ResourceAuthContext = {
      userId: user.userId || user.id || user.sub,
      organizationId: user.organizationId,
      role: user.role,
    };
    return this.metricsService.getHeatmapCellDetails(authCtx, likelihood, impact);
  }
}
