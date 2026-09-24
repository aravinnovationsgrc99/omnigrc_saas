import { Test, TestingModule } from '@nestjs/testing';
import { PoliciesService } from './policies.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { PolicyStatus, Role } from '@omnigrc/shared';

describe('PoliciesService', () => {
  let service: PoliciesService;
  let prisma: jest.Mocked<any>;
  let auditLogsService: jest.Mocked<any>;

  beforeEach(async () => {
    prisma = {
      policy: {
        findMany: jest.fn(),
        count: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      policyVersion: {
        findFirst: jest.fn(),
        create: jest.fn(),
      },
      policyAttestation: {
        create: jest.fn(),
      },
      policyException: {
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
    };

    auditLogsService = {
      log: jest.fn().mockResolvedValue({}),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PoliciesService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditLogsService, useValue: auditLogsService },
      ],
    }).compile();

    service = module.get<PoliciesService>(PoliciesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should create policy draft and initial policy version', async () => {
    const mockCreatedPolicy = {
      id: 'pol-1',
      organizationId: 'org-1',
      code: 'POL-001',
      title: 'InfoSec Policy',
      category: 'Security',
      status: PolicyStatus.DRAFT,
      ownerId: 'user-1',
      reviewCadenceDays: 365,
      createdById: 'user-1',
      createdAt: new Date(),
      updatedAt: new Date(),
      publishedVersion: null,
      versions: [],
    };

    prisma.policy.create.mockResolvedValue(mockCreatedPolicy);

    const authCtx = { userId: 'user-1', organizationId: 'org-1', role: Role.ADMIN };
    const result = await service.create(authCtx, {
      code: 'POL-001',
      title: 'InfoSec Policy',
      category: 'Security',
      ownerId: 'user-1',
      initialContent: '# InfoSec Policy',
    });

    expect(prisma.policy.create).toHaveBeenCalled();
    expect(result.code).toBe('POL-001');
    expect(result.status).toBe(PolicyStatus.DRAFT);
  });

  it('should transition policy lifecycle state explicitly', async () => {
    const draftPolicy = {
      id: 'pol-1',
      organizationId: 'org-1',
      status: PolicyStatus.DRAFT,
      code: 'POL-001',
      title: 'Test',
      versions: [{ id: 'ver-1', versionNumber: '1.0' }],
    };

    prisma.policy.findFirst.mockResolvedValue(draftPolicy);
    prisma.policy.update.mockResolvedValue({
      ...draftPolicy,
      status: PolicyStatus.UNDER_REVIEW,
    });

    const authCtx = { userId: 'user-1', organizationId: 'org-1', role: Role.ADMIN };
    const updated = await service.submitForReview(authCtx, 'pol-1');
    expect(updated.status).toBe(PolicyStatus.UNDER_REVIEW);
  });

  it('should reject publish if policy is not approved', async () => {
    const draftPolicy = {
      id: 'pol-1',
      organizationId: 'org-1',
      status: PolicyStatus.DRAFT,
      code: 'POL-001',
      title: 'Test',
    };

    prisma.policy.findFirst.mockResolvedValue(draftPolicy);

    const authCtx = { userId: 'user-1', organizationId: 'org-1', role: Role.ADMIN };
    await expect(service.publish(authCtx, 'pol-1')).rejects.toThrow(BadRequestException);
  });
});
