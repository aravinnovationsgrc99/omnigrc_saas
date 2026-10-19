import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications.service';
import { NotificationType, TaskStatus } from '@omnigrc/shared';
import { LicenseVerificationService } from '../../license-verification/license-verification.service';
import { EffectiveServiceStateResolver } from '../../service-control/effective-service-state-resolver.service';
import { TenantContext } from '../../tenant/tenant.context';

@Injectable()
export class DueDateReminderCron {
  private readonly logger = new Logger(DueDateReminderCron.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
    private readonly licenseVerificationService: LicenseVerificationService,
    private readonly effectiveServiceStateResolver: EffectiveServiceStateResolver,
  ) {}

  @Cron('0 0 * * *', { timeZone: 'UTC' })
  async handleDueDateReminders() {
    return TenantContext.runSystemContext(async () => {
      const licenseState = await this.licenseVerificationService.getEvaluatedState();
      if (licenseState.state !== 'VALID') {
        this.logger.debug(`Skipping daily due date reminder cron job: license state is ${licenseState.state}.`);
        return;
      }

    this.logger.log('Running daily due date reminder cron job (UTC canonical timezone)...');

    const now = new Date();
    const inThreeDays = new Date();
    inThreeDays.setDate(now.getDate() + 3);

    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // Find compliance tasks that are not complete and due within 3 days (or overdue)
    const pendingTasksRaw = await this.prisma.complianceTask.findMany({
      where: {
        status: { not: TaskStatus.COMPLETE },
        deletedAt: null,
        dueDate: {
          lte: inThreeDays,
        },
      },
      include: {
        organization: {
          select: {
            controlStateProjection: { select: { state: true } },
          },
        },
      },
    });

    const eligibleTasks: typeof pendingTasksRaw = [];
    for (const task of pendingTasksRaw) {
      const state = task.organization?.controlStateProjection?.state;
      if (state && ['SUSPENDED', 'DISABLED', 'DECOMMISSIONED'].includes(state)) {
        continue;
      }

      // Check CP-3 Capability Controls
      const taskCap = await this.effectiveServiceStateResolver.resolveEffectiveState(task.organizationId, 'GRC_CORE_TASKS');
      if (!taskCap.isAvailable) {
        continue;
      }

      const emailCap = await this.effectiveServiceStateResolver.resolveEffectiveState(task.organizationId, 'NOTIFICATIONS_EMAIL');
      if (!emailCap.isAvailable) {
        continue;
      }

      eligibleTasks.push(task);
    }

    this.logger.log(`Found ${eligibleTasks.length} compliance tasks approaching due date / overdue for active organizations.`);

    if (eligibleTasks.length === 0) {
      this.logger.log('Completed daily due date reminder cron execution.');
      return;
    }

    const taskIds = eligibleTasks.map((task) => task.id);

    // Batched Idempotency query
    const existingNotificationsToday = await this.prisma.notification.findMany({
      where: {
        entityType: 'COMPLIANCE_TASK',
        entityId: { in: taskIds },
        type: NotificationType.DUE_DATE_REMINDER,
        createdAt: { gte: startOfToday },
        emailSentAt: { not: null },
      },
      select: {
        entityId: true,
      },
    });

    const sentTaskIds = new Set(
      existingNotificationsToday
        .map((n) => n.entityId)
        .filter((id): id is string => Boolean(id)),
    );

    for (const task of eligibleTasks) {
      if (sentTaskIds.has(task.id)) {
        this.logger.debug(`Idempotency Guard: Due date reminder already sent today for task ${task.id}. Skipping.`);
        continue;
      }

      const isOverdue = task.dueDate ? new Date(task.dueDate) < now : false;
      const dueStr = task.dueDate ? new Date(task.dueDate).toLocaleDateString() : 'Unscheduled';

      await this.notificationsService.notify({
        organizationId: task.organizationId,
        userId: task.createdById,
        message: isOverdue
          ? `Compliance task "${task.title}" is overdue (was due on ${dueStr}). Please update task status immediately.`
          : `Compliance task "${task.title}" is due on ${dueStr}. Please submit evidence or update status.`,
        type: NotificationType.DUE_DATE_REMINDER,
        entityType: 'COMPLIANCE_TASK',
        entityId: task.id,
      });
    }

    this.logger.log('Completed daily due date reminder cron execution.');

    // 2. Policy Review Reminders (Criterion 8)
    await this.handlePolicyReviewReminders(now, startOfToday);

    // 3. Risk Treatment Due-Date Reminders (Criterion 13)
    await this.handleRiskTreatmentReminders(now, startOfToday);

    // 4. Vendor Assessment Action Due-Date Reminders (Criterion 16)
    await this.handleVendorAssessmentReminders(now, startOfToday);

    // 5. Vulnerability Remediation Due-Date Reminders (Criterion 19)
    await this.handleVulnerabilityRemediationReminders(now, startOfToday);
    });
  }

