import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards, NotFoundException } from '@nestjs/common';
import { ControlsService } from './controls.service';
import { MappingQueueService } from './ai/mapping-queue.service';
import { CreateControlDto, UpdateControlDto, ControlQueryDto, SignOffMappingDto } from './dto/controls.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Role, JwtPayload, MappingJobStatusDto } from '@omnigrc/shared';
import { RequiresActiveLicense } from '../common/decorators/requires-active-license.decorator';
import { ResourceAuthContext } from '../auth/resource-authorization.service';

@Controller('controls')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.ANALYST, Role.EXTERNAL_AUDITOR, Role.MSSP_ADMIN, Role.MSSP_ANALYST)
export class ControlsController {
  constructor(
    private readonly controlsService: ControlsService,
    private readonly mappingQueueService: MappingQueueService,
  ) {}

  @Get()
  async findAll(@CurrentUser() user: any, @Query() query: ControlQueryDto) {
    const authCtx: ResourceAuthContext = {
      userId: user.userId || user.id || user.sub,
      organizationId: user.organizationId,
      role: user.role,
    };
    return this.controlsService.findAll(authCtx, query);
  }

  @Get('approved-count')
  async getApprovedCount(@CurrentUser() user: any) {
    const authCtx: ResourceAuthContext = {
      userId: user.userId || user.id || user.sub,
      organizationId: user.organizationId,
      role: user.role,
    };
    return this.controlsService.getApprovedCount(authCtx);
  }

  @Get('framework-clauses')
  async getAllFrameworkClauses(@CurrentUser() user: any) {
    return this.controlsService.getAllFrameworkClauses(user.organizationId);
  }

  @Get('frameworks')
  async getFrameworks(@CurrentUser() user: any) {
    return this.controlsService.getFrameworks(user.organizationId);
  }

  @Get(':id')
  async findOne(@CurrentUser() user: any, @Param('id') id: string) {
    const authCtx: ResourceAuthContext = {
      userId: user.userId || user.id || user.sub,
      organizationId: user.organizationId,
      role: user.role,
    };
    return this.controlsService.findOne(authCtx, id);
  }

  @Get(':id/audit-log')
  async getAuditLogs(@CurrentUser() user: any, @Param('id') id: string) {
    const authCtx: ResourceAuthContext = {
      userId: user.userId || user.id || user.sub,
      organizationId: user.organizationId,
      role: user.role,
    };
    return this.controlsService.getAuditLogs(authCtx, id);
  }

  @Post()
  @RequiresActiveLicense()
  @Roles(Role.ADMIN, Role.ANALYST, Role.MSSP_ADMIN, Role.MSSP_ANALYST)
  async create(@CurrentUser() user: any, @Body() dto: CreateControlDto) {
    const authCtx: ResourceAuthContext = {
      userId: user.userId || user.id || user.sub,
      organizationId: user.organizationId,
      role: user.role,
    };
    return this.controlsService.create(authCtx, dto);
  }

  @Patch(':id')
  @RequiresActiveLicense()
  @Roles(Role.ADMIN, Role.ANALYST, Role.MSSP_ADMIN, Role.MSSP_ANALYST)
  async update(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: UpdateControlDto) {
    const authCtx: ResourceAuthContext = {
      userId: user.userId || user.id || user.sub,
      organizationId: user.organizationId,
      role: user.role,
    };
    return this.controlsService.update(authCtx, id, dto);
  }

  @Delete(':id')
  @RequiresActiveLicense()
  @Roles(Role.ADMIN, Role.ANALYST, Role.MSSP_ADMIN, Role.MSSP_ANALYST)
  async softDelete(@CurrentUser() user: any, @Param('id') id: string) {
    const authCtx: ResourceAuthContext = {
      userId: user.userId || user.id || user.sub,
      organizationId: user.organizationId,
      role: user.role,
    };
    return this.controlsService.softDelete(authCtx, id);
  }

  @Post(':id/suggest-mappings')
  @RequiresActiveLicense()
  @Roles(Role.ADMIN, Role.ANALYST, Role.MSSP_ADMIN, Role.MSSP_ANALYST)
  async suggestMappings(@CurrentUser() user: any, @Param('id') id: string) {
    const authCtx: ResourceAuthContext = {
      userId: user.userId || user.id || user.sub,
      organizationId: user.organizationId,
      role: user.role,
    };
    await this.controlsService.findOne(authCtx, id);

    const jobId = await this.mappingQueueService.enqueueMappingJob(user.organizationId, user.sub || user.userId, id);

    return {
      jobId,
      status: 'queued',
      message: 'AI Mapping suggestion job enqueued successfully.',
    };
  }

  @Get(':id/mapping-jobs/:jobId')
  async getJobStatus(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Param('jobId') jobId: string,
  ): Promise<MappingJobStatusDto> {
    const jobState = this.mappingQueueService.getJobState(jobId);
    if (!jobState) {
      throw new NotFoundException(`Mapping job "${jobId}" not found`);
    }
    return jobState;
  }

  @Post(':id/mappings/:mappingId/sign-off')
  @RequiresActiveLicense()
  @Roles(Role.ADMIN, Role.ANALYST, Role.MSSP_ADMIN, Role.MSSP_ANALYST)
  async signOffMapping(
    @CurrentUser() user: any,
    @Param('id') controlId: string,
    @Param('mappingId') mappingId: string,
    @Body() dto: SignOffMappingDto,
  ) {
    const authCtx: ResourceAuthContext = {
      userId: user.userId || user.id || user.sub,
      organizationId: user.organizationId,
      role: user.role,
    };
    return this.controlsService.signOffMapping(authCtx, controlId, mappingId, dto);
  }
}
