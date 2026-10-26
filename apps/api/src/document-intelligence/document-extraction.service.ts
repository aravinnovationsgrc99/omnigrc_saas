import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { fork } from 'child_process';
import * as ExcelJS from 'exceljs';
import * as mammoth from 'mammoth';
import { ExtractionStatus } from '@omnigrc/shared';

export interface ExtractedSection {
  title?: string;
  page?: number;
  sheet?: string;
  row?: number;
  col?: number;
  cell?: string;
  text: string;
}

export interface ExtractionResult {
  extractionMethod: string;
  extractionStatus: ExtractionStatus;
  fullText: string;
  sections: ExtractedSection[];
  isTruncated: boolean;
  truncationReason?: string;
  pageCount?: number;
  sheetCount?: number;
  ocrUsed: boolean;
}

const MAX_TEXT_LENGTH = 100000; // 100k characters max
const MAX_PDF_PAGES = 50;
const MAX_SPREADSHEET_SHEETS = 10;
const MAX_ROWS_PER_SHEET = 1000;
const MAX_TOTAL_CELLS = 5000;

@Injectable()
export class DocumentExtractionService {
  private readonly logger = new Logger(DocumentExtractionService.name);

  /**
   * Canonically resolve and confine storageKey within the configured base directory.
   * Rejects path traversal, absolute paths, null bytes, encoded traversal, and symlink escapes.
   * Never leaks internal filesystem paths to client-facing exceptions.
   */
  public resolveAndValidatePath(baseDir: string, relativePathOrKey: string): string {
    if (!baseDir || typeof baseDir !== 'string' || baseDir.includes('\0')) {
      throw new BadRequestException('Invalid storage base directory.');
    }

    if (!relativePathOrKey || typeof relativePathOrKey !== 'string' || relativePathOrKey.includes('\0')) {
      throw new BadRequestException('Invalid document file path.');
    }

    // 1. Check for encoded traversal variants (e.g. %2e%2e, %2f, %5c)
    let decodedKey = relativePathOrKey;
    try {
      decodedKey = decodeURIComponent(relativePathOrKey);
    } catch {
      // Retain raw if malformed URI component
    }
    if (decodedKey.includes('\0')) {
      throw new BadRequestException('Invalid document file path.');
    }

    // 2. Reject absolute paths (POSIX / or Windows C:\ or \\unc)
    if (
      path.isAbsolute(relativePathOrKey) ||
      path.isAbsolute(decodedKey) ||
      /^[a-zA-Z]:[/\\]/.test(relativePathOrKey) ||
      /^[a-zA-Z]:[/\\]/.test(decodedKey) ||
      relativePathOrKey.startsWith('/') ||
      relativePathOrKey.startsWith('\\') ||
      decodedKey.startsWith('/') ||
      decodedKey.startsWith('\\')
    ) {
      throw new BadRequestException('Absolute paths are not permitted in storage keys.');
    }

    // 3. Reject directory traversal symbols (.. segments in both raw and decoded forms)
    const rawSegments = relativePathOrKey.split(/[/\\]/);
    const decodedSegments = decodedKey.split(/[/\\]/);
    if (rawSegments.includes('..') || decodedSegments.includes('..')) {
      throw new BadRequestException('Path traversal symbols are forbidden.');
    }

    // 4. Validate existence of base directory without creating unexpected directories as side-effect
    if (!fs.existsSync(baseDir)) {
      this.logger.warn('Evidence storage root directory does not exist on disk.');
      throw new NotFoundException('Document file not found on storage disk.');
    }

    // 5. Canonicalize base directory
    let canonicalBase: string;
    try {
      canonicalBase = fs.realpathSync(baseDir);
    } catch {
      throw new NotFoundException('Document file not found on storage disk.');
    }

    // 6. Resolve target path
    const candidatePath = path.resolve(canonicalBase, relativePathOrKey);

    // 7. Lexical boundary check: candidatePath must reside within canonicalBase
    const relToRoot = path.relative(canonicalBase, candidatePath);
    if (relToRoot.startsWith('..') || path.isAbsolute(relToRoot)) {
      throw new BadRequestException('Path traversal detected: target escapes storage root.');
    }

    // 8. Missing file check
    if (!fs.existsSync(candidatePath)) {
      throw new NotFoundException('Document file not found on storage disk.');
    }

    // 9. Canonical target verification (symlink escape detection)
    let canonicalTarget: string;
    try {
      canonicalTarget = fs.realpathSync(candidatePath);
    } catch {
      throw new NotFoundException('Document file not found on storage disk.');
    }

    const relCanonical = path.relative(canonicalBase, canonicalTarget);
    if (relCanonical.startsWith('..') || path.isAbsolute(relCanonical)) {
      throw new BadRequestException('Unauthorized symlink target outside storage boundary.');
    }

    // 10. Ensure target is a regular file, not a directory or device
    try {
      const stat = fs.statSync(canonicalTarget);
      if (!stat.isFile()) {
        throw new BadRequestException('Target path is not a regular file.');
      }
    } catch (err: any) {
      if (err instanceof BadRequestException) throw err;
      throw new NotFoundException('Document file not found on storage disk.');
    }

    return canonicalTarget;
  }

