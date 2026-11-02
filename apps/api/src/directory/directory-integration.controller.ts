import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { DirectoryIntegrationService } from './directory-integration.service';
import {
  SaveDirectoryConfigDto,
  CreateOrUpdateGroupMappingDto,
  TestDirectoryConnectionDto,
  DirectorySyncLogsQueryDto,
} from './dto/directory.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Role } from '@omnigrc/shared';
import { RequiresActiveLicense } from '../common/decorators/requires-active-license.decorator';
import { ResourceAuthContext } from '../auth/resource-authorization.service';

@Controller('directory')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DirectoryIntegrationController {
  constructor(private readonly directoryService: DirectoryIntegrationService) {}

  @Get('config')
  @Roles(Role.ADMIN, Role.ANALYST, Role.MSSP_ADMIN, Role.MSSP_ANALYST)
  async getConfig(@CurrentUser() user: any) {
    const authCtx: ResourceAuthContext = {
      userId: user.userId,
      organizationId: user.organizationId,
      role: user.role,
    };
    return this.directoryService.getConfig(authCtx);
  }

  @Post('config')
  @RequiresActiveLicense()
  @Roles(Role.ADMIN, Role.MSSP_ADMIN)
  async saveConfig(
    @CurrentUser() user: any,
    @Body() dto: SaveDirectoryConfigDto,
  ) {
    const authCtx: ResourceAuthContext = {
      userId: user.userId,
      organizationId: user.organizationId,
      role: user.role,
    };
    return this.directoryService.saveConfig(authCtx, dto);
  }

  @Post('test-connection')
  @RequiresActiveLicense()
  @Roles(Role.ADMIN, Role.MSSP_ADMIN)
  @HttpCode(HttpStatus.OK)
  async testConnection(
    @CurrentUser() user: any,
    @Body() dto: TestDirectoryConnectionDto,
  ) {
    const authCtx: ResourceAuthContext = {
      userId: user.userId,
      organizationId: user.organizationId,
      role: user.role,
    };
    return this.directoryService.testConnection(authCtx, dto);
  }

  @Get('group-mappings')
  @Roles(Role.ADMIN, Role.ANALYST, Role.MSSP_ADMIN, Role.MSSP_ANALYST)
  async getGroupMappings(@CurrentUser() user: any) {
    const authCtx: ResourceAuthContext = {
      userId: user.userId,
      organizationId: user.organizationId,
      role: user.role,
    };
    return this.directoryService.getGroupMappings(authCtx);
  }

  @Post('group-mappings')
  @RequiresActiveLicense()
  @Roles(Role.ADMIN, Role.MSSP_ADMIN)
  async saveGroupMapping(
    @CurrentUser() user: any,
    @Body() dto: CreateOrUpdateGroupMappingDto,
  ) {
    const authCtx: ResourceAuthContext = {
      userId: user.userId,
      organizationId: user.organizationId,
      role: user.role,
    };
    return this.directoryService.saveGroupMapping(authCtx, dto);
  }

  @Delete('group-mappings/:id')
  @RequiresActiveLicense()
  @Roles(Role.ADMIN, Role.MSSP_ADMIN)
  async deleteGroupMapping(
    @CurrentUser() user: any,
    @Param('id') id: string,
  ) {
    const authCtx: ResourceAuthContext = {
      userId: user.userId,
      organizationId: user.organizationId,
      role: user.role,
    };
    return this.directoryService.deleteGroupMapping(authCtx, id);
  }

  @Post('sync')
  @RequiresActiveLicense()
  @Roles(Role.ADMIN, Role.MSSP_ADMIN)
  @HttpCode(HttpStatus.OK)
  async syncNow(@CurrentUser() user: any) {
    const authCtx: ResourceAuthContext = {
      userId: user.userId,
      organizationId: user.organizationId,
      role: user.role,
    };
    return this.directoryService.synchronizeDirectory(authCtx);
  }

  @Get('sync-logs')
  @Roles(Role.ADMIN, Role.ANALYST, Role.EXTERNAL_AUDITOR, Role.MSSP_ADMIN, Role.MSSP_ANALYST)
  async getSyncLogs(
    @CurrentUser() user: any,
    @Query() query: DirectorySyncLogsQueryDto,
  ) {
    const authCtx: ResourceAuthContext = {
      userId: user.userId,
      organizationId: user.organizationId,
      role: user.role,
    };
    return this.directoryService.getSyncLogs(authCtx, query);
  }
}

