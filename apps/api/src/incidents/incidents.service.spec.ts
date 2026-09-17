import { Test, TestingModule } from '@nestjs/testing';
import { IncidentsService } from './incidents.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { IncidentSeverity, IncidentStatus } from '@omnigrc/shared';
import { NotFoundException } from '@nestjs/common';

describe('IncidentsService', () => {
  let service: IncidentsService;
  let prisma: any;
  let auditLogs: any;

  beforeEach(async () => {
    prisma = {
      incident: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      asset: {
        findFirst: jest.fn(),
      },
    };
    auditLogs = {
      log: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IncidentsService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditLogsService, useValue: auditLogs },
      ],
    }).compile();

    service = module.get<IncidentsService>(IncidentsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should list incidents for organization', async () => {
    const mockIncident = {
      id: 'inc-1',
      organizationId: 'org-1',
      title: 'Security Breach Test',
      description: 'Test desc',
      severity: 'HIGH',
      status: 'OPEN',
      owner: 'SecOps',
      detectedAt: new Date(),
      containedAt: null,
      resolvedAt: null,
      dueDate: null,
      rootCause: null,
      affectedAssetId: null,
      affectedAsset: null,
      createdById: 'user-1',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    prisma.incident.findMany.mockResolvedValue([mockIncident]);
    prisma.incident.count.mockResolvedValue(1);

    const result = await service.findAll('org-1', { page: 1, limit: 10 });
    expect(result.total).toBe(1);
    expect(result.items.length).toBe(1);
    expect(result.items[0].title).toBe('Security Breach Test');
  });

  it('should create an incident and log audit event', async () => {
    const mockCreated = {
      id: 'inc-2',
      organizationId: 'org-1',
      title: 'Data Leak',
      description: null,
      severity: 'CRITICAL',
      status: 'OPEN',
      owner: null,
      detectedAt: new Date(),
      containedAt: null,
      resolvedAt: null,
      dueDate: null,
      rootCause: null,
      affectedAssetId: null,
      affectedAsset: null,
      createdById: 'user-1',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    prisma.incident.create.mockResolvedValue(mockCreated);

    const result = await service.create('org-1', 'user-1', {
      title: 'Data Leak',
      severity: IncidentSeverity.CRITICAL,
    });

    expect(result.id).toBe('inc-2');
    expect(auditLogs.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'INCIDENT_CREATED',
        entityId: 'inc-2',
      }),
    );
  });

  it('should throw NotFoundException if affectedAssetId belongs to another tenant', async () => {
    prisma.asset.findFirst.mockResolvedValue(null);

    await expect(
      service.create('org-1', 'user-1', {
        title: 'Unauthorized Asset Incident',
        affectedAssetId: 'foreign-asset-id',
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it('should throw NotFoundException if incident ID does not exist for tenant', async () => {
    prisma.incident.findFirst.mockResolvedValue(null);

    await expect(service.findOne('org-1', 'non-existent-id')).rejects.toThrow(NotFoundException);
  });
});
