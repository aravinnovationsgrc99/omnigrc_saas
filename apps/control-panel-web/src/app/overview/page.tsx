'use client';

import React from 'react';
import { useAuth } from '../../lib/auth-context';
import { StatusBadge } from '../../components/ui/status-badge';
import { ShieldCheck, Building2, KeyRound, Sliders, Server, Activity, ArrowUpRight } from 'lucide-react';
import Link from 'next/link';

export default function OverviewPage() {
  const { operator } = useAuth();

  if (!operator) return null;

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
