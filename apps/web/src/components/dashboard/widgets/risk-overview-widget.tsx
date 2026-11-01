'use client';

import React from 'react';
import { RiskMetricsDto } from '@omnigrc/shared';
import { ShieldAlert, AlertTriangle, ShieldCheck, Activity, ChevronRight } from 'lucide-react';
import { AnimatedCountUp } from '@/components/ui/animated-count-up';
import { StackedProgressBar, StackedSegment } from '../charts/stacked-progress-bar';
import { ModuleNotLicensedCard } from '@/components/ui/module-not-licensed-card';

interface RiskOverviewWidgetProps {
  metrics: RiskMetricsDto;
  onNavigateToView?: (view: string, params?: Record<string, any>) => void;
}

export function RiskOverviewWidget({ metrics, onNavigateToView }: RiskOverviewWidgetProps) {
  if (metrics?.isAvailable === false) {
    return (
      <ModuleNotLicensedCard
        title="Risk Overview"
        description="Open enterprise risk posture"
        icon={<ShieldAlert size={18} />}
      />
    );
  }

  const highCount = metrics.byScoreBand?.HIGH || 0;
  const mediumCount = metrics.byScoreBand?.MEDIUM || 0;
  const lowCount = metrics.byScoreBand?.LOW || 0;
  const total = metrics.totalOpen || highCount + mediumCount + lowCount;

  const byStatus = metrics.byStatus || {};
  const openCount = byStatus.OPEN || 0;
  const inTreatmentCount = byStatus.IN_TREATMENT || 0;
  const acceptedCount = byStatus.ACCEPTED || 0;
  const closedCount = byStatus.CLOSED || 0;

  const segments: StackedSegment[] = [
    {
      key: 'open',
      label: 'Open',
      value: openCount,
      color: '#f43f5e',
      onClick: () => onNavigateToView?.('risk', { status: 'OPEN' }),
    },
    {
      key: 'in_treatment',
      label: 'In Treatment',
      value: inTreatmentCount,
      color: '#f59e0b',
      onClick: () => onNavigateToView?.('risk', { status: 'IN_TREATMENT' }),
    },
    {
      key: 'accepted',
      label: 'Accepted',
      value: acceptedCount,
      color: '#0284c7',
      onClick: () => onNavigateToView?.('risk', { status: 'ACCEPTED' }),
    },
    {
      key: 'closed',
      label: 'Closed',
      value: closedCount,
      color: '#10b981',
      onClick: () => onNavigateToView?.('risk', { status: 'CLOSED' }),
    },
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
              <h3 className="text-sm font-semibold text-slate-900">Risk Posture Overview</h3>
              <p className="text-xs text-slate-500">Lifecycle distribution & critical exposure</p>
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

        {/* Posture Header Strip */}
        <div className="flex items-center justify-between p-2.5 bg-slate-50 border border-slate-200/80 rounded-lg mb-4">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-slate-600">Active Exposure</span>
            <span className="text-xs px-2 py-0.5 rounded-full font-bold bg-rose-100 text-rose-800">
              {highCount > 0 ? `${highCount} High SLA` : 'Stable'}
            </span>
          </div>
          <span className="text-sm font-bold text-slate-900 omni-mono">
            {total} Open Risks
          </span>
        </div>

        {/* Stacked Progress Bar Visualization */}
        <div className="mb-4">
          <div className="text-xs font-semibold text-slate-700 mb-2">Lifecycle Stage Progression</div>
          <StackedProgressBar
            segments={segments}
            total={total > 0 ? total : openCount + inTreatmentCount + acceptedCount + closedCount}
            height={12}
            showLegend={true}
            showPercentages={true}
            emptyMessage="No open risks registered"
          />
        </div>
      </div>

      {/* KPI Cards Strip */}
      <div className="grid grid-cols-3 gap-2 pt-3 border-t border-slate-100">
        <div
          onClick={() => onNavigateToView?.('risk', { band: 'HIGH' })}
          className="bg-rose-50/50 p-2.5 rounded-lg border border-rose-100/60 hover:bg-rose-100/50 transition-colors cursor-pointer"
          title="Filter High Severity Risks"
        >
          <div className="flex items-center gap-1 text-[11px] font-medium text-rose-700">
            <AlertTriangle size={12} /> High
          </div>
          <div className="text-base font-bold text-rose-900 mt-1 omni-mono">
            <AnimatedCountUp value={highCount} />
          </div>
        </div>

        <div
          onClick={() => onNavigateToView?.('risk', { band: 'MEDIUM' })}
          className="bg-amber-50/50 p-2.5 rounded-lg border border-amber-100/60 hover:bg-amber-100/50 transition-colors cursor-pointer"
          title="Filter Medium Severity Risks"
        >
          <div className="flex items-center gap-1 text-[11px] font-medium text-amber-700">
            <Activity size={12} /> Medium
          </div>
          <div className="text-base font-bold text-amber-900 mt-1 omni-mono">
            <AnimatedCountUp value={mediumCount} />
          </div>
        </div>

        <div
          onClick={() => onNavigateToView?.('risk', { band: 'LOW' })}
          className="bg-emerald-50/50 p-2.5 rounded-lg border border-emerald-100/60 hover:bg-emerald-100/50 transition-colors cursor-pointer"
          title="Filter Low Severity Risks"
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
