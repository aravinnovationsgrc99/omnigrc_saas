import { Global, Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { ResendMailerService } from './mailer/resend-mailer.service';
import { SlackNotifierService } from './slack/slack-notifier.service';
import { DueDateReminderCron } from './cron/due-date-reminder.cron';

@Global()
@Module({
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    ResendMailerService,
    SlackNotifierService,
    DueDateReminderCron,
  ],
  exports: [NotificationsService, ResendMailerService, SlackNotifierService],
})
export class NotificationsModule {}
