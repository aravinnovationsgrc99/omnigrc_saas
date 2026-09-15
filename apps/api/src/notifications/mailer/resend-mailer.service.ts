import { Injectable, Logger } from '@nestjs/common';
import { PriorityLevel } from '../templates/email-templates';

export interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export interface BatchItemResult {
  to: string;
  success: boolean;
  id?: string;
  error?: string;
}

export interface BatchSendResult {
  allSuccessful: boolean;
  results: BatchItemResult[];
  successfulTos: string[];
  failedTos: string[];
}

@Injectable()
export class ResendMailerService {
  private readonly logger = new Logger(ResendMailerService.name);
  private readonly apiKey: string | undefined;
  private readonly fromAddress: string;

  // Monthly email counter tracking for quota protection (Resend free tier: 3,000/mo)
  private monthlySentCount = 0;
  private currentMonthKey = this.getMonthlyKey();

  constructor() {
    this.apiKey = process.env.RESEND_API_KEY;
    this.fromAddress =
      process.env.RESEND_FROM ||
      process.env.SMTP_FROM ||
      'OMNiGRC Notifications <notifications@omnigrc.co>';

    if (!this.apiKey) {
      this.logger.warn(
        'RESEND_API_KEY environment variable is absent. ResendMailer is running in MOCK MODE (emails logged to console).',
      );
    } else {
      this.logger.log('ResendMailer initialized with active API Key.');
    }
  }

  /**
   * Check priority-based quota allowance.
   * Resend Free Tier limit: 3,000 emails/month (~100 emails/day).
   * Hierarchy:
   * - P0: Never suppressed (Critical Security, Auth, Task Assignment, Pod Status)
   * - P1: Suppressed at 95% quota (2,850/mo)
   * - P2: Suppressed at 85% quota (2,550/mo)
   * - P3: Suppressed at 75% quota (2,250/mo)
   */
  public checkQuotaAllowance(priority: PriorityLevel = PriorityLevel.P0): boolean {
    this.rotateMonthIfNeeded();

    if (priority === PriorityLevel.P0) return true;
    if (priority === PriorityLevel.P1 && this.monthlySentCount >= 2850) {
      this.logger.warn(`Quota Safety Guard: Suppressing P1 email dispatch (Monthly sent count: ${this.monthlySentCount}/3000)`);
      return false;
    }
    if (priority === PriorityLevel.P2 && this.monthlySentCount >= 2550) {
      this.logger.warn(`Quota Safety Guard: Suppressing P2 email dispatch (Monthly sent count: ${this.monthlySentCount}/3000)`);
      return false;
    }
    if (priority === PriorityLevel.P3 && this.monthlySentCount >= 2250) {
      this.logger.warn(`Quota Safety Guard: Suppressing P3 email dispatch (Monthly sent count: ${this.monthlySentCount}/3000)`);
      return false;
    }
    return true;
  }

