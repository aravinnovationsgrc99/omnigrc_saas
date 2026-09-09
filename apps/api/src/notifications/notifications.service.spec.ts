import { Test, TestingModule } from '@nestjs/testing';
import { NotificationsService } from './notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { ResendMailerService } from './mailer/resend-mailer.service';
import { SlackNotifierService } from './slack/slack-notifier.service';

describe('NotificationsService', () => {
  let service: NotificationsService;
  let prisma: jest.Mocked<any>;
  let resendMailerService: jest.Mocked<any>;
  let slackNotifierService: jest.Mocked<any>;

  beforeEach(async () => {
    prisma = {
      notification: {
        findMany: jest.fn(),
        count: jest.fn(),
        createMany: jest.fn(),
      },
      user: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
      },
    };

    resendMailerService = {
      sendEmail: jest.fn().mockResolvedValue({ success: true }),
    };

    slackNotifierService = {
      sendSlackAlert: jest.fn().mockResolvedValue({ success: true }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        { provide: PrismaService, useValue: prisma },
        { provide: ResendMailerService, useValue: resendMailerService },
        { provide: SlackNotifierService, useValue: slackNotifierService },
      ],
    }).compile();

    service = module.get<NotificationsService>(NotificationsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should find notifications for user within organization', async () => {
    const mockNotif = {
      id: 'notif-1',
      organizationId: 'org-1',
      userId: 'user-1',
      type: 'TASK_ASSIGNED',
      message: 'New task assigned',
      entityType: 'ComplianceTask',
      entityId: 'task-1',
      read: false,
      createdAt: new Date(),
    };

    prisma.notification.findMany.mockResolvedValue([mockNotif]);
    prisma.notification.count.mockResolvedValue(1);

    const res = await service.getUserNotifications('org-1', 'user-1', {});

    expect(prisma.notification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: 'org-1',
          userId: 'user-1',
        }),
      }),
    );
    expect(res.items[0].message).toBe('New task assigned');
  });
});
