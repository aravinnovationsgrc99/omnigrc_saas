import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { VendorListView } from '../src/components/vendors/vendor-list-view';
import { useAuth } from '../src/context/auth-context';
import { useToast } from '../src/context/toast-context';
import { apiRequest } from '../src/lib/api-client';
import { Role, VendorCriticality, VendorStatus } from '@omnigrc/shared';

jest.mock('../src/context/auth-context');
jest.mock('../src/context/toast-context');
jest.mock('../src/lib/api-client');

const mockedUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;
const mockedUseToast = useToast as jest.MockedFunction<typeof useToast>;
const mockedApiRequest = apiRequest as jest.MockedFunction<typeof apiRequest>;

describe('Stage 2 TPRM Lifecycle UI Verification', () => {
  const mockAddToast = jest.fn();

  const mockVendors = [
    {
      id: 'ven-snowflake-1',
      name: 'Snowflake Computing',
      category: 'Cloud Data Warehouse',
      criticality: VendorCriticality.CRITICAL,
      status: VendorStatus.ACTIVE,
      owner: 'Data Engineering Lead',
      reviewCadenceDays: 180,
      documentCount: 3,
      dueDiligenceStatus: 'ACTIVE_MONITORING',
      inherentRiskScore: 82,
      inherentRiskTier: 'CRITICAL',
      controlEffectivenessScore: 85,
      residualRiskScore: 33,
      residualRiskTier: 'MEDIUM',
      tprmData: {
        lifecycleStage: 'ACTIVE_MONITORING',
        remediationActions: [
          { id: 'act-1', title: 'Rotate API Master Keys', owner: 'DevOps', status: 'OPEN' },
        ],
        documents: [
          {
            id: 'doc-1',
            fileName: 'snowflake_soc2.pdf',
            documentType: 'SOC 2 Type II',
            verificationStatus: 'VERIFIED',
            expirationDate: new Date(Date.now() + 1000 * 3600 * 24 * 15).toISOString(), // expiring in 15d
          },
        ],
      },
      assessments: [{ id: 'ass-1', title: 'Annual TPRM Audit', score: 88, status: 'COMPLETED' }],
    },
    {
      id: 'ven-datadog-2',
      name: 'Datadog Observability',
      category: 'APM & Logging',
      criticality: VendorCriticality.HIGH,
      status: VendorStatus.UNDER_REVIEW,
      owner: 'SecOps Lead',
      reviewCadenceDays: 365,
      documentCount: 1,
      dueDiligenceStatus: 'DUE_DILIGENCE',
      inherentRiskScore: 68,
      inherentRiskTier: 'HIGH',
      tprmData: {
        lifecycleStage: 'DUE_DILIGENCE',
        remediationActions: [],
        documents: [],
      },
      assessments: [],
    },
    {
      id: 'ven-legacy-offboarded',
      name: 'Legacy File Transfer Service',
      category: 'FTP Hosting',
      criticality: VendorCriticality.LOW,
      status: VendorStatus.INACTIVE,
      owner: 'IT Ops',
      reviewCadenceDays: 730,
      documentCount: 0,
      dueDiligenceStatus: 'DECOMMISSIONED',
      inherentRiskScore: 20,
      inherentRiskTier: 'LOW',
      tprmData: {
        lifecycleStage: 'DECOMMISSIONED',
        remediationActions: [],
        documents: [],
      },
      assessments: [],
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    mockedUseToast.mockReturnValue({
      addToast: mockAddToast,
      showToast: mockAddToast,
      toasts: [],
      removeToast: jest.fn(),
    } as any);

    mockedUseAuth.mockReturnValue({
      user: { id: 'u-1', email: 'ciso@meridian.com', role: Role.ADMIN },
      organization: { id: 'org-1', name: 'Meridian Health' },
      role: Role.ADMIN,
      token: 'jwt-token',
      login: jest.fn(),
      logout: jest.fn(),
      switchOrganization: jest.fn(),
      hasRole: jest.fn().mockReturnValue(true),
      hasCapability: jest.fn().mockReturnValue(true),
      getCapabilityState: jest.fn().mockReturnValue({ isAvailable: true }),
    } as any);

    mockedApiRequest.mockImplementation(async (url: string) => {
      if (url === '/vendors' || url.startsWith('/vendors?')) {
        return { items: mockVendors, total: 3 };
      }
      if (url.includes('/documents')) {
        return { items: [], total: 0 };
      }
      if (url.includes('/questionnaires/submissions')) {
        return [];
      }
      if (url.includes('/assessments')) {
        return [];
      }
      if (url.startsWith('/vendors/ven-snowflake-1')) {
        return mockVendors[0];
      }
      return {};
    });
  });

  it('renders TPRM Dashboard KPI metrics header with portfolio counts', async () => {
    render(<VendorListView />);

    await waitFor(() => {
      expect(screen.getByText('Total Portfolio')).toBeInTheDocument();
      expect(screen.getByText('Critical Tier')).toBeInTheDocument();
      expect(screen.getAllByText(/Due Diligence/i).length).toBeGreaterThan(0);
      expect(screen.getByText('Open Findings')).toBeInTheDocument();
      expect(screen.getByText('Expiring Docs')).toBeInTheDocument();
      expect(screen.getByText('Decommissioned')).toBeInTheDocument();
    });

    // Verify vendors in table
    expect(screen.getByText('Snowflake Computing')).toBeInTheDocument();
    expect(screen.getByText('Datadog Observability')).toBeInTheDocument();
    expect(screen.getByText('Legacy File Transfer Service')).toBeInTheDocument();
  });

  it('filters table by lifecycle stage tabs', async () => {
    render(<VendorListView />);

    await waitFor(() => {
      expect(screen.getByText('Snowflake Computing')).toBeInTheDocument();
    });

    // Click "Due Diligence" lifecycle filter button
    const ddFilterBtn = screen.getByRole('button', { name: /Due Diligence 1/i });
    fireEvent.click(ddFilterBtn);

    // Only Datadog should appear
    expect(screen.getByText('Datadog Observability')).toBeInTheDocument();
    expect(screen.queryByText('Legacy File Transfer Service')).not.toBeInTheDocument();
  });

  it('opens TPRM Workspace modal on clicking workspace button', async () => {
    render(<VendorListView />);

    await waitFor(() => {
      expect(screen.getByText('Snowflake Computing')).toBeInTheDocument();
    });

    const workspaceButtons = screen.getAllByRole('button', { name: /TPRM Workspace/i });
    fireEvent.click(workspaceButtons[0]);

    await waitFor(() => {
      expect(screen.getByText('Enterprise Third-Party Risk Management (TPRM) Lifecycle Workspace')).toBeInTheDocument();
      expect(screen.getByText('1. Overview & Intake')).toBeInTheDocument();
      expect(screen.getByText('2. Inherent Risk')).toBeInTheDocument();
      expect(screen.getByText('3. Due Diligence')).toBeInTheDocument();
      expect(screen.getByText('5. Risk Evaluation')).toBeInTheDocument();
      expect(screen.getByText('7. Approval & Monitoring')).toBeInTheDocument();
      expect(screen.getByText('8. Offboarding')).toBeInTheDocument();
    });
  });

  it('renders Inherent Risk 7-factor model in TPRM Workspace', async () => {
    render(<VendorListView />);

    await waitFor(() => {
      expect(screen.getByText('Snowflake Computing')).toBeInTheDocument();
    });

    const workspaceButtons = screen.getAllByRole('button', { name: /TPRM Workspace/i });
    fireEvent.click(workspaceButtons[0]);

    // Navigate to Inherent Risk tab
    const inherentTabBtn = screen.getByRole('button', { name: /2\. Inherent Risk/i });
    fireEvent.click(inherentTabBtn);

    await waitFor(() => {
      expect(screen.getByText('Objective 7-Factor Inherent Risk Model')).toBeInTheDocument();
      expect(screen.getByText(/1\. Data Sensitivity \(Weight: 20%\)/i)).toBeInTheDocument();
      expect(screen.getByText(/2\. System Access Level \(Weight: 20%\)/i)).toBeInTheDocument();
      expect(screen.getByText(/3\. Business Criticality \(Weight: 20%\)/i)).toBeInTheDocument();
      expect(screen.getByText(/Record Inherent Risk & Derive Tier/i)).toBeInTheDocument();
    });
  });

  it('renders Offboarding decommissioning checklist and prevents submission until all items are checked', async () => {
    render(<VendorListView />);

    await waitFor(() => {
      expect(screen.getByText('Snowflake Computing')).toBeInTheDocument();
    });

    const workspaceButtons = screen.getAllByRole('button', { name: /TPRM Workspace/i });
    fireEvent.click(workspaceButtons[0]);

    // Navigate to Offboarding tab
    const offboardingTabBtn = screen.getByRole('button', { name: /8\. Offboarding/i });
    fireEvent.click(offboardingTabBtn);

    await waitFor(() => {
      expect(screen.getByText(/Formal Vendor Offboarding & Decommissioning Checklist/i)).toBeInTheDocument();
      expect(screen.getByText(/1\. Access Revoked \(Mandatory\)/i)).toBeInTheDocument();
      expect(screen.getByText(/2\. Data Destruction \/ Return Certified \(Mandatory\)/i)).toBeInTheDocument();
      expect(screen.getByText(/3\. Contract Terminated & Financial Settlement \(Mandatory\)/i)).toBeInTheDocument();
      expect(screen.getByText(/4\. Audit Trail & Records Archived \(Mandatory\)/i)).toBeInTheDocument();
    });

    const decommissionBtn = screen.getByRole('button', { name: /Complete Formal Decommissioning/i });
    expect(decommissionBtn).toBeDisabled();

    // Check all 4 checklist checkboxes
    const checkboxes = screen.getAllByRole('checkbox');
    checkboxes.forEach((cb) => fireEvent.click(cb));

    // Decommission button should now be enabled
    expect(decommissionBtn).not.toBeDisabled();
  });
});
