import { Injectable, InternalServerErrorException } from '@nestjs/common';
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

// Control-Plane-Only dev private key for local development/testing when env var is not set
export const CONTROL_PLANE_DEV_LICENSE_PRIVATE_KEY = `-----BEGIN PRIVATE KEY-----\nMC4CAQAwBQYDK2VwBCIEIOT7ZcthPtpVCfcgezPFd1++YceF8D/g2pvle7fhmQ5M\n-----END PRIVATE KEY-----\n`;

@Injectable()
export class LicenseSigningService {
  /**
   * Return the active private key string (PEM format).
   */
  private getPrivateKeyPem(): string {
    const key = process.env.CONTROL_PLANE_LICENSE_SIGNING_PRIVATE_KEY;
    if (key && key.trim().length > 0) {
      return key.replace(/\\n/g, '\n');
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
