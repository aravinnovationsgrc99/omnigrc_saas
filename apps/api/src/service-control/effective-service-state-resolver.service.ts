import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LicenseVerificationService } from '../license-verification/license-verification.service';

export const KNOWN_CAPABILITY_CODES = new Set([
  'GRC_CORE_ASSETS',
  'GRC_CORE_RISKS',
  'GRC_CORE_CONTROLS',
  'GRC_CORE_TASKS',
  'FRAMEWORK_LIBRARY',
  'FRAMEWORK_COVERAGE',
  'EVIDENCE_VAULT',
  'APPROVAL_ENGINE',
  'POLICIES_MODULE',
  'BUSINESS_AUDITS',
  'VENDOR_RISK',
  'VULNERABILITY_MGMT',
  'INCIDENT_MGMT',
  'AI_DOC_INTELLIGENCE',
  'AI_GRC_CHAT',
  'AI_CONTROL_MAPPING',
  'NOTIFICATIONS_EMAIL',
  'MSSP_PORTAL',
  'REPORTING_MODULE',
  'INTEGRATIONS_HUB',
  'REGULATORY_INTELLIGENCE',
]);

export interface EffectiveServiceStateResult {
  capabilityCode: string;
  effectiveState: 'AVAILABLE' | 'DISABLED' | 'COMMERCIAL_DISABLED';
  isAvailable: boolean;
  reason: string;
  source:
    | 'COMMERCIAL_LICENSE'
    | 'ORGANIZATION_CONTROL_STATE'
    | 'GLOBAL_SERVICE_STATE'
    | 'ORGANIZATION_SERVICE_OVERRIDE'
    | 'CATALOG_DEFAULT'
    | 'FAIL_SAFE_ERROR';
}

@Injectable()
export class EffectiveServiceStateResolver {
  private readonly logger = new Logger(EffectiveServiceStateResolver.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly licenseVerificationService: LicenseVerificationService,
  ) {}

