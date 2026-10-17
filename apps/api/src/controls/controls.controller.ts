import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards, UseInterceptors, UploadedFile, NotFoundException, BadRequestException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ControlsService } from './controls.service';
import { ControlImportService } from './control-import.service';
import { MappingQueueService } from './ai/mapping-queue.service';
import { RiskControlsService } from '../risk-controls/risk-controls.service';
import { EvidenceService } from '../evidence/evidence.service';
import { BusinessAuditsService } from '../business-audits/business-audits.service';
import { AssociateRiskControlDto, RiskControlQueryDto } from '../risk-controls/dto/risk-controls.dto';
import {
  CreateControlDto,
  UpdateControlDto,
  ControlQueryDto,
  SignOffMappingDto,
  CreateControlMappingDto,
  SuggestMappingsDto,
  AttachControlEvidenceDto,
  ControlEvidenceQueryDto,
  CreateControlTestDto,
  ControlTestQueryDto,
  AnalyzeControlsImportQueryDto,
  PersistImportedControlsDto,
} from './dto/controls.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Role, JwtPayload, MappingJobStatusDto } from '@omnigrc/shared';
import { RequiresActiveLicense } from '../common/decorators/requires-active-license.decorator';
import { ResourceAuthContext } from '../auth/resource-authorization.service';
import { RequireCapability } from '../common/decorators/require-capability.decorator';

