import {
  IsEnum,
  IsString,
  IsOptional,
  IsBoolean,
  IsInt,
  Min,
  Max,
  MinLength,
} from 'class-validator';
import { BreakGlassOperation } from '@omnigrc/shared';

export class RequestBreakGlassDto {
  @IsEnum(BreakGlassOperation)
  operation!: BreakGlassOperation;

  @IsString()
  @MinLength(10, { message: 'Break-glass reason must be at least 10 characters detailing the operational justification.' })
  reason!: string;

  @IsOptional()
  @IsString()
  targetOrganizationId?: string;

  @IsOptional()
  @IsString()
  targetDeploymentId?: string;

  @IsOptional()
  @IsString()
  targetServiceCode?: string;

  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(30)
  durationMinutes?: number;

  @IsOptional()
  @IsBoolean()
  isSingleOperatorEmergency?: boolean;

  @IsOptional()
  @IsString()
  emergencyConfirmationText?: string;

  @IsString()
  totpCode!: string;

  @IsOptional()
  @IsString()
  idempotencyKey?: string;
}

export class ApproveBreakGlassDto {
  @IsString()
  totpCode!: string;

  @IsOptional()
  @IsString()
  reason?: string;
}

export class ExecuteBreakGlassDto {
  @IsOptional()
  @IsString()
  totpCode?: string;

  @IsOptional()
  @IsString()
  idempotencyKey?: string;
}

export class ReviewBreakGlassDto {
  @IsString()
  postEventReviewStatus!: 'REVIEWED_APPROVED' | 'REVIEWED_FLAGGED';

  @IsString()
  @MinLength(10, { message: 'Post-event review notes must be at least 10 characters.' })
  notes!: string;
}
