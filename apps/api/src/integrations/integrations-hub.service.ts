import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { IntegrationConnectorDto } from '@omnigrc/shared';

@Injectable()
export class IntegrationsHubService {
  constructor(private readonly prisma: PrismaService) {}

  async getConnectors(organizationId: string): Promise<IntegrationConnectorDto[]> {
    const isResendConfigured = !!process.env.RESEND_API_KEY || !!process.env.SMTP_HOST;
    const isSlackConfigured = !!process.env.SLACK_WEBHOOK_URL || !!process.env.DEFAULT_SLACK_WEBHOOK_URL;
    const isGeminiConfigured = !!process.env.GEMINI_API_KEY;
    const isClaudeConfigured = !!process.env.ANTHROPIC_API_KEY;

    return [
      {
        id: 'resend-email',
        name: 'Resend Email Service',
        category: 'EMAIL',
        status: isResendConfigured ? 'CONFIGURED' : 'AVAILABLE',
        description: 'Transactional email notification delivery service for due-date reminders and digests.',
        details: { provider: isResendConfigured ? 'Resend API / SMTP' : 'Console Mock Provider' },
      },
      {
        id: 'slack-webhooks',
        name: 'Slack Notification Webhooks',
        category: 'COLLABORATION',
        status: isSlackConfigured ? 'CONFIGURED' : 'NOT_CONFIGURED',
        description: 'Real-time alert dispatching for high-severity risks, audit findings, and task assignments.',
        details: { activeWebhook: isSlackConfigured ? 'Webhook Configured (Masked)' : 'None' },
      },
      {
        id: 'google-gemini-ai',
        name: 'Google Gemini Pro LLM',
        category: 'AI_LLM',
        status: isGeminiConfigured ? 'CONFIGURED' : 'AVAILABLE',
        description: 'Primary AI LLM router model for compliance framework control mapping & GRC assistance.',
        details: { model: 'gemini-1.5-flash', tier: 'TIER_1' },
      },
      {
        id: 'anthropic-claude-ai',
        name: 'Anthropic Claude 3.5 Sonnet',
        category: 'AI_LLM',
        status: isClaudeConfigured ? 'CONFIGURED' : 'AVAILABLE',
        description: 'Secondary AI LLM model for high-precision policy analysis and risk assistance.',
        details: { model: 'claude-3-5-sonnet', tier: 'TIER_2' },
      },
      {
        id: 'jira-software',
        name: 'Atlassian Jira Software',
        category: 'COLLABORATION',
        status: 'NOT_CONFIGURED',
        description: 'Future Roadmap: Bi-directional issue sync for vulnerability remediation tasks and audit CAPA tracking.',
        details: { syncEnabled: false, capability: 'Future Architecture Item' },
      },
      {
        id: 'google-workspace',
        name: 'Google Workspace Directory',
        category: 'COLLABORATION',
        status: 'NOT_CONFIGURED',
        description: 'Future Roadmap: User identity and organization directory synchronization service.',
        details: { syncEnabled: false, capability: 'Future Architecture Item' },
      },
    ];
  }
}
