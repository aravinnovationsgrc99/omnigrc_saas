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
import { ControlPlaneAdminGuard } from '../auth/control-plane-admin.guard';
import { CreateEntitlementDto } from '@omnigrc/shared';

@Controller('v1')
@UseGuards(ControlPlaneAdminGuard)
export class EntitlementsController {
  constructor(private readonly entitlementsService: EntitlementsService) {}

  @Post('entitlements')
  @HttpCode(HttpStatus.CREATED)
  async createEntitlement(@Body() dto: CreateEntitlementDto) {
    return this.entitlementsService.createEntitlement(dto);
  }

  @Get('entitlements/:id')
  async findOne(@Param('id') id: string) {
    return this.entitlementsService.findOne(id);
  }

  @Get('licenses/:id/entitlements')
  async findByLicense(@Param('id') licenseId: string) {
    return this.entitlementsService.findByLicense(licenseId);
  }
}
