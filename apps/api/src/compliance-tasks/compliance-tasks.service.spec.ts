import { Test, TestingModule } from '@nestjs/testing';
import { ComplianceTasksService } from './compliance-tasks.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { NotificationsService } from '../notifications/notifications.service';
import { TaskStatus } from '@omnigrc/shared';

describe('ComplianceTasksService', () => {
  let service: ComplianceTasksService;
  let prisma: jest.Mocked<any>;
  let auditLogsService: jest.Mocked<any>;
  let notificationsService: jest.Mocked<any>;

  beforeEach(async () => {
    prisma = {
      complianceTask: {
        findMany: jest.fn(),
        count: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
    };

    auditLogsService = {
      log: jest.fn().mockResolvedValue({}),
    };

    notificationsService = {
      notify: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ComplianceTasksService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditLogsService, useValue: auditLogsService },
        { provide: NotificationsService, useValue: notificationsService },
      ],
    }).compile();

    service = module.get<ComplianceTasksService>(ComplianceTasksService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should list tasks scoped to tenant organizationId', async () => {
    const mockTask = {
      id: 'task-1',
      organizationId: 'org-1',
      title: 'Review MFA logs',
      status: TaskStatus.NOT_STARTED,
      owner: 'SecOps',
      createdAt: new Date(),
      updatedAt: new Date(),
      createdById: 'user-1',
    };

    prisma.complianceTask.findMany.mockResolvedValue([mockTask]);
    prisma.complianceTask.count.mockResolvedValue(1);

    const res = await service.findAll('org-1', {});

    expect(prisma.complianceTask.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: 'org-1',
        }),
      }),
    );
    expect(res.items[0].title).toBe('Review MFA logs');
  });

  it('should update task status and log COMPLIANCE_TASK_STATUS_CHANGED audit event', async () => {
    const mockTask = {
      id: 'task-1',
      organizationId: 'org-1',
      title: 'Review MFA logs',
      status: TaskStatus.NOT_STARTED,
      owner: 'SecOps',
      createdAt: new Date(),
      updatedAt: new Date(),
      createdById: 'user-1',
    };

    const updatedTask = { ...mockTask, status: TaskStatus.IN_PROGRESS };

    prisma.complianceTask.findFirst.mockResolvedValue(mockTask);
    prisma.complianceTask.update.mockResolvedValue(updatedTask);

    const res = await service.updateStatus('org-1', 'user-1', 'task-1', TaskStatus.IN_PROGRESS);

    expect(res.status).toBe(TaskStatus.IN_PROGRESS);
    expect(auditLogsService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'COMPLIANCE_TASK_STATUS_CHANGED',
        organizationId: 'org-1',
        metadata: expect.objectContaining({
          previousStatus: TaskStatus.NOT_STARTED,
          newStatus: TaskStatus.IN_PROGRESS,
        }),
      }),
    );
  });
});
