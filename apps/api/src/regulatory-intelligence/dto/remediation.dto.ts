import {
  IsString,
  IsOptional,
  IsEnum,
  IsBoolean,
  IsArray,
  IsUUID,
  MinLength,
  IsDateString,
  IsInt,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';
import { RegulatoryRemediationStatus, RemediationPriority, ControlGapOutcome, EvidenceSufficiencyOutcome } from '@prisma/client';

export { RegulatoryRemediationStatus, RemediationPriority };

export class CreateRemediationDto {
  @IsUUID()
  assessmentId: string;

  @IsString()
  @MinLength(3)
  title: string;

  @IsString()
  @MinLength(5)
  description: string;

  @IsString()
  @MinLength(5)
  acceptanceCriteria: string;

  @IsUUID()
  assignedToId: string;

  @IsOptional()
  @IsDateString()
  internalDueDate?: string;

  @IsOptional()
  @IsEnum(RemediationPriority)
  priority?: RemediationPriority;

  @IsOptional()
  @IsBoolean()
  requiresApproval?: boolean;

  @IsOptional()
  @IsBoolean()
  allowCompliantOverride?: boolean;

  @IsOptional()
  @IsString()
  overrideRationale?: string;
}

export class AssignRemediationDto {
  @IsUUID()
  assignedToId: string;

  @IsOptional()
  @IsString()
  rationale?: string;
}

export class UpdateRemediationStatusDto {
  @IsOptional()
  @IsEnum(RegulatoryRemediationStatus)
  status?: RegulatoryRemediationStatus;

  @IsOptional()
  @IsString()
  progressNotes?: string;

  @IsOptional()
  @IsString()
  blockedReason?: string;

  @IsOptional()
  @IsString()
  unblockedReason?: string;

  @IsOptional()
  @IsDateString()
  internalDueDate?: string;

  @IsOptional()
  @IsEnum(RemediationPriority)
  priority?: RemediationPriority;

  @IsOptional()
  @IsString()
  overrideRationale?: string;
}

export enum RemediationApprovalAction {
  APPROVE = 'APPROVE',
  REJECT = 'REJECT',
}

export class RemediationApprovalDto {
  @IsEnum(RemediationApprovalAction)
  action: RemediationApprovalAction;

  @IsOptional()
  @IsString()
  approvalNotes?: string;

  @IsOptional()
  @IsString()
  rejectionReason?: string;
}

export class CompleteRemediationDto {
  @IsString()
  @MinLength(5)
  completionNotes: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  evidenceIds?: string[];
}

export class VerifyRemediationDto {
  @IsString()
  @MinLength(5)
  verificationNotes: string;

  @IsOptional()
  @IsBoolean()
  reassessmentRequested?: boolean;
}

export class RiskAcceptRemediationDto {
  @IsString()
  @MinLength(10)
  riskAcceptanceRationale: string;
}

export class QueryRemediationDto {
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
  @IsEnum(RegulatoryRemediationStatus)
  status?: RegulatoryRemediationStatus;

  @IsOptional()
  @IsEnum(RemediationPriority)
  priority?: RemediationPriority;

  @IsOptional()
  @IsUUID()
  assessmentId?: string;

  @IsOptional()
  @IsUUID()
  obligationId?: string;

  @IsOptional()
  @IsUUID()
  controlId?: string;

  @IsOptional()
  @IsUUID()
  assignedToId?: string;

  @IsOptional()
  @IsBoolean()
  overdueOnly?: boolean;

  @IsOptional()
  @IsString()
  search?: string;
}

export interface RegulatoryRemediationSummaryDto {
  totalTasks: number;
  byStatus: Record<RegulatoryRemediationStatus, number>;
  byPriority: Record<RemediationPriority, number>;
  internalOverdueCount: number;
  regulatoryOverdueCount: number;
}
