import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { VerticalBarChart } from '../src/components/dashboard/charts/vertical-bar-chart';
import { VulnerabilityPostureWidget } from '../src/components/dashboard/widgets/vulnerability-posture-widget';
import { PolicyGovernanceWidget } from '../src/components/dashboard/widgets/policy-governance-widget';
import { ComplianceObligationsWidget } from '../src/components/dashboard/widgets/compliance-obligations-widget';
import { AuditReadinessWidget } from '../src/components/dashboard/widgets/audit-readiness-widget';
import { VulnerabilityMetricsDto, PolicyMetricsDto, ObligationMetricsDto, AuditMetricsDto } from '@omnigrc/shared';

describe('Consolidated Dashboard Enhancements & Policy Management Verification', () => {
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

  describe('Workstream 1: Vulnerability Posture Vertical Bar Chart', () => {
    it('should render vertical bars for Critical, High, Medium, Low severities', () => {
      const mockItems = [
        { key: 'critical', label: 'Critical', value: 4, color: '#ef4444' },
        { key: 'high', label: 'High', value: 7, color: '#f97316' },
        { key: 'medium', label: 'Medium', value: 12, color: '#f59e0b' },
        { key: 'low', label: 'Low', value: 3, color: '#22c55e' },
      ];

      render(<VerticalBarChart title="Severity Distribution" items={mockItems} />);

      expect(screen.getByText('Severity Distribution')).toBeInTheDocument();
      expect(screen.getByText('Critical')).toBeInTheDocument();
      expect(screen.getByText('High')).toBeInTheDocument();
      expect(screen.getByText('Medium')).toBeInTheDocument();
      expect(screen.getByText('Low')).toBeInTheDocument();
      expect(screen.getByText('4')).toBeInTheDocument();
      expect(screen.getByText('7')).toBeInTheDocument();
      expect(screen.getByText('12')).toBeInTheDocument();
      expect(screen.getByText('3')).toBeInTheDocument();
    });

    it('should display empty message when all severity values are 0', () => {
      const mockZeroItems = [
        { key: 'critical', label: 'Critical', value: 0, color: '#ef4444' },
        { key: 'high', label: 'High', value: 0, color: '#f97316' },
      ];

      render(<VerticalBarChart items={mockZeroItems} emptyMessage="No vulnerabilities registered" />);
      expect(screen.getByText('No vulnerabilities registered')).toBeInTheDocument();
    });

    it('should replace donut chart in VulnerabilityPostureWidget with VerticalBarChart and invoke onNavigateToView on bar click', () => {
      const mockNavigate = jest.fn();
      const mockVulnMetrics: VulnerabilityMetricsDto = {
        total: 10,
        openCount: 6,
        overdueCount: 2,
        resolvedCount: 3,
        riskAcceptedCount: 1,
        bySeverity: {
          CRITICAL: 2,
          HIGH: 3,
          MEDIUM: 4,
          LOW: 1,
        },
        isAvailable: true,
      };

      render(<VulnerabilityPostureWidget metrics={mockVulnMetrics} onNavigateToView={mockNavigate} />);

      // Verify title & VerticalBarChart presence
      expect(screen.getByText('Vulnerability Posture')).toBeInTheDocument();
      expect(screen.getByText(/Severity Distribution/i)).toBeInTheDocument();

      // Click the Critical bar button
      const criticalBar = screen.getByTitle('Critical: 2');
      expect(criticalBar).toBeInTheDocument();
      fireEvent.click(criticalBar);

      expect(mockNavigate).toHaveBeenCalledWith('vulnerabilities', { initialSeverity: 'CRITICAL' });

      // Click High bar button
      const highBar = screen.getByTitle('High: 3');
      fireEvent.click(highBar);
      expect(mockNavigate).toHaveBeenCalledWith('vulnerabilities', { initialSeverity: 'HIGH' });
    });
  });

  describe('Workstream 2: Interactive Drill-Down Navigation', () => {
    it('PolicyGovernanceWidget should navigate to filtered policies when clicking donut segments', () => {
      const mockNavigate = jest.fn();
      const mockPolicyMetrics: PolicyMetricsDto = {
        total: 8,
        publishedCount: 5,
        overdueReviewCount: 1,
        pendingExceptionsCount: 1,
        byStatus: {
          PUBLISHED: 5,
          UNDER_REVIEW: 1,
          APPROVED: 1,
          DRAFT: 1,
          RETIRED: 0,
        },
        isAvailable: true,
      };

      render(<PolicyGovernanceWidget metrics={mockPolicyMetrics} onNavigateToView={mockNavigate} />);

      // Find published legend row and click it
      const publishedRow = screen.getByText('Published');
      fireEvent.click(publishedRow);
      expect(mockNavigate).toHaveBeenCalledWith('policies', { initialStatus: 'PUBLISHED' });

      // Find Under Review legend row and click it
      const underReviewRow = screen.getByText('Under Review');
      fireEvent.click(underReviewRow);
      expect(mockNavigate).toHaveBeenCalledWith('policies', { initialStatus: 'UNDER_REVIEW' });

      // Click Overdue Review card
      const overdueCard = screen.getByTitle('Filter Policies Requiring Cadence Review');
      fireEvent.click(overdueCard);
      expect(mockNavigate).toHaveBeenCalledWith('policies', { filter: 'overdue' });
    });

    it('ComplianceObligationsWidget should navigate to compliance board with initialFilter', () => {
      const mockNavigate = jest.fn();
      const mockObligationMetrics: ObligationMetricsDto = {
        total: 15,
        completedCount: 9,
        upcomingCount: 4,
        overdueCount: 2,
        completionRate: 60,
        isAvailable: true,
      };

      render(<ComplianceObligationsWidget metrics={mockObligationMetrics} onNavigateToView={mockNavigate} />);

      // Click Completed Tasks
      const completedRow = screen.getByText('Completed Tasks');
      fireEvent.click(completedRow);
      expect(mockNavigate).toHaveBeenCalledWith('board', { initialFilter: 'completed' });

      // Click Overdue summary card
      const overdueCard = screen.getByTitle('Filter Overdue Tasks');
      fireEvent.click(overdueCard);
      expect(mockNavigate).toHaveBeenCalledWith('board', expect.objectContaining({ filter: 'overdue' }));
    });

    it('AuditReadinessWidget should navigate to audits with initialStatus and initialTab', () => {
      const mockNavigate = jest.fn();
      const mockAuditMetrics: AuditMetricsDto = {
        overallAuditScore: 88,
        totalPlans: 4,
        assessmentCount: 6,
        findingsOpenCount: 3,
        capaOpenCount: 2,
        byPlanStatus: {
          IN_PROGRESS: 2,
          PLANNED: 1,
          COMPLETED: 1,
          DRAFT: 0,
        },
        byCapaStatus: {
          OPEN: 2,
          CLOSED: 1,
        },
        isAvailable: true,
      };

      render(<AuditReadinessWidget metrics={mockAuditMetrics} onNavigateToView={mockNavigate} />);

      // Click In Progress legend row
      const inProgressRow = screen.getByText('In Progress');
      fireEvent.click(inProgressRow);
      expect(mockNavigate).toHaveBeenCalledWith('audits', { initialStatus: 'IN_PROGRESS' });

      // Click Open Findings
      const openFindings = screen.getByText(/Open Findings:/i);
      fireEvent.click(openFindings);
      expect(mockNavigate).toHaveBeenCalledWith('audits', expect.objectContaining({ initialTab: 'findings', initialStatus: 'OPEN' }));
    });
  });
});

