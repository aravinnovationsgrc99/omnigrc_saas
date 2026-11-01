import { Test, TestingModule } from '@nestjs/testing';
import { AssetsService } from './assets.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { NotFoundException } from '@nestjs/common';
import { AssetType, AssetCriticality, Role } from '@omnigrc/shared';

import { ResourceAuthorizationService } from '../auth/resource-authorization.service';
import { RisksService } from '../risks/risks.service';

describe('AssetsService', () => {
  let service: AssetsService;
  let prisma: jest.Mocked<any>;
  let auditLogsService: jest.Mocked<any>;
  let resourceAuthService: jest.Mocked<any>;
  let risksService: jest.Mocked<any>;

  beforeEach(async () => {
    prisma = {
      asset: {
        findMany: jest.fn(),
        count: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      user: {
        findFirst: jest.fn(),
      },
      auditLogEntry: {
        findMany: jest.fn(),
      },
    };

    auditLogsService = {
      log: jest.fn().mockResolvedValue({}),
    };

    resourceAuthService = {
      getScopeWhereClause: jest.fn().mockImplementation(async (ctx: any) => ({
        organizationId: ctx.organizationId,
      })),
      authorize: jest.fn().mockResolvedValue(undefined),
      validateHierarchyInvariants: jest.fn().mockResolvedValue(undefined),
    };

    risksService = {
      findAll: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AssetsService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditLogsService, useValue: auditLogsService },
        { provide: ResourceAuthorizationService, useValue: resourceAuthService },
        { provide: RisksService, useValue: risksService },
      ],
    }).compile();

    service = module.get<AssetsService>(AssetsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should list assets scoped strictly to organizationId', async () => {
    const mockAsset = {
      id: 'asset-1',
      organizationId: 'org-1',
      name: 'Server 1',
      type: 'HARDWARE',
      description: 'Primary app server',
      owner: 'SecOps',
      criticality: 'HIGH',
      vendorName: 'AWS',
      dataResidencyRegion: 'India',
      createdAt: new Date(),
      updatedAt: new Date(),
      createdById: 'user-1',
      deletedAt: null,
    };

    prisma.asset.findMany.mockResolvedValue([mockAsset]);
    prisma.asset.count.mockResolvedValue(1);

    const authCtx = { userId: 'user-1', organizationId: 'org-1', role: Role.ADMIN };
    const result = await service.findAll(authCtx, {});

    expect(prisma.asset.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: 'org-1',
          deletedAt: null,
        }),
      }),
    );
    expect(result.items.length).toBe(1);
    expect(result.items[0].name).toBe('Server 1');
  });

  it('should throw NotFoundException if asset belongs to another organization', async () => {
    prisma.asset.findFirst.mockResolvedValue(null);

    const authCtx = { userId: 'user-1', organizationId: 'org-1', role: Role.ADMIN };
    await expect(service.findOne(authCtx, 'asset-other-org')).rejects.toThrow(NotFoundException);
  });

  it('should log audit entry on asset creation', async () => {
    const newAsset = {
      id: 'asset-new',
      organizationId: 'org-1',
      name: 'DB Cluster',
      type: AssetType.DATA_STORE,
      owner: 'DBA',
      criticality: AssetCriticality.HIGH,
      createdAt: new Date(),
      updatedAt: new Date(),
      createdById: 'user-1',
    };

    prisma.asset.create.mockResolvedValue(newAsset);

    const authCtx = { userId: 'user-1', organizationId: 'org-1', role: Role.ADMIN };
    const result = await service.create(authCtx, {
      name: 'DB Cluster',
      type: AssetType.DATA_STORE,
      owner: 'DBA',
      criticality: AssetCriticality.HIGH,
    });

    expect(result.id).toBe('asset-new');
    expect(auditLogsService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'ASSET_CREATED',
        organizationId: 'org-1',
        actorId: 'user-1',
      }),
    );
  });

  describe('owner validation & tenant isolation', () => {
    it('should reject asset creation when owner is a user belonging to another organization', async () => {
      const foreignUserId = '00000000-0000-0000-0000-000000000999';
      prisma.user.findFirst.mockResolvedValue({
        id: foreignUserId,
        organizationId: 'org-other',
        memberships: [{ organizationId: 'org-other', status: 'ACTIVE' }],
      });

      const authCtx = { userId: 'user-1', organizationId: 'org-1', role: Role.ADMIN };
      await expect(
        service.create(authCtx, {
          name: 'Server A',
          type: AssetType.SOFTWARE,
          owner: foreignUserId,
          criticality: AssetCriticality.HIGH,
        }),
      ).rejects.toThrow('Assigned owner does not belong to this organization');
    });

    it('should reject asset creation when owner user ID does not exist', async () => {
      const nonExistentUserId = '00000000-0000-0000-0000-000000000404';
      prisma.user.findFirst.mockResolvedValue(null);

      const authCtx = { userId: 'user-1', organizationId: 'org-1', role: Role.ADMIN };
      await expect(
        service.create(authCtx, {
          name: 'Server B',
          type: AssetType.SOFTWARE,
          owner: nonExistentUserId,
          criticality: AssetCriticality.HIGH,
        }),
      ).rejects.toThrow(`Assigned owner user ID "${nonExistentUserId}" not found`);
    });

    it('should reject asset creation when owner has revoked membership', async () => {
      const revokedUserId = '00000000-0000-0000-0000-000000000005';
      prisma.user.findFirst.mockResolvedValue({
        id: revokedUserId,
        organizationId: 'org-1',
        memberships: [{ organizationId: 'org-1', status: 'REVOKED' }],
      });

      const authCtx = { userId: 'user-1', organizationId: 'org-1', role: Role.ADMIN };
      await expect(
        service.create(authCtx, {
          name: 'Server C',
          type: AssetType.SOFTWARE,
          owner: revokedUserId,
          criticality: AssetCriticality.HIGH,
        }),
      ).rejects.toThrow('Assigned owner does not have active membership in this organization');
    });

    it('should accept asset creation when owner is an active member in organization', async () => {
      const validUserId = '00000000-0000-0000-0000-000000000002';
      prisma.user.findFirst.mockResolvedValue({
        id: validUserId,
        organizationId: 'org-1',
        memberships: [{ organizationId: 'org-1', status: 'ACTIVE' }],
      });
      prisma.asset.create.mockResolvedValue({
        id: 'asset-created',
        organizationId: 'org-1',
        name: 'Server D',
        type: AssetType.SOFTWARE,
        owner: validUserId,
        criticality: AssetCriticality.HIGH,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdById: 'user-1',
      });

      const authCtx = { userId: 'user-1', organizationId: 'org-1', role: Role.ADMIN };
      const res = await service.create(authCtx, {
        name: 'Server D',
        type: AssetType.SOFTWARE,
        owner: validUserId,
        criticality: AssetCriticality.HIGH,
      });

      expect(res.id).toBe('asset-created');
    });

    it('should accept asset creation when owner is an email belonging to active member', async () => {
      const validEmail = 'compliance@meridian.com';
      prisma.user.findFirst.mockResolvedValue({
        id: '00000000-0000-0000-0000-000000000003',
        email: validEmail,
        organizationId: 'org-1',
        memberships: [{ organizationId: 'org-1', status: 'ACTIVE' }],
      });
      prisma.asset.create.mockResolvedValue({
        id: 'asset-email',
        organizationId: 'org-1',
        name: 'Server E',
        type: AssetType.SOFTWARE,
        owner: validEmail,
        criticality: AssetCriticality.HIGH,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdById: 'user-1',
      });

      const authCtx = { userId: 'user-1', organizationId: 'org-1', role: Role.ADMIN };
      const res = await service.create(authCtx, {
        name: 'Server E',
        type: AssetType.SOFTWARE,
        owner: validEmail,
        criticality: AssetCriticality.HIGH,
      });

      expect(res.id).toBe('asset-email');
    });

    it('should reject asset update when updated owner belongs to another organization', async () => {
      const existingAsset = {
        id: 'asset-1',
        organizationId: 'org-1',
        name: 'Server 1',
        type: AssetType.HARDWARE,
        owner: 'SecOps',
        criticality: AssetCriticality.HIGH,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdById: 'user-1',
        deletedAt: null,
      };
      prisma.asset.findFirst.mockResolvedValue(existingAsset);

      const foreignEmail = 'attacker@other-org.com';
      prisma.user.findFirst.mockResolvedValue({
        id: 'user-foreign',
        email: foreignEmail,
        organizationId: 'org-other',
      });

      const authCtx = { userId: 'user-1', organizationId: 'org-1', role: Role.ADMIN };
      await expect(
        service.update(authCtx, 'asset-1', { owner: foreignEmail }),
      ).rejects.toThrow('Assigned owner does not belong to this organization');
    });
  });

  describe('getRisksForAsset', () => {
    it('should return risks associated with the asset when asset belongs to organization', async () => {
      const mockAsset = {
        id: 'asset-1',
        organizationId: 'org-1',
        name: 'Web Server',
        type: AssetType.HARDWARE,
        owner: 'SecOps',
        criticality: AssetCriticality.HIGH,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdById: 'user-1',
        deletedAt: null,
      };

      const mockRisksResult = {
        items: [
          {
            id: 'risk-1',
            organizationId: 'org-1',
            title: 'Unpatched vulnerability',
            score: 16,
            scoreBand: 'HIGH',
            status: 'OPEN',
            owner: 'RiskLead',
            assetId: 'asset-1',
          },
        ],
        total: 1,
        page: 1,
        limit: 20,
      };

      prisma.asset.findFirst.mockResolvedValue(mockAsset);
      risksService.findAll.mockResolvedValue(mockRisksResult);

      const authCtx = { userId: 'user-1', organizationId: 'org-1', role: Role.ADMIN };
      const result = await service.getRisksForAsset(authCtx, 'asset-1', { page: 1, limit: 20 });

      expect(prisma.asset.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: 'asset-1',
            organizationId: 'org-1',
            deletedAt: null,
          }),
        }),
      );
      expect(risksService.findAll).toHaveBeenCalledWith(
        authCtx,
        expect.objectContaining({
          assetId: 'asset-1',
          page: 1,
          limit: 20,
        }),
      );
      expect(result).toEqual(mockRisksResult);
    });

    it('should throw NotFoundException if asset belongs to another organization', async () => {
      prisma.asset.findFirst.mockResolvedValue(null);

      const authCtx = { userId: 'user-1', organizationId: 'org-1', role: Role.ADMIN };
      await expect(service.getRisksForAsset(authCtx, 'asset-other-org', {})).rejects.toThrow(NotFoundException);
      expect(risksService.findAll).not.toHaveBeenCalled();
    });
  });
});
