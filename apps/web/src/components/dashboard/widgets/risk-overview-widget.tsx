'use client';

import React from 'react';
import { RiskMetricsDto } from '@omnigrc/shared';
import { ShieldAlert, AlertTriangle, ShieldCheck, Activity, ChevronRight } from 'lucide-react';
import { AnimatedCountUp } from '@/components/ui/animated-count-up';
import { DonutChart, ChartSegment } from '../charts/donut-chart';

interface RiskOverviewWidgetProps {
  metrics: RiskMetricsDto;
  onNavigateToView?: (view: string) => void;
}

export function RiskOverviewWidget({ metrics, onNavigateToView }: RiskOverviewWidgetProps) {
  const highCount = metrics.byScoreBand?.HIGH || 0;
  const mediumCount = metrics.byScoreBand?.MEDIUM || 0;
  const lowCount = metrics.byScoreBand?.LOW || 0;
  const total = metrics.totalOpen || highCount + mediumCount + lowCount;

  const byStatus = metrics.byStatus || {};
  const openCount = byStatus.OPEN || 0;
  const inTreatmentCount = byStatus.IN_TREATMENT || 0;
  const acceptedCount = byStatus.ACCEPTED || 0;
  const closedCount = byStatus.CLOSED || 0;

  const segments: ChartSegment[] = [
    { key: 'open', label: 'Open', value: openCount, color: '#f43f5e' },
    { key: 'in_treatment', label: 'In Treatment', value: inTreatmentCount, color: '#f59e0b' },
    { key: 'accepted', label: 'Accepted', value: acceptedCount, color: '#3b82f6' },
    { key: 'closed', label: 'Closed', value: closedCount, color: '#10b981' },
  ];

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-2xs hover:shadow-md transition-shadow flex flex-col justify-between h-full">
      <div>
        <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-rose-50 border border-rose-100 rounded-lg text-rose-600 shrink-0">
              <ShieldAlert size={18} />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Risk Overview</h3>
              <p className="text-xs text-slate-500">Open enterprise risk posture</p>
            </div>
          </div>
          <button
            onClick={() => onNavigateToView?.('risk')}
            className="text-xs font-semibold text-teal-700 hover:text-teal-800 flex items-center gap-1 hover:underline shrink-0"
            title="Open Risk Register"
          >
            <span>Register</span>
            <ChevronRight size={14} />
          </button>
        </div>

        {/* Donut Chart Visualization */}
        <div className="mb-4 pt-1 flex justify-center">
          <DonutChart
            segments={segments}
            centerLabel="Open Risks"
            centerValue={total}
            size={120}
            thickness={18}
            emptyMessage="No open risks registered"
          />
        </div>
      </div>

      {/* KPI Cards Strip */}
      <div className="grid grid-cols-3 gap-2 pt-3 border-t border-slate-100">
        <div
          onClick={() => onNavigateToView?.('risk')}
          className="bg-rose-50/50 p-2.5 rounded-lg border border-rose-100/60 hover:bg-rose-100/50 transition-colors cursor-pointer"
        >
          <div className="flex items-center gap-1 text-[11px] font-medium text-rose-700">
            <AlertTriangle size={12} /> High
          </div>
          <div className="text-base font-bold text-rose-900 mt-1 omni-mono">
            <AnimatedCountUp value={highCount} />
          </div>
        </div>

        <div
          onClick={() => onNavigateToView?.('risk')}
          className="bg-amber-50/50 p-2.5 rounded-lg border border-amber-100/60 hover:bg-amber-100/50 transition-colors cursor-pointer"
        >
          <div className="flex items-center gap-1 text-[11px] font-medium text-amber-700">
            <Activity size={12} /> Medium
          </div>
          <div className="text-base font-bold text-amber-900 mt-1 omni-mono">
            <AnimatedCountUp value={mediumCount} />
          </div>
        </div>

        <div
          onClick={() => onNavigateToView?.('risk')}
          className="bg-emerald-50/50 p-2.5 rounded-lg border border-emerald-100/60 hover:bg-emerald-100/50 transition-colors cursor-pointer"
        >
          <div className="flex items-center gap-1 text-[11px] font-medium text-emerald-700">
            <ShieldCheck size={12} /> Low
          </div>
          <div className="text-base font-bold text-emerald-900 mt-1 omni-mono">
            <AnimatedCountUp value={lowCount} />
          </div>
        </div>
      </div>
    </div>
  );
}
