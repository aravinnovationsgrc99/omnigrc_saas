import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications.service';
import { renderRiskEscalationHtml, PriorityLevel } from '../templates/email-templates';
import { ResendMailerService } from '../mailer/resend-mailer.service';
import { NotificationType, Role, RiskStatus } from '@omnigrc/shared';
import { LicenseVerificationService } from '../../license-verification/license-verification.service';
import { EffectiveServiceStateResolver } from '../../service-control/effective-service-state-resolver.service';

@Injectable()
export class RiskEscalationCron {
  private readonly logger = new Logger(RiskEscalationCron.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
    private readonly resendMailerService: ResendMailerService,
    private readonly licenseVerificationService: LicenseVerificationService,
    private readonly effectiveServiceStateResolver: EffectiveServiceStateResolver,
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

    const highRisksRaw = await this.prisma.risk.findMany({
      where: {
        score: { gte: 15 },
        status: { in: [RiskStatus.OPEN, RiskStatus.IN_TREATMENT] },
        deletedAt: null,
      },
      include: {
        organization: {
          select: {
            controlStateProjection: { select: { state: true } },
          },
        },
      },
    });

    const eligibleRisks: typeof highRisksRaw = [];
    for (const risk of highRisksRaw) {
      const state = risk.organization?.controlStateProjection?.state;
      if (state && ['SUSPENDED', 'DISABLED', 'DECOMMISSIONED'].includes(state)) {
        continue;
      }

      // Check CP-3 Capability Controls
      const riskCap = await this.effectiveServiceStateResolver.resolveEffectiveState(risk.organizationId, 'GRC_CORE_RISKS');
      if (!riskCap.isAvailable) {
        continue;
      }

      const emailCap = await this.effectiveServiceStateResolver.resolveEffectiveState(risk.organizationId, 'NOTIFICATIONS_EMAIL');
      if (!emailCap.isAvailable) {
        continue;
      }

      eligibleRisks.push(risk);
    }

    this.logger.log(`Found ${eligibleRisks.length} unmitigated high-severity risks (score >= 15) for active organizations.`);

    if (eligibleRisks.length === 0) {
      this.logger.log('Completed daily High-Risk SLA Escalation cron execution.');
      return;
    }

    const riskIds = eligibleRisks.map((risk) => risk.id);

    const existingEscalationsToday = await this.prisma.notification.findMany({
      where: {
        entityType: 'RISK',
        entityId: { in: riskIds },
        type: NotificationType.RISK_ESCALATION,
        createdAt: { gte: startOfToday },
        emailSentAt: { not: null },
      },
      select: {
        entityId: true,
      },
    });

    const sentRiskIds = new Set(
      existingEscalationsToday
        .map((n) => n.entityId)
        .filter((id): id is string => Boolean(id)),
    );

    for (const risk of eligibleRisks) {
      if (sentRiskIds.has(risk.id)) {
        this.logger.debug(`Idempotency Guard: Risk escalation already dispatched today for risk ${risk.id}. Skipping.`);
        continue;
      }

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

      if (targetUsers.length === 0) {
        continue;
      }

      for (const user of targetUsers) {
        const html = renderRiskEscalationHtml({
          userName: user.name || user.email,
          riskTitle: risk.title,
          score: risk.score,
          owner: risk.owner,
          treatmentPlan: risk.status,
        });

        await this.resendMailerService.sendEmail(
          {
            to: user.email,
            subject: `[CRITICAL SLA ESCALATION] High-Severity Risk Unmitigated: ${risk.title}`,
            html,
            organizationId: risk.organizationId,
          },
          PriorityLevel.P0,
        );

        await this.prisma.notification.create({
          data: {
            organizationId: risk.organizationId,
            userId: user.id,
            message: `Unmitigated High Risk "${risk.title}" (Score: ${risk.score}) requires immediate treatment.`,
            type: NotificationType.RISK_ESCALATION,
            entityType: 'RISK',
            entityId: risk.id,
            emailSentAt: new Date(),
          },
        });
      }
    }

    this.logger.log('Completed daily High-Risk SLA Escalation cron execution.');
  }
}
