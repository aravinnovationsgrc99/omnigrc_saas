'use client';

import React from 'react';

export function SkeletonLine({ width = '100%', height = '16px', className = '' }: { width?: string; height?: string; className?: string }) {
  return (
    <div
      className={`animate-pulse rounded bg-gray-200 ${className}`}
      style={{ width, height }}
      aria-hidden="true"
    />
  );
}

export function SkeletonTable({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="w-full border border-gray-200 rounded-lg overflow-hidden bg-white">
      <div className="bg-gray-50 border-b border-gray-200 px-4 py-3 flex gap-4">
        {Array.from({ length: cols }).map((_, i) => (
          <SkeletonLine key={i} width={`${100 / cols}%`} height="14px" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="px-4 py-3.5 border-b border-gray-100 flex gap-4 items-center">
          {Array.from({ length: cols }).map((_, c) => (
            <SkeletonLine key={c} width={`${100 / cols}%`} height="14px" />
          ))}
        </div>
      ))}
    </div>
  );
}

export function SkeletonBoard({ columns = 4 }: { columns?: number }) {
  return (
    <div className="flex gap-4 overflow-x-auto pb-4">
      {Array.from({ length: columns }).map((_, i) => (
        <div key={i} className="min-w-[260px] flex-1 bg-gray-50 border border-gray-200 rounded-lg p-3 space-y-3">
          <SkeletonLine width="60%" height="18px" />
          {Array.from({ length: 3 }).map((_, j) => (
            <div key={j} className="bg-white border border-gray-200 rounded p-3 space-y-2">
              <SkeletonLine width="80%" height="14px" />
              <SkeletonLine width="40%" height="12px" />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
