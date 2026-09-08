import { Controller, Get, UseGuards } from '@nestjs/common';
import { RegionalPodsService } from './regional-pods.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Controller('regional-pods')
@UseGuards(JwtAuthGuard)
export class RegionalPodsController {
  constructor(private readonly regionalPodsService: RegionalPodsService) {}

  @Get()
  async getRegionalPods(@CurrentUser('organizationId') organizationId: string) {
    return this.regionalPodsService.getPodsForOrganization(organizationId);
  }
}
