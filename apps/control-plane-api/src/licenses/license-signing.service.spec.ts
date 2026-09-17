import {
  LicenseSigningService,
  DEV_LICENSE_PUBLIC_KEY,
} from './license-signing.service';
import * as crypto from 'crypto';
import { jcsCanonicalize } from '@omnigrc/shared';
import { InternalServerErrorException } from '@nestjs/common';

describe('LicenseSigningService', () => {
  let service: LicenseSigningService;
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.CONTROL_PLANE_LICENSE_SIGNING_PRIVATE_KEY;
    service = new LicenseSigningService();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should generate a valid Ed25519 signature over canonical payload', () => {
    const input = {
      license: {
        id: 'lic_123',
        product: 'OMNIGRC',
        status: 'ACTIVE',
        customerId: 'cust_123',
        commercialAgreementId: 'ca_123',
        startsAt: new Date('2026-01-01T00:00:00Z'),
        expiresAt: new Date('2027-01-01T00:00:00Z'),
        maxDeployments: 5,
      },
      deployment: {
        id: 'dep_123',
        organizationId: 'org_123',
        customerId: 'cust_123',
        createdAt: new Date('2026-01-01T00:00:00Z'),
      },
      entitlements: [
        { code: 'SOC2', name: 'SOC 2 Framework', enabled: true, value: null },
      ],
    };

    const artifact = service.signLicenseArtifact(input);

    expect(artifact.formatVersion).toEqual('1.0');
    expect(artifact.algorithm).toEqual('Ed25519');
    expect(artifact.payload.deploymentId).toEqual('dep_123');
    expect(artifact.payload.organizationId).toEqual('org_123');
    expect(artifact.signature).toBeDefined();

    // Verify signature using dev public key
    const canonicalJson = jcsCanonicalize(artifact.payload);
    const isValid = crypto.verify(
      null,
      Buffer.from(canonicalJson, 'utf-8'),
      DEV_LICENSE_PUBLIC_KEY,
      Buffer.from(artifact.signature, 'base64'),
    );

    expect(isValid).toBe(true);
  });

  it('should fail verification if signature or payload is tampered', () => {
    const input = {
      license: {
        id: 'lic_123',
        product: 'OMNIGRC',
        status: 'ACTIVE',
        customerId: 'cust_123',
        commercialAgreementId: 'ca_123',
        startsAt: new Date('2026-01-01T00:00:00Z'),
        expiresAt: new Date('2027-01-01T00:00:00Z'),
        maxDeployments: 5,
      },
      deployment: {
        id: 'dep_123',
        organizationId: 'org_123',
        customerId: 'cust_123',
        createdAt: new Date('2026-01-01T00:00:00Z'),
      },
      entitlements: [],
    };

    const artifact = service.signLicenseArtifact(input);

    // Tamper payload expiration date
    const tamperedPayload = { ...artifact.payload, expiresAt: '2099-01-01T00:00:00.000Z' };
    const tamperedCanonical = jcsCanonicalize(tamperedPayload);

    const isValid = crypto.verify(
      null,
      Buffer.from(tamperedCanonical, 'utf-8'),
      DEV_LICENSE_PUBLIC_KEY,
      Buffer.from(artifact.signature, 'base64'),
    );

    expect(isValid).toBe(false);
  });

  describe('Phase 10 Security: Fail-Closed Signing Key in Production/Staging', () => {
    const sampleInput = {
      license: {
        id: 'lic_123',
        product: 'OMNIGRC',
        status: 'ACTIVE',
        commercialAgreementId: 'ca_123',
        startsAt: new Date(),
        expiresAt: new Date(),
        maxDeployments: 1,
      },
      deployment: {
        id: 'dep_123',
        organizationId: 'org_123',
        createdAt: new Date(),
      },
      entitlements: [],
    };

    it('should FAIL-CLOSED (throw InternalServerErrorException) in production when signing key is missing', () => {
      process.env.NODE_ENV = 'production';
      delete process.env.CONTROL_PLANE_LICENSE_SIGNING_PRIVATE_KEY;

      expect(() => service.signLicenseArtifact(sampleInput)).toThrow(
        InternalServerErrorException,
      );
    });

    it('should FAIL-CLOSED (throw InternalServerErrorException) in staging when signing key is missing', () => {
      process.env.NODE_ENV = 'staging';
      delete process.env.CONTROL_PLANE_LICENSE_SIGNING_PRIVATE_KEY;

      expect(() => service.signLicenseArtifact(sampleInput)).toThrow(
        InternalServerErrorException,
      );
    });

    it('should succeed in production when a valid private key is explicitly configured', () => {
      process.env.NODE_ENV = 'production';
      // Generate a fresh Ed25519 keypair for test
      const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519');
      process.env.CONTROL_PLANE_LICENSE_SIGNING_PRIVATE_KEY = privateKey
        .export({ type: 'pkcs8', format: 'pem' })
        .toString();

      const artifact = service.signLicenseArtifact(sampleInput);
      expect(artifact.signature).toBeDefined();

      const canonicalJson = jcsCanonicalize(artifact.payload);
      const isValid = crypto.verify(
        null,
        Buffer.from(canonicalJson, 'utf-8'),
        publicKey,
        Buffer.from(artifact.signature, 'base64'),
      );
      expect(isValid).toBe(true);
    });
  });
});
