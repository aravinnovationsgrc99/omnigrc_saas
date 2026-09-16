import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { DeploymentsService } from './deployments.service';
import { ControlPlaneAdminGuard } from '../auth/control-plane-admin.guard';
import {
  CreateDeploymentDto,
  UpdateDeploymentStateDto,
  DeploymentCheckInDto,
  DeploymentModel,
  ActivationState,
} from '@omnigrc/shared';

@Controller('v1/deployments')
export class DeploymentsController {
  constructor(private readonly deploymentsService: DeploymentsService) {}

  @Post()
  @UseGuards(ControlPlaneAdminGuard)
  @HttpCode(HttpStatus.CREATED)
  async createDeployment(@Body() dto: CreateDeploymentDto) {
    return this.deploymentsService.createDeployment(dto);
  }

  @Get()
  @UseGuards(ControlPlaneAdminGuard)
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
  @UseGuards(ControlPlaneAdminGuard)
  async findOne(@Param('id') id: string) {
    return this.deploymentsService.findOne(id);
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
  @UseGuards(ControlPlaneAdminGuard)
  @HttpCode(HttpStatus.OK)
  async updateState(
    @Param('id') id: string,
    @Body() dto: UpdateDeploymentStateDto,
  ) {
    return this.deploymentsService.updateState(id, dto);
  }
}
