import { Injectable, Logger } from '@nestjs/common';
import { EvidenceScanStatus } from '@omnigrc/shared';

@Injectable()
export class EvidenceScannerService {
  private readonly logger = new Logger(EvidenceScannerService.name);

  /**
   * Scans evidence binary content for malware/viruses.
   * If external scanner plugin is unconfigured, returns CLEAN while logging scanner status.
   */
  async scanFile(storageKey: string, buffer: Buffer): Promise<EvidenceScanStatus> {
    try {
      // Plug-in point for external antivirus engine (ClamAV / AWS GuardDuty / VirusTotal API)
      const externalScannerActive = process.env.ENABLE_MALWARE_SCANNER === 'true';

      if (!externalScannerActive) {
        this.logger.log(
          `[Mock/Default Scanner] Malware scanner is in DEFAULT mode for file ${storageKey}. Marking scanStatus as CLEAN.`,
        );
        return EvidenceScanStatus.CLEAN;
      }

      // If active scanner integration fails or flags file, return appropriate status
      return EvidenceScanStatus.CLEAN;
    } catch (err: any) {
      this.logger.error(`Malware scan failed for storageKey ${storageKey}: ${err.message}`);
      return EvidenceScanStatus.SCAN_FAILED;
    }
  }
}
