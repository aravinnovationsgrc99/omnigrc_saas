import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { MetricsService } from './metrics.service';
import { OverviewMetricsDto } from '@omnigrc/shared';

@Controller('metrics')
@UseGuards(JwtAuthGuard)
export class MetricsController {
  constructor(private readonly metricsService: MetricsService) {}

  @Get('overview')
  async getOverviewMetrics(
    @CurrentUser('organizationId') organizationId: string,
  ): Promise<OverviewMetricsDto> {
    return this.metricsService.getOverviewMetrics(organizationId);
  }
}
