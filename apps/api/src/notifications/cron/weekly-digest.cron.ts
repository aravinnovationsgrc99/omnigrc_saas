import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { ResendMailerService } from '../mailer/resend-mailer.service';
import { renderWeeklyDigestHtml, PriorityLevel } from '../templates/email-templates';
import { NotificationType, Role, TaskStatus, RiskStatus } from '@omnigrc/shared';

import { LicenseVerificationService } from '../../license-verification/license-verification.service';

@Injectable()
export class WeeklyDigestCron {
  private readonly logger = new Logger(WeeklyDigestCron.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly resendMailerService: ResendMailerService,
    private readonly licenseVerificationService: LicenseVerificationService,
  ) {}

  @Cron('0 8 * * 1', { timeZone: 'UTC' })
  async handleWeeklyDigest() {
    const licenseState = await this.licenseVerificationService.getEvaluatedState();
    if (licenseState.state !== 'VALID') {
      this.logger.debug(`Skipping Monday Weekly Executive Digest cron job: license state is ${licenseState.state}.`);
      return;
    }

    this.logger.log('Running Monday Weekly Executive Digest cron job (UTC canonical timezone)...');


    const now = new Date();
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(now.getDate() - 7);

    // Fetch all active organizations
    const orgs = await this.prisma.organization.findMany({
      select: { id: true, name: true },
    });

    for (const org of orgs) {
      // 1. Two-phase Idempotency Check: check if weekly digest was already sent to this org in the past 6 days
      const existingDigestSent = await this.prisma.notification.findFirst({
        where: {
          organizationId: org.id,
          type: NotificationType.WEEKLY_DIGEST,
          createdAt: { gte: sevenDaysAgo },
          emailSentAt: { not: null },
        },
      });

      if (existingDigestSent) {
        this.logger.debug(`Idempotency Guard: Weekly digest already dispatched for org ${org.name} this week. Skipping.`);
        continue;
      }

      // 2. Fetch Admin recipients with email notifications enabled
      const adminUsers = await this.prisma.user.findMany({
        where: {
          organizationId: org.id,
          role: Role.ADMIN,
          emailNotifications: true,
        },
        select: { id: true, email: true, name: true },
      });

      if (adminUsers.length === 0) {
        continue;
      }

      // 3. Compute Org GRC Metrics
      const [pendingTasksCount, overdueTasksCount, openRisksCount, highRisksCount] = await Promise.all([
        this.prisma.complianceTask.count({
          where: { organizationId: org.id, status: { not: TaskStatus.COMPLETE }, deletedAt: null },
        }),
        this.prisma.complianceTask.count({
          where: {
            organizationId: org.id,
            status: { not: TaskStatus.COMPLETE },
            dueDate: { lt: now },
            deletedAt: null,
          },
        }),
        this.prisma.risk.count({
          where: { organizationId: org.id, status: { in: [RiskStatus.OPEN, RiskStatus.IN_TREATMENT] }, deletedAt: null },
        }),
        this.prisma.risk.count({
          where: {
            organizationId: org.id,
            status: { in: [RiskStatus.OPEN, RiskStatus.IN_TREATMENT] },
            score: { gte: 15 },
            deletedAt: null,
          },
        }),
      ]);

      // 4. Prepare Email Payload for Recipients
      const batchPayloads = adminUsers.map((u) => ({
        to: u.email,
        subject: `[OMNiGRC] Weekly Executive Compliance Digest - ${org.name}`,
        html: renderWeeklyDigestHtml({
          userName: u.name,
          orgName: org.name,
          pendingTasks: pendingTasksCount,
          overdueTasks: overdueTasksCount,
          openRisks: openRisksCount,
          highRisks: highRisksCount,
        }),
      }));

      // 5. Send via Batch Resend API (Priority Level P3) & inspect per-recipient result
      const batchResult = await this.resendMailerService.sendBatchEmail(batchPayloads, PriorityLevel.P3);

      const successfulAdmins = adminUsers.filter((u) => batchResult.successfulTos.includes(u.email));

      // 6. Record Notification in DB ONLY for verified successful recipients
      if (successfulAdmins.length > 0) {
        await this.prisma.notification.createMany({
          data: successfulAdmins.map((u) => ({
            organizationId: org.id,
            userId: u.id,
            type: NotificationType.WEEKLY_DIGEST,
            message: `Weekly Executive Digest dispatched: ${overdueTasksCount} overdue tasks, ${highRisksCount} high risks.`,
            entityType: 'ORGANIZATION',
            entityId: org.id,
            emailSentAt: new Date(),
          })),
        });
        this.logger.log(`Weekly Executive Digest successfully delivered to ${successfulAdmins.length} admins in ${org.name}.`);
      }

      if (batchResult.failedTos.length > 0) {
        this.logger.warn(
          `Weekly Executive Digest delivery failed for ${batchResult.failedTos.length} recipients in ${org.name}: ${batchResult.failedTos.join(', ')}`,
        );
      }
    }

    this.logger.log('Completed Monday Weekly Executive Digest cron execution.');
  }
}
