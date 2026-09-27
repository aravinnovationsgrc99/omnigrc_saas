import { IsString, IsNotEmpty, IsEnum, IsISO8601 } from 'class-validator';

export enum DataPlaneServiceStateEnum {
  AVAILABLE = 'AVAILABLE',
  DISABLED = 'DISABLED',
  COMMERCIAL_DISABLED = 'COMMERCIAL_DISABLED',
}

export class GlobalServiceSignalDto {
  @IsString()
  @IsNotEmpty()
  id: string;

  @IsString()
  @IsNotEmpty()
  capabilityCode: string;

  @IsEnum(DataPlaneServiceStateEnum)
  targetState: DataPlaneServiceStateEnum;

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
