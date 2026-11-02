'use client';

import React from 'react';
import { PolicyMetricsDto } from '@omnigrc/shared';
import { BookOpen, FileCheck2, Clock, ChevronRight } from 'lucide-react';
import { AnimatedCountUp } from '@/components/ui/animated-count-up';
import { DonutChart, ChartSegment } from '../charts/donut-chart';
import { ModuleNotLicensedCard } from '@/components/ui/module-not-licensed-card';

interface PolicyGovernanceWidgetProps {
  metrics: PolicyMetricsDto;
  onNavigateToView?: (view: string, params?: Record<string, any>) => void;
}

export function PolicyGovernanceWidget({ metrics, onNavigateToView }: PolicyGovernanceWidgetProps) {
  if (metrics?.isAvailable === false) {
    return (
      <ModuleNotLicensedCard
        title="Policy Governance"
        description="Corporate policy lifecycles"
        icon={<BookOpen size={18} />}
      />
    );
  }

  const publishedCount = metrics?.publishedCount || 0;
  const overdueReviewCount = metrics?.overdueReviewCount || 0;
  const pendingExceptionsCount = metrics?.pendingExceptionsCount || 0;
  const total = metrics?.total || 0;
  const publishPercent = total > 0 ? Math.round((publishedCount / total) * 100) : 0;

  const byStatus = metrics?.byStatus || {};
  const published = byStatus.PUBLISHED || 0;
  const underReview = byStatus.UNDER_REVIEW || 0;
  const approved = byStatus.APPROVED || 0;
  const draft = byStatus.DRAFT || 0;
  const retired = byStatus.RETIRED || 0;

  const donutSegments: ChartSegment[] = [
    {
      key: 'published',
      label: 'Published',
      value: published,
      color: '#10b981',
    },
    {
      key: 'under_review',
      label: 'Under Review',
      value: underReview,
      color: '#0284c7',
    },
    {
      key: 'approved',
      label: 'Approved',
      value: approved,
      color: '#f59e0b',
    },
    {
      key: 'draft',
      label: 'Draft',
      value: draft,
      color: '#64748b',
    },
    {
      key: 'retired',
      label: 'Retired',
      value: retired,
      color: '#94a3b8',
    },
  ];

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-2xs hover:shadow-md transition-shadow flex flex-col justify-between h-full">
      <div>
        <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-teal-50 border border-teal-100 rounded-lg text-teal-700 shrink-0">
              <BookOpen size={18} />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Policy Governance</h3>
              <p className="text-xs text-slate-500">Document lifecycle & cadence compliance</p>
            </div>
          </div>
          <button
            onClick={() => onNavigateToView?.('policies')}
            className="text-xs font-semibold text-teal-700 hover:text-teal-800 flex items-center gap-1 hover:underline shrink-0"
            title="Open Policy Management"
          >
            <span>Policies</span>
            <ChevronRight size={14} />
          </button>
        </div>

        {/* Published percentage banner */}
        <div className="flex items-center justify-between p-2.5 bg-slate-50 border border-slate-200/80 rounded-lg mb-4">
          <div className="flex items-center gap-2">
            <FileCheck2 size={16} className="text-emerald-600" />
            <span className="text-xs font-medium text-slate-600">Active Governance</span>
          </div>
          <span className="text-sm font-bold text-emerald-700 omni-mono">
            {publishPercent}% Published
          </span>
        </div>

        {/* Donut Chart Lifecycle Distribution */}
        <div className="mb-4">
          <DonutChart
            title="Lifecycle Status Breakdown"
            segments={donutSegments}
            centerValue={total}
            centerLabel="Policies"
            emptyMessage="No policies authored"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 pt-3 border-t border-slate-100">
        <div
          onClick={() => onNavigateToView?.('policies', { filter: 'overdue' })}
          className="bg-rose-50/50 p-2.5 rounded-lg border border-rose-100/60 hover:bg-rose-100/50 transition-colors cursor-pointer"
          title="Filter Policies Requiring Cadence Review"
        >
          <div className="flex items-center gap-1 text-[11px] font-medium text-rose-700">
            <Clock size={12} /> Overdue Review
          </div>
          <div className="text-base font-bold text-rose-900 mt-1 omni-mono">
            <AnimatedCountUp value={overdueReviewCount} />
          </div>
        </div>

        <div
          onClick={() => onNavigateToView?.('policies', { tab: 'exceptions' })}
          className="bg-amber-50/50 p-2.5 rounded-lg border border-amber-100/60 hover:bg-amber-100/50 transition-colors cursor-pointer"
          title="View Pending Policy Exceptions"
        >
          <span className="text-xs text-amber-700 font-medium">Exceptions</span>
          <div className="text-base font-bold text-amber-900 mt-1 omni-mono">
            <AnimatedCountUp value={pendingExceptionsCount} />
          </div>
        </div>
      </div>
    </div>
  );
}
