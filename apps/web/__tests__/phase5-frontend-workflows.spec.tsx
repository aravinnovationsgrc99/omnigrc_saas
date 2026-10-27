import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { RiskDrawer } from '../src/components/risks/risk-drawer';
import { RiskListView } from '../src/components/risks/risk-list-view';
import { IncidentListView } from '../src/components/incidents/incident-list-view';
import { VendorListView } from '../src/components/vendors/vendor-list-view';
import { PolicyListView } from '../src/components/policies/policy-list-view';
import { VulnerabilityListView } from '../src/components/vulnerabilities/vulnerability-list-view';
import { Topbar } from '../src/components/layout/topbar';
import { useAuth } from '../src/context/auth-context';
import { useToast } from '../src/context/toast-context';
import { apiRequest } from '../src/lib/api-client';
import {
  Role,
  RiskStatus,
  RiskScoreBand,
  IncidentSeverity,
  IncidentStatus,
  VendorCriticality,
  VendorStatus,
  PolicyStatus,
  VulnerabilitySeverity,
  VulnerabilityStatus,
} from '@omnigrc/shared';

jest.mock('../src/context/auth-context');
jest.mock('../src/context/toast-context');
jest.mock('../src/lib/api-client');

const mockedUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;
const mockedUseToast = useToast as jest.MockedFunction<typeof useToast>;
const mockedApiRequest = apiRequest as jest.MockedFunction<typeof apiRequest>;

