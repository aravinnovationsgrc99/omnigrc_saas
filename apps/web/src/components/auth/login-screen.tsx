'use client';

import React, { useState } from 'react';
import { useAuth } from '@/context/auth-context';

export function LoginScreen() {
  const { login, register } = useAuth();
  const [isRegisterMode, setIsRegisterMode] = useState(false);
  const [org, setOrg] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'ANALYST' | 'ADMIN'>('ANALYST');
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
      setErrorMsg(err.message || 'Authentication failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="omni-root omni-fade-in min-h-screen flex flex-col md:flex-row bg-slate-50 dark:bg-[#0A111F]">
      {/* Left brand panel - visible on desktop */}
      <div className="hidden md:flex w-[42%] min-w-[320px] bg-[radial-gradient(circle_at_10%_20%,rgba(15,110,106,0.25)_0%,transparent_45%),radial-gradient(circle_at_90%_80%,rgba(181,117,10,0.15)_0%,transparent_45%),linear-gradient(165deg,var(--omni-canvas-deep,#0F1A2E),#16233F)] text-white p-10 lg:p-14 flex-col justify-between relative overflow-hidden">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 34, height: 34, borderRadius: 8, background: '#0F6E6A',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 15,
            }}>Ω</div>
            <span style={{ fontSize: 18, fontWeight: 600, letterSpacing: 0.2 }}>OMNiGRC</span>
          </div>
          <h1 style={{ fontSize: 30, fontWeight: 600, lineHeight: 1.28, marginTop: 48, maxWidth: 360 }}>
            Risk, assets, and controls — one register, four frameworks, no spreadsheets.
          </h1>
          <p style={{ color: '#AAB6C4', fontSize: 14.5, marginTop: 16, maxWidth: 340, lineHeight: 1.6 }}>
            ISO 27001 · SOC 2 · GDPR · DPDP, mapped once and cited everywhere they apply.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 28, fontSize: 12.5, color: '#8493A5' }}>
          <span>Row-level tenant isolation</span>
          <span>·</span>
          <span>Full audit trail</span>
          <span>·</span>
          <span>Human sign-off required</span>
        </div>
      </div>

      {/* Right form panel */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-10 w-full">
        <div className="w-full max-w-sm">
          {/* Mobile Logo Header */}
          <div className="flex md:hidden items-center justify-center gap-2 mb-6">
            <div className="w-8 h-8 rounded-lg bg-[#0F6E6A] flex items-center justify-center font-bold text-white text-base">
              Ω
            </div>
            <span className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">OMNiGRC</span>
          </div>

          <h2 style={{ fontSize: 19, fontWeight: 600, marginBottom: 4 }}>
            {isRegisterMode ? 'Scaffold new organization' : 'Sign in to your workspace'}
          </h2>
          <p style={{ fontSize: 13.5, color: '#5B6672', marginBottom: 24 }}>
            {isRegisterMode
              ? 'Enter organization details to create your workspace & admin account.'
              : 'Enter your credentials to access your organization.'}
          </p>

          {errorMsg && (
            <div style={{
              padding: '10px 12px', background: '#F8E6E8', border: '1px solid #B23A48',
              borderRadius: 6, color: '#B23A48', fontSize: 13, marginBottom: 16,
            }}>
              {errorMsg}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            {isRegisterMode && (
              <>
                <label style={{ fontSize: 12.5, fontWeight: 600, color: '#5B6672', display: 'block', marginBottom: 6 }}>
                  Organization
                </label>
                <input
                  className="omni-input" placeholder="e.g. Meridian Health Pvt. Ltd."
                  value={org} onChange={(e) => setOrg(e.target.value)} style={{ marginBottom: 16 }}
                />

                <label style={{ fontSize: 12.5, fontWeight: 600, color: '#5B6672', display: 'block', marginBottom: 6 }}>
                  Your name
                </label>
                <input
                  className="omni-input" placeholder="e.g. Priya Nair"
                  value={name} onChange={(e) => setName(e.target.value)} style={{ marginBottom: 16 }}
                />
              </>
            )}

            <label style={{ fontSize: 12.5, fontWeight: 600, color: '#5B6672', display: 'block', marginBottom: 6 }}>
              Email address
            </label>
            <input
              type="email"
              className="omni-input" placeholder="admin@meridian.com"
              value={email} onChange={(e) => setEmail(e.target.value)} style={{ marginBottom: 16 }}
            />

            <label style={{ fontSize: 12.5, fontWeight: 600, color: '#5B6672', display: 'block', marginBottom: 6 }}>
              Password
            </label>
            <input
              type="password"
              className="omni-input" placeholder="••••••••"
              value={password} onChange={(e) => setPassword(e.target.value)} style={{ marginBottom: isRegisterMode ? 16 : 24 }}
            />

            <button
              type="submit"
              className="omni-btn-primary"
              style={{ width: '100%', opacity: canSubmit && !submitting ? 1 : 0.5, cursor: canSubmit && !submitting ? 'pointer' : 'not-allowed' }}
              disabled={!canSubmit || submitting}
            >
              {submitting ? 'Processing...' : isRegisterMode ? 'Create Organization' : 'Sign in'}
            </button>
          </form>

          <div style={{ marginTop: 20, textAlign: 'center', fontSize: 13, color: '#5B6672' }}>
            {isRegisterMode ? (
              <span>
                Already have a workspace?{' '}
                <button
                  onClick={() => { setIsRegisterMode(false); setErrorMsg(null); }}
                  style={{ color: '#0F6E6A', fontWeight: 600, border: 'none', background: 'none', cursor: 'pointer' }}
                >
                  Sign in
                </button>
              </span>
            ) : (
              <span>
                Need a new workspace?{' '}
                <button
                  onClick={() => { setIsRegisterMode(true); setErrorMsg(null); }}
                  style={{ color: '#0F6E6A', fontWeight: 600, border: 'none', background: 'none', cursor: 'pointer' }}
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
