import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  UseGuards,
} from '@nestjs/common';
import { FrameworksService } from './frameworks.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { FrameworkEntitlementGuard } from './guards/framework-entitlement.guard';
import { RequireFrameworkEntitlement } from './decorators/require-framework-entitlement.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { FrameworkItemDto, CustomFrameworkImportDto, Role } from '@omnigrc/shared';

@Controller('frameworks')
@UseGuards(JwtAuthGuard, RolesGuard, FrameworkEntitlementGuard)
export class FrameworksController {
  constructor(private readonly frameworksService: FrameworksService) {}

  @Get()
  async getFrameworks(
    @CurrentUser('organizationId') organizationId: string,
  ): Promise<FrameworkItemDto[]> {
    return this.frameworksService.findAll(organizationId);
  }

  @Get(':idOrCode')
  @RequireFrameworkEntitlement('idOrCode')
  async getFramework(
    @CurrentUser('organizationId') organizationId: string,
    @Param('idOrCode') idOrCode: string,
  ): Promise<FrameworkItemDto> {
    return this.frameworksService.findOne(organizationId, idOrCode);
  }

  @Get(':idOrCode/versions')
  @RequireFrameworkEntitlement('idOrCode')
  async getVersions(
    @CurrentUser('organizationId') organizationId: string,
    @Param('idOrCode') idOrCode: string,
  ) {
    return this.frameworksService.getVersions(organizationId, idOrCode);
  }

  @Get('versions/:versionId/references')
  async getReferences(
    @CurrentUser('organizationId') organizationId: string,
    @Param('versionId') versionId: string,
  ) {
    return this.frameworksService.getReferences(organizationId, versionId);
  }

  @Post('import')
  @Roles(Role.ADMIN, Role.MSSP_ADMIN)
  async importFramework(@Body() dto: CustomFrameworkImportDto): Promise<FrameworkItemDto> {
    return this.frameworksService.importCustomFramework(dto);
  }
}
