import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { ResourceAuthContext } from '../auth/resource-authorization.service';
import {
  VendorCriticality,
  VendorStatus,
  VendorImportStatus,
  VendorImportPreviewResponseDto,
  VendorImportPreviewRowDto,
  VendorImportResultDto,
  VendorImportBatchDto,
  PaginatedVendorImportBatchesDto,
} from '@omnigrc/shared';
import { ExecuteVendorImportDto, VendorImportBatchesQueryDto } from './dto/vendors.dto';
import * as ExcelJS from 'exceljs';
import { Readable } from 'stream';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const MAX_IMPORT_ROWS = 5000;

// Allowed target schema fields for column mapping
const ALLOWED_TARGET_FIELDS = [
  'name',
  'category',
  'criticality',
  'owner',
  'department',
  'websiteUrl',
  'description',
  'reviewCadenceDays',
  'dueDiligenceStatus',
  'contactEmail',
  'contactPhone',
  'taxId',
] as const;

type AllowedTargetField = (typeof ALLOWED_TARGET_FIELDS)[number];

@Injectable()
export class VendorImportService {
  private readonly logger = new Logger(VendorImportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  /**
   * Formula Injection Sanitization (CWE-1236)
   * If a string cell starts with '=', '+', '-', '@', '\t', '\r', or contains DDE commands,
   * prefix it with a single quote (') to neutralize executable formulas in spreadsheet clients.
   */
  public sanitizeCellValue(value: any): any {
    if (value === null || value === undefined) return null;
    if (typeof value === 'string') {
      if (/^[=+\-@\t\r]/.test(value)) {
        return `'${value}`;
      }
      return value.trim();
    }
    return value;
  }

  /**
   * Mask sensitive sample values before sending to advisory AI / telemetry
   */
  public maskSampleValue(val: any, fieldKey?: string): string {
    if (val === null || val === undefined) return '';
    const str = String(val).trim();
    if (!str) return '';

    // If it looks like an email
    if (str.includes('@')) {
      const [local, domain] = str.split('@');
      return `${local.charAt(0)}***@***.${domain?.split('.').pop() || 'com'}`;
    }
    // If it's pure digits (phone, tax ID, registration)
    if (/^\+?\d[\d\s\-()]+$/.test(str)) {
      return str.replace(/\d/g, '*');
    }
    // Generic masking for long strings
    if (str.length > 20) {
      return `${str.substring(0, 3)}...[MASKED]`;
    }
    return str;
  }

  /**
   * Parse uploaded Excel (.xlsx) or CSV file with formula sanitization
   */
  async parseUploadedFile(file: any): Promise<{
    headers: string[];
    rows: Record<string, any>[];
    fileType: 'XLSX' | 'CSV';
  }> {
    if (!file || !file.buffer) {
      throw new BadRequestException('No file provided for vendor import.');
    }

    if (file.size > MAX_FILE_SIZE) {
      throw new BadRequestException(
        `File size exceeds 10 MB limit (${(file.size / (1024 * 1024)).toFixed(1)} MB).`,
      );
    }

    const originalName = file.originalname || '';
    const ext = originalName.split('.').pop()?.toLowerCase();
    const isXlsx = ext === 'xlsx' || file.mimetype.includes('spreadsheet') || file.mimetype.includes('excel');
    const isCsv = ext === 'csv' || file.mimetype.includes('csv') || file.mimetype.includes('text');

    if (!isXlsx && !isCsv) {
      throw new BadRequestException(
        `Unsupported file type (.${ext}). Only Excel (.xlsx) and CSV (.csv) files are supported.`,
      );
    }

    const workbook = new ExcelJS.Workbook();
    if (isXlsx) {
      try {
        await workbook.xlsx.load(file.buffer);
      } catch (err: any) {
        throw new BadRequestException(`Malformed Excel file: ${err.message}`);
      }
    } else {
      try {
        const stream = Readable.from(file.buffer);
        await workbook.csv.read(stream);
      } catch (err: any) {
        throw new BadRequestException(`Malformed CSV file: ${err.message}`);
      }
    }

    const worksheet = workbook.worksheets[0];
    if (!worksheet || worksheet.rowCount < 1) {
      throw new BadRequestException('Uploaded file contains no worksheets or data.');
    }

    const headers: string[] = [];
    const headerRow = worksheet.getRow(1);
    headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      const text = cell.text?.trim() || String(cell.value || '').trim();
      if (text) {
        headers[colNumber - 1] = text;
      }
    });

