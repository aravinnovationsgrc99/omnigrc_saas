import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { DeploymentsService } from './deployments.service';
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
  @HttpCode(HttpStatus.CREATED)
  async createDeployment(@Body() dto: CreateDeploymentDto) {
    return this.deploymentsService.createDeployment(dto);
  }

  @Get()
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
  async findOne(@Param('id') id: string) {
    return this.deploymentsService.findOne(id);
  }

  @Post(':id/check-in')
  @HttpCode(HttpStatus.OK)
  async checkIn(
    @Param('id') id: string,
    @Body() dto: DeploymentCheckInDto,
  ) {
    return this.deploymentsService.checkIn(id, dto);
  }

  @Patch(':id/state')
  @HttpCode(HttpStatus.OK)
  async updateState(
    @Param('id') id: string,
    @Body() dto: UpdateDeploymentStateDto,
  ) {
    return this.deploymentsService.updateState(id, dto);
  }
}
