import { IsEmail, IsString, IsNotEmpty, MinLength, IsEnum } from 'class-validator';
import { OperatorRole } from '@prisma/control-plane-client';

export class CreateOperatorDto {
  @IsEmail({}, { message: 'Valid operator email is required' })
  email!: string;

  @IsString()
  @MinLength(10, { message: 'Operator password must be at least 10 characters' })
  password!: string;

  @IsString()
  @IsNotEmpty({ message: 'Full name is required' })
  fullName!: string;

  @IsEnum(OperatorRole, { message: 'Valid operator role is required' })
  role!: OperatorRole;
}

export class UpdateOperatorRoleDto {
  @IsEnum(OperatorRole, { message: 'Valid operator role is required' })
  role!: OperatorRole;
}
