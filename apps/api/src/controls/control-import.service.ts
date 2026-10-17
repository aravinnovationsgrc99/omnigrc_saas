import { Injectable, Logger, BadRequestException, ForbiddenException } from '@nestjs/common';
import * as path from 'path';
import * as ExcelJS from 'exceljs';
import { Readable } from 'stream';
import { PrismaService } from '../prisma/prisma.service';
import { AiRouterService } from './ai/ai-router.service';
import { FrameworkEntitlementsService } from '../frameworks/framework-entitlements.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { ResourceAuthContext } from '../auth/resource-authorization.service';
import { CandidateClause } from './ai/ai-provider.interface';
import {
  AnalyzeControlsImportResponseDto,
  ExtractedControlSuggestionDto,
  PersistImportedControlsDto,
  PersistImportedControlsResponseDto,
  MappingStatus,
} from '@omnigrc/shared';

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
const MAX_CONTROLS_PER_IMPORT = 50;

interface RawExtractedControl {
  title: string;
  description: string;
  category?: string;
  sourceLocation: string;
}

@Injectable()
export class ControlImportService {
  private readonly logger = new Logger(ControlImportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiRouterService: AiRouterService,
    private readonly frameworkEntitlementsService: FrameworkEntitlementsService,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  /**
   * Safe extraction of controls from uploaded spreadsheet or text PDF
   */
  async analyzeImportFile(
    authCtx: ResourceAuthContext,
    file: any,
    frameworkId: string,
    frameworkVersionId?: string,
  ): Promise<AnalyzeControlsImportResponseDto> {
    if (!file || !file.buffer) {
      throw new BadRequestException('No file uploaded or file payload is empty.');
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      throw new BadRequestException(`File size exceeds maximum permitted limit of 10 MB (${(file.size / (1024 * 1024)).toFixed(1)} MB uploaded).`);
    }

    const originalName = file.originalname || 'uploaded-document';
    const ext = path.extname(originalName).toLowerCase().replace('.', '');
    const allowedExts = ['xlsx', 'xls', 'csv', 'pdf'];

    if (!allowedExts.includes(ext)) {
      throw new BadRequestException(
        `Unsupported document format (.${ext}). Supported formats are: XLSX, XLS, CSV, and text-based PDF.`,
      );
    }

    // Check framework existence and tenant entitlement
    const fw = await this.prisma.framework.findUnique({
      where: { id: frameworkId },
      select: { id: true, code: true, name: true },
    });
    if (!fw) {
      throw new BadRequestException(`Selected compliance framework with ID "${frameworkId}" does not exist.`);
    }

    const isEntitled = await this.frameworkEntitlementsService.isEntitled(
      authCtx.organizationId,
      frameworkId,
      frameworkVersionId,
    );
    if (!isEntitled) {
      throw new ForbiddenException(
        `Organization is not entitled to compliance framework "${fw.code} — ${fw.name}".`,
      );
    }

    // 1. Extract raw controls from document
    let rawControls: RawExtractedControl[] = [];
    let requiresOcr = false;
    let extractionMessage: string | undefined;

    if (['xlsx', 'xls', 'csv'].includes(ext)) {
      rawControls = await this.extractFromSpreadsheet(file.buffer, ext);
    } else if (ext === 'pdf') {
      const pdfResult = await this.extractFromPdf(file.buffer);
      rawControls = pdfResult.controls;
      requiresOcr = pdfResult.requiresOcr;
      extractionMessage = pdfResult.message;
    }

    if (requiresOcr) {
      return {
        fileName: originalName,
        fileType: ext.toUpperCase(),
        totalControlsDetected: 0,
        requiresOcr: true,
        extractionMessage:
          extractionMessage ||
          'This PDF document contains scanned raster images without an embedded text layer. Scanned documents require OCR. Please provide a text-readable PDF or spreadsheet (XLSX/CSV).',
        coverage: {
          totalExtracted: 0,
          matchedCount: 0,
          unmatchedCount: 0,
          highConfidenceCount: 0,
        },
        suggestions: [],
      };
    }

    if (rawControls.length === 0) {
      return {
        fileName: originalName,
        fileType: ext.toUpperCase(),
        totalControlsDetected: 0,
        requiresOcr: false,
        extractionMessage:
          'No recognizable control records or rows could be parsed from this document. Ensure column headers such as "Control Name", "Description", or "Requirement" are present.',
        coverage: {
          totalExtracted: 0,
          matchedCount: 0,
          unmatchedCount: 0,
          highConfidenceCount: 0,
        },
        suggestions: [],
      };
    }

    // Deduplicate and cap to max batch
    const deduplicated: RawExtractedControl[] = [];
    const seen = new Set<string>();
    for (const item of rawControls) {
      const key = `${item.title.toLowerCase().trim()}|${item.description.toLowerCase().trim()}`;
      if (!seen.has(key)) {
        seen.add(key);
        deduplicated.push(item);
      }
      if (deduplicated.length >= MAX_CONTROLS_PER_IMPORT) break;
    }

    // 2. Query target framework candidate references
    const whereRef: any = {};
    if (frameworkVersionId) {
      whereRef.frameworkVersionId = frameworkVersionId;
    } else {
      whereRef.frameworkVersion = { frameworkId };
    }

    const candidateRefs = await this.prisma.frameworkReference.findMany({
      where: whereRef,
      include: {
        frameworkVersion: {
          include: { framework: { select: { code: true } } },
        },
      },
      take: 120,
    });

    const candidateClauses: CandidateClause[] = candidateRefs.map((r) => ({
      id: r.id,
      frameworkCode: r.frameworkVersion.framework.code,
      code: r.identifier,
      title: r.title,
    }));

    // 3. Analyze each control against candidates using AI provider abstraction
    const suggestions: ExtractedControlSuggestionDto[] = [];

    for (let i = 0; i < deduplicated.length; i++) {
      const ctrl = deduplicated[i];
      const tempId = `imp-ctrl-${i + 1}`;

      try {
        const aiResult = await this.aiRouterService.executeMapping({
          organizationId: authCtx.organizationId,
          actorId: authCtx.userId,
          controlId: tempId,
          controlName: ctrl.title,
          controlDescription: ctrl.description,
          candidates: candidateClauses,
        });

        const bestSuggestion = aiResult.acceptedSuggestions && aiResult.acceptedSuggestions[0];
        if (bestSuggestion && bestSuggestion.confidenceScore >= 0.50) {
          const matchedRef = candidateRefs.find((r) => r.id === bestSuggestion.clauseId);
          const score = bestSuggestion.confidenceScore;
          const status = score >= 0.75 ? 'MATCHED' : 'AMBIGUOUS';

          suggestions.push({
            tempId,
            sourceLocation: ctrl.sourceLocation,
            originalTitle: ctrl.title,
            originalDescription: ctrl.description,
            suggestedCategory: ctrl.category || 'Custom Control',
            suggestedFrameworkReferenceId: matchedRef?.id,
            suggestedReferenceIdentifier: matchedRef?.identifier || bestSuggestion.clauseCode,
            suggestedReferenceTitle: matchedRef?.title,
            confidenceScore: Number(score.toFixed(2)),
            rationale:
              bestSuggestion.reasoning ||
              `AI match with ${matchedRef?.identifier || bestSuggestion.clauseCode} based on control scope and requirements.`,
            status,
            gapsOrNotes:
              score < 0.75
                ? 'Ambiguous alignment: verify whether this control satisfies the full scope of the standard.'
                : undefined,
          });
        } else {
          // Unmatched item
          suggestions.push({
            tempId,
            sourceLocation: ctrl.sourceLocation,
            originalTitle: ctrl.title,
            originalDescription: ctrl.description,
            suggestedCategory: ctrl.category || 'Custom Control',
            confidenceScore: 0,
            rationale:
              'No strong corresponding reference identified in the selected framework catalogue.',
            status: 'UNMATCHED',
            gapsOrNotes: 'Requirement may represent an organization-specific policy.',
          });
        }
      } catch (err: any) {
        this.logger.warn(`AI mapping failed for control "${ctrl.title}": ${err.message}`);
        suggestions.push({
          tempId,
          sourceLocation: ctrl.sourceLocation,
          originalTitle: ctrl.title,
          originalDescription: ctrl.description,
          suggestedCategory: ctrl.category || 'Custom Control',
          confidenceScore: 0,
          rationale: 'AI analysis could not complete for this item; review manually.',
          status: 'UNMATCHED',
          gapsOrNotes: err.message,
        });
      }
    }

    // 4. Compute coverage report
    const totalExtracted = suggestions.length;
    const matchedCount = suggestions.filter((s) => s.status === 'MATCHED').length;
    const unmatchedCount = suggestions.filter((s) => s.status === 'UNMATCHED').length;
    const highConfidenceCount = suggestions.filter((s) => s.confidenceScore >= 0.85).length;

    return {
      fileName: originalName,
      fileType: ext.toUpperCase(),
      totalControlsDetected: totalExtracted,
      requiresOcr: false,
      extractionMessage:
        totalExtracted > 0
          ? `Successfully parsed ${totalExtracted} control(s) from "${originalName}".`
          : undefined,
      coverage: {
        totalExtracted,
        matchedCount,
        unmatchedCount,
        highConfidenceCount,
      },
      suggestions,
    };
  }

  /**
   * Persist accepted controls & mappings into database
   */
  async persistImportedControls(
    authCtx: ResourceAuthContext,
    dto: PersistImportedControlsDto,
  ): Promise<PersistImportedControlsResponseDto> {
    if (!dto.controls || !Array.isArray(dto.controls) || dto.controls.length === 0) {
      throw new BadRequestException('No controls provided for persistence.');
    }

    const createdIds: string[] = [];
    let mappedCount = 0;

    for (const item of dto.controls) {
      if (!item.name || !item.description) continue;

      // 1. Create Control
      const control = await this.prisma.control.create({
        data: {
          organizationId: authCtx.organizationId,
          name: item.name.trim(),
          description: item.description.trim(),
          category: item.category ? item.category.trim() : 'Custom Control',
          createdById: authCtx.userId,
        },
      });

      createdIds.push(control.id);

      await this.auditLogsService.log({
        organizationId: authCtx.organizationId,
        actorId: authCtx.userId,
        action: 'CONTROL_CREATED',
        entityType: 'Control',
        entityId: control.id,
        metadata: {
          name: control.name,
          category: control.category,
          source: 'FILE_IMPORT',
        },
      });

      // 2. Create Mapping if accepted
      if (item.frameworkReferenceId) {
        try {
          const mapping = await this.prisma.controlFrameworkMapping.create({
            data: {
              controlId: control.id,
              frameworkReferenceId: item.frameworkReferenceId,
              status: item.status || MappingStatus.APPROVED,
            },
          });
          mappedCount++;

          await this.auditLogsService.log({
            organizationId: authCtx.organizationId,
            actorId: authCtx.userId,
            action: 'CONTROL_MAPPING_CREATED',
            entityType: 'ControlFrameworkMapping',
            entityId: mapping.id,
            metadata: {
              controlId: control.id,
              frameworkReferenceId: item.frameworkReferenceId,
              status: mapping.status,
              source: 'AI_IMPORT_REVIEW',
            },
          });
        } catch (err: any) {
          this.logger.warn(`Failed to create mapping for imported control "${control.id}": ${err.message}`);
        }
      }
    }

    return {
      createdCount: createdIds.length,
      mappedCount,
      controlIds: createdIds,
    };
  }

  /**
   * Safe spreadsheet parsing with ExcelJS (pure data, formula execution strictly prevented)
   */
  private async extractFromSpreadsheet(buffer: Buffer, ext: string): Promise<RawExtractedControl[]> {
    const workbook = new ExcelJS.Workbook();
    if (ext === 'csv') {
      const stream = new Readable();
      stream.push(buffer);
      stream.push(null);
      await workbook.csv.read(stream);
    } else {
      await workbook.xlsx.load(buffer as any);
    }

    const controls: RawExtractedControl[] = [];

    for (const worksheet of workbook.worksheets) {
      if (worksheet.state === 'hidden') continue;

      let titleColIdx = -1;
      let descColIdx = -1;
      let catColIdx = -1;
      let headerRowIdx = -1;

      // Scan rows 1..6 for header row
      worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
        if (headerRowIdx !== -1 || rowNumber > 6) return;

        const cellValues = (row.values as any[]).map((v) => {
          if (!v) return '';
          if (typeof v === 'object' && 'result' in v) return String((v as any).result || '').toLowerCase();
          return String(v).toLowerCase();
        });

        cellValues.forEach((val, idx) => {
          if (
            val.includes('title') ||
            val.includes('control name') ||
            val.includes('control title') ||
            val.includes('requirement title') ||
            val.includes('policy name') ||
            val.includes('standard')
          ) {
            titleColIdx = idx;
            headerRowIdx = rowNumber;
          } else if (
            val.includes('description') ||
            val.includes('statement') ||
            val.includes('control text') ||
            val.includes('requirement text') ||
            val.includes('specification')
          ) {
            descColIdx = idx;
            headerRowIdx = rowNumber;
          } else if (val.includes('category') || val.includes('domain') || val.includes('family')) {
            catColIdx = idx;
          }
        });
      });

      // Extract rows
      worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
        if (headerRowIdx !== -1 && rowNumber <= headerRowIdx) return;
        if (controls.length >= MAX_CONTROLS_PER_IMPORT) return;

        const rowValues = row.values as any[];
        if (!rowValues || rowValues.length === 0) return;

        let title = '';
        let description = '';
        let category = 'Custom Control';

        if (titleColIdx !== -1 && rowValues[titleColIdx]) {
          title = this.cleanCellValue(rowValues[titleColIdx]);
        }
        if (descColIdx !== -1 && rowValues[descColIdx]) {
          description = this.cleanCellValue(rowValues[descColIdx]);
        }
        if (catColIdx !== -1 && rowValues[catColIdx]) {
          category = this.cleanCellValue(rowValues[catColIdx]) || category;
        }

        // Fallback if no explicit header columns found
        if (!title && !description) {
          const textCells = rowValues
            .filter((v) => v !== undefined && v !== null)
            .map((v) => this.cleanCellValue(v))
            .filter((v) => v.length > 0);

          if (textCells.length >= 2) {
            title = textCells[0];
            description = textCells[1];
          } else if (textCells.length === 1 && textCells[0].length > 10) {
            title = textCells[0].slice(0, 60);
            description = textCells[0];
          }
        }

        if (title || description) {
          controls.push({
            title: title || description.slice(0, 50),
            description: description || title,
            category,
            sourceLocation: `${worksheet.name}: Row ${rowNumber}`,
          });
        }
      });
    }

    return controls;
  }

  /**
   * Safe text PDF extraction with OCR detection
   */
  private async extractFromPdf(buffer: Buffer): Promise<{
    controls: RawExtractedControl[];
    requiresOcr: boolean;
    message?: string;
  }> {
    const rawContent = buffer.toString('utf8');
    const textMatches: string[] = [];

    // Extract text in Tj and TJ operators
    const tjRegex = /\(([^)]+)\)\s*Tj/g;
    let match: RegExpExecArray | null;
    while ((match = tjRegex.exec(rawContent)) !== null) {
      if (match[1] && match[1].trim()) {
        textMatches.push(match[1]);
      }
    }

    let pdfText = textMatches.join(' ').replace(/\\\(|\\\)/g, '').trim();

    // Fallback block extraction
    if (pdfText.length < 30) {
      const blockRegex = /BT[\s\S]*?ET/g;
      const blocks = rawContent.match(blockRegex) || [];
      const extractedWords: string[] = [];
      for (const block of blocks) {
        const words = block.match(/\(([^)]+)\)/g);
        if (words) {
          extractedWords.push(...words.map((w) => w.replace(/[()]/g, '')));
        }
      }
      pdfText = extractedWords.join(' ').trim();
    }

    // Detect scanned PDF
    if (pdfText.length < 30) {
      return {
        controls: [],
        requiresOcr: true,
        message:
          'Scanned PDF detected without readable text stream. Please upload a searchable text-based PDF or spreadsheet.',
      };
    }

    // Split paragraphs into control items
    const rawParagraphs = pdfText
      .split(/(?:\r?\n){2,}|(?=(?:Control\s+\d+|REQ-\d+|\b\d+\.\d+\b))/i)
      .map((p) => p.trim())
      .filter((p) => p.length > 15);

    const controls: RawExtractedControl[] = [];
    for (let i = 0; i < rawParagraphs.length; i++) {
      if (controls.length >= MAX_CONTROLS_PER_IMPORT) break;
      const text = rawParagraphs[i];
      const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      const title = lines[0] ? lines[0].slice(0, 100) : `Extracted Control ${i + 1}`;
      const description = lines.length > 1 ? lines.slice(1).join(' ') : text;

      controls.push({
        title,
        description: description || title,
        category: 'Custom Control',
        sourceLocation: `PDF: Section ${i + 1}`,
      });
    }

    return {
      controls,
      requiresOcr: false,
    };
  }

  private cleanCellValue(val: any): string {
    if (!val) return '';
    if (typeof val === 'object') {
      if ('result' in val) return String(val.result || '').trim();
      if ('text' in val) return String(val.text || '').trim();
      return JSON.stringify(val);
    }
    return String(val).trim();
  }
}
