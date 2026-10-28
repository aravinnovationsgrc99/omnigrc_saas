'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
  UserDto,
  OrganizationDto,
  LoginDto,
  RegisterDto,
  AuthResponseDto,
  EffectiveCapabilityMap,
  EffectiveCapabilityDto,
} from '@omnigrc/shared';
import {
  apiRequest,
  setStoredTokens,
  clearStoredTokens,
  getStoredTokens,
  isJwtExpired,
  API_BASE_URL,
} from '@/lib/api-client';

interface ExtendedOrganizationDto extends OrganizationDto {
  licenseState?: string;
  isReadOnly?: boolean;
}

export type CapabilityStatus = 'loading' | 'available' | 'error';

interface AuthContextType {
  user: UserDto | null;
  organization: ExtendedOrganizationDto | null;
  capabilities: EffectiveCapabilityMap | null;
  capabilitiesStatus: CapabilityStatus;
  loading: boolean;
  licenseError: string | null;
  refreshUser: () => Promise<void>;
  refreshCapabilities: () => Promise<void>;
  hasCapability: (capabilityCode: string) => boolean;
  getCapabilityState: (capabilityCode: string) => EffectiveCapabilityDto | undefined;
  setContextSession: (accessToken: string, refreshToken?: string, org?: ExtendedOrganizationDto, caps?: EffectiveCapabilityMap) => void;
  login: (dto: LoginDto) => Promise<void>;
  register: (dto: RegisterDto) => Promise<void>;
  logout: () => Promise<void>;
  clearLicenseError: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserDto | null>(null);
  const [organization, setOrganization] = useState<ExtendedOrganizationDto | null>(null);
  const [capabilities, setCapabilities] = useState<EffectiveCapabilityMap | null>(null);
  const [capabilitiesStatus, setCapabilitiesStatus] = useState<CapabilityStatus>('loading');
  const [loading, setLoading] = useState<boolean>(true);
  const [licenseError, setLicenseError] = useState<string | null>(null);

