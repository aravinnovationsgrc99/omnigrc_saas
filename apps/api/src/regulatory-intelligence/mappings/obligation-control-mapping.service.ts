import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import {
  ApplicabilityOutcome,
  MappingStatus,
  ObligationConfidence,
  ObligationMappingMethod,
  Prisma,
  RegulatoryObligationStatus,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogsService } from '../../audit-logs/audit-logs.service';
import {
  CreateObligationMappingDto,
  SuggestMappingsDto,
  QueryObligationMappingsDto,
  ReviewObligationMappingDto,
  MappingCoverageSummaryDto,
} from '../dto/obligation-mapping.dto';
import { MappingSuggestionEngineService } from './mapping-suggestion-engine.service';

@Injectable()
export class ObligationControlMappingService {
  private readonly logger = new Logger(ObligationControlMappingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogsService: AuditLogsService,
    private readonly suggestionEngine: MappingSuggestionEngineService,
  ) {}

  /**
   * Manually creates or proposes a mapping between a regulatory obligation and an existing organization control.
   * Enforces control ownership, obligation provenance, and eligibility checks.
   */
  async createMapping(
    organizationId: string,
    dto: CreateObligationMappingDto,
    actorId: string,
  ) {
    if (!organizationId) {
      throw new BadRequestException('Organization context is required');
    }

    // 1. Verify Control Ownership & Existence
    const control = await this.prisma.control.findFirst({
      where: {
        id: dto.controlId,
        organizationId,
        deletedAt: null,
      },
    });

    if (!control) {
      throw new NotFoundException(
        `Control '${dto.controlId}' not found in organization or has been deleted.`,
      );
    }

    // 2. Verify Obligation Existence & Provenance
    const obligation = await this.prisma.regulatoryObligation.findUnique({
      where: { id: dto.obligationId },
      include: {
        publication: true,
        publicationVersion: true,
      },
    });

    if (!obligation) {
      throw new NotFoundException(
        `Regulatory obligation '${dto.obligationId}' not found.`,
      );
    }

    // 3. Enforce Private Manual Intake Tenant Containment
    if (obligation.organizationId && obligation.organizationId !== organizationId) {
      throw new ForbiddenException(
        'Access denied: Cannot map a private obligation belonging to a different organization.',
      );
    }

    // 4. Resolve Publication Version Provenance
    const publicationVersionId =
      dto.frameworkReferenceId ||
      obligation.publicationVersionId ||
      obligation.publication?.currentVersionNumber
        ? (
            await this.prisma.regulatoryPublicationVersion.findFirst({
              where: {
                publicationId: obligation.publicationId,
                versionNumber: obligation.publication.currentVersionNumber,
              },
            })
          )?.id || null
        : null;

    // 5. Evaluate Eligibility & Initial Status
    // Default to human-verified obligations with an APPLICABLE applicability assessment
    const applicability = await this.prisma.regulatoryApplicabilityAssessment.findUnique({
      where: {
        organizationId_obligationId: {
          organizationId,
          obligationId: dto.obligationId,
        },
      },
    });

    const isVerifiedApplicable =
      obligation.isHumanVerified &&
      obligation.status === RegulatoryObligationStatus.VERIFIED &&
      applicability?.outcome === ApplicabilityOutcome.APPLICABLE;

    // If unverified or not confirmed applicable, must remain in SUGGESTED state
    const initialStatus = isVerifiedApplicable
      ? MappingStatus.APPROVED
      : MappingStatus.SUGGESTED;

    const mappingMethod = dto.mappingMethod || ObligationMappingMethod.HUMAN_AUTHORED;
    const confidence = dto.confidence || ObligationConfidence.HIGH;

    // 6. Check for existing mapping (Idempotent handling)
    const existing = await this.prisma.regulatoryObligationControlMapping.findUnique({
      where: {
        organizationId_obligationId_controlId: {
          organizationId,
          obligationId: dto.obligationId,
          controlId: dto.controlId,
        },
      },
    });

    if (existing) {
      return existing;
    }

    // 7. Create mapping & initial historical record in transaction
    const created = await this.prisma.$transaction(async (tx) => {
      const mapping = await tx.regulatoryObligationControlMapping.create({
        data: {
          organizationId,
          obligationId: dto.obligationId,
          controlId: dto.controlId,
          publicationId: obligation.publicationId,
          publicationVersionId,
          frameworkReferenceId: dto.frameworkReferenceId || null,
          mappingMethod,
          status: initialStatus,
          confidence,
          rationale: dto.rationale,
          sourceExcerpt: dto.sourceExcerpt || obligation.sourceExcerpt || null,
          suggestedById: actorId,
          reviewedById: initialStatus === MappingStatus.APPROVED ? actorId : null,
          reviewedAt: initialStatus === MappingStatus.APPROVED ? new Date() : null,
          reviewNotes:
            initialStatus === MappingStatus.APPROVED
              ? 'Directly authored and confirmed by compliance officer for verified applicable obligation.'
              : 'Suggested mapping created pending compliance verification.',
        },
        include: {
          obligation: true,
          control: true,
          publication: true,
          publicationVersion: true,
        },
      });

      await tx.regulatoryObligationControlMappingHistory.create({
        data: {
          mappingId: mapping.id,
          organizationId,
          previousStatus: MappingStatus.SUGGESTED,
          newStatus: initialStatus,
          previousRationale: null,
          newRationale: dto.rationale,
          actorId,
          reviewNotes: mapping.reviewNotes,
        },
      });

      return mapping;
    });

    await this.auditLogsService.log({
      organizationId,
      actorId,
      action: 'REGULATORY_OBLIGATION_CONTROL_MAPPED',
      entityType: 'REGULATORY_OBLIGATION_CONTROL_MAPPING',
      entityId: created.id,
      metadata: {
        obligationId: dto.obligationId,
        controlId: dto.controlId,
        status: initialStatus,
        mappingMethod,
        isVerifiedApplicable,
      },
    });

    return created;
  }

