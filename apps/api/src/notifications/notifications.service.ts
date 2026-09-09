import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ResendMailerService } from './mailer/resend-mailer.service';
import { SlackNotifierService } from './slack/slack-notifier.service';
import { NotificationType, NotificationDto } from '@omnigrc/shared';

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
    await this.prisma.notification.createMany({
      data: targetUsers.map((u) => ({
        organizationId,
        userId: u.id,
        type,
        message,
        entityType,
        entityId,
        read: false,
      })),
    });

    // 3. Fan-out to Resend Email for users with emailNotifications enabled
    const emailRecipients = targetUsers.filter((u) => u.emailNotifications);
    for (const u of emailRecipients) {
      await this.resendMailerService.sendEmail({
        to: u.email,
        subject: `[OMNiGRC Alert] ${type.replace(/_/g, ' ')}`,
        html: `
          <div style="font-family: sans-serif; max-width: 560px; margin: 0 auto; padding: 20px; border: 1px solid #e2e6e4; border-radius: 8px;">
            <h2 style="color: #0F6E6A; font-size: 18px; margin-top: 0;">OMNiGRC Platform Alert</h2>
            <p style="font-size: 14px; color: #1B2430;">Hello <strong>${u.name}</strong>,</p>
            <p style="font-size: 14px; color: #5B6672; line-height: 1.5;">${message}</p>
            <div style="background: #FAFBFB; border: 1px solid #EDEFED; border-radius: 6px; padding: 12px; font-size: 12px; color: #6E7A8A; margin: 16px 0;">
              <div><strong>Event Type:</strong> ${type}</div>
              <div><strong>Entity:</strong> ${entityType} (${entityId})</div>
            </div>
            <p style="font-size: 12px; color: #8B95A1; margin-bottom: 0;">You received this because email notifications are enabled in your OMNiGRC profile settings.</p>
          </div>
        `,
      });
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
