import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { IncidentsService } from './incidents.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Role } from '@omnigrc/shared';
import { RequiresActiveLicense } from '../common/decorators/requires-active-license.decorator';
import { ResourceAuthContext } from '../auth/resource-authorization.service';
import {
  IncidentDto,
  CreateIncidentDto,
  UpdateIncidentDto,
  IncidentQueryDto,
  PaginatedIncidentsDto,
} from '@omnigrc/shared';

@Controller('incidents')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.ANALYST, Role.EXTERNAL_AUDITOR, Role.MSSP_ADMIN, Role.MSSP_ANALYST)
export class IncidentsController {
  constructor(private readonly incidentsService: IncidentsService) {}

  @Get()
  async getIncidents(
    @CurrentUser() user: any,
    @Query() query: IncidentQueryDto,
  ): Promise<PaginatedIncidentsDto> {
    const authCtx: ResourceAuthContext = {
      userId: user.userId,
      organizationId: user.organizationId,
      role: user.role,
    };
    return this.incidentsService.findAll(authCtx, query);
  }

  @Get(':id')
  async getIncident(
    @CurrentUser() user: any,
    @Param('id') id: string,
  ): Promise<IncidentDto> {
    const authCtx: ResourceAuthContext = {
      userId: user.userId,
      organizationId: user.organizationId,
      role: user.role,
    };
    return this.incidentsService.findOne(authCtx, id);
  }

  @Post()
  @RequiresActiveLicense()
  @Roles(Role.ADMIN, Role.ANALYST, Role.MSSP_ADMIN, Role.MSSP_ANALYST)
  async createIncident(
    @CurrentUser() user: any,
    @Body() dto: CreateIncidentDto,
  ): Promise<IncidentDto> {
    const authCtx: ResourceAuthContext = {
      userId: user.userId,
      organizationId: user.organizationId,
      role: user.role,
    };
    return this.incidentsService.create(authCtx, dto);
  }

  @Patch(':id')
  @RequiresActiveLicense()
  @Roles(Role.ADMIN, Role.ANALYST, Role.MSSP_ADMIN, Role.MSSP_ANALYST)
  async updateIncident(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: UpdateIncidentDto,
  ): Promise<IncidentDto> {
    const authCtx: ResourceAuthContext = {
      userId: user.userId,
      organizationId: user.organizationId,
      role: user.role,
    };
    return this.incidentsService.update(authCtx, id, dto);
  }
}
