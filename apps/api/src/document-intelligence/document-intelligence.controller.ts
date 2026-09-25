import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ResourceAuthorizationGuard } from '../auth/guards/resource-authorization.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ResourceAuthContext } from '../auth/resource-authorization.service';
import { DocumentIntelligenceService } from './document-intelligence.service';
import { CreateAnalysisDto, ReviewFindingDto } from '@omnigrc/shared';

@Controller('api/v1')
@UseGuards(JwtAuthGuard, ResourceAuthorizationGuard)
export class DocumentIntelligenceController {
  constructor(private readonly service: DocumentIntelligenceService) {}

  @Post('evidence/:id/analyze')
  @HttpCode(HttpStatus.ACCEPTED)
  async analyzeEvidence(
    @CurrentUser() user: ResourceAuthContext,
    @Param('id') evidenceId: string,
    @Body() dto: CreateAnalysisDto,
  ) {
    return this.service.createAnalysis(user, evidenceId, dto);
  }

  @Get('evidence/:id/analyses')
  async getEvidenceAnalyses(
    @CurrentUser() user: ResourceAuthContext,
    @Param('id') evidenceId: string,
  ) {
    return this.service.findAllAnalysesForEvidence(user, evidenceId);
  }

  @Get('analyses/:id')
  async getAnalysisById(
    @CurrentUser() user: ResourceAuthContext,
    @Param('id') analysisId: string,
  ) {
    return this.service.findAnalysisById(user, analysisId);
  }

  @Post('analyses/:id/findings/:findingId/review')
  async reviewFinding(
    @CurrentUser() user: ResourceAuthContext,
    @Param('id') analysisId: string,
    @Param('findingId') findingId: string,
    @Body() dto: ReviewFindingDto,
  ) {
    return this.service.reviewFinding(user, analysisId, findingId, dto);
  }

  @Post('analyses/:id/findings/:findingId/convert')
  async convertFinding(
    @CurrentUser() user: ResourceAuthContext,
    @Param('id') analysisId: string,
    @Param('findingId') findingId: string,
    @Body() dto: any,
  ) {
    return this.service.convertFindingToAction(user, analysisId, findingId, dto);
  }

  @Post('analyses/:id/retry')
  async retryAnalysis(
    @CurrentUser() user: ResourceAuthContext,
    @Param('id') analysisId: string,
  ) {
    return this.service.retryAnalysis(user, analysisId);
  }
}

