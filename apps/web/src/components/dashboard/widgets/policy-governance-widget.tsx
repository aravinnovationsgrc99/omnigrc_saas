'use client';

import React from 'react';
import { PolicyMetricsDto } from '@omnigrc/shared';
import { BookOpen, FileCheck2, Clock, FileText } from 'lucide-react';
import { AnimatedCountUp } from '@/components/ui/animated-count-up';
import { DonutChart, ChartSegment } from '../charts/donut-chart';

export function PolicyGovernanceWidget({ metrics }: { metrics: PolicyMetricsDto }) {
  const publishedCount = metrics.publishedCount || 0;
  const overdueReviewCount = metrics.overdueReviewCount || 0;
  const total = metrics.total || 0;
  const publishPercent = total > 0 ? Math.round((publishedCount / total) * 100) : 0;

  // Build segments directly from backend byStatus map using real backend PolicyStatus values
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

      {/* Donut Chart Visualization */}
      <div className="mb-4 pt-1">
        <DonutChart
          segments={segments}
          centerLabel="Total Policies"
          centerValue={total}
          size={120}
          thickness={18}
          emptyMessage="No policies configured"
        />
      </div>

      <div className="grid grid-cols-3 gap-2 pt-3 border-t border-slate-100">
        <div className="bg-blue-50/50 p-2.5 rounded-lg border border-blue-100/60">
          <div className="flex items-center gap-1 text-[11px] font-medium text-blue-700">
            <FileText size={12} /> Total
          </div>
          <div className="text-base font-bold text-blue-900 mt-1 omni-mono">
            <AnimatedCountUp value={metrics.total} />
          </div>
        </div>

        <div className="bg-emerald-50/50 p-2.5 rounded-lg border border-emerald-100/60">
          <div className="flex items-center gap-1 text-[11px] font-medium text-emerald-700">
            <FileCheck2 size={12} /> Published
          </div>
          <div className="text-base font-bold text-emerald-900 mt-1 omni-mono">
            <AnimatedCountUp value={metrics.publishedCount} />
          </div>
        </div>

        <div className="bg-amber-50/50 p-2.5 rounded-lg border border-amber-100/60">
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
