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
      policy: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        count: jest.fn(),
      },
      control: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
      },
      policyControl: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        upsert: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
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

      const underReview = await policiesService.submitForReview(analystContext, 'pol-lc-1');
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

      const rejectedToDraft = await policiesService.reject(tenantOrgAlpha, 'pol-lc-1', 'Need WAF section');
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
      const resubmitted = await policiesService.submitForReview(analystContext, 'pol-lc-1');
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
      const approved = await policiesService.approve(tenantOrgAlpha, 'pol-lc-1');
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
      const published = await policiesService.publish(tenantOrgAlpha, 'pol-lc-1');
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
      const retired = await policiesService.retire(tenantOrgAlpha, 'pol-lc-1');
      expect(retired.status).toBe(PolicyStatus.RETIRED);
    });

    it('rejects invalid transitions: cannot publish directly from DRAFT', async () => {
      prisma.policy.findFirst.mockResolvedValue({
        id: 'pol-invalid-1',
        organizationId: 'org-alpha',
        status: PolicyStatus.DRAFT,
        versions: [{ id: 'v1', versionNumber: '1.0' }],
      });

      await expect(policiesService.publish(tenantOrgAlpha, 'pol-invalid-1')).rejects.toThrow(
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
      prisma.policyControl.findFirst.mockResolvedValueOnce({
        id: 'assoc-10-20',
        policyId: 'pol-10',
        controlId: 'ctrl-20',
        organizationId: 'org-alpha',
      });
      prisma.policyControl.update.mockResolvedValueOnce({
        id: 'assoc-10-20',
        policyId: 'pol-10',
        controlId: 'ctrl-20',
        status: MappingStatus.OVERRIDDEN,
        rationale: 'Updated with cloud HSM endorsement',
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
      });
      expect(updated.status).toBe(MappingStatus.OVERRIDDEN);
      expect(updated.rationale).toBe('Updated with cloud HSM endorsement');

      // 5. Delete mapping
      prisma.policyControl.findFirst.mockResolvedValueOnce({
        id: 'assoc-10-20',
        policyId: 'pol-10',
        controlId: 'ctrl-20',
        organizationId: 'org-alpha',
        policy: { code: 'POL-10' },
        control: { name: 'Encryption At Rest' },
      });
      prisma.policyControl.delete.mockResolvedValueOnce({ id: 'assoc-10-20' });

      const del = await policyControlsService.disassociate(tenantOrgAlpha, 'pol-10', 'ctrl-20');
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
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('detects version mismatch and throws 409 ConflictException when expectedVersion differs', async () => {
      prisma.policy.findFirst.mockResolvedValue({
        id: 'pol-conc',
        organizationId: 'org-alpha',
        version: 5,
        updatedAt: new Date(),
      });

      await expect(
        policiesService.updateMetadata(tenantOrgAlpha, 'pol-conc', {
          title: 'New Title',
          expectedVersion: 4,
        }),
      ).rejects.toThrow(ConflictException);
    });
  });
});

