import {
  IsString,
  IsOptional,
  IsEnum,
  IsBoolean,
  IsInt,
  Min,
  Max,
  IsNotEmpty,
  IsObject,
  IsDateString,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import {
  RegulatoryObligationStatus,
  ObligationExtractionMethod,
  ObligationConfidence,
} from '@prisma/client';

export class QueryObligationsDto {
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

  @IsOptional()
  @IsString()
  publicationId?: string;

  @IsOptional()
  @IsString()
  catalogueEntryId?: string;

  @IsOptional()
  @IsEnum(RegulatoryObligationStatus)
  status?: RegulatoryObligationStatus;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  isHumanVerified?: boolean;

  @IsOptional()
  @IsString()
  affectedActor?: string;

  @IsOptional()
  @IsString()
  search?: string;
}

export class ExtractObligationsDto {
  @IsOptional()
  @IsBoolean()
  forceReextract?: boolean = false;
}

export class ReviewObligationDto {
  @IsNotEmpty()
  @IsEnum(RegulatoryObligationStatus)
  status: RegulatoryObligationStatus;

  @IsNotEmpty()
  @IsString()
  reviewNotes: string;

  @IsOptional()
  @IsString()
  correctedWording?: string;

  @IsOptional()
  @IsString()
  correctedAction?: string;

  @IsOptional()
  @IsString()
  correctedActor?: string;

  @IsOptional()
  @IsDateString()
  correctedEffectiveDate?: string;

  @IsOptional()
  @IsDateString()
  correctedDeadline?: string;
}

export class CreateManualObligationDto {
  @IsNotEmpty()
  @IsString()
  publicationId: string;

  @IsOptional()
  @IsString()
  manualIntakeId?: string;

  @IsOptional()
  @IsString()
  obligationIdentifier?: string;

  @IsNotEmpty()
  @IsString()
  title: string;

  @IsNotEmpty()
  @IsString()
  obligationWording: string;

  @IsOptional()
  @IsString()
  requiredAction?: string;

  @IsOptional()
  @IsString()
  affectedActor?: string;

  @IsOptional()
  @IsDateString()
  effectiveDate?: string;

  @IsOptional()
  @IsDateString()
  complianceDeadline?: string;

  @IsOptional()
  @IsString()
  sourceExcerpt?: string;

  @IsOptional()
  @IsObject()
  documentLocation?: Record<string, any>;
}
