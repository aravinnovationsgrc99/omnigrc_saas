'use client';

import React from 'react';
import { AuditMetricsDto } from '@omnigrc/shared';
import { FileCheck, ShieldCheck, ClipboardList, ChevronRight } from 'lucide-react';
import { AnimatedCountUp } from '@/components/ui/animated-count-up';
import { StackedProgressBar, StackedSegment } from '../charts/stacked-progress-bar';
import { HorizontalBarChart, BarItem } from '../charts/horizontal-bar-chart';
import { ModuleNotLicensedCard } from '@/components/ui/module-not-licensed-card';

interface AuditReadinessWidgetProps {
  metrics: AuditMetricsDto;
  onNavigateToView?: (view: string, params?: Record<string, any>) => void;
}

export function AuditReadinessWidget({ metrics, onNavigateToView }: AuditReadinessWidgetProps) {
  if (metrics?.isAvailable === false) {
    return (
      <ModuleNotLicensedCard
        title="Audit Readiness"
        description="Audit plans & findings"
        icon={<FileCheck size={18} />}
      />
    );
  }

  const score = metrics.overallAuditScore || 0;

  // Build Audit Plan Status Stacked Bar segments
  const byPlanStatus = metrics.byPlanStatus || {};
  const draftPlans = byPlanStatus.DRAFT || 0;
  const plannedPlans = byPlanStatus.PLANNED || 0;
  const inProgressPlans = byPlanStatus.IN_PROGRESS || 0;
  const completedPlans = byPlanStatus.COMPLETED || 0;

  const planSegments: StackedSegment[] = [
    {
      key: 'in_progress',
      label: 'In Progress',
      value: inProgressPlans,
      color: '#0d9488',
      onClick: () => onNavigateToView?.('audits', { status: 'IN_PROGRESS' }),
    },
    {
      key: 'planned',
      label: 'Planned',
      value: plannedPlans,
      color: '#0284c7',
      onClick: () => onNavigateToView?.('audits', { status: 'PLANNED' }),
    },
    {
      key: 'completed',
      label: 'Completed',
      value: completedPlans,
      color: '#10b981',
      onClick: () => onNavigateToView?.('audits', { status: 'COMPLETED' }),
    },
    {
      key: 'draft',
      label: 'Draft',
      value: draftPlans,
      color: '#94a3b8',
      onClick: () => onNavigateToView?.('audits', { status: 'DRAFT' }),
    },
  ];

  // Build CAPA / Remediation Status Bar items
  const byCapaStatus = metrics.byCapaStatus || {};
  const capaBarItems: BarItem[] = [
    { key: 'open', label: 'CAPA Open', value: byCapaStatus.OPEN || 0, color: '#f43f5e' },
    { key: 'in_progress', label: 'CAPA In Progress', value: byCapaStatus.IN_PROGRESS || 0, color: '#f59e0b' },
    { key: 'completed', label: 'CAPA Completed', value: byCapaStatus.COMPLETED || 0, color: '#3b82f6' },
    { key: 'verified', label: 'CAPA Verified', value: byCapaStatus.VERIFIED || 0, color: '#10b981' },
  ];
  const capaTotal = Object.values(byCapaStatus).reduce((a, b) => a + b, 0);

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-2xs hover:shadow-md transition-shadow flex flex-col justify-between h-full">
      <div>
        <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-teal-50 border border-teal-100 rounded-lg text-teal-700 shrink-0">
              <FileCheck size={18} />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Audit & Remediation Readiness</h3>
              <p className="text-xs text-slate-500">Execution tracking & finding remediation</p>
            </div>
          </div>
          <button
            onClick={() => onNavigateToView?.('audits')}
            className="text-xs font-semibold text-teal-700 hover:text-teal-800 flex items-center gap-1 hover:underline shrink-0"
            title="Open Audits"
          >
            <span>Audits</span>
            <ChevronRight size={14} />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2 mb-4">
          <div
            onClick={() => onNavigateToView?.('audits')}
            className="bg-slate-50 p-2.5 rounded-lg border border-slate-200/80 hover:bg-slate-100/80 transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-1.5 text-xs text-slate-600">
              <ClipboardList size={13} /> Active Plans
            </div>
            <div className="text-base font-bold text-slate-900 mt-1 omni-mono">
              <AnimatedCountUp value={metrics.totalPlans} />
            </div>
          </div>

          <div
            onClick={() => onNavigateToView?.('audits')}
            className="bg-slate-50 p-2.5 rounded-lg border border-slate-200/80 hover:bg-slate-100/80 transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-1.5 text-xs text-slate-600">
              <ShieldCheck size={13} /> Audit Score
            </div>
            <div className="text-base font-bold text-teal-700 mt-1 omni-mono">
              <AnimatedCountUp value={score} suffix="%" />
            </div>
          </div>
        </div>

        {/* Audit Plan Progress Visualization */}
        <div className="mb-4">
          <div className="text-xs font-semibold text-slate-700 mb-2">Audit Plan Execution Status</div>
          <StackedProgressBar
            segments={planSegments}
            total={metrics.totalPlans > 0 ? metrics.totalPlans : draftPlans + plannedPlans + inProgressPlans + completedPlans}
            height={12}
            showLegend={true}
            showPercentages={true}
            emptyMessage="No audit plans registered"
          />
        </div>

        {/* Remediation CAPA Status Distribution */}
        {capaTotal > 0 && (
          <div className="pt-3 border-t border-slate-100 mb-4">
            <div className="text-xs font-semibold text-slate-700 mb-2">Remediation CAPA Status</div>
            <HorizontalBarChart
              items={capaBarItems}
              maxValue={capaTotal}
              emptyMessage="No remediation CAPAs recorded"
            />
          </div>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2 pt-3 border-t border-slate-100">
        <div
          onClick={() => onNavigateToView?.('audits')}
          className="bg-amber-50/50 p-2 rounded-lg text-center border border-amber-100/60 hover:bg-amber-100/50 transition-colors cursor-pointer"
          title="Open Audit Findings"
        >
          <p className="text-[11px] font-medium text-amber-700">Open Findings</p>
          <p className="text-sm font-bold text-amber-900 mt-0.5 omni-mono">
            <AnimatedCountUp value={metrics.findingsOpenCount} />
          </p>
        </div>

        <div
          onClick={() => onNavigateToView?.('audits')}
          className="bg-rose-50/50 p-2 rounded-lg text-center border border-rose-100/60 hover:bg-rose-100/50 transition-colors cursor-pointer"
          title="Inspect Overdue Findings"
        >
          <p className="text-[11px] font-medium text-rose-700">Overdue Findings</p>
          <p className="text-sm font-bold text-rose-900 mt-0.5 omni-mono">
            <AnimatedCountUp value={metrics.findingsOverdueCount} />
          </p>
        </div>

        <div
          onClick={() => onNavigateToView?.('remediation')}
          className="bg-teal-50/50 p-2 rounded-lg text-center border border-teal-100/60 hover:bg-teal-100/50 transition-colors cursor-pointer"
          title="Inspect Remediation CAPAs"
        >
          <p className="text-[11px] font-medium text-teal-700">Open CAPAs</p>
          <p className="text-sm font-bold text-teal-900 mt-0.5 omni-mono">
            <AnimatedCountUp value={metrics.capaOpenCount} />
          </p>
        </div>
      </div>
    </div>
  );
}
