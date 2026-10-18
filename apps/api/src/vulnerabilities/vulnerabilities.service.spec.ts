import { Test, TestingModule } from '@nestjs/testing';
import { VulnerabilitiesService } from './vulnerabilities.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { NotFoundException } from '@nestjs/common';
import { VulnerabilitySeverity, VulnerabilityStatus, Role } from '@omnigrc/shared';

import { ResourceAuthorizationService } from '../auth/resource-authorization.service';

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
      vulnerabilityEvidence: {
        upsert: jest.fn(),
        deleteMany: jest.fn(),
      },
      evidence: {
        findFirst: jest.fn(),
      },
      user: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      department: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      asset: {
        findMany: jest.fn().mockResolvedValue([{ id: 'asset-1' }]),
      },
      $transaction: jest.fn((callback) => callback(prisma)),
    };

    auditLogsService = {
      log: jest.fn().mockResolvedValue({}),
    };

    const resourceAuthService = {
      getScopeWhereClause: jest.fn().mockImplementation(async (ctx: any) => ({
        organizationId: ctx.organizationId,
      })),
      authorize: jest.fn().mockResolvedValue(undefined),
      validateHierarchyInvariants: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VulnerabilitiesService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditLogsService, useValue: auditLogsService },
        { provide: ResourceAuthorizationService, useValue: resourceAuthService },
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

  describe('Remediation Owner Resolution', () => {
    it('should resolve organization member owner to display name and role', async () => {
      const mockVuln = {
        id: 'vuln-user-assigned',
        organizationId: 'org-1',
        title: 'SQLi',
        severity: VulnerabilitySeverity.HIGH,
        status: VulnerabilityStatus.OPEN,
        discoveredAt: new Date(),
        lastSeenAt: new Date(),
        remediationOwner: 'user-456',
        createdById: 'user-1',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      prisma.vulnerability.findFirst.mockResolvedValue(mockVuln);
      prisma.user.findMany.mockResolvedValue([
        {
          id: 'user-456',
          name: 'Alice SecOps',
          email: 'alice@company.com',
          role: Role.ANALYST,
          department: { name: 'Security Engineering' },
        },
      ]);
      prisma.department.findMany.mockResolvedValue([]);

      const authCtx = { userId: 'user-1', organizationId: 'org-1', role: Role.ADMIN };
      const result = await service.findOne(authCtx, 'vuln-user-assigned');

      expect(result.remediationOwnerId).toBe('user-456');
      expect(result.remediationOwnerName).toBe('Alice SecOps');
      expect(result.remediationOwnerRole).toBe(Role.ANALYST);
      expect(result.remediationTeamName).toBe('Security Engineering');
    });

    it('should resolve department owner to department name', async () => {
      const mockVuln = {
        id: 'vuln-dept-assigned',
        organizationId: 'org-1',
        title: 'Missing Headers',
        severity: VulnerabilitySeverity.LOW,
        status: VulnerabilityStatus.OPEN,
        discoveredAt: new Date(),
        lastSeenAt: new Date(),
        remediationOwner: 'dept-devops',
        createdById: 'user-1',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      prisma.vulnerability.findFirst.mockResolvedValue(mockVuln);
      prisma.user.findMany.mockResolvedValue([]);
      prisma.department.findMany.mockResolvedValue([
        { id: 'dept-devops', name: 'Infrastructure & DevOps' },
      ]);

      const authCtx = { userId: 'user-1', organizationId: 'org-1', role: Role.ADMIN };
      const result = await service.findOne(authCtx, 'vuln-dept-assigned');

      expect(result.remediationOwnerId).toBe('dept-devops');
      expect(result.remediationOwnerName).toBe('Infrastructure & DevOps');
      expect(result.remediationTeamName).toBe('Infrastructure & DevOps');
    });

    it('should fall back gracefully to raw string for historical records', async () => {
      const mockVuln = {
        id: 'vuln-legacy',
        organizationId: 'org-1',
        title: 'Legacy Finding',
        severity: VulnerabilitySeverity.MEDIUM,
        status: VulnerabilityStatus.OPEN,
        discoveredAt: new Date(),
        lastSeenAt: new Date(),
        remediationOwner: 'External Penetration Testing Vendor',
        createdById: 'user-1',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      prisma.vulnerability.findFirst.mockResolvedValue(mockVuln);
      prisma.user.findMany.mockResolvedValue([]);
      prisma.department.findMany.mockResolvedValue([]);

      const authCtx = { userId: 'user-1', organizationId: 'org-1', role: Role.ADMIN };
      const result = await service.findOne(authCtx, 'vuln-legacy');

      expect(result.remediationOwnerId).toBeNull();
      expect(result.remediationOwnerName).toBe('External Penetration Testing Vendor');
    });
  });

  describe('Vulnerability Evidence Association', () => {
    it('should attach evidence to vulnerability and log audit trail', async () => {
      prisma.vulnerability.findFirst.mockResolvedValue({
        id: 'vuln-1',
        organizationId: 'org-1',
        remediationOwner: 'SecOps',
        discoveredAt: new Date(),
        lastSeenAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      prisma.evidence.findFirst.mockResolvedValue({ id: 'ev-1', title: 'Burp Suite Scanner Report.pdf' });
      prisma.vulnerabilityEvidence.upsert.mockResolvedValue({});
      prisma.user.findMany.mockResolvedValue([]);
      prisma.department.findMany.mockResolvedValue([]);

      const authCtx = { userId: 'user-1', organizationId: 'org-1', role: Role.ADMIN };
      await service.attachEvidence(authCtx, 'vuln-1', 'ev-1');

      expect(prisma.vulnerabilityEvidence.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            vulnerabilityId_evidenceId: {
              vulnerabilityId: 'vuln-1',
              evidenceId: 'ev-1',
            },
          },
        }),
      );
      expect(auditLogsService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'VULNERABILITY_EVIDENCE_ATTACHED',
        }),
      );
    });

    it('should detach evidence without deleting the underlying vault file', async () => {
      prisma.vulnerability.findFirst.mockResolvedValue({ id: 'vuln-1', organizationId: 'org-1' });
      prisma.vulnerabilityEvidence.deleteMany.mockResolvedValue({ count: 1 });

      const authCtx = { userId: 'user-1', organizationId: 'org-1', role: Role.ADMIN };
      const res = await service.detachEvidence(authCtx, 'vuln-1', 'ev-1');

      expect(prisma.vulnerabilityEvidence.deleteMany).toHaveBeenCalledWith({
        where: { vulnerabilityId: 'vuln-1', evidenceId: 'ev-1' },
      });
      expect(res.success).toBe(true);
    });
  });
});
