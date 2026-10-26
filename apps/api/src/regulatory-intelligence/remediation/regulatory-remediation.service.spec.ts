import { Test, TestingModule } from '@nestjs/testing';
import { RegulatoryRemediationService } from './regulatory-remediation.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogsService } from '../../audit-logs/audit-logs.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { RegulatoryControlGapService } from '../gaps/regulatory-control-gap.service';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  RegulatoryRemediationStatus,
  RemediationPriority,
  RemediationApprovalAction,
} from '../dto/remediation.dto';
import { ControlGapOutcome, EvidenceSufficiencyOutcome, Role, TaskStatus } from '@prisma/client';

describe('RegulatoryRemediationService', () => {
  let service: RegulatoryRemediationService;
  let prisma: any;
  let auditLogsService: any;
  let notificationsService: any;
  let controlGapService: any;

  const mockOrgId = 'org-tenant-1';
  const mockOtherOrgId = 'org-tenant-2';
  const mockActorId = 'user-compliance-officer';

  beforeEach(async () => {
    prisma = {
      regulatoryControlGapAssessment: {
        findFirst: jest.fn(),
      },
      regulatoryRemediationTask: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      regulatoryRemediationHistory: {
        create: jest.fn(),
      },
      complianceTask: {
        create: jest.fn(),
        update: jest.fn(),
      },
      user: {
        findFirst: jest.fn(),
      },
      evidence: {
        findMany: jest.fn(),
      },
      $transaction: jest.fn(async (cb) => (typeof cb === 'function' ? cb(prisma) : cb)),
    };

    auditLogsService = {
      log: jest.fn().mockResolvedValue({ id: 'audit-log-1' }),
    };

    notificationsService = {
      notify: jest.fn().mockResolvedValue(undefined),
    };

    controlGapService = {
      assessObligationGap: jest.fn().mockResolvedValue({ id: 'gap-reassessed' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RegulatoryRemediationService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditLogsService, useValue: auditLogsService },
        { provide: NotificationsService, useValue: notificationsService },
        { provide: RegulatoryControlGapService, useValue: controlGapService },
      ],
    }).compile();

    service = module.get<RegulatoryRemediationService>(RegulatoryRemediationService);
  });

  describe('1. createRemediation (Finding Eligibility & Provenance)', () => {
    it('should throw NotFoundException if gap assessment does not exist in caller organization', async () => {
      prisma.regulatoryControlGapAssessment.findFirst.mockResolvedValue(null);

      await expect(
        service.createRemediation(mockOrgId, mockActorId, {
          assessmentId: 'gap-nonexistent',
          title: 'Remediate gap',
          description: 'Deploy MFA',
          acceptanceCriteria: 'MFA deployed on all admins',
          assignedToId: 'user-assignee-1',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if finding has not been human-reviewed', async () => {
      prisma.regulatoryControlGapAssessment.findFirst.mockResolvedValue({
        id: 'gap-1',
        organizationId: mockOrgId,
        isHumanReviewed: false,
      });

      await expect(
        service.createRemediation(mockOrgId, mockActorId, {
          assessmentId: 'gap-1',
          title: 'Remediate gap',
          description: 'Deploy MFA',
          acceptanceCriteria: 'MFA deployed',
          assignedToId: 'user-assignee-1',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject creating remediation for a compliant finding without explicit overrideRationale', async () => {
      prisma.regulatoryControlGapAssessment.findFirst.mockResolvedValue({
        id: 'gap-compliant',
        organizationId: mockOrgId,
        isHumanReviewed: true,
        gapOutcome: ControlGapOutcome.IMPLEMENTED,
        evidenceOutcome: EvidenceSufficiencyOutcome.SUFFICIENT,
      });

      await expect(
        service.createRemediation(mockOrgId, mockActorId, {
          assessmentId: 'gap-compliant',
          title: 'Unnecessary task',
          description: 'Test',
          acceptanceCriteria: 'Test criteria',
          assignedToId: 'user-assignee-1',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw ConflictException if an active remediation task already exists for this finding', async () => {
      prisma.regulatoryControlGapAssessment.findFirst.mockResolvedValue({
        id: 'gap-1',
        organizationId: mockOrgId,
        isHumanReviewed: true,
        gapOutcome: ControlGapOutcome.NOT_IMPLEMENTED,
        evidenceOutcome: EvidenceSufficiencyOutcome.INSUFFICIENT,
      });

      prisma.regulatoryRemediationTask.findFirst.mockResolvedValue({
        id: 'existing-task-1',
        status: RegulatoryRemediationStatus.IN_PROGRESS,
      });

      await expect(
        service.createRemediation(mockOrgId, mockActorId, {
          assessmentId: 'gap-1',
          title: 'Duplicate remediation',
          description: 'Desc',
          acceptanceCriteria: 'Criteria',
          assignedToId: 'user-assignee-1',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('should successfully create remediation, preserving legal complianceDeadline and creating ComplianceTask', async () => {
      const legalDeadline = new Date('2027-01-01T00:00:00Z');
      prisma.regulatoryControlGapAssessment.findFirst.mockResolvedValue({
        id: 'gap-1',
        organizationId: mockOrgId,
        isHumanReviewed: true,
        gapOutcome: ControlGapOutcome.PARTIALLY_IMPLEMENTED,
        evidenceOutcome: EvidenceSufficiencyOutcome.STALE,
        obligationId: 'ob-1',
        controlId: 'ctrl-1',
        mappingId: 'map-1',
        publicationId: 'pub-1',
        publicationVersionId: 'pub-v1',
        applicabilityId: 'app-1',
        obligation: {
          id: 'ob-1',
          obligationIdentifier: 'RBI-CS-SEC-01',
          complianceDeadline: legalDeadline,
        },
      });

      prisma.regulatoryRemediationTask.findFirst.mockResolvedValue(null); // No existing task
      prisma.user.findFirst.mockResolvedValue({
        id: 'user-assignee-1',
        name: 'Dev Lead',
        email: 'dev@omnigrc.local',
      });

      prisma.complianceTask.create.mockResolvedValue({
        id: 'compliance-task-100',
        title: 'Remediate encryption controls',
        owner: 'Dev Lead',
        status: TaskStatus.NOT_STARTED,
      });

      prisma.regulatoryRemediationTask.create.mockImplementation((args: any) => ({
        id: 'rem-task-1',
        ...args.data,
      }));

      const res = await service.createRemediation(mockOrgId, mockActorId, {
        assessmentId: 'gap-1',
        title: 'Remediate encryption controls',
        description: 'Upgrade to AES-256-GCM',
        acceptanceCriteria: 'All data at rest encrypted using AES-256-GCM keys rotated annually',
        assignedToId: 'user-assignee-1',
        internalDueDate: '2026-12-01T00:00:00Z',
        priority: RemediationPriority.HIGH,
      });

      expect(res.id).toBe('rem-task-1');
      expect(res.regulatoryDeadline).toEqual(legalDeadline);
      expect(res.complianceTaskId).toBe('compliance-task-100');
      expect(prisma.complianceTask.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            organizationId: mockOrgId,
            owner: 'Dev Lead',
            controlId: 'ctrl-1',
          }),
        }),
      );
      expect(prisma.regulatoryRemediationHistory.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'CREATED',
            newStatus: RegulatoryRemediationStatus.PROPOSED,
          }),
        }),
      );
      expect(notificationsService.notify).toHaveBeenCalledTimes(1);
      expect(auditLogsService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'REGULATORY_REMEDIATION_CREATED',
        }),
      );
    });
  });

  describe('2. assignRemediation & updateStatus', () => {
    it('should successfully reassign task and sync ComplianceTask owner', async () => {
      prisma.regulatoryRemediationTask.findFirst.mockResolvedValue({
        id: 'rem-task-1',
        organizationId: mockOrgId,
        complianceTaskId: 'comp-1',
        status: RegulatoryRemediationStatus.IN_PROGRESS,
        assignedToId: 'old-user',
        title: 'Remediate task',
      });

      prisma.user.findFirst.mockResolvedValue({
        id: 'new-user',
        name: 'New Owner',
        email: 'new@omnigrc.local',
      });

      prisma.regulatoryRemediationTask.update.mockResolvedValue({
        id: 'rem-task-1',
        assignedToId: 'new-user',
      });

      const res = await service.assignRemediation(mockOrgId, mockActorId, 'rem-task-1', {
        assignedToId: 'new-user',
        rationale: 'Reassigned due to team rotation',
      });

      expect(res.assignedToId).toBe('new-user');
      expect(prisma.complianceTask.update).toHaveBeenCalledWith({
        where: { id: 'comp-1' },
        data: { owner: 'New Owner' },
      });
      expect(auditLogsService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'REGULATORY_REMEDIATION_ASSIGNED' }),
      );
    });

    it('should reject invalid lifecycle transitions in updateStatus', async () => {
      prisma.regulatoryRemediationTask.findFirst.mockResolvedValue({
        id: 'rem-task-1',
        organizationId: mockOrgId,
        status: RegulatoryRemediationStatus.IN_PROGRESS,
      });

      // Cannot jump directly to VERIFIED_CLOSED via updateStatus
      await expect(
        service.updateStatus(mockOrgId, mockActorId, 'rem-task-1', {
          status: RegulatoryRemediationStatus.VERIFIED_CLOSED,
        }),
      ).rejects.toThrow(BadRequestException);

      // Transition to BLOCKED requires blockedReason
      await expect(
        service.updateStatus(mockOrgId, mockActorId, 'rem-task-1', {
          status: RegulatoryRemediationStatus.BLOCKED,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should allow valid transition to BLOCKED when reason is provided', async () => {
      prisma.regulatoryRemediationTask.findFirst.mockResolvedValue({
        id: 'rem-task-1',
        organizationId: mockOrgId,
        complianceTaskId: 'comp-1',
        status: RegulatoryRemediationStatus.IN_PROGRESS,
      });

      prisma.regulatoryRemediationTask.update.mockResolvedValue({
        id: 'rem-task-1',
        status: RegulatoryRemediationStatus.BLOCKED,
        blockedReason: 'Waiting for vendor patch release',
      });

      const res = await service.updateStatus(mockOrgId, mockActorId, 'rem-task-1', {
        status: RegulatoryRemediationStatus.BLOCKED,
        blockedReason: 'Waiting for vendor patch release',
      });

      expect(res.status).toBe(RegulatoryRemediationStatus.BLOCKED);
      expect(auditLogsService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'REGULATORY_REMEDIATION_STATUS_CHANGED' }),
      );
    });
  });

  describe('3. handleApproval (Governance Workflow & Segregation of Duties)', () => {
    it('should reject approval from unauthorized non-compliance roles', async () => {
      prisma.regulatoryRemediationTask.findFirst.mockResolvedValue({
        id: 'rem-task-1',
        organizationId: mockOrgId,
        status: RegulatoryRemediationStatus.AWAITING_APPROVAL,
      });

      await expect(
        service.handleApproval(mockOrgId, 'analyst-1', Role.ANALYST, 'rem-task-1', {
          action: RemediationApprovalAction.APPROVE,
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should enforce segregation of duties: proposer cannot approve their own submission unless ADMIN', async () => {
      prisma.regulatoryRemediationTask.findFirst.mockResolvedValue({
        id: 'rem-task-1',
        organizationId: mockOrgId,
        status: RegulatoryRemediationStatus.AWAITING_APPROVAL,
        assignedById: 'officer-1', // same officer
      });

      await expect(
        service.handleApproval(mockOrgId, 'officer-1', Role.MSSP_ADMIN, 'rem-task-1', {
          action: RemediationApprovalAction.APPROVE,
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should allow approval by independent compliance officer', async () => {
      prisma.regulatoryRemediationTask.findFirst.mockResolvedValue({
        id: 'rem-task-1',
        organizationId: mockOrgId,
        status: RegulatoryRemediationStatus.AWAITING_APPROVAL,
        assignedById: 'officer-1',
      });

      prisma.regulatoryRemediationTask.update.mockResolvedValue({
        id: 'rem-task-1',
        status: RegulatoryRemediationStatus.APPROVED,
        approvedById: 'officer-2',
      });

      const res = await service.handleApproval(mockOrgId, 'officer-2', Role.MSSP_ADMIN, 'rem-task-1', {
        action: RemediationApprovalAction.APPROVE,
        approvalNotes: 'Approved for Q4 implementation',
      });

      expect(res.status).toBe(RegulatoryRemediationStatus.APPROVED);
      expect(auditLogsService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'REGULATORY_REMEDIATION_APPROVED' }),
      );
    });

    it('should require rejectionReason when rejecting remediation task', async () => {
      prisma.regulatoryRemediationTask.findFirst.mockResolvedValue({
        id: 'rem-task-1',
        organizationId: mockOrgId,
        status: RegulatoryRemediationStatus.AWAITING_APPROVAL,
        assignedById: 'officer-1',
      });

      await expect(
        service.handleApproval(mockOrgId, 'officer-2', Role.MSSP_ADMIN, 'rem-task-1', {
          action: RemediationApprovalAction.REJECT,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject remediation task with reason and annotate underlying ComplianceTask', async () => {
      prisma.regulatoryRemediationTask.findFirst.mockResolvedValue({
        id: 'rem-task-1',
        organizationId: mockOrgId,
        complianceTaskId: 'comp-1',
        status: RegulatoryRemediationStatus.AWAITING_APPROVAL,
        assignedById: 'officer-1',
        description: 'Original remediation proposal',
      });

      prisma.regulatoryRemediationTask.update.mockResolvedValue({
        id: 'rem-task-1',
        status: RegulatoryRemediationStatus.REJECTED,
        rejectedById: 'officer-2',
        rejectionReason: 'Scope too broad, split into smaller tasks',
      });

      const res = await service.handleApproval(mockOrgId, 'officer-2', Role.MSSP_ADMIN, 'rem-task-1', {
        action: RemediationApprovalAction.REJECT,
        rejectionReason: 'Scope too broad, split into smaller tasks',
      });

      expect(res.status).toBe(RegulatoryRemediationStatus.REJECTED);
      expect(prisma.complianceTask.update).toHaveBeenCalledWith({
        where: { id: 'comp-1' },
        data: {
          status: TaskStatus.COMPLETE,
          description: expect.stringContaining('[REJECTED: Scope too broad, split into smaller tasks]'),
        },
      });
      expect(auditLogsService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'REGULATORY_REMEDIATION_REJECTED' }),
      );
    });
  });

  describe('4. completeRemediation & Evidence Validation', () => {
    it('should reject completion if referenced evidence belongs to another tenant or is deleted', async () => {
      prisma.regulatoryRemediationTask.findFirst.mockResolvedValue({
        id: 'rem-task-1',
        organizationId: mockOrgId,
        status: RegulatoryRemediationStatus.IN_PROGRESS,
      });

      // Simulating only 1 valid item found when 2 were requested
      prisma.evidence.findMany.mockResolvedValue([{ id: 'ev-1' }]);

      await expect(
        service.completeRemediation(mockOrgId, mockActorId, 'rem-task-1', {
          completionNotes: 'Completed network segmentation',
          evidenceIds: ['ev-1', 'ev-unauthorized-2'],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should transition to COMPLETED and sync ComplianceTask to UNDER_REVIEW', async () => {
      prisma.regulatoryRemediationTask.findFirst.mockResolvedValue({
        id: 'rem-task-1',
        organizationId: mockOrgId,
        complianceTaskId: 'comp-1',
        status: RegulatoryRemediationStatus.IN_PROGRESS,
      });

      prisma.evidence.findMany.mockResolvedValue([
        { id: 'ev-1', status: 'ACTIVE', scanStatus: 'CLEAN' },
      ]);

      prisma.regulatoryRemediationTask.update.mockResolvedValue({
        id: 'rem-task-1',
        status: RegulatoryRemediationStatus.COMPLETED,
        completionNotes: 'Implemented and tested segmentation',
      });

      const res = await service.completeRemediation(mockOrgId, mockActorId, 'rem-task-1', {
        completionNotes: 'Implemented and tested segmentation',
        evidenceIds: ['ev-1'],
      });

      expect(res.status).toBe(RegulatoryRemediationStatus.COMPLETED);
      expect(prisma.complianceTask.update).toHaveBeenCalledWith({
        where: { id: 'comp-1' },
        data: { status: TaskStatus.UNDER_REVIEW },
      });
      expect(auditLogsService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'REGULATORY_REMEDIATION_COMPLETED' }),
      );
    });
  });

  describe('5. verifyAndClose & Explicit Reassessment', () => {
    it('should verify and close task and optionally trigger Phase 6 reassessment run', async () => {
      prisma.regulatoryRemediationTask.findFirst.mockResolvedValue({
        id: 'rem-task-1',
        organizationId: mockOrgId,
        complianceTaskId: 'comp-1',
        obligationId: 'ob-1',
        status: RegulatoryRemediationStatus.COMPLETED,
      });

      prisma.regulatoryRemediationTask.update.mockResolvedValue({
        id: 'rem-task-1',
        status: RegulatoryRemediationStatus.VERIFIED_CLOSED,
        reassessmentRequested: true,
      });

      const res = await service.verifyAndClose(mockOrgId, mockActorId, Role.MSSP_ADMIN, 'rem-task-1', {
        verificationNotes: 'Verified configuration and audit evidence in staging and prod.',
        reassessmentRequested: true,
      });

      expect(res.status).toBe(RegulatoryRemediationStatus.VERIFIED_CLOSED);
      expect(prisma.complianceTask.update).toHaveBeenCalledWith({
        where: { id: 'comp-1' },
        data: expect.objectContaining({ status: TaskStatus.COMPLETE }),
      });
      expect(controlGapService.assessObligationGap).toHaveBeenCalledWith(mockOrgId, 'ob-1', mockActorId, true);
      expect(auditLogsService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'REGULATORY_REMEDIATION_VERIFIED_CLOSED' }),
      );
    });
  });

  describe('6. acceptRisk (Documented Policy Exception Workflow)', () => {
    it('should transition to RISK_ACCEPTED and close ComplianceTask without mutating gap findings', async () => {
      prisma.regulatoryRemediationTask.findFirst.mockResolvedValue({
        id: 'rem-task-1',
        organizationId: mockOrgId,
        complianceTaskId: 'comp-1',
        status: RegulatoryRemediationStatus.IN_PROGRESS,
      });

      prisma.regulatoryRemediationTask.update.mockResolvedValue({
        id: 'rem-task-1',
        status: RegulatoryRemediationStatus.RISK_ACCEPTED,
        riskAcceptanceRationale: 'Compensating control in place: air-gapped system approved by CISO.',
      });

      const res = await service.acceptRisk(mockOrgId, mockActorId, Role.ADMIN, 'rem-task-1', {
        riskAcceptanceRationale: 'Compensating control in place: air-gapped system approved by CISO.',
      });

      expect(res.status).toBe(RegulatoryRemediationStatus.RISK_ACCEPTED);
      expect(prisma.complianceTask.update).toHaveBeenCalledWith({
        where: { id: 'comp-1' },
        data: {
          status: TaskStatus.COMPLETE,
          description: expect.stringContaining('[RISK ACCEPTED: Compensating control in place: air-gapped system approved by CISO.]'),
        },
      });
      expect(auditLogsService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'REGULATORY_REMEDIATION_RISK_ACCEPTED' }),
      );
    });
  });

  describe('7. Multi-Tenant Scoping & Summary Metrics', () => {
    it('should prevent cross-tenant access to remediation tasks', async () => {
      prisma.regulatoryRemediationTask.findFirst.mockResolvedValue(null);

      await expect(service.findOne(mockOtherOrgId, 'rem-task-1')).rejects.toThrow(NotFoundException);
    });

    it('should compute summary metrics accurately including overdue calculations', async () => {
      const now = new Date();
      const pastDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const futureDate = new Date(now.getTime() + 24 * 60 * 60 * 1000);

      prisma.regulatoryRemediationTask.findMany.mockResolvedValue([
        {
          status: RegulatoryRemediationStatus.IN_PROGRESS,
          priority: RemediationPriority.HIGH,
          internalDueDate: pastDate,
          regulatoryDeadline: futureDate,
        },
        {
          status: RegulatoryRemediationStatus.PROPOSED,
          priority: RemediationPriority.CRITICAL,
          internalDueDate: pastDate,
          regulatoryDeadline: pastDate,
        },
        {
          status: RegulatoryRemediationStatus.VERIFIED_CLOSED,
          priority: RemediationPriority.LOW,
          internalDueDate: pastDate, // Closed tasks do not count towards overdue
          regulatoryDeadline: pastDate,
        },
      ]);

      const summary = await service.getSummary(mockOrgId);

      expect(summary.totalTasks).toBe(3);
      expect(summary.byStatus[RegulatoryRemediationStatus.IN_PROGRESS]).toBe(1);
      expect(summary.byStatus[RegulatoryRemediationStatus.PROPOSED]).toBe(1);
      expect(summary.byStatus[RegulatoryRemediationStatus.VERIFIED_CLOSED]).toBe(1);
      expect(summary.internalOverdueCount).toBe(2);
      expect(summary.regulatoryOverdueCount).toBe(1);
    });
  });
});
