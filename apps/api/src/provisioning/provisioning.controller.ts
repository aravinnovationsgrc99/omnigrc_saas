import { Controller, Post, Body, HttpCode, HttpStatus, UseGuards } from '@nestjs/common';
import { ProvisioningService } from './provisioning.service';
import { ControlPlaneM2MGuard } from './guards/control-plane-m2m.guard';
import { BypassLicenseCheck } from '../common/decorators/requires-active-license.decorator';
import { SaasProvisioningDto, ControlPlaneProvisioningDto, ProvisioningResultDto } from '@omnigrc/shared';

@Controller('provisioning')
@BypassLicenseCheck()
@UseGuards(ControlPlaneM2MGuard)
export class ProvisioningController {
  constructor(private readonly provisioningService: ProvisioningService) {}

  @Post('saas')
  @HttpCode(HttpStatus.OK)
  async provisionSaas(@Body() dto: SaasProvisioningDto): Promise<ProvisioningResultDto> {
    return this.provisioningService.provisionSaasOrganization(dto);
  }

  @Post('saas/webhook')
  @HttpCode(HttpStatus.OK)
  async provisionSaasWebhook(@Body() dto: SaasProvisioningDto): Promise<ProvisioningResultDto> {
    return this.provisioningService.provisionSaasOrganization(dto);
  }

  @Post('control-plane')
  @HttpCode(HttpStatus.OK)
  async provisionControlPlane(@Body() dto: ControlPlaneProvisioningDto): Promise<ProvisioningResultDto> {
    return this.provisioningService.provisionControlPlaneDeployment(dto);
  }

  @Post('control-plane-deployment')
  @HttpCode(HttpStatus.OK)
  async provisionControlPlaneDeployment(@Body() dto: ControlPlaneProvisioningDto): Promise<ProvisioningResultDto> {
    return this.provisioningService.provisionControlPlaneDeployment(dto);
  }
}
