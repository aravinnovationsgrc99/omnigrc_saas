import { IsEnum, IsString, IsNotEmpty, IsOptional } from 'class-validator';
import { OrganizationControlStateEnum } from '@prisma/client';

export class ControlSignalDto {
  @IsString()
  @IsNotEmpty()
  id: string;

  @IsString()
  @IsNotEmpty()
  organizationId: string;

  @IsEnum(OrganizationControlStateEnum)
  targetState: OrganizationControlStateEnum;

  @IsString()
  @IsNotEmpty()
  sequence: string;

  @IsString()
  @IsNotEmpty()
  timestamp: string;

  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsString()
  correlationId?: string;

  @IsString()
  @IsNotEmpty()
  issuer: string;

  @IsString()
  @IsNotEmpty()
  signature: string;
}
