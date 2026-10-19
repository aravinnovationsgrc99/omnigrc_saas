import { Injectable, Logger, Optional } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { ResendMailerService } from '../mailer/resend-mailer.service';
import { renderWeeklyDigestHtml, PriorityLevel } from '../templates/email-templates';
import { NotificationType, Role, TaskStatus, RiskStatus } from '@omnigrc/shared';
import { LicenseVerificationService } from '../../license-verification/license-verification.service';
import { EffectiveServiceStateResolver } from '../../service-control/effective-service-state-resolver.service';
import { TenantContext } from '../../tenant/tenant.context';
import { SchedulerLockService, SCHEDULER_LOCKS } from './scheduler-lock.service';

@Injectable()
export class WeeklyDigestCron {
  private readonly logger = new Logger(WeeklyDigestCron.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly resendMailerService: ResendMailerService,
    private readonly licenseVerificationService: LicenseVerificationService,
    private readonly effectiveServiceStateResolver: EffectiveServiceStateResolver,
    @Optional() private readonly schedulerLockService?: SchedulerLockService,
  ) {}

  @Cron('0 8 * * 1', { timeZone: 'UTC' })
  async handleWeeklyDigest() {
    const executeJob = async () => {
      return TenantContext.runSystemContext(async () => {
        const licenseState = await this.licenseVerificationService.getEvaluatedState();
        if (licenseState.state !== 'VALID') {
          this.logger.debug(`Skipping Monday Weekly Executive Digest cron job: license state is ${licenseState.state}.`);
          return;
        }

        this.logger.log('Running Monday Weekly Executive Digest cron job (UTC canonical timezone)...');

        const now = new Date();
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(now.getDate() - 7);

        // Fetch all active organizations with control state projection
        const orgs = await this.prisma.organization.findMany({
          select: {
            id: true,
            name: true,
            controlStateProjection: { select: { state: true } },
          },
        });

        // Process organizations with bounded concurrency (batches of 5) for optimal performance and error isolation
        const BATCH_SIZE = 5;
        for (let i = 0; i < orgs.length; i += BATCH_SIZE) {
          const batch = orgs.slice(i, i + BATCH_SIZE);
          await Promise.allSettled(
            batch.map(async (org) => {
              try {
                await this.processOrgDigest(org, now, sevenDaysAgo);
              } catch (orgErr: any) {
                this.logger.error(
                  `Error processing weekly digest for org ${org.id} (${org.name}): ${orgErr.message}`,
                  orgErr.stack,
                );
              }
            }),
          );
        }

        this.logger.log('Completed Monday Weekly Executive Digest cron execution.');
      });
    };

    if (this.schedulerLockService) {
      const lockRes = await this.schedulerLockService.withLock(
        SCHEDULER_LOCKS.WEEKLY_DIGEST,
        'Weekly Executive Digest',
        executeJob,
      );
      return lockRes.result;
    }

    return executeJob();
  }

  private async processOrgDigest(org: any, now: Date, sevenDaysAgo: Date) {
    if (org.controlStateProjection && ['SUSPENDED', 'DISABLED', 'DECOMMISSIONED'].includes(org.controlStateProjection.state)) {
      this.logger.debug(`Skipping weekly digest for org ${org.name}: control state is ${org.controlStateProjection.state}.`);
      return;
    }

    // Check CP-3 NOTIFICATIONS_EMAIL capability
    const emailCap = await this.effectiveServiceStateResolver.resolveEffectiveState(org.id, 'NOTIFICATIONS_EMAIL');
    if (!emailCap.isAvailable) {
      this.logger.debug(`Skipping weekly digest for org ${org.name}: NOTIFICATIONS_EMAIL capability is disabled.`);
      return;
    }

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
      return;
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
      return;
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

    for (const admin of adminUsers) {
      const html = renderWeeklyDigestHtml({
        userName: admin.name || admin.email,
        orgName: org.name,
        pendingTasks: pendingTasksCount,
        overdueTasks: overdueTasksCount,
        openRisks: openRisksCount,
        highRisks: highRisksCount,
      });

      await this.resendMailerService.sendEmail(
        {
          to: admin.email,
          subject: `[OMNiGRC Executive Digest] Weekly Compliance Summary — ${org.name}`,
          html,
          organizationId: org.id,
        },
        PriorityLevel.P1,
      );

      await this.prisma.notification.create({
        data: {
          organizationId: org.id,
          userId: admin.id,
          message: `Weekly summary: ${overdueTasksCount} overdue tasks, ${highRisksCount} high-severity risks.`,
          type: NotificationType.WEEKLY_DIGEST,
          entityType: 'ORGANIZATION',
          entityId: org.id,
          emailSentAt: new Date(),
        },
      });
    }
  }
}

