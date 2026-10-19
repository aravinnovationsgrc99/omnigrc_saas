import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
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
import { RequireCapability } from '../common/decorators/require-capability.decorator';
import {
  IncidentDto,
  CreateIncidentDto,
  UpdateIncidentDto,
  IncidentQueryDto,
  PaginatedIncidentsDto,
  IncidentActionDto,
  CreateIncidentActionDto,
  UpdateIncidentActionDto,
} from '@omnigrc/shared';

@Controller('incidents')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.ANALYST, Role.EXTERNAL_AUDITOR, Role.MSSP_ADMIN, Role.MSSP_ANALYST)
@RequireCapability('INCIDENT_MGMT')
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

  @Post(':id/actions')
  @RequiresActiveLicense()
  @Roles(Role.ADMIN, Role.ANALYST, Role.MSSP_ADMIN, Role.MSSP_ANALYST)
  async createAction(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: CreateIncidentActionDto,
  ): Promise<IncidentActionDto> {
    const authCtx: ResourceAuthContext = {
      userId: user.userId,
      organizationId: user.organizationId,
      role: user.role,
    };
    return this.incidentsService.createAction(authCtx, id, dto);
  }

  @Get(':id/actions')
  async getActions(
    @CurrentUser() user: any,
    @Param('id') id: string,
  ): Promise<IncidentActionDto[]> {
    const authCtx: ResourceAuthContext = {
      userId: user.userId,
      organizationId: user.organizationId,
      role: user.role,
    };
    return this.incidentsService.getActions(authCtx, id);
  }

  @Patch(':id/actions/:actionId')
  @RequiresActiveLicense()
  @Roles(Role.ADMIN, Role.ANALYST, Role.MSSP_ADMIN, Role.MSSP_ANALYST)
  async updateAction(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Param('actionId') actionId: string,
    @Body() dto: UpdateIncidentActionDto,
  ): Promise<IncidentActionDto> {
    const authCtx: ResourceAuthContext = {
      userId: user.userId,
      organizationId: user.organizationId,
      role: user.role,
    };
    return this.incidentsService.updateAction(authCtx, id, actionId, dto);
  }

  @Delete(':id/actions/:actionId')
  @RequiresActiveLicense()
  @Roles(Role.ADMIN, Role.ANALYST, Role.MSSP_ADMIN, Role.MSSP_ANALYST)
  async deleteAction(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Param('actionId') actionId: string,
  ): Promise<{ success: boolean }> {
    const authCtx: ResourceAuthContext = {
      userId: user.userId,
      organizationId: user.organizationId,
      role: user.role,
    };
    return this.incidentsService.deleteAction(authCtx, id, actionId);
  }

  @Post(':id/evidence/:evidenceId')
  @RequiresActiveLicense()
  @Roles(Role.ADMIN, Role.ANALYST, Role.MSSP_ADMIN, Role.MSSP_ANALYST)
  async attachEvidence(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Param('evidenceId') evidenceId: string,
  ) {
    const authCtx: ResourceAuthContext = {
      userId: user.userId,
      organizationId: user.organizationId,
      role: user.role,
    };
    return this.incidentsService.attachEvidence(authCtx, id, evidenceId);
  }

  @Delete(':id/evidence/:evidenceId')
  @RequiresActiveLicense()
  @Roles(Role.ADMIN, Role.ANALYST, Role.MSSP_ADMIN, Role.MSSP_ANALYST)
  async detachEvidence(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Param('evidenceId') evidenceId: string,
  ) {
    const authCtx: ResourceAuthContext = {
      userId: user.userId,
      organizationId: user.organizationId,
      role: user.role,
    };
    return this.incidentsService.detachEvidence(authCtx, id, evidenceId);
  }

  @Post(':id/submit-approval')
  @RequiresActiveLicense()
  @Roles(Role.ADMIN, Role.ANALYST, Role.MSSP_ADMIN, Role.MSSP_ANALYST)
  async submitForApproval(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: { purpose: 'INCIDENT_RESOLUTION' | 'INCIDENT_CLOSURE'; workflowId?: string; title?: string; dueDays?: number },
  ) {
    const authCtx: ResourceAuthContext = {
      userId: user.userId,
      organizationId: user.organizationId,
      role: user.role,
    };
    return this.incidentsService.submitForApproval(authCtx, id, dto);
  }
}