  private async handlePolicyReviewReminders(now: Date, startOfToday: Date): Promise<void> {
    if (!this.prisma.policy) return;

    try {
      const in30Days = new Date();
      in30Days.setDate(now.getDate() + 30);

      const policies = await this.prisma.policy.findMany({
        where: {
          status: 'PUBLISHED',
          deletedAt: null,
          reviewDate: { lte: in30Days },
        },
        take: 100,
      });

      if (policies.length === 0) return;

      const policyIds = policies.map((p) => p.id);
      const existing = await this.prisma.notification.findMany({
        where: {
          entityType: 'Policy',
          entityId: { in: policyIds },
          type: NotificationType.DUE_DATE_REMINDER,
          createdAt: { gte: startOfToday },
          emailSentAt: { not: null },
        },
        select: { entityId: true },
      });
      const sentIds = new Set(existing.map((n) => n.entityId));

      for (const policy of policies) {
        if (sentIds.has(policy.id)) continue;
        const isOverdue = policy.reviewDate ? new Date(policy.reviewDate) < now : false;
        const dueStr = policy.reviewDate ? new Date(policy.reviewDate).toLocaleDateString() : 'Unscheduled';

        await this.notificationsService.notify({
          organizationId: policy.organizationId,
          userId: policy.ownerId || undefined,
          message: isOverdue
            ? `Policy "${policy.title}" (${policy.code}) review is overdue (was due on ${dueStr}). Please initiate policy review.`
            : `Policy "${policy.title}" (${policy.code}) is scheduled for review on ${dueStr}.`,
          type: NotificationType.DUE_DATE_REMINDER,
          entityType: 'Policy',
          entityId: policy.id,
        });
      }
    } catch (err: any) {
      this.logger.error(`Error in policy review reminder handler: ${err.message}`);
    }
  }

  private async handleRiskTreatmentReminders(now: Date, startOfToday: Date): Promise<void> {
    if (!this.prisma.risk) return;

    try {
      const inSevenDays = new Date();
      inSevenDays.setDate(now.getDate() + 7);

      const risks = await this.prisma.risk.findMany({
        where: {
          status: { in: ['OPEN', 'IN_TREATMENT'] },
          deletedAt: null,
          treatmentDueDate: { lte: inSevenDays },
        },
        take: 100,
      });

      if (risks.length === 0) return;

      const riskIds = risks.map((r) => r.id);
      const existing = await this.prisma.notification.findMany({
        where: {
          entityType: 'Risk',
          entityId: { in: riskIds },
          type: NotificationType.DUE_DATE_REMINDER,
          createdAt: { gte: startOfToday },
          emailSentAt: { not: null },
        },
        select: { entityId: true },
      });
      const sentIds = new Set(existing.map((n) => n.entityId));

      for (const risk of risks) {
        if (sentIds.has(risk.id)) continue;
        const isOverdue = risk.treatmentDueDate ? new Date(risk.treatmentDueDate) < now : false;
        const dueStr = risk.treatmentDueDate ? new Date(risk.treatmentDueDate).toLocaleDateString() : 'Unscheduled';

        await this.notificationsService.notify({
          organizationId: risk.organizationId,
          userId: risk.treatmentOwner || risk.owner || undefined,
          message: isOverdue
            ? `Risk treatment for "${risk.title}" is overdue (was due on ${dueStr}). Please update treatment progress immediately.`
            : `Risk treatment for "${risk.title}" is due on ${dueStr}. Please record treatment actions.`,
          type: NotificationType.DUE_DATE_REMINDER,
          entityType: 'Risk',
          entityId: risk.id,
        });
      }
    } catch (err: any) {
      this.logger.error(`Error in risk treatment reminder handler: ${err.message}`);
    }
  }