  async sendEmail(params: SendEmailParams, priority: PriorityLevel = PriorityLevel.P0): Promise<boolean> {
    const { to, subject, html, text } = params;

    if (!this.checkQuotaAllowance(priority)) {
      return false;
    }

    if (!this.apiKey) {
      this.logger.log(`[MOCK EMAIL SENT] To: ${to} | Subject: "${subject}" | Priority: ${priority}`);
      this.logger.debug(`[MOCK EMAIL CONTENT]\nFrom: ${this.fromAddress}\nSubject: ${subject}\n\n${text || html}`);
      this.incrementSentCount(1);
      return true;
    }

    try {
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
        this.logger.error(`Resend API HTTP ${response.status} Error sending to ${to}: ${errorText}`);
        return false;
      }

      const resData = await response.json();
      this.logger.log(`Email successfully dispatched via Resend API to ${to} (ID: ${resData.id})`);
      this.incrementSentCount(1);
      return true;
    } catch (err: any) {
      this.logger.error(`Failed to send email via Resend API to ${to}: ${err.message}`, err.stack);
      return false;
    }
  }

  /**
   * Dispatch batch emails targeting https://api.resend.com/emails/batch.
   * Enforces array chunking of <= 100 emails per API call.
   * Inspects per-item response to report granular success/failure per recipient.
   */
  async sendBatchEmail(
    emails: SendEmailParams[],
    priority: PriorityLevel = PriorityLevel.P3,
  ): Promise<BatchSendResult> {
    const emptyResult: BatchSendResult = {
      allSuccessful: true,
      results: [],
      successfulTos: [],
      failedTos: [],
    };

    if (emails.length === 0) return emptyResult;

    if (!this.checkQuotaAllowance(priority)) {
      return {
        allSuccessful: false,
        results: emails.map((e) => ({ to: e.to, success: false, error: 'Quota exceeded' })),
        successfulTos: [],
        failedTos: emails.map((e) => e.to),
      };
    }

    if (!this.apiKey) {
      this.logger.log(`[MOCK BATCH EMAIL SENT] Batch Size: ${emails.length} | Priority: ${priority}`);
      const results: BatchItemResult[] = emails.map((e, idx) => ({
        to: e.to,
        success: true,
        id: `mock_batch_id_${Date.now()}_${idx}`,
      }));
      this.incrementSentCount(emails.length);
      return {
        allSuccessful: true,
        results,
        successfulTos: emails.map((e) => e.to),
        failedTos: [],
      };
    }

    // Chunk payloads into sub-arrays of max 100 items per request
    const CHUNK_SIZE = 100;
    const chunks: SendEmailParams[][] = [];
    for (let i = 0; i < emails.length; i += CHUNK_SIZE) {
      chunks.push(emails.slice(i, i + CHUNK_SIZE));
    }

    const allResults: BatchItemResult[] = [];

    for (const chunk of chunks) {
      try {
        const payload = chunk.map((e) => ({
          from: this.fromAddress,
          to: [e.to],
          subject: e.subject,
          html: e.html,
          text: e.text || e.html.replace(/<[^>]*>?/gm, ''),
        }));

        const response = await fetch('https://api.resend.com/emails/batch', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          const errorText = await response.text();
          this.logger.error(`Resend Batch API HTTP ${response.status} Error: ${errorText}`);
          for (const item of chunk) {
            allResults.push({ to: item.to, success: false, error: `HTTP ${response.status}: ${errorText}` });
          }
          continue;
        }

        const resData = await response.json();
        const batchItems = Array.isArray(resData) ? resData : resData?.data || [];

        let chunkSuccesses = 0;
        chunk.forEach((item, idx) => {
          const resItem = batchItems[idx];
          if (resItem?.id && !resItem?.error) {
            allResults.push({ to: item.to, success: true, id: resItem.id });
            chunkSuccesses++;
          } else {
            const errMsg = resItem?.error?.message || 'Unknown batch error from Resend API';
            this.logger.error(`Resend Batch Item Error for recipient ${item.to}: ${errMsg}`);
            allResults.push({ to: item.to, success: false, error: errMsg });
          }
        });

        this.incrementSentCount(chunkSuccesses);
      } catch (err: any) {
        this.logger.error(`Failed to dispatch batch email chunk via Resend API: ${err.message}`, err.stack);
        for (const item of chunk) {
          allResults.push({ to: item.to, success: false, error: err.message });
        }
      }
    }

    const successfulTos = allResults.filter((r) => r.success).map((r) => r.to);
    const failedTos = allResults.filter((r) => !r.success).map((r) => r.to);
    const allSuccessful = failedTos.length === 0 && successfulTos.length === emails.length;

    return {
      allSuccessful,
      results: allResults,
      successfulTos,
      failedTos,
    };
  }

  private rotateMonthIfNeeded() {
    const key = this.getMonthlyKey();
    if (key !== this.currentMonthKey) {
      this.currentMonthKey = key;
      this.monthlySentCount = 0;
    }
  }

  private getMonthlyKey(): string {
    const d = new Date();
    return `${d.getFullYear()}-${d.getMonth() + 1}`;
  }

  private incrementSentCount(count: number) {
    this.rotateMonthIfNeeded();
    this.monthlySentCount += count;
  }
}
