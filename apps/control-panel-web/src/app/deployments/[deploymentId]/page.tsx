'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  Server,
  ArrowLeft,
  RefreshCw,
  Building2,
  CreditCard,
  Activity,
  ShieldAlert,
  Clock,
  CheckCircle2,
  AlertTriangle,
  History,
  Key,
  ExternalLink,
  PauseCircle,
  PlayCircle,
  Ban,
  Info,
  Layers,
} from 'lucide-react';
import { useAuth } from '../../../lib/auth-context';
import { controlPlaneApi, ControlPlaneApiError } from '../../../lib/control-plane-api';
import {
  DeploymentSummary,
  CommercialAuditLog,
  OrganizationControlState,
  SignedLicenseArtifact,
  LicenseDto,
} from '../../../types/control-plane';
import { StatusBadge } from '../../../components/ui/status-badge';
import { ErrorState } from '../../../components/ui/error-state';
import { AccessDenied } from '../../../components/ui/access-denied';
import { ConfirmationDialog } from '../../../components/ui/confirmation-dialog';

export default function DeploymentDetailPage() {
  const params = useParams();
  const deploymentId = params.deploymentId as string;
  const { operator, isAuthenticated, isLoading: isAuthLoading } = useAuth();

  const [deployment, setDeployment] = useState<DeploymentSummary | null>(null);
  const [history, setHistory] = useState<CommercialAuditLog[]>([]);
  const [orgState, setOrgState] = useState<OrganizationControlState | null>(null);
  const [license, setLicense] = useState<LicenseDto | null>(null);
  const [signedArtifact, setSignedArtifact] = useState<SignedLicenseArtifact | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<ControlPlaneApiError | null>(null);

  // State Mutation Modal
  const [actionType, setActionType] = useState<'SUSPEND' | 'REACTIVATE' | 'DECOMMISSION' | null>(null);
  const [isSubmittingAction, setIsSubmittingAction] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const canMutate =
    operator?.role === 'PLATFORM_SUPER_ADMIN' ||
    operator?.role === 'OPERATIONS_ENGINEER';

  const fetchData = useCallback(async () => {
    if (!deploymentId) return;
    setIsLoading(true);
    setError(null);

    try {
      const depData = await controlPlaneApi.getDeployment(deploymentId);
      setDeployment(depData);

      const [histData, orgData, artifactData, licData] = await Promise.all([
        controlPlaneApi.getDeploymentHistory(deploymentId).catch(() => []),
        controlPlaneApi.getOrganization(depData.organizationId).catch(() => null),
        controlPlaneApi.getDeploymentLicenseArtifact(deploymentId).catch(() => null),
        depData.licenseId ? controlPlaneApi.getLicense(depData.licenseId).catch(() => null) : Promise.resolve(null),
      ]);

      setHistory(histData || []);
      setOrgState(orgData);
      setSignedArtifact(artifactData);
      setLicense(licData);
    } catch (err: any) {
      if (err instanceof ControlPlaneApiError) {
        setError(err);
      } else {
        setError(
          new ControlPlaneApiError(
            500,
            err.message || `Failed to fetch deployment ${deploymentId}`,
          ),
        );
      }
    } finally {
      setIsLoading(false);
    }
  }, [deploymentId]);

  useEffect(() => {
    if (isAuthenticated && deploymentId) {
      fetchData();
    }
  }, [isAuthenticated, deploymentId, fetchData]);

  const handleExecuteStateAction = async (reason?: string) => {
    if (!actionType || !deployment) return;
    setIsSubmittingAction(true);
    setActionError(null);

    const targetStateMap = {
      SUSPEND: 'SUSPENDED',
      REACTIVATE: 'ACTIVE',
      DECOMMISSION: 'DECOMMISSIONED',
    };

    const target = targetStateMap[actionType];

    try {
      await controlPlaneApi.updateDeploymentState(deploymentId, target, reason);
      setActionType(null);
      await fetchData();
    } catch (err: any) {
      setActionError(err.message || 'State action failed');
    } finally {
      setIsSubmittingAction(false);
    }
  };

  if (isAuthLoading || (isLoading && !deployment && !error)) {
    return (
      <div className="flex h-64 items-center justify-center">
        <RefreshCw className="h-6 w-6 animate-spin text-aravBlue-400" />
      </div>
    );
  }

  if (error && error.statusCode === 403) {
    return (
      <AccessDenied
        resource={`Deployment ${deploymentId}`}
        requiredRole="Authorized Operations Engineer / Platform Super Admin"
      />
    );
  }

  if (error && error.statusCode === 404) {
    return (
      <div className="space-y-4">
        <Link
          href="/deployments"
          className="inline-flex items-center gap-1.5 text-xs text-aravBlue-400 hover:underline font-mono"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>Back to Deployment Inventory</span>
        </Link>
        <div className="rounded-lg border border-cpDark-800 bg-cpDark-900 p-8 text-center">
          <Server className="mx-auto h-10 w-10 text-gray-500" />
          <h2 className="mt-2 text-lg font-bold text-white font-mono">Deployment Not Discovered</h2>
          <p className="mt-1 text-xs text-gray-400 font-mono">
            No operational deployment record exists for ID &quot;{deploymentId}&quot;.
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <Link
          href="/deployments"
          className="inline-flex items-center gap-1.5 text-xs text-aravBlue-400 hover:underline font-mono"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>Back to Deployment Inventory</span>
        </Link>
        <ErrorState
          statusCode={error.statusCode}
          title="Failed to load deployment detail"
          message={error.message}
          correlationId={error.correlationId}
          onRetry={fetchData}
        />
      </div>
    );
  }

  if (!deployment) return null;

  // Check-In Health calculation
  const getCheckInHealth = (lastCheckInAt?: string | null) => {
    if (!lastCheckInAt) return { label: 'Never Checked In', isHealthy: false, diffMins: null };
    const diffMs = new Date().getTime() - new Date(lastCheckInAt).getTime();
    const diffMins = diffMs / (1000 * 60);
    return {
      label: diffMins <= 5 ? `Healthy (${Math.round(diffMins)}m ago)` : `Stale (${Math.round(diffMins)}m ago)`,
      isHealthy: diffMins <= 5,
      diffMins,
    };
  };

  const health = getCheckInHealth(deployment.lastCheckInAt);

  // Organization Precedence Dominance Flag
  const isOrgBlocked = orgState && (orgState.state === 'DISABLED' || orgState.state === 'DECOMMISSIONED' || orgState.state === 'SUSPENDED');

  // Data Plane Convergence Status
  const getConvergenceStatus = () => {
    if (isOrgBlocked) {
      return { label: `BLOCKED (Org State: ${orgState?.state})`, variant: 'rose' as const };
    }
    if (deployment.activationState === 'SUSPENDED' || deployment.activationState === 'DECOMMISSIONED') {
      return { label: `BLOCKED (Deployment: ${deployment.activationState})`, variant: 'amber' as const };
    }
    if (health.isHealthy && deployment.activationState === 'ACTIVE') {
      return { label: 'CONFIRMED (Active Check-In Verified)', variant: 'emerald' as const };
    }
    return { label: 'PENDING CONVERGENCE (Awaiting Next Check-In)', variant: 'amber' as const };
  };

  const convergence = getConvergenceStatus();

  return (
    <div className="space-y-6">
      {/* Navigation link */}
      <div>
        <Link
          href="/deployments"
          className="inline-flex items-center gap-1.5 text-xs text-aravBlue-400 hover:underline font-mono"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>Back to Operational Deployment Inventory</span>
        </Link>
      </div>

      {/* Header Banner */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between rounded-lg border border-cpDark-800 bg-cpDark-900 p-6 shadow-xl">
        <div className="flex items-center gap-4">
          <div className="rounded-lg bg-aravBlue-950/80 p-3 border border-aravBlue-800/60 text-aravBlue-400">
            <Server className="h-8 w-8" aria-hidden="true" />
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-bold font-mono text-white">{deployment.id}</h1>
              <StatusBadge status={deployment.activationState} />
            </div>
            <p className="mt-1 text-xs text-gray-400 font-mono">
              Model: <span className="text-white font-bold">{deployment.deploymentModel}</span> &bull; Environment: <span className="text-white font-bold">{deployment.environment}</span> &bull; Owner: <span className="text-emerald-400 font-bold">{deployment.infrastructureOwner}</span>
            </p>
          </div>
        </div>

        {/* Action Header Buttons */}
        {canMutate && deployment.activationState !== 'DECOMMISSIONED' && (
          <div className="flex items-center gap-2">
            {deployment.activationState === 'ACTIVE' && (
              <button
                onClick={() => setActionType('SUSPEND')}
                className="inline-flex items-center gap-1.5 rounded bg-amber-950/80 border border-amber-800 text-amber-300 px-3 py-1.5 text-xs font-semibold hover:bg-amber-900 focus-ring"
              >
                <PauseCircle className="h-3.5 w-3.5" />
                <span>Suspend</span>
              </button>
            )}

            {deployment.activationState === 'SUSPENDED' && (
              <button
                onClick={() => setActionType('REACTIVATE')}
                className="inline-flex items-center gap-1.5 rounded bg-emerald-950/80 border border-emerald-800 text-emerald-300 px-3 py-1.5 text-xs font-semibold hover:bg-emerald-900 focus-ring"
              >
                <PlayCircle className="h-3.5 w-3.5" />
                <span>Reactivate</span>
              </button>
            )}

            <button
              onClick={() => setActionType('DECOMMISSION')}
              className="inline-flex items-center gap-1.5 rounded bg-rose-950/80 border border-rose-800 text-rose-300 px-3 py-1.5 text-xs font-semibold hover:bg-rose-900 focus-ring"
            >
              <Ban className="h-3.5 w-3.5" />
              <span>Decommission</span>
            </button>
          </div>
        )}
      </div>

      {/* Organization Dominance Warning Banner */}
      {isOrgBlocked && (
        <div className="rounded-lg border border-rose-800 bg-rose-950/90 p-4 text-xs font-mono text-rose-200 flex items-start gap-3 shadow-lg">
          <ShieldAlert className="h-5 w-5 text-rose-400 shrink-0 mt-0.5" />
          <div>
            <span className="font-bold text-white block uppercase tracking-wider mb-1">
              ORGANIZATION CONTROL STATE PRECEDENCE OVERRIDE
            </span>
            Target organization <span className="font-bold text-amber-300">{deployment.organizationId}</span> control state is currently <span className="font-bold underline">{orgState?.state}</span>. Organization lifecycle control strictly dominates deployment operational state. All Data Plane operations for this deployment remain <span className="font-bold underline">BLOCKED</span> until organization state is reactivated.
          </div>
        </div>
      )}

      {/* Overview Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Section 1: Deployment Identity & Metadata */}
        <div className="rounded-lg border border-cpDark-800 bg-cpDark-900 p-5 space-y-4 shadow-xl">
          <div className="flex items-center gap-2 border-b border-cpDark-800 pb-3">
            <Server className="h-5 w-5 text-aravBlue-400" />
            <h2 className="text-sm font-bold text-white uppercase tracking-wider">
              1. Identity &amp; Infrastructure Metadata
            </h2>
          </div>

          <div className="space-y-3 font-mono text-xs">
            <div className="flex justify-between border-b border-cpDark-800/50 pb-2">
              <span className="text-gray-400">Deployment ID</span>
              <span className="text-white font-bold">{deployment.id}</span>
            </div>
            <div className="flex justify-between border-b border-cpDark-800/50 pb-2">
              <span className="text-gray-400">Deployment Model</span>
              <span className="text-aravBlue-300 font-bold">{deployment.deploymentModel}</span>
            </div>
            <div className="flex justify-between border-b border-cpDark-800/50 pb-2">
              <span className="text-gray-400">Infrastructure Owner</span>
              <span className={deployment.infrastructureOwner === 'ARAV' ? 'text-emerald-400 font-bold' : 'text-amber-400 font-bold'}>
                {deployment.infrastructureOwner}
              </span>
            </div>
            <div className="flex justify-between border-b border-cpDark-800/50 pb-2">
              <span className="text-gray-400">Target Environment</span>
              <span className="text-gray-300">{deployment.environment}</span>
            </div>
            <div className="flex justify-between border-b border-cpDark-800/50 pb-2">
              <span className="text-gray-400">Build Version</span>
              <span className="text-gray-300">v{deployment.version}</span>
            </div>
            <div className="flex justify-between border-b border-cpDark-800/50 pb-2">
              <span className="text-gray-400">Registered At</span>
              <span className="text-gray-400">{new Date(deployment.createdAt).toLocaleString()}</span>
            </div>
          </div>
        </div>

        {/* Section 2: Organization & Commercial Association */}
        <div className="rounded-lg border border-cpDark-800 bg-cpDark-900 p-5 space-y-4 shadow-xl">
          <div className="flex items-center gap-2 border-b border-cpDark-800 pb-3">
            <Building2 className="h-5 w-5 text-aravBlue-400" />
            <h2 className="text-sm font-bold text-white uppercase tracking-wider">
              2. Organization &amp; Commercial Scope
            </h2>
          </div>

          <div className="space-y-3 font-mono text-xs">
            <div className="flex justify-between border-b border-cpDark-800/50 pb-2">
              <span className="text-gray-400">Bound Organization</span>
              <Link
                href={`/organizations/${encodeURIComponent(deployment.organizationId)}`}
                className="text-aravBlue-400 hover:underline font-bold flex items-center gap-1"
              >
                <span>{deployment.organizationId}</span>
                <ExternalLink className="h-3 w-3" />
              </Link>
            </div>
            <div className="flex justify-between border-b border-cpDark-800/50 pb-2">
              <span className="text-gray-400">Organization Control State</span>
              <StatusBadge status={orgState?.state || 'UNKNOWN'} size="sm" />
            </div>
            <div className="flex justify-between border-b border-cpDark-800/50 pb-2">
              <span className="text-gray-400">Customer ID</span>
              <span className="text-gray-300">{deployment.customerId || 'Unbound'}</span>
            </div>
            <div className="flex justify-between border-b border-cpDark-800/50 pb-2">
              <span className="text-gray-400">Commercial Agreement</span>
              <span className="text-gray-300">{deployment.commercialAgreementId || 'Unbound'}</span>
            </div>
            <div className="flex justify-between border-b border-cpDark-800/50 pb-2">
              <span className="text-gray-400">Associated License</span>
              {deployment.licenseId ? (
                <Link
                  href={`/licensing/${encodeURIComponent(deployment.licenseId)}`}
                  className="text-emerald-400 hover:underline font-bold flex items-center gap-1"
                >
                  <CreditCard className="h-3 w-3" />
                  <span>{deployment.licenseId}</span>
                </Link>
              ) : (
                <span className="text-gray-500 italic">No License Associated</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Section 3 & Section 4: Operational Activation & Health */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Section 3: Operational Activation State */}
        <div className="rounded-lg border border-cpDark-800 bg-cpDark-900 p-5 space-y-4 shadow-xl">
          <div className="flex items-center gap-2 border-b border-cpDark-800 pb-3">
            <Activity className="h-5 w-5 text-aravBlue-400" />
            <h2 className="text-sm font-bold text-white uppercase tracking-wider">
              3. Operational Activation State
            </h2>
          </div>

          <div className="space-y-3 font-mono text-xs">
            <div className="flex justify-between items-center border-b border-cpDark-800/50 pb-2">
              <span className="text-gray-400">Activation State</span>
              <StatusBadge status={deployment.activationState} />
            </div>
            <div className="flex justify-between border-b border-cpDark-800/50 pb-2">
              <span className="text-gray-400">Last Activated At</span>
              <span className="text-gray-300">
                {deployment.lastActivatedAt ? new Date(deployment.lastActivatedAt).toLocaleString() : 'Never Activated'}
              </span>
            </div>

            <div className="rounded bg-cpDark-950 p-3 border border-cpDark-800 text-[11px] font-sans text-gray-300 flex items-start gap-2">
              <Info className="h-4 w-4 text-aravBlue-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold text-white block mb-0.5">Authoritative Activation Rule</span>
                Activation state controls Data Plane check-in eligibility and signed artifact delivery. Registration secrets are bcrypt hashed server-side and never rendered.
              </div>
            </div>
          </div>
        </div>

        {/* Section 4: Data Plane Check-In Health & Convergence */}
        <div className="rounded-lg border border-cpDark-800 bg-cpDark-900 p-5 space-y-4 shadow-xl">
          <div className="flex items-center gap-2 border-b border-cpDark-800 pb-3">
            <Clock className="h-5 w-5 text-aravBlue-400" />
            <h2 className="text-sm font-bold text-white uppercase tracking-wider">
              4. Data Plane Health &amp; Convergence
            </h2>
          </div>

          <div className="space-y-3 font-mono text-xs">
            <div className="flex justify-between border-b border-cpDark-800/50 pb-2">
              <span className="text-gray-400">Last Check-In Timestamp</span>
              <span className="text-gray-300">
                {deployment.lastCheckInAt ? new Date(deployment.lastCheckInAt).toLocaleString() : 'Never Checked In'}
              </span>
            </div>
            <div className="flex justify-between border-b border-cpDark-800/50 pb-2">
              <span className="text-gray-400">Heartbeat Health Status</span>
              <span className={health.isHealthy ? 'text-emerald-400 font-bold' : 'text-amber-400 font-bold'}>
                {health.label}
              </span>
            </div>
            <div className="flex justify-between border-b border-cpDark-800/50 pb-2">
              <span className="text-gray-400">Data Plane Convergence</span>
              <span className={`font-bold ${convergence.variant === 'emerald' ? 'text-emerald-400' : 'text-amber-400'}`}>
                {convergence.label}
              </span>
            </div>
            {signedArtifact && (
              <div className="flex justify-between border-b border-cpDark-800/50 pb-2">
                <span className="text-gray-400">Artifact Sequence (Ed25519)</span>
                <span className="text-amber-400 font-bold">#{signedArtifact.payload?.sequence || 1}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Section 5: Operational History Audit Log */}
      <div className="rounded-lg border border-cpDark-800 bg-cpDark-900 p-5 space-y-4 shadow-xl">
        <div className="flex items-center justify-between border-b border-cpDark-800 pb-3">
          <div className="flex items-center gap-2">
            <History className="h-5 w-5 text-aravBlue-400" />
            <h2 className="text-sm font-bold text-white uppercase tracking-wider">
              5. Deployment Operational Audit History Log
            </h2>
          </div>
          <span className="text-xs text-gray-400 font-mono">{history.length} event(s)</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-cpDark-800 bg-cpDark-950 text-[11px] font-semibold uppercase tracking-wider text-gray-400 font-mono">
              <tr>
                <th scope="col" className="px-4 py-2.5">Action</th>
                <th scope="col" className="px-4 py-2.5">Target Entity</th>
                <th scope="col" className="px-4 py-2.5">Operator ID</th>
                <th scope="col" className="px-4 py-2.5">Role</th>
                <th scope="col" className="px-4 py-2.5">Timestamp</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-cpDark-800/60 font-mono text-gray-300">
              {history.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-gray-500 italic">
                    No operational audit logs recorded for this deployment.
                  </td>
                </tr>
              ) : (
                history.map((log) => (
                  <tr key={log.id} className="hover:bg-cpDark-800/40">
                    <td className="px-4 py-2.5 font-bold text-emerald-400">
                      {log.action}
                    </td>
                    <td className="px-4 py-2.5 text-gray-300">
                      {log.entityType} ({log.entityId})
                    </td>
                    <td className="px-4 py-2.5 text-aravBlue-400">
                      {log.actorId || 'System'}
                    </td>
                    <td className="px-4 py-2.5 text-gray-400 text-[11px]">
                      {log.actorRole || 'SYSTEM'}
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

      {/* Confirmation Modal for Lifecycle Actions */}
      <ConfirmationDialog
        isOpen={!!actionType}
        title={`${actionType === 'SUSPEND' ? 'Suspend' : actionType === 'REACTIVATE' ? 'Reactivate' : 'Decommission'} Deployment ${deploymentId}`}
        explanation={`Transitioning deployment operational state to ${actionType === 'SUSPEND' ? 'SUSPENDED' : actionType === 'REACTIVATE' ? 'ACTIVE' : 'DECOMMISSIONED'}.`}
        consequence={
          actionType === 'DECOMMISSION'
            ? 'PERMANENT TERMINAL ACTION: Decommissioning this deployment cannot be undone. All future check-ins and signed artifact requests will be rejected.'
            : actionType === 'SUSPEND'
            ? 'Operational suspension will pause Data Plane check-ins.'
            : 'Reactivating deployment restores operational check-in eligibility.'
        }
        confirmationPhrase={actionType === 'DECOMMISSION' ? `DECOMMISSION ${deploymentId}` : undefined}
        reasonRequired={true}
        confirmButtonText={
          actionType === 'SUSPEND'
            ? 'Suspend Deployment'
            : actionType === 'REACTIVATE'
            ? 'Reactivate Deployment'
            : 'Decommission Deployment Permanently'
        }
        confirmVariant={actionType === 'DECOMMISSION' ? 'danger' : actionType === 'SUSPEND' ? 'warning' : 'primary'}
        isLoading={isSubmittingAction}
        errorMessage={actionError}
        onConfirm={handleExecuteStateAction}
        onCancel={() => setActionType(null)}
      />
    </div>
  );
}