  /**
   * Evaluates organization controls against verified applicable obligations
   * using deterministic criteria to suggest candidate mappings.
   */
  async suggestMappings(
    organizationId: string,
    dto: SuggestMappingsDto,
    actorId: string,
  ) {
    if (!organizationId) {
      throw new BadRequestException('Organization context is required');
    }

    // 1. Fetch eligible obligations (Assessed as APPLICABLE for this organization)
    let eligibleObligationIds: string[] = [];

    if (dto.obligationId) {
      const assessment = await this.prisma.regulatoryApplicabilityAssessment.findUnique({
        where: {
          organizationId_obligationId: {
            organizationId,
            obligationId: dto.obligationId,
          },
        },
      });

      if (!assessment || assessment.outcome !== ApplicabilityOutcome.APPLICABLE) {
        throw new BadRequestException(
          `Obligation '${dto.obligationId}' has not been assessed as APPLICABLE for organization '${organizationId}'. Cannot suggest mappings.`,
        );
      }
      eligibleObligationIds = [dto.obligationId];
    } else {
      const applicableAssessments =
        await this.prisma.regulatoryApplicabilityAssessment.findMany({
          where: {
            organizationId,
            outcome: ApplicabilityOutcome.APPLICABLE,
          },
          select: { obligationId: true },
        });

      eligibleObligationIds = applicableAssessments.map((a) => a.obligationId);
    }

    if (eligibleObligationIds.length === 0) {
      return {
        organizationId,
        totalEligibleObligations: 0,
        suggestionsCreated: 0,
        skippedExistingCount: 0,
        message: 'No applicable obligations found for organization.',
      };
    }

    // 2. Fetch obligations with details
    const obligations = await this.prisma.regulatoryObligation.findMany({
      where: {
        id: { in: eligibleObligationIds },
      },
      include: {
        publication: true,
      },
    });

    // 3. Fetch active controls for the organization
    const controls = await this.prisma.control.findMany({
      where: {
        organizationId,
        deletedAt: null,
      },
      include: {
        mappings: {
          include: {
            frameworkReference: true,
          },
        },
      },
    });

    if (controls.length === 0) {
      return {
        organizationId,
        totalEligibleObligations: obligations.length,
        suggestionsCreated: 0,
        skippedExistingCount: 0,
        message: 'No active controls configured for organization.',
      };
    }

    let suggestionsCreated = 0;
    let skippedExistingCount = 0;

    // 4. Run suggestion engine across eligible obligations
    for (const obligation of obligations) {
      const candidates = this.suggestionEngine.suggestMappingsForObligation(
        {
          obligationId: obligation.id,
          obligationIdentifier: obligation.obligationIdentifier,
          title: obligation.title,
          obligationWording: obligation.obligationWording,
          requiredAction: obligation.requiredAction,
          affectedActor: obligation.affectedActor,
        },
        controls.map((c) => ({
          id: c.id,
          organizationId: c.organizationId,
          name: c.name,
          description: c.description,
          category: c.category,
          mappings: c.mappings.map((m) => ({
            frameworkReferenceId: m.frameworkReferenceId,
            frameworkReference: m.frameworkReference
              ? {
                  identifier: m.frameworkReference.identifier,
                  title: m.frameworkReference.title,
                }
              : null,
          })),
        })),
      );

      for (const candidate of candidates) {
        // Filter by threshold if specified
        if (
          dto.confidenceThreshold === ObligationConfidence.HIGH &&
          candidate.confidence !== ObligationConfidence.HIGH
        ) {
          continue;
        }

        // Check if mapping already exists
        const existing = await this.prisma.regulatoryObligationControlMapping.findUnique({
          where: {
            organizationId_obligationId_controlId: {
              organizationId,
              obligationId: obligation.id,
              controlId: candidate.controlId,
            },
          },
        });

        if (existing) {
          skippedExistingCount++;
          continue;
        }

        // Create suggested mapping
        await this.prisma.$transaction(async (tx) => {
          const mapping = await tx.regulatoryObligationControlMapping.create({
            data: {
              organizationId,
              obligationId: obligation.id,
              controlId: candidate.controlId,
              publicationId: obligation.publicationId,
              publicationVersionId: obligation.publicationVersionId,
              frameworkReferenceId: candidate.frameworkReferenceId,
              mappingMethod: candidate.mappingMethod,
              status: MappingStatus.SUGGESTED,
              confidence: candidate.confidence,
              rationale: candidate.rationale,
              ruleMatched: candidate.ruleMatched,
              sourceExcerpt: obligation.sourceExcerpt,
              suggestedById: actorId,
            },
          });

          await tx.regulatoryObligationControlMappingHistory.create({
            data: {
              mappingId: mapping.id,
              organizationId,
              previousStatus: MappingStatus.SUGGESTED,
              newStatus: MappingStatus.SUGGESTED,
              previousRationale: null,
              newRationale: candidate.rationale,
              actorId,
              reviewNotes: `Auto-suggested by deterministic rule '${candidate.ruleMatched}'.`,
            },
          });
        });

        suggestionsCreated++;
      }
    }

    if (suggestionsCreated > 0) {
      await this.auditLogsService.log({
        organizationId,
        actorId,
        action: 'REGULATORY_OBLIGATION_MAPPINGS_SUGGESTED',
        entityType: 'REGULATORY_OBLIGATION_CONTROL_MAPPING',
        entityId: organizationId,
        metadata: {
          totalEligibleObligations: obligations.length,
          suggestionsCreated,
          skippedExistingCount,
        },
      });
    }

    return {
      organizationId,
      totalEligibleObligations: obligations.length,
      suggestionsCreated,
      skippedExistingCount,
      message: `Successfully evaluated ${obligations.length} applicable obligations and generated ${suggestionsCreated} suggested control mappings.`,
    };
  }

