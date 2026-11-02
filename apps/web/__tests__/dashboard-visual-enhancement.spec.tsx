import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import { RiskHeatmapWidget } from '../src/components/dashboard/widgets/risk-heatmap-widget';
import { RiskOverviewWidget } from '../src/components/dashboard/widgets/risk-overview-widget';
import { VendorRiskWidget } from '../src/components/dashboard/widgets/vendor-risk-widget';
import { PolicyGovernanceWidget } from '../src/components/dashboard/widgets/policy-governance-widget';
import { VulnerabilityPostureWidget } from '../src/components/dashboard/widgets/vulnerability-posture-widget';
import { ComplianceObligationsWidget } from '../src/components/dashboard/widgets/compliance-obligations-widget';
import { AuditReadinessWidget } from '../src/components/dashboard/widgets/audit-readiness-widget';
import { OpenFindingsBySeverityWidget } from '../src/components/dashboard/widgets/open-findings-by-severity-widget';
import { EntitledFrameworkCoverageWidget } from '../src/components/dashboard/widgets/entitled-framework-coverage-widget';
import {
  OverviewMetricsDto,
  RiskScoreBand,
  HeatmapCellDto,
} from '@omnigrc/shared';

// Mock apiRequest
jest.mock('../src/lib/api-client', () => ({
  apiRequest: jest.fn(),
}));

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

