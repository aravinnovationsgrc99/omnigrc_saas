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
    it('should list categories merging defaults with counts', async () => {
      prisma.policy.groupBy.mockResolvedValue([
        { category: 'Information Security', _count: { id: 3 } },
      ]);

      const authCtx = { userId: 'user-1', organizationId: 'org-1', role: Role.ADMIN };
      const categories = await service.listCategories(authCtx);

      expect(categories.length).toBeGreaterThanOrEqual(8);
      const infoSec = categories.find((c) => c.name === 'Information Security');
      expect(infoSec).toBeDefined();
      expect(infoSec?.policyCount).toBe(3);
      expect(infoSec?.isDefault).toBe(true);
    });

    it('should create new category and prevent duplicates', async () => {
      prisma.policy.groupBy.mockResolvedValue([]);

      const authCtx = { userId: 'user-1', organizationId: 'org-1', role: Role.ADMIN };
      const created = await service.createCategory(authCtx, 'Threat Modeling');

      expect(created.name).toBe('Threat Modeling');
      expect(created.isDefault).toBe(false);

      // Duplicate creation should be rejected
      await expect(
        service.createCategory(authCtx, 'threat modeling'),
      ).rejects.toThrow(BadRequestException);
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

    it('should allow deletion of unused custom category with 0 active policies', async () => {
      prisma.policy.count.mockResolvedValue(0);

      const authCtx = { userId: 'user-1', organizationId: 'org-1', role: Role.ADMIN };
      const result = await service.deleteCategory(authCtx, 'Unused Custom Category');

      expect(result.success).toBe(true);
      expect(result.message).toContain('Unused Custom Category');
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

    it('should rename category and update affected policies and in-memory store', async () => {
      prisma.policy.groupBy.mockResolvedValue([]);
      prisma.policy.updateMany.mockResolvedValue({ count: 3 });

      const authCtx = { userId: 'user-1', organizationId: 'org-1', role: Role.ADMIN };
      await service.createCategory(authCtx, 'Original SecOps');

      const renamed = await service.renameCategory(authCtx, 'Original SecOps', 'Renamed SecOps');

      expect(renamed.name).toBe('Renamed SecOps');
      expect(renamed.policyCount).toBe(3);
      expect(prisma.policy.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ category: 'Original SecOps' }),
          data: { category: 'Renamed SecOps' },
        }),
      );
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
      await service.createCategory(authCtx, 'Existing SecOps');

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
