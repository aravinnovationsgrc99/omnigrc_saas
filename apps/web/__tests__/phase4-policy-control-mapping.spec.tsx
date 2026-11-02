import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { PolicyListView } from '../src/components/policies/policy-list-view';
import { ControlDetailView } from '../src/components/controls/control-detail-view';
import { useAuth } from '../src/context/auth-context';
import { useToast } from '../src/context/toast-context';
import { apiRequest } from '../src/lib/api-client';
import {
  Role,
  PolicyStatus,
  MappingStatus,
  PolicyDto,
  PolicyControlAssociationDto,
  ControlPolicyAssociationDto,
} from '@omnigrc/shared';

jest.mock('../src/context/auth-context');
jest.mock('../src/context/toast-context');
jest.mock('../src/lib/api-client');
jest.mock('../src/components/workflow/workflow-lifecycle-panel', () => ({
  WorkflowLifecyclePanel: () => <div data-testid="mock-workflow-lifecycle-panel" />,
}));
jest.mock('../src/components/controls/control-testing-section', () => ({
  ControlTestingSection: () => <div data-testid="mock-control-testing-section" />,
}));

const mockedUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;
const mockedUseToast = useToast as jest.MockedFunction<typeof useToast>;
const mockedApiRequest = apiRequest as jest.MockedFunction<typeof apiRequest>;

