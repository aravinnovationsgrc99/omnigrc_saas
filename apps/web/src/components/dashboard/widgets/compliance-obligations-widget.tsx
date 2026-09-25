'use client';

import React from 'react';
import { ObligationMetricsDto } from '@omnigrc/shared';
import { CheckSquare, Clock, AlertCircle, CheckCircle2 } from 'lucide-react';
import { AnimatedCountUp } from '@/components/ui/animated-count-up';
import { HorizontalBarChart, BarItem } from '../charts/horizontal-bar-chart';

export function ComplianceObligationsWidget({ metrics }: { metrics: ObligationMetricsDto }) {
  const completionRate = Math.round(metrics.completionRate || 0);
  const completed = metrics.completedCount || 0;
  const upcoming = metrics.upcomingCount || 0;
  const overdue = metrics.overdueCount || 0;
  const total = metrics.total || (completed + upcoming + overdue);

  const barItems: BarItem[] = [
    { key: 'completed', label: 'Completed Tasks', value: completed, color: '#0d9488' },
    { key: 'upcoming', label: 'Due in 30 Days', value: upcoming, color: '#f59e0b' },
    { key: 'overdue', label: 'Overdue SLA', value: overdue, color: '#f43f5e' },
  ];

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-teal-50 border border-teal-100 rounded-lg text-teal-600">
            <CheckSquare size={18} />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Compliance & Obligations</h3>
            <p className="text-xs text-slate-500">Task fulfillment & cadence</p>
          </div>
        </div>
        <div className="text-right">
          <span className="text-lg font-bold text-teal-700 omni-mono">{completionRate}%</span>
          <p className="text-[11px] text-slate-500">Completion Rate</p>
        </div>
      </div>

      {/* Horizontal Bar Chart Visualization */}
      <div className="mb-4 pt-1">
        <HorizontalBarChart
          items={barItems}
          maxValue={total || 1}
          emptyMessage="No compliance tasks assigned"
        />
      </div>

      <div className="grid grid-cols-3 gap-2 pt-3 border-t border-slate-100">
        <div className="bg-amber-50/50 p-2.5 rounded-lg border border-amber-100/60">
          <div className="flex items-center gap-1 text-[11px] font-medium text-amber-700">
            <Clock size={12} /> Due 30d
          </div>
          <div className="text-base font-bold text-amber-900 mt-1 omni-mono">
            <AnimatedCountUp value={metrics.upcomingCount} />
          </div>
        </div>

        <div className="bg-rose-50/50 p-2.5 rounded-lg border border-rose-100/60">
          <div className="flex items-center gap-1 text-[11px] font-medium text-rose-700">
            <AlertCircle size={12} /> Overdue
          </div>
          <div className="text-base font-bold text-rose-900 mt-1 omni-mono">
            <AnimatedCountUp value={metrics.overdueCount} />
          </div>
        </div>

        <div className="bg-teal-50/50 p-2.5 rounded-lg border border-teal-100/60">
          <div className="flex items-center gap-1 text-[11px] font-medium text-teal-700">
            <CheckCircle2 size={12} /> Complete
          </div>
          <div className="text-base font-bold text-teal-900 mt-1 omni-mono">
            <AnimatedCountUp value={metrics.completedCount} />
          </div>
        </div>
      </div>
    </div>
  );
}
