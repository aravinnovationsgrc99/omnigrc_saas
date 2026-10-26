import { Injectable, Logger, OnApplicationShutdown } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { RegulatoryIngestionService } from './regulatory-ingestion.service';

@Injectable()
export class RegulatorySchedulerService implements OnApplicationShutdown {
  private readonly logger = new Logger(RegulatorySchedulerService.name);
  private isShuttingDown = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly ingestionService: RegulatoryIngestionService,
  ) {}

  onApplicationShutdown(signal?: string) {
    this.logger.log(`Regulatory scheduler shutting down cleanly on signal: ${signal}`);
    this.isShuttingDown = true;
  }

  /**
   * Evaluates due regulatory sources every 15 minutes.
   * If a source's nextScheduledFetchAt is due or has never run, triggers bounded ingestion.
   */
  @Cron('*/15 * * * *')
  async pollDueSources() {
    if (this.isShuttingDown) {
      this.logger.debug('Skipping regulatory poll cycle: application is shutting down.');
      return;
    }

    try {
      const now = new Date();

      // Find enabled, non-paused sources due for polling
      const dueSources = await this.prisma.regulatorySource.findMany({
        where: {
          isEnabled: true,
          isPaused: false,
          OR: [
            { nextScheduledFetchAt: { lte: now } },
            { nextScheduledFetchAt: null },
          ],
        },
      });

      if (dueSources.length === 0) {
        return;
      }

      this.logger.log(`Evaluating ${dueSources.length} due regulatory sources for scheduled sync...`);

      // Process sources with bounded concurrency and complete failure isolation
      for (const source of dueSources) {
        if (this.isShuttingDown) break;

        try {
          this.logger.log(`Triggering scheduled poll for regulatory source "${source.displayName}" (${source.regulatorCode})...`);
          await this.ingestionService.syncSource(source.id, {
            actorId: 'SYSTEM_SCHEDULER',
          });
        } catch (sourceErr: any) {
          // Failure on one source must NEVER block other sources
          this.logger.error(
            `Error in scheduled poll for source "${source.displayName}": ${sourceErr.message}`,
            sourceErr.stack,
          );
        }
      }
    } catch (err: any) {
      this.logger.warn(`Notice: Regulatory scheduler check skipped (${err.message}). Safe to continue in non-DB mode.`);
    }
  }
}
