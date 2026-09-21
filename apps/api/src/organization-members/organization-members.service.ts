import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { Role, ProductAccessStatus, OrganizationMemberDto, UpdateMemberAccessDto } from '@omnigrc/shared';

@Injectable()
export class OrganizationMembersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogs: AuditLogsService,
  ) {}

  async findAll(organizationId: string): Promise<OrganizationMemberDto[]> {
    const users = await this.prisma.user.findMany({
      where: { organizationId },
      include: {
        memberships: {
          where: { organizationId },
          include: {
            departments: { include: { department: { select: { id: true, name: true } } } },
            projects: { include: { project: { select: { id: true, name: true } } } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const members: OrganizationMemberDto[] = [];
    for (const u of users) {
      let m = u.memberships[0];
      if (!m) {
        // Auto-provision membership record if absent
        m = await this.prisma.organizationMembership.create({
          data: {
            organizationId,
            userId: u.id,
            role: u.role as Role,
            status: ProductAccessStatus.ACTIVE,
          },
          include: {
            departments: { include: { department: { select: { id: true, name: true } } } },
            projects: { include: { project: { select: { id: true, name: true } } } },
          },
        });
      }

      members.push({
        id: m.id,
        userId: u.id,
        organizationId: m.organizationId,
        name: u.name,
        email: u.email,
        role: m.role as Role,
        productAccessStatus: m.status as ProductAccessStatus,
        status: m.status as ProductAccessStatus,
        user: { id: u.id, email: u.email },
        grantedAt: m.grantedAt.toISOString(),
        revokedAt: m.revokedAt ? m.revokedAt.toISOString() : null,
        revokedById: m.revokedById,
        departments: m.departments.map((d) => ({ id: d.department.id, name: d.department.name })),
        projects: m.projects.map((p) => ({ id: p.project.id, name: p.project.name })),
      });
    }

    return members;
  }

  async findOne(organizationId: string, memberIdOrUserId: string): Promise<OrganizationMemberDto> {
    const u = await this.prisma.user.findFirst({
      where: {
        organizationId,
        OR: [{ id: memberIdOrUserId }, { memberships: { some: { id: memberIdOrUserId } } }],
      },
      include: {
        memberships: {
          where: { organizationId },
          include: {
            departments: { include: { department: { select: { id: true, name: true } } } },
            projects: { include: { project: { select: { id: true, name: true } } } },
          },
        },
      },
    });

    if (!u) {
      throw new NotFoundException(`Organization member "${memberIdOrUserId}" not found.`);
    }

    let m = u.memberships[0];
    if (!m) {
      m = await this.prisma.organizationMembership.create({
        data: {
          organizationId,
          userId: u.id,
          role: u.role as Role,
          status: ProductAccessStatus.ACTIVE,
        },
        include: {
          departments: { include: { department: { select: { id: true, name: true } } } },
          projects: { include: { project: { select: { id: true, name: true } } } },
        },
      });
    }

    return {
      id: m.id,
      userId: u.id,
      organizationId: m.organizationId,
      name: u.name,
      email: u.email,
      role: m.role as Role,
      productAccessStatus: m.status as ProductAccessStatus,
      status: m.status as ProductAccessStatus,
      user: { id: u.id, email: u.email },
      grantedAt: m.grantedAt.toISOString(),
      revokedAt: m.revokedAt ? m.revokedAt.toISOString() : null,
      revokedById: m.revokedById,
      departments: m.departments.map((d) => ({ id: d.department.id, name: d.department.name })),
      projects: m.projects.map((p) => ({ id: p.project.id, name: p.project.name })),
    };
  }

  async updateMemberAccess(
    organizationId: string,
    actorUserId: string,
    targetUserId: string,
    dto: UpdateMemberAccessDto,
  ): Promise<OrganizationMemberDto> {
    // 1. Prevent Self-Privilege Escalation & Self-Restoration
    if (actorUserId === targetUserId) {
      if (dto.role) {
        throw new ForbiddenException('Privilege escalation attempt denied: Users cannot alter their own role.');
      }
      if (dto.productAccessStatus) {
        throw new ForbiddenException('Self-access restoration attempt denied: Users cannot alter their own product access status.');
      }
    }

    // 2. Fetch target membership
    let membership = await this.prisma.organizationMembership.findUnique({
      where: { organizationId_userId: { organizationId, userId: targetUserId } },
    });

    if (!membership) {
      const user = await this.prisma.user.findFirst({ where: { id: targetUserId, organizationId } });
      if (!user) {
        throw new NotFoundException(`User "${targetUserId}" not found in organization.`);
      }

      membership = await this.prisma.organizationMembership.create({
        data: {
          organizationId,
          userId: targetUserId,
          role: user.role as Role,
          status: ProductAccessStatus.ACTIVE,
        },
      });
    }

    const previousRole = membership.role;
    const previousStatus = membership.status;

    // 3. Update Role if provided
    if (dto.role && dto.role !== membership.role) {
      membership = await this.prisma.organizationMembership.update({
        where: { id: membership.id },
        data: { role: dto.role },
      });

      // Keep User table role in sync
      await this.prisma.user.update({
        where: { id: targetUserId },
        data: { role: dto.role },
      });

      await this.auditLogs.log({
        action: 'ROLE_CHANGED',
        organizationId,
        actorId: actorUserId,
        entityType: 'User',
        entityId: targetUserId,
        metadata: { previousRole, newRole: dto.role },
      });
    }

    // 4. Update Product Access Status if provided
    if (dto.productAccessStatus && dto.productAccessStatus !== membership.status) {
      const isRevoking = dto.productAccessStatus === ProductAccessStatus.REVOKED || dto.productAccessStatus === ProductAccessStatus.SUSPENDED;
      
      membership = await this.prisma.organizationMembership.update({
        where: { id: membership.id },
        data: {
          status: dto.productAccessStatus,
          revokedAt: isRevoking ? new Date() : null,
          revokedById: isRevoking ? actorUserId : null,
        },
      });

      let auditAction = 'PRODUCT_ACCESS_GRANTED';
      if (dto.productAccessStatus === ProductAccessStatus.SUSPENDED) auditAction = 'PRODUCT_ACCESS_SUSPENDED';
      if (dto.productAccessStatus === ProductAccessStatus.REVOKED) auditAction = 'PRODUCT_ACCESS_REVOKED';
      if (dto.productAccessStatus === ProductAccessStatus.ACTIVE) auditAction = 'PRODUCT_ACCESS_REACTIVATED';

      await this.auditLogs.log({
        action: auditAction,
        organizationId,
        actorId: actorUserId,
        entityType: 'User',
        entityId: targetUserId,
        metadata: { previousStatus, newStatus: dto.productAccessStatus },
      });
    }

    // 5. Update Department Assignments if provided
    if (dto.departmentIds !== undefined) {
      // Validate cross-tenant invariant
      const depts = await this.prisma.department.findMany({
        where: { id: { in: dto.departmentIds }, organizationId },
      });

      if (depts.length !== dto.departmentIds.length) {
        throw new ForbiddenException('Cross-tenant assignment denied: One or more departments do not belong to target organization.');
      }

      await this.prisma.userDepartment.deleteMany({ where: { membershipId: membership.id } });
      for (const deptId of dto.departmentIds) {
        await this.prisma.userDepartment.create({
          data: { membershipId: membership.id, departmentId: deptId },
        });
      }

      await this.auditLogs.log({
        action: 'DEPARTMENT_ASSIGNMENT_CHANGED',
        organizationId,
        actorId: actorUserId,
        entityType: 'User',
        entityId: targetUserId,
        metadata: { departmentIds: dto.departmentIds },
      });
    }

    // 6. Update Project Assignments if provided
    if (dto.projectIds !== undefined) {
      // Validate cross-tenant invariant
      const projs = await this.prisma.project.findMany({
        where: { id: { in: dto.projectIds }, organizationId },
      });

      if (projs.length !== dto.projectIds.length) {
        throw new ForbiddenException('Cross-tenant assignment denied: One or more projects do not belong to target organization.');
      }

      await this.prisma.userProject.deleteMany({ where: { membershipId: membership.id } });
      for (const projId of dto.projectIds) {
        await this.prisma.userProject.create({
          data: { membershipId: membership.id, projectId: projId },
        });
      }

      await this.auditLogs.log({
        action: 'PROJECT_ASSIGNMENT_CHANGED',
        organizationId,
        actorId: actorUserId,
        entityType: 'User',
        entityId: targetUserId,
        metadata: { projectIds: dto.projectIds },
      });
    }

    return this.findOne(organizationId, targetUserId);
  }
}
