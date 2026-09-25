import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { FrameworkEntitlementsService } from '../frameworks/framework-entitlements.service';
import { ResourceAuthorizationService, ResourceAuthContext } from '../auth/resource-authorization.service';
import { AnalysisQueueService } from './analysis-queue.service';
import {
  CreateAnalysisDto,
  ReviewFindingDto,
  DocumentAnalysisDto,
  ExtractedFindingDto,
  AnalysisStatus,
  AnalysisContextType,
  FindingReviewStatus,
  Role,
  MappingStatus,
} from '@omnigrc/shared';
import * as crypto from 'crypto';

@Injectable()
export class DocumentIntelligenceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogsService: AuditLogsService,
    private readonly frameworkEntitlementsService: FrameworkEntitlementsService,
    private readonly resourceAuthService: ResourceAuthorizationService,
    private readonly analysisQueueService: AnalysisQueueService,
  ) {}

  /**
   * Helper to normalize input arguments to ResourceAuthContext
   */
  private normalizeAuthCtx(
    authCtxOrOrgId: ResourceAuthContext | string,
    fallbackUserId: string = 'system',
    fallbackRole: Role = Role.ADMIN,
  ): ResourceAuthContext {
    if (typeof authCtxOrOrgId === 'object' && authCtxOrOrgId !== null && 'organizationId' in authCtxOrOrgId) {
      return authCtxOrOrgId;
    }
    return {
      userId: fallbackUserId,
      organizationId: authCtxOrOrgId as string,
      role: fallbackRole,
    };
  }

  /**
   * Submit Evidence for AI Document Intelligence Analysis.
   * Supports both ResourceAuthContext and legacy positional parameters.
   */
  async createAnalysis(
    authCtxOrOrgId: ResourceAuthContext | string,
    evidenceIdOrUserId: string,
    dtoOrEvidenceId?: CreateAnalysisDto | string,
    legacyDto?: CreateAnalysisDto,
  ): Promise<DocumentAnalysisDto | DocumentAnalysisDto[]> {
    let authCtx: ResourceAuthContext;
    let evidenceId: string;
    let dto: CreateAnalysisDto;

    if (typeof authCtxOrOrgId === 'object') {
      authCtx = authCtxOrOrgId;
      evidenceId = evidenceIdOrUserId;
      dto = (dtoOrEvidenceId as CreateAnalysisDto) || {};
    } else {
      const orgId = authCtxOrOrgId;
      if (typeof dtoOrEvidenceId === 'string') {
        const userId = evidenceIdOrUserId;
        evidenceId = dtoOrEvidenceId;
        dto = legacyDto || {};
        authCtx = { userId, organizationId: orgId, role: Role.ADMIN };
      } else {
        evidenceId = evidenceIdOrUserId;
        dto = (dtoOrEvidenceId as CreateAnalysisDto) || {};
        authCtx = { userId: 'system', organizationId: orgId, role: Role.ADMIN };
      }
    }
    if (authCtx.role === Role.EXTERNAL_AUDITOR) {
      throw new ForbiddenException('External Auditors are read-only and cannot trigger AI document analysis.');
    }

    const { organizationId, userId } = authCtx;
    const scopeWhere = await this.resourceAuthService.getScopeWhereClause(authCtx);

    // 1. Verify Evidence exists, belongs to org, and is within user's Phase B scope
    const evidence = await this.prisma.evidence.findFirst({
      where: { id: evidenceId, ...scopeWhere, deletedAt: null },
    });

    if (!evidence) {
      throw new NotFoundException(`Evidence with ID "${evidenceId}" not found or outside authorized scope.`);
    }

    // 2. Handle Multi-Framework Selection
    if (dto.frameworkIds && Array.isArray(dto.frameworkIds) && dto.frameworkIds.length > 0) {
      const results: DocumentAnalysisDto[] = [];
      for (const fwId of dto.frameworkIds) {
        const singleAnalysis = await this.enqueueSingleAnalysis(authCtx, evidence, {
          analysisContext: AnalysisContextType.FRAMEWORK,
          frameworkId: fwId,
        });
        results.push(singleAnalysis);
      }
      return results;
    }

    return this.enqueueSingleAnalysis(authCtx, evidence, dto);
  }

  /**
   * Enqueue a single Document Analysis instance for a specific context
   */
  private async enqueueSingleAnalysis(
    authCtx: ResourceAuthContext,
    evidence: any,
    dto: CreateAnalysisDto,
  ): Promise<DocumentAnalysisDto> {
    const { organizationId, userId } = authCtx;
    const contextType = dto.analysisContext || (dto.frameworkId ? AnalysisContextType.FRAMEWORK : AnalysisContextType.GENERAL);

    // Verify Framework Entitlement if framework context requested
    let targetFwId = dto.frameworkId;
    let targetVerId = dto.frameworkVersionId;

    if (dto.frameworkReferenceId && !targetFwId) {
      const ref = await this.prisma.frameworkReference.findFirst({
        where: { id: dto.frameworkReferenceId },
        include: { frameworkVersion: true },
      });
      if (ref && ref.frameworkVersion) {
        targetFwId = ref.frameworkVersion.frameworkId;
        targetVerId = ref.frameworkVersionId;
      }
    }

    if (targetFwId) {
      await this.frameworkEntitlementsService.assertEntitled(organizationId, targetFwId, targetVerId);
    }

    // Compute Deterministic SHA-256 Fingerprint
    const fingerprintInput = `${evidence.id}:${evidence.checksum || evidence.fileName}:${contextType}:${dto.frameworkId || ''}:${dto.frameworkVersionId || ''}:${dto.frameworkReferenceId || ''}:v1.0`;
    const fingerprint = crypto.createHash('sha256').update(fingerprintInput).digest('hex');

    // Check for cached / existing analysis with identical fingerprint
    const existing = await this.prisma.documentAnalysis.findFirst({
      where: { evidenceId: evidence.id, fingerprint },
      include: { runs: true, findings: true },
    });

    if (existing && existing.status !== AnalysisStatus.FAILED) {
      return this.mapAnalysisToDto(existing);
    }

    // Snapshot Evidence metadata
    const analysis = await this.prisma.documentAnalysis.create({
      data: {
        organizationId,
        evidenceId: evidence.id,
        evidenceFileName: evidence.fileName,
        evidenceChecksum: evidence.checksum,
        fingerprint,
        analysisContext: contextType,
        frameworkId: dto.frameworkId || null,
        frameworkVersionId: dto.frameworkVersionId || null,
        frameworkReferenceId: dto.frameworkReferenceId || null,
        status: AnalysisStatus.QUEUED,
        extractionMethod: 'DocumentExtractionService',
        requestedById: userId,
      },
      include: { runs: true, findings: true },
    });

    // Audit Log Enqueuing
    await this.auditLogsService.log({
      organizationId,
      actorId: userId,
      action: 'DOCUMENT_ANALYSIS_QUEUED',
      entityType: 'DocumentAnalysis',
      entityId: analysis.id,
      metadata: { evidenceId: evidence.id, analysisContext: contextType, frameworkId: dto.frameworkId },
    });

    // Enqueue Durable Worker Job
    await this.analysisQueueService.enqueueAnalysis(analysis.id, organizationId, userId, evidence.id);

    return this.mapAnalysisToDto(analysis);
  }

  /**
   * Find all Analyses for an Evidence record bounded by Phase B Scope & Tenant Isolation
   */
  async findAllAnalysesForEvidence(authCtxOrOrgId: ResourceAuthContext | string, evidenceId: string): Promise<DocumentAnalysisDto[]> {
    const authCtx = this.normalizeAuthCtx(authCtxOrOrgId);
    const { organizationId } = authCtx;
    const scopeWhere = await this.resourceAuthService.getScopeWhereClause(authCtx);

    const evidence = await this.prisma.evidence.findFirst({
      where: { id: evidenceId, ...scopeWhere, deletedAt: null },
    });

    if (!evidence) {
      throw new NotFoundException(`Evidence with ID "${evidenceId}" not found or outside authorized scope.`);
    }

    const analyses = await this.prisma.documentAnalysis.findMany({
      where: { organizationId, evidenceId },
      include: { runs: true, findings: { orderBy: { createdAt: 'asc' } } },
      orderBy: { createdAt: 'desc' },
    });

    return analyses.map((a) => this.mapAnalysisToDto(a));
  }

  /**
   * Find Analysis by ID with validated suggestions bounded by Tenant Isolation
   */
  async findAnalysisById(authCtxOrOrgId: ResourceAuthContext | string, analysisId: string): Promise<DocumentAnalysisDto> {
    const authCtx = this.normalizeAuthCtx(authCtxOrOrgId);
    const { organizationId } = authCtx;

    const analysis = await this.prisma.documentAnalysis.findFirst({
      where: { id: analysisId, organizationId },
      include: { runs: true, findings: { orderBy: { createdAt: 'asc' } } },
    });

    if (!analysis) {
      throw new NotFoundException(`Document Analysis "${analysisId}" not found in organization context.`);
    }

    return this.mapAnalysisToDto(analysis);
  }

  /**
   * Human Review of an Extracted Finding (Accept, Reject, Edit, Dismiss).
   * Advisory step ONLY — does NOT automatically modify Phase C coverage status.
   */
  async reviewFinding(
    authCtxOrOrgId: ResourceAuthContext | string,
    reviewerIdOrAnalysisId: string,
    roleOrFindingId?: Role | string,
    analysisIdOrDto?: string | ReviewFindingDto,
    findingIdOrNothing?: string,
    dtoOrNothing?: ReviewFindingDto,
  ): Promise<ExtractedFindingDto> {
    let authCtx: ResourceAuthContext;
    let analysisId: string;
    let findingId: string;
    let dto: ReviewFindingDto;

    if (typeof authCtxOrOrgId === 'object') {
      authCtx = authCtxOrOrgId;
      analysisId = reviewerIdOrAnalysisId;
      findingId = roleOrFindingId as string;
      dto = analysisIdOrDto as ReviewFindingDto;
    } else {
      const orgId = authCtxOrOrgId;
      const reviewerId = reviewerIdOrAnalysisId;
      const userRole = roleOrFindingId as Role;
      analysisId = analysisIdOrDto as string;
      findingId = findingIdOrNothing as string;
      dto = dtoOrNothing as ReviewFindingDto;
      authCtx = { userId: reviewerId, organizationId: orgId, role: userRole };
    }

    if (authCtx.role === Role.EXTERNAL_AUDITOR) {
      throw new ForbiddenException('External Auditors are read-only and cannot submit human reviews for AI findings.');
    }

    const { organizationId, userId } = authCtx;

    const finding = await this.prisma.extractedFinding.findFirst({
      where: { id: findingId, documentAnalysisId: analysisId, organizationId },
    });

    if (!finding) {
      throw new NotFoundException(`Extracted finding "${findingId}" not found.`);
    }

    const updated = await this.prisma.extractedFinding.update({
      where: { id: finding.id },
      data: {
        reviewStatus: dto.reviewStatus,
        reviewedById: userId,
        reviewedAt: new Date(),
        editedTitle: dto.editedTitle?.trim() || null,
        editedDescription: dto.editedDescription?.trim() || null,
        editedCategory: dto.editedCategory || null,
        humanComment: dto.humanComment?.trim() || null,
      },
    });

    // Audit Log Review Decision
    await this.auditLogsService.log({
      organizationId,
      actorId: userId,
      action: 'FINDING_REVIEWED',
      entityType: 'ExtractedFinding',
      entityId: finding.id,
      metadata: { reviewStatus: dto.reviewStatus, findingType: finding.findingType },
    });

    return this.mapFindingToDto(updated);
  }

  /**
   * Convert an Accepted/Edited AI Extracted Finding into an Authoritative GRC Record.
   * Establishes authoritative ControlFrameworkMapping, EvidenceFrameworkReference, or ControlEvidence.
   * Phase C FrameworkCoverageService recalculates coverage independently.
   */
  async convertFindingToAction(
    authCtxOrOrgId: ResourceAuthContext | string,
    userIdOrAnalysisId: string,
    roleOrFindingId?: Role | string,
    analysisIdOrDto?: string | any,
    findingIdOrDto?: string | any,
    dtoOrNothing?: any,
  ): Promise<{ actionType: string; actionId: string; resultMessage: string }> {
    let authCtx: ResourceAuthContext;
    let analysisId: string;
    let findingId: string;
    let dto: any;

    if (typeof authCtxOrOrgId === 'object') {
      authCtx = authCtxOrOrgId;
      analysisId = userIdOrAnalysisId;
      findingId = roleOrFindingId as string;
      dto = analysisIdOrDto;
    } else {
      const orgId = authCtxOrOrgId;
      const userId = userIdOrAnalysisId;
      const userRole = roleOrFindingId as Role;
      analysisId = analysisIdOrDto as string;
      findingId = findingIdOrDto as string;
      dto = dtoOrNothing;
      authCtx = { userId, organizationId: orgId, role: userRole };
    }

    if (authCtx.role === Role.EXTERNAL_AUDITOR) {
      throw new ForbiddenException('External Auditors are read-only and cannot convert AI findings into GRC records.');
    }

    const { organizationId, userId } = authCtx;
    const scopeWhere = await this.resourceAuthService.getScopeWhereClause(authCtx);

    const finding = await this.prisma.extractedFinding.findFirst({
      where: { id: findingId, documentAnalysisId: analysisId, organizationId },
      include: { documentAnalysis: true },
    });

    if (!finding) {
      throw new NotFoundException(`Extracted finding "${findingId}" not found in organization context.`);
    }

    if (finding.reviewStatus !== FindingReviewStatus.ACCEPTED && finding.reviewStatus !== FindingReviewStatus.EDITED) {
      throw new BadRequestException(`Finding "${findingId}" must be reviewed and ACCEPTED or EDITED before converting into an authoritative action.`);
    }

    if (finding.humanComment && finding.humanComment.includes('Converted to')) {
      throw new BadRequestException(`Finding "${findingId}" has already been converted into an authoritative GRC record.`);
    }

    const targetControlId = dto.controlId || finding.aiSuggestedControlId || null;
    const targetRefId = dto.frameworkReferenceId || finding.aiSuggestedReferenceId || null;
    const evidenceId = finding.documentAnalysis.evidenceId;

    let createdRecordId = '';
    const conversionType = dto.conversionType;

    if (conversionType === 'CONTROL_MAPPING') {
      if (!targetControlId || !targetRefId) {
        throw new BadRequestException('Both target controlId and frameworkReferenceId are required for CONTROL_MAPPING conversion.');
      }

      // Verify Control exists & belongs to org under Phase B scope
      const ctrl = await this.prisma.control.findFirst({
        where: { id: targetControlId, ...scopeWhere, deletedAt: null },
      });
      if (!ctrl) {
        throw new NotFoundException(`Target control "${targetControlId}" not found or outside authorized scope.`);
      }

      // Verify Reference exists & org is entitled to framework & version
      const ref = await this.prisma.frameworkReference.findFirst({
        where: { id: targetRefId },
        include: { frameworkVersion: true },
      });
      if (!ref) throw new NotFoundException(`Framework reference "${targetRefId}" not found.`);

      await this.frameworkEntitlementsService.assertEntitled(organizationId, ref.frameworkVersion.frameworkId, ref.frameworkVersionId);

      // Create or update authoritative mapping with human sign-off status (APPROVED)
      const mapping = await this.prisma.controlFrameworkMapping.upsert({
        where: { controlId_frameworkReferenceId: { controlId: targetControlId, frameworkReferenceId: targetRefId } },
        create: {
          controlId: targetControlId,
          frameworkReferenceId: targetRefId,
          status: MappingStatus.APPROVED,
          confidenceScore: finding.aiConfidence === 'HIGH' ? 0.95 : 0.8,
          reviewedById: userId,
          reviewedAt: new Date(),
        },
        update: {
          status: MappingStatus.APPROVED,
          reviewedById: userId,
          reviewedAt: new Date(),
        },
      });
      createdRecordId = mapping.id;
    } else if (conversionType === 'EVIDENCE_REFERENCE') {
      if (!evidenceId || !targetRefId) {
        throw new BadRequestException('Both valid evidenceId and frameworkReferenceId are required for EVIDENCE_REFERENCE conversion.');
      }

      const evidence = await this.prisma.evidence.findFirst({
        where: { id: evidenceId, ...scopeWhere, deletedAt: null },
      });
      if (!evidence) {
        throw new NotFoundException(`Evidence "${evidenceId}" not found or outside authorized scope.`);
      }

      const ref = await this.prisma.frameworkReference.findFirst({
        where: { id: targetRefId },
        include: { frameworkVersion: true },
      });
      if (!ref) throw new NotFoundException(`Framework reference "${targetRefId}" not found.`);

      await this.frameworkEntitlementsService.assertEntitled(organizationId, ref.frameworkVersion.frameworkId, ref.frameworkVersionId);

      const evRef = await this.prisma.evidenceFrameworkReference.upsert({
        where: { evidenceId_frameworkReferenceId: { evidenceId, frameworkReferenceId: targetRefId } },
        create: {
          evidenceId,
          frameworkReferenceId: targetRefId,
        },
        update: {},
      });
      createdRecordId = evRef.id;
    } else if (conversionType === 'EVIDENCE_CONTROL') {
      if (!evidenceId || !targetControlId) {
        throw new BadRequestException('Both valid evidenceId and controlId are required for EVIDENCE_CONTROL conversion.');
      }

      const evidence = await this.prisma.evidence.findFirst({
        where: { id: evidenceId, ...scopeWhere, deletedAt: null },
      });
      if (!evidence) {
        throw new NotFoundException(`Evidence "${evidenceId}" not found or outside authorized scope.`);
      }

      const ctrl = await this.prisma.control.findFirst({
        where: { id: targetControlId, ...scopeWhere, deletedAt: null },
      });
      if (!ctrl) {
        throw new NotFoundException(`Target control "${targetControlId}" not found or outside authorized scope.`);
      }

      const ctrlEv = await this.prisma.controlEvidence.upsert({
        where: { controlId_evidenceId: { controlId: targetControlId, evidenceId } },
        create: {
          organizationId,
          controlId: targetControlId,
          evidenceId,
        },
        update: {},
      });
      createdRecordId = ctrlEv.id;
    } else if (conversionType === 'COMPLIANCE_TASK') {
      if (targetControlId) {
        const c = await this.prisma.control.findFirst({ where: { id: targetControlId, ...scopeWhere, deletedAt: null } });
        if (!c) throw new NotFoundException(`Target control "${targetControlId}" not found or outside authorized scope.`);
      }
      const title = dto.title?.trim() || finding.editedTitle || finding.aiTitle;
      const description = dto.description?.trim() || finding.editedDescription || finding.aiDescription;

      const task = await this.prisma.complianceTask.create({
        data: {
          organizationId,
          title,
          description,
          owner: dto.owner?.trim() || finding.aiResponsibleParty || 'Unassigned',
          dueDate: dto.dueDate ? new Date(dto.dueDate) : finding.aiDueDate || null,
          controlId: targetControlId,
          createdById: userId,
          obligationReference: `ai-finding:${finding.id}`,
        },
      });
      createdRecordId = task.id;
    } else if (conversionType === 'RISK') {
      const title = dto.title?.trim() || finding.editedTitle || finding.aiTitle;
      const description = dto.description?.trim() || finding.editedDescription || finding.aiDescription;
      const likelihood = Math.min(5, Math.max(1, Number(dto.likelihood) || 3));
      const impact = Math.min(5, Math.max(1, Number(dto.impact) || 3));
      const score = likelihood * impact;

      const risk = await this.prisma.risk.create({
        data: {
          organizationId,
          title,
          description,
          likelihood,
          impact,
          score,
          owner: dto.owner?.trim() || finding.aiResponsibleParty || 'Unassigned',
          createdById: userId,
        },
      });
      createdRecordId = risk.id;
    } else if (conversionType === 'POLICY_EXCEPTION') {
      const title = dto.title?.trim() || finding.editedTitle || finding.aiTitle;
      const description = dto.description?.trim() || finding.editedDescription || finding.aiDescription;

      const policy = await this.prisma.policy.findFirst({ where: { organizationId } });
      if (!policy) {
        throw new BadRequestException('At least one policy must exist in organization to request a policy exception.');
      }
      const pex = await this.prisma.policyException.create({
        data: {
          organizationId,
          policyId: policy.id,
          title,
          reason: description,
          requestedById: userId,
          expiresAt: dto.dueDate ? new Date(dto.dueDate) : null,
        },
      });
      createdRecordId = pex.id;
    } else {
      throw new BadRequestException(`Unsupported conversion type "${conversionType}". Supported types: CONTROL_MAPPING, EVIDENCE_REFERENCE, EVIDENCE_CONTROL, COMPLIANCE_TASK, RISK, POLICY_EXCEPTION.`);
    }

    await this.prisma.extractedFinding.updateMany({
      where: { id: finding.id },
      data: {
        humanComment: finding.humanComment ? `${finding.humanComment} | Converted to ${conversionType}:${createdRecordId}` : `Converted to ${conversionType}:${createdRecordId}`,
      },
    });

    await this.auditLogsService.log({
      organizationId,
      actorId: userId,
      action: 'AI_FINDING_CONVERTED_TO_ACTION',
      entityType: 'ExtractedFinding',
      entityId: finding.id,
      metadata: { conversionType, createdRecordId, title: dto.title || finding.aiTitle },
    });

    return {
      actionType: conversionType,
      actionId: createdRecordId,
      resultMessage: `Successfully converted AI Extracted Finding into ${conversionType} (${createdRecordId}).`,
    };
  }

  /**
   * Retry a Failed or Cancelled Analysis
   */
  async retryAnalysis(
    authCtxOrOrgId: ResourceAuthContext | string,
    userIdOrAnalysisId: string,
    legacyAnalysisId?: string,
  ): Promise<DocumentAnalysisDto> {
    let authCtx: ResourceAuthContext;
    let analysisId: string;

    if (typeof authCtxOrOrgId === 'object') {
      authCtx = authCtxOrOrgId;
      analysisId = userIdOrAnalysisId;
    } else {
      const orgId = authCtxOrOrgId;
      const userId = userIdOrAnalysisId;
      analysisId = legacyAnalysisId as string;
      authCtx = { userId, organizationId: orgId, role: Role.ADMIN };
    }

    if (authCtx.role === Role.EXTERNAL_AUDITOR) {
      throw new ForbiddenException('External Auditors are read-only and cannot retry document analyses.');
    }

    const { organizationId, userId } = authCtx;
    const analysis = await this.prisma.documentAnalysis.findFirst({
      where: { id: analysisId, organizationId },
    });

    if (!analysis) {
      throw new NotFoundException(`Document Analysis "${analysisId}" not found.`);
    }

    await this.prisma.documentAnalysis.update({
      where: { id: analysis.id },
      data: { status: AnalysisStatus.QUEUED, errorMessage: null },
    });

    await this.analysisQueueService.enqueueAnalysis(analysis.id, organizationId, userId, analysis.evidenceId || '');

    return this.findAnalysisById(authCtx, analysis.id);
  }

  /**
   * Map Prisma DocumentAnalysis to DTO
   */
  private mapAnalysisToDto(analysis: any): DocumentAnalysisDto {
    return {
      id: analysis.id,
      organizationId: analysis.organizationId,
      evidenceId: analysis.evidenceId,
      evidenceFileName: analysis.evidenceFileName,
      evidenceChecksum: analysis.evidenceChecksum,
      fingerprint: analysis.fingerprint,
      analysisVersionNumber: analysis.analysisVersionNumber,
      analysisContext: analysis.analysisContext,
      frameworkId: analysis.frameworkId,
      frameworkVersionId: analysis.frameworkVersionId,
      frameworkReferenceId: analysis.frameworkReferenceId,
      status: analysis.status,
      extractionStatus: analysis.extractionStatus,
      extractionMethod: analysis.extractionMethod,
      isTruncated: analysis.isTruncated,
      truncationReason: analysis.truncationReason,
      errorMessage: analysis.errorMessage,
      requestedById: analysis.requestedById,
      createdAt: analysis.createdAt.toISOString(),
      updatedAt: analysis.updatedAt.toISOString(),
      runs: (analysis.runs || []).map((r: any) => ({
        id: r.id,
        documentAnalysisId: r.documentAnalysisId,
        providerName: r.providerName,
        modelTier: r.modelTier,
        promptVersion: r.promptVersion,
        schemaVersion: r.schemaVersion,
        promptTokens: r.promptTokens,
        completionTokens: r.completionTokens,
        totalTokens: r.totalTokens,
        durationMs: r.durationMs,
        status: r.status,
        errorMessage: r.errorMessage,
        createdAt: r.createdAt.toISOString(),
      })),
      findings: (analysis.findings || []).map((f: any) => this.mapFindingToDto(f)),
    };
  }

  /**
   * Map Prisma ExtractedFinding to DTO
   */
  private mapFindingToDto(f: any): ExtractedFindingDto {
    return {
      id: f.id,
      documentAnalysisId: f.documentAnalysisId,
      organizationId: f.organizationId,
      findingType: f.findingType,
      dateCategory: f.dateCategory,
      aiTitle: f.aiTitle,
      aiDescription: f.aiDescription,
      aiConfidence: f.aiConfidence,
      aiRawScore: f.aiRawScore,
      aiSourceSnippet: f.aiSourceSnippet,
      aiSourcePage: f.aiSourcePage,
      aiSourceSection: f.aiSourceSection,
      aiSourceSheet: f.aiSourceSheet,
      aiSourceCell: f.aiSourceCell,
      aiSourceRow: f.aiSourceRow,
      aiSourceCol: f.aiSourceCol,
      aiCharOffsetStart: f.aiCharOffsetStart,
      aiCharOffsetEnd: f.aiCharOffsetEnd,
      aiDueDate: f.aiDueDate ? f.aiDueDate.toISOString() : null,
      aiRelativeExpression: f.aiRelativeExpression,
      aiResponsibleParty: f.aiResponsibleParty,
      aiSuggestedFrameworkCode: f.aiSuggestedFrameworkCode,
      aiSuggestedReferenceId: f.aiSuggestedReferenceId,
      aiSuggestedControlId: f.aiSuggestedControlId,
      aiSuggestedRiskId: f.aiSuggestedRiskId,
      aiRationale: f.aiRationale,
      isValidatedControl: f.isValidatedControl || false,
      isValidatedRisk: f.isValidatedRisk || false,
      isValidatedReference: f.isValidatedReference || false,
      reviewStatus: f.reviewStatus,
      reviewedById: f.reviewedById,
      reviewedAt: f.reviewedAt ? f.reviewedAt.toISOString() : null,
      editedTitle: f.editedTitle,
      editedDescription: f.editedDescription,
      editedCategory: f.editedCategory,
      humanComment: f.humanComment,
      createdAt: f.createdAt.toISOString(),
      updatedAt: f.updatedAt.toISOString(),
    };
  }
}

