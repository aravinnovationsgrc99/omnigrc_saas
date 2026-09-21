import {
  Injectable,
  ForbiddenException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Role, ProductAccessStatus, ResourceScopeType } from '@omnigrc/shared';

export interface ResourceAuthContext {
  userId: string;
  organizationId: string;
  role: Role | string;
}

export interface ResourceAuthOptions {
  action: 'READ' | 'WRITE' | 'ADMIN';
  scopeType?: ResourceScopeType | 'ORGANIZATION' | 'DEPARTMENT' | 'PROJECT';
  departmentId?: string;
  projectId?: string;
  isSettingsMutation?: boolean;
}

@Injectable()
export class ResourceAuthorizationService {
  private readonly logger = new Logger(ResourceAuthorizationService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Evaluate member access state, role permissions, and resource scopes server-side.
   */
  async authorize(ctx: ResourceAuthContext, opts: ResourceAuthOptions): Promise<void> {
    if (!ctx.userId || !ctx.organizationId) {
      throw new ForbiddenException({
        statusCode: 403,
        error: 'Forbidden',
        message: 'Unauthenticated or invalid organization tenant context.',
        code: 'TENANT_CONTEXT_MISSING',
      });
    }

    // 1. Fetch or auto-provision active OrganizationMembership for authenticated user
    let membership = await this.prisma.organizationMembership.findUnique({
      where: {
        organizationId_userId: {
          organizationId: ctx.organizationId,
          userId: ctx.userId,
        },
      },
      include: {
        departments: { select: { departmentId: true } },
        projects: { select: { projectId: true } },
      },
    });

    if (!membership) {
      // Lazy migration fallback: If user exists in User table, auto-create membership
      const user = await this.prisma.user.findUnique({ where: { id: ctx.userId } });
      if (!user) {
        throw new ForbiddenException({
          statusCode: 403,
          error: 'Forbidden',
          message: 'User does not belong to target organization tenant.',
          code: 'INVALID_MEMBERSHIP',
        });
      }

      membership = await this.prisma.organizationMembership.create({
        data: {
          organizationId: ctx.organizationId,
          userId: ctx.userId,
          role: (user.role as Role) || Role.ANALYST,
          status: ProductAccessStatus.ACTIVE,
        },
        include: {
          departments: { select: { departmentId: true } },
          projects: { select: { projectId: true } },
        },
      });
    }

    // 2. Validate Product Access Status (ACTIVE required)
    if (membership.status !== ProductAccessStatus.ACTIVE) {
      this.logger.warn(
        `SECURITY: Access attempt denied for user "${ctx.userId}" in org "${ctx.organizationId}" with status "${membership.status}".`,
      );
      throw new ForbiddenException({
        statusCode: 403,
        error: 'Forbidden',
        message: 'Product access for this organization has been suspended or revoked by an Organization Administrator.',
        code: 'PRODUCT_ACCESS_REVOKED',
        productAccessStatus: membership.status,
      });
    }

    const effectiveRole = membership.role || (ctx.role as Role);

    // 3. Role-Based Action Matrix Evaluation
    // EXTERNAL_AUDITOR: Read-only access to GRC data. Strict block on ALL write actions, member admin, settings, entitlements.
    if (effectiveRole === Role.EXTERNAL_AUDITOR) {
      if (opts.action === 'WRITE' || opts.action === 'ADMIN' || opts.isSettingsMutation) {
        throw new ForbiddenException({
          statusCode: 403,
          error: 'Forbidden',
          message: 'External Auditor role is restricted to read-only audit access. Mutation actions are denied.',
          code: 'EXTERNAL_AUDITOR_READ_ONLY',
        });
      }
    }

    // ANALYST / MSSP_ANALYST: Operational GRC access. Blocked on organization settings mutations and admin actions.
    if (effectiveRole === Role.ANALYST || effectiveRole === Role.MSSP_ANALYST) {
      if (opts.isSettingsMutation || opts.action === 'ADMIN') {
        throw new ForbiddenException({
          statusCode: 403,
          error: 'Forbidden',
          message: 'Analyst role is not authorized to mutate organization settings or perform administrative actions.',
          code: 'ADMIN_ROLE_REQUIRED',
        });
      }
    }

    // 4. Department Scope Validation
    if (opts.departmentId) {
      const dept = await this.prisma.department.findUnique({
        where: { id: opts.departmentId },
      });

      if (!dept || dept.organizationId !== ctx.organizationId) {
        throw new NotFoundException(`Department "${opts.departmentId}" not found in effective organization.`);
      }

      // If user is ANALYST or EXTERNAL_AUDITOR, check department assignment (ADMIN bypasses department filter)
      if (effectiveRole !== Role.ADMIN && effectiveRole !== Role.MSSP_ADMIN) {
        const assignedDeptIds = membership.departments.map((d) => d.departmentId);
        if (assignedDeptIds.length > 0 && !assignedDeptIds.includes(opts.departmentId)) {
          throw new ForbiddenException({
            statusCode: 403,
            error: 'Forbidden',
            message: 'User is not assigned to target department scope.',
            code: 'DEPARTMENT_OUT_OF_SCOPE',
          });
        }
      }
    }

    // 5. Project Scope Validation
    if (opts.projectId) {
      const proj = await this.prisma.project.findUnique({
        where: { id: opts.projectId },
      });

      if (!proj || proj.organizationId !== ctx.organizationId) {
        throw new NotFoundException(`Project "${opts.projectId}" not found in effective organization.`);
      }

      // If user is ANALYST or EXTERNAL_AUDITOR, check project assignment (ADMIN bypasses project filter)
      if (effectiveRole !== Role.ADMIN && effectiveRole !== Role.MSSP_ADMIN) {
        const assignedProjIds = membership.projects.map((p) => p.projectId);
        if (assignedProjIds.length > 0 && !assignedProjIds.includes(opts.projectId)) {
          throw new ForbiddenException({
            statusCode: 403,
            error: 'Forbidden',
            message: 'User is not assigned to target project scope.',
            code: 'PROJECT_OUT_OF_SCOPE',
          });
        }
      }
    }
  }

  /**
   * Validate that cross-tenant resource assignments (User -> Department, User -> Project, Project -> Dept) belong to the same Organization.
   */
  async validateHierarchyInvariants(organizationId: string, departmentId?: string, projectId?: string): Promise<void> {
    if (departmentId) {
      const dept = await this.prisma.department.findUnique({ where: { id: departmentId } });
      if (!dept || dept.organizationId !== organizationId) {
        throw new ForbiddenException({
          statusCode: 403,
          error: 'Forbidden',
          message: 'Cross-tenant invariant violation: Department belongs to a different organization.',
          code: 'CROSS_TENANT_DEPARTMENT_ASSIGNMENT_DENIED',
        });
      }
    }

    if (projectId) {
      const proj = await this.prisma.project.findUnique({ where: { id: projectId } });
      if (!proj || proj.organizationId !== organizationId) {
        throw new ForbiddenException({
          statusCode: 403,
          error: 'Forbidden',
          message: 'Cross-tenant invariant violation: Project belongs to a different organization.',
          code: 'CROSS_TENANT_PROJECT_ASSIGNMENT_DENIED',
        });
      }

      if (departmentId && proj.departmentId !== departmentId) {
        throw new ForbiddenException({
          statusCode: 403,
          error: 'Forbidden',
          message: 'Hierarchy invariant violation: Project does not belong to specified Department.',
          code: 'HIERARCHY_PROJECT_DEPARTMENT_MISMATCH',
        });
      }
    }
  }
}
