import { Test, TestingModule } from '@nestjs/testing';
import { BusinessAuditsService } from './business-audits.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ResourceAuthorizationService } from '../auth/resource-authorization.service';
import { NotFoundException, BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import {
  AuditPlanStatus,
  AuditAssessmentStatus,
  AuditCheckResult,
  FindingStatus,
  CapaStatus,
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
        findMany: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
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
        findMany: jest.fn(),
        count: jest.fn(),
        update: jest.fn(),
      },
      auditCapa: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        update: jest.fn(),
      },
      auditEvidence: {
        create: jest.fn(),
      },
      control: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
      },
      framework: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
      },
      frameworkVersion: {
        findFirst: jest.fn(),
      },
      frameworkReference: {
        findMany: jest.fn(),
      },
      auditPlanFrameworkReference: {
        createMany: jest.fn(),
        deleteMany: jest.fn(),
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

  describe('Compliance Scope & Multi-Clause Audits', () => {
    const authCtx = { userId: 'user-1', organizationId: 'org-1', role: Role.ADMIN };

    it('should create an audit plan with framework and multi-clause scope', async () => {
      prisma.framework.findUnique.mockResolvedValue({
        id: 'fw-iso',
        code: 'ISO27001',
        name: 'ISO/IEC 27001',
      });
      prisma.frameworkVersion.findFirst.mockResolvedValue({
        id: 'ver-2022',
        frameworkId: 'fw-iso',
        version: '2022',
      });
      prisma.frameworkReference.findMany.mockResolvedValue([
        { id: 'ref-1', frameworkVersionId: 'ver-2022' },
        { id: 'ref-2', frameworkVersionId: 'ver-2022' },
      ]);
      prisma.auditPlan.create.mockResolvedValue({
        id: 'plan-scoped',
        organizationId: 'org-1',
        title: 'FY26 ISO Audit',
        frameworkId: 'fw-iso',
        frameworkVersionId: 'ver-2022',
        frameworkCode: 'ISO27001',
        ownerId: 'lead-auditor',
        status: AuditPlanStatus.DRAFT,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      prisma.auditPlanFrameworkReference.createMany.mockResolvedValue({ count: 2 });
      prisma.auditPlan.findFirst.mockResolvedValue({
        id: 'plan-scoped',
        organizationId: 'org-1',
        title: 'FY26 ISO Audit',
        frameworkId: 'fw-iso',
        frameworkVersionId: 'ver-2022',
        frameworkCode: 'ISO27001',
        ownerId: 'lead-auditor',
        status: AuditPlanStatus.DRAFT,
        createdAt: new Date(),
        updatedAt: new Date(),
        frameworkRef: { name: 'ISO/IEC 27001' },
        versionRef: { version: '2022' },
        scopeReferences: [
          { id: 'psr-1', frameworkReferenceId: 'ref-1', frameworkReference: { identifier: 'A.5.1', title: 'Policies for info sec' } },
          { id: 'psr-2', frameworkReferenceId: 'ref-2', frameworkReference: { identifier: 'A.5.2', title: 'Information security roles' } },
        ],
      });

      const result = await service.createPlan(authCtx, {
        title: 'FY26 ISO Audit',
        frameworkId: 'fw-iso',
        frameworkVersionId: 'ver-2022',
        frameworkReferenceIds: ['ref-1', 'ref-2'],
        ownerId: 'lead-auditor',
      });

      expect(result.id).toBe('plan-scoped');
      expect(result.frameworkId).toBe('fw-iso');
      expect(result.frameworkName).toBe('ISO/IEC 27001');
      expect(result.scopeReferences).toHaveLength(2);
      expect(prisma.auditPlanFrameworkReference.createMany).toHaveBeenCalledWith({
        data: [
          { auditPlanId: 'plan-scoped', frameworkReferenceId: 'ref-1' },
          { auditPlanId: 'plan-scoped', frameworkReferenceId: 'ref-2' },
        ],
        skipDuplicates: true,
      });
    });

    it('should reject plan creation if selected references do not belong to the framework version', async () => {
      prisma.framework.findUnique.mockResolvedValue({
        id: 'fw-iso',
        code: 'ISO27001',
      });
      prisma.frameworkVersion.findFirst.mockResolvedValue({
        id: 'ver-2022',
        frameworkId: 'fw-iso',
      });
      // Return only 1 ref when 2 were passed
      prisma.frameworkReference.findMany.mockResolvedValue([{ id: 'ref-1' }]);

      await expect(
        service.createPlan(authCtx, {
          title: 'Invalid Ref Audit',
          frameworkId: 'fw-iso',
          frameworkVersionId: 'ver-2022',
          frameworkReferenceIds: ['ref-1', 'nonexistent-ref'],
          ownerId: 'lead-auditor',
        }),
      ).rejects.toThrow('One or more selected framework references do not belong to the selected framework/version');
    });

    it('should filter audit plans by frameworkId and frameworkReferenceId server-side', async () => {
      prisma.auditPlan.findMany.mockResolvedValue([]);
      prisma.auditPlan.count.mockResolvedValue(0);

      await service.findAllPlans(authCtx, {
        frameworkId: 'fw-soc2',
        frameworkReferenceId: 'ref-cc1',
      });

      expect(prisma.auditPlan.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            frameworkId: 'fw-soc2',
            scopeReferences: {
              some: { frameworkReferenceId: 'ref-cc1' },
            },
          }),
        }),
      );
    });

    it('should clear old clause associations transactionally when changing framework without supplying clause IDs', async () => {
      const existingPlan = {
        id: 'plan-1',
        organizationId: 'org-1',
        title: 'Audit Plan 1',
        frameworkId: 'fw-iso',
        frameworkVersionId: 'ver-2022',
        frameworkCode: 'ISO27001',
        status: AuditPlanStatus.DRAFT,
        createdAt: new Date(),
        updatedAt: new Date(),
        scopeReferences: [
          { id: 'psr-1', frameworkReferenceId: 'ref-1' },
        ],
      };

      prisma.auditPlan.findFirst
        .mockResolvedValueOnce(existingPlan)
        .mockResolvedValueOnce({
          ...existingPlan,
          frameworkId: 'fw-soc2',
          frameworkVersionId: null,
          frameworkCode: 'SOC2',
          scopeReferences: [],
        });

      prisma.framework.findUnique.mockResolvedValue({
        id: 'fw-soc2',
        code: 'SOC2',
      });

      prisma.auditPlan.update.mockResolvedValue({
        ...existingPlan,
        frameworkId: 'fw-soc2',
        frameworkVersionId: null,
        frameworkCode: 'SOC2',
      });

      const result = await service.updatePlan(authCtx, 'plan-1', {
        frameworkId: 'fw-soc2',
      });

      expect(prisma.$transaction).toHaveBeenCalled();
      expect(prisma.auditPlan.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'plan-1' },
          data: expect.objectContaining({
            frameworkId: 'fw-soc2',
            frameworkVersionId: null,
            frameworkCode: 'SOC2',
          }),
        }),
      );
      expect(prisma.auditPlanFrameworkReference.deleteMany).toHaveBeenCalledWith({
        where: { auditPlanId: 'plan-1' },
      });
      expect(prisma.auditPlanFrameworkReference.createMany).not.toHaveBeenCalled();
      expect(result.frameworkId).toBe('fw-soc2');
      expect(result.scopeReferences).toHaveLength(0);
    });

    it('should clear old clause associations transactionally when changing version without supplying clause IDs', async () => {
      const existingPlan = {
        id: 'plan-1',
        organizationId: 'org-1',
        title: 'Audit Plan 1',
        frameworkId: 'fw-iso',
        frameworkVersionId: 'ver-2013',
        frameworkCode: 'ISO27001',
        status: AuditPlanStatus.DRAFT,
        createdAt: new Date(),
        updatedAt: new Date(),
        scopeReferences: [
          { id: 'psr-1', frameworkReferenceId: 'ref-old-1' },
        ],
      };

      prisma.auditPlan.findFirst
        .mockResolvedValueOnce(existingPlan)
        .mockResolvedValueOnce({
          ...existingPlan,
          frameworkVersionId: 'ver-2022',
          scopeReferences: [],
        });

      prisma.framework.findUnique.mockResolvedValue({
        id: 'fw-iso',
        code: 'ISO27001',
      });
      prisma.frameworkVersion.findFirst.mockResolvedValue({
        id: 'ver-2022',
        frameworkId: 'fw-iso',
      });

      prisma.auditPlan.update.mockResolvedValue({
        ...existingPlan,
        frameworkVersionId: 'ver-2022',
      });

      const result = await service.updatePlan(authCtx, 'plan-1', {
        frameworkVersionId: 'ver-2022',
      });

      expect(prisma.auditPlan.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'plan-1' },
          data: expect.objectContaining({
            frameworkId: 'fw-iso',
            frameworkVersionId: 'ver-2022',
          }),
        }),
      );
      expect(prisma.auditPlanFrameworkReference.deleteMany).toHaveBeenCalledWith({
        where: { auditPlanId: 'plan-1' },
      });
      expect(prisma.auditPlanFrameworkReference.createMany).not.toHaveBeenCalled();
      expect(result.scopeReferences).toHaveLength(0);
    });

    it('should update framework, version, and replace clauses when all are supplied', async () => {
      const existingPlan = {
        id: 'plan-1',
        organizationId: 'org-1',
        title: 'Audit Plan 1',
        frameworkId: 'fw-iso',
        frameworkVersionId: 'ver-2013',
        frameworkCode: 'ISO27001',
        status: AuditPlanStatus.DRAFT,
        createdAt: new Date(),
        updatedAt: new Date(),
        scopeReferences: [],
      };

      prisma.auditPlan.findFirst
        .mockResolvedValueOnce(existingPlan)
        .mockResolvedValueOnce({
          ...existingPlan,
          frameworkId: 'fw-soc2',
          frameworkVersionId: 'ver-soc2-v1',
          frameworkCode: 'SOC2',
          scopeReferences: [
            { id: 'sr-1', frameworkReferenceId: 'ref-soc-1', frameworkReference: { identifier: 'CC1.1' } },
          ],
        });

      prisma.framework.findUnique.mockResolvedValue({
        id: 'fw-soc2',
        code: 'SOC2',
      });
      prisma.frameworkVersion.findFirst.mockResolvedValue({
        id: 'ver-soc2-v1',
        frameworkId: 'fw-soc2',
      });
      prisma.frameworkReference.findMany.mockResolvedValue([
        { id: 'ref-soc-1' },
      ]);

      prisma.auditPlan.update.mockResolvedValue({
        ...existingPlan,
        frameworkId: 'fw-soc2',
        frameworkVersionId: 'ver-soc2-v1',
        frameworkCode: 'SOC2',
      });

      const result = await service.updatePlan(authCtx, 'plan-1', {
        frameworkId: 'fw-soc2',
        frameworkVersionId: 'ver-soc2-v1',
        frameworkReferenceIds: ['ref-soc-1'],
      });

      expect(prisma.auditPlanFrameworkReference.deleteMany).toHaveBeenCalledWith({
        where: { auditPlanId: 'plan-1' },
      });
      expect(prisma.auditPlanFrameworkReference.createMany).toHaveBeenCalledWith({
        data: [{ auditPlanId: 'plan-1', frameworkReferenceId: 'ref-soc-1' }],
        skipDuplicates: true,
      });
      expect(result.frameworkId).toBe('fw-soc2');
      expect(result.scopeReferences).toHaveLength(1);
    });

    it('should reject update if framework version does not belong to framework', async () => {
      const existingPlan = {
        id: 'plan-1',
        organizationId: 'org-1',
        frameworkId: 'fw-iso',
      };
      prisma.auditPlan.findFirst.mockResolvedValue(existingPlan);
      prisma.framework.findUnique.mockResolvedValue({ id: 'fw-iso', code: 'ISO27001' });
      prisma.frameworkVersion.findFirst.mockResolvedValue(null);

      await expect(
        service.updatePlan(authCtx, 'plan-1', {
          frameworkVersionId: 'foreign-version-id',
        }),
      ).rejects.toThrow('Framework Version "foreign-version-id" does not belong to Framework "fw-iso"');
      expect(prisma.auditPlan.update).not.toHaveBeenCalled();
    });

    it('should reject update if replacement references do not belong to the framework version', async () => {
      const existingPlan = {
        id: 'plan-1',
        organizationId: 'org-1',
        frameworkId: 'fw-iso',
        frameworkVersionId: 'ver-2022',
      };
      prisma.auditPlan.findFirst.mockResolvedValue(existingPlan);
      prisma.framework.findUnique.mockResolvedValue({ id: 'fw-iso', code: 'ISO27001' });
      prisma.frameworkVersion.findFirst.mockResolvedValue({ id: 'ver-2022', frameworkId: 'fw-iso' });
      prisma.frameworkReference.findMany.mockResolvedValue([{ id: 'ref-1' }]);

      await expect(
        service.updatePlan(authCtx, 'plan-1', {
          frameworkReferenceIds: ['ref-1', 'mismatched-ref-2'],
        }),
      ).rejects.toThrow('One or more selected framework references do not belong to the selected framework/version');
      expect(prisma.auditPlan.update).not.toHaveBeenCalled();
    });

    it('should explicitly clear clauses when frameworkReferenceIds is an empty array', async () => {
      const existingPlan = {
        id: 'plan-1',
        organizationId: 'org-1',
        frameworkId: 'fw-iso',
        frameworkVersionId: 'ver-2022',
        frameworkCode: 'ISO27001',
        status: AuditPlanStatus.DRAFT,
        createdAt: new Date(),
        updatedAt: new Date(),
        scopeReferences: [{ id: 'psr-1', frameworkReferenceId: 'ref-1' }],
      };

      prisma.auditPlan.findFirst
        .mockResolvedValueOnce(existingPlan)
        .mockResolvedValueOnce({
          ...existingPlan,
          scopeReferences: [],
        });

      prisma.framework.findUnique.mockResolvedValue({ id: 'fw-iso', code: 'ISO27001' });
      prisma.frameworkVersion.findFirst.mockResolvedValue({ id: 'ver-2022', frameworkId: 'fw-iso' });
      prisma.auditPlan.update.mockResolvedValue(existingPlan);

      const result = await service.updatePlan(authCtx, 'plan-1', {
        frameworkReferenceIds: [],
      });

      expect(prisma.auditPlanFrameworkReference.deleteMany).toHaveBeenCalledWith({
        where: { auditPlanId: 'plan-1' },
      });
      expect(prisma.auditPlanFrameworkReference.createMany).not.toHaveBeenCalled();
      expect(result.scopeReferences).toHaveLength(0);
    });

    it('should preserve existing clauses when scope is unchanged and frameworkReferenceIds is omitted', async () => {
      const existingPlan = {
        id: 'plan-1',
        organizationId: 'org-1',
        title: 'Original Title',
        frameworkId: 'fw-iso',
        frameworkVersionId: 'ver-2022',
        frameworkCode: 'ISO27001',
        status: AuditPlanStatus.DRAFT,
        createdAt: new Date(),
        updatedAt: new Date(),
        scopeReferences: [{ id: 'psr-1', frameworkReferenceId: 'ref-1' }],
      };

      prisma.auditPlan.findFirst
        .mockResolvedValueOnce(existingPlan)
        .mockResolvedValueOnce({
          ...existingPlan,
          title: 'Renamed Title',
        });

      prisma.auditPlan.update.mockResolvedValue({
        ...existingPlan,
        title: 'Renamed Title',
      });

      const result = await service.updatePlan(authCtx, 'plan-1', {
        title: 'Renamed Title',
      });

      expect(prisma.auditPlan.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'plan-1' },
          data: expect.objectContaining({
            title: 'Renamed Title',
          }),
        }),
      );
      expect(prisma.auditPlanFrameworkReference.deleteMany).not.toHaveBeenCalled();
      expect(prisma.auditPlanFrameworkReference.createMany).not.toHaveBeenCalled();
      expect(result.title).toBe('Renamed Title');
    });

    it('should reject update if target audit plan belongs to another tenant', async () => {
      prisma.auditPlan.findFirst.mockResolvedValue(null);

      await expect(
        service.updatePlan(authCtx, 'foreign-plan-id', {
          title: 'Unauthorized Hack',
        }),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.auditPlan.update).not.toHaveBeenCalled();
    });

    it('should reject update if organization is not commercially entitled to framework', async () => {
      const existingPlan = {
        id: 'plan-1',
        organizationId: 'org-1',
        frameworkId: 'fw-iso',
      };
      prisma.auditPlan.findFirst.mockResolvedValue(existingPlan);
      prisma.framework.findUnique.mockResolvedValue({ id: 'fw-soc2', code: 'SOC2' });

      const mockEntitlements = {
        assertEntitled: jest.fn().mockRejectedValue(new ForbiddenException('Organization not entitled')),
      };
      const serviceWithEntitlements = new BusinessAuditsService(
        prisma,
        auditLogsService,
        notificationsService,
        resourceAuthService,
        mockEntitlements as any,
      );

      await expect(
        serviceWithEntitlements.updatePlan(authCtx, 'plan-1', {
          frameworkId: 'fw-soc2',
        }),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.auditPlan.update).not.toHaveBeenCalled();
    });

    it('should reject update and propagate error if transaction write fails', async () => {
      const existingPlan = {
        id: 'plan-1',
        organizationId: 'org-1',
        frameworkId: 'fw-iso',
      };
      prisma.auditPlan.findFirst.mockResolvedValue(existingPlan);
      prisma.framework.findUnique.mockResolvedValue({ id: 'fw-soc2', code: 'SOC2' });

      prisma.$transaction.mockImplementation(async (cb: any) => {
        throw new Error('Database transaction deadlocked or constraint failed');
      });

      await expect(
        service.updatePlan(authCtx, 'plan-1', {
          frameworkId: 'fw-soc2',
        }),
      ).rejects.toThrow('Database transaction deadlocked or constraint failed');
    });

    describe('Audit Plan Completion Eligibility', () => {
      it('should reject completion if audit plan is not IN_PROGRESS', async () => {
        const draftPlan = {
          id: 'plan-1',
          organizationId: 'org-1',
          status: AuditPlanStatus.DRAFT,
        };
        prisma.auditPlan.findFirst.mockResolvedValue(draftPlan);

        await expect(
          service.updatePlan(authCtx, 'plan-1', { status: AuditPlanStatus.COMPLETED }),
        ).rejects.toThrow('Audit status must be IN_PROGRESS');
      });

      it('should reject completion if framework is UNSPECIFIED', async () => {
        const unspecifiedPlan = {
          id: 'plan-1',
          organizationId: 'org-1',
          status: AuditPlanStatus.IN_PROGRESS,
          frameworkCode: 'UNSPECIFIED',
        };
        prisma.auditPlan.findFirst.mockResolvedValueOnce(unspecifiedPlan);

        await expect(
          service.updatePlan(authCtx, 'plan-1', { status: AuditPlanStatus.COMPLETED }),
        ).rejects.toThrow('Cannot complete audit plan with an UNSPECIFIED framework baseline.');
      });

      it('should reject completion if plan has no assessments', async () => {
        const inProgressPlan = {
          id: 'plan-1',
          organizationId: 'org-1',
          status: AuditPlanStatus.IN_PROGRESS,
        };
        // First findFirst for existence check
        prisma.auditPlan.findFirst
          .mockResolvedValueOnce(inProgressPlan)
          // Second findFirst for fullPlan check with empty assessments
          .mockResolvedValueOnce({
            ...inProgressPlan,
            assessments: [],
          });

        await expect(
          service.updatePlan(authCtx, 'plan-1', { status: AuditPlanStatus.COMPLETED }),
        ).rejects.toThrow('Cannot complete audit plan without at least one executed assessment run.');
      });

      it('should reject completion if assessment has no check items', async () => {
        const inProgressPlan = {
          id: 'plan-1',
          organizationId: 'org-1',
          status: AuditPlanStatus.IN_PROGRESS,
        };
        prisma.auditPlan.findFirst
          .mockResolvedValueOnce(inProgressPlan)
          .mockResolvedValueOnce({
            ...inProgressPlan,
            assessments: [{ id: 'ass-1', checkItems: [], findings: [] }],
          });

        await expect(
          service.updatePlan(authCtx, 'plan-1', { status: AuditPlanStatus.COMPLETED }),
        ).rejects.toThrow('Cannot complete audit plan without any evaluation checklist items.');
      });

      it('should reject completion if any checklist items are NOT_EVALUATED', async () => {
        const inProgressPlan = {
          id: 'plan-1',
          organizationId: 'org-1',
          status: AuditPlanStatus.IN_PROGRESS,
        };
        prisma.auditPlan.findFirst
          .mockResolvedValueOnce(inProgressPlan)
          .mockResolvedValueOnce({
            ...inProgressPlan,
            assessments: [
              {
                id: 'ass-1',
                checkItems: [
                  { id: 'ci-1', result: AuditCheckResult.COMPLIANT },
                  { id: 'ci-2', result: AuditCheckResult.NOT_EVALUATED },
                ],
                findings: [],
              },
            ],
          });

        await expect(
          service.updatePlan(authCtx, 'plan-1', { status: AuditPlanStatus.COMPLETED }),
        ).rejects.toThrow('1 checklist item(s) remain unevaluated');
      });

      it('should reject completion if any findings are OPEN or IN_REMEDIATION', async () => {
        const inProgressPlan = {
          id: 'plan-1',
          organizationId: 'org-1',
          status: AuditPlanStatus.IN_PROGRESS,
        };
        prisma.auditPlan.findFirst
          .mockResolvedValueOnce(inProgressPlan)
          .mockResolvedValueOnce({
            ...inProgressPlan,
            assessments: [
              {
                id: 'ass-1',
                checkItems: [{ id: 'ci-1', result: AuditCheckResult.NON_COMPLIANT }],
                findings: [
                  { id: 'f-1', status: FindingStatus.OPEN },
                ],
              },
            ],
          });

        await expect(
          service.updatePlan(authCtx, 'plan-1', { status: AuditPlanStatus.COMPLETED }),
        ).rejects.toThrow('1 finding(s) remain open or in remediation');
      });

      it('should successfully complete audit plan when all check items are evaluated and findings resolved', async () => {
        const inProgressPlan = {
          id: 'plan-1',
          organizationId: 'org-1',
          title: 'Q4 SOC2 Audit',
          status: AuditPlanStatus.IN_PROGRESS,
        };
        const fullPlan = {
          ...inProgressPlan,
          assessments: [
            {
              id: 'ass-1',
              status: AuditAssessmentStatus.IN_PROGRESS,
              checkItems: [
                { id: 'ci-1', result: AuditCheckResult.COMPLIANT },
                { id: 'ci-2', result: AuditCheckResult.NOT_APPLICABLE },
              ],
              findings: [
                { id: 'f-1', status: FindingStatus.VERIFIED },
              ],
            },
          ],
        };

        const completedPlan = {
          ...inProgressPlan,
          status: AuditPlanStatus.COMPLETED,
          completedAt: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
          schedules: [],
          assessments: fullPlan.assessments,
          scopeReferences: [],
        };

        prisma.auditPlan.findFirst
          .mockResolvedValueOnce(inProgressPlan)
          .mockResolvedValueOnce(fullPlan);

        prisma.auditPlan.update.mockResolvedValue(completedPlan);
        prisma.auditAssessment.updateMany.mockResolvedValue({ count: 1 });

        const result = await service.updatePlan(authCtx, 'plan-1', {
          status: AuditPlanStatus.COMPLETED,
        });

        expect(result.status).toBe(AuditPlanStatus.COMPLETED);
        expect(prisma.auditAssessment.updateMany).toHaveBeenCalledWith({
          where: {
            auditPlanId: 'plan-1',
            status: AuditAssessmentStatus.IN_PROGRESS,
          },
          data: expect.objectContaining({
            status: AuditAssessmentStatus.COMPLETED,
          }),
        });
        expect(auditLogsService.log).toHaveBeenCalledWith(
          expect.objectContaining({
            action: 'AUDIT_PLAN_COMPLETED',
            entityId: 'plan-1',
          }),
        );
      });
    });

    describe('Finding Status Transitions and Verification Gating', () => {
      it('should reject direct status update to VERIFIED or CLOSED via updateFindingStatus', async () => {
        const finding = {
          id: 'f-1',
          organizationId: 'org-1',
          status: FindingStatus.READY_FOR_VERIFICATION,
          assessment: {
            auditPlan: {
              organizationId: 'org-1',
            },
          },
        };
        prisma.auditFinding.findFirst.mockResolvedValue(finding);

        await expect(
          service.updateFindingStatus(authCtx, 'f-1', { status: FindingStatus.VERIFIED }),
        ).rejects.toThrow(BadRequestException);

        await expect(
          service.updateFindingStatus(authCtx, 'f-1', { status: FindingStatus.CLOSED }),
        ).rejects.toThrow(BadRequestException);
      });

      it('should allow formal verification via verifyFinding and record audit log', async () => {
        const finding = {
          id: 'f-1',
          organizationId: 'org-1',
          title: 'Unencrypted S3 Bucket',
          status: FindingStatus.READY_FOR_VERIFICATION,
          remediationPlan: 'Enable SSE-KMS',
          assessment: {
            auditPlan: {
              organizationId: 'org-1',
            },
          },
        };
        prisma.auditFinding.findFirst.mockResolvedValue(finding);
        prisma.auditFinding.update.mockResolvedValue({
          ...finding,
          status: FindingStatus.VERIFIED,
          verificationNotes: 'Verified KMS key policy and encryption enabled',
          verifiedById: authCtx.userId,
          verifiedAt: new Date(),
        });

        const result = await service.verifyFinding(
          authCtx,
          'f-1',
          FindingStatus.VERIFIED,
          'Verified KMS key policy and encryption enabled',
        );

        expect(result.status).toBe(FindingStatus.VERIFIED);
        expect(result.verificationNotes).toBe('Verified KMS key policy and encryption enabled');
        expect(auditLogsService.log).toHaveBeenCalledWith(
          expect.objectContaining({
            action: 'AUDIT_FINDING_VERIFIED',
            entityId: 'f-1',
          }),
        );
      });
    });

    describe('CAPA Creation and Lifecycle', () => {
      it('should create CAPA, advance OPEN finding to IN_REMEDIATION, and log audit event', async () => {
        const finding = {
          id: 'f-1',
          organizationId: 'org-1',
          status: FindingStatus.OPEN,
          assessment: {
            auditPlan: {
              organizationId: 'org-1',
            },
          },
        };
        prisma.auditFinding.findFirst.mockResolvedValue(finding);
        prisma.auditCapa.create.mockResolvedValue({
          id: 'capa-1',
          findingId: 'f-1',
          title: 'Implement Enforced TLS 1.3',
          correctiveAction: 'Update ALB listener policy',
          preventiveAction: 'Add Terraform guardrail',
          ownerId: 'user-1',
          status: CapaStatus.OPEN,
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        const result = await service.createCapa(authCtx, {
          findingId: 'f-1',
          title: 'Implement Enforced TLS 1.3',
          correctiveAction: 'Update ALB listener policy',
          preventiveAction: 'Add Terraform guardrail',
          ownerId: 'user-1',
        });

        expect(result.id).toBe('capa-1');
        // Verifies finding status was auto-advanced to IN_REMEDIATION
        expect(prisma.auditFinding.update).toHaveBeenCalledWith({
          where: { id: 'f-1' },
          data: { status: FindingStatus.IN_REMEDIATION },
        });
        expect(auditLogsService.log).toHaveBeenCalledWith(
          expect.objectContaining({
            action: 'AUDIT_CAPA_CREATED',
            entityId: 'capa-1',
          }),
        );
      });

      it('should update CAPA status and advance finding to READY_FOR_VERIFICATION when all CAPAs are COMPLETED', async () => {
        const mockCapa = {
          id: 'capa-1',
          findingId: 'f-1',
          status: CapaStatus.IN_PROGRESS,
          finding: {
            id: 'f-1',
            organizationId: 'org-1',
            status: FindingStatus.IN_REMEDIATION,
            assessment: {
              auditPlan: {
                organizationId: 'org-1',
              },
            },
          },
        };

        prisma.auditCapa.findFirst.mockResolvedValue(mockCapa);
        prisma.auditCapa.update.mockResolvedValue({
          ...mockCapa,
          status: CapaStatus.COMPLETED,
          completedAt: new Date(),
        });
        // count of open CAPAs for this finding returns 0 (all finished)
        prisma.auditCapa.count.mockResolvedValue(0);

        const result = await service.updateCapa(authCtx, 'capa-1', {
          status: CapaStatus.COMPLETED,
        });

        expect(result.status).toBe(CapaStatus.COMPLETED);
        expect(prisma.auditFinding.update).toHaveBeenCalledWith({
          where: { id: 'f-1' },
          data: { status: FindingStatus.READY_FOR_VERIFICATION },
        });
        expect(auditLogsService.log).toHaveBeenCalledWith(
          expect.objectContaining({
            action: 'AUDIT_CAPA_UPDATED',
            entityId: 'capa-1',
          }),
        );
      });
    });

    describe('Finding Retrieval and Tenant Scoping', () => {
      it('should query findings scoped to tenant and handle pagination', async () => {
        const mockFindings = [
          {
            id: 'f-1',
            organizationId: 'org-1',
            title: 'Missing MFA',
            severity: VulnerabilitySeverity.HIGH,
            status: FindingStatus.OPEN,
            assessment: { id: 'ass-1', title: 'Q1 Access Review', plan: { id: 'plan-1', title: 'SOC2 Plan' } },
            capas: [],
            evidence: [],
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ];

        prisma.auditFinding.findMany.mockResolvedValue(mockFindings);
        prisma.auditFinding.count.mockResolvedValue(1);

        const result = await service.findAllFindings(authCtx, {
          page: 1,
          limit: 10,
          status: FindingStatus.OPEN,
          severity: VulnerabilitySeverity.HIGH,
        });

        expect(result.total).toBe(1);
        expect(result.items.length).toBe(1);
        expect(prisma.auditFinding.findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: expect.objectContaining({
              organizationId: 'org-1',
              status: FindingStatus.OPEN,
              severity: VulnerabilitySeverity.HIGH,
            }),
          }),
        );
      });
    });

    describe('Audit Ownership Resolution & History Timeline', () => {
      it('should resolve human-readable user name and role for audit plan owner', async () => {
        const mockPlan = {
          id: 'plan-owner-1',
          organizationId: 'org-1',
          title: 'Owner Test Plan',
          ownerId: 'user-uuid-1',
          createdById: 'user-uuid-1',
          createdAt: new Date(),
          updatedAt: new Date(),
          departmentRef: { name: 'SecOps Team' },
        };

        prisma.auditPlan.findFirst.mockResolvedValue(mockPlan);
        prisma.user.findMany.mockResolvedValue([
          { id: 'user-uuid-1', name: 'Alice Auditor', email: 'alice@example.com', role: Role.ADMIN },
        ]);

        const planDto = await service.findOnePlan(authCtx, 'plan-owner-1');
        expect(planDto.ownerId).toBe('user-uuid-1');
        expect(planDto.ownerName).toBe('Alice Auditor');
        expect(planDto.ownerEmail).toBe('alice@example.com');
        expect(planDto.ownerRole).toBe(Role.ADMIN);
        expect(planDto.teamName).toBe('SecOps Team');
      });

      it('should enforce tenant isolation and not resolve user belonging to another organization', async () => {
        const mockPlan = {
          id: 'plan-owner-2',
          organizationId: 'org-1',
          title: 'Cross Tenant Owner Test',
          ownerId: 'other-org-user-uuid',
          createdById: 'user-uuid-1',
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        prisma.auditPlan.findFirst.mockResolvedValue(mockPlan);
        // prisma.user.findMany with organizationId: 'org-1' returns empty array because user is in org-2
        prisma.user.findMany.mockResolvedValue([]);

        const planDto = await service.findOnePlan(authCtx, 'plan-owner-2');
        expect(planDto.ownerId).toBe('other-org-user-uuid');
        expect(planDto.ownerName).toBeNull();
        expect(planDto.ownerEmail).toBeNull();
      });

      it('should retrieve audit lifecycle history timeline with resolved actor identities', async () => {
        const mockPlan = {
          id: 'plan-hist-1',
          organizationId: 'org-1',
          title: 'History Test Plan',
          ownerId: 'user-uuid-1',
          createdById: 'user-uuid-1',
          assessments: [
            {
              id: 'ass-1',
              findings: [{ id: 'find-1', capas: [{ id: 'capa-1' }] }],
            },
          ],
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        prisma.auditPlan.findFirst.mockResolvedValue(mockPlan);
        prisma.auditLogEntry = {
          findMany: jest.fn().mockResolvedValue([
            {
              id: 'log-1',
              action: 'AUDIT_PLAN_CREATED',
              entityType: 'AuditPlan',
              entityId: 'plan-hist-1',
              actorId: 'user-uuid-1',
              metadata: { title: 'History Test Plan' },
              createdAt: new Date('2026-10-18T10:00:00Z'),
            },
            {
              id: 'log-2',
              action: 'AUDIT_ASSESSMENT_STARTED',
              entityType: 'AuditAssessment',
              entityId: 'ass-1',
              actorId: 'user-uuid-2',
              metadata: { auditorId: 'user-uuid-2' },
              createdAt: new Date('2026-10-18T10:30:00Z'),
            },
          ]),
        };

        prisma.user.findMany.mockResolvedValue([
          { id: 'user-uuid-1', name: 'Alice Admin', email: 'alice@example.com' },
          { id: 'user-uuid-2', name: 'Bob Auditor', email: 'bob@example.com' },
        ]);

        const history = await service.getPlanHistory(authCtx, 'plan-hist-1');
        expect(history.length).toBe(2);
        expect(history[0].action).toBe('AUDIT_PLAN_CREATED');
        expect(history[0].actorName).toBe('Alice Admin');
        expect(history[1].action).toBe('AUDIT_ASSESSMENT_STARTED');
        expect(history[1].actorName).toBe('Bob Auditor');
      });
    });
  });
});
