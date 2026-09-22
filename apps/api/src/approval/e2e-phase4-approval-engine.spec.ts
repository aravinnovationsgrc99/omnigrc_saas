import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ForbiddenException, BadRequestException, NotFoundException } from '@nestjs/common';
import { AppModule } from '../app.module';
import { PrismaService } from '../prisma/prisma.service';
import { ApprovalEngineService } from './approval-engine.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import {
  Role,
  ProductAccessStatus,
  ApproverType,
  DecisionAction,
  ApprovalInstanceStatus,
  ApprovalStepStatus,
} from '@omnigrc/shared';

describe('E2E Phase 4: Universal Approval & Decision Workflow Engine Suite', () => {
  jest.setTimeout(60000);
  let app: INestApplication;
  let prisma: PrismaService;
  let approvalService: ApprovalEngineService;
  let auditLogsService: AuditLogsService;

  const ORG_A_ID = 'org-phase4-e2e-a';
  const ORG_B_ID = 'org-phase4-e2e-b';

  const USER_ADMIN_A = 'user-admin-4a';
  const USER_ANALYST_A = 'user-analyst-4a';
  const USER_AUDITOR_A = 'user-auditor-4a';
  const USER_ADMIN_B = 'user-admin-4b';

  let policyAId: string;
  let multiStepWorkflowId: string;
  let singleStepInstanceId: string;
  let multiStepInstanceId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    prisma = app.get<PrismaService>(PrismaService);
    approvalService = app.get<ApprovalEngineService>(ApprovalEngineService);
    auditLogsService = app.get<AuditLogsService>(AuditLogsService);

    // Seed test organizations
    await prisma.organization.upsert({
      where: { id: ORG_A_ID },
      update: {},
      create: { id: ORG_A_ID, name: 'Phase 4 Org A' },
    });
    await prisma.organization.upsert({
      where: { id: ORG_B_ID },
      update: {},
      create: { id: ORG_B_ID, name: 'Phase 4 Org B' },
    });

    // Seed Users & Active Memberships
    await prisma.user.upsert({
      where: { id: USER_ADMIN_A },
      update: {},
      create: { id: USER_ADMIN_A, email: 'admin4a@orga.com', name: 'Admin 4A', organizationId: ORG_A_ID, passwordHash: 'hash', role: Role.ADMIN },
    });
    await prisma.organizationMembership.upsert({
      where: { organizationId_userId: { organizationId: ORG_A_ID, userId: USER_ADMIN_A } },
      update: { status: ProductAccessStatus.ACTIVE },
      create: { organizationId: ORG_A_ID, userId: USER_ADMIN_A, role: Role.ADMIN, status: ProductAccessStatus.ACTIVE },
    });

    await prisma.user.upsert({
      where: { id: USER_ANALYST_A },
      update: {},
      create: { id: USER_ANALYST_A, email: 'analyst4a@orga.com', name: 'Analyst 4A', organizationId: ORG_A_ID, passwordHash: 'hash', role: Role.ANALYST },
    });
    await prisma.organizationMembership.upsert({
      where: { organizationId_userId: { organizationId: ORG_A_ID, userId: USER_ANALYST_A } },
      update: { status: ProductAccessStatus.ACTIVE },
      create: { organizationId: ORG_A_ID, userId: USER_ANALYST_A, role: Role.ANALYST, status: ProductAccessStatus.ACTIVE },
    });

    await prisma.user.upsert({
      where: { id: USER_AUDITOR_A },
      update: {},
      create: { id: USER_AUDITOR_A, email: 'auditor4a@orga.com', name: 'Auditor 4A', organizationId: ORG_A_ID, passwordHash: 'hash', role: Role.EXTERNAL_AUDITOR },
    });
    await prisma.organizationMembership.upsert({
      where: { organizationId_userId: { organizationId: ORG_A_ID, userId: USER_AUDITOR_A } },
      update: { status: ProductAccessStatus.ACTIVE },
      create: { organizationId: ORG_A_ID, userId: USER_AUDITOR_A, role: Role.EXTERNAL_AUDITOR, status: ProductAccessStatus.ACTIVE },
    });

    await prisma.user.upsert({
      where: { id: USER_ADMIN_B },
      update: {},
      create: { id: USER_ADMIN_B, email: 'admin4b@orgb.com', name: 'Admin 4B', organizationId: ORG_B_ID, passwordHash: 'hash', role: Role.ADMIN },
    });
    await prisma.organizationMembership.upsert({
      where: { organizationId_userId: { organizationId: ORG_B_ID, userId: USER_ADMIN_B } },
      update: { status: ProductAccessStatus.ACTIVE },
      create: { organizationId: ORG_B_ID, userId: USER_ADMIN_B, role: Role.ADMIN, status: ProductAccessStatus.ACTIVE },
    });

    // Seed test policy resource
    const pol = await prisma.policy.create({
      data: {
        organizationId: ORG_A_ID,
        code: 'POL-P4-001',
        title: 'Phase 4 Approval Test Policy',
        category: 'INFORMATION_SECURITY',
        ownerId: USER_ADMIN_A,
        createdById: USER_ADMIN_A,
      },
    });
    policyAId = pol.id;

    jest.spyOn(auditLogsService, 'log').mockImplementation(async () => ({} as any));
  });

  afterAll(async () => {
    await prisma.approvalDecision.deleteMany({ where: { organizationId: { in: [ORG_A_ID, ORG_B_ID] } } });
    await prisma.approvalInstanceStep.deleteMany({ where: { approvalInstance: { organizationId: { in: [ORG_A_ID, ORG_B_ID] } } } });
    await prisma.policyApproval.deleteMany({ where: { organizationId: { in: [ORG_A_ID, ORG_B_ID] } } });
    await prisma.approvalInstance.deleteMany({ where: { organizationId: { in: [ORG_A_ID, ORG_B_ID] } } });
    await prisma.approvalWorkflowStep.deleteMany({ where: { workflow: { organizationId: { in: [ORG_A_ID, ORG_B_ID] } } } });
    await prisma.approvalWorkflow.deleteMany({ where: { organizationId: { in: [ORG_A_ID, ORG_B_ID] } } });
    await prisma.policy.deleteMany({ where: { id: policyAId } });
    await prisma.organizationMembership.deleteMany({ where: { organizationId: { in: [ORG_A_ID, ORG_B_ID] } } });
    await prisma.user.deleteMany({ where: { id: { in: [USER_ADMIN_A, USER_ANALYST_A, USER_AUDITOR_A, USER_ADMIN_B] } } });
    await prisma.organization.deleteMany({ where: { id: { in: [ORG_A_ID, ORG_B_ID] } } });
    await app.close();
  });

  it('A. Configurable Multi-Step Workflow: Creates custom 2-step approval workflow', async () => {
    const wf = await approvalService.createWorkflow(ORG_A_ID, USER_ADMIN_A, {
      name: 'Two-Tier Policy Approval Workflow',
      applicableResourceType: 'POLICY',
      allowSelfApproval: false,
      steps: [
        { stepNumber: 1, name: 'Analyst Initial Review', approverType: ApproverType.ROLE, targetRole: Role.ANALYST },
        { stepNumber: 2, name: 'Executive Admin Sign-off', approverType: ApproverType.ROLE, targetRole: Role.ADMIN },
      ],
    });

    expect(wf).toBeDefined();
    expect(wf.steps.length).toBe(2);
    expect(wf.steps[0].targetRole).toBe(Role.ANALYST);
    expect(wf.steps[1].targetRole).toBe(Role.ADMIN);
    multiStepWorkflowId = wf.id;
  });

  it('B. Instance Submission & Step Activation: Submitting request activates Step 1', async () => {
    const instance = await approvalService.createApprovalInstance(ORG_A_ID, USER_ANALYST_A, {
      workflowId: multiStepWorkflowId,
      title: 'Approval Request for POL-P4-001',
      resourceType: 'POLICY',
      resourceId: policyAId,
    });

    expect(instance).toBeDefined();
    expect(instance.status).toBe(ApprovalInstanceStatus.PENDING);
    expect(instance.currentStepNumber).toBe(1);
    expect(instance.steps[0].status).toBe(ApprovalStepStatus.ACTIVE);
    expect(instance.steps[1].status).toBe(ApprovalStepStatus.PENDING);

    multiStepInstanceId = instance.id;
  });

  it('C. Separation of Duties: Requester (Analyst A) cannot approve own request when forbidden', async () => {
    const analystContext = { userId: USER_ANALYST_A, role: Role.ANALYST, departmentIds: [], projectIds: [] };

    await expect(
      approvalService.makeDecision(ORG_A_ID, USER_ANALYST_A, analystContext, multiStepInstanceId, {
        action: DecisionAction.APPROVE,
        comment: 'Self approval attempt',
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('D. Sequential Step Progression: Step 1 approved by Admin A activates Step 2', async () => {
    const adminContext = { userId: USER_ADMIN_A, role: Role.ADMIN, departmentIds: [], projectIds: [] };

    const updated = await approvalService.makeDecision(ORG_A_ID, USER_ADMIN_A, adminContext, multiStepInstanceId, {
      action: DecisionAction.APPROVE,
      comment: 'Initial review passed cleanly',
    });

    expect(updated.status).toBe(ApprovalInstanceStatus.IN_REVIEW);
    expect(updated.currentStepNumber).toBe(2);
    expect(updated.steps[0].status).toBe(ApprovalStepStatus.APPROVED);
    expect(updated.steps[1].status).toBe(ApprovalStepStatus.ACTIVE);
    expect(updated.decisions.length).toBe(1);
  });

  it('E. Final Step Approval: Step 2 approved by Admin A finalizes status to APPROVED', async () => {
    const adminContext = { userId: USER_ADMIN_A, role: Role.ADMIN, departmentIds: [], projectIds: [] };

    const finalized = await approvalService.makeDecision(ORG_A_ID, USER_ADMIN_A, adminContext, multiStepInstanceId, {
      action: DecisionAction.APPROVE,
      comment: 'Approved by Executive Admin',
    });

    expect(finalized.status).toBe(ApprovalInstanceStatus.APPROVED);
    expect(finalized.completedAt).toBeDefined();
    singleStepInstanceId = multiStepInstanceId;

    // Verify Policy status was updated to APPROVED via transition callback
    const updatedPol = await prisma.policy.findUnique({ where: { id: policyAId } });
    expect(updatedPol?.status).toBe('APPROVED');
  });

  it('F. Tenant Isolation: Org B user cannot access or approve Org A instance', async () => {
    const adminBContext = { userId: USER_ADMIN_B, role: Role.ADMIN, departmentIds: [], projectIds: [] };

    await expect(
      approvalService.findOneInstance(ORG_B_ID, singleStepInstanceId, adminBContext),
    ).rejects.toThrow(NotFoundException);

    await expect(
      approvalService.makeDecision(ORG_B_ID, USER_ADMIN_B, adminBContext, singleStepInstanceId, {
        action: DecisionAction.APPROVE,
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it('G. External Auditor Authorization: External Auditor cannot approve instance', async () => {
    const auditorContext = { userId: USER_AUDITOR_A, role: Role.EXTERNAL_AUDITOR, departmentIds: [], projectIds: [] };

    const newInst = await approvalService.createApprovalInstance(ORG_A_ID, USER_ANALYST_A, {
      title: 'Auditor Test Approval',
      resourceType: 'POLICY',
      resourceId: policyAId,
    });

    await expect(
      approvalService.makeDecision(ORG_A_ID, USER_AUDITOR_A, auditorContext, newInst.id, {
        action: DecisionAction.APPROVE,
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('H. Decision Immutability & Audit Trail: Decisions are recorded permanently in history', async () => {
    const details = await approvalService.findOneInstance(ORG_A_ID, singleStepInstanceId);
    expect(details.decisions.length).toBeGreaterThanOrEqual(1);
    expect(details.decisions[0].action).toBe(DecisionAction.APPROVE);
    expect(details.decisions[0].actorId).toBe(USER_ADMIN_A);

    expect(auditLogsService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'APPROVAL_APPROVE',
        organizationId: ORG_A_ID,
        actorId: USER_ADMIN_A,
      }),
    );
  });
});
