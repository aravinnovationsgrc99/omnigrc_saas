import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ControlsService } from './controls.service';
import { MappingQueueService } from './ai/mapping-queue.service';
import { CreateControlDto, UpdateControlDto, ControlQueryDto, SignOffMappingDto } from './dto/controls.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Role, JwtPayload, MappingJobStatusDto } from '@omnigrc/shared';
import { RequiresActiveLicense } from '../common/decorators/requires-active-license.decorator';

@Controller('controls')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.ANALYST)
export class ControlsController {
  constructor(
    private readonly controlsService: ControlsService,
    private readonly mappingQueueService: MappingQueueService,
  ) {}

  @Get()
  async findAll(@CurrentUser() user: JwtPayload, @Query() query: ControlQueryDto) {
    return this.controlsService.findAll(user.organizationId, query);
  }

  @Get('approved-count')
  async getApprovedCount(@CurrentUser() user: JwtPayload) {
    return this.controlsService.getApprovedCount(user.organizationId);
  }

  @Get('framework-clauses')
  async getAllFrameworkClauses() {
    return this.controlsService.getAllFrameworkClauses();
  }

  @Get('frameworks')
  async getFrameworks() {
    return this.controlsService.getFrameworks();
  }

  @Get(':id')
  async findOne(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.controlsService.findOne(user.organizationId, id);
  }

  @Get(':id/audit-log')
  async getAuditLogs(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.controlsService.getAuditLogs(user.organizationId, id);
  }

  @Post()
  @RequiresActiveLicense()
  async create(@CurrentUser() user: JwtPayload, @Body() dto: CreateControlDto) {
    const userId = (user as any).id || (user as any).userId || user.sub;
    return this.controlsService.create(user.organizationId, userId, dto);
  }

  @Patch(':id')
  @RequiresActiveLicense()
  async update(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Body() dto: UpdateControlDto) {
    const userId = (user as any).id || (user as any).userId || user.sub;
    return this.controlsService.update(user.organizationId, userId, id, dto);
  }

  @Delete(':id')
  @RequiresActiveLicense()
  async softDelete(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    const userId = (user as any).id || (user as any).userId || user.sub;
    return this.controlsService.softDelete(user.organizationId, userId, id);
  }

  /**
   * Stage 1: Enqueue async AI job, return jobId immediately
   */
  @Post(':id/suggest-mappings')
  @RequiresActiveLicense()
  async suggestMappings(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    // Verify control exists first
    await this.controlsService.findOne(user.organizationId, id);

    const jobId = await this.mappingQueueService.enqueueMappingJob(user.organizationId, user.sub, id);

    return {
      jobId,
      status: 'queued',
      message: 'AI Mapping suggestion job enqueued successfully.',
    };
  }

  /**
   * Stage 3: Poll endpoint for job status
   */
  @Get(':id/mapping-jobs/:jobId')
  async getJobStatus(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Param('jobId') jobId: string,
  ): Promise<MappingJobStatusDto> {
    const jobState = this.mappingQueueService.getJobState(jobId);

    if (!jobState) {
      return {
        jobId,
        status: 'failed',
        error: 'Job not found or expired',
      };
    }

    if (jobState.status === 'done') {
      const control = await this.controlsService.findOne(user.organizationId, id);
      return {
        jobId,
        status: 'done',
        progress: 100,
        mappings: control.mappings,
      };
    }

    return {
      jobId,
      status: jobState.status,
      progress: jobState.progress,
      error: jobState.error,
    };
  }

  /**
   * Stage 4: Human sign-off: APPROVE or OVERRIDE
   */
  @Patch(':id/mappings/:mappingId')
  @RequiresActiveLicense()
  async signOffMapping(
    @CurrentUser() user: JwtPayload,
    @Param('id') controlId: string,
    @Param('mappingId') mappingId: string,
    @Body() dto: SignOffMappingDto,
  ) {
    return this.controlsService.signOffMapping(user.organizationId, user.sub, controlId, mappingId, dto);
  }
}

