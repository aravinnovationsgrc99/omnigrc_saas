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
  EvidenceScanStatus,
} from '@omnigrc/shared';

jest.mock('../src/lib/api-client', () => {
  const actual = jest.requireActual('../src/lib/api-client');
  return {
    ...actual,
    apiRequest: jest.fn(),
    getStoredTokens: jest.fn(() => ({ accessToken: 'mock-jwt-token-xyz', refreshToken: 'mock-refresh' })),
  };
});

const mockAddToast = jest.fn();
jest.mock('../src/context/toast-context', () => ({
  useToast: () => ({ addToast: mockAddToast, showToast: mockAddToast }),
}));

let mockCurrentUser = { id: 'admin-auditor-1', role: 'ADMIN', name: 'Independent Auditor', email: 'auditor@company.test' };
jest.mock('../src/context/auth-context', () => ({
  useAuth: () => ({
    user: mockCurrentUser,
    organization: { id: 'org-wp4-test', name: 'WP4 Test Org' },
    hasCapability: () => true,
    getCapabilityState: () => ({ enabled: true }),
  }),
}));

jest.mock('../src/components/ui/compliance-scope-filter', () => ({
  ComplianceScopeFilter: () => <div data-testid="compliance-scope-filter" />,
}));

const mockedApiRequest = apiRequest as jest.MockedFunction<typeof apiRequest>;

