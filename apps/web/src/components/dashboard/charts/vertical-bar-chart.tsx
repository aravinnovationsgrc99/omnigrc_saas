'use client';

import React from 'react';

export interface VerticalBarItem {
  key: string;
  label: string;
  value: number;
  color: string;
  onClick?: () => void;
}

interface VerticalBarChartProps {
  title?: string;
  items: VerticalBarItem[];
  emptyMessage?: string;
}

export function VerticalBarChart({
  title,
  items,
  emptyMessage = 'No data available',
}: VerticalBarChartProps) {
  const validItems = items.filter((item) => typeof item.value === 'number' && item.value >= 0);
  const maxValue = Math.max(...validItems.map((i) => i.value), 1);
  const totalValue = validItems.reduce((sum, item) => sum + item.value, 0);

  if (validItems.length === 0 || totalValue === 0) {
    return (
      <div className="flex items-center justify-center p-4 text-center border border-dashed border-slate-200 rounded-lg bg-slate-50/50 min-h-[120px]">
        <p className="text-xs text-slate-500 font-medium">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="w-full">
      {title && <h4 className="text-xs font-semibold text-slate-700 mb-3">{title}</h4>}

      {/* Bar area */}
      <div className="flex items-end gap-2 h-28 px-1">
        {validItems.map((item) => {
          const heightPercent = Math.max(4, (item.value / maxValue) * 100);
          const isClickable = typeof item.onClick === 'function';
          return (
            <div
              key={item.key}
              className="flex-1 flex flex-col items-center gap-1 group"
            >
              {/* Count label */}
              <span
                className="text-[11px] font-bold text-slate-700 omni-mono transition-colors group-hover:text-slate-900"
                aria-label={`${item.label}: ${item.value}`}
              >
                {item.value}
              </span>

              {/* Bar */}
              <div
                role={isClickable ? 'button' : undefined}
                tabIndex={isClickable ? 0 : undefined}
                onClick={item.onClick}
                onKeyDown={
                  isClickable
                    ? (e) => { if (e.key === 'Enter' || e.key === ' ') item.onClick?.(); }
                    : undefined
                }
                className={`w-full rounded-t-md transition-all duration-500 ${
                  isClickable
                    ? 'cursor-pointer hover:opacity-80 focus:outline-none focus:ring-2 focus:ring-offset-1'
                    : ''
                }`}
                style={{
                  height: `${heightPercent}%`,
                  backgroundColor: item.color,
                  ...(isClickable ? { '--tw-ring-color': item.color } as any : {}),
                }}
                title={`${item.label}: ${item.value}`}
              />
            </div>
          );
        })}
      </div>

      {/* X-axis labels */}
      <div className="flex gap-2 px-1 mt-1.5">
        {validItems.map((item) => (
          <div key={item.key} className="flex-1 flex flex-col items-center gap-0.5">
            <span
              className="w-2 h-2 rounded-full shrink-0"
              style={{ backgroundColor: item.color }}
            />
            <span
              className="text-[10px] font-semibold text-slate-600 text-center leading-tight"
            >
              {item.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

