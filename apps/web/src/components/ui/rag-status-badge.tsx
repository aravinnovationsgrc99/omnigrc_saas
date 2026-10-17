'use client';

import React from 'react';
import { CheckCircle2, AlertTriangle, AlertOctagon, HelpCircle } from 'lucide-react';
import { RagStatus, RagAssessment } from '@omnigrc/shared';

export interface RagStatusBadgeProps {
  status: RagStatus;
  label?: string;
  detail?: string;
  size?: 'sm' | 'md';
  className?: string;
  showIcon?: boolean;
}

export function RagStatusBadge({
  status,
  label,
  detail,
  size = 'sm',
  className = '',
  showIcon = true,
}: RagStatusBadgeProps) {
  let badgeClass = 'omni-badge-slate';
  let Icon = HelpCircle;
  let defaultLabel = 'Not Assessed';

  switch (status) {
    case 'GREEN':
      badgeClass = 'omni-badge-teal';
      Icon = CheckCircle2;
      defaultLabel = 'Compliant / Low Risk';
      break;
    case 'AMBER':
      badgeClass = 'omni-badge-amber';
      Icon = AlertTriangle;
      defaultLabel = 'Moderate / In Review';
      break;
    case 'RED':
      badgeClass = 'omni-badge-rose';
      Icon = AlertOctagon;
      defaultLabel = 'Critical / High Risk';
      break;
    case 'NEUTRAL':
    default:
      badgeClass = 'omni-badge-slate';
      Icon = HelpCircle;
      defaultLabel = 'Not Assessed';
      break;
  }

  const displayLabel = label || defaultLabel;

  return (
    <span
      role="status"
      aria-label={`${displayLabel}${detail ? ` - ${detail}` : ''}`}
      title={detail || displayLabel}
      className={`${badgeClass} ${size === 'md' ? 'text-xs px-2.5 py-1' : 'text-[11px] px-2 py-0.5'} ${className}`}
    >
      {showIcon && <Icon className={size === 'md' ? 'w-3.5 h-3.5' : 'w-3 h-3'} />}
      <span>{displayLabel}</span>
    </span>
  );
}

// Defensible, documented threshold helpers
export function getVendorRag(score: number | null | undefined): RagAssessment {
  if (score === null || score === undefined || Number.isNaN(score)) {
    return {
      status: 'NEUTRAL',
      label: 'Unassessed',
      detail: 'No risk assessment recorded yet',
    };
  }
  if (score >= 80) {
    return {
      status: 'GREEN',
      label: 'Low Risk',
      detail: `Assessment score: ${score}/100`,
    };
  }
  if (score >= 50) {
    return {
      status: 'AMBER',
      label: 'Medium Risk',
      detail: `Assessment score: ${score}/100`,
    };
  }
  return {
    status: 'RED',
    label: 'High Risk',
    detail: `Assessment score: ${score}/100`,
  };
}

export function getRiskRag(score: number | null | undefined): RagAssessment {
  if (score === null || score === undefined || Number.isNaN(score) || score <= 0) {
    return {
      status: 'NEUTRAL',
      label: 'Unrated',
      detail: 'No likelihood x impact score assigned',
    };
  }
  if (score >= 15) {
    return {
      status: 'RED',
      label: 'High Risk',
      detail: `Risk Score: ${score}/25`,
    };
  }
  if (score >= 8) {
    return {
      status: 'AMBER',
      label: 'Medium Risk',
      detail: `Risk Score: ${score}/25`,
    };
  }
  return {
    status: 'GREEN',
    label: 'Low Risk',
    detail: `Risk Score: ${score}/25`,
  };
}

export function getAuditPlanRag(
  status: string,
  assessments?: Array<{ score?: number; checkItems?: Array<{ result?: string }> }>,
): RagAssessment {
  if (status === 'DRAFT' || status === 'PLANNED') {
    return {
      status: 'NEUTRAL',
      label: status === 'DRAFT' ? 'Draft' : 'Planned',
      detail: 'Audit plan awaiting execution',
    };
  }

  // Check if any assessment has failed items
  const allCheckItems = (assessments || []).flatMap((a) => a.checkItems || []);
  const failedCount = allCheckItems.filter((ci) => ci.result === 'NON_COMPLIANT').length;
  const compliantCount = allCheckItems.filter((ci) => ci.result === 'COMPLIANT').length;

  if (failedCount > 0) {
    return {
      status: 'RED',
      label: 'Non-Conformant',
      detail: `${failedCount} non-conformant finding(s) detected`,
    };
  }

  if (status === 'IN_PROGRESS') {
    return {
      status: 'AMBER',
      label: 'In Execution',
      detail: `${compliantCount} check(s) passed, audit in progress`,
    };
  }

  if (status === 'COMPLETED') {
    return {
      status: 'GREEN',
      label: 'Conformant',
      detail: 'All evaluated audit checks passed',
    };
  }

  return {
    status: 'NEUTRAL',
    label: status,
    detail: `Audit status: ${status}`,
  };
}
