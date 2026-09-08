import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { AssetsService } from './assets.service';
import { CreateAssetDto, UpdateAssetDto, AssetQueryDto } from './dto/assets.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Role } from '@omnigrc/shared';

@Controller('assets')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.ANALYST)
export class AssetsController {
  constructor(private readonly assetsService: AssetsService) {}

  @Get()
  async findAll(
    @CurrentUser('organizationId') organizationId: string,
    @Query() query: AssetQueryDto,
  ) {
    return this.assetsService.findAll(organizationId, query);
  }

  @Get('count')
  async count(@CurrentUser('organizationId') organizationId: string) {
    return this.assetsService.count(organizationId);
  }

  @Get(':id')
  async findOne(
    @CurrentUser('organizationId') organizationId: string,
    @Param('id') id: string,
  ) {
    return this.assetsService.findOne(organizationId, id);
  }

  @Get(':id/audit-log')
  async getAuditLogs(
    @CurrentUser('organizationId') organizationId: string,
    @Param('id') id: string,
  ) {
    return this.assetsService.getAuditLogs(organizationId, id);
  }

  @Post()
  async create(
    @CurrentUser('organizationId') organizationId: string,
    @CurrentUser('userId') userId: string,
    @Body() dto: CreateAssetDto,
  ) {
    return this.assetsService.create(organizationId, userId, dto);
  }

  @Patch(':id')
  async update(
    @CurrentUser('organizationId') organizationId: string,
    @CurrentUser('userId') userId: string,
    @Param('id') id: string,
    @Body() dto: UpdateAssetDto,
  ) {
    return this.assetsService.update(organizationId, userId, id, dto);
  }

  @Delete(':id')
  async softDelete(
    @CurrentUser('organizationId') organizationId: string,
    @CurrentUser('userId') userId: string,
    @Param('id') id: string,
  ) {
    return this.assetsService.softDelete(organizationId, userId, id);
  }
}
