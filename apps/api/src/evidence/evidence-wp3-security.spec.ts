import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ForbiddenException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { EvidenceStorageService } from './evidence-storage.service';
import { EvidenceScannerService, EICAR_STANDARD_TEST_STRING, IMalwareScannerEngine } from './evidence-scanner.service';
import { EvidenceService } from './evidence.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { ResourceAuthorizationService, ResourceAuthContext } from '../auth/resource-authorization.service';
import { EvidenceScanStatus, EvidenceStatus, EvidenceType, Role, AnalysisStatus } from '@omnigrc/shared';
import { DocumentIntelligenceService } from '../document-intelligence/document-intelligence.service';
import { FrameworkEntitlementsService } from '../frameworks/framework-entitlements.service';
import { AnalysisQueueService } from '../document-intelligence/analysis-queue.service';
import { DocumentExtractionService } from '../document-intelligence/document-extraction.service';
import { AiRouterService } from '../controls/ai/ai-router.service';
import { EffectiveServiceStateResolver } from '../service-control/effective-service-state-resolver.service';

/**
 * Helper to construct binary ZIP local file headers for archive safety testing
 */
function createTestZipBuffer(entries: Array<{ name: string; compressedSize?: number; uncompressedSize?: number }>): Buffer {
  const parts: Buffer[] = [];
  for (const entry of entries) {
    const nameBuf = Buffer.from(entry.name, 'utf8');
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0); // PK\x03\x04 signature
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(0, 6);
    header.writeUInt16LE(0, 8);
    header.writeUInt16LE(0, 10);
    header.writeUInt16LE(0, 12);
    header.writeUInt32LE(0, 14);
    header.writeUInt32LE(entry.compressedSize ?? 0, 18);
    header.writeUInt32LE(entry.uncompressedSize ?? 0, 22);
    header.writeUInt16LE(nameBuf.length, 26);
    header.writeUInt16LE(0, 28);
    parts.push(header, nameBuf);
    if (entry.compressedSize && entry.compressedSize > 0) {
      parts.push(Buffer.alloc(entry.compressedSize));
    }
  }
  return Buffer.concat(parts);
}

