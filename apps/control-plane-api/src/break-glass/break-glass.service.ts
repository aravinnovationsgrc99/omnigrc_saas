import {
  Injectable,
  NotFoundException,
  BadRequestException,
  UnauthorizedException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { ControlPlanePrismaService } from '../prisma/prisma.service';
import { OperatorSecurityService } from '../auth/operator-security.service';
import { ControlPlaneAuditLogsService } from '../audit/audit-logs.service';
import { OrganizationControlService } from '../organization-control/organization-control.service';
import { ServiceControlService } from '../service-control/service-control.service';
import { DeploymentsService } from '../deployments/deployments.service';
import { LicensesService } from '../licenses/licenses.service';
import { ControlState, ServiceStateEnum } from '@prisma/control-plane-client';
import {
  BreakGlassStatus,
  BreakGlassOperation,
  BreakGlassSessionDto,
  RequestBreakGlassSessionDto,
  ApproveBreakGlassSessionDto,
  ExecuteBreakGlassActionDto,
  ReviewBreakGlassSessionDto,
  ActivationState,
} from '@omnigrc/shared';

@Injectable()
export class BreakGlassService {
  private readonly logger = new Logger(BreakGlassService.name);

  constructor(
    private readonly prisma: ControlPlanePrismaService,
    private readonly operatorSecurityService: OperatorSecurityService,
    private readonly audit: ControlPlaneAuditLogsService,
    private readonly organizationControlService: OrganizationControlService,
    private readonly serviceControlService: ServiceControlService,
    private readonly deploymentsService: DeploymentsService,
    private readonly licensesService: LicensesService,
  ) {}

  /**
   * Check if a session has expired and update status if needed.
   */
  private checkExpiration(session: any): any {
    if (
      (session.status === BreakGlassStatus.REQUESTED || session.status === BreakGlassStatus.APPROVED) &&
      new Date(session.expiresAt).getTime() < Date.now()
    ) {
      session.status = BreakGlassStatus.EXPIRED;
    }
    return session;
  }

  /**
   * Request a new Break-Glass session with step-up MFA and optional single-operator emergency mode.
   */
  async requestSession(
    operatorId: string,
    dto: RequestBreakGlassSessionDto,
    reqIp?: string,
    userAgent?: string,
  ): Promise<BreakGlassSessionDto> {
    const operator = await this.prisma.operator.findUnique({
      where: { id: operatorId },
    });

    if (!operator) {
      throw new NotFoundException(`Operator with ID "${operatorId}" not found.`);
    }

    // Step-Up MFA Verification
    if (!operator.totpSecret || !operator.mfaEnabled) {
      throw new UnauthorizedException('Multi-Factor Authentication (MFA) must be enabled to request Break-Glass authorization.');
    }

    const isMfaValid = this.operatorSecurityService.verifyTotpCode(operator.totpSecret, dto.totpCode);
    if (!isMfaValid) {
      throw new UnauthorizedException('Invalid MFA TOTP code provided for Break-Glass request.');
    }

    if (!dto.reason || dto.reason.trim().length < 10) {
      throw new BadRequestException('Reason must be at least 10 characters long for Break-Glass session request.');
    }

    // Scope Target Validation
    if (
      dto.operation === BreakGlassOperation.EMERGENCY_ORG_SUSPEND ||
      dto.operation === BreakGlassOperation.EMERGENCY_ORG_DISABLE
    ) {
      if (!dto.targetOrganizationId) {
        throw new BadRequestException(`targetOrganizationId is required for operation ${dto.operation}`);
      }
    } else if (dto.operation === BreakGlassOperation.EMERGENCY_DEPLOYMENT_SUSPEND) {
      if (!dto.targetDeploymentId) {
        throw new BadRequestException(`targetDeploymentId is required for operation ${dto.operation}`);
      }
    } else if (dto.operation === BreakGlassOperation.EMERGENCY_SERVICE_KILL_SWITCH) {
      if (!dto.targetServiceCode) {
        throw new BadRequestException(`targetServiceCode is required for operation ${dto.operation}`);
      }
    } else if (dto.operation === BreakGlassOperation.EMERGENCY_LICENSE_RECONCILE) {
      if (!dto.targetOrganizationId && !dto.targetDeploymentId) {
        throw new BadRequestException(`targetOrganizationId or targetDeploymentId is required for operation ${dto.operation}`);
      }
    }

    // Idempotency Check
    if (dto.idempotencyKey) {
      const existing = await this.prisma.breakGlassSession.findUnique({
        where: { idempotencyKey: dto.idempotencyKey },
        include: { requesterOperator: true, approverOperator: true },
      });
      if (existing) {
        return this.mapToDto(existing);
      }
    }

    const duration = dto.durationMinutes ? Math.min(Math.max(dto.durationMinutes, 5), 30) : 15;
    const expiresAt = new Date(Date.now() + duration * 60 * 1000);

    const isEmergency = dto.isSingleOperatorEmergency === true;
    let status = BreakGlassStatus.REQUESTED;
    let approvedAt: Date | undefined = undefined;
    let postEventReviewStatus = 'NOT_APPLICABLE';

    if (isEmergency) {
      const targetId = dto.targetOrganizationId || dto.targetDeploymentId || dto.targetServiceCode || 'TARGET';
      const expectedText = `CONFIRM EMERGENCY OVERRIDE ${targetId.toUpperCase()}`;
      if (
        !dto.emergencyConfirmationText ||
        dto.emergencyConfirmationText.trim().toUpperCase() !== expectedText
      ) {
        throw new BadRequestException(
          `Single-operator emergency override requires typed confirmation matching exactly: "${expectedText}"`,
        );
      }
      status = BreakGlassStatus.APPROVED;
      approvedAt = new Date();
      postEventReviewStatus = 'PENDING_REVIEW';
    }

    const session = await this.prisma.breakGlassSession.create({
      data: {
        requesterOperatorId: operatorId,
        approverOperatorId: isEmergency ? operatorId : null,
        status,
        operation: dto.operation as any,
        reason: dto.reason,
        targetOrganizationId: dto.targetOrganizationId || null,
        targetDeploymentId: dto.targetDeploymentId || null,
        targetServiceCode: dto.targetServiceCode || null,
        idempotencyKey: dto.idempotencyKey || null,
        expiresAt,
        approvedAt,
        isSingleOperatorEmergency: isEmergency,
        postEventReviewStatus,
        originatingIp: reqIp || null,
        userAgent: userAgent || null,
      },
      include: {
        requesterOperator: true,
        approverOperator: true,
      },
    });

    await this.audit.log(
      isEmergency ? 'BREAK_GLASS_SESSION_APPROVED_EMERGENCY' : 'BREAK_GLASS_SESSION_REQUESTED',
      'BreakGlassSession',
      session.id,
      {
        operatorId,
        operation: dto.operation,
        reason: dto.reason,
        targetOrganizationId: dto.targetOrganizationId,
        targetDeploymentId: dto.targetDeploymentId,
        targetServiceCode: dto.targetServiceCode,
        isSingleOperatorEmergency: isEmergency,
        expiresAt: expiresAt.toISOString(),
      },
    );

    return this.mapToDto(session);
  }

  /**
   * Approve a Break-Glass session (Separation of Duties enforced: Requester != Approver).
   */
  async approveSession(
    sessionId: string,
    operatorId: string,
    dto: ApproveBreakGlassSessionDto,
    reqIp?: string,
  ): Promise<BreakGlassSessionDto> {
    const session = await this.prisma.breakGlassSession.findUnique({
      where: { id: sessionId },
      include: { requesterOperator: true, approverOperator: true },
    });

    if (!session) {
      throw new NotFoundException(`Break-Glass session with ID "${sessionId}" not found.`);
    }

    if (session.status !== (BreakGlassStatus.REQUESTED as any)) {
      throw new BadRequestException(`Cannot approve break-glass session in status "${session.status}".`);
    }

    if (new Date(session.expiresAt).getTime() < Date.now()) {
      await this.prisma.breakGlassSession.update({
        where: { id: sessionId },
        data: { status: BreakGlassStatus.EXPIRED as any },
      });
      throw new BadRequestException('Break-Glass session has expired.');
    }

    // Separation of Duties Enforcement
    if (session.requesterOperatorId === operatorId) {
      throw new ForbiddenException(
        'Separation of Duties Violation: Requester cannot approve their own Break-Glass request. A second authorized operator must approve.',
      );
    }

    const operator = await this.prisma.operator.findUnique({
      where: { id: operatorId },
    });

    if (!operator || !operator.totpSecret || !operator.mfaEnabled) {
      throw new UnauthorizedException('Approving operator must have active MFA enabled.');
    }

    const isMfaValid = this.operatorSecurityService.verifyTotpCode(operator.totpSecret, dto.totpCode);
    if (!isMfaValid) {
      throw new UnauthorizedException('Invalid MFA TOTP code provided for Break-Glass approval.');
    }

    const updated = await this.prisma.breakGlassSession.update({
      where: { id: sessionId },
      data: {
        status: BreakGlassStatus.APPROVED as any,
        approverOperatorId: operatorId,
        approvedAt: new Date(),
      },
      include: {
        requesterOperator: true,
        approverOperator: true,
      },
    });

    await this.audit.log('BREAK_GLASS_SESSION_APPROVED', 'BreakGlassSession', updated.id, {
      approverOperatorId: operatorId,
      requesterOperatorId: session.requesterOperatorId,
      operation: session.operation,
      reason: dto.reason || 'Approved by second operator',
    });

    return this.mapToDto(updated);
  }

  /**
   * Execute authorized Break-Glass operation.
   */
  async executeAction(
    sessionId: string,
    operatorId: string,
    dto: ExecuteBreakGlassActionDto,
    reqIp?: string,
  ): Promise<{ success: boolean; session: BreakGlassSessionDto; result: any }> {
    const session = await this.prisma.breakGlassSession.findUnique({
      where: { id: sessionId },
      include: { requesterOperator: true, approverOperator: true },
    });

    if (!session) {
      throw new NotFoundException(`Break-Glass session with ID "${sessionId}" not found.`);
    }

    // Check expiration
    if (new Date(session.expiresAt).getTime() < Date.now()) {
      await this.prisma.breakGlassSession.update({
        where: { id: sessionId },
        data: { status: BreakGlassStatus.EXPIRED as any },
      });
      throw new BadRequestException('Break-Glass session has expired.');
    }

    // Idempotency: Return executed state if already run
    if (session.status === (BreakGlassStatus.EXECUTED as any)) {
      return {
        success: true,
        session: this.mapToDto(session),
        result: { message: 'Action already executed idempotently' },
      };
    }

    if (session.status !== (BreakGlassStatus.APPROVED as any)) {
      throw new BadRequestException(`Cannot execute Break-Glass session in status "${session.status}". Session must be APPROVED.`);
    }

    // Step-Up MFA Verification on execution if provided
    if (dto.totpCode) {
      const operator = await this.prisma.operator.findUnique({ where: { id: operatorId } });
      if (operator?.totpSecret && operator?.mfaEnabled) {
        const isValid = this.operatorSecurityService.verifyTotpCode(operator.totpSecret, dto.totpCode);
        if (!isValid) {
          throw new UnauthorizedException('Invalid MFA TOTP code for Break-Glass execution.');
        }
      }
    }

    let actionResult: any;

    const opContext = {
      id: operatorId,
      role: 'OPERATIONS_ENGINEER' as any,
      email: 'break-glass@omnigrc.internal',
    };

    // Dispatch target operation against underlying Control Plane authority
    switch (session.operation as any) {
      case BreakGlassOperation.EMERGENCY_ORG_SUSPEND:
        if (!session.targetOrganizationId) {
          throw new BadRequestException('Missing targetOrganizationId for EMERGENCY_ORG_SUSPEND');
        }
        actionResult = await this.organizationControlService.transitionState(
          session.targetOrganizationId,
          {
            targetState: ControlState.SUSPENDED as any,
            reason: `[BREAK-GLASS ${session.id}] ${session.reason}`,
          },
          opContext,
        );
        break;

      case BreakGlassOperation.EMERGENCY_ORG_DISABLE:
        if (!session.targetOrganizationId) {
          throw new BadRequestException('Missing targetOrganizationId for EMERGENCY_ORG_DISABLE');
        }
        actionResult = await this.organizationControlService.transitionState(
          session.targetOrganizationId,
          {
            targetState: ControlState.DISABLED as any,
            reason: `[BREAK-GLASS ${session.id}] ${session.reason}`,
          },
          opContext,
        );
        break;

      case BreakGlassOperation.EMERGENCY_SERVICE_KILL_SWITCH:
        if (!session.targetServiceCode) {
          throw new BadRequestException('Missing targetServiceCode for EMERGENCY_SERVICE_KILL_SWITCH');
        }
        if (session.targetOrganizationId) {
          actionResult = await this.serviceControlService.setOrganizationServiceOverride(
            session.targetOrganizationId,
            session.targetServiceCode,
            {
              overrideState: ServiceStateEnum.DISABLED as any,
              reason: `[BREAK-GLASS ${session.id}] ${session.reason}`,
            },
            opContext,
          );
        } else {
          actionResult = await this.serviceControlService.updateGlobalServiceState(
            session.targetServiceCode,
            {
              state: ServiceStateEnum.DISABLED as any,
              reason: `[BREAK-GLASS ${session.id}] ${session.reason}`,
            },
            opContext,
          );
        }
        break;

      case BreakGlassOperation.EMERGENCY_DEPLOYMENT_SUSPEND:
        if (!session.targetDeploymentId) {
          throw new BadRequestException('Missing targetDeploymentId for EMERGENCY_DEPLOYMENT_SUSPEND');
        }
        const targetDepForSuspend = await this.prisma.deployment.findUnique({
          where: { id: session.targetDeploymentId },
        });
        if (!targetDepForSuspend) {
          throw new NotFoundException(`Deployment with ID "${session.targetDeploymentId}" not found.`);
        }
        if (session.targetOrganizationId && targetDepForSuspend.organizationId !== session.targetOrganizationId) {
          throw new ForbiddenException(
            `Cross-Tenant Scope Violation: Deployment "${session.targetDeploymentId}" belongs to organization "${targetDepForSuspend.organizationId}", which does not match Break-Glass session organization scope "${session.targetOrganizationId}".`,
          );
        }
        actionResult = await this.deploymentsService.updateState(session.targetDeploymentId, {
          activationState: ActivationState.SUSPENDED as any,
          reason: `[BREAK-GLASS ${session.id}] ${session.reason}`,
        });
        break;

      case BreakGlassOperation.EMERGENCY_LICENSE_RECONCILE:
        if (!session.targetOrganizationId && !session.targetDeploymentId) {
          throw new BadRequestException('Missing target targetOrganizationId or targetDeploymentId for EMERGENCY_LICENSE_RECONCILE');
        }
        if (session.targetDeploymentId) {
          const targetDep = await this.prisma.deployment.findUnique({
            where: { id: session.targetDeploymentId },
          });
          if (!targetDep) {
            throw new NotFoundException(`Deployment with ID "${session.targetDeploymentId}" not found.`);
          }
          if (session.targetOrganizationId && targetDep.organizationId !== session.targetOrganizationId) {
            throw new ForbiddenException(
              `Cross-Tenant Scope Violation: Deployment "${session.targetDeploymentId}" belongs to organization "${targetDep.organizationId}", which does not match Break-Glass session organization scope "${session.targetOrganizationId}".`,
            );
          }
          actionResult = await this.deploymentsService.getLicenseArtifact(session.targetDeploymentId);
        } else if (session.targetOrganizationId) {
          const firstDep = await this.prisma.deployment.findFirst({
            where: { organizationId: session.targetOrganizationId },
          });
          if (!firstDep) {
            throw new NotFoundException(`No deployment found for organization "${session.targetOrganizationId}".`);
          }
          actionResult = await this.deploymentsService.getLicenseArtifact(firstDep.id);
        }
        break;

      default:
        throw new BadRequestException(`Unsupported Break-Glass operation "${session.operation}"`);
    }

    const updated = await this.prisma.breakGlassSession.update({
      where: { id: sessionId },
      data: {
        status: BreakGlassStatus.EXECUTED as any,
        executorOperatorId: operatorId,
        executedAt: new Date(),
      },
      include: {
        requesterOperator: true,
        approverOperator: true,
      },
    });

    await this.audit.log('BREAK_GLASS_ACTION_EXECUTED', 'BreakGlassSession', updated.id, {
      executorOperatorId: operatorId,
      operation: session.operation,
      targetOrganizationId: session.targetOrganizationId,
      targetDeploymentId: session.targetDeploymentId,
      targetServiceCode: session.targetServiceCode,
      isSingleOperatorEmergency: session.isSingleOperatorEmergency,
    });

    return {
      success: true,
      session: this.mapToDto(updated),
      result: actionResult,
    };
  }

  /**
   * Revoke an active or requested Break-Glass session.
   */
  async revokeSession(
    sessionId: string,
    operatorId: string,
    reason?: string,
  ): Promise<BreakGlassSessionDto> {
    const session = await this.prisma.breakGlassSession.findUnique({
      where: { id: sessionId },
      include: { requesterOperator: true, approverOperator: true },
    });

    if (!session) {
      throw new NotFoundException(`Break-Glass session with ID "${sessionId}" not found.`);
    }

    const updated = await this.prisma.breakGlassSession.update({
      where: { id: sessionId },
      data: {
        status: BreakGlassStatus.REVOKED as any,
        revokedByOperatorId: operatorId,
        revokedAt: new Date(),
      },
      include: {
        requesterOperator: true,
        approverOperator: true,
      },
    });

    await this.audit.log('BREAK_GLASS_SESSION_REVOKED', 'BreakGlassSession', updated.id, {
      revokedByOperatorId: operatorId,
      reason: reason || 'Revoked by operator',
    });

    return this.mapToDto(updated);
  }

  /**
   * Perform mandatory post-event review for single-operator emergency actions.
   */
  async reviewEmergencySession(
    sessionId: string,
    operatorId: string,
    dto: ReviewBreakGlassSessionDto,
  ): Promise<BreakGlassSessionDto> {
    const session = await this.prisma.breakGlassSession.findUnique({
      where: { id: sessionId },
      include: { requesterOperator: true, approverOperator: true },
    });

    if (!session) {
      throw new NotFoundException(`Break-Glass session with ID "${sessionId}" not found.`);
    }

    if (!session.isSingleOperatorEmergency) {
      throw new BadRequestException('Post-event review is only required for single-operator emergency actions.');
    }

    const reviewer = await this.prisma.operator.findUnique({ where: { id: operatorId } });
    if (!reviewer || (reviewer.role !== 'PLATFORM_SUPER_ADMIN' && reviewer.role !== 'SECURITY_AUDIT')) {
      throw new ForbiddenException('Only PLATFORM_SUPER_ADMIN or SECURITY_AUDIT operators can perform post-event emergency reviews.');
    }

    if (session.executorOperatorId === operatorId || session.requesterOperatorId === operatorId) {
      throw new ForbiddenException('Separation of Duties Violation: Executor cannot review their own emergency action.');
    }

    if (session.postEventReviewStatus !== 'PENDING_REVIEW') {
      throw new BadRequestException('Post-event review has already been completed for this Break-Glass session.');
    }

    const updated = await this.prisma.breakGlassSession.update({
      where: { id: sessionId },
      data: {
        postEventReviewStatus: dto.postEventReviewStatus,
        postEventReviewedBy: operatorId,
        postEventReviewedAt: new Date(),
        postEventNotes: dto.notes,
      },
      include: {
        requesterOperator: true,
        approverOperator: true,
      },
    });

    await this.audit.log('BREAK_GLASS_POST_EVENT_REVIEWED', 'BreakGlassSession', updated.id, {
      reviewerOperatorId: operatorId,
      postEventReviewStatus: dto.postEventReviewStatus,
      notes: dto.notes,
    });

    return this.mapToDto(updated);
  }

  /**
   * List Break-Glass sessions with optional filtering.
   */
  async findAll(query: {
    status?: string;
    operation?: string;
    targetOrganizationId?: string;
    isSingleOperatorEmergency?: boolean;
  }): Promise<BreakGlassSessionDto[]> {
    const where: any = {};
    if (query.status) where.status = query.status;
    if (query.operation) where.operation = query.operation;
    if (query.targetOrganizationId) where.targetOrganizationId = query.targetOrganizationId;
    if (query.isSingleOperatorEmergency !== undefined) {
      where.isSingleOperatorEmergency = query.isSingleOperatorEmergency;
    }

    const sessions = await this.prisma.breakGlassSession.findMany({
      where,
      include: {
        requesterOperator: true,
        approverOperator: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return sessions.map((s) => this.mapToDto(this.checkExpiration(s)));
  }

  /**
   * Find single Break-Glass session details by ID.
   */
  async findOne(id: string): Promise<BreakGlassSessionDto> {
    const session = await this.prisma.breakGlassSession.findUnique({
      where: { id },
      include: {
        requesterOperator: true,
        approverOperator: true,
      },
    });

    if (!session) {
      throw new NotFoundException(`Break-Glass session with ID "${id}" not found.`);
    }

    return this.mapToDto(this.checkExpiration(session));
  }

  private mapToDto(s: any): BreakGlassSessionDto {
    return {
      id: s.id,
      requesterOperatorId: s.requesterOperatorId,
      requesterOperatorName: s.requesterOperator ? s.requesterOperator.fullName : undefined,
      approverOperatorId: s.approverOperatorId,
      approverOperatorName: s.approverOperator ? s.approverOperator.fullName : undefined,
      executorOperatorId: s.executorOperatorId,
      status: s.status as BreakGlassStatus,
      operation: s.operation as BreakGlassOperation,
      reason: s.reason,
      targetOrganizationId: s.targetOrganizationId,
      targetDeploymentId: s.targetDeploymentId,
      targetServiceCode: s.targetServiceCode,
      scopeMetadata: s.scopeMetadata,
      idempotencyKey: s.idempotencyKey,
      expiresAt: s.expiresAt instanceof Date ? s.expiresAt.toISOString() : s.expiresAt,
      approvedAt: s.approvedAt ? s.approvedAt.toISOString() : null,
      executedAt: s.executedAt ? s.executedAt.toISOString() : null,
      revokedAt: s.revokedAt ? s.revokedAt.toISOString() : null,
      revokedByOperatorId: s.revokedByOperatorId,
      isSingleOperatorEmergency: s.isSingleOperatorEmergency,
      postEventReviewStatus: s.postEventReviewStatus,
      postEventReviewedBy: s.postEventReviewedBy,
      postEventReviewedAt: s.postEventReviewedAt ? s.postEventReviewedAt.toISOString() : null,
      postEventNotes: s.postEventNotes,
      originatingIp: s.originatingIp,
      userAgent: s.userAgent,
      createdAt: s.createdAt instanceof Date ? s.createdAt.toISOString() : s.createdAt,
      updatedAt: s.updatedAt instanceof Date ? s.updatedAt.toISOString() : s.updatedAt,
    };
  }
}
