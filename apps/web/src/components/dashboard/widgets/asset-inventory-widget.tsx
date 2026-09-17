'use client';

import React from 'react';
import { AssetMetricsDto } from '@omnigrc/shared';
import { Server, AlertTriangle, Shield, Layers } from 'lucide-react';
import { AnimatedCountUp } from '@/components/ui/animated-count-up';

export function AssetInventoryWidget({ metrics }: { metrics: AssetMetricsDto }) {
  const managedCount = metrics.managedCount || 0;
  const unmanagedCount = metrics.unmanagedCount || 0;
  const total = metrics.total || (managedCount + unmanagedCount);

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-emerald-50 border border-emerald-100 rounded-lg text-emerald-600">
            <Server size={18} />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Asset Inventory</h3>
            <p className="text-xs text-slate-500">Infrastructure & software assets</p>
          </div>
        </div>
        <span className="text-xs font-medium px-2.5 py-1 bg-emerald-50 text-emerald-700 rounded-full border border-emerald-100">
          <AnimatedCountUp value={metrics.total} /> Assets
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2 mb-4">
        <div className="bg-rose-50/50 p-2.5 rounded-lg border border-rose-100/60">
          <div className="flex items-center gap-1 text-[11px] font-medium text-rose-700">
            <AlertTriangle size={12} /> High Criticality
          </div>
          <div className="text-lg font-bold text-rose-900 mt-1 omni-mono">
            <AnimatedCountUp value={metrics.criticalityHighCount} />
          </div>
        </div>

        <div className="bg-emerald-50/50 p-2.5 rounded-lg border border-emerald-100/60">
          <div className="flex items-center gap-1 text-[11px] font-medium text-emerald-700">
            <Shield size={12} /> Managed
          </div>
          <div className="text-lg font-bold text-emerald-900 mt-1 omni-mono">
            <AnimatedCountUp value={managedCount} />
          </div>
        </div>

        <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200">
          <div className="flex items-center gap-1 text-[11px] font-medium text-slate-600">
            <Layers size={12} /> Unmanaged
          </div>
          <div className="text-lg font-bold text-slate-800 mt-1 omni-mono">
            <AnimatedCountUp value={unmanagedCount} />
          </div>
        </div>
      </div>

      {/* Environment Breakdown */}
      <div className="pt-2 border-t border-slate-100">
        <div className="flex justify-between text-xs text-slate-500 mb-1 font-medium">
          <span>Environments</span>
          <span>Prod ({metrics.byEnvironment?.PRODUCTION || 0})</span>
        </div>
        <div className="flex gap-2 text-xs text-slate-600">
          <span className="px-2 py-0.5 bg-slate-100 rounded text-[11px]">
            Prod: {metrics.byEnvironment?.PRODUCTION || 0}
          </span>
          <span className="px-2 py-0.5 bg-slate-100 rounded text-[11px]">
            Staging: {metrics.byEnvironment?.STAGING || 0}
          </span>
          <span className="px-2 py-0.5 bg-slate-100 rounded text-[11px]">
            Dev: {metrics.byEnvironment?.DEVELOPMENT || 0}
          </span>
        </div>
      </div>
    </div>
  );
}
