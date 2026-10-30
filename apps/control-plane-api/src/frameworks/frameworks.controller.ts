import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { OperatorRole } from '@prisma/control-plane-client';
import { OperatorJwtGuard } from '../auth/operator-jwt.guard';
import { OperatorRbacGuard } from '../auth/operator-rbac.guard';
import { RequireOperatorRoles } from '../auth/operator-roles.decorator';
import { ControlPlaneFrameworksService } from './frameworks.service';

@Controller('v1/frameworks')
@UseGuards(OperatorJwtGuard, OperatorRbacGuard)
export class ControlPlaneFrameworksController {
  constructor(private readonly frameworksService: ControlPlaneFrameworksService) {}

  @Get()
  @RequireOperatorRoles(
    OperatorRole.PLATFORM_SUPER_ADMIN,
    OperatorRole.OPERATIONS_ENGINEER,
    OperatorRole.COMMERCIAL_OPERATOR,
    OperatorRole.SUPPORT_ENGINEER,
    OperatorRole.SECURITY_AUDIT,
    OperatorRole.READ_ONLY_AUDITOR,
  )
  async listFrameworks(
    @Query('search') search?: string,
    @Query('jurisdiction') jurisdiction?: string,
    @Query('category') category?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.frameworksService.listFrameworks({
      search,
      jurisdiction,
      category,
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 20,
    });
  }

  @Get(':idOrCode')
  @RequireOperatorRoles(
    OperatorRole.PLATFORM_SUPER_ADMIN,
    OperatorRole.OPERATIONS_ENGINEER,
    OperatorRole.COMMERCIAL_OPERATOR,
    OperatorRole.SUPPORT_ENGINEER,
    OperatorRole.SECURITY_AUDIT,
    OperatorRole.READ_ONLY_AUDITOR,
  )
  async getFramework(@Param('idOrCode') idOrCode: string) {
    return this.frameworksService.getFramework(idOrCode);
  }

  @Get(':idOrCode/references')
  @RequireOperatorRoles(
    OperatorRole.PLATFORM_SUPER_ADMIN,
    OperatorRole.OPERATIONS_ENGINEER,
    OperatorRole.COMMERCIAL_OPERATOR,
    OperatorRole.SUPPORT_ENGINEER,
    OperatorRole.SECURITY_AUDIT,
    OperatorRole.READ_ONLY_AUDITOR,
  )
  async listFrameworkReferences(
    @Param('idOrCode') idOrCode: string,
    @Query('versionId') versionId?: string,
    @Query('search') search?: string,
    @Query('type') type?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.frameworksService.listFrameworkReferences(idOrCode, {
      versionId,
      search,
      type,
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 25,
    });
  }

  @Get(':idOrCode/entitlements')
  @RequireOperatorRoles(
    OperatorRole.PLATFORM_SUPER_ADMIN,
    OperatorRole.OPERATIONS_ENGINEER,
    OperatorRole.COMMERCIAL_OPERATOR,
    OperatorRole.SUPPORT_ENGINEER,
    OperatorRole.SECURITY_AUDIT,
    OperatorRole.READ_ONLY_AUDITOR,
  )
  async listFrameworkEntitlements(@Param('idOrCode') idOrCode: string) {
    return this.frameworksService.listFrameworkEntitlements(idOrCode);
  }
}

