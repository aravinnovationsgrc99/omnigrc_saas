import { Controller, Get, Post, Body, UseGuards, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SlackNotifierService } from '../../notifications/slack/slack-notifier.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { Role, JwtPayload, NotificationType } from '@omnigrc/shared';

@Controller('integrations/slack')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SlackIntegrationController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly slackNotifierService: SlackNotifierService,
  ) {}

  @Get()
  @Roles(Role.ADMIN, Role.ANALYST)
  async getStatus(@CurrentUser() user: JwtPayload) {
    const org = await this.prisma.organization.findUnique({
      where: { id: user.organizationId },
      select: { slackWebhookUrl: true },
    });

    return {
      configured: Boolean(org?.slackWebhookUrl),
      webhookUrl: org?.slackWebhookUrl || null,
    };
  }

  /**
   * ADMIN-only: Save or update the organization's Slack Incoming Webhook URL.
   * NOTE (Secret Handling): In production, slackWebhookUrl must be encrypted at rest
   * using column-level envelope encryption (e.g. AWS KMS / HashiCorp Vault).
   */
  @Post('webhook-url')
  @Roles(Role.ADMIN)
  async updateWebhookUrl(
    @CurrentUser() user: JwtPayload,
    @Body('webhookUrl') webhookUrl: string,
  ) {
    const trimmed = (webhookUrl || '').trim();

    const org = await this.prisma.organization.update({
      where: { id: user.organizationId },
      data: { slackWebhookUrl: trimmed || null },
    });

    return {
      message: 'Slack webhook URL updated successfully.',
      configured: Boolean(org.slackWebhookUrl),
    };
  }

  /**
   * ADMIN-only: Send a test notification message to the configured Slack webhook URL.
   */
  @Post('test')
  @Roles(Role.ADMIN)
  async testIntegration(@CurrentUser() user: JwtPayload) {
    const org = await this.prisma.organization.findUnique({
      where: { id: user.organizationId },
      select: { slackWebhookUrl: true, name: true },
    });

    if (!org?.slackWebhookUrl) {
      throw new BadRequestException('No Slack webhook URL is configured for this organization.');
    }

    const success = await this.slackNotifierService.sendSlackAlert(org.slackWebhookUrl, {
      title: `Test Integration Alert from ${org.name}`,
      message: 'Slack incoming webhook integration is operational and correctly configured in OMNiGRC.',
      type: NotificationType.POD_STATUS_CHANGED,
      entityType: 'INTEGRATION',
      entityId: 'SLACK_TEST',
    });

    if (!success) {
      throw new BadRequestException('Failed to deliver test message to Slack webhook. Please verify the URL.');
    }

    return {
      success: true,
      message: 'Test alert successfully delivered to Slack.',
    };
  }
}
