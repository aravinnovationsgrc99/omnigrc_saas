import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { RisksService } from './risks.service';
import { CreateRiskDto, UpdateRiskDto, RiskQueryDto } from './dto/risks.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Role } from '@omnigrc/shared';
import { RequiresActiveLicense } from '../common/decorators/requires-active-license.decorator';
import { ResourceAuthContext } from '../auth/resource-authorization.service';

@Controller('risks')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.ANALYST, Role.EXTERNAL_AUDITOR, Role.MSSP_ADMIN, Role.MSSP_ANALYST)
export class RisksController {
  constructor(private readonly risksService: RisksService) {}

  @Get()
  async findAll(
    @CurrentUser() user: any,
    @Query() query: RiskQueryDto,
  ) {
    const authCtx: ResourceAuthContext = {
      userId: user.userId || user.id,
      organizationId: user.organizationId,
      role: user.role,
    };
    return this.risksService.findAll(authCtx, query);
  }

  @Get('open-count')
  async getOpenCount(@CurrentUser() user: any) {
    const authCtx: ResourceAuthContext = {
      userId: user.userId || user.id,
      organizationId: user.organizationId,
      role: user.role,
    };
    return this.risksService.getOpenCount(authCtx);
  }

  @Get('heatmap-summary')
  async getHeatmapSummary(@CurrentUser() user: any) {
    const authCtx: ResourceAuthContext = {
      userId: user.userId || user.id,
      organizationId: user.organizationId,
      role: user.role,
    };
    return this.risksService.getHeatmapSummary(authCtx);
  }

  @Get(':id')
  async findOne(
    @CurrentUser() user: any,
    @Param('id') id: string,
  ) {
    const authCtx: ResourceAuthContext = {
      userId: user.userId || user.id,
      organizationId: user.organizationId,
      role: user.role,
    };
    return this.risksService.findOne(authCtx, id);
  }

  @Get(':id/audit-log')
  async getAuditLogs(
    @CurrentUser() user: any,
    @Param('id') id: string,
  ) {
    const authCtx: ResourceAuthContext = {
      userId: user.userId || user.id,
      organizationId: user.organizationId,
      role: user.role,
    };
    return this.risksService.getAuditLogs(authCtx, id);
  }

  @Post()
  @RequiresActiveLicense()
  @Roles(Role.ADMIN, Role.ANALYST, Role.MSSP_ADMIN, Role.MSSP_ANALYST)
  async create(
    @CurrentUser() user: any,
    @Body() dto: CreateRiskDto,
  ) {
    const authCtx: ResourceAuthContext = {
      userId: user.userId || user.id,
      organizationId: user.organizationId,
      role: user.role,
    };
    return this.risksService.create(authCtx, dto);
  }

  @Patch(':id')
  @RequiresActiveLicense()
  @Roles(Role.ADMIN, Role.ANALYST, Role.MSSP_ADMIN, Role.MSSP_ANALYST)
  async update(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: UpdateRiskDto,
  ) {
    const authCtx: ResourceAuthContext = {
      userId: user.userId || user.id,
      organizationId: user.organizationId,
      role: user.role,
    };
    return this.risksService.update(authCtx, id, dto);
  }

  @Delete(':id')
  @RequiresActiveLicense()
  @Roles(Role.ADMIN, Role.ANALYST, Role.MSSP_ADMIN, Role.MSSP_ANALYST)
  async softDelete(
    @CurrentUser() user: any,
    @Param('id') id: string,
  ) {
    const authCtx: ResourceAuthContext = {
      userId: user.userId || user.id,
      organizationId: user.organizationId,
      role: user.role,
    };
    return this.risksService.softDelete(authCtx, id);
  }
}
