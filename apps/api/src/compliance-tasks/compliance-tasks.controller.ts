import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ComplianceTasksService } from './compliance-tasks.service';
import { CreateComplianceTaskDto, UpdateComplianceTaskDto, UpdateTaskStatusDto, ComplianceTaskQueryDto } from './dto/compliance-tasks.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtPayload } from '@omnigrc/shared';

@Controller('compliance-tasks')
@UseGuards(JwtAuthGuard)
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
  async create(@CurrentUser() user: JwtPayload, @Body() dto: CreateComplianceTaskDto) {
    return this.complianceTasksService.create(user.organizationId, user.sub, dto);
  }

  @Patch(':id')
  async update(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Body() dto: UpdateComplianceTaskDto) {
    return this.complianceTasksService.update(user.organizationId, user.sub, id, dto);
  }

  @Patch(':id/status')
  async updateStatus(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Body() dto: UpdateTaskStatusDto) {
    return this.complianceTasksService.updateStatus(user.organizationId, user.sub, id, dto.status);
  }

  @Delete(':id')
  async softDelete(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.complianceTasksService.softDelete(user.organizationId, user.sub, id);
  }
}
