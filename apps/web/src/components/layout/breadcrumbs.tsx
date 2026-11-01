'use client';

import React from 'react';
import { ChevronRight, Home } from 'lucide-react';

export interface BreadcrumbItem {
  label: string;
  view?: string;
  params?: Record<string, any>;
  onClick?: () => void;
  active?: boolean;
}

interface BreadcrumbsProps {
  currentView?: string;
  viewParams?: Record<string, any>;
  items?: BreadcrumbItem[];
  onNavigateToView?: (view: string, params?: Record<string, any>) => void;
  className?: string;
}

export const VIEW_TITLES: Record<string, string> = {
  dashboard: 'Dashboard',
  reports: 'Reports & Exports',
  risk: 'Risk Register',
  assets: 'Asset & Inventory',
  vulnerabilities: 'Vulnerabilities',
  incidents: 'Incidents',
  remediation: 'Remediation & Actions',
  controls: 'Control Mapping',
  frameworks: 'Framework Library',
  policies: 'Policy Management',
  approvals: 'Approval Center',
  audits: 'Audit Management',
  vendors: 'Vendor Risk',
  evidence: 'Evidence Vault',
  board: 'Compliance Board',
  intelligence: 'GRC Intelligence',
  'regulatory-intelligence': 'Regulatory Intelligence',
  integrations: 'Integrations Hub',
  mssp: 'MSSP Partner Portal',
  settings: 'Settings',
  audit: 'Audit Log',
};

export function Breadcrumbs({
  currentView = 'dashboard',
  viewParams = {},
  items,
  onNavigateToView,
  className = '',
}: BreadcrumbsProps) {
  // Build breadcrumbs chain
  let crumbs: BreadcrumbItem[] = [];

  if (items && items.length > 0) {
    // If custom items are passed, ensure Dashboard is root if not already present
    const hasDashboard = items.some((i) => i.view === 'dashboard' || i.label === 'Dashboard');
    if (!hasDashboard) {
      crumbs = [
        { label: 'Dashboard', view: 'dashboard' },
        ...items,
      ];
    } else {
      crumbs = items;
    }
  } else {
    // Auto-generate from currentView and viewParams
    const currentTitle = VIEW_TITLES[currentView] || currentView;

    if (currentView === 'dashboard') {
      crumbs = [{ label: 'Dashboard', view: 'dashboard', active: true }];
    } else {
      crumbs = [
        { label: 'Dashboard', view: 'dashboard' },
        { label: currentTitle, view: currentView, active: !viewParams?.detailTitle && !viewParams?.id },
      ];

      // If a nested detail item is specified in viewParams
      if (viewParams?.detailTitle) {
        crumbs.push({
          label: String(viewParams.detailTitle),
          active: true,
        });
      } else if (viewParams?.id) {
        crumbs.push({
          label: 'Details',
          active: true,
        });
      }
    }
  }

  return (
    <nav aria-label="Breadcrumb" className={`flex items-center text-xs text-slate-500 min-w-0 ${className}`}>
      <ol className="flex items-center gap-1.5 flex-wrap min-w-0 list-none p-0 m-0">
        {crumbs.map((crumb, idx) => {
          const isLast = idx === crumbs.length - 1;
          const isRoot = idx === 0;

          return (
            <li key={`${crumb.label}-${idx}`} className="flex items-center gap-1.5 min-w-0">
              {idx > 0 && (
                <ChevronRight size={13} className="text-slate-400 shrink-0 select-none" aria-hidden="true" />
              )}

              {isLast || crumb.active ? (
                <span
                  className="font-semibold text-slate-900 truncate max-w-[200px] sm:max-w-[320px]"
                  aria-current="page"
                >
                  {isRoot && <Home size={12} className="inline mr-1 -mt-0.5" />}
                  {crumb.label}
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    if (crumb.onClick) {
                      crumb.onClick();
                    } else if (crumb.view && onNavigateToView) {
                      onNavigateToView(crumb.view, crumb.params);
                    }
                  }}
                  className="hover:text-teal-700 transition-colors truncate max-w-[150px] sm:max-w-[220px] focus-visible:outline-2 focus-visible:outline-teal-600 rounded px-1 -mx-1"
                >
                  {isRoot && <Home size={12} className="inline mr-1 -mt-0.5 text-slate-400 hover:text-teal-700" />}
                  {crumb.label}
                </button>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

