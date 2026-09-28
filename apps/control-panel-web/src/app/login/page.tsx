'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '../../lib/auth-context';
import { Shield, KeyRound, ArrowRight, AlertTriangle } from 'lucide-react';
import { LoadingSpinner } from '../../components/ui/loading-spinner';

function LoginFormContent() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [requiresMfa, setRequiresMfa] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const { login, isAuthenticated, isLoading, error: authError } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const reasonParam = searchParams.get('reason');

  useEffect(() => {
    if (isAuthenticated) {
      router.replace('/overview');
    }
  }, [isAuthenticated, router]);

  useEffect(() => {
    if (reasonParam === 'session_expired') {
      setLocalError('Your operator session has expired. Please authenticate again.');
    }
  }, [reasonParam]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);

    if (!email || !password) {
      setLocalError('Email and password are required.');
      return;
    }

    try {
      await login(email.trim(), password, requiresMfa ? totpCode.trim() : undefined);
      router.replace('/overview');
    } catch (err: any) {
      const msg = err.message || 'Authentication failed';
      if (msg.includes('TOTP') || msg.includes('MFA') || msg.includes('6-digit')) {
        setRequiresMfa(true);
      }
      setLocalError(msg);
    }
  };

  if (isLoading && isAuthenticated) {
    return (
      <div className="flex h-screen items-center justify-center bg-cpDark-950">
        <LoadingSpinner label="Authenticating Operator Session..." size="lg" />
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-cpDark-800 bg-cpDark-900 p-6 shadow-2xl">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="email" className="block text-xs font-semibold text-gray-300 mb-1">
            Operator Email Address
          </label>
          <div className="relative">
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="operator@arav.internal"
              autoComplete="username"
              disabled={isLoading}
              className="w-full rounded-md border border-cpDark-700 bg-cpDark-950 p-2.5 text-xs text-white placeholder-gray-500 focus-ring font-mono"
            />
          </div>
        </div>

        <div>
          <label htmlFor="password" className="block text-xs font-semibold text-gray-300 mb-1">
            Operator Password
          </label>
          <div className="relative">
            <input
              id="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••••"
              autoComplete="current-password"
              disabled={isLoading}
              className="w-full rounded-md border border-cpDark-700 bg-cpDark-950 p-2.5 text-xs text-white placeholder-gray-500 focus-ring font-mono"
            />
          </div>
        </div>

        {requiresMfa && (
          <div className="rounded-md border border-aravBlue-800/80 bg-aravBlue-950/40 p-3 space-y-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-aravBlue-300">
              <KeyRound className="h-4 w-4" aria-hidden="true" />
              <span>2FA Multi-Factor Authentication Required</span>
            </div>
            <label htmlFor="totpCode" className="block text-xs text-gray-300">
              6-Digit Authenticator TOTP Code
            </label>
            <input
              id="totpCode"
              type="text"
              maxLength={6}
              value={totpCode}
              onChange={(e) => setTotpCode(e.target.value)}
              placeholder="123456"
              autoComplete="one-time-code"
              disabled={isLoading}
              className="w-full rounded-md border border-aravBlue-700 bg-cpDark-950 p-2.5 text-center font-mono text-sm tracking-widest text-white placeholder-gray-600 focus-ring"
            />
          </div>
        )}

        {(localError || authError) && (
          <div className="flex items-start gap-2 rounded-md border border-rose-900 bg-rose-950/60 p-3 text-xs text-rose-300" role="alert">
            <AlertTriangle className="h-4 w-4 text-rose-400 shrink-0 mt-0.5" aria-hidden="true" />
            <span>{localError || authError}</span>
          </div>
        )}

        <button
          type="submit"
          disabled={isLoading}
          className="flex w-full items-center justify-center gap-2 rounded-md bg-aravBlue-600 py-2.5 text-xs font-semibold text-white hover:bg-aravBlue-500 focus-ring transition-colors disabled:bg-cpDark-800 disabled:text-gray-500"
        >
          {isLoading ? (
            <LoadingSpinner label="" size="sm" />
          ) : (
            <>
              <span>Authenticate Operator Session</span>
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </>
          )}
        </button>
      </form>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-cpDark-950 p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-aravBlue-900/60 border border-aravBlue-700/60 text-aravBlue-400 mb-3 shadow-lg shadow-aravBlue-950/50">
            <Shield className="h-6 w-6" aria-hidden="true" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Arav Control Panel</h1>
          <p className="mt-1 font-mono text-xs text-gray-400">Authenticated Operator Access Shell</p>
        </div>

        <Suspense fallback={<LoadingSpinner label="Loading Login Form..." />}>
          <LoginFormContent />
        </Suspense>

        <div className="text-center font-mono text-[11px] text-gray-400">
          <div>Strictly for Authorized Arav Innovations Operators</div>
          <div className="mt-1">All Control Plane operations are audit-logged</div>
        </div>
      </div>
    </div>
  );
}
