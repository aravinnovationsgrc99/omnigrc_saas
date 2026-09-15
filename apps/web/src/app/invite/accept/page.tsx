'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { apiRequest } from '@/lib/api-client';
import { ValidateInvitationResponseDto, AuthResponseDto, Role } from '@omnigrc/shared';
import { Shield, CheckCircle2, AlertTriangle, KeyRound, User, Mail, Building2, ArrowRight, Lock } from 'lucide-react';

function InviteAcceptContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get('token') || '';

  const [loading, setLoading] = useState(true);
  const [validation, setValidation] = useState<ValidateInvitationResponseDto | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Form states
  const [isExistingAccount, setIsExistingAccount] = useState(false);
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [acceptSuccess, setAcceptSuccess] = useState(false);

  useEffect(() => {
    if (!token) {
      setLoading(false);
      setErrorMsg('No invitation token provided in URL.');
      return;
    }

    const validateToken = async () => {
      setLoading(true);
      setErrorMsg(null);
      try {
        const res = await apiRequest<ValidateInvitationResponseDto>(
          `/auth/invitations/validate?token=${encodeURIComponent(token)}`,
        );
        setValidation(res);
        if (!res.valid) {
          setErrorMsg(res.reason || 'This invitation is invalid, expired, or revoked.');
        }
      } catch (err: any) {
        setErrorMsg(err.message || 'Failed to validate invitation token.');
      } finally {
        setLoading(false);
      }
    };

    validateToken();
  }, [token]);

  const handleAccept = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || submitting) return;

    setErrorMsg(null);
    setSubmitting(true);

    try {
      const res = await apiRequest<AuthResponseDto>('/auth/invitations/accept', {
        method: 'POST',
        body: JSON.stringify({
          token,
          password: password.trim(),
          name: name.trim() || undefined,
        }),
      });

      if (res.tokens?.accessToken) {
        localStorage.setItem('accessToken', res.tokens.accessToken);
        localStorage.setItem('refreshToken', res.tokens.refreshToken);
      }

      setAcceptSuccess(true);
      setTimeout(() => {
        window.location.href = '/';
      }, 1500);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to accept invitation.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0A111F] text-white flex flex-col items-center justify-center p-4">
        <div className="flex items-center gap-3 text-teal-400 font-semibold text-lg animate-pulse">
          <Shield size={28} className="animate-spin" />
          <span>Validating security invitation token...</span>
        </div>
      </div>
    );
  }

  if (!validation?.valid || errorMsg && !acceptSuccess) {
    return (
      <div className="min-h-screen bg-[#0A111F] text-white flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-md bg-[#16233F] border border-red-500/40 rounded-2xl p-8 shadow-2xl text-center">
          <div className="w-14 h-14 rounded-full bg-red-500/20 text-red-400 flex items-center justify-center mx-auto mb-4 border border-red-500/30">
            <AlertTriangle size={30} />
          </div>
          <h2 className="text-xl font-bold text-white mb-2">Invalid or Expired Invitation</h2>
          <p className="text-sm text-slate-300 mb-6 leading-relaxed">
            {errorMsg || validation?.reason || 'This invitation token cannot be processed. It may have expired, been revoked, or already accepted.'}
          </p>
          <button
            onClick={() => (window.location.href = '/')}
            className="w-full py-3 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-xl border border-slate-600 transition-all text-sm flex items-center justify-center gap-2"
          >
            <span>Return to Sign In</span>
            <ArrowRight size={16} />
          </button>
        </div>
      </div>
    );
  }

  if (acceptSuccess) {
    return (
      <div className="min-h-screen bg-[#0A111F] text-white flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-md bg-[#16233F] border border-teal-500/40 rounded-2xl p-8 shadow-2xl text-center animate-fade-in">
          <div className="w-14 h-14 rounded-full bg-teal-500/20 text-teal-400 flex items-center justify-center mx-auto mb-4 border border-teal-500/30">
            <CheckCircle2 size={32} />
          </div>
          <h2 className="text-xl font-bold text-white mb-2">Invitation Accepted!</h2>
          <p className="text-sm text-slate-300 mb-4">
            Welcome to <strong className="text-teal-300">{validation.organizationName}</strong>.
          </p>
          <p className="text-xs text-slate-400">Redirecting to your workspace dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0A111F] text-white flex flex-col items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-md bg-[#16233F] border border-[#2B3A5A] rounded-2xl p-8 shadow-2xl">
        {/* Logo Header */}
        <div className="flex items-center gap-3 mb-6 pb-4 border-b border-[#2B3A5A]">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#F15E1C] to-[#0F6E6A] flex items-center justify-center font-bold text-xl text-white shadow-lg">
            Ω
          </div>
          <div>
            <h1 className="text-lg font-bold text-white tracking-tight">OMNiGRC</h1>
            <p className="text-[11px] font-semibold text-teal-400 uppercase tracking-wider">
              Secure Team Member Onboarding
            </p>
          </div>
        </div>

        {/* Invitation Summary Card */}
        <div className="bg-[#0A111F] border border-[#2B3A5A] rounded-xl p-4 mb-6 text-xs text-slate-300 space-y-2">
          <div className="flex justify-between items-center pb-2 border-b border-slate-800">
            <span className="text-slate-400 flex items-center gap-1.5">
              <Building2 size={13} className="text-teal-400" /> Organization
            </span>
            <span className="font-bold text-white">{validation.organizationName}</span>
          </div>
          <div className="flex justify-between items-center pb-2 border-b border-slate-800">
            <span className="text-slate-400 flex items-center gap-1.5">
              <Mail size={13} className="text-teal-400" /> Invited Email
            </span>
            <span className="font-mono text-teal-300">{validation.email}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-slate-400 flex items-center gap-1.5">
              <Lock size={13} className="text-teal-400" /> Assigned Role
            </span>
            <span className="font-bold font-mono px-2 py-0.5 rounded bg-slate-800 text-amber-300 border border-slate-700">
              {validation.role}
            </span>
          </div>
        </div>

        {/* Form Title */}
        <div className="mb-5">
          <h2 className="text-base font-bold text-white">
            {isExistingAccount ? 'Authenticate & Join Organization' : 'Create Account & Join Workspace'}
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            {isExistingAccount
              ? 'Enter your existing account password to confirm your organization membership.'
              : 'Establish your account credentials to join as an active member.'}
          </p>
        </div>

        {errorMsg && (
          <div className="p-3 bg-red-500/20 border border-red-400 rounded-xl text-red-200 text-xs font-semibold mb-4 flex items-center gap-2">
            <AlertTriangle size={16} className="shrink-0 text-red-400" />
            <span>{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleAccept} className="space-y-4">
          {!isExistingAccount && (
            <div>
              <label className="block text-[11px] font-bold text-slate-300 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                <User size={13} className="text-orange-400" /> Full Name
              </label>
              <input
                type="text"
                placeholder="e.g. Rahul Sharma"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-[#0A111F] border border-slate-700 rounded-xl text-white text-xs outline-none focus:border-teal-500"
              />
            </div>
          )}

          <div>
            <label className="block text-[11px] font-bold text-slate-300 uppercase tracking-wider mb-1 flex items-center gap-1.5">
              <KeyRound size={13} className="text-teal-400" /> Password
            </label>
            <input
              type="password"
              required
              minLength={6}
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-[#0A111F] border border-slate-700 rounded-xl text-white text-xs outline-none focus:border-teal-500"
            />
          </div>

          <button
            type="submit"
            disabled={submitting || password.length < 6}
            className={`w-full py-3 rounded-xl font-bold text-sm text-white flex items-center justify-center gap-2 transition-all shadow-lg ${
              submitting || password.length < 6
                ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                : 'bg-gradient-to-r from-teal-600 to-teal-700 hover:from-teal-500 hover:to-teal-600 shadow-teal-900/40 cursor-pointer'
            }`}
          >
            <span>{submitting ? 'Processing...' : 'Accept Invitation & Join'}</span>
            <ArrowRight size={16} />
          </button>
        </form>

        {/* Toggle Account Mode */}
        <div className="mt-6 pt-4 border-t border-[#2B3A5A] text-center text-xs text-slate-400">
          {isExistingAccount ? (
            <span>
              Need to set up a new password?{' '}
              <button
                onClick={() => setIsExistingAccount(false)}
                className="text-teal-400 font-bold underline hover:text-teal-300 ml-1"
              >
                Create new account
              </button>
            </span>
          ) : (
            <span>
              Already have an OMNiGRC account?{' '}
              <button
                onClick={() => setIsExistingAccount(true)}
                className="text-teal-400 font-bold underline hover:text-teal-300 ml-1"
              >
                Authenticate existing account
              </button>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export default function InviteAcceptPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#0A111F] text-white flex items-center justify-center">
          <div className="text-teal-400 font-semibold">Loading invitation portal...</div>
        </div>
      }
    >
      <InviteAcceptContent />
    </Suspense>
  );
}
