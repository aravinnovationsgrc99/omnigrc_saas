'use client';

import React from 'react';
import { PolicyMetricsDto } from '@omnigrc/shared';
import { BookOpen, FileCheck2, Clock, FileText, ChevronRight } from 'lucide-react';
import { AnimatedCountUp } from '@/components/ui/animated-count-up';
import { DonutChart, ChartSegment } from '../charts/donut-chart';

interface PolicyGovernanceWidgetProps {
  metrics: PolicyMetricsDto;
  onNavigateToView?: (view: string) => void;
}

export function PolicyGovernanceWidget({ metrics, onNavigateToView }: PolicyGovernanceWidgetProps) {
  const publishedCount = metrics.publishedCount || 0;
  const overdueReviewCount = metrics.overdueReviewCount || 0;
  const total = metrics.total || 0;
  const publishPercent = total > 0 ? Math.round((publishedCount / total) * 100) : 0;

  const byStatus = metrics.byStatus || {};
  const published = byStatus.PUBLISHED || 0;
  const underReview = byStatus.UNDER_REVIEW || 0;
  const approved = byStatus.APPROVED || 0;
  const draft = byStatus.DRAFT || 0;
  const retired = byStatus.RETIRED || 0;

  const segments: ChartSegment[] = [
    { key: 'published', label: 'Published', value: published, color: '#10b981' },
    { key: 'under_review', label: 'Under Review', value: underReview, color: '#3b82f6' },
    { key: 'approved', label: 'Approved', value: approved, color: '#06b6d4' },
    { key: 'draft', label: 'Draft', value: draft, color: '#64748b' },
    { key: 'retired', label: 'Retired', value: retired, color: '#94a3b8' },
  ];

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-2xs hover:shadow-md transition-shadow flex flex-col justify-between h-full">
      <div>
        <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-blue-50 border border-blue-100 rounded-lg text-blue-600 shrink-0">
              <BookOpen size={18} />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Policy Governance</h3>
              <p className="text-xs text-slate-500">Corporate policy lifecycles</p>
            </div>
          </div>
          <button
            onClick={() => onNavigateToView?.('policies')}
            className="text-xs font-semibold text-blue-700 hover:text-blue-800 flex items-center gap-1 hover:underline shrink-0"
            title="Open Policy Management"
          >
            <span>Policies</span>
            <ChevronRight size={14} />
          </button>
        </div>

        {/* Published percentage banner */}
        <div className="flex items-center justify-between p-2.5 bg-slate-50 border border-slate-200/80 rounded-lg mb-4">
          <span className="text-xs font-medium text-slate-600">Published Ratio</span>
          <span className="text-sm font-bold text-blue-700 omni-mono">{publishPercent}%</span>
        </div>

        {/* Donut Chart Visualization */}
        <div className="mb-4 flex justify-center">
          <DonutChart
            segments={segments}
            centerLabel="Total Policies"
            centerValue={total}
            size={120}
            thickness={18}
            emptyMessage="No policies configured"
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 pt-3 border-t border-slate-100">
        <div
          onClick={() => onNavigateToView?.('policies')}
          className="bg-blue-50/50 p-2.5 rounded-lg border border-blue-100/60 hover:bg-blue-100/50 transition-colors cursor-pointer"
        >
          <div className="flex items-center gap-1 text-[11px] font-medium text-blue-700">
            <FileText size={12} /> Total
          </div>
          <div className="text-base font-bold text-blue-900 mt-1 omni-mono">
            <AnimatedCountUp value={metrics.total} />
          </div>
        </div>

        <div
          onClick={() => onNavigateToView?.('policies')}
          className="bg-emerald-50/50 p-2.5 rounded-lg border border-emerald-100/60 hover:bg-emerald-100/50 transition-colors cursor-pointer"
        >
          <div className="flex items-center gap-1 text-[11px] font-medium text-emerald-700">
            <FileCheck2 size={12} /> Published
          </div>
          <div className="text-base font-bold text-emerald-900 mt-1 omni-mono">
            <AnimatedCountUp value={metrics.publishedCount} />
          </div>
        </div>

        <div
          onClick={() => onNavigateToView?.('policies')}
          className="bg-amber-50/50 p-2.5 rounded-lg border border-amber-100/60 hover:bg-amber-100/50 transition-colors cursor-pointer"
        >
          <div className="flex items-center gap-1 text-[11px] font-medium text-amber-700">
            <Clock size={12} /> Overdue
          </div>
          <div className="text-base font-bold text-amber-900 mt-1 omni-mono">
            <AnimatedCountUp value={metrics.overdueReviewCount} />
          </div>
        </div>
      </div>
    </div>
  );
}
