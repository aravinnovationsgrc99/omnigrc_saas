import { IsEnum, IsString, MinLength, IsOptional } from 'class-validator';
import { ServiceStateEnum } from '@prisma/control-plane-client';

export class UpdateGlobalServiceStateDto {
  @IsEnum(ServiceStateEnum)
  state: ServiceStateEnum;

  @IsString()
  @MinLength(10, { message: 'Reason must be a human-readable explanation of at least 10 characters' })
  reason: string;

  @IsOptional()
  @IsString()
  idempotencyKey?: string;
}
