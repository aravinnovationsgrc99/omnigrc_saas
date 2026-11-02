'use client';

import React from 'react';
import { AuditMetricsDto } from '@omnigrc/shared';
import { AlertTriangle, ChevronRight, Clock, CheckCircle2 } from 'lucide-react';
import { AnimatedCountUp } from '@/components/ui/animated-count-up';
import { HorizontalBarChart, BarItem } from '../charts/horizontal-bar-chart';
import { ModuleNotLicensedCard } from '@/components/ui/module-not-licensed-card';

interface OpenFindingsBySeverityWidgetProps {
  metrics: AuditMetricsDto;
  onNavigateToView?: (view: string, params?: Record<string, any>) => void;
}

export function OpenFindingsBySeverityWidget({
  metrics,
  onNavigateToView,
}: OpenFindingsBySeverityWidgetProps) {
  if (metrics?.isAvailable === false) {
    return (
      <ModuleNotLicensedCard
        title="Open Findings by Severity"
        description="Audit issues & remediation posture"
        icon={<AlertTriangle size={18} />}
      />
    );
  }

  const bySeverity = metrics?.findingsBySeverity || {};
  const critical = bySeverity.CRITICAL || 0;
  const high = bySeverity.HIGH || 0;
  const medium = bySeverity.MEDIUM || 0;
  const low = bySeverity.LOW || 0;
  const totalFromSeverity = critical + high + medium + low;
  const totalOpen = metrics?.findingsOpenCount ?? totalFromSeverity;
  const overdueCount = metrics?.findingsOverdueCount || 0;

  const barItems: BarItem[] = [
    {
      key: 'critical',
      label: 'Critical',
      value: critical,
      color: '#ef4444',
      badgeText: critical > 0 ? 'Urgent' : undefined,
    },
    {
      key: 'high',
      label: 'High',
      value: high,
      color: '#f97316',
      badgeText: high > 0 ? 'High SLA' : undefined,
    },
    {
      key: 'medium',
      label: 'Medium',
      value: medium,
      color: '#f59e0b',
    },
    {
      key: 'low',
      label: 'Low',
      value: low,
      color: '#10b981',
    },
  ];

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-2xs hover:shadow-md transition-shadow flex flex-col justify-between h-full">
      <div>
        <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-amber-50 border border-amber-100 rounded-lg text-amber-600 shrink-0">
              <AlertTriangle size={18} />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Open Findings by Severity</h3>
              <p className="text-xs text-slate-500">Audit deficiency severity breakdown</p>
            </div>
          </div>
          <button
            onClick={() => onNavigateToView?.('audits', { tab: 'findings' })}
            className="text-xs font-semibold text-amber-700 hover:text-amber-800 flex items-center gap-1 hover:underline shrink-0"
            title="Inspect Findings in Audit Module"
          >
            <span>Findings</span>
            <ChevronRight size={14} />
          </button>
        </div>

        {/* Posture Header Strip */}
        <div className="grid grid-cols-2 gap-2 mb-4">
          <div
            onClick={() => onNavigateToView?.('audits', { tab: 'findings', status: 'OPEN' })}
            className="bg-amber-50/50 p-2.5 rounded-lg border border-amber-100/60 hover:bg-amber-100/50 transition-colors cursor-pointer"
            title="Filter Active Open Findings"
          >
            <span className="text-xs text-amber-700 font-medium">Open Findings</span>
            <p className="text-base font-bold text-amber-900 mt-1 omni-mono">
              <AnimatedCountUp value={totalOpen} />
            </p>
          </div>

          <div
            onClick={() => onNavigateToView?.('audits', { tab: 'findings', filter: 'overdue' })}
            className="bg-rose-50/50 p-2.5 rounded-lg border border-rose-100/60 hover:bg-rose-100/50 transition-colors cursor-pointer"
            title="Filter Overdue Findings"
          >
            <div className="flex items-center gap-1 text-xs text-rose-700 font-medium">
              <Clock size={12} /> Overdue
            </div>
            <p className="text-base font-bold text-rose-900 mt-1 omni-mono">
              <AnimatedCountUp value={overdueCount} />
            </p>
          </div>
        </div>

        {/* Horizontal Bar Chart */}
        <div className="mb-2">
          <HorizontalBarChart
            items={barItems}
            maxValue={totalFromSeverity > 0 ? totalFromSeverity : 1}
            emptyMessage="No open audit findings recorded"
          />
        </div>
      </div>

      <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
        <div className="flex items-center gap-1">
          <CheckCircle2 size={13} className="text-emerald-500" />
          <span>Active CAPAs: {metrics?.capaOpenCount || 0}</span>
        </div>
        <button
          onClick={() => onNavigateToView?.('audits', { tab: 'findings' })}
          className="text-xs font-semibold text-teal-700 hover:text-teal-800 hover:underline"
        >
          View Register →
        </button>
      </div>
    </div>
  );
}

