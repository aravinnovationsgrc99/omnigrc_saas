import { Test, TestingModule } from '@nestjs/testing';
import { DueDateReminderCron } from './due-date-reminder.cron';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications.service';
import { LicenseVerificationService } from '../../license-verification/license-verification.service';
import { NotificationType, TaskStatus } from '@omnigrc/shared';

describe('DueDateReminderCron (Batched Idempotency)', () => {
  let cron: DueDateReminderCron;
  let prisma: jest.Mocked<any>;
  let notificationsService: jest.Mocked<any>;
  let licenseVerificationService: jest.Mocked<any>;

  beforeEach(async () => {
    prisma = {
      complianceTask: {
        findMany: jest.fn(),
      },
      notification: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
      },
    };

    notificationsService = {
      notify: jest.fn().mockResolvedValue({ id: 'notif-1' }),
    };

    licenseVerificationService = {
      getEvaluatedState: jest.fn().mockResolvedValue({ state: 'VALID' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DueDateReminderCron,
        { provide: PrismaService, useValue: prisma },
        { provide: NotificationsService, useValue: notificationsService },
        { provide: LicenseVerificationService, useValue: licenseVerificationService },
      ],
    }).compile();

    cron = module.get<DueDateReminderCron>(DueDateReminderCron);
  });

  it('should skip execution if license is invalid', async () => {
    licenseVerificationService.getEvaluatedState.mockResolvedValueOnce({ state: 'EXPIRED' });
    await cron.handleDueDateReminders();

    expect(prisma.complianceTask.findMany).not.toHaveBeenCalled();
    expect(notificationsService.notify).not.toHaveBeenCalled();
  });

  it('should perform a single BATCHED findMany query for idempotency and send notifications for unsent tasks', async () => {
    const tasks = [
      { id: 'task-1', title: 'Task 1', organizationId: 'org-A', createdById: 'user-1', owner: 'Alice', dueDate: new Date() },
      { id: 'task-2', title: 'Task 2', organizationId: 'org-A', createdById: 'user-2', owner: 'Bob', dueDate: new Date() },
      { id: 'task-3', title: 'Task 3', organizationId: 'org-B', createdById: 'user-3', owner: 'Charlie', dueDate: new Date() },
    ];

    prisma.complianceTask.findMany.mockResolvedValueOnce(tasks);

    // Mock batched idempotency check returning that task-1 already had a notification sent today
    prisma.notification.findMany.mockResolvedValueOnce([
      { entityId: 'task-1' },
    ]);

    await cron.handleDueDateReminders();

    // Verify N+1 is eliminated: findFirst must NOT be called
    expect(prisma.notification.findFirst).not.toHaveBeenCalled();

    // Verify single batched lookup was executed with in filter
    expect(prisma.notification.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.notification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          entityType: 'COMPLIANCE_TASK',
          entityId: { in: ['task-1', 'task-2', 'task-3'] },
          type: NotificationType.DUE_DATE_REMINDER,
        }),
      }),
    );

    // Verify task-1 (already sent) is suppressed, while task-2 and task-3 are sent
    expect(notificationsService.notify).toHaveBeenCalledTimes(2);
    expect(notificationsService.notify).toHaveBeenCalledWith(
      expect.objectContaining({
        entityId: 'task-2',
        organizationId: 'org-A',
      }),
    );
    expect(notificationsService.notify).toHaveBeenCalledWith(
      expect.objectContaining({
        entityId: 'task-3',
        organizationId: 'org-B',
      }),
    );
  });

  it('should maintain duplicate cron execution idempotency (suppress all if already sent)', async () => {
    const tasks = [
      { id: 'task-1', title: 'Task 1', organizationId: 'org-A', createdById: 'user-1', owner: 'Alice', dueDate: new Date() },
    ];

    prisma.complianceTask.findMany.mockResolvedValue(tasks);
    prisma.notification.findMany.mockResolvedValue([{ entityId: 'task-1' }]);

    // First run
    await cron.handleDueDateReminders();
    expect(notificationsService.notify).not.toHaveBeenCalled();

    // Second run
    await cron.handleDueDateReminders();
    expect(notificationsService.notify).not.toHaveBeenCalled();
  });

  it('should respect tenant isolation during notification creation', async () => {
    const tasks = [
      { id: 'task-orgA', title: 'Org A Task', organizationId: 'org-A', createdById: 'user-A', owner: 'Alice', dueDate: new Date() },
      { id: 'task-orgB', title: 'Org B Task', organizationId: 'org-B', createdById: 'user-B', owner: 'Bob', dueDate: new Date() },
    ];

    prisma.complianceTask.findMany.mockResolvedValueOnce(tasks);
    prisma.notification.findMany.mockResolvedValueOnce([]); // Neither sent yet

    await cron.handleDueDateReminders();

    expect(notificationsService.notify).toHaveBeenCalledWith(
      expect.objectContaining({
        entityId: 'task-orgA',
        organizationId: 'org-A',
      }),
    );
    expect(notificationsService.notify).toHaveBeenCalledWith(
      expect.objectContaining({
        entityId: 'task-orgB',
        organizationId: 'org-B',
      }),
    );
  });
});
