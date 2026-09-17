'use client';

import React, { useState, useEffect } from 'react';
import {
  RemediationActionDto,
  RemediationQueryDto,
  PaginatedRemediationActionsDto,
} from '@omnigrc/shared';
import { Search, Filter, AlertTriangle, CheckCircle2, Clock, ExternalLink, RefreshCw } from 'lucide-react';

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
        return <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/20">Audit CAPA</span>;
      case 'Vulnerability':
        return <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">Vulnerability</span>;
      case 'Risk':
        return <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20">Risk Treatment</span>;
      default:
        return <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-slate-500/10 text-slate-400 border border-slate-500/20">{domain}</span>;
    }
  };

  const getSeverityBadge = (severity: string) => {
    switch (severity?.toUpperCase()) {
      case 'CRITICAL':
        return <span className="px-2 py-0.5 text-xs font-semibold rounded bg-red-500/20 text-red-400 border border-red-500/30">CRITICAL</span>;
      case 'HIGH':
        return <span className="px-2 py-0.5 text-xs font-semibold rounded bg-orange-500/20 text-orange-400 border border-orange-500/30">HIGH</span>;
      case 'MEDIUM':
        return <span className="px-2 py-0.5 text-xs font-semibold rounded bg-yellow-500/20 text-yellow-400 border border-yellow-500/30">MEDIUM</span>;
      default:
        return <span className="px-2 py-0.5 text-xs font-semibold rounded bg-slate-500/20 text-slate-400 border border-slate-500/30">LOW</span>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Remediation & Action Plan Workspace</h1>
          <p className="text-sm text-slate-400 mt-1">
            Normalized action items aggregated across Audit CAPAs, Vulnerability remediations, and Risk treatment plans.
          </p>
        </div>
        <button
          onClick={fetchActions}
          className="inline-flex items-center gap-2 px-3.5 py-2 text-sm font-medium rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      {/* Filter Bar */}
      <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800/80 backdrop-blur-sm space-y-4 sm:space-y-0 sm:flex sm:items-center sm:justify-between gap-4">
        <form onSubmit={handleSearchSubmit} className="flex-1 flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
            <input
              type="text"
              placeholder="Search title, description, or owner..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm bg-slate-950/80 border border-slate-800 rounded-lg text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition"
            />
          </div>
          <button
            type="submit"
            className="px-4 py-2 text-sm font-medium bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg transition"
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
            className="px-3 py-2 text-sm bg-slate-950 border border-slate-800 rounded-lg text-slate-300 focus:outline-none focus:border-cyan-500"
          >
            <option value="">All Source Types</option>
            <option value="AUDIT_CAPA">Audit CAPA</option>
            <option value="VULNERABILITY">Vulnerability</option>
            <option value="RISK_TREATMENT">Risk Treatment</option>
          </select>

          <label className="inline-flex items-center gap-2 text-sm text-slate-300 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={overdueOnly}
              onChange={(e) => {
                setOverdueOnly(e.target.checked);
                setPage(1);
              }}
              className="rounded bg-slate-950 border-slate-800 text-cyan-600 focus:ring-cyan-500"
            />
            <span>Overdue Only</span>
          </label>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="py-16 text-center text-slate-400 animate-pulse">Loading normalized remediation actions...</div>
      ) : error ? (
        <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">{error}</div>
      ) : !data || data.items.length === 0 ? (
        <div className="p-12 text-center rounded-xl bg-slate-900/40 border border-slate-800 text-slate-400">
          <CheckCircle2 className="w-10 h-10 mx-auto mb-3 text-slate-600" />
          <h3 className="text-base font-semibold text-slate-300">No Action Items Found</h3>
          <p className="text-sm text-slate-500 mt-1">No open remediation tasks match your selected filter criteria.</p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900/40">
            <table className="w-full text-left text-sm text-slate-300">
              <thead className="bg-slate-950/80 text-slate-400 font-medium text-xs border-b border-slate-800 uppercase tracking-wider">
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
              <tbody className="divide-y divide-slate-800/60">
                {data.items.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-800/30 transition">
                    <td className="py-3.5 px-4">
                      <div className="font-semibold text-slate-100">{item.title}</div>
                      {item.description && (
                        <div className="text-xs text-slate-400 line-clamp-1 mt-0.5">{item.description}</div>
                      )}
                    </td>
                    <td className="py-3.5 px-4">{getDomainBadge(item.originatingDomain)}</td>
                    <td className="py-3.5 px-4 text-xs font-mono text-slate-300">{item.owner || 'Unassigned'}</td>
                    <td className="py-3.5 px-4">{getSeverityBadge(item.priorityOrSeverity)}</td>
                    <td className="py-3.5 px-4 text-xs">
                      {item.dueDate ? (
                        <span className={`inline-flex items-center gap-1 ${item.isOverdue ? 'text-red-400 font-semibold' : 'text-slate-400'}`}>
                          <Clock className="w-3.5 h-3.5" />
                          {new Date(item.dueDate).toLocaleDateString()}
                          {item.isOverdue && <AlertTriangle className="w-3.5 h-3.5 text-red-400" />}
                        </span>
                      ) : (
                        <span className="text-slate-600">No SLA</span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-xs font-medium text-slate-300">{item.status}</td>
                    <td className="py-3.5 px-4 text-right">
                      <a
                        href={item.sourceReferenceUrl}
                        className="inline-flex items-center gap-1 text-xs text-cyan-400 hover:text-cyan-300 font-medium transition"
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
          <div className="flex items-center justify-between text-xs text-slate-400 px-1">
            <div>
              Showing {data.items.length} of {data.total} total items
            </div>
            <div className="flex gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="px-3 py-1.5 rounded bg-slate-800 text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-700"
              >
                Previous
              </button>
              <button
                disabled={page * data.limit >= data.total}
                onClick={() => setPage((p) => p + 1)}
                className="px-3 py-1.5 rounded bg-slate-800 text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-700"
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
