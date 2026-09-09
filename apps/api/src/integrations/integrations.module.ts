import { Module } from '@nestjs/common';
import { SlackIntegrationController } from './slack/slack-integration.controller';
import { JiraIntegrationService } from './jira/jira-integration.service';
import { GoogleWorkspaceIntegrationService } from './google-workspace/google-workspace-integration.service';

@Module({
  controllers: [SlackIntegrationController],
  providers: [JiraIntegrationService, GoogleWorkspaceIntegrationService],
  exports: [JiraIntegrationService, GoogleWorkspaceIntegrationService],
})
export class IntegrationsModule {}
