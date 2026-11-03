import {
  Controller,
  Get,
  Post,
  Delete,
  Patch,
  Body,
  Param,
  UseGuards,
  Req,
  Res,
  NotFoundException,
} from '@nestjs/common';
import { Response } from 'express';
import { OrganizationMembersService } from './organization-members.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ResourceAuthorizationGuard } from '../auth/guards/resource-authorization.guard';
import { RequireResourceScope } from '../auth/decorators/require-resource-scope.decorator';
import { UpdateMemberAccessDto, ResourceScopeType } from '@omnigrc/shared';

@Controller('organization-members')
@UseGuards(JwtAuthGuard, ResourceAuthorizationGuard)
export class OrganizationMembersController {
  constructor(private readonly membersService: OrganizationMembersService) {}

  @Get()
  @RequireResourceScope({ action: 'READ', scopeType: ResourceScopeType.ORGANIZATION })
  async findAll(@Req() req: any) {
    return this.membersService.findAll(req.user.organizationId);
  }

  @Get('details')
  @RequireResourceScope({ action: 'READ', scopeType: ResourceScopeType.ORGANIZATION })
  async getDetails(@Req() req: any) {
    return this.membersService.getOrganizationDetails(req.user.organizationId);
  }

  @Patch('details')
  @RequireResourceScope({ action: 'ADMIN', scopeType: ResourceScopeType.ORGANIZATION })
  async updateDetails(@Req() req: any, @Body() dto: any) {
    return this.membersService.updateOrganizationDetails(
      req.user.organizationId,
      req.user.sub || req.user.id || req.user.userId,
      req.user.role,
      dto,
    );
  }

  @Post('logo')
  @RequireResourceScope({ action: 'ADMIN', scopeType: ResourceScopeType.ORGANIZATION })
  async uploadLogo(@Req() req: any, @Body() dto: { data: string; mimeType: string; filename?: string }) {
    return this.membersService.uploadLogo(
      req.user.organizationId,
      req.user.sub || req.user.id || req.user.userId,
      req.user.role,
      dto,
    );
  }

  @Get('logo')
  @RequireResourceScope({ action: 'READ', scopeType: ResourceScopeType.ORGANIZATION })
  async getLogo(@Req() req: any, @Res() res: Response) {
    const logo = await this.membersService.getLogo(req.user.organizationId);
    if (!logo) {
      throw new NotFoundException('No logo configured for this organization');
    }
    res.setHeader('Content-Type', logo.mimeType);
    res.setHeader('Cache-Control', 'private, max-age=3600');
    return res.send(logo.buffer);
  }

  @Delete('logo')
  @RequireResourceScope({ action: 'ADMIN', scopeType: ResourceScopeType.ORGANIZATION })
  async deleteLogo(@Req() req: any) {
    return this.membersService.deleteLogo(
      req.user.organizationId,
      req.user.sub || req.user.id || req.user.userId,
      req.user.role,
    );
  }

  @Get(':id')
  @RequireResourceScope({ action: 'READ', scopeType: ResourceScopeType.ORGANIZATION })
  async findOne(@Req() req: any, @Param('id') id: string) {
    return this.membersService.findOne(req.user.organizationId, id);
  }

  @Patch(':id/access')
  @RequireResourceScope({ action: 'ADMIN', scopeType: ResourceScopeType.ORGANIZATION })
  async updateAccess(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateMemberAccessDto,
  ) {
    return this.membersService.updateMemberAccess(
      req.user.organizationId,
      req.user.sub || req.user.id,
      id,
      dto,
    );
  }
}
