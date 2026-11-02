import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import * as crypto from 'crypto';
import {
  IEvidenceStorageProvider,
  StorageSaveResult,
  StorageStreamResult,
  IntegrityCheckResult,
} from './evidence-storage.service';

const ALLOWED_EXTENSIONS = new Set([
  'pdf', 'doc', 'docx', 'xls', 'xlsx', 'csv',
  'png', 'jpg', 'jpeg', 'webp', 'txt', 'json', 'xml', 'log'
]);

const DANGEROUS_EXTENSIONS = new Set([
  'exe', 'bat', 'cmd', 'sh', 'ps1', 'vbs', 'js', 'scr', 'jar', 'msi', 'dll',
  'com', 'pif', 'hta', 'cpl', 'wsf', 'vbe', 'jse', 'reg', 'php', 'jsp', 'asp', 'aspx',
  'py', 'rb', 'bin', 'elf'
]);

const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024; // 25 MB

@Injectable()
export class S3EvidenceStorageProvider implements IEvidenceStorageProvider {
  private readonly logger = new Logger(S3EvidenceStorageProvider.name);
  private readonly s3Client: S3Client;
  private readonly bucketName: string;
  private readonly sseAlgorithm: string;

  constructor() {
    const region = process.env.AWS_REGION || 'us-east-1';
    this.bucketName = process.env.AWS_S3_BUCKET_NAME || 'omnigrc-evidence-vault';
    this.sseAlgorithm = process.env.AWS_S3_SSE_ALGORITHM || 'AES256';

    const clientConfig: any = {
      region,
    };

    if (process.env.AWS_S3_ENDPOINT) {
      clientConfig.endpoint = process.env.AWS_S3_ENDPOINT;
      clientConfig.forcePathStyle = true;
    }

    if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
      clientConfig.credentials = {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      };
    }

