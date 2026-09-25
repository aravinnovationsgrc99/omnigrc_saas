import {
  Controller,
  Get,
  Patch,
  Body,
  Param,
  UseGuards,
  Req,
} from '@nestjs/common';
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
