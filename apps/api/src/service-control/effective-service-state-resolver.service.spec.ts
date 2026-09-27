import { Test, TestingModule } from '@nestjs/testing';
import { EffectiveServiceStateResolver } from './effective-service-state-resolver.service';
import { PrismaService } from '../prisma/prisma.service';
import { LicenseVerificationService } from '../license-verification/license-verification.service';

describe('EffectiveServiceStateResolver (Precedence Test Matrix A-L)', () => {
  let resolver: EffectiveServiceStateResolver;
  let prisma: any;
  let licenseVerificationService: any;

  const mockPrisma = {
    systemLicenseState: {
      findFirst: jest.fn(),
    },
    organizationControlStateProjection: {
      findUnique: jest.fn(),
    },
    globalServiceStateProjection: {
      findUnique: jest.fn(),
    },
    organizationServiceOverrideProjection: {
      findUnique: jest.fn(),
    },
  };

  const mockLicenseVerificationService = {
    getEvaluatedStateForOrganization: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EffectiveServiceStateResolver,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: LicenseVerificationService, useValue: mockLicenseVerificationService },
      ],
    }).compile();

    resolver = module.get<EffectiveServiceStateResolver>(EffectiveServiceStateResolver);
    prisma = module.get(PrismaService);
    licenseVerificationService = module.get(LicenseVerificationService);
  });

  // A. License valid, Org ACTIVE, Global AVAILABLE, No override -> AVAILABLE
  it('A: License valid, Org ACTIVE, Global AVAILABLE, No override -> AVAILABLE', async () => {
    mockLicenseVerificationService.getEvaluatedStateForOrganization.mockResolvedValue({ state: 'VALID' });
    mockPrisma.organizationControlStateProjection.findUnique.mockResolvedValue({ organizationId: 'org-1', state: 'ACTIVE' });
    mockPrisma.globalServiceStateProjection.findUnique.mockResolvedValue({ capabilityCode: 'AI_DOC_INTELLIGENCE', state: 'AVAILABLE' });
    mockPrisma.organizationServiceOverrideProjection.findUnique.mockResolvedValue(null);

    const res = await resolver.resolveEffectiveState('org-1', 'AI_DOC_INTELLIGENCE');
    expect(res.isAvailable).toBe(true);
    expect(res.effectiveState).toBe('AVAILABLE');
  });

  // B. License valid, Org ACTIVE, Global AVAILABLE, Org override DISABLED -> DISABLED
  it('B: License valid, Org ACTIVE, Global AVAILABLE, Org override DISABLED -> DISABLED', async () => {
    mockLicenseVerificationService.getEvaluatedStateForOrganization.mockResolvedValue({ state: 'VALID' });
    mockPrisma.organizationControlStateProjection.findUnique.mockResolvedValue({ organizationId: 'org-1', state: 'ACTIVE' });
    mockPrisma.globalServiceStateProjection.findUnique.mockResolvedValue({ capabilityCode: 'AI_DOC_INTELLIGENCE', state: 'AVAILABLE' });
    mockPrisma.organizationServiceOverrideProjection.findUnique.mockResolvedValue({
      organizationId: 'org-1',
      capabilityCode: 'AI_DOC_INTELLIGENCE',
      overrideState: 'DISABLED',
    });

    const res = await resolver.resolveEffectiveState('org-1', 'AI_DOC_INTELLIGENCE');
    expect(res.isAvailable).toBe(false);
    expect(res.effectiveState).toBe('DISABLED');
    expect(res.source).toBe('ORGANIZATION_SERVICE_OVERRIDE');
  });

  // C. License valid, Org ACTIVE, Global DISABLED, Org override AVAILABLE -> DISABLED
  it('C: License valid, Org ACTIVE, Global DISABLED, Org override AVAILABLE -> DISABLED', async () => {
    mockLicenseVerificationService.getEvaluatedStateForOrganization.mockResolvedValue({ state: 'VALID' });
    mockPrisma.organizationControlStateProjection.findUnique.mockResolvedValue({ organizationId: 'org-1', state: 'ACTIVE' });
    mockPrisma.globalServiceStateProjection.findUnique.mockResolvedValue({ capabilityCode: 'AI_DOC_INTELLIGENCE', state: 'DISABLED' });
    mockPrisma.organizationServiceOverrideProjection.findUnique.mockResolvedValue({
      organizationId: 'org-1',
      capabilityCode: 'AI_DOC_INTELLIGENCE',
      overrideState: 'AVAILABLE',
    });

    const res = await resolver.resolveEffectiveState('org-1', 'AI_DOC_INTELLIGENCE');
    expect(res.isAvailable).toBe(false);
    expect(res.effectiveState).toBe('DISABLED');
    expect(res.source).toBe('GLOBAL_SERVICE_STATE');
  });

  // D. License commercially invalid, Org ACTIVE, Global AVAILABLE, Org override AVAILABLE -> COMMERCIAL_DISABLED
  it('D: License commercially invalid, Org ACTIVE, Global AVAILABLE, Org override AVAILABLE -> COMMERCIAL_DISABLED', async () => {
    mockLicenseVerificationService.getEvaluatedStateForOrganization.mockResolvedValue({ state: 'UNLICENSED', reason: 'No license artifact' });
    mockPrisma.organizationControlStateProjection.findUnique.mockResolvedValue({ organizationId: 'org-1', state: 'ACTIVE' });

    const res = await resolver.resolveEffectiveState('org-1', 'AI_DOC_INTELLIGENCE');
    expect(res.isAvailable).toBe(false);
    expect(res.effectiveState).toBe('COMMERCIAL_DISABLED');
    expect(res.source).toBe('COMMERCIAL_LICENSE');
  });

  // E. License commercially invalid, Org ACTIVE, Global COMMERCIAL_DISABLED, Org override AVAILABLE -> COMMERCIAL_DISABLED
  it('E: License commercially invalid, Org ACTIVE, Global COMMERCIAL_DISABLED, Org override AVAILABLE -> COMMERCIAL_DISABLED', async () => {
    mockLicenseVerificationService.getEvaluatedStateForOrganization.mockResolvedValue({ state: 'UNLICENSED' });

    const res = await resolver.resolveEffectiveState('org-1', 'AI_DOC_INTELLIGENCE');
    expect(res.isAvailable).toBe(false);
    expect(res.effectiveState).toBe('COMMERCIAL_DISABLED');
    expect(res.source).toBe('COMMERCIAL_LICENSE');
  });

  // F. Global becomes AVAILABLE, Org override remains DISABLED -> DISABLED
  it('F: Global becomes AVAILABLE, Org override remains DISABLED -> DISABLED', async () => {
    mockLicenseVerificationService.getEvaluatedStateForOrganization.mockResolvedValue({ state: 'VALID' });
    mockPrisma.organizationControlStateProjection.findUnique.mockResolvedValue({ organizationId: 'org-1', state: 'ACTIVE' });
    mockPrisma.globalServiceStateProjection.findUnique.mockResolvedValue({ capabilityCode: 'VENDOR_RISK', state: 'AVAILABLE' });
    mockPrisma.organizationServiceOverrideProjection.findUnique.mockResolvedValue({
      organizationId: 'org-1',
      capabilityCode: 'VENDOR_RISK',
      overrideState: 'DISABLED',
    });

    const res = await resolver.resolveEffectiveState('org-1', 'VENDOR_RISK');
    expect(res.isAvailable).toBe(false);
    expect(res.effectiveState).toBe('DISABLED');
    expect(res.source).toBe('ORGANIZATION_SERVICE_OVERRIDE');
  });

  // G. Global becomes COMMERCIAL_DISABLED, Org override DISABLED -> COMMERCIAL_DISABLED
  it('G: Global becomes COMMERCIAL_DISABLED, Org override DISABLED -> COMMERCIAL_DISABLED', async () => {
    mockLicenseVerificationService.getEvaluatedStateForOrganization.mockResolvedValue({ state: 'VALID' });
    mockPrisma.organizationControlStateProjection.findUnique.mockResolvedValue({ organizationId: 'org-1', state: 'ACTIVE' });
    mockPrisma.globalServiceStateProjection.findUnique.mockResolvedValue({ capabilityCode: 'VENDOR_RISK', state: 'COMMERCIAL_DISABLED' });
    mockPrisma.organizationServiceOverrideProjection.findUnique.mockResolvedValue({
      organizationId: 'org-1',
      capabilityCode: 'VENDOR_RISK',
      overrideState: 'DISABLED',
    });

    const res = await resolver.resolveEffectiveState('org-1', 'VENDOR_RISK');
    expect(res.isAvailable).toBe(false);
    expect(res.effectiveState).toBe('COMMERCIAL_DISABLED');
    expect(res.source).toBe('GLOBAL_SERVICE_STATE');
  });

  // H. Organization becomes SUSPENDED, Service otherwise AVAILABLE -> CP-2 suspension semantics
  it('H: Organization becomes SUSPENDED -> Org Control State is ACTIVE in resolver, Guard handles read/write', async () => {
    mockLicenseVerificationService.getEvaluatedStateForOrganization.mockResolvedValue({ state: 'VALID' });
    mockPrisma.organizationControlStateProjection.findUnique.mockResolvedValue({ organizationId: 'org-1', state: 'SUSPENDED' });
    mockPrisma.globalServiceStateProjection.findUnique.mockResolvedValue({ capabilityCode: 'AI_DOC_INTELLIGENCE', state: 'AVAILABLE' });
    mockPrisma.organizationServiceOverrideProjection.findUnique.mockResolvedValue(null);

    const res = await resolver.resolveEffectiveState('org-1', 'AI_DOC_INTELLIGENCE');
    expect(res.isAvailable).toBe(true); // SUSPENDED allows read operations per CP-2; guard handles write lockout
  });

  // I. Organization becomes DISABLED, Service otherwise AVAILABLE -> organization blocked
  it('I: Organization becomes DISABLED -> DISABLED', async () => {
    mockLicenseVerificationService.getEvaluatedStateForOrganization.mockResolvedValue({ state: 'VALID' });
    mockPrisma.organizationControlStateProjection.findUnique.mockResolvedValue({ organizationId: 'org-1', state: 'DISABLED' });

    const res = await resolver.resolveEffectiveState('org-1', 'AI_DOC_INTELLIGENCE');
    expect(res.isAvailable).toBe(false);
    expect(res.effectiveState).toBe('DISABLED');
    expect(res.source).toBe('ORGANIZATION_CONTROL_STATE');
  });

  // J. Organization becomes DECOMMISSIONED -> terminal/decommissioned behavior
  it('J: Organization becomes DECOMMISSIONED -> DISABLED', async () => {
    mockLicenseVerificationService.getEvaluatedStateForOrganization.mockResolvedValue({ state: 'VALID' });
    mockPrisma.organizationControlStateProjection.findUnique.mockResolvedValue({ organizationId: 'org-1', state: 'DECOMMISSIONED' });

    const res = await resolver.resolveEffectiveState('org-1', 'AI_DOC_INTELLIGENCE');
    expect(res.isAvailable).toBe(false);
    expect(res.effectiveState).toBe('DISABLED');
    expect(res.source).toBe('ORGANIZATION_CONTROL_STATE');
  });

  // K. Override cleared, Global AVAILABLE, License valid -> AVAILABLE
  it('K: Override cleared, Global AVAILABLE, License valid -> AVAILABLE', async () => {
    mockLicenseVerificationService.getEvaluatedStateForOrganization.mockResolvedValue({ state: 'VALID' });
    mockPrisma.organizationControlStateProjection.findUnique.mockResolvedValue({ organizationId: 'org-1', state: 'ACTIVE' });
    mockPrisma.globalServiceStateProjection.findUnique.mockResolvedValue({ capabilityCode: 'INCIDENT_MGMT', state: 'AVAILABLE' });
    mockPrisma.organizationServiceOverrideProjection.findUnique.mockResolvedValue(null);

    const res = await resolver.resolveEffectiveState('org-1', 'INCIDENT_MGMT');
    expect(res.isAvailable).toBe(true);
    expect(res.effectiveState).toBe('AVAILABLE');
  });

  // L. Override cleared, Global DISABLED -> DISABLED
  it('L: Override cleared, Global DISABLED -> DISABLED', async () => {
    mockLicenseVerificationService.getEvaluatedStateForOrganization.mockResolvedValue({ state: 'VALID' });
    mockPrisma.organizationControlStateProjection.findUnique.mockResolvedValue({ organizationId: 'org-1', state: 'ACTIVE' });
    mockPrisma.globalServiceStateProjection.findUnique.mockResolvedValue({ capabilityCode: 'INCIDENT_MGMT', state: 'DISABLED' });
    mockPrisma.organizationServiceOverrideProjection.findUnique.mockResolvedValue(null);

    const res = await resolver.resolveEffectiveState('org-1', 'INCIDENT_MGMT');
    expect(res.isAvailable).toBe(false);
    expect(res.effectiveState).toBe('DISABLED');
    expect(res.source).toBe('GLOBAL_SERVICE_STATE');
  });

  // Extra Fail-Closed Test: Unknown capability code
  it('Unknown capability code -> DISABLED (Fail-Closed)', async () => {
    const res = await resolver.resolveEffectiveState('org-1', 'UNKNOWN_CAPABILITY_FLAG');
    expect(res.isAvailable).toBe(false);
    expect(res.effectiveState).toBe('DISABLED');
  });
});
