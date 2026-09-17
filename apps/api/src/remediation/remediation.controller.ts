import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { RemediationService } from './remediation.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RemediationQueryDto, PaginatedRemediationActionsDto } from '@omnigrc/shared';

@Controller('remediation')
@UseGuards(JwtAuthGuard, RolesGuard)
export class RemediationController {
  constructor(private readonly remediationService: RemediationService) {}

  @Get('actions')
  async getActions(
    @CurrentUser('organizationId') organizationId: string,
    @Query() query: RemediationQueryDto,
  ): Promise<PaginatedRemediationActionsDto> {
    return this.remediationService.findAll(organizationId, query);
  }
}
