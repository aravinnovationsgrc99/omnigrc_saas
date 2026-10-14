import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ResourceAuthorizationService, ResourceAuthContext } from '../auth/resource-authorization.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import {
  RiskControlMitigationType,
  RiskControlAssociationDto,
  ControlRiskAssociationDto,
  PaginatedRiskControlAssociationsDto,
  PaginatedControlRiskAssociationsDto,
  RiskScoreBand,
} from '@omnigrc/shared';
import { AssociateRiskControlDto, RiskControlQueryDto } from './dto/risk-controls.dto';

@Injectable()
export class RiskControlsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly resourceAuthService: ResourceAuthorizationService,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  async getControlsForRisk(
    authCtx: ResourceAuthContext,
    riskId: string,
    query?: RiskControlQueryDto,
  ): Promise<PaginatedRiskControlAssociationsDto> {
    const scopeWhere = await this.resourceAuthService.getScopeWhereClause(authCtx);

    // 1. Verify risk exists within caller's authorized tenant context
    const risk = await this.prisma.risk.findFirst({
      where: {
        id: riskId,
        ...scopeWhere,
        deletedAt: null,
      },
    });

    if (!risk) {
      throw new NotFoundException(`Risk with ID "${riskId}" not found`);
    }

    const page = query?.page || 1;
    const limit = query?.limit || 50;
    const skip = (page - 1) * limit;

    // 2. Fetch associations where both association and control belong to the tenant and control is not deleted
    const [associations, total] = await Promise.all([
      this.prisma.riskControl.findMany({
        where: {
          riskId,
          organizationId: authCtx.organizationId,
          control: {
            deletedAt: null,
          },
        },
        include: {
          control: true,
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.riskControl.count({
        where: {
          riskId,
          organizationId: authCtx.organizationId,
          control: {
            deletedAt: null,
          },
        },
      }),
    ]);

    const items: RiskControlAssociationDto[] = associations.map((assoc) => ({
      id: assoc.id,
      controlId: assoc.controlId,
      controlName: assoc.control.name,
      controlDescription: assoc.control.description,
      controlCategory: assoc.control.category,
      mitigationType: assoc.mitigationType as unknown as RiskControlMitigationType,
      notes: assoc.notes,
      createdAt: assoc.createdAt,
    }));

    return {
      items,
      total,
      page,
      limit,
    };
  }

  async getRisksForControl(
    authCtx: ResourceAuthContext,
    controlId: string,
    query?: RiskControlQueryDto,
  ): Promise<PaginatedControlRiskAssociationsDto> {
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

    // 2. Fetch associations where both association and risk belong to the tenant and risk is not deleted
    const [associations, total] = await Promise.all([
      this.prisma.riskControl.findMany({
        where: {
          controlId,
          organizationId: authCtx.organizationId,
          risk: {
            deletedAt: null,
          },
        },
        include: {
          risk: true,
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.riskControl.count({
        where: {
          controlId,
          organizationId: authCtx.organizationId,
          risk: {
            deletedAt: null,
          },
        },
      }),
    ]);

    const items: ControlRiskAssociationDto[] = associations.map((assoc) => {
      const score = assoc.risk.score;
      const scoreBand = score >= 15 ? RiskScoreBand.HIGH : score >= 8 ? RiskScoreBand.MEDIUM : RiskScoreBand.LOW;
      return {
        id: assoc.id,
        riskId: assoc.riskId,
        riskTitle: assoc.risk.title,
        riskScore: score,
        riskScoreBand: scoreBand,
        riskStatus: assoc.risk.status as unknown as any,
        riskOwner: assoc.risk.owner,
        mitigationType: assoc.mitigationType as unknown as RiskControlMitigationType,
        notes: assoc.notes,
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

  async associate(
    authCtx: ResourceAuthContext,
    riskId: string,
    controlId: string,
    dto: AssociateRiskControlDto,
  ): Promise<RiskControlAssociationDto> {
    if (!riskId || !controlId) {
      throw new BadRequestException('Both riskId and controlId are required to create an association');
    }

    // 1. Record-level write authorization
    await this.resourceAuthService.authorize(authCtx, {
      action: 'WRITE',
    });

    const scopeWhere = await this.resourceAuthService.getScopeWhereClause(authCtx);

    // 2. Authoritative record validation: both Risk and Control MUST exist, belong to authenticated organization, and not be soft-deleted
    const [risk, control] = await Promise.all([
      this.prisma.risk.findFirst({
        where: {
          id: riskId,
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

    if (!risk) {
      throw new NotFoundException(`Risk with ID "${riskId}" not found`);
    }

    if (!control) {
      throw new NotFoundException(`Control with ID "${controlId}" not found`);
    }

    // 3. Upsert association with guaranteed tenant consistency
    const createMitigationType = dto.mitigationType || RiskControlMitigationType.PREVENTATIVE;
    const notes = dto.notes !== undefined ? dto.notes.trim() || null : undefined;

    const association = await this.prisma.riskControl.upsert({
      where: {
        riskId_controlId: {
          riskId,
          controlId,
        },
      },
      create: {
        organizationId: authCtx.organizationId,
        riskId,
        controlId,
        mitigationType: createMitigationType as any,
        notes: notes || null,
      },
      update: {
        ...(dto.mitigationType !== undefined ? { mitigationType: dto.mitigationType as any } : {}),
        notes,
      },
      include: {
        control: true,
      },
    });

    // 4. Audit logging
    await this.auditLogsService.log({
      action: 'RISK_CONTROL_ASSOCIATED',
      actorId: authCtx.userId,
      organizationId: authCtx.organizationId,
      entityType: 'RiskControl',
      entityId: association.id,
      metadata: {
        riskId,
        controlId,
        mitigationType: association.mitigationType,
      },
    });

    return {
      id: association.id,
      controlId: association.controlId,
      controlName: association.control.name,
      controlDescription: association.control.description,
      controlCategory: association.control.category,
      mitigationType: association.mitigationType as unknown as RiskControlMitigationType,
      notes: association.notes,
      createdAt: association.createdAt,
    };
  }

  async disassociate(
    authCtx: ResourceAuthContext,
    riskId: string,
    controlId: string,
  ): Promise<{ success: boolean; message: string }> {
    if (!riskId || !controlId) {
      throw new BadRequestException('Both riskId and controlId are required to remove an association');
    }

    // 1. Record-level write authorization
    await this.resourceAuthService.authorize(authCtx, {
      action: 'WRITE',
    });

    // 2. Locate association scoped strictly to authenticated tenant
    const association = await this.prisma.riskControl.findFirst({
      where: {
        riskId,
        controlId,
        organizationId: authCtx.organizationId,
      },
    });

    if (!association) {
      throw new NotFoundException('Risk-Control association not found');
    }

    // 3. Remove only the join table record (Risk and Control remain intact)
    await this.prisma.riskControl.delete({
      where: {
        id: association.id,
      },
    });

    // 4. Audit logging
    await this.auditLogsService.log({
      action: 'RISK_CONTROL_DISASSOCIATED',
      actorId: authCtx.userId,
      organizationId: authCtx.organizationId,
      entityType: 'RiskControl',
      entityId: association.id,
      metadata: {
        riskId,
        controlId,
      },
    });

    return {
      success: true,
      message: 'Risk-Control association removed successfully',
    };
  }
}