  private async handleVendorAssessmentReminders(now: Date, startOfToday: Date): Promise<void> {
    if (!this.prisma.vendorAssessmentAction) return;

    try {
      const inSevenDays = new Date();
      inSevenDays.setDate(now.getDate() + 7);

      const actions = await this.prisma.vendorAssessmentAction.findMany({
        where: {
          status: 'OPEN',
          dueDate: { lte: inSevenDays },
        },
        take: 100,
      });

      if (actions.length === 0) return;

      const actionIds = actions.map((a) => a.id);
      const existing = await this.prisma.notification.findMany({
        where: {
          entityType: 'VendorAssessmentAction',
          entityId: { in: actionIds },
          type: NotificationType.DUE_DATE_REMINDER,
          createdAt: { gte: startOfToday },
          emailSentAt: { not: null },
        },
        select: { entityId: true },
      });
      const sentIds = new Set(existing.map((n) => n.entityId));

      for (const action of actions) {
        if (sentIds.has(action.id)) continue;
        const isOverdue = action.dueDate ? new Date(action.dueDate) < now : false;
        const dueStr = action.dueDate ? new Date(action.dueDate).toLocaleDateString() : 'Unscheduled';

        await this.notificationsService.notify({
          organizationId: action.organizationId,
          userId: action.owner || undefined,
          message: isOverdue
            ? `Vendor assessment remediation "${action.title}" is overdue (was due on ${dueStr}).`
            : `Vendor assessment remediation "${action.title}" is due on ${dueStr}.`,
          type: NotificationType.DUE_DATE_REMINDER,
          entityType: 'VendorAssessmentAction',
          entityId: action.id,
        });
      }
    } catch (err: any) {
      this.logger.error(`Error in vendor assessment reminder handler: ${err.message}`);
    }
  }

  private async handleVulnerabilityRemediationReminders(now: Date, startOfToday: Date): Promise<void> {
    if (!this.prisma.vulnerability) return;

    try {
      const inThreeDays = new Date();
      inThreeDays.setDate(now.getDate() + 3);

      const vulns = await this.prisma.vulnerability.findMany({
        where: {
          status: { in: ['OPEN', 'IN_REMEDIATION'] },
          deletedAt: null,
          dueDate: { lte: inThreeDays },
        },
        take: 100,
      });

      if (vulns.length === 0) return;

      const vulnIds = vulns.map((v) => v.id);
      const existing = await this.prisma.notification.findMany({
        where: {
          entityType: 'Vulnerability',
          entityId: { in: vulnIds },
          type: NotificationType.DUE_DATE_REMINDER,
          createdAt: { gte: startOfToday },
          emailSentAt: { not: null },
        },
        select: { entityId: true },
      });
      const sentIds = new Set(existing.map((n) => n.entityId));

      for (const vuln of vulns) {
        if (sentIds.has(vuln.id)) continue;
        const isOverdue = vuln.dueDate ? new Date(vuln.dueDate) < now : false;
        const dueStr = vuln.dueDate ? new Date(vuln.dueDate).toLocaleDateString() : 'Unscheduled';

        await this.notificationsService.notify({
          organizationId: vuln.organizationId,
          userId: vuln.remediationOwner || undefined,
          message: isOverdue
            ? `Remediation for vulnerability "${vuln.title}" (${vuln.severity}) is overdue (was due on ${dueStr}).`
            : `Remediation for vulnerability "${vuln.title}" (${vuln.severity}) is due on ${dueStr}.`,
          type: NotificationType.DUE_DATE_REMINDER,
          entityType: 'Vulnerability',
          entityId: vuln.id,
        });
      }
    } catch (err: any) {
      this.logger.error(`Error in vulnerability remediation reminder handler: ${err.message}`);
    }
  }
}
