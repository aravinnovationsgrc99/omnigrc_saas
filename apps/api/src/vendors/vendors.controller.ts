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
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { VendorsService } from './vendors.service';
import {
  CreateVendorDto,
  UpdateVendorDto,
  VendorQueryDto,
  CreateVendorAssessmentDto,
  UploadVendorDocumentDto,
  VendorDocumentQueryDto,
} from './dto/vendors.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Role, VendorDocumentDto, PaginatedVendorDocumentsDto } from '@omnigrc/shared';
import { RequiresActiveLicense } from '../common/decorators/requires-active-license.decorator';
import { ResourceAuthContext } from '../auth/resource-authorization.service';
import { RequireCapability } from '../common/decorators/require-capability.decorator';

@Controller('vendors')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.ANALYST, Role.EXTERNAL_AUDITOR, Role.MSSP_ADMIN, Role.MSSP_ANALYST)
export class VendorsController {
  constructor(private readonly vendorsService: VendorsService) {}

  @Get()
  async findAll(
    @CurrentUser() user: any,
    @Query() query: VendorQueryDto,
  ) {
    const authCtx: ResourceAuthContext = {
      userId: user.userId,
      organizationId: user.organizationId,
      role: user.role,
    };
    return this.vendorsService.findAll(authCtx, query);
  }

  @Get(':id')
  async findOne(
    @CurrentUser() user: any,
    @Param('id') id: string,
  ) {
    const authCtx: ResourceAuthContext = {
      userId: user.userId,
      organizationId: user.organizationId,
      role: user.role,
    };
    return this.vendorsService.findOne(authCtx, id);
  }

  @Post()
  @RequiresActiveLicense()
  @RequireCapability('VENDOR_RISK')
  @Roles(Role.ADMIN, Role.ANALYST, Role.MSSP_ADMIN, Role.MSSP_ANALYST)
  async create(
    @CurrentUser() user: any,
    @Body() dto: CreateVendorDto,
  ) {
    const authCtx: ResourceAuthContext = {
      userId: user.userId,
      organizationId: user.organizationId,
      role: user.role,
    };
    return this.vendorsService.create(authCtx, dto);
  }

  @Patch(':id')
  @RequiresActiveLicense()
  @RequireCapability('VENDOR_RISK')
  @Roles(Role.ADMIN, Role.ANALYST, Role.MSSP_ADMIN, Role.MSSP_ANALYST)
  async update(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: UpdateVendorDto,
  ) {
    const authCtx: ResourceAuthContext = {
      userId: user.userId,
      organizationId: user.organizationId,
      role: user.role,
    };
    return this.vendorsService.update(authCtx, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequiresActiveLicense()
  @RequireCapability('VENDOR_RISK')
  @Roles(Role.ADMIN, Role.ANALYST, Role.MSSP_ADMIN, Role.MSSP_ANALYST)
  async remove(
    @CurrentUser() user: any,
    @Param('id') id: string,
  ) {
    const authCtx: ResourceAuthContext = {
      userId: user.userId,
      organizationId: user.organizationId,
      role: user.role,
    };
    await this.vendorsService.softDelete(authCtx, id);
  }

  @Post(':id/assessments')
  @RequiresActiveLicense()
  @RequireCapability('VENDOR_RISK')
  @Roles(Role.ADMIN, Role.ANALYST, Role.MSSP_ADMIN, Role.MSSP_ANALYST)
  async createAssessment(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: CreateVendorAssessmentDto,
  ) {
    const authCtx: ResourceAuthContext = {
      userId: user.userId,
      organizationId: user.organizationId,
      role: user.role,
    };
    return this.vendorsService.createAssessment(authCtx, id, dto);
  }

  @Post('migrate-asset-vendors')
  @RequiresActiveLicense()
  @RequireCapability('VENDOR_RISK')
  @Roles(Role.ADMIN, Role.MSSP_ADMIN)
  async migrateAssetVendors(
    @CurrentUser() user: any,
  ) {
    const authCtx: ResourceAuthContext = {
      userId: user.userId,
      organizationId: user.organizationId,
      role: user.role,
    };
    return this.vendorsService.migrateAssetVendors(authCtx);
  }

  @Get(':id/documents')
  async getDocuments(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Query() query: VendorDocumentQueryDto,
  ): Promise<PaginatedVendorDocumentsDto> {
    const authCtx: ResourceAuthContext = {
      userId: user.userId,
      organizationId: user.organizationId,
      role: user.role,
    };
    return this.vendorsService.getDocuments(authCtx, id, query);
  }

  @Post(':id/documents')
  @RequiresActiveLicense()
  @RequireCapability('VENDOR_RISK')
  @Roles(Role.ADMIN, Role.ANALYST, Role.MSSP_ADMIN, Role.MSSP_ANALYST)
  @UseInterceptors(FileInterceptor('file'))
  async uploadDocument(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @UploadedFile() file: any,
    @Body() dto: UploadVendorDocumentDto,
  ): Promise<VendorDocumentDto> {
    const authCtx: ResourceAuthContext = {
      userId: user.userId,
      organizationId: user.organizationId,
      role: user.role,
    };
    return this.vendorsService.uploadDocument(authCtx, id, file, dto);
  }

  @Delete(':id/documents/:evidenceId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequiresActiveLicense()
  @RequireCapability('VENDOR_RISK')
  @Roles(Role.ADMIN, Role.ANALYST, Role.MSSP_ADMIN, Role.MSSP_ANALYST)
  async removeDocument(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Param('evidenceId') evidenceId: string,
  ): Promise<void> {
    const authCtx: ResourceAuthContext = {
      userId: user.userId,
      organizationId: user.organizationId,
      role: user.role,
    };
    await this.vendorsService.removeDocument(authCtx, id, evidenceId);
  }
}
