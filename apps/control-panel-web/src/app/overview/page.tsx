'use client';

import React, { useState } from 'react';
import { useAuth } from '../../lib/auth-context';
import { controlPlaneApi } from '../../lib/control-plane-api';
import { StatusBadge } from '../../components/ui/status-badge';
import {
  ShieldCheck,
  ShieldAlert,
  Building2,
  KeyRound,
  Sliders,
  Server,
  Activity,
  ArrowUpRight,
  Copy,
  Check,
  Lock,
} from 'lucide-react';
import Link from 'next/link';

export default function OverviewPage() {
  const { operator, refetchMe } = useAuth();

  // MFA Enrollment Flow State
  const [isEnrollingMfa, setIsEnrollingMfa] = useState(false);
  const [mfaSecretData, setMfaSecretData] = useState<{ secret: string; otpauthUrl: string } | null>(null);
  const [totpInput, setTotpInput] = useState('');
  const [enrollmentError, setEnrollmentError] = useState<string | null>(null);
  const [enrollmentSuccess, setEnrollmentSuccess] = useState(false);
  const [copiedSecret, setCopiedSecret] = useState(false);
  const [isSubmittingTotp, setIsSubmittingTotp] = useState(false);

  if (!operator) return null;

  const handleInitiateMfa = async () => {
    setEnrollmentError(null);
    try {
      const data = await controlPlaneApi.setupMfa();
      setMfaSecretData(data);
      setIsEnrollingMfa(true);
    } catch (err: any) {
      setEnrollmentError(err.message || 'Failed to initiate MFA setup');
    }
  };

  const handleVerifyMfa = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!totpInput || totpInput.trim().length !== 6) {
      setEnrollmentError('Please enter a valid 6-digit TOTP code');
      return;
    }

    setIsSubmittingTotp(true);
    setEnrollmentError(null);

    try {
      const res = await controlPlaneApi.verifyMfa(totpInput.trim());
      if (res.success) {
        setEnrollmentSuccess(true);
        setIsEnrollingMfa(false);
        await refetchMe();
      }
    } catch (err: any) {
      setEnrollmentError(err.message || 'Invalid verification code. Please check your authenticator and try again.');
    } finally {
      setIsSubmittingTotp(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedSecret(true);
    setTimeout(() => setCopiedSecret(false), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Header Section */}
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between border-b border-cpDark-800 pb-4">
        <div>
          <h1 className="text-xl font-bold text-white tracking-tight">Platform Control Overview</h1>
          <p className="text-xs text-gray-400 font-mono mt-0.5">
            Arav Innovations Control Plane Authority Console
          </p>
        </div>
        <div className="flex items-center gap-2 mt-2 sm:mt-0">
          <StatusBadge status="ACTIVE" label="Control Plane Operational" />
        </div>
      </div>

      {/* MFA RE-ENROLLMENT ALERT & INTERACTIVE ENROLLMENT MODAL */}
      {!operator.mfaEnabled && (
        <div className="rounded-xl border border-amber-500/40 bg-gradient-to-r from-amber-950/40 via-cpDark-900 to-cpDark-900 p-6 shadow-2xl">
          <div className="flex items-start gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-500/20 border border-amber-500/40 text-amber-400">
              <ShieldAlert className="h-6 w-6" aria-hidden="true" />
            </div>
            <div className="flex-1 space-y-3">
              <div>
                <h3 className="text-sm font-bold text-white tracking-wide">
                  MFA Re-Enrollment Mandatory — Restricted Operator Session
                </h3>
                <p className="text-xs text-amber-200/80 mt-1 leading-relaxed">
                  Your operator account has been reset or has not completed authenticator enrollment. Administrative access to all platform controls (Organizations, Licensing, Deployments, Break-Glass) is currently server-restricted until multi-factor authentication is verified.
                </p>
              </div>

              {!isEnrollingMfa ? (
                <div>
                  <button
                    onClick={handleInitiateMfa}
                    id="setup-mfa-btn"
                    className="inline-flex items-center gap-2 rounded-md bg-amber-500 px-4 py-2 text-xs font-semibold text-black hover:bg-amber-400 focus-ring shadow-lg transition-colors"
                  >
                    <Lock className="h-4 w-4" />
                    Complete Authenticator Enrollment
                  </button>
                  {enrollmentError && (
                    <p className="text-xs text-rose-400 mt-2 font-mono">{enrollmentError}</p>
                  )}
                </div>
              ) : (
                <div className="rounded-lg border border-cpDark-700 bg-cpDark-950 p-5 space-y-4 max-w-xl">
                  <h4 className="text-xs font-bold text-white uppercase tracking-wider font-mono">
                    Step 1: Configure Your Authenticator App
                  </h4>
                  <p className="text-xs text-gray-300">
                    Open your TOTP authenticator app (Google Authenticator, 1Password, Bitwarden, or Authy) and manually enter the security key below:
                  </p>

                  <div className="flex items-center gap-2 rounded-md border border-cpDark-700 bg-cpDark-900 p-3">
                    <span className="font-mono text-xs text-amber-300 select-all flex-1 tracking-wider break-all">
                      {mfaSecretData?.secret}
                    </span>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(mfaSecretData?.secret || '')}
                      className="p-1.5 rounded hover:bg-cpDark-800 text-gray-400 hover:text-white"
                      title="Copy Secret"
                    >
                      {copiedSecret ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
                    </button>
                  </div>

                  <form onSubmit={handleVerifyMfa} className="space-y-3 pt-2">
                    <h4 className="text-xs font-bold text-white uppercase tracking-wider font-mono">
                      Step 2: Enter 6-Digit TOTP Code
                    </h4>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        maxLength={6}
                        pattern="[0-9]{6}"
                        id="totp-verification-code"
                        placeholder="000000"
                        value={totpInput}
                        onChange={(e) => setTotpInput(e.target.value.replace(/\D/g, ''))}
                        className="w-36 rounded-md border border-cpDark-700 bg-cpDark-900 px-3 py-2 text-center text-sm font-mono tracking-widest text-white placeholder-gray-600 focus-ring"
                        required
                        autoFocus
                      />
                      <button
                        type="submit"
                        id="verify-mfa-submit-btn"
                        disabled={isSubmittingTotp || totpInput.length !== 6}
                        className="rounded-md bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-50 focus-ring shadow transition-colors"
                      >
                        {isSubmittingTotp ? 'Verifying...' : 'Verify & Enable Full Access'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsEnrollingMfa(false)}
                        className="rounded-md border border-cpDark-700 bg-cpDark-900 px-3 py-2 text-xs font-medium text-gray-400 hover:text-white"
                      >
                        Cancel
                      </button>
                    </div>

                    {enrollmentError && (
                      <p className="text-xs text-rose-400 font-mono mt-2">{enrollmentError}</p>
                    )}
                  </form>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Operator Session Context Card */}
      <div className="rounded-lg border border-cpDark-800 bg-cpDark-900 p-5 shadow-lg">
        <div className="flex items-center gap-3 border-b border-cpDark-800 pb-3 mb-4">
          <ShieldCheck className="h-5 w-5 text-aravBlue-400" aria-hidden="true" />
          <h2 className="text-sm font-semibold text-white">Authenticated Operator Session Context</h2>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 font-mono text-xs">
          <div className="rounded-md border border-cpDark-800 bg-cpDark-950 p-3">
            <span className="text-gray-400 block text-[10px] mb-1">OPERATOR NAME</span>
            <span className="text-white font-semibold">{operator.fullName || 'N/A'}</span>
          </div>

          <div className="rounded-md border border-cpDark-800 bg-cpDark-950 p-3">
            <span className="text-gray-400 block text-[10px] mb-1">OPERATOR EMAIL</span>
            <span className="text-gray-200">{operator.email}</span>
          </div>

          <div className="rounded-md border border-cpDark-800 bg-cpDark-950 p-3">
            <span className="text-gray-400 block text-[10px] mb-1">ASSIGNED CP ROLE</span>
            <StatusBadge status={operator.role} size="sm" />
          </div>

          <div className="rounded-md border border-cpDark-800 bg-cpDark-950 p-3">
            <span className="text-gray-400 block text-[10px] mb-1">2FA / MFA PROTECTION</span>
            <StatusBadge status={operator.mfaEnabled ? 'ACTIVE' : 'DISABLED'} label={operator.mfaEnabled ? 'MFA Verified' : 'MFA Off'} size="sm" />
          </div>
        </div>
      </div>

      {/* IA Navigation Matrix Grid */}
      <div className="space-y-3">
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider font-mono">
          Control Plane Information Architecture
        </h3>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Link
            href="/organizations"
            className="group rounded-lg border border-cpDark-800 bg-cpDark-900 p-4 transition-all hover:border-aravBlue-700 hover:bg-cpDark-850"
          >
            <div className="flex items-center justify-between mb-2">
              <Building2 className="h-5 w-5 text-aravBlue-400" aria-hidden="true" />
              <ArrowUpRight className="h-4 w-4 text-gray-400 group-hover:text-white" aria-hidden="true" />
            </div>
            <h4 className="text-sm font-bold text-white group-hover:text-aravBlue-300">Organizations</h4>
            <p className="text-xs text-gray-400 mt-1">Organization control states (ACTIVE, SUSPENDED, DISABLED, DECOMMISSIONED).</p>
          </Link>

          <Link
            href="/licensing"
            className="group rounded-lg border border-cpDark-800 bg-cpDark-900 p-4 transition-all hover:border-aravBlue-700 hover:bg-cpDark-850"
          >
            <div className="flex items-center justify-between mb-2">
              <KeyRound className="h-5 w-5 text-aravBlue-400" aria-hidden="true" />
              <ArrowUpRight className="h-4 w-4 text-gray-400 group-hover:text-white" aria-hidden="true" />
            </div>
            <h4 className="text-sm font-bold text-white group-hover:text-aravBlue-300">Licensing</h4>
            <p className="text-xs text-gray-400 mt-1">Commercial licenses, framework entitlements, and signed Ed25519 artifacts.</p>
          </Link>

          <Link
            href="/services"
            className="group rounded-lg border border-cpDark-800 bg-cpDark-900 p-4 transition-all hover:border-aravBlue-700 hover:bg-cpDark-850"
          >
            <div className="flex items-center justify-between mb-2">
              <Sliders className="h-5 w-5 text-aravBlue-400" aria-hidden="true" />
              <ArrowUpRight className="h-4 w-4 text-gray-400 group-hover:text-white" aria-hidden="true" />
            </div>
            <h4 className="text-sm font-bold text-white group-hover:text-aravBlue-300">Services</h4>
            <p className="text-xs text-gray-400 mt-1">Global service kill-switches and organization service capability overrides.</p>
          </Link>

          <Link
            href="/deployments"
            className="group rounded-lg border border-cpDark-800 bg-cpDark-900 p-4 transition-all hover:border-aravBlue-700 hover:bg-cpDark-850"
          >
            <div className="flex items-center justify-between mb-2">
              <Server className="h-5 w-5 text-aravBlue-400" aria-hidden="true" />
              <ArrowUpRight className="h-4 w-4 text-gray-400 group-hover:text-white" aria-hidden="true" />
            </div>
            <h4 className="text-sm font-bold text-white group-hover:text-aravBlue-300">Deployments</h4>
            <p className="text-xs text-gray-400 mt-1">Registered deployment instances, model allocations, and check-in status.</p>
          </Link>

          <Link
            href="/operations"
            className="group rounded-lg border border-cpDark-800 bg-cpDark-900 p-4 transition-all hover:border-aravBlue-700 hover:bg-cpDark-850"
          >
            <div className="flex items-center justify-between mb-2">
              <Activity className="h-5 w-5 text-aravBlue-400" aria-hidden="true" />
              <ArrowUpRight className="h-4 w-4 text-gray-400 group-hover:text-white" aria-hidden="true" />
            </div>
            <h4 className="text-sm font-bold text-white group-hover:text-aravBlue-300">Operations</h4>
            <p className="text-xs text-gray-400 mt-1">Operational background queue lifecycle and cron job worker status.</p>
          </Link>

          <Link
            href="/audit"
            className="group rounded-lg border border-cpDark-800 bg-cpDark-900 p-4 transition-all hover:border-aravBlue-700 hover:bg-cpDark-850"
          >
            <div className="flex items-center justify-between mb-2">
              <ShieldCheck className="h-5 w-5 text-aravBlue-400" aria-hidden="true" />
              <ArrowUpRight className="h-4 w-4 text-gray-400 group-hover:text-white" aria-hidden="true" />
            </div>
            <h4 className="text-sm font-bold text-white group-hover:text-aravBlue-300">Audit & Security</h4>
            <p className="text-xs text-gray-400 mt-1">Operator action logs, correlation tracing, and security events.</p>
          </Link>
        </div>
      </div>
    </div>
  );
}
