import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogsService } from '../../audit-logs/audit-logs.service';
import { ObligationExtractorService } from './obligation-extractor.service';
import {
  QueryObligationsDto,
  ReviewObligationDto,
  CreateManualObligationDto,
} from '../dto/obligation.dto';
import {
  RegulatoryObligationStatus,
  ObligationExtractionMethod,
  ObligationConfidence,
  Prisma,
} from '@prisma/client';

export interface ExtractionResultSummary {
  publicationId: string;
  totalCandidatesExtracted: number;
  newlyCreatedCount: number;
  existingRetainedCount: number;
}

@Injectable()
export class RegulatoryObligationService {
  private readonly logger = new Logger(RegulatoryObligationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly extractor: ObligationExtractorService,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  /**
   * Idempotently extracts candidate obligations from a registered regulatory publication.
   * Never fabricates missing dates or legal classifications.
   * Guarantees re-runs do not create duplicate candidates.
   */
  public async extractCandidateObligations(
    publicationId: string,
    actorId: string,
    organizationId?: string,
    forceReextract: boolean = false,
  ): Promise<ExtractionResultSummary> {
    const publication = await this.prisma.regulatoryPublication.findUnique({
      where: { id: publicationId },
      include: {
        source: true,
        catalogueEntry: true,
        versions: {
          orderBy: { versionNumber: 'desc' },
          take: 1,
        },
        manualIntakes: {
          take: 1,
        },
      },
    });

    if (!publication) {
      throw new NotFoundException(`Regulatory publication "${publicationId}" not found.`);
    }

    // Verify tenant authorization if publication originates from a tenant's manual intake
    const linkedIntake = publication.manualIntakes?.[0];
    if (linkedIntake && organizationId && linkedIntake.organizationId !== organizationId) {
      throw new NotFoundException(`Regulatory publication "${publicationId}" not found.`);
    }

    const currentVersion = publication.versions?.[0];
    const rawMetadata = (publication.currentDocumentMetadata as Record<string, any>) || {};

    const candidates = this.extractor.extractCandidates({
      publicationId: publication.id,
      publicationNumber: publication.publicationNumber,
      title: publication.title,
      rawText: rawMetadata.rawText || rawMetadata.description || publication.title,
      rawMetadata,
      canonicalUrl: publication.canonicalUrl,
      versionNumber: currentVersion?.versionNumber || 1,
    });

    let newlyCreatedCount = 0;
    let existingRetainedCount = 0;

    for (const candidate of candidates) {
      const existing = await this.prisma.regulatoryObligation.findUnique({
        where: {
          publicationId_fingerprint: {
            publicationId: publication.id,
            fingerprint: candidate.fingerprint,
          },
        },
      });

      if (existing) {
        // If already exists and forceReextract is false, retain existing candidate (preserve any human reviews)
        existingRetainedCount++;
        continue;
      }

      await this.prisma.regulatoryObligation.create({
        data: {
          organizationId: linkedIntake?.organizationId || organizationId || null,
          publicationId: publication.id,
          publicationVersionId: currentVersion?.id || null,
          catalogueEntryId: publication.catalogueEntryId || null,
          sourceId: publication.sourceId || null,
          manualIntakeId: linkedIntake?.id || null,
          obligationIdentifier: candidate.obligationIdentifier,
          title: candidate.title,
          obligationWording: candidate.obligationWording,
          requiredAction: candidate.requiredAction,
          affectedActor: candidate.affectedActor,
          effectiveDate: candidate.effectiveDate,
          complianceDeadline: candidate.complianceDeadline,
          sourceExcerpt: candidate.sourceExcerpt,
          documentLocation: (candidate.documentLocation as Prisma.InputJsonValue) ?? Prisma.JsonNull,
          extractionMethod: candidate.extractionMethod,
          extractionConfidence: candidate.extractionConfidence,
          extractionModelDetails: (candidate.extractionModelDetails as Prisma.InputJsonValue) ?? Prisma.JsonNull,
          fingerprint: candidate.fingerprint,
          status: candidate.status,
          isHumanVerified: false,
        },
      });

      newlyCreatedCount++;
    }

    // Audit log extraction event
    try {
      await this.auditLogsService.log({
        organizationId: linkedIntake?.organizationId || organizationId || 'GLOBAL',
        actorId,
        action: 'REGULATORY_OBLIGATIONS_EXTRACTED',
        entityType: 'REGULATORY_PUBLICATION',
        entityId: publication.id,
        metadata: {
          publicationTitle: publication.title,
          totalCandidates: candidates.length,
          newlyCreatedCount,
          existingRetainedCount,
        },
      });
    } catch {
      // Non-fatal audit log failure
    }

    return {
      publicationId: publication.id,
      totalCandidatesExtracted: candidates.length,
      newlyCreatedCount,
      existingRetainedCount,
    };
  }

  /**
   * Lists regulatory obligations with multi-tenant isolation, status filtering, and pagination.
   */
  public async listObligations(query: QueryObligationsDto, userOrgId?: string) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const skip = (page - 1) * limit;

    const where: Prisma.RegulatoryObligationWhereInput = {};

    // Tenant Scoping: return global public obligations (organizationId = null)
    // plus tenant's own obligations (organizationId = userOrgId)
    if (userOrgId) {
      where.OR = [{ organizationId: null }, { organizationId: userOrgId }];
    } else {
      where.organizationId = null;
    }

    if (query.publicationId) {
      where.publicationId = query.publicationId;
    }

    if (query.catalogueEntryId) {
      where.catalogueEntryId = query.catalogueEntryId;
    }

    if (query.status) {
      where.status = query.status;
    }

    if (query.isHumanVerified !== undefined) {
      where.isHumanVerified = query.isHumanVerified;
    }

    if (query.affectedActor) {
      where.affectedActor = { contains: query.affectedActor, mode: 'insensitive' };
    }

    if (query.search) {
      where.AND = [
        {
          OR: [
            { title: { contains: query.search, mode: 'insensitive' } },
            { obligationWording: { contains: query.search, mode: 'insensitive' } },
            { requiredAction: { contains: query.search, mode: 'insensitive' } },
            { obligationIdentifier: { contains: query.search, mode: 'insensitive' } },
          ],
        },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.regulatoryObligation.findMany({
        where,
        orderBy: [{ isHumanVerified: 'desc' }, { createdAt: 'desc' }],
        skip,
        take: limit,
        include: {
          publication: {
            select: {
              id: true,
              title: true,
              publicationNumber: true,
              canonicalUrl: true,
              publicationDate: true,
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
      this.prisma.regulatoryObligation.count({ where }),
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
   * Retrieves single obligation by ID with tenant authorization check.
   */
  public async getObligation(id: string, userOrgId?: string) {
    const obligation = await this.prisma.regulatoryObligation.findUnique({
      where: { id },
      include: {
        publication: true,
        publicationVersion: true,
        catalogueEntry: true,
        manualIntake: true,
      },
    });

    if (!obligation) {
      throw new NotFoundException(`Regulatory obligation "${id}" not found.`);
    }

    // Cross-tenant protection
    if (obligation.organizationId && userOrgId && obligation.organizationId !== userOrgId) {
      throw new NotFoundException(`Regulatory obligation "${id}" not found.`);
    }

    return obligation;
  }

  /**
   * Human review and verification of a candidate obligation.
   * Clearly distinguishes human-verified obligations from AI/rule-extracted candidates.
   */
  public async reviewObligation(
    id: string,
    dto: ReviewObligationDto,
    actorId: string,
    userOrgId?: string,
  ) {
    const obligation = await this.getObligation(id, userOrgId);

    const isVerified = dto.status === RegulatoryObligationStatus.VERIFIED;
    const now = new Date();

    const updated = await this.prisma.regulatoryObligation.update({
      where: { id },
      data: {
        status: dto.status,
        isHumanVerified: isVerified,
        verifiedById: isVerified ? actorId : null,
        verifiedAt: isVerified ? now : null,
        reviewNotes: dto.reviewNotes,
        obligationWording: dto.correctedWording || obligation.obligationWording,
        requiredAction: dto.correctedAction !== undefined ? dto.correctedAction : obligation.requiredAction,
        affectedActor: dto.correctedActor !== undefined ? dto.correctedActor : obligation.affectedActor,
        effectiveDate: dto.correctedEffectiveDate ? new Date(dto.correctedEffectiveDate) : obligation.effectiveDate,
        complianceDeadline: dto.correctedDeadline ? new Date(dto.correctedDeadline) : obligation.complianceDeadline,
      },
    });

    try {
      await this.auditLogsService.log({
        organizationId: obligation.organizationId || userOrgId || 'GLOBAL',
        actorId,
        action: 'REGULATORY_OBLIGATION_REVIEWED',
        entityType: 'REGULATORY_OBLIGATION',
        entityId: id,
        metadata: {
          previousStatus: obligation.status,
          newStatus: dto.status,
          isHumanVerified: isVerified,
          reviewNotes: dto.reviewNotes,
        },
      });
    } catch {
      // Non-fatal audit log failure
    }

    return updated;
  }

  /**
   * Manually creates an authenticated obligation directly linked to a publication.
   */
  public async createManualObligation(
    dto: CreateManualObligationDto,
    actorId: string,
    organizationId?: string,
  ) {
    const publication = await this.prisma.regulatoryPublication.findUnique({
      where: { id: dto.publicationId },
    });

    if (!publication) {
      throw new NotFoundException(`Regulatory publication "${dto.publicationId}" not found.`);
    }

    const fingerprint = this.extractor.generateFingerprint(
      publication.id,
      dto.obligationWording,
      dto.obligationIdentifier,
    );

    const created = await this.prisma.regulatoryObligation.create({
      data: {
        organizationId: organizationId || null,
        publicationId: publication.id,
        catalogueEntryId: publication.catalogueEntryId,
        sourceId: publication.sourceId,
        manualIntakeId: dto.manualIntakeId || null,
        obligationIdentifier: dto.obligationIdentifier,
        title: dto.title,
        obligationWording: dto.obligationWording,
        requiredAction: dto.requiredAction,
        affectedActor: dto.affectedActor,
        effectiveDate: dto.effectiveDate ? new Date(dto.effectiveDate) : null,
        complianceDeadline: dto.complianceDeadline ? new Date(dto.complianceDeadline) : null,
        sourceExcerpt: dto.sourceExcerpt || dto.obligationWording,
        documentLocation: (dto.documentLocation as Prisma.InputJsonValue) ?? Prisma.JsonNull,
        extractionMethod: ObligationExtractionMethod.MANUAL_ENTRY,
        extractionConfidence: ObligationConfidence.HIGH,
        fingerprint,
        status: RegulatoryObligationStatus.VERIFIED,
        isHumanVerified: true,
        verifiedById: actorId,
        verifiedAt: new Date(),
        reviewNotes: 'Manually entered by compliance officer',
      },
    });

    try {
      await this.auditLogsService.log({
        organizationId: organizationId || 'GLOBAL',
        actorId,
        action: 'MANUAL_REGULATORY_OBLIGATION_CREATED',
        entityType: 'REGULATORY_OBLIGATION',
        entityId: created.id,
        metadata: {
          title: created.title,
          obligationIdentifier: created.obligationIdentifier,
        },
      });
    } catch {
      // Non-fatal audit log failure
    }

    return created;
  }
}
