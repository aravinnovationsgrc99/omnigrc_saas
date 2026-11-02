import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsBoolean,
  IsInt,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  DirectoryProvider,
  DirectorySyncSchedule,
  Role,
} from '@omnigrc/shared';

export class SaveDirectoryConfigDto {
  @IsEnum(DirectoryProvider)
  @IsOptional()
  provider?: DirectoryProvider = DirectoryProvider.ENTRA_ID;

  @IsString()
  @IsNotEmpty()
  tenantId!: string;

  @IsString()
  @IsNotEmpty()
  clientId!: string;

  @IsString()
  @IsOptional()
  clientSecret?: string; // Optional if updating existing config without rotating secret

  @IsString()
  @IsOptional()
  domain?: string;

  @IsBoolean()
  @IsOptional()
  enabled?: boolean = true;

  @IsEnum(Role)
  @IsOptional()
  defaultRole?: Role = Role.ANALYST;

  @IsEnum(DirectorySyncSchedule)
  @IsOptional()
  syncSchedule?: DirectorySyncSchedule = DirectorySyncSchedule.MANUAL;

  @IsBoolean()
  @IsOptional()
  autoDeactivateUsers?: boolean = true;

  @Type(() => Number)
  @IsInt()
  @Min(5)
  @Max(100)
  @IsOptional()
  deactivationThresholdPct?: number = 20;
}

export class CreateOrUpdateGroupMappingDto {
  @IsString()
  @IsNotEmpty()
  directoryGroupId!: string;

  @IsString()
  @IsNotEmpty()
  directoryGroupName!: string;

  @IsEnum(Role)
  @IsNotEmpty()
  targetRole!: Role;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  @IsOptional()
  priority?: number = 100;
}

export class TestDirectoryConnectionDto {
  @IsString()
  @IsNotEmpty()
  tenantId!: string;

  @IsString()
  @IsNotEmpty()
  clientId!: string;

  @IsString()
  @IsOptional()
  clientSecret?: string;
}

export class DirectorySyncLogsQueryDto {
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

