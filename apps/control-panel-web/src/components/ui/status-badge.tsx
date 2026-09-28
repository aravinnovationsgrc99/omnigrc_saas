import React from 'react';
import { CheckCircle2, AlertTriangle, MinusCircle, XCircle, Clock } from 'lucide-react';

export type StatusVariant = 'ACTIVE' | 'SUSPENDED' | 'DISABLED' | 'REVOKED' | 'EXPIRED' | 'PENDING' | string;

interface StatusBadgeProps {
  status: StatusVariant;
  label?: string;
  size?: 'sm' | 'md';
}

export function StatusBadge({ status, label, size = 'md' }: StatusBadgeProps) {
  const normStatus = (status || '').toUpperCase();
  const textLabel = label || normStatus;

  let badgeStyle = 'bg-gray-800 text-gray-300 border-gray-700';
  let IconComponent = MinusCircle;

  switch (normStatus) {
    case 'ACTIVE':
    case 'VALID':
      badgeStyle = 'bg-emerald-950/80 text-emerald-300 border-emerald-800/60';
      IconComponent = CheckCircle2;
      break;
    case 'SUSPENDED':
      badgeStyle = 'bg-amber-950/80 text-amber-300 border-amber-800/60';
      IconComponent = AlertTriangle;
      break;
    case 'DISABLED':
      badgeStyle = 'bg-gray-800 text-gray-400 border-gray-700';
      IconComponent = MinusCircle;
      break;
    case 'REVOKED':
      badgeStyle = 'bg-rose-950/80 text-rose-300 border-rose-800/60';
      IconComponent = XCircle;
      break;
    case 'EXPIRED':
      badgeStyle = 'bg-orange-950/80 text-orange-300 border-orange-800/60';
      IconComponent = Clock;
      break;
    case 'PENDING':
    case 'TRIAL':
      badgeStyle = 'bg-blue-950/80 text-blue-300 border-blue-800/60';
      IconComponent = Clock;
      break;
  }

  const padding = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-xs font-medium';
  const iconSize = size === 'sm' ? 'w-3 h-3' : 'w-3.5 h-3.5';

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md border font-mono ${padding} ${badgeStyle}`}
      role="status"
      aria-label={`Status: ${textLabel}`}
    >
      <IconComponent className={iconSize} aria-hidden="true" />
      <span>{textLabel}</span>
    </span>
  );
}
