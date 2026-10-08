'use client';

import React from 'react';
import { ObligationMetricsDto } from '@omnigrc/shared';
import { CheckSquare, Clock, AlertCircle, CheckCircle2, ChevronRight } from 'lucide-react';
import { AnimatedCountUp } from '@/components/ui/animated-count-up';
import { HorizontalBarChart, BarItem } from '../charts/horizontal-bar-chart';

interface ComplianceObligationsWidgetProps {
  metrics: ObligationMetricsDto;
  onNavigateToView?: (view: string) => void;
}

export function ComplianceObligationsWidget({ metrics, onNavigateToView }: ComplianceObligationsWidgetProps) {
  const completionRate = Math.round(metrics.completionRate || 0);
  const completed = metrics.completedCount || 0;
  const upcoming = metrics.upcomingCount || 0;
  const overdue = metrics.overdueCount || 0;
  const total = metrics.total || completed + upcoming + overdue;

  const barItems: BarItem[] = [
    { key: 'completed', label: 'Completed Tasks', value: completed, color: '#0d9488' },
    { key: 'upcoming', label: 'Due in 30 Days', value: upcoming, color: '#f59e0b' },
    { key: 'overdue', label: 'Overdue SLA', value: overdue, color: '#f43f5e' },
  ];

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-2xs hover:shadow-md transition-shadow flex flex-col justify-between h-full">
      <div>
        <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-teal-50 border border-teal-100 rounded-lg text-teal-600 shrink-0">
              <CheckSquare size={18} />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Compliance & Obligations</h3>
              <p className="text-xs text-slate-500">Task fulfillment & cadence</p>
            </div>
          </div>
          <button
            onClick={() => onNavigateToView?.('board')}
            className="text-xs font-semibold text-teal-700 hover:text-teal-800 flex items-center gap-1 hover:underline shrink-0"
            title="Open Compliance Board"
          >
            <span>Compliance Board</span>
            <ChevronRight size={14} />
          </button>
        </div>

        {/* Completion rate banner */}
        <div className="flex items-center justify-between p-2.5 bg-slate-50 border border-slate-200/80 rounded-lg mb-4">
          <span className="text-xs font-medium text-slate-600">Completion Rate</span>
          <span className="text-sm font-bold text-teal-700 omni-mono">{completionRate}%</span>
        </div>

        {/* Horizontal Bar Chart Visualization */}
        <div className="mb-4">
          <HorizontalBarChart
            items={barItems}
            maxValue={total || 1}
            emptyMessage="No compliance tasks assigned"
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 pt-3 border-t border-slate-100">
        <div
          onClick={() => onNavigateToView?.('board')}
          className="bg-amber-50/50 p-2.5 rounded-lg border border-amber-100/60 hover:bg-amber-100/50 transition-colors cursor-pointer"
        >
          <div className="flex items-center gap-1 text-[11px] font-medium text-amber-700">
            <Clock size={12} /> Due 30d
          </div>
          <div className="text-base font-bold text-amber-900 mt-1 omni-mono">
            <AnimatedCountUp value={metrics.upcomingCount} />
          </div>
        </div>

        <div
          onClick={() => onNavigateToView?.('board')}
          className="bg-rose-50/50 p-2.5 rounded-lg border border-rose-100/60 hover:bg-rose-100/50 transition-colors cursor-pointer"
        >
          <div className="flex items-center gap-1 text-[11px] font-medium text-rose-700">
            <AlertCircle size={12} /> Overdue
          </div>
          <div className="text-base font-bold text-rose-900 mt-1 omni-mono">
            <AnimatedCountUp value={metrics.overdueCount} />
          </div>
        </div>

        <div
          onClick={() => onNavigateToView?.('board')}
          className="bg-teal-50/50 p-2.5 rounded-lg border border-teal-100/60 hover:bg-teal-100/50 transition-colors cursor-pointer"
        >
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
