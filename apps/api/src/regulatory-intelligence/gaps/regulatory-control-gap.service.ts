import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import {
  ApplicabilityOutcome,
  ControlGapOutcome,
  DeterminationType,
  EvidenceSufficiencyOutcome,
  MappingStatus,
  Prisma,
  RegulatoryObligationStatus,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogsService } from '../../audit-logs/audit-logs.service';
import {
  QueryControlGapDto,
  ReviewControlGapDto,
  ControlGapSummaryDto,
} from '../dto/control-gap.dto';
import { ControlGapEngineService } from './control-gap-engine.service';

@Injectable()
export class RegulatoryControlGapService {
  private readonly logger = new Logger(RegulatoryControlGapService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogsService: AuditLogsService,
    private readonly gapEngine: ControlGapEngineService,
  ) {}

  /**
   * Assesses control implementation gaps and evidence sufficiency for a single verified, applicable obligation.
   */
  async assessObligationGap(
    organizationId: string,
    obligationId: string,
    actorId: string,
    forceReassess = false,
  ) {
    if (!organizationId) {
      throw new BadRequestException('Organization context is required');
    }

    // 1. Verify Obligation & Provenance
    const obligation = await this.prisma.regulatoryObligation.findUnique({
      where: { id: obligationId },
      include: {
        publication: true,
      },
    });

    if (!obligation) {
      throw new NotFoundException(`Regulatory obligation '${obligationId}' not found.`);
    }

    // 2. Eligibility: Must be human-verified and assessed as APPLICABLE
    const applicability = await this.prisma.regulatoryApplicabilityAssessment.findUnique({
      where: {
        organizationId_obligationId: {
          organizationId,
          obligationId,
        },
      },
    });

    if (!applicability || applicability.outcome !== ApplicabilityOutcome.APPLICABLE) {
      throw new BadRequestException(
        `Obligation '${obligationId}' is not assessed as APPLICABLE for organization '${organizationId}'. Control-gap analysis is restricted to applicable mandates.`,
      );
    }

    // 3. Fetch approved control mapping (if any)
    const approvedMapping = await this.prisma.regulatoryObligationControlMapping.findFirst({
      where: {
        organizationId,
        obligationId,
        status: MappingStatus.APPROVED,
      },
      include: {
        control: {
          include: {
            auditCheckItems: {
              orderBy: { updatedAt: 'desc' },
            },
            complianceTasks: true,
            evidenceAssociations: {
              include: {
                evidence: {
                  include: {
                    approvalAssociations: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    // 4. Run deterministic gap evaluation
    const determination = this.gapEngine.evaluateGapAndSufficiency(
      {
        id: obligation.id,
        obligationIdentifier: obligation.obligationIdentifier,
        title: obligation.title,
        obligationWording: obligation.obligationWording,
        requiredAction: obligation.requiredAction,
        affectedActor: obligation.affectedActor,
        publicationId: obligation.publicationId,
        publicationVersionId: obligation.publicationVersionId,
      },
      approvedMapping
        ? {
            id: approvedMapping.id,
            controlId: approvedMapping.controlId,
            status: approvedMapping.status,
            rationale: approvedMapping.rationale,
            frameworkReferenceId: approvedMapping.frameworkReferenceId,
          }
        : null,
      approvedMapping?.control
        ? {
            id: approvedMapping.control.id,
            name: approvedMapping.control.name,
            category: approvedMapping.control.category,
            deletedAt: approvedMapping.control.deletedAt,
            auditCheckItems: approvedMapping.control.auditCheckItems,
            complianceTasks: approvedMapping.control.complianceTasks,
            evidenceAssociations: approvedMapping.control.evidenceAssociations,
          }
        : null,
    );

    // 5. Check existing assessment (Idempotency)
    const existing = await this.prisma.regulatoryControlGapAssessment.findUnique({
      where: {
        organizationId_obligationId: {
          organizationId,
          obligationId,
        },
      },
    });

    if (
      existing &&
      !forceReassess &&
      existing.gapOutcome === determination.gapOutcome &&
      existing.evidenceOutcome === determination.evidenceOutcome
    ) {
      return existing;
    }

    const previousGapOutcome = existing?.gapOutcome || determination.gapOutcome;
    const previousEvidenceOutcome =
      existing?.evidenceOutcome || determination.evidenceOutcome;
    const isNewOutcome =
      !existing ||
      existing.gapOutcome !== determination.gapOutcome ||
      existing.evidenceOutcome !== determination.evidenceOutcome;

    // 6. Upsert gap assessment and record immutable history
    const assessment = await this.prisma.$transaction(async (tx) => {
      const record = await tx.regulatoryControlGapAssessment.upsert({
        where: {
          organizationId_obligationId: {
            organizationId,
            obligationId,
          },
        },
        create: {
          organizationId,
          obligationId,
          mappingId: approvedMapping?.id || null,
          controlId: approvedMapping?.controlId || null,
          publicationId: obligation.publicationId,
          publicationVersionId: obligation.publicationVersionId,
          applicabilityId: applicability.id,
          gapOutcome: determination.gapOutcome,
          evidenceOutcome: determination.evidenceOutcome,
          determinationType: determination.determinationType,
          confidence: determination.confidence,
          gapRationale: determination.gapRationale,
          evidenceRationale: determination.evidenceRationale,
          ruleMatched: determination.ruleMatched,
          evaluatedRecords: determination.evaluatedRecords,
          assessedById: actorId,
          reassessmentCount: 0,
        },
        update: {
          mappingId: approvedMapping?.id || null,
          controlId: approvedMapping?.controlId || null,
          gapOutcome: determination.gapOutcome,
          evidenceOutcome: determination.evidenceOutcome,
          determinationType: determination.determinationType,
          confidence: determination.confidence,
          gapRationale: determination.gapRationale,
          evidenceRationale: determination.evidenceRationale,
          ruleMatched: determination.ruleMatched,
          evaluatedRecords: determination.evaluatedRecords,
          assessedById: actorId,
          assessedAt: new Date(),
          reassessmentCount: (existing?.reassessmentCount || 0) + 1,
        },
        include: {
          obligation: true,
          control: true,
          mapping: true,
        },
      });

      if (isNewOutcome) {
        await tx.regulatoryControlGapAssessmentHistory.create({
          data: {
            assessmentId: record.id,
            organizationId,
            previousGapOutcome,
            newGapOutcome: determination.gapOutcome,
            previousEvidenceOutcome,
            newEvidenceOutcome: determination.evidenceOutcome,
            determinationType: determination.determinationType,
            gapRationale: determination.gapRationale,
            evidenceRationale: determination.evidenceRationale,
            actorId,
            evaluatedRecords: determination.evaluatedRecords,
            reviewNotes: existing ? 'Reassessment triggered by source data update.' : 'Initial gap assessment.',
          },
        });
      }

      return record;
    });

    await this.auditLogsService.log({
      organizationId,
      actorId,
      action: 'REGULATORY_CONTROL_GAP_ASSESSED',
      entityType: 'REGULATORY_CONTROL_GAP_ASSESSMENT',
      entityId: assessment.id,
      metadata: {
        obligationId,
        controlId: approvedMapping?.controlId || null,
        gapOutcome: determination.gapOutcome,
        evidenceOutcome: determination.evidenceOutcome,
        reassessmentCount: assessment.reassessmentCount,
      },
    });

    return assessment;
  }

  /**
   * Batch evaluates control gaps and evidence sufficiency for all applicable obligations of an organization.
   */
  async assessOrganizationGaps(organizationId: string, actorId: string, forceReassess = false) {
    if (!organizationId) {
      throw new BadRequestException('Organization context is required');
    }

    const applicableAssessments =
      await this.prisma.regulatoryApplicabilityAssessment.findMany({
        where: {
          organizationId,
          outcome: ApplicabilityOutcome.APPLICABLE,
        },
        include: {
          obligation: true,
        },
      });

    if (applicableAssessments.length === 0) {
      return {
        organizationId,
        totalEvaluated: 0,
        gapOutcomes: {},
        evidenceOutcomes: {},
        message: 'No applicable obligations found for organization.',
      };
    }

    let assessedCount = 0;
    const gapBreakdown: Record<string, number> = {};
    const evidenceBreakdown: Record<string, number> = {};

    for (const app of applicableAssessments) {
      try {
        const assessment = await this.assessObligationGap(
          organizationId,
          app.obligationId,
          actorId,
          forceReassess,
        );

        gapBreakdown[assessment.gapOutcome] = (gapBreakdown[assessment.gapOutcome] || 0) + 1;
        evidenceBreakdown[assessment.evidenceOutcome] =
          (evidenceBreakdown[assessment.evidenceOutcome] || 0) + 1;
        assessedCount++;
      } catch (err: any) {
        this.logger.warn(
          `Skipping gap assessment for obligation '${app.obligationId}': ${err.message}`,
        );
      }
    }

    return {
      organizationId,
      totalEvaluated: assessedCount,
      gapOutcomes: gapBreakdown,
      evidenceOutcomes: evidenceBreakdown,
      message: `Completed control-gap assessment for ${assessedCount} applicable obligations.`,
    };
  }

  /**
   * Lists control-gap findings scoped strictly to caller's organization.
   */
  async listGapAssessments(organizationId: string, query: QueryControlGapDto) {
    if (!organizationId) {
      throw new BadRequestException('Organization context is required');
    }

    const page = query.page || 1;
    const limit = query.limit || 20;
    const skip = (page - 1) * limit;

    const where: Prisma.RegulatoryControlGapAssessmentWhereInput = {
      organizationId,
    };

    if (query.obligationId) {
      where.obligationId = query.obligationId;
    }

    if (query.controlId) {
      where.controlId = query.controlId;
    }

    if (query.gapOutcome) {
      where.gapOutcome = query.gapOutcome;
    }

    if (query.evidenceOutcome) {
      where.evidenceOutcome = query.evidenceOutcome;
    }

    if (query.isHumanReviewed !== undefined) {
      where.isHumanReviewed = query.isHumanReviewed;
    }

    if (query.search) {
      const term = query.search.trim();
      where.OR = [
        { gapRationale: { contains: term, mode: 'insensitive' } },
        { evidenceRationale: { contains: term, mode: 'insensitive' } },
        { obligation: { title: { contains: term, mode: 'insensitive' } } },
        { control: { name: { contains: term, mode: 'insensitive' } } },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.regulatoryControlGapAssessment.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ gapOutcome: 'asc' }, { updatedAt: 'desc' }],
        include: {
          obligation: {
            select: {
              id: true,
              obligationIdentifier: true,
              title: true,
              affectedActor: true,
              status: true,
              isHumanVerified: true,
            },
          },
          control: {
            select: {
              id: true,
              name: true,
              category: true,
            },
          },
          mapping: {
            select: {
              id: true,
              status: true,
              confidence: true,
              mappingMethod: true,
            },
          },
        },
      }),
      this.prisma.regulatoryControlGapAssessment.count({ where }),
    ]);

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Retrieves single gap assessment with full evidence and historical review trail.
   */
  async getGapAssessment(id: string, organizationId: string) {
    if (!organizationId) {
      throw new BadRequestException('Organization context is required');
    }

    const assessment = await this.prisma.regulatoryControlGapAssessment.findFirst({
      where: { id, organizationId },
      include: {
        obligation: {
          include: {
            publication: true,
            publicationVersion: true,
          },
        },
        control: {
          include: {
            auditCheckItems: true,
            complianceTasks: true,
            evidenceAssociations: {
              include: {
                evidence: true,
              },
            },
          },
        },
        mapping: true,
        history: {
          orderBy: { changedAt: 'desc' },
        },
      },
    });

    if (!assessment) {
      throw new NotFoundException(`Control-gap assessment '${id}' not found for organization.`);
    }

    return assessment;
  }

  /**
   * Human compliance officer review or override of a gap or evidence sufficiency finding.
   */
  async reviewOrOverrideGapAssessment(
    id: string,
    organizationId: string,
    dto: ReviewControlGapDto,
    actorId: string,
  ) {
    if (!organizationId) {
      throw new BadRequestException('Organization context is required');
    }

    const assessment = await this.prisma.regulatoryControlGapAssessment.findFirst({
      where: { id, organizationId },
    });

    if (!assessment) {
      throw new NotFoundException(`Control-gap assessment '${id}' not found for organization.`);
    }

    const previousGapOutcome = assessment.gapOutcome;
    const previousEvidenceOutcome = assessment.evidenceOutcome;
    const newGapOutcome = dto.gapOutcome;
    const newEvidenceOutcome = dto.evidenceOutcome || assessment.evidenceOutcome;
    const newGapRationale = dto.revisedGapRationale || assessment.gapRationale;
    const newEvidenceRationale = dto.revisedEvidenceRationale || assessment.evidenceRationale;

    const updated = await this.prisma.$transaction(async (tx) => {
      const record = await tx.regulatoryControlGapAssessment.update({
        where: { id },
        data: {
          gapOutcome: newGapOutcome,
          evidenceOutcome: newEvidenceOutcome,
          gapRationale: newGapRationale,
          evidenceRationale: newEvidenceRationale,
          determinationType: DeterminationType.HUMAN_OVERRIDDEN,
          isHumanReviewed: true,
          reviewedById: actorId,
          reviewedAt: new Date(),
          reviewNotes: dto.reviewNotes,
          reassessmentCount: assessment.reassessmentCount + 1,
        },
        include: {
          obligation: true,
          control: true,
        },
      });

      await tx.regulatoryControlGapAssessmentHistory.create({
        data: {
          assessmentId: id,
          organizationId,
          previousGapOutcome,
          newGapOutcome,
          previousEvidenceOutcome,
          newEvidenceOutcome,
          determinationType: DeterminationType.HUMAN_OVERRIDDEN,
          gapRationale: newGapRationale,
          evidenceRationale: newEvidenceRationale,
          actorId,
          reviewNotes: dto.reviewNotes,
        },
      });

      return record;
    });

    await this.auditLogsService.log({
      organizationId,
      actorId,
      action: 'REGULATORY_CONTROL_GAP_REVIEWED',
      entityType: 'REGULATORY_CONTROL_GAP_ASSESSMENT',
      entityId: id,
      metadata: {
        previousGapOutcome,
        newGapOutcome,
        reviewNotes: dto.reviewNotes,
        reassessmentCount: updated.reassessmentCount,
      },
    });

    return updated;
  }

  /**
   * Generates summary distribution metrics of control gaps and evidence sufficiency.
   */
  async getGapSummary(organizationId: string): Promise<ControlGapSummaryDto> {
    if (!organizationId) {
      throw new BadRequestException('Organization context is required');
    }

    const assessments = await this.prisma.regulatoryControlGapAssessment.findMany({
      where: { organizationId },
      select: {
        gapOutcome: true,
        evidenceOutcome: true,
      },
    });

    const gapOutcomes: Record<ControlGapOutcome, number> = {
      NO_MAPPING: 0,
      CONTROL_INELIGIBLE: 0,
      NOT_IMPLEMENTED: 0,
      PARTIALLY_IMPLEMENTED: 0,
      IMPLEMENTED: 0,
      UNKNOWN_IMPLEMENTATION: 0,
    };

    const evidenceOutcomes: Record<EvidenceSufficiencyOutcome, number> = {
      SUFFICIENT: 0,
      INSUFFICIENT: 0,
      STALE: 0,
      UNVERIFIED: 0,
      NOT_ASSESSED: 0,
    };

    for (const a of assessments) {
      gapOutcomes[a.gapOutcome] = (gapOutcomes[a.gapOutcome] || 0) + 1;
      evidenceOutcomes[a.evidenceOutcome] = (evidenceOutcomes[a.evidenceOutcome] || 0) + 1;
    }

    const unmappedObligationsCount = gapOutcomes.NO_MAPPING;
    const partiallyOrNotImplementedCount =
      gapOutcomes.NOT_IMPLEMENTED +
      gapOutcomes.PARTIALLY_IMPLEMENTED +
      gapOutcomes.CONTROL_INELIGIBLE;
    const implementedCount = gapOutcomes.IMPLEMENTED;

    return {
      organizationId,
      totalAssessed: assessments.length,
      gapOutcomes,
      evidenceOutcomes,
      unmappedObligationsCount,
      partiallyOrNotImplementedCount,
      implementedCount,
    };
  }
}
