import { Test, TestingModule } from '@nestjs/testing';
import { LicenseVerificationService } from './license-verification.service';
import { PrismaService } from '../prisma/prisma.service';
import { FrameworkEntitlementsService } from '../frameworks/framework-entitlements.service';
import { SignedLicenseArtifact, jcsCanonicalize } from '@omnigrc/shared';
import * as crypto from 'crypto';

// Ephemeral keypair generated exclusively for unit testing
const TEST_KEYPAIR = crypto.generateKeyPairSync('ed25519', {
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});

describe('LicenseVerificationService (Data Plane)', () => {
  let service: LicenseVerificationService;
  let prisma: PrismaService;

  beforeEach(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        LicenseVerificationService,
        {
          provide: PrismaService,
          useValue: {
            systemLicenseState: {
              upsert: jest.fn(),
              findUnique: jest.fn(),
            },
          },
        },
        {
          provide: FrameworkEntitlementsService,
          useValue: {
            reconcileEntitlementsFromLicense: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    service = moduleRef.get<LicenseVerificationService>(LicenseVerificationService);
    prisma = moduleRef.get<PrismaService>(PrismaService);

    // Register test public key in trusted registry for testing
    service['trustedPublicKeyRegistry'].set('test-key-id', TEST_KEYPAIR.publicKey);
  });

  function createValidArtifact(overrides?: Partial<SignedLicenseArtifact['payload']>): SignedLicenseArtifact {
    const payload = {
      licenseId: 'lic_123',
      licenseFormatVersion: '1.0',
      product: 'OMNIGRC' as any,
      status: 'ACTIVE' as any,
      customerId: 'cust_123',
      commercialAgreementId: 'ca_123',
      deploymentId: 'dep_123',
      organizationId: 'org_123',
      startsAt: '2026-01-01T00:00:00.000Z',
      expiresAt: '2027-01-01T00:00:00.000Z',
      maxDeployments: 5,
      entitlements: [
        { code: 'SOC2_FRAMEWORK', name: 'SOC 2 Framework', enabled: true, value: null },
      ],
      issuedAt: '2026-01-01T00:00:00.000Z',
      keyId: 'test-key-id',
      ...overrides,
    };

    const canonicalJson = jcsCanonicalize(payload);
    const signatureBuffer = crypto.sign(null, Buffer.from(canonicalJson, 'utf-8'), TEST_KEYPAIR.privateKey);

    return {
      formatVersion: '1.0',
      keyId: 'test-key-id',
      algorithm: 'Ed25519',
      payload,
      signature: signatureBuffer.toString('base64'),
    };
  }

  it('should verify a valid signed license artifact against pre-trusted public key', () => {
    const artifact = createValidArtifact();
    const result = service.verifyArtifact(artifact);

    expect(result.valid).toBe(true);
    expect(result.payload.licenseId).toBe('lic_123');
    expect(result.payload.deploymentId).toBe('dep_123');
  });

  it('should reject a tampered artifact payload with UnauthorizedException', () => {
    const artifact = createValidArtifact();
    // Tamper payload status
    artifact.payload.status = 'EXPIRED' as any;

    expect(() => service.verifyArtifact(artifact)).toThrow(/signature verification failed/i);
  });

  it('should reject an artifact with an unknown/untrusted keyId', () => {
    const artifact = createValidArtifact();
    artifact.keyId = 'untrusted-fake-key-id';

    expect(() => service.verifyArtifact(artifact)).toThrow(/Unknown or untrusted Key ID/i);
  });

  it('should reject an unsupported signing algorithm', () => {
    const artifact = createValidArtifact();
    artifact.algorithm = 'RSA-2048' as any;

    expect(() => service.verifyArtifact(artifact)).toThrow(/Unsupported signing algorithm/i);
  });

  it('should enforce deployment identity binding when DEPLOYMENT_ID environment variable is configured', () => {
    process.env.DEPLOYMENT_ID = 'dep_999_other';
    const artifact = createValidArtifact({ deploymentId: 'dep_123' });

    expect(() => service.verifyArtifact(artifact)).toThrow(/Deployment ID mismatch/i);

    delete process.env.DEPLOYMENT_ID;
  });

  it('should evaluate entitlement code presence and status correctly', () => {
    const artifact = createValidArtifact();
    expect(service.hasEntitlement(artifact, 'SOC2_FRAMEWORK')).toBe(true);
    expect(service.hasEntitlement(artifact, 'HIPAA_FRAMEWORK')).toBe(false);
  });
});
