'use client';

import React, { useState } from 'react';

export interface StackedSegment {
  key: string;
  label: string;
  value: number;
  color: string;
  badgeText?: string;
  onClick?: () => void;
}

interface StackedProgressBarProps {
  segments: StackedSegment[];
  total?: number;
  height?: number;
  showLegend?: boolean;
  showPercentages?: boolean;
  emptyMessage?: string;
  className?: string;
}

export function StackedProgressBar({
  segments,
  total: customTotal,
  height = 10,
  showLegend = true,
  showPercentages = true,
  emptyMessage = 'No data recorded',
  className = '',
}: StackedProgressBarProps) {
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);

  const validSegments = segments.filter((s) => typeof s.value === 'number' && s.value > 0);
  const calculatedTotal = customTotal !== undefined ? customTotal : validSegments.reduce((sum, s) => sum + s.value, 0);

  if (validSegments.length === 0 || calculatedTotal === 0) {
    return (
      <div className={`flex items-center justify-center p-3 text-center border border-dashed border-slate-200 rounded-lg bg-slate-50/50 min-h-[50px] ${className}`}>
        <p className="text-xs text-slate-400 font-medium">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className={`w-full space-y-2.5 ${className}`}>
      {/* Continuous Segmented Progress Track */}
      <div
        className="w-full bg-slate-100 rounded-full overflow-hidden flex transition-all relative"
        style={{ height }}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={calculatedTotal}
        aria-valuenow={validSegments.reduce((s, seg) => s + seg.value, 0)}
      >
        {validSegments.map((seg, idx) => {
          const pct = Math.max(0, Math.min(100, (seg.value / calculatedTotal) * 100));
          const isHovered = hoveredKey === seg.key;
          const isFirst = idx === 0;
          const isLast = idx === validSegments.length - 1;

          return (
            <div
              key={seg.key}
              onClick={seg.onClick}
              onMouseEnter={() => setHoveredKey(seg.key)}
              onMouseLeave={() => setHoveredKey(null)}
              style={{
                width: `${pct}%`,
                backgroundColor: seg.color,
                opacity: hoveredKey && !isHovered ? 0.45 : 1,
                cursor: seg.onClick ? 'pointer' : 'default',
                borderTopLeftRadius: isFirst ? height / 2 : 0,
                borderBottomLeftRadius: isFirst ? height / 2 : 0,
                borderTopRightRadius: isLast ? height / 2 : 0,
                borderBottomRightRadius: isLast ? height / 2 : 0,
              }}
              className="h-full transition-all duration-300 relative group"
              title={`${seg.label}: ${seg.value} (${Math.round(pct)}%)`}
            />
          );
        })}
      </div>

      {/* Interactive Legend Items with Hover & Click Drill-down */}
      {showLegend && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 pt-1">
          {segments.map((seg) => {
            const hasData = seg.value > 0;
            const pct = calculatedTotal > 0 ? Math.round((seg.value / calculatedTotal) * 100) : 0;
            const isHovered = hoveredKey === seg.key;

            return (
              <button
                key={seg.key}
                type="button"
                onClick={seg.onClick}
                onMouseEnter={() => setHoveredKey(seg.key)}
                onMouseLeave={() => setHoveredKey(null)}
                disabled={!seg.onClick}
                className={`flex items-center gap-1.5 text-xs rounded-md px-1.5 py-0.5 transition text-left ${
                  seg.onClick ? 'cursor-pointer hover:bg-slate-100/80 focus:outline-none focus:ring-1 focus:ring-teal-600' : 'cursor-default'
                } ${isHovered ? 'bg-slate-100 ring-1 ring-slate-300 font-semibold' : ''} ${
                  !hasData ? 'opacity-40' : ''
                }`}
              >
                <span
                  className="w-2 h-2 rounded-full shrink-0 transition-transform"
                  style={{
                    backgroundColor: seg.color,
                    transform: isHovered ? 'scale(1.25)' : 'scale(1)',
                  }}
                />
                <span className="text-slate-700">{seg.label}</span>
                <span className="font-bold text-slate-900 omni-mono ml-0.5">{seg.value}</span>
                {showPercentages && hasData && (
                  <span className="text-[10px] text-slate-400 font-medium">({pct}%)</span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

