import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { DirectoryIntegrationSettingsCard } from '../src/components/settings/directory-integration-settings-card';
import { OrganizationHierarchyView } from '../src/components/organization/organization-hierarchy-view';
import { SettingsView } from '../src/components/settings/settings-view';
import { useAuth } from '../src/context/auth-context';
import { useToast } from '../src/context/toast-context';
import { apiRequest, ApiClientError } from '../src/lib/api-client';
import { Role, ProductAccessStatus } from '@omnigrc/shared';

jest.mock('../src/context/auth-context');
jest.mock('../src/context/toast-context');
jest.mock('../src/lib/api-client', () => {
  const actual = jest.requireActual('../src/lib/api-client');
  return {
    ...actual,
    apiRequest: jest.fn(),
  };
});

const mockedUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;
const mockedUseToast = useToast as jest.MockedFunction<typeof useToast>;
const mockedApiRequest = apiRequest as jest.MockedFunction<typeof apiRequest>;

describe('Organization Settings Loading Experience & Directory Config Resiliency', () => {
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
      user: { id: 'usr-admin-1', email: 'admin@meridianhealth.in', role: Role.ADMIN },
      organization: { id: 'org-1', name: 'Meridian Health Pvt. Ltd.', isReadOnly: false },
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

  describe('DirectoryIntegrationSettingsCard Graceful Handling', () => {
    it('should gracefully handle unconfigured state (null config) without error toast', async () => {
      mockedApiRequest.mockResolvedValueOnce(null);

      render(<DirectoryIntegrationSettingsCard />);

      await waitFor(() => {
        expect(screen.getByText('Not Configured')).toBeInTheDocument();
      });

      expect(mockAddToast).not.toHaveBeenCalled();
      expect(screen.getByText('Microsoft Entra ID / Active Directory Integration')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('e.g. 00000000-0000-0000-0000-000000000000')).toBeInTheDocument();
    });

    it('should gracefully handle 404 "Cannot GET /directory/config" without error toast', async () => {
      const error404 = new ApiClientError('Cannot GET /directory/config', 404);
      mockedApiRequest.mockRejectedValueOnce(error404);

      render(<DirectoryIntegrationSettingsCard />);

      await waitFor(() => {
        expect(screen.getByText('Not Configured')).toBeInTheDocument();
      });

      // Crucial: No error toast should pop up for 404 / unconfigured endpoint
      expect(mockAddToast).not.toHaveBeenCalled();
      expect(screen.getByText('Microsoft Entra ID / Active Directory Integration')).toBeInTheDocument();
    });

    it('should display error toast on unexpected server errors (500)', async () => {
      const error500 = new ApiClientError('Internal Server Error', 500);
      mockedApiRequest.mockRejectedValueOnce(error500);

      render(<DirectoryIntegrationSettingsCard />);

      await waitFor(() => {
        expect(mockAddToast).toHaveBeenCalledWith('Internal Server Error', 'error');
      });
    });
  });

  describe('OrganizationHierarchyView Independent Loading & Error Recovery', () => {
    it('should display department, project, and member counts correctly from database responses', async () => {
      mockedApiRequest.mockImplementation((endpoint: string) => {
        if (endpoint === '/departments') {
          return Promise.resolve([
            { id: 'dept-1', name: 'Clinical IT', code: 'CIT', description: 'Clinical systems' },
            { id: 'dept-2', name: 'Information Security', code: 'INFOSEC', description: 'Security ops' },
          ]);
        }
        if (endpoint === '/projects') {
          return Promise.resolve([
            { id: 'proj-1', name: 'EHR Migration', code: 'EHR-MIG', departmentId: 'dept-1' },
          ]);
        }
        if (endpoint === '/organization-members') {
          return Promise.resolve([
            {
              id: 'mem-1',
              userId: 'u-1',
              role: Role.ADMIN,
              status: ProductAccessStatus.ACTIVE,
              name: 'Dr. Priya Nair',
              email: 'priya@meridianhealth.in',
              user: { id: 'u-1', email: 'priya@meridianhealth.in' },
              departments: [],
              projects: [],
              grantedAt: new Date().toISOString(),
            },
          ]);
        }
        return Promise.reject(new Error(`Unknown endpoint ${endpoint}`));
      });

      render(<OrganizationHierarchyView />);

      await waitFor(() => {
        expect(screen.getByText('Departments (2)')).toBeInTheDocument();
        expect(screen.getByText('Projects (1)')).toBeInTheDocument();
        expect(screen.getByText('Members & Selective Access (1)')).toBeInTheDocument();
      });

      expect(screen.getByText('Clinical IT')).toBeInTheDocument();
      expect(screen.getByText('Information Security')).toBeInTheDocument();
    });

    it('should display meaningful error state when hierarchy endpoints fail, allowing retry', async () => {
      mockedApiRequest.mockRejectedValueOnce(new ApiClientError('Failed to fetch hierarchy', 500));

      render(<OrganizationHierarchyView />);

      await waitFor(() => {
        expect(screen.getByText('Failed to fetch hierarchy')).toBeInTheDocument();
      });

      expect(screen.getByRole('button', { name: /Retry/i })).toBeInTheDocument();
    });
  });

  describe('SettingsView Independent Section Error Isolation', () => {
    it('should render organization profile and commercial entitlements when details succeed', async () => {
      mockedApiRequest.mockImplementation((endpoint: string) => {
        if (endpoint === '/organization-members/details') {
          return Promise.resolve({
            id: 'org-1',
            name: 'Meridian Health Pvt. Ltd.',
            type: 'ENTERPRISE',
            primaryRegion: 'INDIA',
            primaryFramework: 'ISO_27001',
            industry: 'Tertiary Healthcare',
            description: 'Integrated multi-speciality healthcare network',
            businessActivities: 'Inpatient and outpatient healthcare services',
            registeredAddress: 'Plot 42, Healthcare City, Cyberabad, Hyderabad',
            contactEmail: 'compliance@meridianhealth.in',
            contactPhone: '+91 40 4567 8900',
            licenseState: 'ACTIVE',
            activeMemberCount: 12,
            departmentCount: 4,
            projectCount: 6,
            entitlements: [
              {
                id: 'ent-1',
                frameworkId: 'fw-iso',
                frameworkCode: 'ISO_27001',
                frameworkName: 'ISO/IEC 27001:2022 Information Security',
                status: 'ACTIVE',
                source: 'ARAV_CONTROL_PLANE',
              },
            ],
          });
        }
        if (endpoint === '/regional-pods') return Promise.resolve([]);
        if (endpoint === '/integrations/slack') return Promise.resolve({ configured: false, webhookUrl: null });
        if (endpoint === '/departments') return Promise.resolve([]);
        if (endpoint === '/projects') return Promise.resolve([]);
        if (endpoint === '/organization-members') return Promise.resolve([]);
        if (endpoint === '/directory/config') return Promise.resolve(null);
        if (endpoint === '/policy-categories') return Promise.resolve([]);
        if (endpoint === '/organization-invitations') return Promise.resolve([]);
        return Promise.resolve({});
      });

      render(<SettingsView />);

      await waitFor(() => {
        expect(screen.getByText('Meridian Health Pvt. Ltd.')).toBeInTheDocument();
      });

      expect(screen.getByText('Tertiary Healthcare')).toBeInTheDocument();
      expect(screen.getByText('ISO/IEC 27001:2022 Information Security')).toBeInTheDocument();
      expect(screen.getByText('12 Users · 4 Depts')).toBeInTheDocument();
    });

    it('should display error states on profile and entitlements when details fail, without indefinite skeleton', async () => {
      mockedApiRequest.mockImplementation((endpoint: string) => {
        if (endpoint === '/organization-members/details') {
          return Promise.reject(new ApiClientError('Failed to load organization details', 503));
        }
        return Promise.resolve([]);
      });

      render(<SettingsView />);

      await waitFor(() => {
        const errorMessages = screen.getAllByText('Failed to load organization details');
        expect(errorMessages.length).toBeGreaterThan(0);
      });

      // Verify retry button exists
      const retryButtons = screen.getAllByRole('button', { name: /Retry/i });
      expect(retryButtons.length).toBeGreaterThan(0);
    });
  });
});
