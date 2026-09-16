import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ComplianceTasksService } from './compliance-tasks.service';
import { CreateComplianceTaskDto, UpdateComplianceTaskDto, UpdateTaskStatusDto, ComplianceTaskQueryDto } from './dto/compliance-tasks.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Role, JwtPayload } from '@omnigrc/shared';
import { RequiresActiveLicense } from '../common/decorators/requires-active-license.decorator';

@Controller('compliance-tasks')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.ANALYST)
export class ComplianceTasksController {
  constructor(private readonly complianceTasksService: ComplianceTasksService) {}

  @Get()
  async findAll(@CurrentUser() user: JwtPayload, @Query() query: ComplianceTaskQueryDto) {
    return this.complianceTasksService.findAll(user.organizationId, query);
  }

  @Get('dashboard-summary')
  async getDashboardSummary(@CurrentUser() user: JwtPayload) {
    return this.complianceTasksService.getDashboardSummary(user.organizationId);
  }

  @Get('due-this-week-count')
  async getDueThisWeekCount(@CurrentUser() user: JwtPayload) {
    return this.complianceTasksService.getDueThisWeekCount(user.organizationId);
  }

  @Get(':id')
  async findOne(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.complianceTasksService.findOne(user.organizationId, id);
  }

  @Get(':id/audit-log')
  async getAuditLogs(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.complianceTasksService.getAuditLogs(user.organizationId, id);
  }

  @Post()
  @RequiresActiveLicense()
  async create(@CurrentUser() user: JwtPayload, @Body() dto: CreateComplianceTaskDto) {
    const userId = (user as any).id || (user as any).userId || user.sub;
    return this.complianceTasksService.create(user.organizationId, userId, dto);
  }

  @Patch(':id')
  @RequiresActiveLicense()
  async update(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Body() dto: UpdateComplianceTaskDto) {
    const userId = (user as any).id || (user as any).userId || user.sub;
    return this.complianceTasksService.update(user.organizationId, userId, id, dto);
  }

  @Patch(':id/status')
  @RequiresActiveLicense()
  async updateStatus(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Body() dto: UpdateTaskStatusDto) {
    const userId = (user as any).id || (user as any).userId || user.sub;
    return this.complianceTasksService.updateStatus(user.organizationId, userId, id, dto.status);
  }

  @Delete(':id')
  @RequiresActiveLicense()
  async softDelete(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    const userId = (user as any).id || (user as any).userId || user.sub;
    return this.complianceTasksService.softDelete(user.organizationId, userId, id);
  }
}

