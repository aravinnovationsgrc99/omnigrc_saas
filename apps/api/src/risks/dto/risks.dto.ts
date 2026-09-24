import { IsString, IsNotEmpty, IsEnum, IsOptional, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { RiskStatus, RiskScoreBand } from '@omnigrc/shared';

export class CreateRiskDto {
  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsString()
  @IsOptional()
  description?: string;

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
  treatmentPlan?: string;
}

export class UpdateRiskDto {
  @IsString()
  @IsOptional()
  title?: string;

  @IsString()
  @IsOptional()
  description?: string;

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
  treatmentPlan?: string;
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
}
