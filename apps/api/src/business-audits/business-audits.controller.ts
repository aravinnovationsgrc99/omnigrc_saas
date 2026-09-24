import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequiresActiveLicense } from '../common/decorators/requires-active-license.decorator';
import { Role, AuditPlanStatus, FindingStatus } from '@omnigrc/shared';
import { ResourceAuthContext } from '../auth/resource-authorization.service';
import { BusinessAuditsService } from './business-audits.service';
import {
  CreateAuditPlanDto,
  UpdateAuditPlanDto,
  CreateAuditScheduleDto,
  CreateAuditAssessmentDto,
  UpdateCheckItemDto,
  CreateAuditFindingDto,
  UpdateAuditFindingDto,
  CreateAuditCapaDto,
  CreateAuditEvidenceDto,
} from './dto/business-audits.dto';

@Controller('business-audits')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.ANALYST, Role.EXTERNAL_AUDITOR, Role.MSSP_ADMIN, Role.MSSP_ANALYST)
export class BusinessAuditsController {
  constructor(private readonly businessAuditsService: BusinessAuditsService) {}

  @Post('plans')
  @RequiresActiveLicense()
  @Roles(Role.ADMIN, Role.ANALYST, Role.MSSP_ADMIN, Role.MSSP_ANALYST)
  @HttpCode(HttpStatus.CREATED)
  async createPlan(
    @CurrentUser() user: any,
    @Body() dto: CreateAuditPlanDto,
  ) {
    const authCtx: ResourceAuthContext = {
      userId: user.userId,
      organizationId: user.organizationId,
      role: user.role,
    };
    return this.businessAuditsService.createPlan(authCtx, dto);
  }

  @Get('plans')
  async findAllPlans(
    @CurrentUser() user: any,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('status') status?: AuditPlanStatus,
    @Query('search') search?: string,
  ) {
    const authCtx: ResourceAuthContext = {
      userId: user.userId,
      organizationId: user.organizationId,
      role: user.role,
    };
    return this.businessAuditsService.findAllPlans(authCtx, { page, limit, status, search });
  }

  @Get('plans/:id')
  async findOnePlan(@CurrentUser() user: any, @Param('id') id: string) {
    const authCtx: ResourceAuthContext = {
      userId: user.userId,
      organizationId: user.organizationId,
      role: user.role,
    };
    return this.businessAuditsService.findOnePlan(authCtx, id);
  }

  @Patch('plans/:id')
  @RequiresActiveLicense()
  @Roles(Role.ADMIN, Role.ANALYST, Role.MSSP_ADMIN, Role.MSSP_ANALYST)
  async updatePlan(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: UpdateAuditPlanDto,
  ) {
    const authCtx: ResourceAuthContext = {
      userId: user.userId,
      organizationId: user.organizationId,
      role: user.role,
    };
    return this.businessAuditsService.updatePlan(authCtx, id, dto);
  }

  @Post('schedules')
  @RequiresActiveLicense()
  @Roles(Role.ADMIN, Role.ANALYST, Role.MSSP_ADMIN, Role.MSSP_ANALYST)
  @HttpCode(HttpStatus.CREATED)
  async createSchedule(
    @CurrentUser() user: any,
    @Body() dto: CreateAuditScheduleDto,
  ) {
    const authCtx: ResourceAuthContext = {
      userId: user.userId,
      organizationId: user.organizationId,
      role: user.role,
    };
    return this.businessAuditsService.createSchedule(authCtx, dto);
  }

  @Post('assessments')
  @RequiresActiveLicense()
  @Roles(Role.ADMIN, Role.ANALYST, Role.MSSP_ADMIN, Role.MSSP_ANALYST)
  @HttpCode(HttpStatus.CREATED)
  async createAssessment(
    @CurrentUser() user: any,
    @Body() dto: CreateAuditAssessmentDto,
  ) {
    const authCtx: ResourceAuthContext = {
      userId: user.userId,
      organizationId: user.organizationId,
      role: user.role,
    };
    return this.businessAuditsService.createAssessment(authCtx, dto);
  }

  @Patch('check-items/:id')
  @RequiresActiveLicense()
  @Roles(Role.ADMIN, Role.ANALYST, Role.MSSP_ADMIN, Role.MSSP_ANALYST)
  async evaluateCheckItem(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: UpdateCheckItemDto,
  ) {
    const authCtx: ResourceAuthContext = {
      userId: user.userId,
      organizationId: user.organizationId,
      role: user.role,
    };
    return this.businessAuditsService.evaluateCheckItem(authCtx, id, dto);
  }

  @Post('findings')
  @RequiresActiveLicense()
  @Roles(Role.ADMIN, Role.ANALYST, Role.MSSP_ADMIN, Role.MSSP_ANALYST)
  @HttpCode(HttpStatus.CREATED)
  async createFinding(
    @CurrentUser() user: any,
    @Body() dto: CreateAuditFindingDto,
  ) {
    const authCtx: ResourceAuthContext = {
      userId: user.userId,
      organizationId: user.organizationId,
      role: user.role,
    };
    return this.businessAuditsService.createFinding(authCtx, dto);
  }

  @Patch('findings/:id')
  @RequiresActiveLicense()
  @Roles(Role.ADMIN, Role.ANALYST, Role.MSSP_ADMIN, Role.MSSP_ANALYST)
  async updateFindingStatus(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: UpdateAuditFindingDto,
  ) {
    const authCtx: ResourceAuthContext = {
      userId: user.userId,
      organizationId: user.organizationId,
      role: user.role,
    };
    return this.businessAuditsService.updateFindingStatus(authCtx, id, dto);
  }

  @Post('findings/:id/verify')
  @Roles(Role.ADMIN, Role.MSSP_ADMIN)
  @RequiresActiveLicense()
  async verifyFinding(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body('status') status: FindingStatus.VERIFIED | FindingStatus.CLOSED,
    @Body('verificationNotes') verificationNotes?: string,
  ) {
    const authCtx: ResourceAuthContext = {
      userId: user.userId,
      organizationId: user.organizationId,
      role: user.role,
    };
    return this.businessAuditsService.verifyFinding(authCtx, id, status, verificationNotes);
  }

  @Post('capas')
  @RequiresActiveLicense()
  @Roles(Role.ADMIN, Role.ANALYST, Role.MSSP_ADMIN, Role.MSSP_ANALYST)
  @HttpCode(HttpStatus.CREATED)
  async createCapa(
    @CurrentUser() user: any,
    @Body() dto: CreateAuditCapaDto,
  ) {
    const authCtx: ResourceAuthContext = {
      userId: user.userId,
      organizationId: user.organizationId,
      role: user.role,
    };
    return this.businessAuditsService.createCapa(authCtx, dto);
  }

  @Post('evidence')
  @RequiresActiveLicense()
  @Roles(Role.ADMIN, Role.ANALYST, Role.MSSP_ADMIN, Role.MSSP_ANALYST)
  @HttpCode(HttpStatus.CREATED)
  async addEvidence(
    @CurrentUser() user: any,
    @Body() dto: CreateAuditEvidenceDto,
  ) {
    const authCtx: ResourceAuthContext = {
      userId: user.userId,
      organizationId: user.organizationId,
      role: user.role,
    };
    return this.businessAuditsService.addEvidence(authCtx, dto);
  }
}
