import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  UseGuards,
  Req,
  Ip,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { OperatorJwtGuard } from '../auth/operator-jwt.guard';
import { OperatorRbacGuard } from '../auth/operator-rbac.guard';
import { RequireOperatorRoles } from '../auth/operator-roles.decorator';
import { OperatorRole } from '@prisma/control-plane-client';
import { BreakGlassService } from './break-glass.service';
import {
  RequestBreakGlassDto,
  ApproveBreakGlassDto,
  ExecuteBreakGlassDto,
  ReviewBreakGlassDto,
} from './dto/break-glass.dto';

@Controller('v1/operations/break-glass')
@UseGuards(OperatorJwtGuard, OperatorRbacGuard)
export class BreakGlassController {
  constructor(private readonly breakGlassService: BreakGlassService) {}

  /**
   * Request a new Break-Glass session (or initiate single-operator emergency mode).
   */
  @Post('request')
  @RequireOperatorRoles(OperatorRole.PLATFORM_SUPER_ADMIN, OperatorRole.OPERATIONS_ENGINEER)
  @HttpCode(HttpStatus.CREATED)
  async requestSession(
    @Req() req: any,
    @Body() dto: RequestBreakGlassDto,
    @Ip() ipAddress: string,
  ) {
    const operatorId = req.operator.sub;
    const userAgent = req.headers['user-agent'];
    return this.breakGlassService.requestSession(operatorId, dto, ipAddress, userAgent);
  }

  /**
   * Approve a requested Break-Glass session (Enforces Separation of Duties).
   */
  @Post(':id/approve')
  @RequireOperatorRoles(OperatorRole.PLATFORM_SUPER_ADMIN, OperatorRole.OPERATIONS_ENGINEER)
  @HttpCode(HttpStatus.OK)
  async approveSession(
    @Param('id') id: string,
    @Req() req: any,
    @Body() dto: ApproveBreakGlassDto,
    @Ip() ipAddress: string,
  ) {
    const operatorId = req.operator.sub;
    return this.breakGlassService.approveSession(id, operatorId, dto, ipAddress);
  }

  /**
   * Execute an approved Break-Glass operation.
   */
  @Post(':id/execute')
  @RequireOperatorRoles(OperatorRole.PLATFORM_SUPER_ADMIN, OperatorRole.OPERATIONS_ENGINEER)
  @HttpCode(HttpStatus.OK)
  async executeAction(
    @Param('id') id: string,
    @Req() req: any,
    @Body() dto: ExecuteBreakGlassDto,
    @Ip() ipAddress: string,
  ) {
    const operatorId = req.operator.sub;
    return this.breakGlassService.executeAction(id, operatorId, dto, ipAddress);
  }

  /**
   * Revoke an active or pending Break-Glass session.
   */
  @Post(':id/revoke')
  @RequireOperatorRoles(OperatorRole.PLATFORM_SUPER_ADMIN, OperatorRole.OPERATIONS_ENGINEER)
  @HttpCode(HttpStatus.OK)
  async revokeSession(
    @Param('id') id: string,
    @Req() req: any,
    @Body() body: { reason?: string },
  ) {
    const operatorId = req.operator.sub;
    return this.breakGlassService.revokeSession(id, operatorId, body?.reason);
  }

  /**
   * Perform mandatory post-event review for single-operator emergency actions.
   */
  @Post(':id/review')
  @RequireOperatorRoles(OperatorRole.PLATFORM_SUPER_ADMIN, OperatorRole.SECURITY_AUDIT)
  @HttpCode(HttpStatus.OK)
  async reviewEmergencySession(
    @Param('id') id: string,
    @Req() req: any,
    @Body() dto: ReviewBreakGlassDto,
  ) {
    const operatorId = req.operator.sub;
    return this.breakGlassService.reviewEmergencySession(id, operatorId, dto);
  }

  /**
   * List Break-Glass sessions (Read-Only access permitted for all operator roles).
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
  async findAll(
    @Query('status') status?: string,
    @Query('operation') operation?: string,
    @Query('targetOrganizationId') targetOrganizationId?: string,
    @Query('isSingleOperatorEmergency') isSingleOperatorEmergency?: string,
  ) {
    return this.breakGlassService.findAll({
      status,
      operation,
      targetOrganizationId,
      isSingleOperatorEmergency:
        isSingleOperatorEmergency !== undefined ? isSingleOperatorEmergency === 'true' : undefined,
    });
  }

  /**
   * View details of a specific Break-Glass session.
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
    return this.breakGlassService.findOne(id);
  }
}
