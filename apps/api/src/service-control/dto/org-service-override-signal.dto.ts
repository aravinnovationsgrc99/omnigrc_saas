import { IsString, IsNotEmpty, IsOptional, IsISO8601 } from 'class-validator';

export class OrgServiceOverrideSignalDto {
  @IsString()
  @IsNotEmpty()
  id: string;

  @IsString()
  @IsNotEmpty()
  organizationId: string;

  @IsString()
  @IsNotEmpty()
  capabilityCode: string;

  @IsString()
  @IsNotEmpty()
  targetState: string; // 'AVAILABLE' | 'DISABLED' | 'COMMERCIAL_DISABLED' | 'INHERIT' / 'CLEARED'

  @IsString()
  @IsOptional()
  reason?: string;

  @IsString()
  @IsNotEmpty()
  sequence: string;

  @IsISO8601()
  timestamp: string;

  @IsString()
  @IsNotEmpty()
  issuer: string;

  @IsString()
  @IsNotEmpty()
  signature: string;
}
