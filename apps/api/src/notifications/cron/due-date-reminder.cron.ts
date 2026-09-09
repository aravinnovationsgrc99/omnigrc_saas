import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications.service';
import { NotificationType, TaskStatus } from '@omnigrc/shared';

@Injectable()
export class DueDateReminderCron {
  private readonly logger = new Logger(DueDateReminderCron.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async handleDueDateReminders() {
    this.logger.log('Running daily due date reminder cron job...');

    const now = new Date();
    const inThreeDays = new Date();
    inThreeDays.setDate(now.getDate() + 3);

    // Find compliance tasks that are not complete and due within 3 days (or overdue)
    const pendingTasks = await this.prisma.complianceTask.findMany({
      where: {
        status: { not: TaskStatus.COMPLETE },
        deletedAt: null,
        dueDate: {
          lte: inThreeDays,
        },
      },
    });

    this.logger.log(`Found ${pendingTasks.length} compliance tasks approaching due date / overdue.`);

    for (const task of pendingTasks) {
      const isOverdue = task.dueDate ? new Date(task.dueDate) < now : false;
      const dueStr = task.dueDate ? new Date(task.dueDate).toLocaleDateString() : 'Unscheduled';

      await this.notificationsService.notify({
        organizationId: task.organizationId,
        userId: task.createdById,
        type: NotificationType.DUE_DATE_REMINDER,
        message: isOverdue
          ? `OVERDUE COMPLIANCE TASK: "${task.title}" was due on ${dueStr}. Owner: ${task.owner}.`
          : `COMPLIANCE TASK REMINDER: "${task.title}" is due on ${dueStr}. Owner: ${task.owner}.`,
        entityType: 'COMPLIANCE_TASK',
        entityId: task.id,
      });
    }

    this.logger.log('Completed daily due date reminder cron execution.');
  }
}
