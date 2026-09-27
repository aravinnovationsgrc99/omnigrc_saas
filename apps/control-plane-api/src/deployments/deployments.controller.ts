import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { DeploymentsService } from './deployments.service';
import { ControlPlaneAdminGuard } from '../auth/control-plane-admin.guard';
import { OperatorJwtGuard } from '../auth/operator-jwt.guard';
import { OperatorRbacGuard } from '../auth/operator-rbac.guard';
import { RequireOperatorRoles } from '../auth/operator-roles.decorator';
import { ControlPlaneAuditLogsService } from '../audit/audit-logs.service';
import {
  CreateDeploymentDto,
  UpdateDeploymentStateDto,
  DeploymentCheckInDto,
  ActivateDeploymentDto,
  DeploymentModel,
  ActivationState,
} from '@omnigrc/shared';
import { OperatorRole } from '@prisma/control-plane-client';

@Controller('v1/deployments')
export class DeploymentsController {
  constructor(
    private readonly deploymentsService: DeploymentsService,
    private readonly auditLogsService: ControlPlaneAuditLogsService,
  ) {}

  // M2M Provisioning or Operator Deployment Creation
  @Post()
  @UseGuards(ControlPlaneAdminGuard)
  @HttpCode(HttpStatus.CREATED)
  async createDeployment(@Body() dto: CreateDeploymentDto) {
    return this.deploymentsService.createDeployment(dto);
  }

  @Get()
  @UseGuards(OperatorJwtGuard, OperatorRbacGuard)
  @RequireOperatorRoles(
    OperatorRole.OPERATIONS_ENGINEER,
    OperatorRole.SUPPORT_ENGINEER,
    OperatorRole.SECURITY_AUDIT,
    OperatorRole.READ_ONLY_AUDITOR,
    OperatorRole.PLATFORM_SUPER_ADMIN,
  )
  async findAll(
    @Query('organizationId') organizationId?: string,
    @Query('deploymentModel') deploymentModel?: DeploymentModel,
    @Query('activationState') activationState?: ActivationState,
  ) {
    return this.deploymentsService.findAll({
      organizationId,
      deploymentModel,
      activationState,
    });
  }

  @Get(':id')
  @UseGuards(OperatorJwtGuard, OperatorRbacGuard)
  @RequireOperatorRoles(
    OperatorRole.OPERATIONS_ENGINEER,
    OperatorRole.SUPPORT_ENGINEER,
    OperatorRole.SECURITY_AUDIT,
    OperatorRole.READ_ONLY_AUDITOR,
    OperatorRole.PLATFORM_SUPER_ADMIN,
  )
  async findOne(@Param('id') id: string) {
    return this.deploymentsService.findOne(id);
  }

  // Self-Hosted / Deployment Activation using registration secret
  @Post(':id/activate')
  @HttpCode(HttpStatus.OK)
  async activate(
    @Param('id') id: string,
    @Body() dto: ActivateDeploymentDto,
  ) {
    return this.deploymentsService.activate(id, dto);
  }

  @Get(':id/license-artifact')
  @UseGuards(OperatorJwtGuard, OperatorRbacGuard)
  @RequireOperatorRoles(
    OperatorRole.OPERATIONS_ENGINEER,
    OperatorRole.COMMERCIAL_OPERATOR,
    OperatorRole.PLATFORM_SUPER_ADMIN,
  )
  async getLicenseArtifact(@Param('id') id: string) {
    return this.deploymentsService.getLicenseArtifact(id);
  }

  // Narrow Check-In API uses registration secret authentication inside service
  @Post(':id/check-in')
  @HttpCode(HttpStatus.OK)
  async checkIn(
    @Param('id') id: string,
    @Body() dto: DeploymentCheckInDto,
  ) {
    return this.deploymentsService.checkIn(id, dto);
  }

  @Patch(':id/state')
  @UseGuards(OperatorJwtGuard, OperatorRbacGuard)
  @RequireOperatorRoles(OperatorRole.OPERATIONS_ENGINEER, OperatorRole.PLATFORM_SUPER_ADMIN)
  @HttpCode(HttpStatus.OK)
  async updateState(
    @Param('id') id: string,
    @Body() dto: UpdateDeploymentStateDto,
    @Req() req: any,
  ) {
    const deployment = await this.deploymentsService.updateState(id, dto);

    await this.auditLogsService.log({
      action: 'DEPLOYMENT_STATE_UPDATED',
      entityType: 'DEPLOYMENT',
      entityId: id,
      actorId: req.user?.id,
      actorRole: req.user?.role,
      ipAddress: req.ip,
      correlationId: req.correlationId,
      result: 'SUCCESS',
      metadata: { newActivationState: dto.activationState },
    });

    return deployment;
  }
}
