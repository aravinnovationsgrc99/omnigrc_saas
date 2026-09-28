'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  CreditCard,
  Search,
  RefreshCw,
  Eye,
  Plus,
  PauseCircle,
  PlayCircle,
  Ban,
  ShieldCheck,
  Building2,
  Calendar,
  Layers,
  Server,
  X,
  Loader2,
} from 'lucide-react';
import { useAuth } from '../../lib/auth-context';
import {
  controlPlaneApi,
  ControlPlaneApiError,
} from '../../lib/control-plane-api';
import {
  LicenseDto,
  LicenseStatusType,
  CustomerDto,
  CommercialAgreementDto,
} from '../../types/control-plane';
import { StatusBadge } from '../../components/ui/status-badge';
import { ConfirmationDialog } from '../../components/ui/confirmation-dialog';
import { ErrorState } from '../../components/ui/error-state';
import { AccessDenied } from '../../components/ui/access-denied';

type FilterTab = 'ALL' | LicenseStatusType;

export default function LicensingPage() {
  const { operator, isAuthenticated, isLoading: isAuthLoading } = useAuth();

  const [licenses, setLicenses] = useState<LicenseDto[]>([]);
  const [customers, setCustomers] = useState<CustomerDto[]>([]);
  const [agreements, setAgreements] = useState<CommercialAgreementDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<ControlPlaneApiError | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<FilterTab>('ALL');

  // Create License Form Modal State
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [createAgreementId, setCreateAgreementId] = useState('');
  const [createProduct, setCreateProduct] = useState('OMNIGRC');
  const [createStatus, setCreateStatus] = useState<LicenseStatusType>('TRIAL');
  const [createStartsAt, setCreateStartsAt] = useState('');
  const [createExpiresAt, setCreateExpiresAt] = useState('');
  const [createMaxDeployments, setCreateMaxDeployments] = useState(1);
  const [isSubmittingCreate, setIsSubmittingCreate] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Quick Customer / Agreement Inline Creation Modal State
  const [isCreateCustomerOpen, setIsCreateCustomerOpen] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState('');
  const [isSubmittingCustomer, setIsSubmittingCustomer] = useState(false);

  // Lifecycle Transition Modal State
  const [activeModalLicense, setActiveModalLicense] = useState<LicenseDto | null>(null);
  const [actionType, setActionType] = useState<'SUSPEND' | 'REACTIVATE' | 'REVOKE' | null>(null);
  const [isSubmittingAction, setIsSubmittingAction] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const canMutate =
    operator?.role === 'PLATFORM_SUPER_ADMIN' ||
    operator?.role === 'COMMERCIAL_OPERATOR';

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [licData, custData, agrData] = await Promise.all([
        controlPlaneApi.listLicenses(),
        controlPlaneApi.listCustomers().catch(() => []),
        controlPlaneApi.listCommercialAgreements().catch(() => []),
      ]);
      setLicenses(licData || []);
      setCustomers(custData || []);
      setAgreements(agrData || []);
    } catch (err: any) {
      if (err instanceof ControlPlaneApiError) {
        setError(err);
      } else {
        setError(
          new ControlPlaneApiError(
            500,
            err.message || 'Failed to fetch commercial license records',
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

  // Set default form timestamps when create modal opens
  useEffect(() => {
    if (isCreateModalOpen) {
      const now = new Date();
      const oneYearLater = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);
      setCreateStartsAt(now.toISOString().slice(0, 16));
      setCreateExpiresAt(oneYearLater.toISOString().slice(0, 16));
      setCreateError(null);
      if (agreements.length > 0 && !createAgreementId) {
        setCreateAgreementId(agreements[0].id);
      }
    }
  }, [isCreateModalOpen, agreements, createAgreementId]);

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
        resource="Commercial Licensing & Entitlements"
        requiredRole="Authorized Commercial Control Operator"
      />
    );
  }

  // Filtering & Search
  const filteredLicenses = licenses.filter((lic) => {
    const matchesTab = activeTab === 'ALL' || lic.status === activeTab;
    const query = searchQuery.trim().toLowerCase();
    if (!query) return matchesTab;

    const matchesId = lic.id.toLowerCase().includes(query);
    const matchesAgr = lic.commercialAgreementId.toLowerCase().includes(query);
    const matchesEnt = lic.entitlements.some((e) => e.code.toLowerCase().includes(query));
    const matchesDep = lic.deployments?.some((d) => d.id.toLowerCase().includes(query) || d.organizationId.toLowerCase().includes(query));

    return matchesTab && (matchesId || matchesAgr || matchesEnt || matchesDep);
  });

  const handleOpenCreateModal = () => {
    setIsCreateModalOpen(true);
  };

  const handleCreateCustomerAndAgreement = async () => {
    if (!newCustomerName.trim()) return;
    setIsSubmittingCustomer(true);
    try {
      const customer = await controlPlaneApi.createCustomer(newCustomerName.trim());
      const agreement = await controlPlaneApi.createCommercialAgreement(customer.id);
      setCustomers((prev) => [customer, ...prev]);
      setAgreements((prev) => [agreement, ...prev]);
      setCreateAgreementId(agreement.id);
      setNewCustomerName('');
      setIsCreateCustomerOpen(false);
    } catch (err: any) {
      alert(`Customer creation failed: ${err.message || 'Unknown error'}`);
    } finally {
      setIsSubmittingCustomer(false);
    }
  };

  const handleExecuteCreateLicense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createAgreementId) {
      setCreateError('Please select or create a commercial agreement.');
      return;
    }
    setIsSubmittingCreate(true);
    setCreateError(null);

    try {
      await controlPlaneApi.createLicense({
        commercialAgreementId: createAgreementId,
        product: createProduct,
        status: createStatus,
        startsAt: new Date(createStartsAt).toISOString(),
        expiresAt: new Date(createExpiresAt).toISOString(),
        maxDeployments: Number(createMaxDeployments),
      });
      setIsCreateModalOpen(false);
      await fetchData();
    } catch (err: any) {
      if (err instanceof ControlPlaneApiError) {
        setCreateError(err.message || `License creation failed (${err.statusCode})`);
      } else {
        setCreateError(err.message || 'Failed to create commercial license');
      }
    } finally {
      setIsSubmittingCreate(false);
    }
  };

  const handleOpenActionModal = (lic: LicenseDto, action: 'SUSPEND' | 'REACTIVATE' | 'REVOKE') => {
    setActiveModalLicense(lic);
    setActionType(action);
    setActionError(null);
  };

  const handleCloseActionModal = () => {
    setActiveModalLicense(null);
    setActionType(null);
    setActionError(null);
  };

  const handleExecuteLifecycleAction = async (reason?: string) => {
    if (!activeModalLicense || !actionType) return;
    setIsSubmittingAction(true);
    setActionError(null);

    const licId = activeModalLicense.id;

    try {
      if (actionType === 'SUSPEND') {
        await controlPlaneApi.suspendLicense(licId, reason);
      } else if (actionType === 'REACTIVATE') {
        await controlPlaneApi.reactivateLicense(licId, reason);
      } else if (actionType === 'REVOKE') {
        await controlPlaneApi.revokeLicense(licId, reason);
      }
      handleCloseActionModal();
      await fetchData();
    } catch (err: any) {
      if (err instanceof ControlPlaneApiError) {
        setActionError(err.message || `Action failed (${err.statusCode})`);
      } else {
        setActionError(err.message || 'An unexpected error occurred during state mutation');
      }
    } finally {
      setIsSubmittingAction(false);
    }
  };

  const getActionModalProps = () => {
    if (!activeModalLicense || !actionType) {
      return {
        title: '',
        explanation: '',
        consequence: '',
        confirmPhrase: undefined,
        confirmVariant: 'danger' as const,
        confirmButtonText: 'Confirm',
      };
    }

    const licId = activeModalLicense.id;
    const currentStatus = activeModalLicense.status;

    switch (actionType) {
      case 'SUSPEND':
        return {
          title: `Suspend Commercial License ${licId}`,
          explanation: `Transitioning commercial license state from [${currentStatus}] to [SUSPENDED]. Entitlement evaluation across Data Plane endpoints will return SUSPENDED.`,
          consequence: 'Services will reject unlicensed functionality. Organization lifecycle state remains independent.',
          confirmPhrase: undefined,
          confirmVariant: 'warning' as const,
          confirmButtonText: 'Suspend License',
        };

      case 'REACTIVATE':
        return {
          title: `Reactivate Commercial License ${licId}`,
          explanation: `Transitioning commercial license state from [${currentStatus}] to [ACTIVE].`,
          consequence: 'IMPORTANT: Reactivating a commercial license does NOT automatically reactivate a DISABLED or DECOMMISSIONED organization.',
          confirmPhrase: undefined,
          confirmVariant: 'primary' as const,
          confirmButtonText: 'Reactivate License',
        };

      case 'REVOKE':
        return {
          title: `Revoke Commercial License ${licId}`,
          explanation: `HIGH-RISK TERMINAL ACTION: Permanently revoking license ${licId}. Signed artifacts for this license will be invalidated.`,
          consequence: 'This action is permanent and cannot be reversed. Deployments bound to this license will fail runtime entitlement checks.',
          confirmPhrase: `REVOKE ${licId}`,
          confirmVariant: 'danger' as const,
          confirmButtonText: 'Revoke License',
        };

      default:
        return {
          title: 'Confirm Commercial Action',
          explanation: 'Updating commercial state.',
          consequence: '',
          confirmPhrase: undefined,
          confirmVariant: 'danger' as const,
          confirmButtonText: 'Confirm',
        };
    }
  };

  const actionModalProps = getActionModalProps();

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between border-b border-cpDark-800 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <CreditCard className="h-6 w-6 text-aravBlue-400" aria-hidden="true" />
            <h1 className="text-xl font-bold tracking-tight text-white">
              Commercial Licensing &amp; Framework Entitlements
            </h1>
          </div>
          <p className="mt-1 text-xs text-gray-400">
            Authoritative Control Plane commercial license lifecycle &amp; Ed25519 artifact authority.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {canMutate && (
            <button
              onClick={handleOpenCreateModal}
              className="inline-flex items-center gap-1.5 rounded-md bg-aravBlue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-aravBlue-700 focus-ring shadow-md transition-colors"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              <span>Create License</span>
            </button>
          )}

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

      {/* Error state */}
      {error && error.statusCode !== 403 && (
        <ErrorState
          statusCode={error.statusCode}
          title="Failed to fetch commercial licenses"
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
              {(['ALL', 'TRIAL', 'ACTIVE', 'SUSPENDED', 'EXPIRED', 'REVOKED'] as FilterTab[]).map(
                (tab) => {
                  const count =
                    tab === 'ALL'
                      ? licenses.length
                      : licenses.filter((l) => l.status === tab).length;
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
                placeholder="Search License ID, Agreement ID..."
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
                  <th scope="col" className="px-4 py-3">License ID</th>
                  <th scope="col" className="px-4 py-3">Product</th>
                  <th scope="col" className="px-4 py-3">Status</th>
                  <th scope="col" className="px-4 py-3">Agreement ID</th>
                  <th scope="col" className="px-4 py-3">Validity Range</th>
                  <th scope="col" className="px-4 py-3 text-center">Quota</th>
                  <th scope="col" className="px-4 py-3">Framework Entitlements</th>
                  <th scope="col" className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-cpDark-800/60 font-mono text-gray-300">
                {isLoading && (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-gray-400">
                      <div className="flex items-center justify-center gap-2">
                        <RefreshCw className="h-4 w-4 animate-spin text-aravBlue-400" />
                        <span>Loading commercial license records...</span>
                      </div>
                    </td>
                  </tr>
                )}

                {!isLoading && filteredLicenses.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-12 text-center text-gray-400">
                      <div className="flex flex-col items-center gap-2">
                        <CreditCard className="h-8 w-8 text-cpDark-600" aria-hidden="true" />
                        <span className="font-semibold text-gray-300">No Commercial Licenses Discovered</span>
                        <span className="text-xs text-gray-500 max-w-sm">
                          {searchQuery || activeTab !== 'ALL'
                            ? `No records match filter "${activeTab}" or search query "${searchQuery}".`
                            : 'No commercial licenses registered in Control Plane storage.'}
                        </span>
                      </div>
                    </td>
                  </tr>
                )}

                {!isLoading &&
                  filteredLicenses.map((lic) => {
                    const activeEntCount = lic.entitlements.filter((e) => e.enabled).length;
                    const isExpired = new Date().getTime() > new Date(lic.expiresAt).getTime();

                    return (
                      <tr key={lic.id} className="hover:bg-cpDark-800/40 transition-colors">
                        {/* License ID */}
                        <td className="px-4 py-3 font-semibold text-white">
                          <Link
                            href={`/licensing/${encodeURIComponent(lic.id)}`}
                            className="text-aravBlue-400 hover:underline inline-flex items-center gap-1.5"
                          >
                            <span>{lic.id}</span>
                          </Link>
                        </td>

                        {/* Product */}
                        <td className="px-4 py-3">
                          <span className="rounded bg-cpDark-800 border border-cpDark-700 px-2 py-0.5 text-[11px] text-gray-300 font-bold">
                            {lic.product}
                          </span>
                        </td>

                        {/* Status */}
                        <td className="px-4 py-3">
                          <StatusBadge status={isExpired && lic.status !== 'REVOKED' ? 'EXPIRED' : lic.status} />
                        </td>

                        {/* Commercial Agreement ID */}
                        <td className="px-4 py-3 text-gray-400 text-[11px]">
                          {lic.commercialAgreementId}
                        </td>

                        {/* Validity Range */}
                        <td className="px-4 py-3 text-gray-300 text-[11px] whitespace-nowrap">
                          {new Date(lic.startsAt).toLocaleDateString()} &rarr; {new Date(lic.expiresAt).toLocaleDateString()}
                        </td>

                        {/* Quota */}
                        <td className="px-4 py-3 text-center font-bold">
                          <span className={`${(lic.deploymentsCount || 0) >= lic.maxDeployments ? 'text-amber-400' : 'text-emerald-400'}`}>
                            {lic.deploymentsCount || 0}
                          </span>
                          <span className="text-gray-500"> / {lic.maxDeployments}</span>
                        </td>

                        {/* Entitlements */}
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center gap-1 rounded bg-aravBlue-950/60 border border-aravBlue-800/60 px-2 py-0.5 text-[11px] text-aravBlue-300">
                            <Layers className="h-3 w-3" />
                            <span>{activeEntCount} active</span>
                          </span>
                        </td>

                        {/* Actions */}
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1.5">
                            <Link
                              href={`/licensing/${encodeURIComponent(lic.id)}`}
                              className="inline-flex items-center gap-1 rounded border border-cpDark-700 bg-cpDark-800 px-2 py-1 text-[11px] text-gray-300 hover:bg-cpDark-700 hover:text-white focus-ring"
                              title="Inspect license details"
                            >
                              <Eye className="h-3 w-3" />
                              <span>Inspect</span>
                            </Link>

                            {canMutate && lic.status === 'ACTIVE' && (
                              <>
                                <button
                                  onClick={() => handleOpenActionModal(lic, 'SUSPEND')}
                                  className="inline-flex items-center gap-1 rounded bg-amber-950/80 border border-amber-800 text-amber-300 px-2 py-1 text-[11px] hover:bg-amber-900 focus-ring"
                                  title="Suspend commercial license"
                                >
                                  <PauseCircle className="h-3 w-3" />
                                  <span>Suspend</span>
                                </button>
                                <button
                                  onClick={() => handleOpenActionModal(lic, 'REVOKE')}
                                  className="inline-flex items-center gap-1 rounded bg-rose-950/80 border border-rose-800 text-rose-300 px-2 py-1 text-[11px] hover:bg-rose-900 focus-ring"
                                  title="Revoke license permanently"
                                >
                                  <Ban className="h-3 w-3" />
                                  <span>Revoke</span>
                                </button>
                              </>
                            )}

                            {canMutate && lic.status === 'TRIAL' && (
                              <>
                                <button
                                  onClick={() => handleOpenActionModal(lic, 'SUSPEND')}
                                  className="inline-flex items-center gap-1 rounded bg-amber-950/80 border border-amber-800 text-amber-300 px-2 py-1 text-[11px] hover:bg-amber-900 focus-ring"
                                  title="Suspend trial license"
                                >
                                  <PauseCircle className="h-3 w-3" />
                                  <span>Suspend</span>
                                </button>
                                <button
                                  onClick={() => handleOpenActionModal(lic, 'REVOKE')}
                                  className="inline-flex items-center gap-1 rounded bg-rose-950/80 border border-rose-800 text-rose-300 px-2 py-1 text-[11px] hover:bg-rose-900 focus-ring"
                                  title="Revoke trial license"
                                >
                                  <Ban className="h-3 w-3" />
                                  <span>Revoke</span>
                                </button>
                              </>
                            )}

                            {canMutate && lic.status === 'SUSPENDED' && (
                              <>
                                <button
                                  onClick={() => handleOpenActionModal(lic, 'REACTIVATE')}
                                  className="inline-flex items-center gap-1 rounded bg-emerald-950/80 border border-emerald-800 text-emerald-300 px-2 py-1 text-[11px] hover:bg-emerald-900 focus-ring"
                                  title="Reactivate commercial license"
                                >
                                  <PlayCircle className="h-3 w-3" />
                                  <span>Reactivate</span>
                                </button>
                                <button
                                  onClick={() => handleOpenActionModal(lic, 'REVOKE')}
                                  className="inline-flex items-center gap-1 rounded bg-rose-950/80 border border-rose-800 text-rose-300 px-2 py-1 text-[11px] hover:bg-rose-900 focus-ring"
                                  title="Revoke license permanently"
                                >
                                  <Ban className="h-3 w-3" />
                                  <span>Revoke</span>
                                </button>
                              </>
                            )}

                            {lic.status === 'REVOKED' && (
                              <span className="text-[10px] text-rose-400 italic uppercase">
                                Revoked (Terminal)
                              </span>
                            )}

                            {!canMutate && lic.status !== 'REVOKED' && (
                              <span className="text-[10px] text-gray-500 italic">
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

      {/* Create License Modal */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm" role="dialog" aria-modal="true">
          <div className="w-full max-w-lg rounded-lg border border-cpDark-700 bg-cpDark-900 p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-cpDark-800 pb-3">
              <div className="flex items-center gap-2">
                <CreditCard className="h-5 w-5 text-aravBlue-400" />
                <h3 className="text-base font-bold text-white">Create Commercial License</h3>
              </div>
              <button onClick={() => setIsCreateModalOpen(false)} className="text-gray-400 hover:text-white">&times;</button>
            </div>

            <form onSubmit={handleExecuteCreateLicense} className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label htmlFor="select-agreement" className="block text-xs font-medium text-gray-300">
                    Commercial Agreement ID <span className="text-rose-400">*</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => setIsCreateCustomerOpen(true)}
                    className="text-[11px] text-aravBlue-400 hover:underline"
                  >
                    + New Customer &amp; Agreement
                  </button>
                </div>
                {agreements.length > 0 ? (
                  <select
                    id="select-agreement"
                    value={createAgreementId}
                    onChange={(e) => setCreateAgreementId(e.target.value)}
                    className="w-full rounded-md border border-cpDark-700 bg-cpDark-950 p-2.5 text-xs text-white font-mono focus-ring"
                    required
                  >
                    {agreements.map((a) => {
                      const cust = customers.find((c) => c.id === a.customerId);
                      return (
                        <option key={a.id} value={a.id}>
                          {a.id} ({cust ? cust.name : a.customerId})
                        </option>
                      );
                    })}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={createAgreementId}
                    onChange={(e) => setCreateAgreementId(e.target.value)}
                    placeholder="Enter Commercial Agreement UUID"
                    className="w-full rounded-md border border-cpDark-700 bg-cpDark-950 p-2.5 text-xs text-white font-mono focus-ring"
                    required
                  />
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="select-product" className="block text-xs font-medium text-gray-300 mb-1">Product</label>
                  <select
                    id="select-product"
                    value={createProduct}
                    onChange={(e) => setCreateProduct(e.target.value)}
                    className="w-full rounded-md border border-cpDark-700 bg-cpDark-950 p-2 text-xs text-white font-mono focus-ring"
                  >
                    <option value="OMNIGRC">OMNIGRC</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="select-status" className="block text-xs font-medium text-gray-300 mb-1">Initial Status</label>
                  <select
                    id="select-status"
                    value={createStatus}
                    onChange={(e) => setCreateStatus(e.target.value as LicenseStatusType)}
                    className="w-full rounded-md border border-cpDark-700 bg-cpDark-950 p-2 text-xs text-white font-mono focus-ring"
                  >
                    <option value="TRIAL">TRIAL</option>
                    <option value="ACTIVE">ACTIVE</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="starts-at" className="block text-xs font-medium text-gray-300 mb-1">Starts At</label>
                  <input
                    id="starts-at"
                    type="datetime-local"
                    value={createStartsAt}
                    onChange={(e) => setCreateStartsAt(e.target.value)}
                    className="w-full rounded-md border border-cpDark-700 bg-cpDark-950 p-2 text-xs text-white font-mono focus-ring"
                    required
                  />
                </div>

                <div>
                  <label htmlFor="expires-at" className="block text-xs font-medium text-gray-300 mb-1">Expires At</label>
                  <input
                    id="expires-at"
                    type="datetime-local"
                    value={createExpiresAt}
                    onChange={(e) => setCreateExpiresAt(e.target.value)}
                    className="w-full rounded-md border border-cpDark-700 bg-cpDark-950 p-2 text-xs text-white font-mono focus-ring"
                    required
                  />
                </div>
              </div>

              <div>
                <label htmlFor="max-deployments" className="block text-xs font-medium text-gray-300 mb-1">Max Deployments Quota</label>
                <input
                  id="max-deployments"
                  type="number"
                  min="1"
                  value={createMaxDeployments}
                  onChange={(e) => setCreateMaxDeployments(Number(e.target.value))}
                  className="w-full rounded-md border border-cpDark-700 bg-cpDark-950 p-2 text-xs text-white font-mono focus-ring"
                  required
                />
              </div>

              {createError && (
                <div className="rounded border border-rose-800 bg-rose-950/80 p-3 text-xs text-rose-200">
                  {createError}
                </div>
              )}

              <div className="flex justify-end gap-3 border-t border-cpDark-800 pt-4">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="rounded border border-cpDark-700 bg-cpDark-800 px-4 py-2 text-xs text-gray-300 hover:bg-cpDark-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingCreate}
                  className="inline-flex items-center gap-2 rounded bg-aravBlue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-aravBlue-700"
                >
                  {isSubmittingCreate && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  <span>Issue License</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Quick Customer & Agreement Creation Sub-Modal */}
      {isCreateCustomerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-lg border border-cpDark-700 bg-cpDark-900 p-5 shadow-2xl space-y-3">
            <h4 className="text-sm font-bold text-white">Create New Customer Record</h4>
            <input
              type="text"
              value={newCustomerName}
              onChange={(e) => setNewCustomerName(e.target.value)}
              placeholder="e.g. Acme Financial Systems"
              className="w-full rounded border border-cpDark-700 bg-cpDark-950 p-2 text-xs text-white"
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => setIsCreateCustomerOpen(false)} className="px-3 py-1.5 text-xs text-gray-400">Cancel</button>
              <button
                onClick={handleCreateCustomerAndAgreement}
                disabled={isSubmittingCustomer || !newCustomerName.trim()}
                className="rounded bg-aravBlue-600 px-3 py-1.5 text-xs text-white font-semibold"
              >
                {isSubmittingCustomer ? 'Creating...' : 'Create Record'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Action Confirmation Dialog for License Suspend, Reactivate, Revoke */}
      <ConfirmationDialog
        isOpen={!!activeModalLicense && !!actionType}
        title={actionModalProps.title}
        explanation={actionModalProps.explanation}
        consequence={actionModalProps.consequence}
        confirmationPhrase={actionModalProps.confirmPhrase}
        reasonRequired={true}
        confirmButtonText={actionModalProps.confirmButtonText}
        confirmVariant={actionModalProps.confirmVariant}
        isLoading={isSubmittingAction}
        errorMessage={actionError}
        onConfirm={handleExecuteLifecycleAction}
        onCancel={handleCloseActionModal}
      />
    </div>
  );
}
