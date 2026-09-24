import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import {
  jcsCanonicalize,
  SignedLicenseArtifact,
  SignedLicensePayload,
  DEV_LICENSE_PUBLIC_KEY,
  evaluateLicenseStatus,
  EvaluatedLicenseState,
} from '@omnigrc/shared';
import { FrameworkEntitlementsService } from '../frameworks/framework-entitlements.service';

const DEFAULT_KEY_ID = 'arav-license-v1-2026';

@Injectable()
export class LicenseVerificationService {
  private readonly logger = new Logger(LicenseVerificationService.name);
  private readonly trustedPublicKeyRegistry: Map<string, string> = new Map();

  private cachedEvaluationState: {
    result: EvaluatedLicenseState;
    fetchedAt: number;
  } | null = null;
  private onLicenseRenewedCallbacks: Array<() => void> = [];

  public invalidateMemoizedState(): void {
    this.cachedEvaluationState = null;
  }

  public onLicenseRenewed(callback: () => void): void {
    this.onLicenseRenewedCallbacks.push(callback);
  }

  constructor(
    private readonly prisma: PrismaService,
    private readonly frameworkEntitlementsService: FrameworkEntitlementsService,
  ) {
    this.initializeTrustedKeyRegistry();
  }

  /**
   * Populate the Pre-Trusted Public Key Registry.
   * Public keys are strictly loaded from pre-trusted assets or explicit environment configuration.
   * Incoming artifacts can NEVER introduce new public keys into this registry.
   */
  private initializeTrustedKeyRegistry() {
    this.trustedPublicKeyRegistry.set(DEFAULT_KEY_ID, DEV_LICENSE_PUBLIC_KEY);

    const envPublicKey = process.env.LICENSE_VERIFICATION_PUBLIC_KEY;
    const envKeyId = process.env.LICENSE_VERIFICATION_KEY_ID || DEFAULT_KEY_ID;

    if (envPublicKey && envPublicKey.trim().length > 0) {
      const formattedKey = envPublicKey.replace(/\\n/g, '\n');
      this.trustedPublicKeyRegistry.set(envKeyId, formattedKey);
    }
  }

  public getTrustedPublicKey(keyId: string): string | undefined {
    return this.trustedPublicKeyRegistry.get(keyId);
  }

  /**
   * Verify a SignedLicenseArtifact using Ed25519 signature verification over RFC 8785 canonical payload.
   */
  public verifyArtifact(artifact: SignedLicenseArtifact): {
    valid: boolean;
    payload: SignedLicensePayload;
  } {
    if (!artifact || !artifact.payload || !artifact.signature) {
      throw new BadRequestException('Malformed license artifact');
    }

    if (artifact.algorithm !== 'Ed25519') {
      throw new BadRequestException(`Unsupported signing algorithm: ${artifact.algorithm}`);
    }

    const publicKeyPem = this.getTrustedPublicKey(artifact.keyId);
    if (!publicKeyPem) {
      throw new UnauthorizedException(
        `Unknown or untrusted Key ID "${artifact.keyId}". Public key is not in pre-trusted registry.`,
      );
    }

    try {
      const canonicalJson = jcsCanonicalize(artifact.payload);
      const isValidSignature = crypto.verify(
        null,
        Buffer.from(canonicalJson, 'utf-8'),
        publicKeyPem,
        Buffer.from(artifact.signature, 'base64'),
      );

      if (!isValidSignature) {
        throw new UnauthorizedException('License artifact signature verification failed. Payload may be tampered.');
      }
    } catch (err: any) {
      if (err instanceof UnauthorizedException) throw err;
      throw new UnauthorizedException(`Signature verification error: ${err.message || 'Invalid signature'}`);
    }

    return { valid: true, payload: artifact.payload };
  }

  /**
   * Strict Identity Binding Verification:
   * Enforces signedArtifact.deploymentId === Deployment.controlPlaneDeploymentId
   * AND signedArtifact.organizationId === Deployment.organizationId.
   * Rejects any mismatch. A valid artifact for Org A must NEVER unlock Org B.
   */
  public verifyArtifactForOrganization(
    artifact: SignedLicenseArtifact,
    organizationId: string,
    controlPlaneDeploymentId?: string,
  ): { valid: boolean; payload: SignedLicensePayload } {
    const verified = this.verifyArtifact(artifact);

    if (verified.payload.organizationId !== organizationId) {
      throw new BadRequestException(
        `License identity mismatch: artifact organizationId "${verified.payload.organizationId}" does not match target organization "${organizationId}"`,
      );
    }

    if (controlPlaneDeploymentId && verified.payload.deploymentId !== controlPlaneDeploymentId) {
      throw new BadRequestException(
        `Deployment identity mismatch: artifact deploymentId "${verified.payload.deploymentId}" does not match deployment "${controlPlaneDeploymentId}"`,
      );
    }

    return verified;
  }

