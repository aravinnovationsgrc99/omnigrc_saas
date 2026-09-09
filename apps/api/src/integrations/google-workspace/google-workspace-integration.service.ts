import { Injectable, Logger } from '@nestjs/common';
import { IntegrationProvider } from '../jira/jira-integration.service';

/**
 * Structured Stub for Google Workspace Integration.
 * Ready for Google Directory API & Drive audit evidence sync implementation.
 */
@Injectable()
export class GoogleWorkspaceIntegrationService implements IntegrationProvider {
  private readonly logger = new Logger(GoogleWorkspaceIntegrationService.name);
  readonly name = 'Google Workspace Integration';

  async isConfigured(organizationId: string): Promise<boolean> {
    this.logger.debug(`Google Workspace integration check for org ${organizationId}: Stub (Not Configured)`);
    return false;
  }

  async testConnection(organizationId: string): Promise<boolean> {
    this.logger.debug(`Google Workspace test connection for org ${organizationId}: Stub (Not Implemented)`);
    return false;
  }
}
