import { IsString, IsOptional, IsEnum, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { RiskControlMitigationType } from '@omnigrc/shared';

export class AssociateRiskControlDto {
  @IsString()
  @IsOptional()
  controlId?: string;

  @IsString()
  @IsOptional()
  riskId?: string;

  @IsEnum(RiskControlMitigationType)
  @IsOptional()
  mitigationType?: RiskControlMitigationType;

  @IsString()
  @IsOptional()
  notes?: string;
}

export class RiskControlQueryDto {
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
  limit?: number = 50;

  @IsString()
  @IsOptional()
  search?: string;
}
