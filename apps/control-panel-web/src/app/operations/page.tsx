'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Activity,
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
  Filter,
  Check,
  X,
  Eye,
  Building2,
  Server,
  Sliders,
  RotateCcw,
  Info,
  ShieldCheck,
  KeyRound,
} from 'lucide-react';
import { useAuth } from '../../lib/auth-context';
import { controlPlaneApi, ControlPlaneApiError } from '../../lib/control-plane-api';
import {
  BreakGlassSessionDto,
  BreakGlassOperation,
  BreakGlassStatus,
  OrganizationControlState,
  DeploymentSummary,
  ServiceCatalogItem,
} from '../../types/control-plane';
import { StatusBadge } from '../../components/ui/status-badge';
import { ErrorState } from '../../components/ui/error-state';
import { AccessDenied } from '../../components/ui/access-denied';

export default function OperationsPage() {
  const { operator, isAuthenticated, isLoading: isAuthLoading } = useAuth();

  // Core Data States
  const [sessions, setSessions] = useState<BreakGlassSessionDto[]>([]);
  const [organizations, setOrganizations] = useState<OrganizationControlState[]>([]);
  const [deployments, setDeployments] = useState<DeploymentSummary[]>([]);
  const [services, setServices] = useState<ServiceCatalogItem[]>([]);

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<ControlPlaneApiError | null>(null);
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Active Tab & Filters
  const [activeTab, setActiveTab] = useState<'OPERATIONS' | 'SESSIONS' | 'REVIEWS'>('OPERATIONS');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  // Request Modal State
  const [selectedOpType, setSelectedOpType] = useState<BreakGlassOperation | null>(null);
  const [targetOrgId, setTargetOrgId] = useState('');
  const [targetDepId, setTargetDepId] = useState('');
  const [targetServiceCode, setTargetServiceCode] = useState('');
  const [reason, setReason] = useState('');
  const [durationMinutes, setDurationMinutes] = useState(15);
  const [isSingleEmergency, setIsSingleEmergency] = useState(false);
  const [emergencyText, setEmergencyText] = useState('');
  const [totpCode, setTotpCode] = useState('');

  // Modals for Actions
  const [approveTarget, setApproveTarget] = useState<BreakGlassSessionDto | null>(null);
  const [approveTotp, setApproveTotp] = useState('');
  const [approveReason, setApproveReason] = useState('');

  const [executeTarget, setExecuteTarget] = useState<BreakGlassSessionDto | null>(null);
  const [executeTotp, setExecuteTotp] = useState('');

  const [revokeTarget, setRevokeTarget] = useState<BreakGlassSessionDto | null>(null);
  const [revokeReason, setRevokeReason] = useState('');

  const [reviewTarget, setReviewTarget] = useState<BreakGlassSessionDto | null>(null);
  const [reviewStatus, setReviewStatus] = useState<'REVIEWED_APPROVED' | 'REVIEWED_FLAGGED'>('REVIEWED_APPROVED');
  const [reviewNotes, setReviewNotes] = useState('');

  const [detailsTarget, setDetailsTarget] = useState<BreakGlassSessionDto | null>(null);
  const [executionResult, setExecutionResult] = useState<any | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  // RBAC Permission checks
  const canInitiate =
    operator?.role === 'PLATFORM_SUPER_ADMIN' ||
    operator?.role === 'OPERATIONS_ENGINEER';

  const canReview =
    operator?.role === 'PLATFORM_SUPER_ADMIN' ||
    operator?.role === 'SECURITY_AUDIT';

  // Fetch Authoritative Data
  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const [sessionList, orgList, depList, serviceList] = await Promise.all([
        controlPlaneApi.listBreakGlassSessions(),
        controlPlaneApi.listOrganizations().catch(() => []),
        controlPlaneApi.listDeployments().catch(() => []),
        controlPlaneApi.listServices().catch(() => []),
      ]);

      setSessions(sessionList || []);
      setOrganizations(orgList || []);
      setDeployments(depList || []);
      setServices(serviceList || []);
    } catch (err: any) {
      if (err instanceof ControlPlaneApiError) {
        setError(err);
      } else {
        setError(new ControlPlaneApiError(500, err.message || 'Failed to load Break-Glass operations data'));
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      fetchData();
    }
  }, [isAuthenticated, fetchData]);

  // Derived Statistics
  const stats = useMemo(() => {
    const total = sessions.length;
    const requested = sessions.filter((s) => s.status === 'REQUESTED').length;
    const approved = sessions.filter((s) => s.status === 'APPROVED').length;
    const executed = sessions.filter((s) => s.status === 'EXECUTED').length;
    const pendingReview = sessions.filter((s) => s.isSingleOperatorEmergency && s.postEventReviewStatus === 'PENDING_REVIEW').length;
    return { total, requested, approved, executed, pendingReview };
  }, [sessions]);

  // Pending Reviews Filter
  const pendingReviewsList = useMemo(() => {
    return sessions.filter((s) => s.isSingleOperatorEmergency && s.postEventReviewStatus === 'PENDING_REVIEW');
  }, [sessions]);

  // Filtered Sessions
  const filteredSessions = useMemo(() => {
    return sessions.filter((s) => {
      const matchesSearch =
        !searchQuery.trim() ||
        s.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.operation.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (s.targetOrganizationId && s.targetOrganizationId.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (s.targetDeploymentId && s.targetDeploymentId.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (s.targetServiceCode && s.targetServiceCode.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (s.requesterOperatorName && s.requesterOperatorName.toLowerCase().includes(searchQuery.toLowerCase()));

      const matchesStatus = statusFilter === 'ALL' || s.status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [sessions, searchQuery, statusFilter]);

  // Handle Initiating Request
  const handleInitiateRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOpType) return;

    if (!reason || reason.trim().length < 10) {
      setModalError('Operational reason must be at least 10 characters detailing justification.');
      return;
    }

    if (!totpCode || totpCode.trim().length !== 6) {
      setModalError('Valid 6-digit MFA TOTP code is required.');
      return;
    }

    // Target Validations
    if (
      (selectedOpType === 'EMERGENCY_ORG_SUSPEND' || selectedOpType === 'EMERGENCY_ORG_DISABLE') &&
      !targetOrgId
    ) {
      setModalError('Target Organization must be selected.');
      return;
    }

    if (selectedOpType === 'EMERGENCY_DEPLOYMENT_SUSPEND' && !targetDepId) {
      setModalError('Target Deployment must be selected.');
      return;
    }

    if (selectedOpType === 'EMERGENCY_SERVICE_KILL_SWITCH' && !targetServiceCode) {
      setModalError('Target Service Capability must be selected.');
      return;
    }

    if (selectedOpType === 'EMERGENCY_LICENSE_RECONCILE' && !targetOrgId && !targetDepId) {
      setModalError('Target Organization or Deployment must be selected for License Reconciliation.');
      return;
    }

    // Typed Confirmation Validation for Single-Operator Emergency
    if (isSingleEmergency) {
      const targetId = targetOrgId || targetDepId || targetServiceCode || 'TARGET';
      const expectedText = `CONFIRM EMERGENCY OVERRIDE ${targetId.toUpperCase()}`;
      if (!emergencyText || emergencyText.trim().toUpperCase() !== expectedText) {
        setModalError(`Single-operator emergency mode requires exact typed phrase: "${expectedText}"`);
        return;
      }
    }

    setSubmitting(true);
    setModalError(null);

    try {
      const result = await controlPlaneApi.requestBreakGlassSession({
        operation: selectedOpType,
        reason: reason.trim(),
        targetOrganizationId: targetOrgId || undefined,
        targetDeploymentId: targetDepId || undefined,
        targetServiceCode: targetServiceCode || undefined,
        durationMinutes: Number(durationMinutes),
        isSingleOperatorEmergency: isSingleEmergency,
        emergencyConfirmationText: isSingleEmergency ? emergencyText.trim() : undefined,
        totpCode: totpCode.trim(),
      });

      // Clear TOTP code immediately from memory
      setTotpCode('');

      setActionMessage({
        type: 'success',
        text: `Break-Glass session [${result.id}] successfully requested (${result.status}).`,
      });

      setSelectedOpType(null);
      resetFormFields();
      await fetchData();
    } catch (err: any) {
      setTotpCode('');
      setModalError(err.message || 'Failed to request Break-Glass authorization');
    } finally {
      setSubmitting(false);
    }
  };

  // Handle Approving Request (2-Operator Mode)
  const handleApproveSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!approveTarget) return;

    if (!approveTotp || approveTotp.trim().length !== 6) {
      setModalError('Valid 6-digit MFA TOTP code is required for approval.');
      return;
    }

    setSubmitting(true);
    setModalError(null);

    try {
      const updated = await controlPlaneApi.approveBreakGlassSession(approveTarget.id, {
        totpCode: approveTotp.trim(),
        reason: approveReason.trim() || undefined,
      });

      setApproveTotp('');
      setActionMessage({
        type: 'success',
        text: `Break-Glass session [${updated.id}] successfully APPROVED by second operator.`,
      });

      setApproveTarget(null);
      setApproveReason('');
      await fetchData();
    } catch (err: any) {
      setApproveTotp('');
      setModalError(err.message || 'Failed to approve Break-Glass session');
    } finally {
      setSubmitting(false);
    }
  };

  // Handle Executing Action
  const handleExecuteAction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!executeTarget) return;

    setSubmitting(true);
    setModalError(null);

    try {
      const res = await controlPlaneApi.executeBreakGlassAction(executeTarget.id, {
        totpCode: executeTotp.trim() || undefined,
      });

      setExecuteTotp('');
      setActionMessage({
        type: 'success',
        text: `Break-Glass action [${executeTarget.id}] EXECUTED successfully.`,
      });

      setExecutionResult(res.result);
      setExecuteTarget(null);
      await fetchData();
    } catch (err: any) {
      setExecuteTotp('');
      setModalError(err.message || 'Failed to execute Break-Glass action');
    } finally {
      setSubmitting(false);
    }
  };

  // Handle Revoking Session
  const handleRevokeSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!revokeTarget) return;

    setSubmitting(true);
    setModalError(null);

    try {
      await controlPlaneApi.revokeBreakGlassSession(revokeTarget.id, revokeReason.trim());
      setActionMessage({
        type: 'success',
        text: `Break-Glass session [${revokeTarget.id}] REVOKED.`,
      });

      setRevokeTarget(null);
      setRevokeReason('');
      await fetchData();
    } catch (err: any) {
      setModalError(err.message || 'Failed to revoke Break-Glass session');
    } finally {
      setSubmitting(false);
    }
  };

  // Handle Post-Event Emergency Review
  const handleReviewSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reviewTarget) return;

    if (!reviewNotes || reviewNotes.trim().length < 10) {
      setModalError('Review notes must be at least 10 characters long.');
      return;
    }

    setSubmitting(true);
    setModalError(null);

    try {
      await controlPlaneApi.reviewEmergencyBreakGlassSession(reviewTarget.id, {
        postEventReviewStatus: reviewStatus,
        notes: reviewNotes.trim(),
      });

      setActionMessage({
        type: 'success',
        text: `Post-event emergency review submitted for session [${reviewTarget.id}].`,
      });

      setReviewTarget(null);
      setReviewNotes('');
      await fetchData();
    } catch (err: any) {
      setModalError(err.message || 'Failed to submit post-event review');
    } finally {
      setSubmitting(false);
    }
  };

  const resetFormFields = () => {
    setTargetOrgId('');
    setTargetDepId('');
    setTargetServiceCode('');
    setReason('');
    setDurationMinutes(15);
    setIsSingleEmergency(false);
    setEmergencyText('');
    setTotpCode('');
    setModalError(null);
  };

  const renderStatusBadge = (status: BreakGlassStatus) => {
    switch (status) {
      case 'REQUESTED':
        return <StatusBadge status="WARNING" label="REQUESTED" size="sm" />;
      case 'APPROVED':
        return <StatusBadge status="ACTIVE" label="APPROVED" size="sm" />;
      case 'EXECUTED':
        return <StatusBadge status="ACTIVE" label="EXECUTED" size="sm" />;
      case 'REVOKED':
        return <StatusBadge status="REVOKED" label="REVOKED" size="sm" />;
      case 'EXPIRED':
        return <StatusBadge status="DISABLED" label="EXPIRED" size="sm" />;
      default:
        return <StatusBadge status={status} size="sm" />;
    }
  };

  const renderReviewBadge = (status?: string) => {
    switch (status) {
      case 'PENDING_REVIEW':
        return <StatusBadge status="WARNING" label="PENDING REVIEW" size="sm" />;
      case 'REVIEWED_APPROVED':
        return <StatusBadge status="ACTIVE" label="REVIEW PASSED" size="sm" />;
      case 'REVIEWED_FLAGGED':
        return <StatusBadge status="REVOKED" label="FLAGGED" size="sm" />;
      default:
        return <span className="text-gray-500 italic text-[11px]">N/A</span>;
    }
  };

  if (isAuthLoading || (isLoading && sessions.length === 0 && !error)) {
    return (
      <div className="flex h-64 items-center justify-center">
        <RefreshCw className="h-6 w-6 animate-spin text-aravBlue-400" />
      </div>
    );
  }

  if (error && error.statusCode === 403) {
    return (
      <AccessDenied
        resource="Break-Glass Operations API"
        requiredRole="Authorized Control Plane Operator"
      />
    );
  }

  if (error) {
    return (
      <ErrorState
        statusCode={error.statusCode}
        title="Failed to load Operations & Break-Glass records"
        message={error.message}
        correlationId={error.correlationId}
        onRetry={fetchData}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between border-b border-cpDark-800 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <Activity className="h-6 w-6 text-rose-400" />
            <h1 className="text-xl font-bold text-white tracking-tight">Operations & Break-Glass Control Console</h1>
          </div>
          <p className="mt-1 text-xs text-gray-400 font-mono">
            Controlled platform emergency isolation, break-glass session authorization, and post-event audit reviews.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {canInitiate ? (
            <div className="flex items-center gap-1.5 rounded-md border border-rose-800/60 bg-rose-950/40 px-3 py-1 text-xs font-mono text-rose-300">
              <Zap className="h-3.5 w-3.5 text-rose-400" />
              <span>Emergency Operator ({operator?.role})</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 rounded-md border border-cpDark-700 bg-cpDark-900 px-3 py-1 text-xs font-mono text-gray-400">
              <Lock className="h-3.5 w-3.5 text-amber-400" />
              <span>Read-Only Mode ({operator?.role})</span>
            </div>
          )}

          <button
            onClick={fetchData}
            disabled={isLoading}
            className="inline-flex items-center gap-2 rounded border border-cpDark-700 bg-cpDark-800 px-3.5 py-1.5 text-xs font-medium text-gray-300 hover:bg-cpDark-700 hover:text-white transition-colors focus-ring"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin text-aravBlue-400' : ''}`} />
            <span>Refresh State</span>
          </button>
        </div>
      </div>

      {/* Global Success / Alert Banner */}
      {actionMessage && (
        <div
          className={`flex items-center justify-between rounded-lg border p-4 text-xs font-mono ${
            actionMessage.type === 'success'
              ? 'border-emerald-800 bg-emerald-950/60 text-emerald-200'
              : 'border-rose-800 bg-rose-950/60 text-rose-200'
          }`}
        >
          <div className="flex items-center gap-2">
            {actionMessage.type === 'success' ? (
              <CheckCircle className="h-4 w-4 text-emerald-400 shrink-0" />
            ) : (
              <AlertTriangle className="h-4 w-4 text-rose-400 shrink-0" />
            )}
            <span>{actionMessage.text}</span>
          </div>
          <button onClick={() => setActionMessage(null)} className="text-gray-400 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Execution Result Banner */}
      {executionResult && (
        <div className="rounded-lg border border-aravBlue-800 bg-cpDark-950 p-4 font-mono text-xs space-y-2">
          <div className="flex items-center justify-between font-bold text-aravBlue-300">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-aravBlue-400" />
              <span>Authoritative Execution Result Returned:</span>
            </div>
            <button onClick={() => setExecutionResult(null)} className="text-gray-400 hover:text-white">
              <X className="h-4 w-4" />
            </button>
          </div>
          <pre className="p-3 bg-cpDark-900 border border-cpDark-800 rounded text-emerald-400 overflow-x-auto text-[11px]">
            {JSON.stringify(executionResult, null, 2)}
          </pre>
        </div>
      )}

      {/* Distinction & Governance Banner */}
      <div className="rounded-lg border border-cpDark-800 bg-cpDark-950 p-4 font-mono text-xs text-gray-300 space-y-2">
        <div className="flex items-center gap-2 font-bold text-rose-400">
          <ShieldAlert className="h-4 w-4 shrink-0" />
          <span>Emergency Control Plane Boundaries & Governance Rules</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1 text-[11px] text-gray-400">
          <div className="rounded border border-cpDark-800 bg-cpDark-900/60 p-2.5">
            <span className="font-bold text-rose-300 block mb-1">1. Emergency vs Routine Admin</span>
            Emergency operations isolation overrides normal licensing and feature flags. Operations execute under strict 15-minute TTLs.
          </div>
          <div className="rounded border border-cpDark-800 bg-cpDark-900/60 p-2.5">
            <span className="font-bold text-amber-300 block mb-1">2. Step-Up MFA & Separation</span>
            All requests and approvals require valid 6-digit TOTP MFA codes. Requesters cannot approve their own requests.
          </div>
          <div className="rounded border border-cpDark-800 bg-cpDark-900/60 p-2.5">
            <span className="font-bold text-emerald-300 block mb-1">3. Mandatory Post-Event Review</span>
            Single-operator emergency actions trigger automatic security audit review queue enforcement. Requesters/Executors cannot self-review.
          </div>
        </div>
      </div>

      {/* KPI Stats Strip */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-5 font-mono">
        <div className="rounded-lg border border-cpDark-800 bg-cpDark-900 p-4 shadow-md">
          <span className="text-[11px] font-medium uppercase tracking-wider text-gray-400">Total Sessions</span>
          <div className="mt-1 text-2xl font-bold text-white">{stats.total}</div>
        </div>

        <div className="rounded-lg border border-cpDark-800 bg-cpDark-900 p-4 shadow-md">
          <span className="text-[11px] font-medium uppercase tracking-wider text-amber-400">Pending Approval</span>
          <div className="mt-1 text-2xl font-bold text-amber-400">{stats.requested}</div>
        </div>

        <div className="rounded-lg border border-cpDark-800 bg-cpDark-900 p-4 shadow-md">
          <span className="text-[11px] font-medium uppercase tracking-wider text-emerald-400">Approved Sessions</span>
          <div className="mt-1 text-2xl font-bold text-emerald-400">{stats.approved}</div>
        </div>

        <div className="rounded-lg border border-cpDark-800 bg-cpDark-900 p-4 shadow-md">
          <span className="text-[11px] font-medium uppercase tracking-wider text-aravBlue-400">Executed Actions</span>
          <div className="mt-1 text-2xl font-bold text-aravBlue-300">{stats.executed}</div>
        </div>

        <div className="rounded-lg border border-cpDark-800 bg-cpDark-900 p-4 shadow-md">
          <span className="text-[11px] font-medium uppercase tracking-wider text-rose-400">Pending Review</span>
          <div className="mt-1 text-2xl font-bold text-rose-400">{stats.pendingReview}</div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex border-b border-cpDark-800 font-mono text-xs">
        <button
          onClick={() => setActiveTab('OPERATIONS')}
          className={`flex items-center gap-2 px-5 py-3 font-semibold border-b-2 transition-colors ${
            activeTab === 'OPERATIONS'
              ? 'border-rose-400 text-white bg-cpDark-900/60'
              : 'border-transparent text-gray-400 hover:text-gray-200'
          }`}
        >
          <ShieldAlert className="h-4 w-4 text-rose-400" />
          <span>Emergency Actions Catalogue</span>
        </button>

        <button
          onClick={() => setActiveTab('SESSIONS')}
          className={`flex items-center gap-2 px-5 py-3 font-semibold border-b-2 transition-colors ${
            activeTab === 'SESSIONS'
              ? 'border-aravBlue-400 text-white bg-cpDark-900/60'
              : 'border-transparent text-gray-400 hover:text-gray-200'
          }`}
        >
          <FileText className="h-4 w-4" />
          <span>All Break-Glass Sessions ({sessions.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('REVIEWS')}
          className={`flex items-center gap-2 px-5 py-3 font-semibold border-b-2 transition-colors ${
            activeTab === 'REVIEWS'
              ? 'border-amber-400 text-white bg-cpDark-900/60'
              : 'border-transparent text-gray-400 hover:text-gray-200'
          }`}
        >
          <UserCheck className="h-4 w-4 text-amber-400" />
          <span>Post-Event Review Queue ({pendingReviewsList.length})</span>
        </button>
      </div>

      {/* SECTION 1: EMERGENCY OPERATIONS CATALOGUE */}
      {activeTab === 'OPERATIONS' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Op 1: EMERGENCY_ORG_SUSPEND */}
            <div className="rounded-lg border border-rose-900/60 bg-cpDark-900 p-5 shadow-lg flex flex-col justify-between space-y-4">
              <div>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2.5">
                    <Building2 className="h-5 w-5 text-rose-400 shrink-0" />
                    <h3 className="text-sm font-bold text-white">Emergency Organization Suspend</h3>
                  </div>
                  <span className="rounded bg-rose-950 border border-rose-800 px-2 py-0.5 font-mono text-[10px] text-rose-300">
                    CRITICAL / TENANT
                  </span>
                </div>
                <p className="mt-2 text-xs font-mono text-gray-400 leading-relaxed">
                  Immediately suspends organization control state to <code className="text-rose-300">SUSPENDED</code>. Blocks tenant requests and pauses background workers across all deployments.
                </p>
                <div className="mt-3 text-[11px] font-mono text-gray-500">
                  Code: <code className="text-aravBlue-300">EMERGENCY_ORG_SUSPEND</code> | Target: Real Organization
                </div>
              </div>

              <div className="flex items-center justify-between border-t border-cpDark-800 pt-3">
                <span className="text-[11px] font-mono text-gray-400">Requires Step-Up MFA & Target Org</span>
                {canInitiate ? (
                  <button
                    onClick={() => {
                      setSelectedOpType('EMERGENCY_ORG_SUSPEND');
                      resetFormFields();
                    }}
                    className="rounded bg-rose-900 hover:bg-rose-800 text-white font-mono text-xs px-3.5 py-1.5 font-semibold transition-colors focus-ring"
                  >
                    Suspend Organization
                  </button>
                ) : (
                  <button disabled className="rounded bg-gray-900 text-gray-600 border border-gray-800 font-mono text-xs px-3 py-1.5 cursor-not-allowed">
                    Unauthorized
                  </button>
                )}
              </div>
            </div>

            {/* Op 2: EMERGENCY_ORG_DISABLE */}
            <div className="rounded-lg border border-rose-900/60 bg-cpDark-900 p-5 shadow-lg flex flex-col justify-between space-y-4">
              <div>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2.5">
                    <Building2 className="h-5 w-5 text-rose-500 shrink-0" />
                    <h3 className="text-sm font-bold text-white">Emergency Organization Disable</h3>
                  </div>
                  <span className="rounded bg-rose-950 border border-rose-800 px-2 py-0.5 font-mono text-[10px] text-rose-400">
                    CRITICAL / HARD LOCK
                  </span>
                </div>
                <p className="mt-2 text-xs font-mono text-gray-400 leading-relaxed">
                  Completely disables organization control state to <code className="text-rose-300">DISABLED</code>. Hard locks data plane tenant access and revokes execution authority.
                </p>
                <div className="mt-3 text-[11px] font-mono text-gray-500">
                  Code: <code className="text-aravBlue-300">EMERGENCY_ORG_DISABLE</code> | Target: Real Organization
                </div>
              </div>

              <div className="flex items-center justify-between border-t border-cpDark-800 pt-3">
                <span className="text-[11px] font-mono text-gray-400">Requires Step-Up MFA & Target Org</span>
                {canInitiate ? (
                  <button
                    onClick={() => {
                      setSelectedOpType('EMERGENCY_ORG_DISABLE');
                      resetFormFields();
                    }}
                    className="rounded bg-rose-950 text-rose-300 border border-rose-800 hover:bg-rose-900 font-mono text-xs px-3.5 py-1.5 font-semibold transition-colors focus-ring"
                  >
                    Disable Organization
                  </button>
                ) : (
                  <button disabled className="rounded bg-gray-900 text-gray-600 border border-gray-800 font-mono text-xs px-3 py-1.5 cursor-not-allowed">
                    Unauthorized
                  </button>
                )}
              </div>
            </div>

            {/* Op 3: EMERGENCY_SERVICE_KILL_SWITCH */}
            <div className="rounded-lg border border-amber-900/60 bg-cpDark-900 p-5 shadow-lg flex flex-col justify-between space-y-4">
              <div>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2.5">
                    <Sliders className="h-5 w-5 text-amber-400 shrink-0" />
                    <h3 className="text-sm font-bold text-white">Service Capability Kill Switch</h3>
                  </div>
                  <span className="rounded bg-amber-950 border border-amber-800 px-2 py-0.5 font-mono text-[10px] text-amber-300">
                    HIGH / KILL-SWITCH
                  </span>
                </div>
                <p className="mt-2 text-xs font-mono text-gray-400 leading-relaxed">
                  Triggers an operational kill switch for a specific service capability code globally or scoped to a target organization.
                </p>
                <div className="mt-3 text-[11px] font-mono text-gray-500">
                  Code: <code className="text-aravBlue-300">EMERGENCY_SERVICE_KILL_SWITCH</code> | Target: Real Service Code
                </div>
              </div>

              <div className="flex items-center justify-between border-t border-cpDark-800 pt-3">
                <span className="text-[11px] font-mono text-gray-400">Requires Target Service Code</span>
                {canInitiate ? (
                  <button
                    onClick={() => {
                      setSelectedOpType('EMERGENCY_SERVICE_KILL_SWITCH');
                      resetFormFields();
                    }}
                    className="rounded bg-amber-950 text-amber-300 border border-amber-800 hover:bg-amber-900 font-mono text-xs px-3.5 py-1.5 font-semibold transition-colors focus-ring"
                  >
                    Kill Service
                  </button>
                ) : (
                  <button disabled className="rounded bg-gray-900 text-gray-600 border border-gray-800 font-mono text-xs px-3 py-1.5 cursor-not-allowed">
                    Unauthorized
                  </button>
                )}
              </div>
            </div>

            {/* Op 4: EMERGENCY_DEPLOYMENT_SUSPEND */}
            <div className="rounded-lg border border-amber-900/60 bg-cpDark-900 p-5 shadow-lg flex flex-col justify-between space-y-4">
              <div>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2.5">
                    <Server className="h-5 w-5 text-amber-400 shrink-0" />
                    <h3 className="text-sm font-bold text-white">Deployment Emergency Suspend</h3>
                  </div>
                  <span className="rounded bg-amber-950 border border-amber-800 px-2 py-0.5 font-mono text-[10px] text-amber-300">
                    HIGH / INSTANCE
                  </span>
                </div>
                <p className="mt-2 text-xs font-mono text-gray-400 leading-relaxed">
                  Suspends activation state of a target Data Plane deployment instance to <code className="text-amber-300">SUSPENDED</code>. Blocks instance requests.
                </p>
                <div className="mt-3 text-[11px] font-mono text-gray-500">
                  Code: <code className="text-aravBlue-300">EMERGENCY_DEPLOYMENT_SUSPEND</code> | Target: Real Deployment ID
                </div>
              </div>

              <div className="flex items-center justify-between border-t border-cpDark-800 pt-3">
                <span className="text-[11px] font-mono text-gray-400">Requires Target Deployment ID</span>
                {canInitiate ? (
                  <button
                    onClick={() => {
                      setSelectedOpType('EMERGENCY_DEPLOYMENT_SUSPEND');
                      resetFormFields();
                    }}
                    className="rounded bg-amber-950 text-amber-300 border border-amber-800 hover:bg-amber-900 font-mono text-xs px-3.5 py-1.5 font-semibold transition-colors focus-ring"
                  >
                    Suspend Deployment
                  </button>
                ) : (
                  <button disabled className="rounded bg-gray-900 text-gray-600 border border-gray-800 font-mono text-xs px-3 py-1.5 cursor-not-allowed">
                    Unauthorized
                  </button>
                )}
              </div>
            </div>

            {/* Op 5: EMERGENCY_LICENSE_RECONCILE */}
            <div className="rounded-lg border border-aravBlue-800 bg-cpDark-900 p-5 shadow-lg flex flex-col justify-between space-y-4 md:col-span-2">
              <div>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2.5">
                    <KeyRound className="h-5 w-5 text-aravBlue-400 shrink-0" />
                    <h3 className="text-sm font-bold text-white">Emergency License Reconciliation</h3>
                  </div>
                  <span className="rounded bg-aravBlue-950 border border-aravBlue-800 px-2 py-0.5 font-mono text-[10px] text-aravBlue-300">
                    MODERATE / RECONCILE
                  </span>
                </div>
                <p className="mt-2 text-xs font-mono text-gray-400 leading-relaxed">
                  Forces immediate re-synchronization and cryptographic Ed25519 license artifact re-issuance for a target organization or deployment.
                </p>
                <div className="mt-3 text-[11px] font-mono text-gray-500">
                  Code: <code className="text-aravBlue-300">EMERGENCY_LICENSE_RECONCILE</code> | Target: Real Org ID or Deployment ID
                </div>
              </div>

              <div className="flex items-center justify-between border-t border-cpDark-800 pt-3">
                <span className="text-[11px] font-mono text-gray-400">Requires Target Org ID or Deployment ID</span>
                {canInitiate ? (
                  <button
                    onClick={() => {
                      setSelectedOpType('EMERGENCY_LICENSE_RECONCILE');
                      resetFormFields();
                    }}
                    className="rounded bg-aravBlue-900 hover:bg-aravBlue-800 text-white font-mono text-xs px-3.5 py-1.5 font-semibold transition-colors focus-ring"
                  >
                    Reconcile License
                  </button>
                ) : (
                  <button disabled className="rounded bg-gray-900 text-gray-600 border border-gray-800 font-mono text-xs px-3 py-1.5 cursor-not-allowed">
                    Unauthorized
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SECTION 2: ALL BREAK-GLASS SESSIONS TABLE */}
      {(activeTab === 'SESSIONS' || activeTab === 'OPERATIONS') && (
        <div className="space-y-4">
          {/* Table Header Controls */}
          <div className="flex flex-col gap-3 rounded-lg border border-cpDark-800 bg-cpDark-900 p-4 sm:flex-row sm:items-center sm:justify-between shadow-lg font-mono">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search session ID, operation, target org/dep/service, operator..."
                className="w-full rounded-md border border-cpDark-700 bg-cpDark-950 pl-9 pr-4 py-2 text-xs text-white placeholder-gray-500 focus-ring"
              />
            </div>

            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-gray-400 shrink-0" />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="rounded-md border border-cpDark-700 bg-cpDark-950 px-3 py-2 text-xs text-gray-300 focus-ring"
              >
                <option value="ALL">All Statuses</option>
                <option value="REQUESTED">REQUESTED</option>
                <option value="APPROVED">APPROVED</option>
                <option value="EXECUTED">EXECUTED</option>
                <option value="REVOKED">REVOKED</option>
                <option value="EXPIRED">EXPIRED</option>
              </select>
            </div>
          </div>

          {/* Sessions Table */}
          <div className="rounded-lg border border-cpDark-800 bg-cpDark-900 shadow-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-mono">
                <thead className="border-b border-cpDark-800 bg-cpDark-950 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                  <tr>
                    <th scope="col" className="px-4 py-3">Session ID / Operation</th>
                    <th scope="col" className="px-4 py-3">Target Resource</th>
                    <th scope="col" className="px-4 py-3">Operators (Req / App)</th>
                    <th scope="col" className="px-4 py-3">Status</th>
                    <th scope="col" className="px-4 py-3">Review State</th>
                    <th scope="col" className="px-4 py-3">Created / Expires</th>
                    <th scope="col" className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-cpDark-800/60 text-gray-300">
                  {filteredSessions.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-12 text-center text-gray-500 italic">
                        No Break-Glass session records found matching criteria.
                      </td>
                    </tr>
                  ) : (
                    filteredSessions.map((s) => {
                      const isExpired = new Date(s.expiresAt).getTime() < Date.now();
                      const isRequester = operator?.id === s.requesterOperatorId;
                      const isExecutor = operator?.id === s.executorOperatorId;

                      return (
                        <tr key={s.id} className="hover:bg-cpDark-800/40 transition-colors">
                          <td className="px-4 py-3">
                            <div className="flex flex-col">
                              <span className="font-bold text-aravBlue-300">{s.id}</span>
                              <span className="text-[11px] text-rose-300 font-semibold">{s.operation}</span>
                              {s.isSingleOperatorEmergency && (
                                <span className="text-[10px] text-amber-400 font-semibold">Single-Op Emergency</span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-[11px]">
                            {s.targetOrganizationId && (
                              <div>Org: <code className="text-white font-bold">{s.targetOrganizationId}</code></div>
                            )}
                            {s.targetDeploymentId && (
                              <div>Dep: <code className="text-amber-300 font-bold">{s.targetDeploymentId}</code></div>
                            )}
                            {s.targetServiceCode && (
                              <div>Srv: <code className="text-emerald-300 font-bold">{s.targetServiceCode}</code></div>
                            )}
                            {!s.targetOrganizationId && !s.targetDeploymentId && !s.targetServiceCode && (
                              <span className="text-gray-500">Unspecified Target</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-[11px]">
                            <div>Req: <span className="text-gray-200">{s.requesterOperatorName || s.requesterOperatorId}</span></div>
                            {s.approverOperatorId && (
                              <div>App: <span className="text-emerald-300">{s.approverOperatorName || s.approverOperatorId}</span></div>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            {renderStatusBadge(s.status)}
                          </td>
                          <td className="px-4 py-3">
                            {renderReviewBadge(s.postEventReviewStatus || undefined)}
                          </td>
                          <td className="px-4 py-3 text-[11px] text-gray-400">
                            <div>{new Date(s.createdAt).toLocaleTimeString()}</div>
                            <div className={isExpired ? 'text-rose-400 font-semibold' : 'text-gray-500'}>
                              Exp: {new Date(s.expiresAt).toLocaleTimeString()}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {/* Details button */}
                              <button
                                onClick={() => setDetailsTarget(s)}
                                className="rounded bg-cpDark-800 text-gray-300 border border-cpDark-700 px-2 py-0.5 text-[11px] hover:text-white"
                                title="View Forensic Details"
                              >
                                Details
                              </button>

                              {/* Approve Button */}
                              {s.status === 'REQUESTED' && !isExpired && (
                                canInitiate ? (
                                  !isRequester ? (
                                    <button
                                      onClick={() => {
                                        setApproveTarget(s);
                                        setApproveTotp('');
                                        setApproveReason('');
                                        setModalError(null);
                                      }}
                                      className="rounded bg-emerald-950 text-emerald-300 border border-emerald-800 px-2 py-0.5 text-[11px] font-semibold hover:bg-emerald-900"
                                    >
                                      Approve
                                    </button>
                                  ) : (
                                    <span className="text-[10px] text-amber-400 italic" title="Separation of Duties: Requester cannot approve self">
                                      Self App Block
                                    </span>
                                  )
                                ) : (
                                  <span className="text-[11px] text-gray-500 italic">Read-Only</span>
                                )
                              )}

                              {/* Execute Button */}
                              {s.status === 'APPROVED' && !isExpired && (
                                canInitiate ? (
                                  <button
                                    onClick={() => {
                                      setExecuteTarget(s);
                                      setExecuteTotp('');
                                      setModalError(null);
                                    }}
                                    className="rounded bg-aravBlue-950 text-aravBlue-300 border border-aravBlue-800 px-2 py-0.5 text-[11px] font-semibold hover:bg-aravBlue-900"
                                  >
                                    Execute
                                  </button>
                                ) : (
                                  <span className="text-[11px] text-gray-500 italic">Read-Only</span>
                                )
                              )}

                              {/* Review Button */}
                              {s.isSingleOperatorEmergency && s.postEventReviewStatus === 'PENDING_REVIEW' && (
                                canReview ? (
                                  !isRequester && !isExecutor ? (
                                    <button
                                      onClick={() => {
                                        setReviewTarget(s);
                                        setReviewStatus('REVIEWED_APPROVED');
                                        setReviewNotes('');
                                        setModalError(null);
                                      }}
                                      className="rounded bg-amber-950 text-amber-300 border border-amber-800 px-2 py-0.5 text-[11px] font-semibold hover:bg-amber-900"
                                    >
                                      Review
                                    </button>
                                  ) : (
                                    <span className="text-[10px] text-rose-400 italic" title="Separation of Duties: Executor cannot self-review">
                                      Self Review Block
                                    </span>
                                  )
                                ) : (
                                  <span className="text-[11px] text-gray-500 italic">Review Blocked</span>
                                )
                              )}

                              {/* Revoke Button */}
                              {(s.status === 'REQUESTED' || s.status === 'APPROVED') && canInitiate && (
                                <button
                                  onClick={() => {
                                    setRevokeTarget(s);
                                    setRevokeReason('');
                                    setModalError(null);
                                  }}
                                  className="rounded bg-rose-950 text-rose-300 border border-rose-800 px-2 py-0.5 text-[11px] hover:bg-rose-900"
                                >
                                  Revoke
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* SECTION 3: REVIEWS QUEUE */}
      {activeTab === 'REVIEWS' && (
        <div className="space-y-4 font-mono">
          <div className="rounded-lg border border-cpDark-800 bg-cpDark-900 shadow-xl overflow-hidden">
            <div className="p-4 border-b border-cpDark-800 bg-cpDark-950 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <UserCheck className="h-5 w-5 text-amber-400" />
                <h3 className="text-sm font-bold text-white">Post-Event Emergency Review Queue</h3>
              </div>
              <span className="text-xs text-gray-400">
                Single-operator emergency overrides require independent post-event review by Security Audit or Super Admin.
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-cpDark-800 bg-cpDark-950 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                  <tr>
                    <th scope="col" className="px-4 py-3">Session ID</th>
                    <th scope="col" className="px-4 py-3">Operation</th>
                    <th scope="col" className="px-4 py-3">Target</th>
                    <th scope="col" className="px-4 py-3">Requester / Executor</th>
                    <th scope="col" className="px-4 py-3">Execution Time</th>
                    <th scope="col" className="px-4 py-3">Review Status</th>
                    <th scope="col" className="px-4 py-3 text-right">Review Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-cpDark-800/60 text-gray-300">
                  {pendingReviewsList.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-12 text-center text-gray-500 italic">
                        No single-operator emergency sessions currently pending review.
                      </td>
                    </tr>
                  ) : (
                    pendingReviewsList.map((s) => {
                      const isRequester = operator?.id === s.requesterOperatorId;
                      const isExecutor = operator?.id === s.executorOperatorId;

                      return (
                        <tr key={s.id} className="hover:bg-cpDark-800/40 transition-colors">
                          <td className="px-4 py-3 font-bold text-aravBlue-300">{s.id}</td>
                          <td className="px-4 py-3 font-semibold text-rose-300">{s.operation}</td>
                          <td className="px-4 py-3 text-[11px]">
                            {s.targetOrganizationId || s.targetDeploymentId || s.targetServiceCode || 'Target'}
                          </td>
                          <td className="px-4 py-3 text-[11px]">
                            {s.requesterOperatorName || s.requesterOperatorId}
                          </td>
                          <td className="px-4 py-3 text-[11px] text-gray-400">
                            {s.executedAt ? new Date(s.executedAt).toLocaleString() : 'Executed'}
                          </td>
                          <td className="px-4 py-3">{renderReviewBadge(s.postEventReviewStatus || undefined)}</td>
                          <td className="px-4 py-3 text-right">
                            {canReview ? (
                              !isRequester && !isExecutor ? (
                                <button
                                  onClick={() => {
                                    setReviewTarget(s);
                                    setReviewStatus('REVIEWED_APPROVED');
                                    setReviewNotes('');
                                    setModalError(null);
                                  }}
                                  className="rounded bg-amber-950 text-amber-300 border border-amber-800 px-3 py-1 text-xs font-semibold hover:bg-amber-900"
                                >
                                  Perform Review
                                </button>
                              ) : (
                                <span className="text-xs text-rose-400 italic">Separation Violation (Self Review Blocked)</span>
                              )
                            ) : (
                              <span className="text-xs text-gray-500 italic">Audit Authorization Required</span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* REQUEST MODAL */}
      {selectedOpType && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm font-mono">
          <div className="w-full max-w-xl rounded-lg border border-rose-900 bg-cpDark-900 p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-cpDark-800 pb-3">
              <div className="flex items-center gap-2">
                <ShieldAlert className="h-5 w-5 text-rose-400" />
                <h3 className="text-base font-bold text-white">Emergency Request: {selectedOpType}</h3>
              </div>
              <button onClick={() => setSelectedOpType(null)} className="text-gray-400 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleInitiateRequest} className="space-y-4 text-xs">
              {/* Target Selection */}
              {(selectedOpType === 'EMERGENCY_ORG_SUSPEND' || selectedOpType === 'EMERGENCY_ORG_DISABLE' || selectedOpType === 'EMERGENCY_LICENSE_RECONCILE') && (
                <div>
                  <label htmlFor="req-target-org" className="block text-gray-300 font-bold mb-1">
                    Target Organization <span className="text-rose-400">*</span>
                  </label>
                  <select
                    id="req-target-org"
                    value={targetOrgId}
                    onChange={(e) => setTargetOrgId(e.target.value)}
                    className="w-full rounded border border-cpDark-700 bg-cpDark-950 p-2 text-white focus-ring"
                  >
                    <option value="">Select target organization from Control Plane...</option>
                    {organizations.map((o) => (
                      <option key={o.organizationId} value={o.organizationId}>
                        {o.organizationId} ({o.state})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {(selectedOpType === 'EMERGENCY_DEPLOYMENT_SUSPEND' || (selectedOpType === 'EMERGENCY_LICENSE_RECONCILE' && !targetOrgId)) && (
                <div>
                  <label htmlFor="req-target-dep" className="block text-gray-300 font-bold mb-1">
                    Target Deployment <span className="text-rose-400">*</span>
                  </label>
                  <select
                    id="req-target-dep"
                    value={targetDepId}
                    onChange={(e) => setTargetDepId(e.target.value)}
                    className="w-full rounded border border-cpDark-700 bg-cpDark-950 p-2 text-white focus-ring"
                  >
                    <option value="">Select target deployment instance...</option>
                    {deployments.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.id} ({d.organizationId} - {d.deploymentModel} - {d.activationState})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {selectedOpType === 'EMERGENCY_SERVICE_KILL_SWITCH' && (
                <div>
                  <label htmlFor="req-target-srv" className="block text-gray-300 font-bold mb-1">
                    Target Service Capability Code <span className="text-rose-400">*</span>
                  </label>
                  <select
                    id="req-target-srv"
                    value={targetServiceCode}
                    onChange={(e) => setTargetServiceCode(e.target.value)}
                    className="w-full rounded border border-cpDark-700 bg-cpDark-950 p-2 text-white focus-ring"
                  >
                    <option value="">Select service capability code...</option>
                    {services.map((s) => (
                      <option key={s.code} value={s.code}>
                        {s.code} — {s.name} ({s.category})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Operational Reason */}
              <div>
                <label htmlFor="req-reason" className="block text-gray-300 font-bold mb-1">
                  Operational Audit Justification <span className="text-rose-400">*</span>
                </label>
                <textarea
                  id="req-reason"
                  rows={2}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Provide documented operational reason (>= 10 chars)..."
                  className="w-full rounded border border-cpDark-700 bg-cpDark-950 p-2 text-white placeholder-gray-500 focus-ring"
                  required
                />
              </div>

              {/* Duration Minutes */}
              <div>
                <label htmlFor="req-duration" className="block text-gray-300 font-bold mb-1">
                  Authorization Duration TTL (Minutes: 5 to 30)
                </label>
                <input
                  id="req-duration"
                  type="number"
                  min={5}
                  max={30}
                  value={durationMinutes}
                  onChange={(e) => setDurationMinutes(Number(e.target.value))}
                  className="w-full rounded border border-cpDark-700 bg-cpDark-950 p-2 text-white focus-ring"
                />
              </div>

              {/* Single Operator Emergency Mode Checkbox */}
              <div className="rounded border border-amber-800 bg-amber-950/40 p-3 space-y-2">
                <label className="flex items-center gap-2 font-bold text-amber-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isSingleEmergency}
                    onChange={(e) => setIsSingleEmergency(e.target.checked)}
                    className="rounded border-cpDark-700 bg-cpDark-950 text-amber-500 focus-ring"
                  />
                  <span>Initiate Single-Operator Emergency Override Mode</span>
                </label>

                {isSingleEmergency && (
                  <div className="pt-2 space-y-2">
                    <p className="text-[11px] text-amber-200">
                      Single-operator mode bypasses second operator approval for instant isolation, but sets status to APPROVED and triggers mandatory Post-Event Security Audit Review.
                    </p>
                    <label htmlFor="req-typed-confirm" className="block text-[11px] font-bold text-gray-300">
                      Type <code className="text-rose-300 font-mono">CONFIRM EMERGENCY OVERRIDE {(targetOrgId || targetDepId || targetServiceCode || 'TARGET').toUpperCase()}</code> to confirm:
                    </label>
                    <input
                      id="req-typed-confirm"
                      type="text"
                      value={emergencyText}
                      onChange={(e) => setEmergencyText(e.target.value)}
                      placeholder={`CONFIRM EMERGENCY OVERRIDE ${(targetOrgId || targetDepId || targetServiceCode || 'TARGET').toUpperCase()}`}
                      className="w-full rounded border border-rose-800 bg-cpDark-950 p-2 text-white focus-ring font-mono"
                    />
                  </div>
                )}
              </div>

              {/* MFA TOTP Code Input */}
              <div>
                <label htmlFor="req-totp" className="block text-gray-300 font-bold mb-1">
                  Step-Up MFA TOTP Code <span className="text-rose-400">*</span>
                </label>
                <input
                  id="req-totp"
                  type="text"
                  maxLength={6}
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value)}
                  placeholder="Enter 6-digit TOTP code..."
                  className="w-full rounded border border-cpDark-700 bg-cpDark-950 p-2 text-white focus-ring text-center tracking-widest font-bold"
                  required
                />
              </div>

              {modalError && (
                <div className="rounded border border-rose-800 bg-rose-950 p-3 text-rose-200">
                  {modalError}
                </div>
              )}

              <div className="flex justify-end gap-3 border-t border-cpDark-800 pt-3">
                <button
                  type="button"
                  onClick={() => setSelectedOpType(null)}
                  disabled={submitting}
                  className="rounded border border-cpDark-700 bg-cpDark-800 px-4 py-1.5 text-gray-300 hover:bg-cpDark-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded bg-rose-600 hover:bg-rose-700 text-white font-bold px-4 py-1.5 flex items-center gap-2"
                >
                  {submitting && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
                  <span>Request Emergency Authorization</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* APPROVE MODAL */}
      {approveTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm font-mono">
          <div className="w-full max-w-md rounded-lg border border-emerald-900 bg-cpDark-900 p-6 shadow-2xl space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-cpDark-800 pb-3">
              <h3 className="text-base font-bold text-white">Approve Break-Glass Request: {approveTarget.id}</h3>
              <button onClick={() => setApproveTarget(null)} className="text-gray-400 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>

            <p className="text-gray-300">
              Approving operation <code className="text-rose-300">{approveTarget.operation}</code> as second authorized operator.
            </p>

            <form onSubmit={handleApproveSession} className="space-y-4">
              <div>
                <label htmlFor="app-reason" className="block text-gray-300 font-bold mb-1">
                  Approval Notes (Optional)
                </label>
                <input
                  id="app-reason"
                  type="text"
                  value={approveReason}
                  onChange={(e) => setApproveReason(e.target.value)}
                  placeholder="Approval rationale notes..."
                  className="w-full rounded border border-cpDark-700 bg-cpDark-950 p-2 text-white focus-ring"
                />
              </div>

              <div>
                <label htmlFor="app-totp" className="block text-gray-300 font-bold mb-1">
                  Approver Step-Up MFA TOTP Code <span className="text-rose-400">*</span>
                </label>
                <input
                  id="app-totp"
                  type="text"
                  maxLength={6}
                  value={approveTotp}
                  onChange={(e) => setApproveTotp(e.target.value)}
                  placeholder="Enter 6-digit TOTP code..."
                  className="w-full rounded border border-cpDark-700 bg-cpDark-950 p-2 text-white focus-ring text-center tracking-widest font-bold"
                  required
                />
              </div>

              {modalError && (
                <div className="rounded border border-rose-800 bg-rose-950 p-3 text-rose-200">
                  {modalError}
                </div>
              )}

              <div className="flex justify-end gap-3 border-t border-cpDark-800 pt-3">
                <button
                  type="button"
                  onClick={() => setApproveTarget(null)}
                  disabled={submitting}
                  className="rounded border border-cpDark-700 bg-cpDark-800 px-4 py-1.5 text-gray-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-4 py-1.5 flex items-center gap-2"
                >
                  {submitting && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
                  <span>Approve Session</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EXECUTE MODAL */}
      {executeTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm font-mono">
          <div className="w-full max-w-md rounded-lg border border-aravBlue-900 bg-cpDark-900 p-6 shadow-2xl space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-cpDark-800 pb-3">
              <h3 className="text-base font-bold text-white">Execute Break-Glass Action: {executeTarget.id}</h3>
              <button onClick={() => setExecuteTarget(null)} className="text-gray-400 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>

            <p className="text-gray-300">
              Executing operation <code className="text-rose-300">{executeTarget.operation}</code> against target.
            </p>

            <form onSubmit={handleExecuteAction} className="space-y-4">
              <div>
                <label htmlFor="exec-totp" className="block text-gray-300 font-bold mb-1">
                  Executor MFA TOTP Code (Optional Step-Up)
                </label>
                <input
                  id="exec-totp"
                  type="text"
                  maxLength={6}
                  value={executeTotp}
                  onChange={(e) => setExecuteTotp(e.target.value)}
                  placeholder="Enter 6-digit TOTP code..."
                  className="w-full rounded border border-cpDark-700 bg-cpDark-950 p-2 text-white focus-ring text-center tracking-widest font-bold"
                />
              </div>

              {modalError && (
                <div className="rounded border border-rose-800 bg-rose-950 p-3 text-rose-200">
                  {modalError}
                </div>
              )}

              <div className="flex justify-end gap-3 border-t border-cpDark-800 pt-3">
                <button
                  type="button"
                  onClick={() => setExecuteTarget(null)}
                  disabled={submitting}
                  className="rounded border border-cpDark-700 bg-cpDark-800 px-4 py-1.5 text-gray-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded bg-aravBlue-600 hover:bg-aravBlue-700 text-white font-bold px-4 py-1.5 flex items-center gap-2"
                >
                  {submitting && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
                  <span>Execute Action</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* REVOKE MODAL */}
      {revokeTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm font-mono">
          <div className="w-full max-w-md rounded-lg border border-rose-900 bg-cpDark-900 p-6 shadow-2xl space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-cpDark-800 pb-3">
              <h3 className="text-base font-bold text-white">Revoke Session: {revokeTarget.id}</h3>
              <button onClick={() => setRevokeTarget(null)} className="text-gray-400 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleRevokeSession} className="space-y-4">
              <div>
                <label htmlFor="rev-reason" className="block text-gray-300 font-bold mb-1">
                  Revocation Reason
                </label>
                <input
                  id="rev-reason"
                  type="text"
                  value={revokeReason}
                  onChange={(e) => setRevokeReason(e.target.value)}
                  placeholder="Reason for revoking Break-Glass authorization..."
                  className="w-full rounded border border-cpDark-700 bg-cpDark-950 p-2 text-white focus-ring"
                />
              </div>

              {modalError && (
                <div className="rounded border border-rose-800 bg-rose-950 p-3 text-rose-200">
                  {modalError}
                </div>
              )}

              <div className="flex justify-end gap-3 border-t border-cpDark-800 pt-3">
                <button
                  type="button"
                  onClick={() => setRevokeTarget(null)}
                  disabled={submitting}
                  className="rounded border border-cpDark-700 bg-cpDark-800 px-4 py-1.5 text-gray-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded bg-rose-600 hover:bg-rose-700 text-white font-bold px-4 py-1.5 flex items-center gap-2"
                >
                  {submitting && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
                  <span>Confirm Revocation</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* REVIEW MODAL */}
      {reviewTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm font-mono">
          <div className="w-full max-w-md rounded-lg border border-amber-900 bg-cpDark-900 p-6 shadow-2xl space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-cpDark-800 pb-3">
              <h3 className="text-base font-bold text-white">Post-Event Emergency Review: {reviewTarget.id}</h3>
              <button onClick={() => setReviewTarget(null)} className="text-gray-400 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleReviewSession} className="space-y-4">
              <div>
                <label htmlFor="rev-outcome" className="block text-gray-300 font-bold mb-1">
                  Review Outcome
                </label>
                <select
                  id="rev-outcome"
                  value={reviewStatus}
                  onChange={(e) => setReviewStatus(e.target.value as any)}
                  className="w-full rounded border border-cpDark-700 bg-cpDark-950 p-2 text-white focus-ring"
                >
                  <option value="REVIEWED_APPROVED">REVIEWED_APPROVED (Emergency Override Justified)</option>
                  <option value="REVIEWED_FLAGGED">REVIEWED_FLAGGED (Flagged for Security Investigation)</option>
                </select>
              </div>

              <div>
                <label htmlFor="rev-notes" className="block text-gray-300 font-bold mb-1">
                  Auditor Review Notes <span className="text-rose-400">*</span>
                </label>
                <textarea
                  id="rev-notes"
                  rows={3}
                  value={reviewNotes}
                  onChange={(e) => setReviewNotes(e.target.value)}
                  placeholder="Provide audit assessment notes (>= 10 chars)..."
                  className="w-full rounded border border-cpDark-700 bg-cpDark-950 p-2 text-white focus-ring"
                  required
                />
              </div>

              {modalError && (
                <div className="rounded border border-rose-800 bg-rose-950 p-3 text-rose-200">
                  {modalError}
                </div>
              )}

              <div className="flex justify-end gap-3 border-t border-cpDark-800 pt-3">
                <button
                  type="button"
                  onClick={() => setReviewTarget(null)}
                  disabled={submitting}
                  className="rounded border border-cpDark-700 bg-cpDark-800 px-4 py-1.5 text-gray-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded bg-amber-600 hover:bg-amber-700 text-white font-bold px-4 py-1.5 flex items-center gap-2"
                >
                  {submitting && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
                  <span>Submit Audit Review</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DETAILS MODAL */}
      {detailsTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm font-mono text-xs">
          <div className="w-full max-w-2xl rounded-lg border border-cpDark-700 bg-cpDark-900 p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-cpDark-800 pb-3">
              <div className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-aravBlue-400" />
                <h3 className="text-base font-bold text-white">Forensic Session Details: {detailsTarget.id}</h3>
              </div>
              <button onClick={() => setDetailsTarget(null)} className="text-gray-400 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4 text-gray-300 bg-cpDark-950 p-4 rounded border border-cpDark-800">
              <div>
                <span className="text-gray-500 block text-[10px] uppercase font-bold">Operation Code</span>
                <span className="font-bold text-rose-300">{detailsTarget.operation}</span>
              </div>
              <div>
                <span className="text-gray-500 block text-[10px] uppercase font-bold">Status</span>
                <div>{renderStatusBadge(detailsTarget.status)}</div>
              </div>
              <div>
                <span className="text-gray-500 block text-[10px] uppercase font-bold">Target Organization</span>
                <span>{detailsTarget.targetOrganizationId || 'N/A'}</span>
              </div>
              <div>
                <span className="text-gray-500 block text-[10px] uppercase font-bold">Target Deployment</span>
                <span>{detailsTarget.targetDeploymentId || 'N/A'}</span>
              </div>
              <div>
                <span className="text-gray-500 block text-[10px] uppercase font-bold">Target Service</span>
                <span>{detailsTarget.targetServiceCode || 'N/A'}</span>
              </div>
              <div>
                <span className="text-gray-500 block text-[10px] uppercase font-bold">Single-Op Emergency</span>
                <span>{detailsTarget.isSingleOperatorEmergency ? 'TRUE (Emergency Mode)' : 'FALSE (2-Op Mode)'}</span>
              </div>
              <div>
                <span className="text-gray-500 block text-[10px] uppercase font-bold">Requester Operator</span>
                <span>{detailsTarget.requesterOperatorName || detailsTarget.requesterOperatorId}</span>
              </div>
              <div>
                <span className="text-gray-500 block text-[10px] uppercase font-bold">Approver Operator</span>
                <span>{detailsTarget.approverOperatorName || detailsTarget.approverOperatorId || 'N/A'}</span>
              </div>
              <div>
                <span className="text-gray-500 block text-[10px] uppercase font-bold">Executor Operator ID</span>
                <span>{detailsTarget.executorOperatorId || 'N/A'}</span>
              </div>
              <div>
                <span className="text-gray-500 block text-[10px] uppercase font-bold">Post-Event Review</span>
                <div>{renderReviewBadge(detailsTarget.postEventReviewStatus || undefined)}</div>
              </div>
              <div>
                <span className="text-gray-500 block text-[10px] uppercase font-bold">Created At</span>
                <span>{new Date(detailsTarget.createdAt).toLocaleString()}</span>
              </div>
              <div>
                <span className="text-gray-500 block text-[10px] uppercase font-bold">Expires At</span>
                <span>{new Date(detailsTarget.expiresAt).toLocaleString()}</span>
              </div>
            </div>

            <div className="space-y-2">
              <span className="text-gray-400 font-bold block">Operational Reason:</span>
              <div className="p-3 bg-cpDark-950 border border-cpDark-800 rounded text-gray-200">
                {detailsTarget.reason}
              </div>
            </div>

            {detailsTarget.postEventNotes && (
              <div className="space-y-2">
                <span className="text-gray-400 font-bold block">Post-Event Reviewer Notes:</span>
                <div className="p-3 bg-cpDark-950 border border-cpDark-800 rounded text-amber-300">
                  {detailsTarget.postEventNotes}
                </div>
              </div>
            )}

            <div className="flex justify-end border-t border-cpDark-800 pt-3">
              <button
                onClick={() => setDetailsTarget(null)}
                className="rounded border border-cpDark-700 bg-cpDark-800 px-4 py-1.5 text-gray-300 hover:text-white"
              >
                Close Details
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
