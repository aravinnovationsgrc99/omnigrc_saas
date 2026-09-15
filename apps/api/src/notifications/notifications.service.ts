import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ResendMailerService } from './mailer/resend-mailer.service';
import { SlackNotifierService } from './slack/slack-notifier.service';
import { NotificationType, NotificationDto } from '@omnigrc/shared';
import { renderAlertEmailHtml, PriorityLevel } from './templates/email-templates';

export interface NotifyParams {
  organizationId: string;
  userId?: string;
  type: NotificationType;
  message: string;
  entityType: string;
  entityId: string;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly resendMailerService: ResendMailerService,
    private readonly slackNotifierService: SlackNotifierService,
  ) {}

  /**
   * Single internal entry point for all system notifications.
   * Fans out to:
   * (a) In-app Notification rows
   * (b) Resend Email (if user has emailNotifications === true)
   * (c) Slack Webhook (if org-relevant: MAPPING_OVERRIDDEN, POD_STATUS_CHANGED)
   */
  async notify(params: NotifyParams) {
    const { organizationId, userId, type, message, entityType, entityId } = params;

    // 1. Determine target users
    let targetUsers: { id: string; email: string; name: string; emailNotifications: boolean }[] = [];

    if (userId) {
      const u = await this.prisma.user.findFirst({
        where: { id: userId, organizationId },
        select: { id: true, email: true, name: true, emailNotifications: true },
      });
      if (u) targetUsers.push(u);
    } else {
      targetUsers = await this.prisma.user.findMany({
        where: { organizationId },
        select: { id: true, email: true, name: true, emailNotifications: true },
      });
    }

    if (targetUsers.length === 0) {
      this.logger.warn(`No target users found for notification in org ${organizationId}`);
      return;
    }

    // 2. Create in-app Notification database records
    const notificationRecords = await Promise.all(
      targetUsers.map((u) =>
        this.prisma.notification.create({
          data: {
            organizationId,
            userId: u.id,
            type,
            message,
            entityType,
            entityId,
            read: false,
          },
        }),
      ),
    );

    // Map notification types to PriorityLevel
    const priorityMap: Record<string, PriorityLevel> = {
      [NotificationType.TASK_ASSIGNED]: PriorityLevel.P0,
      [NotificationType.POD_STATUS_CHANGED]: PriorityLevel.P0,
      [NotificationType.MAPPING_OVERRIDDEN]: PriorityLevel.P0,
      [NotificationType.DUE_DATE_REMINDER]: PriorityLevel.P2,
      [NotificationType.WEEKLY_DIGEST]: PriorityLevel.P3,
      [NotificationType.RISK_ESCALATION]: PriorityLevel.P1,
    };
    const priority = priorityMap[type] || PriorityLevel.P0;

    // 3. Fan-out to Resend Email for users with emailNotifications enabled
    const emailRecipients = targetUsers.filter((u) => u.emailNotifications);
    for (const u of emailRecipients) {
      const notifRecord = notificationRecords.find((n) => n.userId === u.id);
      if (notifRecord?.emailSentAt) {
        // Skip if already marked sent
        continue;
      }

      const html = renderAlertEmailHtml({
        userName: u.name,
        title: `OMNiGRC Alert: ${type.replace(/_/g, ' ')}`,
        message,
        type,
        entityType,
        entityId,
      });

      const sentSuccess = await this.resendMailerService.sendEmail(
        {
          to: u.email,
          subject: `[OMNiGRC Alert] ${type.replace(/_/g, ' ')}`,
          html,
        },
        priority,
      );

      // On verified delivery success, durably persist emailSentAt timestamp in DB
      if (sentSuccess && notifRecord) {
        await this.prisma.notification.update({
          where: { id: notifRecord.id },
          data: { emailSentAt: new Date() },
        });
      }
    }

    // 4. Fan-out to Slack if Org Webhook exists & notification type is org-relevant
    // (MAPPING_OVERRIDDEN, POD_STATUS_CHANGED go to Slack; routine DUE_DATE_REMINDER does not)
    const slackRelevantTypes = [
      NotificationType.MAPPING_OVERRIDDEN,
      NotificationType.POD_STATUS_CHANGED,
    ];

    if (slackRelevantTypes.includes(type)) {
      const org = await this.prisma.organization.findUnique({
        where: { id: organizationId },
        select: { slackWebhookUrl: true, name: true },
      });

      if (org?.slackWebhookUrl) {
        await this.slackNotifierService.sendSlackAlert(org.slackWebhookUrl, {
          title: `${type.replace(/_/g, ' ')} in ${org.name}`,
          message,
          type,
          entityType,
          entityId,
        });
      }
    }
  }

  async getUserNotifications(organizationId: string, userId: string, query: { page?: number; limit?: number }) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(query.limit) || 15));
    const skip = (page - 1) * limit;

    const where = { organizationId, userId };

    const [items, total, unreadCount] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.notification.count({ where }),
      this.prisma.notification.count({ where: { ...where, read: false } }),
    ]);

    return {
      items: items.map((n) => ({
        id: n.id,
        organizationId: n.organizationId,
        userId: n.userId,
        type: n.type as NotificationType,
        message: n.message,
        entityType: n.entityType,
        entityId: n.entityId,
        read: n.read,
        createdAt: n.createdAt.toISOString(),
      })),
      total,
      unreadCount,
      page,
      limit,
    };
  }

  async getUnreadCount(organizationId: string, userId: string): Promise<number> {
    return this.prisma.notification.count({
      where: { organizationId, userId, read: false },
    });
  }

  async markRead(organizationId: string, userId: string, notificationId: string): Promise<NotificationDto> {
    const n = await this.prisma.notification.findFirst({
      where: { id: notificationId, organizationId, userId },
    });

    if (!n) {
      throw new NotFoundException('Notification not found');
    }

    const updated = await this.prisma.notification.update({
      where: { id: notificationId },
      data: { read: true },
    });

    return {
      id: updated.id,
      organizationId: updated.organizationId,
      userId: updated.userId,
      type: updated.type as NotificationType,
      message: updated.message,
      entityType: updated.entityType,
      entityId: updated.entityId,
      read: updated.read,
      createdAt: updated.createdAt.toISOString(),
    };
  }

  async markAllRead(organizationId: string, userId: string): Promise<{ count: number }> {
    const res = await this.prisma.notification.updateMany({
      where: { organizationId, userId, read: false },
      data: { read: true },
    });

    return { count: res.count };
  }
}
