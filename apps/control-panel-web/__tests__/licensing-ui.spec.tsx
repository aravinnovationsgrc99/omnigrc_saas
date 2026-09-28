import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import LicensingPage from '../src/app/licensing/page';
import LicenseDetailPage from '../src/app/licensing/[licenseId]/page';
import { useAuth } from '../src/lib/auth-context';
import { controlPlaneApi, ControlPlaneApiError } from '../src/lib/control-plane-api';
import { LicenseDto, LicenseStatusType } from '../src/types/control-plane';

// Mock Auth Context
jest.mock('../src/lib/auth-context', () => ({
  useAuth: jest.fn(),
}));

// Mock Control Plane API
jest.mock('../src/lib/control-plane-api', () => {
  const original = jest.requireActual('../src/lib/control-plane-api');
  return {
    ...original,
    controlPlaneApi: {
      listLicenses: jest.fn(),
      getLicense: jest.fn(),
      createLicense: jest.fn(),
      updateLicense: jest.fn(),
      suspendLicense: jest.fn(),
      reactivateLicense: jest.fn(),
      revokeLicense: jest.fn(),
      grantOrUpdateEntitlement: jest.fn(),
      suspendEntitlement: jest.fn(),
      reactivateEntitlement: jest.fn(),
      revokeEntitlement: jest.fn(),
      associateDeployment: jest.fn(),
      disassociateDeployment: jest.fn(),
      getSignedArtifact: jest.fn(),
      getLicenseHistory: jest.fn(),
      listCustomers: jest.fn(),
      listCommercialAgreements: jest.fn(),
      listDeployments: jest.fn(),
    },
  };
});

// Mock Next.js router and useParams
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  useParams: () => ({ licenseId: 'lic_active_01' }),
}));

