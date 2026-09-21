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

export enum AssetEnvironment {
  PRODUCTION = "PRODUCTION",
  STAGING = "STAGING",
  DEVELOPMENT = "DEVELOPMENT",
  OTHER = "OTHER",
}

export enum VulnerabilitySeverity {
  CRITICAL = "CRITICAL",
  HIGH = "HIGH",
  MEDIUM = "MEDIUM",
  LOW = "LOW",
}

export enum VulnerabilityStatus {
  OPEN = "OPEN",
  IN_REMEDIATION = "IN_REMEDIATION",
  RESOLVED = "RESOLVED",
  RISK_ACCEPTED = "RISK_ACCEPTED",
}

export enum PolicyStatus {
  DRAFT = "DRAFT",
  UNDER_REVIEW = "UNDER_REVIEW",
  APPROVED = "APPROVED",
  PUBLISHED = "PUBLISHED",
  RETIRED = "RETIRED",
}

export enum PolicyExceptionStatus {
  PENDING = "PENDING",
  APPROVED = "APPROVED",
  REJECTED = "REJECTED",
  EXPIRED = "EXPIRED",
}

export enum VendorCriticality {
  CRITICAL = "CRITICAL",
  HIGH = "HIGH",
  MEDIUM = "MEDIUM",
  LOW = "LOW",
}

export enum VendorStatus {
  ACTIVE = "ACTIVE",
  UNDER_REVIEW = "UNDER_REVIEW",
  INACTIVE = "INACTIVE",
}

export enum VendorAssessmentStatus {
  SCHEDULED = "SCHEDULED",
  IN_PROGRESS = "IN_PROGRESS",
  COMPLETED = "COMPLETED",
  OVERDUE = "OVERDUE",
}

