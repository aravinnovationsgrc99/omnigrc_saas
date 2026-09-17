'use client';

import React, { useState, useEffect } from 'react';
import {
  RemediationActionDto,
  RemediationQueryDto,
  PaginatedRemediationActionsDto,
} from '@omnigrc/shared';
import { Search, AlertTriangle, CheckCircle2, Clock, ExternalLink, RefreshCw, CheckSquare } from 'lucide-react';

export function RemediationView() {
  const [data, setData] = useState<PaginatedRemediationActionsDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState('');
  const [sourceType, setSourceType] = useState<string>('');
  const [overdueOnly, setOverdueOnly] = useState<boolean>(false);
  const [page, setPage] = useState(1);

  const fetchActions = async () => {
    setLoading(true);
    setError(null);
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
      const params = new URLSearchParams();
      params.append('page', page.toString());
      params.append('limit', '15');
      if (search) params.append('search', search);
      if (sourceType) params.append('sourceType', sourceType);
      if (overdueOnly) params.append('overdueOnly', 'true');

      const res = await fetch(`/api/remediation/actions?${params.toString()}`, {
        headers: {
          Authorization: token ? `Bearer ${token}` : '',
        },
      });

      if (!res.ok) throw new Error('Failed to fetch remediation action items.');
      const result = await res.json();
      setData(result);
    } catch (err: any) {
      setError(err.message || 'An error occurred loading remediation actions.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchActions();
  }, [page, sourceType, overdueOnly]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchActions();
  };

  const getDomainBadge = (domain: string) => {
    switch (domain) {
      case 'Audit':
        return <span className="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-purple-100 text-purple-900 border border-purple-200">Audit CAPA</span>;
      case 'Vulnerability':
        return <span className="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-amber-100 text-amber-900 border border-amber-200">Vulnerability</span>;
      case 'Risk':
        return <span className="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-rose-100 text-rose-900 border border-rose-200">Risk Treatment</span>;
      default:
        return <span className="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-slate-100 text-slate-800 border border-slate-200">{domain}</span>;
    }
  };

  const getSeverityBadge = (severity: string) => {
    switch (severity?.toUpperCase()) {
      case 'CRITICAL':
        return <span className="px-2.5 py-0.5 text-xs font-bold rounded bg-red-100 text-red-900 border border-red-200">CRITICAL</span>;
      case 'HIGH':
        return <span className="px-2.5 py-0.5 text-xs font-bold rounded bg-orange-100 text-orange-900 border border-orange-200">HIGH</span>;
      case 'MEDIUM':
        return <span className="px-2.5 py-0.5 text-xs font-bold rounded bg-yellow-100 text-yellow-900 border border-yellow-200">MEDIUM</span>;
      default:
        return <span className="px-2.5 py-0.5 text-xs font-bold rounded bg-slate-100 text-slate-800 border border-slate-200">LOW</span>;
    }
  };

  return (
    <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 py-6 omni-fade-in space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <CheckSquare size={22} className="text-teal-700" />
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Remediation & Action Plan Workspace</h1>
          </div>
          <p className="text-xs sm:text-sm text-slate-600 mt-1">
            Normalized action items aggregated across Audit CAPAs, Vulnerability remediations, and Risk treatment plans.
          </p>
        </div>
        <button
          onClick={fetchActions}
          className="inline-flex items-center gap-2 px-3.5 py-2 text-sm font-semibold rounded-lg bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 transition shadow-sm"
        >
          <RefreshCw className="w-4 h-4 text-slate-500" />
          Refresh
        </button>
      </div>

      {/* Filter Bar */}
      <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 shadow-sm space-y-4 sm:space-y-0 sm:flex sm:items-center sm:justify-between gap-4">
        <form onSubmit={handleSearchSubmit} className="flex-1 flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search title, description, or owner..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm bg-white border border-slate-300 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-teal-600 transition"
            />
          </div>
          <button
            type="submit"
            className="px-4 py-2 text-sm font-semibold bg-teal-700 hover:bg-teal-800 text-white rounded-lg transition shadow-sm"
          >
            Filter
          </button>
        </form>

        <div className="flex items-center gap-3">
          <select
            value={sourceType}
            onChange={(e) => {
              setSourceType(e.target.value);
              setPage(1);
            }}
            className="px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg text-slate-800 focus:outline-none focus:ring-1 focus:ring-teal-600 font-medium"
          >
            <option value="">All Source Types</option>
            <option value="AUDIT_CAPA">Audit CAPA</option>
            <option value="VULNERABILITY">Vulnerability</option>
            <option value="RISK_TREATMENT">Risk Treatment</option>
          </select>

          <label className="inline-flex items-center gap-2 text-sm font-semibold text-slate-700 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={overdueOnly}
              onChange={(e) => {
                setOverdueOnly(e.target.checked);
                setPage(1);
              }}
              className="rounded bg-white border-slate-300 text-teal-700 focus:ring-teal-600"
            />
            <span>Overdue Only</span>
          </label>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="py-16 text-center text-slate-500 font-medium">Loading normalized remediation actions...</div>
      ) : error ? (
        <div className="p-4 rounded-lg bg-red-50 border border-red-200 text-red-900 text-sm font-medium">{error}</div>
      ) : !data || data.items.length === 0 ? (
        <div className="p-12 text-center rounded-xl bg-white border border-slate-200 shadow-sm text-slate-500">
          <CheckCircle2 className="w-10 h-10 mx-auto mb-3 text-slate-400" />
          <h3 className="text-base font-bold text-slate-800">No Action Items Found</h3>
          <p className="text-sm text-slate-600 mt-1">No open remediation tasks match your selected filter criteria.</p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full text-left text-sm text-slate-800">
              <thead className="bg-slate-50 text-slate-700 font-bold text-xs border-b border-slate-200 uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-4">Action Item</th>
                  <th className="py-3 px-4">Origin Domain</th>
                  <th className="py-3 px-4">Owner</th>
                  <th className="py-3 px-4">Priority / Severity</th>
                  <th className="py-3 px-4">Due Date</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.items.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/80 transition">
                    <td className="py-3.5 px-4">
                      <div className="font-bold text-slate-900 text-sm">{item.title}</div>
                      {item.description && (
                        <div className="text-xs text-slate-600 line-clamp-1 mt-0.5">{item.description}</div>
                      )}
                    </td>
                    <td className="py-3.5 px-4">{getDomainBadge(item.originatingDomain)}</td>
                    <td className="py-3.5 px-4 text-xs font-mono font-semibold text-slate-800">{item.owner || 'Unassigned'}</td>
                    <td className="py-3.5 px-4">{getSeverityBadge(item.priorityOrSeverity)}</td>
                    <td className="py-3.5 px-4 text-xs">
                      {item.dueDate ? (
                        <span className={`inline-flex items-center gap-1.5 ${item.isOverdue ? 'text-red-700 font-bold' : 'text-slate-700 font-medium'}`}>
                          <Clock className="w-3.5 h-3.5" />
                          {new Date(item.dueDate).toLocaleDateString()}
                          {item.isOverdue && <AlertTriangle className="w-3.5 h-3.5 text-red-600" />}
                        </span>
                      ) : (
                        <span className="text-slate-400">No SLA</span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-xs font-semibold text-slate-800">{item.status}</td>
                    <td className="py-3.5 px-4 text-right">
                      <a
                        href={item.sourceReferenceUrl}
                        className="inline-flex items-center gap-1 text-xs text-teal-700 hover:text-teal-800 font-bold transition"
                      >
                        View Source <ExternalLink className="w-3 h-3" />
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between text-xs text-slate-600 px-1 font-medium">
            <div>
              Showing {data.items.length} of {data.total} total items
            </div>
            <div className="flex gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="px-3 py-1.5 rounded-lg bg-white border border-slate-300 text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 font-semibold shadow-sm"
              >
                Previous
              </button>
              <button
                disabled={page * data.limit >= data.total}
                onClick={() => setPage((p) => p + 1)}
                className="px-3 py-1.5 rounded-lg bg-white border border-slate-300 text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 font-semibold shadow-sm"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
