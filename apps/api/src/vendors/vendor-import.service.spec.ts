import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { VendorImportService } from './vendor-import.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { ResourceAuthContext } from '../auth/resource-authorization.service';
import { Role, VendorCriticality, VendorStatus, VendorImportStatus } from '@omnigrc/shared';
import * as ExcelJS from 'exceljs';

describe('VendorImportService', () => {
  let service: VendorImportService;
  let prisma: any;
  let auditLogsService: any;

  const mockAuthCtx: ResourceAuthContext = {
    userId: 'user-import-admin-1',
    organizationId: 'org-test-phase5-import',
    role: Role.ADMIN,
  };

  beforeEach(async () => {
    prisma = {
      vendor: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockImplementation((args) => ({ id: 'new-vendor-id', ...args.data })),
        update: jest.fn().mockImplementation((args) => ({ id: args.where.id, ...args.data })),
      },
      vendorImportBatch: {
        create: jest.fn().mockImplementation((args) => ({ id: 'batch-123', ...args.data })),
        update: jest.fn().mockImplementation((args) => ({ id: args.where.id, ...args.data })),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        findFirst: jest.fn().mockResolvedValue(null),
      },
      $transaction: jest.fn().mockImplementation(async (cb) => cb(prisma)),
    };

    auditLogsService = {
      log: jest.fn().mockResolvedValue({ id: 'audit-log-id' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VendorImportService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditLogsService, useValue: auditLogsService },
      ],
    }).compile();

    service = module.get<VendorImportService>(VendorImportService);
  });

  describe('Formula Injection Sanitization (CWE-1236)', () => {
    it('should prefix dangerous formula triggers (=, +, -, @) with a single quote', () => {
      expect(service.sanitizeCellValue('=cmd|"/C calc"!A0')).toBe('\'=cmd|"/C calc"!A0');
      expect(service.sanitizeCellValue('+12345')).toBe('\'+12345');
      expect(service.sanitizeCellValue('-SUM(A1:A10)')).toBe('\'-SUM(A1:A10)');
      expect(service.sanitizeCellValue('@HYPERLINK("http://evil.com")')).toBe('\'@HYPERLINK("http://evil.com")');
      expect(service.sanitizeCellValue('\tTabSeparated')).toBe('\'\tTabSeparated');
    });

    it('should leave safe values unchanged', () => {
      expect(service.sanitizeCellValue('Acme Security Inc.')).toBe('Acme Security Inc.');
      expect(service.sanitizeCellValue('contact@acme.com')).toBe('contact@acme.com');
      expect(service.sanitizeCellValue(12345)).toBe(12345);
      expect(service.sanitizeCellValue(null)).toBeNull();
      expect(service.sanitizeCellValue(undefined)).toBeNull();
    });
  });

  describe('Sensitive Data Masking for Advisory AI', () => {
    it('should mask email addresses before advisory processing', () => {
      const masked = service.maskSampleValue('john.doe@enterprise-vendor.com');
      expect(masked).toBe('j***@***.com');
      expect(masked).not.toContain('john.doe');
    });

    it('should mask numeric identifiers like phone and tax numbers', () => {
      const maskedPhone = service.maskSampleValue('+1-555-123-4567');
      expect(maskedPhone).toBe('+*-***-***-****');
    });
  });

  describe('AI Column Mapping Suggestions', () => {
    it('should automatically detect common vendor headers with high confidence', () => {
      const headers = ['Company Name', 'Risk Tier', 'Internal Owner', 'Category', 'Contact Email', 'Tax ID'];
      const { suggestedMapping, confidenceScores } = service.suggestColumnMapping(headers, []);

      expect(suggestedMapping['Company Name']).toBe('name');
      expect(confidenceScores['Company Name']).toBeGreaterThanOrEqual(0.85);

      expect(suggestedMapping['Risk Tier']).toBe('criticality');
      expect(suggestedMapping['Internal Owner']).toBe('owner');
      expect(suggestedMapping['Category']).toBe('category');
      expect(suggestedMapping['Contact Email']).toBe('contactEmail');
      expect(suggestedMapping['Tax ID']).toBe('taxId');
    });
  });

  describe('Excel and CSV Parsing', () => {
    it('should parse valid CSV files and sanitize formula cells', async () => {
      const csvContent = 'Vendor Name,Category,Tier\nAcme Cloud,Cloud SaaS,HIGH\n=cmd|calc,Malicious,LOW';
      const file = {
        originalname: 'vendors.csv',
        mimetype: 'text/csv',
        size: Buffer.byteLength(csvContent),
        buffer: Buffer.from(csvContent, 'utf8'),
      };

      const result = await service.parseUploadedFile(file);
      expect(result.fileType).toBe('CSV');
      expect(result.headers).toEqual(['Vendor Name', 'Category', 'Tier']);
      expect(result.rows).toHaveLength(2);
      expect(result.rows[0]['Vendor Name']).toBe('Acme Cloud');
      expect(result.rows[1]['Vendor Name']).toBe('\'=cmd|calc'); // Sanitized!
    });

    it('should parse valid XLSX files', async () => {
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet('Vendors');
      sheet.addRow(['Vendor Name', 'Category', 'Tier']);
      sheet.addRow(['SecureStack Ltd', 'DevSecOps', 'MEDIUM']);
      const buffer = await workbook.xlsx.writeBuffer();

      const file = {
        originalname: 'vendors.xlsx',
        mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        size: buffer.byteLength,
        buffer: Buffer.from(buffer),
      };

      const result = await service.parseUploadedFile(file);
      expect(result.fileType).toBe('XLSX');
      expect(result.headers).toEqual(['Vendor Name', 'Category', 'Tier']);
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0]['Vendor Name']).toBe('SecureStack Ltd');
    });

    it('should reject files exceeding 10 MB limit', async () => {
      const file = {
        originalname: 'massive.csv',
        mimetype: 'text/csv',
        size: 11 * 1024 * 1024,
        buffer: Buffer.alloc(10),
      };

      await expect(service.parseUploadedFile(file)).rejects.toThrow(BadRequestException);
    });

    it('should reject unsupported file formats', async () => {
      const file = {
        originalname: 'script.sh',
        mimetype: 'application/x-sh',
        size: 100,
        buffer: Buffer.from('#!/bin/bash\necho 1'),
      };

      await expect(service.parseUploadedFile(file)).rejects.toThrow(BadRequestException);
    });
  });

  describe('Preview Generation & Duplicate Detection', () => {
    it('should flag missing mandatory name field', async () => {
      const rows = [{ 'Vendor Name': '', Category: 'Hosting' }];
      const mapping = { 'Vendor Name': 'name', Category: 'category' };

      const preview = await service.generatePreview(mockAuthCtx, rows, mapping);
      expect(preview.validRows).toBe(0);
      expect(preview.invalidRows).toBe(1);
      expect(preview.previewRows[0].isValid).toBe(false);
      expect(preview.previewRows[0].errors).toContain('Vendor Name is required and cannot be empty.');
    });

    it('should detect existing duplicate vendors by normalized legal name and contact email', async () => {
      prisma.vendor.findMany.mockResolvedValueOnce([
        {
          id: 'existing-v1',
          name: 'Amazon Web Services, Inc.',
          contactEmail: 'aws-support@amazon.com',
          taxId: 'US-12345678',
        },
      ]);

      const rows = [
        { 'Vendor Name': 'amazon web services inc', Email: 'aws-support@amazon.com' },
        { 'Vendor Name': 'Brand New Provider', Email: 'new@provider.com' },
      ];
      const mapping = { 'Vendor Name': 'name', Email: 'contactEmail' };

      const preview = await service.generatePreview(mockAuthCtx, rows, mapping);
      expect(preview.totalRows).toBe(2);
      expect(preview.duplicateRows).toBe(1);

      expect(preview.previewRows[0].isDuplicate).toBe(true);
      expect(preview.previewRows[0].existingVendorId).toBe('existing-v1');

      expect(preview.previewRows[1].isDuplicate).toBe(false);
    });
  });

  describe('Bulk Import Execution in Transaction', () => {
    it('should execute import with SKIP strategy for duplicates', async () => {
      prisma.vendor.findMany.mockResolvedValueOnce([
        { id: 'dup-1', name: 'Existing Vendor LLC', contactEmail: null, taxId: null },
      ]);

      const rows = [
        { Name: 'Existing Vendor LLC', Tier: 'HIGH' },
        { Name: 'Fresh Vendor Inc', Tier: 'LOW' },
      ];
      const mapping = { Name: 'name', Tier: 'criticality' };

      const result = await service.executeImport(mockAuthCtx, {
        fileName: 'vendors.csv',
        fileType: 'CSV',
        rows,
        columnMapping: mapping,
        duplicateResolution: 'SKIP',
      });

      expect(result.status).toBe(VendorImportStatus.COMPLETED);
      expect(result.importedCount).toBe(1);
      expect(result.skippedCount).toBe(1);
      expect(result.updatedCount).toBe(0);
      expect(result.errorCount).toBe(0);

      expect(prisma.vendor.create).toHaveBeenCalledTimes(1);
      expect(auditLogsService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'VENDOR_IMPORT_EXECUTED',
          entityType: 'VendorImportBatch',
        }),
      );
    });

    it('should execute import with UPDATE strategy to overwrite existing duplicate fields', async () => {
      prisma.vendor.findMany.mockResolvedValueOnce([
        { id: 'dup-1', name: 'Existing Vendor LLC', contactEmail: null, taxId: null },
      ]);

      const rows = [
        { Name: 'Existing Vendor LLC', Tier: 'CRITICAL', Category: 'Infrastructure' },
      ];
      const mapping = { Name: 'name', Tier: 'criticality', Category: 'category' };

      const result = await service.executeImport(mockAuthCtx, {
        fileName: 'vendors.csv',
        fileType: 'CSV',
        rows,
        columnMapping: mapping,
        duplicateResolution: 'UPDATE',
      });

      expect(result.status).toBe(VendorImportStatus.COMPLETED);
      expect(result.updatedCount).toBe(1);
      expect(result.importedCount).toBe(0);
      expect(prisma.vendor.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'dup-1' },
          data: expect.objectContaining({
            criticality: VendorCriticality.CRITICAL,
            category: 'Infrastructure',
          }),
        }),
      );
    });

    it('should execute import with FLAG strategy to reject duplicate rows', async () => {
      prisma.vendor.findMany.mockResolvedValueOnce([
        { id: 'dup-1', name: 'Existing Vendor LLC', contactEmail: null, taxId: null },
      ]);

      const rows = [{ Name: 'Existing Vendor LLC', Tier: 'MEDIUM' }];
      const mapping = { Name: 'name', Tier: 'criticality' };

      const result = await service.executeImport(mockAuthCtx, {
        fileName: 'vendors.csv',
        fileType: 'CSV',
        rows,
        columnMapping: mapping,
        duplicateResolution: 'FLAG',
      });

      expect(result.errorCount).toBe(1);
      expect(result.importedCount).toBe(0);
      expect(result.errors[0].error).toContain('Duplicate rejected');
    });
  });
});

