export interface KnowledgeSection {
  id: string;
  category: string;
  title: string;
  keywords: string[];
  content: string;
}

export const OMNIGRC_KNOWLEDGE_BASE: KnowledgeSection[] = [
  {
    id: 'kb-core-concepts',
    category: 'Core Platform & Architecture',
    title: 'OMNiGRC Platform Architecture & Multi-Tenancy',
    keywords: ['architecture', 'multitenancy', 'multi-tenancy', 'platform', 'tenant', 'isolation', 'database'],
    content: `OMNiGRC is an enterprise Governance, Risk, and Compliance (GRC) platform.
It uses strict multi-tenancy with row-level organization isolation. Every GRC entity (Asset, Risk, Control, Policy, Audit, Vendor, Vulnerability, Incident, Evidence, Approval) is scoped to an organizationId.
The hierarchy follows: Organization -> Departments -> Projects -> Memberships.
System licensing and deployment verification are managed via the Arav Control Plane.`,
  },
  {
    id: 'kb-org-hierarchy',
    category: 'Organization & Memberships',
    title: 'Organization Hierarchy, Departments & Projects',
    keywords: ['department', 'project', 'hierarchy', 'membership', 'structure', 'scope', 'organization'],
    content: `An Organization can define Departments and child Projects.
Users belong to Organizations via OrganizationMembership records.
Memberships hold roles (ADMIN, ANALYST, EXTERNAL_AUDITOR, MSSP_ADMIN, MSSP_ANALYST) and can be scoped to specific Departments and Projects.
Department and Project assignments cannot cross tenant boundaries. Assigning a department or project from another organization is strictly denied.`,
  },
  {
    id: 'kb-product-access',
    category: 'Access Control & Security',
    title: 'Selective Product Access Lifecycle (ACTIVE, SUSPENDED, REVOKED)',
    keywords: ['product access', 'access status', 'suspended', 'revoked', 'active', 'session', 'token', 'jwt'],
    content: `Organization Memberships have a ProductAccessStatus field:
- ACTIVE: User has full operational access to the organization's features based on their role.
- SUSPENDED: Operational access is temporarily suspended. Authenticated JWT requests immediately fail with HTTP 401 PRODUCT_ACCESS_REVOKED.
- REVOKED: Access is permanently revoked. Authenticated JWT requests immediately fail with HTTP 401.
Reactivation by an Organization Admin restores ACTIVE status. Token validation performs live DB checks so revoked users lose access immediately.`,
  },
  {
    id: 'kb-rbac-roles',
    category: 'Access Control & Security',
    title: 'Role-Based Access Control (RBAC) & External Auditor Restrictions',
    keywords: ['rbac', 'role', 'admin', 'analyst', 'external auditor', 'auditor', 'mssp_admin', 'permissions'],
    content: `OMNiGRC enforces role-based authorization:
- ADMIN: Full administrative authority over organization settings, members, framework assignments, controls, and approvals.
- ANALYST: Operational GRC user capable of creating and managing risks, controls, evidence, and compliance tasks within their assigned department/project scope.
- EXTERNAL_AUDITOR: Read-only role strictly restricted to READ actions across all GRC endpoints. External Auditors cannot mutate settings, create entities, approve requests, or upload evidence.
- MSSP_ADMIN / MSSP_ANALYST: Managed Service Provider roles for parent organization managing client tenant sub-organizations.`,
  },
  {
    id: 'kb-framework-catalog',
    category: 'Frameworks & Entitlements',
    title: 'Framework Catalog & Commercial Entitlements',
    keywords: ['framework', 'soc2', 'iso27001', 'gdpr', 'dpdp', 'iso42001', 'hipaa', 'entitlement', 'license', 'commercial'],
    content: `OMNiGRC supports standard compliance frameworks: ISO 27001, SOC 2, GDPR, DPDP, ISO 42001, and HIPAA.
Framework Entitlements are commercially managed by the Arav Control Plane.
Organization Admins cannot self-grant framework access.
Entitlement Statuses: DRAFT, ACTIVE, EXPIRED, SUSPENDED, REVOKED.
Active entitlement permits framework browsing, clause mapping, AI analysis, and reports.
Expired/Suspended/Revoked entitlements deny new licensed operations while keeping historical records accessible.`,
  },
  {
    id: 'kb-framework-references',
    category: 'Frameworks & Entitlements',
    title: 'Framework Reference Engine & Clause Structure',
    keywords: ['clause', 'reference', 'subclause', 'criterion', 'requirement', 'normative text', 'section', 'article'],
    content: `Frameworks contain detailed FrameworkVersion and FrameworkReference nodes (Clauses, Subclauses, Articles, Criteria, Requirements).
Control Framework Mappings link Organization Security Controls to specific Framework References with status (SUGGESTED, APPROVED, OVERRIDDEN, REJECTED) and confidence scores.`,
  },
  {
    id: 'kb-evidence-vault',
    category: 'Evidence Vault',
    title: 'Universal Evidence & Proof Vault Security',
    keywords: ['evidence', 'vault', 'proof', 'upload', 'magic signature', 'file validation', 'quarantined', 'clean', 'active'],
    content: `The Evidence Vault stores compliance proof documents and artifacts.
Upload Security: Validates file extensions, path safety (prevents path traversal ../), file size limits, and inspects magic byte signatures.
Scan Lifecycle: Uploaded files pass through malware scanning abstraction.
Evidence Statuses: PENDING, ACTIVE, QUARANTINED, ARCHIVED.
Only ACTIVE / CLEAN evidence can satisfy compliance proof requirements. Quarantined or unscanned evidence is blocked from satisfying proof requirements.`,
  },
  {
    id: 'kb-approval-engine',
    category: 'Approval Engine',
    title: 'Universal Approval Engine & Separation of Duties (SoD)',
    keywords: ['approval', 'approval engine', 'sod', 'separation of duties', 'purpose', 'signoff', 'idempotent', 'decision'],
    content: `The Approval Engine handles multi-stage sign-offs for Controls, Risks, Policies, Evidence, Vendors, and Policy Exceptions.
Separation of Duties (SoD): Requesters CANNOT approve their own submission unless explicitly authorized by workflow rules.
Approval Purposes: CONTROL_SIGNOFF, RISK_ACCEPTANCE, EVIDENCE_APPROVAL, POLICY_EXCEPTION, VENDOR_ASSESSMENT.
Idempotency: Callback finalization is strictly idempotent. Repeated decisions on finalized approvals are blocked to prevent state corruption.`,
  },
  {
    id: 'kb-ai-doc-intel',
    category: 'AI Document Intelligence',
    title: 'AI Document Intelligence & Advisory Boundary',
    keywords: ['ai document intelligence', 'document analysis', 'extracted finding', 'human review', 'advisory', 'conversion'],
    content: `AI Document Intelligence analyzes uploaded compliance documents to extract requirements, obligations, risks, and framework references.
AI Advisory Boundary: All AI output (ExtractedFinding) is strictly advisory and immutable. AI cannot directly approve evidence, grant entitlements, or change compliance states.
Human Review Layer: Extracted findings must be reviewed by a human (ACCEPTED, EDITED, or REJECTED) before they can be converted into actionable GRC entities (Risk, Compliance Task, Control Mapping, Policy Exception).`,
  },
  {
    id: 'kb-workflow-lifecycle',
    category: 'Workflow & Lifecycle',
    title: 'Universal Workflow & Lifecycle Read Model',
    keywords: ['workflow', 'lifecycle', 'read model', 'stages', 'attention summary', 'orchestration', 'state'],
    content: `The WorkflowService provides a read-only lifecycle graph aggregating real-time authoritative domain state across Controls, Risks, Policies, Evidence, and Approvals.
It identifies items needing attention (unassigned tasks, pending approvals, expired evidence, open risks) without creating duplicate state machines.`,
  },
  {
    id: 'kb-risk-register',
    category: 'GRC Modules',
    title: 'Risk Register & Assessment Matrix',
    keywords: ['risk', 'likelihood', 'impact', 'score', 'treatment plan', 'open', 'in_treatment', 'accepted', 'closed'],
    content: `The Risk Register manages organizational risks with Likelihood (1-5) and Impact (1-5) scoring (Score = Likelihood * Impact).
Status Lifecycle: OPEN -> IN_TREATMENT -> ACCEPTED / CLOSED.
Risk treatment plans can link to Assets, Controls, Evidence, and require formal Risk Acceptance approvals.`,
  },
  {
    id: 'kb-controls-tasks',
    category: 'GRC Modules',
    title: 'Security Controls & Compliance Tasks',
    keywords: ['control', 'compliance task', 'cadence', 'due date', 'owner', 'not_started', 'in_progress', 'complete'],
    content: `Controls represent security countermeasures (technical, administrative, physical).
Compliance Tasks represent recurring or one-off operational obligations (cadence: ONE_OFF, MONTHLY, QUARTERLY, ANNUAL) assigned to owners with due dates.`,
  },
  {
    id: 'kb-vendors-vulnerabilities',
    category: 'GRC Modules',
    title: 'Vendor Risk Management & Vulnerabilities',
    keywords: ['vendor', 'criticality', 'vulnerability', 'cve', 'severity', 'remediation', 'incident'],
    content: `Vendors: Managed with criticality (CRITICAL, HIGH, MEDIUM, LOW) and review cadences.
Vulnerabilities: CVE tracking with severity, affected assets, remediation owner, and due dates.
Incidents: Security incidents tracked from OPEN -> IN_PROGRESS -> CONTAINED -> RESOLVED -> CLOSED.`,
  },
  {
    id: 'kb-policies-audits',
    category: 'GRC Modules',
    title: 'Policy Management & Business Audits',
    keywords: ['policy', 'attestation', 'exception', 'audit plan', 'assessment', 'finding', 'capa'],
    content: `Policies: Documented organizational policies with versioning, user attestations, and policy exception requests.
Audits: Audit Plans, Schedules, Assessments, Check Items, Audit Findings, and Corrective Action Plans (CAPA).`,
  },
  {
    id: 'kb-mssp',
    category: 'MSSP Multitenancy',
    title: 'MSSP Partner Portal & Client Tenant Management',
    keywords: ['mssp', 'mssp_admin', 'client tenant', 'parent organization', 'context switch', 'provider'],
    content: `MSSP Provider Organizations can manage multiple Client Tenant Organizations.
MSSP users switch context using actingViaMsspId header/token payload.
MSSP context is strictly validated against parent-child organization hierarchy. MSSP users cannot access unrelated organizations.`,
  },
  {
    id: 'kb-audit-logs-notifications',
    category: 'Audit & Notifications',
    title: 'Audit Logs & Notification Infrastructure',
    keywords: ['audit log', 'notification', 'audit log entry', 'resend', 'email', 'idempotent', 'sanitized'],
    content: `Audit Logs record all security-sensitive mutations (role changes, access grants, settings edits, approval decisions, evidence uploads).
Audit events scrub passwords, tokens, API keys, and raw document contents.
Notifications alert users of task assignments, due date reminders, and approval requests with tenant isolation.`,
  },
];

