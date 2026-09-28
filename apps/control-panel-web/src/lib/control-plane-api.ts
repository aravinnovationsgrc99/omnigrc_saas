import { ApiErrorResponse, OperatorProfile, LoginSuccessResponse } from '../types/control-plane';

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

  // Generic typed API request method
  get: <T>(path: string) => request<T>(path, { method: 'GET' }),
  post: <T>(path: string, body?: any) => request<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  put: <T>(path: string, body?: any) => request<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
  patch: <T>(path: string, body?: any) => request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};
