export function getApiBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_API_URL) {
    return process.env.NEXT_PUBLIC_API_URL.replace(/\/+$/, '');
  }
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return 'http://localhost:3001';
    }
  }
  return (
    process.env.NODE_ENV === 'production'
      ? 'https://omnigrc-saas.onrender.com'
      : 'http://localhost:3001'
  ).replace(/\/+$/, '');
}

export const API_BASE_URL: string = getApiBaseUrl();

const ACCESS_TOKEN_KEY = 'omnigrc_access_token';
const REFRESH_TOKEN_KEY = 'omnigrc_refresh_token';

export const isJwtExpired = (token: string | null | undefined): boolean => {
  if (!token || typeof token !== 'string') return true;
  const parts = token.split('.');
  if (parts.length !== 3) return true;
  try {
    const rawPayload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const jsonStr =
      typeof atob === 'function'
        ? atob(rawPayload)
        : Buffer.from(rawPayload, 'base64').toString('utf8');
    const payload = JSON.parse(jsonStr);
    if (!payload.exp) return false;
    return payload.exp * 1000 <= Date.now() + 5000;
  } catch {
    return true;
  }
};

export const getStoredTokens = () => {
  if (typeof window === 'undefined') return { accessToken: null, refreshToken: null };
  const rawAccess = localStorage.getItem(ACCESS_TOKEN_KEY);
  const rawRefresh = localStorage.getItem(REFRESH_TOKEN_KEY);
  const accessToken =
    rawAccess && rawAccess !== 'undefined' && rawAccess !== 'null' && rawAccess.trim() !== ''
      ? rawAccess.trim()
      : null;
  const refreshToken =
    rawRefresh && rawRefresh !== 'undefined' && rawRefresh !== 'null' && rawRefresh.trim() !== ''
      ? rawRefresh.trim()
      : null;
  return { accessToken, refreshToken };
};

export const setStoredTokens = (accessToken: string, refreshToken: string) => {
  if (typeof window === 'undefined') return;
  localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
  localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
};

export const clearStoredTokens = () => {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
};

export class ApiClientError extends Error {
  status: number;
  statusCode: number;
  code?: string;
  data?: any;

  constructor(message: string, status: number, code?: string, data?: any) {
    super(message);
    this.name = 'ApiClientError';
    this.status = status;
    this.statusCode = status;
    this.code = code;
    this.data = data;
  }
}

export async function apiRequest<T = any>(
  endpoint: string,
  options: RequestInit & { timeoutMs?: number } = {},
): Promise<T> {
  const baseUrl = getApiBaseUrl();
  const { accessToken, refreshToken } = getStoredTokens();

  const headers: Record<string, string> = {
    ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
    ...(options.headers as Record<string, string>),
  };

  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }

  const timeoutMs = options.timeoutMs ?? 45000;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(`${baseUrl}${endpoint}`, {
      ...options,
      headers,
      signal: options.signal || controller.signal,
    });
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      throw new ApiClientError(`Request to ${endpoint} timed out after ${timeoutMs}ms`, 408, 'REQUEST_TIMEOUT');
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }

  // Handle 401 token refresh retry logic
  if (
    response.status === 401 &&
    refreshToken &&
    !endpoint.includes('/auth/login') &&
    !endpoint.includes('/auth/register') &&
    !endpoint.includes('/auth/refresh')
  ) {
    try {
      const refreshRes = await fetch(`${baseUrl}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });

      if (refreshRes.ok) {
        const tokens = await refreshRes.json();
        setStoredTokens(tokens.accessToken, tokens.refreshToken);
        headers['Authorization'] = `Bearer ${tokens.accessToken}`;

        response = await fetch(`${baseUrl}${endpoint}`, {
          ...options,
          headers,
        });
      } else {
        clearStoredTokens();
      }
    } catch {
      clearStoredTokens();
    }
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const message = errorData.message || `Request failed with status ${response.status}`;
    const code = errorData.code;
    throw new ApiClientError(message, response.status, code, errorData);
  }

  return response.json();
}
