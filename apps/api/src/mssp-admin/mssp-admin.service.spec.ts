import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { MsspAdminService } from './mssp-admin.service';
import { PrismaService } from '../prisma/prisma.service';
import { OrgType } from '@omnigrc/shared';

describe('MsspAdminService', () => {
  let service: MsspAdminService;
  let prisma: jest.Mocked<any>;

  beforeEach(async () => {
    prisma = {
      organization: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
      },
      user: { count: jest.fn() },
      risk: { count: jest.fn() },
      incident: { count: jest.fn() },
      complianceTask: { findMany: jest.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MsspAdminService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<MsspAdminService>(MsspAdminService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should reject a non-MSSP provider organization with code ORGANIZATION_NOT_MSSP_PROVIDER', async () => {
    prisma.organization.findUnique.mockResolvedValue({
      id: 'org-standalone',
      name: 'Standalone Medical',
      type: OrgType.STANDALONE,
    });

    try {
      await service.getManagedClients('org-standalone');
      fail('Expected ForbiddenException');
    } catch (err: any) {
      expect(err).toBeInstanceOf(ForbiddenException);
      const res = err.getResponse();
      expect(res.code).toBe('ORGANIZATION_NOT_MSSP_PROVIDER');
      expect(res.message).toBe('Authenticated organization is not an MSSP Provider.');
    }
  });

  it('should reject when organization does not exist', async () => {
    prisma.organization.findUnique.mockResolvedValue(null);

    await expect(service.getManagedClients('non-existent')).rejects.toThrow(ForbiddenException);
  });

  it('should return managed clients and computed metrics for authorized MSSP_PROVIDER', async () => {
    prisma.organization.findUnique.mockResolvedValue({
      id: 'mssp-org-1',
      name: 'CyberShield MSSP',
      type: OrgType.MSSP_PROVIDER,
    });

    const mockClients = [
      {
        id: 'client-1',
        name: 'Alpha Corp',
        type: OrgType.CLIENT_TENANT,
        primaryRegion: 'India',
        primaryFramework: 'ISO27001',
        createdAt: new Date('2026-01-01T00:00:00Z'),
        parentOrganizationId: 'mssp-org-1',
      },
    ];

    prisma.organization.findMany.mockResolvedValue(mockClients);
    prisma.user.count.mockResolvedValue(12);
    prisma.risk.count.mockResolvedValue(3);
    prisma.incident.count.mockResolvedValue(1);
    prisma.complianceTask.findMany.mockResolvedValue([
      { status: 'COMPLETE' },
      { status: 'COMPLETE' },
      { status: 'IN_PROGRESS' },
      { status: 'NOT_STARTED' },
    ]);

    const result = await service.getManagedClients('mssp-org-1');

    expect(prisma.organization.findMany).toHaveBeenCalledWith({
      where: { parentOrganizationId: 'mssp-org-1' },
      orderBy: { name: 'asc' },
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      id: 'client-1',
      name: 'Alpha Corp',
      type: OrgType.CLIENT_TENANT,
      primaryRegion: 'India',
      primaryFramework: 'ISO27001',
      createdAt: '2026-01-01T00:00:00.000Z',
      userCount: 12,
      openRiskCount: 3,
      openIncidentCount: 1,
      complianceCompletionRate: 50,
    });
  });

  it('CRITICAL TENANT ISOLATION: should only query clients where parentOrganizationId equals querying MSSP', async () => {
    prisma.organization.findUnique.mockResolvedValue({
      id: 'mssp-provider-a',
      name: 'MSSP Provider A',
      type: OrgType.MSSP_PROVIDER,
    });

    prisma.organization.findMany.mockResolvedValue([]);

    await service.getManagedClients('mssp-provider-a');

    expect(prisma.organization.findMany).toHaveBeenCalledWith({
      where: { parentOrganizationId: 'mssp-provider-a' },
      orderBy: { name: 'asc' },
    });
  });
});
