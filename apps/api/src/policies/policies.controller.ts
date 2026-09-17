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
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequiresActiveLicense } from '../common/decorators/requires-active-license.decorator';
import { Request } from 'express';

@Controller('policies')
@UseGuards(JwtAuthGuard)
export class PoliciesController {
  constructor(private readonly policiesService: PoliciesService) {}

  @Get()
  async findAll(
    @CurrentUser('organizationId') organizationId: string,
    @Query() query: PolicyQueryDto,
  ) {
    return this.policiesService.findAll(organizationId, query);
  }

  @Get(':id')
  async findOne(
    @CurrentUser('organizationId') organizationId: string,
    @Param('id') id: string,
  ) {
    return this.policiesService.findOne(organizationId, id);
  }

  @Post()
  @RequiresActiveLicense()
  async create(
    @CurrentUser('organizationId') organizationId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: CreatePolicyDto,
  ) {
    return this.policiesService.create(organizationId, userId, dto);
  }

  @Patch(':id')
  @RequiresActiveLicense()
  async updateMetadata(
    @CurrentUser('organizationId') organizationId: string,
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: UpdatePolicyDto,
  ) {
    return this.policiesService.updateMetadata(organizationId, userId, id, dto);
  }

  @Post(':id/versions')
  @RequiresActiveLicense()
  async createVersion(
    @CurrentUser('organizationId') organizationId: string,
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: CreatePolicyVersionDto,
  ) {
    return this.policiesService.createVersion(organizationId, userId, id, dto);
  }

  // --- EXPLICIT LIFECYCLE STATE TRANSITION ENDPOINTS ---

  @Post(':id/submit-for-review')
  @RequiresActiveLicense()
  async submitForReview(
    @CurrentUser('organizationId') organizationId: string,
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
  ) {
    return this.policiesService.submitForReview(organizationId, userId, id);
  }

  @Post(':id/approve')
  @RequiresActiveLicense()
  async approve(
    @CurrentUser('organizationId') organizationId: string,
    @CurrentUser('id') userId: string,
    @CurrentUser('role') userRole: any,
    @Param('id') id: string,
  ) {
    return this.policiesService.approve(organizationId, userId, userRole, id);
  }

  @Post(':id/publish')
  @RequiresActiveLicense()
  async publish(
    @CurrentUser('organizationId') organizationId: string,
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body('versionId') versionId?: string,
  ) {
    return this.policiesService.publish(organizationId, userId, id, versionId);
  }

  @Post(':id/retire')
  @RequiresActiveLicense()
  async retire(
    @CurrentUser('organizationId') organizationId: string,
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
  ) {
    return this.policiesService.retire(organizationId, userId, id);
  }

  @Post('versions/:versionId/attest')
  @RequiresActiveLicense()
  async attestVersion(
    @CurrentUser('organizationId') organizationId: string,
    @CurrentUser('id') userId: string,
    @Param('versionId') versionId: string,
    @Req() req: Request,
  ) {
    const ipAddress = req.ip || (req.headers['x-forwarded-for'] as string);
    return this.policiesService.attestVersion(organizationId, userId, versionId, ipAddress);
  }

  @Post(':id/exceptions')
  @RequiresActiveLicense()
  async createException(
    @CurrentUser('organizationId') organizationId: string,
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: CreatePolicyExceptionDto,
  ) {
    return this.policiesService.createException(organizationId, userId, id, dto);
  }
}
