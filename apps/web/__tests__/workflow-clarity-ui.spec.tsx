import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { WorkflowLifecyclePanel } from '../src/components/workflow/workflow-lifecycle-panel';
import { AttentionRequiredWidget } from '../src/components/dashboard/widgets/attention-required-widget';
import { useAuth } from '../src/context/auth-context';
import { apiRequest } from '../src/lib/api-client';
import {
  AuditCheckResult,
  Role,
  GrcLifecycleDto,
  WorkflowNextActionDto,
  WorkflowPrerequisitesDto,
} from '@omnigrc/shared';

jest.mock('../src/context/auth-context');
jest.mock('../src/context/toast-context', () => ({
  useToast: () => ({ showToast: jest.fn() }),
}));
jest.mock('../src/lib/api-client');

const mockedUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;
const mockedApiRequest = apiRequest as jest.MockedFunction<typeof apiRequest>;

describe('Phase 4 — Workflow Clarity Frontend UI', () => {
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
    role: Role.ADMIN,
    token: 'jwt-token',
    login: jest.fn(),
    logout: jest.fn(),
    switchOrganization: jest.fn(),
    hasRole: jest.fn().mockReturnValue(true),
    hasCapability: jest.fn().mockReturnValue(true),
    getCapabilityState: jest.fn().mockReturnValue({ capabilityCode: 'GRC_CORE_CONTROLS', effectiveState: 'AVAILABLE', isAvailable: true }),
    ...overrides,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockedUseAuth.mockReturnValue(createAuthMock());
  });

  describe('WorkflowLifecyclePanel — Next Action & Prerequisites Checklist', () => {
    const mockNextAction: WorkflowNextActionDto = {
      title: 'Quarantined Evidence Detected',
      description: 'Review infected evidence attachments and replace with clean files.',
      actionType: 'RESOLVE_BLOCKER',
      buttonLabel: 'Review Quarantined Evidence',
      targetView: 'evidence',
      priority: 'CRITICAL',
      responsibleParty: 'Security Analyst',
      isBlocked: true,
    };

    const mockPrerequisites: WorkflowPrerequisitesDto = {
      totalCount: 4,
      satisfiedCount: 2,
      items: [
        {
          id: 'prereq-framework-mapping',
          title: 'Framework Mapping',
          isSatisfied: true,
          reason: 'Mapped to ISO 27001 Annex A.9.2',
          responsibleParty: 'Governance Analyst',
        },
        {
          id: 'prereq-evidence-proof',
          title: 'Clean Evidence',
          isSatisfied: false,
          reason: '1 file is quarantined by virus scanner',
          responsibleParty: 'Control Owner',
        },
        {
          id: 'prereq-operational-testing',
          title: 'Operational Testing',
          isSatisfied: false,
          reason: 'No audit tests evaluated yet',
          responsibleParty: 'Lead Auditor',
        },
        {
          id: 'prereq-approvals',
          title: 'Governance Approvals',
          isSatisfied: true,
          reason: 'Approved by Compliance Officer',
          responsibleParty: 'Designated Approvers',
        },
      ],
    };

    const mockLifecycle: GrcLifecycleDto = {
      resourceType: 'CONTROL',
      resourceId: 'ctrl-1',
      resourceTitle: 'Access Control Gateway',
      organizationId: 'org-1',
      authoritativeStatus: 'BLOCKED',
      isBlocked: true,
      blockedReason: 'Evidence infected with malware cannot be used for certification.',
      frameworkReference: {
        id: 'ref-1',
        identifier: 'A.9.2',
        title: 'User Access Management',
        frameworkCode: 'ISO27001',
      },
      stages: [
        { stage: 'REQUIREMENT', status: 'COMPLETED', label: 'Framework Reference: A.9.2' },
        { stage: 'EVIDENCE', status: 'BLOCKED', label: 'Quarantined Evidence', blockerReason: 'Infected file' },
      ],
      evidences: [],
      aiAnalyses: [],
      approvals: [],
      remediations: [],
      testing: {
        isAvailable: true,
        totalTests: 0,
        latestResult: null,
        effectivenessStatus: 'NOT_TESTED',
        unresolvedFindingsCount: 0,
      },
      nextAction: mockNextAction,
      prerequisites: mockPrerequisites,
    };

    it('should render the authoritative Next Action Card with blocker styling and target action', async () => {
      mockedApiRequest.mockResolvedValueOnce(mockLifecycle);
      const onNavigate = jest.fn();

      render(
        <WorkflowLifecyclePanel
          resourceType="CONTROL"
          resourceId="ctrl-1"
          onNavigateToView={onNavigate}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Quarantined Evidence Detected')).toBeInTheDocument();
      });

      expect(screen.getByText('ACTION REQUIRED • BLOCKER')).toBeInTheDocument();
      expect(screen.getByText(/Review infected evidence attachments/i)).toBeInTheDocument();
      expect(screen.getByText(/Security Analyst/i)).toBeInTheDocument();

      const actionBtn = screen.getByRole('button', { name: /Review Quarantined Evidence/i });
      expect(actionBtn).toBeInTheDocument();

      fireEvent.click(actionBtn);
      expect(onNavigate).toHaveBeenCalledWith('evidence');
    });

    it('should render the Prerequisites Checklist with status pills and completion counter', async () => {
      mockedApiRequest.mockResolvedValueOnce(mockLifecycle);

      render(
        <WorkflowLifecyclePanel
          resourceType="CONTROL"
          resourceId="ctrl-1"
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Workflow Prerequisites Checklist')).toBeInTheDocument();
      });

      expect(screen.getByText(/2 \/ 4 Satisfied/i)).toBeInTheDocument();
      expect(screen.getByText('Framework Mapping')).toBeInTheDocument();
      expect(screen.getByText('Clean Evidence')).toBeInTheDocument();
      expect(screen.getByText('1 file is quarantined by virus scanner')).toBeInTheDocument();
    });

    it('should support collapsible toggle when collapsible prop is true', async () => {
      mockedApiRequest.mockResolvedValueOnce(mockLifecycle);

      render(
        <WorkflowLifecyclePanel
          resourceType="CONTROL"
          resourceId="ctrl-1"
          collapsible={true}
          defaultExpanded={true}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Quarantined Evidence Detected')).toBeInTheDocument();
      });

      const collapseBtn = screen.getByRole('button', { name: /Collapse panel/i });
      fireEvent.click(collapseBtn);

      // Next action should no longer be in document
      expect(screen.queryByText('Quarantined Evidence Detected')).toBeNull();

      // Click again to re-expand
      const expandBtn = screen.getByRole('button', { name: /Expand panel/i });
      fireEvent.click(expandBtn);
      expect(screen.getByText('Quarantined Evidence Detected')).toBeInTheDocument();
    });

    it('should render retry button on error and refetch on click', async () => {
      mockedApiRequest
        .mockRejectedValueOnce(new Error('Network disconnected'))
        .mockResolvedValueOnce(mockLifecycle);

      render(
        <WorkflowLifecyclePanel
          resourceType="CONTROL"
          resourceId="ctrl-1"
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Network disconnected')).toBeInTheDocument();
      });

      const retryBtn = screen.getByRole('button', { name: /Retry/i });
      fireEvent.click(retryBtn);

      await waitFor(() => {
        expect(screen.getByText('Quarantined Evidence Detected')).toBeInTheDocument();
      });
    });
  });

  describe('AttentionRequiredWidget — Navigation & View Sanitization', () => {
    it('should normalize legacy paths and invoke onNavigateToView with canonical SPA keys', () => {
      const onNavigate = jest.fn();
      const mockItems = [
        {
          id: 'item-1',
          domain: 'OBLIGATION' as const,
          title: 'Quarterly Access Certification',
          severityOrPriority: 'HIGH',
          dueDate: '2026-10-15T00:00:00Z',
          targetView: '/compliance-tasks', // Legacy path with slash
        },
        {
          id: 'item-2',
          domain: 'AUDIT_FINDING' as const,
          title: 'Unencrypted S3 Bucket',
          severityOrPriority: 'CRITICAL',
          dueDate: '2026-10-18T00:00:00Z',
          targetView: '/business-audits', // Legacy path with slash
        },
      ];

      render(
        <AttentionRequiredWidget
          items={mockItems}
          onNavigateToView={onNavigate}
        />
      );

      expect(screen.getByText('Quarterly Access Certification')).toBeInTheDocument();
      expect(screen.getByText('Unencrypted S3 Bucket')).toBeInTheDocument();

      const boardBtn = screen.getByTitle('Open in board');
      const auditsBtn = screen.getByTitle('Open in audits');

      // Click first item (should navigate to 'board')
      fireEvent.click(boardBtn);
      expect(onNavigate).toHaveBeenCalledWith('board');

      // Click second item (should navigate to 'audits')
      fireEvent.click(auditsBtn);
      expect(onNavigate).toHaveBeenCalledWith('audits');
    });

    it('should render empty state when no items require attention', () => {
      render(
        <AttentionRequiredWidget
          items={[]}
        />
      );

      expect(screen.getByText('Zero Critical Exceptions')).toBeInTheDocument();
    });
  });
});
