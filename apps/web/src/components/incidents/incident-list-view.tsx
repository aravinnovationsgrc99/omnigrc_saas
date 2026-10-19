'use client';

import React, { useState, useEffect } from 'react';
import {
  IncidentDto,
  PaginatedIncidentsDto,
  IncidentSeverity,
  IncidentStatus,
  CreateIncidentDto,
  IncidentActionDto,
  CreateIncidentActionDto,
} from '@omnigrc/shared';
import {
  Plus,
  Search,
  ShieldAlert,
  Clock,
  RefreshCw,
  X,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Check,
  Trash2,
  ArrowRight,
  ShieldCheck,
  Building,
} from 'lucide-react';

import { apiRequest } from '@/lib/api-client';

export function IncidentListView() {
  const [data, setData] = useState<PaginatedIncidentsDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [severityFilter, setSeverityFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [page, setPage] = useState(1);

  // Modal State (Create)
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newCategory, setNewCategory] = useState('Data Breach');
  const [newPriority, setNewPriority] = useState('P2');
  const [newBusinessUnit, setNewBusinessUnit] = useState('Engineering');
  const [newDueDate, setNewDueDate] = useState('');
  const [newSeverity, setNewSeverity] = useState<IncidentSeverity>(IncidentSeverity.MEDIUM);
  const [newOwner, setNewOwner] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Detail / Remediation Drawer State
  const [selectedIncident, setSelectedIncident] = useState<IncidentDto | null>(null);
  const [actions, setActions] = useState<IncidentActionDto[]>([]);
  const [loadingActions, setLoadingActions] = useState(false);
  const [rcaRootCause, setRcaRootCause] = useState('');
  const [rcaDetails, setRcaDetails] = useState('');
  const [savingRca, setSavingRca] = useState(false);
  const [rcaSavedSuccess, setRcaSavedSuccess] = useState(false);

  // Add Action State
  const [actionTitle, setActionTitle] = useState('');
  const [actionDesc, setActionDesc] = useState('');
  const [actionType, setActionType] = useState('CORRECTIVE');
  const [actionOwner, setActionOwner] = useState('');
  const [actionDueDate, setActionDueDate] = useState('');
  const [addingAction, setAddingAction] = useState(false);

  // Approval Submission State
  const [submittingApproval, setSubmittingApproval] = useState(false);
  const [approvalMessage, setApprovalMessage] = useState<string | null>(null);

  const fetchIncidents = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.append('page', page.toString());
      params.append('limit', '15');
      if (search) params.append('search', search);
      if (severityFilter) params.append('severity', severityFilter);
      if (statusFilter) params.append('status', statusFilter);

      const result = await apiRequest<PaginatedIncidentsDto>(`/incidents?${params.toString()}`);
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

  // Load actions and RCA details when an incident is selected
  useEffect(() => {
    if (selectedIncident) {
      setRcaRootCause(selectedIncident.rootCause || '');
      setRcaDetails(selectedIncident.investigationDetails || '');
      setRcaSavedSuccess(false);
      setApprovalMessage(null);
      fetchIncidentActions(selectedIncident.id);
    } else {
      setActions([]);
    }
  }, [selectedIncident]);

  const fetchIncidentActions = async (incidentId: string) => {
    setLoadingActions(true);
    try {
      const result = await apiRequest<IncidentActionDto[]>(`/incidents/${incidentId}/actions`);
      setActions(result || []);
    } catch {
      setActions([]);
    } finally {
      setLoadingActions(false);
    }
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    setSubmitting(true);
    try {
      const body: CreateIncidentDto = {
        title: newTitle.trim(),
        description: newDesc.trim() || undefined,
        category: newCategory || undefined,
        priority: newPriority || undefined,
        businessUnit: newBusinessUnit.trim() || undefined,
        dueDate: newDueDate ? new Date(newDueDate).toISOString() : undefined,
        severity: newSeverity,
        owner: newOwner.trim() || undefined,
      };

      await apiRequest('/incidents', {
        method: 'POST',
        body: JSON.stringify(body),
      });

      setIsCreateOpen(false);
      setNewTitle('');
      setNewDesc('');
      setNewOwner('');
      setNewDueDate('');
      fetchIncidents();
    } catch (err: any) {
      alert(err.message || 'Error creating incident');
    } finally {
      setSubmitting(false);
    }
  };

  const handleStatusTransition = async (incidentId: string, nextStatus: IncidentStatus) => {
    try {
      const updated = await apiRequest<IncidentDto>(`/incidents/${incidentId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: nextStatus }),
      });
      if (selectedIncident && selectedIncident.id === incidentId) {
        setSelectedIncident(updated);
      }
      fetchIncidents();
    } catch (err: any) {
      alert(err.message || 'Error updating status');
    }
  };

  const handleSaveRca = async () => {
    if (!selectedIncident) return;
    setSavingRca(true);
    setRcaSavedSuccess(false);
    try {
      const updated = await apiRequest<IncidentDto>(`/incidents/${selectedIncident.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          rootCause: rcaRootCause.trim() || undefined,
          investigationDetails: rcaDetails.trim() || undefined,
        }),
      });
      setSelectedIncident(updated);
      setRcaSavedSuccess(true);
      fetchIncidents();
      setTimeout(() => setRcaSavedSuccess(false), 3000);
    } catch (err: any) {
      alert(err.message || 'Error saving root cause analysis');
    } finally {
      setSavingRca(false);
    }
  };

  const handleAddAction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedIncident || !actionTitle.trim() || !actionOwner.trim()) return;
    setAddingAction(true);
    try {
      const body: CreateIncidentActionDto = {
        title: actionTitle.trim(),
        description: actionDesc.trim() || undefined,
        actionType,
        owner: actionOwner.trim(),
        dueDate: actionDueDate ? new Date(actionDueDate).toISOString() : undefined,
      };
      await apiRequest(`/incidents/${selectedIncident.id}/actions`, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      setActionTitle('');
      setActionDesc('');
      setActionOwner('');
      setActionDueDate('');
      fetchIncidentActions(selectedIncident.id);
    } catch (err: any) {
      alert(err.message || 'Error adding remediation action');
    } finally {
      setAddingAction(false);
    }
  };

  const handleToggleActionStatus = async (actionId: string, currentStatus: string) => {
    if (!selectedIncident) return;
    const nextStatus = currentStatus === 'COMPLETED' ? 'OPEN' : 'COMPLETED';
    try {
      await apiRequest(`/incidents/${selectedIncident.id}/actions/${actionId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: nextStatus }),
      });
      fetchIncidentActions(selectedIncident.id);
    } catch (err: any) {
      alert(err.message || 'Error updating action');
    }
  };

  const handleDeleteAction = async (actionId: string) => {
    if (!selectedIncident) return;
    if (!confirm('Are you sure you want to delete this remediation action?')) return;
    try {
      await apiRequest(`/incidents/${selectedIncident.id}/actions/${actionId}`, {
        method: 'DELETE',
      });
      fetchIncidentActions(selectedIncident.id);
    } catch (err: any) {
      alert(err.message || 'Error deleting action');
    }
  };

  const handleSubmitClosureApproval = async () => {
    if (!selectedIncident) return;
    setSubmittingApproval(true);
    setApprovalMessage(null);
    try {
      await apiRequest(`/incidents/${selectedIncident.id}/submit-approval`, {
        method: 'POST',
        body: JSON.stringify({
          purpose: 'INCIDENT_CLOSURE',
          title: `Formal Closure Approval: ${selectedIncident.title}`,
          dueDays: 7,
        }),
      });
      setApprovalMessage('Closure approval request submitted to designated authorities.');
      fetchIncidents();
    } catch (err: any) {
      alert(err.message || 'Error submitting approval request');
    } finally {
      setSubmittingApproval(false);
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
            Track, contain, investigate root causes, and execute remediation actions with closure approvals.
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

      {/* Content Table */}
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
                  <th className="py-3 px-4">Incident & Classification</th>
                  <th className="py-3 px-4">Severity</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Owner & BU</th>
                  <th className="py-3 px-4">SLA Due Date</th>
                  <th className="py-3 px-4">Lifecycle State</th>
                  <th className="py-3 px-4 text-right">Transition</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.items.map((inc) => {
                  const isOverdue = inc.dueDate &&
                    new Date(inc.dueDate) < new Date() &&
                    inc.status !== IncidentStatus.RESOLVED &&
                    inc.status !== IncidentStatus.CLOSED;

                  return (
                    <tr
                      key={inc.id}
                      onClick={() => setSelectedIncident(inc)}
                      className="hover:bg-teal-50/40 cursor-pointer transition"
                    >
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-slate-900 text-sm flex items-center gap-2">
                          <span>{inc.title}</span>
                          {inc.priority && (
                            <span className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-slate-100 text-slate-700 border border-slate-300">
                              {inc.priority}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          {inc.category && (
                            <span className="text-[11px] font-medium text-teal-800 bg-teal-50 px-2 py-0.5 rounded border border-teal-200">
                              {inc.category}
                            </span>
                          )}
                          {inc.rootCause && (
                            <span className="text-[11px] text-slate-500 italic line-clamp-1 max-w-xs">
                              RCA: {inc.rootCause}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3.5 px-4">{getSeverityBadge(inc.severity)}</td>
                      <td className="py-3.5 px-4">{getStatusBadge(inc.status)}</td>
                      <td className="py-3.5 px-4">
                        <div className="text-xs font-semibold text-slate-900">{inc.owner || 'Unassigned'}</div>
                        {inc.businessUnit && (
                          <div className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                            <Building size={11} /> {inc.businessUnit}
                          </div>
                        )}
                      </td>
                      <td className="py-3.5 px-4">
                        {inc.dueDate ? (
                          <div className="space-y-0.5">
                            <div className="text-xs font-medium text-slate-700">
                              {new Date(inc.dueDate).toLocaleDateString()}
                            </div>
                            {isOverdue && (
                              <span className="inline-block px-1.5 py-0.2 rounded text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200">
                                SLA BREACH
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-xs text-slate-600 space-y-0.5">
                        {inc.containedAt && <div className="font-medium text-slate-700">Contained: {new Date(inc.containedAt).toLocaleDateString()}</div>}
                        {inc.resolvedAt && <div className="font-medium text-emerald-800">Resolved: {new Date(inc.resolvedAt).toLocaleDateString()}</div>}
                        {!inc.containedAt && !inc.resolvedAt && <div className="text-rose-700 font-semibold">Active Investigation</div>}
                      </td>
                      <td className="py-3.5 px-4 text-right" onClick={(e) => e.stopPropagation()}>
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
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between text-xs text-slate-600 px-1 font-medium">
            <div>
              Showing {data.items.length} of {data.total} total items (Click row to inspect RCA & Actions)
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

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Incident Category</label>
                  <select
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-1 focus:ring-teal-600 font-medium"
                  >
                    <option value="Data Breach">Data Breach</option>
                    <option value="Malware / Ransomware">Malware / Ransomware</option>
                    <option value="DDoS / Availability">DDoS / Availability</option>
                    <option value="Unauthorized Access">Unauthorized Access</option>
                    <option value="Insider Threat">Insider Threat</option>
                    <option value="System Outage">System Outage</option>
                    <option value="Compliance Violation">Compliance Violation</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Priority</label>
                  <select
                    value={newPriority}
                    onChange={(e) => setNewPriority(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-1 focus:ring-teal-600 font-medium"
                  >
                    <option value="P1">P1 - Critical Severity</option>
                    <option value="P2">P2 - High Severity</option>
                    <option value="P3">P3 - Moderate Severity</option>
                    <option value="P4">P4 - Low Severity</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Description</label>
                <textarea
                  rows={2}
                  placeholder="Provide detailed incident summary..."
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-teal-600"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Business Unit</label>
                  <input
                    type="text"
                    placeholder="e.g., Infrastructure, Finance"
                    value={newBusinessUnit}
                    onChange={(e) => setNewBusinessUnit(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-teal-600"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">SLA Target Due Date</label>
                  <input
                    type="date"
                    value={newDueDate}
                    onChange={(e) => setNewDueDate(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-1 focus:ring-teal-600"
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

      {/* Incident Detail, RCA & Remediation Drawer */}
      {selectedIncident && (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-slate-900/40 backdrop-blur-sm"
          onClick={() => setSelectedIncident(null)}
        >
          <div
            className="w-full max-w-2xl bg-white h-full shadow-2xl flex flex-col omni-fade-in text-slate-800"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drawer Header */}
            <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-teal-800 bg-teal-100 px-2 py-0.5 rounded">
                    {selectedIncident.category || 'Incident'}
                  </span>
                  {selectedIncident.priority && (
                    <span className="text-xs font-bold text-slate-700 bg-slate-200 px-2 py-0.5 rounded">
                      {selectedIncident.priority}
                    </span>
                  )}
                </div>
                <h2 className="text-lg font-bold text-slate-900 mt-1">{selectedIncident.title}</h2>
              </div>
              <button
                onClick={() => setSelectedIncident(null)}
                className="text-slate-400 hover:text-slate-700 p-1 rounded-lg"
              >
                <X size={20} />
              </button>
            </div>

            {/* Drawer Content */}
            <div className="flex-1 overflow-y-auto p-5 space-y-6 omni-scroll">
              {/* Status and Attributes Bar */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs">
                <div>
                  <span className="text-slate-500 block">Severity</span>
                  <div className="mt-1">{getSeverityBadge(selectedIncident.severity)}</div>
                </div>
                <div>
                  <span className="text-slate-500 block">Status</span>
                  <div className="mt-1">{getStatusBadge(selectedIncident.status)}</div>
                </div>
                <div>
                  <span className="text-slate-500 block">Owner</span>
                  <span className="font-semibold text-slate-900 mt-1 block">{selectedIncident.owner || 'Unassigned'}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">SLA Target Date</span>
                  <span className="font-semibold text-slate-900 mt-1 block">
                    {selectedIncident.dueDate ? new Date(selectedIncident.dueDate).toLocaleDateString() : 'None'}
                  </span>
                </div>
              </div>

              {selectedIncident.description && (
                <div>
                  <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Description</h4>
                  <p className="text-xs text-slate-600 bg-slate-50 p-3 rounded-lg border border-slate-200 leading-relaxed">
                    {selectedIncident.description}
                  </p>
                </div>
              )}

              {/* Root Cause Analysis (RCA) Panel */}
              <div className="border border-slate-200 rounded-xl p-4 bg-white shadow-sm space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-teal-700" />
                    <h3 className="text-sm font-bold text-slate-900">Root Cause Analysis (RCA)</h3>
                  </div>
                  {rcaSavedSuccess && (
                    <span className="text-xs font-bold text-emerald-700 flex items-center gap-1">
                      <Check size={14} /> Saved
                    </span>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Identified Root Cause</label>
                  <textarea
                    rows={2}
                    placeholder="Detailed explanation of fundamental failure or trigger..."
                    value={rcaRootCause}
                    onChange={(e) => setRcaRootCause(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-1 focus:ring-teal-600"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Investigation Notes & Forensics</label>
                  <textarea
                    rows={2}
                    placeholder="Timeline of events, log traces, affected assets..."
                    value={rcaDetails}
                    onChange={(e) => setRcaDetails(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-1 focus:ring-teal-600"
                  />
                </div>

                <div className="flex justify-end">
                  <button
                    onClick={handleSaveRca}
                    disabled={savingRca}
                    className="px-3.5 py-1.5 text-xs font-bold bg-teal-700 hover:bg-teal-800 text-white rounded-lg shadow-sm disabled:opacity-50 transition"
                  >
                    {savingRca ? 'Saving RCA...' : 'Save RCA'}
                  </button>
                </div>
              </div>

              {/* Corrective & Preventive Remediation Actions */}
              <div className="border border-slate-200 rounded-xl p-4 bg-white shadow-sm space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-teal-700" />
                    <h3 className="text-sm font-bold text-slate-900">Remediation & Corrective Actions</h3>
                  </div>
                  <span className="text-xs bg-slate-100 px-2 py-0.5 rounded font-bold text-slate-600">
                    {actions.length} Total
                  </span>
                </div>

                {loadingActions ? (
                  <div className="text-xs text-slate-500 py-3 text-center">Loading remediation actions...</div>
                ) : actions.length === 0 ? (
                  <div className="p-3 bg-slate-50 border border-dashed border-slate-300 rounded-lg text-center text-xs text-slate-500">
                    No remediation actions assigned yet. Log one below.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {actions.map((act) => {
                      const isCompleted = act.status === 'COMPLETED';
                      return (
                        <div
                          key={act.id}
                          className="p-3 rounded-lg border border-slate-200 bg-slate-50/60 flex items-start justify-between gap-3"
                        >
                          <div className="space-y-1 flex-1">
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => handleToggleActionStatus(act.id, act.status)}
                                className={`w-4 h-4 rounded border flex items-center justify-center transition ${
                                  isCompleted ? 'bg-emerald-600 border-emerald-600 text-white' : 'border-slate-400 bg-white'
                                }`}
                              >
                                {isCompleted && <Check size={12} />}
                              </button>
                              <span className={`text-xs font-bold ${isCompleted ? 'line-through text-slate-500' : 'text-slate-900'}`}>
                                {act.title}
                              </span>
                              <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-indigo-100 text-indigo-800 border border-indigo-200">
                                {act.actionType}
                              </span>
                            </div>
                            {act.description && (
                              <p className="text-[11px] text-slate-600 ml-6">{act.description}</p>
                            )}
                            <div className="text-[11px] text-slate-500 ml-6 flex items-center gap-3">
                              <span>Owner: <strong>{act.owner}</strong></span>
                              {act.dueDate && <span>Due: <strong>{new Date(act.dueDate).toLocaleDateString()}</strong></span>}
                            </div>
                          </div>
                          <button
                            onClick={() => handleDeleteAction(act.id)}
                            className="text-slate-400 hover:text-rose-600 p-1"
                            title="Delete action"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Add Remediation Action Inline Form */}
                <form onSubmit={handleAddAction} className="pt-3 border-t border-slate-200 space-y-2">
                  <span className="text-xs font-bold text-slate-700 block">Add Corrective / Preventive Action</span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <input
                      type="text"
                      required
                      placeholder="Action title *"
                      value={actionTitle}
                      onChange={(e) => setActionTitle(e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-teal-600"
                    />
                    <select
                      value={actionType}
                      onChange={(e) => setActionType(e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-1 focus:ring-teal-600 font-medium"
                    >
                      <option value="CORRECTIVE">CORRECTIVE</option>
                      <option value="PREVENTATIVE">PREVENTATIVE</option>
                    </select>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <input
                      type="text"
                      required
                      placeholder="Assignee / Owner *"
                      value={actionOwner}
                      onChange={(e) => setActionOwner(e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-teal-600"
                    />
                    <input
                      type="date"
                      value={actionDueDate}
                      onChange={(e) => setActionDueDate(e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-1 focus:ring-teal-600"
                    />
                  </div>
                  <div className="flex justify-end">
                    <button
                      type="submit"
                      disabled={addingAction || !actionTitle.trim() || !actionOwner.trim()}
                      className="px-3 py-1.5 text-xs font-bold bg-teal-700 hover:bg-teal-800 text-white rounded-lg shadow-sm disabled:opacity-50 transition"
                    >
                      {addingAction ? 'Adding...' : 'Add Action'}
                    </button>
                  </div>
                </form>
              </div>

              {/* Closure Approval Workflow Panel */}
              <div className="border border-slate-200 rounded-xl p-4 bg-slate-50 shadow-sm space-y-3">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-teal-700" />
                  <h3 className="text-sm font-bold text-slate-900">Incident Closure Approval</h3>
                </div>
                <p className="text-xs text-slate-600">
                  When all containment and corrective actions are fulfilled, submit this incident for formal closure sign-off.
                </p>

                {approvalMessage && (
                  <div className="p-2.5 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-lg font-medium">
                    {approvalMessage}
                  </div>
                )}

                <div className="flex justify-end">
                  <button
                    onClick={handleSubmitClosureApproval}
                    disabled={submittingApproval}
                    className="px-4 py-2 text-xs font-bold bg-slate-900 hover:bg-slate-800 text-white rounded-lg shadow-sm disabled:opacity-50 transition flex items-center gap-2"
                  >
                    <CheckCircle2 size={14} />
                    {submittingApproval ? 'Submitting Request...' : 'Submit for Closure Approval'}
                  </button>
                </div>
              </div>
            </div>

            {/* Drawer Footer */}
            <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
              <span className="text-xs text-slate-500">Tenant Scoped Record</span>
              <button
                onClick={() => setSelectedIncident(null)}
                className="px-4 py-2 text-xs font-semibold bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 rounded-lg"
              >
                Close Drawer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
