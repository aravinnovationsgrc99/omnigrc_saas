import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import OperatorsPage from '../src/app/operators/page';
import { useAuth } from '../src/lib/auth-context';
import { controlPlaneApi, ControlPlaneApiError } from '../src/lib/control-plane-api';
import { OperatorProfile } from '../src/types/control-plane';

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
      listOperators: jest.fn(),
      getOperator: jest.fn(),
      createOperator: jest.fn(),
      updateOperatorRole: jest.fn(),
      suspendOperator: jest.fn(),
      reactivateOperator: jest.fn(),
      revokeOperatorSessions: jest.fn(),
    },
  };
});

// Mock Next.js router
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  usePathname: () => '/operators',
}));

describe('Control Panel Operator Administration UI', () => {
  const superAdminOperator = {
    id: 'op_super_1',
    email: 'anuragdharmik07@gmail.com',
    fullName: 'Anurag Dharmik',
    role: 'PLATFORM_SUPER_ADMIN' as const,
    status: 'ACTIVE' as const,
    mfaEnabled: true,
  };

  const sampleOperators: OperatorProfile[] = [
    {
      id: 'op_super_1',
      email: 'anuragdharmik07@gmail.com',
      fullName: 'Anurag Dharmik',
      role: 'PLATFORM_SUPER_ADMIN',
      status: 'ACTIVE',
      mfaEnabled: true,
      createdAt: '2026-09-28T10:00:00Z',
    },
    {
      id: 'op_ops_2',
      email: 'ops@arav.io',
      fullName: 'Ops Engineer',
      role: 'OPERATIONS_ENGINEER',
      status: 'ACTIVE',
      mfaEnabled: false,
      createdAt: '2026-09-28T11:00:00Z',
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    (useAuth as jest.Mock).mockReturnValue({
      operator: superAdminOperator,
      isAuthenticated: true,
      isLoading: false,
    });
    (controlPlaneApi.listOperators as jest.Mock).mockResolvedValue(sampleOperators);
  });

  it('renders list of operators for authorized administrator', async () => {
    render(<OperatorsPage />);

    await waitFor(() => {
      expect(screen.getByText('Control Plane Operators')).toBeInTheDocument();
      expect(screen.getByText('anuragdharmik07@gmail.com')).toBeInTheDocument();
      expect(screen.getByText('ops@arav.io')).toBeInTheDocument();
    });
  });

  it('allows administrator to submit Add Operator modal', async () => {
    const createdOp: OperatorProfile = {
      id: 'op_new_3',
      email: 'newadmin@arav.io',
      fullName: 'New Admin',
      role: 'OPERATIONS_ENGINEER',
      status: 'ACTIVE',
      mfaEnabled: false,
      createdAt: '2026-09-29T10:00:00Z',
    };
    (controlPlaneApi.createOperator as jest.Mock).mockResolvedValue(createdOp);

    render(<OperatorsPage />);

    await waitFor(() => {
      expect(screen.getByText('Control Plane Operators')).toBeInTheDocument();
    });

    const addBtn = screen.getByRole('button', { name: /Add Operator/i });
    fireEvent.click(addBtn);

    expect(screen.getByText('Add New Control Plane Operator')).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('operator@omnigrc.co'), {
      target: { value: 'newadmin@arav.io' },
    });
    fireEvent.change(screen.getByPlaceholderText('First & Last Name'), {
      target: { value: 'New Admin' },
    });
    fireEvent.change(screen.getByPlaceholderText('••••••••••••'), {
      target: { value: 'SecurePassword2026!' },
    });

    const submitBtn = screen.getByRole('button', { name: /Create Operator/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(controlPlaneApi.createOperator).toHaveBeenCalledWith({
        email: 'newadmin@arav.io',
        fullName: 'New Admin',
        password: 'SecurePassword2026!',
        role: 'OPERATIONS_ENGINEER',
      });
    });
  });

  it('enforces anti-self-escalation policy (self change role disabled)', async () => {
    render(<OperatorsPage />);

    await waitFor(() => {
      expect(screen.getByText('anuragdharmik07@gmail.com')).toBeInTheDocument();
    });

    // The button for self change role should be disabled
    const selfChangeRoleBtn = screen.getByTitle('You cannot modify your own role');
    expect(selfChangeRoleBtn).toBeDisabled();
  });
});
