'use client';

import React from 'react';
import { Lock, ShieldAlert, ArrowLeft, KeyRound, ExternalLink, ShieldCheck } from 'lucide-react';

interface ModuleNotLicensedViewProps {
  moduleName: string;
  capabilityCode: string;
  description?: string;
  reason?: string;
  icon?: React.ReactNode;
  onNavigateHome?: () => void;
}

export function ModuleNotLicensedView({
  moduleName,
  capabilityCode,
  description = 'This capability is not included in your organization\'s active subscription agreement or service tier.',
  reason,
  icon,
  onNavigateHome,
}: ModuleNotLicensedViewProps) {
  return (
    <div className="w-full max-w-4xl mx-auto py-12 px-4 sm:px-6 omni-fade-in">
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        {/* Header Strip */}
        <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-[#16233F] p-6 sm:p-8 text-white flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-white/10 backdrop-blur-md border border-white/20 rounded-xl text-amber-400">
              {icon || <Lock size={28} />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-bold tracking-tight">{moduleName}</h1>
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  <Lock size={12} /> Not Licensed
                </span>
              </div>
              <p className="text-xs sm:text-sm text-slate-300 mt-1 max-w-xl">
                Commercial Capability Access Locked
              </p>
            </div>
          </div>
          {onNavigateHome && (
            <button
              onClick={onNavigateHome}
              className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-slate-200 hover:text-white bg-white/10 hover:bg-white/15 rounded-lg border border-white/10 transition-colors cursor-pointer"
            >
              <ArrowLeft size={14} /> Back to Dashboard
            </button>
          )}
        </div>

        {/* Content Body */}
        <div className="p-6 sm:p-8 space-y-6">
          <div className="flex items-start gap-4 p-4 rounded-xl bg-amber-50/70 border border-amber-200/80 text-amber-900">
            <div className="p-2 bg-amber-100 rounded-lg text-amber-700 shrink-0 mt-0.5">
              <ShieldAlert size={20} />
            </div>
            <div>
              <h2 className="text-sm font-bold text-amber-950">Commercial Entitlement Restriction</h2>
              <p className="text-xs sm:text-sm text-amber-800/90 mt-1">
                {description}
              </p>
              {reason && (
                <div className="mt-2 text-xs font-mono bg-white/60 p-2 rounded border border-amber-200 text-amber-900">
                  Authority Reason: {reason}
                </div>
              )}
            </div>
          </div>

          {/* Entitlement Metadata Panel */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-600 mb-2">
                <KeyRound size={14} className="text-slate-500" />
                Required Capability Code
              </div>
              <p className="text-sm font-mono font-bold text-slate-900">{capabilityCode}</p>
              <p className="text-[11px] text-slate-500 mt-1">
                Authoritative service identifier evaluated by backend enforcement gate.
              </p>
            </div>

            <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-600 mb-2">
                <ShieldCheck size={14} className="text-teal-600" />
                Preserved Tenant Data
              </div>
              <p className="text-sm font-semibold text-slate-900">Historical Records Preserved</p>
              <p className="text-[11px] text-slate-500 mt-1">
                Existing data and entitled base modules remain fully intact and operational.
              </p>
            </div>
          </div>

          {/* Action Row */}
          <div className="pt-4 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3">
            <p className="text-xs text-slate-500 text-center sm:text-left">
              To activate this module, request a license entitlement update from your organization administrator.
            </p>
            <div className="flex items-center gap-3">
              {onNavigateHome && (
                <button
                  onClick={onNavigateHome}
                  className="px-4 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
                >
                  Return to Dashboard
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
