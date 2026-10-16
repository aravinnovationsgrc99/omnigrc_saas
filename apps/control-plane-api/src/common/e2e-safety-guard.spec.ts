import {
  extractDatabaseTargetIdentity,
  validateTestDatabaseTarget,
  E2ETestIsolationManager,
} from './e2e-safety-guard';
import { ServiceStateEnum } from '@prisma/control-plane-client';

describe('E2ESafetyGuard and TestIsolationManager', () => {
  describe('extractDatabaseTargetIdentity', () => {
    it('should correctly parse localhost and 127.0.0.1', () => {
      const res1 = extractDatabaseTargetIdentity('postgresql://postgres:pass@localhost:5432/test');
      expect(res1).not.toBeNull();
      expect(res1?.hostname).toBe('localhost');
      expect(res1?.identity).toBe('localhost');

      const res2 = extractDatabaseTargetIdentity('postgresql://postgres:pass@127.0.0.1:5432/test');
      expect(res2?.hostname).toBe('127.0.0.1');
      expect(res2?.identity).toBe('127.0.0.1');
    });

    it('should extract Supabase project ref from username pooler pattern', () => {
      const url =
        'postgresql://postgres.wzkccgutcqjjxidwiwcx:secretPass@aws-0-us-east-1.pooler.supabase.com:6543/postgres';
      const res = extractDatabaseTargetIdentity(url);
      expect(res?.projectRef).toBe('wzkccgutcqjjxidwiwcx');
      expect(res?.identity).toBe('wzkccgutcqjjxidwiwcx');
    });

    it('should extract Supabase project ref from direct hostname pattern', () => {
      const url = 'postgresql://postgres:secretPass@db.wzkccgutcqjjxidwiwcx.supabase.co:5432/postgres';
      const res = extractDatabaseTargetIdentity(url);
      expect(res?.projectRef).toBe('wzkccgutcqjjxidwiwcx');
      expect(res?.identity).toBe('wzkccgutcqjjxidwiwcx');
    });

    it('should return null for malformed URLs', () => {
      const res = extractDatabaseTargetIdentity('not-a-valid-url:::');
      expect(res).toBeNull();
    });
  });

  describe('validateTestDatabaseTarget', () => {
    it('should fail closed when database URL is undefined or empty', () => {
      const res = validateTestDatabaseTarget(undefined);
      expect(res.isSafe).toBe(false);
      expect(res.error).toContain('FAIL_CLOSED: Missing database connection URL');
    });

    it('should fail closed when database URL is malformed', () => {
      const res = validateTestDatabaseTarget('invalid_database_url');
      expect(res.isSafe).toBe(false);
      expect(res.error).toContain('FAIL_CLOSED: Malformed database connection URL');
    });

    it('should fail closed in production environment regardless of target', () => {
      const res = validateTestDatabaseTarget('postgresql://postgres:pass@localhost:5432/test', {
        nodeEnv: 'production',
      });
      expect(res.isSafe).toBe(false);
      expect(res.error).toContain('strictly blocked in production and staging');
    });

    it('should fail closed in staging environment regardless of target', () => {
      const res = validateTestDatabaseTarget('postgresql://postgres:pass@localhost:5432/test', {
        nodeEnv: 'staging',
      });
      expect(res.isSafe).toBe(false);
      expect(res.error).toContain('strictly blocked in production and staging');
    });

    it('should allow local database targets in non-production environments', () => {
      const res = validateTestDatabaseTarget('postgresql://postgres:pass@localhost:5432/test_db', {
        nodeEnv: 'test',
      });
      expect(res.isSafe).toBe(true);
      expect(res.isLocal).toBe(true);
      expect(res.targetIdentity).toBe('localhost');
    });

    it('should fail closed when remote database is targeted without explicit test authorization', () => {
      const remoteUrl =
        'postgresql://postgres.wzkccgutcqjjxidwiwcx:secret@aws-0-us-east-1.pooler.supabase.com:6543/postgres';
      const res = validateTestDatabaseTarget(remoteUrl, {
        nodeEnv: 'test',
        allowRemoteTestDb: false,
      });
      expect(res.isSafe).toBe(false);
      expect(res.isLocal).toBe(false);
      expect(res.targetIdentity).toBe('wzkccgutcqjjxidwiwcx');
      expect(res.error).toContain('require explicit authorization');
    });

    it('should allow approved remote test database when explicitly authorized and matching project ref', () => {
      const remoteUrl =
        'postgresql://postgres.wzkccgutcqjjxidwiwcx:secret@aws-0-us-east-1.pooler.supabase.com:6543/postgres';
      const res = validateTestDatabaseTarget(remoteUrl, {
        nodeEnv: 'test',
        allowRemoteTestDb: true,
        approvedTestProjectRef: 'wzkccgutcqjjxidwiwcx',
      });
      expect(res.isSafe).toBe(true);
      expect(res.isLocal).toBe(false);
      expect(res.targetIdentity).toBe('wzkccgutcqjjxidwiwcx');
    });

    it('should fail closed when remote database does not match approved project ref', () => {
      const unapprovedUrl =
        'postgresql://postgres.unapproved_ref_xyz:secret@aws-0-us-east-1.pooler.supabase.com:6543/postgres';
      const res = validateTestDatabaseTarget(unapprovedUrl, {
        nodeEnv: 'test',
        allowRemoteTestDb: true,
        approvedTestProjectRef: 'approved_ref_abc',
      });
      expect(res.isSafe).toBe(false);
      expect(res.error).toContain('does not match approved test reference');
    });
  });

  describe('E2ETestIsolationManager', () => {
    let mockPrisma: any;
    let manager: E2ETestIsolationManager;

    beforeEach(() => {
      mockPrisma = {
        globalServiceState: {
          findMany: jest.fn(),
          upsert: jest.fn(),
          update: jest.fn(),
          deleteMany: jest.fn(),
        },
        serviceCatalog: {
          findUnique: jest.fn(),
          findMany: jest.fn(),
          create: jest.fn(),
          deleteMany: jest.fn(),
        },
        organizationServiceOverride: {
          deleteMany: jest.fn(),
        },
        serviceStateTransitionLog: {
          create: jest.fn(),
          deleteMany: jest.fn(),
        },
        controlPlaneAuditLog: {
          deleteMany: jest.fn(),
        },
      };
      manager = new E2ETestIsolationManager(mockPrisma);
    });

    it('assertEnvironmentSafe should throw on unsafe targets', () => {
      expect(() =>
        manager.assertEnvironmentSafe(
          'postgresql://postgres.unauthorized:pwd@aws-0-us-east-1.pooler.supabase.com:6543/postgres',
        ),
      ).toThrow();
    });

    it('seedEphemeralCapabilities should create catalog items and initial AVAILABLE global state', async () => {
      mockPrisma.serviceCatalog.findUnique.mockResolvedValue(null);
      mockPrisma.serviceCatalog.create.mockResolvedValue({ id: 'ephemeral-cat-1', code: 'E2E_TEST_CAP_1' });
      mockPrisma.globalServiceState.upsert.mockResolvedValue({ id: 'gss-1' });

      await manager.seedEphemeralCapabilities(['E2E_TEST_CAP_1']);

      expect(mockPrisma.serviceCatalog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            code: 'E2E_TEST_CAP_1',
            isOrgOverridePermitted: true,
          }),
        }),
      );
      expect(mockPrisma.globalServiceState.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { serviceId: 'ephemeral-cat-1' },
          create: expect.objectContaining({
            state: ServiceStateEnum.AVAILABLE,
          }),
        }),
      );
    });

    it('cleanupAndRestore should remove ephemeral capabilities completely', async () => {
      mockPrisma.serviceCatalog.findMany.mockResolvedValue([{ id: 'ephemeral-cat-1', code: 'E2E_TEST_CAP_1' }]);
      mockPrisma.serviceCatalog.findUnique.mockResolvedValue(null);

      // Seed first
      mockPrisma.serviceCatalog.create.mockResolvedValue({ id: 'ephemeral-cat-1', code: 'E2E_TEST_CAP_1' });
      await manager.seedEphemeralCapabilities(['E2E_TEST_CAP_1']);

      await manager.cleanupAndRestore();

      expect(mockPrisma.organizationServiceOverride.deleteMany).toHaveBeenCalledWith({
        where: { serviceId: { in: ['ephemeral-cat-1'] } },
      });
      expect(mockPrisma.globalServiceState.deleteMany).toHaveBeenCalledWith({
        where: { serviceId: { in: ['ephemeral-cat-1'] } },
      });
      expect(mockPrisma.serviceStateTransitionLog.deleteMany).toHaveBeenCalledWith({
        where: { serviceCode: { in: ['E2E_TEST_CAP_1'] } },
      });
      expect(mockPrisma.controlPlaneAuditLog.deleteMany).toHaveBeenCalledWith({
        where: { entityId: { in: ['E2E_TEST_CAP_1'] } },
      });
      expect(mockPrisma.serviceCatalog.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: ['ephemeral-cat-1'] } },
      });
    });

    it('cleanupAndRestore should restore altered canonical states preserving sequence and transition audit', async () => {
      // Snapshot state
      mockPrisma.globalServiceState.findMany.mockResolvedValue([
        {
          service: { id: 'canon-1', code: 'AI_CONTROL_MAPPING' },
          state: ServiceStateEnum.AVAILABLE,
          sequence: 12n,
          reason: 'Initial production state',
        },
      ]);
      await manager.snapshotCanonicalStates();

      // Simulate a test mutating canonical state to DISABLED
      mockPrisma.serviceCatalog.findMany.mockResolvedValue([]);
      mockPrisma.serviceCatalog.findUnique.mockResolvedValue({
        id: 'canon-1',
        code: 'AI_CONTROL_MAPPING',
        globalState: {
          state: ServiceStateEnum.DISABLED,
          sequence: 13n,
        },
      });

      await manager.cleanupAndRestore();

      // Must update global state back to AVAILABLE with sequence 14n (13n + 1n)
      expect(mockPrisma.globalServiceState.update).toHaveBeenCalledWith({
        where: { serviceId: 'canon-1' },
        data: expect.objectContaining({
          state: ServiceStateEnum.AVAILABLE,
          sequence: 14n,
        }),
      });

      // Must record transition log preserving sequence and audit integrity
      expect(mockPrisma.serviceStateTransitionLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          serviceCode: 'AI_CONTROL_MAPPING',
          previousState: ServiceStateEnum.DISABLED,
          newState: ServiceStateEnum.AVAILABLE,
          sequence: 14n,
          operatorId: 'E2E_TEARDOWN_RESTORER',
        }),
      });
    });

    it('cleanupAndRestore should not mutate canonical services if their state was unaltered', async () => {
      mockPrisma.globalServiceState.findMany.mockResolvedValue([
        {
          service: { id: 'canon-1', code: 'AI_CONTROL_MAPPING' },
          state: ServiceStateEnum.AVAILABLE,
          sequence: 12n,
          reason: 'Initial production state',
        },
      ]);
      await manager.snapshotCanonicalStates();

      // State is still AVAILABLE
      mockPrisma.serviceCatalog.findMany.mockResolvedValue([]);
      mockPrisma.serviceCatalog.findUnique.mockResolvedValue({
        id: 'canon-1',
        code: 'AI_CONTROL_MAPPING',
        globalState: {
          state: ServiceStateEnum.AVAILABLE,
          sequence: 12n,
        },
      });

      await manager.cleanupAndRestore();

      expect(mockPrisma.globalServiceState.update).not.toHaveBeenCalled();
      expect(mockPrisma.serviceStateTransitionLog.create).not.toHaveBeenCalled();
    });
  });
});
