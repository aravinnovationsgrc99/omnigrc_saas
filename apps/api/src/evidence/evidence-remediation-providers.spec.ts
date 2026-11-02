import { BadRequestException, NotFoundException } from '@nestjs/common';
import { EvidenceScanStatus } from '@omnigrc/shared';
import { S3EvidenceStorageProvider } from './s3-storage.provider';
import { ClamAvScannerEngine } from './clamav-scanner.engine';
import { EvidenceOrphanReconciliationService } from './evidence-orphan-reconciliation.service';
import * as net from 'net';
import * as fs from 'fs';
import * as path from 'path';

// Mock S3Client
jest.mock('@aws-sdk/client-s3', () => {
  return {
    S3Client: jest.fn().mockImplementation(() => ({
      send: jest.fn().mockImplementation((command: any) => {
        if (command._type === 'PutObject') {
          return Promise.resolve({ ETag: '"test-etag"' });
        }
        if (command._type === 'GetObject') {
          if (command.input.Key.includes('not-found')) {
            const err: any = new Error('NoSuchKey');
            err.name = 'NoSuchKey';
            err.$metadata = { httpStatusCode: 404 };
            return Promise.reject(err);
          }
          const { Readable } = require('stream');
          const stream = new Readable();
          stream.push(Buffer.from('sample pdf binary content'));
          stream.push(null);
          return Promise.resolve({
            Body: stream,
            ContentLength: 25,
            ContentType: 'application/pdf',
          });
        }
        if (command._type === 'HeadObject') {
          if (command.input.Key.includes('missing')) {
            const err: any = new Error('NotFound');
            err.name = 'NotFound';
            err.$metadata = { httpStatusCode: 404 };
            return Promise.reject(err);
          }
          return Promise.resolve({ ContentLength: 25 });
        }
        if (command._type === 'DeleteObject') {
          return Promise.resolve({});
        }
        if (command._type === 'ListObjectsV2') {
          return Promise.resolve({
            Contents: [
              { Key: 'org-1/old-orphan.pdf', Size: 1024, LastModified: new Date(Date.now() - 48 * 3600 * 1000) },
              { Key: 'org-1/active-doc.pdf', Size: 2048, LastModified: new Date() },
            ],
          });
        }
        return Promise.resolve({});
      }),
    })),
    PutObjectCommand: jest.fn().mockImplementation((input) => ({ _type: 'PutObject', input })),
    GetObjectCommand: jest.fn().mockImplementation((input) => ({ _type: 'GetObject', input })),
    HeadObjectCommand: jest.fn().mockImplementation((input) => ({ _type: 'HeadObject', input })),
    DeleteObjectCommand: jest.fn().mockImplementation((input) => ({ _type: 'DeleteObject', input })),
    ListObjectsV2Command: jest.fn().mockImplementation((input) => ({ _type: 'ListObjectsV2', input })),
  };
});

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn().mockResolvedValue('https://s3.amazonaws.com/omnigrc-evidence-vault/presigned-url?token=xyz'),
}));

