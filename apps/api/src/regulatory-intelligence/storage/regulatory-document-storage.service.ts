import { Injectable, BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

export interface StorageSaveResult {
  storageKey: string;
  checksum: string;
  fileSize: number;
  mimeType: string;
  originalFileName: string;
}

const ALLOWED_EXTENSIONS = new Set([
  'pdf',
  'doc',
  'docx',
  'xls',
  'xlsx',
  'csv',
  'txt',
  'json',
  'xml',
]);

const MAX_DOCUMENT_SIZE_BYTES = 25 * 1024 * 1024; // 25 MB

@Injectable()
export class RegulatoryDocumentStorageService {
  private readonly logger = new Logger(RegulatoryDocumentStorageService.name);
  private readonly storageBaseDir: string;

  constructor() {
    this.storageBaseDir = path.resolve(process.cwd(), 'uploads', 'regulatory-documents');
    if (!fs.existsSync(this.storageBaseDir)) {
      fs.mkdirSync(this.storageBaseDir, { recursive: true });
    }
  }

  public validateFileHeaderAndExtension(filename: string, buffer: Buffer, mimeType: string): void {
    if (!filename || filename.length > 255) {
      throw new BadRequestException('Invalid filename. Maximum 255 characters allowed.');
    }

    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      throw new BadRequestException('Invalid filename. Path traversal symbols forbidden.');
    }

    const ext = path.extname(filename).toLowerCase().replace('.', '');
    if (!ext || !ALLOWED_EXTENSIONS.has(ext)) {
      throw new BadRequestException(`File extension '.${ext}' is not supported for regulatory publications.`);
    }

    if (buffer.length > MAX_DOCUMENT_SIZE_BYTES) {
      throw new BadRequestException(
        `File size exceeds maximum limit of 25MB (Received ${(buffer.length / 1024 / 1024).toFixed(2)}MB).`,
      );
    }

    // Verify magic signatures
    if (ext === 'pdf' && buffer.length >= 5) {
      const header = buffer.toString('utf8', 0, 5);
      if (!header.startsWith('%PDF-')) {
        throw new BadRequestException('File signature mismatch: expected valid PDF document.');
      }
    }
  }

  public sanitizeFilename(filename: string): string {
    return filename.replace(/[^a-zA-Z0-9._-]/g, '_');
  }

  public calculateChecksum(buffer: Buffer): string {
    return crypto.createHash('sha256').update(buffer).digest('hex');
  }

  public async saveDocument(file: {
    originalname: string;
    buffer: Buffer;
    mimetype: string;
  }): Promise<StorageSaveResult> {
    this.validateFileHeaderAndExtension(file.originalname, file.buffer, file.mimetype);

    const checksum = this.calculateChecksum(file.buffer);
    const safeName = this.sanitizeFilename(file.originalname);
    const uniqueKey = `docs/${crypto.randomUUID()}-${safeName}`;
    const fullPath = path.join(this.storageBaseDir, uniqueKey);

    const dir = path.dirname(fullPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    await fs.promises.writeFile(fullPath, file.buffer);

    return {
      storageKey: uniqueKey,
      checksum,
      fileSize: file.buffer.length,
      mimeType: file.mimetype || 'application/octet-stream',
      originalFileName: file.originalname,
    };
  }

  public getFileStream(storageKey: string): { stream: fs.ReadStream; filePath: string } {
    const fullPath = path.join(this.storageBaseDir, storageKey);
    if (!fullPath.startsWith(this.storageBaseDir)) {
      throw new BadRequestException('Unauthorized storage path traversal.');
    }

    if (!fs.existsSync(fullPath)) {
      throw new NotFoundException(`Document for storageKey "${storageKey}" not found.`);
    }

    return {
      stream: fs.createReadStream(fullPath),
      filePath: fullPath,
    };
  }
}
