import { Test, TestingModule } from '@nestjs/testing';
import { CommunicationsController } from './communications.controller';
import { ControlPlaneCommunicationsService } from './communications.service';
import { OperatorJwtGuard } from '../auth/operator-jwt.guard';
import { OperatorRbacGuard } from '../auth/operator-rbac.guard';

describe('CommunicationsController', () => {
  let controller: CommunicationsController;
  let service: jest.Mocked<any>;

  beforeEach(async () => {
    service = {
      findAll: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      publish: jest.fn(),
      cancel: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [CommunicationsController],
      providers: [
        { provide: ControlPlaneCommunicationsService, useValue: service },
      ],
    })
      .overrideGuard(OperatorJwtGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(OperatorRbacGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<CommunicationsController>(CommunicationsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('findAll', () => {
    it('should call service.findAll with query params', async () => {
      service.findAll.mockResolvedValue({ data: [], meta: { total: 0 } });
      const query = { status: 'DRAFT' as any };

      const result = await controller.findAll(query);

      expect(result).toEqual({ data: [], meta: { total: 0 } });
      expect(service.findAll).toHaveBeenCalledWith(query);
    });
  });

  describe('create', () => {
    it('should pass DTO and operator ID to service.create', async () => {
      const dto = { title: 'New Announcement', body: 'Announcement details...' };
      const req = { user: { sub: 'op_123' } };
      service.create.mockResolvedValue({ id: 'ann_1', ...dto });

      const result = await controller.create(dto as any, req);

      expect(result).toEqual({ id: 'ann_1', ...dto });
      expect(service.create).toHaveBeenCalledWith(dto, 'op_123');
    });
  });

  describe('publish', () => {
    it('should pass id and operator ID to service.publish', async () => {
      const req = { user: { sub: 'op_123' } };
      service.publish.mockResolvedValue({ id: 'ann_1', status: 'PUBLISHED' });

      const result = await controller.publish('ann_1', req);

      expect(result).toEqual({ id: 'ann_1', status: 'PUBLISHED' });
      expect(service.publish).toHaveBeenCalledWith('ann_1', 'op_123');
    });
  });
});
