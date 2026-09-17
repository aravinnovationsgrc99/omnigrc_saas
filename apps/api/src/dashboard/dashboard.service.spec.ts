import { Test, TestingModule } from '@nestjs/testing';
import { DashboardService } from './dashboard.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { DEFAULT_WIDGET_LAYOUT } from '@omnigrc/shared';

describe('DashboardService', () => {
  let service: DashboardService;
  let prisma: jest.Mocked<any>;
  let auditLogsService: jest.Mocked<any>;

  beforeEach(async () => {
    prisma = {
      userDashboardPreference: {
        findUnique: jest.fn(),
        upsert: jest.fn(),
      },
    };

    auditLogsService = {
      log: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DashboardService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditLogsService, useValue: auditLogsService },
      ],
    }).compile();

    service = module.get<DashboardService>(DashboardService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should return default layout for new user and organization pair', async () => {
    prisma.userDashboardPreference.findUnique.mockResolvedValue(null);

    const result = await service.getUserPreference('user-1', 'org-a');

    expect(prisma.userDashboardPreference.findUnique).toHaveBeenCalledWith({
      where: {
        userId_organizationId: {
          userId: 'user-1',
          organizationId: 'org-a',
        },
      },
    });
    expect(result.configJson.layout).toEqual(DEFAULT_WIDGET_LAYOUT);
    expect(result.userId).toBe('user-1');
    expect(result.organizationId).toBe('org-a');
  });

  it('should support multi-org preference isolation for the same user across Org A and Org B', async () => {
    prisma.userDashboardPreference.findUnique.mockImplementation(({ where }) => {
      if (where.userId_organizationId.organizationId === 'org-a') {
        return Promise.resolve({
          id: 'pref-a',
          userId: 'user-1',
          organizationId: 'org-a',
          configJson: {
            version: 1,
            layout: [{ id: 'risk_overview', visible: false, position: 0 }],
          },
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      } else {
        return Promise.resolve({
          id: 'pref-b',
          userId: 'user-1',
          organizationId: 'org-b',
          configJson: {
            version: 1,
            layout: [{ id: 'vulnerability_posture', visible: true, position: 0 }],
          },
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }
    });

    const prefA = await service.getUserPreference('user-1', 'org-a');
    const prefB = await service.getUserPreference('user-1', 'org-b');

    expect(prefA.organizationId).toBe('org-a');
    expect(prefA.configJson.layout.find((w) => w.id === 'risk_overview')?.visible).toBe(false);

    expect(prefB.organizationId).toBe('org-b');
    expect(prefB.configJson.layout.find((w) => w.id === 'vulnerability_posture')?.position).toBe(0);
  });

  it('should reconcile stored layout by discarding stale IDs and appending missing default widgets', () => {
    const storedWithStaleAndMissing = [
      { id: 'stale_widget_deprecated', visible: true, position: 0 },
      { id: 'risk_overview', visible: false, position: 1 },
    ];

    const reconciled = service.reconcileLayout(storedWithStaleAndMissing as any);

    // Stale widget should be discarded
    expect(reconciled.find((w) => w.id === 'stale_widget_deprecated')).toBeUndefined();

    // Existing valid widget visibility should be preserved
    expect(reconciled.find((w) => w.id === 'risk_overview')?.visible).toBe(false);

    // Missing default widgets should be appended
    expect(reconciled.find((w) => w.id === 'compliance_obligations')).toBeDefined();
    expect(reconciled.find((w) => w.id === 'asset_inventory')).toBeDefined();

    // Total length must equal default widget count
    expect(reconciled.length).toBe(DEFAULT_WIDGET_LAYOUT.length);
  });

  it('should update user preference scoped strictly to authenticated userId and active organizationId', async () => {
    const mockUpdated = {
      id: 'pref-updated',
      userId: 'user-1',
      organizationId: 'org-a',
      configJson: {
        version: 1,
        layout: DEFAULT_WIDGET_LAYOUT,
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    prisma.userDashboardPreference.upsert.mockResolvedValue(mockUpdated);

    const result = await service.updateUserPreference('user-1', 'org-a', {
      layout: DEFAULT_WIDGET_LAYOUT,
    });

    expect(prisma.userDashboardPreference.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId_organizationId: {
            userId: 'user-1',
            organizationId: 'org-a',
          },
        },
      }),
    );
    expect(auditLogsService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org-a',
        actorId: 'user-1',
        action: 'DASHBOARD_PREFERENCE_UPDATED',
        entityType: 'UserDashboardPreference',
      }),
    );
    expect(result.id).toBe('pref-updated');
  });
});