  /**
   * Resolve authoritative effective capability state for an organization.
   * Failure Semantics: Fail-Closed for unknown codes or system errors.
   * Precedence Hierarchy:
   * 1. Commercial License
   * 2. Organization Control State (DISABLED, DECOMMISSIONED, SUSPENDED)
   * 3. Global Service State (COMMERCIAL_DISABLED, DISABLED)
   * 4. Organization Service Override (DISABLED)
   * 5. Catalog Default
   */
  async resolveEffectiveState(
    organizationId: string,
    capabilityCode: string,
  ): Promise<EffectiveServiceStateResult> {
    try {
      // 0. Unknown Capability Code Validation (Fail-Closed)
      if (!capabilityCode || !KNOWN_CAPABILITY_CODES.has(capabilityCode)) {
        this.logger.warn(`Resolver received unknown or uncataloged capability code [${capabilityCode}]`);
        return {
          capabilityCode,
          effectiveState: 'DISABLED',
          isAvailable: false,
          reason: `Capability code [${capabilityCode}] is not recognized in the canonical service catalog.`,
          source: 'CATALOG_DEFAULT',
        };
      }

      // 1. Evaluate Commercial License State
      if (organizationId) {
        const licenseEval = await this.licenseVerificationService.getEvaluatedStateForOrganization(organizationId);
        if (['UNLICENSED', 'INVALID_OR_UNAVAILABLE', 'REVOKED'].includes(licenseEval.state)) {
          return {
            capabilityCode,
            effectiveState: 'COMMERCIAL_DISABLED',
            isAvailable: false,
            reason: `Commercial license is ${licenseEval.state}: ${licenseEval.reason}`,
            source: 'COMMERCIAL_LICENSE',
          };
        }

        // Check specific service capability entitlement if recorded on license artifact
        const sysLicense = await this.prisma.systemLicenseState.findFirst({
          where: { OR: [{ organizationId }, { id: 'current' }] },
        });

        if (sysLicense && sysLicense.signedArtifactJson) {
          const artifact = sysLicense.signedArtifactJson as any;
          const entitlements: any[] = artifact.payload?.entitlements || [];
          const version = artifact.payload?.licenseFormatVersion || artifact.formatVersion || '1.0';
          const serviceEntitlement = entitlements.find((e: any) => e.code === `service:${capabilityCode}`);

          if (serviceEntitlement) {
            if (serviceEntitlement.enabled === false) {
              return {
                capabilityCode,
                effectiveState: 'COMMERCIAL_DISABLED',
                isAvailable: false,
                reason: `Service capability [${capabilityCode}] is explicitly excluded by commercial license.`,
                source: 'COMMERCIAL_LICENSE',
              };
            }
          } else {
            // Omitted capability claim in signed artifact
            if (capabilityCode === 'GRC_CORE_ASSETS') {
              // Base module is always allowed under valid commercial license
            } else if (version === '2.0' || version === 'v2' || Number(version) >= 2) {
              // Version 2.0+ Artifact: Granular entitlement model requires explicit capability claim
              return {
                capabilityCode,
                effectiveState: 'COMMERCIAL_DISABLED',
                isAvailable: false,
                reason: `Service capability [${capabilityCode}] is omitted from v2.0 commercial license artifact.`,
                source: 'COMMERCIAL_LICENSE',
              };
            } else {
              // Version 1.0 Legacy Artifact Compatibility:
              // Historical core capabilities remain grandfathered; newly introduced optional paid capabilities require explicit claims.
              const LEGACY_1_0_GRANDFATHERED = new Set([
                'GRC_CORE_ASSETS',
                'GRC_CORE_RISKS',
                'GRC_CORE_CONTROLS',
                'GRC_CORE_TASKS',
                'POLICIES_MODULE',
                'EVIDENCE_VAULT',
                'APPROVAL_ENGINE',
                'REPORTING_MODULE',
                'NOTIFICATIONS_EMAIL',
              ]);

              if (!LEGACY_1_0_GRANDFATHERED.has(capabilityCode)) {
                return {
                  capabilityCode,
                  effectiveState: 'COMMERCIAL_DISABLED',
                  isAvailable: false,
                  reason: `Service capability [${capabilityCode}] is an optional paid module not granted in legacy v1.0 artifact.`,
                  source: 'COMMERCIAL_LICENSE',
                };
              }
            }
          }
        }
      }

      // 2. Evaluate Organization Control State
      if (organizationId) {
        const orgControlProj = await this.prisma.organizationControlStateProjection.findUnique({
          where: { organizationId },
        });

        const orgState = orgControlProj ? orgControlProj.state : 'ACTIVE';

        if (orgState === 'DISABLED' || orgState === 'DECOMMISSIONED') {
          return {
            capabilityCode,
            effectiveState: 'DISABLED',
            isAvailable: false,
            reason: `Organization control state is ${orgState}.`,
            source: 'ORGANIZATION_CONTROL_STATE',
          };
        }
      }

      // 3. Evaluate Global Service State
      const globalProj = await this.prisma.globalServiceStateProjection.findUnique({
        where: { capabilityCode },
      });

      const globalState = globalProj ? globalProj.state : 'AVAILABLE';

      if (globalState === 'COMMERCIAL_DISABLED' || globalState === 'DISABLED') {
        return {
          capabilityCode,
          effectiveState: globalState === 'COMMERCIAL_DISABLED' ? 'COMMERCIAL_DISABLED' : 'DISABLED',
          isAvailable: false,
          reason: `Service capability [${capabilityCode}] is globally set to ${globalState}.`,
          source: 'GLOBAL_SERVICE_STATE',
        };
      }

      // 4. Evaluate Organization Service Override
      if (organizationId) {
        const orgOverride = await this.prisma.organizationServiceOverrideProjection.findUnique({
          where: {
            organizationId_capabilityCode: {
              organizationId,
              capabilityCode,
            },
          },
        });

        if (orgOverride) {
          const overrideState = orgOverride.overrideState as string;
          if (overrideState === 'DISABLED' || overrideState === 'COMMERCIAL_DISABLED') {
            return {
              capabilityCode,
              effectiveState: overrideState as any,
              isAvailable: false,
              reason: orgOverride.reason || `Organization override disabled capability [${capabilityCode}].`,
              source: 'ORGANIZATION_SERVICE_OVERRIDE',
            };
          }
        }
      }

      // 5. Default: Service is AVAILABLE
      return {
        capabilityCode,
        effectiveState: 'AVAILABLE',
        isAvailable: true,
        reason: `Service capability [${capabilityCode}] is active and permitted.`,
        source: 'CATALOG_DEFAULT',
      };
    } catch (err: any) {
      this.logger.error(`Error resolving effective state for capability [${capabilityCode}]: ${err.message}`);
      // Fail Closed Security Behavior
      return {
        capabilityCode,
        effectiveState: 'DISABLED',
        isAvailable: false,
        reason: `Resolver fail-safe triggered due to internal error: ${err.message}`,
        source: 'FAIL_SAFE_ERROR',
      };
    }
  }

  /**
   * Resolve authoritative effective capability map for an organization across all known capabilities.
   * Evaluates all cataloged capabilities concurrently and returns a dictionary indexed by capabilityCode.
   */
  async resolveAllEffectiveStates(
    organizationId: string,
  ): Promise<Record<string, EffectiveServiceStateResult>> {
    const codes = Array.from(KNOWN_CAPABILITY_CODES);
    const resolved = await Promise.all(
      codes.map((code) => this.resolveEffectiveState(organizationId, code)),
    );

    const map: Record<string, EffectiveServiceStateResult> = {};
    for (let i = 0; i < codes.length; i++) {
      map[codes[i]] = resolved[i];
    }
    return map;
  }
}
