import { Test, TestingModule } from '@nestjs/testing';
import { AssetsService } from './assets.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { NotFoundException } from '@nestjs/common';
import { AssetType, AssetCriticality } from '@omnigrc/shared';

describe('AssetsService', () => {
  let service: AssetsService;
  let prisma: jest.Mocked<any>;
  let auditLogsService: jest.Mocked<any>;

  beforeEach(async () => {
    prisma = {
      asset: {
        findMany: jest.fn(),
        count: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      auditLogEntry: {
        findMany: jest.fn(),
      },
    };

    auditLogsService = {
      log: jest.fn().mockResolvedValue({}),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AssetsService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditLogsService, useValue: auditLogsService },
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

    const result = await service.findAll('org-1', {});

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

    await expect(service.findOne('org-1', 'asset-other-org')).rejects.toThrow(NotFoundException);
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

    const result = await service.create('org-1', 'user-1', {
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
});
