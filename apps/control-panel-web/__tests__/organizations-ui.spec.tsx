import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import OrganizationsPage from '../src/app/organizations/page';
import OrganizationDetailPage from '../src/app/organizations/[organizationId]/page';
import { useAuth } from '../src/lib/auth-context';
import { controlPlaneApi, ControlPlaneApiError } from '../src/lib/control-plane-api';
import { OrganizationControlState, ControlState } from '../src/types/control-plane';

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
      listOrganizations: jest.fn(),
      getOrganization: jest.fn(),
      getOrganizationHistory: jest.fn(),
      transitionOrganizationState: jest.fn(),
      listDeployments: jest.fn(),
      listLicenses: jest.fn(),
    },
  };
});

// Mock Next.js router and useParams
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  useParams: () => ({ organizationId: 'org_test_100' }),
}));

describe('CP-6.2 Organizations UI & Lifecycle Control', () => {
  const superAdminOperator = {
    id: 'op_super_admin',
    email: 'admin@arav.io',
    fullName: 'Super Admin',
    role: 'PLATFORM_SUPER_ADMIN' as const,
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

  const sampleOrgs: OrganizationControlState[] = [
    {
      id: 'rec_1',
      organizationId: 'org_active_01',
      state: 'ACTIVE',
      reason: 'Production environment onboarded',
      sequence: '10',
      createdAt: '2026-09-01T00:00:00.000Z',
      updatedAt: '2026-09-28T10:00:00.000Z',
    },
    {
      id: 'rec_2',
      organizationId: 'org_suspended_02',
      state: 'SUSPENDED',
      reason: 'Security investigation pending',
      sequence: '5',
      createdAt: '2026-09-10T00:00:00.000Z',
      updatedAt: '2026-09-27T10:00:00.000Z',
    },
    {
      id: 'rec_3',
      organizationId: 'org_disabled_03',
      state: 'DISABLED',
      reason: 'Contract termination',
      sequence: '12',
      createdAt: '2026-08-01T00:00:00.000Z',
      updatedAt: '2026-09-25T10:00:00.000Z',
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    (useAuth as jest.Mock).mockReturnValue({
      operator: superAdminOperator,
      isAuthenticated: true,
      isLoading: false,
    });

    (controlPlaneApi.listOrganizations as jest.Mock).mockResolvedValue(sampleOrgs);
    (controlPlaneApi.listDeployments as jest.Mock).mockResolvedValue([]);
    (controlPlaneApi.listLicenses as jest.Mock).mockResolvedValue([]);
    (controlPlaneApi.getOrganizationHistory as jest.Mock).mockResolvedValue([]);
  });

  describe('Organization List Page (/organizations)', () => {
    it('1. should render organization list with real API data', async () => {
      render(<OrganizationsPage />);

      await waitFor(() => {
        expect(screen.getByText('org_active_01')).toBeInTheDocument();
        expect(screen.getByText('org_suspended_02')).toBeInTheDocument();
        expect(screen.getByText('org_disabled_03')).toBeInTheDocument();
      });

      expect(screen.getByText('#10')).toBeInTheDocument();
      expect(screen.getByText('#5')).toBeInTheDocument();
    });

    it('2. should render clean empty state when API returns zero organizations', async () => {
      (controlPlaneApi.listOrganizations as jest.Mock).mockResolvedValue([]);

      render(<OrganizationsPage />);

      await waitFor(() => {
        expect(screen.getByText('No Organizations Discovered')).toBeInTheDocument();
      });
    });

    it('3. should render error state when API fails with 503 network error', async () => {
      (controlPlaneApi.listOrganizations as jest.Mock).mockRejectedValue(
        new ControlPlaneApiError(503, 'Control Plane API is currently unreachable'),
      );

      render(<OrganizationsPage />);

      await waitFor(() => {
        expect(screen.getByText('Control Plane API is currently unreachable')).toBeInTheDocument();
      });
    });

    it('4. should filter organizations using client-side query search', async () => {
      render(<OrganizationsPage />);

      await waitFor(() => {
        expect(screen.getByText('org_active_01')).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText('Search Org ID, Dep ID...');
      fireEvent.change(searchInput, { target: { value: 'suspended_02' } });

      expect(screen.getByText('org_suspended_02')).toBeInTheDocument();
      expect(screen.queryByText('org_active_01')).not.toBeInTheDocument();
    });

    it('5. should filter organizations using lifecycle state tab filters', async () => {
      render(<OrganizationsPage />);

      await waitFor(() => {
        expect(screen.getByText('org_active_01')).toBeInTheDocument();
      });

      // Click SUSPENDED tab
      const suspendedTab = screen.getByRole('button', { name: /SUSPENDED/i });
      fireEvent.click(suspendedTab);

      expect(screen.getByText('org_suspended_02')).toBeInTheDocument();
      expect(screen.queryByText('org_active_01')).not.toBeInTheDocument();
      expect(screen.queryByText('org_disabled_03')).not.toBeInTheDocument();
    });

    it('6. should hide mutation action buttons for READ_ONLY_AUDITOR operator', async () => {
      (useAuth as jest.Mock).mockReturnValue({
        operator: readOnlyOperator,
        isAuthenticated: true,
        isLoading: false,
      });

      render(<OrganizationsPage />);

      await waitFor(() => {
        expect(screen.getByText('org_active_01')).toBeInTheDocument();
      });

      expect(screen.queryByTitle(/Suspend organization/i)).not.toBeInTheDocument();
      expect(screen.queryByTitle(/Disable organization/i)).not.toBeInTheDocument();
      expect(screen.getAllByText('Read Only')).toHaveLength(3);
    });

    it('7. should open confirmation dialog for Suspend action and require >= 10 char reason', async () => {
      render(<OrganizationsPage />);

      await waitFor(() => {
        expect(screen.getByText('org_active_01')).toBeInTheDocument();
      });

      const suspendBtn = screen.getAllByTitle(/Suspend organization/i)[0];
      fireEvent.click(suspendBtn);

      expect(screen.getByText('Suspend Organization org_active_01')).toBeInTheDocument();

      const confirmBtn = screen.getByRole('button', { name: 'Suspend Organization' });
      expect(confirmBtn).toBeDisabled();

      // Type 5 chars (< 10)
      const reasonInput = screen.getByPlaceholderText(/Provide documented reason/i);
      fireEvent.change(reasonInput, { target: { value: 'Short' } });
      expect(confirmBtn).toBeDisabled();

      // Type valid reason >= 10 chars
      fireEvent.change(reasonInput, { target: { value: 'Compliance audit investigation in progress' } });
      expect(confirmBtn).not.toBeDisabled();
    });

    it('8. should execute transition request when dialog is submitted', async () => {
      (controlPlaneApi.transitionOrganizationState as jest.Mock).mockResolvedValue({
        idempotent: false,
        organizationId: 'org_active_01',
        state: 'SUSPENDED',
        previousState: 'ACTIVE',
        sequence: '11',
        reason: 'Compliance audit investigation in progress',
        updatedAt: new Date().toISOString(),
        propagation: { status: 'DELIVERED' },
      });

      render(<OrganizationsPage />);

      await waitFor(() => {
        expect(screen.getByText('org_active_01')).toBeInTheDocument();
      });

      fireEvent.click(screen.getAllByTitle(/Suspend organization/i)[0]);
      fireEvent.change(screen.getByPlaceholderText(/Provide documented reason/i), {
        target: { value: 'Compliance audit investigation in progress' },
      });

      fireEvent.click(screen.getByRole('button', { name: 'Suspend Organization' }));

      await waitFor(() => {
        expect(controlPlaneApi.transitionOrganizationState).toHaveBeenCalledWith(
          'org_active_01',
          expect.objectContaining({
            targetState: 'SUSPENDED',
            reason: 'Compliance audit investigation in progress',
          }),
        );
      });
    });
  });

  describe('Organization Detail Page (/organizations/[organizationId])', () => {
    it('9. should render organization detail components with sequence, history and status badge', async () => {
      (controlPlaneApi.getOrganization as jest.Mock).mockResolvedValue({
        id: 'rec_100',
        organizationId: 'org_test_100',
        state: 'ACTIVE',
        reason: 'Initial setup completed',
        sequence: '42',
        updatedByOperatorId: 'op_super_admin',
        createdAt: '2026-09-01T00:00:00.000Z',
        updatedAt: '2026-09-28T10:00:00.000Z',
      });

      (controlPlaneApi.getOrganizationHistory as jest.Mock).mockResolvedValue([
        {
          id: 'log_1',
          organizationId: 'org_test_100',
          previousState: 'PENDING',
          newState: 'ACTIVE',
          reason: 'Initial setup completed',
          sequence: '42',
          operatorId: 'op_super_admin',
          operatorRole: 'PLATFORM_SUPER_ADMIN',
          createdAt: '2026-09-01T00:00:00.000Z',
        },
      ]);

      render(<OrganizationDetailPage />);

      await waitFor(() => {
        expect(screen.getAllByText('org_test_100').length).toBeGreaterThan(0);
      });

      expect(screen.getByText(/Control Sequence:/i)).toBeInTheDocument();
      expect(screen.getByText('1. Identity & Control Record')).toBeInTheDocument();
      expect(screen.getByText('2. Lifecycle & State Semantics')).toBeInTheDocument();
      expect(screen.getByText('3. Commercial Summary')).toBeInTheDocument();
      expect(screen.getByText('4. Operational & Data Plane Projection')).toBeInTheDocument();
      expect(screen.getByText('5. Organization Lifecycle State Transition History')).toBeInTheDocument();
    });

    it('10. should display terminal state indicator for DECOMMISSIONED organization', async () => {
      (controlPlaneApi.getOrganization as jest.Mock).mockResolvedValue({
        id: 'rec_101',
        organizationId: 'org_test_100',
        state: 'DECOMMISSIONED',
        reason: 'Permanent closure',
        sequence: '99',
        createdAt: '2026-09-01T00:00:00.000Z',
        updatedAt: '2026-09-28T10:00:00.000Z',
      });

      render(<OrganizationDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('Terminal State')).toBeInTheDocument();
      });

      expect(screen.queryByRole('button', { name: /Reactivate/i })).not.toBeInTheDocument();
    });
  });
});
