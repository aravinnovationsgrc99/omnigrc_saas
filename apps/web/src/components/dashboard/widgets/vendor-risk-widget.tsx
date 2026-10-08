'use client';

import React from 'react';
import { VendorMetricsDto } from '@omnigrc/shared';
import { Building2, ChevronRight } from 'lucide-react';
import { AnimatedCountUp } from '@/components/ui/animated-count-up';
import { DonutChart, ChartSegment } from '../charts/donut-chart';

interface VendorRiskWidgetProps {
  metrics: VendorMetricsDto;
  onNavigateToView?: (view: string) => void;
}

export function VendorRiskWidget({ metrics, onNavigateToView }: VendorRiskWidgetProps) {
  const critical = metrics.byCriticality?.CRITICAL || 0;
  const high = metrics.byCriticality?.HIGH || 0;
  const medium = metrics.byCriticality?.MEDIUM || 0;
  const low = metrics.byCriticality?.LOW || 0;
  const total = metrics.total || critical + high + medium + low;

  const segments: ChartSegment[] = [
    { key: 'critical', label: 'Critical Vendor', value: critical, color: '#dc2626' },
    { key: 'high', label: 'High Criticality', value: high, color: '#f97316' },
    { key: 'medium', label: 'Medium Criticality', value: medium, color: '#f59e0b' },
    { key: 'low', label: 'Low Criticality', value: low, color: '#64748b' },
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
              <h3 className="text-sm font-semibold text-slate-900">Vendor Risk</h3>
              <p className="text-xs text-slate-500">Third-party ecosystem & reviews</p>
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

        {/* Donut Chart Visualization */}
        <div className="mb-4 flex justify-center">
          <DonutChart
            segments={segments}
            centerLabel="Vendors"
            centerValue={total}
            size={120}
            thickness={18}
            emptyMessage="No vendors registered"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 pt-3 border-t border-slate-100">
        <div
          onClick={() => onNavigateToView?.('vendors')}
          className="bg-amber-50/50 p-2.5 rounded-lg border border-amber-100/60 hover:bg-amber-100/50 transition-colors cursor-pointer"
        >
          <span className="text-xs text-amber-700 font-medium">Review Required</span>
          <p className="text-base font-bold text-amber-900 mt-1 omni-mono">
            <AnimatedCountUp value={metrics.requiringReviewCount} />
          </p>
        </div>

        <div
          onClick={() => onNavigateToView?.('vendors')}
          className="bg-rose-50/50 p-2.5 rounded-lg border border-rose-100/60 hover:bg-rose-100/50 transition-colors cursor-pointer"
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
