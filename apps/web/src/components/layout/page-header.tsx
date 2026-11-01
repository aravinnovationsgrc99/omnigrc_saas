'use client';

import React from 'react';
import { ArrowLeft, LucideIcon } from 'lucide-react';
import { Breadcrumbs, BreadcrumbItem } from './breadcrumbs';

export interface PageHeaderProps {
  title: string;
  description?: string;
  icon?: LucideIcon;
  currentView?: string;
  viewParams?: Record<string, any>;
  breadcrumbItems?: BreadcrumbItem[];
  onNavigateToView?: (view: string, params?: Record<string, any>) => void;
  badge?: React.ReactNode;
  actions?: React.ReactNode;
  onBack?: () => void;
  backLabel?: string;
  className?: string;
}

export function PageHeader({
  title,
  description,
  icon: Icon,
  currentView,
  viewParams,
  breadcrumbItems,
  onNavigateToView,
  badge,
  actions,
  onBack,
  backLabel = 'Back',
  className = '',
}: PageHeaderProps) {
  return (
    <div className={`space-y-3 pb-5 border-b border-slate-200 ${className}`}>
      {/* Top row: Breadcrumbs and optional back button */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              aria-label={backLabel}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-teal-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 transition-colors focus-visible:outline-2 focus-visible:outline-teal-600 shrink-0"
            >
              <ArrowLeft size={14} />
              <span>{backLabel}</span>
            </button>
          )}

          <Breadcrumbs
            currentView={currentView}
            viewParams={viewParams}
            items={breadcrumbItems}
            onNavigateToView={onNavigateToView}
          />
        </div>

        {badge && <div className="shrink-0">{badge}</div>}
      </div>

      {/* Main title and actions row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            {Icon && <Icon size={22} className="text-teal-700 shrink-0" />}
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight truncate">
              {title}
            </h1>
          </div>
          {description && (
            <p className="text-xs sm:text-sm text-slate-500 mt-1 max-w-3xl leading-relaxed">
              {description}
            </p>
          )}
        </div>

        {actions && (
          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            {actions}
          </div>
        )}
      </div>
    </div>
  );
}

