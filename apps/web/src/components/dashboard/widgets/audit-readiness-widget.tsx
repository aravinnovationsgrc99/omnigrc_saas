'use client';

import React from 'react';
import { AuditMetricsDto } from '@omnigrc/shared';
import { FileCheck, ShieldCheck, ClipboardList } from 'lucide-react';
import { AnimatedCountUp } from '@/components/ui/animated-count-up';
import { DonutChart, ChartSegment } from '../charts/donut-chart';
import { HorizontalBarChart, BarItem } from '../charts/horizontal-bar-chart';

export function AuditReadinessWidget({ metrics }: { metrics: AuditMetricsDto }) {
  const score = metrics.overallAuditScore || 0;

  // Build Audit Plan Status Donut chart segments
  const byPlanStatus = metrics.byPlanStatus || {};
  const draftPlans = byPlanStatus.DRAFT || 0;
  const plannedPlans = byPlanStatus.PLANNED || 0;
  const inProgressPlans = byPlanStatus.IN_PROGRESS || 0;
  const completedPlans = byPlanStatus.COMPLETED || 0;

  const planSegments: ChartSegment[] = [
    { key: 'in_progress', label: 'In Progress', value: inProgressPlans, color: '#6366f1' },
    { key: 'planned', label: 'Planned', value: plannedPlans, color: '#3b82f6' },
    { key: 'completed', label: 'Completed', value: completedPlans, color: '#10b981' },
    { key: 'draft', label: 'Draft', value: draftPlans, color: '#94a3b8' },
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
    <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-indigo-50 border border-indigo-100 rounded-lg text-indigo-600">
            <FileCheck size={18} />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Audit & Remediation Readiness</h3>
            <p className="text-xs text-slate-500">Business audit scores, plans & CAPA status</p>
          </div>
        </div>
        <div className="text-right">
          <span className="text-lg font-bold text-indigo-700 omni-mono">{score}%</span>
          <p className="text-[11px] text-slate-500">Audit Score</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100">
          <div className="flex items-center gap-1.5 text-xs text-slate-600">
            <ClipboardList size={13} /> Active Plans
          </div>
          <div className="text-base font-bold text-slate-900 mt-1 omni-mono">
            <AnimatedCountUp value={metrics.totalPlans} />
          </div>
        </div>

        <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100">
          <div className="flex items-center gap-1.5 text-xs text-slate-600">
            <ShieldCheck size={13} /> Assessments
          </div>
          <div className="text-base font-bold text-slate-900 mt-1 omni-mono">
            <AnimatedCountUp value={metrics.assessmentCount} />
          </div>
        </div>
      </div>

      {/* Audit Plan Status Donut Visualization */}
      <div className="pt-1">
        <DonutChart
          segments={planSegments}
          centerLabel="Audit Plans"
          centerValue={metrics.totalPlans}
          size={120}
          thickness={18}
          emptyMessage="No audit plans registered"
        />
      </div>

      {/* Remediation CAPA Status Distribution */}
      {capaTotal > 0 && (
        <div className="pt-3 border-t border-slate-100">
          <div className="text-xs font-semibold text-slate-700 mb-2">Remediation CAPA Status</div>
          <HorizontalBarChart
            items={capaBarItems}
            maxValue={capaTotal}
            emptyMessage="No remediation CAPAs recorded"
          />
        </div>
      )}

      <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-100">
        <div className="bg-amber-50/50 p-2 rounded-lg text-center border border-amber-100/60">
          <p className="text-[11px] font-medium text-amber-700">Open Findings</p>
          <p className="text-sm font-bold text-amber-900 mt-0.5 omni-mono">
            <AnimatedCountUp value={metrics.findingsOpenCount} />
          </p>
        </div>

        <div className="bg-rose-50/50 p-2 rounded-lg text-center border border-rose-100/60">
          <p className="text-[11px] font-medium text-rose-700">Overdue Findings</p>
          <p className="text-sm font-bold text-rose-900 mt-0.5 omni-mono">
            <AnimatedCountUp value={metrics.findingsOverdueCount} />
          </p>
        </div>

        <div className="bg-indigo-50/50 p-2 rounded-lg text-center border border-indigo-100/60">
          <p className="text-[11px] font-medium text-indigo-700">Open CAPAs</p>
          <p className="text-sm font-bold text-indigo-900 mt-0.5 omni-mono">
            <AnimatedCountUp value={metrics.capaOpenCount} />
          </p>
        </div>
      </div>
    </div>
  );
}
