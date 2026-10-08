import { Test, TestingModule } from '@nestjs/testing';
import { MetricsController } from './metrics.controller';
import { MetricsService } from './metrics.service';
import { Role } from '@omnigrc/shared';

describe('MetricsController', () => {
  let controller: MetricsController;
  let service: jest.Mocked<MetricsService>;

  beforeEach(async () => {
    const mockService = {
      getOverviewMetrics: jest.fn().mockResolvedValue({}),
      getHeatmapCellDetails: jest.fn().mockResolvedValue({
        likelihood: 5,
        impact: 4,
        total: 7,
        items: [
          { id: 'r1', title: 'Data Center Fire Risk', score: 20, likelihood: 5, impact: 4, status: 'OPEN', owner: 'Charlie' },
        ],
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [MetricsController],
      providers: [
        { provide: MetricsService, useValue: mockService },
      ],
    }).compile();

    controller = module.get<MetricsController>(MetricsController);
    service = module.get(MetricsService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should call metricsService.getHeatmapCellDetails with parsed likelihood and impact numbers', async () => {
    const user = { userId: 'user-1', organizationId: 'org-1', role: Role.ADMIN };
    const result = await controller.getHeatmapCellDetails(user, 5, 4);

    expect(service.getHeatmapCellDetails).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1', organizationId: 'org-1' }),
      5,
      4,
    );
    expect(result.likelihood).toBe(5);
    expect(result.impact).toBe(4);
    expect(result.total).toBe(7);
  });
});
