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
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import {
  IncidentDto,
  CreateIncidentDto,
  UpdateIncidentDto,
  IncidentQueryDto,
  PaginatedIncidentsDto,
} from '@omnigrc/shared';

@Controller('incidents')
@UseGuards(JwtAuthGuard, RolesGuard)
export class IncidentsController {
  constructor(private readonly incidentsService: IncidentsService) {}

  @Get()
  async getIncidents(
    @CurrentUser('organizationId') organizationId: string,
    @Query() query: IncidentQueryDto,
  ): Promise<PaginatedIncidentsDto> {
    return this.incidentsService.findAll(organizationId, query);
  }

  @Get(':id')
  async getIncident(
    @CurrentUser('organizationId') organizationId: string,
    @Param('id') id: string,
  ): Promise<IncidentDto> {
    return this.incidentsService.findOne(organizationId, id);
  }

  @Post()
  async createIncident(
    @CurrentUser('organizationId') organizationId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: CreateIncidentDto,
  ): Promise<IncidentDto> {
    return this.incidentsService.create(organizationId, userId, dto);
  }

  @Patch(':id')
  async updateIncident(
    @CurrentUser('organizationId') organizationId: string,
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: UpdateIncidentDto,
  ): Promise<IncidentDto> {
    return this.incidentsService.update(organizationId, userId, id, dto);
  }
}
