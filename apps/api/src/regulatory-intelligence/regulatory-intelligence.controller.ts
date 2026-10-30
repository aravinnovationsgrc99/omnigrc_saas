import {
  Controller,
  Get,
  Post,
  Patch,
  Put,
  Delete,
  Param,
  Query,
  Body,
  UseGuards,
  NotFoundException,
  BadRequestException,
  StreamableFile,
  Res,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Role } from '@omnigrc/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { RegulatoryCatalogueService } from './catalogue/regulatory-catalogue.service';
import { RegulatoryIngestionService } from './regulatory-ingestion.service';
import { RegulatoryDocumentStorageService } from './storage/regulatory-document-storage.service';
import { RegulatoryObligationService } from './obligations/regulatory-obligation.service';
import { RegulatoryApplicabilityService } from './applicability/regulatory-applicability.service';
import {
  QuerySourcesDto,
  QueryPublicationsDto,
  QueryCatalogueDto,
  ToggleSourceDto,
  CreateManualIntakeDto,
  ReviewManualIntakeDto,
} from './dto/regulatory.dto';
import {
  QueryObligationsDto,
  ExtractObligationsDto,
  ReviewObligationDto,
  CreateManualObligationDto,
} from './dto/obligation.dto';
import {
  AssessApplicabilityDto,
  QueryApplicabilityDto,
  ReviewApplicabilityDto,
  UpdateComplianceProfileDto,
} from './dto/applicability.dto';
import { ObligationControlMappingService } from './mappings/obligation-control-mapping.service';
import {
  CreateObligationMappingDto,
  SuggestMappingsDto,
  QueryObligationMappingsDto,
  ReviewObligationMappingDto,
} from './dto/obligation-mapping.dto';
import { RegulatoryControlGapService } from './gaps/regulatory-control-gap.service';
import {
  AssessControlGapDto,
  QueryControlGapDto,
  ReviewControlGapDto,
} from './dto/control-gap.dto';
import { RegulatoryRemediationService } from './remediation/regulatory-remediation.service';
import { RegulatoryImpactAnalysisService } from './ai/regulatory-impact-analysis.service';
import {
  TriggerImpactAnalysisDto,
  ReviewImpactAnalysisFindingDto,
} from './dto/regulatory-impact-analysis.dto';
import {
  CreateRemediationDto,
  AssignRemediationDto,
  UpdateRemediationStatusDto,
  RemediationApprovalDto,
  CompleteRemediationDto,
  VerifyRemediationDto,
  RiskAcceptRemediationDto,
  QueryRemediationDto,
} from './dto/remediation.dto';