  /**
   * Extract document text & structured sections based on mimeType and extension
   */
  public async extract(
    filePath: string,
    fileName: string,
    mimeType: string,
    options?: { baseDir?: string; timeoutMs?: number; maxPages?: number; maxTextLength?: number },
  ): Promise<ExtractionResult> {
    // 1. Path safety and filename validation
    if (!fileName || typeof fileName !== 'string' || fileName.length > 255) {
      throw new BadRequestException('Invalid document file name.');
    }

    if (fileName.includes('..') || fileName.includes('/') || fileName.includes('\\')) {
      throw new BadRequestException('Invalid document file name. Path traversal symbols are forbidden.');
    }

    if (!filePath || typeof filePath !== 'string' || filePath.includes('\0')) {
      throw new BadRequestException('Invalid document file path.');
    }

    let targetFilePath = filePath;

    if (options?.baseDir) {
      targetFilePath = this.resolveAndValidatePath(options.baseDir, filePath);
    } else {
      if (filePath.includes('..')) {
        throw new BadRequestException('Invalid document file path. Path traversal symbols are forbidden.');
      }
      if (!fs.existsSync(filePath)) {
        this.logger.warn(`Document extraction requested for non-existent file "${fileName}".`);
        throw new NotFoundException('Document file not found on storage disk.');
      }
      try {
        targetFilePath = fs.realpathSync(filePath);
        const stat = fs.statSync(targetFilePath);
        if (!stat.isFile()) {
          throw new BadRequestException('Target path is not a regular file.');
        }
      } catch (err: any) {
        if (err instanceof BadRequestException) throw err;
        throw new NotFoundException('Document file not found on storage disk.');
      }
    }

    const ext = path.extname(fileName).toLowerCase().replace('.', '');

    // Open file handle to mitigate TOCTOU race conditions between validation and read
    const fileHandle = await fs.promises.open(targetFilePath, 'r');
    let buffer: Buffer;
    try {
      buffer = await fileHandle.readFile();
    } finally {
      await fileHandle.close().catch(() => {});
    }

    if (ext === 'pdf' || mimeType.includes('pdf')) {
      return this.extractPdf(buffer, targetFilePath, options);
    } else if (['doc', 'docx'].includes(ext) || mimeType.includes('wordprocessingml') || mimeType.includes('msword')) {
      return this.extractOfficeDoc(buffer, ext);
    } else if (['xls', 'xlsx', 'csv'].includes(ext) || mimeType.includes('spreadsheetml') || mimeType.includes('excel') || mimeType.includes('csv')) {
      return this.extractSpreadsheet(targetFilePath, ext);
    } else if (['png', 'jpg', 'jpeg', 'webp'].includes(ext) || mimeType.startsWith('image/')) {
      return this.extractImageOcr(buffer, ext);
    } else if (['txt', 'log', 'json', 'xml'].includes(ext) || mimeType.startsWith('text/') || mimeType.includes('json') || mimeType.includes('xml')) {
      return this.extractText(buffer, ext);
    } else {
      return {
        extractionMethod: `UNKNOWN (${ext || 'binary'})`,
        extractionStatus: ExtractionStatus.UNSUPPORTED_FORMAT,
        fullText: '',
        sections: [],
        isTruncated: false,
        ocrUsed: false,
      };
    }
  }

