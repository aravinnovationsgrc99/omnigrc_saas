import { IsString, IsOptional, IsEnum, IsInt, Min, IsNotEmpty } from 'class-validator';
import { Type } from 'class-transformer';
import { MappingStatus } from '@omnigrc/shared';

export class AssociatePolicyControlDto {
  @IsEnum(MappingStatus)
  @IsOptional()
  status?: MappingStatus = MappingStatus.APPROVED;

  @IsString()
  @IsOptional()
  rationale?: string;
}

export class UpdatePolicyControlDto {
  @IsEnum(MappingStatus)
  @IsOptional()
  status?: MappingStatus;

  @IsString()
  @IsOptional()
  rationale?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsNotEmpty()
  expectedVersion!: number;
}

export class DisassociatePolicyControlDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  expectedVersion?: number;
}

export class PolicyControlQueryDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page?: number = 1;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  limit?: number = 50;

  @IsString()
  @IsOptional()
  search?: string;

  @IsEnum(MappingStatus)
  @IsOptional()
  status?: MappingStatus;
}

