import { Injectable } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import { ReportColumnDto } from '@omnigrc/shared';

@Injectable()
export class ExcelExportService {
  /**
   * Smart Formula Injection Protection:
   * Sanitizes string values starting with '=', '+', '-', or '@' by prepending a single quote.
   * Preserves native numbers, booleans, and dates without unnecessary stringification.
   */
  public sanitizeCell(value: any): any {
    if (value === null || value === undefined) return '';

    if (typeof value === 'string') {
      const trimmed = value.trimStart();
      if (
        trimmed.startsWith('=') ||
        trimmed.startsWith('+') ||
        trimmed.startsWith('-') ||
        trimmed.startsWith('@')
      ) {
        return `'${value}`;
      }
      return value;
    }

    if (typeof value === 'boolean') {
      return value ? 'Yes' : 'No';
    }

    if (value instanceof Date) {
      return value.toISOString().split('T')[0];
    }

    return value;
  }

  public generateCsvBuffer(columns: ReportColumnDto[], rows: Record<string, any>[]): Buffer {
    const headers = columns.map((c) => this.escapeCsvField(c.header)).join(',');
    const csvRows = rows.map((row) => {
      return columns
        .map((col) => {
          const rawVal = row[col.key];
          const sanitizedVal = this.sanitizeCell(rawVal);
          return this.escapeCsvField(sanitizedVal);
        })
        .join(',');
    });

    const csvContent = [headers, ...csvRows].join('\r\n');
    return Buffer.from(`\uFEFF${csvContent}`, 'utf-8'); // Includes UTF-8 BOM for Excel compatibility
  }

  public async generateXlsxBuffer(
    reportTitle: string,
    columns: ReportColumnDto[],
    rows: Record<string, any>[],
  ): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'OMNiGRC System';
    workbook.created = new Date();

    const sheetName = reportTitle.replace(/[\\/?*:[\]]/g, ' ').substring(0, 31);
    const worksheet = workbook.addWorksheet(sheetName);

    // Set columns definition
    worksheet.columns = columns.map((col) => ({
      header: col.header,
      key: col.key,
      width: Math.max(col.header.length + 5, 18),
    }));

    // Style header row
    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF16233F' }, // OMNiGRC Navy
    };
    headerRow.alignment = { vertical: 'middle', horizontal: 'left' };

    // Add rows with sanitized cell values
    rows.forEach((row) => {
      const rowValues: Record<string, any> = {};
      columns.forEach((col) => {
        rowValues[col.key] = this.sanitizeCell(row[col.key]);
      });
      worksheet.addRow(rowValues);
    });

    const arrayBuffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(arrayBuffer);
  }

  private escapeCsvField(val: any): string {
    if (val === null || val === undefined) return '""';
    const str = String(val);
    if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  }
}
