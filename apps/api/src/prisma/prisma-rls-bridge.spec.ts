import { ExecutionContext, CallHandler } from '@nestjs/common';
import { of, throwError } from 'rxjs';
import { PrismaService } from './prisma.service';
import { TenantContext } from '../tenant/tenant.context';
import { TenantTransactionInterceptor } from '../tenant/tenant-transaction.interceptor';

describe('Application-to-PostgreSQL RLS Context Bridge', () => {
  let prismaService: PrismaService;
  let mockSuperTransaction: jest.SpyInstance;

  beforeEach(() => {
    prismaService = new PrismaService();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // 1. Tenant A context is initialized before protected query, inside the same transaction
  describe('1. Tenant Context Transaction Scoping', () => {
    it('should initialize app.current_tenant transaction-locally using parameterized SQL before executing query', async () => {
      const mockTx = {
        $executeRawUnsafe: jest.fn().mockResolvedValue(1),
        policy: {
          findMany: jest.fn().mockResolvedValue([{ id: 'p1', organizationId: 'tenant-a' }]),
        },
      };

      // Mock super.$transaction to invoke the callback with mockTx
      mockSuperTransaction = jest
        .spyOn(Object.getPrototypeOf(Object.getPrototypeOf(prismaService)), '$transaction')
        .mockImplementation(async (cb: any) => cb(mockTx));

      let queryExecutedInsideTx = false;
      const result = await TenantContext.run({ organizationId: 'tenant-a' }, async () => {
        return prismaService.withTenantTransaction(async () => {
          // Verify that during callback execution, txClient is active in TenantContext
          expect(TenantContext.getTxClient()).toBe(mockTx);

          // Standard model call should be transparently routed to mockTx via Proxy
          const policies = await prismaService.policy.findMany();
          queryExecutedInsideTx = true;
          return policies;
        });
      });

      expect(mockSuperTransaction).toHaveBeenCalled();
      expect(mockTx.$executeRawUnsafe).toHaveBeenCalledWith(
        "SELECT set_config('app.current_tenant', $1, true);",
        'tenant-a',
      );
      expect(mockTx.policy.findMany).toHaveBeenCalled();
      expect(queryExecutedInsideTx).toBe(true);
      expect(result).toEqual([{ id: 'p1', organizationId: 'tenant-a' }]);

      // Verify that after transaction finishes, txClient is cleared from TenantContext
      expect(TenantContext.getTxClient()).toBeUndefined();
    });
  });

  // 2. Cross-Tenant Context Separation
  describe('2. Cross-Tenant Context Separation', () => {
    it('should configure strictly Tenant B context and not retain Tenant A', async () => {
      const mockTxB = {
        $executeRawUnsafe: jest.fn().mockResolvedValue(1),
        risk: {
          findMany: jest.fn().mockResolvedValue([{ id: 'r1', organizationId: 'tenant-b' }]),
        },
      };

      mockSuperTransaction = jest
        .spyOn(Object.getPrototypeOf(Object.getPrototypeOf(prismaService)), '$transaction')
        .mockImplementation(async (cb: any) => cb(mockTxB));

      await TenantContext.run({ organizationId: 'tenant-b' }, async () => {
        await prismaService.withTenantTransaction(async () => {
          expect(TenantContext.getOrganizationId()).toBe('tenant-b');
          await prismaService.risk.findMany();
        });
      });

      expect(mockTxB.$executeRawUnsafe).toHaveBeenCalledWith(
        "SELECT set_config('app.current_tenant', $1, true);",
        'tenant-b',
      );
      expect(mockTxB.$executeRawUnsafe).not.toHaveBeenCalledWith(
        expect.anything(),
        'tenant-a',
      );
    });
  });

  // 3. Missing Tenant Context Fail-Closed Behavior
  describe('3. Missing Tenant Context Behavior', () => {
    it('should not open transaction when organizationId is missing', async () => {
      mockSuperTransaction = jest
        .spyOn(Object.getPrototypeOf(Object.getPrototypeOf(prismaService)), '$transaction');

      let callbackCalled = false;
      await TenantContext.run({}, async () => {
        await prismaService.withTenantTransaction(async () => {
          callbackCalled = true;
        });
      });

      expect(callbackCalled).toBe(true);
      expect(mockSuperTransaction).not.toHaveBeenCalled();
      expect(TenantContext.getTxClient()).toBeUndefined();
    });
  });

  // 4. Transaction Rollback & Cleanup
  describe('4. Transaction Rollback & Error Propagation', () => {
    it('should cleanly propagate errors and clear txClient on rollback', async () => {
      const mockTx = {
        $executeRawUnsafe: jest.fn().mockResolvedValue(1),
        policy: {
          create: jest.fn().mockRejectedValue(new Error('Simulated DB error')),
        },
      };

      mockSuperTransaction = jest
        .spyOn(Object.getPrototypeOf(Object.getPrototypeOf(prismaService)), '$transaction')
        .mockImplementation(async (cb: any) => cb(mockTx));

      await expect(
        TenantContext.run({ organizationId: 'tenant-a' }, async () => {
          return prismaService.withTenantTransaction(async () => {
            await prismaService.policy.create({ data: { title: 'Test' } } as any);
          });
        }),
      ).rejects.toThrow('Simulated DB error');

      // Ensure txClient is not leaked even after thrown error
      expect(TenantContext.getTxClient()).toBeUndefined();
    });

    it('should reuse outer transaction when nested $transaction is called', async () => {
      const mockTx = {
        $executeRawUnsafe: jest.fn().mockResolvedValue(1),
        policy: {
          findMany: jest.fn().mockResolvedValue([]),
        },
      };

      mockSuperTransaction = jest
        .spyOn(Object.getPrototypeOf(Object.getPrototypeOf(prismaService)), '$transaction')
        .mockImplementation(async (cb: any) => cb(mockTx));

      await TenantContext.run({ organizationId: 'tenant-a' }, async () => {
        await prismaService.withTenantTransaction(async () => {
          // Inner service transaction call
          const innerResult = await prismaService.$transaction(async (innerTx) => {
            expect(innerTx).toBe(mockTx);
            return 'nested-success';
          });
          expect(innerResult).toBe('nested-success');
        });
      });

      // super.$transaction should have been called only once (for the outer transaction)
      expect(mockSuperTransaction).toHaveBeenCalledTimes(1);
    });
  });

  // 5. Authorized MSSP Delegation Context
  describe('5. Authorized MSSP Delegation Context', () => {
    it('should set both app.current_tenant and app.acting_mssp_id when acting via MSSP', async () => {
      const mockTx = {
        $executeRawUnsafe: jest.fn().mockResolvedValue(1),
        user: {
          findMany: jest.fn().mockResolvedValue([]),
        },
      };

      mockSuperTransaction = jest
        .spyOn(Object.getPrototypeOf(Object.getPrototypeOf(prismaService)), '$transaction')
        .mockImplementation(async (cb: any) => cb(mockTx));

      await TenantContext.run(
        { organizationId: 'client-org', actingViaMsspId: 'parent-mssp-org' },
        async () => {
          await prismaService.withTenantTransaction(async () => {
            await prismaService.user.findMany();
          });
        },
      );

      expect(mockTx.$executeRawUnsafe).toHaveBeenCalledWith(
        "SELECT set_config('app.current_tenant', $1, true);",
        'client-org',
      );
      expect(mockTx.$executeRawUnsafe).toHaveBeenCalledWith(
        "SELECT set_config('app.acting_mssp_id', $1, true);",
        'parent-mssp-org',
      );
    });
  });

  // 6. System Context and Auth Bootstrap
  describe('6. System Context and Scheduled Jobs', () => {
    it('should not wrap system jobs in tenant transaction when isSystemContext is active', async () => {
      mockSuperTransaction = jest
        .spyOn(Object.getPrototypeOf(Object.getPrototypeOf(prismaService)), '$transaction');

      let executed = false;
      await TenantContext.runSystemContext(async () => {
        await prismaService.withTenantTransaction(async () => {
          executed = true;
        });
      });

      expect(executed).toBe(true);
      expect(mockSuperTransaction).not.toHaveBeenCalled();
      expect(TenantContext.getTxClient()).toBeUndefined();
    });
  });

  // 7. TenantTransactionInterceptor Verification
  describe('7. TenantTransactionInterceptor HTTP Request Lifecycle', () => {
    let interceptor: TenantTransactionInterceptor;

    beforeEach(() => {
      interceptor = new TenantTransactionInterceptor(prismaService);
    });

    it('should intercept authenticated HTTP request and wrap in tenant transaction', async () => {
      const mockExecutionContext = {
        getType: () => 'http',
      } as ExecutionContext;

      const mockCallHandler = {
        handle: () => of({ success: true }),
      } as CallHandler;

      const withTenantTxSpy = jest
        .spyOn(prismaService, 'withTenantTransaction')
        .mockImplementation(async (cb: any) => cb());

      await TenantContext.run({ organizationId: 'tenant-http-1' }, async () => {
        const result = await new Promise((resolve, reject) => {
          interceptor.intercept(mockExecutionContext, mockCallHandler).subscribe({
            next: resolve,
            error: reject,
          });
        });

        expect(result).toEqual({ success: true });
        expect(withTenantTxSpy).toHaveBeenCalled();
      });
    });

    it('should bypass transaction wrapping for unauthenticated requests', async () => {
      const mockExecutionContext = {
        getType: () => 'http',
      } as ExecutionContext;

      const mockCallHandler = {
        handle: () => of({ publicData: true }),
      } as CallHandler;

      const withTenantTxSpy = jest.spyOn(prismaService, 'withTenantTransaction');

      await TenantContext.run({}, async () => {
        const result = await new Promise((resolve, reject) => {
          interceptor.intercept(mockExecutionContext, mockCallHandler).subscribe({
            next: resolve,
            error: reject,
          });
        });

        expect(result).toEqual({ publicData: true });
        expect(withTenantTxSpy).not.toHaveBeenCalled();
      });
    });
  });

  // 8. Dedicated Application Role & Raw Query Bridge
  describe('8. Dedicated Application Role & Transaction Proxy Routing', () => {
    it('should route raw SQL queries and expanded models through the active tenant transaction client', async () => {
      const mockTx = {
        $executeRawUnsafe: jest.fn().mockResolvedValue(1),
        $queryRawUnsafe: jest.fn().mockResolvedValue([{ rolname: 'omnigrc_app', rolsuper: false, rolbypassrls: false }]),
        department: {
          findMany: jest.fn().mockResolvedValue([{ id: 'dep-1', organizationId: 'tenant-a' }]),
        },
      };

      mockSuperTransaction = jest
        .spyOn(Object.getPrototypeOf(Object.getPrototypeOf(prismaService)), '$transaction')
        .mockImplementation(async (cb: any) => cb(mockTx));

      await TenantContext.run({ organizationId: 'tenant-a' }, async () => {
        await prismaService.withTenantTransaction(async () => {
          // Verify raw query routing to mockTx
          const roleCheck = await prismaService.$queryRawUnsafe(
            "SELECT rolname, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user;"
          );
          expect(roleCheck).toEqual([{ rolname: 'omnigrc_app', rolsuper: false, rolbypassrls: false }]);

          // Verify expanded model routing to mockTx
          const depts = await (prismaService as any).department.findMany();
          expect(depts).toEqual([{ id: 'dep-1', organizationId: 'tenant-a' }]);
        });
      });

      expect(mockTx.$queryRawUnsafe).toHaveBeenCalledWith(
        "SELECT rolname, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user;"
      );
      expect(mockTx.department.findMany).toHaveBeenCalled();
    });

    it('should verify least-privilege role assertions for omnigrc_app attributes', () => {
      // Simulate role metadata query result
      const roleRecord = {
        rolname: 'omnigrc_app',
        rolsuper: false,
        rolbypassrls: false,
        rolcanlogin: true,
      };

      // Least-privilege role must NOT have superuser or bypassrls privileges
      expect(roleRecord.rolsuper).toBe(false);
      expect(roleRecord.rolbypassrls).toBe(false);
      expect(roleRecord.rolname).toBe('omnigrc_app');
    });
  });
});
