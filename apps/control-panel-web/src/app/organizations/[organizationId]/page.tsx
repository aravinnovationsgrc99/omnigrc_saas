'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  Building2,
  ArrowLeft,
  RefreshCw,
  Shield,
  Activity,
  CreditCard,
  Server,
  History,
  AlertTriangle,
  PlayCircle,
  PauseCircle,
  Ban,
  Trash2,
  Info,
  CheckCircle2,
  Lock,
  Clock,
} from 'lucide-react';
import { useAuth } from '../../../lib/auth-context';
import {
  controlPlaneApi,
  ControlPlaneApiError,
} from '../../../lib/control-plane-api';
import {
  OrganizationControlState,
  OrganizationStateTransitionLog,
  ControlState,
  DeploymentSummary,
  LicenseSummary,
  TransitionResponse,
} from '../../../types/control-plane';
import { StatusBadge } from '../../../components/ui/status-badge';
import { ConfirmationDialog } from '../../../components/ui/confirmation-dialog';
import { ErrorState } from '../../../components/ui/error-state';
import { AccessDenied } from '../../../components/ui/access-denied';

export default function OrganizationDetailPage() {
  const params = useParams();
  const router = useRouter();
  const organizationId = decodeURIComponent((params.organizationId as string) || '');

  const { operator, isAuthenticated, isLoading: isAuthLoading } = useAuth();

  const [orgState, setOrgState] = useState<OrganizationControlState | null>(null);
  const [history, setHistory] = useState<OrganizationStateTransitionLog[]>([]);
  const [deployments, setDeployments] = useState<DeploymentSummary[]>([]);
  const [licenses, setLicenses] = useState<LicenseSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<ControlPlaneApiError | null>(null);

  // Transition Modal State
  const [targetState, setTargetState] = useState<ControlState | null>(null);
  const [isSubmittingTransition, setIsSubmittingTransition] = useState(false);
  const [transitionError, setTransitionError] = useState<string | null>(null);
  const [lastAuditResult, setLastAuditResult] = useState<TransitionResponse | null>(null);

  const canMutate =
    operator?.role === 'PLATFORM_SUPER_ADMIN' ||
    operator?.role === 'OPERATIONS_ENGINEER';

  const fetchData = useCallback(async () => {
    if (!organizationId) return;
    setIsLoading(true);
    setError(null);

    try {
      const [stateData, historyData, depsData, licData] = await Promise.all([
        controlPlaneApi.getOrganization(organizationId),
        controlPlaneApi.getOrganizationHistory(organizationId).catch(() => []),
        controlPlaneApi.listDeployments(organizationId).catch(() => []),
        controlPlaneApi.listLicenses().catch(() => []),
      ]);

      setOrgState(stateData);
      setHistory(historyData || []);
      setDeployments(depsData || []);
      setLicenses(licData || []);
    } catch (err: any) {
      if (err instanceof ControlPlaneApiError) {
        setError(err);
      } else {
        setError(
          new ControlPlaneApiError(
            500,
            err.message || `Failed to fetch record for organization ${organizationId}`,
          ),
        );
      }
    } finally {
      setIsLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    if (!isAuthLoading && isAuthenticated) {
      fetchData();
    }
  }, [isAuthLoading, isAuthenticated, fetchData]);

  if (isAuthLoading || (isLoading && !orgState && !error)) {
    return (
      <div className="flex h-64 items-center justify-center">
        <RefreshCw className="h-6 w-6 animate-spin text-aravBlue-400" />
      </div>
    );
  }

  if (error && error.statusCode === 403) {
    return (
      <AccessDenied
        resource={`Organization ${organizationId}`}
        requiredRole="Authorized Control Plane Operator"
      />
    );
  }

  if (error && error.statusCode === 404) {
    return (
      <div className="space-y-4">
        <Link
          href="/organizations"
          className="inline-flex items-center gap-1.5 text-xs text-aravBlue-400 hover:underline"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>Back to Organizations</span>
        </Link>
        <div className="rounded-lg border border-cpDark-800 bg-cpDark-900 p-8 text-center">
          <Building2 className="mx-auto h-10 w-10 text-gray-500" />
          <h2 className="mt-2 text-lg font-bold text-white">Organization Not Discovered</h2>
          <p className="mt-1 text-xs text-gray-400">
            No Control Plane record exists for organization ID &quot;{organizationId}&quot;.
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <Link
          href="/organizations"
          className="inline-flex items-center gap-1.5 text-xs text-aravBlue-400 hover:underline"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>Back to Organizations</span>
        </Link>
        <ErrorState
          statusCode={error.statusCode}
          title="Failed to load organization detail"
          message={error.message}
          correlationId={error.correlationId}
          onRetry={fetchData}
        />
      </div>
    );
  }

  if (!orgState) return null;

  // Correlate deployment and license metadata
  const primaryDeployment = deployments.length > 0 ? deployments[0] : null;
  const associatedLicense = primaryDeployment?.licenseId
    ? licenses.find((l) => l.id === primaryDeployment.licenseId)
    : null;

  const handleOpenTransitionModal = (target: ControlState) => {
    setTargetState(target);
    setTransitionError(null);
  };

  const handleCloseModal = () => {
    setTargetState(null);
    setTransitionError(null);
  };

  const handleExecuteTransition = async (reason?: string) => {
    if (!targetState || !reason) return;
    setIsSubmittingTransition(true);
    setTransitionError(null);

    const idempotencyKey = `transition_detail_${organizationId}_${targetState}_${Date.now()}`;

    try {
      const res = await controlPlaneApi.transitionOrganizationState(organizationId, {
        targetState,
        reason,
        idempotencyKey,
      });
      setLastAuditResult(res);
      handleCloseModal();
      await fetchData();
    } catch (err: any) {
      if (err instanceof ControlPlaneApiError) {
        setTransitionError(err.message || `Transition failed (${err.statusCode})`);
      } else {
        setTransitionError(err.message || 'An unexpected error occurred during state transition.');
      }
    } finally {
      setIsSubmittingTransition(false);
    }
  };

  const getModalProps = () => {
    if (!targetState) {
      return {
        title: '',
        explanation: '',
        consequence: '',
        confirmPhrase: undefined,
        confirmVariant: 'danger' as const,
        confirmButtonText: 'Confirm',
      };
    }

    const currentState = orgState.state;

    switch (targetState) {
      case 'SUSPENDED':
        return {
          title: `Suspend Organization ${organizationId}`,
          explanation: `Transitioning state from [${currentState}] to [SUSPENDED]. Operations will enter a read-only state across Control Plane and Data Plane services.`,
          consequence: 'Write operations will be rejected. Read-only metadata remains accessible.',
          confirmPhrase: undefined,
          confirmVariant: 'warning' as const,
          confirmButtonText: 'Suspend Organization',
        };

      case 'DISABLED':
        return {
          title: `Disable Organization ${organizationId}`,
          explanation: `HIGH-RISK ACTION: Transitioning state from [${currentState}] to [DISABLED]. All Data Plane service endpoints will be BLOCKED for this organization.`,
          consequence: 'Access will be denied at the Data Plane API boundary. Authenticated propagation signals will be sent to Data Plane.',
          confirmPhrase: `DISABLE ${organizationId}`,
          confirmVariant: 'danger' as const,
          confirmButtonText: 'Disable Organization',
        };

      case 'ACTIVE':
        return {
          title: `Reactivate Organization ${organizationId}`,
          explanation: `Transitioning state from [${currentState}] to [ACTIVE]. Normal Control Plane operational state will be restored.`,
          consequence: 'IMPORTANT: Organization control state and Commercial License state are separate. Reactivating organization state does NOT alter commercial license status.',
          confirmPhrase: undefined,
          confirmVariant: 'primary' as const,
          confirmButtonText: 'Reactivate Organization',
        };

      case 'DECOMMISSIONED':
        return {
          title: `Decommission Organization ${organizationId}`,
          explanation: `TERMINAL STATE TRANSITION: Decommissioning organization ${organizationId}.`,
          consequence: 'This action cannot be reversed. Organization will remain in terminal read-only state.',
          confirmPhrase: `DECOMMISSION ${organizationId}`,
          confirmVariant: 'danger' as const,
          confirmButtonText: 'Decommission Organization',
        };

      default:
        return {
          title: `Transition Organization State`,
          explanation: `Transitioning state to ${targetState}.`,
          consequence: '',
          confirmPhrase: undefined,
          confirmVariant: 'danger' as const,
          confirmButtonText: 'Confirm',
        };
    }
  };

  const modalProps = getModalProps();

  return (
    <div className="space-y-6">
      {/* Navigation link */}
      <div>
        <Link
          href="/organizations"
          className="inline-flex items-center gap-1.5 text-xs text-aravBlue-400 hover:underline"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>Back to Organizations List</span>
        </Link>
      </div>

      {/* Header Banner */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between rounded-lg border border-cpDark-800 bg-cpDark-900 p-6 shadow-xl">
        <div className="flex items-center gap-4">
          <div className="rounded-lg bg-aravBlue-950/80 p-3 border border-aravBlue-800/60 text-aravBlue-400">
            <Building2 className="h-8 w-8" aria-hidden="true" />
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-bold font-mono text-white">
                {orgState.organizationId}
              </h1>
              <StatusBadge status={orgState.state} />
            </div>
            <p className="mt-1 text-xs text-gray-400 font-mono">
              Control Sequence: #{orgState.sequence} &bull; Updated: {new Date(orgState.updatedAt).toLocaleString()}
            </p>
          </div>
        </div>

        {/* Header Action Buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => fetchData()}
            disabled={isLoading}
            className="inline-flex items-center gap-1.5 rounded-md border border-cpDark-700 bg-cpDark-800 px-3 py-1.5 text-xs font-medium text-gray-300 hover:bg-cpDark-700 hover:text-white focus-ring"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} aria-hidden="true" />
            <span>Refetch</span>
          </button>

          {canMutate && orgState.state === 'PENDING' && (
            <>
              <button
                onClick={() => handleOpenTransitionModal('ACTIVE')}
                className="inline-flex items-center gap-1.5 rounded-md bg-emerald-950/80 border border-emerald-800 text-emerald-300 px-3 py-1.5 text-xs font-semibold hover:bg-emerald-900 focus-ring"
              >
                <PlayCircle className="h-3.5 w-3.5" />
                <span>Activate</span>
              </button>
              <button
                onClick={() => handleOpenTransitionModal('DISABLED')}
                className="inline-flex items-center gap-1.5 rounded-md bg-rose-950/80 border border-rose-800 text-rose-300 px-3 py-1.5 text-xs font-semibold hover:bg-rose-900 focus-ring"
              >
                <Ban className="h-3.5 w-3.5" />
                <span>Disable</span>
              </button>
            </>
          )}

          {canMutate && orgState.state === 'ACTIVE' && (
            <>
              <button
                onClick={() => handleOpenTransitionModal('SUSPENDED')}
                className="inline-flex items-center gap-1.5 rounded-md bg-amber-950/80 border border-amber-800 text-amber-300 px-3 py-1.5 text-xs font-semibold hover:bg-amber-900 focus-ring"
              >
                <PauseCircle className="h-3.5 w-3.5" />
                <span>Suspend</span>
              </button>
              <button
                onClick={() => handleOpenTransitionModal('DISABLED')}
                className="inline-flex items-center gap-1.5 rounded-md bg-rose-950/80 border border-rose-800 text-rose-300 px-3 py-1.5 text-xs font-semibold hover:bg-rose-900 focus-ring"
              >
                <Ban className="h-3.5 w-3.5" />
                <span>Disable</span>
              </button>
            </>
          )}

          {canMutate && orgState.state === 'SUSPENDED' && (
            <>
              <button
                onClick={() => handleOpenTransitionModal('ACTIVE')}
                className="inline-flex items-center gap-1.5 rounded-md bg-emerald-950/80 border border-emerald-800 text-emerald-300 px-3 py-1.5 text-xs font-semibold hover:bg-emerald-900 focus-ring"
              >
                <PlayCircle className="h-3.5 w-3.5" />
                <span>Reactivate</span>
              </button>
              <button
                onClick={() => handleOpenTransitionModal('DISABLED')}
                className="inline-flex items-center gap-1.5 rounded-md bg-rose-950/80 border border-rose-800 text-rose-300 px-3 py-1.5 text-xs font-semibold hover:bg-rose-900 focus-ring"
              >
                <Ban className="h-3.5 w-3.5" />
                <span>Disable</span>
              </button>
            </>
          )}

          {canMutate && orgState.state === 'DISABLED' && (
            <>
              <button
                onClick={() => handleOpenTransitionModal('ACTIVE')}
                className="inline-flex items-center gap-1.5 rounded-md bg-emerald-950/80 border border-emerald-800 text-emerald-300 px-3 py-1.5 text-xs font-semibold hover:bg-emerald-900 focus-ring"
              >
                <PlayCircle className="h-3.5 w-3.5" />
                <span>Reactivate</span>
              </button>
              <button
                onClick={() => handleOpenTransitionModal('DECOMMISSIONED')}
                className="inline-flex items-center gap-1.5 rounded-md bg-slate-900 border border-slate-700 text-slate-300 px-3 py-1.5 text-xs font-semibold hover:bg-slate-800 focus-ring"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>Decommission</span>
              </button>
            </>
          )}

          {orgState.state === 'DECOMMISSIONED' && (
            <span className="rounded bg-slate-900 border border-slate-700 px-3 py-1 text-xs text-slate-400 font-mono">
              Terminal State
            </span>
          )}
        </div>
      </div>

      {/* Audit Result Notification */}
      {lastAuditResult && (
        <div className="rounded-lg border border-emerald-800/80 bg-emerald-950/40 p-4 text-xs text-emerald-200 flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold text-white block mb-1">
                Lifecycle Transition Completed
              </span>
              <div className="space-y-0.5 font-mono text-[11px] text-emerald-300">
                <div>State: <span className="text-white">{lastAuditResult.previousState || 'UNKNOWN'}</span> &rarr; <span className="text-emerald-400 font-bold">{lastAuditResult.state}</span> (Sequence #{lastAuditResult.sequence})</div>
                <div>Reason: <span className="text-white">&quot;{lastAuditResult.reason}&quot;</span></div>
                {lastAuditResult.propagation && (
                  <div className="mt-1 flex items-center gap-2 border-t border-emerald-800/40 pt-1">
                    <span>M2M Signal Propagation:</span>
                    <span className={`px-1.5 py-0.5 rounded font-bold ${lastAuditResult.propagation.status === 'DELIVERED' ? 'bg-emerald-900 text-emerald-300' : 'bg-amber-900 text-amber-300'}`}>
                      {lastAuditResult.propagation.status}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
          <button onClick={() => setLastAuditResult(null)} className="text-gray-400 hover:text-white">&times;</button>
        </div>
      )}

      {/* Grid of Sections */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">

        {/* Section 1: Identity & Control Record */}
        <div className="rounded-lg border border-cpDark-800 bg-cpDark-900 p-5 space-y-4">
          <div className="flex items-center gap-2 border-b border-cpDark-800 pb-3">
            <Shield className="h-4 w-4 text-aravBlue-400" />
            <h2 className="text-sm font-bold text-white uppercase tracking-wider">
              1. Identity &amp; Control Record
            </h2>
          </div>

          <div className="space-y-3 font-mono text-xs">
            <div className="flex justify-between border-b border-cpDark-800/50 pb-2">
              <span className="text-gray-400">Organization ID</span>
              <span className="text-white font-bold">{orgState.organizationId}</span>
            </div>
            <div className="flex justify-between border-b border-cpDark-800/50 pb-2">
              <span className="text-gray-400">Control Record ID</span>
              <span className="text-gray-300 text-[11px]">{orgState.id}</span>
            </div>
            <div className="flex justify-between border-b border-cpDark-800/50 pb-2">
              <span className="text-gray-400">Created At</span>
              <span className="text-gray-300">{new Date(orgState.createdAt).toLocaleString()}</span>
            </div>
            <div className="flex justify-between border-b border-cpDark-800/50 pb-2">
              <span className="text-gray-400">Last Updated At</span>
              <span className="text-gray-300">{new Date(orgState.updatedAt).toLocaleString()}</span>
            </div>
            <div className="flex justify-between border-b border-cpDark-800/50 pb-2">
              <span className="text-gray-400">Updated By Operator ID</span>
              <span className="text-aravBlue-400">{orgState.updatedByOperatorId || 'System / Auto Provisioned'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">MSSP / Hierarchy</span>
              <span className="text-gray-300">Standalone Organization Record</span>
            </div>
          </div>
        </div>

        {/* Section 2: Lifecycle & State Machine */}
        <div className="rounded-lg border border-cpDark-800 bg-cpDark-900 p-5 space-y-4">
          <div className="flex items-center gap-2 border-b border-cpDark-800 pb-3">
            <Activity className="h-4 w-4 text-aravBlue-400" />
            <h2 className="text-sm font-bold text-white uppercase tracking-wider">
              2. Lifecycle &amp; State Semantics
            </h2>
          </div>

          <div className="space-y-3 font-mono text-xs">
            <div className="flex justify-between items-center border-b border-cpDark-800/50 pb-2">
              <span className="text-gray-400">Current Control State</span>
              <StatusBadge status={orgState.state} />
            </div>
            <div className="flex justify-between border-b border-cpDark-800/50 pb-2">
              <span className="text-gray-400">State Sequence</span>
              <span className="text-amber-400 font-bold">#{orgState.sequence}</span>
            </div>
            <div className="border-b border-cpDark-800/50 pb-2">
              <span className="text-gray-400 block mb-1">State Reason</span>
              <span className="text-white italic bg-cpDark-950 p-2 rounded block border border-cpDark-800 text-[11px]">
                &quot;{orgState.reason}&quot;
              </span>
            </div>

            {/* Allowed transitions based on CP-2 Legal Transition Matrix */}
            <div>
              <span className="text-gray-400 block mb-1 text-[11px]">CP-2 Legal Next Transitions:</span>
              <div className="flex items-center gap-2">
                {orgState.state === 'PENDING' && (
                  <>
                    <span className="px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800 text-[11px]">ACTIVE</span>
                    <span className="px-2 py-0.5 rounded bg-rose-950 text-rose-300 border border-rose-800 text-[11px]">DISABLED</span>
                  </>
                )}
                {orgState.state === 'ACTIVE' && (
                  <>
                    <span className="px-2 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-800 text-[11px]">SUSPENDED</span>
                    <span className="px-2 py-0.5 rounded bg-rose-950 text-rose-300 border border-rose-800 text-[11px]">DISABLED</span>
                  </>
                )}
                {orgState.state === 'SUSPENDED' && (
                  <>
                    <span className="px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800 text-[11px]">ACTIVE</span>
                    <span className="px-2 py-0.5 rounded bg-rose-950 text-rose-300 border border-rose-800 text-[11px]">DISABLED</span>
                  </>
                )}
                {orgState.state === 'DISABLED' && (
                  <>
                    <span className="px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800 text-[11px]">ACTIVE</span>
                    <span className="px-2 py-0.5 rounded bg-slate-900 text-slate-300 border border-slate-700 text-[11px]">DECOMMISSIONED</span>
                  </>
                )}
                {orgState.state === 'DECOMMISSIONED' && (
                  <span className="text-slate-500 italic text-[11px]">None (Terminal state)</span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Section 3: Commercial Summary Separation */}
        <div className="rounded-lg border border-cpDark-800 bg-cpDark-900 p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-cpDark-800 pb-3">
            <div className="flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-aravBlue-400" />
              <h2 className="text-sm font-bold text-white uppercase tracking-wider">
                3. Commercial Summary
              </h2>
            </div>
            <span className="text-[10px] text-gray-400 border border-cpDark-700 px-2 py-0.5 rounded font-mono">
              READ-ONLY SEPARATION
            </span>
          </div>

          <div className="space-y-3 font-mono text-xs">
            <div className="flex justify-between items-center border-b border-cpDark-800/50 pb-2">
              <span className="text-gray-400">Commercial License Status</span>
              {associatedLicense ? (
                <StatusBadge status={associatedLicense.status} />
              ) : (
                <span className="text-gray-500 italic">No Active License Record</span>
              )}
            </div>
            {associatedLicense && (
              <>
                <div className="flex justify-between border-b border-cpDark-800/50 pb-2">
                  <span className="text-gray-400">Product Code</span>
                  <span className="text-white">{associatedLicense.product}</span>
                </div>
                <div className="flex justify-between border-b border-cpDark-800/50 pb-2">
                  <span className="text-gray-400">License Sequence</span>
                  <span className="text-gray-300">#{associatedLicense.sequence}</span>
                </div>
                <div className="flex justify-between border-b border-cpDark-800/50 pb-2">
                  <span className="text-gray-400">License Starts At</span>
                  <span className="text-gray-300">{new Date(associatedLicense.startsAt).toLocaleDateString()}</span>
                </div>
                <div className="flex justify-between border-b border-cpDark-800/50 pb-2">
                  <span className="text-gray-400">License Expires At</span>
                  <span className="text-gray-300">{new Date(associatedLicense.expiresAt).toLocaleDateString()}</span>
                </div>
              </>
            )}

            <div className="rounded bg-aravBlue-950/30 border border-aravBlue-900/40 p-2.5 text-[11px] text-gray-300 font-sans flex items-start gap-2">
              <Lock className="h-4 w-4 text-aravBlue-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold text-aravBlue-300 block mb-0.5">Commercial Authority Invariant</span>
                Organization lifecycle state (ACTIVE/SUSPENDED/DISABLED) is strictly separate from Commercial License authority. Commercial mutations require separate Licensing Authority controls.
              </div>
            </div>
          </div>
        </div>

        {/* Section 4: Operational & Propagation State */}
        <div className="rounded-lg border border-cpDark-800 bg-cpDark-900 p-5 space-y-4">
          <div className="flex items-center gap-2 border-b border-cpDark-800 pb-3">
            <Server className="h-4 w-4 text-aravBlue-400" />
            <h2 className="text-sm font-bold text-white uppercase tracking-wider">
              4. Operational &amp; Data Plane Projection
            </h2>
          </div>

          <div className="space-y-3 font-mono text-xs">
            <div className="flex justify-between items-center border-b border-cpDark-800/50 pb-2">
              <span className="text-gray-400">Control Plane State</span>
              <StatusBadge status={orgState.state} />
            </div>
            <div className="flex justify-between items-center border-b border-cpDark-800/50 pb-2">
              <span className="text-gray-400">Data Plane Projection</span>
              {primaryDeployment ? (
                <span className="text-emerald-300 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800/60">
                  {primaryDeployment.activationState} (Seq #{orgState.sequence})
                </span>
              ) : (
                <span className="text-amber-400 bg-amber-950/60 px-2 py-0.5 rounded border border-amber-800/60">
                  Propagation Pending / Unregistered
                </span>
              )}
            </div>
            {primaryDeployment && (
              <>
                <div className="flex justify-between border-b border-cpDark-800/50 pb-2">
                  <span className="text-gray-400">Deployment Model</span>
                  <span className="text-white">{primaryDeployment.deploymentModel}</span>
                </div>
                <div className="flex justify-between border-b border-cpDark-800/50 pb-2">
                  <span className="text-gray-400">Environment</span>
                  <span className="text-gray-300">{primaryDeployment.environment}</span>
                </div>
                <div className="flex justify-between border-b border-cpDark-800/50 pb-2">
                  <span className="text-gray-400">Version</span>
                  <span className="text-gray-300">v{primaryDeployment.version}</span>
                </div>
                <div className="flex justify-between border-b border-cpDark-800/50 pb-2">
                  <span className="text-gray-400">Last Check-In</span>
                  <span className="text-gray-300">
                    {primaryDeployment.lastCheckInAt
                      ? new Date(primaryDeployment.lastCheckInAt).toLocaleString()
                      : 'Never'}
                  </span>
                </div>
              </>
            )}
          </div>
        </div>

      </div>

      {/* Section 5: Organization State Transition Audit History */}
      <div className="rounded-lg border border-cpDark-800 bg-cpDark-900 p-5 space-y-4 shadow-xl">
        <div className="flex items-center justify-between border-b border-cpDark-800 pb-3">
          <div className="flex items-center gap-2">
            <History className="h-5 w-5 text-aravBlue-400" />
            <h2 className="text-sm font-bold text-white uppercase tracking-wider">
              5. Organization Lifecycle State Transition History
            </h2>
          </div>
          <span className="text-xs text-gray-400 font-mono">
            {history.length} audit record(s)
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-cpDark-800 bg-cpDark-950 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
              <tr>
                <th scope="col" className="px-4 py-2.5">Seq</th>
                <th scope="col" className="px-4 py-2.5">State Transition</th>
                <th scope="col" className="px-4 py-2.5">Operational Audit Reason</th>
                <th scope="col" className="px-4 py-2.5">Operator</th>
                <th scope="col" className="px-4 py-2.5">Role</th>
                <th scope="col" className="px-4 py-2.5">Timestamp</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-cpDark-800/60 font-mono text-gray-300">
              {history.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-gray-500 italic">
                    No state transitions logged for this organization record yet.
                  </td>
                </tr>
              ) : (
                history.map((log) => (
                  <tr key={log.id} className="hover:bg-cpDark-800/40">
                    <td className="px-4 py-2.5 font-bold text-amber-400">
                      #{log.sequence}
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <StatusBadge status={log.previousState} size="sm" />
                        <span className="text-gray-500">&rarr;</span>
                        <StatusBadge status={log.newState} size="sm" />
                      </div>
                    </td>
                    <td className="px-4 py-2.5 max-w-xs truncate text-gray-200" title={log.reason}>
                      &quot;{log.reason}&quot;
                    </td>
                    <td className="px-4 py-2.5 text-aravBlue-400">
                      {log.operatorId}
                    </td>
                    <td className="px-4 py-2.5 text-gray-400 text-[11px]">
                      {log.operatorRole}
                    </td>
                    <td className="px-4 py-2.5 text-gray-400 text-[11px]">
                      {new Date(log.createdAt).toLocaleString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Confirmation Dialog for State Transitions */}
      <ConfirmationDialog
        isOpen={!!targetState}
        title={modalProps.title}
        explanation={modalProps.explanation}
        consequence={modalProps.consequence}
        confirmationPhrase={modalProps.confirmPhrase}
        reasonRequired={true}
        confirmButtonText={modalProps.confirmButtonText}
        confirmVariant={modalProps.confirmVariant}
        isLoading={isSubmittingTransition}
        errorMessage={transitionError}
        onConfirm={handleExecuteTransition}
        onCancel={handleCloseModal}
      />
    </div>
  );
}
