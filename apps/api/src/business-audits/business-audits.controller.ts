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
export class BusinessAuditsController {
  constructor(private readonly businessAuditsService: BusinessAuditsService) {}

  @Post('plans')
  @RequiresActiveLicense()
  @HttpCode(HttpStatus.CREATED)
  async createPlan(
    @CurrentUser('organizationId') organizationId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: CreateAuditPlanDto,
  ) {
    return this.businessAuditsService.createPlan(organizationId, userId, dto);
  }

  @Get('plans')
  async findAllPlans(
    @CurrentUser('organizationId') organizationId: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('status') status?: AuditPlanStatus,
    @Query('search') search?: string,
  ) {
    return this.businessAuditsService.findAllPlans(organizationId, { page, limit, status, search });
  }

  @Get('plans/:id')
  async findOnePlan(@CurrentUser('organizationId') organizationId: string, @Param('id') id: string) {
    return this.businessAuditsService.findOnePlan(organizationId, id);
  }

  @Patch('plans/:id')
  @RequiresActiveLicense()
  async updatePlan(
    @CurrentUser('organizationId') organizationId: string,
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: UpdateAuditPlanDto,
  ) {
    return this.businessAuditsService.updatePlan(organizationId, id, userId, dto);
  }

  @Post('schedules')
  @RequiresActiveLicense()
  @HttpCode(HttpStatus.CREATED)
  async createSchedule(
    @CurrentUser('organizationId') organizationId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: CreateAuditScheduleDto,
  ) {
    return this.businessAuditsService.createSchedule(organizationId, userId, dto);
  }

  @Post('assessments')
  @RequiresActiveLicense()
  @HttpCode(HttpStatus.CREATED)
  async createAssessment(
    @CurrentUser('organizationId') organizationId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: CreateAuditAssessmentDto,
  ) {
    return this.businessAuditsService.createAssessment(organizationId, userId, dto);
  }

  @Patch('check-items/:id')
  @RequiresActiveLicense()
  async evaluateCheckItem(
    @CurrentUser('organizationId') organizationId: string,
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: UpdateCheckItemDto,
  ) {
    return this.businessAuditsService.evaluateCheckItem(organizationId, id, userId, dto);
  }

  @Post('findings')
  @RequiresActiveLicense()
  @HttpCode(HttpStatus.CREATED)
  async createFinding(
    @CurrentUser('organizationId') organizationId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: CreateAuditFindingDto,
  ) {
    return this.businessAuditsService.createFinding(organizationId, userId, dto);
  }

  @Patch('findings/:id')
  @RequiresActiveLicense()
  async updateFindingStatus(
    @CurrentUser('organizationId') organizationId: string,
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: UpdateAuditFindingDto,
  ) {
    return this.businessAuditsService.updateFindingStatus(organizationId, id, userId, dto);
  }

  @Post('findings/:id/verify')
  @Roles(Role.ADMIN)
  @RequiresActiveLicense()
  async verifyFinding(
    @CurrentUser('organizationId') organizationId: string,
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body('status') status: FindingStatus.VERIFIED | FindingStatus.CLOSED,
    @Body('verificationNotes') verificationNotes?: string,
  ) {
    return this.businessAuditsService.verifyFinding(organizationId, id, userId, status, verificationNotes);
  }

  @Post('capas')
  @RequiresActiveLicense()
  @HttpCode(HttpStatus.CREATED)
  async createCapa(
    @CurrentUser('organizationId') organizationId: string,
    @Body() dto: CreateAuditCapaDto,
  ) {
    return this.businessAuditsService.createCapa(organizationId, dto);
  }

  @Post('evidence')
  @RequiresActiveLicense()
  @HttpCode(HttpStatus.CREATED)
  async addEvidence(
    @CurrentUser('organizationId') organizationId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: CreateAuditEvidenceDto,
  ) {
    return this.businessAuditsService.addEvidence(organizationId, userId, dto);
  }
}
