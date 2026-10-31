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
  Res,
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
  CreateVendorQuestionnaireDto,
  UpdateVendorQuestionnaireDto,
  SubmitVendorQuestionnaireDto,
  ReviewVendorQuestionnaireSubmissionDto,
  CreateVendorAssessmentActionDto,
  UpdateVendorAssessmentActionDto,
  SubmitVendorAssessmentApprovalDto,
  AssessInherentRiskDto,
  CalculateResidualRiskDto,
  VerifyVendorDocumentDto,
  VendorOffboardingDto,
  VerifyVendorAssessmentActionDto,
  ApproveVendorRelationshipDto,
  LifecycleTransitionDto,
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

  // --- QUESTIONNAIRE DEFINITION ENDPOINTS (Placed before :id to prevent route clash) ---

  @Post('questionnaires')
  @RequiresActiveLicense()
  @RequireCapability('VENDOR_RISK')
  @Roles(Role.ADMIN, Role.ANALYST, Role.MSSP_ADMIN, Role.MSSP_ANALYST)
  async createQuestionnaire(
    @CurrentUser() user: any,
    @Body() dto: CreateVendorQuestionnaireDto,
  ) {
    const authCtx: ResourceAuthContext = {
      userId: user.userId,
      organizationId: user.organizationId,
      role: user.role,
    };
    return this.vendorsService.createQuestionnaire(authCtx, dto);
  }

  @Get('questionnaires')
  async getQuestionnaires(@CurrentUser() user: any) {
    const authCtx: ResourceAuthContext = {
      userId: user.userId,
      organizationId: user.organizationId,
      role: user.role,
    };
    return this.vendorsService.getQuestionnaires(authCtx);
  }

  @Get('questionnaires/:questionnaireId')
  async getQuestionnaireById(
    @CurrentUser() user: any,
    @Param('questionnaireId') questionnaireId: string,
  ) {
    const authCtx: ResourceAuthContext = {
      userId: user.userId,
      organizationId: user.organizationId,
      role: user.role,
    };
    return this.vendorsService.getQuestionnaireById(authCtx, questionnaireId);
  }

  @Patch('questionnaires/:questionnaireId')
  @RequiresActiveLicense()
  @RequireCapability('VENDOR_RISK')
  @Roles(Role.ADMIN, Role.ANALYST, Role.MSSP_ADMIN, Role.MSSP_ANALYST)
  async updateQuestionnaire(
    @CurrentUser() user: any,
    @Param('questionnaireId') questionnaireId: string,
    @Body() dto: UpdateVendorQuestionnaireDto,
  ) {
    const authCtx: ResourceAuthContext = {
      userId: user.userId,
      organizationId: user.organizationId,
      role: user.role,
    };
    return this.vendorsService.updateQuestionnaire(authCtx, questionnaireId, dto);
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

  @Get(':id/documents/:evidenceId/download')
  async downloadDocument(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Param('evidenceId') evidenceId: string,
    @Res() res: any,
  ): Promise<void> {
    const authCtx: ResourceAuthContext = {
      userId: user.userId,
      organizationId: user.organizationId,
      role: user.role,
    };
    await this.vendorsService.downloadDocument(authCtx, id, evidenceId, res);
  }

  // --- QUESTIONNAIRE SUBMISSIONS & RESPONSES ---

  @Post(':id/questionnaires/submit')
  @RequiresActiveLicense()
  @RequireCapability('VENDOR_RISK')
  @Roles(Role.ADMIN, Role.ANALYST, Role.MSSP_ADMIN, Role.MSSP_ANALYST)
  async submitQuestionnaire(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: SubmitVendorQuestionnaireDto,
  ) {
    const authCtx: ResourceAuthContext = {
      userId: user.userId,
      organizationId: user.organizationId,
      role: user.role,
    };
    return this.vendorsService.submitQuestionnaire(authCtx, id, dto);
  }

  @Get(':id/questionnaires/submissions')
  async getQuestionnaireSubmissions(
    @CurrentUser() user: any,
    @Param('id') id: string,
  ) {
    const authCtx: ResourceAuthContext = {
      userId: user.userId,
      organizationId: user.organizationId,
      role: user.role,
    };
    return this.vendorsService.getQuestionnaireSubmissions(authCtx, id);
  }

  @Patch(':id/questionnaires/submissions/:submissionId/review')
  @RequiresActiveLicense()
  @RequireCapability('VENDOR_RISK')
  @Roles(Role.ADMIN, Role.ANALYST, Role.MSSP_ADMIN, Role.MSSP_ANALYST)
  async reviewQuestionnaireSubmission(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Param('submissionId') submissionId: string,
    @Body() dto: ReviewVendorQuestionnaireSubmissionDto,
  ) {
    const authCtx: ResourceAuthContext = {
      userId: user.userId,
      organizationId: user.organizationId,
      role: user.role,
    };
    return this.vendorsService.reviewQuestionnaireSubmission(authCtx, id, submissionId, dto);
  }

  // --- VENDOR ASSESSMENT ACTIONS (REMEDIATION) ---

  @Post(':id/assessments/:assessmentId/actions')
  @RequiresActiveLicense()
  @RequireCapability('VENDOR_RISK')
  @Roles(Role.ADMIN, Role.ANALYST, Role.MSSP_ADMIN, Role.MSSP_ANALYST)
  async createAssessmentAction(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Param('assessmentId') assessmentId: string,
    @Body() dto: CreateVendorAssessmentActionDto,
  ) {
    const authCtx: ResourceAuthContext = {
      userId: user.userId,
      organizationId: user.organizationId,
      role: user.role,
    };
    return this.vendorsService.createAssessmentAction(authCtx, id, assessmentId, dto);
  }

  @Get(':id/assessments/:assessmentId/actions')
  async getAssessmentActions(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Param('assessmentId') assessmentId: string,
  ) {
    const authCtx: ResourceAuthContext = {
      userId: user.userId,
      organizationId: user.organizationId,
      role: user.role,
    };
    return this.vendorsService.getAssessmentActions(authCtx, id, assessmentId);
  }

  @Patch(':id/assessments/:assessmentId/actions/:actionId')
  @RequiresActiveLicense()
  @RequireCapability('VENDOR_RISK')
  @Roles(Role.ADMIN, Role.ANALYST, Role.MSSP_ADMIN, Role.MSSP_ANALYST)
  async updateAssessmentAction(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Param('assessmentId') assessmentId: string,
    @Param('actionId') actionId: string,
    @Body() dto: UpdateVendorAssessmentActionDto,
  ) {
    const authCtx: ResourceAuthContext = {
      userId: user.userId,
      organizationId: user.organizationId,
      role: user.role,
    };
    return this.vendorsService.updateAssessmentAction(authCtx, id, assessmentId, actionId, dto);
  }

  @Delete(':id/assessments/:assessmentId/actions/:actionId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequiresActiveLicense()
  @RequireCapability('VENDOR_RISK')
  @Roles(Role.ADMIN, Role.ANALYST, Role.MSSP_ADMIN, Role.MSSP_ANALYST)
  async deleteAssessmentAction(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Param('assessmentId') assessmentId: string,
    @Param('actionId') actionId: string,
  ) {
    const authCtx: ResourceAuthContext = {
      userId: user.userId,
      organizationId: user.organizationId,
      role: user.role,
    };
    await this.vendorsService.deleteAssessmentAction(authCtx, id, assessmentId, actionId);
  }

  // --- APPROVAL WORKFLOW INTEGRATION ---

  @Post(':id/assessments/:assessmentId/submit-approval')
  @RequiresActiveLicense()
  @RequireCapability('VENDOR_RISK')
  @Roles(Role.ADMIN, Role.ANALYST, Role.MSSP_ADMIN, Role.MSSP_ANALYST)
  async submitAssessmentForApproval(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Param('assessmentId') assessmentId: string,
    @Body() dto: SubmitVendorAssessmentApprovalDto,
  ) {
    const authCtx: ResourceAuthContext = {
      userId: user.userId,
      organizationId: user.organizationId,
      role: user.role,
    };
    return this.vendorsService.submitAssessmentForApproval(authCtx, id, assessmentId, dto);
  }
  // --- TPRM LIFECYCLE CONTROLLER ENDPOINTS ---

  @Post(':id/inherent-risk')
  @RequiresActiveLicense()
  @RequireCapability('VENDOR_RISK')
  @Roles(Role.ADMIN, Role.ANALYST, Role.MSSP_ADMIN, Role.MSSP_ANALYST)
  async assessInherentRisk(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: AssessInherentRiskDto,
  ) {
    const authCtx: ResourceAuthContext = {
      userId: user.userId,
      organizationId: user.organizationId,
      role: user.role,
    };
    return this.vendorsService.assessInherentRisk(authCtx, id, dto);
  }

  @Post(':id/trigger-due-diligence')
  @RequiresActiveLicense()
  @RequireCapability('VENDOR_RISK')
  @Roles(Role.ADMIN, Role.ANALYST, Role.MSSP_ADMIN, Role.MSSP_ANALYST)
  async triggerDueDiligence(
    @CurrentUser() user: any,
    @Param('id') id: string,
  ) {
    const authCtx: ResourceAuthContext = {
      userId: user.userId,
      organizationId: user.organizationId,
      role: user.role,
    };
    return this.vendorsService.triggerDueDiligence(authCtx, id);
  }

  @Patch(':id/documents/:evidenceId/verify')
  @RequiresActiveLicense()
  @RequireCapability('VENDOR_RISK')
  @Roles(Role.ADMIN, Role.ANALYST, Role.MSSP_ADMIN, Role.MSSP_ANALYST)
  async verifyDocument(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Param('evidenceId') evidenceId: string,
    @Body() dto: VerifyVendorDocumentDto,
  ) {
    const authCtx: ResourceAuthContext = {
      userId: user.userId,
      organizationId: user.organizationId,
      role: user.role,
    };
    return this.vendorsService.verifyDocument(authCtx, id, evidenceId, dto);
  }

  @Post(':id/residual-risk')
  @RequiresActiveLicense()
  @RequireCapability('VENDOR_RISK')
  @Roles(Role.ADMIN, Role.ANALYST, Role.MSSP_ADMIN, Role.MSSP_ANALYST)
  async calculateResidualRisk(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: CalculateResidualRiskDto,
  ) {
    const authCtx: ResourceAuthContext = {
      userId: user.userId,
      organizationId: user.organizationId,
      role: user.role,
    };
    return this.vendorsService.calculateResidualRisk(authCtx, id, dto);
  }

  @Patch(':id/assessments/:assessmentId/actions/:actionId/verify')
  @RequiresActiveLicense()
  @RequireCapability('VENDOR_RISK')
  @Roles(Role.ADMIN, Role.ANALYST, Role.MSSP_ADMIN, Role.MSSP_ANALYST)
  async verifyAssessmentAction(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Param('assessmentId') assessmentId: string,
    @Param('actionId') actionId: string,
    @Body() dto: VerifyVendorAssessmentActionDto,
  ) {
    const authCtx: ResourceAuthContext = {
      userId: user.userId,
      organizationId: user.organizationId,
      role: user.role,
    };
    return this.vendorsService.verifyAssessmentAction(authCtx, id, assessmentId, actionId, dto);
  }

  @Post(':id/approve-relationship')
  @RequiresActiveLicense()
  @RequireCapability('VENDOR_RISK')
  @Roles(Role.ADMIN, Role.MSSP_ADMIN)
  async approveRelationship(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: ApproveVendorRelationshipDto,
  ) {
    const authCtx: ResourceAuthContext = {
      userId: user.userId,
      organizationId: user.organizationId,
      role: user.role,
    };
    return this.vendorsService.approveRelationship(authCtx, id, dto);
  }

  @Post(':id/offboard')
  @RequiresActiveLicense()
  @RequireCapability('VENDOR_RISK')
  @Roles(Role.ADMIN, Role.MSSP_ADMIN)
  async offboardVendor(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: VendorOffboardingDto,
  ) {
    const authCtx: ResourceAuthContext = {
      userId: user.userId,
      organizationId: user.organizationId,
      role: user.role,
    };
    return this.vendorsService.offboardVendor(authCtx, id, dto);
  }

  @Post(':id/lifecycle-transition')
  @RequiresActiveLicense()
  @RequireCapability('VENDOR_RISK')
  @Roles(Role.ADMIN, Role.ANALYST, Role.MSSP_ADMIN, Role.MSSP_ANALYST)
  async transitionLifecycle(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: LifecycleTransitionDto,
  ) {
    const authCtx: ResourceAuthContext = {
      userId: user.userId,
      organizationId: user.organizationId,
      role: user.role,
    };
    return this.vendorsService.transitionLifecycle(authCtx, id, dto);
  }

  @Post(':id/trigger-reassessment')
  @RequiresActiveLicense()
  @RequireCapability('VENDOR_RISK')
  @Roles(Role.ADMIN, Role.ANALYST, Role.MSSP_ADMIN, Role.MSSP_ANALYST)
  async triggerReassessment(
    @CurrentUser() user: any,
    @Param('id') id: string,
  ) {
    const authCtx: ResourceAuthContext = {
      userId: user.userId,
      organizationId: user.organizationId,
      role: user.role,
    };
    return this.vendorsService.triggerReassessment(authCtx, id);
  }
}
