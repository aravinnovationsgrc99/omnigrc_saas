export enum Role {
  ADMIN = "ADMIN",
  ANALYST = "ANALYST",
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

export interface UserDto {
  id: string;
  organizationId: string;
  name: string;
  email: string;
  role: Role;
  createdAt: string;
}

export interface OrganizationDto {
  id: string;
  name: string;
  primaryRegion: string;
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
