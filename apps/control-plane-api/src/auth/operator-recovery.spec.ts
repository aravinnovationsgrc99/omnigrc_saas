import { executeOperatorRecovery, validateDatabaseTarget } from '../../scripts/operator-recovery';
import { OperatorRole, OperatorStatus } from '@prisma/control-plane-client';

describe('Operator Recovery Workflow Security Specification', () => {
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      operator: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      operatorSession: {
        updateMany: jest.fn().mockResolvedValue({ count: 2 }),
      },
      controlPlaneAuditLog: {
        create: jest.fn().mockResolvedValue({ id: 'audit_rec_1' }),
      },
    };
  });

  describe('Database Target Safety & Fail-Closed Guardrails', () => {
    it('should fail closed when database URL is unset or undefined', () => {
      const validation = validateDatabaseTarget(undefined);
      expect(validation.isValid).toBe(false);
      expect(validation.error).toContain('Missing database connection URL');
    });

    it('should fail closed when database URL is malformed', () => {
      const validation = validateDatabaseTarget('not_a_valid_url');
      expect(validation.isValid).toBe(false);
      expect(validation.error).toContain('Malformed database connection URL');
    });

    it('should fail closed when database URL is remote and target project identity is ambiguous', () => {
      // Supabase pooler target without project ref in username
      const validation = validateDatabaseTarget(
        'postgresql://postgres:pass@aws-0-ap-south-1.pooler.supabase.com:5432/postgres',
        {
          approvedDevIdentity: 'wzkccgutcqjjxidwiwcx',
          allowRemoteDevDb: 'wzkccgutcqjjxidwiwcx',
        },
      );
      expect(validation.isValid).toBe(false);
      expect(validation.isLocal).toBe(false);
      expect(validation.error).toContain('project/database identity cannot be positively established');
    });

    // Regression Test 1: Unset NODE_ENV with a remote target
    it('should fail closed on unset NODE_ENV with a remote target unless properly authorized', () => {
      // 1a: Remote target with unset NODE_ENV and no CLI confirmation flag
      const v1 = validateDatabaseTarget(
        'postgresql://postgres.wzkccgutcqjjxidwiwcx:pass@aws-0-ap-south-1.pooler.supabase.com:5432/postgres',
        {
          nodeEnv: undefined,
          approvedDevIdentity: 'wzkccgutcqjjxidwiwcx',
          // no allowRemoteDevDb
        },
      );
      expect(v1.isValid).toBe(false);
      expect(v1.error).toContain('--allow-remote-dev-db');

      // 1b: Remote target with unset NODE_ENV and missing allowlist configuration
      const v2 = validateDatabaseTarget(
        'postgresql://postgres.wzkccgutcqjjxidwiwcx:pass@aws-0-ap-south-1.pooler.supabase.com:5432/postgres',
        {
          nodeEnv: undefined,
          approvedDevIdentity: '',
          allowRemoteDevDb: 'wzkccgutcqjjxidwiwcx',
        },
      );
      expect(v2.isValid).toBe(false);
      expect(v2.error).toContain('Missing approved remote development database allowlist');
    });

    // Regression Test 2: Remote production target with the same hostname as the development target
    it('should fail closed when remote production target shares the same pooler hostname as development target', () => {
      // Both environments share pooler host aws-0-ap-south-1.pooler.supabase.com
      // Production database has project ref 'omnigrc_production_project_live'
      const prodUrl =
        'postgresql://postgres.omnigrc_production_project_live:pass@aws-0-ap-south-1.pooler.supabase.com:5432/postgres';

      const validation = validateDatabaseTarget(prodUrl, {
        approvedDevIdentity: 'wzkccgutcqjjxidwiwcx', // only dev project ref is approved
        allowRemoteDevDb: 'wzkccgutcqjjxidwiwcx',
        nodeEnv: 'development',
      });

      expect(validation.isValid).toBe(false);
      expect(validation.error).toContain('Unauthorized remote database target');
      expect(validation.error).toContain('omnigrc_production_project_live');
      // Assert no secret material or passwords leaked in error message
      expect(validation.error).not.toContain('pass');
    });

    // Regression Test 3: Mismatched Supabase project/database identity
    it('should fail closed on mismatched Supabase project/database identity', () => {
      const wrongProjectUrl =
        'postgresql://postgres.rogue_unapproved_project:pass@aws-0-ap-south-1.pooler.supabase.com:5432/postgres';

      const validation = validateDatabaseTarget(wrongProjectUrl, {
        approvedDevIdentity: 'wzkccgutcqjjxidwiwcx',
        allowRemoteDevDb: 'rogue_unapproved_project',
        nodeEnv: 'development',
      });

      expect(validation.isValid).toBe(false);
      expect(validation.error).toContain('Unauthorized remote database target');
    });

    // Regression Test 4: Missing or conflicting allowlist configuration
    it('should fail closed on missing or conflicting allowlist configuration', () => {
      const devUrl =
        'postgresql://postgres.wzkccgutcqjjxidwiwcx:pass@aws-0-ap-south-1.pooler.supabase.com:5432/postgres';

      // 4a: Missing allowlist configuration
      const missingAllowlist = validateDatabaseTarget(devUrl, {
        approvedDevIdentity: '',
        allowRemoteDevDb: 'wzkccgutcqjjxidwiwcx',
      });
      expect(missingAllowlist.isValid).toBe(false);
      expect(missingAllowlist.error).toContain('Missing approved remote development database allowlist');

      // 4b: Conflicting allowlist vs CLI flag
      const conflictingFlag = validateDatabaseTarget(devUrl, {
        approvedDevIdentity: 'wzkccgutcqjjxidwiwcx',
        allowRemoteDevDb: 'different_project_ref',
      });
      expect(conflictingFlag.isValid).toBe(false);
      expect(conflictingFlag.error).toContain('Conflicting remote target authorization');

      // 4c: Staging/production environment conflicting with development flag
      const stagingConflict = validateDatabaseTarget(devUrl, {
        nodeEnv: 'staging',
        approvedDevIdentity: 'wzkccgutcqjjxidwiwcx',
        allowRemoteDevDb: 'wzkccgutcqjjxidwiwcx',
      });
      expect(stagingConflict.isValid).toBe(false);
      expect(stagingConflict.error).toContain('blocked in production and staging');
    });

    // Regression Test 5: Explicitly approved development target
    it('should authorize an explicitly approved development target with positive project identity and matching flag', () => {
      const devUrl =
        'postgresql://postgres.wzkccgutcqjjxidwiwcx:pass@aws-0-ap-south-1.pooler.supabase.com:5432/postgres';

      const validation = validateDatabaseTarget(devUrl, {
        approvedDevIdentity: 'wzkccgutcqjjxidwiwcx',
        allowRemoteDevDb: 'wzkccgutcqjjxidwiwcx',
        nodeEnv: 'development',
      });

      expect(validation.isValid).toBe(true);
      expect(validation.isLocal).toBe(false);
      expect(validation.projectRef).toBe('wzkccgutcqjjxidwiwcx');
      expect(validation.redactedHost).toBe('aws-0-***.pooler.supabase.com');
      // Assert no sensitive credentials are present in validation output
      expect(JSON.stringify(validation)).not.toContain('pass');
    });

    it('should positively identify localhost and 127.0.0.1 as local development targets', () => {
      const v1 = validateDatabaseTarget('postgresql://postgres:postgres@localhost:5432/control_plane');
      expect(v1.isValid).toBe(true);
      expect(v1.isLocal).toBe(true);

      const v2 = validateDatabaseTarget('postgresql://postgres:postgres@127.0.0.1:5432/control_plane');
      expect(v2.isValid).toBe(true);
      expect(v2.isLocal).toBe(true);
    });

    it('should fail closed against any database mutation when isProduction is true', () => {
      const validation = validateDatabaseTarget('postgresql://postgres:postgres@localhost:5432/control_plane', {
        isProduction: true,
      });
      expect(validation.isValid).toBe(false);
      expect(validation.error).toContain('blocked in production');
    });
  });

  describe('Secret Disclosure & Information Leakage Prevention', () => {
    it('should return operator status without disclosing passwords, TOTP secrets, or live codes', async () => {
      mockPrisma.operator.findUnique.mockResolvedValue({
        id: 'op_test_1',
        email: 'initial-admin@omnigrc.co',
        fullName: 'Platform Super Admin',
        role: OperatorRole.PLATFORM_SUPER_ADMIN,
        status: OperatorStatus.ACTIVE,
        mfaEnabled: true,
        failedLoginAttempts: 0,
        lockedUntil: null,
      });

      const result = await executeOperatorRecovery(mockPrisma, {
        email: 'initial-admin@omnigrc.co',
        action: 'status',
        dbUrl: 'postgresql://postgres:pass@localhost:5432/cp',
      });

      expect(result.success).toBe(true);
      expect(result.operatorId).toBe('op_test_1');
      expect(result.mfaStatus).toBe('ENROLLED');
      expect(result.targetDatabaseType).toBe('LOCAL_DEV');
      // Assert no secret material is exposed in the result
      expect((result as any).totpSecret).toBeUndefined();
      expect((result as any).password).toBeUndefined();
      expect((result as any).passwordHash).toBeUndefined();
      expect((result as any).code).toBeUndefined();
      expect((result as any).otpauthUrl).toBeUndefined();
    });
  });

  describe('MFA Recovery & Re-Enrollment Safety Guardrails', () => {
    it('should reject reset-mfa when explicit confirmation is not provided', async () => {
      mockPrisma.operator.findUnique.mockResolvedValue({
        id: 'op_test_1',
        email: 'initial-admin@omnigrc.co',
        role: OperatorRole.PLATFORM_SUPER_ADMIN,
        status: OperatorStatus.ACTIVE,
        mfaEnabled: true,
      });

      const result = await executeOperatorRecovery(mockPrisma, {
        email: 'initial-admin@omnigrc.co',
        action: 'reset-mfa',
        confirm: false,
        dbUrl: 'postgresql://postgres:pass@localhost:5432/cp',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Confirmation required');
      expect(mockPrisma.operator.update).not.toHaveBeenCalled();
      expect(mockPrisma.operatorSession.updateMany).not.toHaveBeenCalled();
    });

    it('should refuse recovery mutations in production environments', async () => {
      const result = await executeOperatorRecovery(mockPrisma, {
        email: 'initial-admin@omnigrc.co',
        action: 'reset-mfa',
        confirm: true,
        isProduction: true,
        dbUrl: 'postgresql://postgres:pass@localhost:5432/cp',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('blocked in production');
      expect(mockPrisma.operator.update).not.toHaveBeenCalled();
    });

    it('should refuse recovery mutations against remote DB without explicit authorization', async () => {
      const result = await executeOperatorRecovery(mockPrisma, {
        email: 'initial-admin@omnigrc.co',
        action: 'reset-mfa',
        confirm: true,
        isProduction: false,
        dbUrl: 'postgresql://postgres.wzkccgutcqjjxidwiwcx:pass@aws-0-ap-south-1.pooler.supabase.com:5432/cp',
        // Missing allowRemoteDevDb flag
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('--allow-remote-dev-db');
      expect(mockPrisma.operator.update).not.toHaveBeenCalled();
    });

    it('should refuse recovery for SUSPENDED operator accounts', async () => {
      mockPrisma.operator.findUnique.mockResolvedValue({
        id: 'op_susp_1',
        email: 'suspended@omnigrc.co',
        role: OperatorRole.SUPPORT_ENGINEER,
        status: OperatorStatus.SUSPENDED,
        mfaEnabled: true,
      });

      const result = await executeOperatorRecovery(mockPrisma, {
        email: 'suspended@omnigrc.co',
        action: 'reset-mfa',
        confirm: true,
        dbUrl: 'postgresql://postgres:pass@localhost:5432/cp',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('SUSPENDED');
      expect(mockPrisma.operator.update).not.toHaveBeenCalled();
    });

    it('should safely invalidate MFA, revoke all active sessions, and record audit log on confirmed reset against authorized local DB', async () => {
      mockPrisma.operator.findUnique.mockResolvedValue({
        id: 'op_test_1',
        email: 'initial-admin@omnigrc.co',
        role: OperatorRole.PLATFORM_SUPER_ADMIN,
        status: OperatorStatus.ACTIVE,
        mfaEnabled: true,
      });
      mockPrisma.operator.update.mockResolvedValue({});

      const result = await executeOperatorRecovery(mockPrisma, {
        email: 'initial-admin@omnigrc.co',
        action: 'reset-mfa',
        confirm: true,
        isProduction: false,
        dbUrl: 'postgresql://postgres:pass@localhost:5432/cp',
      });

      expect(result.success).toBe(true);
      expect(result.mfaStatus).toBe('RE_ENROLLMENT_REQUIRED');
      expect(result.sessionsRevoked).toBe(2);

      // Verify operator update cleared MFA without deleting or modifying role
      expect(mockPrisma.operator.update).toHaveBeenCalledWith({
        where: { id: 'op_test_1' },
        data: {
          mfaEnabled: false,
          totpSecret: null,
          failedLoginAttempts: 0,
          lockedUntil: null,
        },
      });

      // Verify all active sessions were revoked
      expect(mockPrisma.operatorSession.updateMany).toHaveBeenCalledWith({
        where: {
          operatorId: 'op_test_1',
          isRevoked: false,
        },
        data: {
          isRevoked: true,
        },
      });

      // Verify audit log creation
      expect(mockPrisma.controlPlaneAuditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'OPERATOR_MFA_RESET_AND_SESSIONS_REVOKED',
            entityId: 'op_test_1',
            actorId: 'RECOVERY_CLI',
            result: 'SUCCESS',
          }),
        }),
      );
    });
  });
});
