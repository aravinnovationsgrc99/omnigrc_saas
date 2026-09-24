import { Controller, Get, Param, Query, UseGuards, Res } from '@nestjs/common';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Role } from '@omnigrc/shared';
import { RequiresActiveLicense } from '../common/decorators/requires-active-license.decorator';
import { ResourceAuthContext } from '../auth/resource-authorization.service';
import { ReportsService } from './reports.service';
import { ReportQueryDto, ReportResponseDto, ReportType } from '@omnigrc/shared';

@Controller('reports')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.ANALYST, Role.EXTERNAL_AUDITOR, Role.MSSP_ADMIN, Role.MSSP_ANALYST)
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get()
  async getReportDefinitions() {
    return this.reportsService.getReportDefinitions();
  }

  @Get(':reportType')
  async getReport(
    @CurrentUser() user: any,
    @Param('reportType') reportType: ReportType,
    @Query() query: ReportQueryDto,
  ): Promise<ReportResponseDto> {
    const authCtx: ResourceAuthContext = {
      userId: user.userId,
      organizationId: user.organizationId,
      role: user.role,
    };
    return this.reportsService.getReport(authCtx, reportType, query, false);
  }

  @Get(':reportType/export')
  @RequiresActiveLicense()
  async exportReport(
    @CurrentUser() user: any,
    @Param('reportType') reportType: ReportType,
    @Query() query: ReportQueryDto,
    @Res() res: Response,
  ) {
    const authCtx: ResourceAuthContext = {
      userId: user.userId,
      organizationId: user.organizationId,
      role: user.role,
    };
    const { buffer, filename, contentType } = await this.reportsService.exportReport(
      authCtx,
      reportType,
      query,
    );

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  }
}