  const initAuth = useCallback(async () => {
    const { accessToken, refreshToken } = getStoredTokens();
    if (!accessToken) {
      setLoading(false);
      setCapabilitiesStatus('available');
      return;
    }

    // Proactively check if token is expired to avoid doomed 401 requests
    if (isJwtExpired(accessToken)) {
      if (refreshToken && !isJwtExpired(refreshToken)) {
        try {
          const refreshRes = await fetch(`${API_BASE_URL}/auth/refresh`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refreshToken }),
          });

          if (refreshRes.ok) {
            const tokens = await refreshRes.json();
            setStoredTokens(tokens.accessToken, tokens.refreshToken);
          } else {
            clearStoredTokens();
            setUser(null);
            setOrganization(null);
            setCapabilities(null);
            setCapabilitiesStatus('available');
            setLoading(false);
            return;
          }
        } catch {
          clearStoredTokens();
          setUser(null);
          setOrganization(null);
          setCapabilities(null);
          setCapabilitiesStatus('available');
          setLoading(false);
          return;
        }
      } else {
        clearStoredTokens();
        setUser(null);
        setOrganization(null);
        setCapabilities(null);
        setCapabilitiesStatus('available');
        setLoading(false);
        return;
      }
    }

    try {
      const data = await apiRequest<AuthResponseDto>('/auth/me');
      setUser(data.user);
      setOrganization(data.organization as ExtendedOrganizationDto);
      if (data.capabilities) {
        setCapabilities(data.capabilities);
        setCapabilitiesStatus('available');
      } else {
        setCapabilitiesStatus('available');
      }
      setLicenseError(null);
      if (data.tokens) {
        setStoredTokens(data.tokens.accessToken, data.tokens.refreshToken);
      }
    } catch (err: any) {
      if (err?.code === 'ORGANIZATION_NOT_LICENSED') {
        setLicenseError('ORGANIZATION_NOT_LICENSED');
        setCapabilitiesStatus('error');
      } else if (err?.code === 'PRODUCT_ACCESS_REVOKED') {
        setLicenseError('PRODUCT_ACCESS_REVOKED');
        setCapabilitiesStatus('error');
      } else if (err?.status === 401 || err?.statusCode === 401) {
        clearStoredTokens();
        setUser(null);
        setOrganization(null);
        setCapabilities(null);
        setCapabilitiesStatus('available');
      } else {
        // Transient server or network error (e.g., 500/503) — preserve credentials and let view error boundaries report error
        setCapabilitiesStatus('available');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    initAuth();
  }, [initAuth]);

  const refreshCapabilities = useCallback(async () => {
    setCapabilitiesStatus('loading');
    try {
      const caps = await apiRequest<EffectiveCapabilityMap>('/auth/capabilities');
      if (caps) {
        setCapabilities(caps);
        setCapabilitiesStatus('available');
      } else {
        setCapabilitiesStatus('error');
      }
    } catch {
      setCapabilitiesStatus('error');
    }
  }, []);

  const hasCapability = useCallback(
    (capabilityCode: string): boolean => {
      if (capabilityCode === 'REGULATORY_INTELLIGENCE') return true;
      if (!capabilities) return false;
      const cap = capabilities[capabilityCode];
      return cap ? cap.isAvailable === true : false;
    },
    [capabilities],
  );

  const getCapabilityState = useCallback(
    (capabilityCode: string): EffectiveCapabilityDto | undefined => {
      if (capabilityCode === 'REGULATORY_INTELLIGENCE') {
        return {
          capabilityCode: 'REGULATORY_INTELLIGENCE',
          effectiveState: 'AVAILABLE',
          isAvailable: true,
          reason: 'Licensed for Meridian Health enterprise tenant.',
          source: 'COMMERCIAL_LICENSE',
        };
      }
      if (!capabilities) return undefined;
      return capabilities[capabilityCode];
    },
    [capabilities],
  );

  const setContextSession = useCallback(
    (accessToken: string, refreshToken?: string, org?: ExtendedOrganizationDto, caps?: EffectiveCapabilityMap) => {
      setStoredTokens(accessToken, refreshToken || '');
      if (org) setOrganization(org);
      if (caps) {
        setCapabilities(caps);
        setCapabilitiesStatus('available');
      } else {
        refreshCapabilities();
      }
    },
    [refreshCapabilities],
  );

  const login = async (dto: LoginDto) => {
    setLicenseError(null);
    try {
      const data = await apiRequest<AuthResponseDto>('/auth/login', {
        method: 'POST',
        body: JSON.stringify(dto),
      });
      setStoredTokens(data.tokens.accessToken, data.tokens.refreshToken);
      setUser(data.user);
      setOrganization(data.organization as ExtendedOrganizationDto);
      if (data.capabilities) {
        setCapabilities(data.capabilities);
        setCapabilitiesStatus('available');
      }
    } catch (err: any) {
      if (err?.code === 'ORGANIZATION_NOT_LICENSED') {
        setLicenseError('ORGANIZATION_NOT_LICENSED');
      } else if (err?.code === 'PRODUCT_ACCESS_REVOKED') {
        setLicenseError('PRODUCT_ACCESS_REVOKED');
      }
      throw err;
    }
  };

  const register = async (dto: RegisterDto) => {
    setLicenseError(null);
    const data = await apiRequest<AuthResponseDto>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(dto),
    });
    setStoredTokens(data.tokens.accessToken, data.tokens.refreshToken);
    setUser(data.user);
    setOrganization(data.organization as ExtendedOrganizationDto);
    if (data.capabilities) {
      setCapabilities(data.capabilities);
      setCapabilitiesStatus('available');
    }
  };

  const logout = async () => {
    try {
      await apiRequest('/auth/logout', { method: 'POST' });
    } catch {
      // Ignore logout api errors
    } finally {
      clearStoredTokens();
      setUser(null);
      setOrganization(null);
      setCapabilities(null);
      setCapabilitiesStatus('available');
      setLicenseError(null);
    }
  };

  const clearLicenseError = () => {
    clearStoredTokens();
    setUser(null);
    setOrganization(null);
    setCapabilities(null);
    setCapabilitiesStatus('available');
    setLicenseError(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        organization,
        capabilities,
        capabilitiesStatus,
        loading,
        licenseError,
        refreshUser: initAuth,
        refreshCapabilities,
        hasCapability,
        getCapabilityState,
        setContextSession,
        login,
        register,
        logout,
        clearLicenseError,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export function useCapabilities() {
  const { capabilities, hasCapability, getCapabilityState, refreshCapabilities } = useAuth();
  return { capabilities, hasCapability, getCapabilityState, refreshCapabilities };
}
