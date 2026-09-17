'use client';

import React, { useState, useEffect } from 'react';
import {
  IncidentDto,
  PaginatedIncidentsDto,
  IncidentSeverity,
  IncidentStatus,
  CreateIncidentDto,
} from '@omnigrc/shared';
import { Plus, Search, ShieldAlert, Clock, RefreshCw, X } from 'lucide-react';

export function IncidentListView() {
  const [data, setData] = useState<PaginatedIncidentsDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [severityFilter, setSeverityFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [page, setPage] = useState(1);

  // Modal State
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newSeverity, setNewSeverity] = useState<IncidentSeverity>(IncidentSeverity.MEDIUM);
  const [newOwner, setNewOwner] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchIncidents = async () => {
    setLoading(true);
    setError(null);
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
      const params = new URLSearchParams();
      params.append('page', page.toString());
      params.append('limit', '15');
      if (search) params.append('search', search);
      if (severityFilter) params.append('severity', severityFilter);
      if (statusFilter) params.append('status', statusFilter);

      const res = await fetch(`/api/incidents?${params.toString()}`, {
        headers: {
          Authorization: token ? `Bearer ${token}` : '',
        },
      });

      if (!res.ok) throw new Error('Failed to fetch incidents.');
      const result = await res.json();
      setData(result);
    } catch (err: any) {
      setError(err.message || 'An error occurred loading incidents.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchIncidents();
  }, [page, severityFilter, statusFilter]);

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    setSubmitting(true);
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
      const body: CreateIncidentDto = {
        title: newTitle.trim(),
        description: newDesc.trim() || undefined,
        severity: newSeverity,
        owner: newOwner.trim() || undefined,
      };

      const res = await fetch('/api/incidents', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: token ? `Bearer ${token}` : '',
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) throw new Error('Failed to log new incident.');

      setIsCreateOpen(false);
      setNewTitle('');
      setNewDesc('');
      setNewOwner('');
      fetchIncidents();
    } catch (err: any) {
      alert(err.message || 'Error creating incident');
    } finally {
      setSubmitting(false);
    }
  };

  const handleStatusTransition = async (incidentId: string, nextStatus: IncidentStatus) => {
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
      const res = await fetch(`/api/incidents/${incidentId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: token ? `Bearer ${token}` : '',
        },
        body: JSON.stringify({ status: nextStatus }),
      });

      if (!res.ok) throw new Error('Failed to update incident status.');
      fetchIncidents();
    } catch (err: any) {
      alert(err.message || 'Error updating status');
    }
  };

  const getSeverityBadge = (severity: IncidentSeverity) => {
    switch (severity) {
      case IncidentSeverity.CRITICAL:
        return <span className="px-2.5 py-0.5 text-xs font-bold rounded bg-red-100 text-red-900 border border-red-200">CRITICAL</span>;
      case IncidentSeverity.HIGH:
        return <span className="px-2.5 py-0.5 text-xs font-bold rounded bg-orange-100 text-orange-900 border border-orange-200">HIGH</span>;
      case IncidentSeverity.MEDIUM:
        return <span className="px-2.5 py-0.5 text-xs font-bold rounded bg-yellow-100 text-yellow-900 border border-yellow-200">MEDIUM</span>;
      default:
        return <span className="px-2.5 py-0.5 text-xs font-bold rounded bg-slate-100 text-slate-800 border border-slate-200">LOW</span>;
    }
  };

  const getStatusBadge = (status: IncidentStatus) => {
    switch (status) {
      case IncidentStatus.OPEN:
        return <span className="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-rose-100 text-rose-900 border border-rose-200">OPEN</span>;
      case IncidentStatus.IN_INVESTIGATION:
        return <span className="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-blue-100 text-blue-900 border border-blue-200">IN INVESTIGATION</span>;
      case IncidentStatus.CONTAINED:
        return <span className="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-amber-100 text-amber-900 border border-amber-200">CONTAINED</span>;
      case IncidentStatus.RESOLVED:
      case IncidentStatus.CLOSED:
        return <span className="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-emerald-100 text-emerald-900 border border-emerald-200">{status}</span>;
      default:
        return <span className="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-slate-100 text-slate-800 border border-slate-200">{status}</span>;
    }
  };

  return (
    <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 py-6 omni-fade-in space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <ShieldAlert size={22} className="text-teal-700" />
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Incident Management Workspace</h1>
          </div>
          <p className="text-xs sm:text-sm text-slate-600 mt-1">
            Track, contain, and remediate operational and security incidents with full audit lineage.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={fetchIncidents}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-sm font-semibold rounded-lg bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 transition shadow-sm"
          >
            <RefreshCw className="w-4 h-4 text-slate-500" />
            Refresh
          </button>
          <button
            onClick={() => setIsCreateOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg bg-teal-700 hover:bg-teal-800 text-white shadow-sm transition"
          >
            <Plus className="w-4 h-4" /> Log Incident
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 shadow-sm space-y-4 sm:space-y-0 sm:flex sm:items-center sm:justify-between gap-4">
        <form onSubmit={(e) => { e.preventDefault(); setPage(1); fetchIncidents(); }} className="flex-1 flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search title, description, root cause..."
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
            value={severityFilter}
            onChange={(e) => { setSeverityFilter(e.target.value); setPage(1); }}
            className="px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg text-slate-800 focus:outline-none focus:ring-1 focus:ring-teal-600 font-medium"
          >
            <option value="">All Severities</option>
            <option value="CRITICAL">Critical</option>
            <option value="HIGH">High</option>
            <option value="MEDIUM">Medium</option>
            <option value="LOW">Low</option>
          </select>

          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            className="px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg text-slate-800 focus:outline-none focus:ring-1 focus:ring-teal-600 font-medium"
          >
            <option value="">All Statuses</option>
            <option value="OPEN">Open</option>
            <option value="IN_INVESTIGATION">In Investigation</option>
            <option value="CONTAINED">Contained</option>
            <option value="RESOLVED">Resolved</option>
            <option value="CLOSED">Closed</option>
          </select>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="py-16 text-center text-slate-500 font-medium">Loading incidents...</div>
      ) : error ? (
        <div className="p-4 rounded-lg bg-red-50 border border-red-200 text-red-900 text-sm font-medium">{error}</div>
      ) : !data || data.items.length === 0 ? (
        <div className="p-12 text-center rounded-xl bg-white border border-slate-200 shadow-sm text-slate-500">
          <ShieldAlert className="w-10 h-10 mx-auto mb-3 text-slate-400" />
          <h3 className="text-base font-bold text-slate-800">No Incidents Logged</h3>
          <p className="text-sm text-slate-600 mt-1">No security or GRC incidents match your active filter criteria.</p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full text-left text-sm text-slate-800">
              <thead className="bg-slate-50 text-slate-700 font-bold text-xs border-b border-slate-200 uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-4">Incident</th>
                  <th className="py-3 px-4">Severity</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Owner</th>
                  <th className="py-3 px-4">Detected</th>
                  <th className="py-3 px-4">Lifecycle State</th>
                  <th className="py-3 px-4 text-right">Transition</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.items.map((inc) => (
                  <tr key={inc.id} className="hover:bg-slate-50/80 transition">
                    <td className="py-3.5 px-4">
                      <div className="font-bold text-slate-900 text-sm">{inc.title}</div>
                      {inc.description && (
                        <div className="text-xs text-slate-600 line-clamp-1 mt-0.5">{inc.description}</div>
                      )}
                    </td>
                    <td className="py-3.5 px-4">{getSeverityBadge(inc.severity)}</td>
                    <td className="py-3.5 px-4">{getStatusBadge(inc.status)}</td>
                    <td className="py-3.5 px-4 text-xs font-mono font-semibold text-slate-800">{inc.owner || 'Unassigned'}</td>
                    <td className="py-3.5 px-4 text-xs font-medium text-slate-600">
                      {new Date(inc.detectedAt).toLocaleDateString()}
                    </td>
                    <td className="py-3.5 px-4 text-xs text-slate-600 space-y-0.5">
                      {inc.containedAt && <div className="font-medium text-slate-700">Contained: {new Date(inc.containedAt).toLocaleDateString()}</div>}
                      {inc.resolvedAt && <div className="font-medium text-emerald-800">Resolved: {new Date(inc.resolvedAt).toLocaleDateString()}</div>}
                      {!inc.containedAt && !inc.resolvedAt && <div className="text-rose-700 font-semibold">Active Investigation</div>}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      {inc.status === IncidentStatus.OPEN && (
                        <button
                          onClick={() => handleStatusTransition(inc.id, IncidentStatus.IN_INVESTIGATION)}
                          className="px-3 py-1 text-xs font-bold rounded bg-blue-100 text-blue-900 hover:bg-blue-200 border border-blue-300 transition"
                        >
                          Investigate
                        </button>
                      )}
                      {inc.status === IncidentStatus.IN_INVESTIGATION && (
                        <button
                          onClick={() => handleStatusTransition(inc.id, IncidentStatus.CONTAINED)}
                          className="px-3 py-1 text-xs font-bold rounded bg-amber-100 text-amber-900 hover:bg-amber-200 border border-amber-300 transition"
                        >
                          Contain
                        </button>
                      )}
                      {inc.status === IncidentStatus.CONTAINED && (
                        <button
                          onClick={() => handleStatusTransition(inc.id, IncidentStatus.RESOLVED)}
                          className="px-3 py-1 text-xs font-bold rounded bg-emerald-100 text-emerald-900 hover:bg-emerald-200 border border-emerald-300 transition"
                        >
                          Resolve
                        </button>
                      )}
                      {inc.status === IncidentStatus.RESOLVED && (
                        <button
                          onClick={() => handleStatusTransition(inc.id, IncidentStatus.CLOSED)}
                          className="px-3 py-1 text-xs font-bold rounded bg-slate-100 text-slate-800 hover:bg-slate-200 border border-slate-300 transition"
                        >
                          Close
                        </button>
                      )}
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

      {/* Log Incident Modal */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg bg-white border border-slate-200 rounded-2xl p-6 shadow-2xl space-y-5 text-slate-800">
            <div className="flex items-center justify-between border-b border-slate-200 pb-4">
              <h3 className="text-lg font-bold text-slate-900">Log GRC / Security Incident</h3>
              <button onClick={() => setIsCreateOpen(false)} className="text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Incident Title *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g., Unauthorized API Key Usage Detected"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-teal-600"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Description</label>
                <textarea
                  rows={3}
                  placeholder="Provide detailed incident summary..."
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-teal-600"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Severity</label>
                  <select
                    value={newSeverity}
                    onChange={(e) => setNewSeverity(e.target.value as IncidentSeverity)}
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-1 focus:ring-teal-600 font-medium"
                  >
                    <option value={IncidentSeverity.CRITICAL}>Critical</option>
                    <option value={IncidentSeverity.HIGH}>High</option>
                    <option value={IncidentSeverity.MEDIUM}>Medium</option>
                    <option value={IncidentSeverity.LOW}>Low</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Assignee / Owner</label>
                  <input
                    type="text"
                    placeholder="e.g., SecOps Lead"
                    value={newOwner}
                    onChange={(e) => setNewOwner(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-teal-600"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsCreateOpen(false)}
                  className="px-4 py-2 text-sm font-semibold bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 rounded-lg shadow-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 text-sm font-semibold bg-teal-700 hover:bg-teal-800 text-white rounded-lg shadow-sm disabled:opacity-50"
                >
                  {submitting ? 'Logging...' : 'Submit Incident'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
