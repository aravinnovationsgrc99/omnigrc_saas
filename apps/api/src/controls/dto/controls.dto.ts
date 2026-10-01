import { IsString, IsNotEmpty, IsOptional, IsEnum, IsNumber, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { MappingStatus } from '@omnigrc/shared';

export class CreateControlDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  title?: string;

  @IsString()
  @IsOptional()
  code?: string;

  @IsString()
  @IsNotEmpty()
  description: string;

  @IsString()
  @IsOptional()
  category?: string;

  @IsString()
  @IsOptional()
  owner?: string;

  @IsString()
  @IsOptional()
  departmentId?: string;

  @IsString()
  @IsOptional()
  projectId?: string;
}


export class UpdateControlDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  category?: string;

  @IsString()
  @IsOptional()
  departmentId?: string;

  @IsString()
  @IsOptional()
  projectId?: string;
}

export class ControlQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  limit?: number;

  @IsString()
  @IsOptional()
  search?: string;

  @IsString()
  @IsOptional()
  category?: string;

  @IsEnum(MappingStatus)
  @IsOptional()
  status?: MappingStatus;
}

export class CreateControlMappingDto {
  @IsString()
  @IsNotEmpty()
  frameworkReferenceId: string;
}

export class SuggestMappingsDto {
  @IsString()
  @IsOptional()
  frameworkId?: string;

  @IsString()
  @IsOptional()
  frameworkVersionId?: string;

  @IsString()
  @IsOptional()
  frameworkReferenceId?: string;
}

export class SignOffMappingDto {
  @IsString()
  @IsNotEmpty()
  decision: 'APPROVE' | 'OVERRIDE';

  @IsString()
  @IsOptional()
  overrideReferenceId?: string;

  @IsString()
  @IsOptional()
  overrideClauseId?: string;

  @IsString()
  @IsOptional()
  note?: string;
}
