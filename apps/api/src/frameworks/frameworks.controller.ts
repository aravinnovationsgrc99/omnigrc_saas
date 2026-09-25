import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
  UseGuards,
} from '@nestjs/common';
import { FrameworksService } from './frameworks.service';
import { FrameworkCoverageService } from './framework-coverage.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { FrameworkEntitlementGuard } from './guards/framework-entitlement.guard';
import { RequireFrameworkEntitlement } from './decorators/require-framework-entitlement.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ResourceAuthContext } from '../auth/resource-authorization.service';
import {
  FrameworkItemDto,
  CustomFrameworkImportDto,
  FrameworkCoverageResultDto,
  CoverageStatus,
  Role,
} from '@omnigrc/shared';

@Controller('frameworks')
@UseGuards(JwtAuthGuard, RolesGuard, FrameworkEntitlementGuard)
export class FrameworksController {
  constructor(
    private readonly frameworksService: FrameworksService,
    private readonly frameworkCoverageService: FrameworkCoverageService,
  ) {}

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

  @Get(':idOrCode/coverage')
  @RequireFrameworkEntitlement('idOrCode')
  async getCoverage(
    @CurrentUser() user: ResourceAuthContext,
    @Param('idOrCode') idOrCode: string,
    @Query('versionId') versionId?: string,
    @Query('status') status?: CoverageStatus,
    @Query('type') type?: string,
    @Query('search') search?: string,
  ): Promise<FrameworkCoverageResultDto> {
    return this.frameworkCoverageService.calculateCoverage(user, idOrCode, {
      versionId,
      status,
      type,
      search,
    });
  }

  @Get(':idOrCode/gaps')
  @RequireFrameworkEntitlement('idOrCode')
  async getGaps(
    @CurrentUser() user: ResourceAuthContext,
    @Param('idOrCode') idOrCode: string,
    @Query('versionId') versionId?: string,
    @Query('status') status?: CoverageStatus,
    @Query('type') type?: string,
    @Query('search') search?: string,
  ): Promise<FrameworkCoverageResultDto> {
    return this.frameworkCoverageService.getGaps(user, idOrCode, {
      versionId,
      status,
      type,
      search,
    });
  }

  @Post('import')
  @Roles(Role.ADMIN, Role.MSSP_ADMIN)
  async importFramework(@Body() dto: CustomFrameworkImportDto): Promise<FrameworkItemDto> {
    return this.frameworksService.importCustomFramework(dto);
  }
}

