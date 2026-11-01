'use client';

import React from 'react';
import { VendorMetricsDto } from '@omnigrc/shared';
import { Building2, ChevronRight, AlertTriangle } from 'lucide-react';
import { AnimatedCountUp } from '@/components/ui/animated-count-up';
import { StackedProgressBar, StackedSegment } from '../charts/stacked-progress-bar';
import { ModuleNotLicensedCard } from '@/components/ui/module-not-licensed-card';

interface VendorRiskWidgetProps {
  metrics: VendorMetricsDto;
  onNavigateToView?: (view: string, params?: Record<string, any>) => void;
}

export function VendorRiskWidget({ metrics, onNavigateToView }: VendorRiskWidgetProps) {
  if (metrics?.isAvailable === false) {
    return (
      <ModuleNotLicensedCard
        title="Vendor Risk"
        description="Third-party risk management"
        icon={<Building2 size={18} />}
      />
    );
  }

  const critical = metrics.byCriticality?.CRITICAL || 0;
  const high = metrics.byCriticality?.HIGH || 0;
  const medium = metrics.byCriticality?.MEDIUM || 0;
  const low = metrics.byCriticality?.LOW || 0;
  const total = metrics.total || critical + high + medium + low;

  const segments: StackedSegment[] = [
    {
      key: 'critical',
      label: 'Critical',
      value: critical,
      color: '#dc2626',
      onClick: () => onNavigateToView?.('vendors', { criticality: 'CRITICAL' }),
    },
    {
      key: 'high',
      label: 'High',
      value: high,
      color: '#f97316',
      onClick: () => onNavigateToView?.('vendors', { criticality: 'HIGH' }),
    },
    {
      key: 'medium',
      label: 'Medium',
      value: medium,
      color: '#f59e0b',
      onClick: () => onNavigateToView?.('vendors', { criticality: 'MEDIUM' }),
    },
    {
      key: 'low',
      label: 'Low',
      value: low,
      color: '#0d9488',
      onClick: () => onNavigateToView?.('vendors', { criticality: 'LOW' }),
    },
  ];

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-2xs hover:shadow-md transition-shadow flex flex-col justify-between h-full">
      <div>
        <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-orange-50 border border-orange-100 rounded-lg text-orange-600 shrink-0">
              <Building2 size={18} />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Third-Party Vendor Risk</h3>
              <p className="text-xs text-slate-500">Criticality tiering & compliance reviews</p>
            </div>
          </div>
          <button
            onClick={() => onNavigateToView?.('vendors')}
            className="text-xs font-semibold text-orange-700 hover:text-orange-800 flex items-center gap-1 hover:underline shrink-0"
            title="Open Vendor Management"
          >
            <span>Vendors</span>
            <ChevronRight size={14} />
          </button>
        </div>

        {/* Total Vendors Posture Header */}
        <div className="flex items-center justify-between p-2.5 bg-slate-50 border border-slate-200/80 rounded-lg mb-4">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-slate-600">Total Ecosystem</span>
            {critical > 0 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded font-bold bg-rose-100 text-rose-800 border border-rose-200">
                {critical} Tier-1 Critical
              </span>
            )}
          </div>
          <span className="text-sm font-bold text-slate-900 omni-mono">
            {total} Active
          </span>
        </div>

        {/* Stacked Criticality Tier Distribution */}
        <div className="mb-4">
          <div className="text-xs font-semibold text-slate-700 mb-2">Criticality Tier Distribution</div>
          <StackedProgressBar
            segments={segments}
            total={total > 0 ? total : critical + high + medium + low}
            height={12}
            showLegend={true}
            showPercentages={true}
            emptyMessage="No vendors registered"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 pt-3 border-t border-slate-100">
        <div
          onClick={() => onNavigateToView?.('vendors', { status: 'UNDER_REVIEW' })}
          className="bg-amber-50/50 p-2.5 rounded-lg border border-amber-100/60 hover:bg-amber-100/50 transition-colors cursor-pointer"
          title="Filter Vendors Requiring Review"
        >
          <span className="text-xs text-amber-700 font-medium">Review Required</span>
          <p className="text-base font-bold text-amber-900 mt-1 omni-mono">
            <AnimatedCountUp value={metrics.requiringReviewCount} />
          </p>
        </div>

        <div
          onClick={() => onNavigateToView?.('vendors', { status: 'OVERDUE' })}
          className="bg-rose-50/50 p-2.5 rounded-lg border border-rose-100/60 hover:bg-rose-100/50 transition-colors cursor-pointer"
          title="Filter Overdue Vendor Reviews"
        >
          <span className="text-xs text-rose-700 font-medium">Overdue Reviews</span>
          <p className="text-base font-bold text-rose-900 mt-1 omni-mono">
            <AnimatedCountUp value={metrics.assessmentsOverdueCount} />
          </p>
        </div>
      </div>
    </div>
  );
}
