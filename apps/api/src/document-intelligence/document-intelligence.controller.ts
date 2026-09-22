import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ResourceAuthorizationGuard } from '../auth/guards/resource-authorization.guard';
import { DocumentIntelligenceService } from './document-intelligence.service';
import { CreateAnalysisDto, ReviewFindingDto } from '@omnigrc/shared';

@Controller('api/v1')
@UseGuards(JwtAuthGuard, ResourceAuthorizationGuard)
export class DocumentIntelligenceController {
  constructor(private readonly service: DocumentIntelligenceService) {}

  @Post('evidence/:id/analyze')
  @HttpCode(HttpStatus.ACCEPTED)
  async analyzeEvidence(
    @Req() req: any,
    @Param('id') evidenceId: string,
    @Body() dto: CreateAnalysisDto,
  ) {
    const orgId = req.user.organizationId;
    const userId = req.user.userId;
    return this.service.createAnalysis(orgId, userId, evidenceId, dto);
  }

  @Get('evidence/:id/analyses')
  async getEvidenceAnalyses(
    @Req() req: any,
    @Param('id') evidenceId: string,
  ) {
    const orgId = req.user.organizationId;
    return this.service.findAllAnalysesForEvidence(orgId, evidenceId);
  }

  @Get('analyses/:id')
  async getAnalysisById(
    @Req() req: any,
    @Param('id') analysisId: string,
  ) {
    const orgId = req.user.organizationId;
    return this.service.findAnalysisById(orgId, analysisId);
  }

  @Post('analyses/:id/findings/:findingId/review')
  async reviewFinding(
    @Req() req: any,
    @Param('id') analysisId: string,
    @Param('findingId') findingId: string,
    @Body() dto: ReviewFindingDto,
  ) {
    const orgId = req.user.organizationId;
    const userId = req.user.userId;
    const role = req.user.role;
    return this.service.reviewFinding(orgId, userId, role, analysisId, findingId, dto);
  }

  @Post('analyses/:id/retry')
  async retryAnalysis(
    @Req() req: any,
    @Param('id') analysisId: string,
  ) {
    const orgId = req.user.organizationId;
    const userId = req.user.userId;
    return this.service.retryAnalysis(orgId, userId, analysisId);
  }
}
