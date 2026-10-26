import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
  IsInt,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  MappingStatus,
  ObligationConfidence,
  ObligationMappingMethod,
} from '@prisma/client';

export class CreateObligationMappingDto {
  @IsNotEmpty({ message: 'obligationId is required' })
  @IsString()
  obligationId: string;

  @IsNotEmpty({ message: 'controlId is required' })
  @IsString()
  controlId: string;

  @IsNotEmpty({ message: 'Substantive mapping rationale is required' })
  @IsString()
  @MinLength(10, { message: 'Mapping rationale must be at least 10 characters long' })
  rationale: string;

  @IsOptional()
  @IsEnum(ObligationMappingMethod)
  mappingMethod?: ObligationMappingMethod;

  @IsOptional()
  @IsEnum(ObligationConfidence)
  confidence?: ObligationConfidence;

  @IsOptional()
  @IsString()
  sourceExcerpt?: string;

  @IsOptional()
  @IsString()
  frameworkReferenceId?: string;
}

export class SuggestMappingsDto {
  @IsOptional()
  @IsString()
  obligationId?: string;

  @IsOptional()
  @IsEnum(ObligationConfidence)
  confidenceThreshold?: ObligationConfidence;
}

export class QueryObligationMappingsDto {
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
  obligationId?: string;

  @IsOptional()
  @IsString()
  controlId?: string;

  @IsOptional()
  @IsEnum(MappingStatus)
  status?: MappingStatus;

  @IsOptional()
  @IsEnum(ObligationMappingMethod)
  mappingMethod?: ObligationMappingMethod;

  @IsOptional()
  @IsEnum(ObligationConfidence)
  confidence?: ObligationConfidence;

  @IsOptional()
  @IsString()
  search?: string;
}

export class ReviewObligationMappingDto {
  @IsNotEmpty({ message: 'Review status is required' })
  @IsEnum(MappingStatus)
  status: MappingStatus;

  @IsNotEmpty({ message: 'Review notes justifying the review decision are required' })
  @IsString()
  @MinLength(5, { message: 'Review notes must be at least 5 characters long' })
  reviewNotes: string;

  @IsOptional()
  @IsString()
  revisedRationale?: string;

  @IsOptional()
  @IsEnum(ObligationConfidence)
  revisedConfidence?: ObligationConfidence;
}

export class MappingCoverageSummaryDto {
  organizationId: string;
  totalApplicableObligations: number;
  mappedObligationsCount: number;
  unmappedObligationsCount: number;
  coveragePercentage: number;
  unmappedObligations: Array<{
    obligationId: string;
    obligationIdentifier?: string | null;
    title: string;
    affectedActor?: string | null;
    jurisdiction?: string | null;
    issuingAuthority?: string | null;
  }>;
}