describe('CP-6.3 Commercial Licensing & Entitlements Control UI', () => {
  const commercialOperator = {
    id: 'op_commercial',
    email: 'commercial@arav.io',
    fullName: 'Commercial Operator',
    role: 'COMMERCIAL_OPERATOR' as const,
    status: 'ACTIVE' as const,
    mfaEnabled: true,
  };

  const readOnlyOperator = {
    id: 'op_auditor',
    email: 'auditor@arav.io',
    fullName: 'Auditor',
    role: 'READ_ONLY_AUDITOR' as const,
    status: 'ACTIVE' as const,
    mfaEnabled: true,
  };

  const sampleLicenses: LicenseDto[] = [
    {
      id: 'lic_active_01',
      commercialAgreementId: 'agr_100',
      product: 'OMNIGRC',
      status: 'ACTIVE',
      issuedAt: '2026-09-01T00:00:00.000Z',
      startsAt: '2026-09-01T00:00:00.000Z',
      expiresAt: '2027-09-01T00:00:00.000Z',
      maxDeployments: 3,
      createdAt: '2026-09-01T00:00:00.000Z',
      updatedAt: '2026-09-28T10:00:00.000Z',
      deploymentsCount: 1,
      entitlements: [
        {
          id: 'ent_1',
          licenseId: 'lic_active_01',
          code: 'ISO27001',
          name: 'ISO/IEC 27001 Framework',
          enabled: true,
          createdAt: '2026-09-01T00:00:00.000Z',
          updatedAt: '2026-09-01T00:00:00.000Z',
        },
        {
          id: 'ent_2',
          licenseId: 'lic_active_01',
          code: 'ISO27001:2022',
          name: 'ISO 27001:2022 Version Override',
          enabled: true,
          createdAt: '2026-09-01T00:00:00.000Z',
          updatedAt: '2026-09-01T00:00:00.000Z',
        },
      ],
      deployments: [
        {
          id: 'dep_01',
          organizationId: 'org_acme',
          deploymentModel: 'MSSP_SHARED',
          environment: 'PRODUCTION',
          version: '1.0.0',
          activationState: 'ACTIVE',
          infrastructureOwner: 'ARAV',
          licenseId: 'lic_active_01',
          lastCheckInAt: '2026-09-28T10:00:00.000Z',
          createdAt: '2026-09-01T00:00:00.000Z',
          updatedAt: '2026-09-28T10:00:00.000Z',
        },
      ],
    },
    {
      id: 'lic_suspended_02',
      commercialAgreementId: 'agr_200',
      product: 'OMNIGRC',
      status: 'SUSPENDED',
      issuedAt: '2026-08-01T00:00:00.000Z',
      startsAt: '2026-08-01T00:00:00.000Z',
      expiresAt: '2027-08-01T00:00:00.000Z',
      maxDeployments: 1,
      createdAt: '2026-08-01T00:00:00.000Z',
      updatedAt: '2026-09-20T10:00:00.000Z',
      deploymentsCount: 0,
      entitlements: [],
      deployments: [],
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    (useAuth as jest.Mock).mockReturnValue({
      operator: commercialOperator,
      isAuthenticated: true,
      isLoading: false,
    });

    (controlPlaneApi.listLicenses as jest.Mock).mockResolvedValue(sampleLicenses);
    (controlPlaneApi.listCustomers as jest.Mock).mockResolvedValue([]);
    (controlPlaneApi.listCommercialAgreements as jest.Mock).mockResolvedValue([]);
    (controlPlaneApi.listDeployments as jest.Mock).mockResolvedValue([]);
    (controlPlaneApi.getLicense as jest.Mock).mockResolvedValue(sampleLicenses[0]);
    (controlPlaneApi.getLicenseHistory as jest.Mock).mockResolvedValue([]);
    (controlPlaneApi.getSignedArtifact as jest.Mock).mockResolvedValue({
      formatVersion: '1.0',
      keyId: 'ed25519-key-prod-01',
      algorithm: 'Ed25519',
      payload: { sequence: 10 },
      signature: '3045022100a89f...truncated_signature_hash',
    });
  });

  describe('License List Page (/licensing)', () => {
    it('1. should render license list with real CP data', async () => {
      render(<LicensingPage />);

      await waitFor(() => {
        expect(screen.getByText('lic_active_01')).toBeInTheDocument();
        expect(screen.getByText('lic_suspended_02')).toBeInTheDocument();
      });

      expect(screen.getByText('agr_100')).toBeInTheDocument();
      expect(screen.getByText('agr_200')).toBeInTheDocument();
    });

    it('2. should render clean empty state when zero licenses are returned', async () => {
      (controlPlaneApi.listLicenses as jest.Mock).mockResolvedValue([]);

      render(<LicensingPage />);

      await waitFor(() => {
        expect(screen.getByText('No Commercial Licenses Discovered')).toBeInTheDocument();
      });
    });

    it('3. should render error state when API call fails with 503', async () => {
      (controlPlaneApi.listLicenses as jest.Mock).mockRejectedValue(
        new ControlPlaneApiError(503, 'Control Plane API unavailable'),
      );

      render(<LicensingPage />);

      await waitFor(() => {
        expect(screen.getByText('Control Plane API unavailable')).toBeInTheDocument();
      });
    });

    it('4. should filter licenses using search box', async () => {
      render(<LicensingPage />);

      await waitFor(() => {
        expect(screen.getByText('lic_active_01')).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText('Search License ID, Agreement ID...');
      fireEvent.change(searchInput, { target: { value: 'suspended_02' } });

      expect(screen.getByText('lic_suspended_02')).toBeInTheDocument();
      expect(screen.queryByText('lic_active_01')).not.toBeInTheDocument();
    });

    it('5. should filter licenses by status tab controls', async () => {
      render(<LicensingPage />);

      await waitFor(() => {
        expect(screen.getByText('lic_active_01')).toBeInTheDocument();
      });

      const suspendedTab = screen.getByRole('button', { name: /SUSPENDED/i });
      fireEvent.click(suspendedTab);

      expect(screen.getByText('lic_suspended_02')).toBeInTheDocument();
      expect(screen.queryByText('lic_active_01')).not.toBeInTheDocument();
    });

    it('6. should hide Create License and mutation buttons for READ_ONLY_AUDITOR', async () => {
      (useAuth as jest.Mock).mockReturnValue({
        operator: readOnlyOperator,
        isAuthenticated: true,
        isLoading: false,
      });

      render(<LicensingPage />);

      await waitFor(() => {
        expect(screen.getByText('lic_active_01')).toBeInTheDocument();
      });

      expect(screen.queryByRole('button', { name: /Create License/i })).not.toBeInTheDocument();
      expect(screen.queryByTitle(/Suspend commercial license/i)).not.toBeInTheDocument();
      expect(screen.queryByTitle(/Revoke license permanently/i)).not.toBeInTheDocument();
    });

    it('7. should open Suspend confirmation dialog and execute suspension API request', async () => {
      (controlPlaneApi.suspendLicense as jest.Mock).mockResolvedValue({
        ...sampleLicenses[0],
        status: 'SUSPENDED',
      });

      render(<LicensingPage />);

      await waitFor(() => {
        expect(screen.getByText('lic_active_01')).toBeInTheDocument();
      });

      const suspendBtn = screen.getAllByTitle(/Suspend commercial license/i)[0];
      fireEvent.click(suspendBtn);

      expect(screen.getByText('Suspend Commercial License lic_active_01')).toBeInTheDocument();

      const confirmBtn = screen.getByRole('button', { name: 'Suspend License' });
      expect(confirmBtn).toBeDisabled();

      const reasonInput = screen.getByPlaceholderText(/Provide documented reason/i);
      fireEvent.change(reasonInput, { target: { value: 'Non-payment contract suspension' } });
      expect(confirmBtn).not.toBeDisabled();

      fireEvent.click(confirmBtn);

      await waitFor(() => {
        expect(controlPlaneApi.suspendLicense).toHaveBeenCalledWith(
          'lic_active_01',
          'Non-payment contract suspension',
        );
      });
    });
  });

  describe('License Detail Page (/licensing/[licenseId])', () => {
    it('8. should render license identity, framework entitlements, deployments, and signed artifact metadata', async () => {
      render(<LicenseDetailPage />);

      await waitFor(() => {
        expect(screen.getAllByText('lic_active_01').length).toBeGreaterThan(0);
      });

      expect(screen.getByText('1. Commercial Identity & Agreement')).toBeInTheDocument();
      expect(screen.getByText('2. Lifecycle & Validity Range')).toBeInTheDocument();
      expect(screen.getByText('3. Framework Entitlements Control')).toBeInTheDocument();
      expect(screen.getByText('4. Associated Deployments & Quota')).toBeInTheDocument();
      expect(screen.getByText('5. Signed License Artifact Metadata (Ed25519)')).toBeInTheDocument();
      expect(screen.getByText('6. Commercial Audit History Log')).toBeInTheDocument();

      // Check version-specific precedence display
      expect(screen.getByText('ISO27001')).toBeInTheDocument();
      expect(screen.getAllByText('ISO27001:2022').length).toBeGreaterThan(0);
      expect(screen.getByText('Version-Specific Override')).toBeInTheDocument();
      expect(screen.getByText('Framework-Wide Default')).toBeInTheDocument();

      // Check Ed25519 artifact metadata (without rendering raw private secrets)
      expect(screen.getByText('ed25519-key-prod-01')).toBeInTheDocument();
      expect(screen.getByText('Ed25519')).toBeInTheDocument();
    });

    it('9. should grant a new framework entitlement upon form submission', async () => {
      (controlPlaneApi.grantOrUpdateEntitlement as jest.Mock).mockResolvedValue({
        id: 'ent_3',
        licenseId: 'lic_active_01',
        code: 'SOC2',
        name: 'SOC 2 Trust Services Criteria',
        enabled: true,
      });

      render(<LicenseDetailPage />);

      await waitFor(() => {
        expect(screen.getAllByText('lic_active_01').length).toBeGreaterThan(0);
      });

      const grantBtn = screen.getByRole('button', { name: /Grant \/ Update Entitlement/i });
      fireEvent.click(grantBtn);

      const submitGrantBtn = screen.getByRole('button', { name: 'Grant Entitlement' });
      fireEvent.click(submitGrantBtn);

      await waitFor(() => {
        expect(controlPlaneApi.grantOrUpdateEntitlement).toHaveBeenCalledWith(
          'lic_active_01',
          expect.objectContaining({
            code: 'ISO27001',
            enabled: true,
          }),
        );
      });
    });

    it('10. should disassociate a deployment when disassociate button is clicked', async () => {
      window.confirm = jest.fn().mockReturnValue(true);
      (controlPlaneApi.disassociateDeployment as jest.Mock).mockResolvedValue({
        id: 'dep_01',
        licenseId: null,
      });

      render(<LicenseDetailPage />);

      await waitFor(() => {
        expect(screen.getAllByText('lic_active_01').length).toBeGreaterThan(0);
      });

      const disassociateBtn = screen.getByRole('button', { name: 'Disassociate' });
      fireEvent.click(disassociateBtn);

      await waitFor(() => {
        expect(controlPlaneApi.disassociateDeployment).toHaveBeenCalledWith(
          'lic_active_01',
          'dep_01',
        );
      });
    });
  });

  describe('CP-6.3.1 High-Risk UI Forensic Tests', () => {
    it('A. Wrong revoke confirmation phrase -> mutation must not be called', async () => {
      render(<LicenseDetailPage />);

      await waitFor(() => {
        expect(screen.getAllByText('lic_active_01').length).toBeGreaterThan(0);
      });

      const revokeBtn = screen.getAllByRole('button', { name: 'Revoke' })[0];
      fireEvent.click(revokeBtn);

      expect(screen.getByText('Revoke License lic_active_01')).toBeInTheDocument();

      const confirmInput = screen.getByPlaceholderText('Type "REVOKE lic_active_01"');
      fireEvent.change(confirmInput, { target: { value: 'WRONG_REVOKE_PHRASE' } });

      const reasonInput = screen.getByPlaceholderText(/Provide documented reason/i);
      fireEvent.change(reasonInput, { target: { value: 'Valid documented reason for revocation' } });

      const submitBtn = screen.getByRole('button', { name: 'Revoke License' });
      expect(submitBtn).toBeDisabled();

      expect(controlPlaneApi.revokeLicense).not.toHaveBeenCalled();
    });

    it('B. Correct revoke phrase -> mutation called once', async () => {
      (controlPlaneApi.revokeLicense as jest.Mock).mockResolvedValue({
        ...sampleLicenses[0],
        status: 'REVOKED',
      });

      render(<LicenseDetailPage />);

      await waitFor(() => {
        expect(screen.getAllByText('lic_active_01').length).toBeGreaterThan(0);
      });

      const revokeBtn = screen.getAllByRole('button', { name: 'Revoke' })[0];
      fireEvent.click(revokeBtn);

      const confirmInput = screen.getByPlaceholderText('Type "REVOKE lic_active_01"');
      fireEvent.change(confirmInput, { target: { value: 'REVOKE lic_active_01' } });

      const reasonInput = screen.getByPlaceholderText(/Provide documented reason/i);
      fireEvent.change(reasonInput, { target: { value: 'Permanent breach termination of contract' } });

      const submitBtn = screen.getByRole('button', { name: 'Revoke License' });
      expect(submitBtn).not.toBeDisabled();

      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(controlPlaneApi.revokeLicense).toHaveBeenCalledTimes(1);
        expect(controlPlaneApi.revokeLicense).toHaveBeenCalledWith(
          'lic_active_01',
          'Permanent breach termination of contract',
        );
      });
    });

    it('C. Missing/short suspend reason -> mutation must not be called', async () => {
      render(<LicensingPage />);

      await waitFor(() => {
        expect(screen.getByText('lic_active_01')).toBeInTheDocument();
      });

      const suspendBtn = screen.getAllByTitle(/Suspend commercial license/i)[0];
      fireEvent.click(suspendBtn);

      const reasonInput = screen.getByPlaceholderText(/Provide documented reason/i);
      fireEvent.change(reasonInput, { target: { value: 'Short' } }); // < 10 chars

      const submitBtn = screen.getByRole('button', { name: 'Suspend License' });
      expect(submitBtn).toBeDisabled();

      expect(controlPlaneApi.suspendLicense).not.toHaveBeenCalled();
    });

    it('D. Read-only operator -> mutation controls unavailable', async () => {
      (useAuth as jest.Mock).mockReturnValue({
        operator: readOnlyOperator,
        isAuthenticated: true,
        isLoading: false,
      });

      render(<LicenseDetailPage />);

      await waitFor(() => {
        expect(screen.getAllByText('lic_active_01').length).toBeGreaterThan(0);
      });

      expect(screen.queryByRole('button', { name: /Edit Metadata/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Suspend' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Revoke' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Grant \/ Update Entitlement/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Associate Deployment/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Disassociate' })).not.toBeInTheDocument();
    });

    it('E. 409 commercial conflict -> show conflict + refresh; never automatically retry destructive mutation', async () => {
      (controlPlaneApi.suspendLicense as jest.Mock).mockRejectedValue(
        new ControlPlaneApiError(409, 'Commercial license sequence conflict detected'),
      );

      render(<LicenseDetailPage />);

      await waitFor(() => {
        expect(screen.getAllByText('lic_active_01').length).toBeGreaterThan(0);
      });

      const suspendTriggerBtn = screen.getAllByRole('button', { name: 'Suspend' })[0];
      fireEvent.click(suspendTriggerBtn);

      const reasonInput = screen.getByPlaceholderText(/Provide documented reason/i);
      fireEvent.change(reasonInput, { target: { value: 'Valid documented reason for suspension' } });

      const submitBtn = screen.getByRole('button', { name: 'Suspend License' });
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(screen.getByText('Commercial license sequence conflict detected')).toBeInTheDocument();
      });

      // Assert mutation called exactly once and no auto retry occurred
      expect(controlPlaneApi.suspendLicense).toHaveBeenCalledTimes(1);
    });

    it('F. Entitlement revoke confirmation', async () => {
      const confirmMock = jest.fn().mockReturnValue(true);
      window.confirm = confirmMock;
      global.confirm = confirmMock;

      (controlPlaneApi.revokeEntitlement as jest.Mock).mockResolvedValue({
        id: 'ent_1',
        licenseId: 'lic_active_01',
        code: 'ISO27001',
        enabled: false,
      });

      render(<LicenseDetailPage />);

      await waitFor(() => {
        expect(screen.getAllByText('lic_active_01').length).toBeGreaterThan(0);
      });

      // Revoke buttons: index 0 is License Revoke, index 1 is ISO27001 Entitlement Revoke
      const revokeEntBtns = screen.getAllByRole('button', { name: 'Revoke' });
      fireEvent.click(revokeEntBtns[1]);

      expect(confirmMock).toHaveBeenCalledWith('Are you sure you want to revoke entitlement "ISO27001"?');
      await waitFor(() => {
        expect(controlPlaneApi.revokeEntitlement).toHaveBeenCalledWith('lic_active_01', 'ISO27001');
      });
    });

    it('G. No secret/signing-key/registration-secret content rendered', async () => {
      const { container } = render(<LicenseDetailPage />);

      await waitFor(() => {
        expect(screen.getAllByText('lic_active_01').length).toBeGreaterThan(0);
      });

      const pageText = container.textContent || '';
      expect(pageText).not.toContain('BEGIN PRIVATE KEY');
      expect(pageText).not.toContain('BEGIN RSA PRIVATE KEY');
      expect(pageText).not.toContain('registrationSecret');
      expect(pageText).not.toContain('operatorPassword');
      expect(pageText).not.toContain('jwtSecret');
    });

    it('H. Artifact re-sign uses current authoritative server state', async () => {
      render(<LicenseDetailPage />);

      await waitFor(() => {
        expect(screen.getAllByText('lic_active_01').length).toBeGreaterThan(0);
      });

      const reSignBtn = screen.getByRole('button', { name: /Issue \/ Re-Sign Artifact/i });
      fireEvent.click(reSignBtn);

      await waitFor(() => {
        // Must call getSignedArtifact with GET semantics (licenseId, deploymentId) and send NO client state/sequence
        expect(controlPlaneApi.getSignedArtifact).toHaveBeenCalledWith('lic_active_01', 'dep_01');
      });
    });
  });
});

