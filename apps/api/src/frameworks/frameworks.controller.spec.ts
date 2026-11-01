import { Test, TestingModule } from '@nestjs/testing';
import { FrameworksController } from './frameworks.controller';
import { FrameworksService } from './frameworks.service';
import { FrameworkCoverageService } from './framework-coverage.service';
import { FrameworkEntitlementGuard } from './guards/framework-entitlement.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';

describe('FrameworksController', () => {
  let controller: FrameworksController;
  let service: any;

  const mockFrameworksService = {
    findAll: jest.fn(),
    findOne: jest.fn(),
    getVersions: jest.fn(),
    getVersionClauses: jest.fn(),
    getReferences: jest.fn(),
    getReference: jest.fn(),
    importCustomFramework: jest.fn(),
  };

  const mockFrameworkCoverageService = {
    calculateCoverage: jest.fn(),
    getGaps: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [FrameworksController],
      providers: [
        { provide: FrameworksService, useValue: mockFrameworksService },
        { provide: FrameworkCoverageService, useValue: mockFrameworkCoverageService },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(FrameworkEntitlementGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<FrameworksController>(FrameworksController);
    service = module.get(FrameworksService);
    jest.clearAllMocks();
  });

  describe('getVersionClauses', () => {
    it('should delegate to frameworksService.getVersionClauses with parsed options', async () => {
      const mockResult = [
        {
          id: 'ref-1',
          frameworkVersionId: 'ver-1',
          identifier: 'A.5.1',
          title: 'Policies for information security',
        },
      ];
      service.getVersionClauses.mockResolvedValue(mockResult);

      const result = await controller.getVersionClauses(
        'org-1',
        'ISO27001',
        'ver-1',
        'policies',
        'CONTROL',
        '1',
        '50',
      );

      expect(service.getVersionClauses).toHaveBeenCalledWith(
        'org-1',
        'ISO27001',
        'ver-1',
        {
          search: 'policies',
          type: 'CONTROL',
          page: 1,
          limit: 50,
        },
      );
      expect(result).toBe(mockResult);
    });
  });

  describe('getReferences', () => {
    it('should delegate to frameworksService.getReferences with search and type', async () => {
      const mockResult = [{ id: 'ref-2', identifier: 'CC1.1' }];
      service.getReferences.mockResolvedValue(mockResult);

      const result = await controller.getReferences('org-1', 'ver-2', 'CC1', 'CRITERION', '2', '20');

      expect(service.getReferences).toHaveBeenCalledWith('org-1', 'ver-2', {
        search: 'CC1',
        type: 'CRITERION',
        page: 2,
        limit: 20,
      });
      expect(result).toBe(mockResult);
    });
  });

  describe('getVersions', () => {
    it('should delegate to frameworksService.getVersions', async () => {
      const mockVersions = [{ id: 'ver-1', version: '2022' }];
      service.getVersions.mockResolvedValue(mockVersions);

      const result = await controller.getVersions('org-1', 'ISO27001');

      expect(service.getVersions).toHaveBeenCalledWith('org-1', 'ISO27001');
      expect(result).toBe(mockVersions);
    });
  });

  describe('getFrameworks', () => {
    it('should delegate to frameworksService.findAll', async () => {
      const mockList = [{ id: 'fw-1', code: 'ISO27001' }];
      service.findAll.mockResolvedValue(mockList);

      const result = await controller.getFrameworks('org-1');

      expect(service.findAll).toHaveBeenCalledWith('org-1');
      expect(result).toBe(mockList);
    });
  });
});

