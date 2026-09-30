import {
  ApiErrorResponse,
  OperatorProfile,
  LoginSuccessResponse,
  OrganizationControlState,
  OrganizationStateTransitionLog,
  OrganizationTransitionPayload,
  TransitionResponse,
  DeploymentSummary,
  LicenseDto,
  EntitlementDto,
  CreateLicensePayload,
  UpdateLicensePayload,
  GrantEntitlementPayload,
  CustomerDto,
  CommercialAgreementDto,
  SignedLicenseArtifact,
  CommercialAuditLog,
  BreakGlassSessionDto,
  RequestBreakGlassPayload,
  ApproveBreakGlassPayload,
  ExecuteBreakGlassPayload,
  ReviewBreakGlassPayload,
  CreateOperatorPayload,
  UpdateOperatorRolePayload,
  ServiceCatalogItem,
  UpdateGlobalServiceStatePayload,
  UpdateOrganizationServiceOverridePayload,
  ServiceStateMutationResponse,
  ControlPlaneAuditLogEntry,
  QueryAuditLogsParams,
  AuditLogsResponse,
  PlatformAnnouncement,
  QueryAnnouncementsParams,
  AnnouncementsResponse,
  CreateAnnouncementDto,
  UpdateAnnouncementDto,
} from '../types/control-plane';

export class ControlPlaneApiError extends Error {
  public readonly statusCode: number;
  public readonly code?: string;
  public readonly correlationId?: string;
  public readonly details?: any;

  constructor(statusCode: number, message: string, code?: string, correlationId?: string, details?: any) {
    super(message);
    this.name = 'ControlPlaneApiError';
    this.statusCode = statusCode;
    this.code = code;
    this.correlationId = correlationId;
    this.details = details;
  }
}

// In-memory token storage (NO localStorage, NO sessionStorage)
let inMemoryAccessToken: string | null = null;
let inMemoryRefreshToken: string | null = null;

export function setAuthTokens(accessToken: string | null, refreshToken: string | null) {
  inMemoryAccessToken = accessToken;
  inMemoryRefreshToken = refreshToken;
}

export function getAccessToken(): string | null {
  return inMemoryAccessToken;
}

export function getRefreshToken(): string | null {
  return inMemoryRefreshToken;
}

export function clearAuthTokens() {
  inMemoryAccessToken = null;
  inMemoryRefreshToken = null;
}

function getBaseUrl(): string {
  if (typeof window !== 'undefined') {
    return process.env.NEXT_PUBLIC_CONTROL_PLANE_API_URL || 'http://localhost:3001';
  }
  return process.env.CONTROL_PLANE_API_URL || 'http://localhost:3001';
}

function generateCorrelationId(): string {
  return `cp_web_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  isRetry: boolean = false,
): Promise<T> {
  const baseUrl = getBaseUrl();
  const url = `${baseUrl.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;
  const correlationId = generateCorrelationId();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'x-correlation-id': correlationId,
    ...(options.headers as Record<string, string>),
  };

  if (inMemoryAccessToken && !headers['Authorization']) {
    headers['Authorization'] = `Bearer ${inMemoryAccessToken}`;
  }

  try {
    const response = await fetch(url, {
      ...options,
      headers,
      credentials: 'same-origin',
    });

    if (response.status === 401 && !isRetry && inMemoryRefreshToken && !path.includes('operator-auth/login')) {
      // Attempt silent refresh
      const refreshed = await refreshSession();
      if (refreshed) {
        return request<T>(path, options, true);
      } else {
        clearAuthTokens();
        if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
          window.location.href = '/login?reason=session_expired';
        }
        throw new ControlPlaneApiError(401, 'Session expired. Please log in again.', 'SESSION_EXPIRED', correlationId);
      }
    }

    if (!response.ok) {
      let errorBody: ApiErrorResponse | null = null;
      try {
        errorBody = await response.json();
      } catch {
        /* non-json error */
      }

      const message = errorBody?.message || response.statusText || `Request failed with status ${response.status}`;
      const code = errorBody?.code;
      const respCorrelationId = errorBody?.correlationId || response.headers.get('x-correlation-id') || correlationId;

      throw new ControlPlaneApiError(response.status, message, code, respCorrelationId, errorBody?.details);
    }

    if (response.status === 204) {
      return {} as T;
    }

    return await response.json();
  } catch (err: any) {
    if (err instanceof ControlPlaneApiError) {
      throw err;
    }
    throw new ControlPlaneApiError(
      503,
      `Control Plane API is currently unreachable: ${err.message || 'Network error'}`,
      'API_UNREACHABLE',
      correlationId,
    );
  }
}

