import { Injectable } from '@nestjs/common';
import { ReportMetaDto, ReportType } from '@omnigrc/shared';

@Injectable()
export class ReportsRegistry {
  private readonly registry: Map<ReportType, ReportMetaDto> = new Map();

  constructor() {
    this.registerDefaultReports();
  }

  private registerDefaultReports() {
    const reports: ReportMetaDto[] = [
      {
        id: ReportType.EXECUTIVE_GRC_POSTURE,
        title: 'Executive GRC Posture Report',
        category: 'Executive Summary',
        description: 'Comprehensive overview of organization GRC posture synthesized across all core domains via Phase 13 Metrics.',
        supportedFilters: [],
        allowlistedSortFields: [],
        exportFormats: ['csv', 'xlsx'],
        columns: [
          { key: 'domain', header: 'GRC Domain', dataType: 'string' },
          { key: 'metricName', header: 'Metric Name', dataType: 'string' },
          { key: 'metricValue', header: 'Value', dataType: 'number' },
          { key: 'unit', header: 'Unit / Context', dataType: 'string' },
        ],
      },
      {
        id: ReportType.VULNERABILITY_REPORT,
        title: 'Vulnerability Report',
        category: 'Security Operations',
        description: 'Detailed inventory of security vulnerabilities, severity levels, remediation SLA dates, and affected assets.',
        supportedFilters: ['severity', 'status', 'overdue', 'search'],
        allowlistedSortFields: ['createdAt', 'severity', 'title', 'dueDate', 'status'],
        defaultSortBy: 'createdAt',
        defaultSortDirection: 'desc',
        exportFormats: ['csv', 'xlsx'],
        columns: [
          { key: 'title', header: 'Vulnerability Title', dataType: 'string' },
          { key: 'cveId', header: 'CVE ID', dataType: 'string' },
          { key: 'severity', header: 'Severity', dataType: 'badge' },
          { key: 'status', header: 'Status', dataType: 'badge' },
          { key: 'affectedAssetCount', header: 'Affected Assets', dataType: 'number' },
          { key: 'remediationOwner', header: 'Remediation Owner', dataType: 'string' },
          { key: 'dueDate', header: 'Due Date', dataType: 'date' },
          { key: 'isOverdue', header: 'SLA Overdue', dataType: 'boolean' },
          { key: 'discoveredAt', header: 'Discovered Date', dataType: 'date' },
        ],
      },
      {
        id: ReportType.ASSET_INVENTORY_REPORT,
        title: 'Asset Inventory Report',
        category: 'Asset Management',
        description: 'Complete inventory of enterprise hardware, software, vendor, and data store assets with criticality and environment metadata.',
        supportedFilters: ['type', 'environment', 'criticality', 'isManaged', 'search'],
        allowlistedSortFields: ['createdAt', 'name', 'criticality', 'type', 'environment'],
        defaultSortBy: 'createdAt',
        defaultSortDirection: 'desc',
        exportFormats: ['csv', 'xlsx'],
        columns: [
          { key: 'name', header: 'Asset Name', dataType: 'string' },
          { key: 'type', header: 'Asset Type', dataType: 'badge' },
          { key: 'environment', header: 'Environment', dataType: 'badge' },
          { key: 'criticality', header: 'Criticality', dataType: 'badge' },
          { key: 'isManaged', header: 'Managed', dataType: 'boolean' },
          { key: 'owner', header: 'Owner', dataType: 'string' },
          { key: 'vendorName', header: 'Vendor', dataType: 'string' },
          { key: 'dataResidencyRegion', header: 'Region', dataType: 'string' },
          { key: 'createdAt', header: 'Created Date', dataType: 'date' },
        ],
      },
      {
        id: ReportType.POLICY_GOVERNANCE_REPORT,
        title: 'Policy Governance Report',
        category: 'Governance & Policies',
        description: 'Corporate policies, current publication status, review cadences, and review overdue indicators.',
        supportedFilters: ['status', 'overdueReview', 'search'],
        allowlistedSortFields: ['createdAt', 'title', 'reviewDate', 'status', 'code'],
        defaultSortBy: 'createdAt',
        defaultSortDirection: 'desc',
        exportFormats: ['csv', 'xlsx'],
        columns: [
          { key: 'code', header: 'Policy Code', dataType: 'string' },
          { key: 'title', header: 'Policy Title', dataType: 'string' },
          { key: 'category', header: 'Category', dataType: 'string' },
          { key: 'status', header: 'Status', dataType: 'badge' },
          { key: 'publishedVersionNumber', header: 'Published Version', dataType: 'string' },
          { key: 'reviewCadenceDays', header: 'Review Cadence (Days)', dataType: 'number' },
          { key: 'reviewDate', header: 'Review Date', dataType: 'date' },
          { key: 'isReviewOverdue', header: 'Review Overdue', dataType: 'boolean' },
          { key: 'createdAt', header: 'Created Date', dataType: 'date' },
        ],
      },
      {
        id: ReportType.VENDOR_RISK_REPORT,
        title: 'Vendor Risk Report',
        category: 'Third-Party Risk',
        description: 'Third-party vendor inventory, criticality classifications, review dates, and vendor assessment statuses.',
        supportedFilters: ['criticality', 'status', 'requiringReview', 'search'],
        allowlistedSortFields: ['createdAt', 'name', 'criticality', 'nextReviewDate', 'status'],
        defaultSortBy: 'createdAt',
        defaultSortDirection: 'desc',
        exportFormats: ['csv', 'xlsx'],
        columns: [
          { key: 'name', header: 'Vendor Name', dataType: 'string' },
          { key: 'category', header: 'Category', dataType: 'string' },
          { key: 'criticality', header: 'Criticality', dataType: 'badge' },
          { key: 'status', header: 'Status', dataType: 'badge' },
          { key: 'owner', header: 'Owner', dataType: 'string' },
          { key: 'reviewCadenceDays', header: 'Review Cadence (Days)', dataType: 'number' },
          { key: 'lastReviewedAt', header: 'Last Reviewed', dataType: 'date' },
          { key: 'nextReviewDate', header: 'Next Review Date', dataType: 'date' },
          { key: 'isReviewRequired', header: 'Review Required', dataType: 'boolean' },
          { key: 'assessmentCount', header: 'Assessments', dataType: 'number' },
        ],
      },
      {
        id: ReportType.COMPLIANCE_OBLIGATION_REPORT,
        title: 'Compliance / Obligation Report',
        category: 'Compliance & Audit',
        description: 'Authoritative recurring compliance tasks and obligations (cadence != ONE_OFF OR obligationReference IS NOT NULL).',
        supportedFilters: ['status', 'cadence', 'overdue', 'search'],
        allowlistedSortFields: ['dueDate', 'title', 'status', 'cadence', 'createdAt'],
        defaultSortBy: 'dueDate',
        defaultSortDirection: 'asc',
        exportFormats: ['csv', 'xlsx'],
        columns: [
          { key: 'title', header: 'Task / Obligation Title', dataType: 'string' },
          { key: 'obligationReference', header: 'Obligation Ref', dataType: 'string' },
          { key: 'cadence', header: 'Cadence', dataType: 'badge' },
          { key: 'status', header: 'Status', dataType: 'badge' },
          { key: 'owner', header: 'Owner', dataType: 'string' },
          { key: 'controlName', header: 'Control', dataType: 'string' },
          { key: 'dueDate', header: 'Due Date', dataType: 'date' },
          { key: 'isOverdue', header: 'Overdue', dataType: 'boolean' },
          { key: 'lastCompletedAt', header: 'Last Completed', dataType: 'date' },
        ],
      },
      {
        id: ReportType.BUSINESS_AUDIT_REPORT,
        title: 'Business Audit Report',
        category: 'Business Audits',
        description: 'Business audit plans, schedules, stored assessment scores, findings, and CAPA remediation progress.',
        supportedFilters: ['status', 'search'],
        allowlistedSortFields: ['createdAt', 'title', 'status', 'plannedStartDate'],
        defaultSortBy: 'createdAt',
        defaultSortDirection: 'desc',
        exportFormats: ['csv', 'xlsx'],
        columns: [
          { key: 'title', header: 'Audit Plan Title', dataType: 'string' },
          { key: 'frameworkCode', header: 'Framework', dataType: 'string' },
          { key: 'status', header: 'Plan Status', dataType: 'badge' },
          { key: 'ownerId', header: 'Owner ID', dataType: 'string' },
          { key: 'assessmentCount', header: 'Assessments', dataType: 'number' },
          { key: 'latestAssessmentScore', header: 'Latest Score (%)', dataType: 'number' },
          { key: 'findingsTotal', header: 'Findings Total', dataType: 'number' },
          { key: 'findingsOpen', header: 'Findings Open', dataType: 'number' },
          { key: 'findingsOverdue', header: 'Findings Overdue', dataType: 'number' },
          { key: 'capaOpenCount', header: 'CAPAs Open', dataType: 'number' },
        ],
      },
      {
        id: ReportType.RISK_REGISTER_REPORT,
        title: 'Risk Register Report',
        category: 'Risk Management',
        description: 'Enterprise risk log, likelihood x impact scores, score bands (HIGH >=15, MEDIUM 8-14, LOW 1-7), and treatment plans.',
        supportedFilters: ['status', 'scoreBand', 'search'],
        allowlistedSortFields: ['createdAt', 'title', 'score', 'status'],
        defaultSortBy: 'createdAt',
        defaultSortDirection: 'desc',
        exportFormats: ['csv', 'xlsx'],
        columns: [
          { key: 'title', header: 'Risk Title', dataType: 'string' },
          { key: 'owner', header: 'Risk Owner', dataType: 'string' },
          { key: 'likelihood', header: 'Likelihood (1-5)', dataType: 'number' },
          { key: 'impact', header: 'Impact (1-5)', dataType: 'number' },
          { key: 'score', header: 'Score', dataType: 'number' },
          { key: 'scoreBand', header: 'Score Band', dataType: 'badge' },
          { key: 'status', header: 'Status', dataType: 'badge' },
          { key: 'assetName', header: 'Associated Asset', dataType: 'string' },
          { key: 'treatmentPlan', header: 'Treatment Plan', dataType: 'string' },
          { key: 'createdAt', header: 'Created Date', dataType: 'date' },
        ],
      },
    ];

    for (const report of reports) {
      this.registry.set(report.id, report);
    }
  }

  public getAll(): ReportMetaDto[] {
    return Array.from(this.registry.values());
  }

  public get(id: ReportType): ReportMetaDto | undefined {
    return this.registry.get(id);
  }

  public validateSortField(id: ReportType, sortBy?: string): string | undefined {
    const meta = this.get(id);
    if (!meta || !sortBy) return meta?.defaultSortBy;
    if (meta.allowlistedSortFields.includes(sortBy)) {
      return sortBy;
    }
    return meta.defaultSortBy;
  }
}
