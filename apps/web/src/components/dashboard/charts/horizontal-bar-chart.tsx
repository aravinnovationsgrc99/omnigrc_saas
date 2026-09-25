'use client';

import React from 'react';

export interface BarItem {
  key: string;
  label: string;
  value: number;
  percentage?: number;
  color: string;
  badgeText?: string;
}

interface HorizontalBarChartProps {
  title?: string;
  items: BarItem[];
  maxValue?: number;
  showPercentage?: boolean;
  emptyMessage?: string;
}

export function HorizontalBarChart({
  title,
  items,
  maxValue,
  showPercentage = true,
  emptyMessage = 'No data available',
}: HorizontalBarChartProps) {
  const validItems = items.filter((item) => typeof item.value === 'number' && item.value >= 0);
  const calculatedMax = maxValue || Math.max(...validItems.map((i) => i.value), 1);
  const totalValue = validItems.reduce((sum, item) => sum + item.value, 0);

  if (validItems.length === 0 || totalValue === 0) {
    return (
      <div className="flex items-center justify-center p-4 text-center border border-dashed border-slate-200 rounded-lg bg-slate-50/50 min-h-[100px]">
        <p className="text-xs text-slate-500 font-medium">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="w-full space-y-2.5">
      {title && <h4 className="text-xs font-semibold text-slate-700">{title}</h4>}

      <div className="space-y-2">
        {validItems.map((item) => {
          const widthPercent = Math.min(100, Math.max(0, (item.value / calculatedMax) * 100));
          const displayPercent =
            item.percentage !== undefined
              ? item.percentage
              : totalValue > 0
              ? Math.round((item.value / totalValue) * 100)
              : 0;

          return (
            <div key={item.key} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-1.5 truncate pr-2">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                  <span className="font-medium text-slate-800 truncate">{item.label}</span>
                  {item.badgeText && (
                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-100 text-slate-600 font-semibold border border-slate-200">
                      {item.badgeText}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="font-bold text-slate-900 omni-mono">{item.value}</span>
                  {showPercentage && (
                    <span className="text-[11px] text-slate-500 w-9 text-right font-medium">
                      {displayPercent}%
                    </span>
                  )}
                </div>
              </div>

              {/* Progress Track */}
              <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden flex">
                <div
                  style={{ width: `${widthPercent}%`, backgroundColor: item.color }}
                  className="h-full rounded-full transition-all duration-500"
                  title={`${item.label}: ${item.value} (${displayPercent}%)`}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
