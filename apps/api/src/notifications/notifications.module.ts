import { Global, Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { ResendMailerService } from './mailer/resend-mailer.service';
import { SlackNotifierService } from './slack/slack-notifier.service';
import { DueDateReminderCron } from './cron/due-date-reminder.cron';
import { WeeklyDigestCron } from './cron/weekly-digest.cron';
import { RiskEscalationCron } from './cron/risk-escalation.cron';
import { SchedulerLockService } from './cron/scheduler-lock.service';

import { ServiceControlModule } from '../service-control/service-control.module';

@Global()
@Module({
  imports: [ServiceControlModule],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    ResendMailerService,
    SlackNotifierService,
    SchedulerLockService,
    DueDateReminderCron,
    WeeklyDigestCron,
    RiskEscalationCron,
  ],
  exports: [NotificationsService, ResendMailerService, SlackNotifierService, SchedulerLockService],
})
export class NotificationsModule {}
