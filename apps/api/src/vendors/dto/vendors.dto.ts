import { IsString, IsNotEmpty, IsEnum, IsOptional, IsInt, Min, Max, IsUrl, IsDateString } from 'class-validator';
import { Type } from 'class-transformer';
import { VendorCriticality, VendorStatus, VendorAssessmentStatus } from '@omnigrc/shared';

export class CreateVendorDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  category?: string;

  @IsEnum(VendorCriticality)
  @IsOptional()
  criticality?: VendorCriticality = VendorCriticality.MEDIUM;

  @IsEnum(VendorStatus)
  @IsOptional()
  status?: VendorStatus = VendorStatus.ACTIVE;

  @IsString()
  @IsNotEmpty()
  owner!: string;

  @IsString()
  @IsOptional()
  department?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  reviewCadenceDays?: number = 365;

  @IsUrl()
  @IsOptional()
  websiteUrl?: string;

  @IsString()
  @IsOptional()
  departmentId?: string;

  @IsString()
  @IsOptional()
  projectId?: string;

  @IsString()
  @IsOptional()
  dueDiligenceStatus?: string;

  @IsString()
  @IsOptional()
  businessPurpose?: string;

  @IsString()
  @IsOptional()
  serviceProvided?: string;

  @IsOptional()
  countriesOfOperation?: string[];

  @IsOptional()
  dataHandled?: boolean;

  @IsString()
  @IsOptional()
  dataClassification?: string;

  @IsOptional()
  systemsAccessed?: string[];

  @IsDateString()
  @IsOptional()
  engagementStartDate?: string;

  @IsDateString()
  @IsOptional()
  engagementEndDate?: string;

  @Type(() => Number)
  @IsOptional()
  contractValue?: number;

  @IsDateString()
  @IsOptional()
  contractRenewalDate?: string;

  @IsOptional()
  subcontractors?: string[];

  @IsOptional()
  isDraft?: boolean;
}

export class UpdateVendorDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  category?: string;

  @IsEnum(VendorCriticality)
  @IsOptional()
  criticality?: VendorCriticality;

  @IsEnum(VendorStatus)
  @IsOptional()
  status?: VendorStatus;

  @IsString()
  @IsOptional()
  owner?: string;

  @IsString()
  @IsOptional()
  department?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  reviewCadenceDays?: number;

  @IsUrl()
  @IsOptional()
  websiteUrl?: string;

  @IsString()
  @IsOptional()
  departmentId?: string;

  @IsString()
  @IsOptional()
  projectId?: string;

  @IsString()
  @IsOptional()
  dueDiligenceStatus?: string;

  @IsString()
  @IsOptional()
  businessPurpose?: string;

  @IsString()
  @IsOptional()
  serviceProvided?: string;

  @IsOptional()
  countriesOfOperation?: string[];

  @IsOptional()
  dataHandled?: boolean;

  @IsString()
  @IsOptional()
  dataClassification?: string;

  @IsOptional()
  systemsAccessed?: string[];

  @IsDateString()
  @IsOptional()
  engagementStartDate?: string;

  @IsDateString()
  @IsOptional()
  engagementEndDate?: string;

  @Type(() => Number)
  @IsOptional()
  contractValue?: number;

  @IsDateString()
  @IsOptional()
  contractRenewalDate?: string;

  @IsOptional()
  subcontractors?: string[];
}

export class VendorQueryDto {
  @IsEnum(VendorCriticality)
  @IsOptional()
  criticality?: VendorCriticality;

  @IsEnum(VendorStatus)
  @IsOptional()
  status?: VendorStatus;

  @IsString()
  @IsOptional()
  search?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page?: number = 1;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  limit?: number = 20;
}

export class CreateVendorAssessmentDto {
  @IsString()
  @IsNotEmpty()
  title!: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  @IsOptional()
  score?: number;

  @IsEnum(VendorAssessmentStatus)
  @IsOptional()
  status?: VendorAssessmentStatus = VendorAssessmentStatus.SCHEDULED;

  @IsString()
  @IsNotEmpty()
  evaluatorId!: string;

  @IsString()
  @IsOptional()
  riskId?: string;

  @IsString()
  @IsOptional()
  complianceTaskId?: string;
}

export class UploadVendorDocumentDto {
  @IsString()
  @IsOptional()
  description?: string;
}

export class VendorDocumentQueryDto {
  @IsString()
  @IsOptional()
  search?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page?: number = 1;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  limit?: number = 20;
}

export class CreateVendorQuestionnaireDto {
  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  version?: string = '1.0';

  @IsOptional()
  questions?: any;
}

export class UpdateVendorQuestionnaireDto {
  @IsString()
  @IsOptional()
  title?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  version?: string;

  @IsString()
  @IsOptional()
  status?: string;

  @IsOptional()
  questions?: any;
}

export class SubmitVendorQuestionnaireDto {
  @IsString()
  @IsNotEmpty()
  questionnaireId!: string;

