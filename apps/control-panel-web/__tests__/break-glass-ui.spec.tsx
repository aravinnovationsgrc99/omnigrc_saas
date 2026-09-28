import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import BreakGlassPage from '../src/app/operations/break-glass/page';
import { useAuth } from '../src/lib/auth-context';
import { controlPlaneApi } from '../src/lib/control-plane-api';
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
    },
  };
});

// Mock Next.js router
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  usePathname: () => '/operations/break-glass',
}));

describe('CP-6.5 Break-Glass & Advanced Operations UI Surface', () => {
  const superAdminOperator = {
    id: 'op_admin_1',
    email: 'admin@arav.io',
    fullName: 'Platform Super Admin',
    role: 'PLATFORM_SUPER_ADMIN' as const,
    status: 'ACTIVE' as const,
    mfaEnabled: true,
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
    requesterOperatorId: 'op_admin_1',
    requesterOperatorName: 'Platform Super Admin',
    approverOperatorId: 'op_admin_1',
    approverOperatorName: 'Platform Super Admin',
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
  });

  it('renders Break-Glass Operations page title, security policy banner, and sessions', async () => {
    render(<BreakGlassPage />);

    expect(screen.getByText('Break-Glass Operations')).toBeInTheDocument();
    expect(screen.getByText(/Authoritative Security Policy:/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('EMERGENCY_ORG_SUSPEND')).toBeInTheDocument();
      expect(screen.getByText('EMERGENCY_DEPLOYMENT_SUSPEND')).toBeInTheDocument();
    });
  });

  it('opens Initiate Break-Glass request modal and submits valid request', async () => {
    (controlPlaneApi.requestBreakGlassSession as jest.Mock).mockResolvedValueOnce({
      ...sampleSession,
      id: 'bg-102-new',
    });

    render(<BreakGlassPage />);

    await waitFor(() => {
      expect(screen.getByText('EMERGENCY_ORG_SUSPEND')).toBeInTheDocument();
    });

    const initButton = screen.getByRole('button', { name: /Initiate Break-Glass/i });
    fireEvent.click(initButton);

    expect(screen.getByText('Request Break-Glass Emergency Session')).toBeInTheDocument();

    // Fill Form
    const reasonInput = screen.getByPlaceholderText(/Detail explicit incident ticket reference/i);
    fireEvent.change(reasonInput, { target: { value: 'Operational containment of security incident #9921' } });

    const totpInput = screen.getByPlaceholderText('123456');
    fireEvent.change(totpInput, { target: { value: '654321' } });

    const submitBtn = screen.getByRole('button', { name: /Submit Break-Glass Request/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(controlPlaneApi.requestBreakGlassSession).toHaveBeenCalledWith(
        expect.objectContaining({
          operation: 'EMERGENCY_ORG_SUSPEND',
          reason: 'Operational containment of security incident #9921',
          totpCode: '654321',
        }),
      );
    });
  });

  it('renders approve button for requested session and executes approval modal', async () => {
    (controlPlaneApi.approveBreakGlassSession as jest.Mock).mockResolvedValueOnce({
      ...sampleSession,
      status: 'APPROVED',
      approverOperatorId: 'op_admin_2',
    });

    render(<BreakGlassPage />);

    await waitFor(() => {
      expect(screen.getByText('EMERGENCY_ORG_SUSPEND')).toBeInTheDocument();
    });

    const approveButtons = screen.getAllByRole('button', { name: /Approve/i });
    fireEvent.click(approveButtons[0]);

    expect(screen.getByText('Approve Break-Glass Session')).toBeInTheDocument();

    const totpInput = screen.getByPlaceholderText('123456');
    fireEvent.change(totpInput, { target: { value: '112233' } });

    const confirmApproveBtn = screen.getByRole('button', { name: /Approve Session/i });
    fireEvent.click(confirmApproveBtn);

    await waitFor(() => {
      expect(controlPlaneApi.approveBreakGlassSession).toHaveBeenCalledWith('bg-100-test', {
        totpCode: '112233',
        reason: undefined,
      });
    });
  });

  it('renders review incident button for emergency sessions requiring post-event review', async () => {
    (controlPlaneApi.reviewEmergencyBreakGlassSession as jest.Mock).mockResolvedValueOnce({
      ...sampleEmergencySession,
      postEventReviewStatus: 'REVIEWED_APPROVED',
    });

    render(<BreakGlassPage />);

    await waitFor(() => {
      expect(screen.getByText('EMERGENCY_DEPLOYMENT_SUSPEND')).toBeInTheDocument();
    });

    const reviewButton = screen.getByRole('button', { name: /Review Incident/i });
    fireEvent.click(reviewButton);

    expect(screen.getByText('Mandatory Post-Event Review')).toBeInTheDocument();

    const notesArea = screen.getByPlaceholderText(/Document post-event review conclusions/i);
    fireEvent.change(notesArea, { target: { value: 'Single-operator emergency override justified by incident logs.' } });

    const submitReviewBtn = screen.getByRole('button', { name: /Complete Post-Event Review/i });
    fireEvent.click(submitReviewBtn);

    await waitFor(() => {
      expect(controlPlaneApi.reviewEmergencyBreakGlassSession).toHaveBeenCalledWith('bg-101-emergency', {
        postEventReviewStatus: 'REVIEWED_APPROVED',
        notes: 'Single-operator emergency override justified by incident logs.',
      });
    });
  });
});
