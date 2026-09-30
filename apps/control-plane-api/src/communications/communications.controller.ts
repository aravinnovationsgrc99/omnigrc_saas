import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Query,
  Body,
  UseGuards,
  Req,
} from '@nestjs/common';
import { OperatorRole } from '@prisma/control-plane-client';
import { OperatorJwtGuard } from '../auth/operator-jwt.guard';
import { OperatorRbacGuard } from '../auth/operator-rbac.guard';
import { RequireOperatorRoles } from '../auth/operator-roles.decorator';
import {
  ControlPlaneCommunicationsService,
  CreateAnnouncementDto,
  UpdateAnnouncementDto,
  QueryAnnouncementsDto,
} from './communications.service';

@Controller('v1/communications')
@UseGuards(OperatorJwtGuard, OperatorRbacGuard)
export class CommunicationsController {
  constructor(
    private readonly communicationsService: ControlPlaneCommunicationsService,
  ) {}

  /**
   * List platform announcements with server-side filtering and bounded pagination.
   * Scoped to authorized Control Plane operator roles.
   */
  @Get()
  @RequireOperatorRoles(
    OperatorRole.PLATFORM_SUPER_ADMIN,
    OperatorRole.COMMERCIAL_OPERATOR,
    OperatorRole.OPERATIONS_ENGINEER,
    OperatorRole.SUPPORT_ENGINEER,
    OperatorRole.SECURITY_AUDIT,
    OperatorRole.READ_ONLY_AUDITOR,
  )
  async findAll(@Query() query: QueryAnnouncementsDto) {
    return this.communicationsService.findAll(query);
  }

  /**
   * View details of a specific platform announcement record by ID.
   */
  @Get(':id')
  @RequireOperatorRoles(
    OperatorRole.PLATFORM_SUPER_ADMIN,
    OperatorRole.COMMERCIAL_OPERATOR,
    OperatorRole.OPERATIONS_ENGINEER,
    OperatorRole.SUPPORT_ENGINEER,
    OperatorRole.SECURITY_AUDIT,
    OperatorRole.READ_ONLY_AUDITOR,
  )
  async findOne(@Param('id') id: string) {
    return this.communicationsService.findOne(id);
  }

  /**
   * Create a new platform announcement in DRAFT or SCHEDULED status.
   */
  @Post()
  @RequireOperatorRoles(
    OperatorRole.PLATFORM_SUPER_ADMIN,
    OperatorRole.COMMERCIAL_OPERATOR,
    OperatorRole.OPERATIONS_ENGINEER,
    OperatorRole.SUPPORT_ENGINEER,
  )
  async create(@Body() dto: CreateAnnouncementDto, @Req() req: any) {
    const operatorId = req.user.sub || req.user.id;
    return this.communicationsService.create(dto, operatorId);
  }

  /**
   * Update an existing draft/scheduled announcement.
   * Enforces immutability for published or finalized records.
   */
  @Patch(':id')
  @RequireOperatorRoles(
    OperatorRole.PLATFORM_SUPER_ADMIN,
    OperatorRole.COMMERCIAL_OPERATOR,
    OperatorRole.OPERATIONS_ENGINEER,
    OperatorRole.SUPPORT_ENGINEER,
  )
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateAnnouncementDto,
    @Req() req: any,
  ) {
    const operatorId = req.user.sub || req.user.id;
    return this.communicationsService.update(id, dto, operatorId);
  }

  /**
   * Publish a draft or scheduled announcement (DRAFT/SCHEDULED -> PUBLISHED).
   */
  @Post(':id/publish')
  @RequireOperatorRoles(
    OperatorRole.PLATFORM_SUPER_ADMIN,
    OperatorRole.COMMERCIAL_OPERATOR,
    OperatorRole.OPERATIONS_ENGINEER,
  )
  async publish(@Param('id') id: string, @Req() req: any) {
    const operatorId = req.user.sub || req.user.id;
    return this.communicationsService.publish(id, operatorId);
  }

  /**
   * Cancel a draft or scheduled announcement (DRAFT/SCHEDULED -> CANCELLED).
   */
  @Post(':id/cancel')
  @RequireOperatorRoles(
    OperatorRole.PLATFORM_SUPER_ADMIN,
    OperatorRole.COMMERCIAL_OPERATOR,
    OperatorRole.OPERATIONS_ENGINEER,
  )
  async cancel(@Param('id') id: string, @Req() req: any) {
    const operatorId = req.user.sub || req.user.id;
    return this.communicationsService.cancel(id, operatorId);
  }
}
