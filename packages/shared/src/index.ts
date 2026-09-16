/**
 * Standard RFC 8785 JSON Canonicalization Scheme (JCS) serializer.
 * Guarantees identical UTF-8 string output across all platforms for identical logical JSON values.
 */
export function jcsCanonicalize(object: any): string {
  if (object === null || typeof object !== 'object') {
    if (typeof object === 'function' || typeof object === 'symbol' || typeof object === 'undefined') {
      throw new Error('JCS Canonicalization failed: object contains un-serializable values');
    }
    return JSON.stringify(object);
  }

  if (Array.isArray(object)) {
    const elements = object.map((item) => jcsCanonicalize(item));
    return `[${elements.join(',')}]`;
  }

  const keys = Object.keys(object).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

  const parts: string[] = [];
  for (const key of keys) {
    const val = object[key];
    if (typeof val === 'function' || typeof val === 'symbol') {
      throw new Error(`JCS Canonicalization failed: property "${key}" is un-serializable`);
    }
    if (val !== undefined) {
      parts.push(`${JSON.stringify(key)}:${jcsCanonicalize(val)}`);
    }
  }

  return `{${parts.join(',')}}`;
}

export enum OrgType {
  STANDALONE = "STANDALONE",
  MSSP_PROVIDER = "MSSP_PROVIDER",
  CLIENT_TENANT = "CLIENT_TENANT",
}

export enum Role {
  ADMIN = "ADMIN",
  ANALYST = "ANALYST",
  MSSP_ADMIN = "MSSP_ADMIN",
  MSSP_ANALYST = "MSSP_ANALYST",
}

export enum PodRegion {
  INDIA = "INDIA",
  UK = "UK",
  EU = "EU",
  AUSTRALIA = "AUSTRALIA",
}

export enum PodStatus {
  ACTIVE = "ACTIVE",
  INACTIVE = "INACTIVE",
}

export enum FrameworkCode {
  ISO27001 = "ISO27001",
  SOC2 = "SOC2",
  GDPR = "GDPR",
  DPDP = "DPDP",
  ISO42001 = "ISO42001",
  HIPAA = "HIPAA",
}

export enum AssetType {
  HARDWARE = "HARDWARE",
  SOFTWARE = "SOFTWARE",
  VENDOR = "VENDOR",
  DATA_STORE = "DATA_STORE",
  OTHER = "OTHER",
}

export enum AssetCriticality {
  LOW = "LOW",
  MEDIUM = "MEDIUM",
  HIGH = "HIGH",
}

export enum RiskStatus {
  OPEN = "OPEN",
  IN_TREATMENT = "IN_TREATMENT",
  ACCEPTED = "ACCEPTED",
  CLOSED = "CLOSED",
}

export enum RiskScoreBand {
  LOW = "LOW",
  MEDIUM = "MEDIUM",
  HIGH = "HIGH",
}

export enum MappingStatus {
  SUGGESTED = "SUGGESTED",
  APPROVED = "APPROVED",
  OVERRIDDEN = "OVERRIDDEN",
  REJECTED = "REJECTED",
}

export enum ModelTier {
  TIER_1 = "TIER_1",
  TIER_2 = "TIER_2",
}

export enum TaskStatus {
  NOT_STARTED = "NOT_STARTED",
  IN_PROGRESS = "IN_PROGRESS",
  UNDER_REVIEW = "UNDER_REVIEW",
  COMPLETE = "COMPLETE",
}

export interface UserDto {
  id: string;
  organizationId: string;
  name: string;
  email: string;
  role: Role;
  emailNotifications: boolean;
  passwordSetupRequired?: boolean;
  createdAt: string;
}

export interface OrganizationDto {
  id: string;
  name: string;
  type?: OrgType;
  parentOrganizationId?: string | null;
  primaryRegion: string;
  primaryFramework?: string | null;
  onboardingCompleted?: boolean;
  createdAt: string;
}

export interface RegionalPodDto {
  id: string;
  region: PodRegion;
  status: PodStatus;
  organizationId: string;
}

