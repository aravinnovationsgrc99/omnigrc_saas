import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { GrcQueryIntent, QueryAnalysisResult } from './grc-nlp.service';
import {
  GrcSourceCitation,
  GrcStructuredAnalysis,
  GrcDomain,
  GrcVisualizationPayload,
  GrcDataSummary,
} from '@omnigrc/shared';
import { TenantContext } from '../../tenant/tenant.context';

// Backward compatibility alias for existing test suites
export enum LiveDataIntent {
  MY_OPEN_RISKS = 'MY_OPEN_RISKS',
  MY_PENDING_APPROVALS = 'MY_PENDING_APPROVALS',
  MY_COMPLIANCE_TASKS = 'MY_COMPLIANCE_TASKS',
  ORGANIZATION_CONTROLS_SUMMARY = 'ORGANIZATION_CONTROLS_SUMMARY',
  ORGANIZATION_FRAMEWORK_ENTITLEMENTS = 'ORGANIZATION_FRAMEWORK_ENTITLEMENTS',
  ORGANIZATION_EVIDENCE_SUMMARY = 'ORGANIZATION_EVIDENCE_SUMMARY',
  OPEN_VULNERABILITIES = 'OPEN_VULNERABILITIES',
  OVERDUE_AUDITS = 'OVERDUE_AUDITS',
  UNRESOLVED_AUDIT_FINDINGS = 'UNRESOLVED_AUDIT_FINDINGS',
  VENDOR_ASSESSMENT_STATUS = 'VENDOR_ASSESSMENT_STATUS',
  OPEN_INCIDENTS = 'OPEN_INCIDENTS',
  NONE = 'NONE',
}

export interface ResolvedContext {
  intent: GrcQueryIntent | LiveDataIntent;
  domain: GrcDomain;
  summaryText: string;
  sourceTag: string;
  citations: GrcSourceCitation[];
  structuredAnalysis: GrcStructuredAnalysis;
  dataSummary?: GrcDataSummary;
  visualizations?: GrcVisualizationPayload[];
  warnings?: string[];
  rankedAreas?: { area: string; count: number; maxScore: number; avgScore: number }[];
  rawRecords?: any[];
}

