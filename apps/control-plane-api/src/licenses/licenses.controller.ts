import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { LicensesService } from './licenses.service';
import { OperatorJwtGuard } from '../auth/operator-jwt.guard';
import { OperatorRbacGuard } from '../auth/operator-rbac.guard';
import { RequireOperatorRoles } from '../auth/operator-roles.decorator';
import { CreateLicenseDto, LicenseStatus } from '@omnigrc/shared';
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

  @Post(':id/deployments')
  @RequireOperatorRoles(OperatorRole.COMMERCIAL_OPERATOR, OperatorRole.OPERATIONS_ENGINEER, OperatorRole.PLATFORM_SUPER_ADMIN)
  @HttpCode(HttpStatus.OK)
  async associateDeployment(
    @Param('id') licenseId: string,
    @Body('deploymentId') deploymentId: string,
  ) {
    return this.licensesService.associateDeployment(licenseId, deploymentId);
  }
}
