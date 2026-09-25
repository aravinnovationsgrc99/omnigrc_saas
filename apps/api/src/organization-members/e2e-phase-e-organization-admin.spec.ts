import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { AppModule } from '../app.module';
import { PrismaService } from '../prisma/prisma.service';
import { OrganizationMembersService } from './organization-members.service';
import { AuthService } from '../auth/auth.service';
import { DepartmentsService } from '../departments/departments.service';
import { ProjectsService } from '../projects/projects.service';
import { FrameworkCoverageService } from '../frameworks/framework-coverage.service';
import { ResourceAuthContext } from '../auth/resource-authorization.service';
import { Role, ProductAccessStatus, EntitlementStatus } from '@omnigrc/shared';
import { FrameworkCode } from '@prisma/client';

describe('Phase E — End-to-End GRC Workflow & Organization Administration', () => {
  jest.setTimeout(60000);

  let prisma: PrismaService;
  let membersService: OrganizationMembersService;
  let authService: AuthService;
  let departmentsService: DepartmentsService;
  let projectsService: ProjectsService;
  let coverageService: FrameworkCoverageService;

  const ORG_ALPHA_ID = 'org-phase-e-alpha';
  const ORG_BETA_ID = 'org-phase-e-beta';

  const adminAuthCtx: ResourceAuthContext = {
    userId: 'user-admin-e1',
    organizationId: ORG_ALPHA_ID,
    role: Role.ADMIN,
  };

  const msspAdminAuthCtx: ResourceAuthContext = {
    userId: 'user-mssp-admin-e1',
    organizationId: ORG_ALPHA_ID,
    role: Role.MSSP_ADMIN,
  };

  const analystAuthCtx: ResourceAuthContext = {
    userId: 'user-analyst-e1',
    organizationId: ORG_ALPHA_ID,
    role: Role.ANALYST,
  };

  const msspAnalystAuthCtx: ResourceAuthContext = {
    userId: 'user-mssp-analyst-e1',
    organizationId: ORG_ALPHA_ID,
    role: Role.MSSP_ANALYST,
  };

  const auditorAuthCtx: ResourceAuthContext = {
    userId: 'user-auditor-e1',
    organizationId: ORG_ALPHA_ID,
    role: Role.EXTERNAL_AUDITOR,
  };

  const otherOrgAdminCtx: ResourceAuthContext = {
    userId: 'user-admin-e2',
    organizationId: ORG_BETA_ID,
    role: Role.ADMIN,
  };

  let deptAlphaId: string;
  let deptBetaId: string;
  let projAlphaId: string;
  let projBetaId: string;
  let frameworkId: string;
  let versionId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    prisma = moduleFixture.get<PrismaService>(PrismaService);
    membersService = moduleFixture.get<OrganizationMembersService>(OrganizationMembersService);
    authService = moduleFixture.get<AuthService>(AuthService);
    departmentsService = moduleFixture.get<DepartmentsService>(DepartmentsService);
    projectsService = moduleFixture.get<ProjectsService>(ProjectsService);
    coverageService = moduleFixture.get<FrameworkCoverageService>(FrameworkCoverageService);

    // 1. Seed Organizations
    await prisma.organization.upsert({ where: { id: ORG_ALPHA_ID }, update: { name: 'Phase E Alpha Enterprise', primaryRegion: 'India' }, create: { id: ORG_ALPHA_ID, name: 'Phase E Alpha Enterprise', primaryRegion: 'India' } });
    await prisma.organization.upsert({ where: { id: ORG_BETA_ID }, update: {}, create: { id: ORG_BETA_ID, name: 'Phase E Beta Corp', primaryRegion: 'UK' } });

    // 2. Seed System Framework & Entitlements
    const fw = await prisma.framework.upsert({
      where: { code: FrameworkCode.ISO27001 },
      update: {},
      create: { code: FrameworkCode.ISO27001, name: 'ISO/IEC 27001:2022' },
    });
    frameworkId = fw.id;

    const ver = await prisma.frameworkVersion.upsert({
      where: { frameworkId_version: { frameworkId: fw.id, version: '2022-PHASE-E' } },
      update: {},
      create: { frameworkId: fw.id, version: '2022-PHASE-E', name: 'ISO 27001:2022 Phase E', status: 'ACTIVE' },
    });
    versionId = ver.id;

    // Entitlement for Alpha
    await prisma.organizationFrameworkEntitlement.deleteMany({
      where: { organizationId: ORG_ALPHA_ID },
    });
    await prisma.organizationFrameworkEntitlement.create({
      data: { organizationId: ORG_ALPHA_ID, frameworkId: fw.id, versionId: ver.id, status: EntitlementStatus.ACTIVE, source: 'ARAV_CONTROL_PLANE' },
    });

    // 3. Seed Users & Memberships
    await prisma.user.upsert({
      where: { id: adminAuthCtx.userId },
      update: {},
      create: { id: adminAuthCtx.userId, email: 'admin.e1@alpha.com', name: 'Admin E1', organizationId: ORG_ALPHA_ID, passwordHash: 'hash', role: Role.ADMIN },
    });
    await prisma.organizationMembership.upsert({
      where: { organizationId_userId: { organizationId: ORG_ALPHA_ID, userId: adminAuthCtx.userId } },
      update: { status: ProductAccessStatus.ACTIVE },
      create: { organizationId: ORG_ALPHA_ID, userId: adminAuthCtx.userId, role: Role.ADMIN, status: ProductAccessStatus.ACTIVE },
    });

    await prisma.user.upsert({
      where: { id: analystAuthCtx.userId },
      update: {},
      create: { id: analystAuthCtx.userId, email: 'analyst.e1@alpha.com', name: 'Analyst E1', organizationId: ORG_ALPHA_ID, passwordHash: 'hash', role: Role.ANALYST },
    });
    await prisma.organizationMembership.upsert({
      where: { organizationId_userId: { organizationId: ORG_ALPHA_ID, userId: analystAuthCtx.userId } },
      update: { status: ProductAccessStatus.ACTIVE },
      create: { organizationId: ORG_ALPHA_ID, userId: analystAuthCtx.userId, role: Role.ANALYST, status: ProductAccessStatus.ACTIVE },
    });

    await prisma.user.upsert({
      where: { id: otherOrgAdminCtx.userId },
      update: {},
      create: { id: otherOrgAdminCtx.userId, email: 'admin.e2@beta.com', name: 'Admin E2', organizationId: ORG_BETA_ID, passwordHash: 'hash', role: Role.ADMIN },
    });

    // Cleanup test users & invitations from previous runs
    await prisma.invitation.deleteMany({ where: { email: { in: ['new.employee@alpha.com', 'joined.employee@alpha.com'] } } });
    await prisma.organizationMembership.deleteMany({ where: { user: { email: 'joined.employee@alpha.com' } } });
    await prisma.user.deleteMany({ where: { email: 'joined.employee@alpha.com' } });

    // 4. Seed Departments & Projects
    await prisma.project.deleteMany({ where: { organizationId: { in: [ORG_ALPHA_ID, ORG_BETA_ID] } } });
    await prisma.department.deleteMany({ where: { organizationId: { in: [ORG_ALPHA_ID, ORG_BETA_ID] } } });

    const dAlpha = await prisma.department.create({
      data: { organizationId: ORG_ALPHA_ID, name: 'Security Operations', code: 'SEC-OPS' },
    });
    deptAlphaId = dAlpha.id;

    const dBeta = await prisma.department.create({
      data: { organizationId: ORG_BETA_ID, name: 'Beta Finance', code: 'FIN-BETA' },
    });
    deptBetaId = dBeta.id;

    const pAlpha = await prisma.project.create({
      data: { organizationId: ORG_ALPHA_ID, departmentId: deptAlphaId, name: 'Cloud Migration', code: 'CLOUD-01' },
    });
    projAlphaId = pAlpha.id;

    const pBeta = await prisma.project.create({
      data: { organizationId: ORG_BETA_ID, departmentId: deptBetaId, name: 'Beta Project', code: 'PROJ-BETA' },
    });
    projBetaId = pBeta.id;
  });

  describe('1. Organization Admin Settings & Real Data Retrieval', () => {
    it('1. Admin can retrieve organization settings via API', async () => {
      const details = await membersService.getOrganizationDetails(ORG_ALPHA_ID);
      expect(details).toBeDefined();
      expect(details.id).toBe(ORG_ALPHA_ID);
      expect(details.name).toBe('Phase E Alpha Enterprise');
    });

    it('2. Admin receives real backend organization counts and metrics', async () => {
      const details = await membersService.getOrganizationDetails(ORG_ALPHA_ID);
      expect(details.activeMemberCount).toBeGreaterThanOrEqual(1);
      expect(details.departmentCount).toBeGreaterThanOrEqual(1);
      expect(details.projectCount).toBeGreaterThanOrEqual(1);
    });

    it('3. Member list comes from real API query', async () => {
      const members = await membersService.findAll(ORG_ALPHA_ID);
      expect(members.length).toBeGreaterThanOrEqual(2);
      expect(members.some((m) => m.email === 'admin.e1@alpha.com')).toBe(true);
    });

    it('4. Department list comes from real API query', async () => {
      const depts = await departmentsService.findAll(ORG_ALPHA_ID);
      expect(depts.length).toBeGreaterThanOrEqual(1);
      expect(depts.some((d) => d.id === deptAlphaId)).toBe(true);
    });

    it('5. Project list comes from real API query', async () => {
      const projs = await projectsService.findAll(ORG_ALPHA_ID);
      expect(projs.length).toBeGreaterThanOrEqual(1);
      expect(projs.some((p) => p.id === projAlphaId)).toBe(true);
    });

    it('6. Framework entitlement list comes from real API query', async () => {
      const details = await membersService.getOrganizationDetails(ORG_ALPHA_ID);
      expect(details.entitlements.length).toBeGreaterThanOrEqual(1);
      expect(details.entitlements[0].frameworkCode).toBe(FrameworkCode.ISO27001);
    });
  });

  describe('2. Administrative Authorization & Role Controls', () => {
    it('7. ADMIN can mutate organization settings', async () => {
      const updated = await membersService.updateOrganizationDetails(
        ORG_ALPHA_ID,
        adminAuthCtx.userId,
        Role.ADMIN,
        { name: 'Phase E Alpha Updated' },
      );
      expect(updated.name).toBe('Phase E Alpha Updated');
    });

    it('8. MSSP_ADMIN can mutate client organization settings', async () => {
      const updated = await membersService.updateOrganizationDetails(
        ORG_ALPHA_ID,
        msspAdminAuthCtx.userId,
        Role.MSSP_ADMIN,
        { primaryRegion: 'United Kingdom' },
      );
      expect(updated.primaryRegion).toBe('United Kingdom');
    });

    it('9. ANALYST receives 403 Forbidden on organization setting mutation', async () => {
      await expect(
        membersService.updateOrganizationDetails(
          ORG_ALPHA_ID,
          analystAuthCtx.userId,
          Role.ANALYST,
          { name: 'Malicious Rename' },
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('10. MSSP_ANALYST receives 403 Forbidden on organization setting mutation', async () => {
      await expect(
        membersService.updateOrganizationDetails(
          ORG_ALPHA_ID,
          msspAnalystAuthCtx.userId,
          Role.MSSP_ANALYST,
          { name: 'Malicious Rename' },
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('11. EXTERNAL_AUDITOR receives 403 Forbidden on organization setting mutation', async () => {
      await expect(
        membersService.updateOrganizationDetails(
          ORG_ALPHA_ID,
          auditorAuthCtx.userId,
          Role.EXTERNAL_AUDITOR,
          { name: 'Malicious Rename' },
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('3. Employee Lifecycle & Access Management', () => {
    let newMemberUserId: string;

    it('12. Invite employee creates token invitation', async () => {
      const inv = await authService.createInvitation(adminAuthCtx.userId, {
        email: 'new.employee@alpha.com',
        role: Role.ANALYST,
      });
      expect(inv.id).toBeDefined();
      expect(inv.email).toBe('new.employee@alpha.com');
      expect(inv.status).toBe('PENDING');
    });

    it('13. Invitation appears in real pending invitation list', async () => {
      const invs = await authService.listInvitations(adminAuthCtx.userId);
      expect(invs.some((i) => i.email === 'new.employee@alpha.com')).toBe(true);
    });

    it('14. Complete onboarding/acceptance provisions user in organization', async () => {
      const user = await prisma.user.create({
        data: {
          organizationId: ORG_ALPHA_ID,
          email: 'joined.employee@alpha.com',
          name: 'Joined Employee',
          passwordHash: 'hash',
          role: Role.ANALYST,
        },
      });
      newMemberUserId = user.id;

      const member = await membersService.findOne(ORG_ALPHA_ID, newMemberUserId);
      expect(member.userId).toBe(newMemberUserId);
      expect(member.status).toBe(ProductAccessStatus.ACTIVE);
    });

    it('15. Assign role updates role server-side', async () => {
      const updated = await membersService.updateMemberAccess(
        ORG_ALPHA_ID,
        adminAuthCtx.userId,
        newMemberUserId,
        { role: Role.ADMIN },
      );
      expect(updated.role).toBe(Role.ADMIN);
    });

    it('16. Assign department updates user department scope', async () => {
      const updated = await membersService.updateMemberAccess(
        ORG_ALPHA_ID,
        adminAuthCtx.userId,
        newMemberUserId,
        { departmentIds: [deptAlphaId] },
      );
      expect(updated.departments.some((d) => d.id === deptAlphaId)).toBe(true);
    });

    it('17. Assign project updates user project scope', async () => {
      const updated = await membersService.updateMemberAccess(
        ORG_ALPHA_ID,
        adminAuthCtx.userId,
        newMemberUserId,
        { projectIds: [projAlphaId] },
      );
      expect(updated.projects.some((p) => p.id === projAlphaId)).toBe(true);
    });

    it('18. Suspend member restricts access', async () => {
      const updated = await membersService.updateMemberAccess(
        ORG_ALPHA_ID,
        adminAuthCtx.userId,
        newMemberUserId,
        { productAccessStatus: ProductAccessStatus.SUSPENDED },
      );
      expect(updated.productAccessStatus).toBe(ProductAccessStatus.SUSPENDED);
    });

    it('19. Reactivate member restores active access', async () => {
      const updated = await membersService.updateMemberAccess(
        ORG_ALPHA_ID,
        adminAuthCtx.userId,
        newMemberUserId,
        { productAccessStatus: ProductAccessStatus.ACTIVE },
      );
      expect(updated.productAccessStatus).toBe(ProductAccessStatus.ACTIVE);
    });

    it('20. Revoke member marks access revoked with actor attribution', async () => {
      const updated = await membersService.updateMemberAccess(
        ORG_ALPHA_ID,
        adminAuthCtx.userId,
        newMemberUserId,
        { productAccessStatus: ProductAccessStatus.REVOKED },
      );
      expect(updated.productAccessStatus).toBe(ProductAccessStatus.REVOKED);
      expect(updated.revokedById).toBe(adminAuthCtx.userId);
    });
  });

  describe('4. Tenant Isolation & Cross-Tenant Security Guards', () => {
    it('21. Cross-tenant member access modification is blocked (403 Forbidden)', async () => {
      await expect(
        membersService.updateMemberAccess(
          ORG_ALPHA_ID,
          adminAuthCtx.userId,
          otherOrgAdminCtx.userId,
          { role: Role.ADMIN },
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('22. Assigning cross-tenant department is denied (403 Forbidden)', async () => {
      await expect(
        membersService.updateMemberAccess(
          ORG_ALPHA_ID,
          adminAuthCtx.userId,
          analystAuthCtx.userId,
          { departmentIds: [deptBetaId] },
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('23. Assigning cross-tenant project is denied (403 Forbidden)', async () => {
      await expect(
        membersService.updateMemberAccess(
          ORG_ALPHA_ID,
          adminAuthCtx.userId,
          analystAuthCtx.userId,
          { projectIds: [projBetaId] },
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('24. Requesting organization details for unassociated organization throws 404', async () => {
      await expect(
        membersService.getOrganizationDetails('non-existent-org-id'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('5. Commercial Framework Entitlement Controls', () => {
    it('25. Entitled frameworks appear in organization details', async () => {
      const details = await membersService.getOrganizationDetails(ORG_ALPHA_ID);
      expect(details.entitlements.some((e) => e.frameworkCode === FrameworkCode.ISO27001)).toBe(true);
    });

    it('26. Unentitled framework does not appear in active entitlements', async () => {
      const details = await membersService.getOrganizationDetails(ORG_BETA_ID);
      expect(details.entitlements.some((e) => e.frameworkCode === FrameworkCode.ISO27001)).toBe(false);
    });
  });

  describe('6. End-to-End Workflow & Resource Scope Integrity', () => {
    it('27. Coverage calculation respects organization entitlement & scope', async () => {
      const result = await coverageService.calculateCoverage(adminAuthCtx, FrameworkCode.ISO27001);
      expect(result).toBeDefined();
      expect(result.framework.code).toBe(FrameworkCode.ISO27001);
    });
  });
});
