'use client';

import React from 'react';
import { PolicyMetricsDto } from '@omnigrc/shared';
import { BookOpen, FileCheck2, Clock, FileText } from 'lucide-react';
import { AnimatedCountUp } from '@/components/ui/animated-count-up';

export function PolicyGovernanceWidget({ metrics }: { metrics: PolicyMetricsDto }) {
  const publishedCount = metrics.publishedCount || 0;
  const total = metrics.total || 0;
  const publishPercent = total > 0 ? Math.round((publishedCount / total) * 100) : 0;

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-blue-50 border border-blue-100 rounded-lg text-blue-600">
            <BookOpen size={18} />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Policy Governance</h3>
            <p className="text-xs text-slate-500">Corporate policy lifecycles</p>
          </div>
        </div>
        <div className="text-right">
          <span className="text-lg font-bold text-blue-700 omni-mono">{publishPercent}%</span>
          <p className="text-[11px] text-slate-500">Published Ratio</p>
        </div>
      </div>

      <div className="mb-4">
        <div className="h-2.5 w-full bg-slate-100 rounded-full overflow-hidden">
          <div
            style={{ width: `${publishPercent}%` }}
            className="h-full bg-blue-600 transition-all duration-500"
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-100">
        <div className="bg-blue-50/50 p-2.5 rounded-lg border border-blue-100/60">
          <div className="flex items-center gap-1 text-[11px] font-medium text-blue-700">
            <FileText size={12} /> Total Policies
          </div>
          <div className="text-lg font-bold text-blue-900 mt-1 omni-mono">
            <AnimatedCountUp value={metrics.total} />
          </div>
        </div>

        <div className="bg-emerald-50/50 p-2.5 rounded-lg border border-emerald-100/60">
          <div className="flex items-center gap-1 text-[11px] font-medium text-emerald-700">
            <FileCheck2 size={12} /> Published
          </div>
          <div className="text-lg font-bold text-emerald-900 mt-1 omni-mono">
            <AnimatedCountUp value={metrics.publishedCount} />
          </div>
        </div>

        <div className="bg-amber-50/50 p-2.5 rounded-lg border border-amber-100/60">
          <div className="flex items-center gap-1 text-[11px] font-medium text-amber-700">
            <Clock size={12} /> Review Overdue
          </div>
          <div className="text-lg font-bold text-amber-900 mt-1 omni-mono">
            <AnimatedCountUp value={metrics.overdueReviewCount} />
          </div>
        </div>
      </div>
    </div>
  );
}
