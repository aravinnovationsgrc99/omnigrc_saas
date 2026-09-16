import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications.service';
import { renderRiskEscalationHtml, PriorityLevel } from '../templates/email-templates';
import { ResendMailerService } from '../mailer/resend-mailer.service';
import { NotificationType, Role, RiskStatus } from '@omnigrc/shared';

import { LicenseVerificationService } from '../../license-verification/license-verification.service';

@Injectable()
export class RiskEscalationCron {
  private readonly logger = new Logger(RiskEscalationCron.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
    private readonly resendMailerService: ResendMailerService,
    private readonly licenseVerificationService: LicenseVerificationService,
  ) {}

  @Cron('0 1 * * *', { timeZone: 'UTC' })
  async handleRiskEscalations() {
    const licenseState = await this.licenseVerificationService.getEvaluatedState();
    if (licenseState.state !== 'VALID') {
      this.logger.debug(`Skipping daily High-Risk SLA Escalation cron job: license state is ${licenseState.state}.`);
      return;
    }

    this.logger.log('Running daily High-Risk SLA Escalation cron job (UTC canonical timezone)...');


    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // Canonical Risk Score Definition: High Risk score >= 15 (matching RisksService.getScoreBand(score) === HIGH)
    const highRisks = await this.prisma.risk.findMany({
      where: {
        score: { gte: 15 },
        status: { in: [RiskStatus.OPEN, RiskStatus.IN_TREATMENT] },
        deletedAt: null,
      },
    });

    this.logger.log(`Found ${highRisks.length} unmitigated high-severity risks (score >= 15).`);

    for (const risk of highRisks) {
      // Two-phase Idempotency Check: check if risk escalation email was already dispatched today for this risk
      const existingEscalationToday = await this.prisma.notification.findFirst({
        where: {
          organizationId: risk.organizationId,
          entityType: 'RISK',
          entityId: risk.id,
          type: NotificationType.RISK_ESCALATION,
          createdAt: { gte: startOfToday },
          emailSentAt: { not: null },
        },
      });

      if (existingEscalationToday) {
        this.logger.debug(`Idempotency Guard: Risk escalation already dispatched today for risk ${risk.id}. Skipping.`);
        continue;
      }

      // Query Org Admins and Risk Owner (if user matching email exists)
      const targetUsers = await this.prisma.user.findMany({
        where: {
          organizationId: risk.organizationId,
          OR: [
            { role: Role.ADMIN },
            { email: risk.owner },
          ],
          emailNotifications: true,
        },
        select: { id: true, email: true, name: true },
      });

      if (targetUsers.length === 0) continue;

      const batchPayloads = targetUsers.map((u) => ({
        to: u.email,
        subject: `[OMNiGRC SLA ALERT] High-Severity Risk Escalation: ${risk.title}`,
        html: renderRiskEscalationHtml({
          userName: u.name,
          riskTitle: risk.title,
          score: risk.score,
          owner: risk.owner,
          treatmentPlan: risk.treatmentPlan,
        }),
      }));

      // Send via Resend API (Priority Level P1) & inspect per-recipient result
      const batchResult = await this.resendMailerService.sendBatchEmail(batchPayloads, PriorityLevel.P1);

      const successfulUsers = targetUsers.filter((u) => batchResult.successfulTos.includes(u.email));

      // Record Notification in DB ONLY for verified successful recipients
      if (successfulUsers.length > 0) {
        await this.prisma.notification.createMany({
          data: successfulUsers.map((u) => ({
            organizationId: risk.organizationId,
            userId: u.id,
            type: NotificationType.RISK_ESCALATION,
            message: `HIGH-RISK SLA ESCALATION: "${risk.title}" (Score: ${risk.score}). Owner: ${risk.owner}.`,
            entityType: 'RISK',
            entityId: risk.id,
            emailSentAt: new Date(),
          })),
        });
        this.logger.log(`High-risk escalation successfully sent for risk ${risk.id} to ${successfulUsers.length} recipients.`);
      }

      if (batchResult.failedTos.length > 0) {
        this.logger.warn(
          `High-risk escalation delivery failed for ${batchResult.failedTos.length} recipients on risk ${risk.id}: ${batchResult.failedTos.join(', ')}`,
        );
      }
    }

    this.logger.log('Completed daily High-Risk SLA Escalation cron execution.');
  }
}
