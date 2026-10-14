import { Test, TestingModule } from '@nestjs/testing';
import { BusinessAuditsService } from './business-audits.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ResourceAuthorizationService } from '../auth/resource-authorization.service';
import { NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import {
  AuditPlanStatus,
  AuditAssessmentStatus,
  AuditCheckResult,
  FindingStatus,
  calculateAuditScore,
  VulnerabilitySeverity,
  Role,
} from '@omnigrc/shared';

describe('BusinessAuditsService', () => {
  let service: BusinessAuditsService;
  let prisma: jest.Mocked<any>;
  let auditLogsService: jest.Mocked<any>;
  let notificationsService: jest.Mocked<any>;
  let resourceAuthService: jest.Mocked<any>;

  beforeEach(async () => {
    prisma = {
      auditPlan: {
        findMany: jest.fn(),
        count: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      auditSchedule: {
        create: jest.fn(),
      },
      auditAssessment: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      auditCheckItem: {
        create: jest.fn(),
        createMany: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        update: jest.fn(),
      },
      auditFinding: {
        create: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      auditCapa: {
        create: jest.fn(),
      },
      control: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
      },
      user: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      $transaction: jest.fn((cb) => cb(prisma)),
    };

    auditLogsService = {
      log: jest.fn().mockResolvedValue({}),
    };

    notificationsService = {
      createNotification: jest.fn().mockResolvedValue({}),
    };

    resourceAuthService = {
      authorize: jest.fn().mockResolvedValue(undefined),
      validateHierarchyInvariants: jest.fn().mockResolvedValue(undefined),
      getScopeWhereClause: jest.fn().mockResolvedValue({ organizationId: 'org-1' }),
      assertResourceAccess: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BusinessAuditsService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditLogsService, useValue: auditLogsService },
        { provide: NotificationsService, useValue: notificationsService },
        { provide: ResourceAuthorizationService, useValue: resourceAuthService },
      ],
    }).compile();

    service = module.get<BusinessAuditsService>(BusinessAuditsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should calculate authoritative audit score correctly (handling zero applicable items)', () => {
    // 2 COMPLIANT out of 4 (1 NOT_APPLICABLE) => 2 / (4 - 1) = 2/3 * 100 = 66.67%
    const items = [
      { result: AuditCheckResult.COMPLIANT },
      { result: AuditCheckResult.COMPLIANT },
      { result: AuditCheckResult.NON_COMPLIANT },
      { result: AuditCheckResult.NOT_APPLICABLE },
    ];
    const score = calculateAuditScore(items);
    expect(score).toBe(66.67);

    // Zero applicable items case
    const zeroApplicableItems = [
      { result: AuditCheckResult.NOT_APPLICABLE },
      { result: AuditCheckResult.NOT_APPLICABLE },
    ];
    expect(calculateAuditScore(zeroApplicableItems)).toBe(0);

    // Empty list case
    expect(calculateAuditScore([])).toBe(0);
  });

  it('should create an audit plan and write audit log', async () => {
    const mockPlan = {
      id: 'plan-1',
      organizationId: 'org-1',
      title: 'ISO27001 Internal Audit',
      status: AuditPlanStatus.DRAFT,
      ownerId: 'auditor-1',
      createdById: 'user-1',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    prisma.auditPlan.create.mockResolvedValue(mockPlan);

    const authCtx = { userId: 'user-1', organizationId: 'org-1', role: Role.ADMIN };
    const result = await service.createPlan(authCtx, {
      title: 'ISO27001 Internal Audit',
      ownerId: 'auditor-1',
    });

    expect(result.id).toBe('plan-1');
    expect(auditLogsService.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'AUDIT_PLAN_CREATED' }),
    );
  });

  it('should throw NotFoundException if finding to verify does not exist', async () => {
    prisma.auditFinding.findFirst.mockResolvedValue(null);

    const authCtx = { userId: 'admin-1', organizationId: 'org-1', role: Role.ADMIN };
    await expect(
      service.verifyFinding(authCtx, 'non-existent', FindingStatus.VERIFIED),
    ).rejects.toThrow(NotFoundException);
  });

  it('should reject verification if finding status is OPEN', async () => {
    prisma.auditFinding.findFirst.mockResolvedValue({
      id: 'finding-1',
      organizationId: 'org-1',
      status: FindingStatus.OPEN,
      assessment: {
        auditPlan: { id: 'plan-1', organizationId: 'org-1' },
      },
    });

    const authCtx = { userId: 'admin-1', organizationId: 'org-1', role: Role.ADMIN };
    await expect(
      service.verifyFinding(authCtx, 'finding-1', FindingStatus.VERIFIED),
    ).rejects.toThrow(BadRequestException);
  });

  it('should verify finding successfully when status is READY_FOR_VERIFICATION', async () => {
    const mockFinding = {
      id: 'finding-1',
      organizationId: 'org-1',
      status: FindingStatus.READY_FOR_VERIFICATION,
      createdAt: new Date(),
      updatedAt: new Date(),
      assessment: {
        auditPlan: { id: 'plan-1', organizationId: 'org-1' },
      },
    };

    prisma.auditFinding.findFirst.mockResolvedValue(mockFinding);
    prisma.auditFinding.update.mockResolvedValue({
      ...mockFinding,
      status: FindingStatus.VERIFIED,
      verifiedById: 'admin-1',
      verifiedAt: new Date(),
    });

    const authCtx = { userId: 'admin-1', organizationId: 'org-1', role: Role.ADMIN };
    const verified = await service.verifyFinding(
      authCtx,
      'finding-1',
      FindingStatus.VERIFIED,
      'Verified fix in staging',
    );

    expect(verified.status).toBe(FindingStatus.VERIFIED);
    expect(auditLogsService.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'AUDIT_FINDING_VERIFIED' }),
    );
  });

  // =========================================================================
  // CONTROL TESTING (PHASE 3 INC 4.1)
  // =========================================================================

  describe('getTestsForControl', () => {
    const authCtx = { userId: 'user-1', organizationId: 'org-1', role: Role.ADMIN };

    it('throws NotFoundException if target control does not exist in caller scope', async () => {
      prisma.control.findFirst.mockResolvedValue(null);

      await expect(
        service.getTestsForControl(authCtx, 'non-existent-ctrl'),
      ).rejects.toThrow(NotFoundException);
    });

    it('returns paginated test executions with computed summary and deterministic ordering', async () => {
      prisma.control.findFirst.mockResolvedValue({ id: 'ctrl-1', name: 'Access Control Policy' });

      const mockCheckItems = [
        {
          id: 'ci-1',
          organizationId: 'org-1',
          controlId: 'ctrl-1',
          assessmentId: 'assess-1',
          title: 'Evaluate Control: Access Control Policy',
          description: 'Check password strength',
          result: AuditCheckResult.COMPLIANT,
          notes: 'Enforced via Okta',
          createdById: 'user-1',
          createdAt: new Date('2026-03-01T10:00:00Z'),
          updatedAt: new Date('2026-03-01T11:00:00Z'),
          assessment: {
            summary: 'Q1 Access Review',
            status: AuditAssessmentStatus.IN_PROGRESS,
            auditorId: 'auditor-1',
            auditPlanId: 'plan-1',
            auditPlan: {
              id: 'plan-1',
              title: 'SOC 2 Annual Audit',
              frameworkCode: 'SOC2',
              status: AuditPlanStatus.IN_PROGRESS,
            },
          },
          findings: [],
          evidenceAssociations: [
            {
              evidence: {
                id: 'ev-1',
                title: 'Okta Config',
                fileName: 'okta.pdf',
                scanStatus: 'CLEAN',
                status: 'ACTIVE',
              },
            },
          ],
        },
      ];

      prisma.auditCheckItem.findMany.mockImplementation((args) => {
        if (args.skip !== undefined) {
          // Paginated query
          return Promise.resolve(mockCheckItems);
        }
        // Unpaginated query for metrics
        return Promise.resolve([
          { result: AuditCheckResult.COMPLIANT, updatedAt: new Date('2026-03-01T11:00:00Z') },
        ]);
      });
      prisma.auditCheckItem.count.mockResolvedValue(1);

      const result = await service.getTestsForControl(authCtx, 'ctrl-1', { page: 1, limit: 20 });

      expect(result.total).toBe(1);
      expect(result.items.length).toBe(1);
      expect(result.items[0].id).toBe('ci-1');
      expect(result.items[0].result).toBe(AuditCheckResult.COMPLIANT);
      expect(result.items[0].auditPlanTitle).toBe('SOC 2 Annual Audit');
      expect(result.summary.overallEffectiveness).toBe('EFFECTIVE');
      expect(result.summary.effectiveCount).toBe(1);
      expect(result.summary.ineffectiveCount).toBe(0);
      expect(result.summary.latestTestResult).toBe(AuditCheckResult.COMPLIANT);
    });

    it('computes INEFFECTIVE when latest evaluated test is NON_COMPLIANT', async () => {
      prisma.control.findFirst.mockResolvedValue({ id: 'ctrl-1', name: 'Firewall Rule Control' });

      prisma.auditCheckItem.findMany.mockImplementation((args) => {
        if (args.skip !== undefined) {
          return Promise.resolve([
            {
              id: 'ci-2',
              organizationId: 'org-1',
              controlId: 'ctrl-1',
              assessmentId: 'assess-1',
              title: 'Evaluate Firewall',
              result: AuditCheckResult.NON_COMPLIANT,
              notes: 'Port 22 open',
              createdById: 'user-1',
              createdAt: new Date(),
              updatedAt: new Date(),
              assessment: { status: AuditAssessmentStatus.IN_PROGRESS, auditPlan: { title: 'Plan 1' } },
              findings: [{ id: 'f-1', title: 'Open SSH port', severity: 'HIGH', status: 'OPEN' }],
              evidenceAssociations: [],
            },
          ]);
        }
        return Promise.resolve([
          { result: AuditCheckResult.NON_COMPLIANT, updatedAt: new Date() },
        ]);
      });
      prisma.auditCheckItem.count.mockResolvedValue(1);

      const result = await service.getTestsForControl(authCtx, 'ctrl-1');

      expect(result.summary.overallEffectiveness).toBe('INEFFECTIVE');
      expect(result.summary.ineffectiveCount).toBe(1);
      expect(result.items[0].findingsCount).toBe(1);
    });

    it('computes NOT_TESTED when control has no evaluations', async () => {
      prisma.control.findFirst.mockResolvedValue({ id: 'ctrl-1', name: 'Untested Control' });
      prisma.auditCheckItem.findMany.mockResolvedValue([]);
      prisma.auditCheckItem.count.mockResolvedValue(0);

      const result = await service.getTestsForControl(authCtx, 'ctrl-1');

      expect(result.total).toBe(0);
      expect(result.summary.overallEffectiveness).toBe('NOT_TESTED');
      expect(result.summary.totalTests).toBe(0);
    });
  });

  describe('createCheckItemForControl', () => {
    const authCtx = { userId: 'user-1', organizationId: 'org-1', role: Role.ADMIN };

    it('throws NotFoundException if target control does not exist in caller scope', async () => {
      prisma.control.findFirst.mockResolvedValue(null);

      await expect(
        service.createCheckItemForControl(authCtx, 'ctrl-missing', { assessmentId: 'assess-1' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException if assessmentId is missing', async () => {
      prisma.control.findFirst.mockResolvedValue({ id: 'ctrl-1', name: 'Control 1' });

      await expect(
        service.createCheckItemForControl(authCtx, 'ctrl-1', { assessmentId: '' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException if target assessment does not exist or belongs to another tenant', async () => {
      prisma.control.findFirst.mockResolvedValue({ id: 'ctrl-1', name: 'Control 1' });
      prisma.auditAssessment.findFirst.mockResolvedValue(null);

      await expect(
        service.createCheckItemForControl(authCtx, 'ctrl-1', { assessmentId: 'assess-foreign' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException if assessment status is COMPLETED', async () => {
      prisma.control.findFirst.mockResolvedValue({ id: 'ctrl-1', name: 'Control 1' });
      prisma.auditAssessment.findFirst.mockResolvedValue({
        id: 'assess-1',
        organizationId: 'org-1',
        status: AuditAssessmentStatus.COMPLETED,
        auditPlan: { id: 'plan-1', status: AuditPlanStatus.IN_PROGRESS },
      });

      await expect(
        service.createCheckItemForControl(authCtx, 'ctrl-1', { assessmentId: 'assess-1' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException if parent audit plan status is ARCHIVED or COMPLETED', async () => {
      prisma.control.findFirst.mockResolvedValue({ id: 'ctrl-1', name: 'Control 1' });
      prisma.auditAssessment.findFirst.mockResolvedValue({
        id: 'assess-1',
        organizationId: 'org-1',
        status: AuditAssessmentStatus.IN_PROGRESS,
        auditPlan: { id: 'plan-1', status: AuditPlanStatus.ARCHIVED },
      });

      await expect(
        service.createCheckItemForControl(authCtx, 'ctrl-1', { assessmentId: 'assess-1' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws ConflictException if control already exists in the target assessment', async () => {
      prisma.control.findFirst.mockResolvedValue({ id: 'ctrl-1', name: 'Control 1' });
      prisma.auditAssessment.findFirst.mockResolvedValue({
        id: 'assess-1',
        organizationId: 'org-1',
        status: AuditAssessmentStatus.IN_PROGRESS,
        auditPlan: { id: 'plan-1', status: AuditPlanStatus.IN_PROGRESS },
      });

      prisma.auditCheckItem.findFirst.mockResolvedValue({
        id: 'ci-existing',
        controlId: 'ctrl-1',
        assessmentId: 'assess-1',
      });

      await expect(
        service.createCheckItemForControl(authCtx, 'ctrl-1', { assessmentId: 'assess-1' }),
      ).rejects.toThrow(ConflictException);
    });

    it('creates check item, recalculates assessment score, and logs audit event', async () => {
      prisma.control.findFirst.mockResolvedValue({
        id: 'ctrl-1',
        name: 'Access Control',
        description: 'Enforce MFA',
      });
      prisma.auditAssessment.findFirst.mockResolvedValue({
        id: 'assess-1',
        organizationId: 'org-1',
        status: AuditAssessmentStatus.IN_PROGRESS,
        auditPlan: { id: 'plan-1', status: AuditPlanStatus.IN_PROGRESS },
      });

      // No existing duplicate
      prisma.auditCheckItem.findFirst.mockResolvedValue(null);

      const mockCreated = {
        id: 'ci-new',
        organizationId: 'org-1',
        assessmentId: 'assess-1',
        controlId: 'ctrl-1',
        title: 'Evaluate Control: Access Control',
        description: 'Enforce MFA',
        result: AuditCheckResult.COMPLIANT,
        notes: 'Passed manual verification',
        createdById: 'user-1',
        createdAt: new Date('2026-03-01T10:00:00Z'),
        updatedAt: new Date('2026-03-01T10:00:00Z'),
        assessment: {
          status: AuditAssessmentStatus.IN_PROGRESS,
          auditPlan: { id: 'plan-1', title: 'SOC 2 Plan', frameworkCode: 'SOC2', status: AuditPlanStatus.IN_PROGRESS },
        },
        findings: [],
        evidenceAssociations: [],
      };

      prisma.auditCheckItem.create.mockResolvedValue(mockCreated);
      prisma.auditCheckItem.findMany.mockResolvedValue([{ result: AuditCheckResult.COMPLIANT }]);
      prisma.auditAssessment.update.mockResolvedValue({});

      const result = await service.createCheckItemForControl(authCtx, 'ctrl-1', {
        assessmentId: 'assess-1',
        result: AuditCheckResult.COMPLIANT,
        notes: 'Passed manual verification',
      });

      expect(result.id).toBe('ci-new');
      expect(result.result).toBe(AuditCheckResult.COMPLIANT);
      expect(prisma.auditAssessment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'assess-1' },
          data: { score: 100 },
        }),
      );
      expect(auditLogsService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'CONTROL_TEST_ADDED',
          entityType: 'AuditCheckItem',
          entityId: 'ci-new',
        }),
      );
    });
  });
});
