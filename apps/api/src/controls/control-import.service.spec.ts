import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ControlImportService } from './control-import.service';
import { PrismaService } from '../prisma/prisma.service';
import { AiRouterService } from './ai/ai-router.service';
import { FrameworkEntitlementsService } from '../frameworks/framework-entitlements.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { Role, MappingStatus } from '@omnigrc/shared';
import * as ExcelJS from 'exceljs';

describe('ControlImportService', () => {
  let service: ControlImportService;
  let prisma: jest.Mocked<any>;
  let aiRouterService: jest.Mocked<any>;
  let frameworkEntitlementsService: jest.Mocked<any>;
  let auditLogsService: jest.Mocked<any>;

  const authCtx = { userId: 'user-1', organizationId: 'org-1', role: Role.ADMIN };

  beforeEach(async () => {
    prisma = {
      framework: {
        findUnique: jest.fn().mockResolvedValue({ id: 'fw-iso27001', code: 'ISO27001', name: 'ISO/IEC 27001' }),
      },
      frameworkReference: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'ref-a51',
            identifier: 'A.5.1',
            title: 'Policies for information security',
            frameworkVersion: { framework: { code: 'ISO27001' } },
          },
          {
            id: 'ref-a824',
            identifier: 'A.8.24',
            title: 'Use of cryptography',
            frameworkVersion: { framework: { code: 'ISO27001' } },
          },
        ]),
      },
      control: {
        create: jest.fn().mockImplementation((args) =>
          Promise.resolve({
            id: 'ctrl-imported-1',
            ...args.data,
            createdAt: new Date(),
          }),
        ),
      },
      controlFrameworkMapping: {
        create: jest.fn().mockImplementation((args) =>
          Promise.resolve({
            id: 'map-imported-1',
            ...args.data,
            createdAt: new Date(),
          }),
        ),
      },
    };

    aiRouterService = {
      executeMapping: jest.fn().mockResolvedValue({
        acceptedSuggestions: [
          {
            clauseId: 'ref-a824',
            clauseCode: 'A.8.24',
            frameworkCode: 'ISO27001',
            confidenceScore: 0.92,
            reasoning: 'Strong match on cryptographic controls.',
          },
        ],
        tierUsed: 'TIER_1',
        providerName: 'MockAiProvider',
        isFallback: false,
      }),
    };

    frameworkEntitlementsService = {
      isEntitled: jest.fn().mockResolvedValue(true),
    };

    auditLogsService = {
      log: jest.fn().mockResolvedValue({}),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ControlImportService,
        { provide: PrismaService, useValue: prisma },
        { provide: AiRouterService, useValue: aiRouterService },
        { provide: FrameworkEntitlementsService, useValue: frameworkEntitlementsService },
        { provide: AuditLogsService, useValue: auditLogsService },
      ],
    }).compile();

    service = module.get<ControlImportService>(ControlImportService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should reject missing or empty file', async () => {
    await expect(service.analyzeImportFile(authCtx, null as any, 'fw-iso27001')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('should reject file exceeding 10MB size limit', async () => {
    const largeFile = {
      originalname: 'huge-controls.xlsx',
      buffer: Buffer.alloc(10),
      size: 11 * 1024 * 1024,
    };
    await expect(service.analyzeImportFile(authCtx, largeFile as any, 'fw-iso27001')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('should reject unsupported file extensions', async () => {
    const badFile = {
      originalname: 'controls.exe',
      buffer: Buffer.from('malicious'),
      size: 50,
    };
    await expect(service.analyzeImportFile(authCtx, badFile as any, 'fw-iso27001')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('should reject when tenant is not entitled to the selected framework', async () => {
    frameworkEntitlementsService.isEntitled.mockResolvedValue(false);
    const mockFile = {
      originalname: 'controls.csv',
      buffer: Buffer.from('title,description\nAccess Control,MFA'),
      size: 50,
    };
    await expect(service.analyzeImportFile(authCtx, mockFile as any, 'fw-iso27001')).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('should extract and map controls from a CSV spreadsheet', async () => {
    const csvContent =
      'Control Name,Description,Category\nData Encryption,Encrypt sensitive data at rest and in transit,Cryptography\nAccess Policy,Require multi-factor authentication,Access Control';
    const mockFile = {
      originalname: 'controls.csv',
      buffer: Buffer.from(csvContent, 'utf8'),
      size: csvContent.length,
    };

    const res = await service.analyzeImportFile(authCtx, mockFile as any, 'fw-iso27001');

    expect(res.fileName).toBe('controls.csv');
    expect(res.fileType).toBe('CSV');
    expect(res.totalControlsDetected).toBe(2);
    expect(res.requiresOcr).toBe(false);
    expect(res.suggestions).toHaveLength(2);
    expect(res.suggestions[0].originalTitle).toBe('Data Encryption');
    expect(res.suggestions[0].suggestedReferenceIdentifier).toBe('A.8.24');
    expect(res.suggestions[0].confidenceScore).toBe(0.92);
    expect(res.suggestions[0].status).toBe('MATCHED');
    expect(res.coverage.totalExtracted).toBe(2);
  });

  it('should extract and map controls from an XLSX spreadsheet', async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('SecurityControls');
    sheet.addRow(['Control Title', 'Control Description', 'Domain']);
    sheet.addRow(['Password Standard', 'Enforce 14-char passwords with complexity', 'IAM']);
    sheet.addRow(['Audit Log Retention', 'Retain security event logs for 12 months', 'Logging']);

    const buffer = await workbook.xlsx.writeBuffer();
    const mockFile = {
      originalname: 'my-controls.xlsx',
      buffer: Buffer.from(buffer),
      size: buffer.byteLength,
    };

    const res = await service.analyzeImportFile(authCtx, mockFile as any, 'fw-iso27001');

    expect(res.totalControlsDetected).toBe(2);
    expect(res.suggestions[0].originalTitle).toBe('Password Standard');
    expect(res.suggestions[0].sourceLocation).toContain('SecurityControls: Row 2');
  });

  it('should report requiresOcr when a scanned PDF with no text stream is uploaded', async () => {
    const scannedPdfBuffer = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF');
    const mockFile = {
      originalname: 'scanned-document.pdf',
      buffer: scannedPdfBuffer,
      size: scannedPdfBuffer.length,
    };

    const res = await service.analyzeImportFile(authCtx, mockFile as any, 'fw-iso27001');

    expect(res.requiresOcr).toBe(true);
    expect(res.totalControlsDetected).toBe(0);
    expect(res.extractionMessage).toContain('Scanned PDF detected');
  });

  it('should extract controls from a text-based PDF', async () => {
    const pdfContent =
      '%PDF-1.4\nBT\n/F1 12 Tf\n(Control 1: Data Encryption Standard. All data in AWS S3 buckets must use AES-256.) Tj\nET\nBT\n(Control 2: Password Complexity. Passwords must be at least 14 characters.) Tj\nET\n%%EOF';
    const mockFile = {
      originalname: 'controls.pdf',
      buffer: Buffer.from(pdfContent),
      size: pdfContent.length,
    };

    const res = await service.analyzeImportFile(authCtx, mockFile as any, 'fw-iso27001');

    expect(res.requiresOcr).toBe(false);
    expect(res.totalControlsDetected).toBeGreaterThanOrEqual(1);
    expect(res.suggestions[0].sourceLocation).toContain('PDF');
  });

  it('should persist accepted controls and mappings into the database', async () => {
    const persistDto = {
      controls: [
        {
          name: 'Accepted Data Encryption',
          description: 'AES-256 for all stored data',
          category: 'Cryptography',
          frameworkReferenceId: 'ref-a824',
          status: MappingStatus.APPROVED,
        },
        {
          name: 'Standalone Access Control',
          description: 'MFA for VPN access',
          category: 'Access Control',
        },
      ],
    };

    const res = await service.persistImportedControls(authCtx, persistDto);

    expect(res.createdCount).toBe(2);
    expect(res.mappedCount).toBe(1);
    expect(prisma.control.create).toHaveBeenCalledTimes(2);
    expect(prisma.controlFrameworkMapping.create).toHaveBeenCalledTimes(1);
    expect(auditLogsService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'CONTROL_CREATED',
        organizationId: 'org-1',
      }),
    );
    expect(auditLogsService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'CONTROL_MAPPING_CREATED',
        organizationId: 'org-1',
      }),
    );
  });
});