    if (headers.filter(Boolean).length === 0) {
      throw new BadRequestException('Uploaded file has no recognizable header columns.');
    }

    const rows: Record<string, any>[] = [];
    for (let rowIdx = 2; rowIdx <= worksheet.rowCount; rowIdx++) {
      if (rows.length >= MAX_IMPORT_ROWS) {
        break;
      }

      const row = worksheet.getRow(rowIdx);
      let hasData = false;
      const rowData: Record<string, any> = {};

      headers.forEach((h, colIdx) => {
        if (!h) return;
        const cell = row.getCell(colIdx + 1);
        const rawVal = cell.text !== undefined && cell.text !== '' ? cell.text : cell.value;
        const sanitizedVal = this.sanitizeCellValue(rawVal);
        if (sanitizedVal !== null && sanitizedVal !== undefined && sanitizedVal !== '') {
          hasData = true;
          rowData[h] = sanitizedVal;
        } else {
          rowData[h] = null;
        }
      });

      if (hasData) {
        rows.push(rowData);
      }
    }

    if (rows.length === 0) {
      throw new BadRequestException('Uploaded file contains headers but no data rows.');
    }

    return {
      headers: headers.filter(Boolean),
      rows,
      fileType: isXlsx ? 'XLSX' : 'CSV',
    };
  }

  /**
   * AI-Assisted Advisory Column Mapping
   * Provides deterministic heuristic matching with confidence scoring,
   * while keeping mappings strictly advisory with client override capability.
   */
  suggestColumnMapping(
    headers: string[],
    sampleRows: Record<string, any>[],
  ): {
    suggestedMapping: Record<string, string>;
    confidenceScores: Record<string, number>;
  } {
    const suggestedMapping: Record<string, string> = {};
    const confidenceScores: Record<string, number> = {};

    const synonyms: Record<AllowedTargetField, string[]> = {
      name: ['vendor', 'vendorname', 'company', 'companyname', 'organization', 'supplier', 'partner', 'thirdparty', 'legalname', 'name'],
      category: ['category', 'servicecategory', 'type', 'vendortype', 'industry', 'domain', 'segment'],
      criticality: ['criticality', 'risklevel', 'risktier', 'tier', 'priority', 'severity', 'rating'],
      owner: ['owner', 'vendorowner', 'lead', 'relationshipmanager', 'contactperson', 'internalowner', 'poc'],
      department: ['department', 'dept', 'businessunit', 'bu', 'team', 'division'],
      websiteUrl: ['website', 'websiteurl', 'url', 'web', 'domain', 'link', 'site'],
      description: ['description', 'desc', 'overview', 'details', 'notes', 'summary', 'servicesummary', 'scope'],
      reviewCadenceDays: ['cadence', 'cadencedays', 'reviewcadence', 'frequency', 'reviewfrequency', 'interval'],
      dueDiligenceStatus: ['duediligence', 'duediligencestatus', 'compliance', 'compliancestatus', 'vetting'],
      contactEmail: ['email', 'contactemail', 'vendoremail', 'supportemail', 'mail'],
      contactPhone: ['phone', 'contactphone', 'phonenumber', 'tel', 'mobile', 'telephone'],
      taxId: ['taxid', 'ein', 'tin', 'vat', 'gstin', 'gst', 'registrationnumber', 'pan', 'regnumber'],
    };

    const mappedTargetFields = new Set<string>();

    for (const header of headers) {
      const normalizedHeader = header.toLowerCase().replace(/[^a-z0-9]/g, '');

      let bestMatch: AllowedTargetField | null = null;
      let highestScore = 0;

      for (const [targetKey, list] of Object.entries(synonyms) as [AllowedTargetField, string[]][]) {
        if (mappedTargetFields.has(targetKey)) continue;

        // Exact match
        if (normalizedHeader === targetKey.toLowerCase() || list.includes(normalizedHeader)) {
          bestMatch = targetKey;
          highestScore = 0.98;
          break;
        }

        // Substring / prefix match
        for (const term of list) {
          if (normalizedHeader.includes(term) || term.includes(normalizedHeader)) {
            const score = 0.85;
            if (score > highestScore) {
              highestScore = score;
              bestMatch = targetKey;
            }
          }
        }
      }

      if (bestMatch && highestScore >= 0.80) {
        suggestedMapping[header] = bestMatch;
        confidenceScores[header] = highestScore;
        mappedTargetFields.add(bestMatch);
      }
    }

    return { suggestedMapping, confidenceScores };
  }

  /**
   * Generate Import Preview with Row Validation & Duplicate Detection
   */
  async generatePreview(
    authCtx: ResourceAuthContext,
    rows: Record<string, any>[],
    columnMapping: Record<string, string>,
  ): Promise<VendorImportPreviewResponseDto> {
    if (!rows || rows.length === 0) {
      throw new BadRequestException('No rows provided for import preview.');
    }

    // Server-side validation of mapping: Name field is mandatory
    const mappedTargets = Object.values(columnMapping);
    if (!mappedTargets.includes('name')) {
      throw new BadRequestException(
        'Column mapping must map at least one column to the required "Vendor Name" field.',
      );
    }

    // Validate that mapped targets are known schema fields
    for (const target of mappedTargets) {
      if (!ALLOWED_TARGET_FIELDS.includes(target as any)) {
        throw new BadRequestException(`Unrecognized target field mapping: "${target}".`);
      }
    }

    // Invert mapping for quick row resolution: targetField -> sourceColumn
    const targetToSource: Record<string, string> = {};
    for (const [source, target] of Object.entries(columnMapping)) {
      if (target) targetToSource[target] = source;
    }

    // Fetch existing active vendors for duplicate checking
    const existingVendors = await this.prisma.vendor.findMany({
      where: {
        organizationId: authCtx.organizationId,
        deletedAt: null,
      },
      select: {
        id: true,
        name: true,
        contactEmail: true,
        taxId: true,
      },
    });

    // Build fast lookup indexes for duplicates
    const nameMap = new Map<string, string>(); // normalized name -> id
    const emailMap = new Map<string, string>(); // lowercase email -> id
    const taxMap = new Map<string, string>(); // trimmed tax ID -> id

    for (const ev of existingVendors) {
      if (ev.name) {
        nameMap.set(this.normalizeName(ev.name), ev.id);
      }
      if (ev.contactEmail) {
        emailMap.set(ev.contactEmail.toLowerCase().trim(), ev.id);
      }
      if (ev.taxId) {
        taxMap.set(ev.taxId.trim(), ev.id);
      }
    }

    const previewRows: VendorImportPreviewRowDto[] = [];
    let validRows = 0;
    let invalidRows = 0;
    let duplicateRows = 0;

    const sampleMaskedData: Record<string, any>[] = [];

    rows.forEach((rawRow, idx) => {
      const rowNumber = idx + 2; // Row 1 is header
      const errors: string[] = [];

      // Extract mapped values
      const nameVal = targetToSource['name'] ? rawRow[targetToSource['name']] : null;
      const categoryVal = targetToSource['category'] ? rawRow[targetToSource['category']] : null;
      const criticalityVal = targetToSource['criticality'] ? rawRow[targetToSource['criticality']] : null;
      const ownerVal = targetToSource['owner'] ? rawRow[targetToSource['owner']] : null;
      const deptVal = targetToSource['department'] ? rawRow[targetToSource['department']] : null;
      const websiteVal = targetToSource['websiteUrl'] ? rawRow[targetToSource['websiteUrl']] : null;
      const descVal = targetToSource['description'] ? rawRow[targetToSource['description']] : null;
      const cadenceVal = targetToSource['reviewCadenceDays'] ? rawRow[targetToSource['reviewCadenceDays']] : null;
      const ddVal = targetToSource['dueDiligenceStatus'] ? rawRow[targetToSource['dueDiligenceStatus']] : null;
      const emailVal = targetToSource['contactEmail'] ? rawRow[targetToSource['contactEmail']] : null;
      const phoneVal = targetToSource['contactPhone'] ? rawRow[targetToSource['contactPhone']] : null;
      const taxVal = targetToSource['taxId'] ? rawRow[targetToSource['taxId']] : null;

      // Validate required name
      const name = nameVal !== null && nameVal !== undefined ? String(nameVal).trim() : '';
      if (!name) {
        errors.push('Vendor Name is required and cannot be empty.');
      }

      // Validate Criticality
      let normalizedCriticality: VendorCriticality = VendorCriticality.MEDIUM;
      if (criticalityVal) {
        const critStr = String(criticalityVal).toUpperCase().trim();
        if (Object.values(VendorCriticality).includes(critStr as VendorCriticality)) {
          normalizedCriticality = critStr as VendorCriticality;
        } else {
          errors.push(`Invalid Criticality "${criticalityVal}". Expected CRITICAL, HIGH, MEDIUM, or LOW.`);
        }
      }

      // Validate review cadence
      let cadenceDays = 365;
      if (cadenceVal !== null && cadenceVal !== undefined && String(cadenceVal).trim() !== '') {
        const parsed = parseInt(String(cadenceVal), 10);
        if (isNaN(parsed) || parsed < 1) {
          errors.push(`Review Cadence must be a positive number of days (received "${cadenceVal}").`);
        } else {
          cadenceDays = parsed;
        }
      }

      // Validate email format if provided
      let contactEmail: string | null = null;
      if (emailVal) {
        const cleanEmail = String(emailVal).trim().toLowerCase();
        if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
          contactEmail = cleanEmail;
        } else {
          errors.push(`Invalid email format: "${emailVal}".`);
        }
      }

      // Duplicate Check
      let isDuplicate = false;
      let duplicateReason: string | undefined;
      let existingVendorId: string | undefined;

      if (name) {
        const normName = this.normalizeName(name);
        if (nameMap.has(normName)) {
          isDuplicate = true;
          existingVendorId = nameMap.get(normName);
          duplicateReason = `Exact match with existing vendor "${name}".`;
        }
      }
      if (!isDuplicate && contactEmail && emailMap.has(contactEmail)) {
        isDuplicate = true;
        existingVendorId = emailMap.get(contactEmail);
        duplicateReason = `Contact email "${contactEmail}" matches existing vendor.`;
      }
      if (!isDuplicate && taxVal && taxMap.has(String(taxVal).trim())) {
        isDuplicate = true;
        existingVendorId = taxMap.get(String(taxVal).trim());
        duplicateReason = `Tax / Registration ID "${taxVal}" matches existing vendor.`;
      }

      if (isDuplicate) duplicateRows++;
      if (errors.length > 0) invalidRows++;
      else validRows++;

      const mappedData = {
        name,
        category: categoryVal ? String(categoryVal).trim() : null,
        criticality: normalizedCriticality,
        owner: ownerVal ? String(ownerVal).trim() : 'Compliance Officer',
        department: deptVal ? String(deptVal).trim() : null,
        websiteUrl: websiteVal ? String(websiteVal).trim() : null,
        description: descVal ? String(descVal).trim() : null,
        reviewCadenceDays: cadenceDays,
        dueDiligenceStatus: ddVal ? String(ddVal).trim() : 'NOT_STARTED',
        contactEmail,
        contactPhone: phoneVal ? String(phoneVal).trim() : null,
        taxId: taxVal ? String(taxVal).trim() : null,
      };

      previewRows.push({
        rowNumber,
        rawData: rawRow,
        mappedData,
        isValid: errors.length === 0,
        errors,
        isDuplicate,
        duplicateReason,
        existingVendorId,
      });

      // Include masked sample for the first 3 rows
      if (idx < 3) {
        const maskedRow: Record<string, any> = {};
        for (const [k, v] of Object.entries(rawRow)) {
          maskedRow[k] = this.maskSampleValue(v, k);
        }
        sampleMaskedData.push(maskedRow);
      }
    });

    const detectedColumns = Object.keys(rows[0] || {});
    const { suggestedMapping, confidenceScores } = this.suggestColumnMapping(detectedColumns, rows.slice(0, 3));

    return {
      totalRows: rows.length,
      validRows,
      invalidRows,
      duplicateRows,
      detectedColumns,
      suggestedMapping: Object.keys(columnMapping).length > 0 ? columnMapping : suggestedMapping,
      confidenceScores,
      previewRows,
      sampleMaskedData,
    };
  }

  /**
   * Execute Bulk Vendor Import with Database Transaction & Batch History
   */
  async executeImport(
    authCtx: ResourceAuthContext,
    dto: ExecuteVendorImportDto,
  ): Promise<VendorImportResultDto> {
    const { fileName, fileType, rows, columnMapping, duplicateResolution = 'SKIP' } = dto;

    if (!rows || rows.length === 0) {
      throw new BadRequestException('No rows provided for import execution.');
    }
    if (rows.length > MAX_IMPORT_ROWS) {
      throw new BadRequestException(`Cannot import more than ${MAX_IMPORT_ROWS} rows in a single batch.`);
    }

    // Generate preview to validate rows and identify duplicates
    const preview = await this.generatePreview(authCtx, rows, columnMapping);

    let importedCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;
    const errors: Array<{ rowNumber: number; vendorName?: string; error: string }> = [];

    // Execute within Prisma $transaction for atomic integrity
    const batch = await this.prisma.$transaction(async (tx) => {
      // 1. Create Batch Tracking Record
      const newBatch = await tx.vendorImportBatch.create({
        data: {
          organizationId: authCtx.organizationId,
          fileName,
          fileType,
          totalRows: rows.length,
          status: VendorImportStatus.PROCESSING,
          columnMapping,
          createdById: authCtx.userId,
        },
      });

      // 2. Process rows
      for (const row of preview.previewRows) {
        if (!row.isValid) {
          errorCount++;
          errors.push({
            rowNumber: row.rowNumber,
            vendorName: row.mappedData.name,
            error: row.errors.join('; '),
          });
          continue;
        }

        const data = row.mappedData;

        if (row.isDuplicate && row.existingVendorId) {
          if (duplicateResolution === 'SKIP') {
            skippedCount++;
            continue;
          } else if (duplicateResolution === 'FLAG') {
            errorCount++;
            errors.push({
              rowNumber: row.rowNumber,
              vendorName: data.name,
              error: `Duplicate rejected: ${row.duplicateReason}`,
            });
            continue;
          } else if (duplicateResolution === 'UPDATE') {
            // Update existing vendor
            await tx.vendor.update({
              where: { id: row.existingVendorId },
              data: {
                ...(data.category && { category: data.category }),
                ...(data.criticality && { criticality: data.criticality }),
                ...(data.owner && { owner: data.owner }),
                ...(data.department && { department: data.department }),
                ...(data.websiteUrl && { websiteUrl: data.websiteUrl }),
                ...(data.description && { description: data.description }),
                ...(data.reviewCadenceDays && { reviewCadenceDays: data.reviewCadenceDays }),
                ...(data.contactEmail && { contactEmail: data.contactEmail }),
                ...(data.contactPhone && { contactPhone: data.contactPhone }),
                ...(data.taxId && { taxId: data.taxId }),
                importBatchId: newBatch.id,
              },
            });
            updatedCount++;
            continue;
          }
        }

        // New vendor insert
        await tx.vendor.create({
          data: {
            organizationId: authCtx.organizationId,
            name: data.name!,
            category: data.category,
            criticality: data.criticality || VendorCriticality.MEDIUM,
            status: VendorStatus.ACTIVE,
            owner: data.owner || 'Compliance Officer',
            department: data.department,
            websiteUrl: data.websiteUrl,
            description: data.description,
            reviewCadenceDays: data.reviewCadenceDays || 365,
            dueDiligenceStatus: data.dueDiligenceStatus || 'NOT_STARTED',
            contactEmail: data.contactEmail,
            contactPhone: data.contactPhone,
            taxId: data.taxId,
            createdById: authCtx.userId,
            importBatchId: newBatch.id,
          },
        });
        importedCount++;
      }

      // 3. Finalize Batch Record
      const finalStatus =
        errorCount === rows.length
          ? VendorImportStatus.FAILED
          : VendorImportStatus.COMPLETED;

      await tx.vendorImportBatch.update({
        where: { id: newBatch.id },
        data: {
          importedRows: importedCount,
          updatedRows: updatedCount,
          skippedRows: skippedCount,
          errorRows: errorCount,
          status: finalStatus,
          errorLog: errors.length > 0 ? (errors as any) : undefined,
          completedAt: new Date(),
        },
      });

      // 4. Audit Log
      await this.auditLogsService.log({
        organizationId: authCtx.organizationId,
        actorId: authCtx.userId,
        action: 'VENDOR_IMPORT_EXECUTED',
        entityType: 'VendorImportBatch',
        entityId: newBatch.id,
        metadata: {
          fileName,
          totalRows: rows.length,
          importedCount,
          updatedCount,
          skippedCount,
          errorCount,
          duplicateResolution,
        },
      });

      return newBatch;
    });

    this.logger.log(
      `Vendor import batch ${batch.id} finished: ${importedCount} imported, ${updatedCount} updated, ${skippedCount} skipped, ${errorCount} errors.`,
    );

    return {
      batchId: batch.id,
      totalRows: rows.length,
      importedCount,
      updatedCount,
      skippedCount,
      errorCount,
      status:
        errorCount === rows.length
          ? VendorImportStatus.FAILED
          : VendorImportStatus.COMPLETED,
      errors,
    };
  }

  /**
   * List past vendor import batches
   */
  async getImportBatches(
    authCtx: ResourceAuthContext,
    query: VendorImportBatchesQueryDto,
  ): Promise<PaginatedVendorImportBatchesDto> {
    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, Math.max(1, query.limit || 20));
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      this.prisma.vendorImportBatch.findMany({
        where: { organizationId: authCtx.organizationId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.vendorImportBatch.count({
        where: { organizationId: authCtx.organizationId },
      }),
    ]);

    return {
      items: items.map((b) => ({
        id: b.id,
        organizationId: b.organizationId,
        fileName: b.fileName,
        fileType: b.fileType,
        totalRows: b.totalRows,
        importedRows: b.importedRows,
        updatedRows: b.updatedRows,
        skippedRows: b.skippedRows,
        errorRows: b.errorRows,
        status: b.status as VendorImportStatus,
        columnMapping: b.columnMapping as any,
        errorLog: b.errorLog,
        createdById: b.createdById,
        createdAt: b.createdAt,
        completedAt: b.completedAt,
      })),
      total,
      page,
      limit,
    };
  }

  /**
   * Get single import batch details
   */
  async getImportBatchById(
    authCtx: ResourceAuthContext,
    batchId: string,
  ): Promise<VendorImportBatchDto> {
    const batch = await this.prisma.vendorImportBatch.findFirst({
      where: {
        id: batchId,
        organizationId: authCtx.organizationId,
      },
    });

    if (!batch) {
      throw new NotFoundException(`Vendor import batch "${batchId}" not found.`);
    }

    return {
      id: batch.id,
      organizationId: batch.organizationId,
      fileName: batch.fileName,
      fileType: batch.fileType,
      totalRows: batch.totalRows,
      importedRows: batch.importedRows,
      updatedRows: batch.updatedRows,
      skippedRows: batch.skippedRows,
      errorRows: batch.errorRows,
      status: batch.status as VendorImportStatus,
      columnMapping: batch.columnMapping as any,
      errorLog: batch.errorLog,
      createdById: batch.createdById,
      createdAt: batch.createdAt,
      completedAt: batch.completedAt,
    };
  }

  /**
   * Normalized vendor name for collision detection
   */
  private normalizeName(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }
}
