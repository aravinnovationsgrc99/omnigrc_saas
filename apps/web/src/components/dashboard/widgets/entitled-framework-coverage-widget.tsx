'use client';

import React from 'react';
import { EntitledFrameworkCoverageSummaryDto, ControlCoverageMetricsDto } from '@omnigrc/shared';
import { Layers, Lock, ShieldCheck, AlertCircle, HelpCircle, ChevronRight } from 'lucide-react';
import { HorizontalBarChart, BarItem } from '../charts/horizontal-bar-chart';
import { AnimatedCountUp } from '@/components/ui/animated-count-up';

interface EntitledFrameworkCoverageWidgetProps {
  metrics?: EntitledFrameworkCoverageSummaryDto[];
  controls?: ControlCoverageMetricsDto;
  onNavigateToView?: (view: string) => void;
}

export function EntitledFrameworkCoverageWidget({
  metrics = [],
  controls,
  onNavigateToView,
}: EntitledFrameworkCoverageWidgetProps) {
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
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-2xs flex flex-col justify-between h-full">
        <div>
          <div className="flex items-center justify-between mb-3 pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-slate-100 border border-slate-200 rounded-lg text-slate-600 shrink-0">
                <Lock size={18} />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Entitled Framework Coverage</h3>
                <p className="text-xs text-slate-500">Licensed framework compliance posture</p>
              </div>
            </div>
            <button
              onClick={() => onNavigateToView?.('frameworks')}
              className="text-xs font-semibold text-teal-700 hover:text-teal-800 flex items-center gap-1 hover:underline shrink-0"
              title="Open Framework Library"
            >
              <span>Frameworks</span>
              <ChevronRight size={14} />
            </button>
          </div>
          <div className="p-4 bg-slate-50 border border-dashed border-slate-200 rounded-lg text-center text-xs text-slate-500 font-medium">
            No entitled frameworks active for this organization.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-2xs hover:shadow-md transition-shadow flex flex-col justify-between h-full">
      <div>
        <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-teal-50 border border-teal-100 rounded-lg text-teal-600 shrink-0">
              <Layers size={18} />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Entitled Framework Coverage</h3>
              <p className="text-xs text-slate-500">Authoritative coverage for licensed frameworks</p>
            </div>
          </div>
          <button
            onClick={() => onNavigateToView?.('frameworks')}
            className="text-xs font-semibold text-teal-700 hover:text-teal-800 flex items-center gap-1 hover:underline shrink-0"
            title="Open Framework Library"
          >
            <span>Frameworks</span>
            <ChevronRight size={14} />
          </button>
        </div>

        {/* Horizontal Bar Chart for Entitled Frameworks */}
        <div className="mb-4">
          <HorizontalBarChart
            items={coverageItems}
            maxValue={100}
            showPercentage={true}
            emptyMessage="No coverage data available for entitled frameworks"
          />
        </div>
      </div>

      {/* Controls Coverage Breakdown */}
      {controls && (
        <div className="pt-3 border-t border-slate-100">
          <div className="flex items-center justify-between text-xs text-slate-500 font-medium mb-2">
            <span>Control Reference Coverage</span>
            <span className="text-teal-700 font-bold omni-mono">{controls.coveragePercentage}% Overall</span>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div
              onClick={() => onNavigateToView?.('controls')}
              className="bg-emerald-50/50 p-2.5 rounded-lg border border-emerald-100/60 hover:bg-emerald-100/50 transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-1 text-[11px] font-medium text-emerald-700">
                <ShieldCheck size={12} /> Covered
              </div>
              <div className="text-base font-bold text-emerald-900 mt-1 omni-mono">
                <AnimatedCountUp value={controls.covered} />
              </div>
            </div>

            <div
              onClick={() => onNavigateToView?.('controls')}
              className="bg-amber-50/50 p-2.5 rounded-lg border border-amber-100/60 hover:bg-amber-100/50 transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-1 text-[11px] font-medium text-amber-700">
                <HelpCircle size={12} /> Partial
              </div>
              <div className="text-base font-bold text-amber-900 mt-1 omni-mono">
                <AnimatedCountUp value={controls.partial} />
              </div>
            </div>

            <div
              onClick={() => onNavigateToView?.('controls')}
              className="bg-rose-50/50 p-2.5 rounded-lg border border-rose-100/60 hover:bg-rose-100/50 transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-1 text-[11px] font-medium text-rose-700">
                <AlertCircle size={12} /> Uncovered
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
