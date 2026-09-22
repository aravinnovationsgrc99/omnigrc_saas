import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { FrameworkEntitlementsService } from '../frameworks/framework-entitlements.service';
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
} from '@omnigrc/shared';
import * as crypto from 'crypto';

@Injectable()
export class DocumentIntelligenceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogsService: AuditLogsService,
    private readonly frameworkEntitlementsService: FrameworkEntitlementsService,
    private readonly analysisQueueService: AnalysisQueueService,
  ) {}

  /**
   * Submit Evidence for AI Document Intelligence Analysis
   */
  async createAnalysis(
    organizationId: string,
    requestedById: string,
    evidenceId: string,
    dto: CreateAnalysisDto,
  ): Promise<DocumentAnalysisDto | DocumentAnalysisDto[]> {
    // 1. Verify Evidence exists & belongs to org
    const evidence = await this.prisma.evidence.findFirst({
      where: { id: evidenceId, organizationId, deletedAt: null },
    });

    if (!evidence) {
      throw new NotFoundException(`Evidence with ID "${evidenceId}" not found in organization context.`);
    }

    // 2. Handle Multi-Framework Selection
    if (dto.frameworkIds && Array.isArray(dto.frameworkIds) && dto.frameworkIds.length > 0) {
      const results: DocumentAnalysisDto[] = [];
      for (const fwId of dto.frameworkIds) {
        const singleAnalysis = await this.enqueueSingleAnalysis(organizationId, requestedById, evidence, {
          analysisContext: AnalysisContextType.FRAMEWORK,
          frameworkId: fwId,
        });
        results.push(singleAnalysis);
      }
      return results;
    }

    return this.enqueueSingleAnalysis(organizationId, requestedById, evidence, dto);
  }

  /**
   * Enqueue a single Document Analysis instance for a specific context
   */
  private async enqueueSingleAnalysis(
    organizationId: string,
    requestedById: string,
    evidence: any,
    dto: CreateAnalysisDto,
  ): Promise<DocumentAnalysisDto> {
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
      const isEntitled = await this.frameworkEntitlementsService.isEntitled(organizationId, targetFwId, targetVerId);
      if (!isEntitled) {
        throw new ForbiddenException(`Organization is not entitled to run analysis against Framework "${targetFwId}".`);
      }
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
        requestedById,
      },
      include: { runs: true, findings: true },
    });

    // Audit Log Enqueuing (Metadata Only)
    await this.auditLogsService.log({
      organizationId,
      actorId: requestedById,
      action: 'DOCUMENT_ANALYSIS_QUEUED',
      entityType: 'DocumentAnalysis',
      entityId: analysis.id,
      metadata: { evidenceId: evidence.id, analysisContext: contextType, frameworkId: dto.frameworkId },
    });

    // Enqueue Durable Worker Job
    await this.analysisQueueService.enqueueAnalysis(analysis.id, organizationId, requestedById, evidence.id);

    return this.mapAnalysisToDto(analysis);
  }

  /**
   * Find all Analyses for an Evidence record
   */
  async findAllAnalysesForEvidence(organizationId: string, evidenceId: string): Promise<DocumentAnalysisDto[]> {
    const analyses = await this.prisma.documentAnalysis.findMany({
      where: { organizationId, evidenceId },
      include: { runs: true, findings: { orderBy: { createdAt: 'asc' } } },
      orderBy: { createdAt: 'desc' },
    });

    return analyses.map((a) => this.mapAnalysisToDto(a));
  }

  /**
   * Find Analysis by ID with validated suggestions
   */
  async findAnalysisById(organizationId: string, analysisId: string): Promise<DocumentAnalysisDto> {
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
   * Human Review of an Extracted Finding (Accept, Reject, Edit, Dismiss)
   */
  async reviewFinding(
    organizationId: string,
    reviewerId: string,
    userRole: Role,
    analysisId: string,
    findingId: string,
    dto: ReviewFindingDto,
  ): Promise<ExtractedFindingDto> {
    const finding = await this.prisma.extractedFinding.findFirst({
      where: { id: findingId, documentAnalysisId: analysisId, organizationId },
    });

    if (!finding) {
      throw new NotFoundException(`Extracted finding "${findingId}" not found.`);
    }

    if (userRole === Role.EXTERNAL_AUDITOR) {
      throw new ForbiddenException('External Auditors are read-only and cannot submit human reviews for AI findings.');
    }

    const updated = await this.prisma.extractedFinding.update({
      where: { id: finding.id },
      data: {
        reviewStatus: dto.reviewStatus,
        reviewedById: reviewerId,
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
      actorId: reviewerId,
      action: 'FINDING_REVIEWED',
      entityType: 'ExtractedFinding',
      entityId: finding.id,
      metadata: { reviewStatus: dto.reviewStatus, findingType: finding.findingType },
    });

    return this.mapFindingToDto(updated);
  }

  /**
   * Convert an Accepted/Edited AI Extracted Finding into an Authoritative GRC Record
   */
  async convertFindingToAction(
    organizationId: string,
    userId: string,
    userRole: Role,
    analysisId: string,
    findingId: string,
    dto: {
      conversionType: string;
      title?: string;
      description?: string;
      controlId?: string;
      frameworkReferenceId?: string;
      dueDate?: string;
      owner?: string;
      likelihood?: number;
      impact?: number;
    },
  ): Promise<{ actionType: string; actionId: string; resultMessage: string }> {
    if (userRole === Role.EXTERNAL_AUDITOR) {
      throw new ForbiddenException('External Auditors are read-only and cannot convert AI findings into GRC records.');
    }

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

    const existingTask = await this.prisma.complianceTask.findFirst({
      where: { organizationId, obligationReference: `ai-finding:${finding.id}`, deletedAt: null },
    });
    if (existingTask) {
      throw new BadRequestException(`Finding "${findingId}" has already been converted into ComplianceTask "${existingTask.id}".`);
    }

    const title = dto.title?.trim() || finding.editedTitle || finding.aiTitle;
    const description = dto.description?.trim() || finding.editedDescription || finding.aiDescription;
    const targetControlId = dto.controlId || finding.aiSuggestedControlId || null;
    const targetRefId = dto.frameworkReferenceId || finding.aiSuggestedReferenceId || null;

    let createdRecordId = '';
    const conversionType = dto.conversionType;

    if (conversionType === 'COMPLIANCE_TASK') {
      if (targetControlId) {
        const c = await this.prisma.control.findFirst({ where: { id: targetControlId, organizationId } });
        if (!c) throw new NotFoundException(`Target control "${targetControlId}" not found.`);
      }
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
    } else if (conversionType === 'CONTROL_MAPPING') {
      if (!targetControlId || !targetRefId) {
        throw new BadRequestException('Both target controlId and frameworkReferenceId are required for CONTROL_MAPPING conversion.');
      }
      const ref = await this.prisma.frameworkReference.findFirst({
        where: { id: targetRefId },
        include: { frameworkVersion: true },
      });
      if (!ref) throw new NotFoundException(`Framework reference "${targetRefId}" not found.`);

      await this.frameworkEntitlementsService.assertEntitled(organizationId, ref.frameworkVersion.frameworkId, ref.frameworkVersionId);

      const mapping = await this.prisma.controlFrameworkMapping.upsert({
        where: { controlId_frameworkReferenceId: { controlId: targetControlId, frameworkReferenceId: targetRefId } },
        create: {
          controlId: targetControlId,
          frameworkReferenceId: targetRefId,
          status: 'SUGGESTED',
          confidenceScore: 0.95,
          reviewedById: userId,
          reviewedAt: new Date(),
        },
        update: {
          reviewedById: userId,
          reviewedAt: new Date(),
        },
      });
      createdRecordId = mapping.id;
    } else {
      throw new BadRequestException(`Unsupported conversion type "${conversionType}". Supported types: COMPLIANCE_TASK, RISK, POLICY_EXCEPTION, CONTROL_MAPPING.`);
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
      metadata: { conversionType, createdRecordId, title },
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
  async retryAnalysis(organizationId: string, userId: string, analysisId: string): Promise<DocumentAnalysisDto> {
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

    return this.findAnalysisById(organizationId, analysis.id);
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
