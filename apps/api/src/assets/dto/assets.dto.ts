import { IsString, IsNotEmpty, IsEnum, IsOptional, IsInt, Min, Max, IsBoolean, IsDateString } from 'class-validator';
import { Type } from 'class-transformer';
import { AssetType, AssetCriticality, AssetEnvironment } from '@omnigrc/shared';

export class CreateAssetDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsEnum(AssetType)
  type!: AssetType;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsNotEmpty()
  owner!: string;

  @IsEnum(AssetCriticality)
  criticality!: AssetCriticality;

  @IsString()
  @IsOptional()
  vendorName?: string;

  @IsString()
  @IsOptional()
  dataResidencyRegion?: string;

  @IsString()
  @IsOptional()
  department?: string;

  @IsEnum(AssetEnvironment)
  @IsOptional()
  environment?: AssetEnvironment;

  @IsBoolean()
  @IsOptional()
  isManaged?: boolean;

  @IsDateString()
  @IsOptional()
  lastScannedAt?: string;

  @IsDateString()
  @IsOptional()
  maintenanceDueDate?: string;

  @IsString()
  @IsOptional()
  vendorId?: string;

  @IsString()
  @IsOptional()
  departmentId?: string;

  @IsString()
  @IsOptional()
  projectId?: string;
}

export class UpdateAssetDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsEnum(AssetType)
  @IsOptional()
  type?: AssetType;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  owner?: string;

  @IsEnum(AssetCriticality)
  @IsOptional()
  criticality?: AssetCriticality;

  @IsString()
  @IsOptional()
  vendorName?: string;

  @IsString()
  @IsOptional()
  dataResidencyRegion?: string;

  @IsString()
  @IsOptional()
  department?: string;

  @IsEnum(AssetEnvironment)
  @IsOptional()
  environment?: AssetEnvironment;

  @IsBoolean()
  @IsOptional()
  isManaged?: boolean;

  @IsDateString()
  @IsOptional()
  lastScannedAt?: string;

  @IsDateString()
  @IsOptional()
  maintenanceDueDate?: string;

  @IsString()
  @IsOptional()
  vendorId?: string;

  @IsString()
  @IsOptional()
  departmentId?: string;

  @IsString()
  @IsOptional()
  projectId?: string;
}

export class AssetQueryDto {
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

  @IsEnum(AssetType)
  @IsOptional()
  type?: AssetType;

  @IsEnum(AssetCriticality)
  @IsOptional()
  criticality?: AssetCriticality;
}
