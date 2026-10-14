import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { ControlTestingSection } from '../src/components/controls/control-testing-section';
import { FrameworkCoverageView } from '../src/components/frameworks/framework-coverage-view';
import { WorkflowLifecyclePanel } from '../src/components/workflow/workflow-lifecycle-panel';
import { useAuth } from '../src/context/auth-context';
import { apiRequest } from '../src/lib/api-client';
import {
  AuditCheckResult,
  Role,
  PaginatedControlTestsDto,
  FrameworkCoverageResultDto,
  GrcLifecycleDto,
  FindingStatus,
} from '@omnigrc/shared';

jest.mock('../src/context/auth-context');
jest.mock('../src/context/toast-context', () => ({
  useToast: () => ({ showToast: jest.fn() }),
}));
jest.mock('../src/lib/api-client');

const mockedUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;
const mockedApiRequest = apiRequest as jest.MockedFunction<typeof apiRequest>;

describe('Phase 3 Increment 4.3 — Control Testing Frontend UI', () => {
  const defaultAdminUser = {
    id: 'u-admin-1',
    organizationId: 'org-1',
    email: 'admin@omnigrc.test',
    firstName: 'Admin',
    lastName: 'User',
    role: Role.ADMIN,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const defaultOrg = {
    id: 'org-1',
    name: 'Test Tenant Org',
    domain: 'test.com',
    slug: 'test-org',
    createdAt: new Date(),
    updatedAt: new Date(),
    isReadOnly: false,
  };

  const createAuthMock = (overrides?: any) => ({
    user: defaultAdminUser,
    organization: defaultOrg,
    capabilities: null,
    capabilitiesStatus: 'available' as any,
    loading: false,
    licenseError: null,
    refreshUser: jest.fn(),
    refreshCapabilities: jest.fn(),
    hasCapability: (cap: string) => cap === 'BUSINESS_AUDITS' || cap === 'GRC_CORE_CONTROLS',
    getCapabilityState: jest.fn(),
    setContextSession: jest.fn(),
    login: jest.fn(),
    register: jest.fn(),
    logout: jest.fn(),
    clearLicenseError: jest.fn(),
    ...overrides,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockedUseAuth.mockReturnValue(createAuthMock());
  });

  // -------------------------------------------------------------
  // Scenario 1: Test-history loading, empty, populated, API-error
  // -------------------------------------------------------------
  describe('Scenario 1 — Test History States (Loading, Empty, Populated, Error)', () => {
    it('should display loading state while fetching tests', () => {
      mockedApiRequest.mockReturnValue(new Promise(() => {})); // never resolves

      render(<ControlTestingSection controlId="c-1" controlName="Access Control" />);
      expect(screen.getByTestId('control-testing-loading')).toBeInTheDocument();
      expect(screen.getByText(/Loading control test executions/i)).toBeInTheDocument();
    });

    it('should display empty state when control has zero test check-items', async () => {
      const emptyDto: PaginatedControlTestsDto = {
        items: [],
        total: 0,
        page: 1,
        limit: 10,
        totalPages: 0,
        summary: {
          totalTests: 0,
          effectiveCount: 0,
          partiallyEffectiveCount: 0,
          ineffectiveCount: 0,
          notEvaluatedCount: 0,
          notApplicableCount: 0,
          overallEffectiveness: 'NOT_TESTED',
          latestTestResult: null,
          latestTestedAt: null,
        },
      };
      mockedApiRequest.mockResolvedValue(emptyDto);

      render(<ControlTestingSection controlId="c-1" controlName="Access Control" />);

      await waitFor(() => {
        expect(screen.getByTestId('control-testing-empty')).toBeInTheDocument();
      });
      expect(screen.getByText(/No Operational Tests Registered/i)).toBeInTheDocument();
      expect(screen.getByText(/Not Tested/i)).toBeInTheDocument();
    });

    it('should display populated test history with execution results and summary strip', async () => {
      const populatedDto: PaginatedControlTestsDto = {
        items: [
          {
            id: 'test-exec-1',
            organizationId: 'org-1',
            controlId: 'c-1',
            assessmentId: 'a-1',
            assessmentTitle: 'Annual ISO Audit Assessment',
            assessmentStatus: 'IN_PROGRESS' as any,
            auditPlanId: 'p-1',
            auditPlanTitle: 'ISO 27001 Internal Audit Plan',
            frameworkCode: 'ISO27001',
            title: 'MFA Enforcement Validation',
            description: 'Sample 25 administrators across cloud console',
            result: AuditCheckResult.COMPLIANT,
            notes: 'Zero bypasses detected across sample size.',
            auditorId: 'aud-1',
            createdById: 'u-1',
            createdByName: 'Lead Auditor Jane',
            createdAt: '2026-04-01T10:00:00Z',
            updatedAt: '2026-04-01T12:00:00Z',
            findingsCount: 0,
            evidenceCount: 1,
            findings: [],
            evidence: [
              {
                id: 'ev-1',
                title: 'IdP MFA Logs Export',
                fileName: 'idp_mfa_logs.csv',
                scanStatus: 'CLEAN' as any,
                status: 'ACTIVE' as any,
              },
            ],
          },
        ],
        total: 1,
        page: 1,
        limit: 10,
        totalPages: 1,
        summary: {
          totalTests: 1,
          effectiveCount: 1,
          partiallyEffectiveCount: 0,
          ineffectiveCount: 0,
          notEvaluatedCount: 0,
          notApplicableCount: 0,
          overallEffectiveness: 'EFFECTIVE',
          latestTestResult: AuditCheckResult.COMPLIANT,
          latestTestedAt: '2026-04-01T12:00:00Z',
        },
      };
      mockedApiRequest.mockResolvedValue(populatedDto);

      render(<ControlTestingSection controlId="c-1" controlName="Access Control" />);

      await waitFor(() => {
        expect(screen.getByTestId('control-testing-list')).toBeInTheDocument();
      });
      expect(screen.getByText('MFA Enforcement Validation')).toBeInTheDocument();
      expect(screen.getByTestId('effectiveness-posture-badge')).toHaveTextContent(/Effective/i);
      expect(screen.getByTestId('test-result-badge')).toHaveTextContent('COMPLIANT');
      expect(screen.getByText(/Lead Auditor Jane/i)).toBeInTheDocument();
    });

    it('should display error banner with retry button on API failure', async () => {
      mockedApiRequest.mockRejectedValue(new Error('Internal network outage'));

      render(<ControlTestingSection controlId="c-1" controlName="Access Control" />);

      await waitFor(() => {
        expect(screen.getByTestId('control-testing-error')).toBeInTheDocument();
      });
      expect(screen.getByText('Internal network outage')).toBeInTheDocument();
      expect(screen.getByText('Retry')).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------
  // Scenario 2: Role-restricted creation controls
  // -------------------------------------------------------------
  describe('Scenario 2 — Role-Restricted Creation Controls', () => {
    it('should render "Add Test to Assessment" button for ADMIN and ANALYST', async () => {
      mockedApiRequest.mockResolvedValue({ items: [], total: 0, page: 1, limit: 10, totalPages: 0, summary: null });

      render(<ControlTestingSection controlId="c-1" controlName="Access Control" />);

      await waitFor(() => {
        expect(screen.getByTestId('add-control-test-btn')).toBeInTheDocument();
      });
    });

    it('should HIDE "Add Test to Assessment" button for EXTERNAL_AUDITOR role', async () => {
      mockedUseAuth.mockReturnValue(createAuthMock({
        user: { ...defaultAdminUser, role: Role.EXTERNAL_AUDITOR },
      }));
      mockedApiRequest.mockResolvedValue({ items: [], total: 0, page: 1, limit: 10, totalPages: 0, summary: null });

      render(<ControlTestingSection controlId="c-1" controlName="Access Control" />);

      await waitFor(() => {
        expect(screen.getByTestId('control-testing-section')).toBeInTheDocument();
      });
      expect(screen.queryByTestId('add-control-test-btn')).toBeNull();
    });

    it('should HIDE "Add Test to Assessment" button when organization is in read-only license state', async () => {
      mockedUseAuth.mockReturnValue(createAuthMock({
        organization: { ...defaultOrg, isReadOnly: true },
      }));
      mockedApiRequest.mockResolvedValue({ items: [], total: 0, page: 1, limit: 10, totalPages: 0, summary: null });

      render(<ControlTestingSection controlId="c-1" controlName="Access Control" />);

      await waitFor(() => {
        expect(screen.getByTestId('control-testing-section')).toBeInTheDocument();
      });
      expect(screen.queryByTestId('add-control-test-btn')).toBeNull();
    });
  });

  // -------------------------------------------------------------
  // Scenario 3: Unlicensed / unavailable testing states
  // -------------------------------------------------------------
  describe('Scenario 3 — Unlicensed / Unavailable Testing Capability', () => {
    it('should display module unlicensed card and suppress API query when BUSINESS_AUDITS is disabled', () => {
      mockedUseAuth.mockReturnValue(createAuthMock({
        hasCapability: (cap: string) => cap !== 'BUSINESS_AUDITS', // Disabled!
      }));

      render(<ControlTestingSection controlId="c-1" controlName="Access Control" />);

      expect(screen.getByTestId('control-testing-unlicensed')).toBeInTheDocument();
      expect(screen.getByText(/Business Audits Capability Disabled/i)).toBeInTheDocument();
      expect(screen.getByText(/NOT APPLICABLE \/ UNLICENSED/i)).toBeInTheDocument();
      expect(mockedApiRequest).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------
  // Scenario 4: Framework references with mixed control results
  // -------------------------------------------------------------
  describe('Scenario 4 — Framework References with Mixed Control Results', () => {
    it('should transparently display "Test Failures Detected" and demote reference when a mapped control fails', async () => {
      const coverageData: FrameworkCoverageResultDto = {
        framework: { id: 'fw-1', code: 'ISO27001', name: 'ISO 27001' },
        version: { id: 'ver-1', version: '2022', name: '2022' },
        summary: { totalReferences: 1, covered: 0, partial: 1, notCovered: 0, coveragePercentage: 0 },
        references: [
          {
            referenceId: 'ref-1',
            code: 'A.5.1',
            title: 'Policies for information security',
            type: 'CONTROL',
            status: 'PARTIAL',
            normativeText: null,
            mappedControlsCount: 2,
            mappedControls: [
              {
                controlId: 'c-1',
                name: 'Corporate Policy Document',
                category: 'Governance',
                mappingStatus: 'APPROVED',
                latestTestResult: AuditCheckResult.COMPLIANT,
                effectivenessStatus: 'EFFECTIVE',
                hasUnresolvedFinding: false,
              },
              {
                controlId: 'c-2',
                name: 'Access Recertification',
                category: 'IAM',
                mappingStatus: 'APPROVED',
                latestTestResult: AuditCheckResult.NON_COMPLIANT,
                effectivenessStatus: 'INEFFECTIVE',
                hasUnresolvedFinding: false,
              },
            ],
            evidenceSummary: { totalCount: 1, cleanActiveCount: 1, evidences: [] },
            approvalSummary: { hasApproval: true, status: 'APPROVED', instances: [] },
            testingSummary: {
              totalTests: 2,
              latestTestResult: AuditCheckResult.COMPLIANT, // Notice backend F-01 edge case
              hasFailures: true, // Mixed results!
              hasUnresolvedFindings: false,
              isTestingAvailable: true,
            },
          },
        ],
      };

      mockedApiRequest.mockImplementation(async (url: string) => {
        if (url === '/frameworks') return [{ id: 'fw-1', code: 'ISO27001', name: 'ISO 27001' }];
        if (url.includes('/versions')) return [{ id: 'ver-1', version: '2022', name: '2022' }];
        if (url.includes('/coverage')) return coverageData;
        return null;
      });

      render(<FrameworkCoverageView />);

      await waitFor(() => {
        expect(screen.getByText('Test Failures Detected')).toBeInTheDocument();
        expect(screen.getByText('PARTIAL')).toBeInTheDocument();
      });

      // Expand reference drill-down
      const refNode = await screen.findByText('A.5.1');
      fireEvent.click(refNode);

      await waitFor(() => {
        expect(screen.getByText(/Operational Failures Detected:/i)).toBeInTheDocument();
      });
      // Verify both individual control outcomes are rendered
      expect(screen.getByText('Test: COMPLIANT')).toBeInTheDocument();
      expect(screen.getByText('Test: NON-COMPLIANT')).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------
  // Scenario 5: Unresolved findings alongside a compliant result
  // -------------------------------------------------------------
  describe('Scenario 5 — Unresolved Findings Alongside Compliant Result', () => {
    it('should flag open findings even when latest test result is COMPLIANT', async () => {
      const coverageData: FrameworkCoverageResultDto = {
        framework: { id: 'fw-1', code: 'ISO27001', name: 'ISO 27001' },
        version: { id: 'ver-1', version: '2022', name: '2022' },
        summary: { totalReferences: 1, covered: 0, partial: 1, notCovered: 0, coveragePercentage: 0 },
        references: [
          {
            referenceId: 'ref-1',
            code: 'A.5.1',
            title: 'Policies for information security',
            type: 'CONTROL',
            status: 'PARTIAL',
            normativeText: null,
            mappedControlsCount: 1,
            mappedControls: [
              {
                controlId: 'c-1',
                name: 'Corporate Policy Document',
                category: 'Governance',
                mappingStatus: 'APPROVED',
                latestTestResult: AuditCheckResult.COMPLIANT,
                effectivenessStatus: 'EFFECTIVE',
                hasUnresolvedFinding: true, // Finding unresolved!
              },
            ],
            evidenceSummary: { totalCount: 1, cleanActiveCount: 1, evidences: [] },
            approvalSummary: { hasApproval: true, status: 'APPROVED', instances: [] },
            testingSummary: {
              totalTests: 1,
              latestTestResult: AuditCheckResult.COMPLIANT,
              hasFailures: false,
              hasUnresolvedFindings: true,
              isTestingAvailable: true,
            },
          },
        ],
      };

      mockedApiRequest.mockImplementation(async (url: string) => {
        if (url === '/frameworks') return [{ id: 'fw-1', code: 'ISO27001', name: 'ISO 27001' }];
        if (url.includes('/versions')) return [{ id: 'ver-1', version: '2022', name: '2022' }];
        if (url.includes('/coverage')) return coverageData;
        return null;
      });

      render(<FrameworkCoverageView />);

      await waitFor(() => {
        expect(screen.getByText('Open Deficiencies')).toBeInTheDocument();
      });

      const refNode = await screen.findByText('A.5.1');
      fireEvent.click(refNode);

      await waitFor(() => {
        expect(screen.getByText(/Unresolved Deficiencies:/i)).toBeInTheDocument();
      });
      expect(screen.getByText(/Open Findings/i)).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------
  // Scenario 6: NOT_EVALUATED following a previous failure
  // -------------------------------------------------------------
  describe('Scenario 6 — NOT_EVALUATED Following Previous Failure', () => {
    it('should distinguish in-progress unevaluated check items without concealing overall failure', async () => {
      const testsDto: PaginatedControlTestsDto = {
        items: [
          {
            id: 'test-exec-new',
            organizationId: 'org-1',
            controlId: 'c-1',
            assessmentId: 'a-2',
            assessmentTitle: 'Q2 Follow-up Audit',
            assessmentStatus: 'IN_PROGRESS' as any,
            auditPlanId: 'p-1',
            auditPlanTitle: 'ISO Plan',
            frameworkCode: 'ISO27001',
            title: 'Q2 Re-check MFA',
            description: 'Retest in progress',
            result: AuditCheckResult.NOT_EVALUATED,
            notes: null,
            auditorId: null,
            createdById: 'u-1',
            createdByName: 'Auditor A',
            createdAt: '2026-04-10T10:00:00Z',
            updatedAt: '2026-04-10T10:00:00Z',
            findingsCount: 0,
            evidenceCount: 0,
            findings: [],
            evidence: [],
          },
          {
            id: 'test-exec-old',
            organizationId: 'org-1',
            controlId: 'c-1',
            assessmentId: 'a-1',
            assessmentTitle: 'Q1 Audit',
            assessmentStatus: 'COMPLETED' as any,
            auditPlanId: 'p-1',
            auditPlanTitle: 'ISO Plan',
            frameworkCode: 'ISO27001',
            title: 'Q1 Initial Check',
            description: 'Failed check',
            result: AuditCheckResult.NON_COMPLIANT,
            notes: 'Failed to enforce MFA',
            auditorId: null,
            createdById: 'u-1',
            createdByName: 'Auditor A',
            createdAt: '2026-03-01T10:00:00Z',
            updatedAt: '2026-03-01T12:00:00Z',
            findingsCount: 1,
            evidenceCount: 0,
            findings: [{ id: 'f-1', title: 'MFA not required on staging', severity: 'HIGH' as any, status: FindingStatus.OPEN }],
            evidence: [],
          },
        ],
        total: 2,
        page: 1,
        limit: 10,
        totalPages: 1,
        summary: {
          totalTests: 2,
          effectiveCount: 0,
          partiallyEffectiveCount: 0,
          ineffectiveCount: 1,
          notEvaluatedCount: 1,
          notApplicableCount: 0,
          overallEffectiveness: 'INEFFECTIVE', // Preserves older failure!
          latestTestResult: AuditCheckResult.NON_COMPLIANT,
          latestTestedAt: '2026-03-01T12:00:00Z',
        },
      };
      mockedApiRequest.mockResolvedValue(testsDto);

      render(<ControlTestingSection controlId="c-1" controlName="Access Control" />);

      await waitFor(() => {
        expect(screen.getByText('Q2 Re-check MFA')).toBeInTheDocument();
      });
      // Notice both badges are rendered distinctly
      expect(screen.getByText('NOT EVALUATED')).toBeInTheDocument();
      expect(screen.getByText('NON-COMPLIANT')).toBeInTheDocument();
      // Overall posture remains Ineffective!
      expect(screen.getByTestId('effectiveness-posture-badge')).toHaveTextContent(/Ineffective/i);
    });
  });

  // -------------------------------------------------------------
  // Scenario 7: Genuine NOT_APPLICABLE vs unavailable capability
  // -------------------------------------------------------------
  describe('Scenario 7 — Genuine NOT_APPLICABLE vs Unavailable Capability', () => {
    it('should render genuine NOT_APPLICABLE as exempt check item, visibly distinct from disabled module', async () => {
      const testsDto: PaginatedControlTestsDto = {
        items: [
          {
            id: 'test-na-1',
            organizationId: 'org-1',
            controlId: 'c-1',
            assessmentId: 'a-1',
            assessmentTitle: 'Audit Execution',
            assessmentStatus: 'IN_PROGRESS' as any,
            auditPlanId: 'p-1',
            auditPlanTitle: 'Plan',
            title: 'Physical Security Check',
            description: 'Control evaluated as cloud-native only',
            result: AuditCheckResult.NOT_APPLICABLE,
            notes: 'No physical data center owned',
            createdById: 'u-1',
            createdAt: '2026-04-01T10:00:00Z',
            updatedAt: '2026-04-01T10:00:00Z',
            findingsCount: 0,
            evidenceCount: 0,
            findings: [],
            evidence: [],
          },
        ],
        total: 1,
        page: 1,
        limit: 10,
        totalPages: 1,
        summary: {
          totalTests: 1,
          effectiveCount: 0,
          partiallyEffectiveCount: 0,
          ineffectiveCount: 0,
          notEvaluatedCount: 0,
          notApplicableCount: 1,
          overallEffectiveness: 'NOT_APPLICABLE',
          latestTestResult: AuditCheckResult.NOT_APPLICABLE,
          latestTestedAt: '2026-04-01T10:00:00Z',
        },
      };
      mockedApiRequest.mockResolvedValue(testsDto);

      render(<ControlTestingSection controlId="c-1" controlName="Access Control" />);

      await waitFor(() => {
        expect(screen.getByText('NOT APPLICABLE')).toBeInTheDocument();
      });
      expect(screen.getByTestId('effectiveness-posture-badge')).toHaveTextContent(/Not Applicable/i);
      // Ensure it does NOT show the disabled capability card
      expect(screen.queryByTestId('control-testing-unlicensed')).toBeNull();
    });
  });

  // -------------------------------------------------------------
  // Scenario 8: WorkflowLifecyclePanel stage rendering
  // -------------------------------------------------------------
  describe('Scenario 8 — WorkflowLifecyclePanel Stage & Subsystem Rendering', () => {
    it('should render CONTROL_TESTING stage as BLOCKED with blocker alert pill when test fails', async () => {
      const lifecycleDto: GrcLifecycleDto = {
        resourceType: 'CONTROL',
        resourceId: 'c-1',
        resourceTitle: 'Access Enforcement Control',
        organizationId: 'org-1',
        authoritativeStatus: 'APPROVED',
        isBlocked: true,
        blockedReason: 'Control failed latest operational audit test (NON_COMPLIANT).',
        frameworkReference: null,
        stages: [
          {
            stage: 'CONTROL_TESTING',
            status: 'BLOCKED',
            label: 'Control Test Failed (NON_COMPLIANT)',
            details: 'Latest operational test evaluated as NON_COMPLIANT',
            blockerReason: 'Latest audit evaluation determined control is non-compliant.',
          },
          {
            stage: 'AUTHORITATIVE_STATE',
            status: 'BLOCKED',
            label: 'Authoritative State: APPROVED',
            details: 'Control failed latest operational audit test (NON_COMPLIANT).',
          },
        ],
        evidences: [],
        aiAnalyses: [],
        approvals: [],
        remediations: [],
        testing: {
          isAvailable: true,
          totalTests: 1,
          latestResult: AuditCheckResult.NON_COMPLIANT,
          effectivenessStatus: 'INEFFECTIVE',
          unresolvedFindingsCount: 1,
        },
      };

      mockedApiRequest.mockResolvedValue(lifecycleDto);

      render(<WorkflowLifecyclePanel resourceType="CONTROL" resourceId="c-1" />);

      await waitFor(() => {
        expect(screen.getByText('Control Test Failed (NON_COMPLIANT)')).toBeInTheDocument();
      });

      // Stage blocker reason rendered
      expect(screen.getByText(/Blocker: Latest audit evaluation determined control is non-compliant./i)).toBeInTheDocument();

      // Top banner blocker (checks that at least one element with the text is rendered)
      expect(screen.getAllByText(/Control failed latest operational audit test/i).length).toBeGreaterThan(0);

      // Control testing subsystem card rendered
      expect(screen.getByText('INEFFECTIVE')).toBeInTheDocument();
      expect(screen.getByText('1 Open Findings')).toBeInTheDocument();
    });

    it('should render CONTROL_TESTING stage as NOT_APPLICABLE when capability is disabled', async () => {
      const lifecycleDto: GrcLifecycleDto = {
        resourceType: 'CONTROL',
        resourceId: 'c-1',
        resourceTitle: 'Access Enforcement Control',
        organizationId: 'org-1',
        authoritativeStatus: 'APPROVED',
        isBlocked: false,
        blockedReason: null,
        frameworkReference: null,
        stages: [
          {
            stage: 'CONTROL_TESTING',
            status: 'NOT_APPLICABLE',
            label: 'Control Testing Disabled',
            details: 'Business Audits capability is disabled or unentitled',
          },
        ],
        evidences: [],
        aiAnalyses: [],
        approvals: [],
        remediations: [],
        testing: {
          isAvailable: false,
          totalTests: 0,
          latestResult: null,
          effectivenessStatus: 'NOT_TESTED',
          unresolvedFindingsCount: 0,
        },
      };

      mockedApiRequest.mockResolvedValue(lifecycleDto);

      render(<WorkflowLifecyclePanel resourceType="CONTROL" resourceId="c-1" />);

      await waitFor(() => {
        expect(screen.getByText('Control Testing Disabled')).toBeInTheDocument();
      });
      expect(screen.getByText(/Audits capability disabled/i)).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------
  // Scenario 9: Backward compatibility when optional fields absent
  // -------------------------------------------------------------
  describe('Scenario 9 — Backward Compatibility when Testing Fields Absent', () => {
    it('should render WorkflowLifecyclePanel safely without testing card when lifecycle.testing is undefined', async () => {
      const legacyLifecycleDto: GrcLifecycleDto = {
        resourceType: 'RISK',
        resourceId: 'r-1',
        resourceTitle: 'Data Breach Risk',
        organizationId: 'org-1',
        authoritativeStatus: 'OPEN',
        isBlocked: false,
        blockedReason: null,
        frameworkReference: null,
        stages: [
          {
            stage: 'REQUIREMENT',
            status: 'COMPLETED',
            label: 'General Obligation',
          },
          {
            stage: 'AUTHORITATIVE_STATE',
            status: 'COMPLETED',
            label: 'Authoritative State: OPEN',
          },
        ],
        evidences: [],
        aiAnalyses: [],
        approvals: [],
        remediations: [],
        // testing is omitted / undefined
      };

      mockedApiRequest.mockResolvedValue(legacyLifecycleDto);

      render(<WorkflowLifecyclePanel resourceType="RISK" resourceId="r-1" />);

      await waitFor(() => {
        expect(screen.getByText('Data Breach Risk')).toBeInTheDocument();
      });
      // Should not throw and should render without the testing subsystem card
      expect(screen.queryByText('Control Testing')).toBeNull();
    });
  });
});
