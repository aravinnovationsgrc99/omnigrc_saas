import { IsString, IsNotEmpty, IsEnum, IsOptional, IsInt, Min, Max, IsDateString, IsArray } from 'class-validator';
import { Type } from 'class-transformer';
import { PolicyStatus, PolicyExceptionStatus } from '@omnigrc/shared';

export class CreatePolicyDto {
  @IsString()
  @IsNotEmpty()
  code!: string;

  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsNotEmpty()
  category!: string;

  @IsString()
  @IsNotEmpty()
  ownerId!: string;

  @IsString()
  @IsOptional()
  businessUnit?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  reviewCadenceDays?: number = 365;

  @IsString()
  @IsNotEmpty()
  initialContent!: string;

  @IsString()
  @IsOptional()
  departmentId?: string;

  @IsString()
  @IsOptional()
  projectId?: string;

  @IsEnum(['INTERNAL', 'EXTERNAL', 'PUBLIC', 'PRIVATE'], {
    message: 'policyType must be one of: INTERNAL, EXTERNAL, PUBLIC, PRIVATE',
  })
  @IsOptional()
  policyType?: 'INTERNAL' | 'EXTERNAL' | 'PUBLIC' | 'PRIVATE' = 'INTERNAL';

  @IsDateString()
  @IsOptional()
  effectiveDate?: string;

  @IsDateString()
  @IsOptional()
  expiryDate?: string;

  @IsDateString()
  @IsOptional()
  reviewDate?: string;
}

export class UpdatePolicyDto {
  @IsString()
  @IsOptional()
  code?: string;

  @IsString()
  @IsOptional()
  title?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  category?: string;

  @IsString()
  @IsOptional()
  ownerId?: string;

  @IsString()
  @IsOptional()
  businessUnit?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  reviewCadenceDays?: number;

  @IsString()
  @IsOptional()
  departmentId?: string;

  @IsString()
  @IsOptional()
  projectId?: string;

  @IsEnum(['INTERNAL', 'EXTERNAL', 'PUBLIC', 'PRIVATE'], {
    message: 'policyType must be one of: INTERNAL, EXTERNAL, PUBLIC, PRIVATE',
  })
  @IsOptional()
  policyType?: 'INTERNAL' | 'EXTERNAL' | 'PUBLIC' | 'PRIVATE';

  @IsDateString()
  @IsOptional()
  effectiveDate?: string;

  @IsDateString()
  @IsOptional()
  expiryDate?: string;

  @IsDateString()
  @IsOptional()
  reviewDate?: string;

  @IsString()
  @IsOptional()
  content?: string;

  @IsString()
  @IsOptional()
  expectedUpdatedAt?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsNotEmpty()
  expectedVersion!: number;
}

export class PolicyLifecycleActionDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsNotEmpty()
  expectedVersion!: number;
}

export class RejectPolicyDto {
  @IsString()
  @IsNotEmpty()
  reason!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsNotEmpty()
  expectedVersion!: number;
}

export class PublishPolicyDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsNotEmpty()
  expectedVersion!: number;

  @IsString()
  @IsOptional()
  versionId?: string;
}

export class CreatePolicyCategoryDto {
  @IsString()
  @IsNotEmpty()
  name!: string;
}

export class RenamePolicyCategoryDto {
  @IsString()
  @IsNotEmpty()
  newName!: string;
}

export class CreatePolicyVersionDto {
  @IsString()
  @IsNotEmpty()
  versionNumber!: string; // e.g. "1.1"

  @IsString()
  @IsNotEmpty()
  content!: string;

  @IsString()
  @IsOptional()
  changeLog?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsNotEmpty()
  expectedVersion!: number;
}

export class CreatePolicyExceptionDto {
  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsString()
  @IsNotEmpty()
  reason!: string;

  @IsDateString()
  @IsOptional()
  expiresAt?: string;
}

export class PolicyQueryDto {
  @IsEnum(PolicyStatus)
  @IsOptional()
  status?: PolicyStatus;

  @IsString()
  @IsOptional()
  category?: string;

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

export class AttestPolicyDto {
  @IsString()
  @IsOptional()
  versionId?: string;
}

export class SubmitPolicyApprovalDto {
  @IsString()
  @IsOptional()
  workflowId?: string;

  @IsString()
  @IsOptional()
  title?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  dueDays?: number = 7;
}

export class AiDraftPolicyDto {
  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsString()
  @IsOptional()
  category?: string;

  @IsString()
  @IsOptional()
  policyType?: string; // 'INTERNAL' | 'EXTERNAL' | 'PUBLIC' | 'PRIVATE'

  @IsString()
  @IsOptional()
  targetAudience?: string;

  @IsString()
  @IsOptional()
  standardOrFramework?: string; // e.g. 'ISO 27001:2022', 'SOC 2 Type II', 'NIST CSF', 'HIPAA'

  @IsString()
  @IsOptional()
  keyRequirements?: string;

  @IsString()
  @IsOptional()
  companyContext?: string;

  @IsString()
  @IsOptional()
  pageDepth?: string; // 'CONCISE' | 'STANDARD' | 'COMPREHENSIVE'
}

export class SharePolicyDto {
  @IsArray()
  @IsNotEmpty()
  recipientEmails!: string[];

  @IsString()
  @IsOptional()
  message?: string;

  @IsOptional()
  includeContent?: boolean;
}

export class ImportPolicyDocDto {
  @IsString()
  @IsNotEmpty()
  content!: string;

  @IsString()
  @IsOptional()
  filename?: string;

  @IsString()
  @IsOptional()
  fileType?: string; // 'markdown' | 'text' | 'docx'
}

export class CreatePolicyShareDto {
  @IsString()
  @IsNotEmpty()
  sharedWithUserId!: string;

  @IsEnum(['VIEW', 'DOWNLOAD', 'EDIT'], {
    message: 'permission must be one of: VIEW, DOWNLOAD, EDIT',
  })
  @IsNotEmpty()
  permission!: 'VIEW' | 'DOWNLOAD' | 'EDIT';

  @IsString()
  @IsOptional()
  notes?: string;
}
