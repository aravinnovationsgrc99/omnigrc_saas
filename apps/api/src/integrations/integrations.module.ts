import { Module } from '@nestjs/common';
import { SlackIntegrationController } from './slack/slack-integration.controller';
import { JiraIntegrationService } from './jira/jira-integration.service';
import { GoogleWorkspaceIntegrationService } from './google-workspace/google-workspace-integration.service';
import { IntegrationsHubService } from './integrations-hub.service';
import { IntegrationsHubController } from './integrations-hub.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [SlackIntegrationController, IntegrationsHubController],
  providers: [JiraIntegrationService, GoogleWorkspaceIntegrationService, IntegrationsHubService],
  exports: [JiraIntegrationService, GoogleWorkspaceIntegrationService, IntegrationsHubService],
})
export class IntegrationsModule {}
