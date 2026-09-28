import {
  evaluateLicenseStatus,
  LicenseStatus,
  LicenseProduct,
  SignedLicensePayload,
} from './index';

describe('evaluateLicenseStatus Framework-Neutral Utility', () => {
  const basePayload: SignedLicensePayload = {
    licenseId: 'lic-100',
    licenseFormatVersion: '1.0',
    product: LicenseProduct.OMNIGRC,
    status: LicenseStatus.ACTIVE,
    customerId: 'cust-100',
    commercialAgreementId: 'agr-100',
    deploymentId: 'dep-100',
    organizationId: 'org-100',
    startsAt: new Date(Date.now() - 86400000).toISOString(), // 1 day ago
    expiresAt: new Date(Date.now() + 86400000).toISOString(), // 1 day in future
    maxDeployments: 1,
    entitlements: [{ code: 'AI_MAPPING', name: 'AI Mapping', enabled: true }],
    issuedAt: new Date().toISOString(),
    keyId: 'arav-license-v1-2026',
  };

  it('should return VALID when payload is authentic, active, and within validity window', () => {
    const res = evaluateLicenseStatus(basePayload);
    expect(res.state).toBe('VALID');
    expect(res.expiresAt).toBe(basePayload.expiresAt);
  });

  it('should return EXPIRED when current time exceeds expiresAt', () => {
    const expiredPayload: SignedLicensePayload = {
      ...basePayload,
      startsAt: new Date(Date.now() - 172800000).toISOString(), // 2 days ago
      expiresAt: new Date(Date.now() - 86400000).toISOString(),  // 1 day ago
    };

    const res = evaluateLicenseStatus(expiredPayload);
    expect(res.state).toBe('EXPIRED');
    expect(res.reason).toContain('expired');
  });

  it('should return EXPIRED when payload status is explicitly EXPIRED', () => {
    const explicitExpiredPayload: SignedLicensePayload = {
      ...basePayload,
      status: LicenseStatus.EXPIRED,
    };

    const res = evaluateLicenseStatus(explicitExpiredPayload);
    expect(res.state).toBe('EXPIRED');
  });

  it('should return INVALID_OR_UNAVAILABLE when startsAt is in future beyond clock drift threshold', () => {
    const futurePayload: SignedLicensePayload = {
      ...basePayload,
      startsAt: new Date(Date.now() + 3600000).toISOString(), // 1 hour in future
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
    };

    const res = evaluateLicenseStatus(futurePayload);
    expect(res.state).toBe('INVALID_OR_UNAVAILABLE');
    expect(res.reason).toContain('startsAt is in the future');
  });

  it('should return INVALID_OR_UNAVAILABLE when payload is null or undefined', () => {
    expect(evaluateLicenseStatus(null).state).toBe('INVALID_OR_UNAVAILABLE');
    expect(evaluateLicenseStatus(undefined).state).toBe('INVALID_OR_UNAVAILABLE');
  });

  it('should return SUSPENDED when payload deploymentState is SUSPENDED', () => {
    const suspendedPayload: SignedLicensePayload = {
      ...basePayload,
      deploymentState: 'SUSPENDED',
    };

    const res = evaluateLicenseStatus(suspendedPayload);
    expect(res.state).toBe('SUSPENDED');
    expect(res.reason).toContain('suspended by Control Plane');
  });

  it('should return REVOKED when payload deploymentState is DECOMMISSIONED', () => {
    const decommissionedPayload: SignedLicensePayload = {
      ...basePayload,
      deploymentState: 'DECOMMISSIONED',
    };

    const res = evaluateLicenseStatus(decommissionedPayload);
    expect(res.state).toBe('REVOKED');
    expect(res.reason).toContain('decommissioned by Control Plane');
  });

  it('should return UNLICENSED when payload deploymentState is PENDING', () => {
    const pendingPayload: SignedLicensePayload = {
      ...basePayload,
      deploymentState: 'PENDING',
    };

    const res = evaluateLicenseStatus(pendingPayload);
    expect(res.state).toBe('UNLICENSED');
    expect(res.reason).toContain('PENDING activation');
  });

  it('should return INVALID_OR_UNAVAILABLE when payload deploymentState is unrecognized/malformed', () => {
    const malformedPayload: SignedLicensePayload = {
      ...basePayload,
      deploymentState: 'CORRUPTED_STATE' as any,
    };

    const res = evaluateLicenseStatus(malformedPayload);
    expect(res.state).toBe('INVALID_OR_UNAVAILABLE');
    expect(res.reason).toContain('Unrecognized deployment operational state');
  });

  it('should evaluate legacy payload without deploymentState based on license status', () => {
    const legacyPayload: SignedLicensePayload = {
      ...basePayload,
    };
    delete legacyPayload.deploymentState;

    const res = evaluateLicenseStatus(legacyPayload);
    expect(res.state).toBe('VALID');
  });
});