describe('Dashboard Visual Enhancement & Chart-Type Restoration', () => {
  // Helper to generate a 5x5 heatmap matrix with custom populated cells
  const buildMockHeatmapMatrix = (): HeatmapCellDto[] => {
    const matrix: HeatmapCellDto[] = [];
    for (let l = 1; l <= 5; l++) {
      for (let i = 1; i <= 5; i++) {
        const score = l * i;
        let count = 0;
        // Populate specific cells
        if (l === 2 && i === 3) count = 1; // Score 6 -> LOW band (count 1)
        if (l === 3 && i === 4) count = 1; // Score 12 -> MEDIUM band (count 1)
        if (l === 4 && i === 5) count = 2; // Score 20 -> HIGH band (count 2)

        const scoreBand =
          score >= 15
            ? RiskScoreBand.HIGH
            : score >= 8
            ? RiskScoreBand.MEDIUM
            : RiskScoreBand.LOW;

        matrix.push({
          likelihood: l,
          impact: i,
          count,
          score,
          scoreBand,
        });
      }
    }
    return matrix;
  };

  const mockMetrics: OverviewMetricsDto = {
    risks: {
      totalOpen: 4,
      byScoreBand: { HIGH: 2, MEDIUM: 1, LOW: 1 },
      byStatus: { OPEN: 2, IN_TREATMENT: 2, ACCEPTED: 1, CLOSED: 2 },
      heatmap: {
        matrix: buildMockHeatmapMatrix(),
      },
      isAvailable: true,
    },
    vendors: {
      total: 10,
      byCriticality: { CRITICAL: 2, HIGH: 3, MEDIUM: 3, LOW: 2 },
      requiringReviewCount: 1,
      assessmentsOverdueCount: 1,
      isAvailable: true,
    },
    policies: {
      total: 12,
      byStatus: { PUBLISHED: 8, UNDER_REVIEW: 2, APPROVED: 1, DRAFT: 1, RETIRED: 0 },
      publishedCount: 8,
      overdueReviewCount: 2,
      pendingExceptionsCount: 1,
      isAvailable: true,
    },
    vulnerabilities: {
      total: 8,
      openCount: 5,
      overdueCount: 2,
      resolvedCount: 3,
      riskAcceptedCount: 0,
      bySeverity: { CRITICAL: 1, HIGH: 2, MEDIUM: 1, LOW: 1 },
      isAvailable: true,
    },
    obligations: {
      total: 15,
      completedCount: 10,
      upcomingCount: 3,
      overdueCount: 2,
      completionRate: 67,
      isAvailable: true,
    },
    audits: {
      totalPlans: 4,
      byPlanStatus: { IN_PROGRESS: 1, PLANNED: 1, COMPLETED: 1, DRAFT: 1 },
      assessmentCount: 2,
      overallAuditScore: 88,
      findingsTotal: 8,
      findingsOpenCount: 7,
      findingsOverdueCount: 1,
      findingsBySeverity: { CRITICAL: 1, HIGH: 2, MEDIUM: 3, LOW: 2 },
      capaOpenCount: 2,
      byCapaStatus: { OPEN: 1, IN_PROGRESS: 1, COMPLETED: 1, VERIFIED: 1 },
      activeAssessments: [],
      isAvailable: true,
    },
    controls: {
      total: 20,
      covered: 16,
      partial: 3,
      notCovered: 1,
      coveragePercentage: 80,
      isAvailable: true,
    },
    frameworkCoverage: [
      {
        frameworkId: 'fw-1',
        code: 'ISO27001',
        name: 'ISO/IEC 27001:2022',
        totalReferences: 93,
        covered: 75,
        partial: 10,
        notCovered: 8,
        coveragePercentage: 81,
      },
    ],
    assets: {
      total: 25,
      criticalityHighCount: 8,
      managedCount: 22,
      unmanagedCount: 3,
      byEnvironment: { PRODUCTION: 15, STAGING: 7, DEVELOPMENT: 3 },
      byType: { CLOUD_RESOURCE: 12, HARDWARE: 8, APPLICATION: 5 },
    },
    attentionRequired: [],
  };

  describe('1. RiskHeatmapWidget Green Box & Demo Data Behavior', () => {
    it('renders the 5x5 matrix with an unmistakable green box for low-risk data point (score < 8, count > 0)', () => {
      render(<RiskHeatmapWidget metrics={mockMetrics} />);

      // Find the cell button for Likelihood 2, Impact 3 (Score 6)
      const greenCellBtn = screen.getByLabelText(/Likelihood 2 Impact 3, 1 risks/i);
      expect(greenCellBtn).toBeInTheDocument();
      expect(greenCellBtn).toHaveTextContent('1');

      // Must have the vibrant emerald green styling (bg-emerald-500)
      expect(greenCellBtn.className).toContain('bg-emerald-500');
      expect(greenCellBtn.className).toContain('text-white');
      expect(greenCellBtn.className).toContain('font-bold');
    });

    it('renders high-risk populated cell with rose background and medium-risk with amber background', () => {
      render(<RiskHeatmapWidget metrics={mockMetrics} />);

      // Likelihood 4, Impact 5 (Score 20) -> High
      const highCellBtn = screen.getByLabelText(/Likelihood 4 Impact 5, 2 risks/i);
      expect(highCellBtn).toBeInTheDocument();
      expect(highCellBtn.className).toContain('bg-rose-500');

      // Likelihood 3, Impact 4 (Score 12) -> Medium
      const medCellBtn = screen.getByLabelText(/Likelihood 3 Impact 4, 1 risks/i);
      expect(medCellBtn).toBeInTheDocument();
      expect(medCellBtn.className).toContain('bg-amber-400');
    });

    it('renders empty cells with subtle zonal tints rather than generic grey', () => {
      render(<RiskHeatmapWidget metrics={mockMetrics} />);

      // Likelihood 1, Impact 1 (Score 1, Low zone, count 0)
      const emptyLowCell = screen.getByLabelText(/Likelihood 1 Impact 1, 0 risks/i);
      expect(emptyLowCell.className).toContain('bg-emerald-50/60');

      // Likelihood 5, Impact 5 (Score 25, High zone, count 0)
      const emptyHighCell = screen.getByLabelText(/Likelihood 5 Impact 5, 0 risks/i);
      expect(emptyHighCell.className).toContain('bg-rose-50/60');
    });
  });

  describe('2. Pie/Donut Chart Restoration', () => {
    it('RiskOverviewWidget renders DonutChart with High, Medium, Low severity distribution', () => {
      render(<RiskOverviewWidget metrics={mockMetrics.risks} />);

      expect(screen.getByText('Risk Posture Overview')).toBeInTheDocument();
      expect(screen.getByText('Severity Distribution')).toBeInTheDocument();
      expect(screen.getByText('High (15-25)')).toBeInTheDocument();
      expect(screen.getByText('Medium (8-14)')).toBeInTheDocument();
      expect(screen.getByText('Low (1-6)')).toBeInTheDocument();
      // Total open count
      expect(screen.getByText('4 Open Risks')).toBeInTheDocument();
    });

    it('VendorRiskWidget renders DonutChart with Criticality Tier Distribution', () => {
      render(<VendorRiskWidget metrics={mockMetrics.vendors} />);

      expect(screen.getByText('Third-Party Vendor Risk')).toBeInTheDocument();
      expect(screen.getByText('Criticality Tier Distribution')).toBeInTheDocument();
      expect(screen.getByText('Critical')).toBeInTheDocument();
      expect(screen.getByText('High')).toBeInTheDocument();
      expect(screen.getByText('10 Active')).toBeInTheDocument();
    });

    it('PolicyGovernanceWidget renders DonutChart for Lifecycle Status Breakdown', () => {
      render(<PolicyGovernanceWidget metrics={mockMetrics.policies} />);

      expect(screen.getByText('Policy Governance')).toBeInTheDocument();
      expect(screen.getByText('Lifecycle Status Breakdown')).toBeInTheDocument();
      expect(screen.getByText('Published')).toBeInTheDocument();
      expect(screen.getByText('Under Review')).toBeInTheDocument();
      expect(screen.getByText('67% Published')).toBeInTheDocument();
    });

    it('VulnerabilityPostureWidget renders DonutChart for Severity Distribution', () => {
      render(<VulnerabilityPostureWidget metrics={mockMetrics.vulnerabilities} />);

      expect(screen.getByText('Vulnerability Posture')).toBeInTheDocument();
      expect(screen.getByText('Severity Distribution')).toBeInTheDocument();
      expect(screen.getByText('Critical')).toBeInTheDocument();
      expect(screen.getByText('High')).toBeInTheDocument();
      expect(screen.getByText('Open Vulns')).toBeInTheDocument();
    });

    it('ComplianceObligationsWidget renders DonutChart for Task Fulfillment Status', () => {
      render(<ComplianceObligationsWidget metrics={mockMetrics.obligations} />);

      expect(screen.getByText('Compliance & Obligations')).toBeInTheDocument();
      expect(screen.getByText('Task Fulfillment Status')).toBeInTheDocument();
      expect(screen.getByText('Completed Tasks')).toBeInTheDocument();
      expect(screen.getAllByText('67%').length).toBeGreaterThanOrEqual(1);
    });

    it('AuditReadinessWidget renders DonutChart for Audit Plan Lifecycle Status', () => {
      render(<AuditReadinessWidget metrics={mockMetrics.audits} />);

      expect(screen.getByText('Audit & Remediation Readiness')).toBeInTheDocument();
      expect(screen.getByText('Audit Plan Lifecycle Status')).toBeInTheDocument();
      expect(screen.getByText('In Progress')).toBeInTheDocument();
      expect(screen.getByText('Planned')).toBeInTheDocument();
    });
  });

  describe('3. Additional Bar-Chart Widget: Open Findings by Severity', () => {
    it('renders HorizontalBarChart for Critical, High, Medium, Low audit findings', () => {
      render(<OpenFindingsBySeverityWidget metrics={mockMetrics.audits} />);

      expect(screen.getByText('Open Findings by Severity')).toBeInTheDocument();
      expect(screen.getByText('Critical')).toBeInTheDocument();
      expect(screen.getByText('High')).toBeInTheDocument();
      expect(screen.getByText('Medium')).toBeInTheDocument();
      expect(screen.getByText('Low')).toBeInTheDocument();
      expect(screen.getByText('Urgent')).toBeInTheDocument();
      expect(screen.getByText('High SLA')).toBeInTheDocument();
    });
  });

  describe('4. Entitled Framework Coverage: Preserved Horizontal Bar Chart', () => {
    it('renders horizontal bars for licensed framework coverage', () => {
      render(
        <EntitledFrameworkCoverageWidget
          metrics={mockMetrics.frameworkCoverage}
          controls={mockMetrics.controls}
        />,
      );

      expect(screen.getByText('Entitled Framework Coverage')).toBeInTheDocument();
      expect(screen.getByText(/ISO27001/i)).toBeInTheDocument();
      expect(screen.getByText('75/93 Covered')).toBeInTheDocument();
    });
  });
});
