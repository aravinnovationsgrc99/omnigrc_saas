'use client';

import React from 'react';
import { EntitledFrameworkCoverageSummaryDto, ControlCoverageMetricsDto } from '@omnigrc/shared';
import { Layers, Lock, ShieldCheck, AlertCircle, HelpCircle } from 'lucide-react';
import { HorizontalBarChart, BarItem } from '../charts/horizontal-bar-chart';
import { AnimatedCountUp } from '@/components/ui/animated-count-up';

interface EntitledFrameworkCoverageWidgetProps {
  metrics?: EntitledFrameworkCoverageSummaryDto[];
  controls?: ControlCoverageMetricsDto;
}

export function EntitledFrameworkCoverageWidget({ metrics = [], controls }: EntitledFrameworkCoverageWidgetProps) {
  const colorPalette = ['#0d9488', '#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#6366f1'];

  const coverageItems: BarItem[] = metrics.map((fw, index) => ({
    key: fw.frameworkId || fw.code,
    label: `${fw.code} (${fw.name})`,
    value: fw.coveragePercentage,
    percentage: fw.coveragePercentage,
    color: colorPalette[index % colorPalette.length],
    badgeText: `${fw.covered}/${fw.totalReferences} Covered`,
  }));

  if (!metrics || metrics.length === 0) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
        <div className="flex items-center gap-2.5 mb-3">
          <div className="p-2 bg-slate-100 border border-slate-200 rounded-lg text-slate-600">
            <Lock size={18} />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Entitled Framework Coverage</h3>
            <p className="text-xs text-slate-500">Licensed framework compliance posture</p>
          </div>
        </div>
        <div className="p-4 bg-slate-50 border border-dashed border-slate-200 rounded-lg text-center text-xs text-slate-500 font-medium">
          No entitled frameworks active for this organization.
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-teal-50 border border-teal-100 rounded-lg text-teal-600">
            <Layers size={18} />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Entitled Framework & Control Coverage</h3>
            <p className="text-xs text-slate-500">Authoritative Phase C coverage for licensed frameworks</p>
          </div>
        </div>
        <span className="text-xs font-medium px-2.5 py-1 bg-teal-50 text-teal-700 rounded-full border border-teal-100">
          {metrics.length} Licensed
        </span>
      </div>

      {/* Horizontal Bar Chart for Entitled Frameworks */}
      <div className="pt-1">
        <HorizontalBarChart
          items={coverageItems}
          maxValue={100}
          showPercentage={true}
          emptyMessage="No coverage data available for entitled frameworks"
        />
      </div>

      {/* Controls Coverage Breakdown (Phase C Semantics) */}
      {controls && (
        <div className="pt-3 border-t border-slate-100">
          <div className="flex items-center justify-between text-xs text-slate-500 font-medium mb-2">
            <span>Control & Reference Coverage</span>
            <span className="text-teal-700 font-bold omni-mono">{controls.coveragePercentage}% Overall</span>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="bg-emerald-50/50 p-2.5 rounded-lg border border-emerald-100/60">
              <div className="flex items-center gap-1 text-[11px] font-medium text-emerald-700">
                <ShieldCheck size={12} /> Covered
              </div>
              <div className="text-base font-bold text-emerald-900 mt-1 omni-mono">
                <AnimatedCountUp value={controls.covered} />
              </div>
            </div>

            <div className="bg-amber-50/50 p-2.5 rounded-lg border border-amber-100/60">
              <div className="flex items-center gap-1 text-[11px] font-medium text-amber-700">
                <HelpCircle size={12} /> Partial
              </div>
              <div className="text-base font-bold text-amber-900 mt-1 omni-mono">
                <AnimatedCountUp value={controls.partial} />
              </div>
            </div>

            <div className="bg-rose-50/50 p-2.5 rounded-lg border border-rose-100/60">
              <div className="flex items-center gap-1 text-[11px] font-medium text-rose-700">
                <AlertCircle size={12} /> Not Covered
              </div>
              <div className="text-base font-bold text-rose-900 mt-1 omni-mono">
                <AnimatedCountUp value={controls.notCovered} />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
