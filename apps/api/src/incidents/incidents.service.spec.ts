import { Test, TestingModule } from '@nestjs/testing';
import { IncidentsService } from './incidents.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { ResourceAuthorizationService } from '../auth/resource-authorization.service';
import { ApprovalEngineService } from '../approval/approval-engine.service';
import { IncidentSeverity, IncidentStatus, Role } from '@omnigrc/shared';
import { BadRequestException, NotFoundException } from '@nestjs/common';

describe('IncidentsService', () => {
  let service: IncidentsService;
  let prisma: any;
  let auditLogs: any;
  let resourceAuth: any;
  let approvalEngine: any;

  beforeEach(async () => {
    prisma = {
      incident: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      incidentAction: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        deleteMany: jest.fn(),
      },
      incidentEvidence: {
        create: jest.fn(),
        deleteMany: jest.fn(),
      },
      evidence: {
        findFirst: jest.fn(),
      },
      asset: {
        findFirst: jest.fn(),
      },
    };
    auditLogs = {
      log: jest.fn(),
    };
    resourceAuth = {
      getScopeWhereClause: jest.fn().mockResolvedValue({}),
      authorize: jest.fn().mockResolvedValue(true),
      validateHierarchyInvariants: jest.fn().mockResolvedValue(true),
    };
    approvalEngine = {
      createApprovalInstance: jest.fn().mockResolvedValue({
        id: 'appr-inc-1',
        status: 'PENDING',
        resourceType: 'INCIDENT',
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IncidentsService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditLogsService, useValue: auditLogs },
        { provide: ResourceAuthorizationService, useValue: resourceAuth },
        { provide: ApprovalEngineService, useValue: approvalEngine },
      ],
    }).compile();

    service = module.get<IncidentsService>(IncidentsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findAll', () => {
    it('should list incidents for organization with category and priority', async () => {
      const mockIncident = {
        id: 'inc-1',
        organizationId: 'org-1',
        title: 'Security Breach Test',
        description: 'Test desc',
        category: 'DATA_BREACH',
        priority: 'P1',
        severity: 'HIGH',
        status: 'OPEN',
        owner: 'SecOps',
        businessUnit: 'Engineering',
        detectedAt: new Date(),
        containedAt: null,
        resolvedAt: null,
        dueDate: null,
        rootCause: null,
        investigationDetails: null,
        affectedAssetId: null,
        affectedAsset: null,
        actions: [],
        createdById: 'user-1',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      prisma.incident.findMany.mockResolvedValue([mockIncident]);
      prisma.incident.count.mockResolvedValue(1);

      const authCtx = { userId: 'user-1', organizationId: 'org-1', role: Role.ADMIN };
      const result = await service.findAll(authCtx, { page: 1, limit: 10, category: 'DATA_BREACH' });
      expect(result.total).toBe(1);
      expect(result.items.length).toBe(1);
      expect(result.items[0].title).toBe('Security Breach Test');
      expect(result.items[0].category).toBe('DATA_BREACH');
      expect(result.items[0].priority).toBe('P1');
    });
  });

  describe('create', () => {
    it('should create an incident with taxonomy fields and log audit event', async () => {
      const mockCreated = {
        id: 'inc-2',
        organizationId: 'org-1',
        title: 'Data Leak',
        description: 'Leak of customer identifiers',
        category: 'CONFIDENTIALITY',
        priority: 'P1',
        severity: 'CRITICAL',
        status: 'OPEN',
        owner: 'SecOps Lead',
        businessUnit: 'Cloud Ops',
        detectedAt: new Date(),
        containedAt: null,
        resolvedAt: null,
        dueDate: new Date('2026-11-01'),
        rootCause: null,
        investigationDetails: null,
        affectedAssetId: null,
        affectedAsset: null,
        actions: [],
        createdById: 'user-1',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      prisma.incident.create.mockResolvedValue(mockCreated);

      const authCtx = { userId: 'user-1', organizationId: 'org-1', role: Role.ADMIN };
      const result = await service.create(authCtx, {
        title: 'Data Leak',
        description: 'Leak of customer identifiers',
        category: 'CONFIDENTIALITY',
        priority: 'P1',
        severity: IncidentSeverity.CRITICAL,
        businessUnit: 'Cloud Ops',
      });

      expect(result.id).toBe('inc-2');
      expect(result.category).toBe('CONFIDENTIALITY');
      expect(result.priority).toBe('P1');
      expect(auditLogs.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'INCIDENT_CREATED',
          entityId: 'inc-2',
        }),
      );
    });

    it('should throw NotFoundException if affectedAssetId belongs to another tenant', async () => {
      prisma.asset.findFirst.mockResolvedValue(null);

      const authCtx = { userId: 'user-1', organizationId: 'org-1', role: Role.ADMIN };
      await expect(
        service.create(authCtx, {
          title: 'Unauthorized Asset Incident',
          affectedAssetId: 'foreign-asset-id',
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('update and lifecycle validations', () => {
    it('should prevent marking incident as RESOLVED without RCA or investigation details', async () => {
      const existing = {
        id: 'inc-3',
        organizationId: 'org-1',
        status: IncidentStatus.IN_INVESTIGATION,
        rootCause: null,
        investigationDetails: null,
      };
      prisma.incident.findFirst.mockResolvedValue(existing);

      const authCtx = { userId: 'user-1', organizationId: 'org-1', role: Role.ADMIN };
      await expect(
        service.update(authCtx, 'inc-3', { status: IncidentStatus.RESOLVED }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should allow marking incident as RESOLVED when RCA is supplied', async () => {
      const existing = {
        id: 'inc-3',
        organizationId: 'org-1',
        status: IncidentStatus.IN_INVESTIGATION,
        rootCause: null,
        investigationDetails: null,
      };
      prisma.incident.findFirst.mockResolvedValue(existing);
      prisma.incident.update.mockResolvedValue({
        ...existing,
        status: IncidentStatus.RESOLVED,
        rootCause: 'Misconfigured S3 bucket ACL',
        resolvedAt: new Date(),
        actions: [],
      });

      const authCtx = { userId: 'user-1', organizationId: 'org-1', role: Role.ADMIN };
      const updated = await service.update(authCtx, 'inc-3', {
        status: IncidentStatus.RESOLVED,
        rootCause: 'Misconfigured S3 bucket ACL',
      });

      expect(updated.status).toBe(IncidentStatus.RESOLVED);
      expect(updated.rootCause).toBe('Misconfigured S3 bucket ACL');
    });

    it('should prevent closing an incident directly from OPEN/INVESTIGATING without first resolving', async () => {
      const existing = {
        id: 'inc-4',
        organizationId: 'org-1',
        status: IncidentStatus.OPEN,
      };
      prisma.incident.findFirst.mockResolvedValue(existing);

      const authCtx = { userId: 'user-1', organizationId: 'org-1', role: Role.ADMIN };
      await expect(
        service.update(authCtx, 'inc-4', { status: IncidentStatus.CLOSED }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should allow closing an incident from RESOLVED status', async () => {
      const existing = {
        id: 'inc-4',
        organizationId: 'org-1',
        status: IncidentStatus.RESOLVED,
        rootCause: 'Phishing email clicked',
        investigationDetails: 'Endpoint isolated and restored',
      };
      prisma.incident.findFirst.mockResolvedValue(existing);
      prisma.incident.update.mockResolvedValue({
        ...existing,
        status: IncidentStatus.CLOSED,
        actions: [],
      });

      const authCtx = { userId: 'user-1', organizationId: 'org-1', role: Role.ADMIN };
      const updated = await service.update(authCtx, 'inc-4', { status: IncidentStatus.CLOSED });
      expect(updated.status).toBe(IncidentStatus.CLOSED);
    });

    it('should only allow reopening a CLOSED incident back to OPEN', async () => {
      const existing = {
        id: 'inc-5',
        organizationId: 'org-1',
        status: IncidentStatus.CLOSED,
      };
      prisma.incident.findFirst.mockResolvedValue(existing);

      const authCtx = { userId: 'user-1', organizationId: 'org-1', role: Role.ADMIN };
      await expect(
        service.update(authCtx, 'inc-5', { status: IncidentStatus.RESOLVED }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('Incident Actions (CAPA)', () => {
    it('should create an incident action with proper tenant scope', async () => {
      const existing = { id: 'inc-10', organizationId: 'org-1', status: 'INVESTIGATING' };
      prisma.incident.findFirst.mockResolvedValue(existing);

      const mockAction = {
        id: 'action-1',
        organizationId: 'org-1',
        incidentId: 'inc-10',
        title: 'Rotate API Keys and Enforce MFA',
        description: 'Immediately revoke leaked credentials',
        actionType: 'CORRECTIVE',
        owner: 'DevOps Lead',
        dueDate: new Date('2026-10-25'),
        status: 'OPEN',
        completedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      prisma.incidentAction.create.mockResolvedValue(mockAction);

      const authCtx = { userId: 'user-1', organizationId: 'org-1', role: Role.ADMIN };
      const res = await service.createAction(authCtx, 'inc-10', {
        title: 'Rotate API Keys and Enforce MFA',
        description: 'Immediately revoke leaked credentials',
        actionType: 'CORRECTIVE',
        owner: 'DevOps Lead',
        dueDate: '2026-10-25',
      });

      expect(res.id).toBe('action-1');
      expect(res.actionType).toBe('CORRECTIVE');
      expect(prisma.incidentAction.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          organizationId: 'org-1',
          incidentId: 'inc-10',
          title: 'Rotate API Keys and Enforce MFA',
        }),
      });
    });

    it('should update an incident action to COMPLETED and set completedAt', async () => {
      const existingInc = { id: 'inc-10', organizationId: 'org-1' };
      const existingAction = {
        id: 'action-1',
        organizationId: 'org-1',
        incidentId: 'inc-10',
        title: 'Rotate Keys',
        status: 'OPEN',
        completedAt: null,
      };
      prisma.incident.findFirst.mockResolvedValue(existingInc);
      prisma.incidentAction.findFirst.mockResolvedValue(existingAction);

      const updatedAction = {
        ...existingAction,
        status: 'COMPLETED',
        completedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      prisma.incidentAction.update.mockResolvedValue(updatedAction);

      const authCtx = { userId: 'user-1', organizationId: 'org-1', role: Role.ADMIN };
      const res = await service.updateAction(authCtx, 'inc-10', 'action-1', {
        status: 'COMPLETED',
      });

      expect(res.status).toBe('COMPLETED');
      expect(res.completedAt).toBeDefined();
    });
  });

  describe('Evidence attachment and Approval submission', () => {
    it('should attach evidence to incident within organization boundary', async () => {
      prisma.incident.findFirst.mockResolvedValue({ id: 'inc-20', organizationId: 'org-1', actions: [] });
      prisma.evidence.findFirst.mockResolvedValue({ id: 'evi-1', organizationId: 'org-1' });
      prisma.incidentEvidence.create.mockResolvedValue({
        id: 'ie-1',
        incidentId: 'inc-20',
        evidenceId: 'evi-1',
        organizationId: 'org-1',
      });

      const authCtx = { userId: 'user-1', organizationId: 'org-1', role: Role.ADMIN };
      const result = await service.attachEvidence(authCtx, 'inc-20', 'evi-1');
      expect(result.incidentId).toBe('inc-20');
      expect(result.evidenceId).toBe('evi-1');
    });

    it('should submit incident for approval', async () => {
      prisma.incident.findFirst.mockResolvedValue({
        id: 'inc-30',
        title: 'Production Outage',
        organizationId: 'org-1',
        actions: [],
      });

      const authCtx = { userId: 'user-1', organizationId: 'org-1', role: Role.ADMIN };
      const approval = await service.submitForApproval(authCtx, 'inc-30', {
        purpose: 'INCIDENT_CLOSURE',
      });

      expect(approval.id).toBe('appr-inc-1');
      expect(approvalEngine.createApprovalInstance).toHaveBeenCalledWith(
        'org-1',
        'user-1',
        expect.objectContaining({
          resourceType: 'INCIDENT',
          resourceId: 'inc-30',
          purpose: 'INCIDENT_CLOSURE',
        }),
      );
    });
  });
});

