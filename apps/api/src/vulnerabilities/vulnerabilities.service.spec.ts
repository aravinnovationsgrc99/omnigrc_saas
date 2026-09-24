import { Test, TestingModule } from '@nestjs/testing';
import { VulnerabilitiesService } from './vulnerabilities.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { NotFoundException } from '@nestjs/common';
import { VulnerabilitySeverity, VulnerabilityStatus, Role } from '@omnigrc/shared';

describe('VulnerabilitiesService', () => {
  let service: VulnerabilitiesService;
  let prisma: jest.Mocked<any>;
  let auditLogsService: jest.Mocked<any>;

  beforeEach(async () => {
    prisma = {
      vulnerability: {
        findMany: jest.fn(),
        count: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      vulnerabilityAsset: {
        createMany: jest.fn(),
      },
      $transaction: jest.fn((callback) => callback(prisma)),
    };

    auditLogsService = {
      log: jest.fn().mockResolvedValue({}),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VulnerabilitiesService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditLogsService, useValue: auditLogsService },
      ],
    }).compile();

    service = module.get<VulnerabilitiesService>(VulnerabilitiesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should create vulnerability with M:N asset relationships', async () => {
    const mockVuln = {
      id: 'vuln-1',
      organizationId: 'org-1',
      title: 'RCE in Web Server',
      severity: VulnerabilitySeverity.CRITICAL,
      status: VulnerabilityStatus.OPEN,
      discoveredAt: new Date(),
      lastSeenAt: new Date(),
      remediationOwner: 'SecOps',
      createdById: 'user-1',
      createdAt: new Date(),
      updatedAt: new Date(),
      affectedAssets: [
        { id: 'va-1', assetId: 'asset-1', asset: { name: 'App Server' } },
      ],
    };

    prisma.vulnerability.create.mockResolvedValue(mockVuln);

    const authCtx = { userId: 'user-1', organizationId: 'org-1', role: Role.ADMIN };
    const result = await service.create(authCtx, {
      title: 'RCE in Web Server',
      severity: VulnerabilitySeverity.CRITICAL,
      remediationOwner: 'SecOps',
      assetIds: ['asset-1'],
    });

    expect(result.id).toBe('vuln-1');
    expect(result.severity).toBe(VulnerabilitySeverity.CRITICAL);
  });

  it('should throw NotFoundException when fetching nonexistent vulnerability', async () => {
    prisma.vulnerability.findFirst.mockResolvedValue(null);

    const authCtx = { userId: 'user-1', organizationId: 'org-1', role: Role.ADMIN };
    await expect(service.findOne(authCtx, 'non-existent')).rejects.toThrow(NotFoundException);
  });
});
