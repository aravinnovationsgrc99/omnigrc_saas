'use client';

import React from 'react';
import { VendorMetricsDto } from '@omnigrc/shared';
import { Building2 } from 'lucide-react';
import { AnimatedCountUp } from '@/components/ui/animated-count-up';
import { DonutChart, ChartSegment } from '../charts/donut-chart';

export function VendorRiskWidget({ metrics }: { metrics: VendorMetricsDto }) {
  const critical = metrics.byCriticality?.CRITICAL || 0;
  const high = metrics.byCriticality?.HIGH || 0;
  const medium = metrics.byCriticality?.MEDIUM || 0;
  const low = metrics.byCriticality?.LOW || 0;
  const total = metrics.total || (critical + high + medium + low);

  const segments: ChartSegment[] = [
    { key: 'critical', label: 'Critical Vendor', value: critical, color: '#dc2626' },
    { key: 'high', label: 'High Criticality', value: high, color: '#f97316' },
    { key: 'medium', label: 'Medium Criticality', value: medium, color: '#f59e0b' },
    { key: 'low', label: 'Low Criticality', value: low, color: '#64748b' },
  ];

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-orange-50 border border-orange-100 rounded-lg text-orange-600">
            <Building2 size={18} />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Vendor Risk</h3>
            <p className="text-xs text-slate-500">Third-party ecosystem & reviews</p>
          </div>
        </div>
        <span className="text-xs font-medium px-2.5 py-1 bg-orange-50 text-orange-700 rounded-full border border-orange-100">
          <AnimatedCountUp value={metrics.total} /> Vendors
        </span>
      </div>

      {/* Donut Chart Visualization */}
      <div className="mb-4 pt-1">
        <DonutChart
          segments={segments}
          centerLabel="Vendors"
          centerValue={total}
          size={120}
          thickness={18}
          emptyMessage="No vendors registered"
        />
      </div>

      <div className="grid grid-cols-2 gap-2 pt-3 border-t border-slate-100">
        <div className="bg-amber-50/50 p-2.5 rounded-lg border border-amber-100/60">
          <span className="text-xs text-amber-700 font-medium">Review Required</span>
          <p className="text-base font-bold text-amber-900 mt-1 omni-mono">
            <AnimatedCountUp value={metrics.requiringReviewCount} />
          </p>
        </div>

        <div className="bg-rose-50/50 p-2.5 rounded-lg border border-rose-100/60">
          <span className="text-xs text-rose-700 font-medium">Overdue Reviews</span>
          <p className="text-base font-bold text-rose-900 mt-1 omni-mono">
            <AnimatedCountUp value={metrics.assessmentsOverdueCount} />
          </p>
        </div>
      </div>
    </div>
  );
}