describe('Phase 3 WP3: Evidence Storage, Integrity & Document Security Specification', () => {
  const authCtx: ResourceAuthContext = {
    userId: 'user-wp3-1',
    organizationId: 'org-wp3-1',
    role: Role.ADMIN,
  };

  describe('1. EvidenceStorageService Hardening, Validation & Archive Safety', () => {
    let storageService: EvidenceStorageService;

    beforeEach(() => {
      storageService = new EvidenceStorageService();
    });

    it('accepts valid PDF document beginning with %PDF-', () => {
      const pdfBuffer = Buffer.from('%PDF-1.7 valid content for compliance audit');
      expect(() => {
        storageService.validateFileHeaderAndExtension('audit-report.pdf', pdfBuffer, 'application/pdf');
      }).not.toThrow();
    });

    it('accepts valid PNG image with PNG header', () => {
      const pngBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      expect(() => {
        storageService.validateFileHeaderAndExtension('screenshot.png', pngBuffer, 'image/png');
      }).not.toThrow();
    });

    it('accepts valid OpenXML document (DOCX/XLSX) beginning with PK ZIP header', () => {
      const docxBuffer = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00, 0x00, 0x00]);
      expect(() => {
        storageService.validateFileHeaderAndExtension('security_policy.docx', docxBuffer, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      }).not.toThrow();
    });

    it('ARCHIVE SAFETY: rejects Zip Slip directory traversal in OpenXML container entries', () => {
      const zipSlipBuffer = createTestZipBuffer([{ name: '../../../../etc/shadow' }]);
      expect(() => {
        storageService.validateFileHeaderAndExtension('malicious.docx', zipSlipBuffer, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      }).toThrow(BadRequestException);
    });

    it('ARCHIVE SAFETY: rejects embedded executable files disguised inside OpenXML archives', () => {
      const embeddedExeBuffer = createTestZipBuffer([
        { name: 'word/document.xml' },
        { name: 'word/malware.exe' },
      ]);
      expect(() => {
        storageService.validateFileHeaderAndExtension('payload.docx', embeddedExeBuffer, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      }).toThrow(BadRequestException);
    });

    it('ARCHIVE SAFETY: rejects suspicious compression ratio exceeding 100:1 (potential zip bomb)', () => {
      const zipBombBuffer = createTestZipBuffer([
        { name: 'word/document.xml', compressedSize: 100, uncompressedSize: 50 * 1024 * 1024 }, // 500,000:1 ratio
      ]);
      expect(() => {
        storageService.validateFileHeaderAndExtension('bomb.docx', zipBombBuffer, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      }).toThrow(BadRequestException);
    });

    it('rejects path traversal in filename (.. / \\ null bytes)', () => {
      const buf = Buffer.from('%PDF-1.4 sample');
      expect(() => {
        storageService.validateFileHeaderAndExtension('../../../etc/passwd.pdf', buf, 'application/pdf');
      }).toThrow(BadRequestException);

      expect(() => {
        storageService.validateFileHeaderAndExtension('folder/file.pdf', buf, 'application/pdf');
      }).toThrow(BadRequestException);

      expect(() => {
        storageService.validateFileHeaderAndExtension('folder\\file.pdf', buf, 'application/pdf');
      }).toThrow(BadRequestException);

      expect(() => {
        storageService.validateFileHeaderAndExtension('nullbyte\0.pdf', buf, 'application/pdf');
      }).toThrow(BadRequestException);
    });

    it('rejects double extensions and suspicious executable extensions (e.g. .pdf.exe, .exe.pdf, .bat.png)', () => {
      const buf = Buffer.from('%PDF-1.4 sample');
      expect(() => {
        storageService.validateFileHeaderAndExtension('malware.pdf.exe', buf, 'application/pdf');
      }).toThrow(BadRequestException);

      expect(() => {
        storageService.validateFileHeaderAndExtension('trojan.exe.pdf', buf, 'application/pdf');
      }).toThrow(BadRequestException);

      expect(() => {
        storageService.validateFileHeaderAndExtension('script.bat.png', buf, 'image/png');
      }).toThrow(BadRequestException);

      expect(() => {
        storageService.validateFileHeaderAndExtension('payload.ps1.docx', buf, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      }).toThrow(BadRequestException);
    });

    it('rejects executable headers (MZ / PE, ELF, Java bytecode) regardless of nominal extension', () => {
      // Windows PE / DOS MZ signature
      const mzBuffer = Buffer.from([0x4d, 0x5a, 0x90, 0x00]);
      expect(() => {
        storageService.validateFileHeaderAndExtension('disguised_trojan.pdf', mzBuffer, 'application/pdf');
      }).toThrow(BadRequestException);

      // Linux ELF signature
      const elfBuffer = Buffer.from([0x7f, 0x45, 0x4c, 0x46, 0x02]);
      expect(() => {
        storageService.validateFileHeaderAndExtension('rootkit.pdf', elfBuffer, 'application/pdf');
      }).toThrow(BadRequestException);

      // Java bytecode CAFEBABE
      const javaBuffer = Buffer.from([0xca, 0xfe, 0xba, 0xbe]);
      expect(() => {
        storageService.validateFileHeaderAndExtension('exploit.pdf', javaBuffer, 'application/pdf');
      }).toThrow(BadRequestException);
    });

    it('rejects files exceeding 25MB limit', () => {
      const oversized = Buffer.alloc(26 * 1024 * 1024); // 26MB
      expect(() => {
        storageService.validateFileHeaderAndExtension('huge.pdf', oversized, 'application/pdf');
      }).toThrow(BadRequestException);
    });

    it('calculates SHA-256 and persists file to isolated organization storage key', async () => {
      const content = Buffer.from('%PDF-1.5 Cryptographic test file for audit vault.');
      const expectedSha = crypto.createHash('sha256').update(content).digest('hex');

      const result = await storageService.saveFile(
        { originalname: 'audit-proof.pdf', buffer: content, mimetype: 'application/pdf' },
        'org-tenant-wp3',
      );

      expect(result.checksum).toBe(expectedSha);
      expect(result.fileSize).toBe(content.length);
      expect(result.storageKey).toMatch(/^org-tenant-wp3\/[a-f0-9-]+-audit-proof\.pdf$/);

      // Verify integrity check passes for saved file
      const integrity = await storageService.verifyIntegrity(result.storageKey, expectedSha);
      expect(integrity.matched).toBe(true);
      expect(integrity.actualChecksum).toBe(expectedSha);

      // Verify integrity check fails when expected hash does not match
      const badIntegrity = await storageService.verifyIntegrity(result.storageKey, 'tampered-hash-0000');
      expect(badIntegrity.matched).toBe(false);

      // Verify file exists and stream can be acquired
      const exists = await storageService.exists(result.storageKey);
      expect(exists).toBe(true);

      const streamInfo = storageService.getFileStream(result.storageKey);
      expect(streamInfo.stream).toBeDefined();
      expect(streamInfo.contentLength).toBe(content.length);
      await new Promise<void>((resolve, reject) => {
        streamInfo.stream.on('open', () => {
          (streamInfo.stream as any).destroy();
          resolve();
        });
        streamInfo.stream.on('error', reject);
      });

      // Clean up file
      await storageService.deleteFile(result.storageKey);
      const existsAfter = await storageService.exists(result.storageKey);
      expect(existsAfter).toBe(false);
    });
  });

  describe('2. Fail-Closed Malware Scanner Service (10 Operational Conditions)', () => {
    let scannerService: EvidenceScannerService;
    const originalEnv = process.env.ENABLE_MALWARE_SCANNER;
    const originalHost = process.env.CLAMAV_HOST;
    const originalUrl = process.env.MALWARE_SCANNER_URL;

    afterEach(() => {
      process.env.ENABLE_MALWARE_SCANNER = originalEnv;
      process.env.CLAMAV_HOST = originalHost;
      process.env.MALWARE_SCANNER_URL = originalUrl;
    });

    it('Condition 1: Scanner disabled -> returns PENDING_SCAN (prohibits false CLEAN)', async () => {
      delete process.env.ENABLE_MALWARE_SCANNER;
      scannerService = new EvidenceScannerService();

      const buffer = Buffer.from('%PDF-1.4 unverified document');
      const status = await scannerService.scanFile('org/key-1', buffer);

      expect(status).toBe(EvidenceScanStatus.PENDING_SCAN);
      expect(scannerService.isClean(status)).toBe(false);
      expect(scannerService.canBeProcessed(status)).toBe(false);
    });

    it('Condition 2: Scanner enabled (ENABLE_MALWARE_SCANNER=true) but no daemon/endpoint configured -> returns SCAN_FAILED', async () => {
      process.env.ENABLE_MALWARE_SCANNER = 'true';
      delete process.env.CLAMAV_HOST;
      delete process.env.MALWARE_SCANNER_URL;
      scannerService = new EvidenceScannerService();

      const buffer = Buffer.from('%PDF-1.4 unconfigured endpoint document');
      const status = await scannerService.scanFile('org/key-no-endpoint', buffer);

      expect(status).toBe(EvidenceScanStatus.SCAN_FAILED);
      expect(scannerService.isClean(status)).toBe(false);
    });

    it('Condition 3: Scanner endpoint unreachable / network failure -> returns SCAN_FAILED', async () => {
      process.env.ENABLE_MALWARE_SCANNER = 'true';
      scannerService = new EvidenceScannerService();
      scannerService.registerEngine({
        engineName: 'MockClamAv',
        isConfigured: () => true,
        scan: async () => {
          throw new Error('connect ECONNREFUSED 127.0.0.1:3310');
        },
      });

      const buffer = Buffer.from('%PDF-1.4 sample');
      const status = await scannerService.scanFile('org/key-unreachable', buffer);
      expect(status).toBe(EvidenceScanStatus.SCAN_FAILED);
    });

    it('Condition 4: Authentication failure from scanner API -> returns SCAN_FAILED', async () => {
      process.env.ENABLE_MALWARE_SCANNER = 'true';
      scannerService = new EvidenceScannerService();
      scannerService.registerEngine({
        engineName: 'VirusTotalGateway',
        isConfigured: () => true,
        scan: async () => {
          throw new Error('HTTP 401 Unauthorized: Invalid scanner API token');
        },
      });

      const buffer = Buffer.from('%PDF-1.4 sample');
      const status = await scannerService.scanFile('org/key-auth-fail', buffer);
      expect(status).toBe(EvidenceScanStatus.SCAN_FAILED);
    });

    it('Condition 5: Scanner timeout -> returns SCAN_FAILED', async () => {
      process.env.ENABLE_MALWARE_SCANNER = 'true';
      process.env.MALWARE_SCANNER_TIMEOUT_MS = '50'; // 50ms short timeout
      scannerService = new EvidenceScannerService();
      scannerService.registerEngine({
        engineName: 'HangingScannerEngine',
        isConfigured: () => true,
        scan: async () => {
          await new Promise((resolve) => setTimeout(resolve, 300));
          return { status: EvidenceScanStatus.CLEAN, engineName: 'HangingScannerEngine' };
        },
      });

      const buffer = Buffer.from('%PDF-1.4 sample');
      const status = await scannerService.scanFile('org/key-timeout', buffer);
      expect(status).toBe(EvidenceScanStatus.SCAN_FAILED);
      delete process.env.MALWARE_SCANNER_TIMEOUT_MS;
    });

    it('Condition 6: Malformed scanner response -> returns SCAN_FAILED', async () => {
      process.env.ENABLE_MALWARE_SCANNER = 'true';
      scannerService = new EvidenceScannerService();
      scannerService.registerEngine({
        engineName: 'FaultyEngine',
        isConfigured: () => true,
        scan: async () => {
          throw new SyntaxError('Unexpected token < in JSON at position 0 (HTML error page returned instead of JSON)');
        },
      });

      const buffer = Buffer.from('%PDF-1.4 sample');
      const status = await scannerService.scanFile('org/key-malformed', buffer);
      expect(status).toBe(EvidenceScanStatus.SCAN_FAILED);
    });

    it('Condition 7: Scanner reports infected -> returns QUARANTINED', async () => {
      process.env.ENABLE_MALWARE_SCANNER = 'true';
      scannerService = new EvidenceScannerService();
      scannerService.registerEngine({
        engineName: 'ClamAvEngine',
        isConfigured: () => true,
        scan: async () => ({
          status: EvidenceScanStatus.QUARANTINED,
          threatName: 'Win32.Trojan.Downloader',
          engineName: 'ClamAvEngine',
        }),
      });

      const infectedBuffer = Buffer.from('%PDF-1.4 malicious binary content');
      const status = await scannerService.scanFile('org/key-infected-real', infectedBuffer);
      expect(status).toBe(EvidenceScanStatus.QUARANTINED);
    });

    it('Condition 7b: Detects EICAR test signature probe and returns QUARANTINED', async () => {
      process.env.ENABLE_MALWARE_SCANNER = 'true';
      scannerService = new EvidenceScannerService();

      const infectedBuffer = Buffer.from(`%PDF-1.4 ${EICAR_STANDARD_TEST_STRING} payload`);
      const status = await scannerService.scanFile('org/key-infected-eicar', infectedBuffer);
      expect(status).toBe(EvidenceScanStatus.QUARANTINED);
    });

    it('Condition 8: Scanner reports clean -> returns CLEAN only after real engine inspection', async () => {
      process.env.ENABLE_MALWARE_SCANNER = 'true';
      scannerService = new EvidenceScannerService();
      scannerService.registerEngine({
        engineName: 'ProductionClamAvDaemon',
        isConfigured: () => true,
        scan: async () => ({
          status: EvidenceScanStatus.CLEAN,
          engineName: 'ProductionClamAvDaemon',
        }),
      });

      const buffer = Buffer.from('%PDF-1.4 clean document verified by scanner');
      const status = await scannerService.scanFile('org/key-clean', buffer);

      expect(status).toBe(EvidenceScanStatus.CLEAN);
      expect(scannerService.isClean(status)).toBe(true);
      expect(scannerService.canBeProcessed(status)).toBe(true);
    });

    it('Condition 9: Scanner process crashes / uncaught exception -> returns SCAN_FAILED', async () => {
      process.env.ENABLE_MALWARE_SCANNER = 'true';
      scannerService = new EvidenceScannerService();
      scannerService.registerEngine({
        engineName: 'CrashingEngine',
        isConfigured: () => true,
        scan: async () => {
          throw new Error('Fatal worker crash SIGSEGV in libclamav.so');
        },
      });

      const buffer = Buffer.from('%PDF-1.4 sample');
      const status = await scannerService.scanFile('org/key-crash', buffer);
      expect(status).toBe(EvidenceScanStatus.SCAN_FAILED);
    });

    it('Condition 10: Scanner returns unknown / unsupported status string -> returns SCAN_FAILED', async () => {
      process.env.ENABLE_MALWARE_SCANNER = 'true';
      scannerService = new EvidenceScannerService();
      scannerService.registerEngine({
        engineName: 'BizarreEngine',
        isConfigured: () => true,
        scan: async () => ({
          status: 'UNRECOGNIZED_CUSTOM_STRING' as any,
          engineName: 'BizarreEngine',
        }),
      });

      const buffer = Buffer.from('%PDF-1.4 sample');
      const status = await scannerService.scanFile('org/key-unknown-status', buffer);
      expect(status).toBe(EvidenceScanStatus.SCAN_FAILED);
    });
  });

  describe('3. EvidenceService Upload Lifecycle, DB Failure Compensation & Download Security', () => {
    let evidenceService: EvidenceService;
    let prisma: any;
    let auditLogsService: any;
    let resourceAuthService: any;
    let storageService: any;
    let scannerService: any;

    beforeEach(async () => {
      prisma = {
        evidence: {
          create: jest.fn(),
          findFirst: jest.fn(),
          findUnique: jest.fn(),
        },
        auditEvidence: {
          findFirst: jest.fn(),
        },
        user: {
          findMany: jest.fn().mockResolvedValue([]),
          findUnique: jest.fn(),
        },
        controlEvidence: {
          create: jest.fn(),
          upsert: jest.fn(),
        },
        riskEvidence: {
          create: jest.fn(),
          upsert: jest.fn(),
        },
        policyEvidence: {
          create: jest.fn(),
          upsert: jest.fn(),
        },
        auditCheckItemEvidence: {
          create: jest.fn(),
          upsert: jest.fn(),
        },
        auditFindingEvidence: {
          create: jest.fn(),
          upsert: jest.fn(),
        },
        vendorEvidence: {
          create: jest.fn(),
          upsert: jest.fn(),
        },
        vulnerabilityEvidence: {
          create: jest.fn(),
          upsert: jest.fn(),
        },
        incidentEvidence: {
          create: jest.fn(),
          upsert: jest.fn(),
        },
        frameworkReference: {
          findUnique: jest.fn(),
        },
        evidenceFrameworkReference: {
          create: jest.fn(),
        },
        $transaction: jest.fn((cb) => cb(prisma)),
      };

      auditLogsService = {
        log: jest.fn().mockResolvedValue({}),
      };

      resourceAuthService = {
        authorize: jest.fn().mockResolvedValue(true),
        getScopeWhereClause: jest.fn().mockResolvedValue({ organizationId: 'org-wp3-1' }),
      };

      storageService = {
        saveFile: jest.fn().mockResolvedValue({
          storageKey: 'org-wp3-1/test-file.pdf',
          checksum: 'sha256-hash-baseline',
          fileSize: 1024,
          mimeType: 'application/pdf',
          originalFileName: 'test-file.pdf',
        }),
        getFileStream: jest.fn(),
        deleteFile: jest.fn().mockResolvedValue(true),
        verifyIntegrity: jest.fn().mockResolvedValue({ matched: true, actualChecksum: 'sha256-hash-baseline', expectedChecksum: 'sha256-hash-baseline' }),
      };

      scannerService = {
        scanFile: jest.fn().mockResolvedValue(EvidenceScanStatus.CLEAN),
      };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          EvidenceService,
          { provide: PrismaService, useValue: prisma },
          { provide: AuditLogsService, useValue: auditLogsService },
          { provide: ResourceAuthorizationService, useValue: resourceAuthService },
          { provide: EvidenceStorageService, useValue: storageService },
          { provide: EvidenceScannerService, useValue: scannerService },
        ],
      }).compile();

      evidenceService = module.get<EvidenceService>(EvidenceService);
    });

    it('createAndUpload marks evidence ACTIVE when scanStatus is CLEAN', async () => {
      scannerService.scanFile.mockResolvedValue(EvidenceScanStatus.CLEAN);
      prisma.evidence.create.mockResolvedValue({
        id: 'ev-clean-1',
        organizationId: 'org-wp3-1',
        title: 'Clean Audit Document',
        fileName: 'test-file.pdf',
        fileSize: 1024,
        mimeType: 'application/pdf',
        storageKey: 'org-wp3-1/test-file.pdf',
        checksum: 'sha256-hash-baseline',
        status: EvidenceStatus.ACTIVE,
        scanStatus: EvidenceScanStatus.CLEAN,
        uploadedById: 'user-wp3-1',
        createdAt: new Date(),
        updatedAt: new Date(),
        retentionUntil: null,
      });

      prisma.evidence.findUnique.mockResolvedValue({
        id: 'ev-clean-1',
        organizationId: 'org-wp3-1',
        title: 'Clean Audit Document',
        fileName: 'test-file.pdf',
        fileSize: 1024,
        mimeType: 'application/pdf',
        storageKey: 'org-wp3-1/test-file.pdf',
        checksum: 'sha256-hash-baseline',
        status: EvidenceStatus.ACTIVE,
        scanStatus: EvidenceScanStatus.CLEAN,
        uploadedById: 'user-wp3-1',
        createdAt: new Date(),
        updatedAt: new Date(),
        retentionUntil: null,
        controlAssociations: [],
        riskAssociations: [],
        policyAssociations: [],
        auditCheckAssociations: [],
        auditFindingAssociations: [],
        vendorAssociations: [],
        vulnerabilityAssociations: [],
        incidentAssociations: [],
        frameworkReferences: [],
      });

      const res = await evidenceService.createAndUpload(
        authCtx,
        { originalname: 'test-file.pdf', buffer: Buffer.from('%PDF-1.4 sample'), mimetype: 'application/pdf' },
        { title: 'Clean Audit Document' },
      );

      expect(prisma.evidence.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: EvidenceStatus.ACTIVE,
            scanStatus: EvidenceScanStatus.CLEAN,
          }),
        }),
      );
      expect(res.id).toBe('ev-clean-1');
    });

    it('createAndUpload marks evidence PENDING when scanner returns PENDING_SCAN', async () => {
      scannerService.scanFile.mockResolvedValue(EvidenceScanStatus.PENDING_SCAN);
      prisma.evidence.create.mockResolvedValue({
        id: 'ev-pending-1',
        organizationId: 'org-wp3-1',
        title: 'Pending Scan Document',
        fileName: 'test-file.pdf',
        fileSize: 1024,
        mimeType: 'application/pdf',
        storageKey: 'org-wp3-1/test-file.pdf',
        checksum: 'sha256-hash-baseline',
        status: EvidenceStatus.PENDING,
        scanStatus: EvidenceScanStatus.PENDING_SCAN,
        uploadedById: 'user-wp3-1',
        createdAt: new Date(),
        updatedAt: new Date(),
        retentionUntil: null,
      });

      prisma.evidence.findUnique.mockResolvedValue({
        id: 'ev-pending-1',
        organizationId: 'org-wp3-1',
        title: 'Pending Scan Document',
        fileName: 'test-file.pdf',
        fileSize: 1024,
        mimeType: 'application/pdf',
        storageKey: 'org-wp3-1/test-file.pdf',
        checksum: 'sha256-hash-baseline',
        status: EvidenceStatus.PENDING,
        scanStatus: EvidenceScanStatus.PENDING_SCAN,
        uploadedById: 'user-wp3-1',
        createdAt: new Date(),
        updatedAt: new Date(),
        retentionUntil: null,
        controlAssociations: [],
        riskAssociations: [],
        policyAssociations: [],
        auditCheckAssociations: [],
        auditFindingAssociations: [],
        vendorAssociations: [],
        vulnerabilityAssociations: [],
        incidentAssociations: [],
        frameworkReferences: [],
      });

      await evidenceService.createAndUpload(
        authCtx,
        { originalname: 'test-file.pdf', buffer: Buffer.from('%PDF-1.4 sample'), mimetype: 'application/pdf' },
        { title: 'Pending Scan Document' },
      );

      expect(prisma.evidence.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: EvidenceStatus.PENDING,
            scanStatus: EvidenceScanStatus.PENDING_SCAN,
          }),
        }),
      );
    });

    it('PARTIAL FAILURE COMPENSATION: deletes saved storage file if DB creation fails', async () => {
      prisma.evidence.create.mockRejectedValue(new Error('DB Connection Timeout or Constraint Failure'));

      await expect(
        evidenceService.createAndUpload(
          authCtx,
          { originalname: 'test-file.pdf', buffer: Buffer.from('%PDF-1.4 sample'), mimetype: 'application/pdf' },
          { title: 'Failed Persistence Document' },
        ),
      ).rejects.toThrow('DB Connection Timeout or Constraint Failure');

      // Verify that compensation deleted the orphaned file from disk
      expect(storageService.deleteFile).toHaveBeenCalledWith('org-wp3-1/test-file.pdf');
    });

    it('OBSERVABLE ORPHAN ALERT: logs STORAGE_ORPHAN_CLEANUP_FAILED when DB fails AND storage deletion also fails', async () => {
      prisma.evidence.create.mockRejectedValue(new Error('Database unique constraint failed'));
      storageService.deleteFile.mockResolvedValue(false); // Simulated storage cleanup failure (e.g. disk locked or network fail)

      await expect(
        evidenceService.createAndUpload(
          authCtx,
          { originalname: 'test-file.pdf', buffer: Buffer.from('%PDF-1.4 sample'), mimetype: 'application/pdf' },
          { title: 'Double Failure Document' },
        ),
      ).rejects.toThrow('Database unique constraint failed');

      expect(storageService.deleteFile).toHaveBeenCalledWith('org-wp3-1/test-file.pdf');
      expect(auditLogsService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'STORAGE_ORPHAN_CLEANUP_FAILED',
          metadata: expect.objectContaining({
            storageKey: 'org-wp3-1/test-file.pdf',
          }),
        }),
      );
    });

    it('downloadEvidence rejects PENDING_SCAN and SCAN_FAILED files with ForbiddenException', async () => {
      prisma.evidence.findFirst.mockResolvedValueOnce({
        id: 'ev-pending',
        title: 'Unverified File',
        status: EvidenceStatus.PENDING,
        scanStatus: EvidenceScanStatus.PENDING_SCAN,
      });

      const mockRes: any = {};
      await expect(evidenceService.downloadEvidence(authCtx, 'ev-pending', mockRes)).rejects.toThrow(ForbiddenException);

      prisma.evidence.findFirst.mockResolvedValueOnce({
        id: 'ev-failed-scan',
        title: 'Scanner Failed File',
        status: EvidenceStatus.QUARANTINED,
        scanStatus: EvidenceScanStatus.SCAN_FAILED,
      });

      await expect(evidenceService.downloadEvidence(authCtx, 'ev-failed-scan', mockRes)).rejects.toThrow(ForbiddenException);
    });

    it('TAMPER DETECTION: downloadEvidence verifies cryptographic hash and throws InternalServerErrorException on checksum mismatch', async () => {
      prisma.evidence.findFirst.mockResolvedValue({
        id: 'ev-tampered',
        title: 'Altered Audit Log',
        fileName: 'tampered.log',
        mimeType: 'text/plain',
        storageKey: 'org-wp3-1/tampered.log',
        checksum: 'expected-original-sha256',
        status: EvidenceStatus.ACTIVE,
        scanStatus: EvidenceScanStatus.CLEAN,
      });

      // Storage returns mismatch indicating silent corruption or bit rot / disk tampering
      storageService.verifyIntegrity.mockResolvedValue({
        matched: false,
        actualChecksum: 'corrupted-or-malicious-sha256',
        expectedChecksum: 'expected-original-sha256',
      });

      const mockRes: any = { setHeader: jest.fn() };
      await expect(evidenceService.downloadEvidence(authCtx, 'ev-tampered', mockRes)).rejects.toThrow(InternalServerErrorException);

      // Verify that critical audit log was recorded
      expect(auditLogsService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'EVIDENCE_TAMPER_DETECTED',
          entityType: 'Evidence',
          entityId: 'ev-tampered',
          metadata: expect.objectContaining({
            expectedChecksum: 'expected-original-sha256',
            actualChecksum: 'corrupted-or-malicious-sha256',
          }),
        }),
      );
    });

    it('downloadEvidence enforces safe HTTP headers (nosniff, attachment, CSP, no-cache)', async () => {
      const mockStream = { pipe: jest.fn() };
      prisma.evidence.findFirst.mockResolvedValue({
        id: 'ev-safe-dl',
        title: 'Clean SOC2 Report',
        fileName: 'soc2_report.pdf',
        mimeType: 'application/pdf',
        storageKey: 'org-wp3-1/soc2_report.pdf',
        checksum: 'valid-sha256',
        status: EvidenceStatus.ACTIVE,
        scanStatus: EvidenceScanStatus.CLEAN,
      });

      storageService.verifyIntegrity.mockResolvedValue({ matched: true, actualChecksum: 'valid-sha256', expectedChecksum: 'valid-sha256' });
      storageService.getFileStream.mockReturnValue({ stream: mockStream, filePath: '/tmp/soc2.pdf', contentLength: 1024 });

      const headers: Record<string, string> = {};
      const mockRes: any = {
        setHeader: jest.fn((k, v) => {
          headers[k] = v;
        }),
      };

      await evidenceService.downloadEvidence(authCtx, 'ev-safe-dl', mockRes);

      expect(headers['Content-Type']).toBe('application/pdf');
      expect(headers['X-Content-Type-Options']).toBe('nosniff');
      expect(headers['Content-Security-Policy']).toBe("default-src 'none'");
      expect(headers['Cache-Control']).toBe('private, no-cache, no-store, must-revalidate');
      expect(headers['Content-Disposition']).toContain('attachment');
      expect(headers['Content-Disposition']).toContain('soc2_report.pdf');
      expect(mockStream.pipe).toHaveBeenCalledWith(mockRes);
    });

    it('verifyEvidenceIntegrity provides on-demand verification with tenant isolation', async () => {
      prisma.evidence.findFirst.mockResolvedValue({
        id: 'ev-verify-1',
        fileName: 'policy.pdf',
        storageKey: 'org-wp3-1/policy.pdf',
        checksum: 'recorded-sha',
      });

      storageService.verifyIntegrity.mockResolvedValue({
        matched: true,
        actualChecksum: 'recorded-sha',
        expectedChecksum: 'recorded-sha',
      });

      const res = await evidenceService.verifyEvidenceIntegrity(authCtx, 'ev-verify-1');
      expect(res.matched).toBe(true);
      expect(res.actualChecksum).toBe('recorded-sha');
    });
  });

  describe('4. Document Intelligence Hard Gate: Blocking Unverified / Infected Documents', () => {
    let docIntelService: DocumentIntelligenceService;
    let queueService: AnalysisQueueService;
    let prisma: any;
    let resourceAuthService: any;

    beforeEach(async () => {
      prisma = {
        evidence: {
          findFirst: jest.fn(),
        },
        documentAnalysis: {
          create: jest.fn(),
          findFirst: jest.fn().mockResolvedValue(null),
          update: jest.fn().mockResolvedValue({}),
        },
        analysisRun: {
          create: jest.fn(),
        },
        organizationControlStateProjection: {
          findUnique: jest.fn().mockResolvedValue(null),
        },
      };

      resourceAuthService = {
        getScopeWhereClause: jest.fn().mockResolvedValue({ organizationId: 'org-wp3-1' }),
      };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          DocumentIntelligenceService,
          AnalysisQueueService,
          { provide: PrismaService, useValue: prisma },
          { provide: AuditLogsService, useValue: { log: jest.fn() } },
          { provide: FrameworkEntitlementsService, useValue: { isEntitled: jest.fn().mockResolvedValue(true) } },
          { provide: ResourceAuthorizationService, useValue: resourceAuthService },
          { provide: AiRouterService, useValue: {} },
          { provide: DocumentExtractionService, useValue: { extract: jest.fn() } },
          {
            provide: EffectiveServiceStateResolver,
            useValue: {
              resolveEffectiveState: jest.fn().mockResolvedValue({ isAvailable: true }),
            },
          },
        ],
      }).compile();

      docIntelService = module.get<DocumentIntelligenceService>(DocumentIntelligenceService);
      queueService = module.get<AnalysisQueueService>(AnalysisQueueService);
    });

    it('createAnalysis blocks unscanned evidence (PENDING_SCAN) with ForbiddenException', async () => {
      prisma.evidence.findFirst.mockResolvedValue({
        id: 'ev-unscanned',
        scanStatus: EvidenceScanStatus.PENDING_SCAN,
        status: EvidenceStatus.PENDING,
      });

      await expect(
        docIntelService.createAnalysis(authCtx, 'ev-unscanned', {}),
      ).rejects.toThrow(ForbiddenException);
    });

    it('createAnalysis blocks quarantined / infected evidence with ForbiddenException', async () => {
      prisma.evidence.findFirst.mockResolvedValue({
        id: 'ev-quarantined',
        scanStatus: EvidenceScanStatus.QUARANTINED,
        status: EvidenceStatus.QUARANTINED,
      });

      await expect(
        docIntelService.createAnalysis(authCtx, 'ev-quarantined', {}),
      ).rejects.toThrow(ForbiddenException);
    });

    it('createAnalysis blocks scan-failed evidence with ForbiddenException', async () => {
      prisma.evidence.findFirst.mockResolvedValue({
        id: 'ev-scan-failed',
        scanStatus: EvidenceScanStatus.SCAN_FAILED,
        status: EvidenceStatus.QUARANTINED,
      });

      await expect(
        docIntelService.createAnalysis(authCtx, 'ev-scan-failed', {}),
      ).rejects.toThrow(ForbiddenException);
    });

    it('createAnalysis permits processing for verified CLEAN and ACTIVE evidence', async () => {
      prisma.evidence.findFirst.mockResolvedValue({
        id: 'ev-clean-ready',
        organizationId: 'org-wp3-1',
        scanStatus: EvidenceScanStatus.CLEAN,
        status: EvidenceStatus.ACTIVE,
        fileName: 'clean.pdf',
        fileSize: 1024,
        mimeType: 'application/pdf',
        checksum: 'sha-clean',
      });

      prisma.documentAnalysis.create.mockResolvedValue({
        id: 'analysis-1',
        organizationId: 'org-wp3-1',
        evidenceId: 'ev-clean-ready',
        status: 'PENDING',
        runs: [],
        findings: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      jest.spyOn(queueService, 'enqueueAnalysis').mockResolvedValue('analysis-1');

      const res = await docIntelService.createAnalysis(authCtx, 'ev-clean-ready', {});
      expect(res).toBeDefined();
    });

    it('WORKER GATE: processJob aborts worker extraction and marks analysis FAILED when evidence is not CLEAN', async () => {
      prisma.documentAnalysis.findFirst.mockResolvedValue({
        id: 'analysis-worker-test',
        organizationId: 'org-wp3-1',
        evidenceId: 'ev-infected',
        evidence: {
          id: 'ev-infected',
          scanStatus: EvidenceScanStatus.QUARANTINED,
          status: EvidenceStatus.QUARANTINED,
        },
      });

      await queueService.processJob({
        analysisId: 'analysis-worker-test',
        organizationId: 'org-wp3-1',
        userId: 'user-1',
        evidenceId: 'ev-infected',
        isDurable: false,
      });

      expect(prisma.documentAnalysis.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'analysis-worker-test' },
          data: expect.objectContaining({
            status: AnalysisStatus.FAILED,
            errorMessage: expect.stringContaining('MALWARE_SCAN_UNVERIFIED'),
          }),
        }),
      );
    });
  });
});
