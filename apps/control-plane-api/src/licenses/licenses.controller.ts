import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { LicensesService } from './licenses.service';
import { OperatorJwtGuard } from '../auth/operator-jwt.guard';
import { OperatorRbacGuard } from '../auth/operator-rbac.guard';
import { RequireOperatorRoles } from '../auth/operator-roles.decorator';
import { CreateLicenseDto, UpdateLicenseDto, GrantEntitlementDto, LicenseStatus } from '@omnigrc/shared';
import { OperatorRole } from '@prisma/control-plane-client';

@Controller('v1/licenses')
@UseGuards(OperatorJwtGuard, OperatorRbacGuard)
export class LicensesController {
  constructor(private readonly licensesService: LicensesService) {}

  @Post()
  @RequireOperatorRoles(OperatorRole.COMMERCIAL_OPERATOR, OperatorRole.PLATFORM_SUPER_ADMIN)
  @HttpCode(HttpStatus.CREATED)
  async createLicense(@Body() dto: CreateLicenseDto) {
    return this.licensesService.createLicense(dto);
  }

  @Get()
  @RequireOperatorRoles(
    OperatorRole.COMMERCIAL_OPERATOR,
    OperatorRole.OPERATIONS_ENGINEER,
    OperatorRole.SUPPORT_ENGINEER,
    OperatorRole.SECURITY_AUDIT,
    OperatorRole.READ_ONLY_AUDITOR,
    OperatorRole.PLATFORM_SUPER_ADMIN,
  )
  async findAll(
    @Query('commercialAgreementId') commercialAgreementId?: string,
    @Query('status') status?: LicenseStatus,
  ) {
    return this.licensesService.findAll({ commercialAgreementId, status });
  }

  @Get(':id')
  @RequireOperatorRoles(
    OperatorRole.COMMERCIAL_OPERATOR,
    OperatorRole.OPERATIONS_ENGINEER,
    OperatorRole.SUPPORT_ENGINEER,
    OperatorRole.SECURITY_AUDIT,
    OperatorRole.READ_ONLY_AUDITOR,
    OperatorRole.PLATFORM_SUPER_ADMIN,
  )
  async findOne(@Param('id') id: string) {
    return this.licensesService.findOne(id);
  }

  @Put(':id')
  @RequireOperatorRoles(OperatorRole.COMMERCIAL_OPERATOR, OperatorRole.PLATFORM_SUPER_ADMIN)
  async updateLicense(@Param('id') id: string, @Body() dto: UpdateLicenseDto) {
    return this.licensesService.updateLicense(id, dto);
  }

  @Post(':id/suspend')
  @RequireOperatorRoles(OperatorRole.COMMERCIAL_OPERATOR, OperatorRole.PLATFORM_SUPER_ADMIN)
  @HttpCode(HttpStatus.OK)
  async suspendLicense(@Param('id') id: string, @Body('reason') reason?: string) {
    return this.licensesService.suspendLicense(id, reason);
  }

  @Post(':id/reactivate')
  @RequireOperatorRoles(OperatorRole.COMMERCIAL_OPERATOR, OperatorRole.PLATFORM_SUPER_ADMIN)
  @HttpCode(HttpStatus.OK)
  async reactivateLicense(@Param('id') id: string, @Body('reason') reason?: string) {
    return this.licensesService.reactivateLicense(id, reason);
  }

  @Post(':id/revoke')
  @RequireOperatorRoles(OperatorRole.COMMERCIAL_OPERATOR, OperatorRole.PLATFORM_SUPER_ADMIN)
  @HttpCode(HttpStatus.OK)
  async revokeLicense(@Param('id') id: string, @Body('reason') reason?: string) {
    return this.licensesService.revokeLicense(id, reason);
  }

  @Post(':id/deployments')
  @RequireOperatorRoles(OperatorRole.COMMERCIAL_OPERATOR, OperatorRole.OPERATIONS_ENGINEER, OperatorRole.PLATFORM_SUPER_ADMIN)
  @HttpCode(HttpStatus.OK)
  async associateDeployment(
    @Param('id') licenseId: string,
    @Body('deploymentId') deploymentId: string,
  ) {
    return this.licensesService.associateDeployment(licenseId, deploymentId);
  }

  @Delete(':id/deployments/:deploymentId')
  @RequireOperatorRoles(OperatorRole.COMMERCIAL_OPERATOR, OperatorRole.OPERATIONS_ENGINEER, OperatorRole.PLATFORM_SUPER_ADMIN)
  @HttpCode(HttpStatus.OK)
  async disassociateDeployment(
    @Param('id') licenseId: string,
    @Param('deploymentId') deploymentId: string,
  ) {
    return this.licensesService.disassociateDeployment(licenseId, deploymentId);
  }

  @Get(':id/artifact')
  @RequireOperatorRoles(
    OperatorRole.COMMERCIAL_OPERATOR,
    OperatorRole.OPERATIONS_ENGINEER,
    OperatorRole.SECURITY_AUDIT,
    OperatorRole.PLATFORM_SUPER_ADMIN,
  )
  async getSignedArtifact(
    @Param('id') licenseId: string,
    @Query('deploymentId') deploymentId?: string,
  ) {
    return this.licensesService.getSignedArtifactForLicense(licenseId, deploymentId);
  }

  @Post(':id/entitlements')
  @RequireOperatorRoles(OperatorRole.COMMERCIAL_OPERATOR, OperatorRole.PLATFORM_SUPER_ADMIN)
  @HttpCode(HttpStatus.OK)
  async grantOrUpdateEntitlement(
    @Param('id') licenseId: string,
    @Body() dto: GrantEntitlementDto,
  ) {
    return this.licensesService.grantOrUpdateEntitlement(licenseId, dto);
  }

  @Post(':id/entitlements/:code/revoke')
  @RequireOperatorRoles(OperatorRole.COMMERCIAL_OPERATOR, OperatorRole.PLATFORM_SUPER_ADMIN)
  @HttpCode(HttpStatus.OK)
  async revokeEntitlement(
    @Param('id') licenseId: string,
    @Param('code') entitlementCode: string,
  ) {
    return this.licensesService.revokeEntitlement(licenseId, entitlementCode);
  }
}
