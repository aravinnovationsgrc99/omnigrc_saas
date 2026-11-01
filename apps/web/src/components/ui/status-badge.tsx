'use client';

import React from 'react';
import { LucideIcon } from 'lucide-react';

export type StatusBadgeVariant = 'teal' | 'amber' | 'rose' | 'blue' | 'purple' | 'slate' | 'gold';

interface StatusBadgeProps {
  label: string;
  variant?: StatusBadgeVariant;
  icon?: LucideIcon;
  size?: 'sm' | 'md';
  dot?: boolean;
  className?: string;
  title?: string;
}

const VARIANT_STYLES: Record<StatusBadgeVariant, { bg: string; text: string; border: string; dot: string }> = {
  teal: {
    bg: 'bg-teal-50',
    text: 'text-teal-800',
    border: 'border-teal-200',
    dot: 'bg-teal-600',
  },
  amber: {
    bg: 'bg-amber-50',
    text: 'text-amber-800',
    border: 'border-amber-200',
    dot: 'bg-amber-600',
  },
  rose: {
    bg: 'bg-rose-50',
    text: 'text-rose-800',
    border: 'border-rose-200',
    dot: 'bg-rose-600',
  },
  blue: {
    bg: 'bg-blue-50',
    text: 'text-blue-800',
    border: 'border-blue-200',
    dot: 'bg-blue-600',
  },
  purple: {
    bg: 'bg-purple-50',
    text: 'text-purple-800',
    border: 'border-purple-200',
    dot: 'bg-purple-600',
  },
  gold: {
    bg: 'bg-amber-50/70',
    text: 'text-[#B5750A]',
    border: 'border-amber-300',
    dot: 'bg-[#B5750A]',
  },
  slate: {
    bg: 'bg-slate-100',
    text: 'text-slate-700',
    border: 'border-slate-200',
    dot: 'bg-slate-500',
  },
};

export function StatusBadge({
  label,
  variant = 'slate',
  icon: Icon,
  size = 'sm',
  dot = false,
  className = '',
  title,
}: StatusBadgeProps) {
  const styles = VARIANT_STYLES[variant] || VARIANT_STYLES.slate;
  const isSm = size === 'sm';

  return (
    <span
      role="status"
      title={title || label}
      className={`inline-flex items-center gap-1.5 font-semibold rounded-md border transition-colors select-none ${
        styles.bg
      } ${styles.text} ${styles.border} ${
        isSm ? 'text-[11px] px-2 py-0.5' : 'text-xs px-2.5 py-1'
      } ${className}`}
    >
      {dot && (
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${styles.dot}`} aria-hidden="true" />
      )}
      {Icon && <Icon size={isSm ? 12 : 14} className="shrink-0" aria-hidden="true" />}
      <span className="truncate">{label}</span>
    </span>
  );
}

