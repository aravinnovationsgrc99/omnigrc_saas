import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { EvidenceVaultService } from './evidence-vault.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { EvidenceVaultQueryDto, PaginatedEvidenceVaultDto } from '@omnigrc/shared';

@Controller('evidence')
@UseGuards(JwtAuthGuard, RolesGuard)
export class EvidenceVaultController {
  constructor(private readonly evidenceVaultService: EvidenceVaultService) {}

  @Get('vault')
  async getVaultItems(
    @CurrentUser('organizationId') organizationId: string,
    @Query() query: EvidenceVaultQueryDto,
  ): Promise<PaginatedEvidenceVaultDto> {
    return this.evidenceVaultService.findAll(organizationId, query);
  }
}
