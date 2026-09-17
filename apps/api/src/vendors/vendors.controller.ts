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
import { VendorsService } from './vendors.service';
import { CreateVendorDto, UpdateVendorDto, VendorQueryDto, CreateVendorAssessmentDto } from './dto/vendors.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequiresActiveLicense } from '../common/decorators/requires-active-license.decorator';

@Controller('vendors')
@UseGuards(JwtAuthGuard)
export class VendorsController {
  constructor(private readonly vendorsService: VendorsService) {}

  @Get()
  async findAll(
    @CurrentUser('organizationId') organizationId: string,
    @Query() query: VendorQueryDto,
  ) {
    return this.vendorsService.findAll(organizationId, query);
  }

  @Get(':id')
  async findOne(
    @CurrentUser('organizationId') organizationId: string,
    @Param('id') id: string,
  ) {
    return this.vendorsService.findOne(organizationId, id);
  }

  @Post()
  @RequiresActiveLicense()
  async create(
    @CurrentUser('organizationId') organizationId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: CreateVendorDto,
  ) {
    return this.vendorsService.create(organizationId, userId, dto);
  }

  @Patch(':id')
  @RequiresActiveLicense()
  async update(
    @CurrentUser('organizationId') organizationId: string,
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: UpdateVendorDto,
  ) {
    return this.vendorsService.update(organizationId, userId, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequiresActiveLicense()
  async remove(
    @CurrentUser('organizationId') organizationId: string,
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
  ) {
    await this.vendorsService.softDelete(organizationId, userId, id);
  }

  @Post(':id/assessments')
  @RequiresActiveLicense()
  async createAssessment(
    @CurrentUser('organizationId') organizationId: string,
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: CreateVendorAssessmentDto,
  ) {
    return this.vendorsService.createAssessment(organizationId, userId, id, dto);
  }

  @Post('migrate-asset-vendors')
  @RequiresActiveLicense()
  async migrateAssetVendors(
    @CurrentUser('organizationId') organizationId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.vendorsService.migrateAssetVendors(organizationId, userId);
  }
}
