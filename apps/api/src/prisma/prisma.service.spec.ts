import { ForbiddenException, BadRequestException } from '@nestjs/common';
import { tenantScopingMiddleware, TENANT_SCOPED_MODELS } from './prisma.service';
import { TenantContext } from '../tenant/tenant.context';

describe('PrismaService Tenant Scoping Middleware (Phase 4.4 Hardened)', () => {
  // 1. Model Registration & Baseline Scoping
  describe('1. Model Registration & Baseline Scoping', () => {
    it('should include PolicyCategory and core models in TENANT_SCOPED_MODELS', () => {
      expect(TENANT_SCOPED_MODELS).toContain('PolicyCategory');
      expect(TENANT_SCOPED_MODELS).toContain('Policy');
      expect(TENANT_SCOPED_MODELS).toContain('Risk');
      expect(TENANT_SCOPED_MODELS).toContain('Control');
      expect(TENANT_SCOPED_MODELS).toContain('ComplianceTask');
      expect(TENANT_SCOPED_MODELS).toContain('User');
    });

    it('should auto-inject organizationId on findMany for PolicyCategory', async () => {
      let capturedParams: any;
      const mockParams = {
        model: 'PolicyCategory',
        action: 'findMany',
        args: { where: {} },
      };

      const next = jest.fn().mockImplementation(async (p) => {
        capturedParams = p;
        return [];
      });

      await TenantContext.run({ organizationId: 'org-tenant-alpha' }, async () => {
        await tenantScopingMiddleware(mockParams, next);
      });

      expect(next).toHaveBeenCalled();
      expect(capturedParams.args.where.organizationId).toBe('org-tenant-alpha');
    });

    it('should auto-inject organizationId on create for PolicyCategory', async () => {
      let capturedParams: any;
      const mockParams = {
        model: 'PolicyCategory',
        action: 'create',
        args: { data: { name: 'New Custom Category' } },
      };

      const next = jest.fn().mockImplementation(async (p) => {
        capturedParams = p;
        return { id: 'cat-1', ...p.args.data };
      });

      await TenantContext.run({ organizationId: 'org-tenant-alpha' }, async () => {
        await tenantScopingMiddleware(mockParams, next);
      });

      expect(next).toHaveBeenCalled();
      expect(capturedParams.args.data.organizationId).toBe('org-tenant-alpha');
    });

    it('should accept matching explicit organizationId if it matches active tenant', async () => {
      let capturedParams: any;
      const mockParams = {
        model: 'PolicyCategory',
        action: 'findMany',
        args: { where: { organizationId: 'org-tenant-alpha' } },
      };

      const next = jest.fn().mockImplementation(async (p) => {
        capturedParams = p;
        return [];
      });

      await TenantContext.run({ organizationId: 'org-tenant-alpha' }, async () => {
        await tenantScopingMiddleware(mockParams, next);
      });

      expect(next).toHaveBeenCalled();
      expect(capturedParams.args.where.organizationId).toBe('org-tenant-alpha');
    });

    it('should auto-inject organizationId on deleteMany for PolicyCategory', async () => {
      let capturedParams: any;
      const mockParams = {
        model: 'PolicyCategory',
        action: 'deleteMany',
        args: { where: { name: 'Old Category' } },
      };

      const next = jest.fn().mockImplementation(async (p) => {
        capturedParams = p;
        return { count: 1 };
      });

      await TenantContext.run({ organizationId: 'org-tenant-alpha' }, async () => {
        await tenantScopingMiddleware(mockParams, next);
      });

      expect(next).toHaveBeenCalled();
      expect(capturedParams.args.where.organizationId).toBe('org-tenant-alpha');
      expect(capturedParams.args.where.name).toBe('Old Category');
    });
  });

  // 2. Missing Tenant Context (Fail-Closed)
  describe('2. Missing Tenant Context Fail-Closed Behavior', () => {
    it('should throw ForbiddenException on tenant-scoped read when context is missing', async () => {
      const mockParams = {
        model: 'Policy',
        action: 'findMany',
        args: { where: {} },
      };
      const next = jest.fn();

      await expect(tenantScopingMiddleware(mockParams, next)).rejects.toThrow(ForbiddenException);
      expect(next).not.toHaveBeenCalled();
    });

    it('should throw ForbiddenException on tenant-scoped mutation when context is missing', async () => {
      const mockParams = {
        model: 'Risk',
        action: 'create',
        args: { data: { title: 'Unauthorized Risk' } },
      };
      const next = jest.fn();

      await expect(tenantScopingMiddleware(mockParams, next)).rejects.toThrow(ForbiddenException);
      expect(next).not.toHaveBeenCalled();
    });

    it('should throw ForbiddenException on deleteMany when context is missing', async () => {
      const mockParams = {
        model: 'Control',
        action: 'deleteMany',
        args: { where: {} },
      };
      const next = jest.fn();

      await expect(tenantScopingMiddleware(mockParams, next)).rejects.toThrow(ForbiddenException);
      expect(next).not.toHaveBeenCalled();
    });
  });

  // 3. createMany Tenant Enforcement
  describe('3. createMany Tenant Enforcement', () => {
    it('should inject active tenant organizationId into every object in createMany data array', async () => {
      let capturedParams: any;
      const mockParams = {
        model: 'ComplianceTask',
        action: 'createMany',
        args: {
          data: [
            { title: 'Task 1' },
            { title: 'Task 2', organizationId: 'org-tenant-alpha' },
            { title: 'Task 3' },
          ],
          skipDuplicates: true,
        },
      };

      const next = jest.fn().mockImplementation(async (p) => {
        capturedParams = p;
        return { count: 3 };
      });

      await TenantContext.run({ organizationId: 'org-tenant-alpha' }, async () => {
        await tenantScopingMiddleware(mockParams, next);
      });

      expect(next).toHaveBeenCalled();
      expect(capturedParams.args.skipDuplicates).toBe(true);
      expect(capturedParams.args.data).toHaveLength(3);
      for (const item of capturedParams.args.data) {
        expect(item.organizationId).toBe('org-tenant-alpha');
      }
    });

    it('should safely handle empty data array in createMany', async () => {
      let capturedParams: any;
      const mockParams = {
        model: 'Asset',
        action: 'createMany',
        args: { data: [] },
      };

      const next = jest.fn().mockImplementation(async (p) => {
        capturedParams = p;
        return { count: 0 };
      });

      await TenantContext.run({ organizationId: 'org-tenant-alpha' }, async () => {
        await tenantScopingMiddleware(mockParams, next);
      });

      expect(next).toHaveBeenCalled();
      expect(capturedParams.args.data).toEqual([]);
    });

    it('should reject createMany if data is not an array', async () => {
      const mockParams = {
        model: 'Asset',
        action: 'createMany',
        args: { data: 'not-an-array' },
      };
      const next = jest.fn();

      await TenantContext.run({ organizationId: 'org-tenant-alpha' }, async () => {
        await expect(tenantScopingMiddleware(mockParams, next)).rejects.toThrow(BadRequestException);
      });
      expect(next).not.toHaveBeenCalled();
    });
  });

  // 4. Foreign & Conflicting Tenant Rejection
  describe('4. Foreign & Conflicting Tenant Rejection', () => {
    it('should reject createMany when input contains mixed or foreign organizationId', async () => {
      const mockParams = {
        model: 'Vulnerability',
        action: 'createMany',
        args: {
          data: [
            { title: 'Vulnerability 1', organizationId: 'org-tenant-alpha' },
            { title: 'Vulnerability 2', organizationId: 'org-foreign-attacker' },
          ],
        },
      };
      const next = jest.fn();

      await TenantContext.run({ organizationId: 'org-tenant-alpha' }, async () => {
        await expect(tenantScopingMiddleware(mockParams, next)).rejects.toThrow(ForbiddenException);
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('should reject create when data specifies a foreign organizationId', async () => {
      const mockParams = {
        model: 'Policy',
        action: 'create',
        args: {
          data: {
            title: 'Foreign Policy',
            organizationId: 'org-foreign-victim',
          },
        },
      };
      const next = jest.fn();

      await TenantContext.run({ organizationId: 'org-tenant-alpha' }, async () => {
        await expect(tenantScopingMiddleware(mockParams, next)).rejects.toThrow(ForbiddenException);
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('should reject findMany with foreign where.organizationId', async () => {
      const mockParams = {
        model: 'Policy',
        action: 'findMany',
        args: {
          where: { organizationId: 'org-foreign-victim' },
        },
      };
      const next = jest.fn();

      await TenantContext.run({ organizationId: 'org-tenant-alpha' }, async () => {
        await expect(tenantScopingMiddleware(mockParams, next)).rejects.toThrow(ForbiddenException);
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('should reject update if attempting to reassign organizationId to foreign tenant', async () => {
      const mockParams = {
        model: 'Risk',
        action: 'update',
        args: {
          where: { id: 'risk-1' },
          data: { organizationId: 'org-foreign-target' },
        },
      };
      const next = jest.fn();

      await TenantContext.run({ organizationId: 'org-tenant-alpha' }, async () => {
        await expect(tenantScopingMiddleware(mockParams, next)).rejects.toThrow(ForbiddenException);
      });
      expect(next).not.toHaveBeenCalled();
    });
  });

  // 5. Upsert Protection
  describe('5. Upsert Protection', () => {
    it('should inject organizationId on upsert where and create paths', async () => {
      let capturedParams: any;
      const mockParams = {
        model: 'PolicyCategory',
        action: 'upsert',
        args: {
          where: { name: 'Standard Category' },
          create: { name: 'Standard Category' },
          update: { isDefault: true },
        },
      };

      const next = jest.fn().mockImplementation(async (p) => {
        capturedParams = p;
        return { id: 'cat-1', ...p.args.create };
      });

      await TenantContext.run({ organizationId: 'org-tenant-alpha' }, async () => {
        await tenantScopingMiddleware(mockParams, next);
      });

      expect(next).toHaveBeenCalled();
      expect(capturedParams.args.where.organizationId).toBe('org-tenant-alpha');
      expect(capturedParams.args.create.organizationId).toBe('org-tenant-alpha');
    });

    it('should reject upsert if foreign organizationId is provided in create or update', async () => {
      const mockParams = {
        model: 'PolicyCategory',
        action: 'upsert',
        args: {
          where: {},
          create: { name: 'Cat', organizationId: 'org-foreign' },
          update: {},
        },
      };
      const next = jest.fn();

      await TenantContext.run({ organizationId: 'org-tenant-alpha' }, async () => {
        await expect(tenantScopingMiddleware(mockParams, next)).rejects.toThrow(ForbiddenException);
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('should permit upsert when compound unique selector organizationId matches tenant and NOT inject duplicate top-level organizationId', async () => {
      let capturedParams: any;
      const mockParams = {
        model: 'UserDashboardPreference',
        action: 'upsert',
        args: {
          where: {
            userId_organizationId: {
              userId: 'user-1',
              organizationId: 'org-tenant-alpha',
            },
          },
          create: { userId: 'user-1', configJson: {} },
          update: { configJson: {} },
        },
      };

      const next = jest.fn().mockImplementation(async (p) => {
        capturedParams = p;
        return { id: 'pref-1', ...p.args.create };
      });

      await TenantContext.run({ organizationId: 'org-tenant-alpha' }, async () => {
        await tenantScopingMiddleware(mockParams, next);
      });

      expect(next).toHaveBeenCalled();
      expect(capturedParams.args.where.userId_organizationId.organizationId).toBe('org-tenant-alpha');
      expect(capturedParams.args.where.organizationId).toBeUndefined();
      expect(capturedParams.args.create.organizationId).toBe('org-tenant-alpha');
    });

    it('should reject upsert when compound unique selector organizationId mismatches tenant', async () => {
      const mockParams = {
        model: 'UserDashboardPreference',
        action: 'upsert',
        args: {
          where: {
            userId_organizationId: {
              userId: 'user-1',
              organizationId: 'foreign-org',
            },
          },
          create: {},
          update: {},
        },
      };
      const next = jest.fn();

      await TenantContext.run({ organizationId: 'org-tenant-alpha' }, async () => {
        await expect(tenantScopingMiddleware(mockParams, next)).rejects.toThrow(ForbiddenException);
      });
      expect(next).not.toHaveBeenCalled();
    });
  });

  // 6. findUnique Conversion to findFirst
  describe('6. findUnique Conversion to findFirst', () => {
    it('should convert findUnique to findFirst and inject organizationId', async () => {
      let capturedParams: any;
      const mockParams = {
        model: 'Policy',
        action: 'findUnique',
        args: { where: { id: 'pol-123' } },
      };

      const next = jest.fn().mockImplementation(async (p) => {
        capturedParams = p;
        return { id: 'pol-123', organizationId: 'org-tenant-alpha' };
      });

      await TenantContext.run({ organizationId: 'org-tenant-alpha' }, async () => {
        await tenantScopingMiddleware(mockParams, next);
      });

      expect(next).toHaveBeenCalled();
      expect(capturedParams.action).toBe('findFirst');
      expect(capturedParams.args.where.organizationId).toBe('org-tenant-alpha');
      expect(capturedParams.args.where.id).toBe('pol-123');
    });

    it('should flatten compound unique selector organizationId_userId on findUnique for OrganizationMembership', async () => {
      let capturedParams: any;
      const mockParams = {
        model: 'OrganizationMembership',
        action: 'findUnique',
        args: {
          where: {
            organizationId_userId: {
              organizationId: 'org-tenant-alpha',
              userId: 'user-123',
            },
          },
        },
      };

      const next = jest.fn().mockImplementation(async (p) => {
        capturedParams = p;
        return { id: 'mem-1' };
      });

      await TenantContext.run({ organizationId: 'org-tenant-alpha' }, async () => {
        await tenantScopingMiddleware(mockParams, next);
      });

      expect(next).toHaveBeenCalled();
      expect(capturedParams.action).toBe('findFirst');
      expect(capturedParams.args.where.organizationId_userId).toBeUndefined();
      expect(capturedParams.args.where.organizationId).toBe('org-tenant-alpha');
      expect(capturedParams.args.where.userId).toBe('user-123');
    });

    it('should flatten compound unique selector organizationId_capabilityCode on findUnique for OrganizationServiceOverrideProjection', async () => {
      let capturedParams: any;
      const mockParams = {
        model: 'OrganizationServiceOverrideProjection',
        action: 'findUnique',
        args: {
          where: {
            organizationId_capabilityCode: {
              organizationId: 'org-tenant-alpha',
              capabilityCode: 'BUSINESS_AUDITS',
            },
          },
        },
      };

      const next = jest.fn().mockImplementation(async (p) => {
        capturedParams = p;
        return null;
      });

      await TenantContext.run({ organizationId: 'org-tenant-alpha' }, async () => {
        await tenantScopingMiddleware(mockParams, next);
      });

      expect(next).toHaveBeenCalled();
      expect(capturedParams.action).toBe('findFirst');
      expect(capturedParams.args.where.organizationId_capabilityCode).toBeUndefined();
      expect(capturedParams.args.where.organizationId).toBe('org-tenant-alpha');
      expect(capturedParams.args.where.capabilityCode).toBe('BUSINESS_AUDITS');
    });

    it('should flatten compound unique selector userId_organizationId on findUnique for UserDashboardPreference', async () => {
      let capturedParams: any;
      const mockParams = {
        model: 'UserDashboardPreference',
        action: 'findUnique',
        args: {
          where: {
            userId_organizationId: {
              userId: 'user-123',
              organizationId: 'org-tenant-alpha',
            },
          },
        },
      };

      const next = jest.fn().mockImplementation(async (p) => {
        capturedParams = p;
        return { id: 'pref-1' };
      });

      await TenantContext.run({ organizationId: 'org-tenant-alpha' }, async () => {
        await tenantScopingMiddleware(mockParams, next);
      });

      expect(next).toHaveBeenCalled();
      expect(capturedParams.action).toBe('findFirst');
      expect(capturedParams.args.where.userId_organizationId).toBeUndefined();
      expect(capturedParams.args.where.organizationId).toBe('org-tenant-alpha');
      expect(capturedParams.args.where.userId).toBe('user-123');
    });

    it('should reject findUnique when flattened compound unique selector specifies foreign organizationId', async () => {
      const mockParams = {
        model: 'OrganizationMembership',
        action: 'findUnique',
        args: {
          where: {
            organizationId_userId: {
              organizationId: 'foreign-org',
              userId: 'user-123',
            },
          },
        },
      };
      const next = jest.fn();

      await TenantContext.run({ organizationId: 'org-tenant-alpha' }, async () => {
        await expect(tenantScopingMiddleware(mockParams, next)).rejects.toThrow(ForbiddenException);
      });
      expect(next).not.toHaveBeenCalled();
    });
  });

  // 7. Full CRUD & Aggregation Action Coverage
  describe('7. Full CRUD & Aggregation Action Coverage', () => {
    it.each(['count', 'aggregate', 'groupBy', 'updateMany', 'deleteMany', 'findFirst'])(
      'should enforce organizationId scoping on action: %s',
      async (action) => {
        let capturedParams: any;
        const mockParams = {
          model: 'Control',
          action,
          args: { where: { status: 'ACTIVE' } },
        };

        const next = jest.fn().mockImplementation(async (p) => {
          capturedParams = p;
          return { count: 1 };
        });

        await TenantContext.run({ organizationId: 'org-tenant-alpha' }, async () => {
          await tenantScopingMiddleware(mockParams, next);
        });

        expect(next).toHaveBeenCalled();
        expect(capturedParams.args.where.organizationId).toBe('org-tenant-alpha');
        expect(capturedParams.args.where.status).toBe('ACTIVE');
      },
    );
  });

  // 8. Authorized and Unauthorized MSSP Context Switching
  describe('8. Authorized and Unauthorized MSSP Delegation', () => {
    it('should permit MSSP user to self-lookup with dual-org scope in User model', async () => {
      let capturedParams: any;
      const mockParams = {
        model: 'User',
        action: 'findFirst',
        args: { where: { id: 'mssp-user-id' } },
      };

      const next = jest.fn().mockImplementation(async (p) => {
        capturedParams = p;
        return { id: 'mssp-user-id' };
      });

      await TenantContext.run(
        {
          organizationId: 'client-org-1',
          userId: 'mssp-user-id',
          actingViaMsspId: 'mssp-home-org',
        },
        async () => {
          await tenantScopingMiddleware(mockParams, next);
        },
      );

      expect(next).toHaveBeenCalled();
      expect(capturedParams.args.where.organizationId).toEqual({
        in: ['client-org-1', 'mssp-home-org'],
      });
    });

    it('should permit MSSP display name lookups across client and home org', async () => {
      let capturedParams: any;
      const mockParams = {
        model: 'User',
        action: 'findMany',
        args: { where: { id: { in: ['usr-1', 'usr-2'] } } },
      };

      const next = jest.fn().mockImplementation(async (p) => {
        capturedParams = p;
        return [];
      });

      await TenantContext.run(
        {
          organizationId: 'client-org-1',
          actingViaMsspId: 'mssp-home-org',
          isDisplayNameLookup: true,
        },
        async () => {
          await tenantScopingMiddleware(mockParams, next);
        },
      );

      expect(next).toHaveBeenCalled();
      expect(capturedParams.args.where.organizationId).toEqual({
        in: ['client-org-1', 'mssp-home-org'],
      });
    });

    it('should reject foreign tenant ID even when acting via MSSP', async () => {
      const mockParams = {
        model: 'User',
        action: 'findMany',
        args: { where: { organizationId: 'unrelated-foreign-org' } },
      };
      const next = jest.fn();

      await TenantContext.run(
        {
          organizationId: 'client-org-1',
          actingViaMsspId: 'mssp-home-org',
        },
        async () => {
          await expect(tenantScopingMiddleware(mockParams, next)).rejects.toThrow(ForbiddenException);
        },
      );
      expect(next).not.toHaveBeenCalled();
    });
  });

  // 9. Legitimate System Execution Context
  describe('9. Legitimate System Execution Context for Scheduled Jobs', () => {
    it('should permit unscoped query inside TenantContext.runSystemContext', async () => {
      let capturedParams: any;
      const mockParams = {
        model: 'ComplianceTask',
        action: 'findMany',
        args: { where: { dueDate: { lte: new Date() } } },
      };

      const next = jest.fn().mockImplementation(async (p) => {
        capturedParams = p;
        return [];
      });

      await TenantContext.runSystemContext(async () => {
        await tenantScopingMiddleware(mockParams, next);
      });

      expect(next).toHaveBeenCalled();
      // System queries are preserved without error
      expect(capturedParams.model).toBe('ComplianceTask');
    });

    it('should preserve explicit tenant scope when specified in system context', async () => {
      let capturedParams: any;
      const mockParams = {
        model: 'Risk',
        action: 'count',
        args: { where: { organizationId: 'org-target-batch', score: { gte: 15 } } },
      };

      const next = jest.fn().mockImplementation(async (p) => {
        capturedParams = p;
        return 5;
      });

      await TenantContext.runSystemContext(async () => {
        await tenantScopingMiddleware(mockParams, next);
      });

      expect(next).toHaveBeenCalled();
      expect(capturedParams.args.where.organizationId).toBe('org-target-batch');
    });
  });

  // 10. Non-Tenant-Scoped Models
  describe('10. Non-Tenant-Scoped Models', () => {
    it('should allow queries on non-tenant-scoped models without tenant context', async () => {
      let capturedParams: any;
      const mockParams = {
        model: 'Organization',
        action: 'findMany',
        args: { where: {} },
      };

      const next = jest.fn().mockImplementation(async (p) => {
        capturedParams = p;
        return [{ id: 'org-1' }, { id: 'org-2' }];
      });

      // Executed with NO TenantContext
      await tenantScopingMiddleware(mockParams, next);

      expect(next).toHaveBeenCalled();
      expect(capturedParams.model).toBe('Organization');
    });

    it('should allow queries on Framework without tenant context', async () => {
      let capturedParams: any;
      const mockParams = {
        model: 'Framework',
        action: 'findUnique',
        args: { where: { code: 'SOC2' } },
      };

      const next = jest.fn().mockImplementation(async (p) => {
        capturedParams = p;
        return { id: 'fw-soc2', code: 'SOC2' };
      });

      await tenantScopingMiddleware(mockParams, next);

      expect(next).toHaveBeenCalled();
      expect(capturedParams.model).toBe('Framework');
    });
  });

  // 11. Expanded Direct and Child Tenant Models (Phase 1 Security Foundation)
  describe('11. Expanded Direct and Child Tenant Models Coverage', () => {
    it('should include newly discovered direct models in TENANT_SCOPED_MODELS', () => {
      expect(TENANT_SCOPED_MODELS).toContain('Department');
      expect(TENANT_SCOPED_MODELS).toContain('Project');
      expect(TENANT_SCOPED_MODELS).toContain('OrganizationMembership');
      expect(TENANT_SCOPED_MODELS).toContain('Evidence');
      expect(TENANT_SCOPED_MODELS).toContain('ApprovalWorkflow');
      expect(TENANT_SCOPED_MODELS).toContain('ApprovalInstance');
      expect(TENANT_SCOPED_MODELS).toContain('RiskControl');
      expect(TENANT_SCOPED_MODELS).toContain('DocumentAnalysis');
    });

    it('should auto-inject organizationId on findMany for Department', async () => {
      let capturedParams: any;
      const mockParams = {
        model: 'Department',
        action: 'findMany',
        args: { where: { name: 'Engineering' } },
      };

      const next = jest.fn().mockImplementation(async (p) => {
        capturedParams = p;
        return [];
      });

      await TenantContext.run({ organizationId: 'org-tenant-alpha' }, async () => {
        await tenantScopingMiddleware(mockParams, next);
      });

      expect(next).toHaveBeenCalled();
      expect(capturedParams.args.where.organizationId).toBe('org-tenant-alpha');
      expect(capturedParams.args.where.name).toBe('Engineering');
    });

    it('should auto-inject organizationId on create for Evidence', async () => {
      let capturedParams: any;
      const mockParams = {
        model: 'Evidence',
        action: 'create',
        args: { data: { title: 'SOC2 Evidence Report' } },
      };

      const next = jest.fn().mockImplementation(async (p) => {
        capturedParams = p;
        return { id: 'ev-1', ...p.args.data };
      });

      await TenantContext.run({ organizationId: 'org-tenant-alpha' }, async () => {
        await tenantScopingMiddleware(mockParams, next);
      });

      expect(next).toHaveBeenCalled();
      expect(capturedParams.args.data.organizationId).toBe('org-tenant-alpha');
    });

    it('should scope PolicyVersion via policy relation on findMany', async () => {
      let capturedParams: any;
      const mockParams = {
        model: 'PolicyVersion',
        action: 'findMany',
        args: { where: { versionNumber: '1.0' } },
      };

      const next = jest.fn().mockImplementation(async (p) => {
        capturedParams = p;
        return [];
      });

      await TenantContext.run({ organizationId: 'org-tenant-alpha' }, async () => {
        await tenantScopingMiddleware(mockParams, next);
      });

      expect(next).toHaveBeenCalled();
      expect(capturedParams.args.where.policy).toEqual({ organizationId: 'org-tenant-alpha' });
      expect(capturedParams.args.where.versionNumber).toBe('1.0');
      // Must not inject scalar organizationId into where
      expect(capturedParams.args.where.organizationId).toBeUndefined();
    });

    it('should NOT inject scalar organizationId into data on PolicyVersion create', async () => {
      let capturedParams: any;
      const mockParams = {
        model: 'PolicyVersion',
        action: 'create',
        args: {
          data: {
            policyId: 'pol-123',
            versionNumber: '2.0',
            content: 'Updated policy body',
            createdById: 'usr-1',
          },
        },
      };

      const next = jest.fn().mockImplementation(async (p) => {
        capturedParams = p;
        return { id: 'pv-1', ...p.args.data };
      });

      await TenantContext.run({ organizationId: 'org-tenant-alpha' }, async () => {
        await tenantScopingMiddleware(mockParams, next);
      });

      expect(next).toHaveBeenCalled();
      // Scalar organizationId must not be added to data payload
      expect(capturedParams.args.data.organizationId).toBeUndefined();
      expect(capturedParams.args.data.policyId).toBe('pol-123');
    });

    it('should reject PolicyVersion with foreign policy.organizationId in where clause', async () => {
      const mockParams = {
        model: 'PolicyVersion',
        action: 'findMany',
        args: {
          where: {
            policy: { organizationId: 'foreign-org' },
          },
        },
      };
      const next = jest.fn();

      await TenantContext.run({ organizationId: 'org-tenant-alpha' }, async () => {
        await expect(tenantScopingMiddleware(mockParams, next)).rejects.toThrow(ForbiddenException);
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('should scope ApprovalWorkflowStep via workflow relation on findMany', async () => {
      let capturedParams: any;
      const mockParams = {
        model: 'ApprovalWorkflowStep',
        action: 'findMany',
        args: { where: { stepNumber: 1 } },
      };

      const next = jest.fn().mockImplementation(async (p) => {
        capturedParams = p;
        return [];
      });

      await TenantContext.run({ organizationId: 'org-tenant-alpha' }, async () => {
        await tenantScopingMiddleware(mockParams, next);
      });

      expect(next).toHaveBeenCalled();
      expect(capturedParams.args.where.workflow).toEqual({ organizationId: 'org-tenant-alpha' });
      expect(capturedParams.args.where.stepNumber).toBe(1);
    });
  });
});
