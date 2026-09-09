import { Injectable, Logger } from '@nestjs/common';
import { NotificationType } from '@omnigrc/shared';

@Injectable()
export class SlackNotifierService {
  private readonly logger = new Logger(SlackNotifierService.name);

  async sendSlackAlert(
    webhookUrl: string,
    params: {
      title: string;
      message: string;
      type: NotificationType;
      entityType: string;
      entityId: string;
    },
  ): Promise<boolean> {
    if (!webhookUrl) {
      return false;
    }

    const typeEmojiMap: Record<NotificationType, string> = {
      [NotificationType.MAPPING_OVERRIDDEN]: '⚠️',
      [NotificationType.POD_STATUS_CHANGED]: '🌐',
      [NotificationType.TASK_ASSIGNED]: '📋',
      [NotificationType.DUE_DATE_REMINDER]: '⏰',
    };

    const emoji = typeEmojiMap[params.type] || '🔔';

    const payload = {
      text: `${emoji} *[OMNiGRC Alert]* ${params.title}`,
      blocks: [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: `${emoji} OMNiGRC Platform Notification`,
            emoji: true,
          },
        },
        {
          type: 'section',
          fields: [
            {
              type: 'mrkdwn',
              text: `*Event Type:*\n\`${params.type}\``,
            },
            {
              type: 'mrkdwn',
              text: `*Entity:*\n${params.entityType} (\`${params.entityId}\`)`,
            },
          ],
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Details:*\n${params.message}`,
          },
        },
        {
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: `*OMNiGRC SaaS Platform* · ${new Date().toISOString()}`,
            },
          ],
        },
      ],
    };

    try {
      const res = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errText = await res.text();
        this.logger.error(`Slack webhook error HTTP ${res.status}: ${errText}`);
        return false;
      }

      this.logger.log(`Slack alert successfully sent for event ${params.type}`);
      return true;
    } catch (err: any) {
      this.logger.error(`Failed to post to Slack webhook: ${err.message}`, err.stack);
      return false;
    }
  }
}
