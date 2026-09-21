import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
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
  'pdf', 'doc', 'docx', 'xls', 'xlsx', 'csv',
  'png', 'jpg', 'jpeg', 'webp', 'txt', 'json', 'xml', 'log'
]);

const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/csv',
  'image/png',
  'image/jpeg',
  'image/webp',
  'text/plain',
  'application/json',
  'application/xml',
  'text/xml',
  'text/x-log'
]);

const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024; // 25 MB

@Injectable()
export class EvidenceStorageService {
  private readonly storageBaseDir: string;

  constructor() {
    this.storageBaseDir = path.resolve(process.cwd(), 'uploads', 'evidence');
    if (!fs.existsSync(this.storageBaseDir)) {
      fs.mkdirSync(this.storageBaseDir, { recursive: true });
    }
  }

  public validateFileHeaderAndExtension(filename: string, buffer: Buffer, mimeType: string): void {
    if (!filename || filename.length > 255) {
      throw new BadRequestException('Invalid filename. Maximum 255 characters allowed.');
    }

    // Path traversal check
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      throw new BadRequestException('Invalid filename. Path traversal symbols forbidden.');
    }

    const ext = path.extname(filename).toLowerCase().replace('.', '');
    if (!ext || !ALLOWED_EXTENSIONS.has(ext)) {
      throw new BadRequestException(`File extension '.${ext}' is not supported for proof evidence.`);
    }

    if (buffer.length > MAX_FILE_SIZE_BYTES) {
      throw new BadRequestException(`File size exceeds maximum limit of 25MB (Received ${(buffer.length / 1024 / 1024).toFixed(2)}MB).`);
    }

    // Basic magic signature check for common file signatures
    this.verifyMagicSignature(ext, buffer);
  }

  private verifyMagicSignature(ext: string, buffer: Buffer): void {
    if (buffer.length < 4) return;

    if (ext === 'pdf') {
      const header = buffer.toString('utf8', 0, 5);
      if (!header.startsWith('%PDF-')) {
        throw new BadRequestException('File signature mismatch: expected valid PDF document.');
      }
    } else if (ext === 'png') {
      if (buffer[0] !== 0x89 || buffer[1] !== 0x50 || buffer[2] !== 0x4e || buffer[3] !== 0x47) {
        throw new BadRequestException('File signature mismatch: expected valid PNG image.');
      }
    } else if (ext === 'jpg' || ext === 'jpeg') {
      if (buffer[0] !== 0xff || buffer[1] !== 0xd8 || buffer[2] !== 0xff) {
        throw new BadRequestException('File signature mismatch: expected valid JPEG image.');
      }
    }
  }

  public sanitizeFilename(filename: string): string {
    return filename.replace(/[^a-zA-Z0-9._-]/g, '_');
  }

  public calculateChecksum(buffer: Buffer): string {
    return crypto.createHash('sha256').update(buffer).digest('hex');
  }

  public async saveFile(
    file: { originalname: string; buffer: Buffer; mimetype: string },
    organizationId: string,
  ): Promise<StorageSaveResult> {
    this.validateFileHeaderAndExtension(file.originalname, file.buffer, file.mimetype);

    const checksum = this.calculateChecksum(file.buffer);
    const safeName = this.sanitizeFilename(file.originalname);
    const uniqueKey = `${organizationId}/${crypto.randomUUID()}-${safeName}`;
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
    // Security check: ensure path stays within storageBaseDir
    if (!fullPath.startsWith(this.storageBaseDir)) {
      throw new BadRequestException('Unauthorized storage path traversal.');
    }

    if (!fs.existsSync(fullPath)) {
      throw new NotFoundException(`File for storageKey "${storageKey}" not found in storage.`);
    }

    return {
      stream: fs.createReadStream(fullPath),
      filePath: fullPath,
    };
  }

  public async deleteFile(storageKey: string): Promise<boolean> {
    try {
      const fullPath = path.join(this.storageBaseDir, storageKey);
      if (fullPath.startsWith(this.storageBaseDir) && fs.existsSync(fullPath)) {
        await fs.promises.unlink(fullPath);
        return true;
      }
    } catch {
      // Ignore non-fatal storage deletion errors
    }
    return false;
  }
}
