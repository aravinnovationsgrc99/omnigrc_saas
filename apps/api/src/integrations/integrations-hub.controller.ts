import { Controller, Get, UseGuards } from '@nestjs/common';
import { IntegrationsHubService } from './integrations-hub.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { IntegrationConnectorDto } from '@omnigrc/shared';

@Controller('integrations')
@UseGuards(JwtAuthGuard, RolesGuard)
export class IntegrationsHubController {
  constructor(private readonly integrationsHubService: IntegrationsHubService) {}

  @Get('connectors')
  async getConnectors(
    @CurrentUser('organizationId') organizationId: string,
  ): Promise<IntegrationConnectorDto[]> {
    return this.integrationsHubService.getConnectors(organizationId);
  }
}