describe('Phase 5 Frontend Workflows & Integration Verification', () => {
  const mockShowToast = jest.fn();
  const mockAddToast = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockedUseToast.mockReturnValue({
      showToast: mockShowToast,
      addToast: mockAddToast,
      toasts: [],
      removeToast: jest.fn(),
    } as any);

    mockedUseAuth.mockReturnValue({
      user: { id: 'u-admin-1', email: 'secops@omnigrc.io', role: Role.ADMIN },
      organization: { id: 'org-tenant-1', name: 'OmniGRC Enterprise', isReadOnly: false },
      role: Role.ADMIN,
      token: 'jwt-auth-token',
      login: jest.fn(),
      logout: jest.fn(),
      switchOrganization: jest.fn(),
      hasRole: jest.fn().mockReturnValue(true),
      hasCapability: jest.fn().mockReturnValue(true),
      getCapabilityState: jest.fn().mockReturnValue({ isAvailable: true }),
    } as any);
  });

  // =========================================================================
  // 1. RISK MANAGEMENT: TAXONOMY, RESIDUAL RISK & TREATMENT TRACKING
  // =========================================================================
  describe('1. Risk Management — Taxonomy, Residual Risk & Treatment Lifecycle', () => {
    test('RiskDrawer creates risk with category, residual matrix, and treatment strategy', async () => {
      mockedApiRequest.mockImplementation(async (url: string) => {
        if (url.startsWith('/assets')) return { items: [], total: 0 };
        if (url.startsWith('/frameworks')) return [];
        return {};
      });

      const handleSuccess = jest.fn();
      const handleClose = jest.fn();

      render(
        <RiskDrawer
          risk={null}
          isOpen={true}
          onClose={handleClose}
          onSuccess={handleSuccess}
        />
      );

      // Title & Owner
      fireEvent.change(screen.getByPlaceholderText(/e\.g\. Unencrypted Patient Health Data/i), {
        target: { value: 'API Gateway Credential Leak' },
      });
      fireEvent.change(screen.getByPlaceholderText(/e\.g\. SecOps Team/i), {
        target: { value: 'CloudSec Team' },
      });

      // Category selection via aria-label
      fireEvent.change(screen.getByLabelText('Risk Category'), {
        target: { value: 'Operational' },
      });

      // Inherent Likelihood & Impact via aria-label
      fireEvent.change(screen.getByLabelText('Inherent Likelihood'), {
        target: { value: '4' },
      });
      fireEvent.change(screen.getByLabelText('Inherent Impact'), {
        target: { value: '4' },
      });

      // Residual Likelihood & Impact via aria-label
      fireEvent.change(screen.getByLabelText('Residual Likelihood'), {
        target: { value: '2' },
      });
      fireEvent.change(screen.getByLabelText('Residual Impact'), {
        target: { value: '2' },
      });

      // Treatment strategy and details
      fireEvent.change(screen.getByLabelText('Treatment Strategy'), {
        target: { value: 'TRANSFER' },
      });
      fireEvent.change(screen.getByPlaceholderText(/e\.g\. DevOps Engineer/i), {
        target: { value: 'Lead SRE' },
      });

      // Submit Form
      fireEvent.click(screen.getByRole('button', { name: /Create Risk/i }));

      await waitFor(() => {
        expect(mockedApiRequest).toHaveBeenCalledWith(
          '/risks',
          expect.objectContaining({
            method: 'POST',
            body: expect.stringContaining('"category":"Operational"'),
          })
        );
      });

      const callArgs = mockedApiRequest.mock.calls.find(([url]) => url === '/risks');
      const payload = JSON.parse(callArgs![1]!.body as string);
      expect(payload.title).toBe('API Gateway Credential Leak');
      expect(payload.category).toBe('Operational');
      expect(payload.residualLikelihood).toBe(2);
      expect(payload.residualImpact).toBe(2);
      expect(payload.treatmentStrategy).toBe('TRANSFER');
      expect(payload.treatmentOwner).toBe('Lead SRE');
      expect(handleSuccess).toHaveBeenCalled();
    });

    test('RiskListView renders category badge, residual score badge, and overdue treatment alert', async () => {
      const yesterday = new Date(Date.now() - 86400000).toISOString();
      mockedApiRequest.mockImplementation(async (url: string) => {
        if (url.startsWith('/risks')) {
          return {
            items: [
              {
                id: 'r-1',
                organizationId: 'org-tenant-1',
                title: 'Critical DB Exposure',
                category: 'Information Security',
                likelihood: 5,
                impact: 4,
                score: 20,
                scoreBand: RiskScoreBand.HIGH,
                residualLikelihood: 2,
                residualImpact: 2,
                residualScore: 4,
                residualScoreBand: RiskScoreBand.LOW,
                status: RiskStatus.IN_TREATMENT,
                owner: 'SecOps',
                treatmentPlan: 'Rotate keys and isolate subnet',
                treatmentStrategy: 'MITIGATE',
                treatmentOwner: 'Senior SRE',
                treatmentDueDate: yesterday, // Overdue
                treatmentStatus: 'IN_PROGRESS',
                updatedAt: new Date().toISOString(),
              },
            ],
            total: 1,
          };
        }
        if (url.startsWith('/frameworks')) return [];
        return {};
      });

      render(<RiskListView />);

      await waitFor(() => {
        expect(screen.getByText('Critical DB Exposure')).toBeInTheDocument();
        expect(screen.getAllByText('Information Security').length).toBeGreaterThanOrEqual(1);
        expect(screen.getByText('OVERDUE')).toBeInTheDocument();
        expect(screen.getByText('MITIGATE')).toBeInTheDocument();
      });
    });
  });

  // =========================================================================
  // 2. INCIDENT MANAGEMENT: CLASSIFICATION, RCA, REMEDIATION & APPROVALS
  // =========================================================================
  describe('2. Incident Management — Classification, Root Cause Forensics & Remediation', () => {
    test('IncidentListView renders SLA due date and breaches, and manages RCA and actions', async () => {
      const yesterday = new Date(Date.now() - 86400000).toISOString();
      const mockIncidents = {
        items: [
          {
            id: 'inc-101',
            organizationId: 'org-tenant-1',
            title: 'Data Exfiltration Alert',
            description: 'Abnormal egress traffic on analytics pipeline',
            category: 'Data Breach',
            priority: 'P1',
            severity: IncidentSeverity.CRITICAL,
            status: IncidentStatus.IN_INVESTIGATION,
            owner: 'SecOps Lead',
            businessUnit: 'Engineering',
            detectedAt: new Date().toISOString(),
            dueDate: yesterday, // Overdue SLA
            rootCause: 'Misconfigured S3 Bucket Policy',
            investigationDetails: 'Logs indicate access from unauthorized IP',
          },
        ],
        total: 1,
      };

      mockedApiRequest.mockImplementation(async (url: string) => {
        if (url.startsWith('/incidents?') || url === '/incidents') return mockIncidents;
        if (url === '/incidents/inc-101/actions') return [
          {
            id: 'act-1',
            incidentId: 'inc-101',
            title: 'Revoke AWS IAM Role',
            actionType: 'CORRECTIVE',
            owner: 'CloudSec',
            status: 'OPEN',
            dueDate: new Date().toISOString(),
          },
        ];
        return {};
      });

      render(<IncidentListView />);

      await waitFor(() => {
        expect(screen.getByText('Data Exfiltration Alert')).toBeInTheDocument();
        expect(screen.getByText('SLA BREACH')).toBeInTheDocument();
        expect(screen.getByText('Data Breach')).toBeInTheDocument();
        expect(screen.getByText('P1')).toBeInTheDocument();
      });

      // Click row to open detail drawer
      fireEvent.click(screen.getByText('Data Exfiltration Alert'));

      await waitFor(() => {
        expect(screen.getByText('Root Cause Analysis (RCA)')).toBeInTheDocument();
        expect(screen.getByText('Revoke AWS IAM Role')).toBeInTheDocument();
        expect(screen.getByText('Submit for Closure Approval')).toBeInTheDocument();
      });

      // Submit closure approval
      fireEvent.click(screen.getByText('Submit for Closure Approval'));

      await waitFor(() => {
        expect(mockedApiRequest).toHaveBeenCalledWith(
          '/incidents/inc-101/submit-approval',
          expect.objectContaining({
            method: 'POST',
            body: expect.stringContaining('"purpose":"INCIDENT_CLOSURE"'),
          })
        );
      });
    });
  });

  // =========================================================================
  // 3. VENDOR MANAGEMENT: ASSESSMENTS, ACTIONS & QUESTIONNAIRE REVIEWS
  // =========================================================================
  describe('3. Vendor Management — Assessments, Questionnaire Submissions & Approvals', () => {
    test('VendorListView loads assessments, allows adding actions, and reviews questionnaire responses', async () => {
      const mockVendors = {
        items: [
          {
            id: 'vnd-1',
            name: 'Cloudflare Inc',
            category: 'SaaS Provider',
            criticality: VendorCriticality.HIGH,
            status: VendorStatus.ACTIVE,
            owner: 'Security Team',
            reviewCadenceDays: 365,
            documentCount: 2,
          },
        ],
        total: 1,
      };

      mockedApiRequest.mockImplementation(async (url: string) => {
        if (url.startsWith('/vendors?') || url === '/vendors') return mockVendors;
        if (url === '/vendors/vnd-1') {
          return {
            id: 'vnd-1',
            name: 'Cloudflare Inc',
            assessments: [
              {
                id: 'ass-1',
                title: 'Annual SOC 2 Review',
                score: 88,
                status: 'COMPLETED',
                createdAt: new Date().toISOString(),
              },
            ],
          };
        }
        if (url === '/vendors/vnd-1/questionnaires/submissions') {
          return [
            {
              id: 'sub-1',
              questionnaireTitle: 'Vendor Security Due Diligence',
              questionnaireVersion: '2.0',
              status: 'PENDING_REVIEW',
              submittedAt: new Date().toISOString(),
            },
          ];
        }
        if (url === '/vendors/vnd-1/assessments/ass-1/actions') {
          return [
            { id: 'v-act-1', title: 'Verify TLS 1.3 Cipher Suite', owner: 'NetSec', status: 'OPEN' },
          ];
        }
        return {};
      });

      render(<VendorListView />);

      await waitFor(() => {
        expect(screen.getByText('Cloudflare Inc')).toBeInTheDocument();
      });

      // Open Assessments & Due Diligence modal
      fireEvent.click(screen.getByText('Assessments & Due Diligence'));

      await waitFor(() => {
        expect(screen.getByText(/Vendor Assessment & Due Diligence: Cloudflare Inc/i)).toBeInTheDocument();
        expect(screen.getByText('Annual SOC 2 Review')).toBeInTheDocument();
        expect(screen.getByText('Score: 88%')).toBeInTheDocument();
        expect(screen.getByText('Verify TLS 1.3 Cipher Suite')).toBeInTheDocument();
      });

      // Switch to Questionnaire Submissions tab
      fireEvent.click(screen.getByText(/Questionnaire Submissions/i));

      await waitFor(() => {
        expect(screen.getByText('Vendor Security Due Diligence')).toBeInTheDocument();
        expect(screen.getByText('PENDING_REVIEW')).toBeInTheDocument();
        expect(screen.getByText('Accept & Score 90%')).toBeInTheDocument();
      });

      // Review and accept submission
      fireEvent.click(screen.getByText('Accept & Score 90%'));

      await waitFor(() => {
        expect(mockedApiRequest).toHaveBeenCalledWith(
          '/vendors/vnd-1/questionnaires/submissions/sub-1/review',
          expect.objectContaining({
            method: 'PATCH',
            body: expect.stringContaining('"status":"ACCEPTED"'),
          })
        );
      });
    });
  });

  // =========================================================================
  // 4. POLICY GOVERNANCE: CADENCE, ACKNOWLEDGEMENTS & FORMAL APPROVALS
  // =========================================================================
  describe('4. Policy Governance — Review Cadence, Attestation Rates & Formal Approval', () => {
    test('PolicyListView displays acknowledgement summary compliance rate and submits approval', async () => {
      const mockPolicies = {
        items: [
          {
            id: 'pol-10',
            code: 'POL-SEC-01',
            title: 'Acceptable Use Policy',
            description: 'Employee workstation and network usage terms',
            category: 'Information Security',
            ownerId: 'CISO',
            status: PolicyStatus.PUBLISHED,
            reviewCadenceDays: 365,
            publishedVersion: {
              id: 'v-pub-1',
              versionNumber: '1.0',
              content: '# Acceptable Use Policy Content',
            },
          },
        ],
        total: 1,
      };

      const mockAckSummary = {
        policyId: 'pol-10',
        policyCode: 'POL-SEC-01',
        compliancePercentage: 85,
        totalEligibleUsers: 100,
        attestedUsersCount: 85,
        pendingUsersCount: 15,
      };

      mockedApiRequest.mockImplementation(async (url: string) => {
        if (url.startsWith('/policies?') || url === '/policies') return mockPolicies;
        if (url === '/policies/categories') return [];
        if (url === '/policies/pol-10/acknowledgement-summary') return mockAckSummary;
        return {};
      });

      render(<PolicyListView />);

      await waitFor(() => {
        expect(screen.getByText('Acceptable Use Policy')).toBeInTheDocument();
      });

      // Open policy detail
      fireEvent.click(screen.getByText('View Details & Content'));

      await waitFor(() => {
        expect(screen.getByText('Attestation & Acknowledgement Tracking')).toBeInTheDocument();
        expect(screen.getByText('85%')).toBeInTheDocument();
        expect(screen.getByText('85 users')).toBeInTheDocument();
        expect(screen.getByText('15 users')).toBeInTheDocument();
        expect(screen.getByText('Submit for Formal Approval')).toBeInTheDocument();
      });

      // Submit for formal approval
      fireEvent.click(screen.getByText('Submit for Formal Approval'));

      await waitFor(() => {
        expect(mockedApiRequest).toHaveBeenCalledWith(
          '/policies/pol-10/submit-approval',
          expect.objectContaining({
            method: 'POST',
            body: expect.stringContaining('Formal Approval for Policy: Acceptable Use Policy'),
          })
        );
      });
    });
  });

  // =========================================================================
  // 5. VULNERABILITY MANAGEMENT: SLA TARGETS, OVERDUE BREACHES & AGEING
  // =========================================================================
  describe('5. Vulnerability Management — Remediation SLAs, Ageing Days & Breach Badges', () => {
    test('VulnerabilityListView renders SLA due dates, age in days, and breach indicators', async () => {
      const tenDaysAgo = new Date(Date.now() - 10 * 86400000).toISOString();
      const threeDaysAgo = new Date(Date.now() - 3 * 86400000).toISOString();

      mockedApiRequest.mockImplementation(async (url: string) => {
        if (url.startsWith('/vulnerabilities')) {
          return {
            items: [
              {
                id: 'vuln-1',
                cveId: 'CVE-2026-4421',
                title: 'OpenSSL Memory Leak in TLS Handshake',
                description: 'Buffer overflow triggerable remotely',
                severity: VulnerabilitySeverity.HIGH,
                status: VulnerabilityStatus.OPEN,
                discoveredAt: tenDaysAgo,
                dueDate: threeDaysAgo, // Overdue SLA
                remediationOwner: 'DevOps Lead',
                affectedAssets: [{ assetId: 'ast-1', assetName: 'prod-api-cluster' }],
                evidences: [],
              },
            ],
            total: 1,
          };
        }
        if (url.startsWith('/assets')) return { items: [] };
        if (url.startsWith('/organization-members')) return [];
        if (url.startsWith('/departments')) return [];
        return {};
      });

      render(<VulnerabilityListView />);

      await waitFor(() => {
        expect(screen.getByText('OpenSSL Memory Leak in TLS Handshake')).toBeInTheDocument();
        expect(screen.getByText('SLA BREACH')).toBeInTheDocument();
        expect(screen.getByText(/Age: 10d/i)).toBeInTheDocument();
      });
    });
  });

  // =========================================================================
  // 6. NOTIFICATION BADGES & DESTINATION NAVIGATION ROUTING
  // =========================================================================
  describe('6. Notification Badges & Deep-link Navigation Routing', () => {
    test('Topbar renders notifications and routes to mapped views on click', async () => {
      mockedApiRequest.mockImplementation(async (url: string) => {
        if (url.startsWith('/notifications/unread-count')) {
          return { unreadCount: 2 };
        }
        if (url.startsWith('/notifications')) {
          return {
            items: [
              {
                id: 'notif-1',
                type: 'WEEKLY_DIGEST',
                title: 'Weekly Executive Digest',
                body: '5 open high risks and 2 SLA breaches require action',
                entityType: 'RISK',
                entityId: 'r-10',
                read: false,
                createdAt: new Date().toISOString(),
              },
              {
                id: 'notif-2',
                type: 'RISK_ESCALATION',
                title: 'High Risk Escalated to CISO',
                body: 'Unencrypted S3 bucket escalation',
                entityType: 'INCIDENT',
                entityId: 'inc-20',
                read: false,
                createdAt: new Date().toISOString(),
              },
            ],
            unreadCount: 2,
          };
        }
        return {};
      });

      const handleNavigate = jest.fn();

      render(
        <Topbar
          mobileSidebarOpen={false}
          onToggleMobileSidebar={jest.fn()}
          onNavigateToView={handleNavigate}
        />
      );

      // Open notification dropdown
      const notifButton = screen.getByLabelText('Notifications');
      fireEvent.click(notifButton);

      await waitFor(() => {
        expect(screen.getByText('Weekly Executive Digest')).toBeInTheDocument();
        expect(screen.getByText('High Risk Escalated to CISO')).toBeInTheDocument();
      });

      // Click notification 1 (mapped to 'risk' in resolveEntityView)
      fireEvent.click(screen.getByText('Weekly Executive Digest'));
      expect(handleNavigate).toHaveBeenCalledWith('risk');

      // Click notification 2 (mapped to 'incidents')
      fireEvent.click(notifButton);
      await waitFor(() => {
        expect(screen.getByText('High Risk Escalated to CISO')).toBeInTheDocument();
      });
      fireEvent.click(screen.getByText('High Risk Escalated to CISO'));
      expect(handleNavigate).toHaveBeenCalledWith('incidents');
    });
  });
});
