import {
  Controller,
  Get,
  Patch,
  Put,
  Delete,
  Param,
  Body,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { OperatorRole } from '@prisma/control-plane-client';
import { OperatorJwtGuard } from '../auth/operator-jwt.guard';
import { OperatorRbacGuard } from '../auth/operator-rbac.guard';
import { RequireOperatorRoles } from '../auth/operator-roles.decorator';
import { ServiceControlService } from './service-control.service';
import { UpdateGlobalServiceStateDto } from './dto/update-global-service-state.dto';
import { UpdateOrganizationServiceOverrideDto } from './dto/update-organization-service-override.dto';

@Controller('v1')
@UseGuards(OperatorJwtGuard, OperatorRbacGuard)
export class ServiceControlController {
  constructor(private readonly serviceControlService: ServiceControlService) {}

  @Get('services')
  @RequireOperatorRoles(
    OperatorRole.PLATFORM_SUPER_ADMIN,
    OperatorRole.OPERATIONS_ENGINEER,
    OperatorRole.COMMERCIAL_OPERATOR,
    OperatorRole.SUPPORT_ENGINEER,
    OperatorRole.SECURITY_AUDIT,
    OperatorRole.READ_ONLY_AUDITOR,
  )
  async listServices() {
    return this.serviceControlService.listServices();
  }

  @Get('services/:code')
  @RequireOperatorRoles(
    OperatorRole.PLATFORM_SUPER_ADMIN,
    OperatorRole.OPERATIONS_ENGINEER,
    OperatorRole.COMMERCIAL_OPERATOR,
    OperatorRole.SUPPORT_ENGINEER,
    OperatorRole.SECURITY_AUDIT,
    OperatorRole.READ_ONLY_AUDITOR,
  )
  async getServiceByCode(@Param('code') code: string) {
    return this.serviceControlService.getServiceByCode(code);
  }

  @Get('services/:code/global-state')
  @RequireOperatorRoles(
    OperatorRole.PLATFORM_SUPER_ADMIN,
    OperatorRole.OPERATIONS_ENGINEER,
    OperatorRole.COMMERCIAL_OPERATOR,
    OperatorRole.SUPPORT_ENGINEER,
    OperatorRole.SECURITY_AUDIT,
    OperatorRole.READ_ONLY_AUDITOR,
  )
  async getGlobalServiceState(@Param('code') code: string) {
    const service = await this.serviceControlService.getServiceByCode(code);
    return service.globalState;
  }

  @Put('services/:code/global-state')
  @Patch('services/:code/global-state')
  @HttpCode(HttpStatus.OK)
  @RequireOperatorRoles(OperatorRole.PLATFORM_SUPER_ADMIN, OperatorRole.OPERATIONS_ENGINEER)
  async updateGlobalServiceState(
    @Param('code') code: string,
    @Body() dto: UpdateGlobalServiceStateDto,
    @Req() req: any,
  ) {
    const operator = req.operator || req.user;
    const ipAddress = req.ip || req.connection?.remoteAddress;
    const correlationId = req.headers['x-correlation-id'] || req.headers['x-request-id'];

    return this.serviceControlService.updateGlobalServiceState(
      code,
      dto,
      operator,
      ipAddress,
      correlationId,
    );
  }

  @Put('organizations/:organizationId/services/:code')
  @Put('organizations/:organizationId/services/:code/override')
  @Patch('organizations/:organizationId/services/:code')
  @Patch('organizations/:organizationId/services/:code/override')
  @HttpCode(HttpStatus.OK)
  @RequireOperatorRoles(OperatorRole.PLATFORM_SUPER_ADMIN, OperatorRole.OPERATIONS_ENGINEER)
  async setOrganizationServiceOverride(
    @Param('organizationId') organizationId: string,
    @Param('code') code: string,
    @Body() dto: UpdateOrganizationServiceOverrideDto,
    @Req() req: any,
  ) {
    const operator = req.operator || req.user;
    const ipAddress = req.ip || req.connection?.remoteAddress;
    const correlationId = req.headers['x-correlation-id'] || req.headers['x-request-id'];

    return this.serviceControlService.setOrganizationServiceOverride(
      organizationId,
      code,
      dto,
      operator,
      ipAddress,
      correlationId,
    );
  }

  @Delete('organizations/:organizationId/services/:code')
  @Delete('organizations/:organizationId/services/:code/override')
  @HttpCode(HttpStatus.OK)
  @RequireOperatorRoles(OperatorRole.PLATFORM_SUPER_ADMIN, OperatorRole.OPERATIONS_ENGINEER)
  async clearOrganizationServiceOverride(
    @Param('organizationId') organizationId: string,
    @Param('code') code: string,
    @Req() req: any,
  ) {
    const operator = req.operator || req.user;
    const ipAddress = req.ip || req.connection?.remoteAddress;
    const correlationId = req.headers['x-correlation-id'] || req.headers['x-request-id'];

    return this.serviceControlService.clearOrganizationServiceOverride(
      organizationId,
      code,
      operator,
      ipAddress,
      correlationId,
    );
  }
}
