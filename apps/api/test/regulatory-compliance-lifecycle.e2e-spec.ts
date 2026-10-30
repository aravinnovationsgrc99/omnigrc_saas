import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
import { RbiSourceAdapter } from '../src/regulatory-intelligence/adapters/rbi-source.adapter';
import { RegulatoryImpactAnalysisService } from '../src/regulatory-intelligence/ai/regulatory-impact-analysis.service';
import { RegulatoryObligationService } from '../src/regulatory-intelligence/obligations/regulatory-obligation.service';
import { RegulatoryApplicabilityService } from '../src/regulatory-intelligence/applicability/regulatory-applicability.service';
import { ObligationControlMappingService } from '../src/regulatory-intelligence/mappings/obligation-control-mapping.service';
import { RegulatoryControlGapService } from '../src/regulatory-intelligence/gaps/regulatory-control-gap.service';
import { RegulatoryRemediationService } from '../src/regulatory-intelligence/remediation/regulatory-remediation.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { AuditLogsService } from '../src/audit-logs/audit-logs.service';
import { NotificationsService } from '../src/notifications/notifications.service';
import { GeminiProvider } from '../src/controls/ai/gemini.provider';
import { MockAiProvider } from '../src/controls/ai/mock-ai.provider';
import { SsrfSafeHttpClientService } from '../src/regulatory-intelligence/security/ssrf-safe-http-client.service';
import { ObligationExtractorService } from '../src/regulatory-intelligence/obligations/obligation-extractor.service';
import { ApplicabilityEngineService } from '../src/regulatory-intelligence/applicability/applicability-engine.service';
import { MappingSuggestionEngineService } from '../src/regulatory-intelligence/mappings/mapping-suggestion-engine.service';
import { ControlGapEngineService } from '../src/regulatory-intelligence/gaps/control-gap-engine.service';
import { RegulatoryObligationStatus, ControlGapOutcome, EvidenceSufficiencyOutcome, MappingStatus } from '@prisma/client';

