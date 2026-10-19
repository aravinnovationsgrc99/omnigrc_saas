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
