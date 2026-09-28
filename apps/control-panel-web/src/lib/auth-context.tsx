'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { OperatorProfile } from '../types/control-plane';
import { controlPlaneApi, getAccessToken, clearAuthTokens, ControlPlaneApiError } from './control-plane-api';

interface AuthContextType {
  operator: OperatorProfile | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  error: string | null;
  login: (email: string, password: string, totpCode?: string) => Promise<void>;
  logout: () => Promise<void>;
  clearError: () => void;
  refetchMe: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [operator, setOperator] = useState<OperatorProfile | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const refetchMe = useCallback(async () => {
    if (!getAccessToken()) {
      setOperator(null);
      setIsLoading(false);
      return;
    }
    try {
      setIsLoading(true);
      const profile = await controlPlaneApi.getMe();
      setOperator(profile);
      setError(null);
    } catch (err: any) {
      if (err instanceof ControlPlaneApiError && err.statusCode === 401) {
        setOperator(null);
        clearAuthTokens();
      } else {
        setError(err.message || 'Failed to authenticate operator session');
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refetchMe();
  }, [refetchMe]);

  const login = async (email: string, password: string, totpCode?: string) => {
    setError(null);
    setIsLoading(true);
    try {
      const res = await controlPlaneApi.login(email, password, totpCode);
      setOperator(res.operator);
    } catch (err: any) {
      setError(err.message || 'Authentication failed');
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    setIsLoading(true);
    try {
      await controlPlaneApi.logout();
    } finally {
      setOperator(null);
      setError(null);
      setIsLoading(false);
    }
  };

  const clearError = () => setError(null);

  return (
    <AuthContext.Provider
      value={{
        operator,
        isLoading,
        isAuthenticated: !!operator,
        error,
        login,
        logout,
        clearError,
        refetchMe,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
