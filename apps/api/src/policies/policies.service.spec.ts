import { Test, TestingModule } from '@nestjs/testing';
import { PoliciesService } from './policies.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { PolicyStatus, Role } from '@omnigrc/shared';
import { ResourceAuthorizationService } from '../auth/resource-authorization.service';

describe('PoliciesService', () => {
  let service: PoliciesService;
  let prisma: jest.Mocked<any>;
  let auditLogsService: jest.Mocked<any>;

  beforeEach(async () => {
    prisma = {
      policy: {
        findMany: jest.fn(),
        count: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        groupBy: jest.fn(),
      },
      policyVersion: {
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      policyAttestation: {
        create: jest.fn(),
      },
      policyException: {
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      policyCategory: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation(async ({ data }: any) => ({
          id: `cat-${data.name}`,
          ...data,
          createdAt: new Date(),
          updatedAt: new Date(),
        })),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
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
        PoliciesService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditLogsService, useValue: auditLogsService },
        { provide: ResourceAuthorizationService, useValue: resourceAuthService },
      ],
    }).compile();

    service = module.get<PoliciesService>(PoliciesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should create policy draft and initial policy version', async () => {
    const mockCreatedPolicy = {
      id: 'pol-1',
      organizationId: 'org-1',
      code: 'POL-001',
      title: 'InfoSec Policy',
      category: 'Security',
      status: PolicyStatus.DRAFT,
      ownerId: 'user-1',
      reviewCadenceDays: 365,
      createdById: 'user-1',
      createdAt: new Date(),
      updatedAt: new Date(),
      publishedVersion: null,
      versions: [],
    };

    prisma.policy.create.mockResolvedValue(mockCreatedPolicy);

    const authCtx = { userId: 'user-1', organizationId: 'org-1', role: Role.ADMIN };
    const result = await service.create(authCtx, {
      code: 'POL-001',
      title: 'InfoSec Policy',
      category: 'Security',
      ownerId: 'user-1',
      initialContent: '# InfoSec Policy',
    });

    expect(prisma.policy.create).toHaveBeenCalled();
    expect(result.code).toBe('POL-001');
    expect(result.status).toBe(PolicyStatus.DRAFT);
  });

  it('should transition policy lifecycle state explicitly', async () => {
    const draftPolicy = {
      id: 'pol-1',
      organizationId: 'org-1',
      status: PolicyStatus.DRAFT,
      code: 'POL-001',
      title: 'Test',
      versions: [{ id: 'ver-1', versionNumber: '1.0' }],
    };

    prisma.policy.findFirst.mockResolvedValue(draftPolicy);
    prisma.policy.update.mockResolvedValue({
      ...draftPolicy,
      status: PolicyStatus.UNDER_REVIEW,
    });

    const authCtx = { userId: 'user-1', organizationId: 'org-1', role: Role.ADMIN };
    const updated = await service.submitForReview(authCtx, 'pol-1');
    expect(updated.status).toBe(PolicyStatus.UNDER_REVIEW);
  });

  it('should reject publish if policy is not approved', async () => {
    const draftPolicy = {
      id: 'pol-1',
      organizationId: 'org-1',
      status: PolicyStatus.DRAFT,
      code: 'POL-001',
      title: 'Test',
    };

    prisma.policy.findFirst.mockResolvedValue(draftPolicy);

    const authCtx = { userId: 'user-1', organizationId: 'org-1', role: Role.ADMIN };
    await expect(service.publish(authCtx, 'pol-1')).rejects.toThrow(BadRequestException);
  });

  describe('Policy Category Management', () => {
    it('should list categories merging defaults, persistent DB categories, and active policy counts', async () => {
      prisma.policy.groupBy.mockResolvedValue([
        { category: 'Information Security', _count: { id: 3 } },
        { category: 'Legacy Migrated Category', _count: { id: 1 } },
      ]);
      prisma.policyCategory.findMany.mockResolvedValue([
        { id: 'cat-custom-1', organizationId: 'org-1', name: 'Custom Cloud Governance', isDefault: false },
      ]);

      const authCtx = { userId: 'user-1', organizationId: 'org-1', role: Role.ADMIN };
      const categories = await service.listCategories(authCtx);

      expect(categories.length).toBeGreaterThanOrEqual(10);
      const infoSec = categories.find((c) => c.name === 'Information Security');
      expect(infoSec).toBeDefined();
      expect(infoSec?.policyCount).toBe(3);
      expect(infoSec?.isDefault).toBe(true);

      const customCat = categories.find((c) => c.name === 'Custom Cloud Governance');
      expect(customCat).toBeDefined();
      expect(customCat?.isDefault).toBe(false);

      const legacyCat = categories.find((c) => c.name === 'Legacy Migrated Category');
      expect(legacyCat).toBeDefined();
      expect(legacyCat?.policyCount).toBe(1);
    });

    it('should aggregate counts case-insensitively for policies with different casing (Custom SecOps vs custom secops)', async () => {
      prisma.policy.groupBy.mockResolvedValue([
        { category: 'Custom SecOps', _count: { id: 1 } },
        { category: 'custom secops', _count: { id: 1 } },
      ]);
      prisma.policyCategory.findMany.mockResolvedValue([
        { id: 'cat-custom-secops', organizationId: 'org-1', name: 'Custom SecOps', isDefault: false },
      ]);

      const authCtx = { userId: 'user-1', organizationId: 'org-1', role: Role.ADMIN };
      const categories = await service.listCategories(authCtx);

      // Must return exactly one category entry for Custom SecOps
      const secOpsMatches = categories.filter((c) => c.name.toLowerCase() === 'custom secops');
      expect(secOpsMatches.length).toBe(1);

      const secOps = secOpsMatches[0];
      // Display name must use canonical casing from durable store
      expect(secOps.name).toBe('Custom SecOps');
      // Aggregated policy count must be 1 + 1 = 2
      expect(secOps.policyCount).toBe(2);
      expect(secOps.isDefault).toBe(false);
    });

    it('should prioritize canonical display name from durable PolicyCategory over historical policy strings', async () => {
      prisma.policy.groupBy.mockResolvedValue([
        { category: 'all lowercase name', _count: { id: 5 } },
      ]);
      prisma.policyCategory.findMany.mockResolvedValue([
        { id: 'cat-durable', organizationId: 'org-1', name: 'All Lowercase Name', isDefault: false },
      ]);

      const authCtx = { userId: 'user-1', organizationId: 'org-1', role: Role.ADMIN };
      const categories = await service.listCategories(authCtx);

      const match = categories.find((c) => c.name.toLowerCase() === 'all lowercase name');
      expect(match).toBeDefined();
      expect(match?.name).toBe('All Lowercase Name');
      expect(match?.policyCount).toBe(5);
    });

    it('should preserve system default casing even when historical policies use lowercase values', async () => {
      prisma.policy.groupBy.mockResolvedValue([
        { category: 'information security', _count: { id: 4 } },
        { category: 'Information Security', _count: { id: 2 } },
      ]);
      prisma.policyCategory.findMany.mockResolvedValue([]);

      const authCtx = { userId: 'user-1', organizationId: 'org-1', role: Role.ADMIN };
      const categories = await service.listCategories(authCtx);

      const infoSecMatches = categories.filter((c) => c.name.toLowerCase() === 'information security');
      expect(infoSecMatches.length).toBe(1);

      const infoSec = infoSecMatches[0];
      expect(infoSec.name).toBe('Information Security');
      expect(infoSec.isDefault).toBe(true);
      expect(infoSec.policyCount).toBe(6);
    });

    it('should keep legacy categories without durable record visible with deterministic display name and combined counts', async () => {
      prisma.policy.groupBy.mockResolvedValue([
        { category: 'Legacy Untracked', _count: { id: 3 } },
        { category: 'legacy untracked', _count: { id: 2 } },
      ]);
      prisma.policyCategory.findMany.mockResolvedValue([]);

      const authCtx = { userId: 'user-1', organizationId: 'org-1', role: Role.ADMIN };
      const categories = await service.listCategories(authCtx);

      const untrackedMatches = categories.filter((c) => c.name.toLowerCase() === 'legacy untracked');
      expect(untrackedMatches.length).toBe(1);

      const untracked = untrackedMatches[0];
      expect(untracked.name).toBe('Legacy Untracked');
      expect(untracked.isDefault).toBe(false);
      expect(untracked.policyCount).toBe(5);
    });

    it('should create new category in persistent DB store and prevent duplicate within tenant', async () => {
      prisma.policy.groupBy.mockResolvedValue([]);
      prisma.policyCategory.findFirst.mockResolvedValueOnce(null);

      const authCtx = { userId: 'user-1', organizationId: 'org-1', role: Role.ADMIN };
      const created = await service.createCategory(authCtx, 'Threat Modeling');

      expect(created.name).toBe('Threat Modeling');
      expect(created.isDefault).toBe(false);
      expect(prisma.policyCategory.create).toHaveBeenCalledWith({
        data: {
          organizationId: 'org-1',
          name: 'Threat Modeling',
          isDefault: false,
        },
      });

      // Duplicate creation within the same tenant should be rejected
      prisma.policyCategory.findFirst.mockResolvedValueOnce({
        id: 'cat-threat-modeling',
        organizationId: 'org-1',
        name: 'Threat Modeling',
        isDefault: false,
      } as any);

      await expect(
        service.createCategory(authCtx, 'threat modeling'),
      ).rejects.toThrow('Policy category "threat modeling" already exists in this organization');
    });

    it('should enforce cross-tenant category isolation', async () => {
      prisma.policy.groupBy.mockResolvedValue([]);
      prisma.policyCategory.findMany.mockImplementation(async ({ where }: any) => {
        if (where?.organizationId === 'org-tenant-a') {
          return [{ id: 'cat-a', organizationId: 'org-tenant-a', name: 'Tenant A Custom', isDefault: false }];
        }
        return [];
      });

      const authCtxA = { userId: 'u-1', organizationId: 'org-tenant-a', role: Role.ADMIN };
      const authCtxB = { userId: 'u-2', organizationId: 'org-tenant-b', role: Role.ADMIN };

      const categoriesA = await service.listCategories(authCtxA);
      const categoriesB = await service.listCategories(authCtxB);

      expect(categoriesA.some((c) => c.name === 'Tenant A Custom')).toBe(true);
      expect(categoriesB.some((c) => c.name === 'Tenant A Custom')).toBe(false);
    });

    it('should reject deletion of system default categories regardless of policy count before any mutation', async () => {
      prisma.policy.count.mockResolvedValue(0);

      const authCtx = { userId: 'user-1', organizationId: 'org-1', role: Role.ADMIN };
      await expect(
        service.deleteCategory(authCtx, 'Data Privacy'),
      ).rejects.toThrow('System default category "Data Privacy" cannot be removed.');
      await expect(
        service.deleteCategory(authCtx, 'Information Security'),
      ).rejects.toThrow('System default category "Information Security" cannot be removed.');

      // Default category check must reject before any database query or audit log mutation
      expect(prisma.policy.count).not.toHaveBeenCalled();
      expect(auditLogsService.log).not.toHaveBeenCalled();
    });

    it('should block deletion of custom category with active policies', async () => {
      prisma.policy.count.mockResolvedValue(2);

      const authCtx = { userId: 'user-1', organizationId: 'org-1', role: Role.ADMIN };
      await expect(
        service.deleteCategory(authCtx, 'Custom Active Category'),
      ).rejects.toThrow('Cannot delete category "Custom Active Category" because it is currently assigned to 2 active policy/policies.');
    });

    it('should allow deletion of unused custom category with 0 active policies from persistent store', async () => {
      prisma.policy.count.mockResolvedValue(0);

      const authCtx = { userId: 'user-1', organizationId: 'org-1', role: Role.ADMIN };
      const result = await service.deleteCategory(authCtx, 'Unused Custom Category');

      expect(result.success).toBe(true);
      expect(result.message).toContain('Unused Custom Category');
      expect(prisma.policyCategory.deleteMany).toHaveBeenCalledWith({
        where: {
          organizationId: 'org-1',
          name: { equals: 'Unused Custom Category', mode: 'insensitive' },
        },
      });
      expect(auditLogsService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'POLICY_CATEGORY_DELETED',
          entityId: 'Unused Custom Category',
        }),
      );
    });

    it('should reject deletion with empty category name', async () => {
      const authCtx = { userId: 'user-1', organizationId: 'org-1', role: Role.ADMIN };
      await expect(
        service.deleteCategory(authCtx, '   '),
      ).rejects.toThrow(BadRequestException);
    });

    it('should rename category and update affected policies and persistent DB record', async () => {
      prisma.policy.groupBy.mockResolvedValue([]);
      prisma.policy.updateMany.mockResolvedValue({ count: 3 });
      prisma.policyCategory.findFirst.mockResolvedValue(null);

      const authCtx = { userId: 'user-1', organizationId: 'org-1', role: Role.ADMIN };
      const renamed = await service.renameCategory(authCtx, 'Original SecOps', 'Renamed SecOps');

      expect(renamed.name).toBe('Renamed SecOps');
      expect(renamed.policyCount).toBe(3);
      expect(prisma.policy.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ category: 'Original SecOps' }),
          data: { category: 'Renamed SecOps' },
        }),
      );
      expect(prisma.policyCategory.updateMany).toHaveBeenCalledWith({
        where: {
          organizationId: 'org-1',
          name: { equals: 'Original SecOps', mode: 'insensitive' },
        },
        data: {
          name: 'Renamed SecOps',
        },
      });
      expect(auditLogsService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'POLICY_CATEGORY_RENAMED',
          entityId: 'Renamed SecOps',
        }),
      );
    });

    it('should reject renaming category with empty new name or duplicate target name', async () => {
      prisma.policy.groupBy.mockResolvedValue([]);

      const authCtx = { userId: 'user-1', organizationId: 'org-1', role: Role.ADMIN };

      await expect(
        service.renameCategory(authCtx, 'Existing SecOps', '   '),
      ).rejects.toThrow('New category name cannot be empty');

      await expect(
        service.renameCategory(authCtx, 'Existing SecOps', 'Information Security'),
      ).rejects.toThrow('Category "Information Security" already exists');
    });
  });

  describe('Draft Content Update', () => {
    it('should update draft content directly on draft version', async () => {
      const draftPolicy = {
        id: 'pol-draft-1',
        organizationId: 'org-1',
        status: PolicyStatus.DRAFT,
        code: 'POL-001',
        title: 'Draft Policy',
      };

      prisma.policy.findFirst.mockResolvedValue(draftPolicy);
      prisma.policyVersion.findFirst.mockResolvedValue({
        id: 'ver-draft-1',
        policyId: 'pol-draft-1',
        content: 'Old Content',
      });
      prisma.policy.update.mockResolvedValue({
        ...draftPolicy,
        title: 'Draft Policy Updated',
      });

      const authCtx = { userId: 'user-1', organizationId: 'org-1', role: Role.ADMIN };
      await service.updateMetadata(authCtx, 'pol-draft-1', {
        title: 'Draft Policy Updated',
        content: '# New Updated Content',
      });

      expect(prisma.policyVersion.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'ver-draft-1' },
          data: { content: '# New Updated Content' },
        }),
      );
    });
  });
});
