import { Test, TestingModule } from '@nestjs/testing';
import { PoliciesService } from './policies.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { ApprovalEngineService } from '../approval/approval-engine.service';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { PolicyStatus, Role } from '@omnigrc/shared';
import { ResourceAuthorizationService } from '../auth/resource-authorization.service';

describe('PoliciesService', () => {
  let service: PoliciesService;
  let prisma: jest.Mocked<any>;
  let auditLogsService: jest.Mocked<any>;
  let approvalEngineService: jest.Mocked<any>;

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
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      policyAttestation: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
      },
      organizationMembership: {
        count: jest.fn().mockResolvedValue(10),
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

    approvalEngineService = {
      createApprovalInstance: jest.fn().mockResolvedValue({
        id: 'appr-pol-1',
        status: 'PENDING',
        resourceType: 'POLICY',
      }),
    };

    const resourceAuthService = {
      getScopeWhereClause: jest.fn().mockImplementation(async (ctx: any) => ({
        organizationId: ctx.organizationId,
      })),
      authorize: jest.fn().mockResolvedValue(undefined),
      validateHierarchyInvariants: jest.fn().mockResolvedValue(undefined),
      assertResourceAccess: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PoliciesService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditLogsService, useValue: auditLogsService },
        { provide: ResourceAuthorizationService, useValue: resourceAuthService },
        { provide: ApprovalEngineService, useValue: approvalEngineService },
      ],
    }).compile();

    service = module.get<PoliciesService>(PoliciesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findAll', () => {
    it('should retrieve and map policies correctly without unbound context errors', async () => {
      const mockPolicy = {
        id: 'pol-100',
        organizationId: 'org-1',
        departmentId: null,
        projectId: null,
        code: 'POL-100',
        title: 'Network Security Policy',
        description: 'Covers firewalls and network segmentation',
        category: 'Information Security',
        status: PolicyStatus.PUBLISHED,
        ownerId: 'user-1',
        businessUnit: 'Engineering',
        publishedVersionId: 'ver-100',
        publishedVersion: {
          id: 'ver-100',
          policyId: 'pol-100',
          versionNumber: '1.0',
          content: '# Network Security',
          changeLog: 'Initial release',
          createdById: 'user-1',
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
        },
        versions: [
          {
            id: 'ver-100',
            policyId: 'pol-100',
            versionNumber: '1.0',
            content: '# Network Security',
            changeLog: 'Initial release',
            createdById: 'user-1',
            createdAt: new Date('2026-01-01T00:00:00.000Z'),
          },
        ],
        effectiveDate: new Date('2026-01-01T00:00:00.000Z'),
        reviewDate: new Date('2027-01-01T00:00:00.000Z'),
        reviewCadenceDays: 365,
        createdById: 'user-1',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-02T00:00:00.000Z'),
        exceptions: [],
      };

      prisma.policy.findMany.mockResolvedValue([mockPolicy]);
      prisma.policy.count.mockResolvedValue(1);

      const authCtx = { userId: 'user-1', organizationId: 'org-1', role: Role.ADMIN };
      const result = await service.findAll(authCtx, { page: 1, limit: 10 });

      expect(result).toBeDefined();
      expect(result.total).toBe(1);
      expect(result.items.length).toBe(1);
      expect(result.items[0].id).toBe('pol-100');
      expect(result.items[0].code).toBe('POL-100');
      expect(result.items[0].publishedVersion?.versionNumber).toBe('1.0');
      expect(result.items[0].createdAt).toBe('2026-01-01T00:00:00.000Z');
      expect(result.items[0].updatedAt).toBe('2026-01-02T00:00:00.000Z');
    });
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

  describe('Policy Acknowledgement Tracking & Approvals (Phase 2)', () => {
    const authCtx = { userId: 'user-1', organizationId: 'org-1', role: Role.ADMIN };

    it('should attest to published policy version and create attestation record', async () => {
      const publishedPolicy = {
        id: 'pol-pub-1',
        code: 'POL-SEC-01',
        title: 'Information Security Policy',
        status: PolicyStatus.PUBLISHED,
        publishedVersionId: 'ver-pub-1',
        publishedVersion: { id: 'ver-pub-1', versionNumber: '1.0' },
        organizationId: 'org-1',
      };

      prisma.policy.findFirst.mockResolvedValue(publishedPolicy);
      prisma.policyAttestation.findUnique.mockResolvedValue(null);

      const mockAttestation = {
        id: 'att-1',
        organizationId: 'org-1',
        policyVersionId: 'ver-pub-1',
        userId: 'user-1',
        attestedAt: new Date(),
        ipAddress: '127.0.0.1',
      };
      prisma.policyAttestation.create.mockResolvedValue(mockAttestation);

      const res = await service.attestPolicy(authCtx, 'pol-pub-1', '127.0.0.1');

      expect(res.id).toBe('att-1');
      expect(res.policyVersionId).toBe('ver-pub-1');
      expect(prisma.policyAttestation.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          organizationId: 'org-1',
          policyVersionId: 'ver-pub-1',
          userId: 'user-1',
          ipAddress: '127.0.0.1',
        }),
      });
      expect(auditLogsService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'POLICY_ATTESTED',
          entityId: 'att-1',
        }),
      );
    });

    it('should be idempotent and return existing attestation without creating duplicate', async () => {
      const publishedPolicy = {
        id: 'pol-pub-1',
        code: 'POL-SEC-01',
        status: PolicyStatus.PUBLISHED,
        publishedVersionId: 'ver-pub-1',
        organizationId: 'org-1',
      };
      const existing = {
        id: 'att-existing',
        organizationId: 'org-1',
        policyVersionId: 'ver-pub-1',
        userId: 'user-1',
        attestedAt: new Date('2026-10-15'),
        ipAddress: '127.0.0.1',
      };

      prisma.policy.findFirst.mockResolvedValue(publishedPolicy);
      prisma.policyAttestation.findUnique.mockResolvedValue(existing);

      const res = await service.attestPolicy(authCtx, 'pol-pub-1');

      expect(res.id).toBe('att-existing');
      expect(prisma.policyAttestation.create).not.toHaveBeenCalled();
    });

    it('should prevent attesting to unpublished policy', async () => {
      prisma.policy.findFirst.mockResolvedValue({
        id: 'pol-draft-2',
        code: 'POL-DRAFT',
        status: PolicyStatus.DRAFT,
        publishedVersionId: null,
        organizationId: 'org-1',
      });

      await expect(service.attestPolicy(authCtx, 'pol-draft-2')).rejects.toThrow(BadRequestException);
    });

    it('should compute acknowledgement summary with compliance rate', async () => {
      const publishedPolicy = {
        id: 'pol-summary-1',
        code: 'POL-DATA-01',
        title: 'Data Protection Policy',
        status: PolicyStatus.PUBLISHED,
        publishedVersionId: 'ver-pub-2',
        publishedVersion: { id: 'ver-pub-2', versionNumber: '2.0' },
        organizationId: 'org-1',
      };

      prisma.policy.findFirst.mockResolvedValue(publishedPolicy);
      prisma.organizationMembership.count.mockResolvedValue(20);
      prisma.policyAttestation.findMany.mockResolvedValue([
        { id: 'att-1', userId: 'user-1', attestedAt: new Date(), ipAddress: null },
        { id: 'att-2', userId: 'user-2', attestedAt: new Date(), ipAddress: null },
      ]);

      const summary = await service.getPolicyAcknowledgementSummary(authCtx, 'pol-summary-1');

      expect(summary.totalEligibleUsers).toBe(20);
      expect(summary.attestedUsersCount).toBe(2);
      expect(summary.pendingUsersCount).toBe(18);
      expect(summary.compliancePercentage).toBe(10);
      expect(summary.versionNumber).toBe('2.0');
    });

    it('should find pending published policies for user where published version has not been acknowledged', async () => {
      const pol1 = {
        id: 'pol-1',
        code: 'POL-01',
        title: 'Policy 1',
        status: PolicyStatus.PUBLISHED,
        publishedVersionId: 'ver-1',
        publishedVersion: { id: 'ver-1', versionNumber: '1.0' },
        versions: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const pol2 = {
        id: 'pol-2',
        code: 'POL-02',
        title: 'Policy 2 (Updated to 2.0)',
        status: PolicyStatus.PUBLISHED,
        publishedVersionId: 'ver-2',
        publishedVersion: { id: 'ver-2', versionNumber: '2.0' },
        versions: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      prisma.policy.findMany.mockResolvedValue([pol1, pol2]);
      // User has only attested to ver-1 (meaning ver-2 on pol2 is still pending!)
      prisma.policyAttestation.findMany.mockResolvedValue([
        { policyVersionId: 'ver-1' },
      ]);

      const pending = await service.getMyPendingPolicies(authCtx);

      expect(pending.length).toBe(1);
      expect(pending[0].id).toBe('pol-2');
    });

    it('should submit policy for approval via ApprovalEngineService', async () => {
      prisma.policy.findFirst.mockResolvedValue({
        id: 'pol-appr-1',
        code: 'POL-FIN-01',
        title: 'Financial Controls Policy',
        description: 'Covers internal financial controls',
        organizationId: 'org-1',
      });

      const approval = await service.submitForApproval(authCtx, 'pol-appr-1', {
        dueDays: 14,
      });

      expect(approval.id).toBe('appr-pol-1');
      expect(approvalEngineService.createApprovalInstance).toHaveBeenCalledWith(
        'org-1',
        'user-1',
        expect.objectContaining({
          resourceType: 'POLICY',
          resourceId: 'pol-appr-1',
          purpose: 'POLICY_APPROVAL',
          dueDays: 14,
        }),
      );
    });
  });
});
