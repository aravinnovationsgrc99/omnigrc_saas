import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogsService } from '../../audit-logs/audit-logs.service';
import {
  ApplicabilityEngineService,
  EvaluatedOrganizationProfile,
  EvaluatedObligationContext,
} from './applicability-engine.service';
import {
  AssessApplicabilityDto,
  QueryApplicabilityDto,
  ReviewApplicabilityDto,
  UpdateComplianceProfileDto,
} from '../dto/applicability.dto';
import {
  ApplicabilityOutcome,
  DeterminationType,
  Prisma,
} from '@prisma/client';

@Injectable()
export class RegulatoryApplicabilityService {
  private readonly logger = new Logger(RegulatoryApplicabilityService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly engine: ApplicabilityEngineService,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  /**
   * Resolves or constructs an EvaluatedOrganizationProfile for the given organizationId.
   */
  public async getOrBuildProfile(organizationId: string): Promise<EvaluatedOrganizationProfile> {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      include: {
        complianceProfile: true,
      },
    });

    if (!org) {
      throw new NotFoundException(`Organization "${organizationId}" not found.`);
    }

    const cp = org.complianceProfile;

    return {
      organizationId: org.id,
      name: org.name,
      primaryRegion: org.primaryRegion || 'India',
      operatingJurisdictions:
        cp?.operatingJurisdictions && cp.operatingJurisdictions.length > 0
          ? cp.operatingJurisdictions
          : [org.primaryRegion ? org.primaryRegion.toUpperCase() : 'INDIA'],
      industrySector: cp?.industrySector || null,
      regulatedEntityTypes: cp?.regulatedEntityTypes || [],
      handlesPersonalData: cp?.handlesPersonalData ?? true,
      handlesPaymentData: cp?.handlesPaymentData ?? false,
      isSignificantDataFiduciary: cp?.isSignificantDataFiduciary ?? false,
      annualTurnoverBand: cp?.annualTurnoverBand || null,
      employeeCountBand: cp?.employeeCountBand || null,
      customAttributes: (cp?.customAttributes as Record<string, any>) || null,
    };
  }

  /**
   * Updates or creates the organization's compliance profile.
   */
  public async updateProfile(
    organizationId: string,
    dto: UpdateComplianceProfileDto,
    actorId: string,
  ) {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
    });

    if (!org) {
      throw new NotFoundException(`Organization "${organizationId}" not found.`);
    }

    const updated = await this.prisma.organizationComplianceProfile.upsert({
      where: { organizationId },
      create: {
        organizationId,
        operatingJurisdictions: dto.operatingJurisdictions || [
          org.primaryRegion ? org.primaryRegion.toUpperCase() : 'INDIA',
        ],
        industrySector: dto.industrySector,
        regulatedEntityTypes: dto.regulatedEntityTypes || [],
        handlesPersonalData: dto.handlesPersonalData ?? true,
        handlesPaymentData: dto.handlesPaymentData ?? false,
        isSignificantDataFiduciary: dto.isSignificantDataFiduciary ?? false,
        annualTurnoverBand: dto.annualTurnoverBand,
        employeeCountBand: dto.employeeCountBand,
        customAttributes: (dto.customAttributes as Prisma.InputJsonValue) ?? Prisma.JsonNull,
      },
      update: {
        operatingJurisdictions: dto.operatingJurisdictions,
        industrySector: dto.industrySector,
        regulatedEntityTypes: dto.regulatedEntityTypes,
        handlesPersonalData: dto.handlesPersonalData,
        handlesPaymentData: dto.handlesPaymentData,
        isSignificantDataFiduciary: dto.isSignificantDataFiduciary,
        annualTurnoverBand: dto.annualTurnoverBand,
        employeeCountBand: dto.employeeCountBand,
        customAttributes: dto.customAttributes
          ? (dto.customAttributes as Prisma.InputJsonValue)
          : undefined,
      },
    });

    try {
      await this.auditLogsService.log({
        organizationId,
        actorId,
        action: 'ORGANIZATION_COMPLIANCE_PROFILE_UPDATED',
        entityType: 'ORGANIZATION_COMPLIANCE_PROFILE',
        entityId: updated.id,
        metadata: {
          operatingJurisdictions: updated.operatingJurisdictions,
          industrySector: updated.industrySector,
          regulatedEntityTypes: updated.regulatedEntityTypes,
        },
      });
    } catch {
      // Non-fatal audit log failure
    }

    return updated;
  }

  /**
   * Evaluates applicability of a single obligation for an organization.
   * Operates idempotently, retains historical decisions on change, and emits audit events.
   */
  public async assessObligation(
    organizationId: string,
    obligationId: string,
    actorId: string,
    forceReassess: boolean = false,
  ) {
    const profile = await this.getOrBuildProfile(organizationId);

    const obligation = await this.prisma.regulatoryObligation.findUnique({
      where: { id: obligationId },
      include: {
        catalogueEntry: true,
        publication: true,
      },
    });

    if (!obligation) {
      throw new NotFoundException(`Regulatory obligation "${obligationId}" not found.`);
    }

    // Tenant check: If obligation originates from a private manual intake, verify tenant access
    if (obligation.organizationId && obligation.organizationId !== organizationId) {
      throw new NotFoundException(`Regulatory obligation "${obligationId}" not found.`);
    }

    const obligationContext: EvaluatedObligationContext = {
      obligationId: obligation.id,
      obligationIdentifier: obligation.obligationIdentifier,
      title: obligation.title,
      obligationWording: obligation.obligationWording,
      requiredAction: obligation.requiredAction,
      affectedActor: obligation.affectedActor,
      effectiveDate: obligation.effectiveDate,
      complianceDeadline: obligation.complianceDeadline,
      jurisdiction: obligation.catalogueEntry?.jurisdiction || 'GLOBAL_STANDARDS',
      issuingAuthority: obligation.catalogueEntry?.issuingAuthority || null,
      instrumentType: obligation.catalogueEntry?.instrumentType || null,
    };

    const determination = this.engine.evaluateApplicability(profile, obligationContext);

    // Locate existing assessment record for (organizationId, obligationId)
    const existing = await this.prisma.regulatoryApplicabilityAssessment.findUnique({
      where: {
        organizationId_obligationId: {
          organizationId,
          obligationId,
        },
      },
    });

    if (existing) {
      // If human reviewed/overridden and not forced, preserve human determination!
      if (existing.isHumanReviewed && !forceReassess) {
        return existing;
      }

      // If outcome and rule match existing, return existing record idempotently
      if (existing.outcome === determination.outcome && !forceReassess) {
        return existing;
      }

      // Outcome changed or forced re-assessment: record previous state to immutable history
      await this.prisma.$transaction(async (tx) => {
        await tx.regulatoryApplicabilityHistory.create({
          data: {
            assessmentId: existing.id,
            organizationId,
            previousOutcome: existing.outcome,
            newOutcome: determination.outcome,
            determinationType: determination.determinationType,
            rationale: `Reassessment: ${determination.rationale}`,
            actorId,
            evaluatedAttributes: existing.evaluatedAttributes as Prisma.InputJsonValue,
          },
        });

        await tx.regulatoryApplicabilityAssessment.update({
          where: { id: existing.id },
          data: {
            outcome: determination.outcome,
            determinationType: determination.determinationType,
            confidence: determination.confidence,
            rationale: determination.rationale,
            ruleMatched: determination.ruleMatched,
            evaluatedAttributes: determination.evaluatedAttributes as Prisma.InputJsonValue,
            obligationCriteriaSnapshot: determination.obligationCriteriaSnapshot as Prisma.InputJsonValue,
            assessedAt: new Date(),
            assessedById: actorId,
            previousOutcome: existing.outcome,
            reassessmentCount: existing.reassessmentCount + 1,
          },
        });
      });

      try {
        await this.auditLogsService.log({
          organizationId,
          actorId,
          action: 'REGULATORY_APPLICABILITY_REASSESSED',
          entityType: 'REGULATORY_APPLICABILITY_ASSESSMENT',
          entityId: existing.id,
          metadata: {
            obligationId,
            previousOutcome: existing.outcome,
            newOutcome: determination.outcome,
            ruleMatched: determination.ruleMatched,
          },
        });
      } catch {
        // Non-fatal audit log failure
      }

      return this.prisma.regulatoryApplicabilityAssessment.findUnique({
        where: { id: existing.id },
        include: {
          obligation: true,
          catalogueEntry: true,
        },
      });
    }

    // Insert new assessment record
    const created = await this.prisma.regulatoryApplicabilityAssessment.create({
      data: {
        organizationId,
        obligationId: obligation.id,
        publicationId: obligation.publicationId,
        publicationVersionId: obligation.publicationVersionId,
        catalogueEntryId: obligation.catalogueEntryId,
        outcome: determination.outcome,
        determinationType: determination.determinationType,
        confidence: determination.confidence,
        rationale: determination.rationale,
        ruleMatched: determination.ruleMatched,
        evaluatedAttributes: determination.evaluatedAttributes as Prisma.InputJsonValue,
        obligationCriteriaSnapshot: determination.obligationCriteriaSnapshot as Prisma.InputJsonValue,
        assessedAt: new Date(),
        assessedById: actorId,
      },
      include: {
        obligation: true,
        catalogueEntry: true,
      },
    });

    try {
      await this.auditLogsService.log({
        organizationId,
        actorId,
        action: 'REGULATORY_APPLICABILITY_ASSESSED',
        entityType: 'REGULATORY_APPLICABILITY_ASSESSMENT',
        entityId: created.id,
        metadata: {
          obligationId,
          outcome: created.outcome,
          ruleMatched: created.ruleMatched,
        },
      });
    } catch {
      // Non-fatal audit log failure
    }

    return created;
  }

  /**
   * Assesses all relevant obligations for the organization.
   */
  public async assessAllForOrganization(
    organizationId: string,
    actorId: string,
    catalogueEntryId?: string,
    forceReassess: boolean = false,
  ) {
    const where: Prisma.RegulatoryObligationWhereInput = {
      OR: [{ organizationId: null }, { organizationId }],
    };

    if (catalogueEntryId) {
      where.catalogueEntryId = catalogueEntryId;
    }

    const obligations = await this.prisma.regulatoryObligation.findMany({
      where,
      select: { id: true },
    });

    let applicableCount = 0;
    let notApplicableCount = 0;
    let requiresReviewCount = 0;
    let insufficientInfoCount = 0;

    for (const ob of obligations) {
      const assessment = await this.assessObligation(organizationId, ob.id, actorId, forceReassess);
      if (assessment?.outcome === ApplicabilityOutcome.APPLICABLE) applicableCount++;
      else if (assessment?.outcome === ApplicabilityOutcome.NOT_APPLICABLE) notApplicableCount++;
      else if (assessment?.outcome === ApplicabilityOutcome.REQUIRES_REVIEW) requiresReviewCount++;
      else if (assessment?.outcome === ApplicabilityOutcome.INSUFFICIENT_INFORMATION) insufficientInfoCount++;
    }

    return {
      organizationId,
      totalEvaluated: obligations.length,
      applicableCount,
      notApplicableCount,
      requiresReviewCount,
      insufficientInfoCount,
    };
  }

  /**
   * Lists applicability assessments scoped strictly to the caller organization.
   */
  public async listAssessments(organizationId: string, query: QueryApplicabilityDto) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const skip = (page - 1) * limit;

    const where: Prisma.RegulatoryApplicabilityAssessmentWhereInput = {
      organizationId,
    };

    if (query.obligationId) {
      where.obligationId = query.obligationId;
    }

    if (query.catalogueEntryId) {
      where.catalogueEntryId = query.catalogueEntryId;
    }

    if (query.outcome) {
      where.outcome = query.outcome;
    }

    if (query.determinationType) {
      where.determinationType = query.determinationType;
    }

    if (query.isHumanReviewed !== undefined) {
      where.isHumanReviewed = query.isHumanReviewed;
    }

    if (query.search) {
      where.OR = [
        { rationale: { contains: query.search, mode: 'insensitive' } },
        { obligation: { title: { contains: query.search, mode: 'insensitive' } } },
        { obligation: { obligationWording: { contains: query.search, mode: 'insensitive' } } },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.regulatoryApplicabilityAssessment.findMany({
        where,
        orderBy: [{ assessedAt: 'desc' }],
        skip,
        take: limit,
        include: {
          obligation: {
            select: {
              id: true,
              obligationIdentifier: true,
              title: true,
              affectedActor: true,
              effectiveDate: true,
              complianceDeadline: true,
            },
          },
          catalogueEntry: {
            select: {
              id: true,
              code: true,
              displayName: true,
              jurisdiction: true,
            },
          },
        },
      }),
      this.prisma.regulatoryApplicabilityAssessment.count({ where }),
    ]);

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }

  /**
   * Retrieves single assessment by ID with complete tenant isolation and audit history.
   */
  public async getAssessment(id: string, organizationId: string) {
    const assessment = await this.prisma.regulatoryApplicabilityAssessment.findFirst({
      where: { id, organizationId },
      include: {
        obligation: true,
        catalogueEntry: true,
        publication: true,
        history: {
          orderBy: { changedAt: 'desc' },
        },
      },
    });

    if (!assessment) {
      throw new NotFoundException(`Applicability assessment "${id}" not found.`);
    }

    return assessment;
  }

  /**
   * Human review and override of an applicability assessment.
   * Preserves historical decision and stamps reviewer provenance.
   */
  public async reviewOrOverrideAssessment(
    id: string,
    organizationId: string,
    dto: ReviewApplicabilityDto,
    actorId: string,
  ) {
    const assessment = await this.getAssessment(id, organizationId);

    const isOverride = assessment.outcome !== dto.outcome;
    const determinationType = isOverride
      ? DeterminationType.HUMAN_OVERRIDDEN
      : DeterminationType.HUMAN_CONFIRMED;

    const previousOutcome = assessment.outcome;
    const now = new Date();

    const updated = await this.prisma.$transaction(async (tx) => {
      // Record historical snapshot if outcome is changed
      await tx.regulatoryApplicabilityHistory.create({
        data: {
          assessmentId: assessment.id,
          organizationId,
          previousOutcome,
          newOutcome: dto.outcome,
          determinationType,
          rationale: dto.overrideReason || dto.reviewNotes,
          actorId,
          evaluatedAttributes: assessment.evaluatedAttributes as Prisma.InputJsonValue,
        },
      });

      return tx.regulatoryApplicabilityAssessment.update({
        where: { id },
        data: {
          outcome: dto.outcome,
          determinationType,
          isHumanReviewed: true,
          reviewedById: actorId,
          reviewedAt: now,
          reviewNotes: dto.reviewNotes,
          rationale: dto.overrideReason
            ? `Human Override: ${dto.overrideReason} (Previous: ${assessment.rationale})`
            : assessment.rationale,
          previousOutcome,
          reassessmentCount: assessment.reassessmentCount + 1,
        },
        include: {
          obligation: true,
          catalogueEntry: true,
          history: {
            orderBy: { changedAt: 'desc' },
          },
        },
      });
    });

    try {
      await this.auditLogsService.log({
        organizationId,
        actorId,
        action: isOverride
          ? 'REGULATORY_APPLICABILITY_OVERRIDDEN'
          : 'REGULATORY_APPLICABILITY_REVIEWED',
        entityType: 'REGULATORY_APPLICABILITY_ASSESSMENT',
        entityId: id,
        metadata: {
          previousOutcome,
          newOutcome: dto.outcome,
          determinationType,
          reviewNotes: dto.reviewNotes,
          overrideReason: dto.overrideReason,
        },
      });
    } catch {
      // Non-fatal audit log failure
    }

    return updated;
  }
}
