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

export interface HealthCheckDto {
  status: "ok" | "degraded" | "error";
  timestamp: string;
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



