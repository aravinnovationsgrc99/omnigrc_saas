import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException, ConflictException } from '@nestjs/common';
import { BusinessAuditsService } from './business-audits.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ResourceAuthorizationService } from '../auth/resource-authorization.service';
import { FindingStatus, CapaStatus, Role } from '@omnigrc/shared';

describe('Audit SoD and Multi-Tenant Negative Test Suite', () => {
  let service: BusinessAuditsService;
  let mockPrisma: any;
  let mockResourceAuth: any;
  let mockAuditLogs: any;
  let mockNotifications: any;

  beforeEach(async () => {
    mockPrisma = {
      auditFinding: {
        findFirst: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      auditCapa: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      user: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockImplementation(({ where }) => {
          if (where.id) {
            return Promise.resolve({
              id: where.id,
              organizationId: 'org-tenant-a',
              role: Role.ADMIN,
            });
          }
          return Promise.resolve(null);
        }),
      },
      auditFindingVerificationHistory: {
        create: jest.fn(),
      },
      $transaction: jest.fn().mockImplementation((cb) => cb(mockPrisma)),
      $queryRaw: jest.fn().mockResolvedValue([{ id: 'finding-1' }]),
    };

    mockResourceAuth = {
      assertResourceAccess: jest.fn().mockResolvedValue(true),
      getScopeWhereClause: jest.fn().mockResolvedValue({}),
    };

    mockAuditLogs = {
      log: jest.fn().mockResolvedValue(true),
    };

    mockNotifications = {
      notify: jest.fn().mockResolvedValue(true),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BusinessAuditsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ResourceAuthorizationService, useValue: mockResourceAuth },
        { provide: AuditLogsService, useValue: mockAuditLogs },
        { provide: NotificationsService, useValue: mockNotifications },
      ],
    }).compile();

    service = module.get<BusinessAuditsService>(BusinessAuditsService);
  });

  describe('1. Segregation of Duties (SoD) Negative Gates', () => {
    it('REJECTS verification when actor is the Finding Owner (403 Forbidden)', async () => {
      const ownerId = 'user-owner-123';
      mockPrisma.auditFinding.findFirst.mockResolvedValue({
        id: 'finding-1',
        organizationId: 'org-tenant-a',
        ownerId: ownerId,
        status: FindingStatus.READY_FOR_VERIFICATION,
        capas: [],
        assessment: { auditPlan: { ownerId: 'auditor-1' } },
      });

      const authCtx = {
        organizationId: 'org-tenant-a',
        userId: ownerId, // Same as finding owner
        role: Role.ADMIN,
      };

      await expect(
        service.verifyFinding(authCtx as any, 'finding-1', {
          status: FindingStatus.VERIFIED,
          verificationNotes: 'Self verification attempt',
        }),
      ).rejects.toThrow(ForbiddenException);

      await expect(
        service.verifyFinding(authCtx as any, 'finding-1', {
          status: FindingStatus.VERIFIED,
          verificationNotes: 'Self verification attempt',
        }),
      ).rejects.toMatchObject({
        response: {
          code: 'SEGREGATION_OF_DUTIES_VIOLATION',
        },
      });
    });

    it('REJECTS verification when actor is a CAPA Owner on the finding (403 Forbidden)', async () => {
      const capaOwnerId = 'user-capa-owner-456';
      mockPrisma.auditFinding.findFirst.mockResolvedValue({
        id: 'finding-1',
        organizationId: 'org-tenant-a',
        ownerId: 'different-finding-owner',
        status: FindingStatus.READY_FOR_VERIFICATION,
        capas: [
          { id: 'capa-1', ownerId: capaOwnerId },
        ],
        assessment: { auditPlan: { ownerId: 'auditor-1' } },
      });

      const authCtx = {
        organizationId: 'org-tenant-a',
        userId: capaOwnerId, // Capa owner
        role: Role.ADMIN,
      };

      await expect(
        service.verifyFinding(authCtx as any, 'finding-1', {
          status: FindingStatus.VERIFIED,
          verificationNotes: 'CAPA owner attempting verification',
        }),
      ).rejects.toThrow(ForbiddenException);

      await expect(
        service.verifyFinding(authCtx as any, 'finding-1', {
          status: FindingStatus.VERIFIED,
          verificationNotes: 'CAPA owner attempting verification',
        }),
      ).rejects.toMatchObject({
        response: {
          code: 'SEGREGATION_OF_DUTIES_VIOLATION',
        },
      });
    });
  });

  describe('2. Multi-Tenant Isolation Negative Gates', () => {
    it('REJECTS finding verification across tenant boundaries (404 Not Found)', async () => {
      // Finding belongs to tenant B, but query is filtered by authCtx.organizationId
      mockPrisma.auditFinding.findFirst.mockResolvedValue(null);

      const authCtx = {
        organizationId: 'org-tenant-a', // Tenant A
        userId: 'auditor-tenant-a',
        role: Role.ADMIN,
      };

      await expect(
        service.verifyFinding(authCtx as any, 'finding-from-tenant-b', {
          status: FindingStatus.VERIFIED,
          verificationNotes: 'Cross tenant attempt',
        }),
      ).rejects.toThrow(NotFoundException);

      expect(mockPrisma.auditFinding.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            id: 'finding-from-tenant-b',
            organizationId: 'org-tenant-a',
          },
        }),
      );
    });

    it('REJECTS CAPA update across tenant boundaries (404 Not Found)', async () => {
      mockPrisma.auditCapa.findFirst.mockResolvedValue(null);

      const authCtx = {
        organizationId: 'org-tenant-a',
        userId: 'user-tenant-a',
        role: Role.ADMIN,
      };

      await expect(
        service.updateCapa(authCtx as any, 'capa-from-tenant-b', {
          status: CapaStatus.COMPLETED,
        }),
      ).rejects.toThrow(NotFoundException);

      expect(mockPrisma.auditCapa.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            id: 'capa-from-tenant-b',
            organizationId: 'org-tenant-a',
          },
        }),
      );
    });
  });

  describe('3. Concurrency Conflict Negative Gates', () => {
    it('REJECTS verification when expectedVersion does not match current version (409 Conflict)', async () => {
      mockPrisma.auditFinding.findFirst.mockResolvedValue({
        id: 'finding-1',
        organizationId: 'org-tenant-a',
        ownerId: 'owner-1',
        status: FindingStatus.READY_FOR_VERIFICATION,
        version: 5, // Current is 5
        capas: [],
        assessment: { auditPlan: { ownerId: 'auditor-1' } },
      });

      const authCtx = {
        organizationId: 'org-tenant-a',
        userId: 'independent-auditor',
        role: Role.ADMIN,
      };

      await expect(
        service.verifyFinding(authCtx as any, 'finding-1', {
          status: FindingStatus.VERIFIED,
          verificationNotes: 'Stale version attempt',
          expectedVersion: 4, // Stale version
        }),
      ).rejects.toThrow(ConflictException);
    });
  });
});
