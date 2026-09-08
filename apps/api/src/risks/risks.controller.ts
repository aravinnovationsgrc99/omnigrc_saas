import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { RisksService } from './risks.service';
import { CreateRiskDto, UpdateRiskDto, RiskQueryDto } from './dto/risks.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Role } from '@omnigrc/shared';

@Controller('risks')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.ANALYST)
export class RisksController {
  constructor(private readonly risksService: RisksService) {}

  @Get()
  async findAll(
    @CurrentUser('organizationId') organizationId: string,
    @Query() query: RiskQueryDto,
  ) {
    return this.risksService.findAll(organizationId, query);
  }

  @Get('open-count')
  async getOpenCount(@CurrentUser('organizationId') organizationId: string) {
    return this.risksService.getOpenCount(organizationId);
  }

  @Get('heatmap-summary')
  async getHeatmapSummary(@CurrentUser('organizationId') organizationId: string) {
    return this.risksService.getHeatmapSummary(organizationId);
  }

  @Get(':id')
  async findOne(
    @CurrentUser('organizationId') organizationId: string,
    @Param('id') id: string,
  ) {
    return this.risksService.findOne(organizationId, id);
  }

  @Get(':id/audit-log')
  async getAuditLogs(
    @CurrentUser('organizationId') organizationId: string,
    @Param('id') id: string,
  ) {
    return this.risksService.getAuditLogs(organizationId, id);
  }

  @Post()
  async create(
    @CurrentUser('organizationId') organizationId: string,
    @CurrentUser('userId') userId: string,
    @Body() dto: CreateRiskDto,
  ) {
    return this.risksService.create(organizationId, userId, dto);
  }

  @Patch(':id')
  async update(
    @CurrentUser('organizationId') organizationId: string,
    @CurrentUser('userId') userId: string,
    @Param('id') id: string,
    @Body() dto: UpdateRiskDto,
  ) {
    return this.risksService.update(organizationId, userId, id, dto);
  }

  @Delete(':id')
  async softDelete(
    @CurrentUser('organizationId') organizationId: string,
    @CurrentUser('userId') userId: string,
    @Param('id') id: string,
  ) {
    return this.risksService.softDelete(organizationId, userId, id);
  }
}
