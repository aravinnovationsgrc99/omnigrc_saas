import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { VulnerabilitiesService } from './vulnerabilities.service';
import { CreateVulnerabilityDto, UpdateVulnerabilityDto, VulnerabilityQueryDto } from './dto/vulnerabilities.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequiresActiveLicense } from '../common/decorators/requires-active-license.decorator';

@Controller('vulnerabilities')
@UseGuards(JwtAuthGuard)
export class VulnerabilitiesController {
  constructor(private readonly vulnerabilitiesService: VulnerabilitiesService) {}

  @Get()
  async findAll(
    @CurrentUser('organizationId') organizationId: string,
    @Query() query: VulnerabilityQueryDto,
  ) {
    return this.vulnerabilitiesService.findAll(organizationId, query);
  }

  @Get(':id')
  async findOne(
    @CurrentUser('organizationId') organizationId: string,
    @Param('id') id: string,
  ) {
    return this.vulnerabilitiesService.findOne(organizationId, id);
  }

  @Post()
  @RequiresActiveLicense()
  async create(
    @CurrentUser('organizationId') organizationId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: CreateVulnerabilityDto,
  ) {
    return this.vulnerabilitiesService.create(organizationId, userId, dto);
  }

  @Patch(':id')
  @RequiresActiveLicense()
  async update(
    @CurrentUser('organizationId') organizationId: string,
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: UpdateVulnerabilityDto,
  ) {
    return this.vulnerabilitiesService.update(organizationId, userId, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequiresActiveLicense()
  async remove(
    @CurrentUser('organizationId') organizationId: string,
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
  ) {
    await this.vulnerabilitiesService.softDelete(organizationId, userId, id);
  }
}
