import { Injectable, Logger } from '@nestjs/common';

export interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

@Injectable()
export class ResendMailerService {
  private readonly logger = new Logger(ResendMailerService.name);
  private readonly apiKey: string | undefined;
  private readonly fromAddress: string;

  constructor() {
    this.apiKey = process.env.RESEND_API_KEY;
    this.fromAddress = process.env.RESEND_FROM || process.env.SMTP_FROM || 'OMNiGRC Notifications <notifications@omnigrc.com>';

    if (!this.apiKey) {
      this.logger.warn(
        'RESEND_API_KEY environment variable is absent. ResendMailer is running in MOCK MODE (emails logged to console).',
      );
    } else {
      this.logger.log('ResendMailer initialized with active API Key.');
    }
  }

  async sendEmail(params: SendEmailParams): Promise<boolean> {
    const { to, subject, html, text } = params;

    if (!this.apiKey) {
      // Mock Mode logging
      this.logger.log(`[MOCK EMAIL SENT] To: ${to} | Subject: "${subject}"`);
      this.logger.debug(`[MOCK EMAIL CONTENT]\nFrom: ${this.fromAddress}\nSubject: ${subject}\n\n${text || html}`);
      return true;
    }

    try {
      // Live API Call to Resend
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          from: this.fromAddress,
          to: [to],
          subject,
          html,
          text: text || html.replace(/<[^>]*>?/gm, ''),
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        this.logger.error(`Resend API HTTP ${response.status} Error: ${errorText}`);
        return false;
      }

      const resData = await response.json();
      this.logger.log(`Email successfully dispatched via Resend API to ${to} (ID: ${resData.id})`);
      return true;
    } catch (err: any) {
      this.logger.error(`Failed to send email via Resend API to ${to}: ${err.message}`, err.stack);
      return false;
    }
  }
}
