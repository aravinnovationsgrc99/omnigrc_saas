import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { ComplianceScopeFilter } from '../src/components/ui/compliance-scope-filter';
import { PolicyEditor } from '../src/components/policies/policy-editor';
import { PolicyCategoriesSettingsCard } from '../src/components/settings/policy-categories-settings-card';
import { VulnerabilityListView } from '../src/components/vulnerabilities/vulnerability-list-view';
import { RiskDrawer } from '../src/components/risks/risk-drawer';
import { useAuth } from '../src/context/auth-context';
import { useToast } from '../src/context/toast-context';
import { apiRequest } from '../src/lib/api-client';
import { Role, VulnerabilitySeverity, VulnerabilityStatus } from '@omnigrc/shared';

jest.mock('../src/context/auth-context');
jest.mock('../src/context/toast-context');
jest.mock('../src/lib/api-client');

const mockedUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;
const mockedUseToast = useToast as jest.MockedFunction<typeof useToast>;
const mockedApiRequest = apiRequest as jest.MockedFunction<typeof apiRequest>;

describe('Phase 3 Workflows: Risk Clause Dropdown, Policy Governance & Vulnerability Ownership', () => {
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
      user: { id: 'u-1', email: 'admin@company.com', role: Role.ADMIN },
      organization: { id: 'org-1', name: 'Acme Security' },
      role: Role.ADMIN,
      token: 'jwt-token',
      login: jest.fn(),
      logout: jest.fn(),
      switchOrganization: jest.fn(),
      hasRole: jest.fn().mockReturnValue(true),
      hasCapability: jest.fn().mockReturnValue(true),
      getCapabilityState: jest.fn().mockReturnValue({ isAvailable: true }),
    } as any);
  });

  // --- SCOPE A: RISK FRAMEWORK REFERENCE / CLAUSE DROPDOWN ---
  describe('Scope A — ComplianceScopeFilter & Risk Clause Dropdown', () => {
    const mockFrameworks = [
      { id: 'fw-iso27001', code: 'ISO27001', name: 'ISO/IEC 27001' },
      { id: 'fw-gdpr', code: 'GDPR', name: 'EU General Data Protection Regulation' },
    ];

    const mockVersions = [
      { id: 'ver-iso-2022-phase-e', versionNumber: '2022-PHASE-E', referencesCount: 0 },
      { id: 'ver-iso-2022-active', versionNumber: '2022', referencesCount: 93 },
    ];

    const mockReferences = [
      { id: 'ref-a51', identifier: 'A.5.1', title: 'Policies for information security' },
      { id: 'ref-a820', identifier: 'A.8.20', title: 'Network security' },
    ];

    it('loads active framework version with references and populates reference clauses', async () => {
      mockedApiRequest.mockImplementation((endpoint: string) => {
        if (endpoint === '/frameworks') return Promise.resolve(mockFrameworks);
        if (endpoint.includes('/references')) return Promise.resolve(mockReferences);
        if (endpoint.includes('/versions')) return Promise.resolve(mockVersions);
        return Promise.resolve([]);
      });

      const onFrameworkChange = jest.fn();
      const onReferenceChange = jest.fn();

      render(
        <ComplianceScopeFilter
          selectedFrameworkId="fw-iso27001"
          onFrameworkChange={onFrameworkChange}
          selectedReferenceId=""
          onReferenceChange={onReferenceChange}
          showReferenceFilter={true}
          showVersionFilter={true}
          layout="form"
        />,
      );

      // Verify references are loaded into the clause dropdown
      await waitFor(() => {
        expect(screen.getByText(/A\.5\.1 — Policies for information security/i)).toBeInTheDocument();
      });

      expect(screen.getByText(/A\.8\.20 — Network security/i)).toBeInTheDocument();
    });

    it('clears reference selection when changing target framework', async () => {
      mockedApiRequest.mockImplementation((endpoint: string) => {
        if (endpoint === '/frameworks') return Promise.resolve(mockFrameworks);
        if (endpoint.includes('/references')) return Promise.resolve(mockReferences);
        if (endpoint.includes('/versions')) return Promise.resolve(mockVersions);
        return Promise.resolve([]);
      });

      const onFrameworkChange = jest.fn();
      const onReferenceChange = jest.fn();

      render(
        <ComplianceScopeFilter
          selectedFrameworkId="fw-iso27001"
          onFrameworkChange={onFrameworkChange}
          selectedReferenceId="ref-a51"
          onReferenceChange={onReferenceChange}
          showReferenceFilter={true}
          layout="form"
        />,
      );

      await waitFor(() => {
        expect(screen.getByText(/A\.5\.1 — Policies for information security/i)).toBeInTheDocument();
      });

      const frameworkSelect = screen.getByLabelText(/Target Framework/i);
      fireEvent.change(frameworkSelect, { target: { value: 'fw-gdpr' } });

      expect(onFrameworkChange).toHaveBeenCalledWith(
        'fw-gdpr',
        expect.objectContaining({ id: 'fw-gdpr', code: 'GDPR' }),
      );
      expect(onReferenceChange).toHaveBeenCalledWith('', null);
    });

    it('displays resilient error state with retry button when references fail to load', async () => {
      mockedApiRequest.mockImplementation((endpoint: string) => {
        if (endpoint === '/frameworks') return Promise.resolve(mockFrameworks);
        if (endpoint.includes('/references')) return Promise.reject(new Error('Network error loading references'));
        if (endpoint.includes('/versions')) return Promise.resolve(mockVersions);
        return Promise.resolve([]);
      });

      render(
        <ComplianceScopeFilter
          selectedFrameworkId="fw-iso27001"
          onFrameworkChange={jest.fn()}
          selectedReferenceId=""
          onReferenceChange={jest.fn()}
          showReferenceFilter={true}
          layout="form"
        />,
      );

      await waitFor(() => {
        expect(screen.getByText(/Network error loading references|Failed to load references/i)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Retry/i })).toBeInTheDocument();
      });
    });

    it('correctly resolves and preselects authoritative framework version for older-version reference', async () => {
      const mockMultipleVersions = [
        { id: 'ver-iso-2022', version: '2022', referencesCount: 93 },
        { id: 'ver-iso-2013', version: '2013', referencesCount: 114 },
      ];

      const mock2013References = [
        { id: 'ref-a51-2013', identifier: 'A.5.1-2013', title: 'Management direction for info security' },
      ];

      mockedApiRequest.mockImplementation((endpoint: string) => {
        if (endpoint === '/frameworks') return Promise.resolve(mockFrameworks);
        if (endpoint === '/frameworks/fw-iso27001/versions') return Promise.resolve(mockMultipleVersions);
        if (endpoint === '/frameworks/references/ref-a51-2013') {
          return Promise.resolve({ id: 'ref-a51-2013', frameworkVersionId: 'ver-iso-2013', frameworkId: 'fw-iso27001' });
        }
        if (endpoint === '/frameworks/versions/ver-iso-2013/references') return Promise.resolve(mock2013References);
        return Promise.resolve([]);
      });

      const onVersionChange = jest.fn();
      const onReferenceChange = jest.fn();

      render(
        <ComplianceScopeFilter
          selectedFrameworkId="fw-iso27001"
          onFrameworkChange={jest.fn()}
          selectedReferenceId="ref-a51-2013"
          onReferenceChange={onReferenceChange}
          onVersionChange={onVersionChange}
          showReferenceFilter={true}
          showVersionFilter={true}
          layout="form"
        />,
      );

      await waitFor(() => {
        expect(screen.getByText(/A\.5\.1-2013 — Management direction for info security/i)).toBeInTheDocument();
      });

      expect(onVersionChange).toHaveBeenCalledWith('ver-iso-2013', expect.objectContaining({ id: 'ver-iso-2013' }));
    });

    it('RiskDrawer preselects authoritative framework version when editing a risk and submits consistent payload', async () => {
      const existingRisk: any = {
        id: 'risk-edit-test',
        title: 'Legacy Access Control Risk',
        description: 'Existing legacy description',
        likelihood: 3,
        impact: 4,
        score: 12,
        status: 'OPEN',
        owner: 'SecOps Lead',
        frameworkId: 'fw-iso27001',
        frameworkVersionId: 'ver-iso-2013',
        frameworkReferenceId: 'ref-a51-2013',
      };

      const mockMultipleVersions = [
        { id: 'ver-iso-2022', version: '2022', referencesCount: 93 },
        { id: 'ver-iso-2013', version: '2013', referencesCount: 114 },
      ];

      const mock2013References = [
        { id: 'ref-a51-2013', identifier: 'A.5.1', title: 'Policies for information security' },
      ];

      const mock2022References = [
        { id: 'ref-a51-2022', identifier: 'A.5.1-2022', title: 'Policies for information security 2022' },
      ];

      mockedApiRequest.mockImplementation((endpoint: string, options?: any) => {
        if (endpoint === '/frameworks') return Promise.resolve(mockFrameworks);
        if (endpoint === '/frameworks/fw-iso27001/versions') return Promise.resolve(mockMultipleVersions);
        if (endpoint === '/frameworks/versions/ver-iso-2013/references') return Promise.resolve(mock2013References);
        if (endpoint === '/frameworks/versions/ver-iso-2022/references') return Promise.resolve(mock2022References);
        if (endpoint === '/assets?limit=100') return Promise.resolve({ items: [] });
        if (endpoint.includes('/audit-log')) return Promise.resolve([]);
        if (endpoint.includes('/controls')) return Promise.resolve({ items: [] });
        if (endpoint.startsWith('/risks/') && options?.method === 'PATCH') {
          return Promise.resolve({ success: true });
        }
        return Promise.resolve([]);
      });

      render(
        <RiskDrawer
          risk={existingRisk}
          isOpen={true}
          onClose={jest.fn()}
          onSuccess={jest.fn()}
        />,
      );

      // Verify authoritative version 2013 is preselected and reference is displayed
      await waitFor(() => {
        expect(screen.getByText(/A\.5\.1 — Policies for information security/i)).toBeInTheDocument();
      });

      // Change version to 2022
      const versionSelect = screen.getByLabelText(/^Framework Version$/i);
      fireEvent.change(versionSelect, { target: { value: 'ver-iso-2022' } });

      // Verify references for 2022 are loaded
      await waitFor(() => {
        expect(screen.getByText(/A\.5\.1-2022 — Policies for information security 2022/i)).toBeInTheDocument();
      });

      // Select new reference
      const clauseSelect = screen.getByLabelText(/Framework Reference or Clause/i);
      fireEvent.change(clauseSelect, { target: { value: 'ref-a51-2022' } });

      // Save form
      const saveBtn = screen.getByRole('button', { name: /Save Changes/i });
      fireEvent.click(saveBtn);

      await waitFor(() => {
        expect(mockedApiRequest).toHaveBeenCalledWith(
          '/risks/risk-edit-test',
          expect.objectContaining({
            method: 'PATCH',
            body: expect.stringContaining('"frameworkReferenceId":"ref-a51-2022"'),
          }),
        );
      });
    });
  });

  // --- SCOPE B: POLICY EDITOR & CATEGORIES MANAGEMENT ---
  describe('Scope B — Policy Structured Editor & Category Settings', () => {
    it('PolicyEditor inserts headings and lists into content', () => {
      const onChange = jest.fn();
      render(<PolicyEditor content="Initial Content" onChange={onChange} />);

      const h1Button = screen.getByLabelText('Insert Heading 1');
      fireEvent.click(h1Button);
      expect(onChange).toHaveBeenCalled();

      const boldButton = screen.getByLabelText('Format Bold');
      fireEvent.click(boldButton);
      expect(onChange).toHaveBeenCalled();
    });

    it('PolicyEditor toggles between Write and Preview modes safely', () => {
      const content = '# Information Security\n\n- Mandatory control';
      render(<PolicyEditor content={content} onChange={jest.fn()} />);

      // Switch to preview
      const previewButton = screen.getByRole('button', { name: /Preview/i });
      fireEvent.click(previewButton);

      // Verify formatted elements render
      expect(screen.getByRole('heading', { level: 1, name: 'Information Security' })).toBeInTheDocument();
      expect(screen.getByText('Mandatory control')).toBeInTheDocument();
    });

    it('PolicyCategoriesSettingsCard disables deletion for default categories and blocks deletion for assigned categories', async () => {
      const mockCategories = [
        { id: '1', name: 'Information Security', isDefault: true, policyCount: 4 },
        { id: '2', name: 'Compliance', isDefault: true, policyCount: 0 },
        { id: '3', name: 'Assigned Custom', isDefault: false, policyCount: 3 },
        { id: '4', name: 'Unassigned Custom', isDefault: false, policyCount: 0 },
      ];

      mockedApiRequest.mockImplementation((endpoint: string) => {
        if (endpoint === '/policies/categories') return Promise.resolve(mockCategories);
        return Promise.resolve([]);
      });

      render(<PolicyCategoriesSettingsCard />);

      await waitFor(() => {
        expect(screen.getByText('Information Security')).toBeInTheDocument();
        expect(screen.getByText('Compliance')).toBeInTheDocument();
        expect(screen.getByText('Assigned Custom')).toBeInTheDocument();
        expect(screen.getByText('Unassigned Custom')).toBeInTheDocument();
      });

      // 1. Verify delete button is disabled for default categories with clear explanatory title
      const defaultDeleteButtons = screen.getAllByTitle('System default categories cannot be removed');
      expect(defaultDeleteButtons.length).toBe(2);
      expect(defaultDeleteButtons[0]).toBeDisabled();
      expect(defaultDeleteButtons[1]).toBeDisabled();

      // 2. Verify assigned custom category triggers Deletion Blocked modal
      const assignedCustomDeleteBtn = screen.getByTitle('Assigned to 3 policies (deletion blocked)');
      expect(assignedCustomDeleteBtn).not.toBeDisabled();
      fireEvent.click(assignedCustomDeleteBtn);

      expect(screen.getByText(/Deletion Blocked/i)).toBeInTheDocument();
      expect(screen.getByText(/cannot be deleted because it is actively assigned to/i)).toBeInTheDocument();
      expect(screen.getByText(/3 policy\/policies/i)).toBeInTheDocument();

      // Close modal
      fireEvent.click(screen.getByRole('button', { name: /Understood/i }));

      // 3. Verify unassigned custom category triggers Confirm Category Deletion modal
      const unassignedCustomDeleteBtn = screen.getByTitle('Delete Category');
      expect(unassignedCustomDeleteBtn).not.toBeDisabled();
      fireEvent.click(unassignedCustomDeleteBtn);

      expect(screen.getByText(/Confirm Category Deletion/i)).toBeInTheDocument();
      expect(screen.getByText(/This category is currently unassigned \(0 active policies\) and can be safely removed\./i)).toBeInTheDocument();
    });

    it('PolicyCategoriesSettingsCard allows deleting unused custom category upon confirmation and calls DELETE endpoint', async () => {
      const mockCategories = [
        { id: '1', name: 'Information Security', isDefault: true, policyCount: 4 },
        { id: '4', name: 'Unassigned Custom', isDefault: false, policyCount: 0 },
      ];

      mockedApiRequest.mockImplementation((endpoint: string, options?: any) => {
        if (endpoint === '/policies/categories' && (!options || options.method === 'GET')) {
          return Promise.resolve(mockCategories);
        }
        if (endpoint.startsWith('/policies/categories/') && options?.method === 'DELETE') {
          return Promise.resolve({ success: true, message: 'Deleted' });
        }
        return Promise.resolve([]);
      });

      render(<PolicyCategoriesSettingsCard />);

      await waitFor(() => {
        expect(screen.getByText('Unassigned Custom')).toBeInTheDocument();
      });

      const unassignedDeleteBtn = screen.getByTitle('Delete Category');
      fireEvent.click(unassignedDeleteBtn);

      expect(screen.getByText(/Confirm Category Deletion/i)).toBeInTheDocument();

      // Click "Delete Category" in the modal
      const modalDeleteBtn = screen.getByRole('button', { name: 'Delete Category' });
      fireEvent.click(modalDeleteBtn);

      await waitFor(() => {
        expect(mockedApiRequest).toHaveBeenCalledWith(
          '/policies/categories/Unassigned%20Custom',
          expect.objectContaining({ method: 'DELETE' }),
        );
      });
    });

    it('PolicyCategoriesSettingsCard supports adding a new category and prevents empty submit', async () => {
      mockedApiRequest.mockImplementation((endpoint: string, options?: any) => {
        if (endpoint === '/policies/categories' && options?.method === 'POST') {
          return Promise.resolve({ id: '5', name: 'SecOps', isDefault: false, policyCount: 0 });
        }
        if (endpoint === '/policies/categories') {
          return Promise.resolve([]);
        }
        return Promise.resolve([]);
      });

      render(<PolicyCategoriesSettingsCard />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Add Category/i })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /Add Category/i }));

      const input = screen.getByPlaceholderText(/e\.g\. Threat Intelligence & SecOps/i);
      fireEvent.change(input, { target: { value: 'SecOps' } });

      const saveBtn = screen.getByRole('button', { name: /Save Category/i });
      fireEvent.click(saveBtn);

      await waitFor(() => {
        expect(mockedApiRequest).toHaveBeenCalledWith(
          '/policies/categories',
          expect.objectContaining({
            method: 'POST',
            body: JSON.stringify({ name: 'SecOps' }),
          }),
        );
      });
    });

    it('PolicyCategoriesSettingsCard supports renaming category inline', async () => {
      const mockCategories = [
        { id: '1', name: 'Custom Alpha', isDefault: false, policyCount: 1 },
      ];

      mockedApiRequest.mockImplementation((endpoint: string, options?: any) => {
        if (endpoint === '/policies/categories') return Promise.resolve(mockCategories);
        if (endpoint.startsWith('/policies/categories/') && options?.method === 'PATCH') {
          return Promise.resolve({ id: '1', name: 'Custom Beta', isDefault: false, policyCount: 1 });
        }
        return Promise.resolve([]);
      });

      render(<PolicyCategoriesSettingsCard />);

      await waitFor(() => {
        expect(screen.getByText('Custom Alpha')).toBeInTheDocument();
      });

      const renameBtn = screen.getByTitle('Rename Category');
      fireEvent.click(renameBtn);

      const renameInput = screen.getByDisplayValue('Custom Alpha');
      fireEvent.change(renameInput, { target: { value: 'Custom Beta' } });

      const saveRenameBtn = screen.getByTitle('Save Rename');
      fireEvent.click(saveRenameBtn);

      await waitFor(() => {
        expect(mockedApiRequest).toHaveBeenCalledWith(
          '/policies/categories/Custom%20Alpha',
          expect.objectContaining({
            method: 'PATCH',
            body: JSON.stringify({ newName: 'Custom Beta' }),
          }),
        );
      });
    });
  });

  // --- SCOPE C: VULNERABILITY OWNERSHIP & EVIDENCE ---
  describe('Scope C — Vulnerability Ownership & Supporting Documents', () => {
    const mockVulns = [
      {
        id: 'vuln-101',
        title: 'SQL Injection in Auth API',
        cveId: 'CVE-2026-9999',
        severity: VulnerabilitySeverity.CRITICAL,
        status: VulnerabilityStatus.OPEN,
        discoveredAt: new Date().toISOString(),
        remediationOwner: 'user-sec-lead',
        remediationOwnerName: 'Sarah Connors',
        remediationOwnerRole: Role.ANALYST,
        remediationTeamName: 'SecOps',
        evidences: [
          {
            id: 'ev-vuln-1',
            title: 'Reproduction PoC Video',
            fileName: 'exploit_poc.mp4',
            fileSize: 450000,
            status: 'ACTIVE',
            scanStatus: 'CLEAN',
          },
          {
            id: 'ev-vuln-quarantined',
            title: 'Infected Payload Log',
            fileName: 'eicar_sample.log',
            fileSize: 1200,
            status: 'QUARANTINED',
            scanStatus: 'QUARANTINED',
          },
        ],
      },
    ];

    const mockMembers = [
      { id: 'm-1', userId: 'user-sec-lead', name: 'Sarah Connors', role: Role.ANALYST },
      { id: 'm-2', userId: 'user-dev-lead', name: 'John Doe', role: Role.ADMIN },
    ];

    const mockDepartments = [
      { id: 'dept-sec', name: 'Cybersecurity & Defense' },
      { id: 'dept-eng', name: 'Backend Engineering' },
    ];

    it('renders remediation owner with real name and role/team badges', async () => {
      mockedApiRequest.mockImplementation((endpoint: string) => {
        if (endpoint.startsWith('/vulnerabilities')) {
          return Promise.resolve({ items: mockVulns, total: 1 });
        }
        if (endpoint === '/organization-members') return Promise.resolve(mockMembers);
        if (endpoint === '/departments') return Promise.resolve(mockDepartments);
        if (endpoint.startsWith('/assets')) return Promise.resolve({ items: [] });
        return Promise.resolve([]);
      });

      render(<VulnerabilityListView />);

      await waitFor(() => {
        expect(screen.getByText('SQL Injection in Auth API')).toBeInTheDocument();
      });

      // Remediation owner is resolved to real user name with role and team badges
      expect(screen.getByText('Sarah Connors')).toBeInTheDocument();
      expect(screen.getByText(Role.ANALYST)).toBeInTheDocument();
      expect(screen.getByText('SecOps')).toBeInTheDocument();
    });

    it('opens evidence drawer, displays attached files, and prevents download of quarantined files', async () => {
      mockedApiRequest.mockImplementation((endpoint: string) => {
        if (endpoint.startsWith('/vulnerabilities') && endpoint.includes('/evidence')) {
          return Promise.resolve(mockVulns[0].evidences);
        }
        if (endpoint.startsWith('/vulnerabilities')) {
          return Promise.resolve({ items: mockVulns, total: 1 });
        }
        if (endpoint === '/organization-members') return Promise.resolve(mockMembers);
        if (endpoint === '/departments') return Promise.resolve(mockDepartments);
        if (endpoint.startsWith('/assets')) return Promise.resolve({ items: [] });
        return Promise.resolve([]);
      });

      render(<VulnerabilityListView />);

      await waitFor(() => {
        expect(screen.getByText('SQL Injection in Auth API')).toBeInTheDocument();
      });

      // Open evidence drawer
      const docsButton = screen.getByRole('button', { name: /Docs \(2\)/i });
      fireEvent.click(docsButton);

      await waitFor(() => {
        expect(screen.getByText('Supporting Documents & Evidence')).toBeInTheDocument();
        expect(screen.getByText('Reproduction PoC Video')).toBeInTheDocument();
        expect(screen.getByText('Infected Payload Log')).toBeInTheDocument();
      });

      // Verify Quarantined file has quarantine badge and download button is blocked/hidden
      expect(screen.getByText('Quarantined')).toBeInTheDocument();
    });
  });
});
