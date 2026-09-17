import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import {
  jcsCanonicalize,
  SignedLicensePayload,
  SignedLicenseArtifact,
  LicenseStatus,
  LicenseProduct,
  DEV_LICENSE_PUBLIC_KEY,
} from '@omnigrc/shared';

export { DEV_LICENSE_PUBLIC_KEY };
export const DEFAULT_KEY_ID = 'arav-license-v1-2026';

// Phase 10 Security Note:
// CONTROL_PLANE_DEV_LICENSE_PRIVATE_KEY is an Ed25519 development-only key whose
// paired public key (DEV_LICENSE_PUBLIC_KEY) is exported from @omnigrc/shared.
// It is ONLY used by the Control Plane binary (never shipped to Data Plane or shared packages).
// In production, this key MUST be overridden by CONTROL_PLANE_LICENSE_SIGNING_PRIVATE_KEY.
// Failure to set the env var in production is flagged as a SECURITY CRITICAL error at startup.
export const CONTROL_PLANE_DEV_LICENSE_PRIVATE_KEY = `-----BEGIN PRIVATE KEY-----\nMC4CAQAwBQYDK2VwBCIEIOT7ZcthPtpVCfcgezPFd1++YceF8D/g2pvle7fhmQ5M\n-----END PRIVATE KEY-----\n`;

@Injectable()
export class LicenseSigningService {
  private readonly logger = new Logger(LicenseSigningService.name);
  private _warnedAboutDevKey = false;

  /**
   * Return the active private key string (PEM format).
   * Phase 10 Security: Emits SECURITY CRITICAL error in production/staging when
   * CONTROL_PLANE_LICENSE_SIGNING_PRIVATE_KEY is not configured, preventing
   * the dev fallback from silently becoming the production signing key.
   */
  private getPrivateKeyPem(): string {
    const key = process.env.CONTROL_PLANE_LICENSE_SIGNING_PRIVATE_KEY;
    if (key && key.trim().length > 0) {
      return key.replace(/\\n/g, '\n');
    }

    const isProduction =
      process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'staging';

    if (isProduction) {
      this.logger.error(
        'SECURITY CRITICAL: CONTROL_PLANE_LICENSE_SIGNING_PRIVATE_KEY is not set. ' +
          'Refusing to sign license artifacts in a production/staging environment without explicit signing key.',
      );
      throw new InternalServerErrorException(
        'CONTROL_PLANE_LICENSE_SIGNING_PRIVATE_KEY is not configured for production/staging signing.',
      );
    }

    if (!this._warnedAboutDevKey) {
      this._warnedAboutDevKey = true;
      this.logger.warn(
        'SECURITY WARNING: CONTROL_PLANE_LICENSE_SIGNING_PRIVATE_KEY is not set. ' +
          'Using development Ed25519 key fallback. ' +
          'DO NOT use this configuration in production.',
      );
    }

    return CONTROL_PLANE_DEV_LICENSE_PRIVATE_KEY;
  }

  /**
   * Return the active Key ID identifier.
   */
  public getKeyId(): string {
    return process.env.CONTROL_PLANE_LICENSE_KEY_ID || DEFAULT_KEY_ID;
  }

  /**
   * Construct canonical payload and sign it using Ed25519 to produce a SignedLicenseArtifact.
   */
  public signLicenseArtifact(input: {
    license: {
      id: string;
      product: string;
      status: string;
      customerId?: string | null;
      commercialAgreementId: string;
      startsAt: Date;
      expiresAt: Date;
      maxDeployments: number;
    };
    deployment: {
      id: string;
      organizationId: string;
      customerId?: string | null;
      lastActivatedAt?: Date | null;
      createdAt: Date;
    };
    entitlements: Array<{
      code: string;
      name: string;
      enabled: boolean;
      value?: any;
    }>;
  }): SignedLicenseArtifact {
    const keyId = this.getKeyId();
    const privateKeyPem = this.getPrivateKeyPem();

    // Derive stable issuedAt timestamp from lastActivatedAt or createdAt
    const issuedAtDate = input.deployment.lastActivatedAt || input.deployment.createdAt;

    const payload: SignedLicensePayload = {
      licenseId: input.license.id,
      licenseFormatVersion: '1.0',
      product: input.license.product as LicenseProduct,
      status: input.license.status as LicenseStatus,
      customerId: input.deployment.customerId || input.license.customerId || '',
      commercialAgreementId: input.license.commercialAgreementId,
      deploymentId: input.deployment.id,
      organizationId: input.deployment.organizationId,
      startsAt: input.license.startsAt.toISOString(),
      expiresAt: input.license.expiresAt.toISOString(),
      maxDeployments: input.license.maxDeployments,
      entitlements: input.entitlements.map((e) => ({
        code: e.code,
        name: e.name,
        enabled: e.enabled,
        value: e.value ?? null,
      })),
      issuedAt: issuedAtDate.toISOString(),
      keyId,
    };

    try {
      // RFC 8785 JSON Canonicalization
      const canonicalJson = jcsCanonicalize(payload);
      const signatureBuffer = crypto.sign(null, Buffer.from(canonicalJson, 'utf-8'), privateKeyPem);
      const signature = signatureBuffer.toString('base64');

      return {
        formatVersion: '1.0',
        keyId,
        algorithm: 'Ed25519',
        payload,
        signature,
      };
    } catch (err: any) {
      throw new InternalServerErrorException(
        `Failed to sign license artifact: ${err.message || 'Cryptographic signing failure'}`,
      );
    }
  }
}