  /**
   * Lists mappings scoped strictly to caller's organization.
   */
  async listMappings(organizationId: string, query: QueryObligationMappingsDto) {
    if (!organizationId) {
      throw new BadRequestException('Organization context is required');
    }

    const page = query.page || 1;
    const limit = query.limit || 20;
    const skip = (page - 1) * limit;

    const where: Prisma.RegulatoryObligationControlMappingWhereInput = {
      organizationId,
    };

    if (query.obligationId) {
      where.obligationId = query.obligationId;
    }

    if (query.controlId) {
      where.controlId = query.controlId;
    }

    if (query.status) {
      where.status = query.status;
    }

    if (query.mappingMethod) {
      where.mappingMethod = query.mappingMethod;
    }

    if (query.confidence) {
      where.confidence = query.confidence;
    }

    if (query.search) {
      const term = query.search.trim();
      where.OR = [
        { rationale: { contains: term, mode: 'insensitive' } },
        { obligation: { title: { contains: term, mode: 'insensitive' } } },
        { control: { name: { contains: term, mode: 'insensitive' } } },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.regulatoryObligationControlMapping.findMany({
        where,
        skip,
        take: limit,
        orderBy: { updatedAt: 'desc' },
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
              description: true,
              category: true,
            },
          },
          frameworkReference: {
            select: {
              id: true,
              identifier: true,
              title: true,
            },
          },
          publication: {
            select: {
              id: true,
              title: true,
              publicationNumber: true,
              currentVersionNumber: true,
            },
          },
        },
      }),
      this.prisma.regulatoryObligationControlMapping.count({ where }),
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
   * Retrieves single mapping by ID with full traceability history.
   */
  async getMapping(id: string, organizationId: string) {
    if (!organizationId) {
      throw new BadRequestException('Organization context is required');
    }

    const mapping = await this.prisma.regulatoryObligationControlMapping.findFirst({
      where: {
        id,
        organizationId,
      },
      include: {
        obligation: {
          include: {
            publication: true,
            publicationVersion: true,
            catalogueEntry: true,
          },
        },
        control: true,
        frameworkReference: true,
        history: {
          orderBy: { changedAt: 'desc' },
        },
      },
    });

    if (!mapping) {
      throw new NotFoundException(
        `Regulatory obligation control mapping '${id}' not found for organization.`,
      );
    }

    return mapping;
  }

