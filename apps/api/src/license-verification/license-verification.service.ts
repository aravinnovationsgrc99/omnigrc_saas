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

const DEFAULT_KEY_ID = 'arav-license-v1-2026';

@Injectable()
export class LicenseVerificationService {
  private readonly logger = new Logger(LicenseVerificationService.name);
  private readonly trustedPublicKeyRegistry: Map<string, string> = new Map();
  private cachedEvaluationState: {
    result: EvaluatedLicenseState;
    fetchedAt: number;
  } | null = null;

  constructor(private readonly prisma: PrismaService) {
    this.initializeTrustedKeyRegistry();
  }

  public invalidateMemoizedState(): void {
    this.cachedEvaluationState = null;
  }

  /**
   * Populate the Pre-Trusted Public Key Registry.
   * Public keys are strictly loaded from pre-trusted assets or explicit environment configuration.
   * Incoming artifacts can NEVER introduce new public keys into this registry.
   */
  private initializeTrustedKeyRegistry() {
    // 1. Register Default Dev Public Key for local dev & testing
    this.trustedPublicKeyRegistry.set(DEFAULT_KEY_ID, DEV_LICENSE_PUBLIC_KEY);

    // 2. Register Environment Public Key if provided
    const envPublicKey = process.env.LICENSE_VERIFICATION_PUBLIC_KEY;
    const envKeyId = process.env.LICENSE_VERIFICATION_KEY_ID || DEFAULT_KEY_ID;

    if (envPublicKey && envPublicKey.trim().length > 0) {
      const formattedKey = envPublicKey.replace(/\\n/g, '\n');
      this.trustedPublicKeyRegistry.set(envKeyId, formattedKey);
    }
  }

  /**
   * Fetch a trusted public key by keyId from the Pre-Trusted Registry.
   */
  public getTrustedPublicKey(keyId: string): string | undefined {
    return this.trustedPublicKeyRegistry.get(keyId);
  }

  /**
   * Verify a SignedLicenseArtifact using Ed25519 signature verification over RFC 8785 canonical payload,
   * enforcing identity binding (deploymentId and organizationId).
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
      // RFC 8785 Canonical Serialization
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

    // Deployment Identity Binding Verification
    const expectedDeploymentId = process.env.DEPLOYMENT_ID;
    if (expectedDeploymentId && artifact.payload.deploymentId !== expectedDeploymentId) {
      throw new BadRequestException(
        `Deployment ID mismatch: artifact issued for "${artifact.payload.deploymentId}", local instance is "${expectedDeploymentId}"`,
      );
    }

    const expectedOrgId = process.env.ORGANIZATION_ID;
    if (expectedOrgId && artifact.payload.organizationId !== expectedOrgId) {
      throw new BadRequestException(
        `Organization ID mismatch: artifact issued for "${artifact.payload.organizationId}", local instance is "${expectedOrgId}"`,
      );
    }

    return { valid: true, payload: artifact.payload };
  }

  private onLicenseRenewedCallbacks: Array<() => void> = [];

  public onLicenseRenewed(callback: () => void): void {
    this.onLicenseRenewedCallbacks.push(callback);
  }

  /**
   * Store verified artifact snapshot into Data Plane system license state cache.
   */
  public async saveVerifiedState(artifact: SignedLicenseArtifact): Promise<void> {
    const { payload } = this.verifyArtifact(artifact);

    await this.prisma.systemLicenseState.upsert({
      where: { id: 'current' },
      create: {
        id: 'current',
        deploymentId: payload.deploymentId,
        organizationId: payload.organizationId,
        signedArtifactJson: artifact as any,
        verifiedAt: new Date(),
      },
      update: {
        deploymentId: payload.deploymentId,
        organizationId: payload.organizationId,
        signedArtifactJson: artifact as any,
        verifiedAt: new Date(),
      },
    });

    this.invalidateMemoizedState();

    const evaluated = await this.getEvaluatedState();
    if (evaluated.state === 'VALID') {
      for (const cb of this.onLicenseRenewedCallbacks) {
        try {
          cb();
        } catch (err) {
          this.logger.warn(`Error executing onLicenseRenewed callback: ${err}`);
        }
      }
    }
  }

  /**
   * Retrieve cached verified license state from local system persistence.
   */
  public async getCachedState(): Promise<SignedLicenseArtifact | null> {
    const record = await this.prisma.systemLicenseState.findUnique({
      where: { id: 'current' },
    });

    if (!record || !record.signedArtifactJson) {
      return null;
    }

    const artifact = record.signedArtifactJson as unknown as SignedLicenseArtifact;
    try {
      this.verifyArtifact(artifact);
      return artifact;
    } catch (err) {
      this.logger.warn('Cached license state failed verification, ignoring invalid cached record.');
      return null;
    }
  }

  /**
   * Evaluate runtime license state (VALID, EXPIRED, INVALID_OR_UNAVAILABLE).
   */
  public async getEvaluatedState(now: Date = new Date()): Promise<EvaluatedLicenseState> {
    const memoTTL = 5000; // 5 seconds
    if (
      this.cachedEvaluationState &&
      now.getTime() - this.cachedEvaluationState.fetchedAt < memoTTL
    ) {
      if (this.cachedEvaluationState.result.payload) {
        return evaluateLicenseStatus(this.cachedEvaluationState.result.payload, now);
      }
      return this.cachedEvaluationState.result;
    }

    try {
      const artifact = await this.getCachedState();
      if (!artifact || !artifact.payload) {
        // In test or local development environments where no license has been activated,
        // default unactivated state to VALID for seamless local DX and regression testing,
        // unless ENFORCE_LICENSE_IN_TEST is explicitly enabled.
        if (
          (process.env.NODE_ENV === 'test' || process.env.NODE_ENV === 'development' || !process.env.NODE_ENV) &&
          process.env.ENFORCE_LICENSE_IN_TEST !== 'true'
        ) {
          const devState: EvaluatedLicenseState = {
            state: 'VALID',
            reason: 'Development/Test environment unactivated fallback',
          };
          return devState;
        }

        const state: EvaluatedLicenseState = {
          state: 'INVALID_OR_UNAVAILABLE',
          reason: 'No authentic SystemLicenseState snapshot found in Data Plane persistence',
        };
        this.cachedEvaluationState = { result: state, fetchedAt: now.getTime() };
        return state;
      }



      const state = evaluateLicenseStatus(artifact.payload, now);
      if (state.state === 'EXPIRED') {
        this.logger.warn(
          `SystemLicenseState evaluation: License is EXPIRED (expired at ${state.expiresAt})`,
        );
      }
      this.cachedEvaluationState = { result: state, fetchedAt: now.getTime() };
      return state;
    } catch (err: any) {
      this.logger.error(`License state evaluation error: ${err.message || 'Unknown error'}`);
      const state: EvaluatedLicenseState = {
        state: 'INVALID_OR_UNAVAILABLE',
        reason: err.message || 'Verification system error',
      };
      this.cachedEvaluationState = { result: state, fetchedAt: now.getTime() };
      return state;
    }
  }

  /**
   * Query helper to check if a specific entitlement code is enabled in a verified artifact.
   */
  public hasEntitlement(artifact: SignedLicenseArtifact, entitlementCode: string): boolean {
    if (!artifact || !artifact.payload || !artifact.payload.entitlements) {
      return false;
    }

    const entitlement = artifact.payload.entitlements.find(
      (e) => e.code === entitlementCode,
    );

    return entitlement ? entitlement.enabled === true : false;
  }
}

