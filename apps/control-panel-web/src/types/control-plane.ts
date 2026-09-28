export type OperatorRoleType =
  | 'PLATFORM_SUPER_ADMIN'
  | 'COMMERCIAL_OPERATOR'
  | 'OPERATIONS_ENGINEER'
  | 'SUPPORT_ENGINEER'
  | 'SECURITY_AUDIT'
  | 'READ_ONLY_AUDITOR';

export type OperatorStatusType = 'ACTIVE' | 'SUSPENDED' | 'DISABLED';

export interface OperatorProfile {
  id: string;
  email: string;
  fullName: string;
  role: OperatorRoleType;
  status: OperatorStatusType;
  mfaEnabled: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface ApiErrorResponse {
  statusCode: number;
  message: string;
  error?: string;
  code?: string;
  correlationId?: string;
  details?: any;
}

export interface LoginSuccessResponse {
  accessToken: string;
  refreshToken: string;
  operator: OperatorProfile;
}

export interface MfaRequiredResponse {
  mfaRequired: true;
  message: string;
}
