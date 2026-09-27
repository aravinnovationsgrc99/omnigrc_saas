import { SetMetadata } from '@nestjs/common';
import { OperatorRole } from '@prisma/control-plane-client';

export const OPERATOR_ROLES_KEY = 'operator_roles';
export const RequireOperatorRoles = (...roles: OperatorRole[]) => SetMetadata(OPERATOR_ROLES_KEY, roles);
