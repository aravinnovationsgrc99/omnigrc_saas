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
    { code: 'ISO 27001', bg: 'rgba(16, 185, 129, 0.2)', border: '#10B981', color: '#34D399' },
    { code: 'SOC 2', bg: 'rgba(14, 165, 233, 0.2)', border: '#0EA5E9', color: '#38BDF8' },
    { code: 'GDPR', bg: 'rgba(168, 85, 247, 0.2)', border: '#A855F7', color: '#C084FC' },
    { code: 'DPDP', bg: 'rgba(245, 158, 11, 0.2)', border: '#F59E0B', color: '#FBBF24' },
    { code: 'ISO 42001', bg: 'rgba(20, 184, 166, 0.2)', border: '#14B8A6', color: '#2DD4BF' },
    { code: 'HIPAA', bg: 'rgba(244, 63, 94, 0.2)', border: '#F43F5E', color: '#FB7185' },
  ];

  return (
    <div
      className="omni-root omni-fade-in min-h-screen flex flex-col md:flex-row relative overflow-x-hidden"
      style={{ background: '#0A111F', color: '#FFFFFF' }}
    >
      {/* Left Brand Panel - Visible on Desktop */}
      <div
        className="hidden md:flex w-[48%] lg:w-[45%] min-w-[360px] p-10 lg:p-14 flex-col justify-between relative z-10"
        style={{
          background: 'linear-gradient(180deg, #0F1A2E 0%, #16233F 100%)',
          borderRight: '1px solid #2A3859',
        }}
      >
        <div>
          {/* Top Logo & Enterprise Badge */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div
                style={{
                  width: 40, height: 40, borderRadius: 12,
                  background: 'linear-gradient(135deg, #F15E1C 0%, #0F6E6A 100%)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontWeight: 700, fontSize: 20, color: '#FFFFFF',
                  boxShadow: '0 4px 14px rgba(241, 94, 28, 0.3)', border: '1px solid rgba(255,255,255,0.2)',
                }}
              >
                Ω
              </div>
              <div className="flex flex-col">
                <span style={{ fontSize: 20, fontWeight: 700, color: '#FFFFFF', letterSpacing: '-0.02em' }}>OMNiGRC</span>
                <span style={{ fontSize: 11, fontWeight: 600, color: '#94A3B8', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                  Enterprise Platform
                </span>
              </div>
            </div>

            <div
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 12px',
                borderRadius: 999, background: 'rgba(46, 147, 111, 0.25)', border: '1px solid rgba(46, 147, 111, 0.6)',
                color: '#34D399', fontSize: 12, fontWeight: 700,
              }}
            >
              <Shield size={13} color="#34D399" />
              <span>SOC 2 Type II</span>
            </div>
          </div>

          {/* Main Headline */}
          <h1 style={{ fontSize: 32, fontWeight: 700, color: '#FFFFFF', lineHeight: 1.25, marginTop: 44, maxWidth: 480 }}>
            Risk, assets, and controls — one register,{' '}
            <span style={{ color: '#FAB60A', textDecoration: 'underline', textDecorationColor: '#F15E1C', textUnderlineOffset: 4 }}>
              six frameworks
            </span>
            , no spreadsheets.
          </h1>

          {/* Framework Subtitle */}
          <p style={{ color: '#E2E8F0', fontSize: 15, fontWeight: 400, marginTop: 18, maxWidth: 440, lineHeight: 1.6 }}>
            ISO 27001 · SOC 2 · GDPR · DPDP · ISO 42001 · HIPAA, mapped once and cited everywhere they apply.
          </p>

          {/* All 6 Framework Pills Grid */}
          <div style={{ marginTop: 32 }}>
            <span style={{ fontSize: 11.5, fontWeight: 700, color: '#CBD5E1', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 12 }}>
              Supported Compliance Frameworks
            </span>
            <div className="flex flex-wrap gap-2.5">
              {FRAMEWORKS.map((fw) => (
                <div
                  key={fw.code}
                  style={{
                    background: fw.bg,
                    border: `1px solid ${fw.border}`,
                    color: fw.color,
                    padding: '6px 12px',
                    borderRadius: 8,
                    fontSize: 12.5,
                    fontWeight: 700,
                    fontFamily: 'monospace',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <CheckCircle2 size={13} color={fw.color} />
                  <span>{fw.code}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Highlight Callout Box (Golden Yellow Fill with Deep Navy Text for WCAG AA) */}
          <div
            style={{
              marginTop: 36, padding: 16, borderRadius: 12,
              background: '#FAB60A', border: '1px solid #F15E1C',
              color: '#0F1A2E', boxShadow: '0 8px 24px rgba(250, 182, 10, 0.15)',
              display: 'flex', alignItems: 'flex-start', gap: 12,
            }}
          >
            <Sparkles size={20} color="#D4521A" style={{ flexShrink: 0, marginTop: 2 }} />
            <div>
              <div style={{ fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#0F1A2E' }}>
                AI-Assisted Cross-Mapping
              </div>
              <p style={{ fontSize: 12.5, fontWeight: 600, color: '#16233F', marginTop: 4, lineHeight: 1.45 }}>
                Upload security policies or controls once to auto-generate gap analyses across all 6 frameworks instantly.
              </p>
            </div>
          </div>
        </div>

        {/* Footer Guarantee Strip */}
        <div
          style={{
            display: 'flex', alignItems: 'center', gap: 16, fontSize: 12.5, fontWeight: 600,
            color: '#CBD5E1', paddingTop: 24, borderTop: '1px solid rgba(42, 56, 89, 0.8)',
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#34D399' }}>
            <Lock size={13} color="#34D399" /> Tenant Isolated
          </span>
          <span style={{ color: '#64748B' }}>·</span>
          <span>Full Audit Trail</span>
          <span style={{ color: '#64748B' }}>·</span>
          <span>Human Sign-off</span>
        </div>
      </div>

      {/* Right Form Panel */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-12 relative z-10">
        <div
          className="w-full max-w-md p-8 sm:p-10 rounded-2xl"
          style={{
            background: '#16233F',
            border: '1px solid #2B3A5A',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.75)',
          }}
        >
          {/* Mobile Header Logo */}
          <div
            className="flex md:hidden items-center justify-between mb-8 pb-6"
            style={{ borderBottom: '1px solid #2B3A5A' }}
          >
            <div className="flex items-center gap-3">
              <div
                style={{
                  width: 36, height: 36, borderRadius: 10,
                  background: 'linear-gradient(135deg, #F15E1C 0%, #0F6E6A 100%)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontWeight: 700, fontSize: 18, color: '#FFFFFF',
                }}
              >
                Ω
              </div>
              <span style={{ fontSize: 20, fontWeight: 700, color: '#FFFFFF' }}>OMNiGRC</span>
            </div>
            <span
              style={{
                fontSize: 11.5, fontWeight: 700, padding: '3px 10px', borderRadius: 6,
                background: 'rgba(241, 94, 28, 0.2)', color: '#F15E1C', border: '1px solid rgba(241, 94, 28, 0.4)',
              }}
            >
              SaaS v2.4
            </span>
          </div>

          {/* Header Title */}
          <div style={{ marginBottom: 24 }}>
            <h2 style={{ fontSize: 24, fontWeight: 700, color: '#FFFFFF', letterSpacing: '-0.02em' }}>
              {isRegisterMode ? 'Scaffold new organization' : 'Sign in to your workspace'}
            </h2>
            <p style={{ fontSize: 13.5, color: '#CBD5E1', fontWeight: 500, marginTop: 6, lineHeight: 1.5 }}>
              {isRegisterMode
                ? 'Create your enterprise workspace & admin account to get started.'
                : 'Enter your organization credentials to access the GRC platform.'}
            </p>
          </div>

          {/* Error Message Box */}
          {errorMsg && (
            <div
              style={{
                padding: '12px 14px', background: 'rgba(178, 58, 72, 0.25)', border: '1px solid #F1BCC2',
                borderRadius: 10, color: '#FFD1D5', fontSize: 13, fontWeight: 600, marginBottom: 20,
                display: 'flex', alignItems: 'center', gap: 8,
              }}
            >
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#F43F5E', flexShrink: 0 }} />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {isRegisterMode && (
              <>
                <div>
                  <label
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5,
                      fontWeight: 700, color: '#F8FAFC', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8,
                    }}
                  >
                    <Building2 size={13} color="#F15E1C" /> Organization Name
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Meridian Health Pvt. Ltd."
                    value={org}
                    onChange={(e) => setOrg(e.target.value)}
                    style={{
                      width: '100%', padding: '10px 14px', background: '#0A111F',
                      border: '1px solid #334155', borderRadius: 10, color: '#FFFFFF',
                      fontSize: 14, outline: 'none', fontWeight: 500,
                    }}
                  />
                </div>

                <div>
                  <label
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5,
                      fontWeight: 700, color: '#F8FAFC', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8,
                    }}
                  >
                    <User size={13} color="#F15E1C" /> Your Full Name
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Priya Nair"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    style={{
                      width: '100%', padding: '10px 14px', background: '#0A111F',
                      border: '1px solid #334155', borderRadius: 10, color: '#FFFFFF',
                      fontSize: 14, outline: 'none', fontWeight: 500,
                    }}
                  />
                </div>
              </>
            )}

            <div>
              <label
                style={{
                  display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5,
                  fontWeight: 700, color: '#F8FAFC', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8,
                }}
              >
                <Mail size={13} color="#5EEAD4" /> Email Address
              </label>
              <input
                type="email"
                required
                placeholder="admin@meridian.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={{
                  width: '100%', padding: '10px 14px', background: '#0A111F',
                  border: '1px solid #334155', borderRadius: 10, color: '#FFFFFF',
                  fontSize: 14, outline: 'none', fontWeight: 500,
                }}
              />
            </div>

            <div>
              <label
                style={{
                  display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5,
                  fontWeight: 700, color: '#F8FAFC', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8,
                }}
              >
                <KeyRound size={13} color="#5EEAD4" /> Password
              </label>
              <input
                type="password"
                required
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={{
                  width: '100%', padding: '10px 14px', background: '#0A111F',
                  border: '1px solid #334155', borderRadius: 10, color: '#FFFFFF',
                  fontSize: 14, outline: 'none', fontWeight: 500,
                }}
              />
            </div>

            {/* Primary Action Button - Vibrant Orange (#F15E1C) */}
            <button
              type="submit"
              disabled={!canSubmit || submitting}
              style={{
                width: '100%', padding: '12px 16px', borderRadius: 10, border: 'none',
                fontSize: 14, fontWeight: 700, color: canSubmit && !submitting ? '#FFFFFF' : '#94A3B8',
                background: canSubmit && !submitting
                  ? 'linear-gradient(135deg, #F15E1C 0%, #D4521A 100%)'
                  : '#1E293B',
                cursor: canSubmit && !submitting ? 'pointer' : 'not-allowed',
                boxShadow: canSubmit && !submitting ? '0 4px 18px rgba(241, 94, 28, 0.45)' : 'none',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                transition: 'all 0.18s ease',
              }}
            >
              <span>{submitting ? 'Processing...' : isRegisterMode ? 'Create Organization Workspace' : 'Sign In to Workspace'}</span>
              <ArrowRight size={16} color={canSubmit && !submitting ? '#FFFFFF' : '#94A3B8'} />
            </button>
          </form>

          {/* Provisioning Guidance Footer */}
          <div
            style={{
              marginTop: 24, paddingTop: 20, borderTop: '1px solid #2B3A5A',
              textAlign: 'center', fontSize: 12, color: '#94A3B8', fontWeight: 500, lineHeight: 1.5,
            }}
          >
            Organization creation is restricted. New organizations are provisioned via an authorized subscription or Control Plane operator.
          </div>
        </div>
      </div>
    </div>
  );
}


