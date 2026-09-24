import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ForbiddenException, NotFoundException } from '@nestjs/common';
import { AppModule } from '../app.module';
import { PrismaService } from '../prisma/prisma.service';
import { RisksService } from '../risks/risks.service';
import { ControlsService } from '../controls/controls.service';
import { ResourceAuthorizationService, ResourceAuthContext } from './resource-authorization.service';
import { Role, ProductAccessStatus } from '@omnigrc/shared';

describe('Phase B — Department / Project Resource Authorization Suite', () => {
  jest.setTimeout(60000);

  let app: INestApplication;
  let prisma: PrismaService;
  let risksService: RisksService;
  let controlsService: ControlsService;
  let resourceAuthService: ResourceAuthorizationService;

  const ORG_ID = 'org-auth-test-001';
  const DEPT_SEC_ID = 'dept-sec-001';
  const DEPT_FIN_ID = 'dept-fin-002';

  const PROJ_ALPHA_ID = 'proj-alpha-001';
  const PROJ_BETA_ID = 'proj-beta-002';

  const USER_ANALYST_ALPHA_ID = 'user-analyst-alpha-001';
  const USER_ANALYST_BETA_ID = 'user-analyst-beta-002';
  const USER_ADMIN_ID = 'user-admin-001';
  const USER_AUDITOR_ID = 'user-auditor-001';

  let riskAlphaId: string;
  let riskBetaId: string;
  let controlAlphaId: string;
  let controlBetaId: string;

  beforeAll(async () => {
    process.env.ENFORCE_LICENSE_IN_TEST = 'true';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    prisma = app.get(PrismaService);
    risksService = app.get(RisksService);
    controlsService = app.get(ControlsService);
    resourceAuthService = app.get(ResourceAuthorizationService);

    // Clean up old test data if present
    await prisma.risk.deleteMany({ where: { organizationId: ORG_ID } });
    await prisma.control.deleteMany({ where: { organizationId: ORG_ID } });
    await prisma.userProject.deleteMany({ where: { membership: { organizationId: ORG_ID } } });
    await prisma.userDepartment.deleteMany({ where: { membership: { organizationId: ORG_ID } } });
    await prisma.organizationMembership.deleteMany({ where: { organizationId: ORG_ID } });
    await prisma.project.deleteMany({ where: { organizationId: ORG_ID } });
    await prisma.department.deleteMany({ where: { organizationId: ORG_ID } });
    await prisma.user.deleteMany({ where: { organizationId: ORG_ID } });
    await prisma.organization.deleteMany({ where: { id: ORG_ID } });

    // 1. Create Organization
    await prisma.organization.create({
      data: {
        id: ORG_ID,
        name: 'Org Auth Test',
      },
    });

    // 2. Create Departments
    await prisma.department.create({
      data: {
        id: DEPT_SEC_ID,
        organizationId: ORG_ID,
        name: 'Security Department',
        code: 'SEC',
      },
    });

    await prisma.department.create({
      data: {
        id: DEPT_FIN_ID,
        organizationId: ORG_ID,
        name: 'Finance Department',
        code: 'FIN',
      },
    });

    // 3. Create Projects
    await prisma.project.create({
      data: {
        id: PROJ_ALPHA_ID,
        organizationId: ORG_ID,
        departmentId: DEPT_SEC_ID,
        name: 'Project Alpha',
      },
    });

    await prisma.project.create({
      data: {
        id: PROJ_BETA_ID,
        organizationId: ORG_ID,
        departmentId: DEPT_SEC_ID,
        name: 'Project Beta',
      },
    });

    // 4. Create Users & Memberships
    // Analyst Alpha -> Project Alpha
    await prisma.user.create({
      data: {
        id: USER_ANALYST_ALPHA_ID,
        organizationId: ORG_ID,
        name: 'Analyst Alpha',
        email: 'analyst.alpha@authtest.com',
        passwordHash: 'hash',
        role: Role.ANALYST,
      },
    });

    const memAlpha = await prisma.organizationMembership.create({
      data: {
        organizationId: ORG_ID,
        userId: USER_ANALYST_ALPHA_ID,
        role: Role.ANALYST,
        status: ProductAccessStatus.ACTIVE,
      },
    });

    await prisma.userDepartment.create({
      data: { membershipId: memAlpha.id, departmentId: DEPT_SEC_ID },
    });
    await prisma.userProject.create({
      data: { membershipId: memAlpha.id, projectId: PROJ_ALPHA_ID },
    });

    // Analyst Beta -> Project Beta
    await prisma.user.create({
      data: {
        id: USER_ANALYST_BETA_ID,
        organizationId: ORG_ID,
        name: 'Analyst Beta',
        email: 'analyst.beta@authtest.com',
        passwordHash: 'hash',
        role: Role.ANALYST,
      },
    });

    const memBeta = await prisma.organizationMembership.create({
      data: {
        organizationId: ORG_ID,
        userId: USER_ANALYST_BETA_ID,
        role: Role.ANALYST,
        status: ProductAccessStatus.ACTIVE,
      },
    });

    await prisma.userDepartment.create({
      data: { membershipId: memBeta.id, departmentId: DEPT_SEC_ID },
    });
    await prisma.userProject.create({
      data: { membershipId: memBeta.id, projectId: PROJ_BETA_ID },
    });

    // Admin User -> Organization Wide
    await prisma.user.create({
      data: {
        id: USER_ADMIN_ID,
        organizationId: ORG_ID,
        name: 'Admin User',
        email: 'admin@authtest.com',
        passwordHash: 'hash',
        role: Role.ADMIN,
      },
    });

    await prisma.organizationMembership.create({
      data: {
        organizationId: ORG_ID,
        userId: USER_ADMIN_ID,
        role: Role.ADMIN,
        status: ProductAccessStatus.ACTIVE,
      },
    });

    // External Auditor -> Project Alpha
    await prisma.user.create({
      data: {
        id: USER_AUDITOR_ID,
        organizationId: ORG_ID,
        name: 'External Auditor',
        email: 'auditor@authtest.com',
        passwordHash: 'hash',
        role: Role.EXTERNAL_AUDITOR,
      },
    });

    const memAuditor = await prisma.organizationMembership.create({
      data: {
        organizationId: ORG_ID,
        userId: USER_AUDITOR_ID,
        role: Role.EXTERNAL_AUDITOR,
        status: ProductAccessStatus.ACTIVE,
      },
    });

    await prisma.userProject.create({
      data: { membershipId: memAuditor.id, projectId: PROJ_ALPHA_ID },
    });

    // 5. Seed Scoped Resources
    const rAlpha = await prisma.risk.create({
      data: {
        organizationId: ORG_ID,
        departmentId: DEPT_SEC_ID,
        projectId: PROJ_ALPHA_ID,
        title: 'Project Alpha Data Leak Risk',
        likelihood: 4,
        impact: 4,
        score: 16,
        owner: 'Analyst Alpha',
        createdById: USER_ANALYST_ALPHA_ID,
      },
    });
    riskAlphaId = rAlpha.id;

    const rBeta = await prisma.risk.create({
      data: {
        organizationId: ORG_ID,
        departmentId: DEPT_SEC_ID,
        projectId: PROJ_BETA_ID,
        title: 'Project Beta API Misconfiguration Risk',
        likelihood: 3,
        impact: 5,
        score: 15,
        owner: 'Analyst Beta',
        createdById: USER_ANALYST_BETA_ID,
      },
    });
    riskBetaId = rBeta.id;

    const cAlpha = await prisma.control.create({
      data: {
        organizationId: ORG_ID,
        departmentId: DEPT_SEC_ID,
        projectId: PROJ_ALPHA_ID,
        name: 'Project Alpha Encryption Control',
        description: 'Enforce AES-256 for Alpha assets',
        createdById: USER_ANALYST_ALPHA_ID,
      },
    });
    controlAlphaId = cAlpha.id;

    const cBeta = await prisma.control.create({
      data: {
        organizationId: ORG_ID,
        departmentId: DEPT_SEC_ID,
        projectId: PROJ_BETA_ID,
        name: 'Project Beta IAM Guard Control',
        description: 'Enforce MFA for Beta users',
        createdById: USER_ANALYST_BETA_ID,
      },
    });
    controlBetaId = cBeta.id;
  });

  afterAll(async () => {
    delete process.env.ENFORCE_LICENSE_IN_TEST;
    if (prisma) {
      await prisma.risk.deleteMany({ where: { organizationId: ORG_ID } });
      await prisma.control.deleteMany({ where: { organizationId: ORG_ID } });
      await prisma.userProject.deleteMany({ where: { membership: { organizationId: ORG_ID } } });
      await prisma.userDepartment.deleteMany({ where: { membership: { organizationId: ORG_ID } } });
      await prisma.organizationMembership.deleteMany({ where: { organizationId: ORG_ID } });
      await prisma.project.deleteMany({ where: { organizationId: ORG_ID } });
      await prisma.department.deleteMany({ where: { organizationId: ORG_ID } });
      await prisma.user.deleteMany({ where: { organizationId: ORG_ID } });
      await prisma.organization.deleteMany({ where: { id: ORG_ID } });
    }
    if (app) {
      await app.close();
    }
  });

  describe('1. Project Scope Isolation & Query Filtering', () => {
    it('Analyst Alpha (Project A) only sees Project Alpha risks in list queries', async () => {
      const authCtx: ResourceAuthContext = {
        userId: USER_ANALYST_ALPHA_ID,
        organizationId: ORG_ID,
        role: Role.ANALYST,
      };

      const res = await risksService.findAll(authCtx, {});
      expect(res.items.length).toBe(1);
      expect(res.items[0].id).toBe(riskAlphaId);
    });

    it('Analyst Beta (Project B) only sees Project Beta risks in list queries', async () => {
      const authCtx: ResourceAuthContext = {
        userId: USER_ANALYST_BETA_ID,
        organizationId: ORG_ID,
        role: Role.ANALYST,
      };

      const res = await risksService.findAll(authCtx, {});
      expect(res.items.length).toBe(1);
      expect(res.items[0].id).toBe(riskBetaId);
    });

    it('Analyst Alpha cannot retrieve Project Beta risk by direct ID', async () => {
      const authCtx: ResourceAuthContext = {
        userId: USER_ANALYST_ALPHA_ID,
        organizationId: ORG_ID,
        role: Role.ANALYST,
      };

      await expect(risksService.findOne(authCtx, riskBetaId)).rejects.toThrow(NotFoundException);
    });

    it('Supplying Project B as query parameter does not grant Analyst Alpha access to Project B', async () => {
      const authCtx: ResourceAuthContext = {
        userId: USER_ANALYST_ALPHA_ID,
        organizationId: ORG_ID,
        role: Role.ANALYST,
      };

      const res = await risksService.findAll(authCtx, { search: 'Project Beta' });
      expect(res.items.length).toBe(0);
    });
  });

  describe('2. Create, Update, Delete Authorization', () => {
    it('Analyst Alpha cannot create a resource assigned to unauthorized Project B', async () => {
      const authCtx: ResourceAuthContext = {
        userId: USER_ANALYST_ALPHA_ID,
        organizationId: ORG_ID,
        role: Role.ANALYST,
      };

      await expect(
        risksService.create(authCtx, {
          title: 'Unauthorized Project B Risk',
          likelihood: 3,
          impact: 3,
          owner: 'Attacker',
          projectId: PROJ_BETA_ID,
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('Analyst Alpha cannot update Project B risk', async () => {
      const authCtx: ResourceAuthContext = {
        userId: USER_ANALYST_ALPHA_ID,
        organizationId: ORG_ID,
        role: Role.ANALYST,
      };

      await expect(
        risksService.update(authCtx, riskBetaId, { title: 'Hacked Title' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('Analyst Alpha cannot delete Project B risk', async () => {
      const authCtx: ResourceAuthContext = {
        userId: USER_ANALYST_ALPHA_ID,
        organizationId: ORG_ID,
        role: Role.ANALYST,
      };

      await expect(risksService.softDelete(authCtx, riskBetaId)).rejects.toThrow(NotFoundException);
    });
  });

  describe('3. Admin & External Auditor Role Behaviors', () => {
    it('Admin user has organization-wide visibility across all projects', async () => {
      const authCtx: ResourceAuthContext = {
        userId: USER_ADMIN_ID,
        organizationId: ORG_ID,
        role: Role.ADMIN,
      };

      const res = await risksService.findAll(authCtx, {});
      expect(res.items.length).toBe(2);
    });

    it('External Auditor obeys project scope and is restricted to read-only access', async () => {
      const authCtx: ResourceAuthContext = {
        userId: USER_AUDITOR_ID,
        organizationId: ORG_ID,
        role: Role.EXTERNAL_AUDITOR,
      };

      // Read succeeds within assigned Project Alpha scope
      const res = await risksService.findAll(authCtx, {});
      expect(res.items.length).toBe(1);
      expect(res.items[0].id).toBe(riskAlphaId);

      // Write action is strictly denied with EXTERNAL_AUDITOR_READ_ONLY
      await expect(
        risksService.create(authCtx, {
          title: 'Auditor Created Risk',
          likelihood: 2,
          impact: 2,
          owner: 'Auditor',
          projectId: PROJ_ALPHA_ID,
        }),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