@Controller('controls')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.ANALYST, Role.EXTERNAL_AUDITOR, Role.MSSP_ADMIN, Role.MSSP_ANALYST)
@RequireCapability('GRC_CORE_CONTROLS')
export class ControlsController {
  constructor(
    private readonly controlsService: ControlsService,
    private readonly controlImportService: ControlImportService,
    private readonly mappingQueueService: MappingQueueService,
    private readonly riskControlsService: RiskControlsService,
    private readonly evidenceService: EvidenceService,
    private readonly businessAuditsService: BusinessAuditsService,
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

  @Post('import/analyze')
  @RequiresActiveLicense()
  @Roles(Role.ADMIN, Role.ANALYST, Role.MSSP_ADMIN, Role.MSSP_ANALYST)
  @UseInterceptors(FileInterceptor('file'))
  async analyzeImport(
    @CurrentUser() user: any,
    @UploadedFile() file: any,
    @Query() query: AnalyzeControlsImportQueryDto,
  ) {
    const authCtx: ResourceAuthContext = {
      userId: user.userId || user.id || user.sub,
      organizationId: user.organizationId,
      role: user.role,
    };
    return this.controlImportService.analyzeImportFile(
      authCtx,
      file,
      query.frameworkId,
      query.frameworkVersionId,
    );
  }

  @Post('import/persist')
  @RequiresActiveLicense()
  @Roles(Role.ADMIN, Role.ANALYST, Role.MSSP_ADMIN, Role.MSSP_ANALYST)
  async persistImport(
    @CurrentUser() user: any,
    @Body() dto: PersistImportedControlsDto,
  ) {
    const authCtx: ResourceAuthContext = {
      userId: user.userId || user.id || user.sub,
      organizationId: user.organizationId,
      role: user.role,
    };
    return this.controlImportService.persistImportedControls(authCtx, dto);
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

  @Post(':id/mappings')
  @RequiresActiveLicense()
  @Roles(Role.ADMIN, Role.ANALYST, Role.MSSP_ADMIN, Role.MSSP_ANALYST)
  async createMapping(
    @CurrentUser() user: any,
    @Param('id') controlId: string,
    @Body() dto: CreateControlMappingDto,
  ) {
    const authCtx: ResourceAuthContext = {
      userId: user.userId || user.id || user.sub,
      organizationId: user.organizationId,
      role: user.role,
    };
    return this.controlsService.createMapping(authCtx, controlId, dto);
  }

  @Post(':id/suggest-mappings')
  @RequiresActiveLicense()
  @Roles(Role.ADMIN, Role.ANALYST, Role.MSSP_ADMIN, Role.MSSP_ANALYST)
  @RequireCapability('AI_CONTROL_MAPPING')
  async suggestMappings(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto?: SuggestMappingsDto,
  ) {
    const authCtx: ResourceAuthContext = {
      userId: user.userId || user.id || user.sub,
      organizationId: user.organizationId,
      role: user.role,
    };
    await this.controlsService.findOne(authCtx, id);

    const jobId = await this.mappingQueueService.enqueueMappingJob(
      user.organizationId,
      user.sub || user.userId,
      id,
      dto,
    );

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

  @Patch(':id/mappings/:mappingId')
  @RequiresActiveLicense()
  @Roles(Role.ADMIN, Role.ANALYST, Role.MSSP_ADMIN, Role.MSSP_ANALYST)
  async patchSignOffMapping(
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

  @Get(':id/risks')
  @Roles(Role.ADMIN, Role.ANALYST, Role.EXTERNAL_AUDITOR, Role.MSSP_ADMIN, Role.MSSP_ANALYST)
  async getRisks(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Query() query: RiskControlQueryDto,
  ) {
    const authCtx: ResourceAuthContext = {
      userId: user.userId || user.id || user.sub,
      organizationId: user.organizationId,
      role: user.role,
    };
    return this.riskControlsService.getRisksForControl(authCtx, id, query);
  }

  @Post(':id/risks')
  @RequiresActiveLicense()
  @Roles(Role.ADMIN, Role.ANALYST, Role.MSSP_ADMIN, Role.MSSP_ANALYST)
  @RequireCapability(['GRC_CORE_CONTROLS', 'GRC_CORE_RISKS'])
  async associateRisk(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: AssociateRiskControlDto,
  ) {
    const authCtx: ResourceAuthContext = {
      userId: user.userId || user.id || user.sub,
      organizationId: user.organizationId,
      role: user.role,
    };
    const riskId = dto.riskId;
    if (!riskId) {
      throw new BadRequestException('riskId is required in request body');
    }
    return this.riskControlsService.associate(authCtx, riskId, id, dto);
  }

  @Delete(':id/risks/:riskId')
  @RequiresActiveLicense()
  @Roles(Role.ADMIN, Role.ANALYST, Role.MSSP_ADMIN, Role.MSSP_ANALYST)
  @RequireCapability(['GRC_CORE_CONTROLS', 'GRC_CORE_RISKS'])
  async disassociateRisk(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Param('riskId') riskId: string,
  ) {
    const authCtx: ResourceAuthContext = {
      userId: user.userId || user.id || user.sub,
      organizationId: user.organizationId,
      role: user.role,
    };
    return this.riskControlsService.disassociate(authCtx, riskId, id);
  }

  @Get(':id/evidence')
  @Roles(Role.ADMIN, Role.ANALYST, Role.EXTERNAL_AUDITOR, Role.MSSP_ADMIN, Role.MSSP_ANALYST)
  async getEvidence(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Query() query: ControlEvidenceQueryDto,
  ) {
    const authCtx: ResourceAuthContext = {
      userId: user.userId || user.id || user.sub,
      organizationId: user.organizationId,
      role: user.role,
    };
    return this.evidenceService.getEvidenceForControl(authCtx, id, query);
  }

  @Post(':id/evidence')
  @RequiresActiveLicense()
  @Roles(Role.ADMIN, Role.ANALYST, Role.MSSP_ADMIN, Role.MSSP_ANALYST)
  @RequireCapability(['GRC_CORE_CONTROLS', 'EVIDENCE_VAULT'])
  async attachEvidence(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: AttachControlEvidenceDto,
  ) {
    const authCtx: ResourceAuthContext = {
      userId: user.userId || user.id || user.sub,
      organizationId: user.organizationId,
      role: user.role,
    };
    if (!dto.evidenceId) {
      throw new BadRequestException('evidenceId is required in request body');
    }
    return this.evidenceService.attachEvidence(authCtx, dto.evidenceId, 'CONTROL', id);
  }

  @Delete(':id/evidence/:evidenceId')
  @RequiresActiveLicense()
  @Roles(Role.ADMIN, Role.ANALYST, Role.MSSP_ADMIN, Role.MSSP_ANALYST)
  @RequireCapability(['GRC_CORE_CONTROLS', 'EVIDENCE_VAULT'])
  async detachEvidence(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Param('evidenceId') evidenceId: string,
  ) {
    const authCtx: ResourceAuthContext = {
      userId: user.userId || user.id || user.sub,
      organizationId: user.organizationId,
      role: user.role,
    };
    return this.evidenceService.detachEvidence(authCtx, evidenceId, 'CONTROL', id);
  }

  @Get(':id/tests')
  @Roles(Role.ADMIN, Role.ANALYST, Role.EXTERNAL_AUDITOR, Role.MSSP_ADMIN, Role.MSSP_ANALYST)
  async getTests(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Query() query: ControlTestQueryDto,
  ) {
    const authCtx: ResourceAuthContext = {
      userId: user.userId || user.id || user.sub,
      organizationId: user.organizationId,
      role: user.role,
    };
    return this.businessAuditsService.getTestsForControl(authCtx, id, query);
  }

  @Post(':id/tests')
  @RequiresActiveLicense()
  @Roles(Role.ADMIN, Role.ANALYST, Role.MSSP_ADMIN, Role.MSSP_ANALYST)
  @RequireCapability(['GRC_CORE_CONTROLS', 'BUSINESS_AUDITS'])
  async createTest(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: CreateControlTestDto,
  ) {
    const authCtx: ResourceAuthContext = {
      userId: user.userId || user.id || user.sub,
      organizationId: user.organizationId,
      role: user.role,
    };
    return this.businessAuditsService.createCheckItemForControl(authCtx, id, dto);
  }
}