@Controller('regulatory')
@UseGuards(JwtAuthGuard, RolesGuard)
export class RegulatoryIntelligenceController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly catalogueService: RegulatoryCatalogueService,
    private readonly ingestionService: RegulatoryIngestionService,
    private readonly documentStorage: RegulatoryDocumentStorageService,
    private readonly auditLogsService: AuditLogsService,
    private readonly obligationService: RegulatoryObligationService,
    private readonly applicabilityService: RegulatoryApplicabilityService,
    private readonly mappingService: ObligationControlMappingService,
    private readonly gapService: RegulatoryControlGapService,
    private readonly remediationService: RegulatoryRemediationService,
    private readonly impactAnalysisService: RegulatoryImpactAnalysisService,
  ) {}

  // ==========================================
  // 1. REGULATORY SOURCES
  // ==========================================

  @Get('sources')
  async listSources(@Query() query: QuerySourcesDto) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const skip = (page - 1) * limit;

    const where: any = {};
    if (query.regulatorCode) {
      where.regulatorCode = { equals: query.regulatorCode, mode: 'insensitive' };
    }
    if (query.isEnabled !== undefined) {
      where.isEnabled = query.isEnabled;
    }
    if (query.healthStatus) {
      where.healthStatus = query.healthStatus;
    }

    const [items, total] = await Promise.all([
      this.prisma.regulatorySource.findMany({
        where,
        orderBy: [{ isEnabled: 'desc' }, { regulatorCode: 'asc' }],
        skip,
        take: limit,
        include: {
          catalogueEntry: {
            select: {
              code: true,
              displayName: true,
              jurisdiction: true,
            },
          },
          _count: {
            select: { publications: true },
          },
        },
      }),
      this.prisma.regulatorySource.count({ where }),
    ]);

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }

  @Get('sources/:id')
  async getSource(@Param('id') id: string) {
    const source = await this.prisma.regulatorySource.findUnique({
      where: { id },
      include: {
        catalogueEntry: true,
        _count: {
          select: { publications: true },
        },
      },
    });

    if (!source) {
      throw new NotFoundException(`Regulatory source "${id}" not found.`);
    }

    return source;
  }

  @Post('sources/:id/sync')
  @Roles(Role.ADMIN, Role.MSSP_ADMIN)
  async triggerSourceSync(
    @Param('id') id: string,
    @CurrentUser('id') actorId: string,
    @CurrentUser('organizationId') organizationId: string,
  ) {
    return this.ingestionService.syncSource(id, {
      actorId,
      organizationId,
    });
  }

  @Patch('sources/:id/toggle')
  @Roles(Role.ADMIN, Role.MSSP_ADMIN)
  async toggleSource(
    @Param('id') id: string,
    @Body() dto: ToggleSourceDto,
    @CurrentUser('id') actorId: string,
    @CurrentUser('organizationId') organizationId: string,
  ) {
    const source = await this.prisma.regulatorySource.findUnique({
      where: { id },
    });

    if (!source) {
      throw new NotFoundException(`Regulatory source "${id}" not found.`);
    }

    const updated = await this.prisma.regulatorySource.update({
      where: { id },
      data: { isEnabled: dto.isEnabled },
    });

    try {
      await this.auditLogsService.log({
        organizationId,
        actorId,
        action: 'REGULATORY_SOURCE_TOGGLED',
        entityType: 'REGULATORY_SOURCE',
        entityId: id,
        metadata: {
          previousState: source.isEnabled,
          newState: dto.isEnabled,
          regulatorCode: source.regulatorCode,
        },
      });
    } catch {
      // Non-fatal audit log failure
    }

    return updated;
  }

  // ==========================================
  // 2. COVERAGE CATALOGUE
  // ==========================================

  @Get('catalogue')
  async listCatalogue(@Query() query: QueryCatalogueDto) {
    return this.catalogueService.findAll(query);
  }

  @Get('catalogue/:idOrCode')
  async getCatalogueEntry(@Param('idOrCode') idOrCode: string) {
    return this.catalogueService.findOne(idOrCode);
  }

  // ==========================================
  // 3. PUBLICATIONS & VERSION HISTORY
  // ==========================================

  @Get('publications')
  async listPublications(@Query() query: QueryPublicationsDto) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const skip = (page - 1) * limit;

    const where: any = {};

    if (query.sourceId) {
      where.sourceId = query.sourceId;
    }
    if (query.catalogueEntryId) {
      where.catalogueEntryId = query.catalogueEntryId;
    }
    if (query.search) {
      const s = query.search.trim();
      where.OR = [
        { title: { contains: s, mode: 'insensitive' } },
        { publicationNumber: { contains: s, mode: 'insensitive' } },
        { externalId: { contains: s, mode: 'insensitive' } },
      ];
    }
    if (query.startDate || query.endDate) {
      where.publicationDate = {};
      if (query.startDate) {
        where.publicationDate.gte = new Date(query.startDate);
      }
      if (query.endDate) {
        where.publicationDate.lte = new Date(query.endDate);
      }
    }

    const [items, total] = await Promise.all([
      this.prisma.regulatoryPublication.findMany({
        where,
        orderBy: [{ publicationDate: 'desc' }, { createdAt: 'desc' }],
        skip,
        take: limit,
        include: {
          source: {
            select: {
              regulatorCode: true,
              displayName: true,
            },
          },
          catalogueEntry: {
            select: {
              code: true,
              displayName: true,
              jurisdiction: true,
            },
          },
        },
      }),
      this.prisma.regulatoryPublication.count({ where }),
    ]);

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }

  @Get('publications/:id')
  async getPublication(@Param('id') id: string) {
    const publication = await this.prisma.regulatoryPublication.findUnique({
      where: { id },
      include: {
        source: true,
        catalogueEntry: true,
        versions: {
          orderBy: { versionNumber: 'desc' },
        },
      },
    });

    if (!publication) {
      throw new NotFoundException(`Regulatory publication "${id}" not found.`);
    }

    return publication;
  }

  @Post('publications/:id/ai-impact-analysis')
  @Roles(Role.ADMIN, Role.MSSP_ADMIN, Role.ANALYST)
  async generatePublicationImpactAnalysis(
    @Param('id') id: string,
    @Body() dto: TriggerImpactAnalysisDto,
    @CurrentUser('id') actorId: string,
    @CurrentUser('organizationId') organizationId: string,
  ) {
    if (!organizationId) {
      throw new BadRequestException('Organization context required for regulatory impact analysis.');
    }
    return this.impactAnalysisService.analyzePublicationImpact(id, organizationId, actorId, dto);
  }

  @Get('publications/:id/ai-impact-analysis')
  async getPublicationImpactAnalysis(
    @Param('id') id: string,
    @CurrentUser('organizationId') organizationId: string,
  ) {
    if (!organizationId) {
      throw new BadRequestException('Organization context required.');
    }
    return this.impactAnalysisService.getPublicationImpact(id, organizationId);
  }

  @Patch('publications/:id/ai-impact-analysis/review-finding')
  @Roles(Role.ADMIN, Role.MSSP_ADMIN, Role.ANALYST)
  async reviewImpactAnalysisFinding(
    @Param('id') id: string,
    @Body() dto: ReviewImpactAnalysisFindingDto,
    @CurrentUser('id') actorId: string,
    @CurrentUser('organizationId') organizationId: string,
  ) {
    if (!organizationId) {
      throw new BadRequestException('Organization context required.');
    }
    return this.impactAnalysisService.reviewFinding(id, organizationId, actorId, dto);
  }

  // ==========================================
  // 4. MANUAL INTAKE (Non-feed / standards documents)
  // ==========================================

  @Post('manual-intake')
  @Roles(Role.ADMIN, Role.MSSP_ADMIN, Role.ANALYST)
  async createManualIntake(
    @Body() dto: CreateManualIntakeDto,
    @CurrentUser('id') actorId: string,
    @CurrentUser('organizationId') organizationId: string,
  ) {
    if (!organizationId) {
      throw new BadRequestException('Organization context required for manual intake.');
    }

    const catalogueEntry = await this.prisma.regulatoryCatalogueEntry.findUnique({
      where: { id: dto.catalogueEntryId },
    });

    if (!catalogueEntry) {
      throw new NotFoundException(`Catalogue entry "${dto.catalogueEntryId}" not found.`);
    }

    let fileBuffer: Buffer;
    try {
      fileBuffer = Buffer.from(dto.fileContentBase64, 'base64');
    } catch {
      throw new BadRequestException('Invalid base64 encoding for document content.');
    }

    const saved = await this.documentStorage.saveDocument(
      {
        originalname: dto.fileName,
        buffer: fileBuffer,
        mimetype: dto.mimeType || 'application/octet-stream',
      },
      organizationId,
    );

    const intake = await this.prisma.manualSourceIntake.create({
      data: {
        organizationId,
        catalogueEntryId: dto.catalogueEntryId,
        title: dto.title,
        instrumentIdentifier: dto.instrumentIdentifier,
        sourceUrl: dto.sourceUrl,
        fileName: dto.fileName,
        fileSize: saved.fileSize,
        mimeType: saved.mimeType,
        checksum: saved.checksum,
        storageKey: saved.storageKey,
        uploadedById: actorId,
        provenanceNotes: dto.provenanceNotes,
      },
      include: {
        catalogueEntry: true,
      },
    });

    try {
      await this.auditLogsService.log({
        organizationId,
        actorId,
        action: 'MANUAL_REGULATORY_INTAKE_CREATED',
        entityType: 'MANUAL_SOURCE_INTAKE',
        entityId: intake.id,
        metadata: {
          title: intake.title,
          fileName: intake.fileName,
          checksum: intake.checksum,
          catalogueEntryCode: catalogueEntry.code,
        },
      });
    } catch {
      // Non-fatal audit log failure
    }

    return intake;
  }

  @Get('manual-intake')
  async listManualIntakes(
    @CurrentUser('organizationId') organizationId: string,
    @Query('catalogueEntryId') catalogueEntryId?: string,
  ) {
    const where: any = { organizationId };
    if (catalogueEntryId) {
      where.catalogueEntryId = catalogueEntryId;
    }

    return this.prisma.manualSourceIntake.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        catalogueEntry: {
          select: {
            code: true,
            displayName: true,
            jurisdiction: true,
          },
        },
      },
    });
  }

  @Get('manual-intake/:id')
  async getManualIntake(
    @Param('id') id: string,
    @CurrentUser('organizationId') organizationId: string,
  ) {
    const intake = await this.prisma.manualSourceIntake.findFirst({
      where: { id, organizationId },
      include: {
        catalogueEntry: true,
        publication: true,
      },
    });

    if (!intake) {
      throw new NotFoundException(`Manual intake record "${id}" not found.`);
    }

    return intake;
  }

  @Get('manual-intake/:id/file')
  async getManualIntakeFile(
    @Param('id') id: string,
    @CurrentUser('organizationId') organizationId: string,
    @Res({ passthrough: true }) res: any,
  ) {
    const intake = await this.prisma.manualSourceIntake.findFirst({
      where: { id, organizationId },
    });

    if (!intake) {
      throw new NotFoundException(`Manual intake record "${id}" not found.`);
    }

    const { stream } = this.documentStorage.getFileStream(intake.storageKey, organizationId);
    res.set({
      'Content-Type': intake.mimeType,
      'Content-Disposition': `attachment; filename="${intake.fileName}"`,
    });
    return new StreamableFile(stream);
  }

  @Patch('manual-intake/:id/review')
  @Roles(Role.ADMIN, Role.MSSP_ADMIN)
  async reviewManualIntake(
    @Param('id') id: string,
    @Body() dto: ReviewManualIntakeDto,
    @CurrentUser('id') actorId: string,
    @CurrentUser('organizationId') organizationId: string,
  ) {
    const intake = await this.prisma.manualSourceIntake.findFirst({
      where: { id, organizationId },
    });

    if (!intake) {
      throw new NotFoundException(`Manual intake record "${id}" not found.`);
    }

    const updated = await this.prisma.manualSourceIntake.update({
      where: { id },
      data: {
        reviewStatus: dto.status,
        reviewedById: actorId,
        reviewedAt: new Date(),
        reviewNotes: dto.reviewNotes,
      },
    });

    try {
      await this.auditLogsService.log({
        organizationId,
        actorId,
        action: 'MANUAL_REGULATORY_INTAKE_REVIEWED',
        entityType: 'MANUAL_SOURCE_INTAKE',
        entityId: id,
        metadata: {
          reviewStatus: dto.status,
          reviewNotes: dto.reviewNotes,
        },
      });
    } catch {
      // Non-fatal audit log failure
    }

    return updated;
  }

  // ==========================================
  // 5. REGULATORY OBLIGATIONS (PHASE 3)
  // ==========================================

  @Post('publications/:id/extract-obligations')
  @Roles(Role.ADMIN, Role.MSSP_ADMIN, Role.ANALYST)
  async extractPublicationObligations(
    @Param('id') id: string,
    @Body() dto: ExtractObligationsDto,
    @CurrentUser('id') actorId: string,
    @CurrentUser('organizationId') organizationId?: string,
  ) {
    return this.obligationService.extractCandidateObligations(
      id,
      actorId,
      organizationId,
      dto.forceReextract,
    );
  }

  @Get('obligations')
  async listObligations(
    @Query() query: QueryObligationsDto,
    @CurrentUser('organizationId') organizationId?: string,
  ) {
    return this.obligationService.listObligations(query, organizationId);
  }

  @Get('obligations/:id')
  async getObligation(
    @Param('id') id: string,
    @CurrentUser('organizationId') organizationId?: string,
  ) {
    return this.obligationService.getObligation(id, organizationId);
  }

  @Patch('obligations/:id/review')
  @Roles(Role.ADMIN, Role.MSSP_ADMIN, Role.ANALYST)
  async reviewObligation(
    @Param('id') id: string,
    @Body() dto: ReviewObligationDto,
    @CurrentUser('id') actorId: string,
    @CurrentUser('organizationId') organizationId?: string,
  ) {
    return this.obligationService.reviewObligation(id, dto, actorId, organizationId);
  }

  @Post('obligations/manual')
  @Roles(Role.ADMIN, Role.MSSP_ADMIN)
  async createManualObligation(
    @Body() dto: CreateManualObligationDto,
    @CurrentUser('id') actorId: string,
    @CurrentUser('organizationId') organizationId?: string,
  ) {
    return this.obligationService.createManualObligation(dto, actorId, organizationId);
  }

  // ==========================================
  // 6. REGULATORY APPLICABILITY ASSESSMENTS (PHASE 4)
  // ==========================================

  @Post('applicability/assess')
  @Roles(Role.ADMIN, Role.MSSP_ADMIN, Role.ANALYST)
  async triggerApplicabilityAssessment(
    @Body() dto: AssessApplicabilityDto,
    @CurrentUser('id') actorId: string,
    @CurrentUser('organizationId') organizationId: string,
  ) {
    if (!organizationId) {
      throw new BadRequestException('Authenticated organization context is required for applicability assessment.');
    }

    if (dto.obligationId) {
      return this.applicabilityService.assessObligation(
        organizationId,
        dto.obligationId,
        actorId,
        dto.forceReassess,
      );
    }

    return this.applicabilityService.assessAllForOrganization(
      organizationId,
      actorId,
      dto.catalogueEntryId,
      dto.forceReassess,
    );
  }

  @Get('applicability')
  async listApplicabilityAssessments(
    @Query() query: QueryApplicabilityDto,
    @CurrentUser('organizationId') organizationId: string,
  ) {
    if (!organizationId) {
      throw new BadRequestException('Authenticated organization context is required.');
    }
    return this.applicabilityService.listAssessments(organizationId, query);
  }

  @Get('applicability/:id')
  async getApplicabilityAssessment(
    @Param('id') id: string,
    @CurrentUser('organizationId') organizationId: string,
  ) {
    if (!organizationId) {
      throw new BadRequestException('Authenticated organization context is required.');
    }
    return this.applicabilityService.getAssessment(id, organizationId);
  }

  @Patch('applicability/:id/review')
  @Roles(Role.ADMIN, Role.MSSP_ADMIN, Role.ANALYST)
  async reviewApplicabilityAssessment(
    @Param('id') id: string,
    @Body() dto: ReviewApplicabilityDto,
    @CurrentUser('id') actorId: string,
    @CurrentUser('organizationId') organizationId: string,
  ) {
    if (!organizationId) {
      throw new BadRequestException('Authenticated organization context is required.');
    }
    return this.applicabilityService.reviewOrOverrideAssessment(id, organizationId, dto, actorId);
  }

  // ==========================================
  // 7. ORGANIZATION COMPLIANCE PROFILE (PHASE 4)
  // ==========================================

  @Get('organization-profile')
  async getOrganizationProfile(@CurrentUser('organizationId') organizationId: string) {
    if (!organizationId) {
      throw new BadRequestException('Authenticated organization context is required.');
    }
    return this.applicabilityService.getOrBuildProfile(organizationId);
  }

  @Put('organization-profile')
  @Roles(Role.ADMIN, Role.MSSP_ADMIN)
  async updateOrganizationProfile(
    @Body() dto: UpdateComplianceProfileDto,
    @CurrentUser('id') actorId: string,
    @CurrentUser('organizationId') organizationId: string,
  ) {
    if (!organizationId) {
      throw new BadRequestException('Authenticated organization context is required.');
    }
    return this.applicabilityService.updateProfile(organizationId, dto, actorId);
  }

  // ==========================================
  // 8. OBLIGATION-TO-CONTROL MAPPINGS (PHASE 5)
  // ==========================================

  @Post('mappings')
  @Roles(Role.ADMIN, Role.MSSP_ADMIN, Role.ANALYST)
  async createMapping(
    @Body() dto: CreateObligationMappingDto,
    @CurrentUser('id') actorId: string,
    @CurrentUser('organizationId') organizationId: string,
  ) {
    if (!organizationId) {
      throw new BadRequestException('Authenticated organization context is required.');
    }
    return this.mappingService.createMapping(organizationId, dto, actorId);
  }

  @Post('mappings/suggest')
  @Roles(Role.ADMIN, Role.MSSP_ADMIN, Role.ANALYST)
  async suggestMappings(
    @Body() dto: SuggestMappingsDto,
    @CurrentUser('id') actorId: string,
    @CurrentUser('organizationId') organizationId: string,
  ) {
    if (!organizationId) {
      throw new BadRequestException('Authenticated organization context is required.');
    }
    return this.mappingService.suggestMappings(organizationId, dto, actorId);
  }

  @Get('mappings')
  async listMappings(
    @Query() query: QueryObligationMappingsDto,
    @CurrentUser('organizationId') organizationId: string,
  ) {
    if (!organizationId) {
      throw new BadRequestException('Authenticated organization context is required.');
    }
    return this.mappingService.listMappings(organizationId, query);
  }

  @Get('mappings/coverage')
  async getMappingCoverage(@CurrentUser('organizationId') organizationId: string) {
    if (!organizationId) {
      throw new BadRequestException('Authenticated organization context is required.');
    }
    return this.mappingService.getMappingCoverage(organizationId);
  }

  @Get('mappings/:id')
  async getMapping(
    @Param('id') id: string,
    @CurrentUser('organizationId') organizationId: string,
  ) {
    if (!organizationId) {
      throw new BadRequestException('Authenticated organization context is required.');
    }
    return this.mappingService.getMapping(id, organizationId);
  }

  @Patch('mappings/:id/review')
  @Roles(Role.ADMIN, Role.MSSP_ADMIN, Role.ANALYST)
  async reviewMapping(
    @Param('id') id: string,
    @Body() dto: ReviewObligationMappingDto,
    @CurrentUser('id') actorId: string,
    @CurrentUser('organizationId') organizationId: string,
  ) {
    if (!organizationId) {
      throw new BadRequestException('Authenticated organization context is required.');
    }
    return this.mappingService.reviewOrOverrideMapping(id, organizationId, dto, actorId);
  }

  @Delete('mappings/:id')
  @Roles(Role.ADMIN, Role.MSSP_ADMIN)
  async deleteMapping(
    @Param('id') id: string,
    @CurrentUser('id') actorId: string,
    @CurrentUser('organizationId') organizationId: string,
  ) {
    if (!organizationId) {
      throw new BadRequestException('Authenticated organization context is required.');
    }
    return this.mappingService.deleteMapping(id, organizationId, actorId);
  }

  // ==========================================
  // 9. CONTROL-GAP & EVIDENCE SUFFICIENCY (PHASE 6)
  // ==========================================

  @Post('gaps/assess')
  @Roles(Role.ADMIN, Role.MSSP_ADMIN, Role.ANALYST)
  async assessControlGaps(
    @Body() dto: AssessControlGapDto,
    @CurrentUser('id') actorId: string,
    @CurrentUser('organizationId') organizationId: string,
  ) {
    if (!organizationId) {
      throw new BadRequestException('Authenticated organization context is required.');
    }
    if (dto.obligationId) {
      return this.gapService.assessObligationGap(
        organizationId,
        dto.obligationId,
        actorId,
        dto.forceReassess || false,
      );
    }
    return this.gapService.assessOrganizationGaps(
      organizationId,
      actorId,
      dto.forceReassess || false,
    );
  }

  @Get('gaps')
  async listControlGaps(
    @Query() query: QueryControlGapDto,
    @CurrentUser('organizationId') organizationId: string,
  ) {
    if (!organizationId) {
      throw new BadRequestException('Authenticated organization context is required.');
    }
    return this.gapService.listGapAssessments(organizationId, query);
  }

  @Get('gaps/summary')
  async getControlGapSummary(@CurrentUser('organizationId') organizationId: string) {
    if (!organizationId) {
      throw new BadRequestException('Authenticated organization context is required.');
    }
    return this.gapService.getGapSummary(organizationId);
  }

  @Get('gaps/:id')
  async getControlGap(
    @Param('id') id: string,
    @CurrentUser('organizationId') organizationId: string,
  ) {
    if (!organizationId) {
      throw new BadRequestException('Authenticated organization context is required.');
    }
    return this.gapService.getGapAssessment(id, organizationId);
  }

  @Patch('gaps/:id/review')
  @Roles(Role.ADMIN, Role.MSSP_ADMIN, Role.ANALYST)
  async reviewControlGap(
    @Param('id') id: string,
    @Body() dto: ReviewControlGapDto,
    @CurrentUser('id') actorId: string,
    @CurrentUser('organizationId') organizationId: string,
  ) {
    if (!organizationId) {
      throw new BadRequestException('Authenticated organization context is required.');
    }
    return this.gapService.reviewOrOverrideGapAssessment(id, organizationId, dto, actorId);
  }

  // ==========================================
  // 10. REGULATORY REMEDIATION PLANNING & TASK TRACKING (Phase 7)
  // ==========================================

  @Post('remediation')
  @Roles(Role.ADMIN, Role.MSSP_ADMIN, Role.ANALYST)
  async createRemediation(
    @Body() dto: CreateRemediationDto,
    @CurrentUser('id') actorId: string,
    @CurrentUser('organizationId') organizationId: string,
  ) {
    if (!organizationId) {
      throw new BadRequestException('Authenticated organization context is required.');
    }
    return this.remediationService.createRemediation(organizationId, actorId, dto);
  }

  @Get('remediation')
  @Roles(Role.ADMIN, Role.MSSP_ADMIN, Role.ANALYST, Role.EXTERNAL_AUDITOR)
  async listRemediationTasks(
    @Query() query: QueryRemediationDto,
    @CurrentUser('organizationId') organizationId: string,
  ) {
    if (!organizationId) {
      throw new BadRequestException('Authenticated organization context is required.');
    }
    return this.remediationService.findAll(organizationId, query);
  }

  @Get('remediation/summary')
  @Roles(Role.ADMIN, Role.MSSP_ADMIN, Role.ANALYST, Role.EXTERNAL_AUDITOR)
  async getRemediationSummary(
    @CurrentUser('organizationId') organizationId: string,
  ) {
    if (!organizationId) {
      throw new BadRequestException('Authenticated organization context is required.');
    }
    return this.remediationService.getSummary(organizationId);
  }

  @Get('remediation/:id')
  @Roles(Role.ADMIN, Role.MSSP_ADMIN, Role.ANALYST, Role.EXTERNAL_AUDITOR)
  async getRemediationTask(
    @Param('id') id: string,
    @CurrentUser('organizationId') organizationId: string,
  ) {
    if (!organizationId) {
      throw new BadRequestException('Authenticated organization context is required.');
    }
    return this.remediationService.findOne(organizationId, id);
  }

  @Patch('remediation/:id/assign')
  @Roles(Role.ADMIN, Role.MSSP_ADMIN, Role.ANALYST)
  async assignRemediation(
    @Param('id') id: string,
    @Body() dto: AssignRemediationDto,
    @CurrentUser('id') actorId: string,
    @CurrentUser('organizationId') organizationId: string,
  ) {
    if (!organizationId) {
      throw new BadRequestException('Authenticated organization context is required.');
    }
    return this.remediationService.assignRemediation(organizationId, actorId, id, dto);
  }

  @Patch('remediation/:id/status')
  @Roles(Role.ADMIN, Role.MSSP_ADMIN, Role.ANALYST)
  async updateRemediationStatus(
    @Param('id') id: string,
    @Body() dto: UpdateRemediationStatusDto,
    @CurrentUser('id') actorId: string,
    @CurrentUser('organizationId') organizationId: string,
  ) {
    if (!organizationId) {
      throw new BadRequestException('Authenticated organization context is required.');
    }
    return this.remediationService.updateStatus(organizationId, actorId, id, dto);
  }

  @Post('remediation/:id/approval')
  @Roles(Role.ADMIN, Role.MSSP_ADMIN, Role.ANALYST)
  async handleRemediationApproval(
    @Param('id') id: string,
    @Body() dto: RemediationApprovalDto,
    @CurrentUser('id') actorId: string,
    @CurrentUser('role') actorRole: string,
    @CurrentUser('organizationId') organizationId: string,
  ) {
    if (!organizationId) {
      throw new BadRequestException('Authenticated organization context is required.');
    }
    return this.remediationService.handleApproval(organizationId, actorId, actorRole, id, dto);
  }

  @Post('remediation/:id/complete')
  @Roles(Role.ADMIN, Role.MSSP_ADMIN, Role.ANALYST)
  async completeRemediation(
    @Param('id') id: string,
    @Body() dto: CompleteRemediationDto,
    @CurrentUser('id') actorId: string,
    @CurrentUser('organizationId') organizationId: string,
  ) {
    if (!organizationId) {
      throw new BadRequestException('Authenticated organization context is required.');
    }
    return this.remediationService.completeRemediation(organizationId, actorId, id, dto);
  }

  @Post('remediation/:id/verify')
  @Roles(Role.ADMIN, Role.MSSP_ADMIN)
  async verifyRemediation(
    @Param('id') id: string,
    @Body() dto: VerifyRemediationDto,
    @CurrentUser('id') actorId: string,
    @CurrentUser('role') actorRole: string,
    @CurrentUser('organizationId') organizationId: string,
  ) {
    if (!organizationId) {
      throw new BadRequestException('Authenticated organization context is required.');
    }
    return this.remediationService.verifyAndClose(organizationId, actorId, actorRole, id, dto);
  }

  @Post('remediation/:id/risk-accept')
  @Roles(Role.ADMIN, Role.MSSP_ADMIN)
  async acceptRemediationRisk(
    @Param('id') id: string,
    @Body() dto: RiskAcceptRemediationDto,
    @CurrentUser('id') actorId: string,
    @CurrentUser('role') actorRole: string,
    @CurrentUser('organizationId') organizationId: string,
  ) {
    if (!organizationId) {
      throw new BadRequestException('Authenticated organization context is required.');
    }
    return this.remediationService.acceptRisk(organizationId, actorId, actorRole, id, dto);
  }
}