export async function refreshSession(): Promise<boolean> {
  if (!inMemoryRefreshToken) return false;

  try {
    const baseUrl = getBaseUrl();
    const response = await fetch(`${baseUrl.replace(/\/$/, '')}/v1/operator-auth/refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-correlation-id': generateCorrelationId(),
      },
      body: JSON.stringify({ refreshToken: inMemoryRefreshToken }),
    });

    if (!response.ok) {
      clearAuthTokens();
      return false;
    }

    const data: LoginSuccessResponse = await response.json();
    setAuthTokens(data.accessToken, data.refreshToken);
    return true;
  } catch {
    clearAuthTokens();
    return false;
  }
}

export const controlPlaneApi = {
  // Auth Operations
  login: async (email: string, password: string, totpCode?: string) => {
    const data = await request<LoginSuccessResponse>('v1/operator-auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password, totpCode }),
    });
    setAuthTokens(data.accessToken, data.refreshToken);
    return data;
  },

  logout: async () => {
    try {
      await request('v1/operator-auth/logout', { method: 'POST' });
    } catch {
      /* ignore cleanup error */
    } finally {
      clearAuthTokens();
    }
  },

  getMe: async (): Promise<OperatorProfile> => {
    return request<OperatorProfile>('v1/operator-auth/me', { method: 'GET' });
  },

  // Operator Administration Operations
  listOperators: async (): Promise<OperatorProfile[]> => {
    return request<OperatorProfile[]>('v1/operators', { method: 'GET' });
  },

  getOperator: async (id: string): Promise<OperatorProfile> => {
    return request<OperatorProfile>(`v1/operators/${encodeURIComponent(id)}`, { method: 'GET' });
  },

  createOperator: async (payload: CreateOperatorPayload): Promise<OperatorProfile> => {
    return request<OperatorProfile>('v1/operators', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  updateOperatorRole: async (id: string, payload: UpdateOperatorRolePayload): Promise<OperatorProfile> => {
    return request<OperatorProfile>(`v1/operators/${encodeURIComponent(id)}/role`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },

  suspendOperator: async (id: string): Promise<OperatorProfile> => {
    return request<OperatorProfile>(`v1/operators/${encodeURIComponent(id)}/suspend`, { method: 'POST' });
  },

  reactivateOperator: async (id: string): Promise<OperatorProfile> => {
    return request<OperatorProfile>(`v1/operators/${encodeURIComponent(id)}/reactivate`, { method: 'POST' });
  },

  revokeOperatorSessions: async (id: string): Promise<{ success: boolean; revokedSessionsCount: number }> => {
    return request<{ success: boolean; revokedSessionsCount: number }>(`v1/operators/${encodeURIComponent(id)}/revoke-sessions`, { method: 'POST' });
  },

  // Organization Control Operations
  listOrganizations: async (): Promise<OrganizationControlState[]> => {
    return request<OrganizationControlState[]>('v1/organizations', { method: 'GET' });
  },

  getOrganization: async (organizationId: string): Promise<OrganizationControlState> => {
    return request<OrganizationControlState>(`v1/organizations/${encodeURIComponent(organizationId)}`, { method: 'GET' });
  },

  getOrganizationHistory: async (organizationId: string): Promise<OrganizationStateTransitionLog[]> => {
    return request<OrganizationStateTransitionLog[]>(`v1/organizations/${encodeURIComponent(organizationId)}/history`, { method: 'GET' });
  },

  transitionOrganizationState: async (
    organizationId: string,
    payload: OrganizationTransitionPayload,
  ): Promise<TransitionResponse> => {
    return request<TransitionResponse>(`v1/organizations/${encodeURIComponent(organizationId)}/control-state/transition`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  listDeployments: async (query?: string | {
    organizationId?: string;
    deploymentModel?: string;
    activationState?: string;
  }): Promise<DeploymentSummary[]> => {
    const params = new URLSearchParams();
    if (typeof query === 'string') {
      if (query) params.append('organizationId', query);
    } else if (query) {
      if (query.organizationId) params.append('organizationId', query.organizationId);
      if (query.deploymentModel) params.append('deploymentModel', query.deploymentModel);
      if (query.activationState) params.append('activationState', query.activationState);
    }
    const queryString = params.toString() ? `?${params.toString()}` : '';
    return request<DeploymentSummary[]>(`v1/deployments${queryString}`, { method: 'GET' });
  },

  getDeployment: async (id: string): Promise<DeploymentSummary> => {
    return request<DeploymentSummary>(`v1/deployments/${encodeURIComponent(id)}`, { method: 'GET' });
  },

  getDeploymentHistory: async (id: string): Promise<CommercialAuditLog[]> => {
    return request<CommercialAuditLog[]>(`v1/deployments/${encodeURIComponent(id)}/history`, { method: 'GET' });
  },

  updateDeploymentState: async (id: string, activationState: string, reason?: string): Promise<DeploymentSummary> => {
    return request<DeploymentSummary>(`v1/deployments/${encodeURIComponent(id)}/state`, {
      method: 'PATCH',
      body: JSON.stringify({ activationState, reason }),
    });
  },

  getDeploymentLicenseArtifact: async (id: string): Promise<SignedLicenseArtifact> => {
    return request<SignedLicenseArtifact>(`v1/deployments/${encodeURIComponent(id)}/license-artifact`, { method: 'GET' });
  },

  // Commercial Licensing Operations
  listLicenses: async (query?: { commercialAgreementId?: string; status?: string }): Promise<LicenseDto[]> => {
    const params = new URLSearchParams();
    if (query?.commercialAgreementId) params.append('commercialAgreementId', query.commercialAgreementId);
    if (query?.status) params.append('status', query.status);
    const queryString = params.toString() ? `?${params.toString()}` : '';
    return request<LicenseDto[]>(`v1/licenses${queryString}`, { method: 'GET' });
  },

  getLicense: async (id: string): Promise<LicenseDto> => {
    return request<LicenseDto>(`v1/licenses/${encodeURIComponent(id)}`, { method: 'GET' });
  },

  createLicense: async (payload: CreateLicensePayload): Promise<LicenseDto> => {
    return request<LicenseDto>('v1/licenses', { method: 'POST', body: JSON.stringify(payload) });
  },

  updateLicense: async (id: string, payload: UpdateLicensePayload): Promise<LicenseDto> => {
    return request<LicenseDto>(`v1/licenses/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(payload) });
  },

  suspendLicense: async (id: string, reason?: string): Promise<LicenseDto> => {
    return request<LicenseDto>(`v1/licenses/${encodeURIComponent(id)}/suspend`, { method: 'POST', body: JSON.stringify({ reason }) });
  },

  reactivateLicense: async (id: string, reason?: string): Promise<LicenseDto> => {
    return request<LicenseDto>(`v1/licenses/${encodeURIComponent(id)}/reactivate`, { method: 'POST', body: JSON.stringify({ reason }) });
  },

  revokeLicense: async (id: string, reason?: string): Promise<LicenseDto> => {
    return request<LicenseDto>(`v1/licenses/${encodeURIComponent(id)}/revoke`, { method: 'POST', body: JSON.stringify({ reason }) });
  },

  grantOrUpdateEntitlement: async (licenseId: string, payload: GrantEntitlementPayload): Promise<EntitlementDto> => {
    return request<EntitlementDto>(`v1/licenses/${encodeURIComponent(licenseId)}/entitlements`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  suspendEntitlement: async (licenseId: string, code: string): Promise<EntitlementDto> => {
    return request<EntitlementDto>(`v1/licenses/${encodeURIComponent(licenseId)}/entitlements/${encodeURIComponent(code)}/suspend`, { method: 'POST' });
  },

  reactivateEntitlement: async (licenseId: string, code: string): Promise<EntitlementDto> => {
    return request<EntitlementDto>(`v1/licenses/${encodeURIComponent(licenseId)}/entitlements/${encodeURIComponent(code)}/reactivate`, { method: 'POST' });
  },

  revokeEntitlement: async (licenseId: string, code: string): Promise<EntitlementDto> => {
    return request<EntitlementDto>(`v1/licenses/${encodeURIComponent(licenseId)}/entitlements/${encodeURIComponent(code)}/revoke`, { method: 'POST' });
  },

  associateDeployment: async (licenseId: string, deploymentId: string): Promise<DeploymentSummary> => {
    return request<DeploymentSummary>(`v1/licenses/${encodeURIComponent(licenseId)}/deployments`, {
      method: 'POST',
      body: JSON.stringify({ deploymentId }),
    });
  },

  disassociateDeployment: async (licenseId: string, deploymentId: string): Promise<DeploymentSummary> => {
    return request<DeploymentSummary>(`v1/licenses/${encodeURIComponent(licenseId)}/deployments/${encodeURIComponent(deploymentId)}`, { method: 'DELETE' });
  },

  getSignedArtifact: async (licenseId: string, deploymentId?: string): Promise<SignedLicenseArtifact> => {
    const query = deploymentId ? `?deploymentId=${encodeURIComponent(deploymentId)}` : '';
    return request<SignedLicenseArtifact>(`v1/licenses/${encodeURIComponent(licenseId)}/artifact${query}`, { method: 'GET' });
  },

  getLicenseHistory: async (licenseId: string): Promise<CommercialAuditLog[]> => {
    return request<CommercialAuditLog[]>(`v1/licenses/${encodeURIComponent(licenseId)}/history`, { method: 'GET' });
  },

  listCustomers: async (): Promise<CustomerDto[]> => {
    return request<CustomerDto[]>('v1/customers', { method: 'GET' });
  },

  listCommercialAgreements: async (customerId?: string): Promise<CommercialAgreementDto[]> => {
    const query = customerId ? `?customerId=${encodeURIComponent(customerId)}` : '';
    return request<CommercialAgreementDto[]>(`v1/commercial-agreements${query}`, { method: 'GET' });
  },

  createCustomer: async (name: string): Promise<CustomerDto> => {
    return request<CustomerDto>('v1/customers', { method: 'POST', body: JSON.stringify({ name }) });
  },

  createCommercialAgreement: async (customerId: string): Promise<CommercialAgreementDto> => {
    return request<CommercialAgreementDto>('v1/commercial-agreements', { method: 'POST', body: JSON.stringify({ customerId }) });
  },

  // Break-Glass Operational Endpoints
  listBreakGlassSessions: async (query?: {
    status?: string;
    operation?: string;
    targetOrganizationId?: string;
    isSingleOperatorEmergency?: boolean;
  }): Promise<BreakGlassSessionDto[]> => {
    const params = new URLSearchParams();
    if (query?.status) params.append('status', query.status);
    if (query?.operation) params.append('operation', query.operation);
    if (query?.targetOrganizationId) params.append('targetOrganizationId', query.targetOrganizationId);
    if (query?.isSingleOperatorEmergency !== undefined) {
      params.append('isSingleOperatorEmergency', String(query.isSingleOperatorEmergency));
    }
    const queryString = params.toString() ? `?${params.toString()}` : '';
    return request<BreakGlassSessionDto[]>(`v1/operations/break-glass${queryString}`, { method: 'GET' });
  },

  getBreakGlassSession: async (id: string): Promise<BreakGlassSessionDto> => {
    return request<BreakGlassSessionDto>(`v1/operations/break-glass/${encodeURIComponent(id)}`, { method: 'GET' });
  },

  requestBreakGlassSession: async (payload: RequestBreakGlassPayload): Promise<BreakGlassSessionDto> => {
    return request<BreakGlassSessionDto>('v1/operations/break-glass/request', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  approveBreakGlassSession: async (id: string, payload: ApproveBreakGlassPayload): Promise<BreakGlassSessionDto> => {
    return request<BreakGlassSessionDto>(`v1/operations/break-glass/${encodeURIComponent(id)}/approve`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  executeBreakGlassAction: async (id: string, payload: ExecuteBreakGlassPayload): Promise<{ success: boolean; session: BreakGlassSessionDto; result: any }> => {
    return request<{ success: boolean; session: BreakGlassSessionDto; result: any }>(`v1/operations/break-glass/${encodeURIComponent(id)}/execute`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  revokeBreakGlassSession: async (id: string, reason?: string): Promise<BreakGlassSessionDto> => {
    return request<BreakGlassSessionDto>(`v1/operations/break-glass/${encodeURIComponent(id)}/revoke`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  },

  reviewEmergencyBreakGlassSession: async (id: string, payload: ReviewBreakGlassPayload): Promise<BreakGlassSessionDto> => {
    return request<BreakGlassSessionDto>(`v1/operations/break-glass/${encodeURIComponent(id)}/review`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  // Service Capability Control Endpoints
  listServices: async (): Promise<ServiceCatalogItem[]> => {
    return request<ServiceCatalogItem[]>('v1/services', { method: 'GET' });
  },

  getServiceByCode: async (code: string): Promise<ServiceCatalogItem> => {
    return request<ServiceCatalogItem>(`v1/services/${encodeURIComponent(code)}`, { method: 'GET' });
  },

  updateGlobalServiceState: async (code: string, payload: UpdateGlobalServiceStatePayload): Promise<ServiceStateMutationResponse> => {
    return request<ServiceStateMutationResponse>(`v1/services/${encodeURIComponent(code)}/global-state`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  },

  setOrganizationServiceOverride: async (organizationId: string, code: string, payload: UpdateOrganizationServiceOverridePayload): Promise<ServiceStateMutationResponse> => {
    return request<ServiceStateMutationResponse>(`v1/organizations/${encodeURIComponent(organizationId)}/services/${encodeURIComponent(code)}/override`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  },

  clearOrganizationServiceOverride: async (organizationId: string, code: string): Promise<ServiceStateMutationResponse> => {
    return request<ServiceStateMutationResponse>(`v1/organizations/${encodeURIComponent(organizationId)}/services/${encodeURIComponent(code)}/override`, {
      method: 'DELETE',
    });
  },

  // Audit Log Explorer Endpoints
  listAuditLogs: async (query?: QueryAuditLogsParams): Promise<AuditLogsResponse> => {
    const params = new URLSearchParams();
    if (query?.actorId) params.append('actorId', query.actorId);
    if (query?.actorRole) params.append('actorRole', query.actorRole);
    if (query?.action) params.append('action', query.action);
    if (query?.entityType) params.append('entityType', query.entityType);
    if (query?.entityId) params.append('entityId', query.entityId);
    if (query?.organizationId) params.append('organizationId', query.organizationId);
    if (query?.result) params.append('result', query.result);
    if (query?.search) params.append('search', query.search);
    if (query?.startDate) params.append('startDate', query.startDate);
    if (query?.endDate) params.append('endDate', query.endDate);
    if (query?.page) params.append('page', String(query.page));
    if (query?.limit) params.append('limit', String(query.limit));

    const queryString = params.toString() ? `?${params.toString()}` : '';
    return request<AuditLogsResponse>(`v1/audit${queryString}`, { method: 'GET' });
  },

  getAuditLog: async (id: string): Promise<ControlPlaneAuditLogEntry> => {
    return request<ControlPlaneAuditLogEntry>(`v1/audit/${encodeURIComponent(id)}`, { method: 'GET' });
  },

  // Platform Communications Endpoints
  listAnnouncements: async (query?: QueryAnnouncementsParams): Promise<AnnouncementsResponse> => {
    const params = new URLSearchParams();
    if (query?.status) params.append('status', query.status);
    if (query?.severity) params.append('severity', query.severity);
    if (query?.audience) params.append('audience', query.audience);
    if (query?.organizationId) params.append('organizationId', query.organizationId);
    if (query?.search) params.append('search', query.search);
    if (query?.page) params.append('page', String(query.page));
    if (query?.limit) params.append('limit', String(query.limit));

    const queryString = params.toString() ? `?${params.toString()}` : '';
    return request<AnnouncementsResponse>(`v1/communications${queryString}`, { method: 'GET' });
  },

  getAnnouncement: async (id: string): Promise<PlatformAnnouncement> => {
    return request<PlatformAnnouncement>(`v1/communications/${encodeURIComponent(id)}`, { method: 'GET' });
  },

  createAnnouncement: async (dto: CreateAnnouncementDto): Promise<PlatformAnnouncement> => {
    return request<PlatformAnnouncement>('v1/communications', {
      method: 'POST',
      body: JSON.stringify(dto),
    });
  },

  updateAnnouncement: async (id: string, dto: UpdateAnnouncementDto): Promise<PlatformAnnouncement> => {
    return request<PlatformAnnouncement>(`v1/communications/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(dto),
    });
  },

  publishAnnouncement: async (id: string): Promise<PlatformAnnouncement> => {
    return request<PlatformAnnouncement>(`v1/communications/${encodeURIComponent(id)}/publish`, {
      method: 'POST',
    });
  },

  cancelAnnouncement: async (id: string): Promise<PlatformAnnouncement> => {
    return request<PlatformAnnouncement>(`v1/communications/${encodeURIComponent(id)}/cancel`, {
      method: 'POST',
    });
  },

  // Generic typed API request method
  get: <T>(path: string) => request<T>(path, { method: 'GET' }),
  post: <T>(path: string, body?: any) => request<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  put: <T>(path: string, body?: any) => request<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
  patch: <T>(path: string, body?: any) => request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};
