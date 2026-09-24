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
  Req,
} from '@nestjs/common';
import { PoliciesService } from './policies.service';
import {
  CreatePolicyDto,
  UpdatePolicyDto,
  CreatePolicyVersionDto,
  CreatePolicyExceptionDto,
  PolicyQueryDto,
} from './dto/policies.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Role } from '@omnigrc/shared';
import { RequiresActiveLicense } from '../common/decorators/requires-active-license.decorator';
import { ResourceAuthContext } from '../auth/resource-authorization.service';
import { Request } from 'express';

@Controller('policies')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.ANALYST, Role.EXTERNAL_AUDITOR, Role.MSSP_ADMIN, Role.MSSP_ANALYST)
export class PoliciesController {
  constructor(private readonly policiesService: PoliciesService) {}

  @Get()
  async findAll(
    @CurrentUser() user: any,
    @Query() query: PolicyQueryDto,
  ) {
    const authCtx: ResourceAuthContext = {
      userId: user.userId,
      organizationId: user.organizationId,
      role: user.role,
    };
    return this.policiesService.findAll(authCtx, query);
  }

  @Get(':id')
  async findOne(
    @CurrentUser() user: any,
    @Param('id') id: string,
  ) {
    const authCtx: ResourceAuthContext = {
      userId: user.userId,
      organizationId: user.organizationId,
      role: user.role,
    };
    return this.policiesService.findOne(authCtx, id);
  }

  @Post()
  @RequiresActiveLicense()
  @Roles(Role.ADMIN, Role.ANALYST, Role.MSSP_ADMIN, Role.MSSP_ANALYST)
  async create(
    @CurrentUser() user: any,
    @Body() dto: CreatePolicyDto,
  ) {
    const authCtx: ResourceAuthContext = {
      userId: user.userId,
      organizationId: user.organizationId,
      role: user.role,
    };
    return this.policiesService.create(authCtx, dto);
  }

  @Patch(':id')
  @RequiresActiveLicense()
  @Roles(Role.ADMIN, Role.ANALYST, Role.MSSP_ADMIN, Role.MSSP_ANALYST)
  async updateMetadata(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: UpdatePolicyDto,
  ) {
    const authCtx: ResourceAuthContext = {
      userId: user.userId,
      organizationId: user.organizationId,
      role: user.role,
    };
    return this.policiesService.updateMetadata(authCtx, id, dto);
  }

  @Post(':id/versions')
  @RequiresActiveLicense()
  @Roles(Role.ADMIN, Role.ANALYST, Role.MSSP_ADMIN, Role.MSSP_ANALYST)
  async createVersion(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: CreatePolicyVersionDto,
  ) {
    const authCtx: ResourceAuthContext = {
      userId: user.userId,
      organizationId: user.organizationId,
      role: user.role,
    };
    return this.policiesService.createVersion(authCtx, id, dto);
  }

  // --- EXPLICIT LIFECYCLE STATE TRANSITION ENDPOINTS ---

  @Post(':id/submit-for-review')
  @RequiresActiveLicense()
  @Roles(Role.ADMIN, Role.ANALYST, Role.MSSP_ADMIN, Role.MSSP_ANALYST)
  async submitForReview(
    @CurrentUser() user: any,
    @Param('id') id: string,
  ) {
    const authCtx: ResourceAuthContext = {
      userId: user.userId,
      organizationId: user.organizationId,
      role: user.role,
    };
    return this.policiesService.submitForReview(authCtx, id);
  }

  @Post(':id/approve')
  @RequiresActiveLicense()
  @Roles(Role.ADMIN, Role.MSSP_ADMIN)
  async approve(
    @CurrentUser() user: any,
    @Param('id') id: string,
  ) {
    const authCtx: ResourceAuthContext = {
      userId: user.userId,
      organizationId: user.organizationId,
      role: user.role,
    };
    return this.policiesService.approve(authCtx, id);
  }

  @Post(':id/publish')
  @RequiresActiveLicense()
  @Roles(Role.ADMIN, Role.ANALYST, Role.MSSP_ADMIN, Role.MSSP_ANALYST)
  async publish(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body('versionId') versionId?: string,
  ) {
    const authCtx: ResourceAuthContext = {
      userId: user.userId,
      organizationId: user.organizationId,
      role: user.role,
    };
    return this.policiesService.publish(authCtx, id, versionId);
  }

  @Post(':id/retire')
  @RequiresActiveLicense()
  @Roles(Role.ADMIN, Role.MSSP_ADMIN)
  async retire(
    @CurrentUser() user: any,
    @Param('id') id: string,
  ) {
    const authCtx: ResourceAuthContext = {
      userId: user.userId,
      organizationId: user.organizationId,
      role: user.role,
    };
    return this.policiesService.retire(authCtx, id);
  }

  @Post('versions/:versionId/attest')
  @RequiresActiveLicense()
  @Roles(Role.ADMIN, Role.ANALYST, Role.MSSP_ADMIN, Role.MSSP_ANALYST)
  async attestVersion(
    @CurrentUser() user: any,
    @Param('versionId') versionId: string,
    @Req() req: Request,
  ) {
    const authCtx: ResourceAuthContext = {
      userId: user.userId,
      organizationId: user.organizationId,
      role: user.role,
    };
    const ipAddress = req.ip || (req.headers['x-forwarded-for'] as string);
    return this.policiesService.attestVersion(authCtx, versionId, ipAddress);
  }

  @Post(':id/exceptions')
  @RequiresActiveLicense()
  @Roles(Role.ADMIN, Role.ANALYST, Role.MSSP_ADMIN, Role.MSSP_ANALYST)
  async createException(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: CreatePolicyExceptionDto,
  ) {
    const authCtx: ResourceAuthContext = {
      userId: user.userId,
      organizationId: user.organizationId,
      role: user.role,
    };
    return this.policiesService.createException(authCtx, id, dto);
  }
}
