import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { PolicyGovernanceWidget } from '../src/components/dashboard/widgets/policy-governance-widget';
import { PolicyListView } from '../src/components/policies/policy-list-view';
import { useAuth } from '../src/context/auth-context';
import { useToast } from '../src/context/toast-context';
import { apiRequest } from '../src/lib/api-client';
import { PolicyMetricsDto, PolicyDto, PolicyStatus, MappingStatus, Role } from '@omnigrc/shared';

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

beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: jest.fn().mockImplementation((query) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: jest.fn(),
      removeListener: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn(),
    })),
  });
});

describe('Policy Visibility & Supabase Reconciliation Verification', () => {
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
      user: { id: '00000000-0000-0000-0000-000000000002', email: 'admin@meridian.com', role: Role.ADMIN },
      organization: { id: '00000000-0000-0000-0000-000000000001', name: 'Meridian Health Pvt. Ltd.', isReadOnly: false },
      role: Role.ADMIN,
      token: 'jwt-token-meridian',
      login: jest.fn(),
      logout: jest.fn(),
      switchOrganization: jest.fn(),
      hasRole: jest.fn().mockReturnValue(true),
      hasCapability: jest.fn().mockReturnValue(true),
      getCapabilityState: jest.fn().mockReturnValue({ isAvailable: true }),
    } as any);
  });

  const demoPolicyMetrics: PolicyMetricsDto = {
    total: 8,
    byStatus: {
      PUBLISHED: 4,
      APPROVED: 1,
      UNDER_REVIEW: 1,
      DRAFT: 1,
      RETIRED: 1,
    },
    publishedCount: 4,
    overdueReviewCount: 1,
    pendingExceptionsCount: 1,
    isAvailable: true,
  };

  const demoPolicies: PolicyDto[] = [
    {
      id: 'p0000000-0000-0000-0000-000000000001',
      organizationId: '00000000-0000-0000-0000-000000000001',
      code: 'POL-SEC-001',
      title: 'Enterprise Information Security Policy',
      description: 'Foundational security directives establishing safeguards.',
      category: 'Information Security',
      status: PolicyStatus.PUBLISHED,
      ownerId: '00000000-0000-0000-0000-000000000002',
      reviewCadenceDays: 365,
      version: 2,
      mappedControlCount: 3,
      publishedVersion: { id: 'pv-1', policyId: 'p0000000-0000-0000-0000-000000000001', versionNumber: '2.0.0', content: '', createdById: 'u1', createdAt: '' },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'p0000000-0000-0000-0000-000000000002',
      organizationId: '00000000-0000-0000-0000-000000000001',
      code: 'POL-IAM-001',
      title: 'Identity & Access Management (IAM) Policy',
      description: 'Governs RBAC and credentials.',
      category: 'Access Control',
      status: PolicyStatus.PUBLISHED,
      ownerId: '00000000-0000-0000-0000-000000000002',
      reviewCadenceDays: 365,
      version: 1,
      mappedControlCount: 1,
      publishedVersion: { id: 'pv-2', policyId: 'p0000000-0000-0000-0000-000000000002', versionNumber: '1.0.0', content: '', createdById: 'u1', createdAt: '' },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'p0000000-0000-0000-0000-000000000004',
      organizationId: '00000000-0000-0000-0000-000000000001',
      code: 'POL-IR-001',
      title: 'Cyber Incident Response Policy',
      description: 'Playbooks and breach notification protocols.',
      category: 'Incident Response',
      status: PolicyStatus.APPROVED,
      ownerId: '00000000-0000-0000-0000-000000000004',
      reviewCadenceDays: 365,
      version: 1,
      mappedControlCount: 2,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];

  describe('PolicyGovernanceWidget', () => {
    it('renders policy lifecycle breakdown, 50% published, overdue count, and pending exceptions', () => {
      const handleNavigate = jest.fn();
      render(<PolicyGovernanceWidget metrics={demoPolicyMetrics} onNavigateToView={handleNavigate} />);

      expect(screen.getByText('Policy Governance')).toBeInTheDocument();
      expect(screen.getByText('Document lifecycle & cadence compliance')).toBeInTheDocument();
      expect(screen.getByText('50% Published')).toBeInTheDocument();
      expect(screen.getByText('Lifecycle Status Breakdown')).toBeInTheDocument();
      expect(screen.getByText('Published')).toBeInTheDocument();
      expect(screen.getByText('Under Review')).toBeInTheDocument();
      expect(screen.getByText('Approved')).toBeInTheDocument();
      expect(screen.getByText('Draft')).toBeInTheDocument();
      expect(screen.getByText('Retired')).toBeInTheDocument();

      // Overdue & Pending Exceptions
      expect(screen.getByText('Overdue Review')).toBeInTheDocument();
      expect(screen.getByText('Exceptions')).toBeInTheDocument();

      // Navigation button click
      const navBtn = screen.getByTitle('Open Policy Management');
      fireEvent.click(navBtn);
      expect(handleNavigate).toHaveBeenCalledWith('policies');
    });

    it('renders ModuleNotLicensedCard when capability is disabled', () => {
      const unlicensedMetrics: PolicyMetricsDto = {
        ...demoPolicyMetrics,
        isAvailable: false,
      };
      render(<PolicyGovernanceWidget metrics={unlicensedMetrics} />);

      expect(screen.getByText('Policy Governance')).toBeInTheDocument();
      expect(screen.getByText('Corporate policy lifecycles')).toBeInTheDocument();
      expect(screen.getByText(/Unlicensed/i)).toBeInTheDocument();
      expect(screen.getByText('Commercial Capability Unavailable')).toBeInTheDocument();
    });
  });

  describe('PolicyListView', () => {
    it('fetches and renders policies from API', async () => {
      mockedApiRequest.mockImplementation((url: string) => {
        if (url.includes('/policies/categories')) {
          return Promise.resolve([
            { id: '1', name: 'Information Security', isDefault: true, policyCount: 1 },
            { id: '2', name: 'Access Control', isDefault: true, policyCount: 1 },
          ]);
        }
        if (url.startsWith('/policies')) {
          return Promise.resolve({
            items: demoPolicies,
            total: 3,
            page: 1,
            limit: 20,
          });
        }
        return Promise.resolve({});
      });

      render(<PolicyListView />);

      await waitFor(() => {
        expect(screen.getByText('Enterprise Information Security Policy')).toBeInTheDocument();
        expect(screen.getByText('Identity & Access Management (IAM) Policy')).toBeInTheDocument();
        expect(screen.getByText('Cyber Incident Response Policy')).toBeInTheDocument();
      });

      expect(screen.getByText('POL-SEC-001')).toBeInTheDocument();
      expect(screen.getByText('POL-IAM-001')).toBeInTheDocument();
      expect(screen.getByText('POL-IR-001')).toBeInTheDocument();
    });

    it('filters policies by status when filter buttons are clicked', async () => {
      mockedApiRequest.mockImplementation((url: string) => {
        if (url.includes('/policies/categories')) return Promise.resolve([]);
        if (url.includes('status=PUBLISHED')) {
          return Promise.resolve({
            items: demoPolicies.filter((p) => p.status === PolicyStatus.PUBLISHED),
            total: 2,
            page: 1,
            limit: 20,
          });
        }
        return Promise.resolve({ items: demoPolicies, total: 3, page: 1, limit: 20 });
      });

      render(<PolicyListView />);

      await waitFor(() => {
        expect(screen.getByText('Enterprise Information Security Policy')).toBeInTheDocument();
      });

      // Click Published filter tab
      const publishedTab = screen.getByRole('button', { name: /^Published/i });
      fireEvent.click(publishedTab);

      await waitFor(() => {
        expect(mockedApiRequest).toHaveBeenCalledWith(expect.stringContaining('status=PUBLISHED'));
      });
    });
  });
});
