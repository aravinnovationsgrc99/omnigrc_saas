import {
  IsString,
  IsOptional,
  IsBoolean,
  IsEnum,
  IsInt,
  Min,
  Max,
  IsNotEmpty,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  RegulatoryHealthStatus,
  RegulatoryConnectorStatus,
  RegulatoryVerificationStatus,
  RegulatoryInstrumentType,
  ManualIntakeReviewStatus,
} from '@prisma/client';

export class QuerySourcesDto {
  @IsOptional()
  @IsString()
  regulatorCode?: string;

  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  isEnabled?: boolean;

  @IsOptional()
  @IsEnum(RegulatoryHealthStatus)
  healthStatus?: RegulatoryHealthStatus;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  page?: number = 1;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  limit?: number = 20;
}

export class QueryPublicationsDto {
  @IsOptional()
  @IsString()
  sourceId?: string;

  @IsOptional()
  @IsString()
  catalogueEntryId?: string;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  startDate?: string;

  @IsOptional()
  @IsString()
  endDate?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  page?: number = 1;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  limit?: number = 20;
}

export class QueryCatalogueDto {
  @IsOptional()
  @IsString()
  jurisdiction?: string;

  @IsOptional()
  @IsEnum(RegulatoryConnectorStatus)
  connectorStatus?: RegulatoryConnectorStatus;

  @IsOptional()
  @IsEnum(RegulatoryVerificationStatus)
  verificationStatus?: RegulatoryVerificationStatus;

  @IsOptional()
  @IsEnum(RegulatoryInstrumentType)
  instrumentType?: RegulatoryInstrumentType;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  page?: number = 1;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  limit?: number = 20;
}

export class ToggleSourceDto {
  @IsBoolean()
  isEnabled: boolean;
}

export class CreateManualIntakeDto {
  @IsNotEmpty()
  @IsString()
  catalogueEntryId: string;

  @IsNotEmpty()
  @IsString()
  title: string;

  @IsOptional()
  @IsString()
  instrumentIdentifier?: string;

  @IsOptional()
  @IsString()
  sourceUrl?: string;

  @IsNotEmpty()
  @IsString()
  fileName: string;

  @IsNotEmpty()
  @IsString()
  fileContentBase64: string;

  @IsOptional()
  @IsString()
  mimeType?: string;

  @IsOptional()
  @IsString()
  provenanceNotes?: string;
}

export class ReviewManualIntakeDto {
  @IsEnum(ManualIntakeReviewStatus)
  status: ManualIntakeReviewStatus;

  @IsOptional()
  @IsString()
  reviewNotes?: string;
}
