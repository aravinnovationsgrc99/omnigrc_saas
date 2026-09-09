/**
 * GOOGLE WORKSPACE INTEGRATION CONTROLLER (Stub)
 *
 * Uncomment and configure when Google OAuth 2.0 Client Credentials are deployed.
 *

import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
import { GoogleWorkspaceIntegrationService } from './google-workspace-integration.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { Role } from '@omnigrc/shared';

@Controller('integrations/google-workspace')
@UseGuards(JwtAuthGuard, RolesGuard)
export class GoogleWorkspaceIntegrationController {
  constructor(private readonly googleService: GoogleWorkspaceIntegrationService) {}

  @Get('status')
  @Roles(Role.ADMIN, Role.ANALYST)
  async getStatus() {
    return { configured: false, phase: 'Phase 8 Stub' };
  }

  @Post('connect')
  @Roles(Role.ADMIN)
  async connectGoogle(@Body() body: any) {
    return { message: 'Google Workspace connector scaffolded.' };
  }
}
*/
