import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { OperatorRole } from '@prisma/control-plane-client';
import { OperatorJwtGuard } from '../auth/operator-jwt.guard';
import { OperatorRbacGuard } from '../auth/operator-rbac.guard';
import { RequireOperatorRoles } from '../auth/operator-roles.decorator';
import { OrganizationControlService } from './organization-control.service';
import { OrganizationTransitionDto } from './dto/organization-transition.dto';

@Controller('v1/organizations')
@UseGuards(OperatorJwtGuard, OperatorRbacGuard)
export class OrganizationControlController {
  constructor(private readonly organizationControlService: OrganizationControlService) {}

  @Get()
  @RequireOperatorRoles(
    OperatorRole.PLATFORM_SUPER_ADMIN,
    OperatorRole.OPERATIONS_ENGINEER,
    OperatorRole.COMMERCIAL_OPERATOR,
    OperatorRole.SUPPORT_ENGINEER,
    OperatorRole.SECURITY_AUDIT,
    OperatorRole.READ_ONLY_AUDITOR,
  )
  async listOrganizations() {
    return this.organizationControlService.listControlStates();
  }

  @Get(':id')
  @RequireOperatorRoles(
    OperatorRole.PLATFORM_SUPER_ADMIN,
    OperatorRole.OPERATIONS_ENGINEER,
    OperatorRole.COMMERCIAL_OPERATOR,
    OperatorRole.SUPPORT_ENGINEER,
    OperatorRole.SECURITY_AUDIT,
    OperatorRole.READ_ONLY_AUDITOR,
  )
  async getOrganization(@Param('id') id: string) {
    return this.organizationControlService.getControlState(id);
  }

  @Get(':id/control-state')
  @RequireOperatorRoles(
    OperatorRole.PLATFORM_SUPER_ADMIN,
    OperatorRole.OPERATIONS_ENGINEER,
    OperatorRole.COMMERCIAL_OPERATOR,
    OperatorRole.SUPPORT_ENGINEER,
    OperatorRole.SECURITY_AUDIT,
    OperatorRole.READ_ONLY_AUDITOR,
  )
  async getControlState(@Param('id') id: string) {
    return this.organizationControlService.getControlState(id);
  }

  @Post(':id/control-state/transition')
  @HttpCode(HttpStatus.OK)
  @RequireOperatorRoles(OperatorRole.PLATFORM_SUPER_ADMIN, OperatorRole.OPERATIONS_ENGINEER)
  async transitionControlState(
    @Param('id') organizationId: string,
    @Body() dto: OrganizationTransitionDto,
    @Req() req: any,
  ) {
    const operator = req.operator || req.user;
    const ipAddress = req.ip || req.connection?.remoteAddress;
    const correlationId = req.headers['x-correlation-id'] || req.headers['x-request-id'];

    return this.organizationControlService.transitionState(
      organizationId,
      dto,
      operator,
      ipAddress,
      correlationId,
    );
  }
}
