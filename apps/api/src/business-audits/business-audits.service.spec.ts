import { Test, TestingModule } from '@nestjs/testing';
import { BusinessAuditsService } from './business-audits.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ResourceAuthorizationService } from '../auth/resource-authorization.service';
import { NotFoundException, BadRequestException, ConflictException, ForbiddenException, InternalServerErrorException } from '@nestjs/common';
import {
  ProductAccessStatus,
  AuditPlanStatus,
  AuditAssessmentStatus,
  AuditCheckResult,
  FindingStatus,
  CapaStatus,
  calculateAuditScore,
  VulnerabilitySeverity,
  Role,
  CapaApplicability,
  AuditFindingLifecycleAction,
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
        groupBy: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
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
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      auditCapa: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      auditFindingVerificationHistory: {
        create: jest.fn().mockResolvedValue({ id: 'hist-1' }),
        findMany: jest.fn().mockResolvedValue([]),
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
      evidence: {
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
      },
      auditCheckItemEvidence: {
        create: jest.fn().mockResolvedValue({}),
        deleteMany: jest.fn(),
      },
      auditFindingEvidence: {
        create: jest.fn().mockResolvedValue({}),
        deleteMany: jest.fn(),
      },
      organizationMembership: {
        findFirst: jest.fn().mockImplementation(({ where }) => {
          const rawId = where?.OR?.[0]?.userId || where?.userId || where?.OR?.[1]?.id;
          if (rawId === 'foreign-user' || rawId === 'non-existent' || rawId === 'user-org-2') {
            return null;
          }
          if (rawId === 'suspended-user') {
            return {
              id: 'mem-suspended',
              userId: 'suspended-user',
              organizationId: where?.organizationId || 'org-1',
              role: Role.ANALYST,
              status: ProductAccessStatus.SUSPENDED,
            };
          }
          if (rawId === 'external-auditor-1') {
            return {
              id: 'mem-auditor',
              userId: 'external-auditor-1',
              organizationId: where?.organizationId || 'org-1',
              role: Role.EXTERNAL_AUDITOR,
              status: ProductAccessStatus.ACTIVE,
            };
          }
          return {
            id: 'mem-default',
            userId: rawId || 'auditor-1',
            organizationId: where?.organizationId || 'org-1',
            role: Role.ADMIN,
            status: ProductAccessStatus.ACTIVE,
          };
        }),
        findUnique: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn(),
        update: jest.fn(),
      },
      user: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn(),
        findFirst: jest.fn().mockImplementation(({ where }) => {
          const rawId = where?.id;
          if (rawId === 'foreign-user' || rawId === 'user-org-2') {
            return { id: rawId, organizationId: 'org-2', role: Role.ADMIN };
          }
          if (rawId === 'non-existent') {
            return null;
          }
          return { id: rawId || 'auditor-1', organizationId: 'org-1', role: Role.ADMIN };
        }),
      },
      $transaction: jest.fn((cb) => cb(prisma)),
      $queryRaw: jest.fn().mockResolvedValue([{ id: 'finding-1' }]),
    };

    auditLogsService = {
      log: jest.fn().mockResolvedValue({}),
    };

    notificationsService = {
      notify: jest.fn().mockResolvedValue({}),
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
      ownerId: 'owner-user',
      status: FindingStatus.READY_FOR_VERIFICATION,
      remediationPlan: '[NO_CAPA_REQUIRED: Verified directly in staging configuration]',
      createdAt: new Date(),
      updatedAt: new Date(),
      capas: [],
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

    it('should calculate authoritative audit status summary metrics from db', async () => {
      const authCtx = { userId: 'admin-1', organizationId: 'org-1', role: Role.ADMIN };
      prisma.auditPlan.count.mockResolvedValue(5);
      prisma.auditPlan.groupBy.mockResolvedValue([
        { status: AuditPlanStatus.IN_PROGRESS, _count: 2 },
        { status: AuditPlanStatus.COMPLETED, _count: 2 },
        { status: AuditPlanStatus.PLANNED, _count: 1 },
      ]);
      prisma.auditFinding.count.mockResolvedValueOnce(14).mockResolvedValueOnce(3);
      prisma.auditCapa.count.mockResolvedValue(1);

      const summary = await service.getSummary(authCtx);

      expect(summary).toEqual({
        total: 5,
        inProgress: 2,
        completed: 2,
        planned: 1,
        draft: 0,
        archived: 0,
        findingsTotal: 14,
        findingsOpen: 3,
        capaOpen: 1,
      });
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
        expect(prisma.auditFinding.update).toHaveBeenCalledWith(
          expect.objectContaining({
            where: { id: 'f-1' },
            data: expect.objectContaining({ status: FindingStatus.IN_REMEDIATION }),
          }),
        );
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
        expect(prisma.auditFinding.update).toHaveBeenCalledWith(
          expect.objectContaining({
            where: { id: 'f-1' },
            data: expect.objectContaining({ status: FindingStatus.READY_FOR_VERIFICATION }),
          }),
        );
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

  describe('WP1: Evidence Architecture & Legacy Compatibility Suite', () => {
    const authCtx = { userId: 'user-1', organizationId: 'org-1', role: Role.ADMIN };

    it('addEvidence: creates legacy AuditEvidence record for backward compatibility', async () => {
      prisma.auditCheckItem.findFirst.mockResolvedValue({
        id: 'ci-100',
        organizationId: 'org-1',
        assessment: { auditPlan: { id: 'plan-1', organizationId: 'org-1' } },
      });
      prisma.auditEvidence.create.mockResolvedValue({
        id: 'ev-legacy-1',
        organizationId: 'org-1',
        checkItemId: 'ci-100',
        fileName: 'screenshot.png',
        fileUrl: 'https://vault.omnigrc.internal/screenshot.png',
        uploadedById: 'user-1',
      });

      const res = await service.addEvidence(authCtx, {
        checkItemId: 'ci-100',
        fileName: 'screenshot.png',
        fileUrl: 'https://vault.omnigrc.internal/screenshot.png',
      });

      expect(res.id).toBe('ev-legacy-1');
      expect(prisma.auditEvidence.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            organizationId: 'org-1',
            checkItemId: 'ci-100',
            fileName: 'screenshot.png',
            fileUrl: 'https://vault.omnigrc.internal/screenshot.png',
          }),
        }),
      );
    });

    it('addEvidence: links canonical Evidence record when evidenceId is provided', async () => {
      prisma.auditCheckItem.findFirst.mockResolvedValue({
        id: 'ci-100',
        organizationId: 'org-1',
        assessment: { auditPlan: { id: 'plan-1', organizationId: 'org-1' } },
      });
      prisma.evidence.findFirst.mockResolvedValue({
        id: 'can-ev-55',
        organizationId: 'org-1',
        fileName: 'mfa_report.pdf',
        deletedAt: null,
      });
      prisma.auditEvidence.create.mockResolvedValue({
        id: 'ev-legacy-2',
        organizationId: 'org-1',
        checkItemId: 'ci-100',
        fileName: 'mfa_report.pdf',
        fileUrl: '/evidence/can-ev-55/download',
      });

      const res = await service.addEvidence(authCtx, {
        checkItemId: 'ci-100',
        evidenceId: 'can-ev-55',
        fileName: 'mfa_report.pdf',
        fileUrl: '/evidence/can-ev-55/download',
      });

      expect(prisma.auditCheckItemEvidence.create).toHaveBeenCalledWith({
        data: {
          organizationId: 'org-1',
          checkItemId: 'ci-100',
          evidenceId: 'can-ev-55',
        },
      });
      // Issue A: Ensure NO duplicate shadow record is created in legacy auditEvidence
      expect(prisma.auditEvidence.create).not.toHaveBeenCalled();
      expect(res.id).toBe('can-ev-55');
      expect(res.fileUrl).toBe('/evidence/can-ev-55/download');
    });

    it('addEvidence: rejects foreign tenant evidenceId with NotFoundException', async () => {
      prisma.auditCheckItem.findFirst.mockResolvedValue({
        id: 'ci-100',
        organizationId: 'org-1',
        assessment: { auditPlan: { id: 'plan-1', organizationId: 'org-1' } },
      });
      prisma.evidence.findFirst.mockResolvedValue(null);

      await expect(
        service.addEvidence(authCtx, {
          checkItemId: 'ci-100',
          evidenceId: 'foreign-evidence-id',
          fileName: 'foreign.pdf',
          fileUrl: '',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('findOnePlan: seamlessly merges legacy evidence and canonical evidenceAssociations on check items', async () => {
      resourceAuthService.getScopeWhereClause.mockResolvedValue({ organizationId: 'org-1' });

      prisma.auditPlan.findFirst.mockResolvedValue({
        id: 'plan-merged-1',
        organizationId: 'org-1',
        title: 'Unified Evidence Audit Plan',
        ownerId: 'user-1',
        createdById: 'user-1',
        createdAt: new Date('2026-01-01T00:00:00Z'),
        updatedAt: new Date('2026-01-01T00:00:00Z'),
        assessments: [
          {
            id: 'ass-merged-1',
            organizationId: 'org-1',
            status: 'IN_PROGRESS',
            score: 100,
            startedAt: new Date(),
            createdAt: new Date(),
            updatedAt: new Date(),
            createdById: 'user-1',
            checkItems: [
              {
                id: 'ci-merged-1',
                organizationId: 'org-1',
                title: 'Firewall Rules Review',
                result: 'COMPLIANT',
                createdById: 'user-1',
                createdAt: new Date('2026-01-01T00:00:00Z'),
                updatedAt: new Date('2026-01-01T00:00:00Z'),
                // Legacy evidence record
                evidence: [
                  {
                    id: 'leg-ev-1',
                    organizationId: 'org-1',
                    checkItemId: 'ci-merged-1',
                    fileName: 'legacy_firewall_export.txt',
                    fileUrl: 'https://vault.omnigrc.internal/legacy_firewall_export.txt',
                    fileSize: 1024,
                    mimeType: 'text/plain',
                    uploadedById: 'user-1',
                    createdAt: new Date('2026-01-01T00:00:00Z'),
                  },
                ],
                // Canonical junction association
                evidenceAssociations: [
                  {
                    evidence: {
                      id: 'can-ev-1',
                      organizationId: 'org-1',
                      fileName: 'modern_firewall_config.json',
                      fileSize: 4096,
                      mimeType: 'application/json',
                      uploadedById: 'user-1',
                      createdAt: new Date('2026-02-01T00:00:00Z'),
                    },
                  },
                ],
              },
            ],
            findings: [],
          },
        ],
        frameworkRef: null,
        versionRef: null,
        departmentRef: null,
        scopeReferences: [],
      });

      const plan = await service.findOnePlan(authCtx, 'plan-merged-1');
      expect(plan).toBeDefined();
      const checkItem = plan.assessments![0].checkItems![0];
      expect(checkItem.evidence).toHaveLength(2);

      // Check legacy item
      expect(checkItem.evidence![0]).toEqual(
        expect.objectContaining({
          id: 'leg-ev-1',
          fileName: 'legacy_firewall_export.txt',
          fileUrl: 'https://vault.omnigrc.internal/legacy_firewall_export.txt',
        }),
      );

      // Check canonical item mapped into DTO format
      expect(checkItem.evidence![1]).toEqual(
        expect.objectContaining({
          id: 'can-ev-1',
          fileName: 'modern_firewall_config.json',
          fileUrl: '/evidence/can-ev-1/download',
          fileSize: 4096,
        }),
      );
    });

    it('findOnePlan: deduplicates when a legacy row references an attached canonical evidence record', async () => {
      resourceAuthService.getScopeWhereClause.mockResolvedValue({ organizationId: 'org-1' });

      prisma.auditPlan.findFirst.mockResolvedValue({
        id: 'plan-dup-1',
        organizationId: 'org-1',
        title: 'Deduplication Plan',
        ownerId: 'user-1',
        createdById: 'user-1',
        createdAt: new Date(),
        updatedAt: new Date(),
        assessments: [
          {
            id: 'ass-dup-1',
            organizationId: 'org-1',
            status: 'IN_PROGRESS',
            score: 100,
            startedAt: new Date(),
            createdAt: new Date(),
            updatedAt: new Date(),
            createdById: 'user-1',
            checkItems: [
              {
                id: 'ci-dup-1',
                organizationId: 'org-1',
                title: 'Check with Duplicate Legacy Pointer',
                result: 'COMPLIANT',
                createdById: 'user-1',
                createdAt: new Date(),
                updatedAt: new Date(),
                // Legacy shadow row referencing the same canonical ID in fileUrl
                evidence: [
                  {
                    id: 'leg-shadow-1',
                    organizationId: 'org-1',
                    checkItemId: 'ci-dup-1',
                    fileName: 'audit_proof.pdf',
                    fileUrl: '/evidence/can-ev-dup/download',
                    fileSize: 2048,
                    mimeType: 'application/pdf',
                    uploadedById: 'user-1',
                    createdAt: new Date(),
                  },
                ],
                evidenceAssociations: [
                  {
                    evidence: {
                      id: 'can-ev-dup',
                      organizationId: 'org-1',
                      fileName: 'audit_proof.pdf',
                      fileSize: 2048,
                      mimeType: 'application/pdf',
                      uploadedById: 'user-1',
                      createdAt: new Date(),
                    },
                  },
                ],
              },
            ],
            findings: [],
          },
        ],
        frameworkRef: null,
        versionRef: null,
        departmentRef: null,
        scopeReferences: [],
      });

      const plan = await service.findOnePlan(authCtx, 'plan-dup-1');
      const checkItem = plan.assessments![0].checkItems![0];
      // Canonical item takes precedence; legacy shadow row is suppressed
      expect(checkItem.evidence).toHaveLength(1);
      expect(checkItem.evidence![0].id).toBe('can-ev-dup');
    });
  });

  describe('WP2: Audit & Finding Lifecycle Integrity Suite', () => {
    const authCtx = { userId: 'admin-1', organizationId: 'org-1', role: Role.ADMIN };

    describe('WP2-A: Owner validation & tenant authorization', () => {
      it('rejects plan creation when ownerId does not exist', async () => {
        await expect(
          service.createPlan(authCtx, {
            title: 'Plan with bad owner',
            ownerId: 'non-existent',
          }),
        ).rejects.toThrow(BadRequestException);
      });

      it('rejects cross-tenant owner assignment on audit plan', async () => {
        await expect(
          service.createPlan(authCtx, {
            title: 'Plan with foreign owner',
            ownerId: 'foreign-user',
          }),
        ).rejects.toThrow(BadRequestException);
      });

      it('rejects suspended organization member for plan owner', async () => {
        await expect(
          service.createPlan(authCtx, {
            title: 'Plan with suspended owner',
            ownerId: 'suspended-user',
          }),
        ).rejects.toThrow(BadRequestException);
      });

      it('rejects external auditor attempting to be assigned as finding owner', async () => {
        prisma.auditAssessment.findFirst.mockResolvedValueOnce({
          id: 'assess-1',
          organizationId: 'org-1',
          auditPlan: { id: 'plan-1', organizationId: 'org-1' },
        });

        await expect(
          service.createFinding(authCtx, {
            assessmentId: 'assess-1',
            title: 'Config issue',
            severity: VulnerabilitySeverity.HIGH,
            ownerId: 'external-auditor-1',
          }),
        ).rejects.toThrow(BadRequestException);
      });

      it('rejects non-admin/mssp-admin user attempting verification', async () => {
        const analystCtx = { userId: 'analyst-1', organizationId: 'org-1', role: Role.ANALYST };
        prisma.organizationMembership.findFirst.mockResolvedValueOnce({
          id: 'mem-analyst',
          userId: 'analyst-1',
          organizationId: 'org-1',
          role: Role.ANALYST,
          status: ProductAccessStatus.ACTIVE,
        });

        await expect(
          service.verifyFinding(analystCtx, 'finding-1', FindingStatus.VERIFIED),
        ).rejects.toThrow(BadRequestException);
      });
    });

    describe('WP2-B: Finding lifecycle & transition integrity', () => {
      it('rejects direct jump from OPEN to CLOSED', async () => {
        prisma.auditFinding.findFirst.mockResolvedValueOnce({
          id: 'finding-open',
          organizationId: 'org-1',
          status: FindingStatus.OPEN,
          updatedAt: new Date(),
          assessment: { auditPlan: { id: 'plan-1', organizationId: 'org-1' } },
        });

        await expect(
          service.updateFindingStatus(authCtx, 'finding-open', {
            status: FindingStatus.CLOSED,
          }),
        ).rejects.toThrow(BadRequestException);
      });

      it('rejects direct jump from OPEN to READY_FOR_VERIFICATION', async () => {
        prisma.auditFinding.findFirst.mockResolvedValueOnce({
          id: 'finding-open',
          organizationId: 'org-1',
          status: FindingStatus.OPEN,
          updatedAt: new Date(),
          assessment: { auditPlan: { id: 'plan-1', organizationId: 'org-1' } },
        });

        await expect(
          service.updateFindingStatus(authCtx, 'finding-open', {
            status: FindingStatus.READY_FOR_VERIFICATION,
          }),
        ).rejects.toThrow(BadRequestException);
      });

      it('rejects setting VERIFIED or CLOSED via updateFindingStatus', async () => {
        prisma.auditFinding.findFirst.mockResolvedValueOnce({
          id: 'finding-remed',
          organizationId: 'org-1',
          status: FindingStatus.READY_FOR_VERIFICATION,
          updatedAt: new Date(),
          assessment: { auditPlan: { id: 'plan-1', organizationId: 'org-1' } },
        });

        await expect(
          service.updateFindingStatus(authCtx, 'finding-remed', {
            status: FindingStatus.VERIFIED,
          }),
        ).rejects.toThrow(BadRequestException);
      });

      describe('Controlled Reopening', () => {
        it('rejects reopening finding that is still in OPEN or IN_REMEDIATION status', async () => {
          prisma.auditFinding.findFirst.mockResolvedValueOnce({
            id: 'finding-open',
            organizationId: 'org-1',
            status: FindingStatus.OPEN,
            updatedAt: new Date(),
            assessment: { auditPlan: { id: 'plan-1', organizationId: 'org-1' } },
          });

          await expect(
            service.reopenFinding(authCtx, 'finding-open', {
              reason: 'Recheck required',
            }),
          ).rejects.toThrow(BadRequestException);
        });

        it('rejects reopening finding without justification reason', async () => {
          prisma.auditFinding.findFirst.mockResolvedValueOnce({
            id: 'finding-closed',
            organizationId: 'org-1',
            status: FindingStatus.CLOSED,
            updatedAt: new Date(),
            assessment: { auditPlan: { id: 'plan-1', organizationId: 'org-1' } },
          });

          await expect(
            service.reopenFinding(authCtx, 'finding-closed', {
              reason: '   ',
            }),
          ).rejects.toThrow(BadRequestException);
        });

        it('rejects unauthorized user attempting to reopen finding', async () => {
          const unauthorizedCtx = { userId: 'unauthorized-user', organizationId: 'org-1', role: Role.EXTERNAL_AUDITOR };
          prisma.auditFinding.findFirst.mockResolvedValueOnce({
            id: 'finding-closed',
            organizationId: 'org-1',
            ownerId: 'owner-user',
            status: FindingStatus.CLOSED,
            updatedAt: new Date(),
            assessment: {
              auditorId: 'auditor-user',
              auditPlan: {
                id: 'plan-1',
                organizationId: 'org-1',
                ownerId: 'plan-owner',
                schedules: [{ leadAuditorId: 'lead-auditor' }],
              },
            },
          });

          await expect(
            service.reopenFinding(unauthorizedCtx, 'finding-closed', {
              reason: 'Valid reason but unauthorized user',
            }),
          ).rejects.toThrow(ForbiddenException);
        });

        it('successfully reopens CLOSED finding to IN_REMEDIATION and records audit log', async () => {
          const findingDate = new Date();
          prisma.auditFinding.findFirst.mockResolvedValueOnce({
            id: 'finding-closed',
            organizationId: 'org-1',
            ownerId: 'owner-user',
            status: FindingStatus.CLOSED,
            verificationNotes: 'Initial verification approved by admin',
            updatedAt: findingDate,
            assessment: {
              auditPlan: {
                id: 'plan-1',
                organizationId: 'org-1',
                ownerId: 'admin-1',
              },
            },
          });

          prisma.auditFinding.update.mockResolvedValueOnce({
            id: 'finding-closed',
            organizationId: 'org-1',
            ownerId: 'owner-user',
            status: FindingStatus.IN_REMEDIATION,
            verificationNotes: 'Initial verification approved by admin\n[REOPENED ...]: Non-conformance reoccurred in production',
            createdAt: findingDate,
            updatedAt: new Date(),
            capas: [],
            evidence: [],
            evidenceAssociations: [],
          });

          const res = await service.reopenFinding(authCtx, 'finding-closed', {
            reason: 'Non-conformance reoccurred in production',
          });

          expect(res.status).toBe(FindingStatus.IN_REMEDIATION);
          expect(auditLogsService.log).toHaveBeenCalledWith(
            expect.objectContaining({ action: 'AUDIT_FINDING_REOPENED' }),
          );
        });
      });
    });

    describe('WP2-C: CAPA lifecycle integrity', () => {
      it('rejects finding creation when capaRequired is false without a rationale', async () => {
        prisma.auditAssessment.findFirst.mockResolvedValueOnce({
          id: 'assess-1',
          organizationId: 'org-1',
          auditPlan: { id: 'plan-1', organizationId: 'org-1' },
        });

        await expect(
          service.createFinding(authCtx, {
            assessmentId: 'assess-1',
            title: 'No CAPA finding without rationale',
            severity: VulnerabilitySeverity.LOW,
            ownerId: 'owner-1',
            capaRequired: false,
            capaRationale: '   ',
          }),
        ).rejects.toThrow(BadRequestException);
      });

      it('creates finding with capaRequired: false and extracts rationale in DTO', async () => {
        prisma.auditAssessment.findFirst.mockResolvedValueOnce({
          id: 'assess-1',
          organizationId: 'org-1',
          auditPlan: { id: 'plan-1', organizationId: 'org-1' },
        });

        prisma.auditFinding.create.mockResolvedValueOnce({
          id: 'finding-nocapa',
          organizationId: 'org-1',
          ownerId: 'owner-1',
          title: 'Config typo',
          severity: VulnerabilitySeverity.LOW,
          status: FindingStatus.OPEN,
          remediationPlan: '[NO_CAPA_REQUIRED: One-off typo resolved directly during audit]',
          createdAt: new Date(),
          updatedAt: new Date(),
          capas: [],
          evidence: [],
          evidenceAssociations: [],
        });

        const finding = await service.createFinding(authCtx, {
          assessmentId: 'assess-1',
          title: 'Config typo',
          severity: VulnerabilitySeverity.LOW,
          ownerId: 'owner-1',
          capaRequired: false,
          capaRationale: 'One-off typo resolved directly during audit',
        });

        expect(finding.capaRequired).toBe(false);
        expect(finding.capaRationale).toBe('One-off typo resolved directly during audit');
      });

      it('keeps finding IN_REMEDIATION when some CAPAs remain incomplete', async () => {
        prisma.auditCapa.findFirst.mockResolvedValueOnce({
          id: 'capa-1',
          findingId: 'finding-1',
          organizationId: 'org-1',
          updatedAt: new Date(),
          finding: {
            status: FindingStatus.IN_REMEDIATION,
            assessment: { auditPlan: { id: 'plan-1', organizationId: 'org-1' } },
          },
        });

        prisma.auditCapa.update.mockResolvedValueOnce({
          id: 'capa-1',
          findingId: 'finding-1',
          organizationId: 'org-1',
          status: CapaStatus.COMPLETED,
          ownerId: 'owner-1',
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        // 2 CAPAs exist for finding: capa-1 is COMPLETED, capa-2 is still OPEN
        prisma.auditCapa.findMany.mockResolvedValueOnce([
          { id: 'capa-1', status: CapaStatus.COMPLETED },
          { id: 'capa-2', status: CapaStatus.OPEN },
        ]);

        await service.updateCapa(authCtx, 'capa-1', { status: CapaStatus.COMPLETED });

        // Finding should NOT be promoted to READY_FOR_VERIFICATION
        expect(prisma.auditFinding.update).not.toHaveBeenCalledWith(
          expect.objectContaining({ data: { status: FindingStatus.READY_FOR_VERIFICATION } }),
        );
      });

      it('auto-advances finding to READY_FOR_VERIFICATION when all CAPAs reach COMPLETED', async () => {
        prisma.auditCapa.findFirst.mockResolvedValueOnce({
          id: 'capa-2',
          findingId: 'finding-1',
          organizationId: 'org-1',
          updatedAt: new Date(),
          finding: {
            status: FindingStatus.IN_REMEDIATION,
            assessment: { auditPlan: { id: 'plan-1', organizationId: 'org-1' } },
          },
        });

        prisma.auditCapa.update.mockResolvedValueOnce({
          id: 'capa-2',
          findingId: 'finding-1',
          organizationId: 'org-1',
          status: CapaStatus.COMPLETED,
          ownerId: 'owner-1',
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        // Both CAPAs now completed
        prisma.auditCapa.findMany.mockResolvedValueOnce([
          { id: 'capa-1', status: CapaStatus.COMPLETED },
          { id: 'capa-2', status: CapaStatus.COMPLETED },
        ]);

        await service.updateCapa(authCtx, 'capa-2', { status: CapaStatus.COMPLETED });

        expect(prisma.auditFinding.update).toHaveBeenCalledWith(
          expect.objectContaining({
            where: { id: 'finding-1' },
            data: expect.objectContaining({ status: FindingStatus.READY_FOR_VERIFICATION }),
          }),
        );
      });

      it('reverts finding to IN_REMEDIATION if a CAPA is reopened from COMPLETED to IN_PROGRESS', async () => {
        prisma.auditCapa.findFirst.mockResolvedValueOnce({
          id: 'capa-1',
          findingId: 'finding-1',
          organizationId: 'org-1',
          updatedAt: new Date(),
          finding: {
            status: FindingStatus.READY_FOR_VERIFICATION,
            assessment: { auditPlan: { id: 'plan-1', organizationId: 'org-1' } },
          },
        });

        prisma.auditCapa.update.mockResolvedValueOnce({
          id: 'capa-1',
          findingId: 'finding-1',
          organizationId: 'org-1',
          status: CapaStatus.IN_PROGRESS,
          ownerId: 'owner-1',
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        prisma.auditCapa.findMany.mockResolvedValueOnce([
          { id: 'capa-1', status: CapaStatus.IN_PROGRESS },
          { id: 'capa-2', status: CapaStatus.COMPLETED },
        ]);

        await service.updateCapa(authCtx, 'capa-1', { status: CapaStatus.IN_PROGRESS });

        expect(prisma.auditFinding.update).toHaveBeenCalledWith(
          expect.objectContaining({
            where: { id: 'finding-1' },
            data: expect.objectContaining({ status: FindingStatus.IN_REMEDIATION }),
          }),
        );
      });
    });

    describe('WP2-D: Effectiveness verification & reviewer authorization', () => {
      it('rejects finding owner self-verifying their finding (Segregation of Duties)', async () => {
        prisma.auditFinding.findFirst.mockResolvedValueOnce({
          id: 'finding-1',
          organizationId: 'org-1',
          ownerId: 'admin-1', // same as authCtx.userId
          status: FindingStatus.READY_FOR_VERIFICATION,
          remediationPlan: '[NO_CAPA_REQUIRED: Done]',
          updatedAt: new Date(),
          capas: [],
          assessment: { auditPlan: { id: 'plan-1', organizationId: 'org-1' } },
        });

        await expect(
          service.verifyFinding(authCtx, 'finding-1', FindingStatus.VERIFIED),
        ).rejects.toThrow(ForbiddenException);
      });

      it('rejects CAPA owner verifying finding (Segregation of Duties)', async () => {
        prisma.auditFinding.findFirst.mockResolvedValueOnce({
          id: 'finding-1',
          organizationId: 'org-1',
          ownerId: 'user-other',
          status: FindingStatus.READY_FOR_VERIFICATION,
          remediationPlan: '[NO_CAPA_REQUIRED: Done]',
          updatedAt: new Date(),
          capas: [{ id: 'capa-1', ownerId: 'admin-1' }], // admin-1 owns this CAPA
          assessment: { auditPlan: { id: 'plan-1', organizationId: 'org-1' } },
        });

        await expect(
          service.verifyFinding(authCtx, 'finding-1', FindingStatus.VERIFIED),
        ).rejects.toThrow(ForbiddenException);
      });

      it('rejects verification failure attempt without explanatory notes', async () => {
        prisma.auditFinding.findFirst.mockResolvedValueOnce({
          id: 'finding-1',
          organizationId: 'org-1',
          ownerId: 'user-other',
          status: FindingStatus.READY_FOR_VERIFICATION,
          updatedAt: new Date(),
          capas: [],
          assessment: { auditPlan: { id: 'plan-1', organizationId: 'org-1' } },
        });

        await expect(
          service.verifyFinding(authCtx, 'finding-1', {
            status: FindingStatus.IN_REMEDIATION,
            verificationNotes: '   ',
          }),
        ).rejects.toThrow(BadRequestException);
      });

      it('handles verification failure: reverts finding to IN_REMEDIATION and logs AUDIT_FINDING_VERIFICATION_FAILED', async () => {
        const findingDate = new Date();
        prisma.auditFinding.findFirst.mockResolvedValueOnce({
          id: 'finding-1',
          organizationId: 'org-1',
          ownerId: 'user-other',
          status: FindingStatus.READY_FOR_VERIFICATION,
          updatedAt: findingDate,
          capas: [],
          assessment: { auditPlan: { id: 'plan-1', organizationId: 'org-1' } },
        });

        prisma.auditFinding.update.mockResolvedValueOnce({
          id: 'finding-1',
          organizationId: 'org-1',
          ownerId: 'user-other',
          status: FindingStatus.IN_REMEDIATION,
          verificationNotes: '[VERIFICATION REJECTED]: Controls testing demonstrated firewall port 22 still exposed',
          createdAt: findingDate,
          updatedAt: new Date(),
          capas: [],
          evidence: [],
          evidenceAssociations: [],
        });

        const res = await service.verifyFinding(authCtx, 'finding-1', {
          status: FindingStatus.IN_REMEDIATION,
          verificationNotes: 'Controls testing demonstrated firewall port 22 still exposed',
        });

        expect(res.status).toBe(FindingStatus.IN_REMEDIATION);
        expect(auditLogsService.log).toHaveBeenCalledWith(
          expect.objectContaining({ action: 'AUDIT_FINDING_VERIFICATION_FAILED' }),
        );
      });
    });

    describe('WP2-E: Optimistic concurrency & stale-update protection', () => {
      it('throws 409 ConflictException when updating audit plan with stale timestamp', async () => {
        const serverDate = new Date('2026-11-01T12:00:00Z');
        prisma.auditPlan.findFirst.mockResolvedValueOnce({
          id: 'plan-1',
          organizationId: 'org-1',
          updatedAt: serverDate,
          scopeReferences: [],
        });

        await expect(
          service.updatePlan(authCtx, 'plan-1', {
            title: 'Concurrent update',
            expectedUpdatedAt: '2026-11-01T11:00:00Z',
          }),
        ).rejects.toThrow(ConflictException);
      });

      it('throws 409 ConflictException when updating finding with stale timestamp', async () => {
        const serverDate = new Date('2026-11-01T14:30:00Z');
        prisma.auditFinding.findFirst.mockResolvedValueOnce({
          id: 'finding-1',
          organizationId: 'org-1',
          updatedAt: serverDate,
          status: FindingStatus.IN_REMEDIATION,
          assessment: { auditPlan: { id: 'plan-1', organizationId: 'org-1' } },
        });

        await expect(
          service.updateFindingStatus(authCtx, 'finding-1', {
            title: 'Stale title update',
            expectedUpdatedAt: '2026-11-01T14:00:00Z',
          }),
        ).rejects.toThrow(ConflictException);
      });

      it('throws 409 ConflictException when verifying finding with stale timestamp', async () => {
        const serverDate = new Date('2026-11-01T15:00:00Z');
        prisma.auditFinding.findFirst.mockResolvedValueOnce({
          id: 'finding-1',
          organizationId: 'org-1',
          ownerId: 'user-other',
          status: FindingStatus.READY_FOR_VERIFICATION,
          remediationPlan: '[NO_CAPA_REQUIRED: Checked]',
          updatedAt: serverDate,
          capas: [],
          assessment: { auditPlan: { id: 'plan-1', organizationId: 'org-1' } },
        });

        await expect(
          service.verifyFinding(authCtx, 'finding-1', {
            status: FindingStatus.VERIFIED,
            expectedUpdatedAt: '2026-11-01T14:59:00Z',
          }),
        ).rejects.toThrow(ConflictException);
      });

      it('throws 409 ConflictException when updating CAPA with stale timestamp', async () => {
        const serverDate = new Date('2026-11-01T16:00:00Z');
        prisma.auditCapa.findFirst.mockResolvedValueOnce({
          id: 'capa-1',
          organizationId: 'org-1',
          updatedAt: serverDate,
          finding: { assessment: { auditPlan: { id: 'plan-1', organizationId: 'org-1' } } },
        });

        await expect(
          service.updateCapa(authCtx, 'capa-1', {
            status: CapaStatus.COMPLETED,
            expectedUpdatedAt: '2026-11-01T15:30:00Z',
          }),
        ).rejects.toThrow(ConflictException);
      });
    });
  });

    describe('WP2 Hardening: CAPA Applicability normalized enums & legacy UNASSESSED compatibility', () => {
      const authCtx = {
        organizationId: 'org-1',
        userId: 'auditor-1',
        role: Role.ADMIN,
      };

      it('preserves legacy UNASSESSED finding and blocks advance to READY_FOR_VERIFICATION without CAPA or rationale', async () => {
        prisma.auditFinding.findFirst.mockResolvedValueOnce({
          id: 'legacy-finding-1',
          organizationId: 'org-1',
          status: FindingStatus.IN_REMEDIATION,
          ownerId: 'owner-1',
          capaApplicability: CapaApplicability.UNASSESSED,
          remediationPlan: 'Standard patch maintenance plan',
          updatedAt: new Date(),
          assessment: { auditPlan: { id: 'plan-1', organizationId: 'org-1' } },
        });
        prisma.auditCapa.findMany.mockResolvedValueOnce([]);

        await expect(
          service.updateFindingStatus(authCtx, 'legacy-finding-1', { status: FindingStatus.READY_FOR_VERIFICATION }),
        ).rejects.toThrow(BadRequestException);
      });

      it('allows advancing legacy finding when documented rationale exists via NOT_REQUIRED', async () => {
        prisma.auditFinding.findFirst.mockResolvedValueOnce({
          id: 'finding-with-rationale',
          organizationId: 'org-1',
          status: FindingStatus.IN_REMEDIATION,
          ownerId: 'owner-1',
          capaApplicability: CapaApplicability.NOT_REQUIRED,
          capaRationale: 'Vendor hotfix applied; no further CAPA required',
          remediationPlan: 'Apply vendor patch',
          updatedAt: new Date(),
          assessment: { auditPlan: { id: 'plan-1', organizationId: 'org-1' } },
        });
        prisma.auditCapa.findMany.mockResolvedValueOnce([]);
        prisma.auditFinding.update.mockResolvedValueOnce({
          id: 'finding-with-rationale',
          organizationId: 'org-1',
          status: FindingStatus.READY_FOR_VERIFICATION,
          ownerId: 'owner-1',
          capaApplicability: CapaApplicability.NOT_REQUIRED,
          capaRationale: 'Vendor hotfix applied; no further CAPA required',
          remediationPlan: 'Apply vendor patch',
          version: 2,
          updatedAt: new Date(),
        });

        const result = await service.updateFindingStatus(authCtx, 'finding-with-rationale', {
          status: FindingStatus.READY_FOR_VERIFICATION,
        });

        expect(result.status).toBe(FindingStatus.READY_FOR_VERIFICATION);
        expect(result.capaApplicability).toBe(CapaApplicability.NOT_REQUIRED);
      });

      it('extracts legacy [NO_CAPA_REQUIRED: ...] tags in mapFindingToDto without corrupting remediationPlan', async () => {
        prisma.auditFinding.findFirst.mockResolvedValueOnce({
          id: 'legacy-tagged-finding',
          organizationId: 'org-1',
          status: FindingStatus.OPEN,
          ownerId: 'owner-1',
          capaApplicability: CapaApplicability.UNASSESSED,
          remediationPlan: '[NO_CAPA_REQUIRED: Direct configuration change suffices] Configure TLS 1.3',
          updatedAt: new Date(),
          assessment: { auditPlan: { id: 'plan-1', organizationId: 'org-1' } },
        });
        prisma.auditFinding.update.mockResolvedValueOnce({
          id: 'legacy-tagged-finding',
          organizationId: 'org-1',
          status: FindingStatus.IN_REMEDIATION,
          ownerId: 'owner-1',
          capaApplicability: CapaApplicability.UNASSESSED,
          remediationPlan: '[NO_CAPA_REQUIRED: Direct configuration change suffices] Configure TLS 1.3',
          version: 2,
          updatedAt: new Date(),
        });

        const result = await service.updateFindingStatus(authCtx, 'legacy-tagged-finding', {
          status: FindingStatus.IN_REMEDIATION,
        });

        expect(result.capaApplicability).toBe(CapaApplicability.NOT_REQUIRED);
        expect(result.capaRationale).toBe('Direct configuration change suffices');
        expect(result.remediationPlan).toBe('Configure TLS 1.3');
      });
    });

    describe('WP2 Hardening: Atomic Concurrency with version token & STALE_RECORD_CONFLICT', () => {
      const authCtx = {
        organizationId: 'org-1',
        userId: 'admin-1',
        role: Role.ADMIN,
      };

      it('throws 409 ConflictException when updating AuditPlan with mismatched expectedVersion', async () => {
        prisma.auditPlan.findFirst.mockResolvedValueOnce({
          id: 'plan-ver-1',
          organizationId: 'org-1',
          version: 3,
          updatedAt: new Date(),
        });

        await expect(
          service.updatePlan(authCtx, 'plan-ver-1', {
            title: 'Concurrent Plan Title',
            expectedVersion: 2,
          }),
        ).rejects.toMatchObject({
          status: 409,
          response: expect.objectContaining({
            code: 'STALE_RECORD_CONFLICT',
          }),
        });
      });

      it('throws 409 ConflictException when updating AuditFinding with mismatched expectedVersion', async () => {
        prisma.auditFinding.findFirst.mockResolvedValueOnce({
          id: 'finding-ver-1',
          organizationId: 'org-1',
          version: 5,
          status: FindingStatus.IN_REMEDIATION,
          ownerId: 'owner-1',
          updatedAt: new Date(),
          assessment: { auditPlan: { id: 'plan-1', organizationId: 'org-1' } },
        });

        await expect(
          service.updateFindingStatus(authCtx, 'finding-ver-1', {
            title: 'Concurrent Finding Title',
            expectedVersion: 4,
          }),
        ).rejects.toMatchObject({
          status: 409,
          response: expect.objectContaining({
            code: 'STALE_RECORD_CONFLICT',
          }),
        });
      });

      it('throws 409 ConflictException when verifying AuditFinding with mismatched expectedVersion', async () => {
        prisma.auditFinding.findFirst.mockResolvedValueOnce({
          id: 'finding-verify-stale',
          organizationId: 'org-1',
          version: 2,
          status: FindingStatus.READY_FOR_VERIFICATION,
          ownerId: 'user-owner',
          updatedAt: new Date(),
          assessment: { auditPlan: { id: 'plan-1', organizationId: 'org-1' } },
        });

        await expect(
          service.verifyFinding(authCtx, 'finding-verify-stale', {
            status: FindingStatus.VERIFIED,
            verificationNotes: 'Looks good',
            expectedVersion: 1,
          }),
        ).rejects.toMatchObject({
          status: 409,
          response: expect.objectContaining({
            code: 'STALE_RECORD_CONFLICT',
          }),
        });
      });

      it('throws 409 ConflictException when reopening AuditFinding with mismatched expectedVersion', async () => {
        prisma.auditFinding.findFirst.mockResolvedValueOnce({
          id: 'finding-reopen-stale',
          organizationId: 'org-1',
          version: 4,
          status: FindingStatus.VERIFIED,
          ownerId: 'user-owner',
          updatedAt: new Date(),
          assessment: { auditPlan: { id: 'plan-1', organizationId: 'org-1' } },
        });

        await expect(
          service.reopenFinding(authCtx, 'finding-reopen-stale', {
            reason: 'Defect recurred in production',
            expectedVersion: 3,
          }),
        ).rejects.toMatchObject({
          status: 409,
          response: expect.objectContaining({
            code: 'STALE_RECORD_CONFLICT',
          }),
        });
      });

      it('throws 409 ConflictException when updating AuditCapa with mismatched expectedVersion', async () => {
        prisma.auditCapa.findFirst.mockResolvedValueOnce({
          id: 'capa-ver-stale',
          organizationId: 'org-1',
          version: 2,
          updatedAt: new Date(),
          finding: { assessment: { auditPlan: { id: 'plan-1', organizationId: 'org-1' } } },
        });

        await expect(
          service.updateCapa(authCtx, 'capa-ver-stale', {
            title: 'Updated Capa',
            expectedVersion: 1,
          }),
        ).rejects.toMatchObject({
          status: 409,
          response: expect.objectContaining({
            code: 'STALE_RECORD_CONFLICT',
          }),
        });
      });
    });

    describe('WP2 Hardening: Relational Verification History & Attribution', () => {
      const authCtx = {
        organizationId: 'org-1',
        userId: 'auditor-lead-1',
        role: Role.ADMIN,
      };

      it('records VERIFICATION_PASSED in relational verification history upon successful verification', async () => {
        prisma.auditFinding.findFirst.mockResolvedValueOnce({
          id: 'finding-hist-pass',
          organizationId: 'org-1',
          status: FindingStatus.READY_FOR_VERIFICATION,
          ownerId: 'other-owner',
          capaApplicability: CapaApplicability.NOT_REQUIRED,
          capaRationale: 'No remediation needed',
          updatedAt: new Date(),
          assessment: { auditPlan: { id: 'plan-1', organizationId: 'org-1' } },
        });
        prisma.auditFinding.update.mockResolvedValueOnce({
          id: 'finding-hist-pass',
          organizationId: 'org-1',
          status: FindingStatus.VERIFIED,
          ownerId: 'other-owner',
          verifiedById: authCtx.userId,
          verifiedAt: new Date(),
          verificationNotes: 'All checks passed',
          version: 2,
          updatedAt: new Date(),
        });

        await service.verifyFinding(authCtx, 'finding-hist-pass', {
          status: FindingStatus.VERIFIED,
          verificationNotes: 'All checks passed',
        });

        expect(prisma.auditFindingVerificationHistory.create).toHaveBeenCalledWith({
          data: expect.objectContaining({
            organizationId: 'org-1',
            findingId: 'finding-hist-pass',
            action: AuditFindingLifecycleAction.VERIFICATION_PASSED,
            priorStatus: FindingStatus.READY_FOR_VERIFICATION,
            newStatus: FindingStatus.VERIFIED,
            actorId: authCtx.userId,
            notes: 'All checks passed',
          }),
        });
      });

      it('records VERIFICATION_REJECTED in relational verification history upon rejection', async () => {
        prisma.auditFinding.findFirst.mockResolvedValueOnce({
          id: 'finding-hist-reject',
          organizationId: 'org-1',
          status: FindingStatus.READY_FOR_VERIFICATION,
          ownerId: 'other-owner',
          updatedAt: new Date(),
          assessment: { auditPlan: { id: 'plan-1', organizationId: 'org-1' } },
        });
        prisma.auditFinding.update.mockResolvedValueOnce({
          id: 'finding-hist-reject',
          organizationId: 'org-1',
          status: FindingStatus.IN_REMEDIATION,
          ownerId: 'other-owner',
          verificationNotes: 'Policy check failed',
          version: 2,
          updatedAt: new Date(),
        });

        await service.verifyFinding(authCtx, 'finding-hist-reject', {
          status: FindingStatus.IN_REMEDIATION,
          verificationNotes: 'Policy check failed',
        });

        expect(prisma.auditFindingVerificationHistory.create).toHaveBeenCalledWith({
          data: expect.objectContaining({
            organizationId: 'org-1',
            findingId: 'finding-hist-reject',
            action: AuditFindingLifecycleAction.VERIFICATION_REJECTED,
            priorStatus: FindingStatus.READY_FOR_VERIFICATION,
            newStatus: FindingStatus.IN_REMEDIATION,
            actorId: authCtx.userId,
            notes: 'Policy check failed',
          }),
        });
      });

      it('records FINDING_REOPENED in relational verification history upon reopening', async () => {
        prisma.auditFinding.findFirst.mockResolvedValueOnce({
          id: 'finding-hist-reopen',
          organizationId: 'org-1',
          status: FindingStatus.VERIFIED,
          ownerId: 'other-owner',
          updatedAt: new Date(),
          assessment: { auditorId: authCtx.userId, auditPlan: { id: 'plan-1', organizationId: 'org-1' } },
        });
        prisma.auditFinding.update.mockResolvedValueOnce({
          id: 'finding-hist-reopen',
          organizationId: 'org-1',
          status: FindingStatus.IN_REMEDIATION,
          ownerId: 'other-owner',
          version: 3,
          updatedAt: new Date(),
        });

        await service.reopenFinding(authCtx, 'finding-hist-reopen', {
          reason: 'Security control regressed after deployment',
        });

        expect(prisma.auditFindingVerificationHistory.create).toHaveBeenCalledWith({
          data: expect.objectContaining({
            organizationId: 'org-1',
            findingId: 'finding-hist-reopen',
            action: AuditFindingLifecycleAction.FINDING_REOPENED,
            priorStatus: FindingStatus.VERIFIED,
            newStatus: FindingStatus.IN_REMEDIATION,
            actorId: authCtx.userId,
            reason: 'Security control regressed after deployment',
          }),
        });
      });
    });

    describe('WP2 Targeted Concurrency & Transactional History Remediation Suite', () => {
      const authCtx = {
        userId: 'auditor-verifier-1',
        organizationId: 'org-1',
        role: Role.ADMIN,
      };

      describe('Genuinely Atomic Optimistic Locking & CAS', () => {
        it('two concurrent updates using same expectedVersion: exactly one succeeds, the other receives 409', async () => {
          const findingBase = {
            id: 'finding-cas-1',
            organizationId: 'org-1',
            version: 3,
            status: FindingStatus.OPEN,
            ownerId: 'owner-1',
            updatedAt: new Date('2026-11-01T12:00:00Z'),
            assessment: { auditPlan: { id: 'plan-1', organizationId: 'org-1' } },
            capas: [],
            evidence: [],
            evidenceAssociations: [],
          };

          prisma.auditFinding.findFirst.mockResolvedValue(findingBase);

          // Update 1: matches version 3, updates 1 row
          prisma.auditFinding.updateMany.mockResolvedValueOnce({ count: 1 });
          prisma.auditFinding.update.mockResolvedValueOnce({
            ...findingBase,
            title: 'Updated by Worker 1',
            version: 4,
          });

          const result1 = await service.updateFindingStatus(authCtx, 'finding-cas-1', {
            title: 'Updated by Worker 1',
            expectedVersion: 3,
          });
          expect(result1.title).toBe('Updated by Worker 1');

          // Update 2: concurrent call with expectedVersion 3 fails because database version was bumped to 4 (updateMany returns count: 0)
          prisma.auditFinding.updateMany.mockResolvedValueOnce({ count: 0 });
          // findFirst finds existing record at version 4
          prisma.auditFinding.findFirst.mockResolvedValueOnce({ ...findingBase, version: 4 });

          await expect(
            service.updateFindingStatus(authCtx, 'finding-cas-1', {
              title: 'Updated by Worker 2',
              expectedVersion: 3,
            }),
          ).rejects.toMatchObject({
            status: 409,
            response: expect.objectContaining({
              code: 'STALE_RECORD_CONFLICT',
            }),
          });
        });

        it('omitted expectedVersion binds to transaction read-version (safe compatibility policy)', async () => {
          const planBase = {
            id: 'plan-compat-1',
            organizationId: 'org-1',
            version: 5,
            status: AuditPlanStatus.IN_PROGRESS,
            ownerId: 'owner-1',
            createdById: 'owner-1',
            createdAt: new Date(),
            updatedAt: new Date(),
            title: 'Audit Plan Compat',
            scopeReferences: [],
          };

          prisma.auditPlan.findFirst.mockResolvedValueOnce(planBase);
          prisma.auditPlan.updateMany.mockResolvedValueOnce({ count: 1 });
          prisma.auditPlan.update.mockResolvedValueOnce({
            ...planBase,
            title: 'Audit Plan Compat Updated',
            version: 6,
          });
          prisma.auditPlan.findFirst.mockResolvedValueOnce({
            ...planBase,
            title: 'Audit Plan Compat Updated',
            version: 6,
          });

          // Call without expectedVersion or expectedUpdatedAt
          const result = await service.updatePlan(authCtx, 'plan-compat-1', {
            title: 'Audit Plan Compat Updated',
          });

          expect(result.title).toBe('Audit Plan Compat Updated');
          expect(prisma.auditPlan.updateMany).toHaveBeenCalledWith(
            expect.objectContaining({
              where: {
                id: 'plan-compat-1',
                organizationId: 'org-1',
                version: 5, // Pinned to the version read at start of transaction!
              },
              data: expect.objectContaining({
                version: { increment: 1 },
              }),
            }),
          );
        });

        it('omitted expectedVersion fails with 409 STALE_RECORD_CONFLICT if concurrent transaction modified version between read and CAS', async () => {
          const findingBase = {
            id: 'finding-stale-blind',
            organizationId: 'org-1',
            version: 2,
            status: FindingStatus.OPEN,
            ownerId: 'owner-1',
            updatedAt: new Date(),
            assessment: { auditPlan: { id: 'plan-1', organizationId: 'org-1' } },
            capas: [],
            evidence: [],
            evidenceAssociations: [],
          };

          prisma.auditFinding.findFirst.mockResolvedValueOnce(findingBase);
          // Between findFirst and updateMany, another process committed, causing count: 0
          prisma.auditFinding.updateMany.mockResolvedValueOnce({ count: 0 });
          prisma.auditFinding.findFirst.mockResolvedValueOnce({ ...findingBase, version: 3 });

          await expect(
            service.updateFindingStatus(authCtx, 'finding-stale-blind', {
              title: 'Concurrent update without explicit version token',
            }),
          ).rejects.toMatchObject({
            status: 409,
            response: expect.objectContaining({ code: 'STALE_RECORD_CONFLICT' }),
          });
        });

        it('zero-row conditional update throws 404 NotFoundException when entity does not exist in tenant', async () => {
          prisma.auditFinding.findFirst.mockResolvedValueOnce({
            id: 'f-ghost',
            organizationId: 'org-1',
            version: 1,
            status: FindingStatus.OPEN,
            ownerId: 'owner-1',
            updatedAt: new Date(),
            assessment: { auditPlan: { id: 'plan-1', organizationId: 'org-1' } },
            capas: [],
            evidence: [],
            evidenceAssociations: [],
          });
          prisma.auditFinding.updateMany.mockResolvedValueOnce({ count: 0 });
          // In tx, existence check returns null (e.g. record deleted or belonging to other tenant)
          prisma.auditFinding.findFirst.mockResolvedValueOnce(null);

          await expect(
            service.updateFindingStatus(authCtx, 'f-ghost', {
              title: 'Ghost record',
              expectedVersion: 1,
            }),
          ).rejects.toBeInstanceOf(NotFoundException);
        });
      });

      describe('Transactional Lifecycle State & History Writes', () => {
        it('history insertion failure rolls back state change (unswallowed exception)', async () => {
          const findingToVerify = {
            id: 'finding-tx-rollback',
            organizationId: 'org-1',
            version: 2,
            status: FindingStatus.READY_FOR_VERIFICATION,
            ownerId: 'different-owner',
            updatedAt: new Date(),
            capas: [{ id: 'c-1', status: CapaStatus.COMPLETED, ownerId: 'capa-owner' }],
            assessment: { auditorId: authCtx.userId, auditPlan: { id: 'p-1', organizationId: 'org-1' } },
          };

          prisma.auditFinding.findFirst.mockResolvedValue(findingToVerify);
          prisma.auditFinding.updateMany.mockResolvedValueOnce({ count: 1 });
          prisma.auditFinding.update.mockResolvedValueOnce({
            ...findingToVerify,
            status: FindingStatus.VERIFIED,
            version: 3,
          });

          // History insertion fails (e.g. DB constraint or serialization failure)
          prisma.auditFindingVerificationHistory.create.mockRejectedValueOnce(
            new Error('Database foreign key or disk error during verification history insert'),
          );

          await expect(
            service.verifyFinding(authCtx, 'finding-tx-rollback', {
              status: FindingStatus.VERIFIED,
              verificationNotes: 'Testing transactional rollback',
              expectedVersion: 2,
            }),
          ).rejects.toThrow('Database foreign key or disk error during verification history insert');
        });

        it('derives actorId and organizationId strictly from authenticated context, ignoring request body', async () => {
          const findingToVerify = {
            id: 'finding-spoof-check',
            organizationId: 'org-1',
            version: 1,
            status: FindingStatus.READY_FOR_VERIFICATION,
            ownerId: 'target-owner',
            updatedAt: new Date(),
            capas: [{ id: 'c-1', status: CapaStatus.COMPLETED, ownerId: 'capa-owner' }],
            assessment: { auditorId: authCtx.userId, auditPlan: { id: 'p-1', organizationId: 'org-1' } },
          };

          prisma.auditFinding.findFirst.mockResolvedValue(findingToVerify);
          prisma.auditFinding.updateMany.mockResolvedValueOnce({ count: 1 });
          prisma.auditFinding.update.mockResolvedValueOnce({
            ...findingToVerify,
            status: FindingStatus.VERIFIED,
            version: 2,
          });

          await service.verifyFinding(authCtx, 'finding-spoof-check', {
            status: FindingStatus.VERIFIED,
            verificationNotes: 'Auditor approved',
            expectedVersion: 1,
          });

          expect(prisma.auditFindingVerificationHistory.create).toHaveBeenCalledWith({
            data: expect.objectContaining({
              organizationId: 'org-1', // Derived from authCtx.organizationId
              actorId: 'auditor-verifier-1', // Derived from authCtx.userId
            }),
          });
        });

        it('createCapa transactionally advances finding to IN_REMEDIATION and writes history with capaId attribution', async () => {
          const openFinding = {
            id: 'finding-for-capa',
            organizationId: 'org-1',
            version: 1,
            status: FindingStatus.OPEN,
            ownerId: 'owner-1',
            assessment: { auditPlan: { id: 'plan-1', organizationId: 'org-1' } },
          };

          prisma.auditFinding.findFirst.mockResolvedValueOnce(openFinding);
          prisma.auditCapa.create.mockResolvedValueOnce({
            id: 'capa-new-1',
            organizationId: 'org-1',
            findingId: 'finding-for-capa',
            title: 'Fix patch',
            correctiveAction: 'Deploy kernel update',
            ownerId: 'owner-1',
            status: CapaStatus.OPEN,
            version: 1,
          });
          prisma.auditFinding.update.mockResolvedValueOnce({
            ...openFinding,
            status: FindingStatus.IN_REMEDIATION,
            version: 2,
          });

          const created = await service.createCapa(authCtx, {
            findingId: 'finding-for-capa',
            title: 'Fix patch',
            correctiveAction: 'Deploy kernel update',
            ownerId: 'owner-1',
          });

          expect(created.id).toBe('capa-new-1');
          expect(prisma.auditFinding.update).toHaveBeenCalledWith(
            expect.objectContaining({
              where: { id: 'finding-for-capa' },
              data: expect.objectContaining({
                status: FindingStatus.IN_REMEDIATION,
                version: { increment: 1 },
              }),
            }),
          );
          expect(prisma.auditFindingVerificationHistory.create).toHaveBeenCalledWith({
            data: expect.objectContaining({
              findingId: 'finding-for-capa',
              capaId: 'capa-new-1',
              action: AuditFindingLifecycleAction.STATUS_TRANSITIONED,
              priorStatus: FindingStatus.OPEN,
              newStatus: FindingStatus.IN_REMEDIATION,
              actorId: authCtx.userId,
            }),
          });
        });
      });

      describe('Multi-CAPA Concurrency & Sibling Synchronization', () => {
        it('serializes on parent finding with row lock and advances finding when all sibling CAPAs are completed', async () => {
          const capa1 = {
            id: 'capa-101',
            findingId: 'finding-multi-1',
            organizationId: 'org-1',
            status: CapaStatus.OPEN,
            version: 1,
            ownerId: 'owner-1',
            updatedAt: new Date(),
            finding: {
              id: 'finding-multi-1',
              status: FindingStatus.IN_REMEDIATION,
              assessment: { auditPlan: { id: 'p-1', organizationId: 'org-1' } },
            },
          };

          prisma.auditCapa.findFirst.mockResolvedValueOnce(capa1);
          prisma.auditCapa.updateMany.mockResolvedValueOnce({ count: 1 });
          prisma.auditCapa.update.mockResolvedValueOnce({
            ...capa1,
            status: CapaStatus.COMPLETED,
            version: 2,
          });

          // Locked finding re-read returns IN_REMEDIATION
          prisma.auditFinding.findFirst.mockResolvedValueOnce({
            id: 'finding-multi-1',
            status: FindingStatus.IN_REMEDIATION,
          });

          // Both sibling CAPAs are now COMPLETED
          prisma.auditCapa.findMany.mockResolvedValueOnce([
            { id: 'capa-101', status: CapaStatus.COMPLETED },
            { id: 'capa-102', status: CapaStatus.COMPLETED },
          ]);

          prisma.auditFinding.update.mockResolvedValueOnce({
            id: 'finding-multi-1',
            status: FindingStatus.READY_FOR_VERIFICATION,
            version: 2,
          });

          await service.updateCapa(authCtx, 'capa-101', {
            status: CapaStatus.COMPLETED,
            expectedVersion: 1,
          });

          // Row lock query executed on parent finding
          expect(prisma.$queryRaw).toHaveBeenCalled();

          // Parent finding advanced with version increment
          expect(prisma.auditFinding.update).toHaveBeenCalledWith(
            expect.objectContaining({
              where: { id: 'finding-multi-1' },
              data: expect.objectContaining({
                status: FindingStatus.READY_FOR_VERIFICATION,
                version: { increment: 1 },
              }),
            }),
          );

          // History record written with capaId attribution
          expect(prisma.auditFindingVerificationHistory.create).toHaveBeenCalledWith({
            data: expect.objectContaining({
              findingId: 'finding-multi-1',
              capaId: 'capa-101',
              action: AuditFindingLifecycleAction.STATUS_TRANSITIONED,
              priorStatus: FindingStatus.IN_REMEDIATION,
              newStatus: FindingStatus.READY_FOR_VERIFICATION,
              actorId: authCtx.userId,
            }),
          });
        });

        it('keeps parent finding IN_REMEDIATION when some sibling CAPAs remain incomplete', async () => {
          const capa1 = {
            id: 'capa-201',
            findingId: 'finding-multi-2',
            organizationId: 'org-1',
            status: CapaStatus.OPEN,
            version: 1,
            ownerId: 'owner-1',
            updatedAt: new Date(),
            finding: {
              id: 'finding-multi-2',
              status: FindingStatus.IN_REMEDIATION,
              assessment: { auditPlan: { id: 'p-1', organizationId: 'org-1' } },
            },
          };

          prisma.auditCapa.findFirst.mockResolvedValueOnce(capa1);
          prisma.auditCapa.updateMany.mockResolvedValueOnce({ count: 1 });
          prisma.auditCapa.update.mockResolvedValueOnce({
            ...capa1,
            status: CapaStatus.COMPLETED,
            version: 2,
          });

          prisma.auditFinding.findFirst.mockResolvedValueOnce({
            id: 'finding-multi-2',
            status: FindingStatus.IN_REMEDIATION,
          });

          // Sibling capa-202 is STILL OPEN!
          prisma.auditCapa.findMany.mockResolvedValueOnce([
            { id: 'capa-201', status: CapaStatus.COMPLETED },
            { id: 'capa-202', status: CapaStatus.OPEN },
          ]);

          const findingUpdateSpy = jest.spyOn(prisma.auditFinding, 'update');
          findingUpdateSpy.mockClear();

          await service.updateCapa(authCtx, 'capa-201', {
            status: CapaStatus.COMPLETED,
            expectedVersion: 1,
          });

          // Finding must NOT be updated or advanced!
          expect(findingUpdateSpy).not.toHaveBeenCalled();
        });

        it('lock acquisition failure (deadlock/timeout) aborts transaction and commits no state changes', async () => {
          const capa1 = {
            id: 'capa-lock-err',
            findingId: 'finding-lock-err',
            organizationId: 'org-1',
            status: CapaStatus.OPEN,
            version: 1,
            ownerId: 'owner-1',
            updatedAt: new Date(),
            finding: {
              id: 'finding-lock-err',
              status: FindingStatus.IN_REMEDIATION,
              assessment: { auditPlan: { id: 'p-1', organizationId: 'org-1' } },
            },
          };

          prisma.auditCapa.findFirst.mockResolvedValueOnce(capa1);
          prisma.auditCapa.updateMany.mockResolvedValueOnce({ count: 1 });
          prisma.auditCapa.update.mockResolvedValueOnce({
            ...capa1,
            status: CapaStatus.COMPLETED,
            version: 2,
          });

          // Row lock query fails with database deadlock/timeout error
          prisma.$queryRaw.mockRejectedValueOnce(new Error('canceling statement due to lock timeout / deadlock detected'));

          const findingUpdateSpy = jest.spyOn(prisma.auditFinding, 'update');
          findingUpdateSpy.mockClear();
          const historyCreateSpy = jest.spyOn(prisma.auditFindingVerificationHistory, 'create');
          historyCreateSpy.mockClear();

          await expect(
            service.updateCapa(authCtx, 'capa-lock-err', {
              status: CapaStatus.COMPLETED,
              expectedVersion: 1,
            }),
          ).rejects.toThrow('canceling statement due to lock timeout / deadlock detected');

          // Ensure no finding status or history mutation occurred
          expect(findingUpdateSpy).not.toHaveBeenCalled();
          expect(historyCreateSpy).not.toHaveBeenCalled();
        });

        it('missing $queryRaw client method aborts with InternalServerErrorException rather than silently continuing', async () => {
          const capa1 = {
            id: 'capa-no-raw',
            findingId: 'finding-no-raw',
            organizationId: 'org-1',
            status: CapaStatus.OPEN,
            version: 1,
            ownerId: 'owner-1',
            updatedAt: new Date(),
            finding: {
              id: 'finding-no-raw',
              status: FindingStatus.IN_REMEDIATION,
              assessment: { auditPlan: { id: 'p-1', organizationId: 'org-1' } },
            },
          };

          prisma.auditCapa.findFirst.mockResolvedValueOnce(capa1);
          prisma.auditCapa.updateMany.mockResolvedValueOnce({ count: 1 });
          prisma.auditCapa.update.mockResolvedValueOnce({
            ...capa1,
            status: CapaStatus.COMPLETED,
            version: 2,
          });

          const originalQueryRaw = prisma.$queryRaw;
          delete prisma.$queryRaw;

          const findingUpdateSpy = jest.spyOn(prisma.auditFinding, 'update');
          findingUpdateSpy.mockClear();

          try {
            await expect(
              service.updateCapa(authCtx, 'capa-no-raw', {
                status: CapaStatus.COMPLETED,
                expectedVersion: 1,
              }),
            ).rejects.toBeInstanceOf(InternalServerErrorException);

            expect(findingUpdateSpy).not.toHaveBeenCalled();
          } finally {
            prisma.$queryRaw = originalQueryRaw;
          }
        });

        it('zero-row lock acquisition (finding not found or foreign tenant) aborts with NotFoundException', async () => {
          const capa1 = {
            id: 'capa-foreign-finding',
            findingId: 'finding-foreign',
            organizationId: 'org-1',
            status: CapaStatus.OPEN,
            version: 1,
            ownerId: 'owner-1',
            updatedAt: new Date(),
            finding: {
              id: 'finding-foreign',
              status: FindingStatus.IN_REMEDIATION,
              assessment: { auditPlan: { id: 'p-1', organizationId: 'org-1' } },
            },
          };

          prisma.auditCapa.findFirst.mockResolvedValueOnce(capa1);
          prisma.auditCapa.updateMany.mockResolvedValueOnce({ count: 1 });
          prisma.auditCapa.update.mockResolvedValueOnce({
            ...capa1,
            status: CapaStatus.COMPLETED,
            version: 2,
          });

          // Lock query returns 0 rows (row does not exist or belongs to another tenant)
          prisma.$queryRaw.mockResolvedValueOnce([]);

          const findingUpdateSpy = jest.spyOn(prisma.auditFinding, 'update');
          findingUpdateSpy.mockClear();

          await expect(
            service.updateCapa(authCtx, 'capa-foreign-finding', {
              status: CapaStatus.COMPLETED,
              expectedVersion: 1,
            }),
          ).rejects.toBeInstanceOf(NotFoundException);

          expect(findingUpdateSpy).not.toHaveBeenCalled();
        });
      });
    });
});
