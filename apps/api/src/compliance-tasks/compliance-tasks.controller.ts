import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ComplianceTasksService } from './compliance-tasks.service';
import { CreateComplianceTaskDto, UpdateComplianceTaskDto, UpdateTaskStatusDto, ComplianceTaskQueryDto } from './dto/compliance-tasks.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Role } from '@omnigrc/shared';
import { RequiresActiveLicense } from '../common/decorators/requires-active-license.decorator';
import { ResourceAuthContext } from '../auth/resource-authorization.service';

@Controller('compliance-tasks')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.ANALYST, Role.EXTERNAL_AUDITOR, Role.MSSP_ADMIN, Role.MSSP_ANALYST)
export class ComplianceTasksController {
  constructor(private readonly complianceTasksService: ComplianceTasksService) {}

  @Get()
  async findAll(@CurrentUser() user: any, @Query() query: ComplianceTaskQueryDto) {
    const authCtx: ResourceAuthContext = {
      userId: user.userId,
      organizationId: user.organizationId,
      role: user.role,
    };
    return this.complianceTasksService.findAll(authCtx, query);
  }

  @Get('dashboard-summary')
  async getDashboardSummary(@CurrentUser() user: any) {
    const authCtx: ResourceAuthContext = {
      userId: user.userId,
      organizationId: user.organizationId,
      role: user.role,
    };
    return this.complianceTasksService.getDashboardSummary(authCtx);
  }

  @Get('due-this-week-count')
  async getDueThisWeekCount(@CurrentUser() user: any) {
    const authCtx: ResourceAuthContext = {
      userId: user.userId,
      organizationId: user.organizationId,
      role: user.role,
    };
    return this.complianceTasksService.getDueThisWeekCount(authCtx);
  }

  @Get(':id')
  async findOne(@CurrentUser() user: any, @Param('id') id: string) {
    const authCtx: ResourceAuthContext = {
      userId: user.userId,
      organizationId: user.organizationId,
      role: user.role,
    };
    return this.complianceTasksService.findOne(authCtx, id);
  }

  @Get(':id/audit-log')
  async getAuditLogs(@CurrentUser() user: any, @Param('id') id: string) {
    const authCtx: ResourceAuthContext = {
      userId: user.userId,
      organizationId: user.organizationId,
      role: user.role,
    };
    return this.complianceTasksService.getAuditLogs(authCtx, id);
  }

  @Post()
  @RequiresActiveLicense()
  @Roles(Role.ADMIN, Role.ANALYST, Role.MSSP_ADMIN, Role.MSSP_ANALYST)
  async create(@CurrentUser() user: any, @Body() dto: CreateComplianceTaskDto) {
    const authCtx: ResourceAuthContext = {
      userId: user.userId,
      organizationId: user.organizationId,
      role: user.role,
    };
    return this.complianceTasksService.create(authCtx, dto);
  }

  @Patch(':id')
  @RequiresActiveLicense()
  @Roles(Role.ADMIN, Role.ANALYST, Role.MSSP_ADMIN, Role.MSSP_ANALYST)
  async update(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: UpdateComplianceTaskDto) {
    const authCtx: ResourceAuthContext = {
      userId: user.userId,
      organizationId: user.organizationId,
      role: user.role,
    };
    return this.complianceTasksService.update(authCtx, id, dto);
  }

  @Patch(':id/status')
  @RequiresActiveLicense()
  @Roles(Role.ADMIN, Role.ANALYST, Role.MSSP_ADMIN, Role.MSSP_ANALYST)
  async updateStatus(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: UpdateTaskStatusDto) {
    const authCtx: ResourceAuthContext = {
      userId: user.userId,
      organizationId: user.organizationId,
      role: user.role,
    };
    return this.complianceTasksService.updateStatus(authCtx, id, dto.status);
  }

  @Delete(':id')
  @RequiresActiveLicense()
  @Roles(Role.ADMIN, Role.ANALYST, Role.MSSP_ADMIN, Role.MSSP_ANALYST)
  async softDelete(@CurrentUser() user: any, @Param('id') id: string) {
    const authCtx: ResourceAuthContext = {
      userId: user.userId,
      organizationId: user.organizationId,
      role: user.role,
    };
    return this.complianceTasksService.softDelete(authCtx, id);
  }
}
