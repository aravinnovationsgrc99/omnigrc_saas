'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Layers,
  Search,
  Filter,
  RefreshCw,
  Shield,
  Building2,
  AlertTriangle,
  CheckCircle2,
  MinusCircle,
  XCircle,
  Sliders,
  RotateCcw,
  Zap,
  Info,
  Lock,
} from 'lucide-react';
import { useAuth } from '../../lib/auth-context';
import { controlPlaneApi, ControlPlaneApiError } from '../../lib/control-plane-api';
import {
  ServiceCatalogItem,
  ServiceStateEnum,
  OrganizationControlState,
} from '../../types/control-plane';
import { StatusBadge } from '../../components/ui/status-badge';
import { ErrorState } from '../../components/ui/error-state';
import { AccessDenied } from '../../components/ui/access-denied';
import { ConfirmationDialog } from '../../components/ui/confirmation-dialog';

export default function ServicesPage() {
  const { operator, isAuthenticated, isLoading: isAuthLoading } = useAuth();

  // Active Tab: 'catalog' | 'overrides'
  const [activeTab, setActiveTab] = useState<'catalog' | 'overrides'>('catalog');

  // Core Data States
  const [services, setServices] = useState<ServiceCatalogItem[]>([]);
  const [organizations, setOrganizations] = useState<OrganizationControlState[]>([]);
  const [selectedOrgId, setSelectedOrgId] = useState<string>('');

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<ControlPlaneApiError | null>(null);

  // Search & Filter States
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [stateFilter, setStateFilter] = useState<string>('ALL');

  // Mutation Dialog State
  const [mutationTarget, setMutationTarget] = useState<{
    type: 'GLOBAL' | 'SET_OVERRIDE' | 'CLEAR_OVERRIDE';
    service: ServiceCatalogItem;
    targetState?: ServiceStateEnum;
    orgId?: string;
  } | null>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [mutationError, setMutationError] = useState<string | null>(null);

  // RBAC Permission check
  const canMutate =
    operator?.role === 'PLATFORM_SUPER_ADMIN' ||
    operator?.role === 'OPERATIONS_ENGINEER';

  // Fetch Authoritative Service Catalog & Organizations
  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const [serviceCatalog, orgList] = await Promise.all([
        controlPlaneApi.listServices(),
        controlPlaneApi.listOrganizations().catch(() => []),
      ]);

      setServices(serviceCatalog || []);
      setOrganizations(orgList || []);

      if (orgList && orgList.length > 0) {
        setSelectedOrgId((prev) => prev || orgList[0].organizationId);
      }
    } catch (err: any) {
      if (err instanceof ControlPlaneApiError) {
        setError(err);
      } else {
        setError(new ControlPlaneApiError(500, err.message || 'Failed to fetch service catalog from Control Plane API'));
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

  // Categories list extracted from catalog
  const categories = useMemo(() => {
    const set = new Set<string>();
    services.forEach((s) => set.add(s.category));
    return Array.from(set).sort();
  }, [services]);

  // Filtered Catalog
  const filteredServices = useMemo(() => {
    return services.filter((s) => {
      const matchesSearch =
        !search.trim() ||
        s.code.toLowerCase().includes(search.toLowerCase()) ||
        s.name.toLowerCase().includes(search.toLowerCase()) ||
        s.category.toLowerCase().includes(search.toLowerCase());

      const matchesCategory = categoryFilter === 'ALL' || s.category === categoryFilter;
      const currentState = s.globalState?.state || 'AVAILABLE';
      const matchesState = stateFilter === 'ALL' || currentState === stateFilter;

      return matchesSearch && matchesCategory && matchesState;
    });
  }, [services, search, categoryFilter, stateFilter]);

  // Statistics Summary
  const stats = useMemo(() => {
    const total = services.length;
    const available = services.filter((s) => (s.globalState?.state || 'AVAILABLE') === 'AVAILABLE').length;
    const disabled = services.filter((s) => s.globalState?.state === 'DISABLED').length;
    const maintenance = services.filter((s) => s.globalState?.state === 'MAINTENANCE').length;
    const commercialDisabled = services.filter((s) => s.globalState?.state === 'COMMERCIAL_DISABLED').length;
    return { total, available, disabled, maintenance, commercialDisabled };
  }, [services]);

  // Selected Organization Details
  const selectedOrg = useMemo(() => {
    return organizations.find((o) => o.organizationId === selectedOrgId);
  }, [organizations, selectedOrgId]);

  // Execute State Mutation via API
  const handleExecuteMutation = async (reason?: string) => {
    if (!mutationTarget) return;
    setIsSubmitting(true);
    setMutationError(null);

    try {
      if (mutationTarget.type === 'GLOBAL' && mutationTarget.targetState) {
        await controlPlaneApi.updateGlobalServiceState(mutationTarget.service.code, {
          state: mutationTarget.targetState,
          reason: reason || 'Global service state update via Control Panel',
        });
      } else if (mutationTarget.type === 'SET_OVERRIDE' && mutationTarget.targetState && mutationTarget.orgId) {
        await controlPlaneApi.setOrganizationServiceOverride(mutationTarget.orgId, mutationTarget.service.code, {
          overrideState: mutationTarget.targetState,
          reason: reason || 'Organization service override set via Control Panel',
        });
      } else if (mutationTarget.type === 'CLEAR_OVERRIDE' && mutationTarget.orgId) {
        await controlPlaneApi.clearOrganizationServiceOverride(mutationTarget.orgId, mutationTarget.service.code);
      }

      setMutationTarget(null);
      await fetchData();
    } catch (err: any) {
      if (err instanceof ControlPlaneApiError) {
        setMutationError(err.message);
      } else {
        setMutationError(err.message || 'Operation failed due to server error');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // State Badge Renderer
  const renderServiceBadge = (state: ServiceStateEnum) => {
    switch (state) {
      case 'AVAILABLE':
        return <StatusBadge status="ACTIVE" label="AVAILABLE" size="sm" />;
      case 'DISABLED':
        return <StatusBadge status="DISABLED" label="DISABLED" size="sm" />;
      case 'MAINTENANCE':
        return <StatusBadge status="SUSPENDED" label="MAINTENANCE" size="sm" />;
      case 'COMMERCIAL_DISABLED':
        return <StatusBadge status="REVOKED" label="COMMERCIAL DISABLED" size="sm" />;
      default:
        return <StatusBadge status={state} size="sm" />;
    }
  };

  if (isAuthLoading || (isLoading && services.length === 0 && !error)) {
    return (
      <div className="flex h-64 items-center justify-center">
        <RefreshCw className="h-6 w-6 animate-spin text-aravBlue-400" />
      </div>
    );
  }

  if (error && error.statusCode === 403) {
    return (
      <AccessDenied
        resource="Service Capability Control API"
        requiredRole="Authorized Operations Engineer / Platform Super Admin / Auditor"
      />
    );
  }

  if (error) {
    return (
      <ErrorState
        statusCode={error.statusCode}
        title="Failed to load Service Capability Catalog"
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
            <Layers className="h-6 w-6 text-aravBlue-400" />
            <h1 className="text-xl font-bold text-white tracking-tight">Service Capability Control Management</h1>
          </div>
          <p className="mt-1 text-xs text-gray-400 font-mono">
            Authoritative Control Plane kill-switches, global capability states, and organization-level feature overrides.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {canMutate ? (
            <div className="flex items-center gap-1.5 rounded-md border border-emerald-800/60 bg-emerald-950/40 px-3 py-1 text-xs font-mono text-emerald-300">
              <Zap className="h-3.5 w-3.5 text-emerald-400" />
              <span>Operator Mutate Enabled ({operator?.role})</span>
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

      {/* KPI Stats Strip */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-5 font-mono">
        <div className="rounded-lg border border-cpDark-800 bg-cpDark-900 p-4 shadow-md">
          <span className="text-[11px] font-medium uppercase tracking-wider text-gray-400">Total Capabilities</span>
          <div className="mt-1 text-2xl font-bold text-white">{stats.total}</div>
        </div>

        <div className="rounded-lg border border-cpDark-800 bg-cpDark-900 p-4 shadow-md">
          <span className="text-[11px] font-medium uppercase tracking-wider text-emerald-400">Globally Available</span>
          <div className="mt-1 text-2xl font-bold text-emerald-400">{stats.available}</div>
        </div>

        <div className="rounded-lg border border-cpDark-800 bg-cpDark-900 p-4 shadow-md">
          <span className="text-[11px] font-medium uppercase tracking-wider text-rose-400">Globally Disabled</span>
          <div className="mt-1 text-2xl font-bold text-rose-400">{stats.disabled}</div>
        </div>

        <div className="rounded-lg border border-cpDark-800 bg-cpDark-900 p-4 shadow-md">
          <span className="text-[11px] font-medium uppercase tracking-wider text-amber-400">Maintenance</span>
          <div className="mt-1 text-2xl font-bold text-amber-400">{stats.maintenance}</div>
        </div>

        <div className="rounded-lg border border-cpDark-800 bg-cpDark-900 p-4 shadow-md">
          <span className="text-[11px] font-medium uppercase tracking-wider text-orange-400">Commercial Disabled</span>
          <div className="mt-1 text-2xl font-bold text-orange-300">{stats.commercialDisabled}</div>
        </div>
      </div>

      {/* Primacy & Rules Guidance Banner */}
      <div className="rounded-lg border border-cpDark-800 bg-cpDark-950 p-4 font-mono text-xs text-gray-300 space-y-2">
        <div className="flex items-center gap-2 font-bold text-aravBlue-300">
          <Info className="h-4 w-4 text-aravBlue-400 shrink-0" />
          <span>Capability Resolution & Commercial Primacy Architecture</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1 text-[11px] text-gray-400">
          <div className="rounded border border-cpDark-800 bg-cpDark-900/60 p-2.5">
            <span className="font-bold text-emerald-400 block mb-1">1. Commercial Primacy</span>
            If a capability is <code className="text-orange-300">COMMERCIAL_DISABLED</code> by license, organization overrides CANNOT grant access. License restrictions override all organization settings.
          </div>
          <div className="rounded border border-cpDark-800 bg-cpDark-900/60 p-2.5">
            <span className="font-bold text-rose-400 block mb-1">2. Operational Kill Switch</span>
            Platform super admins can set global state to <code className="text-rose-300">DISABLED</code> or <code className="text-amber-300">MAINTENANCE</code> to pause processing across all Data Plane deployments instantly.
          </div>
          <div className="rounded border border-cpDark-800 bg-cpDark-900/60 p-2.5">
            <span className="font-bold text-aravBlue-400 block mb-1">3. Organization Overrides</span>
            Operators can configure organization-specific overrides (<code className="text-emerald-300">AVAILABLE</code> or <code className="text-rose-300">DISABLED</code>) or restore global inheritance.
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex border-b border-cpDark-800">
        <button
          onClick={() => setActiveTab('catalog')}
          className={`flex items-center gap-2 px-5 py-3 font-mono text-xs font-semibold border-b-2 transition-colors ${
            activeTab === 'catalog'
              ? 'border-aravBlue-400 text-white bg-cpDark-900/60'
              : 'border-transparent text-gray-400 hover:text-gray-200'
          }`}
        >
          <Sliders className="h-4 w-4" />
          <span>Global Capability Catalog ({services.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('overrides')}
          className={`flex items-center gap-2 px-5 py-3 font-mono text-xs font-semibold border-b-2 transition-colors ${
            activeTab === 'overrides'
              ? 'border-aravBlue-400 text-white bg-cpDark-900/60'
              : 'border-transparent text-gray-400 hover:text-gray-200'
          }`}
        >
          <Building2 className="h-4 w-4" />
          <span>Organization Overrides View ({organizations.length} Orgs)</span>
        </button>
      </div>

      {/* TAB 1: GLOBAL CAPABILITY CATALOG */}
      {activeTab === 'catalog' && (
        <div className="space-y-4">
          {/* Filters Bar */}
          <div className="flex flex-col gap-3 rounded-lg border border-cpDark-800 bg-cpDark-900 p-4 sm:flex-row sm:items-center sm:justify-between shadow-lg">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search capability code, name, category..."
                className="w-full rounded-md border border-cpDark-700 bg-cpDark-950 pl-9 pr-4 py-2 text-xs font-mono text-white placeholder-gray-500 focus-ring"
              />
            </div>

            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-gray-400 shrink-0" />
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="rounded-md border border-cpDark-700 bg-cpDark-950 px-3 py-2 text-xs font-mono text-gray-300 focus-ring"
              >
                <option value="ALL">All Categories</option>
                {categories.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>

              <select
                value={stateFilter}
                onChange={(e) => setStateFilter(e.target.value)}
                className="rounded-md border border-cpDark-700 bg-cpDark-950 px-3 py-2 text-xs font-mono text-gray-300 focus-ring"
              >
                <option value="ALL">All States</option>
                <option value="AVAILABLE">AVAILABLE</option>
                <option value="DISABLED">DISABLED</option>
                <option value="MAINTENANCE">MAINTENANCE</option>
                <option value="COMMERCIAL_DISABLED">COMMERCIAL_DISABLED</option>
              </select>
            </div>
          </div>

          {/* Catalog Table */}
          <div className="rounded-lg border border-cpDark-800 bg-cpDark-900 shadow-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-mono">
                <thead className="border-b border-cpDark-800 bg-cpDark-950 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                  <tr>
                    <th scope="col" className="px-4 py-3">Capability Code</th>
                    <th scope="col" className="px-4 py-3">Capability Name</th>
                    <th scope="col" className="px-4 py-3">Category</th>
                    <th scope="col" className="px-4 py-3">Processing / Overrides</th>
                    <th scope="col" className="px-4 py-3">Global State</th>
                    <th scope="col" className="px-4 py-3">State Reason</th>
                    <th scope="col" className="px-4 py-3 text-right">Global Operator Controls</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-cpDark-800/60 text-gray-300">
                  {filteredServices.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-12 text-center text-gray-500 italic">
                        No service capability codes match the selected criteria.
                      </td>
                    </tr>
                  ) : (
                    filteredServices.map((service) => {
                      const globalState = service.globalState?.state || 'AVAILABLE';
                      const reason = service.globalState?.reason || 'Default capability availability';
                      const seq = service.globalState?.sequence || '1';

                      return (
                        <tr key={service.id} className="hover:bg-cpDark-800/40 transition-colors">
                          <td className="px-4 py-3 font-bold text-aravBlue-300">
                            {service.code}
                          </td>
                          <td className="px-4 py-3 font-semibold text-white">
                            {service.name}
                          </td>
                          <td className="px-4 py-3">
                            <span className="rounded bg-cpDark-800 border border-cpDark-700 px-2 py-0.5 text-[10px] text-gray-300">
                              {service.category}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1.5 text-[11px]">
                              {service.hasBackgroundProcessing ? (
                                <span className="text-amber-400 font-semibold" title="Background worker gate enabled">
                                  Worker Gate
                                </span>
                              ) : (
                                <span className="text-gray-500">Sync API</span>
                              )}
                              <span className="text-gray-600">•</span>
                              {service.isOrgOverridePermitted ? (
                                <span className="text-emerald-400">Override Allowed</span>
                              ) : (
                                <span className="text-rose-400">Global Locked</span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            {renderServiceBadge(globalState)}
                          </td>
                          <td className="px-4 py-3 max-w-xs truncate text-[11px] text-gray-400" title={reason}>
                            <div className="flex flex-col">
                              <span>{reason}</span>
                              <span className="text-[10px] text-gray-500 font-mono">Seq: {seq}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right">
                            {canMutate ? (
                              <div className="flex items-center justify-end gap-1.5">
                                {globalState !== 'AVAILABLE' && (
                                  <button
                                    onClick={() => setMutationTarget({ type: 'GLOBAL', service, targetState: 'AVAILABLE' })}
                                    className="rounded bg-emerald-950 text-emerald-300 border border-emerald-800 px-2 py-0.5 text-[11px] font-semibold hover:bg-emerald-900"
                                    title="Set global state to AVAILABLE"
                                  >
                                    Enable
                                  </button>
                                )}

                                {globalState !== 'DISABLED' && (
                                  <button
                                    onClick={() => setMutationTarget({ type: 'GLOBAL', service, targetState: 'DISABLED' })}
                                    className="rounded bg-rose-950 text-rose-300 border border-rose-800 px-2 py-0.5 text-[11px] font-semibold hover:bg-rose-900"
                                    title="Set global state to DISABLED (Global Kill Switch)"
                                  >
                                    Disable
                                  </button>
                                )}

                                {globalState !== 'MAINTENANCE' && (
                                  <button
                                    onClick={() => setMutationTarget({ type: 'GLOBAL', service, targetState: 'MAINTENANCE' })}
                                    className="rounded bg-amber-950 text-amber-300 border border-amber-800 px-2 py-0.5 text-[11px] font-semibold hover:bg-amber-900"
                                    title="Set global state to MAINTENANCE"
                                  >
                                    Maintenance
                                  </button>
                                )}

                                {globalState !== 'COMMERCIAL_DISABLED' && (
                                  <button
                                    onClick={() => setMutationTarget({ type: 'GLOBAL', service, targetState: 'COMMERCIAL_DISABLED' })}
                                    className="rounded bg-orange-950 text-orange-300 border border-orange-800 px-2 py-0.5 text-[11px] font-semibold hover:bg-orange-900"
                                    title="Set global state to COMMERCIAL_DISABLED (License Primacy)"
                                  >
                                    Comm. Disable
                                  </button>
                                )}
                              </div>
                            ) : (
                              <span className="text-[11px] text-gray-500 italic">Read-Only</span>
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

      {/* TAB 2: ORGANIZATION OVERRIDES VIEW */}
      {activeTab === 'overrides' && (
        <div className="space-y-4">
          {/* Org Selector Card */}
          <div className="rounded-lg border border-cpDark-800 bg-cpDark-900 p-4 shadow-lg space-y-3 font-mono">
            <label htmlFor="service-org-selector" className="block text-xs font-bold uppercase tracking-wider text-gray-400">
              Select Target Organization for Effective Capability State & Overrides:
            </label>

            <div className="flex flex-col sm:flex-row gap-3">
              <select
                id="service-org-selector"
                value={selectedOrgId}
                onChange={(e) => setSelectedOrgId(e.target.value)}
                className="flex-1 rounded-md border border-cpDark-700 bg-cpDark-950 px-3 py-2 text-xs font-mono text-white focus-ring"
              >
                {organizations.length === 0 ? (
                  <option value="">No organizations available</option>
                ) : (
                  organizations.map((org) => (
                    <option key={org.organizationId} value={org.organizationId}>
                      {org.organizationId} — ({org.state})
                    </option>
                  ))
                )}
              </select>

              {selectedOrg && (
                <div className="flex items-center gap-2 rounded border border-cpDark-800 bg-cpDark-950 px-3 py-2 text-xs text-gray-300">
                  <Building2 className="h-4 w-4 text-aravBlue-400 shrink-0" />
                  <span>State: <strong className="text-white">{selectedOrg.state}</strong></span>
                  <span className="text-gray-600">•</span>
                  <span>Seq: <span className="text-gray-400">{selectedOrg.sequence}</span></span>
                </div>
              )}
            </div>
          </div>

          {/* Org Override Capabilities Table */}
          <div className="rounded-lg border border-cpDark-800 bg-cpDark-900 shadow-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-mono">
                <thead className="border-b border-cpDark-800 bg-cpDark-950 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                  <tr>
                    <th scope="col" className="px-4 py-3">Capability Code</th>
                    <th scope="col" className="px-4 py-3">Capability Name</th>
                    <th scope="col" className="px-4 py-3">Global Base State</th>
                    <th scope="col" className="px-4 py-3">Organization Override State</th>
                    <th scope="col" className="px-4 py-3">Effective Resolved State</th>
                    <th scope="col" className="px-4 py-3 text-right">Organization Operator Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-cpDark-800/60 text-gray-300">
                  {services.map((service) => {
                    const globalState = service.globalState?.state || 'AVAILABLE';
                    const isCommerciallyDisabled = globalState === 'COMMERCIAL_DISABLED';

                    // Compute effective resolution according to backend primacy rules
                    let effectiveState: ServiceStateEnum = globalState;
                    let overrideState: string = 'INHERITED';

                    if (isCommerciallyDisabled) {
                      effectiveState = 'COMMERCIAL_DISABLED';
                    }

                    return (
                      <tr key={service.id} className="hover:bg-cpDark-800/40 transition-colors">
                        <td className="px-4 py-3 font-bold text-aravBlue-300">
                          {service.code}
                        </td>
                        <td className="px-4 py-3 font-semibold text-white">
                          {service.name}
                        </td>
                        <td className="px-4 py-3">
                          {renderServiceBadge(globalState)}
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-gray-500 italic text-[11px]">Inheriting Global State</span>
                        </td>
                        <td className="px-4 py-3">
                          {renderServiceBadge(effectiveState)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {canMutate ? (
                            <div className="flex items-center justify-end gap-1.5">
                              {!isCommerciallyDisabled ? (
                                <button
                                  onClick={() =>
                                    setMutationTarget({
                                      type: 'SET_OVERRIDE',
                                      service,
                                      targetState: 'AVAILABLE',
                                      orgId: selectedOrgId,
                                    })
                                  }
                                  className="rounded bg-emerald-950 text-emerald-300 border border-emerald-800 px-2 py-0.5 text-[11px] font-semibold hover:bg-emerald-900"
                                  title="Set organization override to AVAILABLE"
                                >
                                  Enable Org
                                </button>
                              ) : (
                                <button
                                  disabled
                                  className="rounded bg-gray-900 text-gray-600 border border-gray-800 px-2 py-0.5 text-[11px] cursor-not-allowed"
                                  title="Cannot override to AVAILABLE when global state is COMMERCIAL_DISABLED (License Primacy)"
                                >
                                  Comm. Restricted
                                </button>
                              )}

                              <button
                                onClick={() =>
                                  setMutationTarget({
                                    type: 'SET_OVERRIDE',
                                    service,
                                    targetState: 'DISABLED',
                                    orgId: selectedOrgId,
                                  })
                                }
                                className="rounded bg-rose-950 text-rose-300 border border-rose-800 px-2 py-0.5 text-[11px] font-semibold hover:bg-rose-900"
                                title="Set organization override to DISABLED"
                              >
                                Disable Org
                              </button>
                            </div>
                          ) : (
                            <span className="text-[11px] text-gray-500 italic">Read-Only</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Dialog for State Mutations */}
      <ConfirmationDialog
        isOpen={!!mutationTarget}
        title={
          mutationTarget?.type === 'GLOBAL'
            ? `Global State Mutation: ${mutationTarget.service.code} -> ${mutationTarget.targetState}`
            : mutationTarget?.type === 'SET_OVERRIDE'
            ? `Set Org Override: ${mutationTarget.orgId} / ${mutationTarget.service.code} -> ${mutationTarget.targetState}`
            : `Clear Org Override: ${mutationTarget?.orgId} / ${mutationTarget?.service.code}`
        }
        explanation={
          mutationTarget?.type === 'GLOBAL'
            ? `Transitioning global operational capability state of "${mutationTarget.service.code}" to "${mutationTarget.targetState}". This state signal propagates to Data Plane background workers and API guards.`
            : mutationTarget?.type === 'SET_OVERRIDE'
            ? `Applying organization-specific capability override "${mutationTarget.targetState}" for service "${mutationTarget.service.code}" on org "${mutationTarget.orgId}".`
            : `Removing organization override for service "${mutationTarget?.service.code}" on org "${mutationTarget?.orgId}". Org will restore inheritance from global state.`
        }
        consequence={
          mutationTarget?.targetState === 'COMMERCIAL_DISABLED'
            ? 'License Primacy Enforced: Setting state to COMMERCIAL_DISABLED prevents all organization overrides from enabling this capability.'
            : mutationTarget?.targetState === 'DISABLED'
            ? 'Kill Switch Activated: Data Plane runtime execution and API routes for this capability will be immediately blocked.'
            : 'Capability execution will be enabled for authorized tenant requests.'
        }
        reasonRequired={true}
        confirmButtonText={
          mutationTarget?.type === 'CLEAR_OVERRIDE' ? 'Restore Global Inheritance' : 'Execute State Mutation'
        }
        confirmVariant={
          mutationTarget?.targetState === 'DISABLED' || mutationTarget?.targetState === 'COMMERCIAL_DISABLED'
            ? 'danger'
            : 'primary'
        }
        isLoading={isSubmitting}
        errorMessage={mutationError}
        onConfirm={handleExecuteMutation}
        onCancel={() => {
          setMutationTarget(null);
          setMutationError(null);
        }}
      />
    </div>
  );
}
