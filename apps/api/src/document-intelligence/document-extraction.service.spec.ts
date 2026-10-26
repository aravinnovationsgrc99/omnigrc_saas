import { Test, TestingModule } from '@nestjs/testing';
import { DocumentExtractionService } from './document-extraction.service';
import { ExtractionStatus } from '@omnigrc/shared';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

describe('DocumentExtractionService (Phase 1: Real Extraction & Fallback Removal)', () => {
  let service: DocumentExtractionService;
  let tempDir: string;

  const pdfParseDir = path.dirname(require.resolve('pdf-parse/package.json'));
  const mammothDir = path.dirname(require.resolve('mammoth/package.json'));

  const compressedPdfFixture = path.join(pdfParseDir, 'test', 'data', '04-valid.pdf');
  const invalidPdfFixture = path.join(pdfParseDir, 'test', 'data', '03-invalid.pdf');
  const docxFixture = path.join(mammothDir, 'test', 'test-data', 'single-paragraph.docx');
  const emptyDocxFixture = path.join(mammothDir, 'test', 'test-data', 'empty.docx');

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

  describe('7. Path Safety & Traversal Prevention', () => {
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
