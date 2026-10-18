import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { AuditListView } from '../src/components/audits/audit-list-view';
import { apiRequest } from '../src/lib/api-client';
import {
  AuditPlanStatus,
  AuditAssessmentStatus,
  AuditCheckResult,
  FindingStatus,
  CapaStatus,
  VulnerabilitySeverity,
  formatOwnerDisplay,
} from '@omnigrc/shared';

jest.mock('../src/lib/api-client');
const mockAddToast = jest.fn();
const mockShowToast = jest.fn();
jest.mock('../src/context/toast-context', () => ({
  useToast: () => ({ showToast: mockShowToast, addToast: mockAddToast }),
}));

// Mock ComplianceScopeFilter to avoid external dependencies in this test
jest.mock('../src/components/ui/compliance-scope-filter', () => ({
  ComplianceScopeFilter: ({ selectedFrameworkId, onFrameworkChange }: any) => (
    <div data-testid="compliance-scope-filter">
      <span>Framework Filter: {selectedFrameworkId || 'All'}</span>
      <button onClick={() => onFrameworkChange?.('fw-iso-27001')}>Filter ISO</button>
    </div>
  ),
}));

const mockedApiRequest = apiRequest as jest.MockedFunction<typeof apiRequest>;

describe('Phase 2 — Audit Management Workspace and Workflow', () => {
  const mockPlanWithUnspecifiedFramework = {
    id: 'plan-unspecified-1',
    organizationId: 'org-test',
    title: 'Q1 Unspecified Baseline Review',
    description: 'Preliminary review without framework baseline',
    frameworkCode: 'UNSPECIFIED',
    frameworkId: null,
    frameworkVersionId: null,
    businessScope: 'Finance IT Systems',
    status: AuditPlanStatus.DRAFT,
    ownerId: '00000000-0000-0000-0000-000000000001',
    ownerName: null,
    ownerEmail: null,
    ownerRole: null,
    departmentId: null,
    teamName: null,
    assessments: [],
    scopeExclusions: 'Cloud infrastructure',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const mockFindings = [
    {
      id: 'f-1',
      planId: 'plan-soc2-complete',
      assessmentId: 'asm-soc2-1',
      title: 'Stale SSH keys found on bastion host',
      description: 'Two developer SSH keys were not revoked following project offboarding',
      severity: VulnerabilitySeverity.MEDIUM,
      status: FindingStatus.IN_REMEDIATION,
      remediationPlan: 'Revoke stale keys and enforce 90-day rotation via ansible',
      ownerId: 'u-owner-123',
      ownerName: 'Sarah Jenkins',
      ownerEmail: 'sarah.jenkins@company.test',
      capas: [
        {
          id: 'capa-1',
          findingId: 'f-1',
          title: 'Revoke and audit developer SSH keys',
          correctiveAction: 'Revoke and audit all ~/.ssh/authorized_keys entries',
          action: 'Revoke and audit all ~/.ssh/authorized_keys entries',
          preventiveAction: 'Configure automated SSH key provisioning pipeline',
          ownerId: 'u-devops-789',
          ownerName: 'DevOps Lead',
          ownerEmail: 'devops@company.test',
          status: CapaStatus.IN_PROGRESS,
          dueDate: new Date('2026-02-01T00:00:00Z').toISOString(),
        },
      ],
      evidence: [],
      createdAt: new Date('2026-01-13T11:00:00Z').toISOString(),
      updatedAt: new Date('2026-01-14T09:00:00Z').toISOString(),
    },
  ];

  const mockPlanWithFullDetails = {
    id: 'plan-soc2-complete',
    organizationId: 'org-test',
    title: 'SOC 2 Type II Annual Audit',
    objective: 'Comprehensive annual SOC 2 compliance verification',
    description: 'Comprehensive annual SOC 2 compliance verification',
    frameworkCode: 'SOC2',
    frameworkId: 'fw-soc2-id',
    frameworkVersionId: 'ver-2024-id',
    scope: 'Core SaaS Platform & DevOps',
    businessScope: 'Core SaaS Platform & DevOps',
    status: AuditPlanStatus.IN_PROGRESS,
    ownerId: 'u-owner-123',
    ownerName: 'Sarah Jenkins',
    ownerEmail: 'sarah.jenkins@company.test',
    ownerRole: 'Head of Compliance',
    departmentId: 'dept-sec-1',
    teamName: 'Security & Governance',
    scopeExclusions: 'Legacy CRM staging',
    createdAt: new Date('2026-01-10T10:00:00Z').toISOString(),
    updatedAt: new Date('2026-01-15T12:00:00Z').toISOString(),
    assessments: [
      {
        id: 'asm-soc2-1',
        title: 'Access Control & Key Management Review',
        scopeDescription: 'IAM policies and secret rotation',
        auditorId: 'u-auditor-456',
        auditorName: 'Marcus Vance',
        auditorEmail: 'marcus.vance@company.test',
        status: AuditAssessmentStatus.COMPLETED,
        score: 100,
        checkItems: [
          {
            id: 'chk-1',
            referenceId: 'CC6.1',
            title: 'MFA Enforcement on all administrative consoles',
            result: AuditCheckResult.COMPLIANT,
            notes: 'Verified via Okta system logs',
          },
          {
            id: 'chk-2',
            referenceId: 'CC6.2',
            title: 'Quarterly privilege access reviews performed',
            result: AuditCheckResult.COMPLIANT,
            notes: 'Q4 review records verified',
          },
        ],
        findings: mockFindings,
        evidence: [
          {
            id: 'ev-1',
            fileName: 'Okta_MFA_Enforcement_Report.pdf',
            fileSize: 1048576,
            fileType: 'application/pdf',
            uploadedById: 'u-auditor-456',
            createdAt: new Date('2026-01-12T14:30:00Z').toISOString(),
          },
        ],
      },
    ],
  };

  const mockHistoryEntries = [
    {
      id: 'hist-1',
      entityType: 'AuditPlan',
      entityId: 'plan-soc2-complete',
      action: 'AUDIT_PLAN_CREATED',
      actorId: 'u-owner-123',
      actorName: 'Sarah Jenkins',
      actorRole: 'Head of Compliance',
      createdAt: new Date('2026-01-10T10:00:00Z').toISOString(),
    },
    {
      id: 'hist-2',
      entityType: 'AuditAssessment',
      entityId: 'asm-soc2-1',
      action: 'ASSESSMENT_COMPLETED',
      actorId: 'u-auditor-456',
      actorName: 'Marcus Vance',
      actorRole: 'Senior Auditor',
      createdAt: new Date('2026-01-12T16:00:00Z').toISOString(),
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    mockedApiRequest.mockImplementation((endpoint: string, options?: any) => {
      if (endpoint === '/business-audits/plans') {
        return Promise.resolve({
          items: [mockPlanWithUnspecifiedFramework, mockPlanWithFullDetails],
          total: 2,
          page: 1,
          limit: 10,
        });
      }
      if (endpoint === '/business-audits/plans/plan-soc2-complete') {
        return Promise.resolve(mockPlanWithFullDetails);
      }
      if (endpoint === '/business-audits/plans/plan-soc2-complete/history') {
        return Promise.resolve(mockHistoryEntries);
      }
      if (endpoint === '/business-audits/plans/plan-unspecified-1') {
        return Promise.resolve(mockPlanWithUnspecifiedFramework);
      }
      if (endpoint === '/business-audits/plans/plan-unspecified-1/history') {
        return Promise.resolve([]);
      }
      if (endpoint === '/business-audits/findings') {
        return Promise.resolve({
          items: mockFindings,
          total: 1,
          page: 1,
          limit: 10,
        });
      }
      if (endpoint === '/organization-members') {
        return Promise.resolve([
          { user: { id: 'u-owner-123', firstName: 'Sarah', lastName: 'Jenkins', email: 'sarah.jenkins@company.test' }, role: 'Head of Compliance' },
          { user: { id: 'u-auditor-456', firstName: 'Marcus', lastName: 'Vance', email: 'marcus.vance@company.test' }, role: 'Senior Auditor' },
        ]);
      }
      if (endpoint === '/departments') {
        return Promise.resolve([
          { id: 'dept-sec-1', name: 'Security & Governance' },
        ]);
      }
      if (endpoint === '/frameworks') {
        return Promise.resolve([
          { id: 'fw-soc2-id', code: 'SOC2', name: 'SOC 2 Trust Services Criteria' },
        ]);
      }
      if (endpoint.startsWith('/business-audits/capas/')) {
        return Promise.resolve({
          id: 'capa-1',
          findingId: 'f-1',
          status: CapaStatus.COMPLETED,
          completedAt: new Date().toISOString(),
        });
      }
      return Promise.resolve({});
    });
  });

  describe('1. User-Facing Renaming & Section Identity', () => {
    it('renders "Audit Management" heading and subtitle instead of "Business Audit Management"', async () => {
      render(<AuditListView />);

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /audit management/i })).toBeInTheDocument();
      });

      // Verify old name is not present in headings
      expect(screen.queryByRole('heading', { name: /business audit management/i })).not.toBeInTheDocument();

      // Verify clear subtitle explaining complete audit management workflow
      expect(
        screen.getByText(/authoritative framework audit plans/i)
      ).toBeInTheDocument();
    });
  });

  describe('2. Truthful Compliance Status Semantics', () => {
    it('does NOT display "Conformant" for plan with UNSPECIFIED framework and no assessments', async () => {
      render(<AuditListView />);

      await waitFor(() => {
        expect(screen.getByText('Q1 Unspecified Baseline Review')).toBeInTheDocument();
      });

      // The card for unspecified baseline should show truthful "Not Assessed" badge
      const unspecifiedHeading = screen.getByText('Q1 Unspecified Baseline Review');
      const unspecifiedCard = unspecifiedHeading.closest('[role="button"]') || unspecifiedHeading.parentElement;
      expect(unspecifiedCard).toBeInTheDocument();
      expect(screen.getByText('Not Assessed')).toBeInTheDocument();
      // Unspecified card must not contain "Conformant"
      expect(unspecifiedCard).not.toHaveTextContent('Conformant');
    });

    it('correctly resolves formatOwnerDisplay with name, team, and fallback', () => {
      // User with name and team combines both gracefully
      expect(
        formatOwnerDisplay({
          ownerId: 'u-1',
          ownerName: 'Sarah Jenkins',
          teamName: 'Security & Governance',
        })
      ).toBe('Sarah Jenkins (Security & Governance)');

      // Team only
      expect(
        formatOwnerDisplay({
          ownerId: null,
          teamName: 'DevOps Operations',
        })
      ).toBe('DevOps Operations');

      // Raw UUID with no mapping falls back gracefully to "Unassigned"
      expect(
        formatOwnerDisplay({
          ownerId: '00000000-0000-0000-0000-000000000001',
          fallback: 'Unassigned',
        })
      ).toBe('Unassigned');
    });
  });

  describe('3. Ownership Resolution on Audit Cards', () => {
    it('displays human-readable owner name and team name on audit cards', async () => {
      render(<AuditListView />);

      await waitFor(() => {
        expect(screen.getByText('SOC 2 Type II Annual Audit')).toBeInTheDocument();
      });

      // Verified owner name with team label should be visible
      expect(screen.getByText(/Sarah Jenkins \(Security & Governance\)/)).toBeInTheDocument();

      // Assigned team row should be visible
      expect(screen.getByText('Assigned Team:')).toBeInTheDocument();

      // Unassigned fallback on the unmapped plan
      expect(screen.getByText('Unassigned')).toBeInTheDocument();
    });
  });

  describe('4. Complete Audit Details and Management Workspace', () => {
    it('opens full workspace on plan click and renders all 6 tabs with authoritative data', async () => {
      render(<AuditListView />);

      await waitFor(() => {
        expect(screen.getByText('SOC 2 Type II Annual Audit')).toBeInTheDocument();
      });

      // Click on the SOC 2 audit plan card to open workspace
      const manageButtons = screen.getAllByRole('button', { name: /manage audit workspace/i });
      fireEvent.click(manageButtons[1]);

      // Expect workspace header to show plan title and active tab navigation
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /back to audits/i })).toBeInTheDocument();
      });

      // Verify all 6 tabs exist
      expect(screen.getByRole('button', { name: /overview & scope/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /execution runs/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /findings/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /capa actions/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /evidence/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /completion & history/i })).toBeInTheDocument();

      // TAB A: Overview details
      expect(screen.getByText(/Core SaaS Platform & DevOps/)).toBeInTheDocument();
      expect(screen.getByText(/Head of Compliance/)).toBeInTheDocument();
      expect(screen.getByText(/Next Recommended Workflow Action/i)).toBeInTheDocument();

      // TAB B: Execution Runs & Checklists
      fireEvent.click(screen.getByRole('button', { name: /execution runs/i }));
      await waitFor(() => {
        expect(screen.getByText('Access Control & Key Management Review')).toBeInTheDocument();
      });
      expect(screen.getByText('Marcus Vance')).toBeInTheDocument();
      expect(screen.getByText('MFA Enforcement on all administrative consoles')).toBeInTheDocument();
      expect(screen.getByText('100%')).toBeInTheDocument();

      // TAB C: Audit Findings
      fireEvent.click(screen.getByRole('button', { name: /findings/i }));
      await waitFor(() => {
        expect(screen.getByText('Stale SSH keys found on bastion host')).toBeInTheDocument();
      });
      expect(screen.getByText(/two developer ssh keys were not revoked/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /verify & close/i })).toBeInTheDocument();

      // TAB D: CAPA Actions
      fireEvent.click(screen.getByRole('button', { name: /capa actions/i }));
      await waitFor(() => {
        expect(screen.getByText('Revoke and audit all ~/.ssh/authorized_keys entries')).toBeInTheDocument();
      });
      expect(screen.getByText('DevOps Lead')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /mark completed/i })).toBeInTheDocument();

      // TAB E: Evidence Vault
      fireEvent.click(screen.getByRole('button', { name: /evidence/i }));
      await waitFor(() => {
        expect(screen.getByText('Okta_MFA_Enforcement_Report.pdf')).toBeInTheDocument();
      });
      expect(screen.getByRole('button', { name: /attach evidence/i })).toBeInTheDocument();

      // TAB F: Completion & History
      fireEvent.click(screen.getByRole('button', { name: /completion & history/i }));
      await waitFor(() => {
        expect(screen.getByText(/Audit Completion & Formal Sign-Off Readiness/i)).toBeInTheDocument();
      });

      // Verify prerequisites display:
      // Since finding 'f-1' is still IN_REMEDIATION, finding prerequisite should fail and show blockers
      expect(screen.getAllByText(/remain open or in remediation/i).length).toBeGreaterThan(0);
      expect(screen.getByText(/Completion Blocked/i)).toBeInTheDocument();

      // Verify immutable audit history entries
      expect(screen.getByText('AUDIT_PLAN_CREATED')).toBeInTheDocument();
      expect(screen.getByText('ASSESSMENT_COMPLETED')).toBeInTheDocument();
    });

    it('navigates back to audit list from workspace', async () => {
      render(<AuditListView />);

      await waitFor(() => {
        expect(screen.getByText('SOC 2 Type II Annual Audit')).toBeInTheDocument();
      });

      // Click to open workspace
      const manageButtons = screen.getAllByRole('button', { name: /manage audit workspace/i });
      fireEvent.click(manageButtons[1]);
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /back to audits/i })).toBeInTheDocument();
      });

      // Click back
      fireEvent.click(screen.getByRole('button', { name: /back to audits/i }));
      await waitFor(() => {
        expect(screen.getByRole('combobox', { name: /filter by audit status/i })).toBeInTheDocument();
      });
    });
  });

  describe('5. Finding & CAPA Lifecycle Action Triggers', () => {
    it('calls API to complete CAPA and promotes finding toward verification', async () => {
      render(<AuditListView />);

      await waitFor(() => {
        expect(screen.getByText('SOC 2 Type II Annual Audit')).toBeInTheDocument();
      });

      const manageButtons = screen.getAllByRole('button', { name: /manage audit workspace/i });
      fireEvent.click(manageButtons[1]);
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /capa actions/i })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /capa actions/i }));
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /mark completed/i })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /mark completed/i }));

      await waitFor(() => {
        expect(mockedApiRequest).toHaveBeenCalledWith(
          '/business-audits/capas/capa-1',
          expect.objectContaining({
            method: 'PATCH',
            body: JSON.stringify({ status: CapaStatus.COMPLETED }),
          })
        );
      });
    });
  });
});
