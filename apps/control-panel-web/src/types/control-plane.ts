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

export interface CreateOperatorPayload {
  email: string;
  fullName: string;
  password?: string; // Optional if auto-generated or initial password
  role: OperatorRoleType;
}

export interface UpdateOperatorRolePayload {
  role: OperatorRoleType;
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
  lastActivatedAt?: string | null;
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

export type BreakGlassStatus =
  | 'REQUESTED'
  | 'APPROVED'
  | 'EXECUTED'
  | 'EXPIRED'
  | 'REVOKED'
  | 'REJECTED';

export type BreakGlassOperation =
  | 'EMERGENCY_ORG_SUSPEND'
  | 'EMERGENCY_ORG_DISABLE'
  | 'EMERGENCY_SERVICE_KILL_SWITCH'
  | 'EMERGENCY_DEPLOYMENT_SUSPEND'
  | 'EMERGENCY_LICENSE_RECONCILE';

export interface BreakGlassSessionDto {
  id: string;
  requesterOperatorId: string;
  requesterOperatorName?: string;
  approverOperatorId?: string | null;
  approverOperatorName?: string | null;
  executorOperatorId?: string | null;
  status: BreakGlassStatus;
  operation: BreakGlassOperation;
  reason: string;
  targetOrganizationId?: string | null;
  targetDeploymentId?: string | null;
  targetServiceCode?: string | null;
  scopeMetadata?: Record<string, any> | null;
  idempotencyKey?: string | null;
  expiresAt: string;
  approvedAt?: string | null;
  executedAt?: string | null;
  revokedAt?: string | null;
  revokedByOperatorId?: string | null;
  isSingleOperatorEmergency: boolean;
  postEventReviewStatus?: string | null;
  postEventReviewedBy?: string | null;
  postEventReviewedAt?: string | null;
  postEventNotes?: string | null;
  originatingIp?: string | null;
  userAgent?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RequestBreakGlassPayload {
  operation: BreakGlassOperation;
  reason: string;
  targetOrganizationId?: string;
  targetDeploymentId?: string;
  targetServiceCode?: string;
  durationMinutes?: number;
  isSingleOperatorEmergency?: boolean;
  emergencyConfirmationText?: string;
  totpCode: string;
  idempotencyKey?: string;
}

export interface ApproveBreakGlassPayload {
  totpCode: string;
  reason?: string;
}

export interface ExecuteBreakGlassPayload {
  totpCode?: string;
  idempotencyKey?: string;
}

export interface ReviewBreakGlassPayload {
  postEventReviewStatus: 'REVIEWED_APPROVED' | 'REVIEWED_FLAGGED';
  notes: string;
}

export type ServiceStateEnum = 'AVAILABLE' | 'DISABLED' | 'MAINTENANCE' | 'COMMERCIAL_DISABLED';

export interface ServiceCatalogItem {
  id: string;
  code: string;
  name: string;
  category: string;
  hasBackgroundProcessing: boolean;
  isCatalogActive: boolean;
  isCommerciallyControllable: boolean;
  isOrgOverridePermitted: boolean;
  createdAt: string;
  updatedAt: string;
  globalState?: {
    id: string;
    serviceId: string;
    state: ServiceStateEnum;
    reason: string;
    sequence: string;
    updatedByOperatorId?: string | null;
    createdAt: string;
    updatedAt: string;
  } | null;
}

export interface UpdateGlobalServiceStatePayload {
  state: ServiceStateEnum;
  reason: string;
  idempotencyKey?: string;
}

export interface UpdateOrganizationServiceOverridePayload {
  overrideState: ServiceStateEnum;
  reason: string;
  idempotencyKey?: string;
}

export interface ServiceStateMutationResponse {
  idempotent?: boolean;
  cleared?: boolean;
  capabilityCode: string;
  state?: ServiceStateEnum;
  overrideState?: ServiceStateEnum;
  previousState?: ServiceStateEnum | null;
  sequence?: string;
  reason?: string;
  updatedAt?: string;
  propagation?: {
    status: string;
    statusCode?: number;
    error?: string;
    dataPlaneResponse?: any;
  };
}

export interface ControlPlaneAuditLogEntry {
  id: string;
  actorId?: string | null;
  actorRole?: string | null;
  action: string;
  entityType: string;
  entityId: string;
  ipAddress?: string | null;
  correlationId?: string | null;
  result?: string | null;
  metadata?: any | null;
  createdAt: string;
}

export interface QueryAuditLogsParams {
  actorId?: string;
  actorRole?: string;
  action?: string;
  entityType?: string;
  entityId?: string;
  organizationId?: string;
  result?: string;
  search?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
}

export interface AuditLogsResponse {
  data: ControlPlaneAuditLogEntry[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
}

export type AnnouncementSeverity = 'INFO' | 'NOTICE' | 'WARNING' | 'CRITICAL';
export type AnnouncementStatus = 'DRAFT' | 'SCHEDULED' | 'PUBLISHED' | 'CANCELLED' | 'EXPIRED';
export type AnnouncementAudience = 'ALL_OPERATORS' | 'ALL_ORGANIZATIONS' | 'SPECIFIC_ORGANIZATION';
export type EmailDeliveryStatus = 'NOT_REQUESTED' | 'QUEUED' | 'SENT' | 'FAILED';

export interface PlatformAnnouncement {
  id: string;
  title: string;
  body: string;
  severity: AnnouncementSeverity;
  status: AnnouncementStatus;
  audience: AnnouncementAudience;
  targetOrganizationId?: string | null;
  createdByOperatorId: string;
  scheduledAt?: string | null;
  publishedAt?: string | null;
  cancelledAt?: string | null;
  expiresAt?: string | null;
  sendEmail: boolean;
  emailDeliveryStatus: EmailDeliveryStatus;
  emailSentAt?: string | null;
  emailRecipientCount: number;
  emailErrorDetails?: string | null;
  createdAt: string;
  updatedAt: string;
  creator?: {
    id: string;
    fullName: string;
    email: string;
    role: string;
  } | null;
}

export interface QueryAnnouncementsParams {
  status?: AnnouncementStatus;
  severity?: AnnouncementSeverity;
  audience?: AnnouncementAudience;
  organizationId?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export interface AnnouncementsResponse {
  data: PlatformAnnouncement[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
}

export interface CreateAnnouncementDto {
  title: string;
  body: string;
  severity?: AnnouncementSeverity;
  audience?: AnnouncementAudience;
  targetOrganizationId?: string;
  scheduledAt?: string;
  expiresAt?: string;
  sendEmail?: boolean;
}

export interface UpdateAnnouncementDto {
  title?: string;
  body?: string;
  severity?: AnnouncementSeverity;
  audience?: AnnouncementAudience;
  targetOrganizationId?: string;
  scheduledAt?: string;
  expiresAt?: string;
  sendEmail?: boolean;
}
