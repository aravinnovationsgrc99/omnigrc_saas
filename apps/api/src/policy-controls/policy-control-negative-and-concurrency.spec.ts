import { Test, TestingModule } from '@nestjs/testing';
import { PolicyControlsService } from './policy-controls.service';
import { PoliciesService } from '../policies/policies.service';
import { PrismaService } from '../prisma/prisma.service';
import { ResourceAuthorizationService, ResourceAuthContext } from '../auth/resource-authorization.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { NotFoundException, BadRequestException, ForbiddenException, ConflictException } from '@nestjs/common';
import { MappingStatus, PolicyStatus, Role } from '@omnigrc/shared';

describe('Phase 4: Policy & Control Mapping Workflows & Security Verification', () => {
  let policyControlsService: PolicyControlsService;
  let policiesService: PoliciesService;
  let prisma: any;
  let resourceAuthService: any;
  let auditLogsService: any;

  const tenantOrgAlpha: ResourceAuthContext = {
    organizationId: 'org-alpha',
    userId: 'user-alpha-ciso',
    role: Role.ADMIN,
  };

  const tenantOrgBeta: ResourceAuthContext = {
    organizationId: 'org-beta',
    userId: 'user-beta-intruder',
    role: Role.ADMIN,
  };

  const analystContext: ResourceAuthContext = {
    organizationId: 'org-alpha',
    userId: 'user-alpha-analyst',
    role: Role.ANALYST,
  };

  const auditorContext: ResourceAuthContext = {
    organizationId: 'org-alpha',
    userId: 'user-alpha-auditor',
    role: Role.EXTERNAL_AUDITOR,
  };

  beforeEach(async () => {
    prisma = {
      $transaction: jest.fn().mockImplementation((cb: any) => {
        if (typeof cb === 'function') {
          return cb(prisma);
        }
        return Promise.all(cb);
      }),
      policy: {
        _latestUpdated: null as any,
        findFirst: jest.fn(),
        findMany: jest.fn(),
        findUniqueOrThrow: jest.fn().mockImplementation(({ where }: any) => {
          const latest = prisma.policy._latestUpdated || {};
          return {
            id: where.id,
            code: latest.code || 'POL-001',
            title: latest.title || 'Policy Title',
            version: latest.version || 2,
            status: latest.status || PolicyStatus.DRAFT,
            publishedVersion: null,
            versions: [],
            _count: latest._count || { controlAssociations: 0 },
            ...latest,
          };
        }),
        create: jest.fn(),
        update: jest.fn().mockImplementation(({ where, data }: any) => {
          const res = {
            id: where.id,
            code: 'POL-001',
            title: data.title || 'Policy Title',
            status: data.status || PolicyStatus.DRAFT,
            version: typeof data.version === 'object' ? 2 : data.version || 1,
            organizationId: 'org-alpha',
            ownerId: 'user-alpha-ciso',
            publishedVersion: null,
            versions: [],
            _count: { controlAssociations: 0 },
          };
          prisma.policy._latestUpdated = res;
          return res;
        }),
        updateMany: jest.fn().mockImplementation(({ where, data }: any) => {
          prisma.policy._latestUpdated = {
            id: where?.id || 'pol-1',
            status: data?.status || PolicyStatus.DRAFT,
            version: typeof data?.version === 'object' ? 2 : data?.version || 2,
            _count: { controlAssociations: 0 },
          };
          return { count: 1 };
        }),
        count: jest.fn(),
      },
      control: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
      },
      policyControl: {
        findFirst: jest.fn(),
        findFirstOrThrow: jest.fn(),
        findMany: jest.fn(),
        upsert: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        delete: jest.fn(),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
        count: jest.fn(),
      },
      policyVersion: {
        findFirst: jest.fn(),
      },
      policyCategory: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    resourceAuthService = {
      getScopeWhereClause: jest.fn().mockImplementation(async (ctx: ResourceAuthContext) => ({
        organizationId: ctx.organizationId,
      })),
      authorize: jest.fn().mockImplementation(async (ctx: ResourceAuthContext, opts: any) => {
        if (opts?.action === 'WRITE' && ctx.role === Role.EXTERNAL_AUDITOR) {
          throw new ForbiddenException('External auditors are granted read-only access');
        }
      }),
      validateHierarchyInvariants: jest.fn().mockResolvedValue(undefined),
    };

    auditLogsService = {
      log: jest.fn().mockResolvedValue({}),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PolicyControlsService,
        PoliciesService,
        { provide: PrismaService, useValue: prisma },
        { provide: ResourceAuthorizationService, useValue: resourceAuthService },
        { provide: AuditLogsService, useValue: auditLogsService },
      ],
    }).compile();

    policyControlsService = module.get<PolicyControlsService>(PolicyControlsService);
    policiesService = module.get<PoliciesService>(PoliciesService);
  });

  describe('Workflow A — Complete Policy Lifecycle (Draft -> Review -> Reject -> Re-review -> Approve -> Publish -> Retire)', () => {
    it('executes the full lifecycle enforcing valid transitions and reject loop', async () => {
      // Step 1: Submit draft for review
      prisma.policy.findFirst.mockResolvedValueOnce({
        id: 'pol-lc-1',
        organizationId: 'org-alpha',
        code: 'POL-NET-01',
        title: 'Network Security Policy',
        status: PolicyStatus.DRAFT,
      });
      prisma.policy.update.mockResolvedValueOnce({
        id: 'pol-lc-1',
        organizationId: 'org-alpha',
        code: 'POL-NET-01',
        title: 'Network Security Policy',
        status: PolicyStatus.UNDER_REVIEW,
        category: 'Information Security',
        ownerId: 'user-alpha-ciso',
        reviewCadenceDays: 365,
        createdById: 'user-alpha-ciso',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const underReview = await policiesService.submitForReview(analystContext, 'pol-lc-1', 1);
      expect(underReview.status).toBe(PolicyStatus.UNDER_REVIEW);

      // Step 2: Admin rejects review with feedback -> returns to DRAFT
      prisma.policy.findFirst.mockResolvedValueOnce({
        id: 'pol-lc-1',
        organizationId: 'org-alpha',
        status: PolicyStatus.UNDER_REVIEW,
      });
      prisma.policy.update.mockResolvedValueOnce({
        id: 'pol-lc-1',
        organizationId: 'org-alpha',
        code: 'POL-NET-01',
        title: 'Network Security Policy',
        status: PolicyStatus.DRAFT,
        category: 'Information Security',
        ownerId: 'user-alpha-ciso',
        reviewCadenceDays: 365,
        createdById: 'user-alpha-ciso',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const rejectedToDraft = await policiesService.reject(tenantOrgAlpha, 'pol-lc-1', 'Need WAF section', 2);
      expect(rejectedToDraft.status).toBe(PolicyStatus.DRAFT);

      // Step 3: Resubmit for review
      prisma.policy.findFirst.mockResolvedValueOnce({
        id: 'pol-lc-1',
        organizationId: 'org-alpha',
        status: PolicyStatus.DRAFT,
      });
      prisma.policy.update.mockResolvedValueOnce({
        id: 'pol-lc-1',
        organizationId: 'org-alpha',
        code: 'POL-NET-01',
        title: 'Network Security Policy',
        status: PolicyStatus.UNDER_REVIEW,
        category: 'Information Security',
        ownerId: 'user-alpha-ciso',
        reviewCadenceDays: 365,
        createdById: 'user-alpha-ciso',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      const resubmitted = await policiesService.submitForReview(analystContext, 'pol-lc-1', 3);
      expect(resubmitted.status).toBe(PolicyStatus.UNDER_REVIEW);

      // Step 4: Admin approves
      prisma.policy.findFirst.mockResolvedValueOnce({
        id: 'pol-lc-1',
        organizationId: 'org-alpha',
        status: PolicyStatus.UNDER_REVIEW,
      });
      prisma.policy.update.mockResolvedValueOnce({
        id: 'pol-lc-1',
        organizationId: 'org-alpha',
        code: 'POL-NET-01',
        title: 'Network Security Policy',
        status: PolicyStatus.APPROVED,
        category: 'Information Security',
        ownerId: 'user-alpha-ciso',
        reviewCadenceDays: 365,
        createdById: 'user-alpha-ciso',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      const approved = await policiesService.approve(tenantOrgAlpha, 'pol-lc-1', 4);
      expect(approved.status).toBe(PolicyStatus.APPROVED);

      // Step 5: Publish approved policy
      prisma.policy.findFirst.mockResolvedValueOnce({
        id: 'pol-lc-1',
        organizationId: 'org-alpha',
        status: PolicyStatus.APPROVED,
        reviewCadenceDays: 365,
        versions: [{ id: 'ver-1', versionNumber: '1.0', content: '# Content' }],
      });
      prisma.policy.update.mockResolvedValueOnce({
        id: 'pol-lc-1',
        organizationId: 'org-alpha',
        code: 'POL-NET-01',
        title: 'Network Security Policy',
        status: PolicyStatus.PUBLISHED,
        category: 'Information Security',
        ownerId: 'user-alpha-ciso',
        reviewCadenceDays: 365,
        createdById: 'user-alpha-ciso',
        publishedVersion: { id: 'ver-1', versionNumber: '1.0' },
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      const published = await policiesService.publish(tenantOrgAlpha, 'pol-lc-1', undefined, 5);
      expect(published.status).toBe(PolicyStatus.PUBLISHED);

      // Step 6: Retire published policy
      prisma.policy.findFirst.mockResolvedValueOnce({
        id: 'pol-lc-1',
        organizationId: 'org-alpha',
        status: PolicyStatus.PUBLISHED,
      });
      prisma.policy.update.mockResolvedValueOnce({
        id: 'pol-lc-1',
        organizationId: 'org-alpha',
        code: 'POL-NET-01',
        title: 'Network Security Policy',
        status: PolicyStatus.RETIRED,
        category: 'Information Security',
        ownerId: 'user-alpha-ciso',
        reviewCadenceDays: 365,
        createdById: 'user-alpha-ciso',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      const retired = await policiesService.retire(tenantOrgAlpha, 'pol-lc-1', 6);
      expect(retired.status).toBe(PolicyStatus.RETIRED);
    });

    it('rejects invalid transitions: cannot publish directly from DRAFT', async () => {
      prisma.policy.findFirst.mockResolvedValue({
        id: 'pol-invalid-1',
        organizationId: 'org-alpha',
        status: PolicyStatus.DRAFT,
        versions: [{ id: 'v1', versionNumber: '1.0' }],
      });

      await expect(policiesService.publish(tenantOrgAlpha, 'pol-invalid-1', undefined, 1)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('Workflow B — Bidirectional Control Mapping Lifecycle', () => {
    it('creates, inspects from both perspectives, updates, and deletes mapping', async () => {
      prisma.policy.findFirst.mockResolvedValue({
        id: 'pol-10',
        organizationId: 'org-alpha',
        code: 'POL-10',
        title: 'Data Protection Policy',
      });
      prisma.control.findFirst.mockResolvedValue({
        id: 'ctrl-20',
        organizationId: 'org-alpha',
        name: 'Encryption At Rest',
      });

      // 1. Associate
      prisma.policyControl.upsert.mockResolvedValue({
        id: 'assoc-10-20',
        organizationId: 'org-alpha',
        policyId: 'pol-10',
        controlId: 'ctrl-20',
        status: MappingStatus.APPROVED,
        rationale: 'Satisfies AES-256 requirement',
        createdAt: new Date(),
        control: {
          name: 'Encryption At Rest',
          description: 'Enforce AES-256 for all stored data',
          category: 'Cryptography',
          mappings: [],
        },
      });

      const created = await policyControlsService.associate(tenantOrgAlpha, 'pol-10', 'ctrl-20', {
        rationale: 'Satisfies AES-256 requirement',
      });
      expect(created.id).toBe('assoc-10-20');
      expect(created.controlName).toBe('Encryption At Rest');

      // 2. View from policy perspective
      prisma.policyControl.findMany.mockResolvedValueOnce([
        {
          id: 'assoc-10-20',
          policyId: 'pol-10',
          controlId: 'ctrl-20',
          status: MappingStatus.APPROVED,
          rationale: 'Satisfies AES-256 requirement',
          createdAt: new Date(),
          control: {
            name: 'Encryption At Rest',
            description: 'Enforce AES-256 for all stored data',
            category: 'Cryptography',
            mappings: [],
          },
        },
      ]);
      prisma.policyControl.count.mockResolvedValueOnce(1);

      const policyView = await policyControlsService.getControlsForPolicy(tenantOrgAlpha, 'pol-10');
      expect(policyView.items).toHaveLength(1);
      expect(policyView.items[0].controlId).toBe('ctrl-20');

      // 3. View from control perspective
      prisma.policyControl.findMany.mockResolvedValueOnce([
        {
          id: 'assoc-10-20',
          policyId: 'pol-10',
          controlId: 'ctrl-20',
          status: MappingStatus.APPROVED,
          rationale: 'Satisfies AES-256 requirement',
          createdAt: new Date(),
          policy: {
            code: 'POL-10',
            title: 'Data Protection Policy',
            category: 'Data Privacy',
            status: PolicyStatus.PUBLISHED,
            ownerId: 'ciso',
            publishedVersion: { versionNumber: '1.2' },
          },
        },
      ]);
      prisma.policyControl.count.mockResolvedValueOnce(1);

      const controlView = await policyControlsService.getPoliciesForControl(tenantOrgAlpha, 'ctrl-20');
      expect(controlView.items).toHaveLength(1);
      expect(controlView.items[0].policyCode).toBe('POL-10');
      expect(controlView.items[0].publishedVersionNumber).toBe('1.2');

      // 4. Update rationale
      prisma.policyControl.updateMany.mockResolvedValueOnce({ count: 1 });
      prisma.policyControl.findFirstOrThrow.mockResolvedValueOnce({
        id: 'assoc-10-20',
        policyId: 'pol-10',
        controlId: 'ctrl-20',
        status: MappingStatus.OVERRIDDEN,
        rationale: 'Updated with cloud HSM endorsement',
        version: 2,
        createdAt: new Date(),
        control: {
          name: 'Encryption At Rest',
          description: 'Desc',
          category: 'Crypto',
          mappings: [],
        },
      });

      const updated = await policyControlsService.updateMapping(tenantOrgAlpha, 'pol-10', 'ctrl-20', {
        status: MappingStatus.OVERRIDDEN,
        rationale: 'Updated with cloud HSM endorsement',
        expectedVersion: 1,
      });
      expect(updated.status).toBe(MappingStatus.OVERRIDDEN);
      expect(updated.rationale).toBe('Updated with cloud HSM endorsement');
      expect(updated.version).toBe(2);

      // 5. Delete mapping
      prisma.policyControl.findFirst.mockResolvedValueOnce({
        id: 'assoc-10-20',
        policyId: 'pol-10',
        controlId: 'ctrl-20',
        version: 2,
        organizationId: 'org-alpha',
        policy: { code: 'POL-10' },
        control: { name: 'Encryption At Rest' },
      });
      prisma.policyControl.deleteMany.mockResolvedValueOnce({ count: 1 });

      const del = await policyControlsService.disassociate(tenantOrgAlpha, 'pol-10', 'ctrl-20', 2);
      expect(del.success).toBe(true);
      expect(del.unmappedId).toBe('assoc-10-20');
    });
  });

  describe('Workflow C — Authorization & Role Restrictions', () => {
    it('blocks external auditor from mapping controls to policies (403 Forbidden)', async () => {
      await expect(
        policyControlsService.associate(auditorContext, 'pol-1', 'ctrl-1', {
          rationale: 'Auditor attempt write',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('blocks external auditor from deleting policy-control mappings (403 Forbidden)', async () => {
      await expect(
        policyControlsService.disassociate(auditorContext, 'pol-1', 'ctrl-1'),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('Workflow D — Multi-Tenant Isolation', () => {
    it('Org Beta cannot map an Org Alpha policy (404 NotFound)', async () => {
      // In Org Beta's context, Org Alpha's policy returns null from scopeWhere
      prisma.policy.findFirst.mockResolvedValue(null);
      prisma.control.findFirst.mockResolvedValue({
        id: 'ctrl-beta-1',
        organizationId: 'org-beta',
      });

      await expect(
        policyControlsService.associate(tenantOrgBeta, 'pol-alpha-1', 'ctrl-beta-1', {}),
      ).rejects.toThrow(NotFoundException);
    });

    it('Org Beta cannot map an Org Alpha control (404 NotFound)', async () => {
      prisma.policy.findFirst.mockResolvedValue({
        id: 'pol-beta-1',
        organizationId: 'org-beta',
      });
      // In Org Beta's context, Org Alpha's control returns null from scopeWhere
      prisma.control.findFirst.mockResolvedValue(null);

      await expect(
        policyControlsService.associate(tenantOrgBeta, 'pol-beta-1', 'ctrl-alpha-1', {}),
      ).rejects.toThrow(NotFoundException);
    });

    it('Org Beta cannot delete an Org Alpha mapping (404 NotFound)', async () => {
      prisma.policyControl.findFirst.mockResolvedValue(null);

      await expect(
        policyControlsService.disassociate(tenantOrgBeta, 'pol-alpha-1', 'ctrl-alpha-1'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('Workflow E — Concurrency & Data Integrity', () => {
    it('detects concurrent policy edit and throws 409 ConflictException when expectedUpdatedAt is stale', async () => {
      const dbDate = new Date('2026-11-02T12:00:00Z');
      const clientStaleDate = new Date('2026-11-02T11:00:00Z').toISOString();

      prisma.policy.findFirst.mockResolvedValue({
        id: 'pol-conc',
        organizationId: 'org-alpha',
        updatedAt: dbDate,
      });

      await expect(
        policiesService.updateMetadata(tenantOrgAlpha, 'pol-conc', {
          title: 'New Title',
          expectedUpdatedAt: clientStaleDate,
          expectedVersion: 1,
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('rejects policy update when expectedVersion is missing at service boundary', async () => {
      await expect(
        policiesService.updateMetadata(tenantOrgAlpha, 'pol-conc', {
          title: 'No Version',
        } as any),
      ).rejects.toThrow('expectedVersion is mandatory and must be a positive integer');

      await expect(
        policiesService.submitForReview(analystContext, 'pol-conc', undefined as any),
      ).rejects.toThrow('expectedVersion is mandatory and must be a positive integer');

      await expect(
        policiesService.approve(tenantOrgAlpha, 'pol-conc', undefined as any),
      ).rejects.toThrow('expectedVersion is mandatory and must be a positive integer');
    });

    it('rejects mapping update when expectedVersion is missing at service boundary', async () => {
      await expect(
        policyControlsService.updateMapping(tenantOrgAlpha, 'pol-alpha-1', 'ctrl-alpha-1', {
          rationale: 'Missing version',
        } as any),
      ).rejects.toThrow('expectedVersion is mandatory and must be a positive integer');
    });

    it('detects mapping concurrency conflict and throws 409 ConflictException when expectedVersion is stale', async () => {
      prisma.policyControl.updateMany.mockResolvedValueOnce({ count: 0 });
      prisma.policyControl.findFirst.mockResolvedValueOnce({
        id: 'map-concur-1',
        policyId: 'pol-alpha-1',
        controlId: 'ctrl-alpha-1',
        organizationId: 'org-alpha',
        status: MappingStatus.APPROVED,
        version: 3,
      });

      await expect(
        policyControlsService.updateMapping(tenantOrgAlpha, 'pol-alpha-1', 'ctrl-alpha-1', {
          rationale: 'Concurrent Rationale Update',
          expectedVersion: 1,
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('enforces atomic mapping concurrency: concurrent updates with identical expectedVersion result in one success and one 409 Conflict', async () => {
      prisma.policyControl.updateMany.mockResolvedValueOnce({ count: 1 });
      prisma.policyControl.findFirstOrThrow.mockResolvedValueOnce({
        id: 'map-atomic-1',
        policyId: 'pol-alpha-1',
        controlId: 'ctrl-alpha-1',
        version: 2,
        status: MappingStatus.APPROVED,
        control: {
          name: 'Encryption',
          description: 'Desc',
          category: 'Crypto',
          mappings: [],
        },
      });

      prisma.policyControl.updateMany.mockResolvedValueOnce({ count: 0 });
      prisma.policyControl.findFirst.mockResolvedValueOnce({
        id: 'map-atomic-1',
        policyId: 'pol-alpha-1',
        controlId: 'ctrl-alpha-1',
        organizationId: 'org-alpha',
        status: MappingStatus.APPROVED,
        version: 2,
      });

      const updateReq1 = policyControlsService.updateMapping(tenantOrgAlpha, 'pol-alpha-1', 'ctrl-alpha-1', {
        rationale: 'Client A Rationale',
        expectedVersion: 1,
      });

      const updateReq2 = policyControlsService.updateMapping(tenantOrgAlpha, 'pol-alpha-1', 'ctrl-alpha-1', {
        rationale: 'Client B Rationale',
        expectedVersion: 1,
      });

      const [res1, res2] = await Promise.allSettled([updateReq1, updateReq2]);

      expect(res1.status).toBe('fulfilled');
      expect(res2.status).toBe('rejected');
      if (res2.status === 'rejected') {
        expect(res2.reason).toBeInstanceOf(ConflictException);
        expect(res2.reason.message).toContain('Policy-control mapping conflict');
      }
    });

    it('detects concurrent mapping deletion vs update conflict', async () => {
      prisma.policyControl.findFirst.mockResolvedValueOnce({
        id: 'map-del-concur',
        policyId: 'pol-alpha-1',
        controlId: 'ctrl-alpha-1',
        version: 2,
        organizationId: 'org-alpha',
        policy: { code: 'POL-1' },
        control: { name: 'CTRL-1' },
      });

      await expect(
        policyControlsService.disassociate(tenantOrgAlpha, 'pol-alpha-1', 'ctrl-alpha-1', 1),
      ).rejects.toThrow(ConflictException);
    });

    it('detects version mismatch and throws 409 ConflictException when expectedVersion differs', async () => {
      prisma.policy.findFirst.mockResolvedValue({
        id: 'pol-conc',
        organizationId: 'org-alpha',
        version: 5,
        updatedAt: new Date(),
      });
      prisma.policy.updateMany.mockResolvedValueOnce({ count: 0 });

      await expect(
        policiesService.updateMetadata(tenantOrgAlpha, 'pol-conc', {
          title: 'New Title',
          expectedVersion: 4,
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('enforces atomic concurrency: concurrent updates with identical expectedVersion result in one success and one 409 Conflict', async () => {
      prisma.policy.findFirst.mockResolvedValue({
        id: 'pol-atomic-1',
        organizationId: 'org-alpha',
        version: 3,
        updatedAt: new Date(),
      });

      // Simulating atomic updateMany: first caller matches version 3, second finds version 4
      prisma.policy.updateMany.mockResolvedValueOnce({ count: 1 });
      prisma.policy.updateMany.mockResolvedValueOnce({ count: 0 });

      const updateReq1 = policiesService.updateMetadata(tenantOrgAlpha, 'pol-atomic-1', {
        title: 'Title A',
        expectedVersion: 3,
      });

      const updateReq2 = policiesService.updateMetadata(tenantOrgAlpha, 'pol-atomic-1', {
        title: 'Title B',
        expectedVersion: 3,
      });

      const [res1, res2] = await Promise.allSettled([updateReq1, updateReq2]);

      expect(res1.status).toBe('fulfilled');
      expect(res2.status).toBe('rejected');
      if (res2.status === 'rejected') {
        expect(res2.reason).toBeInstanceOf(ConflictException);
        expect(res2.reason.message).toContain('Policy revision conflict');
      }
    });
  });
});

