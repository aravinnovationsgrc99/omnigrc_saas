import { Test, TestingModule } from '@nestjs/testing';
import { ControlsService } from './controls.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { NotificationsService } from '../notifications/notifications.service';
import { FrameworkEntitlementsService } from '../frameworks/framework-entitlements.service';
import { ResourceAuthorizationService } from '../auth/resource-authorization.service';

import { Role } from '@omnigrc/shared';

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
        {
          provide: FrameworkEntitlementsService,
          useValue: {
            assertEntitled: jest.fn().mockResolvedValue(true),
            getEntitledFrameworkIds: jest.fn().mockResolvedValue(null),
          },
        },
        {
          provide: ResourceAuthorizationService,
          useValue: {
            getScopeWhereClause: jest.fn().mockImplementation(async (ctx: any) => ({
              organizationId: ctx.organizationId,
            })),
            assertResourceAccess: jest.fn().mockResolvedValue(undefined),
            authorize: jest.fn().mockResolvedValue(undefined),
          },
        },
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

    const authCtx = { userId: 'user-1', organizationId: 'org-1', role: Role.ADMIN };
    const result = await service.findAll(authCtx, {});

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

    const authCtx = { userId: 'user-1', organizationId: 'org-1', role: Role.ADMIN };
    const res = await service.create(authCtx, {
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

  it('should create a direct manual mapping to a FrameworkReference', async () => {
    const mockControl = {
      id: 'ctrl-1',
      organizationId: 'org-1',
      name: 'Access Control',
      description: 'MFA',
      category: 'Access',
      createdAt: new Date(),
      updatedAt: new Date(),
      createdById: 'user-1',
    };

    const mockRef = {
      id: 'ref-a51',
      frameworkVersionId: 'ver-2022',
      identifier: 'A.5.1',
      title: 'Policies for information security',
      type: 'CONTROL',
      frameworkVersion: {
        id: 'ver-2022',
        frameworkId: 'fw-iso27001',
        version: '2022',
        framework: { id: 'fw-iso27001', code: 'ISO27001', name: 'ISO 27001' },
      },
    };

    const mockCreatedMapping = {
      id: 'map-1',
      controlId: 'ctrl-1',
      frameworkReferenceId: 'ref-a51',
      status: 'APPROVED',
      createdAt: new Date(),
      updatedAt: new Date(),
      frameworkReference: mockRef,
    };

    prisma.control.findFirst.mockResolvedValue(mockControl);
    prisma.frameworkReference = { findUnique: jest.fn().mockResolvedValue(mockRef) };
    prisma.controlFrameworkMapping.upsert = jest.fn().mockResolvedValue(mockCreatedMapping);

    const authCtx = { userId: 'user-1', organizationId: 'org-1', role: Role.ADMIN };
    const res = await service.createMapping(authCtx, 'ctrl-1', { frameworkReferenceId: 'ref-a51' });

    expect(res.referenceIdentifier).toBe('A.5.1');
    expect(res.status).toBe('APPROVED');
    expect(auditLogsService.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'MAPPING_CREATED', organizationId: 'org-1' }),
    );
  });

  it('should override a mapping to a FrameworkReference', async () => {
    const mockControl = { id: 'ctrl-1', organizationId: 'org-1' };
    const mockExistingMapping = {
      id: 'map-1',
      controlId: 'ctrl-1',
      status: 'SUGGESTED',
    };
    const mockTargetRef = {
      id: 'ref-a52',
      frameworkVersionId: 'ver-2022',
      identifier: 'A.5.2',
      title: 'Information security roles',
      frameworkVersion: {
        id: 'ver-2022',
        frameworkId: 'fw-iso27001',
        framework: { id: 'fw-iso27001', code: 'ISO27001' },
      },
    };
    const mockUpdatedMapping = {
      id: 'map-1',
      controlId: 'ctrl-1',
      frameworkReferenceId: 'ref-a52',
      status: 'OVERRIDDEN',
      createdAt: new Date(),
      updatedAt: new Date(),
      frameworkReference: mockTargetRef,
    };

    prisma.control.findFirst.mockResolvedValue(mockControl);
    prisma.controlFrameworkMapping.findFirst.mockResolvedValue(mockExistingMapping);
    prisma.frameworkReference = { findUnique: jest.fn().mockResolvedValue(mockTargetRef) };
    prisma.controlFrameworkMapping.update.mockResolvedValue(mockUpdatedMapping);

    const authCtx = { userId: 'user-1', organizationId: 'org-1', role: Role.ADMIN };
    const res = await service.signOffMapping(authCtx, 'ctrl-1', 'map-1', {
      decision: 'OVERRIDE',
      overrideReferenceId: 'ref-a52',
    });

    expect(res.status).toBe('OVERRIDDEN');
    expect(res.referenceIdentifier).toBe('A.5.2');
    expect(auditLogsService.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'MAPPING_OVERRIDDEN' }),
    );
  });
});
