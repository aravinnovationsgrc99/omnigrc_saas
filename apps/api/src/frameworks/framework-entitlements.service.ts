import {
  Injectable,
  ForbiddenException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EntitlementStatus } from '@omnigrc/shared';

@Injectable()
export class FrameworkEntitlementsService {
  private readonly logger = new Logger(FrameworkEntitlementsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Real-time Effective Entitlement Evaluation.
   * NEVER relies solely on the stored DB status string.
   * If status is ACTIVE but expiresAt < now, returns false (EXPIRED).
   */
  public isEffectivelyActive(
    entitlement: {
      status: EntitlementStatus | string;
      grantedAt?: Date | string | null;
      expiresAt?: Date | string | null;
    } | null,
    now: Date = new Date(),
  ): boolean {
    if (!entitlement) return false;
    if (entitlement.status !== EntitlementStatus.ACTIVE && entitlement.status !== 'ACTIVE') {
      return false;
    }

    if (entitlement.grantedAt) {
      const grantedDate = new Date(entitlement.grantedAt);
      if (!isNaN(grantedDate.getTime()) && grantedDate.getTime() > now.getTime()) {
        return false;
      }
    }

    if (entitlement.expiresAt) {
      const expiresDate = new Date(entitlement.expiresAt);
      if (!isNaN(expiresDate.getTime()) && expiresDate.getTime() <= now.getTime()) {
        return false;
      }
    }

    return true;
  }

  /**
   * Fetch all framework IDs effectively entitled for a given organization.
   */
  async getEntitledFrameworkIds(organizationId: string, now: Date = new Date()): Promise<string[]> {
    const entitlements = await this.prisma.organizationFrameworkEntitlement.findMany({
      where: { organizationId },
      include: { framework: { select: { id: true, code: true } } },
    });

    // If organization has explicit database entitlements, evaluate them
    if (entitlements.length > 0) {
      const activeIds: string[] = [];
      for (const e of entitlements) {
        if (this.isEffectivelyActive(e, now)) {
          activeIds.push(e.frameworkId);
        }
      }
      return activeIds;
    }

    // Unactivated / Local Development Mode Fallback
    // If no explicit entitlements exist in DB and license enforcement is disabled in dev/test,
    // grant default access to all frameworks so local DX & existing specs continue seamlessly.
    if (
      (process.env.NODE_ENV === 'test' || process.env.NODE_ENV === 'development' || !process.env.NODE_ENV) &&
      process.env.ENFORCE_LICENSE_IN_TEST !== 'true'
    ) {
      const allFrameworks = await this.prisma.framework.findMany({ select: { id: true } });
      return allFrameworks.map((f) => f.id);
    }

    return [];
  }

  /**
   * Check if an organization is entitled to a specific framework (by ID or Code).
   */
  async isEntitled(
    organizationId: string,
    frameworkIdOrCode: string,
    now: Date = new Date(),
  ): Promise<boolean> {
    const fw = await this.prisma.framework.findFirst({
      where: {
        OR: [{ id: frameworkIdOrCode }, { code: frameworkIdOrCode as any }],
      },
      select: { id: true },
    });

    if (!fw) return false;

    const entitledIds = await this.getEntitledFrameworkIds(organizationId, now);
    return entitledIds.includes(fw.id);
  }

  /**
   * Assert server-side framework entitlement or throw 403 Forbidden.
   */
  async assertEntitled(
    organizationId: string,
    frameworkIdOrCode: string,
    now: Date = new Date(),
  ): Promise<void> {
    const fw = await this.prisma.framework.findFirst({
      where: {
        OR: [{ id: frameworkIdOrCode }, { code: frameworkIdOrCode as any }],
      },
      select: { id: true, code: true, name: true },
    });

    if (!fw) {
      throw new NotFoundException(`Framework "${frameworkIdOrCode}" not found.`);
    }

    const entitled = await this.isEntitled(organizationId, fw.id, now);
    if (!entitled) {
      this.logger.warn(
        `SECURITY: Organization "${organizationId}" denied access to non-entitled framework "${fw.code}" (${fw.name}).`,
      );
      throw new ForbiddenException({
        statusCode: 403,
        error: 'Forbidden',
        message: `Organization is not commercially entitled to access framework "${fw.code}". Access denied by Arav Innovations Platform Authority.`,
        code: 'FRAMEWORK_NOT_ENTITLED',
        frameworkCode: fw.code,
      });
    }
  }

  /**
   * Reconcile Control Plane signed Ed25519 license artifact entitlements into local Data Plane database.
   */
  async reconcileSignedLicenseEntitlements(
    organizationId: string,
    signedEntitlements: Array<{ code: string; enabled: boolean; value?: any }>,
    expiresAtIso?: string,
  ): Promise<void> {
    const frameworks = await this.prisma.framework.findMany();
    const expiresAt = expiresAtIso ? new Date(expiresAtIso) : null;

    for (const fw of frameworks) {
      // Look for entitlement codes: e.g. "framework:ISO27001", "FRAMEWORK_ISO27001", "ISO27001"
      const matched = signedEntitlements.find(
        (e) =>
          e.code === `framework:${fw.code}` ||
          e.code === `FRAMEWORK_${fw.code}` ||
          e.code === fw.code,
      );

      const isEnabled = matched ? matched.enabled === true : false;
      const targetStatus = isEnabled ? EntitlementStatus.ACTIVE : EntitlementStatus.REVOKED;

      await this.prisma.organizationFrameworkEntitlement.upsert({
        where: {
          organizationId_frameworkId: {
            organizationId,
            frameworkId: fw.id,
          },
        },
        update: {
          status: targetStatus,
          expiresAt,
          provenance: {
            source: 'Control Plane Signed License Artifact Sync',
            syncedAt: new Date().toISOString(),
          },
        },
        create: {
          organizationId,
          frameworkId: fw.id,
          status: targetStatus,
          expiresAt,
          provenance: {
            source: 'Control Plane Signed License Artifact Sync',
            syncedAt: new Date().toISOString(),
          },
        },
      });
    }
  }
}
