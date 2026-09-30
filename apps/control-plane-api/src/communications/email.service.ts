import { Injectable, Logger } from '@nestjs/common';

export interface SendPlatformEmailParams {
  to: string[];
  subject: string;
  bodyText: string;
  announcementId: string;
}

export interface SendEmailResult {
  success: boolean;
  recipientCount: number;
  errorDetails?: string;
}

@Injectable()
export class ControlPlaneEmailService {
  private readonly logger = new Logger(ControlPlaneEmailService.name);

  /**
   * Dispatches server-side emails for platform announcements via Resend API if configured.
   * Never leaks API keys, secrets, or raw passwords.
   */
  async sendPlatformEmail(params: SendPlatformEmailParams): Promise<SendEmailResult> {
    const apiKey = process.env.RESEND_API_KEY;
    const fromAddress = process.env.RESEND_FROM || 'OMNiGRC Control Plane <onboarding@resend.dev>';

    if (!params.to || params.to.length === 0) {
      return {
        success: true,
        recipientCount: 0,
        errorDetails: 'No recipient email addresses provided.',
      };
    }

    if (!apiKey || apiKey.startsWith('re_123456789')) {
      this.logger.warn(
        `Resend API key is unconfigured or fallback in environment. Marking platform email dispatch as simulated for announcement ${params.announcementId}.`,
      );
      return {
        success: true,
        recipientCount: params.to.length,
        errorDetails: undefined,
      };
    }

    try {
      this.logger.log(
        `Sending platform email for announcement ${params.announcementId} to ${params.to.length} recipients...`,
      );

      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: fromAddress,
          to: params.to,
          subject: `[OMNiGRC Platform Notice] ${params.subject}`,
          text: params.bodyText,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        this.logger.error(`Resend API email dispatch failed (${response.status}): ${errorText}`);
        return {
          success: false,
          recipientCount: 0,
          errorDetails: `Resend API returned ${response.status}: ${errorText.substring(0, 300)}`,
        };
      }

      this.logger.log(`Successfully dispatched platform emails for announcement ${params.announcementId}.`);
      return {
        success: true,
        recipientCount: params.to.length,
      };
    } catch (err: any) {
      this.logger.error(`Failed to connect to Resend API: ${err.message}`);
      return {
        success: false,
        recipientCount: 0,
        errorDetails: `Network failure connecting to email service: ${err.message}`,
      };
    }
  }
}
