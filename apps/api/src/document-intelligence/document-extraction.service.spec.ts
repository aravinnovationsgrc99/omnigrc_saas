import { Test, TestingModule } from '@nestjs/testing';
import { DocumentExtractionService } from './document-extraction.service';
import { ExtractionStatus } from '@omnigrc/shared';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

describe('DocumentExtractionService (Phase 1: Real Extraction & Fallback Removal)', () => {
  let service: DocumentExtractionService;
  let tempDir: string;

  // Repository-owned fixtures located under apps/api/test/fixtures/document-intelligence/
  const repoRoot = path.resolve(__dirname, '../../../../');
  const fixturesDir = path.resolve(__dirname, '../../test/fixtures/document-intelligence');
  const compressedPdfFixture = path.join(fixturesDir, 'compressed-doc.pdf');
  const invalidPdfFixture = path.join(fixturesDir, 'corrupted.pdf');
  const docxFixture = path.join(fixturesDir, 'single-paragraph.docx');
  const emptyDocxFixture = path.join(fixturesDir, 'empty.docx');

  beforeAll(async () => {
    tempDir = path.resolve(process.cwd(), 'uploads', 'test-extraction-fixtures');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
  });

  afterAll(async () => {
    if (fs.existsSync(tempDir)) {
      await fs.promises.rm(tempDir, { recursive: true, force: true });
    }
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [DocumentExtractionService],
    }).compile();

    service = module.get<DocumentExtractionService>(DocumentExtractionService);
  });

  describe('1. Real Compressed PDF Extraction', () => {
    it('should extract meaningful text from a real FlateDecode compressed PDF fixture', async () => {
      expect(fs.existsSync(compressedPdfFixture)).toBe(true);

      const result = await service.extract(
        compressedPdfFixture,
        'compressed-doc.pdf',
        'application/pdf',
      );

      expect(result.extractionStatus).toBe(ExtractionStatus.SUCCESS);
      expect(result.extractionMethod).toBe('PdfExtractor');
      expect(result.ocrUsed).toBe(false);
      expect(result.pageCount).toBeGreaterThan(0);
      expect(result.sections.length).toBeGreaterThan(0);

      // Verify specific text from the compressed stream was parsed
      expect(result.fullText).toContain('Turk J Med Sci');
      expect(result.sections[0].page).toBe(1);
      expect(result.sections[0].text.length).toBeGreaterThan(0);
    });

    it('should preserve page boundaries and associate sections with page numbers', async () => {
      const result = await service.extract(
        compressedPdfFixture,
        'compressed-doc.pdf',
        'application/pdf',
      );

      expect(result.sections.length).toBeGreaterThan(1);
      expect(result.sections[0].page).toBe(1);
      expect(result.sections[1].page).toBe(2);
    });
  });

  describe('1.5 Isolated Subprocess PDF Parsing & Resource Governance', () => {
    it('should enforce execution timeout and terminate child process when parser exceeds limit', async () => {
      // 1ms timeout triggers guaranteed timeout on real PDF fixture
      const result = await service.extract(
        compressedPdfFixture,
        'timeout-test.pdf',
        'application/pdf',
        { timeoutMs: 1 },
      );

      expect(result.extractionStatus).toBe(ExtractionStatus.MALFORMED_DOCUMENT);
      expect(result.fullText).toBe('');
      expect(result.sections).toEqual([]);
      expect(result.truncationReason).toContain('timed out');
    });

    it('should enforce max page limits and truncate excess pages in child process', async () => {
      const result = await service.extract(
        compressedPdfFixture,
        'page-limit.pdf',
        'application/pdf',
        { maxPages: 2 },
      );

      expect(result.extractionStatus).toBe(ExtractionStatus.SUCCESS);
      expect(result.pageCount).toBe(5);
      expect(result.isTruncated).toBe(true);
      expect(result.truncationReason).toContain('limit of 2');
      expect(result.sections.length).toBe(2);
      expect(result.sections.map((s) => s.page)).toEqual([1, 2]);
    });

    it('should enforce max character bounds and truncate text safely in child process', async () => {
      const result = await service.extract(
        compressedPdfFixture,
        'text-limit.pdf',
        'application/pdf',
        { maxTextLength: 120 },
      );

      expect(result.extractionStatus).toBe(ExtractionStatus.SUCCESS);
      expect(result.isTruncated).toBe(true);
      expect(result.fullText.length).toBe(120);
      expect(result.truncationReason).toContain('max limit of 120 characters');
    });
  });

  describe('2. Real DOCX Extraction', () => {
    it('should extract text from a real ZIP-compressed DOCX fixture', async () => {
      expect(fs.existsSync(docxFixture)).toBe(true);

      const result = await service.extract(
        docxFixture,
        'policy.docx',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      );

      expect(result.extractionStatus).toBe(ExtractionStatus.SUCCESS);
      expect(result.extractionMethod).toBe('OfficeDocumentExtractor (DOCX)');
      expect(result.ocrUsed).toBe(false);
      expect(result.fullText).toContain('Walking on imported air');
      expect(result.sections.length).toBe(1);
      expect(result.sections[0].title).toBe('Paragraph 1');
      expect(result.sections[0].text).toBe('Walking on imported air');
    });
  });

  describe('3. Removal of Fabricated Fallbacks (Missing Files)', () => {
    it('should explicitly reject missing files with NotFoundException and never fabricate compliance text', async () => {
      const missingFilePath = path.join(tempDir, 'non_existent_policy.pdf');

      await expect(
        service.extract(missingFilePath, 'non_existent_policy.pdf', 'application/pdf'),
      ).rejects.toThrow(NotFoundException);

      try {
        await service.extract(missingFilePath, 'non_existent_policy.pdf', 'application/pdf');
      } catch (err: any) {
        expect(err.message).toBe('Document file not found on storage disk.');
        // Verify no internal filesystem path leakage in client-facing exception message
        expect(err.message).not.toContain(tempDir);
        expect(err.message).not.toContain(missingFilePath);
      }
    });
  });

  describe('4. Empty and Scanned Documents', () => {
    it('should return EMPTY_DOCUMENT and empty fullText for a 0-byte PDF without fabricating text', async () => {
      const emptyPdfPath = path.join(tempDir, 'empty.pdf');
      await fs.promises.writeFile(emptyPdfPath, Buffer.alloc(0));

      const result = await service.extract(emptyPdfPath, 'empty.pdf', 'application/pdf');

      expect(result.extractionStatus).toBe(ExtractionStatus.EMPTY_DOCUMENT);
      expect(result.fullText).toBe('');
      expect(result.sections).toEqual([]);
      expect(result.ocrUsed).toBe(false);
      // Ensure no fabricated compliance policy text exists
      expect(result.fullText).not.toContain('Mandatory access control logs');
    });

    it('should return EMPTY_DOCUMENT for an empty DOCX fixture', async () => {
      expect(fs.existsSync(emptyDocxFixture)).toBe(true);

      const result = await service.extract(
        emptyDocxFixture,
        'empty.docx',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      );

      expect(result.extractionStatus).toBe(ExtractionStatus.EMPTY_DOCUMENT);
      expect(result.fullText).toBe('');
      expect(result.sections).toEqual([]);
      expect(result.ocrUsed).toBe(false);
    });

    it('should report OCR_UNAVAILABLE for image files without claiming OCR or fabricating findings', async () => {
      const imgPath = path.join(tempDir, 'scan.png');
      await fs.promises.writeFile(imgPath, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));

      const result = await service.extract(imgPath, 'scan.png', 'image/png');

      expect(result.extractionStatus).toBe(ExtractionStatus.OCR_UNAVAILABLE);
      expect(result.ocrUsed).toBe(false);
      expect(result.fullText).toContain('OCR UNAVAILABLE');
      expect(result.sections).toEqual([]);
    });
  });

  describe('5. Malformed Input Handling', () => {
    it('should return MALFORMED_DOCUMENT for a corrupted or malformed PDF structure', async () => {
      expect(fs.existsSync(invalidPdfFixture)).toBe(true);

      const result = await service.extract(
        invalidPdfFixture,
        'corrupted.pdf',
        'application/pdf',
      );

      expect(result.extractionStatus).toBe(ExtractionStatus.MALFORMED_DOCUMENT);
      expect(result.fullText).toBe('');
      expect(result.sections).toEqual([]);
      expect(result.ocrUsed).toBe(false);
    });

    it('should return MALFORMED_DOCUMENT for a non-zip file masquerading as DOCX', async () => {
      const corruptDocxPath = path.join(tempDir, 'fake.docx');
      await fs.promises.writeFile(corruptDocxPath, Buffer.from('NOT A ZIP ARCHIVE CONTENT'));

      const result = await service.extract(
        corruptDocxPath,
        'fake.docx',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      );

      expect(result.extractionStatus).toBe(ExtractionStatus.MALFORMED_DOCUMENT);
      expect(result.fullText).toBe('');
      expect(result.sections).toEqual([]);
    });
  });

  describe('6. Unsupported File Formats', () => {
    it('should explicitly reject legacy binary .doc files as UNSUPPORTED_FORMAT', async () => {
      const legacyDocPath = path.join(tempDir, 'legacy_policy.doc');
      // OLE2 Compound File Header signature: D0 CF 11 E0 A1 B1 1A E1
      await fs.promises.writeFile(legacyDocPath, Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]));

      const result = await service.extract(
        legacyDocPath,
        'legacy_policy.doc',
        'application/msword',
      );

      expect(result.extractionStatus).toBe(ExtractionStatus.UNSUPPORTED_FORMAT);
      expect(result.extractionMethod).toBe('OfficeDocumentExtractor (DOC)');
      expect(result.fullText).toBe('');
      expect(result.sections).toEqual([]);
    });

    it('should return UNSUPPORTED_FORMAT for unsupported binary executables or unknown extensions', async () => {
      const exePath = path.join(tempDir, 'binary.exe');
      await fs.promises.writeFile(exePath, Buffer.from('MZ\x90\x00\x03\x00\x00\x00'));

      const result = await service.extract(exePath, 'binary.exe', 'application/x-msdownload');

      expect(result.extractionStatus).toBe(ExtractionStatus.UNSUPPORTED_FORMAT);
      expect(result.fullText).toBe('');
    });
  });

  describe('7. Path Safety & Canonical Traversal Prevention', () => {
    it('should reject filename containing path traversal symbols with BadRequestException', async () => {
      const dummyFile = path.join(tempDir, 'safe.txt');
      await fs.promises.writeFile(dummyFile, 'hello');

      await expect(
        service.extract(dummyFile, '../../etc/passwd', 'text/plain'),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.extract(dummyFile, 'sub/folder/file.pdf', 'application/pdf'),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.extract(dummyFile, 'sub\\folder\\file.pdf', 'application/pdf'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject filenames exceeding 255 characters with BadRequestException', async () => {
      const dummyFile = path.join(tempDir, 'safe.txt');
      await fs.promises.writeFile(dummyFile, 'hello');

      const overlyLongName = 'a'.repeat(256) + '.pdf';
      await expect(
        service.extract(dummyFile, overlyLongName, 'application/pdf'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject file paths containing null bytes with BadRequestException', async () => {
      await expect(
        service.extract('safe.txt\0/malicious', 'safe.txt', 'text/plain'),
      ).rejects.toThrow(BadRequestException);
    });

    // 1. Valid file inside the evidence root
    it('should resolve and extract a valid file inside the evidence root', async () => {
      const evidenceRootDir = path.join(tempDir, 'evidence_root');
      if (!fs.existsSync(evidenceRootDir)) {
        fs.mkdirSync(evidenceRootDir, { recursive: true });
      }
      const safeFile = path.join(evidenceRootDir, 'valid_policy.txt');
      await fs.promises.writeFile(safeFile, 'Valid Policy Content for GRC Audit');

      const resolved = service.resolveAndValidatePath(evidenceRootDir, 'valid_policy.txt');
      expect(resolved).toBe(fs.realpathSync(safeFile));

      const result = await service.extract('valid_policy.txt', 'valid_policy.txt', 'text/plain', { baseDir: evidenceRootDir });
      expect(result.extractionStatus).toBe(ExtractionStatus.SUCCESS);
      expect(result.fullText).toBe('Valid Policy Content for GRC Audit');
    });

    // 2. ../ traversal
    it('should reject ../ traversal attempts with BadRequestException', () => {
      const evidenceRootDir = path.join(tempDir, 'evidence_root');
      if (!fs.existsSync(evidenceRootDir)) {
        fs.mkdirSync(evidenceRootDir, { recursive: true });
      }
      expect(() => service.resolveAndValidatePath(evidenceRootDir, '../outside.txt')).toThrow(BadRequestException);
      expect(() => service.resolveAndValidatePath(evidenceRootDir, 'sub/../../outside.txt')).toThrow(BadRequestException);
      expect(() => service.resolveAndValidatePath(evidenceRootDir, '..\\outside.txt')).toThrow(BadRequestException);
    });

    // 3. Absolute paths
    it('should reject absolute paths with BadRequestException', () => {
      const evidenceRootDir = path.join(tempDir, 'evidence_root');
      if (!fs.existsSync(evidenceRootDir)) {
        fs.mkdirSync(evidenceRootDir, { recursive: true });
      }
      expect(() => service.resolveAndValidatePath(evidenceRootDir, '/etc/passwd')).toThrow(BadRequestException);
      expect(() => service.resolveAndValidatePath(evidenceRootDir, 'C:\\Windows\\win.ini')).toThrow(BadRequestException);
      expect(() => service.resolveAndValidatePath(evidenceRootDir, '\\\\server\\share\\file')).toThrow(BadRequestException);
    });

    // 4. Encoded or separator variants where relevant to the storage-key contract
    it('should reject encoded traversal variants and null byte injections', () => {
      const evidenceRootDir = path.join(tempDir, 'evidence_root');
      if (!fs.existsSync(evidenceRootDir)) {
        fs.mkdirSync(evidenceRootDir, { recursive: true });
      }
      expect(() => service.resolveAndValidatePath(evidenceRootDir, '%2e%2e/outside.txt')).toThrow(BadRequestException);
      expect(() => service.resolveAndValidatePath(evidenceRootDir, '%2e%2e%2foutside.txt')).toThrow(BadRequestException);
      expect(() => service.resolveAndValidatePath(evidenceRootDir, 'foo\\..\\..\\outside.txt')).toThrow(BadRequestException);
      expect(() => service.resolveAndValidatePath(evidenceRootDir, 'safe.txt\0/escape')).toThrow(BadRequestException);
    });

    // 5. Symlink targeting a file outside the root
    it('should reject a symlink targeting a file outside the evidence root', async () => {
      const outsideFile = path.join(tempDir, 'outside_secret.txt');
      await fs.promises.writeFile(outsideFile, 'TOP_SECRET_CREDENTIALS');

      const evidenceRootDir = path.join(tempDir, 'evidence_root');
      if (!fs.existsSync(evidenceRootDir)) {
        fs.mkdirSync(evidenceRootDir, { recursive: true });
      }

      const symlinkPath = path.join(evidenceRootDir, 'symlink_to_outside.txt');
      let symlinkCreated = false;
      try {
        if (fs.existsSync(symlinkPath)) fs.unlinkSync(symlinkPath);
        fs.symlinkSync(outsideFile, symlinkPath, 'file');
        symlinkCreated = true;
      } catch (err: any) {
        // Windows non-elevated developer environments may disallow creating symlinks (EPERM)
        console.warn('Filesystem does not permit unprivileged symlink creation in this environment:', err.message);
      }

      if (symlinkCreated) {
        expect(() => {
          service.resolveAndValidatePath(evidenceRootDir, 'symlink_to_outside.txt');
        }).toThrow(BadRequestException);

        await expect(
          service.extract('symlink_to_outside.txt', 'symlink.txt', 'text/plain', { baseDir: evidenceRootDir }),
        ).rejects.toThrow(BadRequestException);
      } else {
        expect(service.resolveAndValidatePath).toBeDefined();
      }
    });

    // 6. Missing file
    it('should reject missing files with NotFoundException and never leak local paths', () => {
      const evidenceRootDir = path.join(tempDir, 'evidence_root');
      if (!fs.existsSync(evidenceRootDir)) {
        fs.mkdirSync(evidenceRootDir, { recursive: true });
      }
      try {
        service.resolveAndValidatePath(evidenceRootDir, 'non_existent_policy.pdf');
        fail('Expected NotFoundException');
      } catch (err: any) {
        expect(err).toBeInstanceOf(NotFoundException);
        expect(err.message).toBe('Document file not found on storage disk.');
        expect(err.message).not.toContain(evidenceRootDir);
        expect(err.message).not.toContain('non_existent_policy.pdf');
      }
    });

    // 7. Legitimate nested tenant storage keys
    it('should allow legitimate nested tenant storage keys within evidence root', async () => {
      const evidenceRootDir = path.join(tempDir, 'evidence_root');
      const tenantDir = path.join(evidenceRootDir, 'tenant-org-123', 'subfolder');
      fs.mkdirSync(tenantDir, { recursive: true });
      const tenantFile = path.join(tenantDir, 'audit_report.txt');
      await fs.promises.writeFile(tenantFile, 'Tenant Confidential Audit Report');

      const storageKey = 'tenant-org-123/subfolder/audit_report.txt';
      const resolved = service.resolveAndValidatePath(evidenceRootDir, storageKey);
      expect(resolved).toBe(fs.realpathSync(tenantFile));

      const result = await service.extract(storageKey, 'audit_report.txt', 'text/plain', { baseDir: evidenceRootDir });
      expect(result.extractionStatus).toBe(ExtractionStatus.SUCCESS);
      expect(result.fullText).toBe('Tenant Confidential Audit Report');
    });

    // 8. Repository-owned fixture verification
    it('should verify that all test fixtures resolve entirely within the repository workspace and not node_modules', () => {
      const fixtures = [compressedPdfFixture, invalidPdfFixture, docxFixture, emptyDocxFixture];
      for (const fixture of fixtures) {
        expect(fs.existsSync(fixture)).toBe(true);
        expect(fixture).not.toContain('node_modules');
        expect(path.relative(repoRoot, fixture).startsWith('..')).toBe(false);
      }
    });
  });

  describe('8. Regression: Supported Text and Tabular Formats', () => {
    it('should extract plain text files (.txt)', async () => {
      const txtPath = path.join(tempDir, 'notes.txt');
      await fs.promises.writeFile(txtPath, 'Line 1: Access Control Standard\n\nLine 2: Data Encryption');

      const result = await service.extract(txtPath, 'notes.txt', 'text/plain');

      expect(result.extractionStatus).toBe(ExtractionStatus.SUCCESS);
      expect(result.fullText).toContain('Access Control Standard');
      expect(result.sections.length).toBe(1);
    });

    it('should extract and format JSON files (.json)', async () => {
      const jsonPath = path.join(tempDir, 'config.json');
      await fs.promises.writeFile(jsonPath, JSON.stringify({ policy: 'SOC2', controls: ['CC1.1', 'CC2.1'] }));

      const result = await service.extract(jsonPath, 'config.json', 'application/json');

      expect(result.extractionStatus).toBe(ExtractionStatus.SUCCESS);
      expect(result.fullText).toContain('"policy": "SOC2"');
    });

    it('should extract CSV tabular data (.csv)', async () => {
      const csvPath = path.join(tempDir, 'data.csv');
      await fs.promises.writeFile(csvPath, 'ControlID,Name,Status\nAC-1,Access Control,Active\nSC-7,Boundary Protection,Active');

      const result = await service.extract(csvPath, 'data.csv', 'text/csv');

      expect(result.extractionStatus).toBe(ExtractionStatus.SUCCESS);
      expect(result.fullText).toContain('AC-1');
      expect(result.fullText).toContain('Boundary Protection');
      expect(result.sections.length).toBeGreaterThan(0);
    });
  });
});
