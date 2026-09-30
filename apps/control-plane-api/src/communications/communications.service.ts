import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import {
  AnnouncementAudience,
  AnnouncementSeverity,
  AnnouncementStatus,
  EmailDeliveryStatus,
} from '@prisma/control-plane-client';
import { ControlPlanePrismaService } from '../prisma/prisma.service';
import { ControlPlaneAuditLogsService } from '../audit/audit-logs.service';
import { ControlPlaneEmailService } from './email.service';

export interface CreateAnnouncementDto {
  title: string;
  body: string;
  severity?: AnnouncementSeverity;
  audience?: AnnouncementAudience;
  targetOrganizationId?: string;
  scheduledAt?: string;
  expiresAt?: string;
  sendEmail?: boolean;
}

export interface UpdateAnnouncementDto {
  title?: string;
  body?: string;
  severity?: AnnouncementSeverity;
  audience?: AnnouncementAudience;
  targetOrganizationId?: string;
  scheduledAt?: string;
  expiresAt?: string;
  sendEmail?: boolean;
}

export interface QueryAnnouncementsDto {
  status?: AnnouncementStatus;
  severity?: AnnouncementSeverity;
  audience?: AnnouncementAudience;
  organizationId?: string;
  search?: string;
  page?: number;
  limit?: number;
}

@Injectable()
export class ControlPlaneCommunicationsService {
  private readonly logger = new Logger(ControlPlaneCommunicationsService.name);

  constructor(
    private readonly prisma: ControlPlanePrismaService,
    private readonly auditLogsService: ControlPlaneAuditLogsService,
    private readonly emailService: ControlPlaneEmailService,
  ) {}

  /**
   * Create a new platform announcement in DRAFT or SCHEDULED status.
   */
  async create(dto: CreateAnnouncementDto, operatorId: string) {
    const title = this.sanitizeText(dto.title);
    const body = this.sanitizeText(dto.body);

    if (!title || title.length < 3) {
      throw new BadRequestException('Announcement title must be at least 3 characters long.');
    }
    if (!body || body.length < 5) {
      throw new BadRequestException('Announcement body text must be at least 5 characters long.');
    }

    const audience = dto.audience || AnnouncementAudience.ALL_ORGANIZATIONS;
    let targetOrganizationId = dto.targetOrganizationId || null;

    if (audience === AnnouncementAudience.SPECIFIC_ORGANIZATION) {
      if (!targetOrganizationId) {
        throw new BadRequestException('Target organization ID is required when audience is SPECIFIC_ORGANIZATION.');
      }
      await this.validateOrganizationExists(targetOrganizationId);
    } else {
      targetOrganizationId = null;
    }

    const scheduledAt = dto.scheduledAt ? new Date(dto.scheduledAt) : null;
    const expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : null;

    if (scheduledAt && isNaN(scheduledAt.getTime())) {
      throw new BadRequestException('Invalid scheduledAt timestamp.');
    }
    if (expiresAt && isNaN(expiresAt.getTime())) {
      throw new BadRequestException('Invalid expiresAt timestamp.');
    }
    if (scheduledAt && expiresAt && expiresAt <= scheduledAt) {
      throw new BadRequestException('Expiration date must be after scheduled publication date.');
    }

    const isScheduledFuture = scheduledAt && scheduledAt > new Date();
    const initialStatus = isScheduledFuture
      ? AnnouncementStatus.SCHEDULED
      : AnnouncementStatus.DRAFT;

    const announcement = await this.prisma.platformAnnouncement.create({
      data: {
        title,
        body,
        severity: dto.severity || AnnouncementSeverity.INFO,
        status: initialStatus,
        audience,
        targetOrganizationId,
        createdByOperatorId: operatorId,
        scheduledAt,
        expiresAt,
        sendEmail: Boolean(dto.sendEmail),
        emailDeliveryStatus: EmailDeliveryStatus.NOT_REQUESTED,
      },
      include: {
        creator: {
          select: { id: true, fullName: true, email: true, role: true },
        },
      },
    });

    await this.auditLogsService.log({
      action: 'ANNOUNCEMENT_CREATED',
      entityType: 'PlatformAnnouncement',
      entityId: announcement.id,
      actorId: operatorId,
      metadata: {
        title: announcement.title,
        severity: announcement.severity,
        audience: announcement.audience,
        targetOrganizationId: announcement.targetOrganizationId,
        status: announcement.status,
        sendEmail: announcement.sendEmail,
      },
    });

    return announcement;
  }

