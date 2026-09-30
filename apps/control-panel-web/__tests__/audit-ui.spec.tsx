import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AuditPage from '../src/app/audit/page';
import { useAuth } from '../src/lib/auth-context';
import { controlPlaneApi, ControlPlaneApiError } from '../src/lib/control-plane-api';
import { AuditLogsResponse } from '../src/types/control-plane';

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
      listAuditLogs: jest.fn(),
      getAuditLog: jest.fn(),
      listOrganizations: jest.fn(),
    },
  };
});

// Mock Next.js router
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  usePathname: () => '/audit',
}));

describe('CP Global Audit Explorer UI Surface', () => {
  const superAdminOperator = {
    id: 'op_admin_1',
    email: 'admin@arav.io',
    fullName: 'Platform Super Admin',
    role: 'PLATFORM_SUPER_ADMIN' as const,
    status: 'ACTIVE' as const,
    mfaEnabled: true,
  };

  const securityAuditOperator = {
    id: 'op_sec_1',
    email: 'sec@arav.io',
    fullName: 'Security Auditor',
    role: 'SECURITY_AUDIT' as const,
    status: 'ACTIVE' as const,
    mfaEnabled: true,
  };

  const commercialOperator = {
    id: 'op_comm_1',
    email: 'comm@arav.io',
    fullName: 'Commercial Operator',
    role: 'COMMERCIAL_OPERATOR' as const,
    status: 'ACTIVE' as const,
    mfaEnabled: true,
  };

  const sampleAuditResponse: AuditLogsResponse = {
    data: [
      {
        id: 'audit-log-100',
        actorId: 'op_admin_1',
        actorRole: 'PLATFORM_SUPER_ADMIN',
        action: 'BREAK_GLASS_ACTION_EXECUTED',
        entityType: 'BreakGlassSession',
        entityId: 'bg-100-test',
        ipAddress: '127.0.0.1',
        correlationId: 'corr-100-bg',
        result: 'SUCCESS',
        metadata: {
          operation: 'EMERGENCY_ORG_SUSPEND',
          password: '[REDACTED]',
          targetOrganizationId: 'org-blkashyap-001',
        },
        createdAt: '2026-09-30T12:00:00.000Z',
      },
    ],
    meta: {
      total: 1,
      page: 1,
      limit: 20,
      totalPages: 1,
      hasNextPage: false,
      hasPreviousPage: false,
    },
  };

  const mockOrgs = [
    { organizationId: 'org-blkashyap-001', state: 'ACTIVE' as const, sequence: '1', reason: 'Active', createdAt: '', updatedAt: '' },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    (useAuth as jest.Mock).mockReturnValue({
      operator: superAdminOperator,
      isAuthenticated: true,
      isLoading: false,
    });

    (controlPlaneApi.listAuditLogs as jest.Mock).mockResolvedValue(sampleAuditResponse);
    (controlPlaneApi.listOrganizations as jest.Mock).mockResolvedValue(mockOrgs as any);
  });

  it('1. renders Audit Explorer page title, scope notice, and audit records table', async () => {
    render(<AuditPage />);

    await waitFor(() => {
      expect(screen.getByText('Audit & Security Explorer')).toBeInTheDocument();
      expect(screen.getByText(/Control Plane Audit Authority Scope/i)).toBeInTheDocument();
      expect(screen.getAllByText('BREAK_GLASS_ACTION_EXECUTED')[0]).toBeInTheDocument();
      expect(screen.getByText('BreakGlassSession')).toBeInTheDocument();
    });
  });

  it('2. permits SECURITY_AUDIT role to access and view audit logs', async () => {
    (useAuth as jest.Mock).mockReturnValue({
      operator: securityAuditOperator,
      isAuthenticated: true,
      isLoading: false,
    });

    render(<AuditPage />);

    await waitFor(() => {
      expect(screen.getByText('Auditor Access (SECURITY_AUDIT)')).toBeInTheDocument();
      expect(screen.getAllByText('BREAK_GLASS_ACTION_EXECUTED')[0]).toBeInTheDocument();
    });
  });

  it('3. blocks unauthorized role COMMERCIAL_OPERATOR with Access Denied screen', async () => {
    (useAuth as jest.Mock).mockReturnValue({
      operator: commercialOperator,
      isAuthenticated: true,
      isLoading: false,
    });

    render(<AuditPage />);

    await waitFor(() => {
      expect(screen.getByText(/Operator Access Restricted/i)).toBeInTheDocument();
      expect(screen.queryAllByText('BREAK_GLASS_ACTION_EXECUTED').length).toBe(0);
    });
  });

  it('4. opens forensic detail modal and renders redacted metadata payload', async () => {
    render(<AuditPage />);

    await waitFor(() => {
      expect(screen.getAllByText('BREAK_GLASS_ACTION_EXECUTED')[0]).toBeInTheDocument();
    });

    const inspectButton = screen.getByRole('button', { name: /Inspect Details/i });
    fireEvent.click(inspectButton);

    await waitFor(() => {
      expect(screen.getByText(/Forensic Audit Log Entry/i)).toBeInTheDocument();
      expect(screen.getByText(/Safe Metadata Payload/i)).toBeInTheDocument();
    });
  });

  it('5. triggers API refetch when filters change', async () => {
    render(<AuditPage />);

    await waitFor(() => {
      expect(screen.getAllByText('BREAK_GLASS_ACTION_EXECUTED')[0]).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText(/Search action, entity ID/i);
    fireEvent.change(searchInput, { target: { value: 'blkashyap' } });

    await waitFor(() => {
      expect(controlPlaneApi.listAuditLogs).toHaveBeenCalledWith(
        expect.objectContaining({
          search: 'blkashyap',
        }),
      );
    });
  });

  it('6. handles API error state gracefully', async () => {
    (controlPlaneApi.listAuditLogs as jest.Mock).mockRejectedValueOnce(
      new ControlPlaneApiError(500, 'Database connection timeout during audit log query'),
    );

    render(<AuditPage />);

    await waitFor(() => {
      expect(screen.getByText('Failed to load Control Plane Audit Explorer')).toBeInTheDocument();
      expect(screen.getByText('Database connection timeout during audit log query')).toBeInTheDocument();
    });
  });
});
