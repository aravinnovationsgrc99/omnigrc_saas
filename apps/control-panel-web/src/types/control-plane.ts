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

export type LicenseStatusType = 'TRIAL' | 'ACTIVE' | 'EXPIRED' | 'SUSPENDED' | 'REVOKED';

export interface EntitlementDto {
  id: string;
  licenseId: string;
  code: string;
  name: string;
  value?: any;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface LicenseDto {
  id: string;
  commercialAgreementId: string;
  product: string;
  status: LicenseStatusType;
  sequence?: number | string;
  issuedAt: string;
  startsAt: string;
  expiresAt: string;
  maxDeployments: number;
  createdAt: string;
  updatedAt: string;
  entitlements: EntitlementDto[];
  deployments?: DeploymentSummary[];
  deploymentsCount?: number;
}

export type LicenseSummary = LicenseDto;

export interface CreateLicensePayload {
  commercialAgreementId: string;
  product?: string;
  status?: LicenseStatusType;
  startsAt: string;
  expiresAt: string;
  maxDeployments: number;
}

export interface UpdateLicensePayload {
  startsAt?: string;
  expiresAt?: string;
  maxDeployments?: number;
  reason?: string;
}

export interface GrantEntitlementPayload {
  code: string;
  name: string;
  enabled?: boolean;
  value?: any;
}

export interface CustomerDto {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface CommercialAgreementDto {
  id: string;
  customerId: string;
  createdAt: string;
  updatedAt: string;
}

export interface SignedLicenseArtifact {
  formatVersion: string;
  keyId: string;
  algorithm: string;
  payload: any;
  signature: string;
}

export interface CommercialAuditLog {
  id: string;
  actorId?: string;
  actorRole?: string;
  action: string;
  entityType: string;
  entityId: string;
  ipAddress?: string;
  correlationId?: string;
  result?: string;
  metadata?: any;
  createdAt: string;
}