describe('Phase 3 Remediation Providers Test Suite', () => {
  describe('S3EvidenceStorageProvider', () => {
    let provider: S3EvidenceStorageProvider;

    beforeEach(() => {
      provider = new S3EvidenceStorageProvider();
    });

    it('successfully uploads valid PDF evidence with tenant prefix and SHA-256 calculation', async () => {
      const validPdfBuffer = Buffer.concat([
        Buffer.from('%PDF-1.4\n'),
        Buffer.from('sample pdf content for test'),
      ]);

      const result = await provider.saveFile(
        {
          originalname: 'soc2_report.pdf',
          buffer: validPdfBuffer,
          mimetype: 'application/pdf',
        },
        'org-tenant-123',
      );

      expect(result.storageKey).toMatch(/^org-tenant-123\/[a-f0-9-]+-soc2_report\.pdf$/);
      expect(result.checksum).toHaveLength(64);
      expect(result.fileSize).toBe(validPdfBuffer.length);
      expect(result.mimeType).toBe('application/pdf');
    });

    it('rejects path traversal and forbidden characters in filenames', async () => {
      const validPdfBuffer = Buffer.from('%PDF-1.4 sample');
      await expect(
        provider.saveFile(
          {
            originalname: '../../etc/passwd.pdf',
            buffer: validPdfBuffer,
            mimetype: 'application/pdf',
          },
          'org-1',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects dangerous binary executable extensions and magic headers', async () => {
      const exeBuffer = Buffer.from([0x4d, 0x5a, 0x90, 0x00]); // MZ header
      await expect(
        provider.saveFile(
          {
            originalname: 'trojan.exe',
            buffer: exeBuffer,
            mimetype: 'application/octet-stream',
          },
          'org-1',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('generates secure presigned download URL with expiry', async () => {
      const url = await provider.getPresignedDownloadUrl('org-1/sample.pdf', 900);
      expect(url).toContain('https://s3.amazonaws.com');
      expect(url).toContain('presigned-url');
    });

    it('streams S3 file and verifies SHA-256 integrity match', async () => {
      const crypto = require('crypto');
      const expectedChecksum = crypto.createHash('sha256').update('sample pdf binary content').digest('hex');

      const integrity = await provider.verifyIntegrity('org-1/sample.pdf', expectedChecksum);
      expect(integrity.matched).toBe(true);
      expect(integrity.actualChecksum).toBe(expectedChecksum);
    });

    it('throws NotFoundException when S3 object does not exist', async () => {
      await expect(provider.getFileStream('org-1/not-found.pdf')).rejects.toThrow(NotFoundException);
    });

    it('returns true on exists for existing object, false for missing object', async () => {
      expect(await provider.exists('org-1/sample.pdf')).toBe(true);
      expect(await provider.exists('org-1/missing.pdf')).toBe(false);
    });
  });

  describe('ClamAvScannerEngine', () => {
    let engine: ClamAvScannerEngine;

    beforeEach(() => {
      process.env.CLAMAV_HOST = '127.0.0.1';
      process.env.CLAMAV_PORT = '3310';
      engine = new ClamAvScannerEngine();
    });

    afterEach(() => {
      delete process.env.CLAMAV_HOST;
    });

    it('correctly reports isConfigured when CLAMAV_HOST is present', () => {
      expect(engine.isConfigured()).toBe(true);
      delete process.env.CLAMAV_HOST;
      const unconfigured = new ClamAvScannerEngine();
      expect(unconfigured.isConfigured()).toBe(false);
    });

    it('parses ClamAV clean response "stream: OK" as CLEAN status', async () => {
      jest.spyOn(net, 'Socket').mockImplementation(() => {
        const emitter = new (require('events').EventEmitter)();
        (emitter as any).setTimeout = jest.fn();
        (emitter as any).destroy = jest.fn();
        (emitter as any).write = jest.fn();
        (emitter as any).connect = jest.fn((port: number, host: string, cb: () => void) => {
          cb();
          process.nextTick(() => {
            emitter.emit('data', Buffer.from('stream: OK\n'));
            emitter.emit('end');
          });
        });
        return emitter as any;
      });

      const result = await engine.scan('sample.pdf', Buffer.from('clean content'));
      expect(result.status).toBe(EvidenceScanStatus.CLEAN);
      expect(result.engineName).toContain('ClamAV');
    });

    it('parses ClamAV infected response "stream: Eicar-Test-Signature FOUND" as QUARANTINED', async () => {
      jest.spyOn(net, 'Socket').mockImplementation(() => {
        const emitter = new (require('events').EventEmitter)();
        (emitter as any).setTimeout = jest.fn();
        (emitter as any).destroy = jest.fn();
        (emitter as any).write = jest.fn();
        (emitter as any).connect = jest.fn((port: number, host: string, cb: () => void) => {
          cb();
          process.nextTick(() => {
            emitter.emit('data', Buffer.from('stream: Win.Test.EICAR_HDB-1 FOUND\n'));
            emitter.emit('end');
          });
        });
        return emitter as any;
      });

      const result = await engine.scan('eicar.com', Buffer.from('infected content'));
      expect(result.status).toBe(EvidenceScanStatus.QUARANTINED);
      expect(result.threatName).toBe('Win.Test.EICAR_HDB-1');
    });

    it('fails closed to SCAN_FAILED when connection errors occur', async () => {
      jest.spyOn(net, 'Socket').mockImplementation(() => {
        const emitter = new (require('events').EventEmitter)();
        (emitter as any).setTimeout = jest.fn();
        (emitter as any).destroy = jest.fn();
        (emitter as any).write = jest.fn();
        (emitter as any).connect = jest.fn(() => {
          process.nextTick(() => {
            emitter.emit('error', new Error('ECONNREFUSED 127.0.0.1:3310'));
          });
        });
        return emitter as any;
      });

      const result = await engine.scan('sample.pdf', Buffer.from('content'));
      expect(result.status).toBe(EvidenceScanStatus.SCAN_FAILED);
      expect(result.rawDetails).toContain('ECONNREFUSED');
    });
  });

  describe('EvidenceOrphanReconciliationService', () => {
    let service: EvidenceOrphanReconciliationService;
    let mockPrisma: any;
    let mockAuditLogs: any;
    let mockStorage: any;
    let mockS3: any;

    beforeEach(() => {
      mockPrisma = {
        evidence: {
          findMany: jest.fn().mockResolvedValue([
            { id: 'ev-1', storageKey: 'org-1/active-doc.pdf', organizationId: 'org-1' },
            { id: 'ev-2', storageKey: 'org-1/missing-binary.pdf', organizationId: 'org-1' },
          ]),
        },
        auditEvidence: {
          findMany: jest.fn().mockResolvedValue([
            { id: 'aev-1', fileUrl: 'org-1/legacy-doc.pdf', organizationId: 'org-1' },
          ]),
        },
      };

      mockAuditLogs = {
        log: jest.fn().mockResolvedValue(true),
      };

      mockStorage = {
        exists: jest.fn().mockImplementation((key: string) => {
          if (key === 'org-1/missing-binary.pdf') return Promise.resolve(false);
          return Promise.resolve(true);
        }),
      };

      mockS3 = {
        listObjects: jest.fn().mockResolvedValue([
          { key: 'org-1/active-doc.pdf', size: 100, lastModified: new Date() },
          { key: 'org-1/legacy-doc.pdf', size: 200, lastModified: new Date() },
          { key: 'org-1/unreferenced-old.pdf', size: 50, lastModified: new Date(Date.now() - 48 * 3600 * 1000) },
        ]),
        exists: jest.fn().mockImplementation((key: string) => {
          if (key === 'org-1/missing-binary.pdf') return Promise.resolve(false);
          return Promise.resolve(true);
        }),
      };

      process.env.STORAGE_PROVIDER = 's3';
      service = new EvidenceOrphanReconciliationService(
        mockPrisma,
        mockAuditLogs,
        mockStorage,
        mockS3,
      );
    });

    afterEach(() => {
      delete process.env.STORAGE_PROVIDER;
    });

    it('identifies unreferenced storage objects older than cutoff margin as orphans', async () => {
      const report = await service.runReconciliation({
        olderThanHours: 24,
        organizationId: 'org-1',
      });

      expect(report.orphanedStorageKeys).toContain('org-1/unreferenced-old.pdf');
      expect(report.orphanedStorageKeys).not.toContain('org-1/active-doc.pdf');
      expect(report.missingBinaryRecords).toHaveLength(1);
      expect(report.missingBinaryRecords[0].storageKey).toBe('org-1/missing-binary.pdf');

      expect(mockAuditLogs.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'EVIDENCE_ORPHAN_RECONCILIATION_REPORT',
          entityType: 'EvidenceVault',
          metadata: expect.objectContaining({
            orphanedCount: 1,
            missingCount: 1,
          }),
        }),
      );
    });
  });
});

