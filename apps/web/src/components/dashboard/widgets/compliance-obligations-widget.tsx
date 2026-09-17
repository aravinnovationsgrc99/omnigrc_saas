'use client';

import React from 'react';
import { ObligationMetricsDto } from '@omnigrc/shared';
import { CheckSquare, Clock, AlertCircle, CheckCircle2 } from 'lucide-react';
import { AnimatedCountUp } from '@/components/ui/animated-count-up';

export function ComplianceObligationsWidget({ metrics }: { metrics: ObligationMetricsDto }) {
  const completionRate = Math.round(metrics.completionRate || 0);

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-teal-50 border border-teal-100 rounded-lg text-teal-600">
            <CheckSquare size={18} />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Compliance & Obligations</h3>
            <p className="text-xs text-slate-500">Recurring task review & fulfillment</p>
          </div>
        </div>
        <div className="text-right">
          <span className="text-lg font-bold text-teal-700 omni-mono">{completionRate}%</span>
          <p className="text-[11px] text-slate-500">Completion Rate</p>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="mb-4">
        <div className="h-2.5 w-full bg-slate-100 rounded-full overflow-hidden">
          <div
            style={{ width: `${completionRate}%` }}
            className="h-full bg-teal-600 transition-all duration-500"
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-100">
        <div className="bg-amber-50/50 p-2.5 rounded-lg border border-amber-100/60">
          <div className="flex items-center gap-1 text-[11px] font-medium text-amber-700">
            <Clock size={12} /> Due 30 Days
          </div>
          <div className="text-lg font-bold text-amber-900 mt-1 omni-mono">
            <AnimatedCountUp value={metrics.upcomingCount} />
          </div>
        </div>

        <div className="bg-rose-50/50 p-2.5 rounded-lg border border-rose-100/60">
          <div className="flex items-center gap-1 text-[11px] font-medium text-rose-700">
            <AlertCircle size={12} /> Overdue
          </div>
          <div className="text-lg font-bold text-rose-900 mt-1 omni-mono">
            <AnimatedCountUp value={metrics.overdueCount} />
          </div>
        </div>

        <div className="bg-teal-50/50 p-2.5 rounded-lg border border-teal-100/60">
          <div className="flex items-center gap-1 text-[11px] font-medium text-teal-700">
            <CheckCircle2 size={12} /> Completed
          </div>
          <div className="text-lg font-bold text-teal-900 mt-1 omni-mono">
            <AnimatedCountUp value={metrics.completedCount} />
          </div>
        </div>
      </div>
    </div>
  );
}