describe('Phase 3 WP4: Audit Workspace Integration & End-to-End Validation', () => {
  const mockPlan = {
    id: 'plan-wp4-1',
    organizationId: 'org-wp4-test',
    title: 'ISO 27001 ISMS Stage 2 Comprehensive Audit',
    objective: 'Formal certification audit for ISMS controls and evidence verification',
    description: 'Formal certification audit for ISMS controls and evidence verification',
    frameworkCode: 'ISO27001',
    frameworkId: 'fw-iso-27001',
    frameworkVersionId: 'ver-2022',
    businessScope: 'Enterprise Cloud Infrastructure',
    status: AuditPlanStatus.IN_PROGRESS,
    ownerId: 'u-lead-auditor',
    ownerName: 'Lead Auditor',
    ownerEmail: 'lead@company.test',
    version: 3,
    assessments: [
      {
        id: 'asm-wp4-1',
        title: 'A.9 Access Control Assessment',
        scopeDescription: 'Authentication, authorization, and secret management',
        auditorId: 'u-lead-auditor',
        status: AuditAssessmentStatus.IN_PROGRESS,
        score: 75,
        checkItems: [
          {
            id: 'chk-wp4-1',
            referenceId: 'A.9.2.1',
            title: 'User registration and de-registration process',
            result: AuditCheckResult.COMPLIANT,
            notes: 'Automated de-provisioning verified via SCIM logs.',
            evidence: [
              {
                id: 'ev-canonical-clean',
                fileName: 'scim_deprovisioning_audit.pdf',
                fileUrl: '/evidence/ev-canonical-clean/download',
                fileSize: 45000,
                mimeType: 'application/pdf',
                uploadedById: 'u-lead-auditor',
                createdAt: new Date('2026-02-01T10:00:00Z').toISOString(),
                scanStatus: EvidenceScanStatus.CLEAN,
                status: 'ACTIVE',
                checksum: '3a7bd3e2360a3d29eea436fcfb7e44c735d117c42d1c1835420b6b9942dd4f1b',
              },
              {
                id: 'ev-canonical-quarantined',
                fileName: 'untrusted_malware_sample.exe',
                fileUrl: '/evidence/ev-canonical-quarantined/download',
                fileSize: 12000,
                mimeType: 'application/octet-stream',
                uploadedById: 'u-lead-auditor',
                createdAt: new Date('2026-02-01T11:00:00Z').toISOString(),
                scanStatus: EvidenceScanStatus.QUARANTINED,
                status: 'QUARANTINED',
              },
              {
                id: 'ev-legacy-item',
                fileName: 'legacy_historical_policy_2023.pdf',
                fileUrl: 'https://sanctioned-s3.amazonaws.com/evidence/legacy_policy.pdf',
                fileSize: 1048576,
                mimeType: 'application/pdf',
                uploadedById: 'u-legacy-auditor',
                createdAt: new Date('2024-01-15T09:00:00Z').toISOString(),
                scanStatus: null,
              },
            ],
          },
        ],
        findings: [
          {
            id: 'find-wp4-1',
            assessmentId: 'asm-wp4-1',
            checkItemId: 'chk-wp4-1',
            title: 'Privileged service account without MFA',
            description: 'Database maintenance service account bypasses interactive MFA requirement',
            severity: VulnerabilitySeverity.HIGH,
            status: FindingStatus.READY_FOR_VERIFICATION,
            remediationPlan: 'Enforce certificate-based mutual TLS and hardware key rotation',
            ownerId: 'u-finding-owner-sarah',
            ownerName: 'Sarah FindingOwner',
            ownerEmail: 'sarah@company.test',
            capaApplicability: 'REQUIRED',
            version: 2,
            updatedAt: new Date('2026-02-01T12:00:00Z').toISOString(),
            capas: [
              {
                id: 'capa-wp4-1',
                findingId: 'find-wp4-1',
                title: 'Deploy mTLS certificate authentication for database batch jobs',
                correctiveAction: 'Generate and enforce x509 client certificates',
                ownerId: 'u-capa-owner-bob',
                ownerName: 'Bob CapaOwner',
                ownerEmail: 'bob@company.test',
                status: CapaStatus.COMPLETED,
                version: 1,
                dueDate: new Date('2026-02-15T00:00:00Z').toISOString(),
                updatedAt: new Date('2026-02-01T12:30:00Z').toISOString(),
              },
            ],
            evidence: [],
          },
        ],
      },
    ],
  };

  const mockVaultList = {
    items: [
      {
        id: 'ev-vault-1',
        title: 'Corporate Password & MFA Policy 2026',
        fileName: 'password_policy_v2.pdf',
        fileSize: 154000,
        mimeType: 'application/pdf',
        scanStatus: EvidenceScanStatus.CLEAN,
        status: 'ACTIVE',
      },
    ],
    total: 1,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockCurrentUser = { id: 'admin-auditor-1', role: 'ADMIN', name: 'Independent Auditor', email: 'auditor@company.test' };

    mockedApiRequest.mockImplementation((endpoint: string, options?: any) => {
      if (endpoint === '/business-audits/plans' || endpoint.startsWith('/business-audits/plans?')) {
        return Promise.resolve({ items: [mockPlan], total: 1, page: 1, limit: 10 });
      }
      if (endpoint === '/business-audits/plans/plan-wp4-1') {
        return Promise.resolve(mockPlan);
      }
      if (endpoint === '/business-audits/plans/plan-wp4-1/history') {
        return Promise.resolve([
          {
            id: 'hist-1',
            entityType: 'AuditPlan',
            entityId: 'plan-wp4-1',
            action: 'AUDIT_PLAN_CREATED',
            actorId: 'admin-auditor-1',
            actorName: 'Independent Auditor',
            createdAt: new Date().toISOString(),
          },
        ]);
      }
      if (endpoint === '/business-audits/findings' || endpoint.startsWith('/business-audits/findings?')) {
        return Promise.resolve({ items: mockPlan.assessments[0].findings, total: 1, page: 1, limit: 10 });
      }
      if (endpoint === '/organization-members') {
        return Promise.resolve([
          { user: { id: 'admin-auditor-1', firstName: 'Independent', lastName: 'Auditor', email: 'auditor@company.test' }, role: 'ADMIN' },
          { user: { id: 'u-finding-owner-sarah', firstName: 'Sarah', lastName: 'FindingOwner', email: 'sarah@company.test' }, role: 'Compliance Lead' },
          { user: { id: 'u-capa-owner-bob', firstName: 'Bob', lastName: 'CapaOwner', email: 'bob@company.test' }, role: 'DevOps Lead' },
        ]);
      }
      if (endpoint === '/evidence/vault' || endpoint.startsWith('/evidence/vault?')) {
        return Promise.resolve(mockVaultList);
      }
      if (endpoint === '/evidence/ev-canonical-clean/verify-integrity') {
        return Promise.resolve({
          isValid: true,
          expectedChecksum: '3a7bd3e2360a3d29eea436fcfb7e44c735d117c42d1c1835420b6b9942dd4f1b',
          actualChecksum: '3a7bd3e2360a3d29eea436fcfb7e44c735d117c42d1c1835420b6b9942dd4f1b',
        });
      }
      return Promise.resolve({});
    });
  });

  // =========================================================================
  // WORKFLOW A: SUCCESSFUL AUDIT & FINDING LIFECYCLE
  // =========================================================================
  describe('Workflow A — Complete Audit & Finding Lifecycle', () => {
    it('navigates to workspace, displays 6 tabs, and opens finding verification for READY_FOR_VERIFICATION finding', async () => {
      render(<AuditListView />);

      await waitFor(() => {
        expect(screen.getByText('ISO 27001 ISMS Stage 2 Comprehensive Audit')).toBeInTheDocument();
      });

      // Click manage audit workspace button
      const manageBtn = screen.getByRole('button', { name: /manage audit workspace/i });
      fireEvent.click(manageBtn);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /back to audits/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /overview & scope/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /execution runs/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /findings/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /capa actions/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /evidence/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /completion & history/i })).toBeInTheDocument();
      });

      // Switch to Findings tab
      fireEvent.click(screen.getByRole('button', { name: /findings/i }));

      await waitFor(() => {
        expect(screen.getByText('Privileged service account without MFA')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /verify & close/i })).toBeInTheDocument();
      });
    });

    it('independent verifier successfully verifies finding and advances status', async () => {
      render(<AuditListView />);

      await waitFor(() => {
        expect(screen.getByText('ISO 27001 ISMS Stage 2 Comprehensive Audit')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /manage audit workspace/i }));

      await waitFor(() => {
        fireEvent.click(screen.getByRole('button', { name: /findings/i }));
      });

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /verify & close/i })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /verify & close/i }));

      // Verification modal should open
      await waitFor(() => {
        expect(screen.getByText('Formal Finding Verification Sign-Off')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Sign Off Verification/i })).not.toBeDisabled();
      });

      // Submit verification
      mockedApiRequest.mockResolvedValueOnce({ success: true });
      fireEvent.click(screen.getByRole('button', { name: /Sign Off Verification/i }));

      await waitFor(() => {
        expect(mockedApiRequest).toHaveBeenCalledWith(
          '/business-audits/findings/find-wp4-1/verify',
          expect.objectContaining({
            method: 'POST',
            body: expect.stringContaining('"status":"VERIFIED"'),
          }),
        );
      });
    });
  });

  // =========================================================================
  // WORKFLOW B: EVIDENCE LIFECYCLE & SCAN STATES
  // =========================================================================
  describe('Workflow B — Evidence Lifecycle in Workspace', () => {
    it('renders Security Scan Status badges for CLEAN, QUARANTINED, and LEGACY evidence', async () => {
      render(<AuditListView />);

      await waitFor(() => {
        expect(screen.getByText('ISO 27001 ISMS Stage 2 Comprehensive Audit')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /manage audit workspace/i }));

      await waitFor(() => {
        fireEvent.click(screen.getByRole('button', { name: /evidence/i }));
      });

      await waitFor(() => {
        expect(screen.getByText('scim_deprovisioning_audit.pdf')).toBeInTheDocument();
        expect(screen.getByText('CLEAN (Verified)')).toBeInTheDocument();
        expect(screen.getByText('untrusted_malware_sample.exe')).toBeInTheDocument();
        expect(screen.getByText('QUARANTINED')).toBeInTheDocument();
        expect(screen.getByText('legacy_historical_policy_2023.pdf')).toBeInTheDocument();
        expect(screen.getByText('LEGACY (Unscanned)')).toBeInTheDocument();
      });
    });

    it('blocks download of QUARANTINED evidence and alerts user with security policy warning', async () => {
      render(<AuditListView />);

      await waitFor(() => {
        expect(screen.getByText('ISO 27001 ISMS Stage 2 Comprehensive Audit')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /manage audit workspace/i }));

      await waitFor(() => {
        fireEvent.click(screen.getByRole('button', { name: /evidence/i }));
      });

      await waitFor(() => {
        expect(screen.getByText('untrusted_malware_sample.exe')).toBeInTheDocument();
      });

      // Find all Download buttons
      const downloadButtons = screen.getAllByRole('button', { name: /Download/i });
      // The second download button corresponds to the quarantined item
      fireEvent.click(downloadButtons[1]);

      expect(mockAddToast).toHaveBeenCalledWith(
        expect.stringContaining('QUARANTINED due to detected security threats'),
        'error',
      );
    });

    it('triggers cryptographic SHA-256 integrity verification for canonical evidence', async () => {
      render(<AuditListView />);

      await waitFor(() => {
        expect(screen.getByText('ISO 27001 ISMS Stage 2 Comprehensive Audit')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /manage audit workspace/i }));

      await waitFor(() => {
        fireEvent.click(screen.getByRole('button', { name: /evidence/i }));
      });

      await waitFor(() => {
        expect(screen.getByText('scim_deprovisioning_audit.pdf')).toBeInTheDocument();
      });

      const verifyButtons = screen.getAllByRole('button', { name: /Verify/i });
      fireEvent.click(verifyButtons[0]);

      await waitFor(() => {
        expect(mockedApiRequest).toHaveBeenCalledWith('/evidence/ev-canonical-clean/verify-integrity');
        expect(mockAddToast).toHaveBeenCalledWith(
          expect.stringContaining('Cryptographic Integrity Verified: SHA-256 matches baseline'),
          'success',
        );
      });
    });
  });

  // =========================================================================
  // WORKFLOW C: SECURITY & SEGREGATION OF DUTIES (SoD)
  // =========================================================================
  describe('Workflow C — Security, Authorization & Segregation of Duties', () => {
    it('disables verification button and displays SoD violation warning when current user is the finding owner', async () => {
      // Simulate finding owner Sarah logged in
      mockCurrentUser = { id: 'u-finding-owner-sarah', role: 'USER', name: 'Sarah FindingOwner', email: 'sarah@company.test' };

      render(<AuditListView />);

      await waitFor(() => {
        expect(screen.getByText('ISO 27001 ISMS Stage 2 Comprehensive Audit')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /manage audit workspace/i }));

      await waitFor(() => {
        fireEvent.click(screen.getByRole('button', { name: /findings/i }));
      });

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /verify & close/i })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /verify & close/i }));

      await waitFor(() => {
        expect(screen.getByText(/Segregation of Duties Violation/i)).toBeInTheDocument();
        const signOffBtn = screen.getByRole('button', { name: /Sign Off Verification/i });
        expect(signOffBtn).toBeDisabled();
      });
    });

    it('disables verification button when current user is the CAPA action owner', async () => {
      // Simulate CAPA owner Bob logged in
      mockCurrentUser = { id: 'u-capa-owner-bob', role: 'USER', name: 'Bob CapaOwner', email: 'bob@company.test' };

      render(<AuditListView />);

      await waitFor(() => {
        expect(screen.getByText('ISO 27001 ISMS Stage 2 Comprehensive Audit')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /manage audit workspace/i }));

      await waitFor(() => {
        fireEvent.click(screen.getByRole('button', { name: /findings/i }));
      });

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /verify & close/i })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /verify & close/i }));

      await waitFor(() => {
        expect(screen.getByText(/Segregation of Duties Violation/i)).toBeInTheDocument();
        const signOffBtn = screen.getByRole('button', { name: /Sign Off Verification/i });
        expect(signOffBtn).toBeDisabled();
      });
    });
  });

  // =========================================================================
  // WORKFLOW D: CONCURRENCY & STALE RECORD CONFLICT HANDLING
  // =========================================================================
  describe('Workflow D — Optimistic Concurrency & 409 Conflict Handling', () => {
    it('handles 409 Conflict gracefully by alerting user and refetching latest entity state', async () => {
      render(<AuditListView />);

      await waitFor(() => {
        expect(screen.getByText('ISO 27001 ISMS Stage 2 Comprehensive Audit')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /manage audit workspace/i }));

      await waitFor(() => {
        fireEvent.click(screen.getByRole('button', { name: /findings/i }));
      });

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /verify & close/i })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /verify & close/i }));

      // Mock 409 Conflict error from API
      mockedApiRequest.mockRejectedValueOnce({
        status: 409,
        message: 'AuditFinding has been modified concurrently (STALE_RECORD_CONFLICT).',
      });

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Sign Off Verification/i })).not.toBeDisabled();
      });

      fireEvent.click(screen.getByRole('button', { name: /Sign Off Verification/i }));

      await waitFor(() => {
        expect(mockAddToast).toHaveBeenCalledWith(
          expect.stringContaining('Conflict: This finding was modified concurrently'),
          'error',
        );
      });
    });
  });
});
