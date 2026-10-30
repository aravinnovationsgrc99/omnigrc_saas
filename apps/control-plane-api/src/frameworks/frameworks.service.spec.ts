import { Test, TestingModule } from '@nestjs/testing';
import { ControlPlaneFrameworksService } from './frameworks.service';
import { DataPlanePrismaService } from './data-plane-prisma.service';

describe('ControlPlaneFrameworksService', () => {
  let service: ControlPlaneFrameworksService;
  let mockPrisma: any;

  const mockFrameworks = [
    {
      id: 'fw-1',
      code: 'ISO27001',
      name: 'ISO/IEC 27001:2022 Information Security',
      createdAt: new Date('2026-09-14'),
      versions: [
        {
          id: 'ver-1',
          version: '2022',
          name: 'ISO 27001:2022',
          status: 'ACTIVE',
          publisher: 'ISO/IEC',
          effectiveDate: new Date('2022-10-25'),
          createdAt: new Date('2026-09-21'),
          _count: { references: 123, entitlements: 1 },
        },
      ],
      _count: { clauses: 18, entitlements: 40 },
    },
    {
      id: 'fw-2',
      code: 'SOC2',
      name: 'SOC 2 Type II Trust Services Criteria',
      createdAt: new Date('2026-09-14'),
      versions: [
        {
          id: 'ver-2',
          version: '2017',
          name: 'SOC 2 (2017)',
          status: 'ACTIVE',
          publisher: 'AICPA',
          effectiveDate: new Date('2017-12-15'),
          createdAt: new Date('2026-09-21'),
          _count: { references: 61, entitlements: 1 },
        },
      ],
      _count: { clauses: 14, entitlements: 37 },
    },
  ];

  beforeEach(async () => {
    mockPrisma = {
      framework: {
        findMany: jest.fn().mockResolvedValue(mockFrameworks),
        findFirst: jest.fn().mockImplementation(({ where }) => {
          if (where.id === 'fw-1' || where?.OR?.[1]?.code === 'ISO27001') {
            return Promise.resolve(mockFrameworks[0]);
          }
          return Promise.resolve(null);
        }),
      },
      frameworkReference: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'ref-1',
            frameworkVersionId: 'ver-1',
            parentRefId: null,
            type: 'CLAUSE',
            identifier: 'A.5.1',
            title: 'Policies for information security',
            description: 'Management direction for info sec',
            normativeText: null,
            sortOrder: 1,
            createdAt: new Date(),
          },
        ]),
        count: jest.fn().mockResolvedValue(1),
      },
      organizationFrameworkEntitlement: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'ent-1',
            organizationId: 'org-1',
            organization: { id: 'org-1', name: 'Meridian Health', type: 'STANDALONE' },
            frameworkId: 'fw-1',
            versionId: 'ver-1',
            frameworkVersion: { id: 'ver-1', version: '2022', name: 'ISO 27001:2022' },
            status: 'ACTIVE',
            grantedAt: new Date('2026-09-14'),
            expiresAt: null,
            source: 'ARAV_CONTROL_PLANE',
            createdAt: new Date(),
          },
        ]),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ControlPlaneFrameworksService,
        { provide: DataPlanePrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<ControlPlaneFrameworksService>(ControlPlaneFrameworksService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should list all frameworks enriched with authority and jurisdiction metadata', async () => {
    const res = await service.listFrameworks();
    expect(res.data).toHaveLength(2);
    expect(res.total).toBe(2);

    const iso = res.data.find((f) => f.code === 'ISO27001');
    expect(iso).toBeDefined();
    expect(iso?.jurisdiction).toBe('Global / International');
    expect(iso?.issuingAuthority).toBe('International Organization for Standardization (ISO / IEC)');
    expect(iso?.category).toBe('Information Security');
    expect(iso?.versionsCount).toBe(1);
    expect(iso?.clausesCount).toBe(18);
  });

  it('should filter frameworks by search term', async () => {
    const res = await service.listFrameworks({ search: 'SOC' });
    expect(res.data).toHaveLength(1);
    expect(res.data[0].code).toBe('SOC2');
  });

  it('should get single framework by code', async () => {
    const res = await service.getFramework('ISO27001');
    expect(res.code).toBe('ISO27001');
    expect(res.instrumentType).toBe('International Standard');
  });

  it('should list framework references with pagination', async () => {
    const res = await service.listFrameworkReferences('ISO27001', { page: 1, limit: 10 });
    expect(res.data).toHaveLength(1);
    expect(res.data[0].identifier).toBe('A.5.1');
    expect(res.total).toBe(1);
  });

  it('should list entitled organizations for a framework', async () => {
    const res = await service.listFrameworkEntitlements('ISO27001');
    expect(res).toHaveLength(1);
    expect(res[0].organizationName).toBe('Meridian Health');
    expect(res[0].status).toBe('ACTIVE');
  });
});

