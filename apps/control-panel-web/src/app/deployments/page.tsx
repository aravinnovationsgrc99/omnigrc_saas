'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import {
  Server,
  Search,
  Filter,
  RefreshCw,
  Activity,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Building2,
  ExternalLink,
  PauseCircle,
  PlayCircle,
  Ban,
  ShieldCheck,
  CreditCard,
} from 'lucide-react';
import { useAuth } from '../../lib/auth-context';
import { controlPlaneApi, ControlPlaneApiError } from '../../lib/control-plane-api';
import { DeploymentSummary } from '../../types/control-plane';
import { StatusBadge } from '../../components/ui/status-badge';
import { ErrorState } from '../../components/ui/error-state';
import { AccessDenied } from '../../components/ui/access-denied';
import { ConfirmationDialog } from '../../components/ui/confirmation-dialog';

export default function DeploymentsPage() {
  const { operator, isAuthenticated, isLoading: isAuthLoading } = useAuth();

  const [deployments, setDeployments] = useState<DeploymentSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<ControlPlaneApiError | null>(null);

  // Filter States
  const [search, setSearch] = useState('');
  const [modelFilter, setModelFilter] = useState<string>('ALL');
  const [stateFilter, setStateFilter] = useState<string>('ALL');
  const [envFilter, setEnvFilter] = useState<string>('ALL');

  // Mutation Dialog State
  const [selectedDeployment, setSelectedDeployment] = useState<DeploymentSummary | null>(null);
  const [targetState, setTargetState] = useState<'SUSPENDED' | 'ACTIVE' | 'DECOMMISSIONED' | null>(null);
  const [isSubmittingState, setIsSubmittingState] = useState(false);
  const [stateError, setStateError] = useState<string | null>(null);

  const canMutate =
    operator?.role === 'PLATFORM_SUPER_ADMIN' ||
    operator?.role === 'OPERATIONS_ENGINEER';

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const data = await controlPlaneApi.listDeployments();
      setDeployments(data || []);
    } catch (err: any) {
      if (err instanceof ControlPlaneApiError) {
        setError(err);
      } else {
        setError(new ControlPlaneApiError(500, err.message || 'Failed to fetch deployment inventory'));
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

  // Filtered Deployments
  const filteredDeployments = useMemo(() => {
    return deployments.filter((d) => {
      const matchesSearch =
        !search.trim() ||
        d.id.toLowerCase().includes(search.toLowerCase()) ||
        d.organizationId.toLowerCase().includes(search.toLowerCase()) ||
        (d.customerId && d.customerId.toLowerCase().includes(search.toLowerCase())) ||
        (d.licenseId && d.licenseId.toLowerCase().includes(search.toLowerCase()));

      const matchesModel = modelFilter === 'ALL' || d.deploymentModel === modelFilter;
      const matchesState = stateFilter === 'ALL' || d.activationState === stateFilter;
      const matchesEnv = envFilter === 'ALL' || d.environment === envFilter;

      return matchesSearch && matchesModel && matchesState && matchesEnv;
    });
  }, [deployments, search, modelFilter, stateFilter, envFilter]);

  // Statistics Summary
  const stats = useMemo(() => {
    const total = deployments.length;
    const active = deployments.filter((d) => d.activationState === 'ACTIVE').length;
    const pending = deployments.filter((d) => d.activationState === 'PENDING').length;
    const suspended = deployments.filter((d) => d.activationState === 'SUSPENDED').length;
    const selfHosted = deployments.filter((d) => d.deploymentModel === 'SELF_HOSTED').length;
    return { total, active, pending, suspended, selfHosted };
  }, [deployments]);

  // Check-In Health Helper
  const getCheckInHealth = (lastCheckInAt?: string | null) => {
    if (!lastCheckInAt) return { label: 'Never Checked In', variant: 'gray' as const, isHealthy: false };
    const diffMs = new Date().getTime() - new Date(lastCheckInAt).getTime();
    const diffMins = diffMs / (1000 * 60);

    if (diffMins <= 5) {
      return { label: `Healthy (${Math.round(diffMins)}m ago)`, variant: 'emerald' as const, isHealthy: true };
    } else if (diffMins <= 60) {
      return { label: `Stale (${Math.round(diffMins)}m ago)`, variant: 'amber' as const, isHealthy: false };
    } else {
      const hours = Math.round(diffMins / 60);
      return { label: `Offline (${hours}h ago)`, variant: 'rose' as const, isHealthy: false };
    }
  };

  const handleExecuteStateMutation = async (reason?: string) => {
    if (!selectedDeployment || !targetState) return;
    setIsSubmittingState(true);
    setStateError(null);

    try {
      await controlPlaneApi.updateDeploymentState(selectedDeployment.id, targetState, reason);
      setSelectedDeployment(null);
      setTargetState(null);
      await fetchData();
    } catch (err: any) {
      setStateError(err.message || 'Failed to update deployment operational state');
    } finally {
      setIsSubmittingState(false);
    }
  };

  if (isAuthLoading || (isLoading && deployments.length === 0 && !error)) {
    return (
      <div className="flex h-64 items-center justify-center">
        <RefreshCw className="h-6 w-6 animate-spin text-aravBlue-400" />
      </div>
    );
  }

  if (error && error.statusCode === 403) {
    return (
      <AccessDenied
        resource="Global Deployment Operational Inventory"
        requiredRole="Authorized Operations Engineer / Platform Super Admin"
      />
    );
  }

  if (error) {
    return (
      <ErrorState
        statusCode={error.statusCode}
        title="Failed to load deployment inventory"
        message={error.message}
        correlationId={error.correlationId}
        onRetry={fetchData}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between border-b border-cpDark-800 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <Server className="h-6 w-6 text-aravBlue-400" />
            <h1 className="text-xl font-bold text-white tracking-tight">Deployment Operational Inventory</h1>
          </div>
          <p className="mt-1 text-xs text-gray-400 font-mono">
            Global Control Plane registry of active, pending, and suspended OMNiGRC runtime deployments across organizations.
          </p>
        </div>

        <button
          onClick={fetchData}
          disabled={isLoading}
          className="inline-flex items-center gap-2 rounded border border-cpDark-700 bg-cpDark-800 px-3.5 py-1.5 text-xs font-medium text-gray-300 hover:bg-cpDark-700 hover:text-white transition-colors focus-ring"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin text-aravBlue-400' : ''}`} />
          <span>Refresh Registry</span>
        </button>
      </div>

      {/* KPI Stats Strip */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-5 font-mono">
        <div className="rounded-lg border border-cpDark-800 bg-cpDark-900 p-4 shadow-md">
          <span className="text-[11px] font-medium uppercase tracking-wider text-gray-400">Total Deployments</span>
          <div className="mt-1 text-2xl font-bold text-white">{stats.total}</div>
        </div>

        <div className="rounded-lg border border-cpDark-800 bg-cpDark-900 p-4 shadow-md">
          <span className="text-[11px] font-medium uppercase tracking-wider text-emerald-400">Active</span>
          <div className="mt-1 text-2xl font-bold text-emerald-400">{stats.active}</div>
        </div>

        <div className="rounded-lg border border-cpDark-800 bg-cpDark-900 p-4 shadow-md">
          <span className="text-[11px] font-medium uppercase tracking-wider text-amber-400">Pending</span>
          <div className="mt-1 text-2xl font-bold text-amber-400">{stats.pending}</div>
        </div>

        <div className="rounded-lg border border-cpDark-800 bg-cpDark-900 p-4 shadow-md">
          <span className="text-[11px] font-medium uppercase tracking-wider text-rose-400">Suspended</span>
          <div className="mt-1 text-2xl font-bold text-rose-400">{stats.suspended}</div>
        </div>

        <div className="rounded-lg border border-cpDark-800 bg-cpDark-900 p-4 shadow-md">
          <span className="text-[11px] font-medium uppercase tracking-wider text-aravBlue-400">Self-Hosted</span>
          <div className="mt-1 text-2xl font-bold text-aravBlue-300">{stats.selfHosted}</div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col gap-3 rounded-lg border border-cpDark-800 bg-cpDark-900 p-4 sm:flex-row sm:items-center sm:justify-between shadow-lg">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search Deployment ID, Organization ID, Customer ID, License ID..."
            className="w-full rounded-md border border-cpDark-700 bg-cpDark-950 pl-9 pr-4 py-2 text-xs font-mono text-white placeholder-gray-500 focus-ring"
          />
        </div>

        {/* Model Filter */}
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-gray-400 shrink-0" />
          <select
            value={modelFilter}
            onChange={(e) => setModelFilter(e.target.value)}
            className="rounded-md border border-cpDark-700 bg-cpDark-950 px-3 py-2 text-xs font-mono text-gray-300 focus-ring"
          >
            <option value="ALL">All Models</option>
            <option value="MSSP_SHARED">MSSP Shared</option>
            <option value="PRIVATE_MSSP">Private MSSP</option>
            <option value="SELF_HOSTED">Self-Hosted</option>
          </select>

          {/* State Filter */}
          <select
            value={stateFilter}
            onChange={(e) => setStateFilter(e.target.value)}
            className="rounded-md border border-cpDark-700 bg-cpDark-950 px-3 py-2 text-xs font-mono text-gray-300 focus-ring"
          >
            <option value="ALL">All States</option>
            <option value="ACTIVE">ACTIVE</option>
            <option value="PENDING">PENDING</option>
            <option value="SUSPENDED">SUSPENDED</option>
            <option value="DECOMMISSIONED">DECOMMISSIONED</option>
          </select>

          {/* Environment Filter */}
          <select
            value={envFilter}
            onChange={(e) => setEnvFilter(e.target.value)}
            className="rounded-md border border-cpDark-700 bg-cpDark-950 px-3 py-2 text-xs font-mono text-gray-300 focus-ring"
          >
            <option value="ALL">All Environments</option>
            <option value="PRODUCTION">PRODUCTION</option>
            <option value="UAT">UAT</option>
            <option value="DR">DR</option>
            <option value="DEVELOPMENT">DEVELOPMENT</option>
          </select>
        </div>
      </div>

      {/* Main Table View */}
      <div className="rounded-lg border border-cpDark-800 bg-cpDark-900 shadow-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-cpDark-800 bg-cpDark-950 text-[11px] font-semibold uppercase tracking-wider text-gray-400 font-mono">
              <tr>
                <th scope="col" className="px-4 py-3">Deployment ID</th>
                <th scope="col" className="px-4 py-3">Organization ID</th>
                <th scope="col" className="px-4 py-3">Model / Owner</th>
                <th scope="col" className="px-4 py-3">Environment</th>
                <th scope="col" className="px-4 py-3">State</th>
                <th scope="col" className="px-4 py-3">Check-In Health</th>
                <th scope="col" className="px-4 py-3">Commercial License</th>
                <th scope="col" className="px-4 py-3 text-right">Operator Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-cpDark-800/60 font-mono text-gray-300">
              {filteredDeployments.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-gray-500 italic">
                    {deployments.length === 0
                      ? 'No operational deployments registered in Control Plane database.'
                      : 'No deployments match the selected search & filter criteria.'}
                  </td>
                </tr>
              ) : (
                filteredDeployments.map((d) => {
                  const health = getCheckInHealth(d.lastCheckInAt);
                  return (
                    <tr key={d.id} className="hover:bg-cpDark-800/40 transition-colors">
                      <td className="px-4 py-3 font-bold text-white">
                        <Link
                          href={`/deployments/${encodeURIComponent(d.id)}`}
                          className="hover:text-aravBlue-400 hover:underline flex items-center gap-1 font-mono"
                        >
                          <span>{d.id}</span>
                          <ExternalLink className="h-3 w-3 text-gray-500" />
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-aravBlue-400">
                        <Link
                          href={`/organizations/${encodeURIComponent(d.organizationId)}`}
                          className="hover:underline flex items-center gap-1"
                        >
                          <Building2 className="h-3 w-3 text-gray-500 shrink-0" />
                          <span>{d.organizationId}</span>
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-0.5">
                          <span className="font-semibold text-gray-200">{d.deploymentModel}</span>
                          <span className="text-[10px] text-gray-400">
                            Owner: <span className={d.infrastructureOwner === 'ARAV' ? 'text-emerald-400 font-bold' : 'text-amber-400 font-bold'}>{d.infrastructureOwner}</span>
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-0.5">
                          <span className="text-gray-300">{d.environment}</span>
                          <span className="text-[10px] text-gray-500">v{d.version}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={d.activationState} size="sm" />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`h-2 w-2 rounded-full ${
                              health.variant === 'emerald'
                                ? 'bg-emerald-400 animate-pulse'
                                : health.variant === 'amber'
                                ? 'bg-amber-400'
                                : 'bg-rose-500'
                            }`}
                          />
                          <span className="text-[11px] text-gray-300">{health.label}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {d.licenseId ? (
                          <Link
                            href={`/licensing/${encodeURIComponent(d.licenseId)}`}
                            className="hover:text-aravBlue-400 hover:underline flex items-center gap-1 text-emerald-400 font-bold"
                          >
                            <CreditCard className="h-3 w-3 text-gray-400 shrink-0" />
                            <span>{d.licenseId}</span>
                          </Link>
                        ) : (
                          <span className="text-gray-500 italic text-[11px]">Unbound</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {canMutate && d.activationState !== 'DECOMMISSIONED' ? (
                          <div className="flex items-center justify-end gap-1.5">
                            {d.activationState === 'ACTIVE' && (
                              <button
                                onClick={() => {
                                  setSelectedDeployment(d);
                                  setTargetState('SUSPENDED');
                                  setStateError(null);
                                }}
                                title="Suspend operational deployment"
                                className="rounded bg-amber-950 text-amber-300 border border-amber-800 px-2 py-0.5 text-[11px] font-semibold hover:bg-amber-900"
                              >
                                Suspend
                              </button>
                            )}

                            {d.activationState === 'SUSPENDED' && (
                              <button
                                onClick={() => {
                                  setSelectedDeployment(d);
                                  setTargetState('ACTIVE');
                                  setStateError(null);
                                }}
                                title="Reactivate operational deployment"
                                className="rounded bg-emerald-950 text-emerald-300 border border-emerald-800 px-2 py-0.5 text-[11px] font-semibold hover:bg-emerald-900"
                              >
                                Reactivate
                              </button>
                            )}

                            <button
                              onClick={() => {
                                setSelectedDeployment(d);
                                setTargetState('DECOMMISSIONED');
                                setStateError(null);
                              }}
                              title="Decommission deployment permanently"
                              className="rounded bg-rose-950 text-rose-300 border border-rose-800 px-2 py-0.5 text-[11px] font-semibold hover:bg-rose-900"
                            >
                              Decommission
                            </button>
                          </div>
                        ) : (
                          <span className="text-[11px] text-gray-500 italic">None</span>
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

      {/* Confirmation Modal for Deployment State Mutations */}
      <ConfirmationDialog
        isOpen={!!selectedDeployment && !!targetState}
        title={`${targetState === 'SUSPENDED' ? 'Suspend' : targetState === 'ACTIVE' ? 'Reactivate' : 'Decommission'} Deployment ${selectedDeployment?.id || ''}`}
        explanation={`Transitioning operational activation state of deployment ${selectedDeployment?.id || ''} from ${selectedDeployment?.activationState || ''} to ${targetState || ''}.`}
        consequence={
          targetState === 'DECOMMISSIONED'
            ? 'PERMANENT TERMINAL ACTION: Decommissioning a deployment cannot be undone. Check-ins and license artifacts will be permanently rejected.'
            : targetState === 'SUSPENDED'
            ? 'Operational suspension will pause Data Plane active check-ins and signed artifact issuance.'
            : 'Reactivating deployment restores operational check-in eligibility.'
        }
        confirmationPhrase={targetState === 'DECOMMISSIONED' ? `DECOMMISSION ${selectedDeployment?.id}` : undefined}
        reasonRequired={true}
        confirmButtonText={
          targetState === 'SUSPENDED'
            ? 'Suspend Deployment'
            : targetState === 'ACTIVE'
            ? 'Reactivate Deployment'
            : 'Decommission Deployment Permanently'
        }
        confirmVariant={targetState === 'DECOMMISSIONED' ? 'danger' : targetState === 'SUSPENDED' ? 'warning' : 'primary'}
        isLoading={isSubmittingState}
        errorMessage={stateError}
        onConfirm={handleExecuteStateMutation}
        onCancel={() => {
          setSelectedDeployment(null);
          setTargetState(null);
        }}
      />
    </div>
  );
}
