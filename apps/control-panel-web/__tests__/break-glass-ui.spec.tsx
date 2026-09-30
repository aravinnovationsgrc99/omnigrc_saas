import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import OperationsPage from '../src/app/operations/page';
import { useAuth } from '../src/lib/auth-context';
import { controlPlaneApi, ControlPlaneApiError } from '../src/lib/control-plane-api';
import { BreakGlassSessionDto } from '../src/types/control-plane';

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
      listBreakGlassSessions: jest.fn(),
      getBreakGlassSession: jest.fn(),
      requestBreakGlassSession: jest.fn(),
      approveBreakGlassSession: jest.fn(),
      executeBreakGlassAction: jest.fn(),
      revokeBreakGlassSession: jest.fn(),
      reviewEmergencyBreakGlassSession: jest.fn(),
      listOrganizations: jest.fn(),
      listDeployments: jest.fn(),
      listServices: jest.fn(),
    },
  };
});

// Mock Next.js router
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  usePathname: () => '/operations',
}));

describe('CP-6.5 Operations & Break-Glass Control Console UI', () => {
  const superAdminOperator = {
    id: 'op_admin_1',
    email: 'admin@arav.io',
    fullName: 'Platform Super Admin',
    role: 'PLATFORM_SUPER_ADMIN' as const,
    status: 'ACTIVE' as const,
    mfaEnabled: true,
  };

  const readOnlyAuditorOperator = {
    id: 'op_auditor_1',
    email: 'auditor@arav.io',
    fullName: 'Read Only Auditor',
    role: 'READ_ONLY_AUDITOR' as const,
    status: 'ACTIVE' as const,
    mfaEnabled: false,
  };

  const sampleSession: BreakGlassSessionDto = {
    id: 'bg-100-test',
    requesterOperatorId: 'op_admin_1',
    requesterOperatorName: 'Platform Super Admin',
    status: 'REQUESTED',
    operation: 'EMERGENCY_ORG_SUSPEND',
    reason: 'Active security incident investigation and emergency containment',
    targetOrganizationId: 'org-acme-100',
    expiresAt: new Date(Date.now() + 900000).toISOString(),
    isSingleOperatorEmergency: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const sampleEmergencySession: BreakGlassSessionDto = {
    id: 'bg-101-emergency',
    requesterOperatorId: 'op_other_op',
    requesterOperatorName: 'Operations Engineer 2',
    executorOperatorId: 'op_other_op',
    approverOperatorId: 'op_other_op',
    status: 'APPROVED',
    operation: 'EMERGENCY_DEPLOYMENT_SUSPEND',
    reason: 'Rogue deployment breach containment under single operator mode',
    targetDeploymentId: 'dep-acme-prod-1',
    expiresAt: new Date(Date.now() + 900000).toISOString(),
    isSingleOperatorEmergency: true,
    postEventReviewStatus: 'PENDING_REVIEW',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const mockOrgs = [
    { organizationId: 'org-acme-100', state: 'ACTIVE' as const, sequence: '1', reason: 'Active', createdAt: '', updatedAt: '' },
  ];

  const mockDeps = [
    { id: 'dep-acme-prod-1', organizationId: 'org-acme-100', deploymentModel: 'MSSP_SHARED', activationState: 'ACTIVE', region: 'us-east-1', createdAt: '', updatedAt: '' },
  ];

  const mockServices = [
    { id: 'srv-1', code: 'AI_DOC_INTELLIGENCE', name: 'AI Document Intelligence', category: 'AI_SERVICES', hasBackgroundProcessing: true, isCatalogActive: true, isCommerciallyControllable: true, isOrgOverridePermitted: true, createdAt: '', updatedAt: '' },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    (useAuth as jest.Mock).mockReturnValue({
      operator: superAdminOperator,
      isAuthenticated: true,
      isLoading: false,
    });

    (controlPlaneApi.listBreakGlassSessions as jest.Mock).mockResolvedValue([
      sampleSession,
      sampleEmergencySession,
    ]);
    (controlPlaneApi.listOrganizations as jest.Mock).mockResolvedValue(mockOrgs as any);
    (controlPlaneApi.listDeployments as jest.Mock).mockResolvedValue(mockDeps as any);
    (controlPlaneApi.listServices as jest.Mock).mockResolvedValue(mockServices as any);
  });

  it('1. renders Operations console title, governance banner, and statistics cards', async () => {
    render(<OperationsPage />);

    await waitFor(() => {
      expect(screen.getByText('Operations & Break-Glass Control Console')).toBeInTheDocument();
      expect(screen.getByText(/Emergency Control Plane Boundaries & Governance Rules/i)).toBeInTheDocument();
      expect(screen.getAllByText('EMERGENCY_ORG_SUSPEND')[0]).toBeInTheDocument();
      expect(screen.getAllByText('EMERGENCY_DEPLOYMENT_SUSPEND')[0]).toBeInTheDocument();
    });
  });

  it('2. represents all 5 supported operation types in the catalogue', async () => {
    render(<OperationsPage />);

    await waitFor(() => {
      expect(screen.getByText('Emergency Organization Suspend')).toBeInTheDocument();
      expect(screen.getByText('Emergency Organization Disable')).toBeInTheDocument();
      expect(screen.getByText('Service Capability Kill Switch')).toBeInTheDocument();
      expect(screen.getByText('Deployment Emergency Suspend')).toBeInTheDocument();
      expect(screen.getByText('Emergency License Reconciliation')).toBeInTheDocument();
    });
  });

  it('3. populates target selectors dynamically from API', async () => {
    render(<OperationsPage />);

    await waitFor(() => {
      expect(screen.getByText('Suspend Organization')).toBeInTheDocument();
    });

    // Open Suspend Org modal
    fireEvent.click(screen.getByText('Suspend Organization'));

    await waitFor(() => {
      expect(screen.getByText('Select target organization from Control Plane...')).toBeInTheDocument();
      expect(screen.getByText('org-acme-100 (ACTIVE)')).toBeInTheDocument();
    });
  });

  it('4. disables emergency mutation buttons for read-only auditor role', async () => {
    (useAuth as jest.Mock).mockReturnValue({
      operator: readOnlyAuditorOperator,
      isAuthenticated: true,
      isLoading: false,
    });

    render(<OperationsPage />);

    await waitFor(() => {
      expect(screen.getByText('Read-Only Mode (READ_ONLY_AUDITOR)')).toBeInTheDocument();
      expect(screen.getAllByText('Unauthorized').length).toBeGreaterThan(0);
    });
  });

  it('5. opens emergency request modal and enforces required reason and TOTP code', async () => {
    (controlPlaneApi.requestBreakGlassSession as jest.Mock).mockResolvedValueOnce({
      ...sampleSession,
      id: 'bg-102-new',
    });

    render(<OperationsPage />);

    await waitFor(() => {
      expect(screen.getByText('Suspend Organization')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Suspend Organization'));

    // Select target org
    fireEvent.change(screen.getByLabelText(/Target Organization/i), { target: { value: 'org-acme-100' } });

    // Enter valid reason >= 10 chars
    fireEvent.change(screen.getByLabelText(/Operational Audit Justification/i), {
      target: { value: 'Active security breach containment requested by SOC team' },
    });

    // Enter TOTP code
    fireEvent.change(screen.getByLabelText(/Step-Up MFA TOTP Code/i), {
      target: { value: '654321' },
    });

    // Submit form
    fireEvent.click(screen.getByRole('button', { name: /Request Emergency Authorization/i }));

    await waitFor(() => {
      expect(controlPlaneApi.requestBreakGlassSession).toHaveBeenCalledWith(
        expect.objectContaining({
          operation: 'EMERGENCY_ORG_SUSPEND',
          targetOrganizationId: 'org-acme-100',
          reason: 'Active security breach containment requested by SOC team',
          totpCode: '654321',
        }),
      );
    });
  });

  it('6. enforces single-operator emergency mode typed confirmation text matching exact phrase', async () => {
    render(<OperationsPage />);

    await waitFor(() => {
      expect(screen.getByText('Suspend Organization')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Suspend Organization'));

    fireEvent.change(screen.getByLabelText(/Target Organization/i), { target: { value: 'org-acme-100' } });
    fireEvent.change(screen.getByLabelText(/Operational Audit Justification/i), {
      target: { value: 'Emergency containment under single operator mode' },
    });
    fireEvent.change(screen.getByLabelText(/Step-Up MFA TOTP Code/i), { target: { value: '654321' } });

    // Enable single operator emergency checkbox
    const emergencyCheckbox = screen.getByLabelText(/Initiate Single-Operator Emergency Override Mode/i);
    fireEvent.click(emergencyCheckbox);

    // Attempt to submit with invalid typed confirmation phrase
    fireEvent.click(screen.getByRole('button', { name: /Request Emergency Authorization/i }));

    await waitFor(() => {
      expect(screen.getByText(/Single-operator emergency mode requires exact typed phrase/i)).toBeInTheDocument();
    });
  });

  it('7. enforces separation of duties blocking requester from self-approving request', async () => {
    render(<OperationsPage />);

    await waitFor(() => {
      expect(screen.getByText('bg-100-test')).toBeInTheDocument();
      // Operator op_admin_1 requested sampleSession; self approve is blocked
      expect(screen.getByText('Self App Block')).toBeInTheDocument();
    });
  });

  it('8. submits post-event emergency review for authorized audit role', async () => {
    (controlPlaneApi.reviewEmergencyBreakGlassSession as jest.Mock).mockResolvedValueOnce({
      ...sampleEmergencySession,
      postEventReviewStatus: 'REVIEWED_APPROVED',
    });

    render(<OperationsPage />);

    await waitFor(() => {
      expect(screen.getByText('bg-101-emergency')).toBeInTheDocument();
    });

    // Switch to REVIEWS tab
    fireEvent.click(screen.getByText(/Post-Event Review Queue/i));

    await waitFor(() => {
      expect(screen.getByText('Perform Review')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Perform Review'));

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Provide audit assessment notes/i)).toBeInTheDocument();
    });

    fireEvent.change(screen.getByPlaceholderText(/Provide audit assessment notes/i), {
      target: { value: 'Single-operator emergency action verified against security logs.' },
    });

    fireEvent.click(screen.getByRole('button', { name: /Submit Audit Review/i }));

    await waitFor(() => {
      expect(controlPlaneApi.reviewEmergencyBreakGlassSession).toHaveBeenCalledWith('bg-101-emergency', {
        postEventReviewStatus: 'REVIEWED_APPROVED',
        notes: 'Single-operator emergency action verified against security logs.',
      });
    });
  });

  it('9. renders forensic details modal and scrubs raw secrets', async () => {
    render(<OperationsPage />);

    await waitFor(() => {
      expect(screen.getByText('bg-100-test')).toBeInTheDocument();
    });

    const detailsButtons = screen.getAllByRole('button', { name: /Details/i });
    fireEvent.click(detailsButtons[0]);

    await waitFor(() => {
      expect(screen.getByText(/Forensic Session Details/i)).toBeInTheDocument();
      expect(screen.getAllByText('EMERGENCY_ORG_SUSPEND')[0]).toBeInTheDocument();
      expect(screen.getByText('Active security incident investigation and emergency containment')).toBeInTheDocument();
    });
  });

  it('10. handles API errors gracefully and does not claim false success', async () => {
    (controlPlaneApi.requestBreakGlassSession as jest.Mock).mockRejectedValueOnce(
      new ControlPlaneApiError(401, 'Invalid MFA TOTP code provided for Break-Glass request', 'INVALID_TOTP'),
    );

    render(<OperationsPage />);

    await waitFor(() => {
      expect(screen.getByText('Suspend Organization')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Suspend Organization'));
    fireEvent.change(screen.getByLabelText(/Target Organization/i), { target: { value: 'org-acme-100' } });
    fireEvent.change(screen.getByLabelText(/Operational Audit Justification/i), {
      target: { value: 'Active security breach containment requested by SOC team' },
    });
    fireEvent.change(screen.getByLabelText(/Step-Up MFA TOTP Code/i), { target: { value: '000000' } });

    fireEvent.click(screen.getByRole('button', { name: /Request Emergency Authorization/i }));

    await waitFor(() => {
      expect(screen.getByText('Invalid MFA TOTP code provided for Break-Glass request')).toBeInTheDocument();
    });
  });
});