/**
 * Retrieve bounded relevant knowledge sections matching user query keywords.
 * Returns at most maxSections matching items to keep prompt token consumption minimal.
 */
export function getBoundedKnowledge(userQuery: string, maxSections = 3): KnowledgeSection[] {
  if (!userQuery || !userQuery.trim()) {
    return OMNIGRC_KNOWLEDGE_BASE.slice(0, maxSections);
  }

  const queryTokens = userQuery.toLowerCase().split(/\s+/).filter((t) => t.length > 2);

  const scored = OMNIGRC_KNOWLEDGE_BASE.map((section) => {
    let score = 0;
    const fullText = `${section.title} ${section.category} ${section.keywords.join(' ')} ${section.content}`.toLowerCase();

    queryTokens.forEach((token) => {
      if (section.keywords.some((kw) => kw.toLowerCase().includes(token))) {
        score += 5;
      }
      if (section.title.toLowerCase().includes(token)) {
        score += 3;
      }
      if (fullText.includes(token)) {
        score += 1;
      }
    });

    return { section, score };
  });

  scored.sort((a, b) => b.score - a.score);

  const matches = scored.filter((s) => s.score > 0).map((s) => s.section);
  if (matches.length === 0) {
    return [OMNIGRC_KNOWLEDGE_BASE[0], OMNIGRC_KNOWLEDGE_BASE[1]];
  }

  return matches.slice(0, maxSections);
}