  /**
   * Human review, acceptance, rejection, or revision of a suggested mapping.
   * Preserves historical review decisions immutably in RegulatoryObligationControlMappingHistory.
   */
  async reviewOrOverrideMapping(
    id: string,
    organizationId: string,
    dto: ReviewObligationMappingDto,
    actorId: string,
  ) {
    if (!organizationId) {
      throw new BadRequestException('Organization context is required');
    }

    const mapping = await this.prisma.regulatoryObligationControlMapping.findFirst({
      where: {
        id,
        organizationId,
      },
      include: {
        obligation: true,
      },
    });

    if (!mapping) {
      throw new NotFoundException(
        `Regulatory obligation control mapping '${id}' not found for organization.`,
      );
    }

    const previousStatus = mapping.status;
    const previousRationale = mapping.rationale;
    const newStatus = dto.status;
    const newRationale = dto.revisedRationale || mapping.rationale;
    const newConfidence = dto.revisedConfidence || mapping.confidence;

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.regulatoryObligationControlMapping.update({
        where: { id },
        data: {
          status: newStatus,
          rationale: newRationale,
          confidence: newConfidence,
          reviewedById: actorId,
          reviewedAt: new Date(),
          reviewNotes: dto.reviewNotes,
          reassessmentCount: mapping.reassessmentCount + 1,
        },
        include: {
          obligation: true,
          control: true,
        },
      });

      await tx.regulatoryObligationControlMappingHistory.create({
        data: {
          mappingId: id,
          organizationId,
          previousStatus,
          newStatus,
          previousRationale,
          newRationale,
          actorId,
          reviewNotes: dto.reviewNotes,
        },
      });

      return result;
    });

    await this.auditLogsService.log({
      organizationId,
      actorId,
      action: 'REGULATORY_OBLIGATION_MAPPING_REVIEWED',
      entityType: 'REGULATORY_OBLIGATION_CONTROL_MAPPING',
      entityId: id,
      metadata: {
        previousStatus,
        newStatus,
        reviewNotes: dto.reviewNotes,
        reassessmentCount: updated.reassessmentCount,
      },
    });

    return updated;
  }

  /**
   * Removes or deactivates an obligation-to-control mapping with an audit event.
   */
  async deleteMapping(id: string, organizationId: string, actorId: string) {
    if (!organizationId) {
      throw new BadRequestException('Organization context is required');
    }

    const mapping = await this.prisma.regulatoryObligationControlMapping.findFirst({
      where: { id, organizationId },
    });

    if (!mapping) {
      throw new NotFoundException(`Mapping '${id}' not found for organization.`);
    }

    await this.prisma.regulatoryObligationControlMapping.delete({
      where: { id },
    });

    await this.auditLogsService.log({
      organizationId,
      actorId,
      action: 'REGULATORY_OBLIGATION_MAPPING_DELETED',
      entityType: 'REGULATORY_OBLIGATION_CONTROL_MAPPING',
      entityId: id,
      metadata: {
        obligationId: mapping.obligationId,
        controlId: mapping.controlId,
        status: mapping.status,
      },
    });

    return { success: true, deletedId: id };
  }

  /**
   * Identifies applicable regulatory obligations that have no approved (accepted) control mapping.
   * Reports mapping coverage statistics only (no gap analysis or remediation tasks created).
   */
  async getMappingCoverage(organizationId: string): Promise<MappingCoverageSummaryDto> {
    if (!organizationId) {
      throw new BadRequestException('Organization context is required');
    }

    // 1. Fetch all obligations assessed as APPLICABLE for this organization
    const applicableAssessments =
      await this.prisma.regulatoryApplicabilityAssessment.findMany({
        where: {
          organizationId,
          outcome: ApplicabilityOutcome.APPLICABLE,
        },
        include: {
          obligation: {
            select: {
              id: true,
              obligationIdentifier: true,
              title: true,
              affectedActor: true,
              catalogueEntryId: true,
            },
          },
        },
      });

    const totalApplicableObligations = applicableAssessments.length;

    if (totalApplicableObligations === 0) {
      return {
        organizationId,
        totalApplicableObligations: 0,
        mappedObligationsCount: 0,
        unmappedObligationsCount: 0,
        coveragePercentage: 100,
        unmappedObligations: [],
      };
    }

    const applicableObligationIds = applicableAssessments.map((a) => a.obligationId);

    // 2. Fetch approved mappings for these applicable obligations
    const approvedMappings =
      await this.prisma.regulatoryObligationControlMapping.findMany({
        where: {
          organizationId,
          obligationId: { in: applicableObligationIds },
          status: MappingStatus.APPROVED,
        },
        select: {
          obligationId: true,
        },
      });

    const mappedObligationIds = new Set(approvedMappings.map((m) => m.obligationId));

    // 3. Filter unmapped obligations
    const unmappedObligations = applicableAssessments
      .filter((a) => !mappedObligationIds.has(a.obligationId))
      .map((a) => ({
        obligationId: a.obligation.id,
        obligationIdentifier: a.obligation.obligationIdentifier,
        title: a.obligation.title,
        affectedActor: a.obligation.affectedActor,
      }));

    const mappedObligationsCount = mappedObligationIds.size;
    const unmappedObligationsCount = unmappedObligations.length;
    const coveragePercentage =
      totalApplicableObligations > 0
        ? Math.round((mappedObligationsCount / totalApplicableObligations) * 100)
        : 100;

    return {
      organizationId,
      totalApplicableObligations,
      mappedObligationsCount,
      unmappedObligationsCount,
      coveragePercentage,
      unmappedObligations,
    };
  }
}
