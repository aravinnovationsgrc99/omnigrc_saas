import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { DirectoryIntegrationService } from './directory-integration.service';
import { DirectoryCryptoUtil } from './directory-crypto.util';
import { DirectoryGraphClient } from './directory-graph.client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { ResourceAuthContext } from '../auth/resource-authorization.service';
import {
  Role,
  ProductAccessStatus,
  DirectorySyncStatus,
  DirectoryProvider,
  DirectorySyncSchedule,
} from '@omnigrc/shared';

describe('DirectoryIntegrationService', () => {
  let service: DirectoryIntegrationService;
  let graphClient: DirectoryGraphClient;
  let prisma: any;
  let auditLogsService: any;

  // 64-hex char valid 32-byte test key
  const validHexKey = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

  const mockAdminCtx: ResourceAuthContext = {
    userId: 'admin-user-001',
    organizationId: 'org-entra-test-1',
    role: Role.ADMIN,
  };

  const mockAnalystCtx: ResourceAuthContext = {
    userId: 'analyst-user-002',
    organizationId: 'org-entra-test-1',
    role: Role.ANALYST,
  };

  beforeEach(async () => {
    prisma = {
      directoryIntegrationConfig: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockImplementation((args) => ({ id: 'cfg-1', ...args.create, ...args.update, groupMappings: [] })),
        update: jest.fn().mockImplementation((args) => ({ id: args.where.id, ...args.data })),
      },
      directoryGroupMapping: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockImplementation((args) => ({ id: 'gm-1', ...args.create, ...args.update })),
        delete: jest.fn().mockResolvedValue({ id: 'gm-1' }),
      },
      directorySyncLog: {
        create: jest.fn().mockImplementation((args) => ({ id: 'log-1', ...args.data })),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      user: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockImplementation((args) => ({ id: 'usr-' + Math.random(), ...args.data })),
        update: jest.fn().mockImplementation((args) => ({ id: args.where.id, ...args.data })),
      },
      organizationMembership: {
        create: jest.fn().mockImplementation((args) => ({ id: 'mem-' + Math.random(), ...args.data })),
        update: jest.fn().mockImplementation((args) => ({ id: args.where.id, ...args.data })),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      $transaction: jest.fn().mockImplementation(async (cb) => cb(prisma)),
    };

    auditLogsService = {
      log: jest.fn().mockResolvedValue({ id: 'audit-log-id' }),
    };

    graphClient = new DirectoryGraphClient();
    graphClient.resetMockData();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DirectoryIntegrationService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditLogsService, useValue: auditLogsService },
        { provide: DirectoryGraphClient, useValue: graphClient },
      ],
    }).compile();

    service = module.get<DirectoryIntegrationService>(DirectoryIntegrationService);
  });

  describe('1. Production Encryption Key Safety & Credential Security', () => {
    it('should encrypt with versioned v1 prefix and decrypt accurately using 32-byte key', () => {
      const rawSecret = 'AzureSuperSecretToken987!#$';
      const encrypted = DirectoryCryptoUtil.encryptSecret(rawSecret, validHexKey);

      expect(encrypted).not.toContain(rawSecret);
      expect(encrypted.startsWith('v1:')).toBe(true);
      expect(encrypted.split(':')).toHaveLength(4); // v1:iv:authTag:cipher

      const decrypted = DirectoryCryptoUtil.decryptSecret(encrypted, validHexKey);
      expect(decrypted).toBe(rawSecret);
    });

    it('should reject missing DIRECTORY_ENCRYPTION_KEY in production mode even if JWT_SECRET is present', () => {
      const prevEnv = process.env.NODE_ENV;
      const prevDirKey = process.env.DIRECTORY_ENCRYPTION_KEY;
      const prevJwt = process.env.JWT_SECRET;

      try {
        process.env.NODE_ENV = 'production';
        delete process.env.DIRECTORY_ENCRYPTION_KEY;
        process.env.JWT_SECRET = 'super-secret-jwt-token-that-must-not-be-used';

        // Must fail closed with zero fallback to JWT_SECRET
        expect(() => DirectoryCryptoUtil.getEncryptionKey()).toThrow(
          /Security Critical: DIRECTORY_ENCRYPTION_KEY environment variable is mandatory in production/,
        );
      } finally {
        process.env.NODE_ENV = prevEnv;
        if (prevDirKey) process.env.DIRECTORY_ENCRYPTION_KEY = prevDirKey;
        if (prevJwt) process.env.JWT_SECRET = prevJwt;
      }
    });

    it('should reject malformed encryption keys that do not resolve to exactly 32 bytes', () => {
      // 16-byte key (too short)
      const shortKey = '0123456789abcdef';
      expect(() => DirectoryCryptoUtil.parseAndValidateKey(shortKey)).toThrow(
        /expected exactly 32 bytes of cryptographic key material/,
      );

      // 31-byte key (off by 1 byte)
      const offByOneKey = 'a'.repeat(31);
      expect(() => DirectoryCryptoUtil.parseAndValidateKey(offByOneKey)).toThrow(
        /expected exactly 32 bytes/,
      );

      // 33-byte key (too long)
      const tooLongKey = 'a'.repeat(33);
      expect(() => DirectoryCryptoUtil.parseAndValidateKey(tooLongKey)).toThrow(
        /expected exactly 32 bytes/,
      );
    });

    it('should fail securely when decrypted with an incorrect encryption key', () => {
      const key1 = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
      const key2 = 'fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210';
      const encrypted = DirectoryCryptoUtil.encryptSecret('secretPayload', key1);

      expect(() => DirectoryCryptoUtil.decryptSecret(encrypted, key2)).toThrow(
        /Vault authentication failed/,
      );
    });

    it('should fail securely when ciphertext or auth tag is tampered with', () => {
      const encrypted = DirectoryCryptoUtil.encryptSecret('validSecret', validHexKey);
      const parts = encrypted.split(':');

      // Tamper ciphertext
      parts[3] = parts[3].substring(0, parts[3].length - 2) + 'ff';
      const tamperedCipher = parts.join(':');
      expect(() => DirectoryCryptoUtil.decryptSecret(tamperedCipher, validHexKey)).toThrow(
        /Vault authentication failed/,
      );

      // Tamper auth tag
      parts[2] = '00'.repeat(16);
      const tamperedTag = parts.join(':');
      expect(() => DirectoryCryptoUtil.decryptSecret(tamperedTag, validHexKey)).toThrow(
        /Vault authentication failed/,
      );
    });

    it('should maintain backward compatibility with legacy unversioned payloads', () => {
      // Legacy format: iv:tag:cipher (3 parts)
      const legacyPayload = '0123456789abcdef01234567:0123456789abcdef0123456789abcdef:123456';
      expect(() => DirectoryCryptoUtil.decryptSecret(legacyPayload, validHexKey)).toThrow(
        /Vault authentication failed/,
      );
    });

    it('should mask secrets without exposing sensitive characters', () => {
      expect(DirectoryCryptoUtil.maskSecret('ABCDEF123456')).toBe('••••••••••••3456');
      expect(DirectoryCryptoUtil.maskSecret('')).toBe('••••••••••••');
      expect(DirectoryCryptoUtil.maskSecret('123')).toBe('••••••••••••');
    });
  });

  describe('2. Configuration Security & Administrative Authorization', () => {
    it('should block non-admin users from configuring directory integration', async () => {
      await expect(
        service.saveConfig(mockAnalystCtx, {
          tenantId: '00000000-0000-0000-0000-000000000000',
          clientId: '11111111-1111-1111-1111-111111111111',
          clientSecret: 'secret123',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should reject attempts to set defaultRole to ADMIN or MSSP_ADMIN', async () => {
      await expect(
        service.saveConfig(mockAdminCtx, {
          tenantId: '00000000-0000-0000-0000-000000000000',
          clientId: '11111111-1111-1111-1111-111111111111',
          clientSecret: 'secret123',
          defaultRole: Role.ADMIN,
        }),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.saveConfig(mockAdminCtx, {
          tenantId: '00000000-0000-0000-0000-000000000000',
          clientId: '11111111-1111-1111-1111-111111111111',
          clientSecret: 'secret123',
          defaultRole: Role.MSSP_ADMIN,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should encrypt secret and store masked representation when saved by ADMIN', async () => {
      const result = await service.saveConfig(mockAdminCtx, {
        tenantId: '00000000-0000-0000-0000-000000000000',
        clientId: '11111111-1111-1111-1111-111111111111',
        clientSecret: 'SuperSecretEntraKey99',
        enabled: true,
      });

      expect(result.clientSecretMasked).toContain('••••••••••••');
      expect(result.clientSecretMasked).not.toContain('SuperSecretEntraKey');
      expect(prisma.directoryIntegrationConfig.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            clientSecretMasked: expect.stringContaining('••••••••••••'),
          }),
        }),
      );
    });
  });

  describe('3. Privilege Escalation Prevention on Group Mappings & Synchronization', () => {
    beforeEach(() => {
      prisma.directoryIntegrationConfig.findUnique.mockResolvedValue({
        id: 'cfg-1',
        organizationId: mockAdminCtx.organizationId,
        enabled: true,
      });
    });

    it('should allow ADMIN to map directory groups to ANALYST', async () => {
      const mapping = await service.saveGroupMapping(mockAdminCtx, {
        directoryGroupId: 'entra-grp-analysts',
        directoryGroupName: 'Entra Analysts',
        targetRole: Role.ANALYST,
      });

      expect(mapping.targetRole).toBe(Role.ANALYST);
      expect(prisma.directoryGroupMapping.upsert).toHaveBeenCalled();
    });

    it('should allow ADMIN to map directory groups to ADMIN with security audit logging', async () => {
      const mapping = await service.saveGroupMapping(mockAdminCtx, {
        directoryGroupId: 'entra-grp-sec-admins',
        directoryGroupName: 'Entra Security Admins',
        targetRole: Role.ADMIN,
      });

      expect(mapping.targetRole).toBe(Role.ADMIN);
      expect(auditLogsService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'SECURITY_ALERT_ADMIN_GROUP_MAPPED',
        }),
      );
    });

    it('should block non-admin users from configuring mappings to ADMIN role (HTTP 403)', async () => {
      await expect(
        service.saveGroupMapping(mockAnalystCtx, {
          directoryGroupId: 'entra-grp-sec-admins',
          directoryGroupName: 'Entra Security Admins',
          targetRole: Role.ADMIN,
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should block non-admin users from executing directory synchronization (HTTP 403)', async () => {
      await expect(service.synchronizeDirectory(mockAnalystCtx)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('4. Synchronization Execution, Stable ID Matching, & Role Auditing', () => {
    const rawSecret = 'AzureSecretKey123!';
    const encryptedSecret = DirectoryCryptoUtil.encryptSecret(rawSecret);

    beforeEach(() => {
      prisma.directoryIntegrationConfig.findUnique.mockResolvedValue({
        id: 'cfg-1',
        organizationId: mockAdminCtx.organizationId,
        provider: DirectoryProvider.ENTRA_ID,
        tenantId: 'mock-tenant-id',
        clientId: 'mock-client-id',
        clientSecretEncrypted: encryptedSecret,
        enabled: true,
        defaultRole: Role.ANALYST,
        autoDeactivateUsers: true,
        deactivationThresholdPct: 20,
        groupMappings: [
          {
            id: 'gm-1',
            directoryGroupId: 'entra-grp-sec-admins',
            directoryGroupName: 'Security Admins',
            targetRole: Role.ADMIN,
            priority: 10,
          },
          {
            id: 'gm-2',
            directoryGroupId: 'entra-grp-analysts',
            directoryGroupName: 'GRC Analysts',
            targetRole: Role.ANALYST,
            priority: 50,
          },
        ],
      });
    });

    it('should synchronize users, map roles, and audit newly provisioned ADMIN roles', async () => {
      prisma.user.findMany.mockResolvedValue([]);

      const log = await service.synchronizeDirectory(mockAdminCtx);

      expect(log.status).toBe(DirectorySyncStatus.SUCCESS);
      expect(log.createdCount).toBe(4);
      expect(prisma.user.create).toHaveBeenCalledTimes(4);

      expect(prisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            email: 'alice.lead@omnicorp.com',
            role: Role.ADMIN,
            externalDirectoryId: 'entra-usr-001',
            status: ProductAccessStatus.ACTIVE,
          }),
        }),
      );

      expect(auditLogsService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'DIRECTORY_ADMIN_ROLE_PROVISIONED',
          metadata: expect.objectContaining({
            userEmail: 'alice.lead@omnicorp.com',
            grantedRole: Role.ADMIN,
            isNewUser: true,
          }),
        }),
      );
    });

    it('should audit DIRECTORY_USER_ROLE_CHANGED when user membership is updated or demoted', async () => {
      prisma.user.findMany.mockResolvedValue([
        {
          id: 'existing-usr-2',
          name: 'Bob Existing',
          email: 'bob.analyst@omnicorp.com',
          role: Role.EXTERNAL_AUDITOR,
          externalDirectoryId: 'entra-usr-002',
          status: ProductAccessStatus.ACTIVE,
          memberships: [{ id: 'mem-2', organizationId: mockAdminCtx.organizationId }],
        },
      ]);

      const log = await service.synchronizeDirectory(mockAdminCtx);

      expect(log.updatedCount).toBe(1);
      expect(auditLogsService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'DIRECTORY_USER_ROLE_CHANGED',
          metadata: expect.objectContaining({
            userEmail: 'bob.analyst@omnicorp.com',
            oldRole: Role.EXTERNAL_AUDITOR,
            newRole: Role.ANALYST,
          }),
        }),
      );
    });

    it('should match existing users by stable externalDirectoryId even if email changes', async () => {
      prisma.user.findMany.mockResolvedValue([
        {
          id: 'existing-usr-1',
          name: 'Alice Old Name',
          email: 'alice.old@omnicorp.com',
          role: Role.ANALYST,
          externalDirectoryId: 'entra-usr-001',
          status: ProductAccessStatus.ACTIVE,
          memberships: [{ id: 'mem-1', organizationId: mockAdminCtx.organizationId }],
        },
      ]);

      const log = await service.synchronizeDirectory(mockAdminCtx);

      expect(log.updatedCount).toBe(1);
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'existing-usr-1' },
          data: expect.objectContaining({
            name: 'Alice Security Lead',
            role: Role.ADMIN,
            externalDirectoryId: 'entra-usr-001',
          }),
        }),
      );
    });

    it('should link existing user by email if externalDirectoryId is not yet assigned', async () => {
      prisma.user.findMany.mockResolvedValue([
        {
          id: 'existing-usr-2',
          name: 'Bob Existing',
          email: 'bob.analyst@omnicorp.com',
          role: Role.ANALYST,
          externalDirectoryId: null,
          status: ProductAccessStatus.ACTIVE,
          memberships: [{ id: 'mem-2', organizationId: mockAdminCtx.organizationId }],
        },
      ]);

      const log = await service.synchronizeDirectory(mockAdminCtx);

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'existing-usr-2' },
          data: expect.objectContaining({
            externalDirectoryId: 'entra-usr-002',
          }),
        }),
      );
    });
  });

  describe('5. Incomplete Upstream Synchronization & Group Membership Protection', () => {
    const rawSecret = 'AzureSecretKey123!';
    const encryptedSecret = DirectoryCryptoUtil.encryptSecret(rawSecret);

    beforeEach(() => {
      prisma.directoryIntegrationConfig.findUnique.mockResolvedValue({
        id: 'cfg-1',
        organizationId: mockAdminCtx.organizationId,
        provider: DirectoryProvider.ENTRA_ID,
        tenantId: 'mock-tenant-id',
        clientId: 'mock-client-id',
        clientSecretEncrypted: encryptedSecret,
        enabled: true,
        defaultRole: Role.ANALYST,
        autoDeactivateUsers: true,
        deactivationThresholdPct: 20,
        groupMappings: [
          {
            id: 'gm-1',
            directoryGroupId: 'entra-grp-sec-admins',
            directoryGroupName: 'Security Admins',
            targetRole: Role.ADMIN,
            priority: 10,
          },
        ],
      });
    });

    it('should preserve existing user role and prevent demotion when individual group membership lookup fails', async () => {
      // Existing user Alice has Role.ADMIN in OMNiGRC
      prisma.user.findMany.mockResolvedValue([
        {
          id: 'usr-alice-existing',
          name: 'Alice Security Lead',
          email: 'alice.lead@omnicorp.com',
          role: Role.ADMIN,
          externalDirectoryId: 'entra-usr-001',
          status: ProductAccessStatus.ACTIVE,
          memberships: [{ id: 'mem-alice', organizationId: mockAdminCtx.organizationId }],
        },
      ]);

      // Inject a user whose group membership query failed
      graphClient.setMockData([
        {
          id: 'entra-usr-001',
          displayName: 'Alice Security Lead',
          mail: 'alice.lead@omnicorp.com',
          userPrincipalName: 'alice.lead@omnicorp.com',
          accountEnabled: true,
          groupMemberIds: [], // Empty due to network timeout
          membershipResolutionFailed: true, // Marked as failed!
        },
      ]);

      const log = await service.synchronizeDirectory(mockAdminCtx);

      // Verify sync is marked PARTIAL
      expect(log.status).toBe(DirectorySyncStatus.PARTIAL);

      // Verify Alice was NOT demoted to ANALYST! Her ADMIN role must be preserved
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'usr-alice-existing' },
          data: expect.objectContaining({
            role: Role.ADMIN, // Preserved!
          }),
        }),
      );
    });

    it('should bypass automated deactivations completely when upstream snapshot is incomplete (page ceiling hit)', async () => {
      // 5 users exist in OMNiGRC
      const existing = [
        { id: 'u1', email: 'alice.lead@omnicorp.com', externalDirectoryId: 'entra-usr-001', status: ProductAccessStatus.ACTIVE, memberships: [{ id: 'm1' }] },
        { id: 'u2', email: 'user2@omnicorp.com', externalDirectoryId: 'entra-user-2', status: ProductAccessStatus.ACTIVE, memberships: [{ id: 'm2' }] },
      ];
      prisma.user.findMany.mockResolvedValue(existing);

      // Mock that pagination hit the page ceiling (50 pages) -> incomplete snapshot
      graphClient.setMockIncompleteSnapshot(true, ['User pagination reached ceiling of 50 pages. Snapshot incomplete.']);

      const log = await service.synchronizeDirectory(mockAdminCtx);

      // Must be marked PARTIAL
      expect(log.status).toBe(DirectorySyncStatus.PARTIAL);

      // Destructive deactivation MUST NOT run!
      expect(log.deactivatedCount).toBe(0);

      // Verify configuration status has actionable message
      expect(prisma.directoryIntegrationConfig.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            lastSyncStatus: DirectorySyncStatus.PARTIAL,
            lastSyncMessage: expect.stringContaining('Deactivations halted due to incomplete snapshot'),
          }),
        }),
      );
    });
  });

  describe('6. Controlled Deactivation & Mass Deactivation Circuit Breaker', () => {
    const rawSecret = 'AzureSecretKey123!';
    const encryptedSecret = DirectoryCryptoUtil.encryptSecret(rawSecret);

    beforeEach(() => {
      prisma.directoryIntegrationConfig.findUnique.mockResolvedValue({
        id: 'cfg-1',
        organizationId: mockAdminCtx.organizationId,
        provider: DirectoryProvider.ENTRA_ID,
        tenantId: 'mock-tenant-id',
        clientId: 'mock-client-id',
        clientSecretEncrypted: encryptedSecret,
        enabled: true,
        defaultRole: Role.ANALYST,
        autoDeactivateUsers: true,
        deactivationThresholdPct: 20,
        groupMappings: [],
      });
    });

    it('should deactivate a single removed user when within safety threshold on complete snapshot', async () => {
      const existing = [
        { id: 'u1', email: 'alice.lead@omnicorp.com', externalDirectoryId: 'entra-usr-001', status: ProductAccessStatus.ACTIVE, memberships: [{ id: 'm1' }] },
        { id: 'u2', email: 'bob.analyst@omnicorp.com', externalDirectoryId: 'entra-usr-002', status: ProductAccessStatus.ACTIVE, memberships: [{ id: 'm2' }] },
        { id: 'u3', email: 'carol.auditor@omnicorp.com', externalDirectoryId: 'entra-usr-003', status: ProductAccessStatus.ACTIVE, memberships: [{ id: 'm3' }] },
        { id: 'u-deleted', email: 'former.staff@omnicorp.com', externalDirectoryId: 'entra-deleted-999', status: ProductAccessStatus.ACTIVE, memberships: [{ id: 'm-del' }] },
      ];
      prisma.user.findMany.mockResolvedValue(existing);

      const log = await service.synchronizeDirectory(mockAdminCtx);

      expect(log.deactivatedCount).toBe(1);
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'u-deleted' },
          data: expect.objectContaining({
            status: ProductAccessStatus.SUSPENDED,
          }),
        }),
      );
    });

    it('should trigger Mass Deactivation Circuit Breaker and halt deactivations when threshold is exceeded', async () => {
      const existing = [
        { id: 'u1', email: 'alice.lead@omnicorp.com', externalDirectoryId: 'entra-usr-001', status: ProductAccessStatus.ACTIVE, memberships: [{ id: 'm1' }] },
        { id: 'u-cand-1', email: 'user1@omnicorp.com', externalDirectoryId: 'entra-old-1', status: ProductAccessStatus.ACTIVE, memberships: [{ id: 'm1' }] },
        { id: 'u-cand-2', email: 'user2@omnicorp.com', externalDirectoryId: 'entra-old-2', status: ProductAccessStatus.ACTIVE, memberships: [{ id: 'm2' }] },
        { id: 'u-cand-3', email: 'user3@omnicorp.com', externalDirectoryId: 'entra-old-3', status: ProductAccessStatus.ACTIVE, memberships: [{ id: 'm3' }] },
        { id: 'u-cand-4', email: 'user4@omnicorp.com', externalDirectoryId: 'entra-old-4', status: ProductAccessStatus.ACTIVE, memberships: [{ id: 'm4' }] },
      ];
      prisma.user.findMany.mockResolvedValue(existing);

      const log = await service.synchronizeDirectory(mockAdminCtx);

      expect(log.status).toBe(DirectorySyncStatus.PARTIAL);
      expect(log.deactivatedCount).toBe(0);
      expect(log.errorMessage).toContain('Mass deactivation prevented');
      expect(auditLogsService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'DIRECTORY_MASS_DEACTIVATION_PREVENTED',
        }),
      );
    });
  });

  describe('7. Microsoft Graph Client Resilient Connectivity & Caching', () => {
    it('should reuse cached token across multiple calls within validity window', async () => {
      const tenantId = 'test-tenant';
      const clientId = 'test-client';
      const clientSecret = 'test-secret';

      const originalFetch = global.fetch;
      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => ({ access_token: 'cached-mock-token-xyz', expires_in: 3600 }),
      });
      global.fetch = mockFetch;

      try {
        const token1 = await graphClient.getAccessToken(tenantId, clientId, clientSecret);
        const token2 = await graphClient.getAccessToken(tenantId, clientId, clientSecret);

        expect(token1).toBe('cached-mock-token-xyz');
        expect(token2).toBe('cached-mock-token-xyz');
        expect(mockFetch).toHaveBeenCalledTimes(1);
      } finally {
        global.fetch = originalFetch;
      }
    });

    it('should return simulated mock data in sandbox mode with accurate counts', async () => {
      const result = await graphClient.testConnection('mock-tenant', 'mock-client', 'mock-secret');
      expect(result.success).toBe(true);
      expect(result.discoveredUsersCount).toBe(4);
      expect(result.discoveredGroupsCount).toBe(4);
      expect(result.tenantDetails?.displayName).toContain('Simulated Mock Sandbox');
    });
  });
});
