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
import { apiRequest, setStoredTokens, clearStoredTokens, getStoredTokens } from '@/lib/api-client';

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
    const { accessToken } = getStoredTokens();
    if (!accessToken) {
      setLoading(false);
      setCapabilitiesStatus('available');
      return;
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
      } else {
        clearStoredTokens();
        setUser(null);
        setOrganization(null);
        setCapabilities(null);
        setCapabilitiesStatus('error');
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
      if (!capabilities) return false;
      const cap = capabilities[capabilityCode];
      return cap ? cap.isAvailable === true : false;
    },
    [capabilities],
  );

  const getCapabilityState = useCallback(
    (capabilityCode: string): EffectiveCapabilityDto | undefined => {
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
