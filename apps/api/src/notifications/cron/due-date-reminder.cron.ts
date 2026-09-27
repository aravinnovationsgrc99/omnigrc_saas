import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications.service';
import { NotificationType, TaskStatus } from '@omnigrc/shared';
import { LicenseVerificationService } from '../../license-verification/license-verification.service';
import { EffectiveServiceStateResolver } from '../../service-control/effective-service-state-resolver.service';

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
  }
}
