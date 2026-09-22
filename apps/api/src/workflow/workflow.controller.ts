import {
  Controller,
  Get,
  Param,
  UseGuards,
  Req,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ResourceAuthorizationGuard } from '../auth/guards/resource-authorization.guard';
import { WorkflowService } from './workflow.service';

@Controller('api/v1/workflow')
@UseGuards(JwtAuthGuard, ResourceAuthorizationGuard)
export class WorkflowController {
  constructor(private readonly workflowService: WorkflowService) {}

  @Get('lifecycle/:resourceType/:resourceId')
  async getLifecycle(
    @Req() req: any,
    @Param('resourceType') resourceType: string,
    @Param('resourceId') resourceId: string,
  ) {
    const orgId = req.user.organizationId;
    return this.workflowService.getLifecycle(orgId, resourceType, resourceId);
  }

  @Get('attention')
  async getAttentionSummary(@Req() req: any) {
    const orgId = req.user.organizationId;
    const userId = req.user.userId;
    const role = req.user.role;
    return this.workflowService.getAttentionSummary(orgId, userId, role);
  }
}
