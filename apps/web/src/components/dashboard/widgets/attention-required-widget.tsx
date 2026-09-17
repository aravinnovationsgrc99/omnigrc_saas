'use client';

import React from 'react';
import { AttentionItemDto } from '@omnigrc/shared';
import { AlertOctagon, ArrowUpRight, CheckCircle, Bug, CheckSquare, FileText } from 'lucide-react';

interface AttentionRequiredWidgetProps {
  items?: AttentionItemDto[];
  onNavigateToView?: (view: string) => void;
}

export function AttentionRequiredWidget({ items = [], onNavigateToView }: AttentionRequiredWidgetProps) {
  if (items.length === 0) {
    return (
      <div className="omni-card p-5 bg-emerald-50/50 border-emerald-200/80">
        <div className="flex items-center gap-2.5 text-emerald-800">
          <CheckCircle size={20} className="text-emerald-600" />
          <div>
            <h3 className="text-sm font-bold">Zero Critical Exceptions</h3>
            <p className="text-xs text-emerald-700 mt-0.5">
              All compliance tasks, vulnerabilities, and audit findings are within operational SLA windows.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const getDomainBadge = (domain: string) => {
    switch (domain) {
      case 'VULNERABILITY':
        return { label: 'Vulnerability', icon: Bug, color: 'bg-rose-100 text-rose-800 border border-rose-200' };
      case 'OBLIGATION':
        return { label: 'Obligation', icon: CheckSquare, color: 'bg-amber-100 text-amber-800 border border-amber-200' };
      case 'AUDIT_FINDING':
        return { label: 'Audit Finding', icon: FileText, color: 'bg-purple-100 text-purple-800 border border-purple-200' };
      case 'CAPA':
        return { label: 'CAPA Action', icon: CheckCircle, color: 'bg-blue-100 text-blue-800 border border-blue-200' };
      case 'POLICY':
        return { label: 'Policy Review', icon: FileText, color: 'bg-indigo-100 text-indigo-800 border border-indigo-200' };
      case 'VENDOR':
        return { label: 'Vendor Assessment', icon: AlertOctagon, color: 'bg-orange-100 text-orange-800 border border-orange-200' };
      default:
        return { label: domain, icon: AlertOctagon, color: 'bg-slate-100 text-slate-800 border border-slate-200' };
    }
  };

  return (
    <div className="omni-card p-5 space-y-4">
      <div className="flex items-center justify-between border-b border-slate-100 pb-3">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-rose-100 text-rose-800 rounded-lg">
            <AlertOctagon size={18} />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900">Attention Required — Critical Exceptions</h3>
            <p className="text-xs text-slate-500">
              Prioritized SLA breaches requiring immediate management intervention ({items.length} items)
            </p>
          </div>
        </div>
      </div>

      <div className="divide-y divide-slate-100">
        {items.map((item) => {
          const badge = getDomainBadge(item.domain);
          const Icon = badge.icon;
          const dueStr = item.dueDate ? new Date(item.dueDate).toLocaleDateString() : 'Overdue';

          return (
            <div key={item.id} className="py-3 flex items-center justify-between gap-3 hover:bg-slate-50/50 px-2 rounded-lg transition-colors">
              <div className="flex items-center gap-3 min-w-0">
                <span className={`px-2 py-0.5 text-[10px] font-bold rounded-md flex items-center gap-1 shrink-0 ${badge.color}`}>
                  <Icon size={12} /> {badge.label}
                </span>
                <div className="min-w-0">
                  <span className="text-xs font-semibold text-slate-900 truncate block">
                    {item.title}
                  </span>
                  <span className="text-[11px] text-rose-700 font-medium block">
                    {item.severityOrPriority} · Due {dueStr}
                  </span>
                </div>
              </div>

              {onNavigateToView && (
                <button
                  onClick={() => onNavigateToView(item.targetView)}
                  className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors shrink-0"
                  title={`Open in ${item.targetView}`}
                >
                  <ArrowUpRight size={16} />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
