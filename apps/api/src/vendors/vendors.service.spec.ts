import { Test, TestingModule } from '@nestjs/testing';
import { VendorsService } from './vendors.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { ResourceAuthorizationService } from '../auth/resource-authorization.service';
import { EvidenceService } from '../evidence/evidence.service';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { VendorCriticality, VendorStatus, Role, EvidenceStatus, EvidenceScanStatus } from '@omnigrc/shared';

describe('VendorsService', () => {
  let service: VendorsService;
  let prisma: jest.Mocked<any>;
  let auditLogsService: jest.Mocked<any>;
  let resourceAuthService: jest.Mocked<any>;
  let evidenceService: jest.Mocked<any>;

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
        create: jest.fn(),
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
    };

    evidenceService = {
      createAndUpload: jest.fn(),
      detachEvidence: jest.fn().mockResolvedValue({}),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VendorsService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditLogsService, useValue: auditLogsService },
        { provide: ResourceAuthorizationService, useValue: resourceAuthService },
        { provide: EvidenceService, useValue: evidenceService },
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
  });
});
