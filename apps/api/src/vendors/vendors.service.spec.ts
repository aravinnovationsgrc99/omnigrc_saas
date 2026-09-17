import { Test, TestingModule } from '@nestjs/testing';
import { VendorsService } from './vendors.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { NotFoundException } from '@nestjs/common';
import { VendorCriticality, VendorStatus } from '@omnigrc/shared';

describe('VendorsService', () => {
  let service: VendorsService;
  let prisma: jest.Mocked<any>;
  let auditLogsService: jest.Mocked<any>;

  beforeEach(async () => {
    prisma = {
      vendor: {
        findMany: jest.fn(),
        count: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      vendorAssessment: {
        findMany: jest.fn(),
        create: jest.fn(),
      },
    };

    auditLogsService = {
      log: jest.fn().mockResolvedValue({}),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VendorsService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditLogsService, useValue: auditLogsService },
      ],
    }).compile();

    service = module.get<VendorsService>(VendorsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should list vendors scoped to organizationId', async () => {
    const mockVendor = {
      id: 'ven-1',
      organizationId: 'org-1',
      name: 'Cloud Vendor',
      criticality: VendorCriticality.HIGH,
      status: VendorStatus.ACTIVE,
      owner: 'SecOps',
      reviewCadenceDays: 365,
      createdAt: new Date(),
      updatedAt: new Date(),
      createdById: 'user-1',
      assessments: [],
      _count: { assets: 2 },
    };

    prisma.vendor.findMany.mockResolvedValue([mockVendor]);
    prisma.vendor.count.mockResolvedValue(1);

    const result = await service.findAll('org-1', {});
    expect(prisma.vendor.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organizationId: 'org-1' }),
      }),
    );
    expect(result.items.length).toBe(1);
    expect(result.items[0].name).toBe('Cloud Vendor');
  });

  it('should record vendor assessment and log audit entry', async () => {
    const mockVendor = { id: 'ven-1', organizationId: 'org-1', name: 'Vendor 1' };
    const mockAssessment = {
      id: 'ass-1',
      organizationId: 'org-1',
      vendorId: 'ven-1',
      title: 'Annual Review',
      score: 90,
      status: 'COMPLETED',
      evaluatorId: 'user-1',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    prisma.vendor.findFirst.mockResolvedValue(mockVendor);
    prisma.vendorAssessment.create.mockResolvedValue(mockAssessment);

    const result = await service.createAssessment('org-1', 'ven-1', 'user-1', {
      title: 'Annual Review',
      score: 90,
      evaluatorId: 'user-1',
    });

    expect(result.score).toBe(90);
    expect(auditLogsService.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'VENDOR_ASSESSMENT_CREATED' }),
    );
  });
});
