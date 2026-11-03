import { Test, TestingModule } from '@nestjs/testing';
import { DirectoryIntegrationController } from './directory-integration.controller';
import { DirectoryIntegrationService } from './directory-integration.service';
import { Role, DirectoryProvider, DirectorySyncSchedule, DirectorySyncStatus } from '@omnigrc/shared';
import { SaveDirectoryConfigDto, TestDirectoryConnectionDto, CreateOrUpdateGroupMappingDto } from './dto/directory.dto';

describe('DirectoryIntegrationController', () => {
  let controller: DirectoryIntegrationController;
  let service: jest.Mocked<DirectoryIntegrationService>;

  const mockAdminUser = {
    userId: 'user-admin-1',
    organizationId: 'org-test-1',
    role: Role.ADMIN,
  };

  const mockUserWithSubOnly = {
    sub: 'user-sub-1',
    organizationId: 'org-test-1',
    role: Role.ADMIN,
  };

  const mockConfigDto = {
    id: 'cfg-1',
    organizationId: 'org-test-1',
    provider: DirectoryProvider.ENTRA_ID,
    tenantId: '11111111-1111-1111-1111-111111111111',
    clientId: '22222222-2222-2222-2222-222222222222',
    clientSecretMasked: '****abcd',
    domain: 'example.com',
    enabled: true,
    defaultRole: Role.ANALYST,
    syncSchedule: DirectorySyncSchedule.HOURLY,
    lastSyncAt: new Date(),
    lastSyncStatus: DirectorySyncStatus.SUCCESS,
    lastSyncMessage: 'Synchronized 10 users',
    autoDeactivateUsers: true,
    deactivationThresholdPct: 10,
    groupMappings: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    const mockService = {
      getConfig: jest.fn(),
      saveConfig: jest.fn(),
      testConnection: jest.fn(),
      getGroupMappings: jest.fn(),
      saveGroupMapping: jest.fn(),
      deleteGroupMapping: jest.fn(),
      synchronizeDirectory: jest.fn(),
      getSyncLogs: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [DirectoryIntegrationController],
      providers: [
        {
          provide: DirectoryIntegrationService,
          useValue: mockService,
        },
      ],
    }).compile();

    controller = module.get<DirectoryIntegrationController>(DirectoryIntegrationController);
    service = module.get(DirectoryIntegrationService);
  });

  describe('GET /directory/config', () => {
    it('should return directory configuration when configured for the organization', async () => {
      service.getConfig.mockResolvedValue(mockConfigDto as any);

      const result = await controller.getConfig(mockAdminUser);

      expect(service.getConfig).toHaveBeenCalledWith({
        userId: 'user-admin-1',
        organizationId: 'org-test-1',
        role: Role.ADMIN,
      });
      expect(result).toEqual(mockConfigDto);
    });

    it('should return null when directory integration is not configured', async () => {
      service.getConfig.mockResolvedValue(null);

      const result = await controller.getConfig(mockAdminUser);

      expect(result).toBeNull();
    });

    it('should handle JWT payload where userId is under sub or id', async () => {
      service.getConfig.mockResolvedValue(mockConfigDto as any);

      await controller.getConfig(mockUserWithSubOnly);

      expect(service.getConfig).toHaveBeenCalledWith({
        userId: 'user-sub-1',
        organizationId: 'org-test-1',
        role: Role.ADMIN,
      });
    });

    it('should return null immediately if organizationId is missing', async () => {
      const userWithoutOrg = { userId: 'user-1' };
      const result = await controller.getConfig(userWithoutOrg);

      expect(result).toBeNull();
      expect(service.getConfig).not.toHaveBeenCalled();
    });
  });

  describe('POST /directory/config', () => {
    it('should save configuration with valid auth context and dto', async () => {
      const dto: SaveDirectoryConfigDto = {
        tenantId: '11111111-1111-1111-1111-111111111111',
        clientId: '22222222-2222-2222-2222-222222222222',
        clientSecret: 'super-secret-key-1234',
        domain: 'example.com',
        enabled: true,
        defaultRole: Role.ANALYST,
        syncSchedule: DirectorySyncSchedule.DAILY,
        autoDeactivateUsers: true,
        deactivationThresholdPct: 15,
      };

      service.saveConfig.mockResolvedValue(mockConfigDto as any);

      const result = await controller.saveConfig(mockAdminUser, dto);

      expect(service.saveConfig).toHaveBeenCalledWith(
        {
          userId: 'user-admin-1',
          organizationId: 'org-test-1',
          role: Role.ADMIN,
        },
        dto,
      );
      expect(result).toEqual(mockConfigDto);
    });
  });

  describe('POST /directory/test-connection', () => {
    it('should test connection credentials against directory provider', async () => {
      const testDto: TestDirectoryConnectionDto = {
        tenantId: '11111111-1111-1111-1111-111111111111',
        clientId: '22222222-2222-2222-2222-222222222222',
        clientSecret: 'secret-to-test',
      };

      const testResult = {
        success: true,
        message: 'Successfully authenticated with Microsoft Entra ID',
        details: { directoryName: 'Example Org', userCount: 42 },
      };

      service.testConnection.mockResolvedValue(testResult as any);

      const result = await controller.testConnection(mockAdminUser, testDto);

      expect(service.testConnection).toHaveBeenCalledWith(
        {
          userId: 'user-admin-1',
          organizationId: 'org-test-1',
          role: Role.ADMIN,
        },
        testDto,
      );
      expect(result).toEqual(testResult);
    });
  });

  describe('Group Mappings endpoints', () => {
    it('GET /directory/group-mappings should retrieve all group mappings', async () => {
      const mappings = [
        {
          id: 'map-1',
          configId: 'cfg-1',
          organizationId: 'org-test-1',
          directoryGroupId: 'grp-1',
          directoryGroupName: 'SecOps',
          targetRole: Role.ADMIN,
          priority: 10,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      service.getGroupMappings.mockResolvedValue(mappings as any);

      const result = await controller.getGroupMappings(mockAdminUser);

      expect(service.getGroupMappings).toHaveBeenCalledWith({
        userId: 'user-admin-1',
        organizationId: 'org-test-1',
        role: Role.ADMIN,
      });
      expect(result).toEqual(mappings);
    });

    it('POST /directory/group-mappings should save group mapping', async () => {
      const dto: CreateOrUpdateGroupMappingDto = {
        directoryGroupId: 'grp-1',
        directoryGroupName: 'SecOps Team',
        targetRole: Role.ADMIN,
        priority: 10,
      };

      const savedMapping = { id: 'map-1', ...dto, configId: 'cfg-1', organizationId: 'org-test-1', createdAt: new Date(), updatedAt: new Date() };
      service.saveGroupMapping.mockResolvedValue(savedMapping as any);

      const result = await controller.saveGroupMapping(mockAdminUser, dto);

      expect(service.saveGroupMapping).toHaveBeenCalledWith(
        {
          userId: 'user-admin-1',
          organizationId: 'org-test-1',
          role: Role.ADMIN,
        },
        dto,
      );
      expect(result).toEqual(savedMapping);
    });

    it('DELETE /directory/group-mappings/:id should delete group mapping', async () => {
      service.deleteGroupMapping.mockResolvedValue({ success: true } as any);

      const result = await controller.deleteGroupMapping(mockAdminUser, 'map-1');

      expect(service.deleteGroupMapping).toHaveBeenCalledWith(
        {
          userId: 'user-admin-1',
          organizationId: 'org-test-1',
          role: Role.ADMIN,
        },
        'map-1',
      );
      expect(result).toEqual({ success: true });
    });
  });

  describe('Sync & Logs endpoints', () => {
    it('POST /directory/sync should execute synchronization', async () => {
      const syncResult = {
        id: 'log-1',
        configId: 'cfg-1',
        organizationId: 'org-test-1',
        status: DirectorySyncStatus.SUCCESS,
        totalEvaluated: 10,
        createdCount: 2,
        updatedCount: 8,
        deactivatedCount: 0,
        errorsCount: 0,
        startedAt: new Date(),
        completedAt: new Date(),
      };

      service.synchronizeDirectory.mockResolvedValue(syncResult as any);

      const result = await controller.syncNow(mockAdminUser);

      expect(service.synchronizeDirectory).toHaveBeenCalledWith({
        userId: 'user-admin-1',
        organizationId: 'org-test-1',
        role: Role.ADMIN,
      });
      expect(result).toEqual(syncResult);
    });

    it('GET /directory/sync-logs should retrieve paginated sync logs', async () => {
      const logsResult = {
        items: [],
        total: 0,
        page: 1,
        limit: 20,
      };

      service.getSyncLogs.mockResolvedValue(logsResult as any);

      const query = { page: 1, limit: 20 };
      const result = await controller.getSyncLogs(mockAdminUser, query as any);

      expect(service.getSyncLogs).toHaveBeenCalledWith(
        {
          userId: 'user-admin-1',
          organizationId: 'org-test-1',
          role: Role.ADMIN,
        },
        query,
      );
      expect(result).toEqual(logsResult);
    });
  });
});