    this.s3Client = new S3Client(clientConfig);
    this.logger.log(`Initialized S3 Evidence Storage Provider for bucket "${this.bucketName}" in region "${region}".`);
  }

  public validateFileHeaderAndExtension(filename: string, buffer: Buffer, mimeType: string): void {
    if (!filename || filename.length > 255) {
      throw new BadRequestException('Invalid filename. Maximum 255 characters allowed.');
    }

    if (
      filename.includes('..') ||
      filename.includes('/') ||
      filename.includes('\\') ||
      filename.includes('\0') ||
      /%2e%2e|%2f|%5c|%00/i.test(filename)
    ) {
      throw new BadRequestException('Invalid filename. Path traversal symbols forbidden.');
    }

    const parts = filename.toLowerCase().split('.').filter(Boolean);
    if (parts.length < 2) {
      throw new BadRequestException('Filename must have a valid file extension.');
    }

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
      throw new BadRequestException(
        `File size exceeds maximum limit of 25MB (Received ${(buffer.length / 1024 / 1024).toFixed(2)}MB).`,
      );
    }

    this.verifyMagicSignature(ext, buffer);
  }

  private verifyMagicSignature(ext: string, buffer: Buffer): void {
    if (buffer.length < 2) return;

    if (buffer[0] === 0x4d && buffer[1] === 0x5a) {
      throw new BadRequestException('Executable binary files (DOS/PE) are strictly prohibited.');
    }
    if (buffer.length >= 4 && buffer[0] === 0x7f && buffer[1] === 0x45 && buffer[2] === 0x4c && buffer[3] === 0x46) {
      throw new BadRequestException('Executable binary files (ELF) are strictly prohibited.');
    }
    if (buffer.length >= 4 && buffer[0] === 0xca && buffer[1] === 0xfe && buffer[2] === 0xba && buffer[3] === 0xbe) {
      throw new BadRequestException('Executable Java bytecode is strictly prohibited.');
    }
    if (buffer[0] === 0x23 && buffer[1] === 0x21 && ext !== 'txt' && ext !== 'log') {
      throw new BadRequestException('Executable shell scripts are strictly prohibited.');
    }

    if (ext === 'pdf') {
      if (buffer.length < 5) throw new BadRequestException('File is too short to be a valid PDF document.');
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
      if (buffer.length < 4 || buffer[0] !== 0x50 || buffer[1] !== 0x4b || buffer[2] !== 0x03 || buffer[3] !== 0x04) {
        throw new BadRequestException(`File signature mismatch: expected valid OpenXML container for .${ext} document.`);
      }
      this.verifyZipContainerSafety(buffer);
    }
  }

  private verifyZipContainerSafety(buffer: Buffer): void {
    if (buffer.length < 30) return;

    let offset = 0;
    let entryCount = 0;
    let totalUncompressedSize = 0;
    const MAX_ENTRIES = 500;
    const MAX_UNCOMPRESSED = 100 * 1024 * 1024;
    const MAX_RATIO = 100;

    while (offset + 30 <= buffer.length) {
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

      if (offset + 30 + nameLen > buffer.length) break;

      const entryName = buffer.toString('utf8', offset + 30, offset + 30 + nameLen);

      if (
        entryName.includes('..') ||
        entryName.startsWith('/') ||
        entryName.startsWith('\\') ||
        entryName.includes('\0') ||
        /%2e%2e|%2f|%5c|%00/i.test(entryName)
      ) {
        throw new BadRequestException('Archive safety violation: path traversal detected inside archive entry name (Zip Slip).');
      }

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
    const storageKey = `${organizationId}/${crypto.randomUUID()}-${safeName}`;

    try {
      const command = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: storageKey,
        Body: file.buffer,
        ContentType: file.mimetype || 'application/octet-stream',
        ServerSideEncryption: this.sseAlgorithm as any,
        Metadata: {
          organizationid: organizationId,
          checksum,
          originalname: safeName,
        },
      });

      await this.s3Client.send(command);
      this.logger.log(`Uploaded evidence file to S3 key "${storageKey}" with SSE-${this.sseAlgorithm}.`);

      return {
        storageKey,
        checksum,
        fileSize: file.buffer.length,
        mimeType: file.mimetype || 'application/octet-stream',
        originalFileName: file.originalname,
      };
    } catch (err: any) {
      this.logger.error(`S3 PutObject failure for key "${storageKey}": ${err?.message || err}`);
      throw new BadRequestException(`Failed to persist evidence object to S3: ${err?.message || err}`);
    }
  }

  public async getFileStream(storageKey: string): Promise<StorageStreamResult> {
    this.assertValidStorageKey(storageKey);

    try {
      const command = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: storageKey,
      });

      const response = await this.s3Client.send(command);

      if (!response.Body) {
        throw new NotFoundException(`File for storageKey "${storageKey}" has empty body in S3.`);
      }

      return {
        stream: response.Body as unknown as NodeJS.ReadableStream,
        contentLength: response.ContentLength,
        mimeType: response.ContentType,
      };
    } catch (err: any) {
      if (err.name === 'NoSuchKey' || err?.$metadata?.httpStatusCode === 404) {
        throw new NotFoundException(`File for storageKey "${storageKey}" not found in S3 bucket.`);
      }
      this.logger.error(`S3 GetObject failure for key "${storageKey}": ${err?.message || err}`);
      throw new BadRequestException(`Failed to read evidence object from S3: ${err?.message || err}`);
    }
  }

  public async getPresignedDownloadUrl(storageKey: string, expiresInSeconds = 900): Promise<string> {
    this.assertValidStorageKey(storageKey);

    const command = new GetObjectCommand({
      Bucket: this.bucketName,
      Key: storageKey,
    });

    return getSignedUrl(this.s3Client, command, { expiresIn: expiresInSeconds });
  }

  public async verifyIntegrity(storageKey: string, expectedChecksum: string): Promise<IntegrityCheckResult> {
    this.assertValidStorageKey(storageKey);

    const streamResult = await this.getFileStream(storageKey);
    const hash = crypto.createHash('sha256');

    return new Promise<IntegrityCheckResult>((resolve, reject) => {
      streamResult.stream.on('data', (chunk) => hash.update(chunk));
      streamResult.stream.on('end', () => {
        const actualChecksum = hash.digest('hex');
        resolve({
          matched: actualChecksum.toLowerCase() === (expectedChecksum || '').toLowerCase(),
          actualChecksum,
          expectedChecksum,
        });
      });
      streamResult.stream.on('error', (err) => reject(err));
    });
  }

  public async exists(storageKey: string): Promise<boolean> {
    try {
      this.assertValidStorageKey(storageKey);
      const command = new HeadObjectCommand({
        Bucket: this.bucketName,
        Key: storageKey,
      });
      await this.s3Client.send(command);
      return true;
    } catch (err: any) {
      if (err.name === 'NotFound' || err.name === 'NoSuchKey' || err?.$metadata?.httpStatusCode === 404) {
        return false;
      }
      return false;
    }
  }

  public async deleteFile(storageKey: string): Promise<boolean> {
    try {
      this.assertValidStorageKey(storageKey);
      const command = new DeleteObjectCommand({
        Bucket: this.bucketName,
        Key: storageKey,
      });
      await this.s3Client.send(command);
      this.logger.log(`Deleted S3 evidence object with key "${storageKey}".`);
      return true;
    } catch (err: any) {
      this.logger.error(`S3 DeleteObject failure for key "${storageKey}": ${err?.message || err}`);
      return false;
    }
  }

  public async listObjects(prefix?: string): Promise<{ key: string; size: number; lastModified: Date }[]> {
    const results: { key: string; size: number; lastModified: Date }[] = [];
    let continuationToken: string | undefined;

    do {
      const command = new ListObjectsV2Command({
        Bucket: this.bucketName,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      });

      const response = await this.s3Client.send(command);
      if (response.Contents) {
        for (const item of response.Contents) {
          if (item.Key) {
            results.push({
              key: item.Key,
              size: item.Size || 0,
              lastModified: item.LastModified || new Date(),
            });
          }
        }
      }
      continuationToken = response.NextContinuationToken;
    } while (continuationToken);

    return results;
  }

  private assertValidStorageKey(storageKey: string): void {
    if (
      !storageKey ||
      typeof storageKey !== 'string' ||
      storageKey.includes('..') ||
      storageKey.includes('\0') ||
      /%2e%2e|%00/i.test(storageKey)
    ) {
      throw new BadRequestException('Unauthorized or invalid storage key format.');
    }
  }
}

