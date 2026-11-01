'use client';

import React from 'react';
import { PolicyMetricsDto } from '@omnigrc/shared';
import { BookOpen, FileCheck2, Clock, FileText, ChevronRight } from 'lucide-react';
import { AnimatedCountUp } from '@/components/ui/animated-count-up';
import { StackedProgressBar, StackedSegment } from '../charts/stacked-progress-bar';
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

  const segments: StackedSegment[] = [
    {
      key: 'published',
      label: 'Published',
      value: published,
      color: '#0d9488',
      onClick: () => onNavigateToView?.('policies', { status: 'PUBLISHED' }),
    },
    {
      key: 'under_review',
      label: 'Under Review',
      value: underReview,
      color: '#0284c7',
      onClick: () => onNavigateToView?.('policies', { status: 'UNDER_REVIEW' }),
    },
    {
      key: 'approved',
      label: 'Approved',
      value: approved,
      color: '#f59e0b',
      onClick: () => onNavigateToView?.('policies', { status: 'APPROVED' }),
    },
    {
      key: 'draft',
      label: 'Draft',
      value: draft,
      color: '#64748b',
      onClick: () => onNavigateToView?.('policies', { status: 'DRAFT' }),
    },
    {
      key: 'retired',
      label: 'Retired',
      value: retired,
      color: '#94a3b8',
      onClick: () => onNavigateToView?.('policies', { status: 'RETIRED' }),
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
            <span className="text-xs font-medium text-slate-600">Publication Ratio</span>
            {overdueReviewCount > 0 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded font-bold bg-amber-100 text-amber-800 border border-amber-200">
                {overdueReviewCount} Due Review
              </span>
            )}
          </div>
          <span className="text-sm font-bold text-teal-700 omni-mono">{publishPercent}%</span>
        </div>

        {/* Stacked Progress Bar Lifecycle Visualization */}
        <div className="mb-4">
          <div className="text-xs font-semibold text-slate-700 mb-2">Policy Lifecycle Stage Pipeline</div>
          <StackedProgressBar
            segments={segments}
            total={total > 0 ? total : published + underReview + approved + draft + retired}
            height={12}
            showLegend={true}
            showPercentages={true}
            emptyMessage="No policies configured"
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 pt-3 border-t border-slate-100">
        <div
          onClick={() => onNavigateToView?.('policies')}
          className="bg-slate-50 p-2.5 rounded-lg border border-slate-200/80 hover:bg-slate-100/80 transition-colors cursor-pointer"
          title="View All Policies"
        >
          <div className="flex items-center gap-1 text-[11px] font-medium text-slate-700">
            <FileText size={12} /> Total
          </div>
          <div className="text-base font-bold text-slate-900 mt-1 omni-mono">
            <AnimatedCountUp value={metrics.total} />
          </div>
        </div>

        <div
          onClick={() => onNavigateToView?.('policies', { status: 'PUBLISHED' })}
          className="bg-teal-50/50 p-2.5 rounded-lg border border-teal-100/60 hover:bg-teal-100/50 transition-colors cursor-pointer"
          title="Filter Published Policies"
        >
          <div className="flex items-center gap-1 text-[11px] font-medium text-teal-700">
            <FileCheck2 size={12} /> Published
          </div>
          <div className="text-base font-bold text-teal-900 mt-1 omni-mono">
            <AnimatedCountUp value={metrics.publishedCount} />
          </div>
        </div>

        <div
          onClick={() => onNavigateToView?.('policies', { status: 'OVERDUE' })}
          className="bg-amber-50/50 p-2.5 rounded-lg border border-amber-100/60 hover:bg-amber-100/50 transition-colors cursor-pointer"
          title="Filter Overdue Policy Reviews"
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
