import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Query,
  Body,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  Res,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { EvidenceService } from './evidence.service';
import { RequiresActiveLicense } from '../common/decorators/requires-active-license.decorator';
import { ResourceAuthContext } from '../auth/resource-authorization.service';
import {
  CreateEvidenceUploadDto,
  AttachEvidenceDto,
  EvidenceVaultQueryDto,
  PaginatedEvidenceDto,
  EvidenceDto,
  Role,
} from '@omnigrc/shared';

@Controller('evidence')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.ANALYST, Role.EXTERNAL_AUDITOR, Role.MSSP_ADMIN, Role.MSSP_ANALYST)
export class EvidenceController {
  constructor(private readonly evidenceService: EvidenceService) {}

  @Post('upload')
  @RequiresActiveLicense()
  @Roles(Role.ADMIN, Role.ANALYST, Role.MSSP_ADMIN, Role.MSSP_ANALYST)
  @UseInterceptors(FileInterceptor('file'))
  async uploadEvidence(
    @CurrentUser() user: any,
    @UploadedFile() file: any,
    @Body() dto: CreateEvidenceUploadDto,
  ): Promise<EvidenceDto> {
    const authCtx: ResourceAuthContext = {
      userId: user.userId,
      organizationId: user.organizationId,
      role: user.role,
    };
    return this.evidenceService.createAndUpload(authCtx, file, dto);
  }

  @Get('vault')
  async getVaultItems(
    @CurrentUser() user: any,
    @Query() query: EvidenceVaultQueryDto,
  ): Promise<PaginatedEvidenceDto> {
    const authCtx: ResourceAuthContext = {
      userId: user.userId,
      organizationId: user.organizationId,
      role: user.role,
    };
    return this.evidenceService.findAll(authCtx, query);
  }

  @Get(':id')
  async getEvidence(
    @CurrentUser() user: any,
    @Param('id') id: string,
  ): Promise<EvidenceDto> {
    const authCtx: ResourceAuthContext = {
      userId: user.userId,
      organizationId: user.organizationId,
      role: user.role,
    };
    return this.evidenceService.findOne(authCtx, id);
  }

  @Get(':id/download')
  async downloadEvidence(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Res() res: Response,
  ): Promise<void> {
    const authCtx: ResourceAuthContext = {
      userId: user.userId,
      organizationId: user.organizationId,
      role: user.role,
    };
    await this.evidenceService.downloadEvidence(authCtx, id, res);
  }

  @Post(':id/attach')
  @RequiresActiveLicense()
  @Roles(Role.ADMIN, Role.ANALYST, Role.MSSP_ADMIN, Role.MSSP_ANALYST)
  async attachEvidence(
    @CurrentUser() user: any,
    @Param('id') evidenceId: string,
    @Body() dto: AttachEvidenceDto,
  ): Promise<EvidenceDto> {
    const authCtx: ResourceAuthContext = {
      userId: user.userId,
      organizationId: user.organizationId,
      role: user.role,
    };
    return this.evidenceService.attachEvidence(
      authCtx,
      evidenceId,
      dto.resourceType,
      dto.resourceId,
    );
  }

  @Delete(':id/detach')
  @RequiresActiveLicense()
  @Roles(Role.ADMIN, Role.ANALYST, Role.MSSP_ADMIN, Role.MSSP_ANALYST)
  async detachEvidence(
    @CurrentUser() user: any,
    @Param('id') evidenceId: string,
    @Body() dto: AttachEvidenceDto,
  ): Promise<EvidenceDto> {
    const authCtx: ResourceAuthContext = {
      userId: user.userId,
      organizationId: user.organizationId,
      role: user.role,
    };
    return this.evidenceService.detachEvidence(
      authCtx,
      evidenceId,
      dto.resourceType,
      dto.resourceId,
    );
  }

  @Delete(':id')
  @RequiresActiveLicense()
  @Roles(Role.ADMIN, Role.ANALYST, Role.MSSP_ADMIN, Role.MSSP_ANALYST)
  async archiveEvidence(
    @CurrentUser() user: any,
    @Param('id') id: string,
  ): Promise<EvidenceDto> {
    const authCtx: ResourceAuthContext = {
      userId: user.userId,
      organizationId: user.organizationId,
      role: user.role,
    };
    return this.evidenceService.archiveEvidence(authCtx, id);
  }
}
