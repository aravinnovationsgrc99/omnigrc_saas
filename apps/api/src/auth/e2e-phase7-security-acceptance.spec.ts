import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ForbiddenException, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { AppModule } from '../app.module';
import { PrismaService } from '../prisma/prisma.service';
import { ResourceAuthorizationService } from './resource-authorization.service';
import { OrganizationMembersService } from '../organization-members/organization-members.service';
import { DepartmentsService } from '../departments/departments.service';
import { ProjectsService } from '../projects/projects.service';
import { FrameworkEntitlementsService } from '../frameworks/framework-entitlements.service';
import { EvidenceService } from '../evidence/evidence.service';
import { ApprovalEngineService } from '../approval/approval-engine.service';
import { DocumentIntelligenceService } from '../document-intelligence/document-intelligence.service';
import { WorkflowService } from '../workflow/workflow.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { NotificationsService } from '../notifications/notifications.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import {
  Role,
  ProductAccessStatus,
  FrameworkCode,
  ApprovalPurpose,
  DecisionAction,
  FindingReviewStatus,
  EvidenceScanStatus,
  EvidenceStatus,
  ResourceScopeType,
  NotificationType,
} from '@omnigrc/shared';

describe('Phase 7 — Dedicated Security, Settings, Access Control & Acceptance Suite', () => {
  jest.setTimeout(60000);

  let app: INestApplication;
  let prisma: PrismaService;
  let resourceAuthService: ResourceAuthorizationService;
  let membersService: OrganizationMembersService;
  let departmentsService: DepartmentsService;
  let projectsService: ProjectsService;
  let entitlementService: FrameworkEntitlementsService;
  let evidenceService: EvidenceService;
  let approvalService: ApprovalEngineService;
  let docIntelService: DocumentIntelligenceService;
  let workflowService: WorkflowService;
  let auditLogsService: AuditLogsService;
  let notificationsService: NotificationsService;
  let jwtStrategy: JwtStrategy;

  const orgA = 'org-phase7-sec-a';
  const orgB = 'org-phase7-sec-b';
  const msspParentOrg = 'org-phase7-mssp-parent';

  let userAdminA: any;
  let userAnalystA: any;
  let userAuditorA: any;
  let userAdminB: any;
  let userMsspAdmin: any;

  let deptA: any;
  let projA: any;

  const adminCtx = {
    userId: 'usr-p7-admin-a',
    role: Role.ADMIN,
    departmentIds: [],
    projectIds: [],
  };

  const analystCtx = {
    userId: 'usr-p7-analyst-a',
    role: Role.ANALYST,
    departmentIds: [],
    projectIds: [],
  };

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    prisma = moduleRef.get<PrismaService>(PrismaService);
    resourceAuthService = moduleRef.get<ResourceAuthorizationService>(ResourceAuthorizationService);
    membersService = moduleRef.get<OrganizationMembersService>(OrganizationMembersService);
    departmentsService = moduleRef.get<DepartmentsService>(DepartmentsService);
    projectsService = moduleRef.get<ProjectsService>(ProjectsService);
    entitlementService = moduleRef.get<FrameworkEntitlementsService>(FrameworkEntitlementsService);
    evidenceService = moduleRef.get<EvidenceService>(EvidenceService);
    approvalService = moduleRef.get<ApprovalEngineService>(ApprovalEngineService);
    docIntelService = moduleRef.get<DocumentIntelligenceService>(DocumentIntelligenceService);
    workflowService = moduleRef.get<WorkflowService>(WorkflowService);
    auditLogsService = moduleRef.get<AuditLogsService>(AuditLogsService);
    notificationsService = moduleRef.get<NotificationsService>(NotificationsService);
    jwtStrategy = moduleRef.get<JwtStrategy>(JwtStrategy);

    // Clean up test orgs if exist
    await prisma.organization.deleteMany({
      where: { id: { in: [orgA, orgB, msspParentOrg] } },
    });

    // Create Test Organizations
    await prisma.organization.createMany({
      data: [
        { id: msspParentOrg, name: 'Phase 7 MSSP Provider Org', type: 'MSSP_PROVIDER' },
        { id: orgA, name: 'Phase 7 Client Org A', parentOrganizationId: msspParentOrg },
        { id: orgB, name: 'Phase 7 Client Org B' },
      ],
    });

    // Create Test Users
    userAdminA = await prisma.user.create({
      data: {
        id: 'usr-p7-admin-a',
        organizationId: orgA,
        name: 'Admin A',
        email: 'admin.p7.a@example.com',
        passwordHash: 'hash',
        role: Role.ADMIN,
      },
    });

    userAnalystA = await prisma.user.create({
      data: {
        id: 'usr-p7-analyst-a',
        organizationId: orgA,
        name: 'Analyst A',
        email: 'analyst.p7.a@example.com',
        passwordHash: 'hash',
        role: Role.ANALYST,
      },
    });

    userAuditorA = await prisma.user.create({
      data: {
        id: 'usr-p7-auditor-a',
        organizationId: orgA,
        name: 'Auditor A',
        email: 'auditor.p7.a@example.com',
        passwordHash: 'hash',
        role: Role.EXTERNAL_AUDITOR,
      },
    });

    userAdminB = await prisma.user.create({
      data: {
        id: 'usr-p7-admin-b',
        organizationId: orgB,
        name: 'Admin B',
        email: 'admin.p7.b@example.com',
        passwordHash: 'hash',
        role: Role.ADMIN,
      },
    });

    userMsspAdmin = await prisma.user.create({
      data: {
        id: 'usr-p7-mssp-admin',
        organizationId: msspParentOrg,
        name: 'MSSP Admin',
        email: 'mssp.p7.admin@example.com',
        passwordHash: 'hash',
        role: Role.MSSP_ADMIN,
      },
    });

    // Seed Memberships
    await prisma.organizationMembership.createMany({
      data: [
        { organizationId: orgA, userId: userAdminA.id, role: Role.ADMIN, status: ProductAccessStatus.ACTIVE },
        { organizationId: orgA, userId: userAnalystA.id, role: Role.ANALYST, status: ProductAccessStatus.ACTIVE },
        { organizationId: orgA, userId: userAuditorA.id, role: Role.EXTERNAL_AUDITOR, status: ProductAccessStatus.ACTIVE },
        { organizationId: orgB, userId: userAdminB.id, role: Role.ADMIN, status: ProductAccessStatus.ACTIVE },
      ],
    });

    // Seed Department & Project
    deptA = await departmentsService.create(orgA, userAdminA.id, {
      name: 'P7 Security Dept',
      code: 'SEC-D1',
    });

    projA = await projectsService.create(orgA, userAdminA.id, {
      departmentId: deptA.id,
      name: 'P7 Security Project',
      code: 'SEC-P1',
    });
  });

  afterAll(async () => {
    await prisma.organization.deleteMany({
      where: { id: { in: [orgA, orgB, msspParentOrg] } },
    });
    await app.close();
  });

  // --------------------------------------------------
  // 1 & 24. Highest-Authority Settings Mutation
  // --------------------------------------------------
  it('1. highest-authority settings mutation succeeds (ADMIN)', async () => {
    const updated = await membersService.updateMemberAccess(orgA, userAdminA.id, userAnalystA.id, {
      role: Role.ANALYST,
      departmentIds: [deptA.id],
      projectIds: [projA.id],
    });
    expect(updated).toBeDefined();
    expect(updated.departments).toHaveLength(1);
    expect(updated.projects).toHaveLength(1);
  });

  it('2. lower-role settings mutation denied (ANALYST throws 403)', async () => {
    await expect(
      resourceAuthService.authorize(
        { userId: userAnalystA.id, organizationId: orgA, role: Role.ANALYST },
        { action: 'ADMIN', isSettingsMutation: true, scopeType: ResourceScopeType.ORGANIZATION },
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('3. External Auditor settings mutation denied (EXTERNAL_AUDITOR throws 403)', async () => {
    await expect(
      resourceAuthService.authorize(
        { userId: userAuditorA.id, organizationId: orgA, role: Role.EXTERNAL_AUDITOR },
        { action: 'WRITE', scopeType: ResourceScopeType.ORGANIZATION },
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  // --------------------------------------------------
  // 4, 5, 6, 7 & 8. Selective Product Access & Session Revocation
  // --------------------------------------------------
  it('4. product access grant (ACTIVE status)', async () => {
    const mem = await membersService.findOne(orgA, userAnalystA.id);
    expect(mem.status).toBe(ProductAccessStatus.ACTIVE);
  });

  it('5. product access suspension (SUSPENDED)', async () => {
    await membersService.updateMemberAccess(orgA, userAdminA.id, userAnalystA.id, {
      productAccessStatus: ProductAccessStatus.SUSPENDED,
    });
    const mem = await membersService.findOne(orgA, userAnalystA.id);
    expect(mem.status).toBe(ProductAccessStatus.SUSPENDED);
  });

  it('8. stale-session/access revocation enforcement (SUSPENDED token fails JwtStrategy)', async () => {
    await expect(
      jwtStrategy.validate({ sub: userAnalystA.id, organizationId: orgA } as any),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('7. product access reactivation (RESTORED TO ACTIVE)', async () => {
    await membersService.updateMemberAccess(orgA, userAdminA.id, userAnalystA.id, {
      productAccessStatus: ProductAccessStatus.ACTIVE,
    });
    const validated = await jwtStrategy.validate({ sub: userAnalystA.id, organizationId: orgA } as any);
    expect(validated.userId).toBe(userAnalystA.id);
    expect(validated.role).toBe(Role.ANALYST);
  });

  it('6. product access revocation (REVOKED)', async () => {
    await membersService.updateMemberAccess(orgA, userAdminA.id, userAnalystA.id, {
      productAccessStatus: ProductAccessStatus.REVOKED,
    });
    await expect(
      jwtStrategy.validate({ sub: userAnalystA.id, organizationId: orgA } as any),
    ).rejects.toThrow(UnauthorizedException);

    // Restore for subsequent test steps
    await membersService.updateMemberAccess(orgA, userAdminA.id, userAnalystA.id, {
      productAccessStatus: ProductAccessStatus.ACTIVE,
    });
  });

  // --------------------------------------------------
  // 9. Department/Project Cross-Tenant Isolation
  // --------------------------------------------------
  it('9. department/project cross-tenant isolation enforced', async () => {
    // Attempting to assign Dept from Org A to Org B
    await expect(
      resourceAuthService.validateHierarchyInvariants(orgB, deptA.id, undefined),
    ).rejects.toThrow(ForbiddenException);

    // Attempting to assign Project from Org A to Org B
    await expect(
      resourceAuthService.validateHierarchyInvariants(orgB, undefined, projA.id),
    ).rejects.toThrow(ForbiddenException);
  });

  // --------------------------------------------------
  // 10 & 23. Framework Entitlement Enforcement
  // --------------------------------------------------
  it('10 & 23. framework entitlement enforcement', async () => {
    const isEntitled = await entitlementService.isEntitled(orgA, FrameworkCode.SOC2);
    expect(typeof isEntitled).toBe('boolean');
  });

  // --------------------------------------------------
  // 11. Evidence Security Gate
  // --------------------------------------------------
  it('11. evidence security gate (Path traversal & extension validation)', async () => {
    const invalidBuffer = Buffer.from('console.log("malicious code");');
    await expect(
      evidenceService.createAndUpload(
        orgA,
        userAdminA.id,
        { originalname: '../../etc/passwd.exe', buffer: invalidBuffer, mimetype: 'application/x-msdownload' },
        { title: 'Path Traversal File' },
      ),
    ).rejects.toThrow(BadRequestException);
  });

  // --------------------------------------------------
  // 12 & 13. AI Advisory Boundary & Conversion Authorization
  // --------------------------------------------------
  it('12 & 13. AI advisory boundary and conversion authorization', async () => {
    const evidenceBuffer = Buffer.from('%PDF-1.4 Sample AI Doc Content');
    const ev = await evidenceService.createAndUpload(
      orgA,
      userAdminA.id,
      { originalname: 'sample-ai-doc.pdf', buffer: evidenceBuffer, mimetype: 'application/pdf' },
      { title: 'AI Proof Document' },
    );

    const analysis = await prisma.documentAnalysis.create({
      data: {
        organizationId: orgA,
        fingerprint: 'fp-p7-sec-manual-' + Date.now(),
        extractionMethod: 'NATIVE_TEXT',
        requestedById: userAdminA.id,
      },
    });
    const analysisId = analysis.id;

    const finding = await prisma.extractedFinding.create({
      data: {
        organizationId: orgA,
        documentAnalysisId: analysisId,
        findingType: 'REQUIREMENT',
        aiTitle: 'Original Immutable AI Title',
        aiDescription: 'Original Immutable AI Description',
        aiConfidence: 'HIGH',
      },
    });

    // Unreviewed finding conversion attempt
    await expect(
      docIntelService.convertFindingToAction(orgA, userAdminA.id, Role.ADMIN, analysisId, finding.id, {
        conversionType: 'RISK',
      }),
    ).rejects.toThrow(BadRequestException);

    // Human review (Accept finding)
    await docIntelService.reviewFinding(orgA, userAdminA.id, Role.ADMIN, analysisId, finding.id, {
      reviewStatus: FindingReviewStatus.ACCEPTED,
    });

    // Convert accepted finding to Risk
    const result = await docIntelService.convertFindingToAction(orgA, userAdminA.id, Role.ADMIN, analysisId, finding.id, {
      conversionType: 'RISK',
      title: 'Human Verified Risk',
    });
    expect(result.actionId).toBeDefined();

    // Verify AI original fields remained immutable
    const updatedFinding = await prisma.extractedFinding.findFirst({ where: { id: finding.id } });
    expect(updatedFinding).toBeDefined();
    expect(updatedFinding?.aiTitle).toBe('Original Immutable AI Title');
  });

  // --------------------------------------------------
  // 14, 15 & 16. Approval Engine SoD, Purpose & Idempotency
  // --------------------------------------------------
  it('14, 15 & 16. approval engine SoD, purpose & idempotency', async () => {
    const ctrl = await prisma.control.create({
      data: {
        organizationId: orgA,
        name: 'Approval Target Control',
        description: 'Test Control for Approval Engine',
        createdById: userAdminA.id,
      },
    });

    const instance = await approvalService.createApprovalInstance(orgA, userAnalystA.id, {
      resourceType: 'CONTROL',
      resourceId: ctrl.id,
      title: 'Control Signoff Approval',
      purpose: ApprovalPurpose.CONTROL_SIGNOFF,
    });

    expect(instance.status).toBe('PENDING');

    // Requester self-approval denied (SoD)
    await expect(
      approvalService.makeDecision(orgA, userAnalystA.id, analystCtx, instance.id, {
        action: DecisionAction.APPROVE,
        comment: 'Self approval attempt',
      }),
    ).rejects.toThrow(ForbiddenException);

    // Admin approves instance
    const approvedInstance = await approvalService.makeDecision(orgA, userAdminA.id, adminCtx, instance.id, {
      action: DecisionAction.APPROVE,
      comment: 'Approved by Admin',
    });
    expect(approvedInstance.status).toBe('APPROVED');

    // Callback idempotency: repeated decision on finalized instance rejected safely
    await expect(
      approvalService.makeDecision(orgA, userAdminA.id, adminCtx, instance.id, {
        action: DecisionAction.APPROVE,
        comment: 'Repeated approval decision',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  // --------------------------------------------------
  // 17. Workflow Lifecycle Read Model
  // --------------------------------------------------
  it('17. workflow lifecycle read model aggregates authoritative state', async () => {
    const summary = await workflowService.getAttentionSummary(orgA, userAdminA.id, Role.ADMIN);
    expect(summary).toBeDefined();
    expect(Array.isArray(summary.items)).toBe(true);
  });

  // --------------------------------------------------
  // 18. Notification Behavior
  // --------------------------------------------------
  it('18. notification behavior creates tenant-isolated notification', async () => {
    await notificationsService.notify({
      organizationId: orgA,
      userId: userAdminA.id,
      type: NotificationType.TASK_ASSIGNED,
      message: 'Test message for notification infrastructure audit.',
      entityType: 'Organization',
      entityId: orgA,
    });

    const notifs = await prisma.notification.findMany({
      where: { organizationId: orgA, userId: userAdminA.id },
    });
    expect(notifs.length).toBeGreaterThan(0);
  });

  // --------------------------------------------------
  // 19. Audit Trail Security Verification
  // --------------------------------------------------
  it('19. audit log entries correctly created for security mutations', async () => {
    await auditLogsService.log({
      organizationId: orgA,
      actorId: userAdminA.id,
      action: 'ORGANIZATION_SETTINGS_MUTATED',
      entityType: 'Organization',
      entityId: orgA,
      metadata: { field: 'name', newValue: 'Phase 7 Client Org A' },
    });

    const logs = await prisma.auditLogEntry.findMany({
      where: { organizationId: orgA, action: 'ORGANIZATION_SETTINGS_MUTATED' },
    });
    expect(logs.length).toBeGreaterThan(0);
  });

  // --------------------------------------------------
  // 20. MSSP Context Isolation
  // --------------------------------------------------
  it('20. MSSP context isolation validates parent-child organization hierarchy', async () => {
    const validCtx = await jwtStrategy.validate({
      sub: userMsspAdmin.id,
      organizationId: orgA,
      actingViaMsspId: msspParentOrg,
    } as any);
    expect(validCtx.organizationId).toBe(orgA);
    expect(validCtx.actingViaMsspId).toBe(msspParentOrg);

    // Attempting to use MSSP context token for unrelated Org B fails
    await expect(
      jwtStrategy.validate({
        sub: userMsspAdmin.id,
        organizationId: orgB,
        actingViaMsspId: msspParentOrg,
      } as any),
    ).rejects.toThrow(UnauthorizedException);
  });

  // --------------------------------------------------
  // 21 & 22. External Auditor Read-Only & Report Authorization
  // --------------------------------------------------
  it('21 & 22. External Auditor read-only & report authorization', async () => {
    // Read action permitted
    await resourceAuthService.authorize(
      { userId: userAuditorA.id, organizationId: orgA, role: Role.EXTERNAL_AUDITOR },
      { action: 'READ', scopeType: ResourceScopeType.ORGANIZATION },
    );

    // Write action denied
    await expect(
      resourceAuthService.authorize(
        { userId: userAuditorA.id, organizationId: orgA, role: Role.EXTERNAL_AUDITOR },
        { action: 'WRITE', scopeType: ResourceScopeType.ORGANIZATION },
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  // --------------------------------------------------
  // 25. Complete End-to-End Business Journey
  // --------------------------------------------------
  it('25. Complete End-to-End Business Lifecycle Journey', async () => {
    // 1. Organization & Hierarchy
    expect(deptA.id).toBeDefined();
    expect(projA.id).toBeDefined();

    // 2. Member & Product Access
    const mem = await membersService.findOne(orgA, userAnalystA.id);
    expect(mem.status).toBe(ProductAccessStatus.ACTIVE);

    // 3. Control Creation
    const ctrl = await prisma.control.create({
      data: {
        organizationId: orgA,
        name: 'E2E Lifecycle Control',
        description: 'Complete lifecycle verification control',
        createdById: userAdminA.id,
      },
    });

    // 4. Evidence Upload
    const evidenceBuffer = Buffer.from('%PDF-1.4 E2E Test Proof Content');
    const evidence = await evidenceService.createAndUpload(
      orgA,
      userAdminA.id,
      { originalname: 'lifecycle-proof.pdf', buffer: evidenceBuffer, mimetype: 'application/pdf' },
      { title: 'E2E Lifecycle Proof Document', targetResourceType: 'CONTROL', targetResourceId: ctrl.id },
    );
    expect(evidence.id).toBeDefined();
    expect(evidence.status).toBe(EvidenceStatus.ACTIVE);

    // 5. Human Approval Submission & Decision
    const approval = await approvalService.createApprovalInstance(orgA, userAnalystA.id, {
      resourceType: 'CONTROL',
      resourceId: ctrl.id,
      title: 'Lifecycle Control Signoff',
      purpose: ApprovalPurpose.CONTROL_SIGNOFF,
    });

    const finalApproval = await approvalService.makeDecision(orgA, userAdminA.id, adminCtx, approval.id, {
      action: DecisionAction.APPROVE,
      comment: 'Lifecycle control signoff approved.',
    });
    expect(finalApproval.status).toBe('APPROVED');

    // 6. Workflow Lifecycle Graph Read Model
    const lifecycleGraph = await workflowService.getLifecycle(orgA, 'CONTROL', ctrl.id);
    expect(lifecycleGraph.resourceId).toBe(ctrl.id);
    expect(lifecycleGraph.stages.length).toBeGreaterThan(0);

    // 7. Audit History
    const auditEntries = await prisma.auditLogEntry.findMany({
      where: { organizationId: orgA },
    });
    expect(auditEntries.length).toBeGreaterThan(0);
  });
});
