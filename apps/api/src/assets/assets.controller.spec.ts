import { Test, TestingModule } from '@nestjs/testing';
import { AssetsController } from './assets.controller';
import { AssetsService } from './assets.service';
import { Role } from '@omnigrc/shared';
import { RiskQueryDto } from '../risks/dto/risks.dto';
import { REQUIRE_CAPABILITY_KEY } from '../common/decorators/require-capability.decorator';
import { Reflector } from '@nestjs/core';

describe('AssetsController', () => {
  let controller: AssetsController;
  let assetsService: jest.Mocked<any>;
  let reflector: Reflector;

  beforeEach(async () => {
    assetsService = {
      findAll: jest.fn(),
      count: jest.fn(),
      findOne: jest.fn(),
      getAuditLogs: jest.fn(),
      getRisksForAsset: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      softDelete: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AssetsController],
      providers: [
        { provide: AssetsService, useValue: assetsService },
        Reflector,
      ],
    }).compile();

    controller = module.get<AssetsController>(AssetsController);
    reflector = module.get<Reflector>(Reflector);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('GET :id/risks', () => {
    it('should delegate to assetsService.getRisksForAsset with authCtx, assetId, and query', async () => {
      const mockUser = {
        userId: 'user-1',
        organizationId: 'org-1',
        role: Role.ADMIN,
      };
      const query: RiskQueryDto = { page: 1, limit: 10 };
      const mockResult = {
        items: [{ id: 'risk-1', title: 'Asset Risk', assetId: 'asset-1' }],
        total: 1,
        page: 1,
        limit: 10,
      };

      assetsService.getRisksForAsset.mockResolvedValue(mockResult);

      const result = await controller.getRisks(mockUser, 'asset-1', query);

      expect(assetsService.getRisksForAsset).toHaveBeenCalledWith(
        {
          userId: 'user-1',
          organizationId: 'org-1',
          role: Role.ADMIN,
        },
        'asset-1',
        query,
      );
      expect(result).toBe(mockResult);
    });

    it('should have RequireCapability metadata requiring GRC_CORE_ASSETS and GRC_CORE_RISKS', () => {
      const handler = controller.getRisks;
      const metadata = Reflect.getMetadata(REQUIRE_CAPABILITY_KEY, handler);

      expect(metadata).toBeDefined();
      expect(metadata.capabilityCode).toEqual(['GRC_CORE_ASSETS', 'GRC_CORE_RISKS']);
    });
  });
});
