import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { LicensesService } from './licenses.service';
import { ControlPlaneAdminGuard } from '../auth/control-plane-admin.guard';
import { CreateLicenseDto, LicenseStatus } from '@omnigrc/shared';

@Controller('v1/licenses')
@UseGuards(ControlPlaneAdminGuard)
export class LicensesController {
  constructor(private readonly licensesService: LicensesService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createLicense(@Body() dto: CreateLicenseDto) {
    return this.licensesService.createLicense(dto);
  }

  @Get()
  async findAll(
    @Query('commercialAgreementId') commercialAgreementId?: string,
    @Query('status') status?: LicenseStatus,
  ) {
    return this.licensesService.findAll({ commercialAgreementId, status });
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.licensesService.findOne(id);
  }

  @Post(':id/deployments')
  @HttpCode(HttpStatus.OK)
  async associateDeployment(
    @Param('id') licenseId: string,
    @Body('deploymentId') deploymentId: string,
  ) {
    return this.licensesService.associateDeployment(licenseId, deploymentId);
  }
}
