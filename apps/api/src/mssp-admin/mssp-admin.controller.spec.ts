import { Test, TestingModule } from '@nestjs/testing';
import { MsspAdminController } from './mssp-admin.controller';
import { MsspAdminService } from './mssp-admin.service';

describe('MsspAdminController', () => {
  let controller: MsspAdminController;
  let service: jest.Mocked<MsspAdminService>;

  beforeEach(async () => {
    service = {
      getManagedClients: jest.fn().mockResolvedValue([]),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [MsspAdminController],
      providers: [
        { provide: MsspAdminService, useValue: service },
      ],
    }).compile();

    controller = module.get<MsspAdminController>(MsspAdminController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should use organizationId when actingViaMsspId is not set', async () => {
    await controller.getManagedClients('mssp-org-1');
    expect(service.getManagedClients).toHaveBeenCalledWith('mssp-org-1');
  });

  it('should prioritize actingViaMsspId when user has switched context into a client tenant', async () => {
    await controller.getManagedClients('client-tenant-99', 'mssp-home-org-1');
    expect(service.getManagedClients).toHaveBeenCalledWith('mssp-home-org-1');
  });
});
