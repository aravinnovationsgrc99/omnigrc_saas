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

  private extractAuthCtx(user: any): ResourceAuthContext {
    return {
      userId: user?.userId || user?.id || user?.sub,
      organizationId: user?.organizationId,
      role: user?.role,
    };
  }

  @Get('config')
  @Roles(Role.ADMIN, Role.ANALYST, Role.MSSP_ADMIN, Role.MSSP_ANALYST)
  async getConfig(@CurrentUser() user: any) {
    const authCtx = this.extractAuthCtx(user);
    if (!authCtx.organizationId) {
      return null;
    }
    return this.directoryService.getConfig(authCtx);
  }

  @Post('config')
  @RequiresActiveLicense()
  @Roles(Role.ADMIN, Role.MSSP_ADMIN)
  async saveConfig(
    @CurrentUser() user: any,
    @Body() dto: SaveDirectoryConfigDto,
  ) {
    const authCtx = this.extractAuthCtx(user);
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
    const authCtx = this.extractAuthCtx(user);
    return this.directoryService.testConnection(authCtx, dto);
  }

  @Get('group-mappings')
  @Roles(Role.ADMIN, Role.ANALYST, Role.MSSP_ADMIN, Role.MSSP_ANALYST)
  async getGroupMappings(@CurrentUser() user: any) {
    const authCtx = this.extractAuthCtx(user);
    return this.directoryService.getGroupMappings(authCtx);
  }

  @Post('group-mappings')
  @RequiresActiveLicense()
  @Roles(Role.ADMIN, Role.MSSP_ADMIN)
  async saveGroupMapping(
    @CurrentUser() user: any,
    @Body() dto: CreateOrUpdateGroupMappingDto,
  ) {
    const authCtx = this.extractAuthCtx(user);
    return this.directoryService.saveGroupMapping(authCtx, dto);
  }

  @Delete('group-mappings/:id')
  @RequiresActiveLicense()
  @Roles(Role.ADMIN, Role.MSSP_ADMIN)
  async deleteGroupMapping(
    @CurrentUser() user: any,
    @Param('id') id: string,
  ) {
    const authCtx = this.extractAuthCtx(user);
    return this.directoryService.deleteGroupMapping(authCtx, id);
  }

  @Post('sync')
  @RequiresActiveLicense()
  @Roles(Role.ADMIN, Role.MSSP_ADMIN)
  @HttpCode(HttpStatus.OK)
  async syncNow(@CurrentUser() user: any) {
    const authCtx = this.extractAuthCtx(user);
    return this.directoryService.synchronizeDirectory(authCtx);
  }

  @Get('sync-logs')
  @Roles(Role.ADMIN, Role.ANALYST, Role.EXTERNAL_AUDITOR, Role.MSSP_ADMIN, Role.MSSP_ANALYST)
  async getSyncLogs(
    @CurrentUser() user: any,
    @Query() query: DirectorySyncLogsQueryDto,
  ) {
    const authCtx = this.extractAuthCtx(user);
    return this.directoryService.getSyncLogs(authCtx, query);
  }
}

