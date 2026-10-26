import {
  IsString,
  IsOptional,
  IsEnum,
  IsBoolean,
  IsInt,
  Min,
  Max,
  IsNotEmpty,
  IsArray,
  IsObject,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import {
  ApplicabilityOutcome,
  DeterminationType,
} from '@prisma/client';

export class AssessApplicabilityDto {
  @IsOptional()
  @IsString()
  obligationId?: string;

  @IsOptional()
  @IsString()
  catalogueEntryId?: string;

  @IsOptional()
  @IsBoolean()
  forceReassess?: boolean = false;
}

export class QueryApplicabilityDto {
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
  catalogueEntryId?: string;

  @IsOptional()
  @IsEnum(ApplicabilityOutcome)
  outcome?: ApplicabilityOutcome;

  @IsOptional()
  @IsEnum(DeterminationType)
  determinationType?: DeterminationType;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  isHumanReviewed?: boolean;

  @IsOptional()
  @IsString()
  search?: string;
}

export class ReviewApplicabilityDto {
  @IsNotEmpty()
  @IsEnum(ApplicabilityOutcome)
  outcome: ApplicabilityOutcome;

  @IsNotEmpty()
  @IsString()
  reviewNotes: string;

  @IsOptional()
  @IsString()
  overrideReason?: string;
}

export class UpdateComplianceProfileDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  operatingJurisdictions?: string[];

  @IsOptional()
  @IsString()
  industrySector?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  regulatedEntityTypes?: string[];

  @IsOptional()
  @IsBoolean()
  handlesPersonalData?: boolean;

  @IsOptional()
  @IsBoolean()
  handlesPaymentData?: boolean;

  @IsOptional()
  @IsBoolean()
  isSignificantDataFiduciary?: boolean;

  @IsOptional()
  @IsString()
  annualTurnoverBand?: string;

  @IsOptional()
  @IsString()
  employeeCountBand?: string;

  @IsOptional()
  @IsObject()
  customAttributes?: Record<string, any>;
}