@Injectable()
export class GrcContextResolver {
  private readonly logger = new Logger(GrcContextResolver.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Backward-compatibility helper for older specs.
   */
  public detectIntent(query: string): LiveDataIntent {
    if (!query || !query.trim()) return LiveDataIntent.NONE;
    const lower = query.toLowerCase();

    if (lower.includes('vulnerab') || lower.includes('cve')) return LiveDataIntent.OPEN_VULNERABILITIES;
    if (lower.includes('vendor') || lower.includes('third-party') || lower.includes('third party')) return LiveDataIntent.VENDOR_ASSESSMENT_STATUS;
    if (lower.includes('incident')) return LiveDataIntent.OPEN_INCIDENTS;
    if (lower.includes('finding') || lower.includes('capa') || lower.includes('remediation')) return LiveDataIntent.UNRESOLVED_AUDIT_FINDINGS;
    if (lower.includes('audit') && (lower.includes('overdue') || lower.includes('plan') || lower.includes('schedule') || lower.includes('business'))) return LiveDataIntent.OVERDUE_AUDITS;
    if (lower.includes('risk')) return LiveDataIntent.MY_OPEN_RISKS;
    if (lower.includes('approval')) return LiveDataIntent.MY_PENDING_APPROVALS;
    if (lower.includes('task')) return LiveDataIntent.MY_COMPLIANCE_TASKS;
    if (lower.includes('control')) return LiveDataIntent.ORGANIZATION_CONTROLS_SUMMARY;
    if (lower.includes('framework') || lower.includes('compliance')) return LiveDataIntent.ORGANIZATION_FRAMEWORK_ENTITLEMENTS;
    if (lower.includes('evidence')) return LiveDataIntent.ORGANIZATION_EVIDENCE_SUMMARY;

    return LiveDataIntent.NONE;
  }

  /**
   * Resolves authoritative, bounded, tenant-isolated data from Prisma across all 8 GRC domains.
   */
  async resolveContext(
    organizationId: string,
    userId: string,
    analysisOrIntent: QueryAnalysisResult | LiveDataIntent,
    pageContext?: { module?: string; resourceId?: string; resourceType?: string; resourceTitle?: string },
  ): Promise<ResolvedContext> {
    if (!organizationId) {
      return this.buildEmptyContext(GrcQueryIntent.GENERAL_GRC, 'general');
    }

    let intent: GrcQueryIntent = GrcQueryIntent.GENERAL_GRC;
    let domain: GrcDomain = 'general';
    const rawText = typeof analysisOrIntent === 'string'
      ? analysisOrIntent
      : (analysisOrIntent.rawQuery || '');
    const lower = rawText.toLowerCase();

    if (typeof analysisOrIntent === 'string') {
      intent = this.mapLegacyIntent(analysisOrIntent);
      domain = this.resolveDomainFromIntent(intent);
    } else {
      intent = analysisOrIntent.intent;
      domain = analysisOrIntent.domain;
    }

    return TenantContext.run({ organizationId, userId }, async () => {
      try {
        if (lower.includes('vulnerab') || lower.includes('cve') || (typeof analysisOrIntent === 'string' && analysisOrIntent === LiveDataIntent.OPEN_VULNERABILITIES)) {
          return await this.resolveVulnerabilities(organizationId, intent);
        }
        if (lower.includes('incident') || (typeof analysisOrIntent === 'string' && analysisOrIntent === LiveDataIntent.OPEN_INCIDENTS)) {
          return await this.resolveIncidents(organizationId, intent);
        }
        if (lower.includes('audit plan') || lower.includes('upcoming audit') || lower.includes('scheduled audit') || (typeof analysisOrIntent === 'string' && analysisOrIntent === LiveDataIntent.OVERDUE_AUDITS)) {
          return await this.resolveAuditPlans(organizationId, intent);
        }

        switch (intent) {
          case GrcQueryIntent.COMPLIANCE_POSTURE:
            return await this.resolveCompliancePosture(organizationId, intent);

          case GrcQueryIntent.INEFFECTIVE_OR_FAILING_CONTROLS:
            return await this.resolveFailingControls(organizationId, intent);

          case GrcQueryIntent.HIGHEST_RISKS:
            return await this.resolveHighestRisks(organizationId, intent);

          case GrcQueryIntent.OVERDUE_AUDIT_FINDINGS:
            return await this.resolveAuditFindings(organizationId, intent);

          case GrcQueryIntent.HIGH_RISK_OR_EXPIRING_VENDORS:
            return await this.resolveVendorRisk(organizationId, intent);

          case GrcQueryIntent.REGULATORY_UPDATES:
            return await this.resolveRegulatoryUpdates(organizationId, intent);

          case GrcQueryIntent.UNMAPPED_OBLIGATIONS:
            return await this.resolveUnmappedObligations(organizationId, intent);

          case GrcQueryIntent.OVERDUE_REMEDIATION:
            return await this.resolveOverdueRemediation(organizationId, intent);

          case GrcQueryIntent.POLICY_GOVERNANCE:
            return await this.resolvePolicyGovernance(organizationId, intent);

          case GrcQueryIntent.PRIORITY_ACTIONS:
            return await this.resolvePriorityActions(organizationId, intent);

          default:
            return await this.resolveGeneralContext(organizationId, intent, domain, pageContext);
        }
      } catch (err: any) {
        this.logger.error(`Error resolving context for intent ${intent}: ${err.message}`, err.stack);
        return this.buildEmptyContext(intent, domain);
      }
    });
  }

  // ==========================================================================
  // 1. COMPLIANCE POSTURE
  // ==========================================================================
  private async resolveCompliancePosture(
    organizationId: string,
    intent: GrcQueryIntent,
  ): Promise<ResolvedContext> {
    const entitlements = await this.prisma.organizationFrameworkEntitlement.findMany({
      where: { organizationId },
      include: { framework: true },
      take: 6,
    });

    const totalControls = await this.prisma.control.count({
      where: { organizationId, deletedAt: null },
    });

    const citations: GrcSourceCitation[] = entitlements.map((e) => ({
      id: e.frameworkId,
      title: `${e.framework.name} (${e.framework.code})`,
      domain: 'compliance',
      recordType: 'Framework Entitlement',
      viewTarget: 'frameworks',
      targetId: e.frameworkId,
      statusOrDate: `Status: ${e.status}`,
      snippet: `Commercial Entitlement for ${e.framework.name}`,
    }));

    const activeList = entitlements.map((e) => `- ${e.framework.name} (${e.framework.code}): Status ${e.status}`).join('\n');

    const summaryText = `Active Framework Entitlements (${entitlements.length}):
${activeList || 'Organization currently has no commercial framework entitlements configured.'}
Total Controls in Register: ${totalControls}`;

    const frameworkRows = entitlements.map((e) => ({
      name: e.framework.name,
      code: e.framework.code,
      status: e.status,
    }));

    const visualizations: GrcVisualizationPayload[] = [
      {
        type: 'kpi',
        title: 'Compliance Posture KPIs',
        kpis: [
          { label: 'Active Frameworks', value: entitlements.length, trend: 'neutral' },
          { label: 'Registered Controls', value: totalControls, trend: 'good' },
        ],
      },
      {
        type: 'table',
        title: 'Commercial Framework Entitlements',
        columns: [
          { key: 'name', label: 'Framework Name' },
          { key: 'code', label: 'Framework Code' },
          { key: 'status', label: 'Status' },
        ],
        rows: frameworkRows,
      },
    ];

    const dataSummary: GrcDataSummary = {
      summary: {
        activeFrameworks: entitlements.length,
        totalControls,
      },
      records: frameworkRows,
    };

    return {
      intent,
      domain: 'compliance',
      summaryText,
      sourceTag: 'Authorized Organization Data: Framework Entitlements',
      citations,
      dataSummary,
      visualizations,
      structuredAnalysis: {
        summary: `Your organization maintains ${totalControls} security controls and holds ${entitlements.length} active framework entitlement(s).`,
        keyFindings: [
          `Active licensed frameworks include: ${entitlements.map((e) => e.framework.name).join(', ') || 'General Baseline'}.`,
          `Total of ${totalControls} security controls registered for compliance mapping.`,
        ],
        metrics: [
          { label: 'Active Frameworks', value: entitlements.length, trend: 'neutral' },
          { label: 'Registered Controls', value: totalControls, trend: 'good' },
        ],
        recommendations: [
          'Ensure all active framework clauses are linked to corresponding internal controls.',
          'Review evidence attachments periodically to maintain audit readiness.',
        ],
      },
    };
  }

  // ==========================================================================
  // 2. FAILING / INEFFECTIVE CONTROLS
  // ==========================================================================
  private async resolveFailingControls(
    organizationId: string,
    intent: GrcQueryIntent,
  ): Promise<ResolvedContext> {
    const controls = await this.prisma.control.findMany({
      where: { organizationId, deletedAt: null },
      take: 6,
      orderBy: { updatedAt: 'desc' },
    });

    const totalCount = await this.prisma.control.count({
      where: { organizationId, deletedAt: null },
    });

    const citations: GrcSourceCitation[] = controls.map((c) => ({
      id: c.id,
      title: c.name,
      domain: 'compliance',
      recordType: 'Security Control',
      viewTarget: 'controls',
      targetId: c.id,
      statusOrDate: c.category || 'General Security',
      snippet: `Description: ${c.description?.slice(0, 80) || 'Security Countermeasure'}`,
    }));

    const summaryItems = controls.map(
      (c) => `- [Control ${c.id.slice(0, 8)}] "${c.name}" (Category: ${c.category || 'General'})`
    );

    const summaryText = `Found ${totalCount} security control(s) in Control Register:
${summaryItems.join('\n') || 'Zero security controls recorded.'}`;

    const controlRows = controls.map((c) => ({
      code: `CTRL-${c.id.slice(0, 6).toUpperCase()}`,
      name: c.name,
      category: c.category || 'General',
    }));

    const visualizations: GrcVisualizationPayload[] = [
      {
        type: 'kpi',
        title: 'Controls Overview',
        kpis: [
          { label: 'Total Controls', value: totalCount, trend: 'good' },
          { label: 'Sampled in Context', value: controls.length, trend: 'neutral' },
        ],
      },
      {
        type: 'table',
        title: 'Active Security Controls',
        columns: [
          { key: 'code', label: 'Control ID' },
          { key: 'name', label: 'Name' },
          { key: 'category', label: 'Category' },
        ],
        rows: controlRows,
      },
    ];

    const dataSummary: GrcDataSummary = {
      summary: {
        totalControls: totalCount,
        sampledControls: controls.length,
      },
      records: controlRows,
    };

    return {
      intent,
      domain: 'compliance',
      summaryText,
      sourceTag: 'Authorized Organization Data: Controls',
      citations,
      dataSummary,
      visualizations,
      structuredAnalysis: {
        summary: `Analyzed ${controls.length} security controls from your register of ${totalCount} total controls.`,
        keyFindings: controls.map(
          (c) => `Control "${c.name}" (${c.category || 'General'}) is actively registered.`
        ),
        metrics: [
          { label: 'Total Controls', value: totalCount, trend: 'good' },
          { label: 'Sampled in Context', value: controls.length, trend: 'neutral' },
        ],
        recommendations: [
          'Attach fresh audit artifacts or configurations from Evidence Vault to satisfy control proof.',
          'Conduct periodic testing for controls mapped to high-assurance framework requirements.',
        ],
      },
    };
  }

  // ==========================================================================
  // 3. HIGHEST RISKS
  // ==========================================================================
  private async resolveHighestRisks(
    organizationId: string,
    intent: GrcQueryIntent,
  ): Promise<ResolvedContext> {
    const risks = await this.prisma.risk.findMany({
      where: { organizationId, deletedAt: null },
      orderBy: { score: 'desc' },
      take: 5,
    });

    const totalCount = risks.length;
    const openCount = risks.filter((r) => r.status === 'OPEN').length;
    const highCount = risks.filter((r) => r.score >= 15).length;
    const mediumCount = risks.filter((r) => r.score >= 8 && r.score < 15).length;
    const lowCount = risks.filter((r) => r.score < 8).length;
    const maxScore = risks.length > 0 ? risks[0].score : 0;

    // Group risks by business area (department or category)
    const areaMap = new Map<string, { count: number; totalScore: number; maxScore: number; risks: typeof risks }>();
    for (const r of risks) {
      const area = (r as any).departmentRef?.name || (r as any).department?.name || r.category || 'General Operations';
      const existing = areaMap.get(area) || { count: 0, totalScore: 0, maxScore: 0, risks: [] };
      existing.count += 1;
      existing.totalScore += r.score;
      existing.maxScore = Math.max(existing.maxScore, r.score);
      existing.risks.push(r);
      areaMap.set(area, existing);
    }

    const rankedAreas = Array.from(areaMap.entries())
      .map(([area, data]) => ({
        area,
        count: data.count,
        maxScore: data.maxScore,
        avgScore: Math.round((data.totalScore / data.count) * 10) / 10,
      }))
      .sort((a, b) => b.maxScore - a.maxScore || b.count - a.count);

    const citations: GrcSourceCitation[] = risks.map((r) => ({
      id: r.id,
      title: r.title,
      domain: 'risk',
      recordType: 'Risk Item',
      viewTarget: 'risk',
      targetId: r.id,
      statusOrDate: `Score: ${r.score} | Status: ${r.status}`,
      snippet: `Owner: ${r.owner || 'Unassigned'} | Category: ${r.category || 'Operational'}`,
    }));

    const summaryItems = risks.map(
      (r) => `- [Risk ${r.id.slice(0, 8)}] "${r.title}" (Score: ${r.score}, Status: ${r.status}, Owner: ${r.owner})`
    );

    const summaryText = `Found ${risks.length} risk(s):\n${summaryItems.join('\n') || 'Organization has 0 open risks currently recorded.'}`;

    const rows = risks.map((r) => {
      const severity = r.score >= 15 ? 'HIGH' : r.score >= 8 ? 'MEDIUM' : 'LOW';
      const area = (r as any).departmentRef?.name || (r as any).department?.name || r.category || 'General Operations';
      return {
        code: `RSK-${r.id.slice(0, 6).toUpperCase()}`,
        title: r.title,
        area,
        score: r.score,
        severity,
        status: r.status,
        owner: r.owner || 'Unassigned',
      };
    });

    const visualizations: GrcVisualizationPayload[] = [
      {
        type: 'kpi',
        title: 'Risk Posture Overview',
        kpis: [
          { label: 'Total Tracked Risks', value: totalCount, trend: 'neutral' },
          { label: 'High / Critical (≥15)', value: highCount, trend: highCount > 0 ? 'critical' : 'good' },
          { label: 'Max Exposure Score', value: maxScore, trend: maxScore >= 15 ? 'critical' : 'neutral' },
          { label: 'Active Open Risks', value: openCount, trend: openCount > 0 ? 'warning' : 'good' },
        ],
      },
      {
        type: 'bar',
        title: 'Risk Severity Distribution',
        chartData: [
          { label: 'High (≥15)', value: highCount, color: '#EF4444' },
          { label: 'Medium (8-14)', value: mediumCount, color: '#F59E0B' },
          { label: 'Low (<8)', value: lowCount, color: '#10B981' },
        ],
      },
      {
        type: 'table',
        title: 'Top Risk Scores & Rankings',
        columns: [
          { key: 'code', label: 'Risk ID' },
          { key: 'title', label: 'Title' },
          { key: 'area', label: 'Business Area' },
          { key: 'score', label: 'Score' },
          { key: 'severity', label: 'Severity' },
          { key: 'status', label: 'Status' },
          { key: 'owner', label: 'Owner' },
        ],
        rows,
      },
    ];

    const dataSummary: GrcDataSummary = {
      summary: {
        totalRisks: totalCount,
        highRisks: highCount,
        mediumRisks: mediumCount,
        lowRisks: lowCount,
        openRisks: openCount,
        maxScore,
      },
      topRisks: rows,
      rankedAreas,
    };

    return {
      intent,
      domain: 'risk',
      summaryText,
      sourceTag: 'Authorized Organization Data: Risks',
      citations,
      dataSummary,
      visualizations,
      rankedAreas,
      rawRecords: risks,
      structuredAnalysis: {
        summary: `Retrieved top ${risks.length} risk record(s) ranked by calculated exposure score.`,
        keyFindings: risks.map(
          (r) => `"${r.title}" carries an exposure score of ${r.score} under owner ${r.owner}.`
        ),
        metrics: [
          { label: 'Tracked Risks', value: risks.length, trend: risks.length > 0 ? 'critical' : 'good' },
          { label: 'Max Exposure Score', value: risks[0]?.score || 0, trend: 'warning' },
        ],
        recommendations: [
          'Formulate mitigation treatment plans for risks scoring above threshold.',
          'Obtain executive sign-off for accepted residual risks.',
        ],
      },
    };
  }

  // ==========================================================================
  // 4. OVERDUE AUDIT FINDINGS
  // ==========================================================================
  private async resolveAuditFindings(
    organizationId: string,
    intent: GrcQueryIntent,
  ): Promise<ResolvedContext> {
    const findings = await this.prisma.auditFinding.findMany({
      where: { organizationId },
      take: 5,
      orderBy: { createdAt: 'desc' },
    });

    const citations: GrcSourceCitation[] = findings.map((f) => ({
      id: f.id,
      title: f.title,
      domain: 'audit',
      recordType: 'Audit Finding',
      viewTarget: 'audits',
      targetId: f.id,
      statusOrDate: `Severity: ${f.severity} | Status: ${f.status}`,
      snippet: `Finding ID: ${f.id.slice(0, 8)}`,
    }));

    const summaryItems = findings.map(
      (f) => `- [Finding ${f.id.slice(0, 8)}] "${f.title}" (Severity: ${f.severity}, Status: ${f.status})`
    );

    const summaryText = `Found ${findings.length} audit finding(s):\n${summaryItems.join('\n') || 'Organization currently has 0 audit findings recorded.'}`;

    const findingRows = findings.map((f) => ({
      code: `FND-${f.id.slice(0, 6).toUpperCase()}`,
      title: f.title,
      severity: f.severity,
      status: f.status,
    }));

    const visualizations: GrcVisualizationPayload[] = [
      {
        type: 'kpi',
        title: 'Audit Findings Overview',
        kpis: [
          { label: 'Total Tracked Findings', value: findings.length, trend: findings.length > 0 ? 'warning' : 'good' },
          { label: 'Critical / High', value: findings.filter((f) => f.severity === 'CRITICAL' || f.severity === 'HIGH').length, trend: 'critical' },
        ],
      },
      {
        type: 'table',
        title: 'Audit Findings Register',
        columns: [
          { key: 'code', label: 'Finding ID' },
          { key: 'title', label: 'Title' },
          { key: 'severity', label: 'Severity' },
          { key: 'status', label: 'Status' },
        ],
        rows: findingRows,
      },
    ];

    const dataSummary: GrcDataSummary = {
      summary: {
        totalFindings: findings.length,
        critical: findings.filter((f) => f.severity === 'CRITICAL').length,
        high: findings.filter((f) => f.severity === 'HIGH').length,
      },
      records: findingRows,
    };

    return {
      intent,
      domain: 'audit',
      summaryText,
      sourceTag: 'Authorized Organization Data: Audit Findings',
      citations,
      dataSummary,
      visualizations,
      structuredAnalysis: {
        summary: `There are ${findings.length} audit finding(s) recorded across active and completed audit plans.`,
        keyFindings: findings.map(
          (f) => `Finding "${f.title}" (${f.severity} Severity) is currently in status "${f.status}".`
        ),
        metrics: [
          { label: 'Audit Findings', value: findings.length, trend: findings.length > 0 ? 'warning' : 'good' },
        ],
        recommendations: [
          'Prioritize corrective action plans (CAPA) for high and critical findings.',
          'Submit evidence to audit team for formal closure verification.',
        ],
      },
    };
  }

  // ==========================================================================
  // 5. HIGH-RISK VENDORS
  // ==========================================================================
  private async resolveVendorRisk(
    organizationId: string,
    intent: GrcQueryIntent,
  ): Promise<ResolvedContext> {
    const vendors = await this.prisma.vendor.findMany({
      where: { organizationId },
      take: 5,
    });

    const citations: GrcSourceCitation[] = vendors.map((v) => ({
      id: v.id,
      title: v.name,
      domain: 'vendor',
      recordType: 'Third-Party Vendor Profile',
      viewTarget: 'vendors',
      targetId: v.id,
      statusOrDate: `Criticality: ${v.criticality} | Status: ${v.status}`,
      snippet: `Category: ${v.category || 'SaaS'} | Review Cadence: ${v.reviewCadenceDays || 365}d`,
    }));

    const summaryItems = vendors.map(
      (v) => `- [Vendor ${v.id.slice(0, 8)}] "${v.name}" (Category: ${v.category}, Status: ${v.status})`
    );

    const summaryText = `Found ${vendors.length} vendor record(s):\n${summaryItems.join('\n') || 'Organization currently has 0 third-party vendors registered.'}`;

    const vendorRows = vendors.map((v) => ({
      code: `VND-${v.id.slice(0, 6).toUpperCase()}`,
      name: v.name,
      category: v.category || 'SaaS',
      criticality: v.criticality,
      status: v.status,
    }));

    const vendorVisualizations: GrcVisualizationPayload[] = [
      {
        type: 'kpi',
        title: 'Vendor Risk Overview',
        kpis: [
          { label: 'Total Vendors', value: vendors.length, trend: 'neutral' },
          { label: 'Critical Vendors', value: vendors.filter((v) => v.criticality === 'CRITICAL').length, trend: 'critical' },
        ],
      },
      {
        type: 'table',
        title: 'Third-Party Vendor Register',
        columns: [
          { key: 'code', label: 'Vendor ID' },
          { key: 'name', label: 'Name' },
          { key: 'category', label: 'Category' },
          { key: 'criticality', label: 'Criticality' },
          { key: 'status', label: 'Status' },
        ],
        rows: vendorRows,
      },
    ];

    const vendorDataSummary: GrcDataSummary = {
      summary: {
        totalVendors: vendors.length,
        critical: vendors.filter((v) => v.criticality === 'CRITICAL').length,
      },
      records: vendorRows,
    };

    return {
      intent,
      domain: 'vendor',
      summaryText,
      sourceTag: 'Authorized Organization Data: Vendors',
      citations,
      dataSummary: vendorDataSummary,
      visualizations: vendorVisualizations,
      structuredAnalysis: {
        summary: `Retrieved ${vendors.length} registered vendor(s) in third-party inventory.`,
        keyFindings: vendors.map(
          (v) => `Vendor "${v.name}" (${v.category || 'Vendor'}) has criticality "${v.criticality}".`
        ),
        metrics: [
          { label: 'Registered Vendors', value: vendors.length, trend: 'neutral' },
        ],
        recommendations: [
          'Verify that security certifications (SOC 2, ISO 27001) remain valid.',
          'Initiate due diligence reassessments for vendors with review dates approaching.',
        ],
      },
    };
  }

  // ==========================================================================
  // 6. REGULATORY UPDATES
  // ==========================================================================
  private async resolveRegulatoryUpdates(
    organizationId: string,
    intent: GrcQueryIntent,
  ): Promise<ResolvedContext> {
    const publications = await this.prisma.regulatoryPublication.findMany({
      take: 5,
      orderBy: { publicationDate: 'desc' },
      include: { source: true },
    });

    const citations: GrcSourceCitation[] = publications.map((p) => ({
      id: p.id,
      title: p.title,
      domain: 'regulatory',
      recordType: 'Regulatory Publication',
      viewTarget: 'regulatory-intelligence',
      targetId: p.id,
      statusOrDate: `Published: ${p.publicationDate ? new Date(p.publicationDate).toLocaleDateString() : 'Recent'}`,
      snippet: `Source: ${p.source?.displayName || 'Regulatory Authority'}`,
    }));

    const summaryItems = publications.map(
      (p) => `- [Pub ${p.id.slice(0, 8)}] "${p.title}" (Source: ${p.source?.displayName || 'Authority'})`
    );

    const summaryText = `Recent Regulatory Intelligence Publications (${publications.length}):
${summaryItems.join('\n') || 'Zero regulatory publications currently ingested.'}`;

    const pubVisualizations: GrcVisualizationPayload[] = [
      {
        type: 'kpi',
        kpis: [
          { label: 'Tracked Publications', value: publications.length, trend: 'neutral' },
          { label: 'Active Authorities', value: new Set(publications.map((p) => p.source?.regulatorCode).filter(Boolean)).size, trend: 'good' },
        ],
      },
      {
        type: 'table',
        title: 'Recent Regulatory Intelligence Circulars',
        columns: [
          { key: 'title', label: 'Publication Title' },
          { key: 'source', label: 'Regulatory Body' },
          { key: 'date', label: 'Publication Date' },
        ],
        rows: publications.map((p) => ({
          title: p.title,
          source: p.source?.displayName || p.source?.regulatorCode || 'Regulatory Authority',
          date: p.publicationDate ? new Date(p.publicationDate).toLocaleDateString() : 'Recent',
        })),
      },
    ];

    return {
      intent,
      domain: 'regulatory',
      summaryText,
      sourceTag: 'Authorized Regulatory Intelligence: Publications',
      citations,
      visualizations: pubVisualizations,
      dataSummary: {
        summary: {
          totalPublications: publications.length,
        },
        records: publications.map((p) => ({ id: p.id, title: p.title, source: p.source?.displayName })),
      },
      structuredAnalysis: {
        summary: `Monitored ${publications.length} regulatory circular(s) across connected financial and security regulators.`,
        keyFindings: publications.map(
          (p) => `Publication "${p.title}" issued from ${p.source?.displayName || 'Regulator'}.`
        ),
        metrics: [
          { label: 'Tracked Publications', value: publications.length, trend: 'neutral' },
        ],
        recommendations: [
          'Perform applicability assessment against organizational business profile.',
          'Derive compliance obligations and map to existing security controls.',
        ],
      },
    };
  }

  // ==========================================================================
  // 7. UNMAPPED REGULATORY OBLIGATIONS
  // ==========================================================================
  private async resolveUnmappedObligations(
    organizationId: string,
    intent: GrcQueryIntent,
  ): Promise<ResolvedContext> {
    const obligations = await this.prisma.regulatoryObligation.findMany({
      take: 5,
      orderBy: { createdAt: 'desc' },
      include: { publication: { include: { source: true } } },
    });

    const citations: GrcSourceCitation[] = obligations.map((o) => ({
      id: o.id,
      title: o.title,
      domain: 'regulatory',
      recordType: 'Compliance Obligation',
      viewTarget: 'regulatory-intelligence',
      targetId: o.id,
      statusOrDate: `Identifier: ${o.obligationIdentifier || 'OBL'}`,
      snippet: `Publication: ${o.publication?.title || 'Regulatory Circular'}`,
    }));

    const summaryItems = obligations.map(
      (o) => `- [Obligation ${o.id.slice(0, 8)}] "${o.title}" (Source: ${o.publication?.source?.displayName || 'Regulator'})`
    );

    const summaryText = `Tracked Regulatory Obligations (${obligations.length}):
${summaryItems.join('\n') || 'Zero regulatory obligations found.'}`;

    const oblVisualizations: GrcVisualizationPayload[] = [
      {
        type: 'kpi',
        kpis: [
          { label: 'Regulatory Obligations', value: obligations.length, trend: 'neutral' },
          { label: 'Connected Issuers', value: new Set(obligations.map((o) => o.publication?.source?.regulatorCode).filter(Boolean)).size, trend: 'good' },
        ],
      },
      {
        type: 'table',
        title: 'Statutory Compliance Obligations',
        columns: [
          { key: 'id', label: 'Identifier' },
          { key: 'title', label: 'Obligation Title' },
          { key: 'source', label: 'Circular Source' },
        ],
        rows: obligations.map((o) => ({
          id: o.obligationIdentifier || `OBL-${o.id.slice(0, 6).toUpperCase()}`,
          title: o.title,
          source: o.publication?.source?.displayName || 'Regulatory Authority',
        })),
      },
    ];

    return {
      intent,
      domain: 'regulatory',
      summaryText,
      sourceTag: 'Authorized Regulatory Intelligence: Obligations',
      citations,
      visualizations: oblVisualizations,
      dataSummary: {
        summary: {
          totalObligations: obligations.length,
        },
        records: obligations.map((o) => ({ id: o.id, title: o.title, identifier: o.obligationIdentifier })),
      },
      structuredAnalysis: {
        summary: `Tracked ${obligations.length} statutory obligations extracted from regulatory circulars.`,
        keyFindings: obligations.map(
          (o) => `Obligation "${o.title}" extracted from ${o.publication?.source?.displayName || 'Regulatory Authority'}.`
        ),
        metrics: [
          { label: 'Obligations', value: obligations.length, trend: 'neutral' },
        ],
        recommendations: [
          'Map statutory obligations to operational security controls.',
          'Execute gap remediation tasks where no internal controls satisfy requirements.',
        ],
      },
    };
  }

  // ==========================================================================
  // 8. OVERDUE REMEDIATION TASKS
  // ==========================================================================
  private async resolveOverdueRemediation(
    organizationId: string,
    intent: GrcQueryIntent,
  ): Promise<ResolvedContext> {
    const tasks = await this.prisma.complianceTask.findMany({
      where: {
        organizationId,
        deletedAt: null,
        status: { not: 'COMPLETE' },
      },
      take: 5,
      orderBy: { dueDate: 'asc' },
    });

    const citations: GrcSourceCitation[] = tasks.map((t) => ({
      id: t.id,
      title: t.title,
      domain: 'remediation',
      recordType: 'Compliance Task',
      viewTarget: 'remediation',
      targetId: t.id,
      statusOrDate: `Due: ${t.dueDate ? new Date(t.dueDate).toLocaleDateString() : 'N/A'} | Status: ${t.status}`,
      snippet: `Owner: ${t.owner || 'Unassigned'}`,
    }));

    const summaryItems = tasks.map(
      (t) => `- [Task ${t.id.slice(0, 8)}] "${t.title}" (Status: ${t.status}, Owner: ${t.owner})`
    );

    const summaryText = `Found ${tasks.length} compliance task(s):\n${summaryItems.join('\n') || 'Organization has 0 compliance tasks registered.'}`;

    const now = new Date();
    const overdueCount = tasks.filter((t) => t.dueDate && new Date(t.dueDate) < now).length;
    const taskVisualizations: GrcVisualizationPayload[] = [
      {
        type: 'kpi',
        kpis: [
          { label: 'Pending Tasks', value: tasks.length, trend: tasks.length > 0 ? 'warning' : 'good' },
          { label: 'Overdue Remediations', value: overdueCount, trend: overdueCount > 0 ? 'critical' : 'good' },
        ],
      },
      {
        type: 'table',
        title: 'Remediation & Compliance Task Register',
        columns: [
          { key: 'title', label: 'Task Title' },
          { key: 'status', label: 'Status' },
          { key: 'owner', label: 'Assigned Owner' },
          { key: 'dueDate', label: 'Due Date' },
        ],
        rows: tasks.map((t) => ({
          title: t.title,
          status: t.status,
          owner: t.owner || 'Unassigned',
          dueDate: t.dueDate ? new Date(t.dueDate).toLocaleDateString() : 'No Due Date',
        })),
      },
    ];

    return {
      intent,
      domain: 'remediation',
      summaryText,
      sourceTag: 'Authorized Organization Data: Compliance Tasks',
      citations,
      visualizations: taskVisualizations,
      dataSummary: {
        summary: {
          totalTasks: tasks.length,
          overdueCount,
        },
        records: tasks.map((t) => ({ id: t.id, title: t.title, status: t.status, owner: t.owner })),
      },
      structuredAnalysis: {
        summary: `There are ${tasks.length} active or pending compliance tasks registered in your workspace.`,
        keyFindings: tasks.map(
          (t) => `Task "${t.title}" is in status "${t.status}" assigned to ${t.owner}.`
        ),
        metrics: [
          { label: 'Pending Tasks', value: tasks.length, trend: tasks.length > 0 ? 'warning' : 'good' },
        ],
        recommendations: [
          'Follow up with task assignees on impending due dates.',
          'Upload verified evidence upon operational task completion.',
        ],
      },
    };
  }

  // ==========================================================================
  // 9. POLICY GOVERNANCE & RENEWALS
  // ==========================================================================
  private async resolvePolicyGovernance(
    organizationId: string,
    intent: GrcQueryIntent,
  ): Promise<ResolvedContext> {
    const policies = await this.prisma.policy.findMany({
      where: { organizationId },
      take: 5,
      orderBy: { updatedAt: 'desc' },
      include: { versions: { take: 1, orderBy: { versionNumber: 'desc' } } },
    });

    const pendingApprovals = await this.prisma.approvalInstance.findMany({
      where: { organizationId, resourceType: 'POLICY', status: 'PENDING' },
      take: 3,
    });

    const citations: GrcSourceCitation[] = policies.map((p) => ({
      id: p.id,
      title: p.title,
      domain: 'governance',
      recordType: 'Organizational Policy',
      viewTarget: 'policies',
      targetId: p.id,
      statusOrDate: `Status: ${p.status} | Review: ${p.reviewCadenceDays}d`,
      snippet: `Category: ${p.category} | Code: ${p.code}`,
    }));

    const summaryItems = policies.map(
      (p) => `- [Policy ${p.id.slice(0, 8)}] "${p.title}" (Status: ${p.status}, Cadence: ${p.reviewCadenceDays}d)`
    );

    const summaryText = `Policy Governance Status (${policies.length} Policies):
- Pending Sign-Offs: ${pendingApprovals.length}
${summaryItems.join('\n') || 'Zero organizational policies recorded.'}`;

    const policyVisualizations: GrcVisualizationPayload[] = [
      {
        type: 'kpi',
        kpis: [
          { label: 'Organizational Policies', value: policies.length, trend: 'good' },
          { label: 'Pending Sign-Offs', value: pendingApprovals.length, trend: pendingApprovals.length > 0 ? 'warning' : 'good' },
        ],
      },
      {
        type: 'table',
        title: 'Policy Governance & Lifecycle Register',
        columns: [
          { key: 'code', label: 'Code' },
          { key: 'title', label: 'Policy Title' },
          { key: 'category', label: 'Category' },
          { key: 'status', label: 'Lifecycle Status' },
          { key: 'cadence', label: 'Review Cadence' },
        ],
        rows: policies.map((p) => ({
          code: p.code,
          title: p.title,
          category: p.category,
          status: p.status,
          cadence: `${p.reviewCadenceDays}d`,
        })),
      },
    ];

    return {
      intent,
      domain: 'governance',
      summaryText,
      sourceTag: 'Authorized Organization Data: Policies & Approvals',
      citations,
      visualizations: policyVisualizations,
      dataSummary: {
        summary: {
          totalPolicies: policies.length,
          pendingSignOffs: pendingApprovals.length,
        },
        records: policies.map((p) => ({ id: p.id, code: p.code, title: p.title, status: p.status })),
      },
      structuredAnalysis: {
        summary: `Maintains ${policies.length} documented policies and ${pendingApprovals.length} pending sign-off(s).`,
        keyFindings: policies.map(
          (p) => `Policy "${p.title}" (${p.code}) is in status "${p.status}".`
        ),
        metrics: [
          { label: 'Policies', value: policies.length, trend: 'neutral' },
          { label: 'Pending Approvals', value: pendingApprovals.length, trend: pendingApprovals.length > 0 ? 'warning' : 'good' },
        ],
        recommendations: [
          'Review policies nearing their annual expiration date.',
          'Execute executive sign-offs in the Approval Center.',
        ],
      },
    };
  }

  // ==========================================================================
  // 10. WEEKLY GRC PRIORITIES
  // ==========================================================================
  private async resolvePriorityActions(
    organizationId: string,
    intent: GrcQueryIntent,
  ): Promise<ResolvedContext> {
    const openRisks = await this.prisma.risk.findMany({
      where: { organizationId, status: 'OPEN', deletedAt: null },
      orderBy: { score: 'desc' },
      take: 3,
    });

    const pendingApprovals = await this.prisma.approvalInstance.findMany({
      where: { organizationId, status: 'PENDING' },
      take: 3,
    });

    const citations: GrcSourceCitation[] = [
      ...openRisks.map((r) => ({
        id: r.id,
        title: `High Risk: ${r.title}`,
        domain: 'risk' as GrcDomain,
        recordType: 'Risk Item',
        viewTarget: 'risk',
        targetId: r.id,
        statusOrDate: `Score: ${r.score}`,
        snippet: `Owner: ${r.owner}`,
      })),
      ...pendingApprovals.map((a) => ({
        id: a.id,
        title: `Approval: ${a.title}`,
        domain: 'governance' as GrcDomain,
        recordType: 'Approval Request',
        viewTarget: 'approvals',
        targetId: a.id,
        statusOrDate: 'PENDING',
        snippet: `Purpose: ${a.purpose}`,
      })),
    ];

    const summaryText = `Weekly GRC Priorities Summary:
- Open Risks: ${openRisks.length} (Top: ${openRisks[0]?.title || 'None'})
- Pending Approvals: ${pendingApprovals.length}`;

    const priorityVisualizations: GrcVisualizationPayload[] = [
      {
        type: 'kpi',
        kpis: [
          { label: 'Action Items', value: openRisks.length + pendingApprovals.length, trend: 'critical' },
          { label: 'Open Risks', value: openRisks.length, trend: 'warning' },
          { label: 'Pending Approvals', value: pendingApprovals.length, trend: 'warning' },
        ],
      },
      {
        type: 'table',
        title: 'Weekly Cross-Domain Priorities',
        columns: [
          { key: 'type', label: 'Domain' },
          { key: 'title', label: 'Action Title' },
          { key: 'detail', label: 'Priority / Status' },
          { key: 'owner', label: 'Designated Party' },
        ],
        rows: [
          ...openRisks.map((r) => ({
            type: 'Risk Remediation',
            title: r.title,
            detail: `Risk Score: ${r.score}`,
            owner: r.owner || 'Unassigned',
          })),
          ...pendingApprovals.map((a) => ({
            type: 'Governance Sign-Off',
            title: a.title,
            detail: 'PENDING APPROVAL',
            owner: 'Approver Group',
          })),
        ],
      },
    ];

    return {
      intent,
      domain: 'general',
      summaryText,
      sourceTag: 'Authorized Organization Data: Multi-Domain Priorities',
      citations,
      visualizations: priorityVisualizations,
      dataSummary: {
        summary: {
          totalActions: openRisks.length + pendingApprovals.length,
          openRisksCount: openRisks.length,
          pendingApprovalsCount: pendingApprovals.length,
        },
        records: [
          ...openRisks.map((r) => ({ type: 'Risk', title: r.title, score: r.score })),
          ...pendingApprovals.map((a) => ({ type: 'Approval', title: a.title })),
        ],
      },
      structuredAnalysis: {
        summary: `Identified ${openRisks.length} open risk(s) and ${pendingApprovals.length} pending sign-off(s) requiring focus this week.`,
        keyFindings: [
          openRisks.length > 0 ? `Risk "${openRisks[0]?.title}" has score ${openRisks[0]?.score}.` : 'No open risks.',
          pendingApprovals.length > 0 ? `${pendingApprovals.length} approval instance(s) require action.` : 'No pending approvals.',
        ],
        metrics: [
          { label: 'Priority Action Items', value: openRisks.length + pendingApprovals.length, trend: 'critical' },
          { label: 'Open Risks', value: openRisks.length, trend: 'warning' },
          { label: 'Pending Approvals', value: pendingApprovals.length, trend: 'warning' },
        ],
        recommendations: [
          'Review pending approval requests in the Approval Center.',
          'Execute mitigation treatments on critical risk items.',
        ],
      },
    };
  }

  // ==========================================================================
  // VULNERABILITIES RESOLVER
  // ==========================================================================
  private async resolveVulnerabilities(
    organizationId: string,
    intent: GrcQueryIntent,
  ): Promise<ResolvedContext> {
    const vulnerabilities = await this.prisma.vulnerability.findMany({
      where: { organizationId, deletedAt: null },
      orderBy: { discoveredAt: 'desc' },
      take: 5,
    });

    const totalCount = vulnerabilities.length;
    const openCount = vulnerabilities.filter((v) => v.status === 'OPEN').length;
    const critCount = vulnerabilities.filter((v) => v.severity === 'CRITICAL').length;
    const highCount = vulnerabilities.filter((v) => v.severity === 'HIGH').length;
    const medCount = vulnerabilities.filter((v) => v.severity === 'MEDIUM').length;
    const lowCount = vulnerabilities.filter((v) => v.severity === 'LOW').length;
    const resolvedCount = vulnerabilities.filter((v) => v.status === 'RESOLVED').length;

    const citations: GrcSourceCitation[] = vulnerabilities.map((v) => ({
      id: v.id,
      title: `${v.cveId || 'VULN'}: ${v.title}`,
      domain: 'compliance',
      recordType: 'Vulnerability Item',
      viewTarget: 'vulnerabilities',
      targetId: v.id,
      statusOrDate: `Severity: ${v.severity} | Status: ${v.status}`,
      snippet: `Owner: ${v.remediationOwner || 'Unassigned'}`,
    }));

    const summaryItems = vulnerabilities.map(
      (v) => `- [${v.cveId || v.id.slice(0, 8)}] "${v.title}" (Severity: ${v.severity}, Status: ${v.status})`
    );

    const summaryText = `Found ${vulnerabilities.length} tracked vulnerability record(s):\n${summaryItems.join('\n') || 'Organization currently has 0 open vulnerabilities recorded.'}`;

    const rows = vulnerabilities.map((v) => ({
      cve: v.cveId || `VULN-${v.id.slice(0, 6).toUpperCase()}`,
      title: v.title,
      severity: v.severity,
      status: v.status,
      owner: v.remediationOwner || 'Unassigned',
    }));

    const visualizations: GrcVisualizationPayload[] = [
      {
        type: 'kpi',
        title: 'Vulnerability Posture KPIs',
        kpis: [
          { label: 'Tracked CVEs', value: totalCount, trend: 'neutral' },
          { label: 'Critical Severity', value: critCount, trend: critCount > 0 ? 'critical' : 'good' },
          { label: 'High Severity', value: highCount, trend: highCount > 0 ? 'warning' : 'good' },
          { label: 'Active Open', value: openCount, trend: openCount > 0 ? 'warning' : 'good' },
        ],
      },
      {
        type: 'bar',
        title: 'Vulnerabilities by Severity',
        chartData: [
          { label: 'Critical', value: critCount, color: '#DC2626' },
          { label: 'High', value: highCount, color: '#EA580C' },
          { label: 'Medium', value: medCount, color: '#D97706' },
          { label: 'Low', value: lowCount, color: '#16A34A' },
        ],
      },
      {
        type: 'table',
        title: 'Vulnerability Posture Register',
        columns: [
          { key: 'cve', label: 'CVE ID' },
          { key: 'title', label: 'Title' },
          { key: 'severity', label: 'Severity' },
          { key: 'status', label: 'Status' },
          { key: 'owner', label: 'Remediation Lead' },
        ],
        rows,
      },
    ];

    const dataSummary: GrcDataSummary = {
      summary: {
        totalVulnerabilities: totalCount,
        critical: critCount,
        high: highCount,
        medium: medCount,
        low: lowCount,
        open: openCount,
        resolved: resolvedCount,
      },
      records: rows,
    };

    return {
      intent,
      domain: 'compliance',
      summaryText,
      sourceTag: 'Authorized Organization Data: Vulnerabilities',
      citations,
      dataSummary,
      visualizations,
      rawRecords: vulnerabilities,
      structuredAnalysis: {
        summary: `Retrieved ${vulnerabilities.length} vulnerability finding(s) from asset scans.`,
        keyFindings: vulnerabilities.map((v) => `"${v.title}" rated ${v.severity} with status ${v.status}.`),
        metrics: [
          { label: 'Open Vulnerabilities', value: openCount, trend: openCount > 0 ? 'warning' : 'good' },
          { label: 'Critical CVEs', value: critCount, trend: critCount > 0 ? 'critical' : 'good' },
        ],
        recommendations: ['Prioritize patch deployment for Critical and High CVEs.'],
      },
    };
  }

  // ==========================================================================
  // INCIDENTS RESOLVER
  // ==========================================================================
  private async resolveIncidents(
    organizationId: string,
    intent: GrcQueryIntent,
  ): Promise<ResolvedContext> {
    const incidents = await this.prisma.incident.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });

    const citations: GrcSourceCitation[] = incidents.map((i) => ({
      id: i.id,
      title: i.title,
      domain: 'risk',
      recordType: 'Security Incident',
      viewTarget: 'incidents',
      targetId: i.id,
      statusOrDate: `Severity: ${i.severity} | Status: ${i.status}`,
      snippet: `Reported on ${i.createdAt ? new Date(i.createdAt).toISOString().split('T')[0] : 'recent'}`,
    }));

    const summaryItems = incidents.map(
      (i) => `- [Incident ${i.id.slice(0, 8)}] "${i.title}" (Severity: ${i.severity}, Status: ${i.status})`
    );

    const summaryText = `Found ${incidents.length} security incident(s):\n${summaryItems.join('\n') || 'Organization currently has 0 open security incidents.'}`;

    return {
      intent,
      domain: 'risk',
      summaryText,
      sourceTag: 'Authorized Organization Data: Incidents',
      citations,
      structuredAnalysis: {
        summary: `Active security incidents: ${incidents.length} record(s).`,
        keyFindings: incidents.map((i) => `"${i.title}" (${i.severity}) status ${i.status}.`),
        metrics: [
          { label: 'Active Incidents', value: incidents.length, trend: incidents.length > 0 ? 'critical' : 'good' },
        ],
        recommendations: ['Follow incident response playbooks for containment.'],
      },
    };
  }

  // ==========================================================================
  // AUDIT PLANS RESOLVER
  // ==========================================================================
  private async resolveAuditPlans(
    organizationId: string,
    intent: GrcQueryIntent,
  ): Promise<ResolvedContext> {
    const auditPlans = await this.prisma.auditPlan.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });

    const citations: GrcSourceCitation[] = auditPlans.map((a) => ({
      id: a.id,
      title: a.title,
      domain: 'audit',
      recordType: 'Audit Plan',
      viewTarget: 'audits',
      targetId: a.id,
      statusOrDate: `Status: ${a.status}`,
      snippet: `Audit scope and schedule plan`,
    }));

    const summaryItems = auditPlans.map(
      (a) => `- [Audit ${a.id.slice(0, 8)}] "${a.title}" (Status: ${a.status})`
    );

    const summaryText = `Found ${auditPlans.length} audit plan(s):\n${summaryItems.join('\n') || 'Organization currently has 0 audit plans registered.'}`;

    return {
      intent,
      domain: 'audit',
      summaryText,
      sourceTag: 'Authorized Organization Data: Audit Plans',
      citations,
      structuredAnalysis: {
        summary: `Retrieved ${auditPlans.length} scheduled audit plan(s).`,
        keyFindings: auditPlans.map((a) => `Audit plan "${a.title}" status: ${a.status}.`),
        metrics: [
          { label: 'Audit Plans', value: auditPlans.length, trend: 'neutral' },
        ],
        recommendations: ['Verify pre-audit readiness and evidence collections.'],
      },
    };
  }

  // ==========================================================================
  // 11. GENERAL / BACKWARD-COMPATIBLE FALLBACK
  // ==========================================================================
  private async resolveGeneralContext(
    organizationId: string,
    intent: GrcQueryIntent,
    domain: GrcDomain,
    pageContext?: { module?: string; resourceId?: string; resourceType?: string; resourceTitle?: string },
  ): Promise<ResolvedContext> {
    const controlsCount = await this.prisma.control.count({ where: { organizationId, deletedAt: null } });
    const evidenceCount = await this.prisma.evidence.count({ where: { organizationId } });
    const vulnerabilities = await this.prisma.vulnerability.findMany({
      where: { organizationId, status: 'OPEN' },
      take: 5,
    });
    const incidents = await this.prisma.incident.findMany({
      where: { organizationId },
      take: 5,
    });
    const auditPlans = await this.prisma.auditPlan.findMany({
      where: { organizationId },
      take: 5,
    });

    if (pageContext?.module === 'vulnerabilities' || vulnerabilities.length > 0) {
      const summary = vulnerabilities.map((v) => `- [${v.cveId || v.id.slice(0, 8)}] "${v.title}" (Severity: ${v.severity})`).join('\n');
      return {
        intent,
        domain: 'compliance',
        summaryText: `Found ${vulnerabilities.length} open vulnerability record(s):\n${summary || 'Organization currently has 0 open vulnerabilities recorded.'}`,
        sourceTag: 'Authorized Organization Data: Vulnerabilities',
        citations: [],
        structuredAnalysis: {
          summary: `Identified ${vulnerabilities.length} open vulnerability records.`,
          keyFindings: vulnerabilities.map((v) => `"${v.title}" (${v.severity})`),
          recommendations: ['Remediate high-severity CVEs.'],
        },
      };
    }

    if (pageContext?.module === 'incidents' || incidents.length > 0) {
      const summary = incidents.map((i) => `- [Incident ${i.id.slice(0, 8)}] "${i.title}" (Severity: ${i.severity}, Status: ${i.status})`).join('\n');
      return {
        intent,
        domain: 'risk',
        summaryText: `Found ${incidents.length} incident record(s):\n${summary || 'Organization currently has 0 open security incidents.'}`,
        sourceTag: 'Authorized Organization Data: Incidents',
        citations: [],
        structuredAnalysis: {
          summary: `Tracked ${incidents.length} security incident(s).`,
          keyFindings: incidents.map((i) => `"${i.title}" (${i.severity})`),
          recommendations: ['Review incident containment workflows.'],
        },
      };
    }

    if (pageContext?.module === 'audits' || auditPlans.length > 0) {
      const summary = auditPlans.map((a) => `- [Audit ${a.id.slice(0, 8)}] "${a.title}" (Status: ${a.status})`).join('\n');
      return {
        intent,
        domain: 'audit',
        summaryText: `Found ${auditPlans.length} audit plan(s):\n${summary || 'Organization currently has 0 audit plans registered.'}`,
        sourceTag: 'Authorized Organization Data: Audit Plans',
        citations: [],
        structuredAnalysis: {
          summary: `Tracked ${auditPlans.length} audit plan(s).`,
          keyFindings: auditPlans.map((a) => `Audit "${a.title}" (${a.status})`),
          recommendations: ['Review audit schedules and check items.'],
        },
      };
    }

    const summaryText = `Organization Overview Context:
- Security Controls: ${controlsCount}
- Evidence Records: ${evidenceCount}
${pageContext?.module ? `Active Module: ${pageContext.module}` : ''}`;

    return {
      intent,
      domain,
      summaryText,
      sourceTag: 'Authorized Organization Data: Evidence Vault',
      citations: [],
      structuredAnalysis: {
        summary: `Overview of authorized organization data across controls (${controlsCount}) and evidence records (${evidenceCount}).`,
        keyFindings: [`${controlsCount} controls registered in workspace.`, `${evidenceCount} evidence items in Evidence Vault.`],
        metrics: [
          { label: 'Controls', value: controlsCount, trend: 'neutral' },
          { label: 'Evidence Vault', value: evidenceCount, trend: 'neutral' },
        ],
        recommendations: ['Use targeted queries for specific domain analysis.'],
      },
    };
  }

  private mapLegacyIntent(legacy: LiveDataIntent): GrcQueryIntent {
    switch (legacy) {
      case LiveDataIntent.MY_OPEN_RISKS:
        return GrcQueryIntent.HIGHEST_RISKS;
      case LiveDataIntent.ORGANIZATION_CONTROLS_SUMMARY:
        return GrcQueryIntent.INEFFECTIVE_OR_FAILING_CONTROLS;
      case LiveDataIntent.ORGANIZATION_FRAMEWORK_ENTITLEMENTS:
        return GrcQueryIntent.COMPLIANCE_POSTURE;
      case LiveDataIntent.UNRESOLVED_AUDIT_FINDINGS:
        return GrcQueryIntent.OVERDUE_AUDIT_FINDINGS;
      case LiveDataIntent.VENDOR_ASSESSMENT_STATUS:
        return GrcQueryIntent.HIGH_RISK_OR_EXPIRING_VENDORS;
      case LiveDataIntent.MY_COMPLIANCE_TASKS:
        return GrcQueryIntent.OVERDUE_REMEDIATION;
      case LiveDataIntent.MY_PENDING_APPROVALS:
        return GrcQueryIntent.POLICY_GOVERNANCE;
      case LiveDataIntent.OPEN_VULNERABILITIES:
        return GrcQueryIntent.INEFFECTIVE_OR_FAILING_CONTROLS;
      case LiveDataIntent.OVERDUE_AUDITS:
        return GrcQueryIntent.OVERDUE_AUDIT_FINDINGS;
      case LiveDataIntent.OPEN_INCIDENTS:
        return GrcQueryIntent.HIGHEST_RISKS;
      case LiveDataIntent.ORGANIZATION_EVIDENCE_SUMMARY:
        return GrcQueryIntent.INEFFECTIVE_OR_FAILING_CONTROLS;
      default:
        return GrcQueryIntent.GENERAL_GRC;
    }
  }

  private resolveDomainFromIntent(intent: GrcQueryIntent): GrcDomain {
    switch (intent) {
      case GrcQueryIntent.COMPLIANCE_POSTURE:
      case GrcQueryIntent.INEFFECTIVE_OR_FAILING_CONTROLS:
        return 'compliance';
      case GrcQueryIntent.HIGHEST_RISKS:
        return 'risk';
      case GrcQueryIntent.OVERDUE_AUDIT_FINDINGS:
        return 'audit';
      case GrcQueryIntent.HIGH_RISK_OR_EXPIRING_VENDORS:
        return 'vendor';
      case GrcQueryIntent.REGULATORY_UPDATES:
      case GrcQueryIntent.UNMAPPED_OBLIGATIONS:
        return 'regulatory';
      case GrcQueryIntent.OVERDUE_REMEDIATION:
        return 'remediation';
      case GrcQueryIntent.POLICY_GOVERNANCE:
        return 'governance';
      default:
        return 'general';
    }
  }

  private buildEmptyContext(intent: GrcQueryIntent, domain: GrcDomain): ResolvedContext {
    return {
      intent,
      domain,
      summaryText: 'No organization data available.',
      sourceTag: 'OMNiGRC System',
      citations: [],
      structuredAnalysis: {
        summary: 'No authorized records matching the query were found in this tenant.',
        keyFindings: ['Zero records retrieved.'],
        recommendations: ['Ensure your organization has registered relevant assets, controls, or framework entitlements.'],
      },
    };
  }
}
