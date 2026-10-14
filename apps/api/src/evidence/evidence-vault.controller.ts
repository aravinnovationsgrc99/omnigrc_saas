import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { EvidenceVaultService } from './evidence-vault.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { EvidenceVaultQueryDto, PaginatedEvidenceVaultDto, Role } from '@omnigrc/shared';

@Controller('evidence')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.ANALYST, Role.EXTERNAL_AUDITOR, Role.MSSP_ADMIN, Role.MSSP_ANALYST)
export class EvidenceVaultController {
  constructor(private readonly evidenceVaultService: EvidenceVaultService) {}

  @Get('vault')
  @Roles(Role.ADMIN, Role.ANALYST, Role.EXTERNAL_AUDITOR, Role.MSSP_ADMIN, Role.MSSP_ANALYST)
  async getVaultItems(
    @CurrentUser('organizationId') organizationId: string,
    @Query() query: EvidenceVaultQueryDto,
  ): Promise<PaginatedEvidenceVaultDto> {
    return this.evidenceVaultService.findAll(organizationId, query);
  }
}
