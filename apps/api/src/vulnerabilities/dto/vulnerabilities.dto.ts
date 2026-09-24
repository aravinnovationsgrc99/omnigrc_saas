import { IsString, IsNotEmpty, IsEnum, IsOptional, IsInt, Min, Max, IsArray, IsDateString } from 'class-validator';
import { Type } from 'class-transformer';
import { VulnerabilitySeverity, VulnerabilityStatus } from '@omnigrc/shared';

export class CreateVulnerabilityDto {
  @IsString()
  @IsOptional()
  cveId?: string;

  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsEnum(VulnerabilitySeverity)
  severity!: VulnerabilitySeverity;

  @IsEnum(VulnerabilityStatus)
  @IsOptional()
  status?: VulnerabilityStatus = VulnerabilityStatus.OPEN;

  @IsArray()
  @IsString({ each: true })
  @IsNotEmpty()
  assetIds!: string[];

  @IsString()
  @IsNotEmpty()
  remediationOwner!: string;

  @IsDateString()
  @IsOptional()
  dueDate?: string;

  @IsString()
  @IsOptional()
  remediationNotes?: string;

  @IsString()
  @IsOptional()
  departmentId?: string;

  @IsString()
  @IsOptional()
  projectId?: string;
}

export class UpdateVulnerabilityDto {
  @IsString()
  @IsOptional()
  cveId?: string;

  @IsString()
  @IsOptional()
  title?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsEnum(VulnerabilitySeverity)
  @IsOptional()
  severity?: VulnerabilitySeverity;

  @IsEnum(VulnerabilityStatus)
  @IsOptional()
  status?: VulnerabilityStatus;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  assetIds?: string[];

  @IsString()
  @IsOptional()
  remediationOwner?: string;

  @IsDateString()
  @IsOptional()
  dueDate?: string;

  @IsString()
  @IsOptional()
  remediationNotes?: string;

  @IsString()
  @IsOptional()
  departmentId?: string;

  @IsString()
  @IsOptional()
  projectId?: string;
}

export class VulnerabilityQueryDto {
  @IsEnum(VulnerabilitySeverity)
  @IsOptional()
  severity?: VulnerabilitySeverity;

  @IsEnum(VulnerabilityStatus)
  @IsOptional()
  status?: VulnerabilityStatus;

  @IsString()
  @IsOptional()
  assetId?: string;

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
