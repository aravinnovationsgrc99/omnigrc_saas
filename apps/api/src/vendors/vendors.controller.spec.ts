import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { VendorsController } from './vendors.controller';
import { VendorsService } from './vendors.service';
import { Role, EvidenceStatus, EvidenceScanStatus } from '@omnigrc/shared';

describe('VendorsController - Document Attachments Suite', () => {
  let controller: VendorsController;
  let service: jest.Mocked<VendorsService>;

  const mockUser = {
    userId: 'user-auditor-1',
    organizationId: 'tenant-org-alpha',
    role: Role.ADMIN,
  };

  const mockDocuments = [
    {
      id: 've-1',
      vendorId: 'vendor-123',
      evidenceId: 'evi-1',
      attachedAt: '2026-10-18T10:00:00.000Z',
      title: 'SOC 2 Type II Report',
      description: 'Annual SOC 2 audit report',
      fileName: 'soc2_report.pdf',
      fileSize: 1048576,
      mimeType: 'application/pdf',
      status: EvidenceStatus.ACTIVE,
      scanStatus: EvidenceScanStatus.CLEAN,
      uploadedById: 'user-auditor-1',
      uploaderName: 'Security Lead',
    },
  ];

  beforeEach(async () => {
    const mockVendorsService = {
      findAll: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      softDelete: jest.fn(),
      createAssessment: jest.fn(),
      migrateAssetVendors: jest.fn(),
      getDocuments: jest.fn(),
      uploadDocument: jest.fn(),
      removeDocument: jest.fn(),
      downloadDocument: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [VendorsController],
      providers: [
        {
          provide: VendorsService,
          useValue: mockVendorsService,
        },
      ],
    }).compile();

    controller = module.get<VendorsController>(VendorsController);
    service = module.get(VendorsService) as jest.Mocked<VendorsService>;
  });

  describe('getDocuments', () => {
    it('should return paginated vendor documents with proper tenant authCtx', async () => {
      service.getDocuments.mockResolvedValue({
        items: mockDocuments,
        total: 1,
      });

      const result = await controller.getDocuments(mockUser, 'vendor-123', { search: 'SOC' });

      expect(result.items).toHaveLength(1);
      expect(result.items[0].fileName).toBe('soc2_report.pdf');
      expect(service.getDocuments).toHaveBeenCalledWith(
        {
          userId: 'user-auditor-1',
          organizationId: 'tenant-org-alpha',
          role: Role.ADMIN,
        },
        'vendor-123',
        { search: 'SOC' },
      );
    });

    it('should return an empty list when vendor has no attached documents', async () => {
      service.getDocuments.mockResolvedValue({
        items: [],
        total: 0,
      });

      const result = await controller.getDocuments(mockUser, 'vendor-no-docs', {});

      expect(result.items).toHaveLength(0);
      expect(result.total).toBe(0);
      expect(service.getDocuments).toHaveBeenCalledWith(
        {
          userId: 'user-auditor-1',
          organizationId: 'tenant-org-alpha',
          role: Role.ADMIN,
        },
        'vendor-no-docs',
        {},
      );
    });

    it('should propagate NotFoundException when vendor does not exist or is invalid', async () => {
      service.getDocuments.mockRejectedValue(
        new NotFoundException('Vendor with ID "invalid-vendor-id" not found'),
      );

      await expect(
        controller.getDocuments(mockUser, 'invalid-vendor-id', {}),
      ).rejects.toThrow(NotFoundException);
    });

    it('should enforce tenant isolation by propagating NotFoundException for cross-tenant vendor access', async () => {
      service.getDocuments.mockRejectedValue(
        new NotFoundException('Vendor with ID "foreign-vendor" not found'),
      );

      await expect(
        controller.getDocuments(mockUser, 'foreign-vendor', {}),
      ).rejects.toThrow(NotFoundException);

      expect(service.getDocuments).toHaveBeenCalledWith(
        expect.objectContaining({ organizationId: 'tenant-org-alpha' }),
        'foreign-vendor',
        {},
      );
    });
  });

  describe('uploadDocument', () => {
    it('should delegate upload to service with authCtx and file payload', async () => {
      const mockFile = {
        buffer: Buffer.from('pdf-data'),
        originalname: 'iso27001_cert.pdf',
        mimetype: 'application/pdf',
        size: 2048,
      };

      service.uploadDocument.mockResolvedValue(mockDocuments[0]);

      const result = await controller.uploadDocument(
        mockUser,
        'vendor-123',
        mockFile,
        { description: 'ISO 27001 certification' },
      );

      expect(result).toBeDefined();
      expect(service.uploadDocument).toHaveBeenCalledWith(
        {
          userId: 'user-auditor-1',
          organizationId: 'tenant-org-alpha',
          role: Role.ADMIN,
        },
        'vendor-123',
        mockFile,
        { description: 'ISO 27001 certification' },
      );
    });
  });

  describe('removeDocument', () => {
    it('should delegate removal to service with authCtx, vendorId, and evidenceId', async () => {
      service.removeDocument.mockResolvedValue({ success: true, evidenceId: 'evi-1' });

      await controller.removeDocument(mockUser, 'vendor-123', 'evi-1');

      expect(service.removeDocument).toHaveBeenCalledWith(
        {
          userId: 'user-auditor-1',
          organizationId: 'tenant-org-alpha',
          role: Role.ADMIN,
        },
        'vendor-123',
        'evi-1',
      );
    });
  });

  describe('downloadDocument', () => {
    it('should delegate document download to service with res stream', async () => {
      const mockRes = { setHeader: jest.fn(), send: jest.fn() };
      service.downloadDocument.mockResolvedValue();

      await controller.downloadDocument(mockUser, 'vendor-123', 'evi-1', mockRes);

      expect(service.downloadDocument).toHaveBeenCalledWith(
        {
          userId: 'user-auditor-1',
          organizationId: 'tenant-org-alpha',
          role: Role.ADMIN,
        },
        'vendor-123',
        'evi-1',
        mockRes,
      );
    });

    it('should propagate NotFoundException if document is not attached to vendor', async () => {
      const mockRes = { setHeader: jest.fn(), send: jest.fn() };
      service.downloadDocument.mockRejectedValue(
        new NotFoundException('Document "evi-unattached" is not attached to vendor "vendor-123".'),
      );

      await expect(
        controller.downloadDocument(mockUser, 'vendor-123', 'evi-unattached', mockRes),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
