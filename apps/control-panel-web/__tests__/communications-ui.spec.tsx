import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import CommunicationsPage from '../src/app/communications/page';
import { useAuth } from '../src/lib/auth-context';
import { controlPlaneApi, ControlPlaneApiError } from '../src/lib/control-plane-api';
import { AnnouncementsResponse } from '../src/types/control-plane';

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
      listAnnouncements: jest.fn(),
      getAnnouncement: jest.fn(),
      createAnnouncement: jest.fn(),
      publishAnnouncement: jest.fn(),
      cancelAnnouncement: jest.fn(),
      listOrganizations: jest.fn(),
    },
  };
});

// Mock Next.js router
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  usePathname: () => '/communications',
}));

describe('CP Platform Communications UI Surface', () => {
  const superAdminOperator = {
    id: 'op_admin_1',
    email: 'admin@arav.io',
    fullName: 'Platform Super Admin',
    role: 'PLATFORM_SUPER_ADMIN' as const,
    status: 'ACTIVE' as const,
    mfaEnabled: true,
  };

  const supportEngineerOperator = {
    id: 'op_supp_1',
    email: 'support@arav.io',
    fullName: 'Support Engineer',
    role: 'SUPPORT_ENGINEER' as const,
    status: 'ACTIVE' as const,
    mfaEnabled: true,
  };

  const sampleAnnouncementsResponse: AnnouncementsResponse = {
    data: [
      {
        id: 'ann_1',
        title: 'Maintenance Advisory Q4',
        body: 'Scheduled system maintenance on October 15th.',
        severity: 'WARNING',
        status: 'PUBLISHED',
        audience: 'ALL_ORGANIZATIONS',
        targetOrganizationId: null,
        createdByOperatorId: 'op_admin_1',
        scheduledAt: null,
        publishedAt: '2026-09-30T10:00:00.000Z',
        cancelledAt: null,
        expiresAt: null,
        sendEmail: true,
        emailDeliveryStatus: 'SENT',
        emailSentAt: '2026-09-30T10:00:01.000Z',
        emailRecipientCount: 15,
        emailErrorDetails: null,
        createdAt: '2026-09-30T09:00:00.000Z',
        updatedAt: '2026-09-30T10:00:00.000Z',
        creator: {
          id: 'op_admin_1',
          fullName: 'Platform Super Admin',
          email: 'admin@arav.io',
          role: 'PLATFORM_SUPER_ADMIN',
        },
      },
      {
        id: 'ann_2',
        title: 'Security Patch Release',
        body: 'Security update 1.4.2 released for all deployments.',
        severity: 'CRITICAL',
        status: 'DRAFT',
        audience: 'ALL_ORGANIZATIONS',
        targetOrganizationId: null,
        createdByOperatorId: 'op_admin_1',
        scheduledAt: null,
        publishedAt: null,
        cancelledAt: null,
        expiresAt: null,
        sendEmail: false,
        emailDeliveryStatus: 'NOT_REQUESTED',
        emailSentAt: null,
        emailRecipientCount: 0,
        emailErrorDetails: null,
        createdAt: '2026-09-30T11:00:00.000Z',
        updatedAt: '2026-09-30T11:00:00.000Z',
        creator: {
          id: 'op_admin_1',
          fullName: 'Platform Super Admin',
          email: 'admin@arav.io',
          role: 'PLATFORM_SUPER_ADMIN',
        },
      },
    ],
    meta: {
      total: 2,
      page: 1,
      limit: 20,
      totalPages: 1,
      hasNextPage: false,
      hasPreviousPage: false,
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();

    (useAuth as jest.Mock).mockReturnValue({
      operator: superAdminOperator,
      isAuthenticated: true,
      isLoading: false,
    });

    (controlPlaneApi.listAnnouncements as jest.Mock).mockResolvedValue(sampleAnnouncementsResponse);
    (controlPlaneApi.listOrganizations as jest.Mock).mockResolvedValue([
      { organizationId: 'org_acme', state: 'ACTIVE' },
    ]);
  });

  it('renders the communications page header and platform scope distinction banner', async () => {
    render(<CommunicationsPage />);

    await waitFor(() => {
      expect(screen.getByText('Platform Communications & Advisories')).toBeInTheDocument();
    });

    expect(screen.getByText('Control Plane Communication Authority')).toBeInTheDocument();
    expect(screen.getByText('Maintenance Advisory Q4')).toBeInTheDocument();
    expect(screen.getByText('Security Patch Release')).toBeInTheDocument();
  });

  it('opens the Create Announcement modal and submits valid data', async () => {
    (controlPlaneApi.createAnnouncement as jest.Mock).mockResolvedValue({
      id: 'ann_new',
      title: 'New Emergency Advisory',
      body: 'Emergency advisory text details.',
      severity: 'CRITICAL',
      status: 'DRAFT',
    });

    render(<CommunicationsPage />);

    await waitFor(() => {
      expect(screen.getByText('Create Announcement')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Create Announcement'));

    expect(screen.getByText('Create Platform Announcement')).toBeInTheDocument();

    const titleInput = screen.getByPlaceholderText('e.g. Scheduled Infrastructure Upgrade Notice');
    const bodyInput = screen.getByPlaceholderText('Enter detailed notice information, operational instructions, or advisory text...');

    fireEvent.change(titleInput, { target: { value: 'New Emergency Advisory' } });
    fireEvent.change(bodyInput, { target: { value: 'Emergency advisory text details.' } });

    const submitButtons = screen.getAllByRole('button', { name: /Create Announcement/i });
    const modalSubmitBtn = submitButtons[submitButtons.length - 1];
    fireEvent.click(modalSubmitBtn);

    await waitFor(() => {
      expect(controlPlaneApi.createAnnouncement).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'New Emergency Advisory',
          body: 'Emergency advisory text details.',
        }),
      );
    });
  });

  it('opens publish confirmation modal and triggers publish on confirmation', async () => {
    (controlPlaneApi.publishAnnouncement as jest.Mock).mockResolvedValue({
      id: 'ann_2',
      status: 'PUBLISHED',
    });

    render(<CommunicationsPage />);

    await waitFor(() => {
      expect(screen.getByText('Security Patch Release')).toBeInTheDocument();
    });

    const publishButtons = screen.getAllByRole('button', { name: /Publish/i });
    fireEvent.click(publishButtons[0]);

    await waitFor(() => {
      expect(screen.getByText('Confirm Announcement Publication')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Confirm & Publish Now'));

    await waitFor(() => {
      expect(controlPlaneApi.publishAnnouncement).toHaveBeenCalledWith('ann_2');
    });
  });
});