export enum ObligationCadence {
  ONE_OFF = "ONE_OFF",
  MONTHLY = "MONTHLY",
  QUARTERLY = "QUARTERLY",
  ANNUAL = "ANNUAL",
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

export enum FrameworkVersionStatus {
  DRAFT = "DRAFT",
  ACTIVE = "ACTIVE",
  SUPERSEDED = "SUPERSEDED",
  RETIRED = "RETIRED",
}

export enum FrameworkReferenceType {
  CLAUSE = "CLAUSE",
  SUBCLAUSE = "SUBCLAUSE",
  ARTICLE = "ARTICLE",
  PARAGRAPH = "PARAGRAPH",
  SECTION = "SECTION",
  CRITERION = "CRITERION",
  CONTROL = "CONTROL",
  FOCUS_POINT = "FOCUS_POINT",
  REQUIREMENT = "REQUIREMENT",
  IMPLEMENTATION_SPECIFICATION = "IMPLEMENTATION_SPECIFICATION",
  ANNEX = "ANNEX",
  DOMAINS = "DOMAINS",
}

export interface FrameworkVersionDto {
  id: string;
  frameworkId: string;
  version: string;
  name: string;
  status: FrameworkVersionStatus;
  publisher?: string | null;
  effectiveDate?: string | null;
  provenance?: Record<string, any> | null;
  createdAt: string;
  updatedAt: string;
  referencesCount?: number;
}

export interface FrameworkReferenceDto {
  id: string;
  frameworkVersionId: string;
  parentRefId?: string | null;
  type: FrameworkReferenceType;
  identifier: string;
  title: string;
  description?: string | null;
  normativeText?: string | null;
  sortOrder: number;
  provenance?: Record<string, any> | null;
  createdAt: string;
  updatedAt: string;
  childRefs?: FrameworkReferenceDto[];
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
  frameworkClauseId?: string | null;
  frameworkReferenceId?: string | null;
  clauseCode?: string;
  clauseTitle?: string;
  referenceIdentifier?: string;
  referenceTitle?: string;
  referenceType?: FrameworkReferenceType;
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

export interface VulnerabilityAssetDto {
  id: string;
  assetId: string;
  assetName?: string;
}

export interface VulnerabilityDto {
  id: string;
  organizationId: string;
  cveId?: string | null;
  title: string;
  description?: string | null;
  severity: VulnerabilitySeverity;
  status: VulnerabilityStatus;
  discoveredAt: Date | string;
  lastSeenAt: Date | string;
  remediationOwner: string;
  dueDate?: Date | string | null;
  remediationNotes?: string | null;
  createdById: string;
  createdAt: Date | string;
  updatedAt: Date | string;
  affectedAssets?: VulnerabilityAssetDto[];
}

export interface PaginatedVulnerabilitiesDto {
  items: VulnerabilityDto[];
  total: number;
  page: number;
  limit: number;
}

export interface PolicyVersionDto {
  id: string;
  policyId: string;
  versionNumber: string;
  content: string;
  changeLog?: string | null;
  createdById: string;
  createdAt: Date | string;
}

export interface PolicyAttestationDto {
  id: string;
  organizationId: string;
  policyVersionId: string;
  userId: string;
  attestedAt: Date | string;
  ipAddress?: string | null;
}

export interface PolicyExceptionDto {
  id: string;
  organizationId: string;
  policyId: string;
  title: string;
  reason: string;
  requestedById: string;
  approvedById?: string | null;
  status: PolicyExceptionStatus;
  expiresAt?: Date | string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface PolicyDto {
  id: string;
  organizationId: string;
  code: string;
  title: string;
  description?: string | null;
  category: string;
  status: PolicyStatus;
  ownerId: string;
  businessUnit?: string | null;
  publishedVersionId?: string | null;
  publishedVersion?: PolicyVersionDto | null;
  versions?: PolicyVersionDto[];
  effectiveDate?: Date | string | null;
  reviewDate?: Date | string | null;
  reviewCadenceDays: number;
  createdById: string;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface PaginatedPoliciesDto {
  items: PolicyDto[];
  total: number;
  page: number;
  limit: number;
}

export interface VendorAssessmentDto {
  id: string;
  organizationId: string;
  vendorId: string;
  title: string;
  score?: number | null;
  status: VendorAssessmentStatus;
  evaluatorId: string;
  riskId?: string | null;
  complianceTaskId?: string | null;
  completedAt?: Date | string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface VendorDto {
  id: string;
  organizationId: string;
  name: string;
  description?: string | null;
  category?: string | null;
  criticality: VendorCriticality;
  status: VendorStatus;
  owner: string;
  department?: string | null;
  reviewCadenceDays: number;
  lastReviewedAt?: Date | string | null;
  nextReviewDate?: Date | string | null;
  websiteUrl?: string | null;
  createdById: string;
  createdAt: Date | string;
  updatedAt: Date | string;
  assessments?: VendorAssessmentDto[];
  assetCount?: number;
}

export interface PaginatedVendorsDto {
  items: VendorDto[];
  total: number;
  page: number;
  limit: number;
}

// Phase 12: Business Audit Management Enums & DTOs

export enum AuditPlanStatus {
  DRAFT = "DRAFT",
  PLANNED = "PLANNED",
  IN_PROGRESS = "IN_PROGRESS",
  COMPLETED = "COMPLETED",
  ARCHIVED = "ARCHIVED",
}

export enum AuditScheduleStatus {
  SCHEDULED = "SCHEDULED",
  IN_PROGRESS = "IN_PROGRESS",
  COMPLETED = "COMPLETED",
  CANCELLED = "CANCELLED",
}

export enum AuditAssessmentStatus {
  IN_PROGRESS = "IN_PROGRESS",
  UNDER_REVIEW = "UNDER_REVIEW",
  COMPLETED = "COMPLETED",
}

export enum AuditCheckResult {
  NOT_EVALUATED = "NOT_EVALUATED",
  COMPLIANT = "COMPLIANT",
  PARTIALLY_COMPLIANT = "PARTIALLY_COMPLIANT",
  NON_COMPLIANT = "NON_COMPLIANT",
  NOT_APPLICABLE = "NOT_APPLICABLE",
}

export enum FindingStatus {
  OPEN = "OPEN",
  IN_REMEDIATION = "IN_REMEDIATION",
  READY_FOR_VERIFICATION = "READY_FOR_VERIFICATION",
  VERIFIED = "VERIFIED",
  CLOSED = "CLOSED",
}

export enum CapaStatus {
  OPEN = "OPEN",
  IN_PROGRESS = "IN_PROGRESS",
  COMPLETED = "COMPLETED",
  VERIFIED = "VERIFIED",
  CLOSED = "CLOSED",
}

export interface AuditEvidenceDto {
  id: string;
  organizationId: string;
  checkItemId?: string | null;
  findingId?: string | null;
  fileName: string;
  fileUrl: string;
  fileSize?: number | null;
  mimeType?: string | null;
  uploadedById: string;
  createdAt: Date | string;
}

export interface AuditCheckItemDto {
  id: string;
  organizationId: string;
  assessmentId: string;
  controlId?: string | null;
  controlName?: string | null;
  title: string;
  description?: string | null;
  result: AuditCheckResult;
  notes?: string | null;
  evidence?: AuditEvidenceDto[];
  createdById: string;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface AuditCapaDto {
  id: string;
  organizationId: string;
  findingId: string;
  title: string;
  correctiveAction: string;
  preventiveAction?: string | null;
  ownerId: string;
  dueDate?: Date | string | null;
  status: CapaStatus;
  completedAt?: Date | string | null;
  verifiedById?: string | null;
  verifiedAt?: Date | string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface AuditFindingDto {
  id: string;
  organizationId: string;
  assessmentId: string;
  checkItemId?: string | null;
  title: string;
  description?: string | null;
  severity: VulnerabilitySeverity;
  status: FindingStatus;
  ownerId: string;
  dueDate?: Date | string | null;
  riskId?: string | null;
  remediationPlan?: string | null;
  verificationNotes?: string | null;
  verifiedById?: string | null;
  verifiedAt?: Date | string | null;
  createdById: string;
  createdAt: Date | string;
  updatedAt: Date | string;
  capas?: AuditCapaDto[];
  evidence?: AuditEvidenceDto[];
}

export interface AuditAssessmentDto {
  id: string;
  organizationId: string;
  auditPlanId: string;
  scheduleId?: string | null;
  auditorId: string;
  status: AuditAssessmentStatus;
  score: number;
  summary?: string | null;
  startedAt: Date | string;
  completedAt?: Date | string | null;
  createdById: string;
  createdAt: Date | string;
  updatedAt: Date | string;
  checkItems?: AuditCheckItemDto[];
  findings?: AuditFindingDto[];
}

export interface AuditScheduleDto {
  id: string;
  organizationId: string;
  auditPlanId: string;
  scheduledStartDate: Date | string;
  scheduledEndDate: Date | string;
  leadAuditorId: string;
  status: AuditScheduleStatus;
  recurrence?: ObligationCadence | null;
  nextAuditDate?: Date | string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface AuditPlanDto {
  id: string;
  organizationId: string;
  title: string;
  objective?: string | null;
  scope?: string | null;
  frameworkCode?: FrameworkCode | string | null;
  ownerId: string;
  plannedStartDate?: Date | string | null;
  plannedEndDate?: Date | string | null;
  status: AuditPlanStatus;
  createdById: string;
  createdAt: Date | string;
  updatedAt: Date | string;
  schedules?: AuditScheduleDto[];
  assessments?: AuditAssessmentDto[];
}

export interface PaginatedAuditPlansDto {
  items: AuditPlanDto[];
  total: number;
  page: number;
  limit: number;
}

export interface PaginatedAuditFindingsDto {
  items: AuditFindingDto[];
  total: number;
  page: number;
  limit: number;
}

/**
 * Authoritative Audit Score Definition:
 * COMPLIANT / (TOTAL_CHECK_ITEMS - NOT_APPLICABLE_CHECK_ITEMS) * 100
 * Explicitly handles the zero-applicable-items case (returns 0).
 */
export function calculateAuditScore(items: { result: AuditCheckResult }[]): number {
  if (!items || items.length === 0) return 0;
  const applicableItems = items.filter((i) => i.result !== AuditCheckResult.NOT_APPLICABLE);
  if (applicableItems.length === 0) return 0;
  const compliantCount = items.filter((i) => i.result === AuditCheckResult.COMPLIANT).length;
  return Number(((compliantCount / applicableItems.length) * 100).toFixed(2));
}

// Phase 13: Authoritative Metrics DTO Interfaces

export interface AssetMetricsDto {
  total: number;
  criticalityHighCount: number;
  managedCount: number;
  unmanagedCount: number;
  byEnvironment: Record<string, number>;
  byType: Record<string, number>;
}

export interface VulnerabilityMetricsDto {
  total: number;
  openCount: number;
  overdueCount: number;
  resolvedCount: number;
  riskAcceptedCount: number;
  bySeverity: Record<string, number>;
}

export interface PolicyMetricsDto {
  total: number;
  publishedCount: number;
  overdueReviewCount: number;
  byStatus: Record<string, number>;
}

export interface VendorMetricsDto {
  total: number;
  requiringReviewCount: number;
  assessmentsOverdueCount: number;
  byCriticality: Record<string, number>;
  byStatus: Record<string, number>;
}

export interface ObligationMetricsDto {
  total: number;
  upcomingCount: number;
  overdueCount: number;
  completedCount: number;
  completionRate: number;
}

export interface AuditMetricsDto {
  totalPlans: number;
  assessmentCount: number;
  overallAuditScore: number;
  findingsTotal: number;
  findingsOpenCount: number;
  findingsOverdueCount: number;
  capaOpenCount: number;
  byPlanStatus: Record<string, number>;
  findingsBySeverity: Record<string, number>;
}

export interface RiskMetricsDto {
  totalOpen: number;
  byScoreBand: {
    HIGH: number;
    MEDIUM: number;
    LOW: number;
  };
  byStatus: Record<string, number>;
}

export interface AttentionItemDto {
  id: string;
  domain: 'VULNERABILITY' | 'OBLIGATION' | 'AUDIT_FINDING' | 'CAPA' | 'POLICY' | 'VENDOR';
  title: string;
  severityOrPriority: string;
  dueDate?: string | null;
  targetView: string;
}

export interface OverviewMetricsDto {
  timestamp: string;
  organizationId: string;
  assets: AssetMetricsDto;
  vulnerabilities: VulnerabilityMetricsDto;
  policies: PolicyMetricsDto;
  vendors: VendorMetricsDto;
  obligations: ObligationMetricsDto;
  audits: AuditMetricsDto;
  risks: RiskMetricsDto;
  attentionRequired?: AttentionItemDto[];
}

// Phase 14: Executive Dashboard & Configurable Widget System DTOs

export interface WidgetLayoutItem {
  id: string;
  visible: boolean;
  position: number;
}

export interface UserDashboardPreferenceDto {
  id: string;
  userId: string;
  organizationId: string;
  configJson: {
    version: number;
    layout: WidgetLayoutItem[];
  };
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface UpdateDashboardPreferenceDto {
  layout: WidgetLayoutItem[];
}

export const DEFAULT_WIDGET_LAYOUT: WidgetLayoutItem[] = [
  { id: 'risk_overview', visible: true, position: 0 },
  { id: 'compliance_obligations', visible: true, position: 1 },
  { id: 'audit_readiness', visible: true, position: 2 },
  { id: 'vulnerability_posture', visible: true, position: 3 },
  { id: 'policy_governance', visible: true, position: 4 },
  { id: 'vendor_risk', visible: true, position: 5 },
  { id: 'asset_inventory', visible: true, position: 6 },
];

// Phase 15: Reporting & Exports Enums & DTOs

export enum ReportType {
  EXECUTIVE_GRC_POSTURE = "executive_grc_posture",
  VULNERABILITY_REPORT = "vulnerability_report",
  ASSET_INVENTORY_REPORT = "asset_inventory_report",
  POLICY_GOVERNANCE_REPORT = "policy_governance_report",
  VENDOR_RISK_REPORT = "vendor_risk_report",
  COMPLIANCE_OBLIGATION_REPORT = "compliance_obligation_report",
  BUSINESS_AUDIT_REPORT = "business_audit_report",
  RISK_REGISTER_REPORT = "risk_register_report",
}

export type ExportFormat = "csv" | "xlsx";

export interface ReportColumnDto {
  key: string;
  header: string;
  dataType?: "string" | "number" | "date" | "boolean" | "badge";
}

export interface ReportMetaDto {
  id: ReportType;
  title: string;
  category: string;
  description: string;
  supportedFilters: string[];
  allowlistedSortFields: string[];
  defaultSortBy?: string;
  defaultSortDirection?: "asc" | "desc";
  exportFormats: ExportFormat[];
  columns: ReportColumnDto[];
}

export interface ReportQueryDto {
  page?: number;
  limit?: number;
  search?: string;
  sortBy?: string;
  sortDirection?: "asc" | "desc";
  status?: string;
  severity?: VulnerabilitySeverity | string;
  criticality?: AssetCriticality | VendorCriticality | string;
  environment?: AssetEnvironment | string;
  type?: AssetType | string;
  cadence?: ObligationCadence | string;
  scoreBand?: RiskScoreBand | string;
  overdue?: boolean;
  upcoming?: boolean;
  overdueReview?: boolean;
  requiringReview?: boolean;
  assetId?: string;
  format?: ExportFormat;
}

export interface ReportResponseDto<T = any> {
  reportType: ReportType;
  generatedAt: string;
  organizationId: string;
  appliedFilters: Record<string, any>;
  total: number;
  page: number;
  limit: number;
  data: T[];
}

// Phase 17: GRC Workspace Expansion DTOs

export enum IncidentSeverity {
  CRITICAL = "CRITICAL",
  HIGH = "HIGH",
  MEDIUM = "MEDIUM",
  LOW = "LOW",
}

export enum IncidentStatus {
  OPEN = "OPEN",
  IN_INVESTIGATION = "IN_INVESTIGATION",
  CONTAINED = "CONTAINED",
  RESOLVED = "RESOLVED",
  CLOSED = "CLOSED",
}

export interface IncidentDto {
  id: string;
  organizationId: string;
  title: string;
  description?: string | null;
  severity: IncidentSeverity;
  status: IncidentStatus;
  owner?: string | null;
  detectedAt: Date | string;
  containedAt?: Date | string | null;
  resolvedAt?: Date | string | null;
  dueDate?: Date | string | null;
  rootCause?: string | null;
  affectedAssetId?: string | null;
  affectedAssetName?: string | null;
  createdById: string;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface CreateIncidentDto {
  title: string;
  description?: string;
  severity?: IncidentSeverity;
  status?: IncidentStatus;
  owner?: string;
  detectedAt?: Date | string;
  containedAt?: Date | string;
  resolvedAt?: Date | string;
  dueDate?: Date | string;
  rootCause?: string;
  affectedAssetId?: string;
}

export interface UpdateIncidentDto {
  title?: string;
  description?: string;
  severity?: IncidentSeverity;
  status?: IncidentStatus;
  owner?: string;
  detectedAt?: Date | string;
  containedAt?: Date | string | null;
  resolvedAt?: Date | string | null;
  dueDate?: Date | string | null;
  rootCause?: string;
  affectedAssetId?: string | null;
}

export interface IncidentQueryDto {
  page?: number;
  limit?: number;
  search?: string;
  severity?: IncidentSeverity;
  status?: IncidentStatus;
}

export interface PaginatedIncidentsDto {
  items: IncidentDto[];
  total: number;
  page: number;
  limit: number;
}

export interface RemediationActionDto {
  id: string;
  sourceType: 'AUDIT_CAPA' | 'VULNERABILITY' | 'RISK_TREATMENT';
  sourceId: string;
  title: string;
  description?: string | null;
  organizationId: string;
  owner?: string | null;
  status: string;
  priorityOrSeverity: string;
  dueDate?: Date | string | null;
  isOverdue: boolean;
  originatingDomain: 'Audit' | 'Vulnerability' | 'Risk';
  sourceReferenceUrl: string;
}

export interface RemediationQueryDto {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  owner?: string;
  overdueOnly?: boolean;
  sourceType?: 'AUDIT_CAPA' | 'VULNERABILITY' | 'RISK_TREATMENT';
}

export interface PaginatedRemediationActionsDto {
  items: RemediationActionDto[];
  total: number;
  page: number;
  limit: number;
}

export interface EvidenceVaultItemDto {
  id: string;
  title: string;
  description?: string | null;
  sourceDomain: 'AUDIT' | 'CONTROL' | 'POLICY' | 'TASK' | 'INCIDENT';
  sourceEntityId?: string | null;
  evidenceUrl: string;
  fileSize?: number | null;
  mimeType?: string | null;
  uploadedById?: string | null;
  createdAt: Date | string;
  associatedReference?: string | null;
}

export interface EvidenceVaultQueryDto {
  page?: number;
  limit?: number;
  search?: string;
  domain?: 'AUDIT' | 'CONTROL' | 'POLICY' | 'TASK' | 'INCIDENT';
}

export interface PaginatedEvidenceVaultDto {
  items: EvidenceVaultItemDto[];
  total: number;
  page: number;
  limit: number;
}

export interface FrameworkClauseItemDto {
  id: string;
  frameworkId: string;
  code: string;
  title: string;
  description?: string | null;
}

export interface FrameworkItemDto {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  version?: string | null;
  isSystem: boolean;
  organizationId?: string | null;
  clausesCount: number;
  clauses?: FrameworkClauseItemDto[];
  createdAt: Date | string;
}

export interface CustomFrameworkImportDto {
  code: string;
  name: string;
  description?: string;
  version?: string;
  clauses: Array<{
    code: string;
    title: string;
    description?: string;
  }>;
}

export interface IntegrationConnectorDto {
  id: string;
  name: string;
  category: 'EMAIL' | 'COLLABORATION' | 'AI_LLM' | 'SIEM_LOGS';
  status: 'CONFIGURED' | 'AVAILABLE' | 'NOT_CONFIGURED';
  description: string;
  details?: Record<string, any>;
}

export interface MsspClientSummaryDto {
  id: string;
  name: string;
  type: OrgType;
  primaryRegion: string;
  primaryFramework?: string | null;
  createdAt: string;
  userCount: number;
  openRiskCount: number;
  openIncidentCount: number;
  complianceCompletionRate: number;
}
