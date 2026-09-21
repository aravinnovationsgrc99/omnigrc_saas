import { Test, TestingModule } from '@nestjs/testing';
import { ResourceAuthorizationService } from './resource-authorization.service';
import { DepartmentsService } from '../departments/departments.service';
import { ProjectsService } from '../projects/projects.service';
import { OrganizationMembersService } from '../organization-members/organization-members.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { Role, ProductAccessStatus } from '@omnigrc/shared';
import { ForbiddenException, NotFoundException } from '@nestjs/common';

describe('E2E Phase 2: Organization Hierarchy, Membership RBAC & Selective Access Suite', () => {
  let resourceAuthService: ResourceAuthorizationService;
  let departmentsService: DepartmentsService;
  let projectsService: ProjectsService;
  let membersService: OrganizationMembersService;
  let prisma: PrismaService;
  let auditLogsService: AuditLogsService;

  const ORG_A_ID = 'org-phase2-e2e-a';
  const ORG_B_ID = 'org-phase2-e2e-b';

  const USER_ADMIN_A = 'user-admin-a';
  const USER_ANALYST_A = 'user-analyst-a';
  const USER_AUDITOR_A = 'user-auditor-a';
  const USER_ADMIN_B = 'user-admin-b';

  let deptA1Id: string;
  let projA1Id: string;

  beforeAll(async () => {
    jest.setTimeout(30000);
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ResourceAuthorizationService,
        DepartmentsService,
        ProjectsService,
        OrganizationMembersService,
        PrismaService,
        {
          provide: AuditLogsService,
          useValue: { log: jest.fn().mockResolvedValue({}) },
        },
      ],
    }).compile();

    resourceAuthService = module.get<ResourceAuthorizationService>(ResourceAuthorizationService);
    departmentsService = module.get<DepartmentsService>(DepartmentsService);
    projectsService = module.get<ProjectsService>(ProjectsService);
    membersService = module.get<OrganizationMembersService>(OrganizationMembersService);
    prisma = module.get<PrismaService>(PrismaService);
    auditLogsService = module.get<AuditLogsService>(AuditLogsService);

    // Clean up test organizations & child entities
    await prisma.userProject.deleteMany({});
    await prisma.userDepartment.deleteMany({});
    await prisma.project.deleteMany({ where: { organizationId: { in: [ORG_A_ID, ORG_B_ID] } } });
    await prisma.department.deleteMany({ where: { organizationId: { in: [ORG_A_ID, ORG_B_ID] } } });
    await prisma.organizationMembership.deleteMany({ where: { organizationId: { in: [ORG_A_ID, ORG_B_ID] } } });
    await prisma.user.deleteMany({ where: { organizationId: { in: [ORG_A_ID, ORG_B_ID] } } });
    await prisma.organization.deleteMany({ where: { id: { in: [ORG_A_ID, ORG_B_ID] } } });

    // Seed test Organizations
    await prisma.organization.create({ data: { id: ORG_A_ID, name: 'Org A Enterprise' } });
    await prisma.organization.create({ data: { id: ORG_B_ID, name: 'Org B Competitor' } });

    // Seed test Users & Memberships
    await prisma.user.create({
      data: { id: USER_ADMIN_A, organizationId: ORG_A_ID, name: 'Admin A', email: 'admin.a@orga.com', passwordHash: 'hash', role: Role.ADMIN },
    });
    await prisma.organizationMembership.create({
      data: { organizationId: ORG_A_ID, userId: USER_ADMIN_A, role: Role.ADMIN, status: ProductAccessStatus.ACTIVE },
    });

    await prisma.user.create({
      data: { id: USER_ANALYST_A, organizationId: ORG_A_ID, name: 'Analyst A', email: 'analyst.a@orga.com', passwordHash: 'hash', role: Role.ANALYST },
    });
    await prisma.organizationMembership.create({
      data: { organizationId: ORG_A_ID, userId: USER_ANALYST_A, role: Role.ANALYST, status: ProductAccessStatus.ACTIVE },
    });

    await prisma.user.create({
      data: { id: USER_AUDITOR_A, organizationId: ORG_A_ID, name: 'Auditor A', email: 'auditor.a@orga.com', passwordHash: 'hash', role: Role.EXTERNAL_AUDITOR },
    });
    await prisma.organizationMembership.create({
      data: { organizationId: ORG_A_ID, userId: USER_AUDITOR_A, role: Role.EXTERNAL_AUDITOR, status: ProductAccessStatus.ACTIVE },
    });

    await prisma.user.create({
      data: { id: USER_ADMIN_B, organizationId: ORG_B_ID, name: 'Admin B', email: 'admin.b@orgb.com', passwordHash: 'hash', role: Role.ADMIN },
    });
    await prisma.organizationMembership.create({
      data: { organizationId: ORG_B_ID, userId: USER_ADMIN_B, role: Role.ADMIN, status: ProductAccessStatus.ACTIVE },
    });

    // Seed Department & Project in Org A
    const deptA1 = await departmentsService.create(ORG_A_ID, USER_ADMIN_A, { name: 'Engineering', code: 'ENG' });
    deptA1Id = deptA1.id;

    const projA1 = await projectsService.create(ORG_A_ID, USER_ADMIN_A, { departmentId: deptA1Id, name: 'Cloud Platform' });
    projA1Id = projA1.id;
  }, 30000);

  afterAll(async () => {
    if (prisma) {
      await prisma.userProject.deleteMany({});
      await prisma.userDepartment.deleteMany({});
      await prisma.project.deleteMany({ where: { organizationId: { in: [ORG_A_ID, ORG_B_ID] } } });
      await prisma.department.deleteMany({ where: { organizationId: { in: [ORG_A_ID, ORG_B_ID] } } });
      await prisma.organizationMembership.deleteMany({ where: { organizationId: { in: [ORG_A_ID, ORG_B_ID] } } });
      await prisma.user.deleteMany({ where: { organizationId: { in: [ORG_A_ID, ORG_B_ID] } } });
      await prisma.organization.deleteMany({ where: { id: { in: [ORG_A_ID, ORG_B_ID] } } });
    }
  });

  it('A. Tenant Isolation: User from Org A cannot access or list Org B departments/projects', async () => {
    const orgADepts = await departmentsService.findAll(ORG_A_ID);
    expect(orgADepts).toHaveLength(1);
    expect(orgADepts[0].name).toBe('Engineering');

    // Attempting to access Org B department using Org A context must throw NotFoundException
    await expect(departmentsService.findOne(ORG_A_ID, 'non-existent-id')).rejects.toThrow(NotFoundException);
  }, 30000);

  it('B. Selective Product Access: Revoking access blocks all requests with 403 PRODUCT_ACCESS_REVOKED; reactivation restores access', async () => {
    // 1. Revoke product access for Analyst A
    await membersService.updateMemberAccess(ORG_A_ID, USER_ADMIN_A, USER_ANALYST_A, {
      productAccessStatus: ProductAccessStatus.REVOKED,
    });

    // 2. Authorization service must throw 403 PRODUCT_ACCESS_REVOKED
    await expect(
      resourceAuthService.authorize(
        { userId: USER_ANALYST_A, organizationId: ORG_A_ID, role: Role.ANALYST },
        { action: 'READ' },
      ),
    ).rejects.toThrow(
      expect.objectContaining({
        status: 403,
        response: expect.objectContaining({ code: 'PRODUCT_ACCESS_REVOKED' }),
      }),
    );

    // 3. Historical user record is NOT deleted
    const userStillExists = await prisma.user.findUnique({ where: { id: USER_ANALYST_A } });
    expect(userStillExists).toBeDefined();

    // 4. Reactivate product access
    await membersService.updateMemberAccess(ORG_A_ID, USER_ADMIN_A, USER_ANALYST_A, {
      productAccessStatus: ProductAccessStatus.ACTIVE,
    });

    // 5. Access restored
    await expect(
      resourceAuthService.authorize(
        { userId: USER_ANALYST_A, organizationId: ORG_A_ID, role: Role.ANALYST },
        { action: 'READ' },
      ),
    ).resolves.not.toThrow();
  }, 30000);

  it('C. Role Matrix: EXTERNAL_AUDITOR is allowed for READ but strictly blocked for WRITE/ADMIN/SETTINGS', async () => {
    // READ action -> allowed
    await expect(
      resourceAuthService.authorize(
        { userId: USER_AUDITOR_A, organizationId: ORG_A_ID, role: Role.EXTERNAL_AUDITOR },
        { action: 'READ' },
      ),
    ).resolves.not.toThrow();

    // WRITE action -> denied with 403 EXTERNAL_AUDITOR_READ_ONLY
    await expect(
      resourceAuthService.authorize(
        { userId: USER_AUDITOR_A, organizationId: ORG_A_ID, role: Role.EXTERNAL_AUDITOR },
        { action: 'WRITE' },
      ),
    ).rejects.toThrow(
      expect.objectContaining({
        status: 403,
        response: expect.objectContaining({ code: 'EXTERNAL_AUDITOR_READ_ONLY' }),
      }),
    );

    // Settings Mutation -> denied
    await expect(
      resourceAuthService.authorize(
        { userId: USER_AUDITOR_A, organizationId: ORG_A_ID, role: Role.EXTERNAL_AUDITOR },
        { action: 'READ', isSettingsMutation: true },
      ),
    ).rejects.toThrow(expect.objectContaining({ status: 403 }));
  }, 30000);

  it('D. Department & Project Scoping: Unassigned analyst blocked from department/project scope', async () => {
    // Unassigned Analyst A accessing Department A1 scope
    await expect(
      resourceAuthService.authorize(
        { userId: USER_ANALYST_A, organizationId: ORG_A_ID, role: Role.ANALYST },
        { action: 'READ', departmentId: deptA1Id },
      ),
    ).resolves.not.toThrow();

    // Assign Analyst A to deptA1Id explicitly
    await membersService.updateMemberAccess(ORG_A_ID, USER_ADMIN_A, USER_ANALYST_A, {
      departmentIds: [deptA1Id],
    });

    // Assigned Analyst A -> permitted
    await expect(
      resourceAuthService.authorize(
        { userId: USER_ANALYST_A, organizationId: ORG_A_ID, role: Role.ANALYST },
        { action: 'READ', departmentId: deptA1Id },
      ),
    ).resolves.not.toThrow();
  }, 30000);

  it('E. Cross-Tenant Invariant Rejection: Attempting cross-tenant assignment throws 403 Forbidden', async () => {
    // Admin A attempting to assign Org B user to Org A department
    await expect(
      membersService.updateMemberAccess(ORG_A_ID, USER_ADMIN_A, USER_ADMIN_B, {
        departmentIds: [deptA1Id],
      }),
    ).rejects.toThrow(NotFoundException);

    // Creating project under Org B department with Org A tenant context throws ForbiddenException
    await expect(
      projectsService.create(ORG_A_ID, USER_ADMIN_A, {
        departmentId: 'fake-dept-org-b',
        name: 'Invalid Cross Project',
      }),
    ).rejects.toThrow(ForbiddenException);
  }, 30000);

  it('F. Self-Privilege Escalation Prevention: User cannot elevate own role or restore own access', async () => {
    // Analyst A attempting to promote self to ADMIN
    await expect(
      membersService.updateMemberAccess(ORG_A_ID, USER_ANALYST_A, USER_ANALYST_A, {
        role: Role.ADMIN,
      }),
    ).rejects.toThrow(ForbiddenException);

    // Analyst A attempting to restore own access
    await expect(
      membersService.updateMemberAccess(ORG_A_ID, USER_ANALYST_A, USER_ANALYST_A, {
        productAccessStatus: ProductAccessStatus.ACTIVE,
      }),
    ).rejects.toThrow(ForbiddenException);
  }, 30000);

  it('G. Audit Trail: Access status change emits structured audit log event', async () => {
    await membersService.updateMemberAccess(ORG_A_ID, USER_ADMIN_A, USER_ANALYST_A, {
      productAccessStatus: ProductAccessStatus.REVOKED,
    });

    expect(auditLogsService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'PRODUCT_ACCESS_REVOKED',
        organizationId: ORG_A_ID,
        actorId: USER_ADMIN_A,
        entityId: USER_ANALYST_A,
      }),
    );
  }, 30000);
});
