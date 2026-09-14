'use client';

import React, { useState } from 'react';
import { useAuth } from '@/context/auth-context';
import { Shield, CheckCircle2, Lock, Sparkles, Building2, User, Mail, KeyRound, ArrowRight } from 'lucide-react';

export function LoginScreen() {
  const { login, register } = useAuth();
  const [isRegisterMode, setIsRegisterMode] = useState(false);
  const [org, setOrg] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = isRegisterMode
    ? org.trim().length > 1 && name.trim().length > 1 && email.includes('@') && password.length >= 6
    : email.includes('@') && password.length >= 4;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || submitting) return;

    setErrorMsg(null);
    setSubmitting(true);

    try {
      if (isRegisterMode) {
        await register({
          organizationName: org.trim(),
          name: name.trim(),
          email: email.trim(),
          password,
        });
      } else {
        await login({
          email: email.trim(),
          password,
        });
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Authentication failed. Please check your credentials.');
    } finally {
      setSubmitting(false);
    }
  };

  const FRAMEWORKS = [
    { code: 'ISO 27001', color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' },
    { code: 'SOC 2', color: 'bg-sky-500/10 text-sky-400 border-sky-500/30' },
    { code: 'GDPR', color: 'bg-purple-500/10 text-purple-400 border-purple-500/30' },
    { code: 'DPDP', color: 'bg-amber-500/10 text-amber-400 border-amber-500/30' },
    { code: 'ISO 42001', color: 'bg-teal-500/10 text-teal-300 border-teal-500/30' },
    { code: 'HIPAA', color: 'bg-rose-500/10 text-rose-400 border-rose-500/30' },
  ];

  return (
    <div className="omni-root omni-fade-in min-h-screen flex flex-col md:flex-row bg-[#0A111F] text-white relative overflow-x-hidden selection:bg-[#F15E1C] selection:text-white">
      {/* Ambient Radial Mesh Glows */}
      <div className="absolute top-0 left-0 w-[500px] h-[500px] bg-radial from-[#0F6E6A]/20 via-[#2E936F]/10 to-transparent blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 right-0 w-[600px] h-[600px] bg-radial from-[#F15E1C]/15 via-[#FAB60A]/08 to-transparent blur-3xl pointer-events-none" />

      {/* Left Brand Panel - Visible on Desktop */}
      <div className="hidden md:flex w-[48%] lg:w-[45%] min-w-[360px] bg-gradient-to-b from-[#0F1A2E]/90 to-[#16233F]/90 border-r border-[#2A3859] p-10 lg:p-14 flex-col justify-between relative z-10 backdrop-blur-md">
        <div>
          {/* Top Logo & Enterprise Badge */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#F15E1C] to-[#0F6E6A] flex items-center justify-center font-bold text-white text-xl shadow-lg shadow-[#F15E1C]/20 border border-white/10">
                Ω
              </div>
              <div className="flex flex-col">
                <span className="text-xl font-bold tracking-tight text-white">OMNiGRC</span>
                <span className="text-[11px] text-slate-400 tracking-wider uppercase font-semibold">Enterprise Platform</span>
              </div>
            </div>

            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#2E936F]/15 border border-[#2E936F]/40 text-[#5EEAD4] text-xs font-semibold">
              <Shield size={13} />
              <span>SOC 2 Type II</span>
            </div>
          </div>

          {/* Main Headline */}
          <h1 className="text-3xl lg:text-4xl font-bold tracking-tight text-white leading-tight mt-12 max-w-lg">
            Risk, assets, and controls — one register, <span className="text-[#FAB60A] underline decoration-[#F15E1C] decoration-2 underline-offset-4">six frameworks</span>, no spreadsheets.
          </h1>

          <p className="text-slate-300 text-sm lg:text-base leading-relaxed mt-5 max-w-md">
            ISO 27001 · SOC 2 · GDPR · DPDP · ISO 42001 · HIPAA, mapped once and cited everywhere they apply.
          </p>

          {/* All 6 Framework Pills Grid */}
          <div className="mt-8">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 block mb-3">
              Supported Compliance Frameworks
            </span>
            <div className="flex flex-wrap gap-2">
              {FRAMEWORKS.map((fw) => (
                <div
                  key={fw.code}
                  className={`px-3 py-1.5 rounded-lg border text-xs font-semibold font-mono flex items-center gap-1.5 backdrop-blur-sm ${fw.color}`}
                >
                  <CheckCircle2 size={13} className="shrink-0" />
                  <span>{fw.code}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Highlight Callout Box (Golden Yellow Fill with Deep Navy Text for WCAG AA) */}
          <div className="mt-10 p-4 rounded-xl bg-[#FAB60A] border border-[#F15E1C]/40 text-[#16233F] shadow-lg shadow-[#FAB60A]/10 flex items-start gap-3">
            <Sparkles size={20} className="text-[#F15E1C] shrink-0 mt-0.5" />
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-[#16233F]">AI-Assisted Cross-Mapping</div>
              <p className="text-xs font-medium text-[#16233F]/90 mt-1 leading-normal">
                Upload security policies or controls once to auto-generate gap analyses across all 6 frameworks instantly.
              </p>
            </div>
          </div>
        </div>

        {/* Footer Guarantee Strip */}
        <div className="flex items-center gap-4 text-xs font-medium text-slate-400 pt-8 border-t border-[#2A3859]/60">
          <span className="flex items-center gap-1.5"><Lock size={13} className="text-[#2E936F]" /> Tenant Isolated</span>
          <span>·</span>
          <span>Full Audit Trail</span>
          <span>·</span>
          <span>Human Sign-off</span>
        </div>
      </div>

      {/* Right Form Panel */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-12 relative z-10">
        <div className="w-full max-w-md bg-[#16233F]/90 border border-[#2B3A5A] rounded-2xl p-8 sm:p-10 shadow-2xl backdrop-blur-xl">
          {/* Mobile Header Logo */}
          <div className="flex md:hidden items-center justify-between mb-8 pb-6 border-b border-[#2B3A5A]">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#F15E1C] to-[#0F6E6A] flex items-center justify-center font-bold text-white text-lg">
                Ω
              </div>
              <span className="text-xl font-bold tracking-tight text-white">OMNiGRC</span>
            </div>
            <span className="text-xs font-semibold px-2.5 py-1 rounded-md bg-[#F15E1C]/20 text-[#F15E1C] border border-[#F15E1C]/30">
              SaaS v2.4
            </span>
          </div>

          {/* Header Title */}
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-white tracking-tight">
              {isRegisterMode ? 'Scaffold new organization' : 'Sign in to your workspace'}
            </h2>
            <p className="text-xs sm:text-sm text-slate-300 mt-1.5 leading-relaxed">
              {isRegisterMode
                ? 'Create your enterprise workspace & admin account to get started.'
                : 'Enter your organization credentials to access the GRC platform.'}
            </p>
          </div>

          {/* Error Message Box */}
          {errorMsg && (
            <div className="p-3.5 bg-[#B23A48]/15 border border-[#B23A48] rounded-xl text-rose-300 text-xs font-medium mb-6 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#B23A48] shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {isRegisterMode && (
              <>
                <div>
                  <label className="block text-xs font-semibold text-slate-200 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <Building2 size={13} className="text-[#F15E1C]" /> Organization Name
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Meridian Health Pvt. Ltd."
                    value={org}
                    onChange={(e) => setOrg(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-[#0A111F] border border-[#2B3A5A] rounded-xl text-white text-sm placeholder:text-slate-500 focus:outline-none focus:border-[#F15E1C] focus:ring-1 focus:ring-[#F15E1C] transition-all"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-200 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <User size={13} className="text-[#F15E1C]" /> Your Full Name
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Priya Nair"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-[#0A111F] border border-[#2B3A5A] rounded-xl text-white text-sm placeholder:text-slate-500 focus:outline-none focus:border-[#F15E1C] focus:ring-1 focus:ring-[#F15E1C] transition-all"
                  />
                </div>
              </>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-200 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Mail size={13} className="text-[#5EEAD4]" /> Email Address
              </label>
              <input
                type="email"
                required
                placeholder="admin@meridian.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-[#0A111F] border border-[#2B3A5A] rounded-xl text-white text-sm placeholder:text-slate-500 focus:outline-none focus:border-[#F15E1C] focus:ring-1 focus:ring-[#F15E1C] transition-all"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-200 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <KeyRound size={13} className="text-[#5EEAD4]" /> Password
              </label>
              <input
                type="password"
                required
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-[#0A111F] border border-[#2B3A5A] rounded-xl text-white text-sm placeholder:text-slate-500 focus:outline-none focus:border-[#F15E1C] focus:ring-1 focus:ring-[#F15E1C] transition-all"
              />
            </div>

            {/* Primary Action Button - Vibrant Orange (#F15E1C) */}
            <button
              type="submit"
              disabled={!canSubmit || submitting}
              style={{
                background: canSubmit && !submitting ? 'linear-gradient(135deg, #F15E1C 0%, #D4521A 100%)' : '#2A3859',
              }}
              className={`w-full py-3 px-4 rounded-xl text-white font-semibold text-sm flex items-center justify-center gap-2 transition-all shadow-lg ${
                canSubmit && !submitting
                  ? 'hover:brightness-110 active:scale-[0.99] shadow-[#F15E1C]/25 cursor-pointer'
                  : 'opacity-60 cursor-not-allowed text-slate-400'
              }`}
            >
              <span>{submitting ? 'Processing...' : isRegisterMode ? 'Create Organization Workspace' : 'Sign In to Workspace'}</span>
              <ArrowRight size={16} />
            </button>
          </form>

          {/* Toggle Register / Sign-in */}
          <div className="mt-6 pt-6 border-t border-[#2B3A5A] text-center text-xs text-slate-300">
            {isRegisterMode ? (
              <span>
                Already have a workspace?{' '}
                <button
                  onClick={() => { setIsRegisterMode(false); setErrorMsg(null); }}
                  className="text-[#F15E1C] hover:text-[#FAB60A] font-bold underline underline-offset-2 transition-colors cursor-pointer ml-1"
                >
                  Sign in to workspace
                </button>
              </span>
            ) : (
              <span>
                Need a new organization workspace?{' '}
                <button
                  onClick={() => { setIsRegisterMode(true); setErrorMsg(null); }}
                  className="text-[#F15E1C] hover:text-[#FAB60A] font-bold underline underline-offset-2 transition-colors cursor-pointer ml-1"
                >
                  Register Organization
                </button>
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

