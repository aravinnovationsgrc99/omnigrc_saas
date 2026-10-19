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
        supportedFilters: ['status', 'frameworkCode', 'frameworkId', 'search'],
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

      // ─── Phase 4B: Workbook-required reports ──────────────────────────────

      // Audit Management – criterion 1: Audit Status & Summary Report
      {
        id: ReportType.AUDIT_STATUS_SUMMARY,
        title: 'Audit Status & Summary Report',
        category: 'Audit Management',
        description: 'Audit plan, audits completed/in-progress/pending, findings and overall status.',
        supportedFilters: ['status', 'frameworkCode', 'frameworkId', 'search'],
        allowlistedSortFields: ['createdAt', 'title', 'status', 'plannedStartDate'],
        defaultSortBy: 'createdAt',
        defaultSortDirection: 'desc',
        exportFormats: ['csv', 'xlsx'],
        columns: [
          { key: 'title', header: 'Audit Plan Title', dataType: 'string' },
          { key: 'frameworkCode', header: 'Framework', dataType: 'string' },
          { key: 'status', header: 'Plan Status', dataType: 'badge' },
          { key: 'ownerId', header: 'Owner', dataType: 'string' },
          { key: 'plannedStartDate', header: 'Planned Start', dataType: 'date' },
          { key: 'plannedEndDate', header: 'Planned End', dataType: 'date' },
          { key: 'assessmentCount', header: 'Assessments', dataType: 'number' },
          { key: 'completedAssessments', header: 'Completed Assessments', dataType: 'number' },
          { key: 'inProgressAssessments', header: 'In-Progress Assessments', dataType: 'number' },
          { key: 'findingsTotal', header: 'Findings Total', dataType: 'number' },
          { key: 'findingsOpen', header: 'Findings Open', dataType: 'number' },
          { key: 'latestScore', header: 'Latest Score (%)', dataType: 'number' },
        ],
      },

      // Audit Management – criterion 2: Audit Findings Report
      {
        id: ReportType.AUDIT_FINDINGS,
        title: 'Audit Findings Report',
        category: 'Audit Management',
        description: 'Findings by severity, status, owner, ageing and due date.',
        supportedFilters: ['status', 'severity', 'overdue', 'search'],
        allowlistedSortFields: ['createdAt', 'severity', 'status', 'dueDate', 'ageingDays'],
        defaultSortBy: 'createdAt',
        defaultSortDirection: 'desc',
        exportFormats: ['csv', 'xlsx'],
        columns: [
          { key: 'title', header: 'Finding Title', dataType: 'string' },
          { key: 'severity', header: 'Severity', dataType: 'badge' },
          { key: 'status', header: 'Status', dataType: 'badge' },
          { key: 'ownerId', header: 'Owner', dataType: 'string' },
          { key: 'auditPlanTitle', header: 'Audit Plan', dataType: 'string' },
          { key: 'dueDate', header: 'Due Date', dataType: 'date' },
          { key: 'ageingDays', header: 'Ageing (Days)', dataType: 'number' },
          { key: 'isOverdue', header: 'Overdue', dataType: 'boolean' },
          { key: 'capaCount', header: 'CAPAs', dataType: 'number' },
          { key: 'createdAt', header: 'Raised Date', dataType: 'date' },
        ],
      },

      // Audit Management – criterion 3: Audit Compliance/Closure Report
      {
        id: ReportType.AUDIT_COMPLIANCE_CLOSURE,
        title: 'Audit Compliance/Closure Report',
        category: 'Audit Management',
        description: 'Open vs. closed findings, overdue actions and closure trends.',
        supportedFilters: ['status', 'overdue', 'frameworkCode', 'search'],
        allowlistedSortFields: ['createdAt', 'status', 'dueDate'],
        defaultSortBy: 'createdAt',
        defaultSortDirection: 'desc',
        exportFormats: ['csv', 'xlsx'],
        columns: [
          { key: 'title', header: 'Finding Title', dataType: 'string' },
          { key: 'auditPlanTitle', header: 'Audit Plan', dataType: 'string' },
          { key: 'severity', header: 'Severity', dataType: 'badge' },
          { key: 'status', header: 'Status', dataType: 'badge' },
          { key: 'ownerId', header: 'Owner', dataType: 'string' },
          { key: 'dueDate', header: 'Due Date', dataType: 'date' },
          { key: 'isOverdue', header: 'Overdue', dataType: 'boolean' },
          { key: 'openCapaCount', header: 'Open CAPAs', dataType: 'number' },
          { key: 'closedCapaCount', header: 'Closed CAPAs', dataType: 'number' },
          { key: 'closedAt', header: 'Closed / Verified At', dataType: 'date' },
          { key: 'createdAt', header: 'Raised Date', dataType: 'date' },
        ],
      },

      // Policy Management – criterion 4: Policy Status Report
      {
        id: ReportType.POLICY_STATUS,
        title: 'Policy Status Report',
        category: 'Policy Management',
        description: 'Draft, under review, approved, published and expired policies.',
        supportedFilters: ['status', 'search'],
        allowlistedSortFields: ['createdAt', 'title', 'status', 'code'],
        defaultSortBy: 'createdAt',
        defaultSortDirection: 'desc',
        exportFormats: ['csv', 'xlsx'],
        columns: [
          { key: 'code', header: 'Policy Code', dataType: 'string' },
          { key: 'title', header: 'Policy Title', dataType: 'string' },
          { key: 'category', header: 'Category', dataType: 'string' },
          { key: 'status', header: 'Status', dataType: 'badge' },
          { key: 'currentVersionNumber', header: 'Current Version', dataType: 'string' },
          { key: 'publishedVersionNumber', header: 'Published Version', dataType: 'string' },
          { key: 'createdAt', header: 'Created Date', dataType: 'date' },
        ],
      },

      // Policy Management – criterion 5: Policy Review & Expiry Report
      {
        id: ReportType.POLICY_REVIEW_EXPIRY,
        title: 'Policy Review & Expiry Report',
        category: 'Policy Management',
        description: 'Policies due for review, overdue reviews and upcoming expirations.',
        supportedFilters: ['overdueReview', 'status', 'search'],
        allowlistedSortFields: ['createdAt', 'title', 'reviewDate', 'status'],
        defaultSortBy: 'reviewDate',
        defaultSortDirection: 'asc',
        exportFormats: ['csv', 'xlsx'],
        columns: [
          { key: 'code', header: 'Policy Code', dataType: 'string' },
          { key: 'title', header: 'Policy Title', dataType: 'string' },
          { key: 'status', header: 'Status', dataType: 'badge' },
          { key: 'reviewCadenceDays', header: 'Review Cadence (Days)', dataType: 'number' },
          { key: 'lastReviewDate', header: 'Last Review Date', dataType: 'date' },
          { key: 'nextReviewDate', header: 'Next Review Date', dataType: 'date' },
          { key: 'isReviewOverdue', header: 'Review Overdue', dataType: 'boolean' },
          { key: 'daysUntilNextReview', header: 'Days Until Next Review', dataType: 'number' },
        ],
      },

      // Policy Management – criterion 6: Policy Acknowledgement Report
      {
        id: ReportType.POLICY_ACKNOWLEDGEMENT,
        title: 'Policy Acknowledgement Report',
        category: 'Policy Management',
        description: 'User-wise/group-wise acknowledgement status and pending acknowledgements.',
        supportedFilters: ['status', 'search'],
        allowlistedSortFields: ['createdAt', 'title', 'acknowledgedCount', 'pendingCount'],
        defaultSortBy: 'createdAt',
        defaultSortDirection: 'desc',
        exportFormats: ['csv', 'xlsx'],
        columns: [
          { key: 'code', header: 'Policy Code', dataType: 'string' },
          { key: 'title', header: 'Policy Title', dataType: 'string' },
          { key: 'status', header: 'Status', dataType: 'badge' },
          { key: 'publishedVersionNumber', header: 'Published Version', dataType: 'string' },
          { key: 'totalOrgMembers', header: 'Total Members', dataType: 'number' },
          { key: 'acknowledgedCount', header: 'Acknowledged', dataType: 'number' },
          { key: 'pendingCount', header: 'Pending', dataType: 'number' },
          { key: 'acknowledgementRate', header: 'Acknowledgement Rate (%)', dataType: 'number' },
        ],
      },

      // Risk Management – criterion 7: Risk Heatmap / Risk Summary Report
      {
        id: ReportType.RISK_HEATMAP,
        title: 'Risk Heatmap / Risk Summary Report',
        category: 'Risk Management',
        description: 'Risk distribution based on likelihood, impact and overall rating.',
        supportedFilters: ['status', 'search'],
        allowlistedSortFields: ['likelihood', 'impact', 'score', 'createdAt'],
        defaultSortBy: 'score',
        defaultSortDirection: 'desc',
        exportFormats: ['csv', 'xlsx'],
        columns: [
          { key: 'likelihood', header: 'Likelihood (1-5)', dataType: 'number' },
          { key: 'impact', header: 'Impact (1-5)', dataType: 'number' },
          { key: 'scoreBand', header: 'Score Band', dataType: 'badge' },
          { key: 'count', header: 'Risk Count', dataType: 'number' },
        ],
      },

      // Risk Management – criterion 8: Risk Treatment & Ageing Report
      {
        id: ReportType.RISK_TREATMENT_AGEING,
        title: 'Risk Treatment & Ageing Report',
        category: 'Risk Management',
        description: 'Open treatments, overdue actions, owners and residual risk.',
        supportedFilters: ['status', 'overdue', 'search'],
        allowlistedSortFields: ['createdAt', 'title', 'treatmentDueDate', 'score'],
        defaultSortBy: 'treatmentDueDate',
        defaultSortDirection: 'asc',
        exportFormats: ['csv', 'xlsx'],
        columns: [
          { key: 'title', header: 'Risk Title', dataType: 'string' },
          { key: 'owner', header: 'Risk Owner', dataType: 'string' },
          { key: 'score', header: 'Inherent Score', dataType: 'number' },
          { key: 'scoreBand', header: 'Inherent Band', dataType: 'badge' },
          { key: 'residualScore', header: 'Residual Score', dataType: 'number' },
          { key: 'treatmentStrategy', header: 'Treatment Strategy', dataType: 'string' },
          { key: 'treatmentOwner', header: 'Treatment Owner', dataType: 'string' },
          { key: 'treatmentStatus', header: 'Treatment Status', dataType: 'badge' },
          { key: 'treatmentDueDate', header: 'Treatment Due Date', dataType: 'date' },
          { key: 'isTreatmentOverdue', header: 'Treatment Overdue', dataType: 'boolean' },
          { key: 'ageingDays', header: 'Risk Age (Days)', dataType: 'number' },
        ],
      },

      // Vendor Management – criterion 9: Vendor Assessment Report
      {
        id: ReportType.VENDOR_ASSESSMENT,
        title: 'Vendor Assessment Report',
        category: 'Third-Party Risk',
        description: 'Assessment status, questionnaire completion, gaps and pending actions.',
        supportedFilters: ['status', 'criticality', 'search'],
        allowlistedSortFields: ['createdAt', 'title', 'status', 'score'],
        defaultSortBy: 'createdAt',
        defaultSortDirection: 'desc',
        exportFormats: ['csv', 'xlsx'],
        columns: [
          { key: 'vendorName', header: 'Vendor Name', dataType: 'string' },
          { key: 'vendorCriticality', header: 'Criticality', dataType: 'badge' },
          { key: 'title', header: 'Assessment Title', dataType: 'string' },
          { key: 'status', header: 'Assessment Status', dataType: 'badge' },
          { key: 'score', header: 'Score', dataType: 'number' },
          { key: 'questionnaireCount', header: 'Questionnaires', dataType: 'number' },
          { key: 'submittedQuestionnaires', header: 'Submitted', dataType: 'number' },
          { key: 'openActionCount', header: 'Open Actions', dataType: 'number' },
          { key: 'completedAt', header: 'Completed At', dataType: 'date' },
          { key: 'createdAt', header: 'Created Date', dataType: 'date' },
        ],
      },

      // Vendor Management – criterion 10: Vendor Review & Renewal Report
      {
        id: ReportType.VENDOR_REVIEW_RENEWAL,
        title: 'Vendor Review & Renewal Report',
        category: 'Third-Party Risk',
        description: 'Upcoming/overdue reviews, contracts/renewals and vendor actions.',
        supportedFilters: ['criticality', 'status', 'requiringReview', 'search'],
        allowlistedSortFields: ['createdAt', 'name', 'nextReviewDate', 'criticality'],
        defaultSortBy: 'nextReviewDate',
        defaultSortDirection: 'asc',
        exportFormats: ['csv', 'xlsx'],
        columns: [
          { key: 'name', header: 'Vendor Name', dataType: 'string' },
          { key: 'category', header: 'Category', dataType: 'string' },
          { key: 'criticality', header: 'Criticality', dataType: 'badge' },
          { key: 'status', header: 'Status', dataType: 'badge' },
          { key: 'owner', header: 'Owner', dataType: 'string' },
          { key: 'lastReviewedAt', header: 'Last Reviewed', dataType: 'date' },
          { key: 'nextReviewDate', header: 'Next Review Date', dataType: 'date' },
          { key: 'isReviewOverdue', header: 'Review Overdue', dataType: 'boolean' },
          { key: 'daysUntilReview', header: 'Days Until Review', dataType: 'number' },
          { key: 'openAssessmentCount', header: 'Open Assessments', dataType: 'number' },
        ],
      },

      // Vulnerability Management – criterion 11: Vulnerability Summary Report
      {
        id: ReportType.VULNERABILITY_SUMMARY,
        title: 'Vulnerability Summary Report',
        category: 'Security Operations',
        description: 'Total vulnerabilities by severity, asset, status and category.',
        supportedFilters: ['severity', 'status', 'search'],
        allowlistedSortFields: ['severity', 'count', 'createdAt'],
        defaultSortBy: 'count',
        defaultSortDirection: 'desc',
        exportFormats: ['csv', 'xlsx'],
        columns: [
          { key: 'severity', header: 'Severity', dataType: 'badge' },
          { key: 'count', header: 'Total', dataType: 'number' },
          { key: 'openCount', header: 'Open', dataType: 'number' },
          { key: 'inRemediationCount', header: 'In Remediation', dataType: 'number' },
          { key: 'resolvedCount', header: 'Resolved', dataType: 'number' },
          { key: 'riskAcceptedCount', header: 'Risk Accepted', dataType: 'number' },
          { key: 'overdueCount', header: 'SLA Overdue', dataType: 'number' },
        ],
      },

      // Vulnerability Management – criterion 12: Vulnerability SLA & Ageing Report
      {
        id: ReportType.VULNERABILITY_SLA_AGEING,
        title: 'Vulnerability SLA & Ageing Report',
        category: 'Security Operations',
        description: 'Open, overdue and SLA-breached vulnerabilities with ageing.',
        supportedFilters: ['severity', 'status', 'overdue', 'search'],
        allowlistedSortFields: ['createdAt', 'severity', 'dueDate', 'ageingDays'],
        defaultSortBy: 'dueDate',
        defaultSortDirection: 'asc',
        exportFormats: ['csv', 'xlsx'],
        columns: [
          { key: 'title', header: 'Vulnerability Title', dataType: 'string' },
          { key: 'cveId', header: 'CVE ID', dataType: 'string' },
          { key: 'severity', header: 'Severity', dataType: 'badge' },
          { key: 'status', header: 'Status', dataType: 'badge' },
          { key: 'remediationOwner', header: 'Remediation Owner', dataType: 'string' },
          { key: 'discoveredAt', header: 'Discovered Date', dataType: 'date' },
          { key: 'dueDate', header: 'SLA Due Date', dataType: 'date' },
          { key: 'ageingDays', header: 'Ageing (Days)', dataType: 'number' },
          { key: 'isOverdue', header: 'SLA Breached', dataType: 'boolean' },
        ],
      },

      // Incident Management – criterion 13: Incident Summary Report
      {
        id: ReportType.INCIDENT_SUMMARY,
        title: 'Incident Summary Report',
        category: 'Incident Management',
        description: 'Incidents by category, severity, priority, status and business unit.',
        supportedFilters: ['status', 'severity', 'search'],
        allowlistedSortFields: ['severity', 'count'],
        defaultSortBy: 'count',
        defaultSortDirection: 'desc',
        exportFormats: ['csv', 'xlsx'],
        columns: [
          { key: 'severity', header: 'Severity', dataType: 'badge' },
          { key: 'count', header: 'Total', dataType: 'number' },
          { key: 'openCount', header: 'Open', dataType: 'number' },
          { key: 'inProgressCount', header: 'In Progress', dataType: 'number' },
          { key: 'containedCount', header: 'Contained', dataType: 'number' },
          { key: 'resolvedCount', header: 'Resolved', dataType: 'number' },
          { key: 'closedCount', header: 'Closed', dataType: 'number' },
        ],
      },

      // Incident Management – criterion 14: Incident SLA & Ageing Report
      {
        id: ReportType.INCIDENT_SLA_AGEING,
        title: 'Incident SLA & Ageing Report',
        category: 'Incident Management',
        description: 'Open, overdue, breached and closed incidents with ageing information.',
        supportedFilters: ['status', 'severity', 'overdue', 'search'],
        allowlistedSortFields: ['createdAt', 'severity', 'dueDate', 'ageingDays'],
        defaultSortBy: 'dueDate',
        defaultSortDirection: 'asc',
        exportFormats: ['csv', 'xlsx'],
        columns: [
          { key: 'title', header: 'Incident Title', dataType: 'string' },
          { key: 'category', header: 'Category', dataType: 'string' },
          { key: 'severity', header: 'Severity', dataType: 'badge' },
          { key: 'priority', header: 'Priority', dataType: 'string' },
          { key: 'status', header: 'Status', dataType: 'badge' },
          { key: 'owner', header: 'Owner', dataType: 'string' },
          { key: 'businessUnit', header: 'Business Unit', dataType: 'string' },
          { key: 'detectedAt', header: 'Detected Date', dataType: 'date' },
          { key: 'dueDate', header: 'SLA Due Date', dataType: 'date' },
          { key: 'ageingDays', header: 'Ageing (Days)', dataType: 'number' },
          { key: 'isOverdue', header: 'SLA Breached', dataType: 'boolean' },
        ],
      },

      // Incident Management – criterion 15: Incident RCA & Closure Report
      {
        id: ReportType.INCIDENT_RCA_CLOSURE,
        title: 'Incident RCA & Closure Report',
        category: 'Incident Management',
        description: 'RCA status, corrective actions, recommendations and closure status.',
        supportedFilters: ['status', 'severity', 'search'],
        allowlistedSortFields: ['createdAt', 'severity', 'status', 'resolvedAt'],
        defaultSortBy: 'resolvedAt',
        defaultSortDirection: 'desc',
        exportFormats: ['csv', 'xlsx'],
        columns: [
          { key: 'title', header: 'Incident Title', dataType: 'string' },
          { key: 'severity', header: 'Severity', dataType: 'badge' },
          { key: 'status', header: 'Status', dataType: 'badge' },
          { key: 'owner', header: 'Owner', dataType: 'string' },
          { key: 'rootCauseProvided', header: 'Root Cause Provided', dataType: 'boolean' },
          { key: 'rootCauseSummary', header: 'Root Cause Summary', dataType: 'string' },
          { key: 'correctiveActionCount', header: 'Corrective Actions', dataType: 'number' },
          { key: 'openActionCount', header: 'Open Actions', dataType: 'number' },
          { key: 'resolvedAt', header: 'Resolved At', dataType: 'date' },
          { key: 'closedAt', header: 'Closed At', dataType: 'date' },
          { key: 'detectedAt', header: 'Detected Date', dataType: 'date' },
        ],
      },

    ]; // end of reports array

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
