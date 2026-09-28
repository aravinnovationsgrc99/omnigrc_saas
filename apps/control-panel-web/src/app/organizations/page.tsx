'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Building2,
  Search,
  RefreshCw,
  Eye,
  AlertTriangle,
  PauseCircle,
  PlayCircle,
  Ban,
  Trash2,
  Info,
  CheckCircle2,
  XCircle,
  ShieldAlert,
} from 'lucide-react';
import { useAuth } from '../../lib/auth-context';
import {
  controlPlaneApi,
  ControlPlaneApiError,
} from '../../lib/control-plane-api';
import {
  OrganizationControlState,
  ControlState,
  DeploymentSummary,
  LicenseSummary,
  TransitionResponse,
} from '../../types/control-plane';
import { StatusBadge } from '../../components/ui/status-badge';
import { ConfirmationDialog } from '../../components/ui/confirmation-dialog';
import { ErrorState } from '../../components/ui/error-state';
import { AccessDenied } from '../../components/ui/access-denied';

type FilterTab = 'ALL' | ControlState;

export default function OrganizationsPage() {
  const { operator, isAuthenticated, isLoading: isAuthLoading } = useAuth();
  const router = useRouter();

  const [organizations, setOrganizations] = useState<OrganizationControlState[]>([]);
  const [deployments, setDeployments] = useState<DeploymentSummary[]>([]);
  const [licenses, setLicenses] = useState<LicenseSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<ControlPlaneApiError | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<FilterTab>('ALL');

  // Transition Modal State
  const [activeModalOrg, setActiveModalOrg] = useState<OrganizationControlState | null>(null);
  const [targetState, setTargetState] = useState<ControlState | null>(null);
  const [isSubmittingTransition, setIsSubmittingTransition] = useState(false);
  const [transitionError, setTransitionError] = useState<string | null>(null);

  // Success audit toast/banner
  const [lastAuditResult, setLastAuditResult] = useState<TransitionResponse | null>(null);

  const canMutate =
    operator?.role === 'PLATFORM_SUPER_ADMIN' ||
    operator?.role === 'OPERATIONS_ENGINEER';

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [orgsData, depsData, licData] = await Promise.all([
        controlPlaneApi.listOrganizations(),
        controlPlaneApi.listDeployments().catch(() => []),
        controlPlaneApi.listLicenses().catch(() => []),
      ]);
      setOrganizations(orgsData || []);
      setDeployments(depsData || []);
      setLicenses(licData || []);
    } catch (err: any) {
      if (err instanceof ControlPlaneApiError) {
        setError(err);
      } else {
        setError(
          new ControlPlaneApiError(
            500,
            err.message || 'Failed to load organization data',
          ),
        );
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isAuthLoading && isAuthenticated) {
      fetchData();
    }
  }, [isAuthLoading, isAuthenticated, fetchData]);

  if (isAuthLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <RefreshCw className="h-6 w-6 animate-spin text-aravBlue-400" />
      </div>
    );
  }

  if (error && error.statusCode === 403) {
    return (
      <AccessDenied
        resource="Organizations Control"
        requiredRole="Authorized Control Plane Operator"
      />
    );
  }

  // Correlate deployments and licenses for summary columns
  const getOrgDeploymentSummary = (orgId: string) => {
    const orgDeps = deployments.filter((d) => d.organizationId === orgId);
    if (orgDeps.length === 0) return { label: 'No Deployment', badge: 'bg-gray-800 text-gray-400' };
    const first = orgDeps[0];
    return {
      label: `${first.deploymentModel} (${first.activationState})`,
      badge:
        first.activationState === 'ACTIVE'
          ? 'bg-emerald-950/60 text-emerald-300 border-emerald-800/40'
          : 'bg-amber-950/60 text-amber-300 border-amber-800/40',
    };
  };

  const getOrgLicenseSummary = (orgId: string) => {
    const orgDeps = deployments.filter((d) => d.organizationId === orgId);
    const licIds = orgDeps.map((d) => d.licenseId).filter(Boolean);
    const orgLics = licenses.filter((l) => licIds.includes(l.id));

    if (orgLics.length === 0) return { label: 'No License', status: 'UNLICENSED' };
    const primary = orgLics[0];
    return {
      label: `${primary.product} (${primary.status})`,
      status: primary.status,
    };
  };

  // Filtering & Search
  const filteredOrganizations = organizations.filter((org) => {
    const matchesTab = activeTab === 'ALL' || org.state === activeTab;
    const query = searchQuery.trim().toLowerCase();
    if (!query) return matchesTab;

    const matchesId = org.organizationId.toLowerCase().includes(query);

    const orgDeps = deployments.filter((d) => d.organizationId === org.organizationId);
    const matchesDepId = orgDeps.some((d) => d.id.toLowerCase().includes(query));
    const matchesCustId = orgDeps.some((d) => (d.customerId || '').toLowerCase().includes(query));

    return matchesTab && (matchesId || matchesDepId || matchesCustId);
  });

  const handleOpenTransitionModal = (org: OrganizationControlState, target: ControlState) => {
    setActiveModalOrg(org);
    setTargetState(target);
    setTransitionError(null);
  };

  const handleCloseModal = () => {
    setActiveModalOrg(null);
    setTargetState(null);
    setTransitionError(null);
  };

  const handleExecuteTransition = async (reason?: string) => {
    if (!activeModalOrg || !targetState || !reason) return;
    setIsSubmittingTransition(true);
    setTransitionError(null);

    const idempotencyKey = `transition_${activeModalOrg.organizationId}_${targetState}_${Date.now()}`;

    try {
      const res = await controlPlaneApi.transitionOrganizationState(
        activeModalOrg.organizationId,
        {
          targetState,
          reason,
          idempotencyKey,
        },
      );
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

  // Helper text for transition dialogs
  const getModalProps = () => {
    if (!activeModalOrg || !targetState) {
      return {
        title: '',
        explanation: '',
        consequence: '',
        confirmPhrase: undefined,
        confirmVariant: 'danger' as const,
        confirmButtonText: 'Confirm',
      };
    }

    const orgId = activeModalOrg.organizationId;
    const currentState = activeModalOrg.state;

    switch (targetState) {
      case 'SUSPENDED':
        return {
          title: `Suspend Organization ${orgId}`,
          explanation: `Transitioning state from [${currentState}] to [SUSPENDED]. This places the organization in a read-only state across Control Plane and Data Plane services.`,
          consequence: 'Write operations will be rejected. Operators can inspect read-only metadata.',
          confirmPhrase: undefined,
          confirmVariant: 'warning' as const,
          confirmButtonText: 'Suspend Organization',
        };

      case 'DISABLED':
        return {
          title: `Disable Organization ${orgId}`,
          explanation: `HIGH-RISK ACTION: Transitioning state from [${currentState}] to [DISABLED]. All Data Plane service access and API endpoints will be immediately BLOCKED for this organization.`,
          consequence: 'Users will be denied access at the Data Plane API boundary. Propagation signals will be dispatched to Data Plane.',
          confirmPhrase: `DISABLE ${orgId}`,
          confirmVariant: 'danger' as const,
          confirmButtonText: 'Disable Organization',
        };

      case 'ACTIVE':
        return {
          title: `Reactivate Organization ${orgId}`,
          explanation: `Transitioning state from [${currentState}] to [ACTIVE]. Normal Control Plane operations will be restored.`,
          consequence: 'IMPORTANT: Organization control state and Commercial License state are separate. Reactivating organization lifecycle state does NOT alter or override commercial license status.',
          confirmPhrase: undefined,
          confirmVariant: 'primary' as const,
          confirmButtonText: 'Reactivate Organization',
        };

      case 'DECOMMISSIONED':
        return {
          title: `Decommission Organization ${orgId}`,
          explanation: `TERMINAL STATE TRANSITION: Decommissioning organization ${orgId}. This marks the organization record as permanently decommissioned in the Control Plane.`,
          consequence: 'This action cannot be reversed. Organization will remain in terminal read-only state.',
          confirmPhrase: `DECOMMISSION ${orgId}`,
          confirmVariant: 'danger' as const,
          confirmButtonText: 'Decommission Organization',
        };

      default:
        return {
          title: `Transition Organization State`,
          explanation: `Transitioning organization to ${targetState}.`,
          consequence: '',
          confirmPhrase: undefined,
          confirmVariant: 'danger' as const,
          confirmButtonText: 'Confirm State Transition',
        };
    }
  };

  const modalProps = getModalProps();

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between border-b border-cpDark-800 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <Building2 className="h-6 w-6 text-aravBlue-400" aria-hidden="true" />
            <h1 className="text-xl font-bold tracking-tight text-white">
              Organizations Control
            </h1>
          </div>
          <p className="mt-1 text-xs text-gray-400">
            Authoritative Control Plane organization lifecycle &amp; control state management.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => fetchData()}
            disabled={isLoading}
            className="inline-flex items-center gap-1.5 rounded-md border border-cpDark-700 bg-cpDark-800 px-3 py-1.5 text-xs font-medium text-gray-300 hover:bg-cpDark-700 hover:text-white focus-ring transition-colors"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} aria-hidden="true" />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Provisioning Informational Banner */}
      <div className="rounded-lg border border-aravBlue-900/40 bg-aravBlue-950/20 p-4 text-xs text-gray-300 flex items-start gap-3">
        <Info className="h-5 w-5 text-aravBlue-400 shrink-0 mt-0.5" aria-hidden="true" />
        <div>
          <span className="font-semibold text-aravBlue-300 block mb-0.5">
            Operator Provisioning Architecture
          </span>
          Organizations are provisioned authoritatively via Control Plane M2M infrastructure APIs or customer onboarding workflows. Direct frontend creation is disabled to preserve state machine sequence integrity.
        </div>
      </div>

      {/* Audit Transition Result Toast */}
      {lastAuditResult && (
        <div className="rounded-lg border border-emerald-800/80 bg-emerald-950/40 p-4 text-xs text-emerald-200 flex items-start justify-between gap-3 animate-in fade-in duration-200">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0 mt-0.5" aria-hidden="true" />
            <div>
              <span className="font-bold text-white block mb-1">
                State Transition Executed Successfully
              </span>
              <div className="space-y-0.5 font-mono text-[11px] text-emerald-300">
                <div>Organization: <span className="text-white">{lastAuditResult.organizationId}</span></div>
                <div>State: <span className="text-white">{lastAuditResult.previousState || 'UNKNOWN'}</span> &rarr; <span className="text-emerald-400 font-bold">{lastAuditResult.state}</span> (Sequence: {lastAuditResult.sequence})</div>
                <div>Reason: <span className="text-white">&quot;{lastAuditResult.reason}&quot;</span></div>
                {lastAuditResult.propagation && (
                  <div className="mt-1 flex items-center gap-2 border-t border-emerald-800/40 pt-1">
                    <span>DP Control Signal:</span>
                    <span className={`px-1.5 py-0.5 rounded font-bold ${lastAuditResult.propagation.status === 'DELIVERED' ? 'bg-emerald-900 text-emerald-300' : 'bg-amber-900 text-amber-300'}`}>
                      {lastAuditResult.propagation.status}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
          <button
            onClick={() => setLastAuditResult(null)}
            className="text-gray-400 hover:text-white"
          >
            &times;
          </button>
        </div>
      )}

      {/* Error state */}
      {error && error.statusCode !== 403 && (
        <ErrorState
          statusCode={error.statusCode}
          title="Failed to fetch organizations"
          message={error.message}
          correlationId={error.correlationId}
          onRetry={fetchData}
        />
      )}

      {/* Main Content Area */}
      {!error && (
        <div className="space-y-4">
          {/* Toolbar & Filters */}
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between rounded-lg border border-cpDark-800 bg-cpDark-900/60 p-3">
            {/* Filter Tabs */}
            <div className="flex items-center gap-1 overflow-x-auto pb-1 lg:pb-0">
              {(['ALL', 'PENDING', 'ACTIVE', 'SUSPENDED', 'DISABLED', 'DECOMMISSIONED'] as FilterTab[]).map(
                (tab) => {
                  const count =
                    tab === 'ALL'
                      ? organizations.length
                      : organizations.filter((o) => o.state === tab).length;
                  const isActive = activeTab === tab;
                  return (
                    <button
                      key={tab}
                      onClick={() => setActiveTab(tab)}
                      className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap focus-ring ${
                        isActive
                          ? 'bg-aravBlue-600 text-white shadow-sm'
                          : 'bg-cpDark-800/60 text-gray-400 hover:bg-cpDark-800 hover:text-gray-200'
                      }`}
                    >
                      <span>{tab}</span>
                      <span
                        className={`rounded-full px-1.5 py-0.2 text-[10px] ${
                          isActive
                            ? 'bg-aravBlue-800 text-aravBlue-100'
                            : 'bg-cpDark-950 text-gray-500'
                        }`}
                      >
                        {count}
                      </span>
                    </button>
                  );
                },
              )}
            </div>

            {/* Search Bar */}
            <div className="relative w-full lg:w-72 shrink-0">
              <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-gray-500" aria-hidden="true" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search Org ID, Dep ID..."
                className="w-full rounded-md border border-cpDark-700 bg-cpDark-950 pl-9 pr-3 py-1.5 text-xs text-white placeholder-gray-500 focus-ring font-mono"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-2 text-xs text-gray-500 hover:text-white"
                >
                  &times;
                </button>
              )}
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto rounded-lg border border-cpDark-800 bg-cpDark-900 shadow-xl">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-cpDark-800 bg-cpDark-950 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                <tr>
                  <th scope="col" className="px-4 py-3">Organization ID</th>
                  <th scope="col" className="px-4 py-3">Lifecycle State</th>
                  <th scope="col" className="px-4 py-3">Deployment</th>
                  <th scope="col" className="px-4 py-3">Commercial</th>
                  <th scope="col" className="px-4 py-3 text-center">Sequence</th>
                  <th scope="col" className="px-4 py-3">Last Updated</th>
                  <th scope="col" className="px-4 py-3 text-right">Operational Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-cpDark-800/60 font-mono text-gray-300">
                {isLoading && (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-gray-400">
                      <div className="flex items-center justify-center gap-2">
                        <RefreshCw className="h-4 w-4 animate-spin text-aravBlue-400" />
                        <span>Loading control plane organization records...</span>
                      </div>
                    </td>
                  </tr>
                )}

                {!isLoading && filteredOrganizations.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-gray-400">
                      <div className="flex flex-col items-center gap-2">
                        <Building2 className="h-8 w-8 text-cpDark-600" aria-hidden="true" />
                        <span className="font-semibold text-gray-300">No Organizations Discovered</span>
                        <span className="text-xs text-gray-500 max-w-sm">
                          {searchQuery || activeTab !== 'ALL'
                            ? `No records match filter "${activeTab}" or search query "${searchQuery}".`
                            : 'No Control Plane organization records found in PostgreSQL storage.'}
                        </span>
                      </div>
                    </td>
                  </tr>
                )}

                {!isLoading &&
                  filteredOrganizations.map((org) => {
                    const depSummary = getOrgDeploymentSummary(org.organizationId);
                    const licSummary = getOrgLicenseSummary(org.organizationId);

                    return (
                      <tr
                        key={org.id}
                        className="hover:bg-cpDark-800/40 transition-colors"
                      >
                        {/* Org ID */}
                        <td className="px-4 py-3 font-semibold text-white">
                          <Link
                            href={`/organizations/${encodeURIComponent(org.organizationId)}`}
                            className="text-aravBlue-400 hover:underline inline-flex items-center gap-1.5"
                          >
                            <span>{org.organizationId}</span>
                          </Link>
                        </td>

                        {/* Lifecycle State */}
                        <td className="px-4 py-3">
                          <StatusBadge status={org.state} />
                        </td>

                        {/* Deployment */}
                        <td className="px-4 py-3">
                          <span className={`inline-block rounded px-2 py-0.5 text-[11px] border border-cpDark-700 font-mono ${depSummary.badge}`}>
                            {depSummary.label}
                          </span>
                        </td>

                        {/* Commercial */}
                        <td className="px-4 py-3">
                          <StatusBadge status={licSummary.status} label={licSummary.label} size="sm" />
                        </td>

                        {/* Sequence */}
                        <td className="px-4 py-3 text-center text-gray-400 font-mono">
                          #{org.sequence}
                        </td>

                        {/* Last Updated */}
                        <td className="px-4 py-3 text-gray-400 text-[11px]">
                          {new Date(org.updatedAt).toLocaleString()}
                        </td>

                        {/* Actions */}
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1.5">
                            {/* View Detail */}
                            <Link
                              href={`/organizations/${encodeURIComponent(org.organizationId)}`}
                              className="inline-flex items-center gap-1 rounded border border-cpDark-700 bg-cpDark-800 px-2 py-1 text-[11px] text-gray-300 hover:bg-cpDark-700 hover:text-white focus-ring"
                              title="Inspect detail & history"
                            >
                              <Eye className="h-3 w-3" />
                              <span>Inspect</span>
                            </Link>

                            {/* State Transition Actions based on CP-2 Legal State Machine */}
                            {canMutate && org.state === 'PENDING' && (
                              <>
                                <button
                                  onClick={() => handleOpenTransitionModal(org, 'ACTIVE')}
                                  className="inline-flex items-center gap-1 rounded bg-emerald-950/80 border border-emerald-800 text-emerald-300 px-2 py-1 text-[11px] hover:bg-emerald-900 focus-ring"
                                  title="Activate organization state"
                                >
                                  <PlayCircle className="h-3 w-3" />
                                  <span>Activate</span>
                                </button>
                                <button
                                  onClick={() => handleOpenTransitionModal(org, 'DISABLED')}
                                  className="inline-flex items-center gap-1 rounded bg-rose-950/80 border border-rose-800 text-rose-300 px-2 py-1 text-[11px] hover:bg-rose-900 focus-ring"
                                  title="Disable organization access"
                                >
                                  <Ban className="h-3 w-3" />
                                  <span>Disable</span>
                                </button>
                              </>
                            )}

                            {canMutate && org.state === 'ACTIVE' && (
                              <>
                                <button
                                  onClick={() => handleOpenTransitionModal(org, 'SUSPENDED')}
                                  className="inline-flex items-center gap-1 rounded bg-amber-950/80 border border-amber-800 text-amber-300 px-2 py-1 text-[11px] hover:bg-amber-900 focus-ring"
                                  title="Suspend organization operations"
                                >
                                  <PauseCircle className="h-3 w-3" />
                                  <span>Suspend</span>
                                </button>
                                <button
                                  onClick={() => handleOpenTransitionModal(org, 'DISABLED')}
                                  className="inline-flex items-center gap-1 rounded bg-rose-950/80 border border-rose-800 text-rose-300 px-2 py-1 text-[11px] hover:bg-rose-900 focus-ring"
                                  title="Disable organization access"
                                >
                                  <Ban className="h-3 w-3" />
                                  <span>Disable</span>
                                </button>
                              </>
                            )}

                            {canMutate && org.state === 'SUSPENDED' && (
                              <>
                                <button
                                  onClick={() => handleOpenTransitionModal(org, 'ACTIVE')}
                                  className="inline-flex items-center gap-1 rounded bg-emerald-950/80 border border-emerald-800 text-emerald-300 px-2 py-1 text-[11px] hover:bg-emerald-900 focus-ring"
                                  title="Reactivate organization control state"
                                >
                                  <PlayCircle className="h-3 w-3" />
                                  <span>Reactivate</span>
                                </button>
                                <button
                                  onClick={() => handleOpenTransitionModal(org, 'DISABLED')}
                                  className="inline-flex items-center gap-1 rounded bg-rose-950/80 border border-rose-800 text-rose-300 px-2 py-1 text-[11px] hover:bg-rose-900 focus-ring"
                                  title="Disable organization access"
                                >
                                  <Ban className="h-3 w-3" />
                                  <span>Disable</span>
                                </button>
                              </>
                            )}

                            {canMutate && org.state === 'DISABLED' && (
                              <>
                                <button
                                  onClick={() => handleOpenTransitionModal(org, 'ACTIVE')}
                                  className="inline-flex items-center gap-1 rounded bg-emerald-950/80 border border-emerald-800 text-emerald-300 px-2 py-1 text-[11px] hover:bg-emerald-900 focus-ring"
                                  title="Reactivate organization control state"
                                >
                                  <PlayCircle className="h-3 w-3" />
                                  <span>Reactivate</span>
                                </button>
                                <button
                                  onClick={() => handleOpenTransitionModal(org, 'DECOMMISSIONED')}
                                  className="inline-flex items-center gap-1 rounded bg-slate-900 border border-slate-700 text-slate-300 px-2 py-1 text-[11px] hover:bg-slate-800 focus-ring"
                                  title="Decommission organization permanently"
                                >
                                  <Trash2 className="h-3 w-3" />
                                  <span>Decommission</span>
                                </button>
                              </>
                            )}

                            {org.state === 'DECOMMISSIONED' && (
                              <span className="text-[10px] text-slate-500 italic uppercase">
                                Terminal State
                              </span>
                            )}

                            {!canMutate && org.state !== 'DECOMMISSIONED' && (
                              <span
                                className="text-[10px] text-gray-500 italic"
                                title="Read-only operator status"
                              >
                                Read Only
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Confirmation Dialog for State Transitions */}
      <ConfirmationDialog
        isOpen={!!activeModalOrg && !!targetState}
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
