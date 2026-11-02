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

export interface IntegrityCheckResult {
  matched: boolean;
  actualChecksum: string;
  expectedChecksum: string;
}

export interface StorageStreamResult {
  stream: NodeJS.ReadableStream;
  filePath?: string;
  contentLength?: number;
  mimeType?: string;
}

export interface IEvidenceStorageProvider {
  saveFile(
    file: { originalname: string; buffer: Buffer; mimetype: string },
    organizationId: string,
  ): Promise<StorageSaveResult>;
  getFileStream(storageKey: string): Promise<StorageStreamResult> | StorageStreamResult;
  calculateChecksum(buffer: Buffer): string;
  verifyIntegrity(storageKey: string, expectedChecksum: string): Promise<IntegrityCheckResult>;
  deleteFile(storageKey: string): Promise<boolean>;
  exists(storageKey: string): Promise<boolean>;
}

const ALLOWED_EXTENSIONS = new Set([
  'pdf', 'doc', 'docx', 'xls', 'xlsx', 'csv',
  'png', 'jpg', 'jpeg', 'webp', 'txt', 'json', 'xml', 'log'
]);

const DANGEROUS_EXTENSIONS = new Set([
  'exe', 'bat', 'cmd', 'sh', 'ps1', 'vbs', 'js', 'scr', 'jar', 'msi', 'dll',
  'com', 'pif', 'hta', 'cpl', 'wsf', 'vbe', 'jse', 'reg', 'php', 'jsp', 'asp', 'aspx',
  'py', 'rb', 'bin', 'elf'
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
export class EvidenceStorageService implements IEvidenceStorageProvider {
  private readonly logger = new Logger(EvidenceStorageService.name);
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
    if (
      filename.includes('..') ||
      filename.includes('/') ||
      filename.includes('\\') ||
      filename.includes('\0') ||
      /%2e%2e|%2f|%5c|%00/i.test(filename)
    ) {
      throw new BadRequestException('Invalid filename. Path traversal symbols forbidden.');
    }

    // Double extension and dangerous extension protection
    const parts = filename.toLowerCase().split('.').filter(Boolean);
    if (parts.length < 2) {
      throw new BadRequestException('Filename must have a valid file extension.');
    }

    // Check all parts for dangerous executable/script extensions
    for (const part of parts) {
      if (DANGEROUS_EXTENSIONS.has(part)) {
        throw new BadRequestException(`Disallowed or suspicious file extension '.${part}' detected in filename.`);
      }
    }

    const ext = parts[parts.length - 1];
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      throw new BadRequestException(`File extension '.${ext}' is not supported for proof evidence.`);
    }

    if (buffer.length > MAX_FILE_SIZE_BYTES) {
      throw new BadRequestException(`File size exceeds maximum limit of 25MB (Received ${(buffer.length / 1024 / 1024).toFixed(2)}MB).`);
    }

    // Magic signature & binary executable checks
    this.verifyMagicSignature(ext, buffer);
  }

  private verifyMagicSignature(ext: string, buffer: Buffer): void {
    if (buffer.length < 2) return;

    // Defense-in-depth: Prohibit executable headers regardless of nominal extension
    // Windows PE / DOS MZ executable signature: 'MZ' (0x4D, 0x5A)
    if (buffer[0] === 0x4d && buffer[1] === 0x5a) {
      throw new BadRequestException('Executable binary files (DOS/PE) are strictly prohibited.');
    }

    // Linux ELF executable signature: 0x7F, 'E', 'L', 'F' (0x7F, 0x45, 0x4C, 0x46)
    if (buffer.length >= 4 && buffer[0] === 0x7f && buffer[1] === 0x45 && buffer[2] === 0x4c && buffer[3] === 0x46) {
      throw new BadRequestException('Executable binary files (ELF) are strictly prohibited.');
    }

    // Java bytecode: 0xCA, 0xFE, 0xBA, 0xBE
    if (buffer.length >= 4 && buffer[0] === 0xca && buffer[1] === 0xfe && buffer[2] === 0xba && buffer[3] === 0xbe) {
      throw new BadRequestException('Executable Java bytecode is strictly prohibited.');
    }

    // Executable shell script with shebang: '#!' (0x23, 0x21)
    if (buffer[0] === 0x23 && buffer[1] === 0x21 && ext !== 'txt' && ext !== 'log') {
      throw new BadRequestException('Executable shell scripts are strictly prohibited.');
    }

    // Specific format validation
    if (ext === 'pdf') {
      if (buffer.length < 5) {
        throw new BadRequestException('File is too short to be a valid PDF document.');
      }
      const header = buffer.toString('utf8', 0, 5);
      if (!header.startsWith('%PDF-')) {
        throw new BadRequestException('File signature mismatch: expected valid PDF document.');
      }
    } else if (ext === 'png') {
      if (buffer.length < 4 || buffer[0] !== 0x89 || buffer[1] !== 0x50 || buffer[2] !== 0x4e || buffer[3] !== 0x47) {
        throw new BadRequestException('File signature mismatch: expected valid PNG image.');
      }
    } else if (ext === 'jpg' || ext === 'jpeg') {
      if (buffer.length < 3 || buffer[0] !== 0xff || buffer[1] !== 0xd8 || buffer[2] !== 0xff) {
        throw new BadRequestException('File signature mismatch: expected valid JPEG image.');
      }
    } else if (ext === 'docx' || ext === 'xlsx') {
      // Office OpenXML files must begin with standard ZIP signature PK\x03\x04
      if (buffer.length < 4 || buffer[0] !== 0x50 || buffer[1] !== 0x4b || buffer[2] !== 0x03 || buffer[3] !== 0x04) {
        throw new BadRequestException(`File signature mismatch: expected valid OpenXML container for .${ext} document.`);
      }
      this.verifyZipContainerSafety(buffer, ext);
    }
  }

  private verifyZipContainerSafety(buffer: Buffer, ext: string): void {
    if (buffer.length < 30) {
      return; // Minimal stub or test buffer
    }

    let offset = 0;
    let entryCount = 0;
    let totalUncompressedSize = 0;

    const MAX_ENTRIES = 500;
    const MAX_UNCOMPRESSED = 100 * 1024 * 1024; // 100MB
    const MAX_RATIO = 100;

    while (offset + 30 <= buffer.length) {
      // Local file header signature 0x04034b50 (PK\x03\x04)
      if (
        buffer[offset] !== 0x50 ||
        buffer[offset + 1] !== 0x4b ||
        buffer[offset + 2] !== 0x03 ||
        buffer[offset + 3] !== 0x04
      ) {
        break;
      }

      entryCount++;
      if (entryCount > MAX_ENTRIES) {
        throw new BadRequestException('Archive structure safety violation: entry count exceeds limit (potential zip bomb).');
      }

      const compressedSize = buffer.readUInt32LE(offset + 18);
      const uncompressedSize = buffer.readUInt32LE(offset + 22);
      const nameLen = buffer.readUInt16LE(offset + 26);
      const extraLen = buffer.readUInt16LE(offset + 28);

      if (offset + 30 + nameLen > buffer.length) {
        break; // Truncated header
      }

      const entryName = buffer.toString('utf8', offset + 30, offset + 30 + nameLen);

      // Zip Slip detection: reject directory traversal in archive entry names
      if (
        entryName.includes('..') ||
        entryName.startsWith('/') ||
        entryName.startsWith('\\') ||
        entryName.includes('\0') ||
        /%2e%2e|%2f|%5c|%00/i.test(entryName)
      ) {
        throw new BadRequestException('Archive safety violation: path traversal detected inside archive entry name (Zip Slip).');
      }

      // Prohibit dangerous extensions inside archive entries
      const lowerName = entryName.toLowerCase();
      for (const dangerousExt of DANGEROUS_EXTENSIONS) {
        if (lowerName.endsWith('.' + dangerousExt)) {
          throw new BadRequestException(`Archive safety violation: embedded executable or script '.${dangerousExt}' detected inside container.`);
        }
      }

      totalUncompressedSize += uncompressedSize;
      if (totalUncompressedSize > MAX_UNCOMPRESSED) {
        throw new BadRequestException('Archive structure safety violation: total uncompressed size exceeds limit (potential zip bomb).');
      }

      if (uncompressedSize > 64 * 1024 && compressedSize > 0) {
        const ratio = uncompressedSize / compressedSize;
        if (ratio > MAX_RATIO) {
          throw new BadRequestException(`Archive structure safety violation: suspicious compression ratio ${ratio.toFixed(0)}:1 (potential zip bomb).`);
        }
      }

      offset += 30 + nameLen + extraLen + compressedSize;
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

  public getFileStream(storageKey: string): StorageStreamResult {
    if (!storageKey || storageKey.includes('..') || storageKey.includes('\0')) {
      throw new BadRequestException('Unauthorized storage path traversal.');
    }

    const fullPath = path.join(this.storageBaseDir, storageKey);
    // Security check: ensure path stays within storageBaseDir
    if (!fullPath.startsWith(this.storageBaseDir)) {
      throw new BadRequestException('Unauthorized storage path traversal.');
    }

    if (!fs.existsSync(fullPath)) {
      throw new NotFoundException(`File for storageKey "${storageKey}" not found in storage.`);
    }

    const stat = fs.statSync(fullPath);
    return {
      stream: fs.createReadStream(fullPath),
      filePath: fullPath,
      contentLength: stat.size,
    };
  }

  public async verifyIntegrity(storageKey: string, expectedChecksum: string): Promise<IntegrityCheckResult> {
    if (!storageKey || storageKey.includes('..') || storageKey.includes('\0')) {
      throw new BadRequestException('Unauthorized storage path traversal.');
    }

    const fullPath = path.join(this.storageBaseDir, storageKey);
    if (!fullPath.startsWith(this.storageBaseDir)) {
      throw new BadRequestException('Unauthorized storage path traversal.');
    }

    if (!fs.existsSync(fullPath)) {
      throw new NotFoundException(`File for storageKey "${storageKey}" not found in storage.`);
    }

    const fileBuffer = await fs.promises.readFile(fullPath);
    const actualChecksum = this.calculateChecksum(fileBuffer);
    return {
      matched: actualChecksum.toLowerCase() === (expectedChecksum || '').toLowerCase(),
      actualChecksum,
      expectedChecksum,
    };
  }

  public async exists(storageKey: string): Promise<boolean> {
    if (!storageKey || storageKey.includes('..') || storageKey.includes('\0')) {
      return false;
    }
    const fullPath = path.join(this.storageBaseDir, storageKey);
    if (!fullPath.startsWith(this.storageBaseDir)) {
      return false;
    }
    return fs.existsSync(fullPath);
  }

  public async deleteFile(storageKey: string): Promise<boolean> {
    try {
      if (!storageKey || storageKey.includes('..') || storageKey.includes('\0')) {
        return false;
      }
      const fullPath = path.join(this.storageBaseDir, storageKey);
      if (fullPath.startsWith(this.storageBaseDir) && fs.existsSync(fullPath)) {
        await fs.promises.unlink(fullPath);
        return true;
      }
      return false;
    } catch (err: any) {
      this.logger.error(`Storage deletion error for key "${storageKey}": ${err?.message || err}`);
      return false;
    }
  }
}