  /**
   * Resolve path to the isolated child process worker script
   */
  private resolveWorkerScriptPath(): string {
    const candidates = [
      path.resolve(__dirname, 'pdf-parser.worker.js'),
      path.resolve(__dirname, '../src/document-intelligence/pdf-parser.worker.js'),
      path.resolve(process.cwd(), 'apps/api/src/document-intelligence/pdf-parser.worker.js'),
      path.resolve(process.cwd(), 'src/document-intelligence/pdf-parser.worker.js'),
    ];
    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }
    return path.resolve(__dirname, 'pdf-parser.worker.js');
  }

  /**
   * PDF Extraction with isolated child process execution, 256MB memory cap,
   * execution timeout, sanitized environment, and fault isolation.
   */
  private async extractPdf(
    buffer: Buffer,
    targetFilePath?: string,
    options?: { timeoutMs?: number; maxPages?: number; maxTextLength?: number },
  ): Promise<ExtractionResult> {
    if (!buffer || buffer.length === 0) {
      return {
        extractionMethod: 'PdfExtractor',
        extractionStatus: ExtractionStatus.EMPTY_DOCUMENT,
        fullText: '',
        sections: [],
        pageCount: 0,
        isTruncated: false,
        ocrUsed: false,
      };
    }

    const workerScript = this.resolveWorkerScriptPath();
    const timeoutMs = options?.timeoutMs || Number(process.env.PDF_PARSER_TIMEOUT_MS) || 10000;
    const maxPages = options?.maxPages || MAX_PDF_PAGES;
    const maxTextLength = options?.maxTextLength || MAX_TEXT_LENGTH;

    return new Promise<ExtractionResult>((resolve) => {
      let isSettled = false;
      let timer: NodeJS.Timeout | null = null;

      // Spawn isolated child process with sanitized environment (no app secrets) and 256MB V8 memory limit
      const child = fork(workerScript, [], {
        env: {
          NODE_ENV: process.env.NODE_ENV || 'production',
          PATH: process.env.PATH || '',
          SYSTEMROOT: process.env.SYSTEMROOT || '',
        },
        silent: true,
        execArgv: ['--max-old-space-size=256'],
      });

      const cleanup = () => {
        if (timer) {
          clearTimeout(timer);
          timer = null;
        }
        try {
          if (!child.killed) {
            child.kill('SIGKILL');
          }
        } catch {
          // Process already closed
        }
      };

      const safeResolve = (res: ExtractionResult) => {
        if (!isSettled) {
          isSettled = true;
          cleanup();
          resolve(res);
        }
      };

      timer = setTimeout(() => {
        this.logger.warn(`PDF extraction timed out after ${timeoutMs}ms. Child process terminated.`);
        safeResolve({
          extractionMethod: 'PdfExtractor',
          extractionStatus: ExtractionStatus.MALFORMED_DOCUMENT,
          fullText: '',
          sections: [],
          pageCount: 0,
          isTruncated: false,
          truncationReason: `PDF extraction timed out after ${timeoutMs}ms.`,
          ocrUsed: false,
        });
      }, timeoutMs);

      child.on('message', (message: any) => {
        if (message && message.type === 'PDF_RESULT') {
          const res = message.result;
          if (res.isEmpty) {
            safeResolve({
              extractionMethod: 'PdfExtractor',
              extractionStatus: ExtractionStatus.EMPTY_DOCUMENT,
              fullText: '',
              sections: [],
              pageCount: res.pageCount || 0,
              isTruncated: false,
              ocrUsed: false,
            });
          } else {
            safeResolve({
              extractionMethod: 'PdfExtractor',
              extractionStatus: ExtractionStatus.SUCCESS,
              fullText: res.fullText || '',
              sections: res.sections || [],
              pageCount: res.pageCount || 0,
              isTruncated: Boolean(res.isTruncated),
              truncationReason: res.truncationReason,
              ocrUsed: false,
            });
          }
        } else if (message && message.type === 'PDF_ERROR') {
          this.logger.warn(`PDF extraction failed in worker: ${message.error || 'Unknown error'}`);
          safeResolve({
            extractionMethod: 'PdfExtractor',
            extractionStatus: ExtractionStatus.MALFORMED_DOCUMENT,
            fullText: '',
            sections: [],
            pageCount: 0,
            isTruncated: false,
            truncationReason: message.isPassword ? 'Document is encrypted or password-protected.' : message.error,
            ocrUsed: false,
          });
        }
      });

      child.on('error', (err) => {
        this.logger.warn(`PDF extraction child process error: ${err.message}`);
        safeResolve({
          extractionMethod: 'PdfExtractor',
          extractionStatus: ExtractionStatus.MALFORMED_DOCUMENT,
          fullText: '',
          sections: [],
          pageCount: 0,
          isTruncated: false,
          truncationReason: `Worker error: ${err.message}`,
          ocrUsed: false,
        });
      });

      child.on('exit', (code, signal) => {
        if (!isSettled) {
          this.logger.warn(`PDF extraction worker exited unexpectedly (code: ${code}, signal: ${signal}).`);
          safeResolve({
            extractionMethod: 'PdfExtractor',
            extractionStatus: ExtractionStatus.MALFORMED_DOCUMENT,
            fullText: '',
            sections: [],
            pageCount: 0,
            isTruncated: false,
            truncationReason: `Worker exited unexpectedly (${signal || code}).`,
            ocrUsed: false,
          });
        }
      });

      // Send execution payload to child process
      if (targetFilePath && fs.existsSync(targetFilePath)) {
        child.send({
          type: 'PARSE_PDF',
          payload: { filePath: targetFilePath, maxPages, maxTextLength },
        });
      } else {
        child.send({
          type: 'PARSE_PDF',
          payload: { bufferBase64: buffer.toString('base64'), maxPages, maxTextLength },
        });
      }
    });
  }

  /**
   * Office DOC/DOCX Extraction (ZIP-compressed OpenXML parsing via Mammoth)
   */
  private async extractOfficeDoc(buffer: Buffer, ext: string): Promise<ExtractionResult> {
    if (ext === 'doc') {
      // Legacy binary .doc (OLE2 Compound Document) is unsupported by mammoth
      return {
        extractionMethod: 'OfficeDocumentExtractor (DOC)',
        extractionStatus: ExtractionStatus.UNSUPPORTED_FORMAT,
        fullText: '',
        sections: [],
        isTruncated: false,
        ocrUsed: false,
      };
    }

    if (!buffer || buffer.length === 0) {
      return {
        extractionMethod: 'OfficeDocumentExtractor (DOCX)',
        extractionStatus: ExtractionStatus.EMPTY_DOCUMENT,
        fullText: '',
        sections: [],
        isTruncated: false,
        ocrUsed: false,
      };
    }

    try {
      const result = await mammoth.extractRawText({ buffer });
      const rawText = result.value || '';
      const normalized = this.normalizeExtractedText(rawText);

      if (!normalized || normalized.trim().length === 0) {
        return {
          extractionMethod: 'OfficeDocumentExtractor (DOCX)',
          extractionStatus: ExtractionStatus.EMPTY_DOCUMENT,
          fullText: '',
          sections: [],
          isTruncated: false,
          ocrUsed: false,
        };
      }

      // Split into paragraphs for structured sections
      const paragraphs = normalized
        .split(/\n\s*\n/)
        .map((p) => p.trim())
        .filter((p) => p.length > 0);

      const sections: ExtractedSection[] = paragraphs.map((para, idx) => ({
        title: `Paragraph ${idx + 1}`,
        text: para,
      }));

      const { text: boundedText, isTruncated, truncationReason } = this.applyTextBounds(normalized);

      return {
        extractionMethod: 'OfficeDocumentExtractor (DOCX)',
        extractionStatus: ExtractionStatus.SUCCESS,
        fullText: boundedText,
        sections: sections.length > 0 ? sections : [{ text: boundedText }],
        isTruncated,
        truncationReason,
        ocrUsed: false,
      };
    } catch (err: any) {
      this.logger.warn(`DOCX extraction failed: ${err?.message || 'Unknown DOCX error'}`);
      return {
        extractionMethod: 'OfficeDocumentExtractor (DOCX)',
        extractionStatus: ExtractionStatus.MALFORMED_DOCUMENT,
        fullText: '',
        sections: [],
        isTruncated: false,
        ocrUsed: false,
      };
    }
  }

  /**
   * Spreadsheet Extraction (XLSX / CSV via ExcelJS, formula execution strictly disabled)
   */
  private async extractSpreadsheet(filePath: string, ext: string): Promise<ExtractionResult> {
    const workbook = new ExcelJS.Workbook();
    const sections: ExtractedSection[] = [];
    let fullTextAccumulator = '';
    let totalCells = 0;
    let isTruncated = false;
    let truncationReason: string | undefined;

    try {
      if (ext === 'csv') {
        await workbook.csv.readFile(filePath);
      } else {
        await workbook.xlsx.readFile(filePath);
      }

      let sheetCount = 0;
      for (const worksheet of workbook.worksheets) {
        if (sheetCount >= MAX_SPREADSHEET_SHEETS) {
          isTruncated = true;
          truncationReason = `Spreadsheet exceeds maximum sheet limit of ${MAX_SPREADSHEET_SHEETS}. Remaining sheets skipped.`;
          break;
        }
        sheetCount++;

        // Skip hidden sheets unless explicitly requested
        if (worksheet.state === 'hidden') continue;

        let rowCount = 0;
        worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
          if (rowCount >= MAX_ROWS_PER_SHEET || totalCells >= MAX_TOTAL_CELLS) {
            isTruncated = true;
            truncationReason = `Spreadsheet cell count limit (${MAX_TOTAL_CELLS}) or row limit (${MAX_ROWS_PER_SHEET}) exceeded.`;
            return;
          }
          rowCount++;

          row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
            totalCells++;
            // TREAT ALL CELL VALUES STRICTLY AS DATA
            // Never execute formulas, macros, or follow external links
            let rawVal = cell.value;
            if (rawVal && typeof rawVal === 'object') {
              if ('result' in rawVal) rawVal = (rawVal as any).result;
              else if ('formula' in rawVal) rawVal = (rawVal as any).formula;
              else rawVal = JSON.stringify(rawVal);
            }

            const cellText = String(rawVal || '').trim();
            if (cellText) {
              const address = cell.address || `R${rowNumber}C${colNumber}`;
              sections.push({
                sheet: worksheet.name,
                row: rowNumber,
                col: colNumber,
                cell: address,
                text: cellText,
              });
              fullTextAccumulator += `[${worksheet.name}:${address}] ${cellText}\n`;
            }
          });
        });
      }
    } catch (err: any) {
      this.logger.warn(`Spreadsheet extraction error: ${err.message}`);
      return {
        extractionMethod: `SpreadsheetExtractor (${ext.toUpperCase()})`,
        extractionStatus: ExtractionStatus.MALFORMED_DOCUMENT,
        fullText: '',
        sections: [],
        isTruncated: false,
        ocrUsed: false,
      };
    }

    const normalizedFullText = this.normalizeExtractedText(fullTextAccumulator);
    const { text: boundedText, isTruncated: textTruncated, truncationReason: textReason } = this.applyTextBounds(normalizedFullText);
    if (textTruncated) {
      isTruncated = true;
      truncationReason = textReason;
    }

    return {
      extractionMethod: `SpreadsheetExtractor (${ext.toUpperCase()})`,
      extractionStatus: sections.length > 0 ? ExtractionStatus.SUCCESS : ExtractionStatus.EMPTY_DOCUMENT,
      fullText: boundedText,
      sections,
      sheetCount: workbook.worksheets.length,
      isTruncated,
      truncationReason,
      ocrUsed: false,
    };
  }

  /**
   * Image OCR Extraction (explicit status reporting without fabricated text)
   */
  private async extractImageOcr(buffer: Buffer, ext: string): Promise<ExtractionResult> {
    const hasOcrConfigured = Boolean(process.env.OCR_PROVIDER_KEY && process.env.OCR_PROVIDER_KEY.trim());

    if (!hasOcrConfigured) {
      this.logger.warn(`Image document (.${ext}) uploaded, but OCR_PROVIDER_KEY is not configured.`);
      return {
        extractionMethod: `OcrExtractor (${ext.toUpperCase()})`,
        extractionStatus: ExtractionStatus.OCR_UNAVAILABLE,
        fullText: `[OCR UNAVAILABLE: Image format .${ext} submitted, but no OCR engine key is configured]`,
        sections: [],
        isTruncated: false,
        ocrUsed: false,
      };
    }

    // OCR engine is out of scope for Phase 1 - never fabricate fake OCR text
    this.logger.warn(`Image document (.${ext}) uploaded. OCR engine integration is out of scope for Phase 1.`);
    return {
      extractionMethod: `OcrExtractor (${ext.toUpperCase()})`,
      extractionStatus: ExtractionStatus.OCR_UNAVAILABLE,
      fullText: `[OCR UNAVAILABLE: OCR engine is not configured in this phase]`,
      sections: [],
      isTruncated: false,
      ocrUsed: false,
    };
  }

  /**
   * Plain Text / JSON / XML Extraction
   */
  private async extractText(buffer: Buffer, ext: string): Promise<ExtractionResult> {
    if (!buffer || buffer.length === 0) {
      return {
        extractionMethod: `TextExtractor (${ext.toUpperCase()})`,
        extractionStatus: ExtractionStatus.EMPTY_DOCUMENT,
        fullText: '',
        sections: [],
        isTruncated: false,
        ocrUsed: false,
      };
    }

    let rawText = buffer.toString('utf8');

    if (ext === 'json') {
      try {
        const parsed = JSON.parse(rawText);
        rawText = JSON.stringify(parsed, null, 2);
      } catch {
        // Fallback to raw text
      }
    } else if (ext === 'xml') {
      rawText = rawText.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    }

    const normalized = this.normalizeExtractedText(rawText);
    const { text: boundedText, isTruncated, truncationReason } = this.applyTextBounds(normalized);

    return {
      extractionMethod: `TextExtractor (${ext.toUpperCase()})`,
      extractionStatus: boundedText.trim().length > 0 ? ExtractionStatus.SUCCESS : ExtractionStatus.EMPTY_DOCUMENT,
      fullText: boundedText,
      sections: boundedText.trim().length > 0 ? [{ text: boundedText }] : [],
      isTruncated,
      truncationReason,
      ocrUsed: false,
    };
  }

  /**
   * Normalize text by standardizing line breaks, stripping unprintable control characters,
   * collapsing excessive whitespace while preserving paragraph boundaries.
   */
  private normalizeExtractedText(text: string): string {
    if (!text) return '';
    return text
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n\s+\n/g, '\n\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  /**
   * Enforce bounded text limits (100,000 characters max)
   */
  private applyTextBounds(text: string): { text: string; isTruncated: boolean; truncationReason?: string } {
    if (text.length > MAX_TEXT_LENGTH) {
      return {
        text: text.substring(0, MAX_TEXT_LENGTH),
        isTruncated: true,
        truncationReason: `Extracted text exceeded max limit of ${MAX_TEXT_LENGTH} characters. Truncated safely.`,
      };
    }
    return { text, isTruncated: false };
  }
}
