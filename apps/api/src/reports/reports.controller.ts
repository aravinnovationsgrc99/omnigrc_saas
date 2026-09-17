import { Controller, Get, Param, Query, UseGuards, Res } from '@nestjs/common';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequiresActiveLicense } from '../common/decorators/requires-active-license.decorator';
import { ReportsService } from './reports.service';
import { ReportQueryDto, ReportResponseDto, ReportType } from '@omnigrc/shared';

@Controller('reports')
@UseGuards(JwtAuthGuard)
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get()
  async getReportDefinitions() {
    return this.reportsService.getReportDefinitions();
  }

  @Get(':reportType')
  async getReport(
    @CurrentUser('organizationId') organizationId: string,
    @Param('reportType') reportType: ReportType,
    @Query() query: ReportQueryDto,
  ): Promise<ReportResponseDto> {
    return this.reportsService.getReport(organizationId, reportType, query, false);
  }

  @Get(':reportType/export')
  @RequiresActiveLicense()
  async exportReport(
    @CurrentUser('organizationId') organizationId: string,
    @CurrentUser('id') userId: string,
    @Param('reportType') reportType: ReportType,
    @Query() query: ReportQueryDto,
    @Res() res: Response,
  ) {
    const { buffer, filename, contentType } = await this.reportsService.exportReport(
      organizationId,
      userId,
      reportType,
      query,
    );

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  }
}
