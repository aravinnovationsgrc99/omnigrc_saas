import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { PolicyControlsService } from './policy-controls.service';
import {
  AssociatePolicyControlDto,
  UpdatePolicyControlDto,
  PolicyControlQueryDto,
  DisassociatePolicyControlDto,
} from './dto/policy-controls.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Role } from '@omnigrc/shared';
import { RequiresActiveLicense } from '../common/decorators/requires-active-license.decorator';
import { ResourceAuthContext } from '../auth/resource-authorization.service';
import { RequireCapability } from '../common/decorators/require-capability.decorator';

@Controller('policy-controls')
@UseGuards(JwtAuthGuard, RolesGuard)
@RequireCapability('POLICIES_MODULE')
export class PolicyControlsController {
  constructor(private readonly policyControlsService: PolicyControlsService) {}

  @Get('policies/:policyId/controls')
  @Roles(Role.ADMIN, Role.ANALYST, Role.EXTERNAL_AUDITOR, Role.MSSP_ADMIN, Role.MSSP_ANALYST)
  async getControlsForPolicy(
    @CurrentUser() user: any,
    @Param('policyId') policyId: string,
    @Query() query: PolicyControlQueryDto,
  ) {
    const authCtx: ResourceAuthContext = {
      userId: user.userId,
      organizationId: user.organizationId,
      role: user.role,
    };
    return this.policyControlsService.getControlsForPolicy(authCtx, policyId, query);
  }

  @Get('controls/:controlId/policies')
  @Roles(Role.ADMIN, Role.ANALYST, Role.EXTERNAL_AUDITOR, Role.MSSP_ADMIN, Role.MSSP_ANALYST)
  async getPoliciesForControl(
    @CurrentUser() user: any,
    @Param('controlId') controlId: string,
    @Query() query: PolicyControlQueryDto,
  ) {
    const authCtx: ResourceAuthContext = {
      userId: user.userId,
      organizationId: user.organizationId,
      role: user.role,
    };
    return this.policyControlsService.getPoliciesForControl(authCtx, controlId, query);
  }

  @Post('policies/:policyId/controls/:controlId')
  @RequiresActiveLicense()
  @Roles(Role.ADMIN, Role.ANALYST, Role.MSSP_ADMIN, Role.MSSP_ANALYST)
  async associate(
    @CurrentUser() user: any,
    @Param('policyId') policyId: string,
    @Param('controlId') controlId: string,
    @Body() dto: AssociatePolicyControlDto,
  ) {
    const authCtx: ResourceAuthContext = {
      userId: user.userId,
      organizationId: user.organizationId,
      role: user.role,
    };
    return this.policyControlsService.associate(authCtx, policyId, controlId, dto);
  }

  @Patch('policies/:policyId/controls/:controlId')
  @RequiresActiveLicense()
  @Roles(Role.ADMIN, Role.ANALYST, Role.MSSP_ADMIN, Role.MSSP_ANALYST)
  async updateMapping(
    @CurrentUser() user: any,
    @Param('policyId') policyId: string,
    @Param('controlId') controlId: string,
    @Body() dto: UpdatePolicyControlDto,
  ) {
    const authCtx: ResourceAuthContext = {
      userId: user.userId,
      organizationId: user.organizationId,
      role: user.role,
    };
    return this.policyControlsService.updateMapping(authCtx, policyId, controlId, dto);
  }

  @Delete('policies/:policyId/controls/:controlId')
  @RequiresActiveLicense()
  @Roles(Role.ADMIN, Role.ANALYST, Role.MSSP_ADMIN, Role.MSSP_ANALYST)
  async disassociate(
    @CurrentUser() user: any,
    @Param('policyId') policyId: string,
    @Param('controlId') controlId: string,
    @Query() query: DisassociatePolicyControlDto,
    @Body() body?: DisassociatePolicyControlDto,
  ) {
    const authCtx: ResourceAuthContext = {
      userId: user.userId,
      organizationId: user.organizationId,
      role: user.role,
    };
    const rawVersion =
      query?.expectedVersion !== undefined && query?.expectedVersion !== null
        ? query.expectedVersion
        : body?.expectedVersion !== undefined && body?.expectedVersion !== null
          ? body.expectedVersion
          : undefined;

    const expectedVersion =
      rawVersion !== undefined && rawVersion !== null && rawVersion !== ('' as any)
        ? Number(rawVersion)
        : undefined;

    if (
      expectedVersion === undefined ||
      expectedVersion === null ||
      isNaN(expectedVersion) ||
      expectedVersion < 1
    ) {
      throw new BadRequestException('expectedVersion is mandatory and must be a positive integer');
    }

    return this.policyControlsService.disassociate(authCtx, policyId, controlId, expectedVersion);
  }
}

