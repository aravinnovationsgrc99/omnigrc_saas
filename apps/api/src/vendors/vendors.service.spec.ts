import { Test, TestingModule } from '@nestjs/testing';
import { VendorsService } from './vendors.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { ResourceAuthorizationService } from '../auth/resource-authorization.service';
import { EvidenceService } from '../evidence/evidence.service';
import { ApprovalEngineService } from '../approval/approval-engine.service';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { VendorCriticality, VendorStatus, Role, EvidenceStatus, EvidenceScanStatus } from '@omnigrc/shared';

describe('VendorsService', () => {
  let service: VendorsService;
  let prisma: jest.Mocked<any>;
  let auditLogsService: jest.Mocked<any>;
  let resourceAuthService: jest.Mocked<any>;
  let evidenceService: jest.Mocked<any>;
  let approvalEngineService: jest.Mocked<any>;

  beforeEach(async () => {
    prisma = {
      vendor: {
        findMany: jest.fn(),
        count: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      vendorAssessment: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
      },
      vendorQuestionnaire: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      vendorQuestionnaireSubmission: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      vendorAssessmentAction: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        deleteMany: jest.fn(),
      },
      vendorEvidence: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        delete: jest.fn(),
      },
      user: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue({ name: 'Alice Auditor', email: 'alice@example.com' }),
      },
    };

    auditLogsService = {
      log: jest.fn().mockResolvedValue({}),
    };

    resourceAuthService = {
      getScopeWhereClause: jest.fn().mockResolvedValue({ organizationId: 'org-1' }),
      validateDepartmentAccess: jest.fn().mockResolvedValue(true),
      authorize: jest.fn().mockResolvedValue(true),
      validateHierarchyInvariants: jest.fn().mockResolvedValue(true),
    };

    evidenceService = {
      createAndUpload: jest.fn(),
      detachEvidence: jest.fn().mockResolvedValue({}),
      downloadEvidence: jest.fn().mockResolvedValue({}),
    };

    approvalEngineService = {
      createApprovalInstance: jest.fn().mockResolvedValue({
        id: 'appr-vend-1',
        status: 'PENDING',
        resourceType: 'VENDOR_ASSESSMENT',
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VendorsService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditLogsService, useValue: auditLogsService },
        { provide: ResourceAuthorizationService, useValue: resourceAuthService },
        { provide: EvidenceService, useValue: evidenceService },
        { provide: ApprovalEngineService, useValue: approvalEngineService },
      ],
    }).compile();

    service = module.get<VendorsService>(VendorsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should list vendors scoped to organizationId', async () => {
    const mockVendor = {
      id: 'ven-1',
      organizationId: 'org-1',
      name: 'Cloud Vendor',
      criticality: VendorCriticality.HIGH,
      status: VendorStatus.ACTIVE,
      owner: 'SecOps',
      reviewCadenceDays: 365,
      createdAt: new Date(),
      updatedAt: new Date(),
      createdById: 'user-1',
      assessments: [],
      evidenceAssociations: [],
      _count: { assets: 2 },
    };

    prisma.vendor.findMany.mockResolvedValue([mockVendor]);
    prisma.vendor.count.mockResolvedValue(1);

    const authCtx = { userId: 'user-1', organizationId: 'org-1', role: Role.ADMIN };
    const result = await service.findAll(authCtx, {});
    expect(prisma.vendor.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organizationId: 'org-1' }),
      }),
    );
    expect(result.items.length).toBe(1);
    expect(result.items[0].name).toBe('Cloud Vendor');
    expect(result.items[0].documentCount).toBe(0);
  });

  it('should record vendor assessment and log audit entry', async () => {
    const mockVendor = {
      id: 'ven-1',
      organizationId: 'org-1',
      name: 'Vendor 1',
      criticality: VendorCriticality.MEDIUM,
      status: VendorStatus.ACTIVE,
      owner: 'SecOps',
      reviewCadenceDays: 365,
      createdAt: new Date(),
      updatedAt: new Date(),
      createdById: 'user-1',
      assessments: [],
      evidenceAssociations: [],
      _count: { assets: 0 },
    };
    const mockAssessment = {
      id: 'ass-1',
      organizationId: 'org-1',
      vendorId: 'ven-1',
      title: 'Annual Review',
      score: 90,
      status: 'COMPLETED',
      evaluatorId: 'user-1',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    prisma.vendor.findFirst.mockResolvedValue(mockVendor);
    prisma.vendorAssessment.create.mockResolvedValue(mockAssessment);

    const authCtx = { userId: 'user-1', organizationId: 'org-1', role: Role.ADMIN };
    const result = await service.createAssessment(authCtx, 'ven-1', {
      title: 'Annual Review',
      score: 90,
      evaluatorId: 'user-1',
    });

    expect(result.score).toBe(90);
    expect(auditLogsService.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'VENDOR_ASSESSMENT_CREATED' }),
    );
  });

  describe('Vendor Document Attachments', () => {
    const authCtx = { userId: 'user-1', organizationId: 'org-1', role: Role.ADMIN };
    const mockVendor = {
      id: 'ven-1',
      organizationId: 'org-1',
      name: 'Acme SaaS',
      criticality: VendorCriticality.HIGH,
      status: VendorStatus.ACTIVE,
      owner: 'SecOps',
      reviewCadenceDays: 365,
      createdAt: new Date(),
      updatedAt: new Date(),
      createdById: 'user-1',
      assessments: [],
      evidenceAssociations: [],
      _count: { assets: 0 },
    };

    it('should list documents attached to a vendor with tenant scoping', async () => {
      prisma.vendor.findFirst.mockResolvedValue(mockVendor);
      prisma.vendorEvidence.findMany.mockResolvedValue([
        {
          id: 've-1',
          vendorId: 'ven-1',
          evidenceId: 'evi-1',
          organizationId: 'org-1',
          attachedAt: new Date('2026-03-01T10:00:00Z'),
          evidence: {
            id: 'evi-1',
            title: 'SOC 2 Type II Report',
            description: 'Annual SOC 2 audit report',
            fileName: 'soc2_report.pdf',
            fileSize: 1024000,
            mimeType: 'application/pdf',
            status: EvidenceStatus.ACTIVE,
            scanStatus: EvidenceScanStatus.CLEAN,
            uploadedById: 'user-1',
          },
        },
      ]);
      prisma.user.findMany.mockResolvedValue([{ id: 'user-1', name: 'Alice Auditor', email: 'alice@example.com' }]);

      const result = await service.getDocuments(authCtx, 'ven-1');
      expect(result.total).toBe(1);
      expect(result.items[0].fileName).toBe('soc2_report.pdf');
      expect(result.items[0].uploaderName).toBe('Alice Auditor');
      expect(prisma.vendorEvidence.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            vendorId: 'ven-1',
            organizationId: 'org-1',
          }),
        }),
      );
    });

    it('should upload and associate a document with a vendor', async () => {
      prisma.vendor.findFirst.mockResolvedValue(mockVendor);
      evidenceService.createAndUpload.mockResolvedValue({
        id: 'evi-new',
        organizationId: 'org-1',
        title: 'Vendor SLA Agreement.pdf',
        description: 'Signed vendor master service agreement',
        fileName: 'sla_agreement.pdf',
        fileSize: 204800,
        mimeType: 'application/pdf',
        status: EvidenceStatus.PENDING,
        scanStatus: EvidenceScanStatus.PENDING_SCAN,
        uploadedById: 'user-1',
        createdAt: new Date(),
      });
      prisma.vendorEvidence.create.mockResolvedValue({
        id: 've-new',
        vendorId: 'ven-1',
        evidenceId: 'evi-new',
        organizationId: 'org-1',
        attachedAt: new Date(),
      });
      prisma.user.findMany.mockResolvedValue([{ id: 'user-1', name: 'Alice Auditor', email: 'alice@example.com' }]);

      const mockFile = {
        buffer: Buffer.from('dummy-pdf-content'),
        originalname: 'sla_agreement.pdf',
        mimetype: 'application/pdf',
        size: 204800,
      };

      const doc = await service.uploadDocument(authCtx, 'ven-1', mockFile, {
        description: 'Signed vendor master service agreement',
      });

      expect(doc.fileName).toBe('sla_agreement.pdf');
      expect(evidenceService.createAndUpload).toHaveBeenCalledWith(
        authCtx,
        mockFile,
        expect.objectContaining({
          targetResourceType: 'VENDOR',
          targetResourceId: 'ven-1',
          description: 'Signed vendor master service agreement',
        }),
      );
      expect(auditLogsService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'VENDOR_DOCUMENT_ATTACHED',
          entityType: 'Vendor',
          entityId: 'ven-1',
        }),
      );
    });

    it('should reject document upload without a valid file buffer', async () => {
      await expect(
        service.uploadDocument(authCtx, 'ven-1', null as any, {}),
      ).rejects.toThrow(BadRequestException);
    });

    it('should remove a document attachment and log audit entry', async () => {
      prisma.vendor.findFirst.mockResolvedValue(mockVendor);
      prisma.vendorEvidence.findFirst.mockResolvedValue({
        id: 've-1',
        vendorId: 'ven-1',
        evidenceId: 'evi-1',
        organizationId: 'org-1',
        evidence: {
          id: 'evi-1',
          fileName: 'old_cert.pdf',
        },
      });

      await service.removeDocument(authCtx, 'ven-1', 'evi-1');

      expect(evidenceService.detachEvidence).toHaveBeenCalledWith(
        authCtx,
        'evi-1',
        'VENDOR',
        'ven-1',
      );
      expect(auditLogsService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'VENDOR_DOCUMENT_REMOVED',
          entityType: 'Vendor',
          entityId: 'ven-1',
        }),
      );
    });

    it('should enforce tenant isolation when accessing vendor documents across organizations', async () => {
      // Vendor not found in tenant's org
      prisma.vendor.findFirst.mockResolvedValue(null);

      await expect(service.getDocuments(authCtx, 'foreign-vendor')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should reject document upload if target vendor belongs to another tenant', async () => {
      prisma.vendor.findFirst.mockResolvedValue(null);

      const mockFile = {
        buffer: Buffer.from('dummy-pdf-content'),
        originalname: 'sla_agreement.pdf',
        mimetype: 'application/pdf',
        size: 204800,
      };

      await expect(
        service.uploadDocument(authCtx, 'foreign-vendor-id', mockFile, {}),
      ).rejects.toThrow(NotFoundException);
      expect(evidenceService.createAndUpload).not.toHaveBeenCalled();
      expect(auditLogsService.log).not.toHaveBeenCalled();
    });

    it('should reject document removal and not leak cross-tenant document existence if attachment belongs to another tenant', async () => {
      prisma.vendor.findFirst.mockResolvedValue(mockVendor);
      // Attachment not found for this vendor in this tenant's org
      prisma.vendorEvidence.findFirst.mockResolvedValue(null);

      await expect(
        service.removeDocument(authCtx, 'ven-1', 'foreign-evidence-id'),
      ).rejects.toThrow(NotFoundException);
      expect(evidenceService.detachEvidence).not.toHaveBeenCalled();
      expect(auditLogsService.log).not.toHaveBeenCalled();
    });

    it('should only detach vendor association without deleting shared evidence or storage records', async () => {
      prisma.vendor.findFirst.mockResolvedValue(mockVendor);
      prisma.vendorEvidence.findFirst.mockResolvedValue({
        id: 've-1',
        vendorId: 'ven-1',
        evidenceId: 'shared-evi-1',
        organizationId: 'org-1',
      });

      await service.removeDocument(authCtx, 'ven-1', 'shared-evi-1');

      // Verifies detachEvidence was invoked for resource association
      expect(evidenceService.detachEvidence).toHaveBeenCalledWith(
        authCtx,
        'shared-evi-1',
        'VENDOR',
        'ven-1',
      );
    });

    it('should successfully download document attached to vendor', async () => {
      prisma.vendor.findFirst.mockResolvedValue(mockVendor);
      prisma.vendorEvidence.findFirst.mockResolvedValue({
        id: 've-1',
        vendorId: 'ven-1',
        evidenceId: 'evi-1',
        organizationId: 'org-1',
      });

      const mockRes = { setHeader: jest.fn(), send: jest.fn() };
      await service.downloadDocument(authCtx, 'ven-1', 'evi-1', mockRes);

      expect(evidenceService.downloadEvidence).toHaveBeenCalledWith(authCtx, 'evi-1', mockRes);
    });

    it('should reject document download when attachment does not exist or belongs to another tenant', async () => {
      prisma.vendor.findFirst.mockResolvedValue(mockVendor);
      prisma.vendorEvidence.findFirst.mockResolvedValue(null);

      const mockRes = { setHeader: jest.fn(), send: jest.fn() };
      await expect(
        service.downloadDocument(authCtx, 'ven-1', 'foreign-evi', mockRes),
      ).rejects.toThrow(NotFoundException);
      expect(evidenceService.downloadEvidence).not.toHaveBeenCalled();
    });
  });

  describe('Vendor Questionnaires (Phase 2)', () => {
    const authCtx = { userId: 'user-1', organizationId: 'org-1', role: Role.ADMIN };

    it('should create a vendor questionnaire template', async () => {
      const mockQ = {
        id: 'vq-1',
        organizationId: 'org-1',
        title: 'SOC 2 Security Assessment Questionnaire',
        description: 'Vendor security controls questionnaire',
        version: '1.0',
        status: 'PUBLISHED',
        questions: [{ id: 'q1', text: 'Do you enforce MFA?' }],
        createdById: 'user-1',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      prisma.vendorQuestionnaire.create.mockResolvedValue(mockQ);

      const res = await service.createQuestionnaire(authCtx, {
        title: 'SOC 2 Security Assessment Questionnaire',
        description: 'Vendor security controls questionnaire',
        questions: [{ id: 'q1', text: 'Do you enforce MFA?' }],
      });

      expect(res.id).toBe('vq-1');
      expect(res.version).toBe('1.0');
      expect(prisma.vendorQuestionnaire.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          organizationId: 'org-1',
          title: 'SOC 2 Security Assessment Questionnaire',
        }),
      });
    });

    it('should list questionnaires scoped to tenant', async () => {
      prisma.vendorQuestionnaire.findMany.mockResolvedValue([
        {
          id: 'vq-1',
          organizationId: 'org-1',
          title: 'Template 1',
          description: null,
          version: '1.0',
          status: 'PUBLISHED',
          questions: [],
          createdById: 'user-1',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      const res = await service.getQuestionnaires(authCtx);
      expect(res.length).toBe(1);
      expect(res[0].title).toBe('Template 1');
    });

    it('should submit vendor questionnaire response', async () => {
      prisma.vendor.findFirst.mockResolvedValue({ id: 'ven-1', organizationId: 'org-1' });
      prisma.vendorQuestionnaire.findFirst.mockResolvedValue({ id: 'vq-1', organizationId: 'org-1' });

      const mockSub = {
        id: 'vqs-1',
        organizationId: 'org-1',
        vendorId: 'ven-1',
        questionnaireId: 'vq-1',
        assessmentId: null,
        answers: { q1: 'Yes' },
        status: 'SUBMITTED',
        score: null,
        submittedAt: new Date(),
        reviewedAt: null,
        reviewedById: null,
        reviewNotes: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        questionnaire: { title: 'Template 1', version: '1.0' },
      };
      prisma.vendorQuestionnaireSubmission.create.mockResolvedValue(mockSub);

      const res = await service.submitQuestionnaire(authCtx, 'ven-1', {
        questionnaireId: 'vq-1',
        answers: { q1: 'Yes' },
      });

      expect(res.id).toBe('vqs-1');
      expect(res.status).toBe('SUBMITTED');
      expect(prisma.vendorQuestionnaireSubmission.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          vendorId: 'ven-1',
          questionnaireId: 'vq-1',
          status: 'SUBMITTED',
        }),
        include: { questionnaire: { select: { title: true, version: true } } },
      });
    });

    it('should review submission and update vendor due diligence status when accepted', async () => {
      prisma.vendor.findFirst.mockResolvedValue({ id: 'ven-1', organizationId: 'org-1' });
      const existingSub = {
        id: 'vqs-1',
        vendorId: 'ven-1',
        organizationId: 'org-1',
        questionnaireId: 'vq-1',
        questionnaire: { title: 'Template 1', version: '1.0' },
      };
      prisma.vendorQuestionnaireSubmission.findFirst.mockResolvedValue(existingSub);

      const reviewedSub = {
        ...existingSub,
        status: 'ACCEPTED',
        score: 95,
        reviewNotes: 'All controls verified satisfactorily',
        reviewedById: 'user-1',
        reviewedAt: new Date(),
        submittedAt: new Date(),
        answers: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      prisma.vendorQuestionnaireSubmission.update.mockResolvedValue(reviewedSub);
      prisma.vendor.update.mockResolvedValue({});

      const res = await service.reviewQuestionnaireSubmission(authCtx, 'ven-1', 'vqs-1', {
        status: 'ACCEPTED',
        score: 95,
        reviewNotes: 'All controls verified satisfactorily',
      });

      expect(res.status).toBe('ACCEPTED');
      expect(res.score).toBe(95);
      expect(prisma.vendor.update).toHaveBeenCalledWith({
        where: { id: 'ven-1' },
        data: expect.objectContaining({ dueDiligenceStatus: 'APPROVED' }),
      });
    });
  });

  describe('Vendor Assessment Actions & Approvals (Phase 2)', () => {
    const authCtx = { userId: 'user-1', organizationId: 'org-1', role: Role.ADMIN };

    it('should create an assessment remediation action', async () => {
      prisma.vendor.findFirst.mockResolvedValue({ id: 'ven-1', organizationId: 'org-1' });
      prisma.vendorAssessment.findFirst.mockResolvedValue({
        id: 'va-1',
        vendorId: 'ven-1',
        organizationId: 'org-1',
      });

      const mockAction = {
        id: 'vaa-1',
        organizationId: 'org-1',
        assessmentId: 'va-1',
        title: 'Remediate Missing Penetration Test Report',
        description: 'Vendor must provide annual external pentest report',
        owner: 'Vendor Security Officer',
        dueDate: new Date('2026-11-15'),
        status: 'OPEN',
        completedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      prisma.vendorAssessmentAction.create.mockResolvedValue(mockAction);

      const res = await service.createAssessmentAction(authCtx, 'ven-1', 'va-1', {
        title: 'Remediate Missing Penetration Test Report',
        description: 'Vendor must provide annual external pentest report',
        owner: 'Vendor Security Officer',
        dueDate: '2026-11-15',
      });

      expect(res.id).toBe('vaa-1');
      expect(res.title).toBe('Remediate Missing Penetration Test Report');
      expect(prisma.vendorAssessmentAction.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          organizationId: 'org-1',
          assessmentId: 'va-1',
          title: 'Remediate Missing Penetration Test Report',
        }),
      });
    });

    it('should update an assessment action to COMPLETED and set completedAt', async () => {
      prisma.vendor.findFirst.mockResolvedValue({ id: 'ven-1', organizationId: 'org-1' });
      const existingAction = {
        id: 'vaa-1',
        assessmentId: 'va-1',
        organizationId: 'org-1',
        title: 'Remediate Missing Report',
        status: 'OPEN',
        completedAt: null,
      };
      prisma.vendorAssessmentAction.findFirst.mockResolvedValue(existingAction);

      const updated = {
        ...existingAction,
        status: 'COMPLETED',
        completedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      prisma.vendorAssessmentAction.update.mockResolvedValue(updated);

      const res = await service.updateAssessmentAction(authCtx, 'ven-1', 'va-1', 'vaa-1', {
        status: 'COMPLETED',
      });

      expect(res.status).toBe('COMPLETED');
      expect(res.completedAt).toBeDefined();
    });

    it('should submit vendor assessment for approval via ApprovalEngine', async () => {
      prisma.vendor.findFirst.mockResolvedValue({ id: 'ven-1', name: 'Critical Cloud Provider', organizationId: 'org-1' });
      prisma.vendorAssessment.findFirst.mockResolvedValue({
        id: 'va-1',
        title: 'Annual Security Review 2026',
        vendorId: 'ven-1',
        organizationId: 'org-1',
        score: 88,
      });

      const approval = await service.submitAssessmentForApproval(authCtx, 'ven-1', 'va-1', {
        dueDays: 5,
      });

      expect(approval.id).toBe('appr-vend-1');
      expect(approvalEngineService.createApprovalInstance).toHaveBeenCalledWith(
        'org-1',
        'user-1',
        expect.objectContaining({
          resourceType: 'VENDOR_ASSESSMENT',
          resourceId: 'va-1',
          purpose: 'VENDOR_APPROVAL',
        }),
      );
    });
  });
});
