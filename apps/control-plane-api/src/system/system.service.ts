import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
// Removed DEV_LICENSE_PUBLIC_KEY import per security policy
import { ControlPlanePrismaService } from '../prisma/prisma.service';
import { LicenseSigningService } from '../licenses/license-signing.service';

export interface SystemOverviewDto {
  version: string;
  environment: string;
  databaseMigrationCount: number;
  latestMigration: string;
  health: {
    database: {
      status: 'healthy' | 'unhealthy' | 'unknown';
      latencyMs?: number;
    };
    redis: {
      status: 'configured' | 'unconfigured';
    };
    resend: {
      status: 'configured' | 'unconfigured';
    };
    aiProviders: {
      gemini: 'configured' | 'unconfigured';
      anthropic: 'configured' | 'unconfigured';
    };
  };
}

export interface KeyRegistryMetadataDto {
  keyId: string;
  algorithm: string;
  purpose: string;
  status: 'ACTIVE' | 'RETIRED' | 'REVOKED';
  publicKeyFingerprint: string;
  canonicalization: string;
  formatVersion: string;
  securityNotes: string;
}

@Injectable()
export class ControlPlaneSystemService {
  private readonly logger = new Logger(ControlPlaneSystemService.name);
  private readonly OMNIGRC_VERSION = '1.0.0';

  constructor(
    private readonly prisma: ControlPlanePrismaService,
    private readonly licenseSigningService: LicenseSigningService,
  ) {}

  /**
   * Return derived read-only system overview metadata.
   * Zero secret leakage. Return status strings only, never credentials.
   */
  async getSystemOverview(): Promise<SystemOverviewDto> {
    const environment = process.env.NODE_ENV || 'development';

    // Measure database latency
    let dbStatus: 'healthy' | 'unhealthy' | 'unknown' = 'unknown';
    let dbLatencyMs: number | undefined;

    try {
      const startTime = Date.now();
      await this.prisma.$queryRaw`SELECT 1`;
      dbLatencyMs = Date.now() - startTime;
      dbStatus = 'healthy';
    } catch (err: any) {
      this.logger.error(`System health check database query failed: ${err.message}`);
      dbStatus = 'unhealthy';
    }

    // Safely query applied migration count from _prisma_migrations
    let migrationCount = 11; // Fallback to current migration count
    let latestMigration = '20261001000000_add_cp_platform_announcements';

    try {
      const result: any[] = await this.prisma.$queryRaw`
        SELECT "migration_name" FROM "_prisma_migrations" WHERE "finished_at" IS NOT NULL ORDER BY "finished_at" DESC LIMIT 1
      `;
      const countResult: any[] = await this.prisma.$queryRaw`
        SELECT COUNT(*) as count FROM "_prisma_migrations" WHERE "finished_at" IS NOT NULL
      `;
      if (countResult && countResult[0]) {
        migrationCount = Number(countResult[0].count);
      }
      if (result && result[0] && result[0].migration_name) {
        latestMigration = result[0].migration_name;
      }
    } catch {
      /* Fallback values maintained if _prisma_migrations table is inaccessible */
    }

    const isRedisConfigured = Boolean(process.env.REDIS_URL);
    const isResendConfigured = Boolean(process.env.RESEND_API_KEY && !process.env.RESEND_API_KEY.startsWith('re_123456789'));
    const isGeminiConfigured = Boolean(process.env.GEMINI_API_KEY);
    const isAnthropicConfigured = Boolean(process.env.ANTHROPIC_API_KEY);

    return {
      version: this.OMNIGRC_VERSION,
      environment,
      databaseMigrationCount: migrationCount,
      latestMigration,
      health: {
        database: {
          status: dbStatus,
          latencyMs: dbLatencyMs,
        },
        redis: {
          status: isRedisConfigured ? 'configured' : 'unconfigured',
        },
        resend: {
          status: isResendConfigured ? 'configured' : 'unconfigured',
        },
        aiProviders: {
          gemini: isGeminiConfigured ? 'configured' : 'unconfigured',
          anthropic: isAnthropicConfigured ? 'configured' : 'unconfigured',
        },
      },
    };
  }

  /**
   * Return derived cryptographic key registry metadata.
   * Derived from LicenseSigningService without exposing private key bytes or secrets.
   */
  async getKeyRegistry(): Promise<KeyRegistryMetadataDto> {
    const keyId = this.licenseSigningService.getKeyId();

    // Derive SHA-256 public key fingerprint from environment variable only
    const envPublicKey = process.env.LICENSE_VERIFICATION_PUBLIC_KEY?.trim();
    let publicKeyFingerprint = '';
    if (envPublicKey && envPublicKey.length > 0) {
      const publicKeyPem = envPublicKey.replace(/\\n/g, '\n');
      publicKeyFingerprint = crypto
        .createHash('sha256')
        .update(publicKeyPem)
        .digest('hex');
    } else {
      // No valid public key provided; omit fingerprint to fail closed
      this.logger.warn('LICENSE_VERIFICATION_PUBLIC_KEY not set or empty; fingerprint omitted');
    }

    return {
      keyId,
      algorithm: 'Ed25519',
      purpose: 'LICENSE_ARTIFACT_SIGNING',
      status: 'ACTIVE',
      publicKeyFingerprint: `sha256:${publicKeyFingerprint}`,
      canonicalization: 'RFC 8785 JCS',
      formatVersion: '1.0',
      securityNotes: 'Private signing key material is held in infrastructure secrets and never exposed via API.',
    };
  }
}
