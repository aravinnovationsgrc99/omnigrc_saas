'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { UserDto, OrganizationDto, LoginDto, RegisterDto, AuthResponseDto } from '@omnigrc/shared';
import { apiRequest, setStoredTokens, clearStoredTokens, getStoredTokens } from '@/lib/api-client';

interface AuthContextType {
  user: UserDto | null;
  organization: OrganizationDto | null;
  loading: boolean;
  refreshUser: () => Promise<void>;
  login: (dto: LoginDto) => Promise<void>;
  register: (dto: RegisterDto) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserDto | null>(null);
  const [organization, setOrganization] = useState<OrganizationDto | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  const initAuth = useCallback(async () => {
    const { accessToken } = getStoredTokens();
    if (!accessToken) {
      setLoading(false);
      return;
    }

    try {
      const data = await apiRequest<AuthResponseDto>('/auth/me');
      setUser(data.user);
      setOrganization(data.organization);
      if (data.tokens) {
        setStoredTokens(data.tokens.accessToken, data.tokens.refreshToken);
      }
    } catch {
      clearStoredTokens();
      setUser(null);
      setOrganization(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    initAuth();
  }, [initAuth]);

  const login = async (dto: LoginDto) => {
    const data = await apiRequest<AuthResponseDto>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(dto),
    });
    setStoredTokens(data.tokens.accessToken, data.tokens.refreshToken);
    setUser(data.user);
    setOrganization(data.organization);
  };

  const register = async (dto: RegisterDto) => {
    const data = await apiRequest<AuthResponseDto>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(dto),
    });
    setStoredTokens(data.tokens.accessToken, data.tokens.refreshToken);
    setUser(data.user);
    setOrganization(data.organization);
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
    }
  };

  return (
    <AuthContext.Provider value={{ user, organization, loading, refreshUser: initAuth, login, register, logout }}>
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
