'use client';

import React from 'react';
import { AuditMetricsDto } from '@omnigrc/shared';
import { FileCheck, ShieldCheck, ClipboardList, ChevronRight, CheckCircle2 } from 'lucide-react';
import { AnimatedCountUp } from '@/components/ui/animated-count-up';
import { DonutChart, ChartSegment } from '../charts/donut-chart';
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

  const score = metrics?.overallAuditScore || 0;

  // Build Audit Plan Status Donut segments
  const byPlanStatus = metrics?.byPlanStatus || {};
  const inProgressPlans = byPlanStatus.IN_PROGRESS || 0;
  const plannedPlans = byPlanStatus.PLANNED || 0;
  const completedPlans = byPlanStatus.COMPLETED || 0;
  const draftPlans = byPlanStatus.DRAFT || 0;
  const totalPlans = metrics?.totalPlans || (inProgressPlans + plannedPlans + completedPlans + draftPlans);

  const planSegments: ChartSegment[] = [
    {
      key: 'in_progress',
      label: 'In Progress',
      value: inProgressPlans,
      color: '#0284c7',
    },
    {
      key: 'planned',
      label: 'Planned',
      value: plannedPlans,
      color: '#f59e0b',
    },
    {
      key: 'completed',
      label: 'Completed',
      value: completedPlans,
      color: '#10b981',
    },
    {
      key: 'draft',
      label: 'Draft',
      value: draftPlans,
      color: '#94a3b8',
    },
  ];

  const byCapaStatus = metrics?.byCapaStatus || {};
  const capaOpen = metrics?.capaOpenCount || 0;
  const findingsOpen = metrics?.findingsOpenCount || 0;

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
              <p className="text-xs text-slate-500">Plan lifecycle & compliance execution</p>
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

        {/* Readiness Score Strip */}
        <div className="grid grid-cols-2 gap-2 mb-4">
          <div
            onClick={() => onNavigateToView?.('audits', { status: 'ACTIVE' })}
            className="bg-teal-50/50 p-2.5 rounded-lg border border-teal-100/60 hover:bg-teal-100/50 transition-colors cursor-pointer"
            title="Inspect Overall Audit Readiness Score"
          >
            <div className="flex items-center gap-1 text-xs text-teal-700 font-medium">
              <ShieldCheck size={13} /> Audit Score
            </div>
            <p className="text-xl font-bold text-teal-900 mt-1 omni-mono">
              <AnimatedCountUp value={score} suffix="%" />
            </p>
          </div>

          <div
            onClick={() => onNavigateToView?.('audits', { tab: 'assessments' })}
            className="bg-slate-50 p-2.5 rounded-lg border border-slate-200/80 hover:bg-slate-100/50 transition-colors cursor-pointer"
            title="Inspect Active Assessments"
          >
            <div className="flex items-center gap-1 text-xs text-slate-600 font-medium">
              <ClipboardList size={13} /> Assessments
            </div>
            <p className="text-xl font-bold text-slate-900 mt-1 omni-mono">
              <AnimatedCountUp value={metrics?.assessmentCount || 0} />
            </p>
          </div>
        </div>

        {/* Donut Chart Audit Plan Status */}
        <div className="mb-4">
          <DonutChart
            title="Audit Plan Lifecycle Status"
            segments={planSegments}
            centerValue={totalPlans}
            centerLabel="Plans"
            emptyMessage="No audit plans registered"
          />
        </div>
      </div>

      <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-600">
        <span
          onClick={() => onNavigateToView?.('audits', { tab: 'findings', status: 'OPEN' })}
          className="hover:text-amber-700 cursor-pointer"
        >
          Open Findings: <strong className="text-slate-900 omni-mono">{findingsOpen}</strong>
        </span>
        <span
          onClick={() => onNavigateToView?.('audits', { tab: 'capa' })}
          className="hover:text-teal-700 cursor-pointer flex items-center gap-1"
        >
          <CheckCircle2 size={12} className="text-teal-600" />
          Active CAPA: <strong className="text-slate-900 omni-mono">{capaOpen}</strong>
        </span>
      </div>
    </div>
  );
}
