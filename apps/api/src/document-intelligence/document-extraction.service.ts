import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import * as ExcelJS from 'exceljs';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const pdfParse = require('pdf-parse');
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
   * Extract document text & structured sections based on mimeType and extension
   */
  public async extract(filePath: string, fileName: string, mimeType: string): Promise<ExtractionResult> {
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

    // 2. Missing file check: throw explicit typed error; NEVER fabricate compliance fallback text
    if (!fs.existsSync(filePath)) {
      this.logger.warn(`Document extraction requested for non-existent file "${fileName}".`);
      throw new NotFoundException('Document file not found on storage disk.');
    }

    const ext = path.extname(fileName).toLowerCase().replace('.', '');
    const buffer = await fs.promises.readFile(filePath);

    if (ext === 'pdf' || mimeType.includes('pdf')) {
      return this.extractPdf(buffer);
    } else if (['doc', 'docx'].includes(ext) || mimeType.includes('wordprocessingml') || mimeType.includes('msword')) {
      return this.extractOfficeDoc(buffer, ext);
    } else if (['xls', 'xlsx', 'csv'].includes(ext) || mimeType.includes('spreadsheetml') || mimeType.includes('excel') || mimeType.includes('csv')) {
      return this.extractSpreadsheet(filePath, ext);
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
   * PDF Extraction with real stream parsing, page boundary tracking, and bounds enforcement
   */
  private async extractPdf(buffer: Buffer): Promise<ExtractionResult> {
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

    const pageSections: ExtractedSection[] = [];
    let isTruncated = false;
    let truncationReason: string | undefined;

    const renderPage = (pageData: any): Promise<string> => {
      const pageNum = pageData.pageNumber || (pageData.pageIndex + 1);
      return pageData
        .getTextContent({ normalizeWhitespace: false, disableCombineTextItems: false })
        .then((textContent: any) => {
          let lastY: number | undefined;
          let text = '';
          for (const item of textContent.items) {
            if (lastY === item.transform[5] || lastY === undefined) {
              text += item.str;
            } else {
              text += '\n' + item.str;
            }
            lastY = item.transform[5];
          }

          const cleanPageText = this.normalizeExtractedText(text);
          if (cleanPageText.length > 0) {
            pageSections.push({
              page: pageNum,
              text: cleanPageText,
            });
          }
          return cleanPageText;
        });
    };

    try {
      const parsed = await pdfParse(buffer, {
        max: MAX_PDF_PAGES,
        pagerender: renderPage,
      });

      const totalPages = parsed.numpages || 0;
      if (totalPages > MAX_PDF_PAGES) {
        isTruncated = true;
        truncationReason = `PDF page count (${totalPages}) exceeds maximum limit of ${MAX_PDF_PAGES}. Remaining pages skipped.`;
      }

      // Sort sections by page number
      pageSections.sort((a, b) => (a.page || 0) - (b.page || 0));

      const combinedText = pageSections.map((s) => s.text).join('\n\n');
      const normalizedFullText = this.normalizeExtractedText(combinedText);

      // Scanned / image-only or empty PDF (no text streams extracted)
      if (!normalizedFullText || normalizedFullText.length === 0) {
        return {
          extractionMethod: 'PdfExtractor',
          extractionStatus: ExtractionStatus.EMPTY_DOCUMENT,
          fullText: '',
          sections: [],
          pageCount: totalPages,
          isTruncated: false,
          ocrUsed: false,
        };
      }

      const { text: boundedText, isTruncated: textTruncated, truncationReason: textReason } = this.applyTextBounds(normalizedFullText);
      if (textTruncated) {
        isTruncated = true;
        truncationReason = textReason;
      }

      return {
        extractionMethod: 'PdfExtractor',
        extractionStatus: ExtractionStatus.SUCCESS,
        fullText: boundedText,
        sections: pageSections.length > 0 ? pageSections : [{ page: 1, text: boundedText }],
        isTruncated,
        truncationReason,
        pageCount: totalPages,
        ocrUsed: false,
      };
    } catch (err: any) {
      const isPassword = err?.name === 'PasswordException' || /password/i.test(err?.message || '');
      this.logger.warn(`PDF extraction failed: ${err?.message || 'Unknown parse error'}`);
      return {
        extractionMethod: 'PdfExtractor',
        extractionStatus: ExtractionStatus.MALFORMED_DOCUMENT,
        fullText: '',
        sections: [],
        pageCount: 0,
        isTruncated: false,
        truncationReason: isPassword ? 'Document is encrypted or password-protected.' : undefined,
        ocrUsed: false,
      };
    }
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
