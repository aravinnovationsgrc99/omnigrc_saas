'use client';

import React from 'react';
import { VendorMetricsDto } from '@omnigrc/shared';
import { Building2, AlertTriangle, ClipboardCheck, ShieldAlert } from 'lucide-react';
import { AnimatedCountUp } from '@/components/ui/animated-count-up';

export function VendorRiskWidget({ metrics }: { metrics: VendorMetricsDto }) {
  const critical = metrics.byCriticality.CRITICAL || 0;
  const high = metrics.byCriticality.HIGH || 0;
  const medium = metrics.byCriticality.MEDIUM || 0;
  const low = metrics.byCriticality.LOW || 0;

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-orange-50 border border-orange-100 rounded-lg text-orange-600">
            <Building2 size={18} />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Vendor Risk</h3>
            <p className="text-xs text-slate-500">Third-party ecosystem & reviews</p>
          </div>
        </div>
        <span className="text-xs font-medium px-2.5 py-1 bg-orange-50 text-orange-700 rounded-full border border-orange-100">
          <AnimatedCountUp value={metrics.total} /> Vendors
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 mb-4">
        <div className="bg-amber-50/50 p-2.5 rounded-lg border border-amber-100/60">
          <span className="text-xs text-amber-700 font-medium">Review Required</span>
          <p className="text-lg font-bold text-amber-900 mt-1 omni-mono">
            <AnimatedCountUp value={metrics.requiringReviewCount} />
          </p>
        </div>

        <div className="bg-rose-50/50 p-2.5 rounded-lg border border-rose-100/60">
          <span className="text-xs text-rose-700 font-medium">Assessments Overdue</span>
          <p className="text-lg font-bold text-rose-900 mt-1 omni-mono">
            <AnimatedCountUp value={metrics.assessmentsOverdueCount} />
          </p>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-1.5 pt-2 border-t border-slate-100">
        <div className="bg-red-50 p-2 rounded text-center border border-red-100">
          <span className="text-[10px] font-semibold text-red-700 block uppercase">Critical</span>
          <span className="text-xs font-bold text-red-900 omni-mono">{critical}</span>
        </div>
        <div className="bg-orange-50 p-2 rounded text-center border border-orange-100">
          <span className="text-[10px] font-semibold text-orange-700 block uppercase">High</span>
          <span className="text-xs font-bold text-orange-900 omni-mono">{high}</span>
        </div>
        <div className="bg-amber-50 p-2 rounded text-center border border-amber-100">
          <span className="text-[10px] font-semibold text-amber-700 block uppercase">Medium</span>
          <span className="text-xs font-bold text-amber-900 omni-mono">{medium}</span>
        </div>
        <div className="bg-slate-50 p-2 rounded text-center border border-slate-100">
          <span className="text-[10px] font-semibold text-slate-600 block uppercase">Low</span>
          <span className="text-xs font-bold text-slate-800 omni-mono">{low}</span>
        </div>
      </div>
    </div>
  );
}