describe('Phase 4: Policy & Control Mapping Workflows', () => {
  const mockAddToast = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockedUseToast.mockReturnValue({
      addToast: mockAddToast,
      showToast: mockAddToast,
      toasts: [],
      removeToast: jest.fn(),
    } as any);

    mockedUseAuth.mockReturnValue({
      user: { id: 'u-1', email: 'ciso@omnigrc.internal', role: Role.ADMIN },
      organization: { id: 'org-tenant-1', name: 'SecureCorp', isReadOnly: false },
      role: Role.ADMIN,
      token: 'mock-jwt-token',
      login: jest.fn(),
      logout: jest.fn(),
      switchOrganization: jest.fn(),
      hasRole: jest.fn().mockReturnValue(true),
      hasCapability: jest.fn().mockReturnValue(true),
      getCapabilityState: jest.fn().mockReturnValue({ isAvailable: true }),
    } as any);
  });

  const mockPolicies: PolicyDto[] = [
    {
      id: 'pol-101',
      organizationId: 'org-tenant-1',
      code: 'POL-SEC-001',
      title: 'Information Security Policy',
      description: 'Comprehensive cybersecurity controls and mandatory rules',
      category: 'Information Security',
      status: PolicyStatus.UNDER_REVIEW,
      ownerId: 'CISO',
      reviewCadenceDays: 365,
      version: 2,
      mappedControlCount: 3,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'pol-102',
      organizationId: 'org-tenant-1',
      code: 'POL-DAT-002',
      title: 'Data Retention and Privacy Standard',
      description: 'GDPR and CCPA data storage guidelines',
      category: 'Data Privacy',
      status: PolicyStatus.PUBLISHED,
      ownerId: 'DPO',
      reviewCadenceDays: 180,
      version: 1,
      mappedControlCount: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];

  const mockMappedControls: PolicyControlAssociationDto[] = [
    {
      id: 'pc-1',
      controlId: 'ctrl-201',
      controlName: 'AC-2 Account Management',
      controlDescription: 'User account lifecycle management',
      controlCategory: 'Access Control',
      status: MappingStatus.APPROVED,
      rationale: 'Mandatory access control governance',
      version: 1,
      frameworkMappings: [
        {
          frameworkName: 'NIST SP 800-53',
          frameworkCode: 'NIST-800-53',
          clauseCode: 'AC-2',
          clauseTitle: 'Account Management',
        },
      ],
      createdAt: new Date().toISOString(),
    },
  ];

  describe('PolicyListView — Phase 4 Enhancements', () => {
    beforeEach(() => {
      mockedApiRequest.mockImplementation((endpoint: string, options?: any) => {
        if (endpoint.startsWith('/policies/categories')) {
          return Promise.resolve([
            { id: '1', name: 'Information Security', isDefault: true, policyCount: 1 },
          ]);
        }
        if (endpoint.startsWith('/policies/pol-101/acknowledgement-summary')) {
          return Promise.resolve({ compliancePercentage: 85, attestedUsersCount: 17 });
        }
        if (endpoint.startsWith('/policy-controls/policies/pol-101/controls')) {
          return Promise.resolve({
            items: mockMappedControls,
            total: 1,
            page: 1,
            limit: 50,
          });
        }
        if (endpoint.startsWith('/policies')) {
          return Promise.resolve({
            items: mockPolicies,
            total: 2,
            page: 1,
            limit: 20,
          });
        }
        if (endpoint.startsWith('/controls')) {
          return Promise.resolve([
            { id: 'ctrl-202', name: 'IA-2 Identification and Authentication', category: 'Access Control' },
          ]);
        }
        return Promise.resolve({ items: [] });
      });
    });

    test('1. Renders policy list with mapped control counts and search filtering', async () => {
      render(<PolicyListView />);

      await waitFor(() => {
        expect(screen.getByText('POL-SEC-001')).toBeInTheDocument();
        expect(screen.getByText('POL-DAT-002')).toBeInTheDocument();
      });

      // Verify mapped control count badges
      expect(screen.getByText(/3 Mapped Controls/i)).toBeInTheDocument();
      expect(screen.getByText(/1 Mapped Control/i)).toBeInTheDocument();

      // Test Search Filtering
      const searchInput = screen.getByPlaceholderText(/Search code, title, desc/i);
      fireEvent.change(searchInput, { target: { value: 'POL-DAT' } });

      await waitFor(() => {
        expect(screen.queryByText('POL-SEC-001')).not.toBeInTheDocument();
        expect(screen.getByText('POL-DAT-002')).toBeInTheDocument();
      });
    });

    test('2. Allows Rejecting an UNDER_REVIEW policy with rationale', async () => {
      render(<PolicyListView />);

      await waitFor(() => {
        expect(screen.getByText('POL-SEC-001')).toBeInTheDocument();
      });

      // Click Reject button for UNDER_REVIEW policy
      const rejectButtons = screen.getAllByRole('button', { name: /^Reject$/i });
      expect(rejectButtons.length).toBeGreaterThan(0);
      fireEvent.click(rejectButtons[0]);

      // Verify Rejection modal opens
      await waitFor(() => {
        expect(screen.getByText('Reject Policy Review')).toBeInTheDocument();
      });

      const reasonInput = screen.getByPlaceholderText(/Needs clarification on section/i);
      fireEvent.change(reasonInput, {
        target: { value: 'Missing password complexity requirements in section 3.1.' },
      });

      const confirmButton = screen.getByRole('button', { name: /Confirm Rejection/i });
      fireEvent.click(confirmButton);

      await waitFor(() => {
        expect(mockedApiRequest).toHaveBeenCalledWith(
          '/policies/pol-101/reject',
          expect.objectContaining({
            method: 'POST',
            body: JSON.stringify({
              reason: 'Missing password complexity requirements in section 3.1.',
              expectedVersion: 2,
            }),
          }),
        );
        expect(mockAddToast).toHaveBeenCalledWith(
          'Policy review rejected and returned to Draft.',
          'success',
        );
      });
    });

    test('3. Policy details modal loads mapped controls and framework tags', async () => {
      render(<PolicyListView />);

      await waitFor(() => {
        expect(screen.getByText('POL-SEC-001')).toBeInTheDocument();
      });

      // Open Policy details
      const viewButtons = screen.getAllByRole('button', { name: /View Details & Content/i });
      fireEvent.click(viewButtons[0]);

      await waitFor(() => {
        expect(screen.getByText(/Mapped Controls & Framework Coverage \(1\)/i)).toBeInTheDocument();
        expect(screen.getByText('AC-2 Account Management')).toBeInTheDocument();
        expect(screen.getByText(/NIST SP 800-53 \(AC-2\)/i)).toBeInTheDocument();
      });

      // Disassociate / Unmap
      const unmapButtons = screen.getAllByTitle('Remove mapping');
      expect(unmapButtons.length).toBeGreaterThan(0);
      fireEvent.click(unmapButtons[0]);

      await waitFor(() => {
        expect(mockedApiRequest).toHaveBeenCalledWith(
          '/policy-controls/policies/pol-101/controls/ctrl-201?expectedVersion=1',
          expect.objectContaining({ method: 'DELETE' }),
        );
      });
    });
  });

  describe('ControlDetailView — Phase 4 Policy Mapping', () => {
    const mockControl = {
      id: 'ctrl-201',
      organizationId: 'org-tenant-1',
      name: 'AC-2 Account Management',
      description: 'Manage lifecycle of system accounts',
      category: 'Access Control',
      mitigationType: 'PREVENTATIVE',
      status: 'IMPLEMENTED',
      frameworkMappings: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const mockControlPolicyAssocs: ControlPolicyAssociationDto[] = [
      {
        id: 'cp-1',
        policyId: 'pol-101',
        policyCode: 'POL-SEC-001',
        policyTitle: 'Information Security Policy',
        policyCategory: 'Information Security',
        policyStatus: PolicyStatus.PUBLISHED,
        policyOwnerId: 'CISO',
        publishedVersionNumber: '1.0',
        status: MappingStatus.APPROVED,
        rationale: 'Governs account creation and review workflow',
        version: 1,
        createdAt: new Date().toISOString(),
      },
    ];

    beforeEach(() => {
      mockedApiRequest.mockImplementation((endpoint: string, options?: any) => {
        if (endpoint === '/controls/ctrl-201') {
          return Promise.resolve(mockControl);
        }
        if (endpoint.startsWith('/policy-controls/controls/ctrl-201/policies')) {
          return Promise.resolve({
            items: mockControlPolicyAssocs,
            total: 1,
            page: 1,
            limit: 50,
          });
        }
        if (endpoint.startsWith('/policies')) {
          return Promise.resolve({
            items: mockPolicies,
            total: 2,
            page: 1,
            limit: 100,
          });
        }
        if (endpoint.startsWith('/controls/ctrl-201/risks')) {
          return Promise.resolve({ items: [] });
        }
        if (endpoint.startsWith('/controls/ctrl-201/evidence')) {
          return Promise.resolve({ items: [] });
        }
        if (endpoint.startsWith('/frameworks')) {
          return Promise.resolve([]);
        }
        return Promise.resolve([]);
      });
    });

    test('4. Displays mapped policies and allows unmapping from control view', async () => {
      render(<ControlDetailView controlId="ctrl-201" onBack={jest.fn()} />);

      await waitFor(() => {
        expect(screen.getByText('Mapped Policies & Procedures')).toBeInTheDocument();
        expect(screen.getByText('Information Security Policy')).toBeInTheDocument();
        expect(screen.getByText('POL-SEC-001')).toBeInTheDocument();
        expect(screen.getByText(/Governs account creation and review workflow/i)).toBeInTheDocument();
      });

      // Unmap policy
      const unmapBtn = screen.getByRole('button', { name: /Unmap/i });
      fireEvent.click(unmapBtn);

      await waitFor(() => {
        expect(mockedApiRequest).toHaveBeenCalledWith(
          '/policy-controls/policies/pol-101/controls/ctrl-201?expectedVersion=1',
          expect.objectContaining({ method: 'DELETE' }),
        );
      });
    });
  });
});
