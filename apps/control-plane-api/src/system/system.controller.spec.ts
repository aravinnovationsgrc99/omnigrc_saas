import { Test, TestingModule } from '@nestjs/testing';
import { SystemController } from './system.controller';
import { ControlPlaneSystemService } from './system.service';
import { OperatorJwtGuard } from '../auth/operator-jwt.guard';
import { OperatorRbacGuard } from '../auth/operator-rbac.guard';

describe('SystemController', () => {
  let controller: SystemController;
  let service: jest.Mocked<any>;

  beforeEach(async () => {
    service = {
      getSystemOverview: jest.fn(),
      getKeyRegistry: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SystemController],
      providers: [{ provide: ControlPlaneSystemService, useValue: service }],
    })
      .overrideGuard(OperatorJwtGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(OperatorRbacGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<SystemController>(SystemController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getSystemOverview', () => {
    it('should delegate to service.getSystemOverview', async () => {
      service.getSystemOverview.mockResolvedValue({
        version: '1.0.0',
        environment: 'test',
        databaseMigrationCount: 11,
      });

      const res = await controller.getSystemOverview();

      expect(res).toEqual({
        version: '1.0.0',
        environment: 'test',
        databaseMigrationCount: 11,
      });
      expect(service.getSystemOverview).toHaveBeenCalled();
    });
  });

  describe('getKeyRegistry', () => {
    it('should delegate to service.getKeyRegistry', async () => {
      service.getKeyRegistry.mockResolvedValue({
        keyId: 'arav-license-v1-2026',
        algorithm: 'Ed25519',
      });

      const res = await controller.getKeyRegistry();

      expect(res).toEqual({
        keyId: 'arav-license-v1-2026',
        algorithm: 'Ed25519',
      });
      expect(service.getKeyRegistry).toHaveBeenCalled();
    });
  });
});
