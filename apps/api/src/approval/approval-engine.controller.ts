import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Query,
  Body,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { ApprovalEngineService } from './approval-engine.service';
import {
  ApprovalWorkflowDto,
  CreateApprovalWorkflowDto,
  ApprovalInstanceDto,
  CreateApprovalInstanceDto,
  MakeApprovalDecisionDto,
  ApprovalQueryDto,
  PaginatedApprovalsDto,
  Role,
  JwtPayload,
} from '@omnigrc/shared';

@Controller('approvals')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ApprovalEngineController {
  constructor(private readonly approvalService: ApprovalEngineService) {}

  @Get('workflows')
  async getWorkflows(
    @CurrentUser('organizationId') organizationId: string,
  ): Promise<ApprovalWorkflowDto[]> {
    return this.approvalService.findAllWorkflows(organizationId);
  }

  @Post('workflows')
  @Roles(Role.ADMIN)
  async createWorkflow(
    @CurrentUser('organizationId') organizationId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: CreateApprovalWorkflowDto,
  ): Promise<ApprovalWorkflowDto> {
    return this.approvalService.createWorkflow(organizationId, userId, dto);
  }

  @Post()
  async submitApproval(
    @CurrentUser('organizationId') organizationId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: CreateApprovalInstanceDto,
  ): Promise<ApprovalInstanceDto> {
    return this.approvalService.createApprovalInstance(organizationId, userId, dto);
  }

  @Get()
  async getApprovals(
    @CurrentUser('organizationId') organizationId: string,
    @CurrentUser() userPayload: JwtPayload,
    @Query() query: ApprovalQueryDto,
  ): Promise<PaginatedApprovalsDto> {
    const userId = (userPayload as any).id || (userPayload as any).userId || userPayload.sub;
    const userContext = {
      userId,
      role: userPayload.role,
      departmentIds: (userPayload as any).departmentIds || [],
      projectIds: (userPayload as any).projectIds || [],
    };
    return this.approvalService.findAllInstances(organizationId, userContext, query);
  }

  @Get(':id')
  async getApproval(
    @CurrentUser('organizationId') organizationId: string,
    @CurrentUser() userPayload: JwtPayload,
    @Param('id') id: string,
  ): Promise<ApprovalInstanceDto> {
    const userId = (userPayload as any).id || (userPayload as any).userId || userPayload.sub;
    const userContext = {
      userId,
      role: userPayload.role,
      departmentIds: (userPayload as any).departmentIds || [],
      projectIds: (userPayload as any).projectIds || [],
    };
    return this.approvalService.findOneInstance(organizationId, id, userContext);
  }

  @Post(':id/decision')
  async makeDecision(
    @CurrentUser('organizationId') organizationId: string,
    @CurrentUser() userPayload: JwtPayload,
    @Param('id') id: string,
    @Body() dto: MakeApprovalDecisionDto,
  ): Promise<ApprovalInstanceDto> {
    const userId = (userPayload as any).id || (userPayload as any).userId || userPayload.sub;
    const userContext = {
      userId,
      role: userPayload.role,
      departmentIds: (userPayload as any).departmentIds || [],
      projectIds: (userPayload as any).projectIds || [],
    };
    return this.approvalService.makeDecision(organizationId, userId, userContext, id, dto);
  }

  @Post(':id/cancel')
  async cancelApproval(
    @CurrentUser('organizationId') organizationId: string,
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
  ): Promise<ApprovalInstanceDto> {
    return this.approvalService.cancelInstance(organizationId, userId, id);
  }
}
