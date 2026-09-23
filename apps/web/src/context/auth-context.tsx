'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { UserDto, OrganizationDto, LoginDto, RegisterDto, AuthResponseDto } from '@omnigrc/shared';
import { apiRequest, setStoredTokens, clearStoredTokens, getStoredTokens } from '@/lib/api-client';

interface ExtendedOrganizationDto extends OrganizationDto {
  licenseState?: string;
  isReadOnly?: boolean;
}

interface AuthContextType {
  user: UserDto | null;
  organization: ExtendedOrganizationDto | null;
  loading: boolean;
  licenseError: string | null;
  refreshUser: () => Promise<void>;
  login: (dto: LoginDto) => Promise<void>;
  register: (dto: RegisterDto) => Promise<void>;
  logout: () => Promise<void>;
  clearLicenseError: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserDto | null>(null);
  const [organization, setOrganization] = useState<ExtendedOrganizationDto | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [licenseError, setLicenseError] = useState<string | null>(null);

  const initAuth = useCallback(async () => {
    const { accessToken } = getStoredTokens();
    if (!accessToken) {
      setLoading(false);
      return;
    }

    try {
      const data = await apiRequest<AuthResponseDto>('/auth/me');
      setUser(data.user);
      setOrganization(data.organization as ExtendedOrganizationDto);
      setLicenseError(null);
      if (data.tokens) {
        setStoredTokens(data.tokens.accessToken, data.tokens.refreshToken);
      }
    } catch (err: any) {
      if (err?.code === 'ORGANIZATION_NOT_LICENSED') {
        setLicenseError('ORGANIZATION_NOT_LICENSED');
      } else if (err?.code === 'PRODUCT_ACCESS_REVOKED') {
        setLicenseError('PRODUCT_ACCESS_REVOKED');
      } else {
        clearStoredTokens();
        setUser(null);
        setOrganization(null);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    initAuth();
  }, [initAuth]);

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
      setLicenseError(null);
    }
  };

  const clearLicenseError = () => {
    clearStoredTokens();
    setUser(null);
    setOrganization(null);
    setLicenseError(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        organization,
        loading,
        licenseError,
        refreshUser: initAuth,
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
