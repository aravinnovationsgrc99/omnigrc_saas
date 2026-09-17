import { IsString, IsNotEmpty, IsOptional, IsEnum, IsNumber, Min, IsDateString } from 'class-validator';
import { Type } from 'class-transformer';
import { TaskStatus, ObligationCadence } from '@omnigrc/shared';

export class CreateComplianceTaskDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsEnum(TaskStatus)
  @IsOptional()
  status?: TaskStatus;

  @IsString()
  @IsNotEmpty()
  owner: string;

  @IsDateString()
  @IsOptional()
  dueDate?: string;

  @IsString()
  @IsOptional()
  controlId?: string;

  @IsEnum(ObligationCadence)
  @IsOptional()
  cadence?: ObligationCadence = ObligationCadence.ONE_OFF;

  @IsString()
  @IsOptional()
  category?: string;

  @IsString()
  @IsOptional()
  obligationReference?: string;
}

export class UpdateComplianceTaskDto {
  @IsString()
  @IsOptional()
  title?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsEnum(TaskStatus)
  @IsOptional()
  status?: TaskStatus;

  @IsString()
  @IsOptional()
  owner?: string;

  @IsDateString()
  @IsOptional()
  dueDate?: string | null;

  @IsString()
  @IsOptional()
  controlId?: string | null;

  @IsEnum(ObligationCadence)
  @IsOptional()
  cadence?: ObligationCadence;

  @IsString()
  @IsOptional()
  category?: string;

  @IsString()
  @IsOptional()
  obligationReference?: string;
}

export class UpdateTaskStatusDto {
  @IsEnum(TaskStatus)
  @IsNotEmpty()
  status: TaskStatus;
}

export class ComplianceTaskQueryDto {
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

  @IsEnum(TaskStatus)
  @IsOptional()
  status?: TaskStatus;

  @IsString()
  @IsOptional()
  controlId?: string;
}
