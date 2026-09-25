'use client';

import React, { useState } from 'react';

export interface ChartSegment {
  key: string;
  label: string;
  value: number;
  color: string; // CSS color string e.g. '#f43f5e' or Tailwind hex
}

interface DonutChartProps {
  title?: string;
  segments: ChartSegment[];
  centerLabel?: string;
  centerValue?: string | number;
  size?: number;
  thickness?: number;
  emptyMessage?: string;
}

export function DonutChart({
  title,
  segments,
  centerLabel,
  centerValue,
  size = 140,
  thickness = 22,
  emptyMessage = 'No data available',
}: DonutChartProps) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const validSegments = segments.filter((s) => typeof s.value === 'number' && s.value >= 0);
  const total = validSegments.reduce((sum, s) => sum + s.value, 0);

  if (total === 0 || validSegments.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-4 text-center border border-dashed border-slate-200 rounded-lg bg-slate-50/50 min-h-[140px]">
        <p className="text-xs text-slate-500 font-medium">{emptyMessage}</p>
      </div>
    );
  }

  const center = size / 2;
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;

  let cumulativeAngle = 0;

  const segmentPaths = validSegments.map((segment, idx) => {
    const fraction = segment.value / total;
    const strokeDasharray = `${fraction * circumference} ${circumference}`;
    const strokeDashoffset = -cumulativeAngle * circumference;
    cumulativeAngle += fraction;

    const percentage = Math.round(fraction * 100);

    return {
      ...segment,
      fraction,
      percentage,
      strokeDasharray,
      strokeDashoffset,
      idx,
    };
  });

  const activeSegment = hoveredIdx !== null ? segmentPaths[hoveredIdx] : null;

  return (
    <div className="w-full flex flex-col items-center">
      {title && <h4 className="text-xs font-semibold text-slate-700 mb-2 w-full text-left">{title}</h4>}

      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 w-full">
        {/* SVG Donut Circle */}
        <div className="relative shrink-0 flex items-center justify-center" style={{ width: size, height: size }}>
          <svg
            width={size}
            height={size}
            viewBox={`0 0 ${size} ${size}`}
            className="transform -rotate-90 overflow-visible"
            role="img"
            aria-label={title || 'Donut chart distribution'}
          >
            {/* Background Track */}
            <circle
              cx={center}
              cy={center}
              r={radius}
              fill="none"
              stroke="#e2e8f0"
              strokeWidth={thickness}
            />

            {/* Segments */}
            {segmentPaths.map((seg) => (
              <circle
                key={seg.key}
                cx={center}
                cy={center}
                r={radius}
                fill="none"
                stroke={seg.color}
                strokeWidth={hoveredIdx === seg.idx ? thickness + 4 : thickness}
                strokeDasharray={seg.strokeDasharray}
                strokeDashoffset={seg.strokeDashoffset}
                className="transition-all duration-300 cursor-pointer origin-center"
                onMouseEnter={() => setHoveredIdx(seg.idx)}
                onMouseLeave={() => setHoveredIdx(null)}
              />
            ))}
          </svg>

          {/* Center Label Overlay */}
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center px-1">
            <span className="text-base sm:text-lg font-bold text-slate-900 omni-mono leading-none">
              {activeSegment ? activeSegment.value : centerValue ?? total}
            </span>
            <span className="text-[10px] font-medium text-slate-500 uppercase tracking-wider mt-0.5 max-w-[80px] truncate">
              {activeSegment ? activeSegment.label : centerLabel || 'Total'}
            </span>
          </div>
        </div>

        {/* Legend */}
        <div className="flex-1 w-full space-y-1.5 pl-0 sm:pl-2">
          {segmentPaths.map((seg) => (
            <div
              key={seg.key}
              onMouseEnter={() => setHoveredIdx(seg.idx)}
              onMouseLeave={() => setHoveredIdx(null)}
              className={`flex items-center justify-between text-xs p-1.5 rounded-md transition-colors cursor-pointer ${
                hoveredIdx === seg.idx ? 'bg-slate-100 font-semibold' : 'hover:bg-slate-50'
              }`}
            >
              <div className="flex items-center gap-2 truncate pr-2">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: seg.color }} />
                <span className="text-slate-700 truncate">{seg.label}</span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="font-bold text-slate-900 omni-mono">{seg.value}</span>
                <span className="text-[10px] text-slate-400 w-8 text-right font-medium">
                  {seg.percentage}%
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
