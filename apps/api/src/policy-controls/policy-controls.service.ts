import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ResourceAuthorizationService, ResourceAuthContext } from '../auth/resource-authorization.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import {
  MappingStatus,
  PolicyControlAssociationDto,
  ControlPolicyAssociationDto,
  PaginatedPolicyControlAssociationsDto,
  PaginatedControlPolicyAssociationsDto,
} from '@omnigrc/shared';
import {
  AssociatePolicyControlDto,
  UpdatePolicyControlDto,
  PolicyControlQueryDto,
} from './dto/policy-controls.dto';

@Injectable()
export class PolicyControlsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly resourceAuthService: ResourceAuthorizationService,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  async getControlsForPolicy(
    authCtx: ResourceAuthContext,
    policyId: string,
    query?: PolicyControlQueryDto,
  ): Promise<PaginatedPolicyControlAssociationsDto> {
    const scopeWhere = await this.resourceAuthService.getScopeWhereClause(authCtx);

    // 1. Verify policy exists within caller's authorized tenant context
    const policy = await this.prisma.policy.findFirst({
      where: {
        id: policyId,
        ...scopeWhere,
        deletedAt: null,
      },
    });

    if (!policy) {
      throw new NotFoundException(`Policy with ID "${policyId}" not found`);
    }

    const page = query?.page || 1;
    const limit = query?.limit || 50;
    const skip = (page - 1) * limit;

    const whereClause: any = {
      policyId,
      organizationId: authCtx.organizationId,
      control: {
        deletedAt: null,
      },
    };

    if (query?.status) {
      whereClause.status = query.status;
    }

    if (query?.search && query.search.trim()) {
      const searchTerm = query.search.trim();
      whereClause.OR = [
        { control: { name: { contains: searchTerm, mode: 'insensitive' } } },
        { control: { description: { contains: searchTerm, mode: 'insensitive' } } },
        { control: { category: { contains: searchTerm, mode: 'insensitive' } } },
        { rationale: { contains: searchTerm, mode: 'insensitive' } },
      ];
    }

    // 2. Fetch associations including control details and mapped frameworks
    const [associations, total] = await Promise.all([
      this.prisma.policyControl.findMany({
        where: whereClause,
        include: {
          control: {
            include: {
              mappings: {
                include: {
                  frameworkReference: {
                    include: {
                      frameworkVersion: {
                        include: {
                          framework: true,
                        },
                      },
                    },
                  },
                  frameworkClause: true,
                },
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.policyControl.count({
        where: whereClause,
      }),
    ]);

    const items: PolicyControlAssociationDto[] = associations.map((assoc) => {
      const frameworkMappings = assoc.control.mappings.map((m) => ({
        frameworkName: m.frameworkReference?.frameworkVersion?.framework?.name || 'Framework',
        frameworkCode: m.frameworkReference?.frameworkVersion?.framework?.code || '',
        clauseCode: m.frameworkReference?.identifier || m.frameworkClause?.code || undefined,
        clauseTitle: m.frameworkReference?.title || m.frameworkClause?.title || undefined,
      }));

      return {
        id: assoc.id,
        controlId: assoc.controlId,
        controlName: assoc.control.name,
        controlDescription: assoc.control.description,
        controlCategory: assoc.control.category,
        status: assoc.status as MappingStatus,
        rationale: assoc.rationale,
        frameworkMappings,
        createdAt: assoc.createdAt,
      };
    });

    return {
      items,
      total,
      page,
      limit,
    };
  }

  async getPoliciesForControl(
    authCtx: ResourceAuthContext,
    controlId: string,
    query?: PolicyControlQueryDto,
  ): Promise<PaginatedControlPolicyAssociationsDto> {
    const scopeWhere = await this.resourceAuthService.getScopeWhereClause(authCtx);

    // 1. Verify control exists within caller's authorized tenant context
    const control = await this.prisma.control.findFirst({
      where: {
        id: controlId,
        ...scopeWhere,
        deletedAt: null,
      },
    });

    if (!control) {
      throw new NotFoundException(`Control with ID "${controlId}" not found`);
    }

    const page = query?.page || 1;
    const limit = query?.limit || 50;
    const skip = (page - 1) * limit;

    const whereClause: any = {
      controlId,
      organizationId: authCtx.organizationId,
      policy: {
        deletedAt: null,
      },
    };

    if (query?.status) {
      whereClause.status = query.status;
    }

    if (query?.search && query.search.trim()) {
      const searchTerm = query.search.trim();
      whereClause.OR = [
        { policy: { title: { contains: searchTerm, mode: 'insensitive' } } },
        { policy: { code: { contains: searchTerm, mode: 'insensitive' } } },
        { policy: { category: { contains: searchTerm, mode: 'insensitive' } } },
        { rationale: { contains: searchTerm, mode: 'insensitive' } },
      ];
    }

    const [associations, total] = await Promise.all([
      this.prisma.policyControl.findMany({
        where: whereClause,
        include: {
          policy: {
            include: {
              publishedVersion: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.policyControl.count({
        where: whereClause,
      }),
    ]);

    const items: ControlPolicyAssociationDto[] = associations.map((assoc) => ({
      id: assoc.id,
      policyId: assoc.policyId,
      policyCode: assoc.policy.code,
      policyTitle: assoc.policy.title,
      policyCategory: assoc.policy.category,
      policyStatus: assoc.policy.status as any,
      policyOwnerId: assoc.policy.ownerId,
      publishedVersionNumber: assoc.policy.publishedVersion?.versionNumber || null,
      status: assoc.status as MappingStatus,
      rationale: assoc.rationale,
      createdAt: assoc.createdAt,
    }));

    return {
      items,
      total,
      page,
      limit,
    };
  }

  async associate(
    authCtx: ResourceAuthContext,
    policyId: string,
    controlId: string,
    dto: AssociatePolicyControlDto,
  ): Promise<PolicyControlAssociationDto> {
    if (!policyId || !controlId) {
      throw new BadRequestException('Both policyId and controlId are required to create a mapping');
    }

    // 1. Authorize write action
    await this.resourceAuthService.authorize(authCtx, {
      action: 'WRITE',
    });

    const scopeWhere = await this.resourceAuthService.getScopeWhereClause(authCtx);

    // 2. Validate both Policy and Control exist, belong to authenticated organization, and are not soft-deleted
    const [policy, control] = await Promise.all([
      this.prisma.policy.findFirst({
        where: {
          id: policyId,
          ...scopeWhere,
          deletedAt: null,
        },
      }),
      this.prisma.control.findFirst({
        where: {
          id: controlId,
          ...scopeWhere,
          deletedAt: null,
        },
      }),
    ]);

    if (!policy) {
      throw new NotFoundException(`Policy with ID "${policyId}" not found`);
    }

    if (!control) {
      throw new NotFoundException(`Control with ID "${controlId}" not found`);
    }

    // 3. Upsert mapping record ensuring tenant consistency and idempotency
    const status = dto.status || MappingStatus.APPROVED;
    const rationale = dto.rationale !== undefined ? dto.rationale.trim() || null : null;

    const association = await this.prisma.$transaction(async (tx) => {
      const assoc = await tx.policyControl.upsert({
        where: {
          policyId_controlId: {
            policyId,
            controlId,
          },
        },
        create: {
          organizationId: authCtx.organizationId,
          policyId,
          controlId,
          status: status as any,
          rationale,
          createdById: authCtx.userId,
        },
        update: {
          status: status as any,
          ...(dto.rationale !== undefined ? { rationale } : {}),
        },
        include: {
          control: {
            include: {
              mappings: {
                include: {
                  frameworkReference: {
                    include: {
                      frameworkVersion: {
                        include: {
                          framework: true,
                        },
                      },
                    },
                  },
                  frameworkClause: true,
                },
              },
            },
          },
        },
      });

      await this.auditLogsService.log(
        {
          action: 'POLICY_CONTROL_MAPPED',
          actorId: authCtx.userId,
          organizationId: authCtx.organizationId,
          entityType: 'PolicyControl',
          entityId: assoc.id,
          metadata: {
            policyId,
            policyCode: policy.code,
            controlId,
            controlName: control.name,
            status,
            rationale,
          },
        },
        tx,
      );

      return assoc;
    });

    const frameworkMappings = association.control.mappings.map((m) => ({
      frameworkName: m.frameworkReference?.frameworkVersion?.framework?.name || 'Framework',
      frameworkCode: m.frameworkReference?.frameworkVersion?.framework?.code || '',
      clauseCode: m.frameworkReference?.identifier || m.frameworkClause?.code || undefined,
      clauseTitle: m.frameworkReference?.title || m.frameworkClause?.title || undefined,
    }));

    return {
      id: association.id,
      controlId: association.controlId,
      controlName: association.control.name,
      controlDescription: association.control.description,
      controlCategory: association.control.category,
      status: association.status as MappingStatus,
      rationale: association.rationale,
      frameworkMappings,
      createdAt: association.createdAt,
    };
  }

  async updateMapping(
    authCtx: ResourceAuthContext,
    policyId: string,
    controlId: string,
    dto: UpdatePolicyControlDto,
  ): Promise<PolicyControlAssociationDto> {
    await this.resourceAuthService.authorize(authCtx, {
      action: 'WRITE',
    });

    const existing = await this.prisma.policyControl.findFirst({
      where: {
        policyId,
        controlId,
        organizationId: authCtx.organizationId,
      },
    });

    if (!existing) {
      throw new NotFoundException(`Mapping between Policy "${policyId}" and Control "${controlId}" not found`);
    }

    if (dto.expectedUpdatedAt) {
      const expected = new Date(dto.expectedUpdatedAt).getTime();
      const current = new Date(existing.updatedAt).getTime();
      if (Math.abs(current - expected) > 1000) {
        throw new ConflictException(
          'Mapping was updated concurrently by another user. Please reload the latest changes.',
        );
      }
    }

    const rationale = dto.rationale !== undefined ? dto.rationale.trim() || null : undefined;

    const updated = await this.prisma.$transaction(async (tx) => {
      const res = await tx.policyControl.update({
        where: {
          id: existing.id,
        },
        data: {
          ...(dto.status !== undefined ? { status: dto.status as any } : {}),
          ...(rationale !== undefined ? { rationale } : {}),
        },
        include: {
          control: {
            include: {
              mappings: {
                include: {
                  frameworkReference: {
                    include: {
                      frameworkVersion: {
                        include: {
                          framework: true,
                        },
                      },
                    },
                  },
                  frameworkClause: true,
                },
              },
            },
          },
        },
      });

      await this.auditLogsService.log(
        {
          action: 'POLICY_CONTROL_UPDATED',
          actorId: authCtx.userId,
          organizationId: authCtx.organizationId,
          entityType: 'PolicyControl',
          entityId: res.id,
          metadata: {
            policyId,
            controlId,
            status: res.status,
            rationale: res.rationale,
          },
        },
        tx,
      );

      return res;
    });

    const frameworkMappings = updated.control.mappings.map((m) => ({
      frameworkName: m.frameworkReference?.frameworkVersion?.framework?.name || 'Framework',
      frameworkCode: m.frameworkReference?.frameworkVersion?.framework?.code || '',
      clauseCode: m.frameworkReference?.identifier || m.frameworkClause?.code || undefined,
      clauseTitle: m.frameworkReference?.title || m.frameworkClause?.title || undefined,
    }));

    return {
      id: updated.id,
      controlId: updated.controlId,
      controlName: updated.control.name,
      controlDescription: updated.control.description,
      controlCategory: updated.control.category,
      status: updated.status as MappingStatus,
      rationale: updated.rationale,
      frameworkMappings,
      createdAt: updated.createdAt,
    };
  }

  async disassociate(
    authCtx: ResourceAuthContext,
    policyId: string,
    controlId: string,
  ): Promise<{ success: boolean; unmappedId: string }> {
    await this.resourceAuthService.authorize(authCtx, {
      action: 'WRITE',
    });

    const existing = await this.prisma.policyControl.findFirst({
      where: {
        policyId,
        controlId,
        organizationId: authCtx.organizationId,
      },
      include: {
        policy: true,
        control: true,
      },
    });

    if (!existing) {
      throw new NotFoundException(`Mapping between Policy "${policyId}" and Control "${controlId}" not found`);
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.policyControl.delete({
        where: {
          id: existing.id,
        },
      });

      await this.auditLogsService.log(
        {
          action: 'POLICY_CONTROL_UNMAPPED',
          actorId: authCtx.userId,
          organizationId: authCtx.organizationId,
          entityType: 'PolicyControl',
          entityId: existing.id,
          metadata: {
            policyId,
            policyCode: existing.policy.code,
            controlId,
            controlName: existing.control.name,
          },
        },
        tx,
      );
    });

    return {
      success: true,
      unmappedId: existing.id,
    };
  }
}
