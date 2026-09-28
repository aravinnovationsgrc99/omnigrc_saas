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

export type ControlState = 'PENDING' | 'ACTIVE' | 'SUSPENDED' | 'DISABLED' | 'DECOMMISSIONED';

export interface OrganizationControlState {
  id: string;
  organizationId: string;
  state: ControlState;
  reason: string;
  sequence: string;
  updatedByOperatorId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OrganizationStateTransitionLog {
  id: string;
  organizationId: string;
  previousState: ControlState;
  newState: ControlState;
  reason: string;
  sequence: string;
  idempotencyKey?: string | null;
  operatorId: string;
  operatorRole: string;
  createdAt: string;
}

export interface OrganizationTransitionPayload {
  targetState: ControlState;
  reason: string;
  idempotencyKey?: string;
}

export interface TransitionResponse {
  idempotent: boolean;
  organizationId: string;
  state: ControlState;
  previousState?: ControlState;
  sequence: string;
  reason: string;
  updatedAt: string;
  propagation?: {
    status: string;
    statusCode?: number;
    error?: string;
    dataPlaneResponse?: any;
  };
}

export interface DeploymentSummary {
  id: string;
  organizationId: string;
  customerId?: string | null;
  commercialAgreementId?: string | null;
  licenseId?: string | null;
  deploymentModel: string;
  environment: string;
  version: string;
  activationState: string;
  infrastructureOwner: string;
  lastCheckInAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LicenseSummary {
  id: string;
  commercialAgreementId: string;
  product: string;
  status: string;
  sequence: string;
  startsAt: string;
  expiresAt: string;
  maxDeployments: number;
  createdAt: string;
  updatedAt: string;
}
