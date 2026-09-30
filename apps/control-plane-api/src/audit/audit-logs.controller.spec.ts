import { Test, TestingModule } from '@nestjs/testing';
import { AuditLogsController } from './audit-logs.controller';
import { ControlPlaneAuditLogsService } from './audit-logs.service';
import { RedactionService } from './redaction.service';
import { ControlPlanePrismaService } from '../prisma/prisma.service';
import { NotFoundException } from '@nestjs/common';

describe('AuditLogsController & Service (Control Plane)', () => {
  let controller: AuditLogsController;
  let service: ControlPlaneAuditLogsService;
  let redactionService: RedactionService;

  const mockAuditRecord = {
    id: 'audit-log-101',
    actorId: 'op_admin_1',
    actorRole: 'PLATFORM_SUPER_ADMIN',
    action: 'BREAK_GLASS_ACTION_EXECUTED',
    entityType: 'BreakGlassSession',
    entityId: 'bg-session-55',
    ipAddress: '127.0.0.1',
    correlationId: 'corr-bg-55',
    result: 'SUCCESS',
    metadata: {
      operation: 'EMERGENCY_ORG_SUSPEND',
      targetOrganizationId: 'org-blkashyap-001',
      password: 'secretPassword123',
      token: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
    },
    createdAt: new Date('2026-09-30T12:00:00.000Z'),
  };

  const mockPrisma = {
    controlPlaneAuditLog: {
      count: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuditLogsController],
      providers: [
        ControlPlaneAuditLogsService,
        RedactionService,
        { provide: ControlPlanePrismaService, useValue: mockPrisma },
      ],
    }).compile();

    controller = module.get<AuditLogsController>(AuditLogsController);
    service = module.get<ControlPlaneAuditLogsService>(ControlPlaneAuditLogsService);
    redactionService = module.get<RedactionService>(RedactionService);
  });

  describe('findAll', () => {
    it('1. should list audit logs with server-side pagination and metadata redaction', async () => {
      mockPrisma.controlPlaneAuditLog.count.mockResolvedValue(1);
      mockPrisma.controlPlaneAuditLog.findMany.mockResolvedValue([mockAuditRecord]);

      const res = await controller.findAll({ page: 1, limit: 20 });

      expect(res.data).toHaveLength(1);
      expect(res.meta).toEqual({
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1,
        hasNextPage: false,
        hasPreviousPage: false,
      });

      // Check sensitive field redaction
      expect(res.data[0].metadata.password).toBe('[REDACTED]');
      expect(res.data[0].metadata.token).toBe('[REDACTED]');
    });

    it('2. should apply filters for action, entityType, and search term', async () => {
      mockPrisma.controlPlaneAuditLog.count.mockResolvedValue(0);
      mockPrisma.controlPlaneAuditLog.findMany.mockResolvedValue([]);

      await controller.findAll({
        action: 'BREAK_GLASS_ACTION_EXECUTED',
        entityType: 'BreakGlassSession',
        search: 'blkashyap',
        page: 1,
        limit: 10,
      });

      expect(mockPrisma.controlPlaneAuditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            action: 'BREAK_GLASS_ACTION_EXECUTED',
            entityType: 'BreakGlassSession',
            OR: expect.any(Array),
          }),
          skip: 0,
          take: 10,
        }),
      );
    });

    it('3. should enforce maximum page size limit of 100', async () => {
      mockPrisma.controlPlaneAuditLog.count.mockResolvedValue(0);
      mockPrisma.controlPlaneAuditLog.findMany.mockResolvedValue([]);

      await controller.findAll({ limit: 500 });

      expect(mockPrisma.controlPlaneAuditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 100,
        }),
      );
    });
  });

  describe('findOne', () => {
    it('4. should return single audit log record with redacted metadata', async () => {
      mockPrisma.controlPlaneAuditLog.findUnique.mockResolvedValue(mockAuditRecord);

      const res = await controller.findOne('audit-log-101');

      expect(res.id).toBe('audit-log-101');
      expect(res.metadata.password).toBe('[REDACTED]');
    });

    it('5. should throw NotFoundException when audit log entry does not exist', async () => {
      mockPrisma.controlPlaneAuditLog.findUnique.mockResolvedValue(null);

      await expect(controller.findOne('non-existent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('Audit Log Immutability', () => {
    it('6. should confirm controller only exposes read-only GET methods', () => {
      const prototype = Object.getPrototypeOf(controller);
      const propertyNames = Object.getOwnPropertyNames(prototype);

      expect(propertyNames).toContain('findAll');
      expect(propertyNames).toContain('findOne');
      expect(propertyNames).not.toContain('create');
      expect(propertyNames).not.toContain('update');
      expect(propertyNames).not.toContain('delete');
    });
  });
});
