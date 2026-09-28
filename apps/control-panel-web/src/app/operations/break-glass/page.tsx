'use client';

import React, { useState, useEffect } from 'react';
import {
  ShieldAlert,
  AlertTriangle,
  CheckCircle,
  Clock,
  XCircle,
  FileText,
  UserCheck,
  Zap,
  Lock,
  RefreshCw,
  Search,
  Check,
  X,
  Eye,
} from 'lucide-react';
import { controlPlaneApi } from '../../../lib/control-plane-api';
import {
  BreakGlassSessionDto,
  BreakGlassOperation,
  BreakGlassStatus,
} from '../../../types/control-plane';

export default function BreakGlassPage() {
  const [sessions, setSessions] = useState<BreakGlassSessionDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [activeTab, setActiveTab] = useState<'ACTIVE' | 'REVIEWS' | 'HISTORY'>('ACTIVE');

  // Modals
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [showApproveModal, setShowApproveModal] = useState<BreakGlassSessionDto | null>(null);
  const [showExecuteModal, setShowExecuteModal] = useState<BreakGlassSessionDto | null>(null);
  const [showReviewModal, setShowReviewModal] = useState<BreakGlassSessionDto | null>(null);
  const [showDetailsModal, setShowDetailsModal] = useState<BreakGlassSessionDto | null>(null);

  // Form States
  const [operation, setOperation] = useState<BreakGlassOperation>('EMERGENCY_ORG_SUSPEND');
  const [targetOrgId, setTargetOrgId] = useState('');
  const [targetDepId, setTargetDepId] = useState('');
  const [targetServiceCode, setTargetServiceCode] = useState('');
  const [reason, setReason] = useState('');
  const [durationMinutes, setDurationMinutes] = useState(15);
  const [isSingleEmergency, setIsSingleEmergency] = useState(false);
  const [emergencyText, setEmergencyText] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Approval Form
  const [approveTotp, setApproveTotp] = useState('');
  const [approveReason, setApproveReason] = useState('');

  // Review Form
  const [reviewStatus, setReviewStatus] = useState<'REVIEWED_APPROVED' | 'REVIEWED_FLAGGED'>('REVIEWED_APPROVED');
  const [reviewNotes, setReviewNotes] = useState('');

  const loadSessions = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await controlPlaneApi.listBreakGlassSessions();
      setSessions(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load Break-Glass sessions');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSessions();
  }, []);

  const handleRequestSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason || reason.trim().length < 10) {
      setError('Operational reason must be at least 10 characters long.');
      return;
    }
    if (!totpCode || totpCode.trim().length !== 6) {
      setError('Valid 6-digit TOTP MFA code is required.');
      return;
    }

    try {
      setSubmitting(true);
      setError(null);
      await controlPlaneApi.requestBreakGlassSession({
        operation,
        reason,
        targetOrganizationId: targetOrgId || undefined,
        targetDeploymentId: targetDepId || undefined,
        targetServiceCode: targetServiceCode || undefined,
        durationMinutes,
        isSingleOperatorEmergency: isSingleEmergency,
        emergencyConfirmationText: isSingleEmergency ? emergencyText : undefined,
        totpCode,
      });

      setSuccessMsg('Break-Glass session requested successfully!');
      setShowRequestModal(false);
      resetRequestForm();
      loadSessions();
    } catch (err: any) {
      setError(err.message || 'Failed to request Break-Glass session');
    } finally {
      setSubmitting(false);
    }
  };

  const handleApproveSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!showApproveModal) return;
    if (!approveTotp || approveTotp.trim().length !== 6) {
      setError('Valid 6-digit TOTP MFA code is required for approval.');
      return;
    }

    try {
      setSubmitting(true);
      setError(null);
      await controlPlaneApi.approveBreakGlassSession(showApproveModal.id, {
        totpCode: approveTotp,
        reason: approveReason || undefined,
      });

      setSuccessMsg(`Break-Glass session ${showApproveModal.id} approved!`);
      setShowApproveModal(null);
      setApproveTotp('');
      setApproveReason('');
      loadSessions();
    } catch (err: any) {
      setError(err.message || 'Failed to approve Break-Glass session');
    } finally {
      setSubmitting(false);
    }
  };

  const handleExecuteAction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!showExecuteModal) return;

    try {
      setSubmitting(true);
      setError(null);
      const res = await controlPlaneApi.executeBreakGlassAction(showExecuteModal.id, {
        totpCode: totpCode || undefined,
      });

      setSuccessMsg(`Break-Glass operation ${showExecuteModal.operation} executed successfully!`);
      setShowExecuteModal(null);
      setTotpCode('');
      loadSessions();
    } catch (err: any) {
      setError(err.message || 'Failed to execute Break-Glass action');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRevokeSession = async (id: string) => {
    if (!confirm(`Are you sure you want to revoke Break-Glass session ${id}?`)) return;

    try {
      setLoading(true);
      await controlPlaneApi.revokeBreakGlassSession(id, 'Revoked by operator from Control Panel');
      setSuccessMsg(`Session ${id} revoked.`);
      loadSessions();
    } catch (err: any) {
      setError(err.message || 'Failed to revoke session');
      setLoading(false);
    }
  };

  const handleReviewSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!showReviewModal) return;
    if (!reviewNotes || reviewNotes.trim().length < 10) {
      setError('Review notes must be at least 10 characters.');
      return;
    }

    try {
      setSubmitting(true);
      setError(null);
      await controlPlaneApi.reviewEmergencyBreakGlassSession(showReviewModal.id, {
        postEventReviewStatus: reviewStatus,
        notes: reviewNotes,
      });

      setSuccessMsg('Post-event review completed successfully.');
      setShowReviewModal(null);
      setReviewNotes('');
      loadSessions();
    } catch (err: any) {
      setError(err.message || 'Failed to submit post-event review');
    } finally {
      setSubmitting(false);
    }
  };

  const resetRequestForm = () => {
    setOperation('EMERGENCY_ORG_SUSPEND');
    setTargetOrgId('');
    setTargetDepId('');
    setTargetServiceCode('');
    setReason('');
    setDurationMinutes(15);
    setIsSingleEmergency(false);
    setEmergencyText('');
    setTotpCode('');
  };

  const getTargetIdForForm = () => {
    return targetOrgId || targetDepId || targetServiceCode || 'TARGET';
  };

  const activeSessions = sessions.filter((s) => s.status === 'REQUESTED' || s.status === 'APPROVED');
  const pendingReviews = sessions.filter((s) => s.isSingleOperatorEmergency && s.postEventReviewStatus === 'PENDING_REVIEW');

  const filteredSessions = sessions.filter((s) => {
    if (activeTab === 'ACTIVE' && s.status !== 'REQUESTED' && s.status !== 'APPROVED') return false;
    if (activeTab === 'REVIEWS' && (!s.isSingleOperatorEmergency || s.postEventReviewStatus !== 'PENDING_REVIEW')) return false;

    if (statusFilter !== 'ALL' && s.status !== statusFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        s.id.toLowerCase().includes(q) ||
        s.operation.toLowerCase().includes(q) ||
        s.reason.toLowerCase().includes(q) ||
        (s.targetOrganizationId && s.targetOrganizationId.toLowerCase().includes(q)) ||
        (s.targetDeploymentId && s.targetDeploymentId.toLowerCase().includes(q))
      );
    }
    return true;
  });

  const getStatusBadge = (status: BreakGlassStatus) => {
    switch (status) {
      case 'REQUESTED':
        return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20"><Clock className="w-3.5 h-3.5" /> REQUESTED</span>;
      case 'APPROVED':
        return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"><CheckCircle className="w-3.5 h-3.5" /> APPROVED</span>;
      case 'EXECUTED':
        return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20"><Zap className="w-3.5 h-3.5" /> EXECUTED</span>;
      case 'EXPIRED':
        return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-500/10 text-slate-400 border border-slate-500/20"><Clock className="w-3.5 h-3.5" /> EXPIRED</span>;
      case 'REVOKED':
        return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-red-500/10 text-red-400 border border-red-500/20"><XCircle className="w-3.5 h-3.5" /> REVOKED</span>;
      default:
        return <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-800 text-slate-300">{status}</span>;
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6 space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-800 pb-6">
        <div>
          <div className="flex items-center gap-3">
            <ShieldAlert className="w-8 h-8 text-red-500" />
            <h1 className="text-2xl font-bold text-white tracking-tight">Break-Glass Operations</h1>
            <span className="px-2.5 py-0.5 text-xs font-bold rounded bg-red-500/10 text-red-400 border border-red-500/20">
              STRICT STEP-UP MFA & AUDIT
            </span>
          </div>
          <p className="text-sm text-slate-400 mt-1">
            Emergency operational overrides, kill-switches, and mandatory post-event incident reviews.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={loadSessions}
            className="p-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 hover:text-white hover:border-slate-700 transition"
            title="Refresh Sessions"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => setShowRequestModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-red-600 hover:bg-red-500 text-white font-semibold text-sm shadow-lg shadow-red-600/20 transition"
          >
            <ShieldAlert className="w-4 h-4" /> Initiate Break-Glass
          </button>
        </div>
      </div>

      {/* Security Banner */}
      <div className="p-4 rounded-xl bg-gradient-to-r from-red-950/40 via-amber-950/20 to-slate-900 border border-red-500/30 text-slate-300 text-xs sm:text-sm flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
        <div>
          <strong className="text-red-400 font-semibold block mb-0.5">Authoritative Security Policy:</strong>
          Break-Glass sessions provide exceptional, time-limited overrides for critical operational emergencies. Every request requires valid TOTP MFA step-up authentication, explicit scope binding, and audit trail logging. Commercial licensing rules (CP-5) and sequence anti-rollback are strictly preserved.
        </div>
      </div>

      {/* Notifications */}
      {error && (
        <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" /> {error}
          </div>
          <button onClick={() => setError(null)}><X className="w-4 h-4" /></button>
        </div>
      )}
      {successMsg && (
        <div className="p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-sm flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4" /> {successMsg}
          </div>
          <button onClick={() => setSuccessMsg(null)}><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* Metrics Bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
          <div className="text-xs text-slate-400 font-medium">Active & Pending Sessions</div>
          <div className="text-2xl font-bold text-amber-400 mt-1">{activeSessions.length}</div>
        </div>
        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
          <div className="text-xs text-slate-400 font-medium">Pending Post-Event Reviews</div>
          <div className="text-2xl font-bold text-red-400 mt-1">{pendingReviews.length}</div>
        </div>
        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
          <div className="text-xs text-slate-400 font-medium">Total Sessions Recorded</div>
          <div className="text-2xl font-bold text-white mt-1">{sessions.length}</div>
        </div>
        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
          <div className="text-xs text-slate-400 font-medium">Separation of Duties Rule</div>
          <div className="text-xs font-semibold text-emerald-400 mt-2">ENFORCED (2-OP REGULAR / TOTP EMERGENCY)</div>
        </div>
      </div>

      {/* Tabs & Filters */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div className="flex items-center gap-2 bg-slate-900 p-1 rounded-lg border border-slate-800">
          <button
            onClick={() => setActiveTab('ACTIVE')}
            className={`px-4 py-2 rounded-md text-xs font-semibold transition ${
              activeTab === 'ACTIVE' ? 'bg-slate-800 text-white shadow' : 'text-slate-400 hover:text-white'
            }`}
          >
            Active & Pending ({activeSessions.length})
          </button>
          <button
            onClick={() => setActiveTab('REVIEWS')}
            className={`px-4 py-2 rounded-md text-xs font-semibold transition ${
              activeTab === 'REVIEWS' ? 'bg-slate-800 text-white shadow' : 'text-slate-400 hover:text-white'
            }`}
          >
            Pending Reviews ({pendingReviews.length})
          </button>
          <button
            onClick={() => setActiveTab('HISTORY')}
            className={`px-4 py-2 rounded-md text-xs font-semibold transition ${
              activeTab === 'HISTORY' ? 'bg-slate-800 text-white shadow' : 'text-slate-400 hover:text-white'
            }`}
          >
            All Audit History ({sessions.length})
          </button>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search session ID or target..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-4 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-slate-700 w-64"
            />
          </div>
          {activeTab === 'HISTORY' && (
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-slate-900 border border-slate-800 text-xs text-slate-300 rounded-lg px-3 py-1.5 focus:outline-none"
            >
              <option value="ALL">All Statuses</option>
              <option value="REQUESTED">REQUESTED</option>
              <option value="APPROVED">APPROVED</option>
              <option value="EXECUTED">EXECUTED</option>
              <option value="EXPIRED">EXPIRED</option>
              <option value="REVOKED">REVOKED</option>
            </select>
          )}
        </div>
      </div>

      {/* Sessions Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
        {loading ? (
          <div className="p-12 text-center text-slate-400 text-sm flex items-center justify-center gap-2">
            <RefreshCw className="w-4 h-4 animate-spin text-slate-500" /> Loading Break-Glass Sessions...
          </div>
        ) : filteredSessions.length === 0 ? (
          <div className="p-12 text-center text-slate-500 text-sm">
            No Break-Glass sessions found matching criteria.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-950/60 text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-800">
                <tr>
                  <th className="p-4">Status / ID</th>
                  <th className="p-4">Operation</th>
                  <th className="p-4">Target Scope</th>
                  <th className="p-4">Reason / Mode</th>
                  <th className="p-4">Requester / Approver</th>
                  <th className="p-4">Expiry</th>
                  <th className="p-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filteredSessions.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-800/40 transition">
                    <td className="p-4">
                      <div className="space-y-1">
                        {getStatusBadge(s.status)}
                        <div className="font-mono text-[10px] text-slate-500">{s.id.substring(0, 8)}...</div>
                      </div>
                    </td>
                    <td className="p-4 font-mono font-semibold text-white">
                      {s.operation}
                    </td>
                    <td className="p-4 space-y-0.5">
                      {s.targetOrganizationId && (
                        <div className="text-slate-300">Org: <span className="font-mono text-slate-400">{s.targetOrganizationId}</span></div>
                      )}
                      {s.targetDeploymentId && (
                        <div className="text-slate-300">Dep: <span className="font-mono text-slate-400">{s.targetDeploymentId}</span></div>
                      )}
                      {s.targetServiceCode && (
                        <div className="text-slate-300">Svc: <span className="font-mono text-slate-400">{s.targetServiceCode}</span></div>
                      )}
                    </td>
                    <td className="p-4 max-w-xs">
                      <div className="truncate text-slate-300" title={s.reason}>{s.reason}</div>
                      {s.isSingleOperatorEmergency && (
                        <span className="mt-1 inline-flex items-center gap-1 text-[10px] font-bold text-red-400">
                          <AlertTriangle className="w-3 h-3" /> SINGLE-OP EMERGENCY
                        </span>
                      )}
                      {s.postEventReviewStatus === 'PENDING_REVIEW' && (
                        <span className="mt-1 block text-[10px] text-amber-400 font-semibold">
                          [REQUIRES POST-EVENT REVIEW]
                        </span>
                      )}
                    </td>
                    <td className="p-4 space-y-1">
                      <div>Req: <span className="text-white font-medium">{s.requesterOperatorName || s.requesterOperatorId}</span></div>
                      {s.approverOperatorId && (
                        <div>App: <span className="text-emerald-400 font-medium">{s.approverOperatorName || s.approverOperatorId}</span></div>
                      )}
                    </td>
                    <td className="p-4 text-slate-400">
                      {new Date(s.expiresAt).toLocaleTimeString()}
                    </td>
                    <td className="p-4 text-right space-x-2">
                      <button
                        onClick={() => setShowDetailsModal(s)}
                        className="px-2.5 py-1 rounded bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 transition"
                        title="View Full Details"
                      >
                        <Eye className="w-3.5 h-3.5 inline" />
                      </button>
                      {s.status === 'REQUESTED' && (
                        <button
                          onClick={() => setShowApproveModal(s)}
                          className="px-2.5 py-1 rounded bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-600/30 transition font-semibold"
                        >
                          Approve
                        </button>
                      )}
                      {s.status === 'APPROVED' && (
                        <button
                          onClick={() => setShowExecuteModal(s)}
                          className="px-2.5 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white transition font-semibold shadow"
                        >
                          Execute
                        </button>
                      )}
                      {(s.status === 'REQUESTED' || s.status === 'APPROVED') && (
                        <button
                          onClick={() => handleRevokeSession(s.id)}
                          className="px-2.5 py-1 rounded bg-red-600/20 text-red-400 border border-red-500/30 hover:bg-red-600/30 transition font-semibold"
                        >
                          Revoke
                        </button>
                      )}
                      {s.isSingleOperatorEmergency && s.postEventReviewStatus === 'PENDING_REVIEW' && (
                        <button
                          onClick={() => setShowReviewModal(s)}
                          className="px-2.5 py-1 rounded bg-purple-600 hover:bg-purple-500 text-white transition font-semibold"
                        >
                          Review Incident
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* REQUEST BREAK-GLASS MODAL */}
      {showRequestModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-red-500/40 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2 text-red-400 font-bold text-lg">
                <ShieldAlert className="w-5 h-5" /> Request Break-Glass Emergency Session
              </div>
              <button onClick={() => setShowRequestModal(false)}><X className="w-5 h-5 text-slate-400" /></button>
            </div>

            <form onSubmit={handleRequestSession} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-400 mb-1 font-semibold">Emergency Operation</label>
                <select
                  value={operation}
                  onChange={(e) => setOperation(e.target.value as any)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-white font-mono"
                >
                  <option value="EMERGENCY_ORG_SUSPEND">EMERGENCY_ORG_SUSPEND — Emergency Organization Suspension</option>
                  <option value="EMERGENCY_ORG_DISABLE">EMERGENCY_ORG_DISABLE — Emergency Organization Disablement</option>
                  <option value="EMERGENCY_SERVICE_KILL_SWITCH">EMERGENCY_SERVICE_KILL_SWITCH — Service Capability Kill Switch</option>
                  <option value="EMERGENCY_DEPLOYMENT_SUSPEND">EMERGENCY_DEPLOYMENT_SUSPEND — Emergency Deployment Suspension</option>
                  <option value="EMERGENCY_LICENSE_RECONCILE">EMERGENCY_LICENSE_RECONCILE — License Re-signing & Reconciliation</option>
                </select>
              </div>

              {(operation === 'EMERGENCY_ORG_SUSPEND' || operation === 'EMERGENCY_ORG_DISABLE' || operation === 'EMERGENCY_SERVICE_KILL_SWITCH' || operation === 'EMERGENCY_LICENSE_RECONCILE') && (
                <div>
                  <label className="block text-slate-400 mb-1 font-semibold">Target Organization ID</label>
                  <input
                    type="text"
                    placeholder="e.g. org-acme-100"
                    value={targetOrgId}
                    onChange={(e) => setTargetOrgId(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-white font-mono"
                  />
                </div>
              )}

              {(operation === 'EMERGENCY_DEPLOYMENT_SUSPEND' || operation === 'EMERGENCY_LICENSE_RECONCILE') && (
                <div>
                  <label className="block text-slate-400 mb-1 font-semibold">Target Deployment ID</label>
                  <input
                    type="text"
                    placeholder="e.g. dep-acme-prod-1"
                    value={targetDepId}
                    onChange={(e) => setTargetDepId(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-white font-mono"
                  />
                </div>
              )}

              {operation === 'EMERGENCY_SERVICE_KILL_SWITCH' && (
                <div>
                  <label className="block text-slate-400 mb-1 font-semibold">Target Service Capability Code</label>
                  <input
                    type="text"
                    placeholder="e.g. AI_DOCUMENT_INTELLIGENCE"
                    value={targetServiceCode}
                    onChange={(e) => setTargetServiceCode(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-white font-mono"
                  />
                </div>
              )}

              <div>
                <label className="block text-slate-400 mb-1 font-semibold">Operational Reason (Min 10 chars)</label>
                <textarea
                  rows={2}
                  placeholder="Detail explicit incident ticket reference or operational emergency justification..."
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-white"
                />
              </div>

              {/* Single Operator Emergency Toggle */}
              <div className="p-3 rounded-lg bg-red-950/30 border border-red-500/30 space-y-2">
                <label className="flex items-center gap-2 text-white font-semibold cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isSingleEmergency}
                    onChange={(e) => setIsSingleEmergency(e.target.checked)}
                    className="rounded bg-slate-950 border-slate-800 text-red-600 focus:ring-0"
                  />
                  Enable Single-Operator Emergency Mode (Instant Approval)
                </label>
                {isSingleEmergency && (
                  <div className="space-y-2 pt-2 border-t border-red-500/20 text-slate-300">
                    <p className="text-[11px] text-red-300">
                      Bypasses second operator approval. Requires mandatory post-event incident review and explicit typed confirmation:
                    </p>
                    <div className="font-mono text-[11px] text-amber-400 font-bold">
                      CONFIRM EMERGENCY OVERRIDE {getTargetIdForForm().toUpperCase()}
                    </div>
                    <input
                      type="text"
                      placeholder={`Type exact string above...`}
                      value={emergencyText}
                      onChange={(e) => setEmergencyText(e.target.value)}
                      className="w-full bg-slate-950 border border-red-500/40 rounded-lg p-2 text-white font-mono text-xs"
                    />
                  </div>
                )}
              </div>

              <div>
                <label className="block text-slate-400 mb-1 font-semibold">Step-Up TOTP MFA Code (6 digits)</label>
                <input
                  type="text"
                  maxLength={6}
                  placeholder="123456"
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-white font-mono text-center tracking-widest text-base"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowRequestModal(false)}
                  className="px-4 py-2 rounded-lg bg-slate-800 text-slate-300 hover:text-white text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-semibold shadow disabled:opacity-50"
                >
                  {submitting ? 'Submitting...' : 'Submit Break-Glass Request'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* APPROVE MODAL */}
      {showApproveModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-emerald-500/40 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2 text-emerald-400 font-bold text-base">
                <UserCheck className="w-5 h-5" /> Approve Break-Glass Session
              </div>
              <button onClick={() => setShowApproveModal(null)}><X className="w-5 h-5 text-slate-400" /></button>
            </div>

            <div className="text-xs text-slate-300 space-y-2 p-3 rounded-lg bg-slate-950 border border-slate-800">
              <div>Session: <span className="font-mono text-white">{showApproveModal.id}</span></div>
              <div>Operation: <span className="font-mono text-amber-400 font-bold">{showApproveModal.operation}</span></div>
              <div>Requester: <span className="text-white">{showApproveModal.requesterOperatorName}</span></div>
              <div>Reason: <span className="text-slate-400">{showApproveModal.reason}</span></div>
            </div>

            <form onSubmit={handleApproveSession} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-400 mb-1 font-semibold">Approving Operator MFA TOTP Code</label>
                <input
                  type="text"
                  maxLength={6}
                  placeholder="123456"
                  value={approveTotp}
                  onChange={(e) => setApproveTotp(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-white font-mono text-center tracking-widest text-base"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowApproveModal(null)}
                  className="px-4 py-2 rounded-lg bg-slate-800 text-slate-300 text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow disabled:opacity-50"
                >
                  {submitting ? 'Approving...' : 'Approve Session'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EXECUTE MODAL */}
      {showExecuteModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-blue-500/40 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2 text-blue-400 font-bold text-base">
                <Zap className="w-5 h-5" /> Execute Break-Glass Action
              </div>
              <button onClick={() => setShowExecuteModal(null)}><X className="w-5 h-5 text-slate-400" /></button>
            </div>

            <div className="text-xs text-slate-300 space-y-2 p-3 rounded-lg bg-slate-950 border border-slate-800">
              <div>Session: <span className="font-mono text-white">{showExecuteModal.id}</span></div>
              <div>Operation: <span className="font-mono text-blue-400 font-bold">{showExecuteModal.operation}</span></div>
              <div>Approved By: <span className="text-emerald-400">{showExecuteModal.approverOperatorName || showExecuteModal.approverOperatorId}</span></div>
            </div>

            <form onSubmit={handleExecuteAction} className="space-y-4 text-xs">
              <p className="text-slate-400">
                Executing this action will immediately mutate the target Control Plane state.
              </p>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowExecuteModal(null)}
                  className="px-4 py-2 rounded-lg bg-slate-800 text-slate-300 text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow disabled:opacity-50"
                >
                  {submitting ? 'Executing...' : 'Confirm Execution'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* POST-EVENT REVIEW MODAL */}
      {showReviewModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-purple-500/40 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2 text-purple-400 font-bold text-base">
                <FileText className="w-5 h-5" /> Mandatory Post-Event Review
              </div>
              <button onClick={() => setShowReviewModal(null)}><X className="w-5 h-5 text-slate-400" /></button>
            </div>

            <form onSubmit={handleReviewSession} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-400 mb-1 font-semibold">Review Outcome</label>
                <select
                  value={reviewStatus}
                  onChange={(e) => setReviewStatus(e.target.value as any)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-white"
                >
                  <option value="REVIEWED_APPROVED">REVIEWED_APPROVED — Emergency Action Fully Justified</option>
                  <option value="REVIEWED_FLAGGED">REVIEWED_FLAGGED — Action Flagged for Security Audit Review</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-400 mb-1 font-semibold">Review Findings & Explanatory Notes</label>
                <textarea
                  rows={3}
                  placeholder="Document post-event review conclusions and findings..."
                  value={reviewNotes}
                  onChange={(e) => setReviewNotes(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-white"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowReviewModal(null)}
                  className="px-4 py-2 rounded-lg bg-slate-800 text-slate-300 text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold shadow disabled:opacity-50"
                >
                  {submitting ? 'Submitting...' : 'Complete Post-Event Review'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
