import { Test, TestingModule } from '@nestjs/testing';
import { FrameworkEntitlementsService } from './framework-entitlements.service';
import { LicenseVerificationService } from '../license-verification/license-verification.service';
import { PrismaService } from '../prisma/prisma.service';
import { EntitlementStatus, jcsCanonicalize, SignedLicenseArtifact } from '@omnigrc/shared';
import * as crypto from 'crypto';

// Generated Ed25519 keypair for testing
const E2E_KEYPAIR = crypto.generateKeyPairSync('ed25519', {
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});

describe('E2E End-to-End Commercial Entitlement Verification Flow', () => {
  let entitlementsService: FrameworkEntitlementsService;
  let licenseVerificationService: LicenseVerificationService;
  let prisma: PrismaService;

  const TEST_ORG_ID = 'org-e2e-test-entitlements';
  const KEY_ID = 'e2e-test-key-id';

  beforeAll(async () => {
    jest.setTimeout(30000);
    // Set environment flag so license enforcement is STRICTLY enabled during this E2E test
    process.env.ENFORCE_LICENSE_IN_TEST = 'true';
  });

  afterAll(async () => {
    delete process.env.ENFORCE_LICENSE_IN_TEST;
    if (prisma) {
      await prisma.organizationFrameworkEntitlement.deleteMany({ where: { organizationId: TEST_ORG_ID } });
      await prisma.organization.deleteMany({ where: { id: TEST_ORG_ID } });
    }
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FrameworkEntitlementsService,
        LicenseVerificationService,
        PrismaService,
      ],
    }).compile();

    entitlementsService = module.get<FrameworkEntitlementsService>(FrameworkEntitlementsService);
    licenseVerificationService = module.get<LicenseVerificationService>(LicenseVerificationService);
    prisma = module.get<PrismaService>(PrismaService);

    // Register test public key in verification service
    licenseVerificationService['trustedPublicKeyRegistry'].set(KEY_ID, E2E_KEYPAIR.publicKey);

    // Ensure test organization exists in DB to satisfy FK constraint
    await prisma.organization.upsert({
      where: { id: TEST_ORG_ID },
      update: { name: 'E2E Test Org' },
      create: { id: TEST_ORG_ID, name: 'E2E Test Org' },
    });

    // Clean up test organization entitlements before each test
    await prisma.organizationFrameworkEntitlement.deleteMany({
      where: { organizationId: TEST_ORG_ID },
    });
  });

  function createSignedLicenseArtifact(opts: {
    status?: string;
    expiresAt?: string;
    entitlements: Array<{ code: string; enabled: boolean }>;
  }): SignedLicenseArtifact {
    const payload = {
      licenseId: 'lic_e2e_123',
      licenseFormatVersion: '1.0',
      product: 'OMNIGRC' as any,
      status: (opts.status as any) || 'ACTIVE',
      customerId: 'cust_e2e',
      commercialAgreementId: 'ca_e2e',
      deploymentId: 'dep_e2e',
      organizationId: TEST_ORG_ID,
      startsAt: '2026-01-01T00:00:00.000Z',
      expiresAt: opts.expiresAt || '2027-01-01T00:00:00.000Z',
      maxDeployments: 1,
      entitlements: opts.entitlements.map((e) => ({
        code: e.code,
        name: e.code,
        enabled: e.enabled,
        value: null,
      })),
      issuedAt: '2026-01-01T00:00:00.000Z',
      keyId: KEY_ID,
    };

    const canonicalJson = jcsCanonicalize(payload);
    const signatureBuffer = crypto.sign(null, Buffer.from(canonicalJson, 'utf-8'), E2E_KEYPAIR.privateKey);

    return {
      formatVersion: '1.0',
      keyId: KEY_ID,
      algorithm: 'Ed25519',
      payload,
      signature: signatureBuffer.toString('base64'),
    };
  }

  it('A. Entitled Organization: Control Plane signed artifact provisions ACTIVE entitlement in Data Plane', async () => {
    // 1. Control Plane signs license artifact granting ISO 27001
    const artifact = createSignedLicenseArtifact({
      entitlements: [
        { code: 'framework:ISO27001', enabled: true },
        { code: 'framework:SOC2', enabled: false },
      ],
    });

    // 2. Data Plane verifies Ed25519 signature
    const verification = licenseVerificationService.verifyArtifact(artifact);
    expect(verification.valid).toBe(true);

    // 3. Reconcile entitlements into Data Plane database
    await entitlementsService.reconcileSignedLicenseEntitlements(
      artifact.payload.organizationId,
      artifact.payload.entitlements,
      artifact.payload.expiresAt,
    );

    // 4. Verify ISO 27001 is ACTIVE and SOC 2 is REVOKED
    const isIsoEntitled = await entitlementsService.isEntitled(TEST_ORG_ID, 'ISO27001');
    const isSoc2Entitled = await entitlementsService.isEntitled(TEST_ORG_ID, 'SOC2');

    expect(isIsoEntitled).toBe(true);
    expect(isSoc2Entitled).toBe(false);
  }, 30000);

  it('B. Unentitled Organization: Accessing ungranted framework throws 403 Forbidden', async () => {
    // Provision license granting only ISO 27001
    const artifact = createSignedLicenseArtifact({
      entitlements: [
        { code: 'framework:ISO27001', enabled: true },
      ],
    });
    await entitlementsService.reconcileSignedLicenseEntitlements(
      TEST_ORG_ID,
      artifact.payload.entitlements,
    );

    // Direct assertion for HIPAA must throw 403 Forbidden with FRAMEWORK_NOT_ENTITLED code
    await expect(entitlementsService.assertEntitled(TEST_ORG_ID, 'HIPAA')).rejects.toThrow(
      expect.objectContaining({
        status: 403,
        response: expect.objectContaining({
          code: 'FRAMEWORK_NOT_ENTITLED',
          frameworkCode: 'HIPAA',
        }),
      }),
    );
  }, 30000);

  it('C. Expired Entitlement: ACTIVE entitlement past expiresAt date returns false and throws 403', async () => {
    // Provision license with past expiration date (2025-01-01)
    const artifact = createSignedLicenseArtifact({
      expiresAt: '2025-01-01T00:00:00.000Z',
      entitlements: [{ code: 'framework:ISO27001', enabled: true }],
    });
    await entitlementsService.reconcileSignedLicenseEntitlements(
      TEST_ORG_ID,
      artifact.payload.entitlements,
      artifact.payload.expiresAt,
    );

    // Evaluate entitlement at current time (2026)
    const isEntitled = await entitlementsService.isEntitled(TEST_ORG_ID, 'ISO27001');
    expect(isEntitled).toBe(false);

    await expect(entitlementsService.assertEntitled(TEST_ORG_ID, 'ISO27001')).rejects.toThrow(
      expect.objectContaining({ status: 403 }),
    );
  }, 30000);

  it('D. Revoked Entitlement: Explicitly REVOKED framework entitlement returns false', async () => {
    // Provision license with revoked entitlement
    const artifact = createSignedLicenseArtifact({
      entitlements: [{ code: 'framework:ISO27001', enabled: false }],
    });
    await entitlementsService.reconcileSignedLicenseEntitlements(
      TEST_ORG_ID,
      artifact.payload.entitlements,
    );

    const isEntitled = await entitlementsService.isEntitled(TEST_ORG_ID, 'ISO27001');
    expect(isEntitled).toBe(false);
  }, 30000);

  it('E. Conflict Resolution & Version Override: Version-specific REVOKED overrides Framework-wide ACTIVE', async () => {
    const iso = await prisma.framework.findUnique({ where: { code: 'ISO27001' } });
    const version = await prisma.frameworkVersion.findFirst({ where: { frameworkId: iso!.id } });

    // Create framework-wide ACTIVE record
    await prisma.organizationFrameworkEntitlement.create({
      data: {
        organizationId: TEST_ORG_ID,
        frameworkId: iso!.id,
        versionId: null,
        status: EntitlementStatus.ACTIVE,
      },
    });

    // Create version-specific REVOKED record overriding version
    await prisma.organizationFrameworkEntitlement.create({
      data: {
        organizationId: TEST_ORG_ID,
        frameworkId: iso!.id,
        versionId: version!.id,
        status: EntitlementStatus.REVOKED,
      },
    });

    // Framework-wide is entitled (for unspecified version)
    const isFwEntitled = await entitlementsService.isEntitled(TEST_ORG_ID, 'ISO27001');
    expect(isFwEntitled).toBe(true);

    // Version-specific is NOT entitled (version override wins!)
    const isVerEntitled = await entitlementsService.isEntitled(TEST_ORG_ID, 'ISO27001', version!.id);
    expect(isVerEntitled).toBe(false);
  }, 30000);

  it('F. Reactivation: Re-enabling valid commercial entitlement restores access to ACTIVE', async () => {
    // 1. Initial revoked license
    const revokedArtifact = createSignedLicenseArtifact({
      entitlements: [{ code: 'framework:ISO27001', enabled: false }],
    });
    await entitlementsService.reconcileSignedLicenseEntitlements(
      TEST_ORG_ID,
      revokedArtifact.payload.entitlements,
    );
    expect(await entitlementsService.isEntitled(TEST_ORG_ID, 'ISO27001')).toBe(false);

    // 2. Renewal artifact with enabled: true
    const activeArtifact = createSignedLicenseArtifact({
      entitlements: [{ code: 'framework:ISO27001', enabled: true }],
    });
    await entitlementsService.reconcileSignedLicenseEntitlements(
      TEST_ORG_ID,
      activeArtifact.payload.entitlements,
    );

    // Access restored
    expect(await entitlementsService.isEntitled(TEST_ORG_ID, 'ISO27001')).toBe(true);
  }, 30000);
});
