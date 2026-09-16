import {
  LicenseSigningService,
  DEV_LICENSE_PUBLIC_KEY,
} from './license-signing.service';
import * as crypto from 'crypto';
import { jcsCanonicalize } from '@omnigrc/shared';

describe('LicenseSigningService', () => {
  let service: LicenseSigningService;

  beforeEach(() => {
    service = new LicenseSigningService();
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
});
