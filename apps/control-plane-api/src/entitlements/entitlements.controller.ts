import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { EntitlementsService } from './entitlements.service';
import { OperatorJwtGuard } from '../auth/operator-jwt.guard';
import { OperatorRbacGuard } from '../auth/operator-rbac.guard';
import { RequireOperatorRoles } from '../auth/operator-roles.decorator';
import { CreateEntitlementDto } from '@omnigrc/shared';
import { OperatorRole } from '@prisma/control-plane-client';

@Controller('v1')
@UseGuards(OperatorJwtGuard, OperatorRbacGuard)
export class EntitlementsController {
  constructor(private readonly entitlementsService: EntitlementsService) {}

  @Post('entitlements')
  @RequireOperatorRoles(OperatorRole.COMMERCIAL_OPERATOR, OperatorRole.PLATFORM_SUPER_ADMIN)
  @HttpCode(HttpStatus.CREATED)
  async createEntitlement(@Body() dto: CreateEntitlementDto) {
    return this.entitlementsService.createEntitlement(dto);
  }

  @Get('entitlements/:id')
  @RequireOperatorRoles(
    OperatorRole.COMMERCIAL_OPERATOR,
    OperatorRole.SUPPORT_ENGINEER,
    OperatorRole.SECURITY_AUDIT,
    OperatorRole.READ_ONLY_AUDITOR,
    OperatorRole.PLATFORM_SUPER_ADMIN,
  )
  async findOne(@Param('id') id: string) {
    return this.entitlementsService.findOne(id);
  }

  @Get('licenses/:id/entitlements')
  @RequireOperatorRoles(
    OperatorRole.COMMERCIAL_OPERATOR,
    OperatorRole.SUPPORT_ENGINEER,
    OperatorRole.SECURITY_AUDIT,
    OperatorRole.READ_ONLY_AUDITOR,
    OperatorRole.PLATFORM_SUPER_ADMIN,
  )
  async findByLicense(@Param('id') licenseId: string) {
    return this.entitlementsService.findByLicense(licenseId);
  }
}
