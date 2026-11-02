import { Test, TestingModule } from '@nestjs/testing';
import { PolicyControlsService } from './policy-controls.service';
import { PrismaService } from '../prisma/prisma.service';
import { ResourceAuthorizationService, ResourceAuthContext } from '../auth/resource-authorization.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { NotFoundException, BadRequestException, ForbiddenException, ConflictException } from '@nestjs/common';
import { MappingStatus, Role } from '@omnigrc/shared';

describe('PolicyControlsService', () => {
  let service: PolicyControlsService;
  let prisma: any;
  let resourceAuthService: any;
  let auditLogsService: any;

  const mockTenantContext: ResourceAuthContext = {
    organizationId: 'tenant-org-alpha',
    userId: 'user-compliance-lead',
    role: Role.ADMIN,
  };

  const mockForeignContext: ResourceAuthContext = {
    organizationId: 'tenant-org-beta',
    userId: 'user-intruder',
    role: Role.ADMIN,
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
        findFirst: jest.fn(),
      },
      control: {
        findFirst: jest.fn(),
      },
      policyControl: {
        findMany: jest.fn(),
        count: jest.fn(),
        findFirst: jest.fn(),
        findFirstOrThrow: jest.fn(),
        upsert: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        delete: jest.fn(),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };

    resourceAuthService = {
      getScopeWhereClause: jest.fn().mockImplementation(async (ctx: ResourceAuthContext) => ({
        organizationId: ctx.organizationId,
      })),
      authorize: jest.fn().mockResolvedValue(undefined),
    };

    auditLogsService = {
      log: jest.fn().mockResolvedValue({}),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PolicyControlsService,
        { provide: PrismaService, useValue: prisma },
        { provide: ResourceAuthorizationService, useValue: resourceAuthService },
        { provide: AuditLogsService, useValue: auditLogsService },
      ],
    }).compile();

    service = module.get<PolicyControlsService>(PolicyControlsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('associate', () => {
    it('should create a valid policy-control mapping within same tenant and log audit event', async () => {
      prisma.policy.findFirst.mockResolvedValue({
        id: 'pol-sec-01',
        organizationId: 'tenant-org-alpha',
        code: 'POL-SEC-01',
        title: 'Information Security Policy',
        deletedAt: null,
      });

      prisma.control.findFirst.mockResolvedValue({
        id: 'ctrl-ac-01',
        organizationId: 'tenant-org-alpha',
        name: 'Access Control Policy Enforcement',
        deletedAt: null,
      });

      prisma.policyControl.upsert.mockResolvedValue({
        id: 'map-pol-ctrl-01',
        organizationId: 'tenant-org-alpha',
        policyId: 'pol-sec-01',
        controlId: 'ctrl-ac-01',
        status: MappingStatus.APPROVED,
        rationale: 'Mandates strict role-based access control across all infrastructure',
        createdById: 'user-compliance-lead',
        createdAt: new Date(),
        updatedAt: new Date(),
        control: {
          name: 'Access Control Policy Enforcement',
          description: 'Enforces least-privilege access',
          category: 'Access Control',
          mappings: [
            {
              frameworkReference: {
                identifier: 'A.9.1.1',
                title: 'Access Control Policy',
                frameworkVersion: {
                  framework: {
                    name: 'ISO/IEC 27001:2022',
                    code: 'ISO27001',
                  },
                },
              },
            },
          ],
        },
      });

      const result = await service.associate(mockTenantContext, 'pol-sec-01', 'ctrl-ac-01', {
        status: MappingStatus.APPROVED,
        rationale: 'Mandates strict role-based access control across all infrastructure',
      });

      expect(result).toBeDefined();
      expect(result.controlId).toBe('ctrl-ac-01');
      expect(result.controlName).toBe('Access Control Policy Enforcement');
      expect(result.status).toBe(MappingStatus.APPROVED);
      expect(result.frameworkMappings).toHaveLength(1);
      expect(result.frameworkMappings![0].clauseCode).toBe('A.9.1.1');

      expect(auditLogsService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'POLICY_CONTROL_MAPPED',
          organizationId: 'tenant-org-alpha',
          actorId: 'user-compliance-lead',
          entityType: 'PolicyControl',
        }),
        expect.anything(),
      );
    });

    it('should be idempotent and handle duplicate mapping requests gracefully via upsert', async () => {
      prisma.policy.findFirst.mockResolvedValue({
        id: 'pol-sec-01',
        organizationId: 'tenant-org-alpha',
        code: 'POL-SEC-01',
        title: 'Information Security Policy',
      });

      prisma.control.findFirst.mockResolvedValue({
        id: 'ctrl-ac-01',
        organizationId: 'tenant-org-alpha',
        name: 'Access Control Policy Enforcement',
      });

      prisma.policyControl.upsert.mockResolvedValue({
        id: 'map-pol-ctrl-01',
        organizationId: 'tenant-org-alpha',
        policyId: 'pol-sec-01',
        controlId: 'ctrl-ac-01',
        status: MappingStatus.APPROVED,
        rationale: 'Updated mapping justification',
        control: {
          name: 'Access Control Policy Enforcement',
          description: 'Enforces least privilege',
          category: 'Access Control',
          mappings: [],
        },
      });

      const result = await service.associate(mockTenantContext, 'pol-sec-01', 'ctrl-ac-01', {
        rationale: 'Updated mapping justification',
      });

      expect(result).toBeDefined();
      expect(prisma.policyControl.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            policyId_controlId: {
              policyId: 'pol-sec-01',
              controlId: 'ctrl-ac-01',
            },
          },
        }),
      );
    });

    it('should reject mapping if Policy belongs to another tenant (404 NotFound)', async () => {
      // Policy not found in caller's tenant
      prisma.policy.findFirst.mockResolvedValue(null);
      prisma.control.findFirst.mockResolvedValue({
        id: 'ctrl-ac-01',
        organizationId: 'tenant-org-alpha',
      });

      await expect(
        service.associate(mockTenantContext, 'foreign-policy-id', 'ctrl-ac-01', {}),
      ).rejects.toThrow(NotFoundException);
    });

    it('should reject mapping if Control belongs to another tenant (404 NotFound)', async () => {
      prisma.policy.findFirst.mockResolvedValue({
        id: 'pol-sec-01',
        organizationId: 'tenant-org-alpha',
      });
      // Control not found in caller's tenant
      prisma.control.findFirst.mockResolvedValue(null);

      await expect(
        service.associate(mockTenantContext, 'pol-sec-01', 'foreign-control-id', {}),
      ).rejects.toThrow(NotFoundException);
    });

    it('should reject mapping if policyId or controlId is missing', async () => {
      await expect(service.associate(mockTenantContext, '', 'ctrl-ac-01', {})).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.associate(mockTenantContext, 'pol-sec-01', '', {})).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('disassociate', () => {
    it('should remove the mapping record while preserving Policy and Control entities', async () => {
      prisma.policyControl.findFirst.mockResolvedValue({
        id: 'map-pol-ctrl-01',
        organizationId: 'tenant-org-alpha',
        policyId: 'pol-sec-01',
        controlId: 'ctrl-ac-01',
        version: 1,
        policy: { code: 'POL-SEC-01' },
        control: { name: 'Access Control' },
      });

      prisma.policyControl.deleteMany.mockResolvedValue({ count: 1 });

      const result = await service.disassociate(mockTenantContext, 'pol-sec-01', 'ctrl-ac-01', 1);

      expect(result.success).toBe(true);
      expect(result.unmappedId).toBe('map-pol-ctrl-01');
      expect(prisma.policyControl.deleteMany).toHaveBeenCalledWith({
        where: { id: 'map-pol-ctrl-01', organizationId: 'tenant-org-alpha', version: 1 },
      });

      expect(auditLogsService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'POLICY_CONTROL_UNMAPPED',
          organizationId: 'tenant-org-alpha',
        }),
        expect.anything(),
      );
    });

    it('should reject disassociation if expectedVersion is missing', async () => {
      await expect(
        service.disassociate(mockTenantContext, 'pol-sec-01', 'ctrl-ac-01', undefined as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject disassociation if expectedVersion is invalid (< 1)', async () => {
      await expect(
        service.disassociate(mockTenantContext, 'pol-sec-01', 'ctrl-ac-01', 0),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw 404 NotFoundException if mapping does not exist in caller tenant', async () => {
      prisma.policyControl.findFirst.mockResolvedValue(null);

      await expect(
        service.disassociate(mockTenantContext, 'pol-sec-01', 'ctrl-ac-01', 1),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw 409 ConflictException if expectedVersion on disassociate is stale', async () => {
      prisma.policyControl.findFirst
        .mockResolvedValueOnce({
          id: 'map-pol-ctrl-01',
          version: 2,
          policy: { code: 'POL-SEC-01' },
          control: { name: 'Access Control' },
        })
        .mockResolvedValueOnce({
          id: 'map-pol-ctrl-01',
          version: 2,
        });

      prisma.policyControl.deleteMany.mockResolvedValueOnce({ count: 0 });

      await expect(
        service.disassociate(mockTenantContext, 'pol-sec-01', 'ctrl-ac-01', 1),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('getControlsForPolicy', () => {
    it('should return paginated list of mapped controls with framework references', async () => {
      prisma.policy.findFirst.mockResolvedValue({
        id: 'pol-sec-01',
        organizationId: 'tenant-org-alpha',
      });

      prisma.policyControl.findMany.mockResolvedValue([
        {
          id: 'map-1',
          policyId: 'pol-sec-01',
          controlId: 'ctrl-1',
          status: MappingStatus.APPROVED,
          rationale: 'Primary control for policy clause 2.1',
          createdAt: new Date(),
          control: {
            name: 'MFA Enforcement',
            description: 'Enforce multi-factor auth on all identity providers',
            category: 'Access Control',
            mappings: [
              {
                frameworkReference: {
                  identifier: 'AC-2',
                  title: 'Account Management',
                  frameworkVersion: {
                    framework: {
                      name: 'NIST SP 800-53',
                      code: 'NIST80053',
                    },
                  },
                },
              },
            ],
          },
        },
      ]);
      prisma.policyControl.count.mockResolvedValue(1);

      const result = await service.getControlsForPolicy(mockTenantContext, 'pol-sec-01', {
        page: 1,
        limit: 10,
      });

      expect(result.items).toHaveLength(1);
      expect(result.items[0].controlName).toBe('MFA Enforcement');
      expect(result.items[0].frameworkMappings![0].clauseCode).toBe('AC-2');
      expect(result.total).toBe(1);
    });

    it('should throw 404 if policy does not exist in caller tenant', async () => {
      prisma.policy.findFirst.mockResolvedValue(null);

      await expect(
        service.getControlsForPolicy(mockTenantContext, 'non-existent-policy'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getPoliciesForControl', () => {
    it('should return paginated list of mapped policies for a control', async () => {
      prisma.control.findFirst.mockResolvedValue({
        id: 'ctrl-1',
        organizationId: 'tenant-org-alpha',
      });

      prisma.policyControl.findMany.mockResolvedValue([
        {
          id: 'map-1',
          policyId: 'pol-1',
          controlId: 'ctrl-1',
          status: MappingStatus.APPROVED,
          rationale: 'Governed by InfoSec policy section 4',
          createdAt: new Date(),
          policy: {
            code: 'POL-SEC-01',
            title: 'Information Security Policy',
            category: 'Information Security',
            status: 'PUBLISHED',
            ownerId: 'ciso-lead',
            publishedVersion: {
              versionNumber: '1.0',
            },
          },
        },
      ]);
      prisma.policyControl.count.mockResolvedValue(1);

      const result = await service.getPoliciesForControl(mockTenantContext, 'ctrl-1');

      expect(result.items).toHaveLength(1);
      expect(result.items[0].policyCode).toBe('POL-SEC-01');
      expect(result.items[0].publishedVersionNumber).toBe('1.0');
      expect(result.total).toBe(1);
    });

    it('should throw 404 if control does not exist in caller tenant', async () => {
      prisma.control.findFirst.mockResolvedValue(null);

      await expect(
        service.getPoliciesForControl(mockTenantContext, 'foreign-control'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateMapping', () => {
    it('should update rationale and status for an existing mapping', async () => {
      prisma.policyControl.updateMany.mockResolvedValue({ count: 1 });
      prisma.policyControl.findFirstOrThrow.mockResolvedValue({
        id: 'map-1',
        policyId: 'pol-1',
        controlId: 'ctrl-1',
        status: MappingStatus.APPROVED,
        rationale: 'Updated rationale after auditor review',
        version: 2,
        createdAt: new Date(),
        control: {
          name: 'Access Control',
          description: 'Desc',
          category: 'Sec',
          mappings: [],
        },
      });

      const result = await service.updateMapping(mockTenantContext, 'pol-1', 'ctrl-1', {
        rationale: 'Updated rationale after auditor review',
        expectedVersion: 1,
      });

      expect(result.rationale).toBe('Updated rationale after auditor review');
      expect(result.version).toBe(2);
      expect(auditLogsService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'POLICY_CONTROL_UPDATED',
        }),
        expect.anything(),
      );
    });

    it('should reject mapping update if expectedVersion is missing', async () => {
      await expect(
        service.updateMapping(mockTenantContext, 'pol-1', 'ctrl-1', { rationale: 'Test' } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw 404 if mapping does not exist', async () => {
      prisma.policyControl.updateMany.mockResolvedValue({ count: 0 });
      prisma.policyControl.findFirst.mockResolvedValue(null);

      await expect(
        service.updateMapping(mockTenantContext, 'pol-1', 'ctrl-1', { rationale: 'Test', expectedVersion: 1 }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw 409 ConflictException on stale expectedVersion', async () => {
      prisma.policyControl.updateMany.mockResolvedValue({ count: 0 });
      prisma.policyControl.findFirst.mockResolvedValue({
        id: 'map-1',
        version: 3,
        status: MappingStatus.APPROVED,
      });

      await expect(
        service.updateMapping(mockTenantContext, 'pol-1', 'ctrl-1', { rationale: 'Test', expectedVersion: 1 }),
      ).rejects.toThrow(ConflictException);
    });
  });
});

