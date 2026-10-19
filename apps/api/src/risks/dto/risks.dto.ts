import { IsString, IsNotEmpty, IsEnum, IsOptional, IsInt, Min, Max, IsDateString } from 'class-validator';
import { Type } from 'class-transformer';
import { RiskStatus, RiskScoreBand, ApprovalPurpose } from '@omnigrc/shared';

export class CreateRiskDto {
  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  category?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  likelihood!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  impact!: number;

  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  residualLikelihood?: number;

  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  residualImpact?: number;

  @IsEnum(RiskStatus)
  @IsOptional()
  status?: RiskStatus;

  @IsString()
  @IsNotEmpty()
  owner!: string;

  @IsString()
  @IsOptional()
  assetId?: string;

  @IsString()
  @IsOptional()
  departmentId?: string;

  @IsString()
  @IsOptional()
  projectId?: string;

  @IsString()
  @IsOptional()
  frameworkId?: string;

  @IsString()
  @IsOptional()
  frameworkReferenceId?: string;

  @IsString()
  @IsOptional()
  treatmentPlan?: string;

  @IsString()
  @IsOptional()
  treatmentStrategy?: string;

  @IsString()
  @IsOptional()
  treatmentOwner?: string;

  @IsDateString()
  @IsOptional()
  treatmentDueDate?: string;

  @IsString()
  @IsOptional()
  treatmentStatus?: string;
}

export class UpdateRiskDto {
  @IsString()
  @IsOptional()
  title?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  category?: string;

  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  likelihood?: number;

  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  impact?: number;

  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  residualLikelihood?: number;

  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  residualImpact?: number;

  @IsEnum(RiskStatus)
  @IsOptional()
  status?: RiskStatus;

  @IsString()
  @IsOptional()
  owner?: string;

  @IsString()
  @IsOptional()
  assetId?: string;

  @IsString()
  @IsOptional()
  departmentId?: string;

  @IsString()
  @IsOptional()
  projectId?: string;

  @IsString()
  @IsOptional()
  frameworkId?: string;

  @IsString()
  @IsOptional()
  frameworkReferenceId?: string;

  @IsString()
  @IsOptional()
  treatmentPlan?: string;

  @IsString()
  @IsOptional()
  treatmentStrategy?: string;

  @IsString()
  @IsOptional()
  treatmentOwner?: string;

  @IsDateString()
  @IsOptional()
  treatmentDueDate?: string;

  @IsString()
  @IsOptional()
  treatmentStatus?: string;
}

export class RiskQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @IsString()
  @IsOptional()
  search?: string;

  @IsString()
  @IsOptional()
  category?: string;

  @IsEnum(RiskStatus)
  @IsOptional()
  status?: RiskStatus;

  @IsEnum(RiskScoreBand)
  @IsOptional()
  scoreBand?: RiskScoreBand;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  likelihood?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  impact?: number;

  @IsString()
  @IsOptional()
  assetId?: string;

  @IsString()
  @IsOptional()
  frameworkId?: string;

  @IsString()
  @IsOptional()
  frameworkReferenceId?: string;
}

export class SubmitRiskApprovalDto {
  @IsEnum(ApprovalPurpose)
  purpose!: ApprovalPurpose;

  @IsString()
  @IsOptional()
  workflowId?: string;

  @IsString()
  @IsOptional()
  title?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(90)
  @IsOptional()
  dueDays?: number = 14;
}