  @IsString()
  @IsOptional()
  assessmentId?: string;

  @IsOptional()
  answers?: any;
}

export class ReviewVendorQuestionnaireSubmissionDto {
  @IsString()
  @IsNotEmpty()
  status!: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  @IsOptional()
  score?: number;

  @IsString()
  @IsOptional()
  reviewNotes?: string;
}

export class CreateVendorAssessmentActionDto {
  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsNotEmpty()
  owner!: string;

  @IsDateString()
  @IsOptional()
  dueDate?: string;

  @IsString()
  @IsOptional()
  status?: string = 'OPEN';
}

export class UpdateVendorAssessmentActionDto {
  @IsString()
  @IsOptional()
  title?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  owner?: string;

  @IsDateString()
  @IsOptional()
  dueDate?: string;

  @IsString()
  @IsOptional()
  status?: string;
}

export class SubmitVendorAssessmentApprovalDto {
  @IsString()
  @IsOptional()
  workflowId?: string;

  @IsString()
  @IsOptional()
  title?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  dueDays?: number = 7;
}

export class InherentRiskFactorsDto {
  @IsString()
  @IsNotEmpty()
  dataSensitivity!: 'PUBLIC' | 'INTERNAL' | 'CONFIDENTIAL' | 'RESTRICTED';

  @IsString()
  @IsNotEmpty()
  dataVolume!: 'NEGLIGIBLE' | 'MODERATE' | 'LARGE' | 'MASSIVE';

  @IsString()
  @IsNotEmpty()
  systemAccess!: 'NONE' | 'BATCH' | 'DIRECT_API' | 'PRIVILEGED_ADMIN';

  @IsString()
  @IsNotEmpty()
  businessCriticality!: 'NON_ESSENTIAL' | 'OPERATIONAL_SUPPORT' | 'SIGNIFICANT' | 'MISSION_CRITICAL';

  @IsString()
  @IsNotEmpty()
  financialExposure!: 'LOW' | 'MEDIUM' | 'HIGH' | 'VERY_HIGH';

  @IsString()
  @IsNotEmpty()
  regulatoryExposure!: 'UNREGULATED' | 'LOW' | 'MODERATE' | 'HIGH';

  @IsString()
  @IsNotEmpty()
  subcontractorReliance!: 'NONE' | 'LOW' | 'MODERATE' | 'HEAVY';

  @IsString()
  @IsOptional()
  serviceAvailabilityDependency?: 'STANDARD' | 'HIGH_AVAILABILITY' | 'REAL_TIME_CRITICAL';

  @IsString()
  @IsOptional()
  businessContinuityImpact?: 'NEGLIGIBLE' | 'MODERATE' | 'SEVERE';

  @IsString()
  @IsOptional()
  notes?: string;
}

export class AssessInherentRiskDto {
  @IsNotEmpty()
  factors!: InherentRiskFactorsDto;

  @IsString()
  @IsOptional()
  overrideTier?: VendorCriticality;

  @IsString()
  @IsOptional()
  overrideRationale?: string;
}

export class CalculateResidualRiskDto {
  @IsString()
  @IsOptional()
  assessmentId?: string;

  @Type(() => Number)
  @IsOptional()
  overrideControlEffectiveness?: number;

  @IsString()
  @IsOptional()
  notes?: string;
}

export class VerifyVendorDocumentDto {
  @IsString()
  @IsNotEmpty()
  verificationStatus!: 'VERIFIED' | 'REJECTED';

  @IsString()
  @IsOptional()
  documentType?: 'SOC2' | 'ISO27001' | 'PEN_TEST' | 'BCP_DR' | 'CYBER_INSURANCE' | 'DPA' | 'OTHER';

  @IsDateString()
  @IsOptional()
  expiryDate?: string;

  @IsString()
  @IsOptional()
  reviewerNotes?: string;

  @IsString()
  @IsOptional()
  rejectionReason?: string;
}

export class VendorOffboardingDto {
  @IsNotEmpty()
  accessRevoked!: boolean;

  @IsNotEmpty()
  dataReturnedOrDestroyed!: boolean;

  @IsNotEmpty()
  contractTerminated!: boolean;

  @IsNotEmpty()
  auditEvidenceArchived!: boolean;

  @IsString()
  @IsOptional()
  notes?: string;
}

export class VerifyVendorAssessmentActionDto {
  @IsNotEmpty()
  verified!: boolean;

  @IsString()
  @IsOptional()
  rejectionReason?: string;

  @IsString()
  @IsOptional()
  verificationNotes?: string;
}

export class ApproveVendorRelationshipDto {
  @IsNotEmpty()
  approved!: boolean;

  @IsString()
  @IsNotEmpty()
  notes!: string;

  @IsString()
  @IsOptional()
  conditionalTerms?: string;
}

export class LifecycleTransitionDto {
  @IsString()
  @IsNotEmpty()
  targetStage!: string;

  @IsString()
  @IsOptional()
  rationale?: string;
}
