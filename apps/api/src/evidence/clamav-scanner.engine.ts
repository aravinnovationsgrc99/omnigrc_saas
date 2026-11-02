import { Injectable, Logger } from '@nestjs/common';
import * as net from 'net';
import { EvidenceScanStatus } from '@omnigrc/shared';
import { IMalwareScannerEngine, ScannerScanResult } from './evidence-scanner.service';

@Injectable()
export class ClamAvScannerEngine implements IMalwareScannerEngine {
  public readonly engineName = 'ClamAV-Daemon (zINSTREAM)';
  private readonly logger = new Logger(ClamAvScannerEngine.name);

  private readonly host: string;
  private readonly port: number;
  private readonly timeoutMs: number;

  constructor() {
    this.host = process.env.CLAMAV_HOST || '127.0.0.1';
    this.port = Number(process.env.CLAMAV_PORT) || 3310;
    this.timeoutMs = Number(process.env.CLAMAV_TIMEOUT_MS) || 10000;
  }

  public isConfigured(): boolean {
    return !!process.env.CLAMAV_HOST;
  }

  public async ping(): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      const socket = new net.Socket();
      let response = '';

      socket.setTimeout(3000);

      socket.connect(this.port, this.host, () => {
        socket.write('zPING\0');
      });

      socket.on('data', (data) => {
        response += data.toString('utf8');
      });

      socket.on('end', () => {
        resolve(response.includes('PONG'));
      });

      socket.on('timeout', () => {
        socket.destroy();
        resolve(false);
      });

      socket.on('error', () => {
        socket.destroy();
        resolve(false);
      });
    });
  }

  public async scan(storageKey: string, buffer: Buffer): Promise<ScannerScanResult> {
    return new Promise<ScannerScanResult>((resolve) => {
      const socket = new net.Socket();
      let response = '';
      let resolved = false;

      const finish = (result: ScannerScanResult) => {
        if (!resolved) {
          resolved = true;
          socket.destroy();
          resolve(result);
        }
      };

      socket.setTimeout(this.timeoutMs);

      socket.on('timeout', () => {
        this.logger.error(`ClamAV socket timeout (${this.timeoutMs}ms) scanning "${storageKey}".`);
        finish({
          engineName: this.engineName,
          status: EvidenceScanStatus.SCAN_FAILED,
          rawDetails: `Timeout after ${this.timeoutMs}ms`,
        });
      });

      socket.on('error', (err) => {
        this.logger.error(`ClamAV connection error for "${storageKey}": ${err.message}`);
        finish({
          engineName: this.engineName,
          status: EvidenceScanStatus.SCAN_FAILED,
          rawDetails: err.message,
        });
      });

      socket.connect(this.port, this.host, () => {
        // Send zINSTREAM command with null delimiter
        socket.write('zINSTREAM\0');

        // Stream buffer in 64KB chunks: [4-byte big-endian size][chunk bytes]
        const CHUNK_SIZE = 64 * 1024;
        let offset = 0;

        while (offset < buffer.length) {
          const chunkEnd = Math.min(offset + CHUNK_SIZE, buffer.length);
          const chunkLength = chunkEnd - offset;
          const lenBuffer = Buffer.alloc(4);
          lenBuffer.writeUInt32BE(chunkLength, 0);

          socket.write(lenBuffer);
          socket.write(buffer.subarray(offset, chunkEnd));
          offset = chunkEnd;
        }

        // Terminate stream with zero length chunk
        const zeroChunk = Buffer.alloc(4, 0);
        socket.write(zeroChunk);
      });

      socket.on('data', (data) => {
        response += data.toString('utf8');
      });

      socket.on('end', () => {
        const trimmed = response.trim();
        this.logger.debug(`ClamAV raw response for "${storageKey}": ${trimmed}`);

        // Parse response
        // Expected Clean: "stream: OK"
        // Expected Virus: "stream: <VirusName> FOUND"
        // Expected Error: "stream: ... ERROR"
        if (trimmed.endsWith('OK')) {
          finish({
            engineName: this.engineName,
            status: EvidenceScanStatus.CLEAN,
            rawDetails: trimmed,
          });
        } else if (trimmed.includes('FOUND')) {
          const match = trimmed.match(/stream:\s*(.+?)\s+FOUND/);
          const threatName = match ? match[1] : 'Unknown-Threat';
          finish({
            engineName: this.engineName,
            status: EvidenceScanStatus.QUARANTINED,
            threatName,
            rawDetails: trimmed,
          });
        } else {
          finish({
            engineName: this.engineName,
            status: EvidenceScanStatus.SCAN_FAILED,
            rawDetails: trimmed || 'Empty or unexpected ClamAV response',
          });
        }
      });
    });
  }
}

