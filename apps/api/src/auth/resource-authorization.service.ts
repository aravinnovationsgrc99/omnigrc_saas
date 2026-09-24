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

export interface EffectiveScopeContext {
  userId: string;
  organizationId: string;
  role: Role | string;
  membershipId: string;
  isOrganizationWideAccess: boolean;
  assignedDepartmentIds: string[];
  assignedProjectIds: string[];
}

@Injectable()
export class ResourceAuthorizationService {
  private readonly logger = new Logger(ResourceAuthorizationService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Fetch effective membership, role, assigned department IDs, and assigned project IDs.
   */
  async getEffectiveScopeContext(ctx: ResourceAuthContext): Promise<EffectiveScopeContext> {
    if (!ctx.userId || !ctx.organizationId) {
      throw new ForbiddenException({
        statusCode: 403,
        error: 'Forbidden',
        message: 'Unauthenticated or invalid organization tenant context.',
        code: 'TENANT_CONTEXT_MISSING',
      });
    }

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
    const assignedDepartmentIds = membership.departments.map((d) => d.departmentId);
    const assignedProjectIds = membership.projects.map((p) => p.projectId);

    // ADMIN and MSSP_ADMIN have organization-wide visibility.
    // ANALYST / EXTERNAL_AUDITOR with 0 explicit department/project assignments fall back to organization-wide access.
    const isOrganizationWideAccess =
      effectiveRole === Role.ADMIN ||
      effectiveRole === Role.MSSP_ADMIN ||
      (assignedDepartmentIds.length === 0 && assignedProjectIds.length === 0);

    return {
      userId: ctx.userId,
      organizationId: ctx.organizationId,
      role: effectiveRole,
      membershipId: membership.id,
      isOrganizationWideAccess,
      assignedDepartmentIds,
      assignedProjectIds,
    };
  }

  /**
   * Generate canonical Prisma WHERE clause for query-level database filtering based on user's authorized scope.
   */
  async getScopeWhereClause(ctx: ResourceAuthContext): Promise<any> {
    const scope = await this.getEffectiveScopeContext(ctx);

    if (scope.isOrganizationWideAccess) {
      return { organizationId: ctx.organizationId };
    }

    const OR: any[] = [{ departmentId: null, projectId: null }];

    if (scope.assignedProjectIds.length > 0) {
      OR.push({ projectId: { in: scope.assignedProjectIds } });
    }

    if (scope.assignedDepartmentIds.length > 0) {
      OR.push({
        departmentId: { in: scope.assignedDepartmentIds },
        projectId: null,
      });
    }

    return {
      organizationId: ctx.organizationId,
      OR,
    };
  }

  /**
   * Assert server-side authorization on an existing target resource record.
   */
  async assertResourceAccess(
    ctx: ResourceAuthContext,
    resource: { organizationId: string; departmentId?: string | null; projectId?: string | null },
  ): Promise<void> {
    if (resource.organizationId !== ctx.organizationId) {
      throw new ForbiddenException({
        statusCode: 403,
        error: 'Forbidden',
        message: 'Cross-tenant resource access violation.',
        code: 'TENANT_MISMATCH',
      });
    }

    const scope = await this.getEffectiveScopeContext(ctx);
    if (scope.isOrganizationWideAccess) {
      return;
    }

    if (resource.projectId) {
      if (!scope.assignedProjectIds.includes(resource.projectId)) {
        throw new NotFoundException(`Resource not found or out of scope.`);
      }
      return;
    }

    if (resource.departmentId) {
      if (!scope.assignedDepartmentIds.includes(resource.departmentId)) {
        throw new NotFoundException(`Resource not found or out of scope.`);
      }
      return;
    }
  }

  /**
   * Evaluate member access state, role permissions, and resource scopes server-side.
   */
  async authorize(ctx: ResourceAuthContext, opts: ResourceAuthOptions): Promise<void> {
    const scope = await this.getEffectiveScopeContext(ctx);

    // EXTERNAL_AUDITOR: Read-only access to GRC data. Strict block on ALL write actions, member admin, settings, entitlements.
    if (scope.role === Role.EXTERNAL_AUDITOR) {
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
    if (scope.role === Role.ANALYST || scope.role === Role.MSSP_ANALYST) {
      if (opts.isSettingsMutation || opts.action === 'ADMIN') {
        throw new ForbiddenException({
          statusCode: 403,
          error: 'Forbidden',
          message: 'Analyst role is not authorized to mutate organization settings or perform administrative actions.',
          code: 'ADMIN_ROLE_REQUIRED',
        });
      }
    }

    // Department Scope Validation if specified in options
    if (opts.departmentId) {
      const dept = await this.prisma.department.findUnique({
        where: { id: opts.departmentId },
      });

      if (!dept || dept.organizationId !== ctx.organizationId) {
        throw new NotFoundException(`Department "${opts.departmentId}" not found in effective organization.`);
      }

      if (!scope.isOrganizationWideAccess && !scope.assignedDepartmentIds.includes(opts.departmentId)) {
        throw new ForbiddenException({
          statusCode: 403,
          error: 'Forbidden',
          message: 'User is not assigned to target department scope.',
          code: 'DEPARTMENT_OUT_OF_SCOPE',
        });
      }
    }

    // Project Scope Validation if specified in options
    if (opts.projectId) {
      const proj = await this.prisma.project.findUnique({
        where: { id: opts.projectId },
      });

      if (!proj || proj.organizationId !== ctx.organizationId) {
        throw new NotFoundException(`Project "${opts.projectId}" not found in effective organization.`);
      }

      if (!scope.isOrganizationWideAccess && !scope.assignedProjectIds.includes(opts.projectId)) {
        throw new ForbiddenException({
          statusCode: 403,
          error: 'Forbidden',
          message: 'User is not assigned to target project scope.',
          code: 'PROJECT_OUT_OF_SCOPE',
        });
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
