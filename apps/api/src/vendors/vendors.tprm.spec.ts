import { Test, TestingModule } from '@nestjs/testing';
import { VendorsService } from './vendors.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { ResourceAuthorizationService, ResourceAuthContext } from '../auth/resource-authorization.service';
import { EvidenceService } from '../evidence/evidence.service';
import { ApprovalEngineService } from '../approval/approval-engine.service';
import { NotificationsService } from '../notifications/notifications.service';
import { Role, VendorCriticality, VendorStatus, VendorAssessmentStatus, EvidenceStatus, EvidenceScanStatus } from '@omnigrc/shared';
import { BadRequestException, NotFoundException } from '@nestjs/common';

describe('VendorsService - TPRM Complete Lifecycle (Stage 2 Acceptance)', () => {
  let service: VendorsService;
  let prisma: any;
  let auditLogsService: any;
  let resourceAuthService: any;
  let evidenceService: any;

  const authCtx: ResourceAuthContext = {
    userId: 'user-tprm-officer-1',
    organizationId: 'org-enterprise-tprm',
    role: Role.ADMIN,
  };

  const mockDb = {
    vendors: new Map<string, any>(),
    assessments: new Map<string, any>(),
    questionnaires: new Map<string, any>(),
    submissions: new Map<string, any>(),
    actions: new Map<string, any>(),
    evidences: new Map<string, any>(),
    vendorEvidences: new Map<string, any>(),
    auditLogs: [] as any[],
  };

  beforeEach(async () => {
    mockDb.vendors.clear();
    mockDb.assessments.clear();
    mockDb.questionnaires.clear();
    mockDb.submissions.clear();
    mockDb.actions.clear();
    mockDb.evidences.clear();
    mockDb.vendorEvidences.clear();
    mockDb.auditLogs = [];

    prisma = {
      vendor: {
        create: jest.fn().mockImplementation(({ data }) => {
          const record = { id: `ven-${Date.now()}-${Math.random()}`, ...data, deletedAt: null, createdAt: new Date(), updatedAt: new Date() };
          mockDb.vendors.set(record.id, record);
          return Promise.resolve(record);
        }),
        findFirst: jest.fn().mockImplementation(({ where }) => {
          if (where.id) return Promise.resolve(mockDb.vendors.get(where.id) || null);
          return Promise.resolve(Array.from(mockDb.vendors.values())[0] || null);
        }),
        findUnique: jest.fn().mockImplementation(({ where }) => Promise.resolve(mockDb.vendors.get(where.id) || null)),
        update: jest.fn().mockImplementation(({ where, data }) => {
          const v = mockDb.vendors.get(where.id);
          const updated = { ...v, ...data, updatedAt: new Date() };
          mockDb.vendors.set(where.id, updated);
          return Promise.resolve(updated);
        }),
      },
      vendorAssessment: {
        create: jest.fn().mockImplementation(({ data }) => {
          const record = { id: `ass-${Date.now()}`, ...data, createdAt: new Date(), updatedAt: new Date() };
          mockDb.assessments.set(record.id, record);
          return Promise.resolve(record);
        }),
        findFirst: jest.fn().mockImplementation(({ where }) => {
          const a = Array.from(mockDb.assessments.values()).find((item) => {
            if (where.id && item.id !== where.id) return false;
            if (where.vendorId && item.vendorId !== where.vendorId) return false;
            return true;
          });
          return Promise.resolve(a || null);
        }),
        update: jest.fn().mockImplementation(({ where, data }) => {
          const a = mockDb.assessments.get(where.id);
          const updated = { ...a, ...data, updatedAt: new Date() };
          mockDb.assessments.set(where.id, updated);
          return Promise.resolve(updated);
        }),
      },
      vendorQuestionnaire: {
        findMany: jest.fn().mockImplementation(() => Promise.resolve(Array.from(mockDb.questionnaires.values()))),
        findFirst: jest.fn().mockImplementation(({ where }) => Promise.resolve(mockDb.questionnaires.get(where.id) || Array.from(mockDb.questionnaires.values())[0] || null)),
        create: jest.fn().mockImplementation(({ data }) => {
          const q = { id: `q-${Date.now()}-${Math.random()}`, ...data, createdAt: new Date(), updatedAt: new Date() };
          mockDb.questionnaires.set(q.id, q);
          return Promise.resolve(q);
        }),
      },
      vendorQuestionnaireSubmission: {
        create: jest.fn().mockImplementation(({ data }) => {
          const q = mockDb.questionnaires.get(data.questionnaireId) || { title: 'Critical Vendor Comprehensive Assessment' };
          const sub = { id: `sub-${Date.now()}`, ...data, questionnaire: q, createdAt: new Date(), updatedAt: new Date() };
          mockDb.submissions.set(sub.id, sub);
          return Promise.resolve(sub);
        }),
        findMany: jest.fn().mockImplementation(() => Promise.resolve(Array.from(mockDb.submissions.values()))),
      },
      vendorEvidence: {
        findFirst: jest.fn().mockImplementation(({ where }) => {
          const ve = Array.from(mockDb.vendorEvidences.values()).find(
            (item) => item.vendorId === where.vendorId && item.evidenceId === where.evidenceId,
          );
          if (ve) {
            const ev = mockDb.evidences.get(ve.evidenceId);
            return Promise.resolve({ ...ve, evidence: ev });
          }
          return Promise.resolve(null);
        }),
        findMany: jest.fn().mockImplementation(() => {
          return Promise.resolve(
            Array.from(mockDb.vendorEvidences.values()).map((ve) => ({
              ...ve,
              evidence: mockDb.evidences.get(ve.evidenceId),
            })),
          );
        }),
      },
      evidence: {
        update: jest.fn().mockImplementation(({ where, data }) => {
          const ev = mockDb.evidences.get(where.id);
          const updated = { ...ev, ...data };
          mockDb.evidences.set(where.id, updated);
          return Promise.resolve(updated);
        }),
      },
      vendorAssessmentAction: {
        create: jest.fn().mockImplementation(({ data }) => {
          const act = { id: `act-${Date.now()}`, ...data, createdAt: new Date(), updatedAt: new Date() };
          mockDb.actions.set(act.id, act);
          return Promise.resolve(act);
        }),
        findFirst: jest.fn().mockImplementation(({ where }) => {
          return Promise.resolve(mockDb.actions.get(where.id) || null);
        }),
        findMany: jest.fn().mockImplementation(() => Promise.resolve(Array.from(mockDb.actions.values()))),
        update: jest.fn().mockImplementation(({ where, data }) => {
          const act = mockDb.actions.get(where.id);
          const updated = { ...act, ...data, updatedAt: new Date() };
          mockDb.actions.set(where.id, updated);
          return Promise.resolve(updated);
        }),
      },
      user: {
        findUnique: jest.fn().mockResolvedValue({ id: authCtx.userId, name: 'TPRM Lead Auditor', email: 'auditor@example.com' }),
        findMany: jest.fn().mockResolvedValue([{ id: authCtx.userId, name: 'TPRM Lead Auditor', email: 'auditor@example.com' }]),
      },
    };

    auditLogsService = {
      log: jest.fn().mockImplementation((logEntry) => {
        mockDb.auditLogs.push(logEntry);
        return Promise.resolve({ id: `audit-${Date.now()}` });
      }),
    };

    resourceAuthService = {
      authorize: jest.fn().mockResolvedValue(true),
      getScopeWhereClause: jest.fn().mockResolvedValue({ organizationId: authCtx.organizationId }),
      validateHierarchyInvariants: jest.fn().mockResolvedValue(true),
    };

    evidenceService = {
      createAndUpload: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VendorsService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditLogsService, useValue: auditLogsService },
        { provide: ResourceAuthorizationService, useValue: resourceAuthService },
        { provide: EvidenceService, useValue: evidenceService },
        { provide: ApprovalEngineService, useValue: { createApprovalInstance: jest.fn() } },
        { provide: NotificationsService, useValue: { notify: jest.fn() } },
      ],
    }).compile();

    service = module.get<VendorsService>(VendorsService);
  });

  it('Stage 2.A: Register vendor with progressive enterprise intake and draft status', async () => {
    const vendor = await service.create(authCtx, {
      name: 'Datadog Cloud Observability',
      category: 'Cloud Monitoring SaaS',
      owner: 'SecOps Team',
      businessPurpose: 'Production infrastructure metrics, distributed tracing, and APM logging.',
      serviceProvided: 'Enterprise SaaS Monitoring Platform',
      countriesOfOperation: ['US', 'DE', 'IN'],
      dataHandled: true,
      dataClassification: 'CONFIDENTIAL',
      systemsAccessed: ['Production Kubernetes Clusters', 'AWS VPC Gateways'],
      contractValue: 120000,
      contractRenewalDate: '2027-12-31',
      subcontractors: ['Amazon Web Services (Hosting)'],
      isDraft: true,
    });

    expect(vendor).toBeDefined();
    expect(vendor.name).toBe('Datadog Cloud Observability');
    expect(vendor.dueDiligenceStatus).toBe('DRAFT');
    expect(vendor.status).toBe(VendorStatus.UNDER_REVIEW);
    expect(vendor.dataClassification).toBe('CONFIDENTIAL');
    expect(vendor.countriesOfOperation).toEqual(['US', 'DE', 'IN']);
  });

  it('Stage 2.B: Evaluate Inherent Risk and derive Critical tier with transparent weights', async () => {
    const vendor = await service.create(authCtx, {
      name: 'Stripe Payments Gateway',
      owner: 'Billing Engineering',
      category: 'Financial Infrastructure',
    });

    const result = await service.assessInherentRisk(authCtx, vendor.id, {
      factors: {
        dataSensitivity: 'RESTRICTED', // PHI / PCI (100 * 0.20 = 20)
        dataVolume: 'MASSIVE', // Millions of records (100 * 0.10 = 10)
        systemAccess: 'DIRECT_API', // Direct API integration (70 * 0.20 = 14)
        businessCriticality: 'MISSION_CRITICAL', // Payment processing core (100 * 0.20 = 20)
        financialExposure: 'VERY_HIGH', // >$1M (100 * 0.10 = 10)
        regulatoryExposure: 'HIGH', // PCI DSS & RBI Mandated (100 * 0.10 = 10)
        subcontractorReliance: 'MODERATE', // (60 * 0.10 = 6)
      },
    });

    expect(result.score).toBeGreaterThanOrEqual(75);
    expect(result.tier).toBe(VendorCriticality.CRITICAL);
    expect(result.suggestedReviewCadenceDays).toBe(180);
    expect(result.factors.dataSensitivity.weight).toBe(0.20);
    expect(result.rationale).toContain('Key drivers');

    const updatedVendor = await service.findOne(authCtx, vendor.id);
    expect(updatedVendor.criticality).toBe(VendorCriticality.CRITICAL);
    expect(updatedVendor.reviewCadenceDays).toBe(180);
    expect(updatedVendor.dueDiligenceStatus).toBe('INHERENT_RISK_ASSESSED');
  });

  it('Stage 2.C: Trigger tiered Due Diligence and assign standardized questionnaire template', async () => {
    const vendor = await service.create(authCtx, {
      name: 'Snowflake Data Cloud',
      owner: 'Data Platform',
      criticality: VendorCriticality.CRITICAL,
    });

    const dd = await service.triggerDueDiligence(authCtx, vendor.id);

    expect(dd.assessment).toBeDefined();
    expect(dd.assessment.title).toContain('CRITICAL Tier');
    expect(dd.questionnaire).toBeDefined();
    expect(dd.questionnaire.title).toContain('Critical Vendor Comprehensive');
    expect(dd.submission).toBeDefined();

    const updatedVendor = await service.findOne(authCtx, vendor.id);
    expect(updatedVendor.dueDiligenceStatus).toBe('DUE_DILIGENCE');
  });

  it('Stage 2.D: Review and verify evidence with expiration date and reject invalid documents', async () => {
    const vendor = await service.create(authCtx, { name: 'Okta Identity Cloud', owner: 'IAM Team' });

    // Simulate attached documents in mock db
    mockDb.evidences.set('ev-soc2', {
      id: 'ev-soc2',
      title: 'Okta SOC 2 Type II Report (2026)',
      fileName: 'okta-soc2-type2.pdf',
      fileSize: 4200000,
      mimeType: 'application/pdf',
      status: EvidenceStatus.ACTIVE,
      scanStatus: EvidenceScanStatus.CLEAN,
      uploadedById: authCtx.userId,
      retentionUntil: null,
      description: 'Annual SOC 2 Type II report audited by EY',
    });
    mockDb.vendorEvidences.set('ve-1', {
      id: 've-1',
      vendorId: vendor.id,
      evidenceId: 'ev-soc2',
      organizationId: authCtx.organizationId,
      attachedAt: new Date(),
    });

    // 1. Verify valid SOC 2 with future expiration
    const verified = await service.verifyDocument(authCtx, vendor.id, 'ev-soc2', {
      verificationStatus: 'VERIFIED',
      documentType: 'SOC2',
      expiryDate: '2027-10-31',
      reviewerNotes: 'Verified clean unqualified SOC 2 Type II report with zero exceptions.',
    });
    expect(verified.verificationStatus).toBe('VERIFIED');
    expect(verified.documentType).toBe('SOC2');
    expect(verified.expiryDate).toBe('2027-10-31');

    // 2. Reject document with missing or incomplete report
    await expect(
      service.verifyDocument(authCtx, vendor.id, 'ev-soc2', {
        verificationStatus: 'REJECTED',
        rejectionReason: '', // missing required reason
      }),
    ).rejects.toThrow(BadRequestException);

    const rejected = await service.verifyDocument(authCtx, vendor.id, 'ev-soc2', {
      verificationStatus: 'REJECTED',
      rejectionReason: 'The provided certificate expired in 2024 and does not cover the current audit period.',
    });
    expect(rejected.verificationStatus).toBe('REJECTED');
    expect(rejected.rejectionReason).toContain('expired in 2024');
  });

  it('Stage 2.E: Evaluate Inherent vs Control Effectiveness to derive Residual Risk', async () => {
    const vendor = await service.create(authCtx, {
      name: 'GitHub Enterprise Cloud',
      owner: 'DevOps',
      criticality: VendorCriticality.HIGH,
    });

    // Set inherent risk in vendor description
    await service.assessInherentRisk(authCtx, vendor.id, {
      factors: {
        dataSensitivity: 'CONFIDENTIAL',
        dataVolume: 'LARGE',
        systemAccess: 'DIRECT_API',
        businessCriticality: 'SIGNIFICANT',
        financialExposure: 'MEDIUM',
        regulatoryExposure: 'MODERATE',
        subcontractorReliance: 'LOW',
      },
    });

    // Compute residual risk with 85% control effectiveness
    const residual = await service.calculateResidualRisk(authCtx, vendor.id, {
      overrideControlEffectiveness: 85,
    });

    expect(residual.inherentRiskScore).toBeGreaterThanOrEqual(50);
    expect(residual.controlEffectivenessScore).toBe(85);
    expect(residual.residualRiskScore).toBeLessThan(residual.inherentRiskScore);
    expect(residual.mitigatingControls.length).toBeGreaterThan(0);

    const updated = await service.findOne(authCtx, vendor.id);
    expect(updated.dueDiligenceStatus).toBe('RISK_EVALUATION');
  });

  it('Stage 2.F: Manage remediation findings, reject inadequate evidence to reopen, and verify resolution', async () => {
    const vendor = await service.create(authCtx, { name: 'Twilio Telephony', owner: 'Communications Team' });
    const assessment = await service.createAssessment(authCtx, vendor.id, {
      title: 'Annual Security Review',
      evaluatorId: authCtx.userId,
    });

    // 1. Create finding / remediation action
    const action = await service.createAssessmentAction(authCtx, vendor.id, assessment.id, {
      title: 'Enforce Mandatory IP Whitelisting for Webhook Endpoints',
      description: 'Vendor currently allows unauthenticated ingress traffic on webhook callback handlers.',
      owner: 'Security Engineer',
      dueDate: new Date(Date.now() + 14 * 86400000).toISOString(),
    });
    expect(action.status).toBe('OPEN');

    // 2. Reject inadequate evidence and reopen finding
    const reopened = await service.verifyAssessmentAction(authCtx, vendor.id, assessment.id, action.id, {
      verified: false,
      rejectionReason: 'Vendor provided generic screenshot without demonstrating enforcement on production IP range.',
    });
    expect(reopened.status).toBe('IN_PROGRESS');
    expect(reopened.description).toContain('REOPENED_REJECTED');
    expect(reopened.completedAt).toBeNull();

    // 3. Resubmit and successfully verify closure
    const resolved = await service.verifyAssessmentAction(authCtx, vendor.id, assessment.id, action.id, {
      verified: true,
      verificationNotes: 'Firewall rules verified restricting webhook traffic strictly to verified CIDR blocks.',
    });
    expect(resolved.status).toBe('RESOLVED');
    expect(resolved.completedAt).toBeDefined();
  });

  it('Stage 2.G: Approve relationship, trigger periodic reassessment, and complete offboarding', async () => {
    const vendor = await service.create(authCtx, {
      name: 'CrowdStrike Falcon Sensor',
      owner: 'CISO Office',
      reviewCadenceDays: 365,
    });

    // 1. Approve relationship
    const approved = await service.approveRelationship(authCtx, vendor.id, {
      approved: true,
      notes: 'Approved by CISO with standard enterprise SLA terms.',
    });
    expect(approved.status).toBe(VendorStatus.ACTIVE);
    expect(approved.dueDiligenceStatus).toBe('APPROVED');
    expect(approved.lastReviewedAt).toBeDefined();

    // 2. Trigger periodic reassessment
    const reassessed = await service.triggerReassessment(authCtx, vendor.id);
    expect(reassessed.dueDiligenceStatus).toBe('REASSESSMENT');

    // 3. Offboard vendor - enforces mandatory checklist
    await expect(
      service.offboardVendor(authCtx, vendor.id, {
        accessRevoked: true,
        dataReturnedOrDestroyed: false, // missing data return certification
        contractTerminated: true,
        auditEvidenceArchived: true,
      }),
    ).rejects.toThrow(BadRequestException);

    const offboarded = await service.offboardVendor(authCtx, vendor.id, {
      accessRevoked: true,
      dataReturnedOrDestroyed: true,
      contractTerminated: true,
      auditEvidenceArchived: true,
      notes: 'All cloud sensors uninstalled, API keys rotated, and destruction certificate signed.',
    });
    expect(offboarded.status).toBe(VendorStatus.INACTIVE);
    expect(offboarded.dueDiligenceStatus).toBe('DECOMMISSIONED');
  });
});
