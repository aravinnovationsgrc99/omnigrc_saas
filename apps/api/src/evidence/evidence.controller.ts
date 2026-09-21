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
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { EvidenceService } from './evidence.service';
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
export class EvidenceController {
  constructor(private readonly evidenceService: EvidenceService) {}

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  async uploadEvidence(
    @CurrentUser('organizationId') organizationId: string,
    @CurrentUser('id') userId: string,
    @UploadedFile() file: any,
    @Body() dto: CreateEvidenceUploadDto,
  ): Promise<EvidenceDto> {
    return this.evidenceService.createAndUpload(organizationId, userId, file, dto);
  }

  @Get('vault')
  async getVaultItems(
    @CurrentUser('organizationId') organizationId: string,
    @Query() query: EvidenceVaultQueryDto,
  ): Promise<PaginatedEvidenceDto> {
    return this.evidenceService.findAll(organizationId, query);
  }

  @Get(':id')
  async getEvidence(
    @CurrentUser('organizationId') organizationId: string,
    @Param('id') id: string,
  ): Promise<EvidenceDto> {
    return this.evidenceService.findOne(organizationId, id);
  }

  @Get(':id/download')
  async downloadEvidence(
    @CurrentUser('organizationId') organizationId: string,
    @CurrentUser('id') userId: string,
    @CurrentUser('role') role: Role,
    @Param('id') id: string,
    @Res() res: Response,
  ): Promise<void> {
    await this.evidenceService.downloadEvidence(
      organizationId,
      id,
      { userId, role },
      res,
    );
  }

  @Post(':id/attach')
  async attachEvidence(
    @CurrentUser('organizationId') organizationId: string,
    @CurrentUser('id') userId: string,
    @Param('id') evidenceId: string,
    @Body() dto: AttachEvidenceDto,
  ): Promise<EvidenceDto> {
    return this.evidenceService.attachEvidence(
      organizationId,
      userId,
      evidenceId,
      dto.resourceType,
      dto.resourceId,
    );
  }

  @Delete(':id/detach')
  async detachEvidence(
    @CurrentUser('organizationId') organizationId: string,
    @CurrentUser('id') userId: string,
    @Param('id') evidenceId: string,
    @Body() dto: AttachEvidenceDto,
  ): Promise<EvidenceDto> {
    return this.evidenceService.detachEvidence(
      organizationId,
      userId,
      evidenceId,
      dto.resourceType,
      dto.resourceId,
    );
  }

  @Delete(':id')
  async archiveEvidence(
    @CurrentUser('organizationId') organizationId: string,
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
  ): Promise<EvidenceDto> {
    return this.evidenceService.archiveEvidence(organizationId, userId, id);
  }
}
