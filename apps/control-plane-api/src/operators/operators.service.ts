import {
  Injectable,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { ControlPlanePrismaService } from '../prisma/prisma.service';
import { OperatorSecurityService } from '../auth/operator-security.service';
import { ControlPlaneAuditLogsService } from '../audit/audit-logs.service';
import { OperatorAuthService } from '../auth/operator-auth.service';
import { CreateOperatorDto, UpdateOperatorRoleDto } from './dto/operator.dto';
import { OperatorRole } from '@prisma/control-plane-client';

@Injectable()
export class OperatorsService {
  constructor(
    private readonly prisma: ControlPlanePrismaService,
    private readonly securityService: OperatorSecurityService,
    private readonly auditLogsService: ControlPlaneAuditLogsService,
    private readonly operatorAuthService: OperatorAuthService,
  ) {}

  async findAll() {
    return this.prisma.operator.findMany({
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        status: true,
        mfaEnabled: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const operator = await this.prisma.operator.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        status: true,
        mfaEnabled: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!operator) {
      throw new NotFoundException(`Operator [${id}] not found`);
    }

    return operator;
  }

  async createOperator(dto: CreateOperatorDto, actor: { id: string; role: OperatorRole }, ipAddress?: string) {
    const sanitizedEmail = dto.email.trim().toLowerCase();

    // Prevent non-super-admin from creating PLATFORM_SUPER_ADMIN
    if (dto.role === OperatorRole.PLATFORM_SUPER_ADMIN && actor.role !== OperatorRole.PLATFORM_SUPER_ADMIN) {
      throw new ForbiddenException('Only a Platform Super Admin can assign the PLATFORM_SUPER_ADMIN role');
    }

    const existing = await this.prisma.operator.findUnique({ where: { email: sanitizedEmail } });
    if (existing) {
      throw new BadRequestException('Operator with this email already exists');
    }

    const passwordHash = await this.securityService.hashPassword(dto.password);
    const operator = await this.prisma.operator.create({
      data: {
        email: sanitizedEmail,
        passwordHash,
        fullName: dto.fullName,
        role: dto.role,
        status: 'ACTIVE',
      },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        status: true,
        mfaEnabled: true,
        createdAt: true,
      },
    });

    await this.auditLogsService.log({
      action: 'OPERATOR_CREATED',
      entityType: 'OPERATOR',
      entityId: operator.id,
      actorId: actor.id,
      actorRole: actor.role,
      ipAddress,
      result: 'SUCCESS',
      metadata: { createdEmail: operator.email, assignedRole: operator.role },
    });

    return operator;
  }

  async updateRole(
    targetOperatorId: string,
    dto: UpdateOperatorRoleDto,
    actor: { id: string; role: OperatorRole },
    ipAddress?: string,
  ) {
    // ANTI-SELF-ESCALATION: Operator cannot change their own role!
    if (targetOperatorId === actor.id) {
      throw new ForbiddenException('Anti-self-escalation policy violation: An operator cannot modify their own role');
    }

    const targetOperator = await this.findOne(targetOperatorId);

    // Prevent non-super-admin from assigning or modifying PLATFORM_SUPER_ADMIN
    if (
      (dto.role === OperatorRole.PLATFORM_SUPER_ADMIN || targetOperator.role === OperatorRole.PLATFORM_SUPER_ADMIN) &&
      actor.role !== OperatorRole.PLATFORM_SUPER_ADMIN
    ) {
      throw new ForbiddenException('Only a Platform Super Admin can assign or modify a Platform Super Admin account');
    }

    const updated = await this.prisma.operator.update({
      where: { id: targetOperatorId },
      data: { role: dto.role },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        status: true,
        updatedAt: true,
      },
    });

    await this.auditLogsService.log({
      action: 'OPERATOR_ROLE_UPDATED',
      entityType: 'OPERATOR',
      entityId: targetOperatorId,
      actorId: actor.id,
      actorRole: actor.role,
      ipAddress,
      result: 'SUCCESS',
      metadata: { previousRole: targetOperator.role, newRole: dto.role },
    });

    return updated;
  }

  async suspendOperator(targetOperatorId: string, actor: { id: string; role: OperatorRole }, ipAddress?: string) {
    if (targetOperatorId === actor.id) {
      throw new ForbiddenException('An operator cannot suspend their own account');
    }

    const target = await this.findOne(targetOperatorId);
    if (target.role === OperatorRole.PLATFORM_SUPER_ADMIN && actor.role !== OperatorRole.PLATFORM_SUPER_ADMIN) {
      throw new ForbiddenException('Only a Platform Super Admin can suspend another Platform Super Admin');
    }

    const updated = await this.prisma.operator.update({
      where: { id: targetOperatorId },
      data: { status: 'SUSPENDED' },
      select: {
        id: true,
        email: true,
        status: true,
        updatedAt: true,
      },
    });

    // Revoke all active sessions immediately!
    await this.operatorAuthService.revokeAllOperatorSessions(targetOperatorId, actor.id, ipAddress);

    await this.auditLogsService.log({
      action: 'OPERATOR_SUSPENDED',
      entityType: 'OPERATOR',
      entityId: targetOperatorId,
      actorId: actor.id,
      actorRole: actor.role,
      ipAddress,
      result: 'SUCCESS',
    });

    return updated;
  }

  async reactivateOperator(targetOperatorId: string, actor: { id: string; role: OperatorRole }, ipAddress?: string) {
    const updated = await this.prisma.operator.update({
      where: { id: targetOperatorId },
      data: { status: 'ACTIVE', failedLoginAttempts: 0, lockedUntil: null },
      select: {
        id: true,
        email: true,
        status: true,
        updatedAt: true,
      },
    });

    await this.auditLogsService.log({
      action: 'OPERATOR_REACTIVATED',
      entityType: 'OPERATOR',
      entityId: targetOperatorId,
      actorId: actor.id,
      actorRole: actor.role,
      ipAddress,
      result: 'SUCCESS',
    });

    return updated;
  }
}