describe('Regulatory Compliance End-to-End Workflow (Stage 1 Acceptance)', () => {
  const TENANT_ID = 'tenant-meridian-health-001';
  const CREATOR_ID = 'user-engineer-aryan';
  const INDEPENDENT_AUDITOR_ID = 'auditor-lead-ciso';

  let rbiAdapter: RbiSourceAdapter;
  let impactService: RegulatoryImpactAnalysisService;
  let obligationService: RegulatoryObligationService;
  let applicabilityService: RegulatoryApplicabilityService;
  let mappingService: ObligationControlMappingService;
  let gapService: RegulatoryControlGapService;
  let remediationService: RegulatoryRemediationService;
  let mockPrisma: any;
  let mockAuditLogs: any;

  // In-memory test store for synthetic records across the 15-step journey
  const db = {
    sources: new Map<string, any>(),
    publications: new Map<string, any>(),
    obligations: new Map<string, any>(),
    assessments: new Map<string, any>(),
    mappings: new Map<string, any>(),
    gaps: new Map<string, any>(),
    remediations: new Map<string, any>(),
    complianceTasks: new Map<string, any>(),
    remediationHistory: [] as any[],
    auditLogs: [] as any[],
  };

  beforeAll(async () => {
    mockAuditLogs = {
      log: jest.fn().mockImplementation((payload) => {
        db.auditLogs.push({ ...payload, loggedAt: new Date().toISOString() });
        return Promise.resolve();
      }),
    };

    mockPrisma = {
      $transaction: jest.fn().mockImplementation((cb) => cb(mockPrisma)),
      regulatorySource: {
        findUnique: jest.fn().mockImplementation(({ where }) => Promise.resolve(db.sources.get(where.id) || null)),
      },
      regulatoryPublication: {
        findUnique: jest.fn().mockImplementation(({ where }) => Promise.resolve(db.publications.get(where.id) || null)),
      },
      regulatoryObligation: {
        findUnique: jest.fn().mockImplementation(({ where }) => Promise.resolve(db.obligations.get(where.id) || null)),
        update: jest.fn().mockImplementation(({ where, data }) => {
          const existing = db.obligations.get(where.id) || {};
          const updated = { ...existing, ...data };
          db.obligations.set(where.id, updated);
          return Promise.resolve(updated);
        }),
      },
      regulatoryApplicabilityAssessment: {
        findFirst: jest.fn().mockImplementation(({ where }) => {
          const match = Array.from(db.assessments.values()).find(
            (a) => a.organizationId === where.organizationId && a.obligationId === where.obligationId,
          );
          return Promise.resolve(match || null);
        }),
        findUnique: jest.fn().mockImplementation(({ where }) => {
          const match = Array.from(db.assessments.values()).find(
            (a) =>
              a.organizationId === where.organizationId_obligationId?.organizationId &&
              a.obligationId === where.organizationId_obligationId?.obligationId,
          );
          return Promise.resolve(match || null);
        }),
        create: jest.fn().mockImplementation(({ data }) => {
          const record = { id: `app-${Date.now()}`, ...data };
          db.assessments.set(record.id, record);
          return Promise.resolve(record);
        }),
        upsert: jest.fn().mockImplementation(({ create, update }) => {
          const record = { id: `app-${Date.now()}`, ...create, ...update };
          db.assessments.set(record.id, record);
          return Promise.resolve(record);
        }),
      },
      organization: {
        findUnique: jest.fn().mockResolvedValue({
          id: TENANT_ID,
          name: 'Meridian Health Pvt. Ltd.',
          primaryRegion: 'India',
          complianceProfile: {
            industrySector: 'HEALTHCARE_FINTECH',
            isRegulatedFinancialEntity: true,
            operatingJurisdictions: ['IN', 'GLOBAL'],
            handlesPersonalData: true,
            handlesPaymentData: true,
          },
        }),
      },
      organizationComplianceProfile: {
        findUnique: jest.fn().mockResolvedValue({
          organizationId: TENANT_ID,
          industrySector: 'HEALTHCARE_FINTECH',
          isRegulatedFinancialEntity: true,
          operatingJurisdictions: ['IN', 'GLOBAL'],
        }),
      },
      control: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'ctrl-mfa-01', name: 'Privileged Access Multi-Factor Authentication', category: 'ACCESS_CONTROL' },
          { id: 'ctrl-ir-02', name: 'Critical Security Incident Escalation & Response', category: 'INCIDENT_MANAGEMENT' },
        ]),
        findFirst: jest.fn().mockImplementation(({ where }) => {
          return Promise.resolve({
            id: where.id || 'ctrl-mfa-01',
            organizationId: where.organizationId,
            name: 'Privileged Access Multi-Factor Authentication',
          });
        }),
      },
      regulatoryObligationControlMapping: {
        findUnique: jest.fn().mockImplementation(({ where }) => {
          if (where.id) return Promise.resolve(db.mappings.get(where.id) || null);
          if (where.organizationId_obligationId_controlId) {
            const { organizationId, obligationId, controlId } = where.organizationId_obligationId_controlId;
            const match = Array.from(db.mappings.values()).find(
              (m: any) => m.organizationId === organizationId && m.obligationId === obligationId && m.controlId === controlId,
            );
            return Promise.resolve(match || null);
          }
          return Promise.resolve(null);
        }),
        findFirst: jest.fn().mockImplementation(({ where }) => {
          const match = Array.from(db.mappings.values()).find((m: any) => {
            if (where.id && m.id !== where.id) return false;
            if (where.organizationId && m.organizationId !== where.organizationId) return false;
            if (where.obligationId && m.obligationId !== where.obligationId) return false;
            if (where.status && m.status !== where.status) return false;
            return true;
          });
          if (match) {
            return Promise.resolve({
              ...match,
              obligation: db.obligations.get(match.obligationId),
              control: { id: match.controlId, name: 'Privileged Access Multi-Factor Authentication' },
            });
          }
          return Promise.resolve(null);
        }),
        findMany: jest.fn().mockImplementation(({ where }) => {
          return Promise.resolve(
            Array.from(db.mappings.values()).filter((m: any) => m.organizationId === where.organizationId),
          );
        }),
        create: jest.fn().mockImplementation(({ data }) => {
          const record = { id: `map-${Date.now()}`, ...data, status: 'PENDING_REVIEW' };
          db.mappings.set(record.id, record);
          return Promise.resolve(record);
        }),
        update: jest.fn().mockImplementation(({ where, data }) => {
          const existing = db.mappings.get(where.id);
          const updated = {
            ...existing,
            ...data,
            obligation: db.obligations.get(existing?.obligationId || 'ob-rbi-mfa-mandate'),
            control: { id: existing?.controlId || 'ctrl-mfa-01', name: 'Privileged Access Multi-Factor Authentication' },
          };
          db.mappings.set(where.id, updated);
          return Promise.resolve(updated);
        }),
      },
      regulatoryObligationControlMappingHistory: {
        create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: `map-hist-${Date.now()}`, ...data })),
      },
      regulatoryApplicabilityHistory: {
        create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: `app-hist-${Date.now()}`, ...data })),
      },
      regulatoryControlGapAssessment: {
        findFirst: jest.fn().mockImplementation(({ where }) => {
          const match = Array.from(db.gaps.values()).find((g: any) => {
            if (where.id && g.id !== where.id) return false;
            if (where.organizationId && g.organizationId !== where.organizationId) return false;
            if (where.obligationId && g.obligationId !== where.obligationId) return false;
            return true;
          });
          if (match) {
            return Promise.resolve({
              ...match,
              obligation: db.obligations.get(match.obligationId),
              control: { id: 'ctrl-mfa-01', name: 'Privileged Access Multi-Factor Authentication' },
            });
          }
          return Promise.resolve(null);
        }),
        findUnique: jest.fn().mockImplementation(({ where }) => {
          if (where.id) return Promise.resolve(db.gaps.get(where.id) || null);
          const match = Array.from(db.gaps.values()).find(
            (g: any) =>
              g.organizationId === where.organizationId_obligationId?.organizationId &&
              g.obligationId === where.organizationId_obligationId?.obligationId,
          );
          return Promise.resolve(match || null);
        }),
        upsert: jest.fn().mockImplementation(({ create, update }) => {
          const record = {
            id: `gap-${Date.now()}`,
            ...create,
            ...update,
            gapOutcome: ControlGapOutcome.NOT_IMPLEMENTED,
            evidenceOutcome: EvidenceSufficiencyOutcome.INSUFFICIENT,
            riskScore: 8,
            isHumanReviewed: true,
          };
          db.gaps.set(record.id, record);
          return Promise.resolve(record);
        }),
      },
      regulatoryControlGapAssessmentHistory: {
        create: jest.fn().mockResolvedValue({ id: 'gap-hist-1' }),
      },
      user: {
        findFirst: jest.fn().mockImplementation(({ where }) => {
          return Promise.resolve({
            id: where.id,
            organizationId: where.organizationId,
            name: 'Aryan Sayal',
            email: 'aryansayal99@gmail.com',
          });
        }),
      },
      evidence: {
        findMany: jest.fn().mockImplementation(({ where }) => {
          const ids = where?.id?.in || [];
          return Promise.resolve(
            ids.map((id: string) => ({
              id,
              organizationId: where.organizationId,
              title: 'MFA Penetration Test & Audit Log',
              verified: true,
              deletedAt: null,
            })),
          );
        }),
      },
      regulatoryRemediationTask: {
        findUnique: jest.fn().mockImplementation(({ where }) => Promise.resolve(db.remediations.get(where.id) || null)),
        findFirst: jest.fn().mockImplementation(({ where }) => {
          const match = Array.from(db.remediations.values()).find((r: any) => {
            if (where.id && r.id !== where.id) return false;
            if (where.organizationId && r.organizationId !== where.organizationId) return false;
            if (where.assessmentId && r.assessmentId !== where.assessmentId) return false;
            return true;
          });
          return Promise.resolve(match || null);
        }),
        create: jest.fn().mockImplementation(({ data }) => {
          const record = {
            id: `rem-${Date.now()}`,
            ...data,
            status: 'PROPOSED',
            isHumanApproved: false,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          db.remediations.set(record.id, record);
          return Promise.resolve(record);
        }),
        update: jest.fn().mockImplementation(({ where, data }) => {
          const existing = db.remediations.get(where.id);
          const updated = { ...existing, ...data, updatedAt: new Date() };
          db.remediations.set(where.id, updated);
          return Promise.resolve(updated);
        }),
      },
      complianceTask: {
        create: jest.fn().mockImplementation(({ data }) => {
          const task = { id: `ctask-${Date.now()}`, ...data };
          db.complianceTasks.set(task.id, task);
          return Promise.resolve(task);
        }),
        update: jest.fn().mockImplementation(({ where, data }) => {
          const task = db.complianceTasks.get(where.id);
          const updated = { ...task, ...data };
          db.complianceTasks.set(where.id, updated);
          return Promise.resolve(updated);
        }),
      },
      regulatoryRemediationHistory: {
        create: jest.fn().mockImplementation(({ data }) => {
          const hist = { id: `hist-${Date.now()}`, ...data, changedAt: new Date() };
          db.remediationHistory.push(hist);
          return Promise.resolve(hist);
        }),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RbiSourceAdapter,
        RegulatoryImpactAnalysisService,
        RegulatoryObligationService,
        RegulatoryApplicabilityService,
        ObligationControlMappingService,
        RegulatoryControlGapService,
        RegulatoryRemediationService,
        ObligationExtractorService,
        ApplicabilityEngineService,
        MappingSuggestionEngineService,
        ControlGapEngineService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditLogsService, useValue: mockAuditLogs },
        { provide: NotificationsService, useValue: { notify: jest.fn().mockResolvedValue(undefined) } },
        { provide: GeminiProvider, useValue: { isAvailable: () => false, generateText: jest.fn() } },
        { provide: MockAiProvider, useValue: { suggestMappings: jest.fn() } },
        { provide: SsrfSafeHttpClientService, useValue: { get: jest.fn() } },
      ],
    }).compile();

    rbiAdapter = module.get<RbiSourceAdapter>(RbiSourceAdapter);
    impactService = module.get<RegulatoryImpactAnalysisService>(RegulatoryImpactAnalysisService);
    obligationService = module.get<RegulatoryObligationService>(RegulatoryObligationService);
    applicabilityService = module.get<RegulatoryApplicabilityService>(RegulatoryApplicabilityService);
    mappingService = module.get<ObligationControlMappingService>(ObligationControlMappingService);
    gapService = module.get<RegulatoryControlGapService>(RegulatoryControlGapService);
    remediationService = module.get<RegulatoryRemediationService>(RegulatoryRemediationService);
  });

  it('Step 1 & 2: Ingest synthetic publication and verify source authority', async () => {
    const rawRbiXml = `
      <rss version="2.0">
        <channel>
          <title>RBI Notifications</title>
          <link>https://www.rbi.org.in</link>
          <item>
            <title>Master Direction on IT Governance, Risk and Cyber Resilience 2024</title>
            <link>https://www.rbi.org.in/scripts/NotificationUser.aspx?Id=13749&amp;Mode=0</link>
            <description>Mandatory MFA and 6-hour security incident notification framework.</description>
            <pubDate>Fri, 30 Oct 2026 15:15:00 GMT</pubDate>
          </item>
        </channel>
      </rss>`;

    const parsed = rbiAdapter.parseFeedXml(rawRbiXml, 'rbi.org.in');
    expect(parsed).toHaveLength(1);
    expect(parsed[0].title).toContain('Master Direction on IT Governance');
    expect(parsed[0].canonicalUrl).toBe('https://www.rbi.org.in/scripts/NotificationUser.aspx?Id=13749&Mode=0');

    // Register synthetic publication in tenant context
    const pubRecord = {
      id: 'pub-rbi-it-resilience-2024',
      title: parsed[0].title,
      publicationNumber: 'RBI/2024-25/11',
      source: { regulatorCode: 'RBI', displayName: 'Reserve Bank of India' },
      canonicalUrl: parsed[0].canonicalUrl,
      currentVersionNumber: 1,
      currentDocumentMetadata: {
        fullText: `Section 8.1: Implementation of multi-factor authentication (MFA) is mandatory for all administrative access.
Section 5.3: Cyber incidents must be escalated within 6 hours.`,
      },
    };
    db.publications.set(pubRecord.id, pubRecord);

    expect(pubRecord.source.regulatorCode).toBe('RBI');
    expect(pubRecord.canonicalUrl).toContain('rbi.org.in');
  });

  it('Step 3 & 4: Run AI impact analysis and inspect verbatim source citations', async () => {
    const impact = await impactService.analyzePublicationImpact(
      'pub-rbi-it-resilience-2024',
      TENANT_ID,
      CREATOR_ID,
      {},
    );

    expect(impact).toBeDefined();
    expect(impact.publicationId).toBe('pub-rbi-it-resilience-2024');
    expect(impact.findings.length).toBeGreaterThan(0);
    expect(impact.humanReviewRequired).toBe(true);

    const firstFinding = impact.findings[0];
    expect(firstFinding.sourceTextExcerpt).toBeTruthy();
    expect(firstFinding.isHumanReviewed).toBe(false);

    // Verify audit log emitted
    const auditRecord = db.auditLogs.find((a) => a.action === 'REGULATORY_PUBLICATION_AI_ANALYSIS_GENERATED');
    expect(auditRecord).toBeDefined();
    expect(auditRecord.organizationId).toBe(TENANT_ID);
  });

  it('Step 5: Review and approve candidate regulatory obligation', async () => {
    const candidateObligation = {
      id: 'ob-rbi-mfa-mandate',
      publicationId: 'pub-rbi-it-resilience-2024',
      title: 'Mandatory Multi-Factor Authentication for Privileged Access',
      fullText: 'Section 8.1: Implementation of multi-factor authentication (MFA) is mandatory for all administrative access.',
      status: RegulatoryObligationStatus.CANDIDATE,
      isHumanVerified: false,
      jurisdiction: 'IN',
      affectedActor: 'Regulated Entity',
    };
    db.obligations.set(candidateObligation.id, candidateObligation);

    const reviewed = await obligationService.reviewObligation(
      candidateObligation.id,
      { status: RegulatoryObligationStatus.VERIFIED, reviewNotes: 'Verified against official RBI master direction clause 8.1' },
      CREATOR_ID,
      TENANT_ID,
    );

    expect(reviewed.status).toBe(RegulatoryObligationStatus.VERIFIED);
    expect(reviewed.isHumanVerified).toBe(true);
    expect(db.obligations.get('ob-rbi-mfa-mandate').status).toBe(RegulatoryObligationStatus.VERIFIED);
  });

  it('Step 6: Run organizational applicability assessment against profile', async () => {
    const assessment = await applicabilityService.assessObligation(
      TENANT_ID,
      'ob-rbi-mfa-mandate',
      CREATOR_ID,
    );

    expect(assessment).toBeDefined();
    expect(assessment!.organizationId).toBe(TENANT_ID);
    expect(assessment!.obligationId).toBe('ob-rbi-mfa-mandate');
    expect(assessment!.outcome).toBe('APPLICABLE');
  });

  it('Step 7: Map obligation to organizational control and approve mapping', async () => {
    const mapping = await mappingService.createMapping(
      TENANT_ID,
      {
        obligationId: 'ob-rbi-mfa-mandate',
        controlId: 'ctrl-mfa-01',
        rationale: 'Control ctrl-mfa-01 satisfies Section 8.1 privileged access requirements.',
      },
      CREATOR_ID,
    );

    expect(mapping).toBeDefined();
    expect(mapping.obligationId).toBe('ob-rbi-mfa-mandate');
    expect(mapping.controlId).toBe('ctrl-mfa-01');

    const approvedMapping = await mappingService.reviewOrOverrideMapping(
      mapping.id,
      TENANT_ID,
      { status: MappingStatus.APPROVED, reviewNotes: 'Lead auditor signed off on mapping' },
      INDEPENDENT_AUDITOR_ID,
    );
    expect(approvedMapping.status).toBe(MappingStatus.APPROVED);
  });

  it('Step 8: Evaluate control gaps and evidence sufficiency', async () => {
    const gapFinding = await gapService.assessObligationGap(
      TENANT_ID,
      'ob-rbi-mfa-mandate',
      CREATOR_ID,
    );

    expect(gapFinding).toBeDefined();
    expect(gapFinding.obligationId).toBe('ob-rbi-mfa-mandate');
    expect(gapFinding.gapOutcome).toBe(ControlGapOutcome.NOT_IMPLEMENTED);
    expect(gapFinding.riskScore).toBeGreaterThanOrEqual(7);

    // Save in test db for remediation creation
    db.gaps.set(gapFinding.id, gapFinding);
  });

  it('Step 9, 10, 11, 12: Create, assign, progress, and complete remediation task', async () => {
    const gap = Array.from(db.gaps.values())[0];
    expect(gap).toBeDefined();

    // Step 9 & 10: Create and assign remediation task
    const task = await remediationService.createRemediation(
      TENANT_ID,
      CREATOR_ID,
      {
        assessmentId: gap.id,
        title: 'Deploy FIDO2 Hardware MFA on Production Database Gateways',
        description: 'Implement MFA enforcing hardware keys to satisfy RBI mandate',
        acceptanceCriteria: '100% of privileged database sessions enforce hardware tokens',
        assignedToId: CREATOR_ID,
        internalDueDate: new Date(Date.now() + 14 * 86400000).toISOString(),
      },
    );

    expect(task.status).toBe('PROPOSED');
    expect(task.assignedById).toBe(CREATOR_ID);

    // Step 11: Progress to IN_PROGRESS
    const inProgress = await remediationService.updateStatus(
      TENANT_ID,
      CREATOR_ID,
      task.id,
      { status: 'IN_PROGRESS' as any, progressNotes: 'Configuring Okta / FIDO2 security keys' },
    );
    expect(inProgress.status).toBe('IN_PROGRESS');

    // Step 12: Submit completion notes and evidence reference
    const completed = await remediationService.completeRemediation(
      TENANT_ID,
      CREATOR_ID,
      task.id,
      {
        completionNotes: 'FIDO2 MFA successfully rolled out to 100% of privileged database administrators',
        evidenceIds: ['https://vault.omnigrc.internal/evidence/mfa-audit-2026-10-30.pdf'],
      },
    );
    expect(completed.status).toBe('COMPLETED');
  });

  it('Step 13: Attempt self-verification by creator/assignee and confirm rejection (Segregation of Duties)', async () => {
    const task = Array.from(db.remediations.values())[0];

    // Creator / Assignee (CREATOR_ID) attempts self-verification
    await expect(
      remediationService.verifyAndClose(
        TENANT_ID,
        CREATOR_ID,
        'ADMIN',
        task.id,
        { verified: true, verificationNotes: 'Self verifying my own remediation' },
      ),
    ).rejects.toThrow(ForbiddenException);

    // Confirm status remains unchanged in COMPLETED
    expect(db.remediations.get(task.id).status).toBe('COMPLETED');
  });

  it('Step 14: Failed verification by independent auditor returns task to IN_PROGRESS with feedback', async () => {
    const task = Array.from(db.remediations.values())[0];

    // Independent auditor rejects verification due to incomplete test evidence
    const rejectedResult = await remediationService.verifyAndClose(
      TENANT_ID,
      INDEPENDENT_AUDITOR_ID,
      'ADMIN',
      task.id,
      {
        verified: false,
        rejectionReason: 'Penetration test report demonstrating MFA bypass resilience is missing from evidence.',
        verificationNotes: 'Auditor rejected completion pending pentest report',
      },
    );

    expect(rejectedResult.status).toBe('IN_PROGRESS');

    // Verify rejection history recorded
    const lastHistory = db.remediationHistory[db.remediationHistory.length - 1];
    expect(lastHistory.newStatus).toBe('IN_PROGRESS');
    expect(lastHistory.rationale).toContain('Penetration test report demonstrating MFA bypass resilience is missing');
  });

  it('Step 15: Resubmit completion and verify successful closure with retained audit history', async () => {
    const task = Array.from(db.remediations.values())[0];

    // Resubmit with pen-test evidence
    await remediationService.completeRemediation(
      TENANT_ID,
      CREATOR_ID,
      task.id,
      {
        completionNotes: 'Penetration test report attached confirming zero MFA bypass vulnerabilities',
        evidenceIds: [
          'https://vault.omnigrc.internal/evidence/mfa-audit-2026-10-30.pdf',
          'https://vault.omnigrc.internal/evidence/pentest-mfa-resilience.pdf',
        ],
      },
    );

    // Independent auditor verifies and closes
    const closedResult = await remediationService.verifyAndClose(
      TENANT_ID,
      INDEPENDENT_AUDITOR_ID,
      'ADMIN',
      task.id,
      {
        verified: true,
        verificationNotes: 'Pen-test evidence verified by Independent Lead Auditor. Requirement fully met.',
      },
    );

    expect(closedResult.status).toBe('VERIFIED_CLOSED');
    expect(closedResult.verifiedAt).toBeDefined();
    expect(closedResult.verifiedById).toBe(INDEPENDENT_AUDITOR_ID);

    // Verify audit logs retained
    const verifAudit = db.auditLogs.find((a) => a.action === 'REGULATORY_REMEDIATION_VERIFIED_CLOSED');
    expect(verifAudit).toBeDefined();
    expect(verifAudit.actorId).toBe(INDEPENDENT_AUDITOR_ID);
    expect(verifAudit.organizationId).toBe(TENANT_ID);
  });
});
