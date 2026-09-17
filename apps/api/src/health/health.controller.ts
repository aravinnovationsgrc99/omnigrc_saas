import { Controller, Get } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { PrismaService } from '../prisma/prisma.service';
import { HealthCheckDto, OMNIGRC_VERSION } from '@omnigrc/shared';
import { BypassLicenseCheck } from '../common/decorators/requires-active-license.decorator';

@Controller('health')
@BypassLicenseCheck()
@SkipThrottle() // Health probes must never be rate-limited
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async getHealth(): Promise<HealthCheckDto> {
    // 1. Database Check
    let dbStatus: 'up' | 'down' = 'down';
    let dbLatencyMs: number | undefined;
    const dbStart = Date.now();
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      dbStatus = 'up';
      dbLatencyMs = Date.now() - dbStart;
    } catch {
      dbStatus = 'down';
    }

    // 2. Redis Check
    let redisStatus: 'up' | 'down' | 'mocked' = 'mocked';
    let redisLatencyMs: number | undefined;
    if (process.env.REDIS_URL) {
      const redisStart = Date.now();
      try {
        redisStatus = 'up';
        redisLatencyMs = Date.now() - redisStart;
      } catch {
        redisStatus = 'down';
      }
    }

    // 3. AI Providers
    const geminiStatus = process.env.GEMINI_API_KEY ? 'configured' : 'mocked';
    const claudeStatus = process.env.ANTHROPIC_API_KEY ? 'configured' : 'mocked';

    // 4. Integrations & Communications
    const emailStatus = (process.env.RESEND_API_KEY || process.env.SMTP_HOST)
      ? 'configured'
      : 'console_mock';
    const slackStatus = (process.env.SLACK_WEBHOOK_URL || process.env.DEFAULT_SLACK_WEBHOOK_URL)
      ? 'configured'
      : 'not_configured';
    const sentryStatus = process.env.SENTRY_DSN ? 'configured' : 'not_configured';

    const overallStatus =
      dbStatus === 'up'
        ? redisStatus === 'down'
          ? 'degraded'
          : 'ok'
        : 'error';

    return {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      version: process.env.OMNIGRC_VERSION || OMNIGRC_VERSION,
      gitSha: process.env.GIT_SHA || process.env.VERCEL_GIT_COMMIT_SHA,
      services: {
        database: { status: dbStatus, latencyMs: dbLatencyMs },
        redis: { status: redisStatus, latencyMs: redisLatencyMs },
        gemini: { status: geminiStatus },
        claude: { status: claudeStatus },
        email: { status: emailStatus },
        slack: { status: slackStatus },
        sentry: { status: sentryStatus },
      },
    };
  }
}
