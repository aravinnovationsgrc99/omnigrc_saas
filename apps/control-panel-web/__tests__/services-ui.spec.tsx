import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ServicesPage from '../src/app/services/page';
import { controlPlaneApi, ControlPlaneApiError } from '../src/lib/control-plane-api';
import { useAuth } from '../src/lib/auth-context';

// Mock dependencies
jest.mock('../src/lib/auth-context');
jest.mock('../src/lib/control-plane-api', () => {
  const original = jest.requireActual('../src/lib/control-plane-api');
  return {
    ...original,
    controlPlaneApi: {
      listServices: jest.fn(),
      getServiceByCode: jest.fn(),
      updateGlobalServiceState: jest.fn(),
      setOrganizationServiceOverride: jest.fn(),
      clearOrganizationServiceOverride: jest.fn(),
      listOrganizations: jest.fn(),
    },
  };
});

const mockUseAuth = useAuth as jest.Mock;
const mockControlPlaneApi = controlPlaneApi as jest.Mocked<typeof controlPlaneApi>;

describe('Service Capability Control UI', () => {
  const mockOperatorSuperAdmin = {
    id: 'op-admin-1',
    email: 'admin@omnigrc.co',
    fullName: 'Super Admin',
    role: 'PLATFORM_SUPER_ADMIN',
    status: 'ACTIVE',
    mfaEnabled: true,
  };

  const mockOperatorReadOnly = {
    id: 'op-auditor-1',
    email: 'auditor@omnigrc.co',
    fullName: 'Read Only Auditor',
    role: 'READ_ONLY_AUDITOR',
    status: 'ACTIVE',
    mfaEnabled: false,
  };

  const mockCatalogServices = [
    {
      id: 'srv-1',
      code: 'GRC_CORE_ASSETS',
      name: 'Asset Management',
      category: 'CORE_GRC',
      hasBackgroundProcessing: false,
      isCatalogActive: true,
      isCommerciallyControllable: true,
      isOrgOverridePermitted: true,
      createdAt: '2026-09-01T00:00:00.000Z',
      updatedAt: '2026-09-01T00:00:00.000Z',
      globalState: {
        id: 'gs-1',
        serviceId: 'srv-1',
        state: 'AVAILABLE' as const,
        reason: 'Initial capability availability',
        sequence: '1',
        createdAt: '2026-09-01T00:00:00.000Z',
        updatedAt: '2026-09-01T00:00:00.000Z',
      },
    },
    {
      id: 'srv-2',
      code: 'AI_DOC_INTELLIGENCE',
      name: 'AI Document Intelligence',
      category: 'AI_SERVICES',
      hasBackgroundProcessing: true,
      isCatalogActive: true,
      isCommerciallyControllable: true,
      isOrgOverridePermitted: true,
      createdAt: '2026-09-01T00:00:00.000Z',
      updatedAt: '2026-09-01T00:00:00.000Z',
      globalState: {
        id: 'gs-2',
        serviceId: 'srv-2',
        state: 'DISABLED' as const,
        reason: 'Global kill switch activated for security audit',
        sequence: '2',
        createdAt: '2026-09-01T00:00:00.000Z',
        updatedAt: '2026-09-01T00:00:00.000Z',
      },
    },
    {
      id: 'srv-3',
      code: 'MSSP_PORTAL',
      name: 'MSSP Provider Portal',
      category: 'MSSP',
      hasBackgroundProcessing: false,
      isCatalogActive: true,
      isCommerciallyControllable: true,
      isOrgOverridePermitted: true,
      createdAt: '2026-09-01T00:00:00.000Z',
      updatedAt: '2026-09-01T00:00:00.000Z',
      globalState: {
        id: 'gs-3',
        serviceId: 'srv-3',
        state: 'COMMERCIAL_DISABLED' as const,
        reason: 'Requires MSSP commercial tier license',
        sequence: '3',
        createdAt: '2026-09-01T00:00:00.000Z',
        updatedAt: '2026-09-01T00:00:00.000Z',
      },
    },
  ];

  const mockOrganizations = [
    {
      id: 'org-cs-1',
      organizationId: 'org-blkashyap-001',
      state: 'ACTIVE' as const,
      reason: 'Active org',
      sequence: '1',
      createdAt: '2026-09-01T00:00:00.000Z',
      updatedAt: '2026-09-01T00:00:00.000Z',
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAuth.mockReturnValue({
      operator: mockOperatorSuperAdmin,
      isAuthenticated: true,
      isLoading: false,
    });
    mockControlPlaneApi.listServices.mockResolvedValue(mockCatalogServices);
    mockControlPlaneApi.listOrganizations.mockResolvedValue(mockOrganizations as any);
  });

  it('1. should render capability catalog dynamically from API', async () => {
    render(<ServicesPage />);

    await waitFor(() => {
      expect(screen.getByText('GRC_CORE_ASSETS')).toBeInTheDocument();
      expect(screen.getByText('AI_DOC_INTELLIGENCE')).toBeInTheDocument();
      expect(screen.getByText('MSSP_PORTAL')).toBeInTheDocument();
    });

    expect(mockControlPlaneApi.listServices).toHaveBeenCalledTimes(1);
  });

  it('2. should render global states correctly with appropriate badges', async () => {
    render(<ServicesPage />);

    await waitFor(() => {
      expect(screen.getAllByText('AVAILABLE')[0]).toBeInTheDocument();
      expect(screen.getAllByText('DISABLED')[0]).toBeInTheDocument();
      expect(screen.getAllByText('COMMERCIAL DISABLED')[0]).toBeInTheDocument();
    });
  });

  it('3. should load real organizations into selector dropdown', async () => {
    render(<ServicesPage />);

    await waitFor(() => {
      expect(screen.getByText('Organization Overrides View (1 Orgs)')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Organization Overrides View (1 Orgs)'));

    await waitFor(() => {
      expect(screen.getByText('org-blkashyap-001 — (ACTIVE)')).toBeInTheDocument();
    });
  });

  it('4. should display mutation controls for authorized operator', async () => {
    render(<ServicesPage />);

    await waitFor(() => {
      expect(screen.getByText('Operator Mutate Enabled (PLATFORM_SUPER_ADMIN)')).toBeInTheDocument();
      expect(screen.getAllByText('Disable').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Enable').length).toBeGreaterThan(0);
    });
  });

  it('5. should hide mutation controls and show read-only badge for read-only auditor', async () => {
    mockUseAuth.mockReturnValue({
      operator: mockOperatorReadOnly,
      isAuthenticated: true,
      isLoading: false,
    });

    render(<ServicesPage />);

    await waitFor(() => {
      expect(screen.getByText('Read-Only Mode (READ_ONLY_AUDITOR)')).toBeInTheDocument();
      expect(screen.queryByText('Enable')).not.toBeInTheDocument();
      expect(screen.getAllByText('Read-Only').length).toBeGreaterThan(0);
    });
  });

  it('6. should execute successful global disable mutation with reason', async () => {
    mockControlPlaneApi.updateGlobalServiceState.mockResolvedValue({
      idempotent: false,
      capabilityCode: 'GRC_CORE_ASSETS',
      state: 'DISABLED',
      sequence: '2',
      reason: 'Emergency operational maintenance reason extended',
      updatedAt: '2026-09-30T00:00:00.000Z',
    });

    render(<ServicesPage />);

    await waitFor(() => {
      expect(screen.getByText('GRC_CORE_ASSETS')).toBeInTheDocument();
    });

    // Click Disable button for GRC_CORE_ASSETS
    const disableButtons = screen.getAllByText('Disable');
    fireEvent.click(disableButtons[0]);

    await waitFor(() => {
      expect(screen.getByText(/Global State Mutation: GRC_CORE_ASSETS/i)).toBeInTheDocument();
    });

    // Fill in required reason >= 10 chars
    const reasonInput = screen.getByPlaceholderText(/Provide documented reason/i);
    fireEvent.change(reasonInput, { target: { value: 'Emergency operational maintenance reason extended' } });

    // Confirm mutation
    fireEvent.click(screen.getByText('Execute State Mutation'));

    await waitFor(() => {
      expect(mockControlPlaneApi.updateGlobalServiceState).toHaveBeenCalledWith(
        'GRC_CORE_ASSETS',
        expect.objectContaining({
          state: 'DISABLED',
          reason: 'Emergency operational maintenance reason extended',
        })
      );
    });
  });

  it('7. should enforce commercial primacy and disable override button for commercial-disabled capability', async () => {
    render(<ServicesPage />);

    await waitFor(() => {
      expect(screen.getByText('Organization Overrides View (1 Orgs)')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Organization Overrides View (1 Orgs)'));

    await waitFor(() => {
      expect(screen.getByText('MSSP_PORTAL')).toBeInTheDocument();
      expect(screen.getByText('Comm. Restricted')).toBeInTheDocument();
    });

    // Disabled button should not be clickable to enable org override when commercial state is COMMERCIAL_DISABLED
    const commRestrictedBtn = screen.getByText('Comm. Restricted');
    expect(commRestrictedBtn).toBeDisabled();
  });

  it('8. should display error message and not claim false success if API mutation fails', async () => {
    mockControlPlaneApi.updateGlobalServiceState.mockRejectedValue(
      new ControlPlaneApiError(400, 'Reason provided is trivial or invalid', 'REASON_TOO_TRIVIAL', 'corr_err_1')
    );

    render(<ServicesPage />);

    await waitFor(() => {
      expect(screen.getByText('GRC_CORE_ASSETS')).toBeInTheDocument();
    });

    const disableButtons = screen.getAllByText('Disable');
    fireEvent.click(disableButtons[0]);

    await waitFor(() => {
      expect(screen.getByText(/Global State Mutation: GRC_CORE_ASSETS/i)).toBeInTheDocument();
    });

    const reasonInput = screen.getByPlaceholderText(/Provide documented reason/i);
    fireEvent.change(reasonInput, { target: { value: 'Operational reason valid length provided' } });

    fireEvent.click(screen.getByText('Execute State Mutation'));

    await waitFor(() => {
      expect(screen.getByText('Reason provided is trivial or invalid')).toBeInTheDocument();
    });
  });
});