  /**
   * List platform announcements with server-side filtering and bounded pagination.
   */
  async findAll(query: QueryAnnouncementsDto) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const skip = (page - 1) * limit;

    const where: any = {};

    if (query.status) {
      where.status = query.status;
    }

    if (query.severity) {
      where.severity = query.severity;
    }

    if (query.audience) {
      where.audience = query.audience;
    }

    if (query.organizationId) {
      where.OR = [
        { targetOrganizationId: query.organizationId },
        { audience: AnnouncementAudience.ALL_ORGANIZATIONS },
      ];
    }

    if (query.search && query.search.trim()) {
      const term = query.search.trim();
      where.AND = [
        {
          OR: [
            { title: { contains: term, mode: 'insensitive' } },
            { body: { contains: term, mode: 'insensitive' } },
            { id: { contains: term, mode: 'insensitive' } },
          ],
        },
      ];
    }

    const [total, records] = await Promise.all([
      this.prisma.platformAnnouncement.count({ where }),
      this.prisma.platformAnnouncement.findMany({
        where,
        include: {
          creator: {
            select: { id: true, fullName: true, email: true, role: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
    ]);

    // Transparently update status for expired announcements
    const now = new Date();
    const processedRecords = records.map((record) => {
      if (
        record.expiresAt &&
        record.expiresAt < now &&
        record.status === AnnouncementStatus.PUBLISHED
      ) {
        return { ...record, status: AnnouncementStatus.EXPIRED };
      }
      return record;
    });

    return {
      data: processedRecords,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        hasNextPage: page * limit < total,
        hasPreviousPage: page > 1,
      },
    };
  }

  /**
   * View details of a specific platform announcement by ID.
   */
  async findOne(id: string) {
    const announcement = await this.prisma.platformAnnouncement.findUnique({
      where: { id },
      include: {
        creator: {
          select: { id: true, fullName: true, email: true, role: true },
        },
      },
    });

    if (!announcement) {
      throw new NotFoundException(`Platform announcement with ID "${id}" not found.`);
    }

    if (
      announcement.expiresAt &&
      announcement.expiresAt < new Date() &&
      announcement.status === AnnouncementStatus.PUBLISHED
    ) {
      return { ...announcement, status: AnnouncementStatus.EXPIRED };
    }

    return announcement;
  }

  /**
   * Update an existing announcement. Enforces historical immutability for PUBLISHED/CANCELLED/EXPIRED records.
   */
  async update(id: string, dto: UpdateAnnouncementDto, operatorId: string) {
    const announcement = await this.findOne(id);

    if (
      announcement.status === AnnouncementStatus.PUBLISHED ||
      announcement.status === AnnouncementStatus.CANCELLED ||
      announcement.status === AnnouncementStatus.EXPIRED
    ) {
      throw new BadRequestException(
        `Cannot edit announcement in ${announcement.status} status. Published and finalized historical records are immutable.`,
      );
    }

    const dataToUpdate: any = {};

    if (dto.title !== undefined) {
      const sanitizedTitle = this.sanitizeText(dto.title);
      if (!sanitizedTitle || sanitizedTitle.length < 3) {
        throw new BadRequestException('Announcement title must be at least 3 characters long.');
      }
      dataToUpdate.title = sanitizedTitle;
    }

    if (dto.body !== undefined) {
      const sanitizedBody = this.sanitizeText(dto.body);
      if (!sanitizedBody || sanitizedBody.length < 5) {
        throw new BadRequestException('Announcement body text must be at least 5 characters long.');
      }
      dataToUpdate.body = sanitizedBody;
    }

    if (dto.severity !== undefined) {
      dataToUpdate.severity = dto.severity;
    }

    if (dto.audience !== undefined) {
      dataToUpdate.audience = dto.audience;
      if (dto.audience === AnnouncementAudience.SPECIFIC_ORGANIZATION) {
        if (!dto.targetOrganizationId && !announcement.targetOrganizationId) {
          throw new BadRequestException(
            'Target organization ID is required when audience is SPECIFIC_ORGANIZATION.',
          );
        }
        if (dto.targetOrganizationId) {
          await this.validateOrganizationExists(dto.targetOrganizationId);
          dataToUpdate.targetOrganizationId = dto.targetOrganizationId;
        }
      } else {
        dataToUpdate.targetOrganizationId = null;
      }
    } else if (dto.targetOrganizationId !== undefined) {
      if (announcement.audience === AnnouncementAudience.SPECIFIC_ORGANIZATION) {
        await this.validateOrganizationExists(dto.targetOrganizationId);
        dataToUpdate.targetOrganizationId = dto.targetOrganizationId;
      }
    }

    if (dto.scheduledAt !== undefined) {
      dataToUpdate.scheduledAt = dto.scheduledAt ? new Date(dto.scheduledAt) : null;
    }

    if (dto.expiresAt !== undefined) {
      dataToUpdate.expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : null;
    }

    if (dto.sendEmail !== undefined) {
      dataToUpdate.sendEmail = Boolean(dto.sendEmail);
    }

    const updated = await this.prisma.platformAnnouncement.update({
      where: { id },
      data: dataToUpdate,
      include: {
        creator: {
          select: { id: true, fullName: true, email: true, role: true },
        },
      },
    });

    await this.auditLogsService.log({
      action: 'ANNOUNCEMENT_UPDATED',
      entityType: 'PlatformAnnouncement',
      entityId: updated.id,
      actorId: operatorId,
      metadata: {
        updatedFields: Object.keys(dataToUpdate),
        status: updated.status,
      },
    });

    return updated;
  }

  /**
   * Publish an announcement (DRAFT or SCHEDULED -> PUBLISHED). Triggers server-side email dispatch if enabled.
   */
  async publish(id: string, operatorId: string) {
    const announcement = await this.findOne(id);

    if (
      announcement.status !== AnnouncementStatus.DRAFT &&
      announcement.status !== AnnouncementStatus.SCHEDULED
    ) {
      throw new BadRequestException(
        `Cannot publish announcement in ${announcement.status} status. Only DRAFT or SCHEDULED announcements can be published.`,
      );
    }

    let emailStatus: EmailDeliveryStatus = EmailDeliveryStatus.NOT_REQUESTED;
    let emailSentAt: Date | null = null;
    let emailRecipientCount = 0;
    let emailErrorDetails: string | null = null;

    if (announcement.sendEmail) {
      emailStatus = EmailDeliveryStatus.QUEUED;
      const recipientEmails = await this.resolveRecipientEmails(
        announcement.audience,
        announcement.targetOrganizationId,
      );

      if (recipientEmails.length > 0) {
        const dispatchResult = await this.emailService.sendPlatformEmail({
          to: recipientEmails,
          subject: announcement.title,
          bodyText: announcement.body,
          announcementId: announcement.id,
        });

        if (dispatchResult.success) {
          emailStatus = EmailDeliveryStatus.SENT;
          emailSentAt = new Date();
          emailRecipientCount = dispatchResult.recipientCount;
        } else {
          emailStatus = EmailDeliveryStatus.FAILED;
          emailErrorDetails = dispatchResult.errorDetails || 'Email dispatch failed.';
        }
      } else {
        emailStatus = EmailDeliveryStatus.SENT;
        emailSentAt = new Date();
        emailRecipientCount = 0;
      }
    }

    const updated = await this.prisma.platformAnnouncement.update({
      where: { id },
      data: {
        status: AnnouncementStatus.PUBLISHED,
        publishedAt: new Date(),
        emailDeliveryStatus: emailStatus,
        emailSentAt,
        emailRecipientCount,
        emailErrorDetails,
      },
      include: {
        creator: {
          select: { id: true, fullName: true, email: true, role: true },
        },
      },
    });

    await this.auditLogsService.log({
      action: 'ANNOUNCEMENT_PUBLISHED',
      entityType: 'PlatformAnnouncement',
      entityId: updated.id,
      actorId: operatorId,
      metadata: {
        title: updated.title,
        severity: updated.severity,
        audience: updated.audience,
        targetOrganizationId: updated.targetOrganizationId,
        sendEmail: updated.sendEmail,
        emailDeliveryStatus: updated.emailDeliveryStatus,
        emailRecipientCount: updated.emailRecipientCount,
      },
    });

    return updated;
  }

  /**
   * Cancel an announcement (DRAFT or SCHEDULED -> CANCELLED).
   */
  async cancel(id: string, operatorId: string) {
    const announcement = await this.findOne(id);

    if (
      announcement.status !== AnnouncementStatus.DRAFT &&
      announcement.status !== AnnouncementStatus.SCHEDULED
    ) {
      throw new BadRequestException(
        `Cannot cancel announcement in ${announcement.status} status. Only DRAFT or SCHEDULED announcements can be cancelled.`,
      );
    }

    const updated = await this.prisma.platformAnnouncement.update({
      where: { id },
      data: {
        status: AnnouncementStatus.CANCELLED,
        cancelledAt: new Date(),
      },
      include: {
        creator: {
          select: { id: true, fullName: true, email: true, role: true },
        },
      },
    });

    await this.auditLogsService.log({
      action: 'ANNOUNCEMENT_CANCELLED',
      entityType: 'PlatformAnnouncement',
      entityId: updated.id,
      actorId: operatorId,
      metadata: {
        title: updated.title,
        previousStatus: announcement.status,
      },
    });

    return updated;
  }

  /**
   * Validates target organization exists in database.
   */
  private async validateOrganizationExists(organizationId: string) {
    const org = await this.prisma.organizationControlState.findUnique({
      where: { organizationId },
    });
    if (!org) {
      throw new BadRequestException(`Target organization with ID "${organizationId}" does not exist in Control Plane.`);
    }
  }

  /**
   * Resolves recipient emails based on announcement audience.
   */
  private async resolveRecipientEmails(
    audience: AnnouncementAudience,
    targetOrgId?: string | null,
  ): Promise<string[]> {
    if (audience === AnnouncementAudience.ALL_OPERATORS) {
      const activeOperators = await this.prisma.operator.findMany({
        where: { status: 'ACTIVE' },
        select: { email: true },
      });
      return activeOperators.map((o) => o.email).filter(Boolean);
    }

    // For ALL_ORGANIZATIONS or SPECIFIC_ORGANIZATION, query active Control Plane operators with relevant administrative scope
    const operators = await this.prisma.operator.findMany({
      where: {
        status: 'ACTIVE',
        role: { in: ['PLATFORM_SUPER_ADMIN', 'COMMERCIAL_OPERATOR', 'OPERATIONS_ENGINEER'] },
      },
      select: { email: true },
    });

    return Array.from(new Set(operators.map((o) => o.email).filter(Boolean)));
  }

  /**
   * Sanitizes text inputs by stripping script injection and unsafe HTML tags.
   */
  private sanitizeText(text?: string): string {
    if (!text) return '';
    return text
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<[^>]+>/g, '')
      .trim();
  }
}
