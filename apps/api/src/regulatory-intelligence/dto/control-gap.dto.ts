import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
  IsInt,
  Min,
  Max,
  IsBoolean,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  ControlGapOutcome,
  EvidenceSufficiencyOutcome,
} from '@prisma/client';

export class AssessControlGapDto {
  @IsOptional()
  @IsString()
  obligationId?: string;

  @IsOptional()
  @IsBoolean()
  forceReassess?: boolean = false;
}

export class QueryControlGapDto {
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
  @IsEnum(ControlGapOutcome)
  gapOutcome?: ControlGapOutcome;

  @IsOptional()
  @IsEnum(EvidenceSufficiencyOutcome)
  evidenceOutcome?: EvidenceSufficiencyOutcome;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isHumanReviewed?: boolean;

  @IsOptional()
  @IsString()
  search?: string;
}

export class ReviewControlGapDto {
  @IsNotEmpty({ message: 'Gap outcome is required' })
  @IsEnum(ControlGapOutcome)
  gapOutcome: ControlGapOutcome;

  @IsOptional()
  @IsEnum(EvidenceSufficiencyOutcome)
  evidenceOutcome?: EvidenceSufficiencyOutcome;

  @IsNotEmpty({ message: 'Review notes justifying the review or override are required' })
  @IsString()
  @MinLength(5, { message: 'Review notes must be at least 5 characters long' })
  reviewNotes: string;

  @IsOptional()
  @IsString()
  revisedGapRationale?: string;

  @IsOptional()
  @IsString()
  revisedEvidenceRationale?: string;
}

export class ControlGapSummaryDto {
  organizationId: string;
  totalAssessed: number;
  gapOutcomes: Record<ControlGapOutcome, number>;
  evidenceOutcomes: Record<EvidenceSufficiencyOutcome, number>;
  unmappedObligationsCount: number;
  partiallyOrNotImplementedCount: number;
  implementedCount: number;
}