export interface AssetDto {
  id: string;
  organizationId: string;
  name: string;
  type: AssetType;
  description?: string | null;
  owner: string;
  criticality: AssetCriticality;
  vendorName?: string | null;
  dataResidencyRegion?: string | null;
  createdAt: string;
  updatedAt: string;
  createdById: string;
  deletedAt?: string | null;
}

export interface CreateAssetDto {
  name: string;
  type: AssetType;
  description?: string;
  owner: string;
  criticality: AssetCriticality;
  vendorName?: string;
  dataResidencyRegion?: string;
}

export interface UpdateAssetDto {
  name?: string;
  type?: AssetType;
  description?: string;
  owner?: string;
  criticality?: AssetCriticality;
  vendorName?: string;
  dataResidencyRegion?: string;
}

export interface AssetQueryDto {
  page?: number;
  limit?: number;
  search?: string;
  type?: AssetType;
  criticality?: AssetCriticality;
}

export interface PaginatedAssetsDto {
  items: AssetDto[];
  total: number;
  page: number;
  limit: number;
}

export interface AuditLogEntryDto {
  id: string;
  organizationId: string;
  actorId: string;
  action: string;
  entityType: string;
  entityId: string;
  metadata: Record<string, any>;
  createdAt: string;
}

export interface RiskDto {
  id: string;
  organizationId: string;
  title: string;
  description?: string | null;
  likelihood: number;
  impact: number;
  score: number;
  scoreBand: RiskScoreBand;
  status: RiskStatus;
  owner: string;
  assetId?: string | null;
  assetName?: string | null;
  treatmentPlan?: string | null;
  createdAt: string;
  updatedAt: string;
  createdById: string;
  deletedAt?: string | null;
}

export interface CreateRiskDto {
  title: string;
  description?: string;
  likelihood: number;
  impact: number;
  status?: RiskStatus;
  owner: string;
  assetId?: string;
  treatmentPlan?: string;
}

export interface UpdateRiskDto {
  title?: string;
  description?: string;
  likelihood?: number;
  impact?: number;
  status?: RiskStatus;
  owner?: string;
  assetId?: string | null;
  treatmentPlan?: string;
}

export interface RiskQueryDto {
  page?: number;
  limit?: number;
  search?: string;
  status?: RiskStatus;
  scoreBand?: RiskScoreBand;
  likelihood?: number;
  impact?: number;
}

export interface PaginatedRisksDto {
  items: RiskDto[];
  total: number;
  page: number;
  limit: number;
}

export interface HeatmapCellDto {
  likelihood: number;
  impact: number;
  count: number;
  score: number;
  scoreBand: RiskScoreBand;
}

