'use client';

import React from 'react';
import { Lock, ShieldAlert } from 'lucide-react';

interface ModuleNotLicensedCardProps {
  title: string;
  description: string;
  icon?: React.ReactNode;
}

export function ModuleNotLicensedCard({ title, description, icon }: ModuleNotLicensedCardProps) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-2xs flex flex-col justify-between h-full relative overflow-hidden">
      <div>
        <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-slate-100 border border-slate-200 rounded-lg text-slate-500 shrink-0">
              {icon || <Lock size={18} />}
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
              <p className="text-xs text-slate-500">{description}</p>
            </div>
          </div>
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-800 border border-amber-200/80">
            <Lock size={11} /> Unlicensed
          </span>
        </div>

        <div className="py-6 px-4 bg-slate-50/80 border border-slate-200/60 rounded-lg flex flex-col items-center justify-center text-center">
          <div className="p-2.5 bg-amber-100/60 text-amber-700 rounded-full mb-2">
            <ShieldAlert size={20} />
          </div>
          <h4 className="text-xs font-semibold text-slate-800 mb-1">Commercial Capability Unavailable</h4>
          <p className="text-[11px] text-slate-500 max-w-[220px]">
            This capability is not included in your organization's active subscription agreement.
          </p>
        </div>
      </div>

      <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-400">
        <span>License upgrade required</span>
        <span className="font-medium text-slate-500 omni-mono">N/A</span>
      </div>
    </div>
  );
}