  /**
   * Store verified artifact snapshot into Data Plane system license state cache for a specific organization.
   */
  public async saveVerifiedStateForOrganization(
    organizationId: string,
    controlPlaneDeploymentId: string,
    artifact: SignedLicenseArtifact,
  ): Promise<void> {
    const { payload } = this.verifyArtifactForOrganization(artifact, organizationId, controlPlaneDeploymentId);

    const existingRecord = await this.prisma.systemLicenseState.findUnique({
      where: { organizationId },
    });

    if (existingRecord) {
      await this.prisma.systemLicenseState.update({
        where: { organizationId },
        data: {
          deploymentId: payload.deploymentId,
          signedArtifactJson: artifact as any,
          verifiedAt: new Date(),
        },
      });
    } else {
      await this.prisma.systemLicenseState.create({
        data: {
          organizationId,
          deploymentId: payload.deploymentId,
          signedArtifactJson: artifact as any,
          verifiedAt: new Date(),
        },
      });
    }

    if (Array.isArray(payload.entitlements)) {
      await this.frameworkEntitlementsService.reconcileSignedLicenseEntitlements(
        organizationId,
        payload.entitlements,
        payload.expiresAt,
      );
    }
  }

  /**
   * Backward-compatible global saveVerifiedState (for legacy deployment tests)
   */
  public async saveVerifiedState(artifact: SignedLicenseArtifact): Promise<void> {
    const { payload } = this.verifyArtifact(artifact);
    if (payload.organizationId) {
      await this.saveVerifiedStateForOrganization(payload.organizationId, payload.deploymentId, artifact);
    }
  }

  /**
   * Evaluate runtime license state per Organization.
   */
  public async getEvaluatedStateForOrganization(
    organizationId: string,
    now: Date = new Date(),
  ): Promise<EvaluatedLicenseState> {
    if (!organizationId) {
      return { state: 'UNLICENSED', reason: 'Organization ID missing' };
    }

    try {
      const record = await this.prisma.systemLicenseState.findFirst({
        where: {
          OR: [
            { organizationId },
            { id: 'current' },
          ],
        },
      });

      if (!record || !record.signedArtifactJson) {
        if (
          (process.env.NODE_ENV === 'test' || process.env.NODE_ENV === 'development' || !process.env.NODE_ENV) &&
          process.env.ENFORCE_LICENSE_IN_TEST !== 'true' &&
          process.env.ENFORCE_LICENSE_IN_DEV !== 'true'
        ) {
          const deployment = await this.prisma.deployment.findFirst({ where: { organizationId } });
          if (deployment) {
            return {
              state: 'UNLICENSED',
              reason: `Provisioned deployment for organization "${organizationId}" missing verified SystemLicenseState record`,
            };
          }
          return {
            state: 'VALID',
            reason: 'Development/Test environment unactivated fallback',
          };
        }

        return {
          state: 'UNLICENSED',
          reason: `No verified SystemLicenseState record found for organization "${organizationId}"`,
        };
      }

      const artifact = record.signedArtifactJson as unknown as SignedLicenseArtifact;

      // Strict Org Identity Validation on read
      if (artifact.payload.organizationId !== organizationId) {
        if (
          (process.env.NODE_ENV === 'test' || process.env.NODE_ENV === 'development' || !process.env.NODE_ENV) &&
          process.env.ENFORCE_LICENSE_IN_TEST !== 'true' &&
          process.env.ENFORCE_LICENSE_IN_DEV !== 'true'
        ) {
          const deployment = await this.prisma.deployment.findFirst({ where: { organizationId } });
          if (deployment) {
            return {
              state: 'UNLICENSED',
              reason: `Cross-tenant license mismatch: stored license organizationId "${artifact.payload.organizationId}" does not match target organization "${organizationId}"`,
            };
          }
          return {
            state: 'VALID',
            reason: 'Development/Test environment unactivated fallback',
          };
        }
        return {
          state: 'UNLICENSED',
          reason: `Cross-tenant license mismatch: stored license organizationId "${artifact.payload.organizationId}" does not match target organization "${organizationId}"`,
        };
      }

      return evaluateLicenseStatus(artifact.payload, now);
    } catch (err: any) {
      this.logger.error(`License state evaluation error for org "${organizationId}": ${err.message}`);
      return {
        state: 'UNLICENSED',
        reason: err.message || 'Verification system error',
      };
    }
  }

  /**
   * Global evaluated state helper fallback
   */
  public async getEvaluatedState(now: Date = new Date()): Promise<EvaluatedLicenseState> {
    const expectedOrgId = process.env.ORGANIZATION_ID;
    if (expectedOrgId) {
      return this.getEvaluatedStateForOrganization(expectedOrgId, now);
    }

    if (
      (process.env.NODE_ENV === 'test' || process.env.NODE_ENV === 'development' || !process.env.NODE_ENV) &&
      process.env.ENFORCE_LICENSE_IN_TEST !== 'true'
    ) {
      return { state: 'VALID', reason: 'Development/Test environment unactivated fallback' };
    }

    return { state: 'UNLICENSED', reason: 'No global organization context set' };
  }

  public hasEntitlement(artifact: SignedLicenseArtifact, entitlementCode: string): boolean {
    if (!artifact || !artifact.payload || !artifact.payload.entitlements) {
      return false;
    }
    const entitlement = artifact.payload.entitlements.find((e) => e.code === entitlementCode);
    return entitlement ? entitlement.enabled === true : false;
  }
}
