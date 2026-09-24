import { IsString, IsNotEmpty, IsEnum, IsOptional, IsInt, Min, Max, IsDateString } from 'class-validator';
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
