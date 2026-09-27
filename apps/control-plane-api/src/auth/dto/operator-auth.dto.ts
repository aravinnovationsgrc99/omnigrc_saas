import { IsEmail, IsString, IsNotEmpty, MinLength, IsOptional, IsEnum } from 'class-validator';
import { OperatorRole } from '@prisma/control-plane-client';

export class OperatorLoginDto {
  @IsEmail({}, { message: 'A valid email address is required' })
  email!: string;

  @IsString()
  @IsNotEmpty({ message: 'Password is required' })
  password!: string;

  @IsOptional()
  @IsString()
  totpCode?: string;
}

export class OperatorRefreshDto {
  @IsString()
  @IsNotEmpty({ message: 'Refresh token is required' })
  refreshToken!: string;
}

export class VerifyMfaDto {
  @IsString()
  @IsNotEmpty({ message: '6-digit TOTP verification code is required' })
  totpCode!: string;
}

export class BootstrapOperatorDto {
  @IsString()
  @IsNotEmpty({ message: 'Bootstrap secret is required' })
  bootstrapSecret!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(12, { message: 'Bootstrap password must be at least 12 characters' })
  password!: string;

  @IsString()
  @IsNotEmpty()
  fullName!: string;
}

export interface OperatorAuthResponse {
  accessToken: string;
  refreshToken: string;
  operator: {
    id: string;
    email: string;
    fullName: string;
    role: OperatorRole;
    status: string;
    mfaEnabled: boolean;
  };
}
