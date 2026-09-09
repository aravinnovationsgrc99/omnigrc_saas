import { Test, TestingModule } from '@nestjs/testing';
import { ControlsService } from './controls.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { NotificationsService } from '../notifications/notifications.service';

describe('ControlsService', () => {
  let service: ControlsService;
  let prisma: jest.Mocked<any>;
  let auditLogsService: jest.Mocked<any>;
  let notificationsService: jest.Mocked<any>;

  beforeEach(async () => {
    prisma = {
      control: {
        findMany: jest.fn(),
        count: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      controlFrameworkMapping: {
        findMany: jest.fn(),
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
        ControlsService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditLogsService, useValue: auditLogsService },
        { provide: NotificationsService, useValue: notificationsService },
      ],
    }).compile();

    service = module.get<ControlsService>(ControlsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should list controls scoped to tenant organizationId', async () => {
    const mockControl = {
      id: 'ctrl-1',
      organizationId: 'org-1',
      name: 'Access Control Policy',
      description: 'MFA required',
      category: 'Access Control',
      createdAt: new Date(),
      updatedAt: new Date(),
      createdById: 'user-1',
      mappings: [],
    };

    prisma.control.findMany.mockResolvedValue([mockControl]);
    prisma.control.count.mockResolvedValue(1);

    const result = await service.findAll('org-1', {});

    expect(prisma.control.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: 'org-1',
        }),
      }),
    );
    expect(result.items[0].name).toBe('Access Control Policy');
  });

  it('should create a control and log audit event', async () => {
    const createdControl = {
      id: 'ctrl-new',
      organizationId: 'org-1',
      name: 'Encryption Policy',
      description: 'AES-256 for data at rest',
      category: 'Cryptography',
      createdAt: new Date(),
      updatedAt: new Date(),
      createdById: 'user-1',
      mappings: [],
    };

    prisma.control.create.mockResolvedValue(createdControl);

    const res = await service.create('org-1', 'user-1', {
      name: 'Encryption Policy',
      description: 'AES-256 for data at rest',
      category: 'Cryptography',
    });

    expect(res.name).toBe('Encryption Policy');
    expect(auditLogsService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'CONTROL_CREATED',
        organizationId: 'org-1',
      }),
    );
  });
});
