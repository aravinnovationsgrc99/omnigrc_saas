import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { FrameworkCoverageService } from './framework-coverage.service';
import { FrameworkEntitlementsService } from './framework-entitlements.service';
import { ResourceAuthorizationService, ResourceAuthContext } from '../auth/resource-authorization.service';
import { PrismaService } from '../prisma/prisma.service';
import { FrameworkCode, EntitlementStatus, Role, MappingStatus } from '@omnigrc/shared';

describe('Phase C — Framework Coverage & Gap Analysis (E2E / Integration)', () => {
  let coverageService: FrameworkCoverageService;
  let entitlementsService: FrameworkEntitlementsService;
  let resourceAuthService: ResourceAuthorizationService;
  let prisma: PrismaService;

  const mockOrgId1 = 'org-tenant-alpha-1111';
  const mockOrgId2 = 'org-tenant-beta-2222';

  const adminAuthCtx: ResourceAuthContext = {
    userId: 'user-admin-001',
    organizationId: mockOrgId1,
    role: Role.ADMIN,
  };

  const auditorAuthCtx: ResourceAuthContext = {
    userId: 'user-auditor-001',
    organizationId: mockOrgId1,
    role: Role.EXTERNAL_AUDITOR,
  };

  const scopedAnalystAuthCtx: ResourceAuthContext = {
    userId: 'user-analyst-dept-a',
    organizationId: mockOrgId1,
    role: Role.ANALYST,
  };

  // Mock DB state
  const mockFramework = {
    id: 'fw-iso27001-id',
    code: FrameworkCode.ISO27001,
    name: 'ISO/IEC 27001:2022 Information Security',
  };

  const mockVersion = {
    id: 'fw-ver-2022-id',
    frameworkId: mockFramework.id,
    version: '2022',
    name: 'ISO/IEC 27001:2022',
    status: 'ACTIVE',
  };

  const mockReferenceCovered = {
    id: 'ref-a51-id',
    frameworkVersionId: mockVersion.id,
    type: 'CONTROL',
    identifier: 'A.5.1',
    title: 'Policies for information security',
    normativeText: null, // Zero normative text fabrication
    sortOrder: 1,
  };

  const mockReferencePartial = {
    id: 'ref-a52-id',
    frameworkVersionId: mockVersion.id,
    type: 'CONTROL',
    identifier: 'A.5.2',
    title: 'Information security roles and responsibilities',
    normativeText: null,
    sortOrder: 2,
  };

  const mockReferenceNotCovered = {
    id: 'ref-a53-id',
    frameworkVersionId: mockVersion.id,
    type: 'CONTROL',
    identifier: 'A.5.3',
    title: 'Segregation of duties',
    normativeText: null,
    sortOrder: 3,
  };

  const mockControl1 = {
    id: 'ctrl-sec-policy-01',
    organizationId: mockOrgId1,
    departmentId: 'dept-sec-a',
    projectId: null,
    name: 'Information Security Policy Document',
    description: 'Corporate sec policy',
    category: 'Governance',
    deletedAt: null,
  };

  const mockControl2 = {
    id: 'ctrl-roles-02',
    organizationId: mockOrgId1,
    departmentId: 'dept-hr-b',
    projectId: null,
    name: 'Security Roles Assignment',
    description: 'Role mapping',
    category: 'Governance',
    deletedAt: null,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FrameworkCoverageService,
        {
          provide: FrameworkEntitlementsService,
          useValue: {
            assertEntitled: jest.fn().mockImplementation(async (orgId, fwId) => {
              if (orgId === mockOrgId1 && (fwId === mockFramework.id || fwId === mockFramework.code)) {
                return; // entitled
              }
              if (fwId === 'UNENTITLED_FW') {
                throw new ForbiddenException('Framework not entitled');
              }
              return;
            }),
          },
        },
        {
          provide: ResourceAuthorizationService,
          useValue: {
            getScopeWhereClause: jest.fn().mockImplementation(async (ctx: ResourceAuthContext) => {
              if (ctx.userId === 'user-analyst-dept-a') {
                return {
                  organizationId: ctx.organizationId,
                  OR: [{ departmentId: 'dept-sec-a', projectId: null }],
                };
              }
              return { organizationId: ctx.organizationId };
            }),
          },
        },
        {
          provide: PrismaService,
          useValue: {
            framework: {
              findFirst: jest.fn().mockImplementation(async ({ where }) => {
                if (where.OR) {
                  return mockFramework;
                }
                if (where.id === mockFramework.id || where.code === mockFramework.code) {
                  return mockFramework;
                }
                return null;
              }),
            },
            frameworkVersion: {
              findFirst: jest.fn().mockResolvedValue(mockVersion),
            },
            frameworkReference: {
              findMany: jest.fn().mockResolvedValue([
                mockReferenceCovered,
                mockReferencePartial,
                mockReferenceNotCovered,
              ]),
            },
            frameworkClause: {
              findMany: jest.fn().mockResolvedValue([]),
            },
            controlFrameworkMapping: {
              findMany: jest.fn().mockImplementation(async ({ where }) => {
                const isDeptRestricted = where.control?.OR !== undefined;
                if (isDeptRestricted) {
                  // Restricted user in Dept A only sees mockControl1
                  return [
                    {
                      id: 'map-01',
                      controlId: mockControl1.id,
                      frameworkReferenceId: mockReferenceCovered.id,
                      frameworkClauseId: null,
                      status: MappingStatus.APPROVED,
                      control: {
                        ...mockControl1,
                        evidenceAssociations: [
                          {
                            evidence: {
                              id: 'ev-policy-pdf',
                              title: 'Policy PDF',
                              fileName: 'policy.pdf',
                              status: 'ACTIVE',
                              scanStatus: 'CLEAN',
                              deletedAt: null,
                            },
                          },
                        ],
                        approvalAssociations: [
                          {
                            approvalInstance: {
                              id: 'app-inst-01',
                              title: 'Policy Sign-Off',
                              status: 'APPROVED',
                              purpose: 'CONTROL_SIGNOFF',
                            },
                          },
                        ],
                      },
                    },
                  ];
                }

                // Org-wide Admin sees all controls
                return [
                  // Full coverage mapping for A.5.1
                  {
                    id: 'map-01',
                    controlId: mockControl1.id,
                    frameworkReferenceId: mockReferenceCovered.id,
                    frameworkClauseId: null,
                    status: MappingStatus.APPROVED,
                    control: {
                      ...mockControl1,
                      evidenceAssociations: [
                        {
                          evidence: {
                            id: 'ev-policy-pdf',
                            title: 'Policy PDF',
                            fileName: 'policy.pdf',
                            status: 'ACTIVE',
                            scanStatus: 'CLEAN',
                            deletedAt: null,
                          },
                        },
                      ],
                      approvalAssociations: [
                        {
                          approvalInstance: {
                            id: 'app-inst-01',
                            title: 'Policy Sign-Off',
                            status: 'APPROVED',
                            purpose: 'CONTROL_SIGNOFF',
                          },
                        },
                      ],
                    },
                  },
                  // Partial coverage mapping for A.5.2 (SUGGESTED status, no evidence)
                  {
                    id: 'map-02',
                    controlId: mockControl2.id,
                    frameworkReferenceId: mockReferencePartial.id,
                    frameworkClauseId: null,
                    status: MappingStatus.SUGGESTED,
                    control: {
                      ...mockControl2,
                      evidenceAssociations: [],
                      approvalAssociations: [],
                    },
                  },
                ];
              }),
            },
            evidenceFrameworkReference: {
              findMany: jest.fn().mockResolvedValue([]),
            },
            approvalInstance: {
              findMany: jest.fn().mockResolvedValue([]),
            },
          },
        },
      ],
    }).compile();

    coverageService = module.get<FrameworkCoverageService>(FrameworkCoverageService);
    entitlementsService = module.get<FrameworkEntitlementsService>(FrameworkEntitlementsService);
    resourceAuthService = module.get<ResourceAuthorizationService>(ResourceAuthorizationService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  describe('Coverage Engine & Semantics', () => {
    it('1. should calculate COVERED, PARTIAL, and NOT_COVERED states correctly', async () => {
      const result = await coverageService.calculateCoverage(adminAuthCtx, mockFramework.code);

      expect(result).toBeDefined();
      expect(result.framework.code).toBe('ISO27001');
      expect(result.summary.totalReferences).toBe(3);
      expect(result.summary.covered).toBe(1);
      expect(result.summary.partial).toBe(1);
      expect(result.summary.notCovered).toBe(1);
      expect(result.summary.coveragePercentage).toBe(33.3);

      const refCovered = result.references.find((r) => r.code === 'A.5.1');
      expect(refCovered?.status).toBe('COVERED');
      expect(refCovered?.mappedControlsCount).toBe(1);
      expect(refCovered?.evidenceSummary.cleanActiveCount).toBe(1);

      const refPartial = result.references.find((r) => r.code === 'A.5.2');
      expect(refPartial?.status).toBe('PARTIAL');

      const refNotCovered = result.references.find((r) => r.code === 'A.5.3');
      expect(refNotCovered?.status).toBe('NOT_COVERED');
      expect(refNotCovered?.mappedControlsCount).toBe(0);
    });

    it('2. should confirm no normative text fabrication occurred (normativeText is null)', async () => {
      const result = await coverageService.calculateCoverage(adminAuthCtx, mockFramework.code);
      for (const ref of result.references) {
        expect(ref.normativeText).toBeNull();
      }
    });

    it('3. should generate gap analysis by filtering out COVERED items', async () => {
      const gapResult = await coverageService.getGaps(adminAuthCtx, mockFramework.code);

      expect(gapResult.references.length).toBe(2);
      expect(gapResult.references.every((r) => r.status === 'PARTIAL' || r.status === 'NOT_COVERED')).toBe(true);
    });

    it('4. should apply search filter on gap analysis', async () => {
      const filtered = await coverageService.getGaps(adminAuthCtx, mockFramework.code, {
        search: 'A.5.2',
      });

      expect(filtered.references.length).toBe(1);
      expect(filtered.references[0].code).toBe('A.5.2');
    });
  });

  describe('Phase B Department/Project Scoping & Tenant Isolation', () => {
    it('5. should restrict coverage calculation for scoped analyst user (does not leak Dept B controls)', async () => {
      const result = await coverageService.calculateCoverage(scopedAnalystAuthCtx, mockFramework.code);

      // Scoped analyst in Dept A only sees A.5.1 (covered in Dept A). A.5.2 (in Dept B) becomes NOT_COVERED for them!
      expect(result.summary.covered).toBe(1);
      const refA52 = result.references.find((r) => r.code === 'A.5.2');
      expect(refA52?.status).toBe('NOT_COVERED');
      expect(refA52?.mappedControlsCount).toBe(0);
    });

    it('6. should allow External Auditor read-only access to coverage metrics', async () => {
      const result = await coverageService.calculateCoverage(auditorAuthCtx, mockFramework.code);
      expect(result.summary.totalReferences).toBe(3);
    });
  });

  describe('Licensing & Entitlements Security', () => {
    it('7. should throw ForbiddenException when accessing an unentitled framework', async () => {
      await expect(
        coverageService.calculateCoverage(adminAuthCtx, 'UNENTITLED_FW'),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
