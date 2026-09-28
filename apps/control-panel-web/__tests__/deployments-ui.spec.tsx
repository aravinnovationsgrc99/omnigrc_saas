import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import DeploymentsPage from '../src/app/deployments/page';
import DeploymentDetailPage from '../src/app/deployments/[deploymentId]/page';
import { useAuth } from '../src/lib/auth-context';
import { controlPlaneApi, ControlPlaneApiError } from '../src/lib/control-plane-api';
import { DeploymentSummary } from '../src/types/control-plane';

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
      listDeployments: jest.fn(),
      getDeployment: jest.fn(),
      getDeploymentHistory: jest.fn(),
      updateDeploymentState: jest.fn(),
      getDeploymentLicenseArtifact: jest.fn(),
      getOrganization: jest.fn(),
      getLicense: jest.fn(),
    },
  };
});

// Mock Next.js router and useParams
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  useParams: () => ({ deploymentId: 'dep_active_01' }),
}));

describe('CP-6.4 Deployment & Operations Control Surface', () => {
  const opsOperator = {
    id: 'op_ops',
    email: 'ops@arav.io',
    fullName: 'Operations Engineer',
    role: 'OPERATIONS_ENGINEER' as const,
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

  const sampleDeployments: DeploymentSummary[] = [
    {
      id: 'dep_active_01',
      organizationId: 'org_acme',
      customerId: 'cust_acme_100',
      commercialAgreementId: 'agr_100',
      licenseId: 'lic_active_01',
      deploymentModel: 'MSSP_SHARED',
      environment: 'PRODUCTION',
      version: '1.2.0',
      activationState: 'ACTIVE',
      infrastructureOwner: 'ARAV',
      lastCheckInAt: new Date().toISOString(),
      createdAt: '2026-09-01T00:00:00.000Z',
      updatedAt: '2026-09-28T10:00:00.000Z',
    },
    {
      id: 'dep_pending_02',
      organizationId: 'org_stark',
      customerId: 'cust_stark_200',
      commercialAgreementId: 'agr_200',
      licenseId: null,
      deploymentModel: 'SELF_HOSTED',
      environment: 'PRODUCTION',
      version: '1.0.0',
      activationState: 'PENDING',
      infrastructureOwner: 'CUSTOMER',
      lastCheckInAt: null,
      createdAt: '2026-09-10T00:00:00.000Z',
      updatedAt: '2026-09-10T00:00:00.000Z',
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    (useAuth as jest.Mock).mockReturnValue({
      operator: opsOperator,
      isAuthenticated: true,
      isLoading: false,
    });

    (controlPlaneApi.listDeployments as jest.Mock).mockResolvedValue(sampleDeployments);
    (controlPlaneApi.getDeployment as jest.Mock).mockResolvedValue(sampleDeployments[0]);
    (controlPlaneApi.getDeploymentHistory as jest.Mock).mockResolvedValue([
      {
        id: 'log-1',
        action: 'DEPLOYMENT_ACTIVATED',
        entityType: 'Deployment',
        entityId: 'dep_active_01',
        actorId: 'op_ops',
        actorRole: 'OPERATIONS_ENGINEER',
        createdAt: '2026-09-01T00:00:00.000Z',
      },
    ]);
    (controlPlaneApi.getOrganization as jest.Mock).mockResolvedValue({
      id: 'org_acme',
      organizationId: 'org_acme',
      state: 'ACTIVE',
      reason: 'Normal operational state',
      sequence: '1',
      createdAt: '2026-09-01T00:00:00.000Z',
      updatedAt: '2026-09-01T00:00:00.000Z',
    });
    (controlPlaneApi.getLicense as jest.Mock).mockResolvedValue({
      id: 'lic_active_01',
      commercialAgreementId: 'agr_100',
      product: 'OMNIGRC',
      status: 'ACTIVE',
      startsAt: '2026-09-01T00:00:00.000Z',
      expiresAt: '2027-09-01T00:00:00.000Z',
      maxDeployments: 5,
    });
    (controlPlaneApi.getDeploymentLicenseArtifact as jest.Mock).mockResolvedValue({
      formatVersion: '1.0',
      keyId: 'ed25519-key-prod-01',
      algorithm: 'Ed25519',
      payload: { sequence: 10 },
      signature: 'sig_hash_123',
    });
  });

  describe('Deployment Inventory Page (/deployments)', () => {
    it('1. should render deployment inventory list with real CP data', async () => {
      render(<DeploymentsPage />);

      await waitFor(() => {
        expect(screen.getByText('dep_active_01')).toBeInTheDocument();
        expect(screen.getByText('dep_pending_02')).toBeInTheDocument();
      });

      expect(screen.getByText('org_acme')).toBeInTheDocument();
      expect(screen.getByText('org_stark')).toBeInTheDocument();
    });

    it('2. should render clean empty state when zero deployments are returned', async () => {
      (controlPlaneApi.listDeployments as jest.Mock).mockResolvedValue([]);

      render(<DeploymentsPage />);

      await waitFor(() => {
        expect(
          screen.getByText('No operational deployments registered in Control Plane database.'),
        ).toBeInTheDocument();
      });
    });

    it('3. should render error state when API call fails with 503', async () => {
      (controlPlaneApi.listDeployments as jest.Mock).mockRejectedValue(
        new ControlPlaneApiError(503, 'Control Plane API service unavailable'),
      );

      render(<DeploymentsPage />);

      await waitFor(() => {
        expect(screen.getByText('Control Plane API service unavailable')).toBeInTheDocument();
      });
    });

    it('4. should filter deployments using search box', async () => {
      render(<DeploymentsPage />);

      await waitFor(() => {
        expect(screen.getByText('dep_active_01')).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText(/Search Deployment ID/i);
      fireEvent.change(searchInput, { target: { value: 'stark' } });

      expect(screen.getByText('dep_pending_02')).toBeInTheDocument();
      expect(screen.queryByText('dep_active_01')).not.toBeInTheDocument();
    });

    it('5. should hide operator mutation controls for READ_ONLY_AUDITOR', async () => {
      (useAuth as jest.Mock).mockReturnValue({
        operator: readOnlyOperator,
        isAuthenticated: true,
        isLoading: false,
      });

      render(<DeploymentsPage />);

      await waitFor(() => {
        expect(screen.getByText('dep_active_01')).toBeInTheDocument();
      });

      expect(screen.queryByTitle('Suspend operational deployment')).not.toBeInTheDocument();
      expect(screen.queryByTitle('Decommission deployment permanently')).not.toBeInTheDocument();
    });

    it('6. should open Suspend dialog and execute deployment state mutation with reason', async () => {
      (controlPlaneApi.updateDeploymentState as jest.Mock).mockResolvedValue({
        ...sampleDeployments[0],
        activationState: 'SUSPENDED',
      });

      render(<DeploymentsPage />);

      await waitFor(() => {
        expect(screen.getByText('dep_active_01')).toBeInTheDocument();
      });

      const suspendBtn = screen.getByTitle('Suspend operational deployment');
      fireEvent.click(suspendBtn);

      expect(screen.getByText('Suspend Deployment dep_active_01')).toBeInTheDocument();

      const confirmBtn = screen.getByRole('button', { name: 'Suspend Deployment' });
      expect(confirmBtn).toBeDisabled();

      const reasonInput = screen.getByPlaceholderText(/Provide documented reason/i);
      fireEvent.change(reasonInput, {
        target: { value: 'Operational security review and patch window' },
      });
      expect(confirmBtn).not.toBeDisabled();

      fireEvent.click(confirmBtn);

      await waitFor(() => {
        expect(controlPlaneApi.updateDeploymentState).toHaveBeenCalledWith(
          'dep_active_01',
          'SUSPENDED',
          'Operational security review and patch window',
        );
      });
    });
  });

  describe('Deployment Detail Page (/deployments/[deploymentId])', () => {
    it('7. should render deployment identity, org scope, license binding, check-in health, convergence, and history', async () => {
      render(<DeploymentDetailPage />);

      await waitFor(() => {
        expect(screen.getAllByText('dep_active_01').length).toBeGreaterThan(0);
      });

      expect(screen.getByText('1. Identity & Infrastructure Metadata')).toBeInTheDocument();
      expect(screen.getByText('2. Organization & Commercial Scope')).toBeInTheDocument();
      expect(screen.getByText('3. Operational Activation State')).toBeInTheDocument();
      expect(screen.getByText('4. Data Plane Health & Convergence')).toBeInTheDocument();
      expect(screen.getByText('5. Deployment Operational Audit History Log')).toBeInTheDocument();

      expect(screen.getByText('CONFIRMED (Active Check-In Verified)')).toBeInTheDocument();
      expect(screen.getByText('DEPLOYMENT_ACTIVATED')).toBeInTheDocument();
    });

    it('8. should render Organization Precedence Warning Banner when organization is DISABLED', async () => {
      (controlPlaneApi.getOrganization as jest.Mock).mockResolvedValue({
        id: 'org_acme',
        organizationId: 'org_acme',
        state: 'DISABLED',
        reason: 'Payment delinquency',
        sequence: '2',
      });

      render(<DeploymentDetailPage />);

      await waitFor(() => {
        expect(screen.getAllByText('dep_active_01').length).toBeGreaterThan(0);
      });

      expect(
        screen.getByText(/ORGANIZATION CONTROL STATE PRECEDENCE OVERRIDE/i),
      ).toBeInTheDocument();
      expect(
        screen.getByText(/Organization lifecycle control strictly dominates deployment operational state/i),
      ).toBeInTheDocument();
    });

    it('9. should require typed confirmation phrase for permanent decommissioning', async () => {
      render(<DeploymentDetailPage />);

      await waitFor(() => {
        expect(screen.getAllByText('dep_active_01').length).toBeGreaterThan(0);
      });

      const decommissionBtn = screen.getByRole('button', { name: 'Decommission' });
      fireEvent.click(decommissionBtn);

      expect(screen.getByText('Decommission Deployment dep_active_01')).toBeInTheDocument();

      const confirmInput = screen.getByPlaceholderText('Type "DECOMMISSION dep_active_01"');
      fireEvent.change(confirmInput, { target: { value: 'WRONG_PHRASE' } });

      const reasonInput = screen.getByPlaceholderText(/Provide documented reason/i);
      fireEvent.change(reasonInput, {
        target: { value: 'Permanent decommissioning of infrastructure' },
      });

      const submitBtn = screen.getByRole('button', { name: 'Decommission Deployment Permanently' });
      expect(submitBtn).toBeDisabled();
    });

    it('10. Zero Secret Audit: verifies DOM contains no registration secrets, private keys, or passwords', async () => {
      const { container } = render(<DeploymentDetailPage />);

      await waitFor(() => {
        expect(screen.getAllByText('dep_active_01').length).toBeGreaterThan(0);
      });

      const pageText = container.textContent || '';
      expect(pageText).not.toContain('BEGIN PRIVATE KEY');
      expect(pageText).not.toContain('BEGIN RSA PRIVATE KEY');
      expect(pageText).not.toContain('registrationSecretHash');
      expect(pageText).not.toContain('operatorPassword');
      expect(pageText).not.toContain('jwtSecret');
    });
  });
});
