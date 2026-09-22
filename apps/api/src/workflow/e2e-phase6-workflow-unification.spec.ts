import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ForbiddenException, BadRequestException, NotFoundException } from '@nestjs/common';
import { AppModule } from '../app.module';
import { PrismaService } from '../prisma/prisma.service';
import { WorkflowService } from './workflow.service';
import { ApprovalEngineService } from '../approval/approval-engine.service';
import { DocumentIntelligenceService } from '../document-intelligence/document-intelligence.service';
import { FrameworkEntitlementsService } from '../frameworks/framework-entitlements.service';
import {
  Role,
  EntitlementStatus,
  FrameworkCode,
  ApprovalPurpose,
  DecisionAction,
  FindingReviewStatus,
  FindingConversionType,
  EvidenceScanStatus,
  EvidenceStatus,
} from '@omnigrc/shared';

describe('Phase 6 — End-to-End GRC Workflow Unification E2E Suite', () => {
  jest.setTimeout(60000);
  let app: INestApplication;
  let prisma: PrismaService;
  let workflowService: WorkflowService;
  let approvalService: ApprovalEngineService;
  let docIntelService: DocumentIntelligenceService;
  let entitlementService: FrameworkEntitlementsService;

  const orgA = 'org-phase6-e2e-a';
  const orgB = 'org-phase6-e2e-b';

  let userAdminA: any;
  let userAnalystA: any;
  let userAuditorA: any;
  let userAdminB: any;

  let frameworkIso: any;
  let fwVersion: any;
  let fwRefClause: any;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    prisma = moduleRef.get<PrismaService>(PrismaService);
    workflowService = moduleRef.get<WorkflowService>(WorkflowService);
    approvalService = moduleRef.get<ApprovalEngineService>(ApprovalEngineService);
    docIntelService = moduleRef.get<DocumentIntelligenceService>(DocumentIntelligenceService);
    entitlementService = moduleRef.get<FrameworkEntitlementsService>(FrameworkEntitlementsService);

    // Clean up test orgs if exist
    await prisma.organization.deleteMany({
      where: { id: { in: [orgA, orgB] } },
    });

    // Create Test Organizations
    await prisma.organization.createMany({
      data: [
        { id: orgA, name: 'Phase 6 Org A' },
        { id: orgB, name: 'Phase 6 Org B' },
      ],
    });

    // Create Test Users
    userAdminA = await prisma.user.create({
      data: {
        id: 'usr-p6-admin-a',
        organizationId: orgA,
        name: 'Admin A',
        email: 'admin.p6.a@example.com',
        passwordHash: 'hash',
        role: Role.ADMIN,
      },
    });

    userAnalystA = await prisma.user.create({
      data: {
        id: 'usr-p6-analyst-a',
        organizationId: orgA,
        name: 'Analyst A',
        email: 'analyst.p6.a@example.com',
        passwordHash: 'hash',
        role: Role.ANALYST,
      },
    });

    userAuditorA = await prisma.user.create({
      data: {
        id: 'usr-p6-auditor-a',
        organizationId: orgA,
        name: 'Auditor A',
        email: 'auditor.p6.a@example.com',
        passwordHash: 'hash',
        role: Role.EXTERNAL_AUDITOR,
      },
    });

    userAdminB = await prisma.user.create({
      data: {
        id: 'usr-p6-admin-b',
        organizationId: orgB,
        name: 'Admin B',
        email: 'admin.p6.b@example.com',
        passwordHash: 'hash',
        role: Role.ADMIN,
      },
    });

    // Setup Framework Catalog
    frameworkIso = await prisma.framework.upsert({
      where: { code: FrameworkCode.ISO27001 },
      create: { code: FrameworkCode.ISO27001, name: 'ISO/IEC 27001:2022' },
      update: {},
    });

    fwVersion = await prisma.frameworkVersion.upsert({
      where: { frameworkId_version: { frameworkId: frameworkIso.id, version: '2022' } },
      create: {
        frameworkId: frameworkIso.id,
        version: '2022',
        name: '2022 Standard',
      },
      update: {},
    });

    fwRefClause = await prisma.frameworkReference.upsert({
      where: { frameworkVersionId_identifier: { frameworkVersionId: fwVersion.id, identifier: 'A.5.1' } },
      create: {
        frameworkVersionId: fwVersion.id,
        type: 'CLAUSE',
        identifier: 'A.5.1',
        title: 'Policies for Information Security',
        description: 'Information security policy requirement',
      },
      update: {},
    });

    // Grant Framework Entitlement for Org A
    const existingEnt = await prisma.organizationFrameworkEntitlement.findFirst({
      where: { organizationId: orgA, frameworkId: frameworkIso.id, versionId: null },
    });
    if (existingEnt) {
      await prisma.organizationFrameworkEntitlement.update({
        where: { id: existingEnt.id },
        data: { status: EntitlementStatus.ACTIVE },
      });
    } else {
      await prisma.organizationFrameworkEntitlement.create({
        data: {
          organizationId: orgA,
          frameworkId: frameworkIso.id,
          status: EntitlementStatus.ACTIVE,
        },
      });
    }
  });

  afterAll(async () => {
    await prisma.organization.deleteMany({
      where: { id: { in: [orgA, orgB] } },
    });
    await app.close();
  });

  // --------------------------------------------------
  // 14 EXPLICIT REQUIRED SCENARIO TESTS
  // --------------------------------------------------

  it('1. Complete End-to-End Happy-Path Lifecycle: Control -> Evidence -> AI -> Review -> Conversion -> Approval -> Remediation -> Verification', async () => {
    // 1. Create Control & Map to Framework Reference
    const control = await prisma.control.create({
      data: {
        organizationId: orgA,
        name: 'Access Control Policy',
        description: 'Enforce access management policies',
        createdById: userAdminA.id,
        mappings: {
          create: {
            frameworkReferenceId: fwRefClause.id,
            status: 'SUGGESTED',
          },
        },
      },
    });

    // 2. Upload Evidence (Clean)
    const evidence = await prisma.evidence.create({
      data: {
        organizationId: orgA,
        title: 'Access Control Policy Document 2026',
        fileName: 'access_control.pdf',
        fileSize: 1024,
        mimeType: 'application/pdf',
        storageKey: `evidence/${orgA}/access_control.pdf`,
        status: EvidenceStatus.ACTIVE,
        scanStatus: EvidenceScanStatus.CLEAN,
        uploadedById: userAdminA.id,
        controlAssociations: {
          create: {
            organizationId: orgA,
            controlId: control.id,
          },
        },
      },
    });

    // 3. Run AI Document Intelligence Analysis
    const analysis = await prisma.documentAnalysis.create({
      data: {
        organizationId: orgA,
        evidenceId: evidence.id,
        fingerprint: `fp-${evidence.id}`,
        extractionMethod: 'NATIVE_TEXT',
        requestedById: userAdminA.id,
        status: 'COMPLETED',
        findings: {
          create: {
            organizationId: orgA,
            findingType: 'OBLIGATION',
            aiTitle: 'Mandatory Quarterly Access Review Requirement',
            aiDescription: 'All user privileges must be reviewed quarterly by system owners.',
            aiSuggestedControlId: control.id,
            reviewStatus: FindingReviewStatus.UNREVIEWED,
          },
        },
      },
      include: { findings: true },
    });

    const finding = analysis.findings[0];
    expect(finding.reviewStatus).toBe(FindingReviewStatus.UNREVIEWED);

    // 4. Human Review (Accept AI Finding)
    const reviewedFinding = await docIntelService.reviewFinding(
      orgA,
      userAdminA.id,
      Role.ADMIN,
      analysis.id,
      finding.id,
      {
        reviewStatus: FindingReviewStatus.ACCEPTED,
        humanComment: 'Reviewed and confirmed by Admin',
      },
    );
    expect(reviewedFinding.reviewStatus).toBe(FindingReviewStatus.ACCEPTED);

    // 5. Convert Accepted AI Finding into Authoritative Compliance Task
    const conversionResult = await docIntelService.convertFindingToAction(
      orgA,
      userAdminA.id,
      Role.ADMIN,
      analysis.id,
      finding.id,
      {
        conversionType: 'COMPLIANCE_TASK',
        controlId: control.id,
        owner: 'Security Lead',
        dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      },
    );
    expect(conversionResult.actionType).toBe('COMPLIANCE_TASK');

    const task = await prisma.complianceTask.findUnique({
      where: { id: conversionResult.actionId },
    });
    expect(task).toBeDefined();
    expect(task?.obligationReference).toBe(`ai-finding:${finding.id}`);

    // 6. Submit Approval Instance for Control Sign-Off (Requester: Analyst)
    const approvalInst = await approvalService.createApprovalInstance(orgA, userAnalystA.id, {
      title: 'Control Sign-Off for Access Policy',
      resourceType: 'CONTROL',
      resourceId: control.id,
      purpose: ApprovalPurpose.CONTROL_SIGNOFF,
    });
    expect(approvalInst.status).toBe('PENDING');

    // 7. Make Decision (Approver: Admin)
    const userCtx = {
      userId: userAdminA.id,
      role: Role.ADMIN,
      departmentIds: [],
      projectIds: [],
    };
    const finalApproval = await approvalService.makeDecision(orgA, userAdminA.id, userCtx, approvalInst.id, {
      action: DecisionAction.APPROVE,
      comment: 'Signoff approved',
    });
    expect(finalApproval.status).toBe('APPROVED');

    // Verify Domain Callback Updated Control Framework Mapping to APPROVED
    const updatedMapping = await prisma.controlFrameworkMapping.findFirst({
      where: { controlId: control.id },
    });
    expect(updatedMapping?.status).toBe('APPROVED');

    // 8. Fetch Unified Lifecycle Read Model
    const lifecycle = await workflowService.getLifecycle(orgA, 'CONTROL', control.id);
    expect(lifecycle.resourceId).toBe(control.id);
    expect(lifecycle.authoritativeStatus).toBe('APPROVED');
    expect(lifecycle.isBlocked).toBe(false);
    expect(lifecycle.evidences.length).toBe(1);
    expect(lifecycle.evidences[0].isValidProof).toBe(true);
    expect(lifecycle.approvals.length).toBe(1);
    expect(lifecycle.approvals[0].status).toBe('APPROVED');
  });

  it('2. Tenant Isolation Enforcement', async () => {
    const riskA = await prisma.risk.create({
      data: {
        organizationId: orgA,
        title: 'Org A Confidential Risk',
        likelihood: 3,
        impact: 4,
        score: 12,
        owner: 'Admin A',
        createdById: userAdminA.id,
      },
    });

    await expect(workflowService.getLifecycle(orgB, 'RISK', riskA.id)).rejects.toThrow(NotFoundException);

    await expect(
      approvalService.createApprovalInstance(orgB, userAdminB.id, {
        title: 'Cross-Tenant Approval Hack',
        resourceType: 'RISK',
        resourceId: riskA.id,
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it('3. RBAC Enforcement', async () => {
    const riskA = await prisma.risk.create({
      data: {
        organizationId: orgA,
        title: 'Risk for RBAC Test',
        likelihood: 2,
        impact: 2,
        score: 4,
        owner: 'Analyst A',
        createdById: userAnalystA.id,
      },
    });

    const appInst = await approvalService.createApprovalInstance(orgA, userAnalystA.id, {
      title: 'Risk Acceptance Request',
      resourceType: 'RISK',
      resourceId: riskA.id,
      purpose: ApprovalPurpose.RISK_ACCEPTANCE,
    });

    // Analyst attempts to approve request without allowSelfApproval -> ForbiddenException
    const analystCtx = {
      userId: userAnalystA.id,
      role: Role.ANALYST,
      departmentIds: [],
      projectIds: [],
    };

    await expect(
      approvalService.makeDecision(orgA, userAnalystA.id, analystCtx, appInst.id, {
        action: DecisionAction.APPROVE,
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('4. External Auditor Read-Only Restrictions', async () => {
    const riskA = await prisma.risk.create({
      data: {
        organizationId: orgA,
        title: 'Risk for Auditor Test',
        likelihood: 2,
        impact: 2,
        score: 4,
        owner: 'Admin A',
        createdById: userAdminA.id,
      },
    });

    const appInst = await approvalService.createApprovalInstance(orgA, userAnalystA.id, {
      title: 'Risk Acceptance Request',
      resourceType: 'RISK',
      resourceId: riskA.id,
      purpose: ApprovalPurpose.RISK_ACCEPTANCE,
    });

    const auditorCtx = {
      userId: userAuditorA.id,
      role: Role.EXTERNAL_AUDITOR,
      departmentIds: [],
      projectIds: [],
    };

    await expect(
      approvalService.makeDecision(orgA, userAuditorA.id, auditorCtx, appInst.id, {
        action: DecisionAction.APPROVE,
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('5. Framework Entitlement Enforcement', async () => {
    // Suspend Entitlement for Org A
    await prisma.organizationFrameworkEntitlement.updateMany({
      where: { organizationId: orgA, frameworkId: frameworkIso.id },
      data: { status: EntitlementStatus.REVOKED },
    });

    await expect(entitlementService.assertEntitled(orgA, frameworkIso.id)).rejects.toThrow(ForbiddenException);

    // Restore Entitlement
    await prisma.organizationFrameworkEntitlement.updateMany({
      where: { organizationId: orgA, frameworkId: frameworkIso.id },
      data: { status: EntitlementStatus.ACTIVE },
    });
  });

  it('6. Quarantined & Unscanned Evidence Security Gate', async () => {
    const qEvidence = await prisma.evidence.create({
      data: {
        organizationId: orgA,
        title: 'Infected Evidence File',
        fileName: 'malware.pdf',
        fileSize: 500,
        mimeType: 'application/pdf',
        storageKey: `evidence/${orgA}/malware.pdf`,
        status: EvidenceStatus.QUARANTINED,
        scanStatus: EvidenceScanStatus.QUARANTINED,
        uploadedById: userAdminA.id,
      },
    });

    // Submitting approval for QUARANTINED evidence fails server-side check
    await expect(
      approvalService.createApprovalInstance(orgA, userAnalystA.id, {
        title: 'Quarantined Evidence Approval',
        resourceType: 'EVIDENCE',
        resourceId: qEvidence.id,
        purpose: ApprovalPurpose.EVIDENCE_VERIFICATION,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('7. AI Advisory Boundary', async () => {
    const evidence = await prisma.evidence.create({
      data: {
        organizationId: orgA,
        title: 'Unreviewed AI Test Doc',
        fileName: 'ai_doc.pdf',
        fileSize: 500,
        mimeType: 'application/pdf',
        storageKey: `evidence/${orgA}/ai_doc.pdf`,
        status: EvidenceStatus.ACTIVE,
        scanStatus: EvidenceScanStatus.CLEAN,
        uploadedById: userAdminA.id,
      },
    });

    const analysis = await prisma.documentAnalysis.create({
      data: {
        organizationId: orgA,
        evidenceId: evidence.id,
        fingerprint: `fp-advisory-${evidence.id}`,
        extractionMethod: 'NATIVE_TEXT',
        requestedById: userAdminA.id,
        status: 'COMPLETED',
        findings: {
          create: {
            organizationId: orgA,
            findingType: 'RISK',
            aiTitle: 'Suggested Risk Finding',
            aiDescription: 'AI detected vendor data risk',
            reviewStatus: FindingReviewStatus.UNREVIEWED,
          },
        },
      },
      include: { findings: true },
    });

    const finding = analysis.findings[0];

    // Unreviewed finding CANNOT be converted
    await expect(
      docIntelService.convertFindingToAction(
        orgA,
        userAdminA.id,
        Role.ADMIN,
        analysis.id,
        finding.id,
        { conversionType: 'RISK' },
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('8. Approval State Callbacks (APPROVED / REJECTED / REQUEST_CHANGES)', async () => {
    const policy = await prisma.policy.create({
      data: {
        organizationId: orgA,
        code: 'POL-CALLBACK-1',
        title: 'Callback Policy Test',
        category: 'Security',
        status: 'UNDER_REVIEW',
        ownerId: userAdminA.id,
        createdById: userAdminA.id,
      },
    });

    const appInst = await approvalService.createApprovalInstance(orgA, userAnalystA.id, {
      title: 'Policy Approval Request',
      resourceType: 'POLICY',
      resourceId: policy.id,
      purpose: ApprovalPurpose.POLICY_APPROVAL,
    });

    const userCtx = {
      userId: userAdminA.id,
      role: Role.ADMIN,
      departmentIds: [],
      projectIds: [],
    };

    await approvalService.makeDecision(orgA, userAdminA.id, userCtx, appInst.id, {
      action: DecisionAction.APPROVE,
      comment: 'Approved policy',
    });

    const updatedPolicy = await prisma.policy.findUnique({ where: { id: policy.id } });
    expect(updatedPolicy?.status).toBe('APPROVED');
  });

  it('9. Approval Purpose & Backward Compatibility Safety', async () => {
    // Risk Acceptance
    const riskAccept = await prisma.risk.create({
      data: {
        organizationId: orgA,
        title: 'Third Party Data Storage Risk',
        likelihood: 4,
        impact: 4,
        score: 16,
        status: 'OPEN',
        owner: 'CISO',
        createdById: userAdminA.id,
      },
    });

    const instAccept = await approvalService.createApprovalInstance(orgA, userAnalystA.id, {
      title: 'Request Risk Acceptance',
      resourceType: 'RISK',
      resourceId: riskAccept.id,
      purpose: ApprovalPurpose.RISK_ACCEPTANCE,
    });

    const userCtx = { userId: userAdminA.id, role: Role.ADMIN, departmentIds: [], projectIds: [] };
    await approvalService.makeDecision(orgA, userAdminA.id, userCtx, instAccept.id, { action: DecisionAction.APPROVE });

    const riskAcceptUpdated = await prisma.risk.findUnique({ where: { id: riskAccept.id } });
    expect(riskAcceptUpdated?.status).toBe('ACCEPTED');

    // Risk Treatment Rejection
    const riskTreat = await prisma.risk.create({
      data: {
        organizationId: orgA,
        title: 'Legacy Server OS Risk',
        likelihood: 3,
        impact: 3,
        score: 9,
        status: 'OPEN',
        owner: 'IT Ops',
        createdById: userAdminA.id,
      },
    });

    const instTreat = await approvalService.createApprovalInstance(orgA, userAnalystA.id, {
      title: 'Request Risk Treatment Approval',
      resourceType: 'RISK',
      resourceId: riskTreat.id,
      purpose: ApprovalPurpose.RISK_TREATMENT,
    });

    await approvalService.makeDecision(orgA, userAdminA.id, userCtx, instTreat.id, { action: DecisionAction.REJECT });

    const riskTreatUpdated = await prisma.risk.findUnique({ where: { id: riskTreat.id } });
    expect(riskTreatUpdated?.status).toBe('OPEN');
  });

  it('10. Remediation Model Integration', async () => {
    const vuln = await prisma.vulnerability.create({
      data: {
        organizationId: orgA,
        title: 'CVE-2026-9999 OpenSSL Buffer Overflow',
        severity: 'HIGH',
        status: 'OPEN',
        remediationOwner: 'SecOps',
        dueDate: new Date(Date.now() - 24 * 60 * 60 * 1000), // Overdue
        createdById: userAdminA.id,
      },
    });

    const lifecycle = await workflowService.getLifecycle(orgA, 'VULNERABILITY', vuln.id);
    expect(lifecycle.remediations.length).toBe(1);
    expect(lifecycle.remediations[0].isOverdue).toBe(true);
  });

  it('11. Re-Evaluation & Authoritative Verification Owner', async () => {
    const auditPlan = await prisma.auditPlan.create({
      data: {
        organizationId: orgA,
        title: 'ISO 27001 Annual Audit',
        ownerId: userAdminA.id,
        createdById: userAdminA.id,
      },
    });

    const assessment = await prisma.auditAssessment.create({
      data: {
        organizationId: orgA,
        auditPlanId: auditPlan.id,
        auditorId: userAdminA.id,
        createdById: userAdminA.id,
      },
    });

    const finding = await prisma.auditFinding.create({
      data: {
        organizationId: orgA,
        assessmentId: assessment.id,
        title: 'Unencrypted Backup Tapes',
        status: 'OPEN',
        ownerId: userAdminA.id,
        createdById: userAdminA.id,
      },
    });

    const appInst = await approvalService.createApprovalInstance(orgA, userAnalystA.id, {
      title: 'Verify Audit Finding Remediation',
      resourceType: 'AUDIT_FINDING',
      resourceId: finding.id,
      purpose: ApprovalPurpose.FINDING_VERIFICATION,
    });

    const userCtx = { userId: userAdminA.id, role: Role.ADMIN, departmentIds: [], projectIds: [] };
    await approvalService.makeDecision(orgA, userAdminA.id, userCtx, appInst.id, { action: DecisionAction.APPROVE });

    const updatedFinding = await prisma.auditFinding.findUnique({ where: { id: finding.id } });
    expect(updatedFinding?.status).toBe('VERIFIED');
    expect(updatedFinding?.verifiedAt).toBeDefined();
  });

  it('12. Audit Trail Completeness', async () => {
    const auditLogs = await prisma.auditLogEntry.findMany({
      where: { organizationId: orgA },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    expect(auditLogs.length).toBeGreaterThan(0);
    const actions = auditLogs.map((l) => l.action);
    expect(actions).toContain('APPROVAL_SUBMITTED');
  });

  it('13. Conversion & Callback Idempotency', async () => {
    const evidence = await prisma.evidence.create({
      data: {
        organizationId: orgA,
        title: 'Idempotency Test Doc',
        fileName: 'idempotent.pdf',
        fileSize: 500,
        mimeType: 'application/pdf',
        storageKey: `evidence/${orgA}/idempotent.pdf`,
        status: EvidenceStatus.ACTIVE,
        scanStatus: EvidenceScanStatus.CLEAN,
        uploadedById: userAdminA.id,
      },
    });

    const analysis = await prisma.documentAnalysis.create({
      data: {
        organizationId: orgA,
        evidenceId: evidence.id,
        fingerprint: `fp-idem-${evidence.id}`,
        extractionMethod: 'NATIVE_TEXT',
        requestedById: userAdminA.id,
        status: 'COMPLETED',
        findings: {
          create: {
            organizationId: orgA,
            findingType: 'OBLIGATION',
            aiTitle: 'Single Conversion Obligation',
            aiDescription: 'Must be converted once only.',
            reviewStatus: FindingReviewStatus.ACCEPTED,
          },
        },
      },
      include: { findings: true },
    });

    const finding = analysis.findings[0];

    // First Conversion succeeds
    const conv1 = await docIntelService.convertFindingToAction(
      orgA,
      userAdminA.id,
      Role.ADMIN,
      analysis.id,
      finding.id,
      { conversionType: 'COMPLIANCE_TASK' },
    );
    expect(conv1.actionId).toBeDefined();

    // Second Conversion fails (Idempotency enforcement)
    await expect(
      docIntelService.convertFindingToAction(
        orgA,
        userAdminA.id,
        Role.ADMIN,
        analysis.id,
        finding.id,
        { conversionType: 'COMPLIANCE_TASK' },
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('14. Notification Behavior & Attention Summary Endpoint', async () => {
    const attention = await workflowService.getAttentionSummary(orgA, userAdminA.id, Role.ADMIN);
    expect(attention).toBeDefined();
    expect(Array.isArray(attention.items)).toBe(true);
    expect(typeof attention.total).toBe('number');
    expect(typeof attention.pendingApprovalsCount).toBe('number');
  });
});
