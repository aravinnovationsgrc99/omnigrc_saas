import {
  Injectable,
  ForbiddenException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EntitlementStatus, FrameworkCode } from '@prisma/client';

@Injectable()
export class FrameworkEntitlementsService {
  private readonly logger = new Logger(FrameworkEntitlementsService.name);

  constructor(private readonly prisma: PrismaService) {}

  private async findFramework(frameworkIdOrCode: string) {
    const isEnumCode = Object.values(FrameworkCode).includes(frameworkIdOrCode as FrameworkCode);
    return this.prisma.framework.findFirst({
      where: isEnumCode
        ? { OR: [{ id: frameworkIdOrCode }, { code: frameworkIdOrCode as FrameworkCode }] }
        : { id: frameworkIdOrCode },
      select: { id: true, code: true, name: true },
    });
  }

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
   * Deterministic Conflict Resolution:
   * 1. If an explicit version-specific entitlement exists for a framework version, it overrides the framework-wide entitlement.
   * 2. If no version-specific record exists, the framework-wide entitlement (versionId = null) governs access.
   */
  async getEntitledFrameworkIds(organizationId: string, now: Date = new Date()): Promise<string[]> {
    const entitlements = await this.prisma.organizationFrameworkEntitlement.findMany({
      where: { organizationId },
    });

    if (entitlements.length > 0) {
      // Group entitlements by frameworkId
      const fwGroups = new Map<string, typeof entitlements>();
      for (const e of entitlements) {
        const list = fwGroups.get(e.frameworkId) || [];
        list.push(e);
        fwGroups.set(e.frameworkId, list);
      }

      const activeIds: string[] = [];
      for (const [frameworkId, group] of fwGroups.entries()) {
        const frameworkWide = group.find((e) => e.versionId === null);
        const versionSpecifics = group.filter((e) => e.versionId !== null);

        // Check if any version-specific record is active
        const hasActiveVersion = versionSpecifics.some((e) => this.isEffectivelyActive(e, now));
        // Check if framework-wide is active
        const isFwActive = frameworkWide ? this.isEffectivelyActive(frameworkWide, now) : false;

        if (hasActiveVersion || isFwActive) {
          activeIds.push(frameworkId);
        }
      }
      return activeIds;
    }

    // Unactivated / Local Development Mode Fallback
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
   * Check if an organization is entitled to a specific framework & version.
   * Precedence Rule:
   * Explicit version-specific record overrides framework-wide setting.
   */
  async isEntitled(
    organizationId: string,
    frameworkIdOrCode: string,
    versionId?: string | null,
    now: Date = new Date(),
  ): Promise<boolean> {
    const fw = await this.findFramework(frameworkIdOrCode);
    if (!fw) return false;

    // Check database records for this organization & framework
    const records = await this.prisma.organizationFrameworkEntitlement.findMany({
      where: { organizationId, frameworkId: fw.id },
    });

    if (records.length === 0) {
      // Local dev / test fallback
      if (
        (process.env.NODE_ENV === 'test' || process.env.NODE_ENV === 'development' || !process.env.NODE_ENV) &&
        process.env.ENFORCE_LICENSE_IN_TEST !== 'true'
      ) {
        return true;
      }
      return false;
    }

    // 1. If explicit versionId is specified:
    if (versionId) {
      const versionRecord = records.find((r) => r.versionId === versionId);
      if (versionRecord) {
        // Deterministic Rule 1: Explicit version record overrides framework-wide setting
        return this.isEffectivelyActive(versionRecord, now);
      }
      const fwRecord = records.find((r) => r.versionId === null);
      if (fwRecord) {
        return this.isEffectivelyActive(fwRecord, now);
      }
      return false;
    }

    // 2. If no specific versionId requested, fall back to framework-wide entitlement (versionId = null)
    const fwRecord = records.find((r) => r.versionId === null);
    if (fwRecord) {
      return this.isEffectivelyActive(fwRecord, now);
    }

    // 3. If versionId was not specified and no framework-wide record exists, check if ANY version record is active
    return records.some((r) => r.versionId !== null && this.isEffectivelyActive(r, now));
  }

  /**
   * Assert server-side framework entitlement or throw 403 Forbidden.
   */
  async assertEntitled(
    organizationId: string,
    frameworkIdOrCode: string,
    versionId?: string | null,
    now: Date = new Date(),
  ): Promise<void> {
    const fw = await this.findFramework(frameworkIdOrCode);

    if (!fw) {
      throw new NotFoundException(`Framework "${frameworkIdOrCode}" not found.`);
    }

    const entitled = await this.isEntitled(organizationId, fw.id, versionId, now);
    if (!entitled) {
      this.logger.warn(
        `SECURITY: Organization "${organizationId}" denied access to framework "${fw.code}" (${fw.name}).`,
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
      const matched = signedEntitlements.find(
        (e) =>
          e.code === `framework:${fw.code}` ||
          e.code === `FRAMEWORK_${fw.code}` ||
          e.code === fw.code,
      );

      const isEnabled = matched ? matched.enabled === true : false;
      const targetStatus = isEnabled ? EntitlementStatus.ACTIVE : EntitlementStatus.REVOKED;

      const existing = await this.prisma.organizationFrameworkEntitlement.findFirst({
        where: {
          organizationId,
          frameworkId: fw.id,
          versionId: null,
        },
      });

      if (existing) {
        await this.prisma.organizationFrameworkEntitlement.update({
          where: { id: existing.id },
          data: {
            status: targetStatus,
            expiresAt,
          },
        });
      } else {
        await this.prisma.organizationFrameworkEntitlement.create({
          data: {
            organizationId,
            frameworkId: fw.id,
            versionId: null,
            status: targetStatus,
            expiresAt,
            source: 'ARAV_CONTROL_PLANE',
          },
        });
      }
    }
  }
}
