import { Test, TestingModule } from '@nestjs/testing';
import { BusinessAuditsService } from './business-audits.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import {
  AuditPlanStatus,
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
        update: jest.fn(),
      },
      auditCheckItem: {
        createMany: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
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
      },
      $transaction: jest.fn((cb) => cb(prisma)),
    };

    auditLogsService = {
      log: jest.fn().mockResolvedValue({}),
    };

    notificationsService = {
      createNotification: jest.fn().mockResolvedValue({}),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BusinessAuditsService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditLogsService, useValue: auditLogsService },
        { provide: NotificationsService, useValue: notificationsService },
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
});
