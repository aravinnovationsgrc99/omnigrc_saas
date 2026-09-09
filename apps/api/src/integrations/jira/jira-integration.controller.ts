/**
 * JIRA CLOUD INTEGRATION CONTROLLER (SOW Section 14.1 Stub)
 *
 * Uncomment and configure when Jira OAuth 2.0 Client Credentials are deployed.
 *

import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
import { JiraIntegrationService } from './jira-integration.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { Role } from '@omnigrc/shared';

@Controller('integrations/jira')
@UseGuards(JwtAuthGuard, RolesGuard)
export class JiraIntegrationController {
  constructor(private readonly jiraService: JiraIntegrationService) {}

  @Get('status')
  @Roles(Role.ADMIN, Role.ANALYST)
  async getStatus() {
    return { configured: false, phase: 'Phase 8 Stub' };
  }

  @Post('connect')
  @Roles(Role.ADMIN)
  async connectJira(@Body() body: any) {
    // 3-Legged OAuth 2.0 Authorization Code exchange with Atlassian Identity
    return { message: 'Jira integration connector scaffolded.' };
  }
}
*/