export interface HeatmapSummaryDto {
  matrix: HeatmapCellDto[];
  totalOpenCount: number;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthResponseDto {
  user: UserDto;
  organization: OrganizationDto;
  tokens: AuthTokens;
}

export interface RegisterDto {
  organizationName: string;
  name: string;
  email: string;
  password: string;
  primaryRegion?: string;
}

export interface LoginDto {
  email: string;
  password: string;
}

export interface RefreshDto {
  refreshToken: string;
}

export interface JwtPayload {
  sub: string;
  email: string;
  organizationId: string;
  role: Role;
  actingViaMsspId?: string;
}

export interface SwitchContextDto {
  targetOrganizationId: string;
}

export interface SwitchContextResponseDto {
  accessToken: string;
  expiresIn: string;
  targetOrganization: OrganizationDto;
  actingViaMsspId: string;
}

export interface FrameworkClauseDto {
  id: string;
  frameworkId: string;
  frameworkCode: FrameworkCode;
  code: string;
  title: string;
  createdAt: string;
}

export interface ControlFrameworkMappingDto {
  id: string;
  controlId: string;
  frameworkClauseId: string;
  clauseCode?: string;
  clauseTitle?: string;
  frameworkCode?: FrameworkCode;
  status: MappingStatus;
  confidenceScore?: number | null;
  modelTier: ModelTier;
  reviewedById?: string | null;
  reviewedAt?: string | null;
  createdAt: string;
}

export interface ControlDto {
  id: string;
  organizationId: string;
  name: string;
  code?: string;
  description: string;
  category?: string | null;
  createdAt: string;
  updatedAt: string;
  createdById: string;
  deletedAt?: string | null;
  mappings?: ControlFrameworkMappingDto[];
}

export interface CreateControlDto {
  name: string;
  description: string;
  category?: string;
}

export interface UpdateControlDto {
  name?: string;
  description?: string;
  category?: string;
}

export interface ControlQueryDto {
  page?: number;
  limit?: number;
  search?: string;
  category?: string;
  status?: MappingStatus;
}

export interface PaginatedControlsDto {
  items: ControlDto[];
  total: number;
  page: number;
  limit: number;
}

export interface SuggestMappingsResponseDto {
  jobId: string;
  status: string;
  message: string;
}

export interface MappingJobStatusDto {
  jobId: string;
  status: 'queued' | 'processing' | 'done' | 'failed';
  progress?: number;
  mappings?: ControlFrameworkMappingDto[];
  error?: string;
}

export interface SignOffMappingDto {
  decision: 'APPROVE' | 'OVERRIDE';
  overrideClauseId?: string;
  note?: string;
}

export interface ComplianceTaskDto {
  id: string;
  organizationId: string;
  title: string;
  description?: string | null;
  status: TaskStatus;
  owner: string;
  dueDate?: string | null;
  controlId?: string | null;
  controlName?: string | null;
  createdAt: string;
  updatedAt: string;
  createdById: string;
  deletedAt?: string | null;
}

export interface CreateComplianceTaskDto {
  title: string;
  description?: string;
  status?: TaskStatus;
  owner: string;
  dueDate?: string;
  controlId?: string;
}

export interface UpdateComplianceTaskDto {
  title?: string;
  description?: string;
  status?: TaskStatus;
  owner?: string;
  dueDate?: string | null;
  controlId?: string | null;
}

export interface ComplianceTaskQueryDto {
  page?: number;
  limit?: number;
  search?: string;
  status?: TaskStatus;
  controlId?: string;
}

export interface PaginatedComplianceTasksDto {
  items: ComplianceTaskDto[];
  total: number;
  page: number;
  limit: number;
}

export interface ComplianceTaskSummaryDto {
  overdue: number;
  due30: number;
  due60: number;
  due90: number;
  totalOpen: number;
}

export interface AuditLogQueryDto {
  page?: number;
  limit?: number;
  search?: string;
  entityType?: string;
  action?: string;
  actorId?: string;
  startDate?: string;
  endDate?: string;
}

export interface PaginatedAuditLogsDto {
  items: AuditLogEntryDto[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface UpdateRegionalPodStatusDto {
  status: PodStatus;
}

export function hasRole(userRole: Role, allowedRoles: Role[]): boolean {
  return allowedRoles.includes(userRole);
}

export enum NotificationType {
  DUE_DATE_REMINDER = "DUE_DATE_REMINDER",
  MAPPING_OVERRIDDEN = "MAPPING_OVERRIDDEN",
  TASK_ASSIGNED = "TASK_ASSIGNED",
  POD_STATUS_CHANGED = "POD_STATUS_CHANGED",
  WEEKLY_DIGEST = "WEEKLY_DIGEST",
  RISK_ESCALATION = "RISK_ESCALATION",
}

export interface NotificationDto {
  id: string;
  organizationId: string;
  userId: string;
  type: NotificationType;
  message: string;
  entityType: string;
  entityId: string;
  read: boolean;
  createdAt: string;
}

export interface PaginatedNotificationsDto {
  items: NotificationDto[];
  total: number;
  unreadCount: number;
  page: number;
  limit: number;
}

export interface UpdateSlackWebhookDto {
  webhookUrl: string;
}

export interface UpdateEmailPreferenceDto {
  emailNotifications: boolean;
}

export const OMNIGRC_VERSION = '1.0.0';

export interface HealthCheckDto {
  status: "ok" | "degraded" | "error";
  timestamp: string;
  version?: string;
  gitSha?: string;
  services: {
    database: { status: "up" | "down"; latencyMs?: number };
    redis: { status: "up" | "down" | "mocked"; latencyMs?: number };
    gemini: { status: "configured" | "mocked" };
    claude: { status: "configured" | "mocked" };
    email: { status: "configured" | "console_mock" };
    slack: { status: "configured" | "not_configured" };
    sentry: { status: "configured" | "not_configured" };
  };
}

export interface OnboardingCompleteDto {
  primaryFramework?: string;
  assets?: Array<{
    name: string;
    type: AssetType;
    owner: string;
    criticality: AssetCriticality;
  }>;
}

export interface InviteTeamMemberDto {
  email: string;
  role: Role;
  name?: string;
}

export enum InvitationStatus {
  PENDING = "PENDING",
  ACCEPTED = "ACCEPTED",
  EXPIRED = "EXPIRED",
  REVOKED = "REVOKED",
}

export interface InvitationDto {
  id: string;
  organizationId: string;
  email: string;
  role: Role;
  status: InvitationStatus;
  invitedById: string;
  invitedByName?: string;
  expiresAt: string;
  acceptedAt?: string | null;
  revokedAt?: string | null;
  createdAt: string;
  inviteUrl?: string;
}

export interface CreateInvitationDto {
  email: string;
  role: Role;
  name?: string;
}

export interface AcceptInvitationDto {
  token: string;
  name?: string;
  password?: string;
}

export interface SetupPasswordDto {
  newPassword: string;
}

export interface ValidateInvitationResponseDto {
  valid: boolean;
  email?: string;
  organizationName?: string;
  role?: Role;
  expiresAt?: string;
  reason?: string;
}

export enum DeploymentModel {
  MSSP_SHARED = "MSSP_SHARED",
  PRIVATE_MSSP = "PRIVATE_MSSP",
  SELF_HOSTED = "SELF_HOSTED",
}

export enum DeploymentEnvironment {
  PRODUCTION = "PRODUCTION",
  UAT = "UAT",
  DR = "DR",
  DEVELOPMENT = "DEVELOPMENT",
}

export enum ActivationState {
  PENDING = "PENDING",
  ACTIVE = "ACTIVE",
  SUSPENDED = "SUSPENDED",
  DECOMMISSIONED = "DECOMMISSIONED",
}

export enum InfrastructureOwner {
  ARAV = "ARAV",
  CUSTOMER = "CUSTOMER",
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

export interface DeploymentDto {
  id: string;
  organizationId: string;
  customerId?: string | null;
  commercialAgreementId?: string | null;
  deploymentModel: DeploymentModel;
  environment: DeploymentEnvironment;
  version: string;
  activationState: ActivationState;
  infrastructureOwner: InfrastructureOwner;
  licenseId?: string | null;
  lastCheckInAt?: string | null;
  createdAt: string;
  updatedAt: string;
  registrationSecret?: string;
}

export interface CreateDeploymentDto {
  organizationId: string;
  customerId?: string;
  commercialAgreementId?: string;
  deploymentModel: DeploymentModel;
  environment?: DeploymentEnvironment;
  version?: string;
}

export interface UpdateDeploymentStateDto {
  activationState: ActivationState;
}

export interface DeploymentCheckInDto {
  registrationSecret: string;
  version?: string;
}

export interface DeploymentCheckInResponseDto {
  success: boolean;
  deploymentId: string;
  lastCheckInAt: string;
  version: string;
  activationState: ActivationState;
  artifact?: SignedLicenseArtifact;
}

export enum LicenseProduct {
  OMNIGRC = "OMNIGRC",
}

export enum LicenseStatus {
  TRIAL = "TRIAL",
  ACTIVE = "ACTIVE",
  EXPIRED = "EXPIRED",
}

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

export interface CreateEntitlementDto {
  licenseId: string;
  code: string;
  name: string;
  value?: any;
  enabled?: boolean;
}

export interface LicenseDto {
  id: string;
  commercialAgreementId: string;
  product: LicenseProduct;
  status: LicenseStatus;
  issuedAt: string;
  startsAt: string;
  expiresAt: string;
  maxDeployments: number;
  createdAt: string;
  updatedAt: string;
  entitlements?: EntitlementDto[];
  deployments?: DeploymentDto[];
  deploymentsCount?: number;
}

export interface CreateLicenseDto {
  commercialAgreementId: string;
  product?: LicenseProduct;
  status?: LicenseStatus;
  startsAt: string;
  expiresAt: string;
  maxDeployments?: number;
}

export interface AssociateLicenseDeploymentDto {
  deploymentId: string;
  licenseId: string;
}

export interface CreateCustomerDto {
  name: string;
}

export interface CreateCommercialAgreementDto {
  customerId: string;
}

export interface SignedLicenseEntitlement {
  code: string;
  name: string;
  enabled: boolean;
  value?: any;
}

export interface SignedLicensePayload {
  licenseId: string;
  licenseFormatVersion: string;
  product: LicenseProduct;
  status: LicenseStatus;
  customerId: string;
  commercialAgreementId: string;
  deploymentId: string;
  organizationId: string;
  startsAt: string;
  expiresAt: string;
  maxDeployments: number;
  entitlements: SignedLicenseEntitlement[];
  issuedAt: string;
  keyId: string;
}

export interface SignedLicenseArtifact {
  formatVersion: string;
  keyId: string;
  algorithm: 'Ed25519';
  payload: SignedLicensePayload;
  signature: string;
}

export interface ActivateDeploymentDto {
  registrationSecret: string;
}

export interface SignedLicenseArtifactResponseDto {
  success: boolean;
  deploymentId: string;
  activationState: ActivationState;
  artifact: SignedLicenseArtifact;
}

export type RuntimeLicenseState = 'VALID' | 'EXPIRED' | 'INVALID_OR_UNAVAILABLE';

export interface EvaluatedLicenseState {
  state: RuntimeLicenseState;
  reason?: string;
  expiresAt?: string;
  startsAt?: string;
  payload?: SignedLicensePayload;
}

export interface LicenseExpiredErrorResponseDto {
  statusCode: number;
  error: string;
  message: string;
  code: 'LICENSE_EXPIRED';
  expiresAt?: string;
}

export interface LicenseUnavailableErrorResponseDto {
  statusCode: number;
  error: string;
  message: string;
  code: 'LICENSE_UNAVAILABLE';
}

export function evaluateLicenseStatus(
  payload: SignedLicensePayload | null | undefined,
  now: Date = new Date(),
): EvaluatedLicenseState {
  if (!payload || !payload.expiresAt || !payload.startsAt) {
    return {
      state: 'INVALID_OR_UNAVAILABLE',
      reason: 'Missing or malformed license payload',
    };
  }

  const startsAtDate = new Date(payload.startsAt);
  const expiresAtDate = new Date(payload.expiresAt);

  if (isNaN(startsAtDate.getTime()) || isNaN(expiresAtDate.getTime())) {
    return {
      state: 'INVALID_OR_UNAVAILABLE',
      reason: 'Invalid timestamp format in license payload',
    };
  }

  // 5-minute clock drift allowance for startsAt
  if (now.getTime() < startsAtDate.getTime() - 5 * 60 * 1000) {
    return {
      state: 'INVALID_OR_UNAVAILABLE',
      reason: 'License startsAt is in the future',
      startsAt: payload.startsAt,
      expiresAt: payload.expiresAt,
      payload,
    };
  }

  if (payload.status === LicenseStatus.EXPIRED || now.getTime() > expiresAtDate.getTime()) {
    return {
      state: 'EXPIRED',
      reason: 'License validity period has expired',
      startsAt: payload.startsAt,
      expiresAt: payload.expiresAt,
      payload,
    };
  }

  return {
    state: 'VALID',
    startsAt: payload.startsAt,
    expiresAt: payload.expiresAt,
    payload,
  };
}

export const DEV_LICENSE_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEAKXvoa0IDQQhIu4RGDOdFE+VGX8i5mUnunoaoxB9i+cY=\n-----END PUBLIC KEY-----\n`;








