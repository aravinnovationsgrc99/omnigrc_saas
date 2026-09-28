'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  CreditCard,
  ArrowLeft,
  RefreshCw,
  Shield,
  Activity,
  Layers,
  Server,
  History,
  FileCheck2,
  Lock,
  Plus,
  Trash2,
  PlayCircle,
  PauseCircle,
  Ban,
  CheckCircle2,
  AlertTriangle,
  Info,
  Clock,
  Edit,
  Key,
} from 'lucide-react';
import { useAuth } from '../../../lib/auth-context';
import {
  controlPlaneApi,
  ControlPlaneApiError,
} from '../../../lib/control-plane-api';
import {
  LicenseDto,
  EntitlementDto,
  DeploymentSummary,
  SignedLicenseArtifact,
  CommercialAuditLog,
  LicenseStatusType,
} from '../../../types/control-plane';
import { StatusBadge } from '../../../components/ui/status-badge';
import { ConfirmationDialog } from '../../../components/ui/confirmation-dialog';
import { ErrorState } from '../../../components/ui/error-state';
import { AccessDenied } from '../../../components/ui/access-denied';

const VALID_FRAMEWORKS = [
  { code: 'ISO27001', name: 'ISO/IEC 27001:2022 Information Security' },
  { code: 'ISO42001', name: 'ISO/IEC 42001:2023 Artificial Intelligence' },
  { code: 'SOC2', name: 'SOC 2 Trust Services Criteria' },
  { code: 'GDPR', name: 'EU General Data Protection Regulation' },
  { code: 'DPDP', name: 'India Digital Personal Data Protection Act' },
  { code: 'HIPAA', name: 'HIPAA Security & Privacy Rule' },
];

export default function LicenseDetailPage() {
  const params = useParams();
  const router = useRouter();
  const licenseId = decodeURIComponent((params.licenseId as string) || '');

  const { operator, isAuthenticated, isLoading: isAuthLoading } = useAuth();

  const [license, setLicense] = useState<LicenseDto | null>(null);
  const [history, setHistory] = useState<CommercialAuditLog[]>([]);
  const [allDeployments, setAllDeployments] = useState<DeploymentSummary[]>([]);
  const [signedArtifact, setSignedArtifact] = useState<SignedLicenseArtifact | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<ControlPlaneApiError | null>(null);

  // Update License Metadata Modal State
  const [isUpdateModalOpen, setIsUpdateModalOpen] = useState(false);
  const [updateStartsAt, setUpdateStartsAt] = useState('');
  const [updateExpiresAt, setUpdateExpiresAt] = useState('');
  const [updateMaxDeployments, setUpdateMaxDeployments] = useState(1);
  const [updateReason, setUpdateReason] = useState('');
  const [isSubmittingUpdate, setIsSubmittingUpdate] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);

  // Grant / Update Entitlement Modal State
  const [isEntitlementModalOpen, setIsEntitlementModalOpen] = useState(false);
  const [entCode, setEntCode] = useState('ISO27001');
  const [entVersion, setEntVersion] = useState('');
  const [entEnabled, setEntEnabled] = useState(true);
  const [isSubmittingEntitlement, setIsSubmittingEntitlement] = useState(false);
  const [entitlementError, setEntitlementError] = useState<string | null>(null);

  // Associate Deployment Modal State
  const [isAssociateModalOpen, setIsAssociateModalOpen] = useState(false);
  const [selectedDeploymentId, setSelectedDeploymentId] = useState('');
  const [isSubmittingAssociate, setIsSubmittingAssociate] = useState(false);
  const [associateError, setAssociateError] = useState<string | null>(null);

  // License Confirmation Action Modal State
  const [actionType, setActionType] = useState<'SUSPEND' | 'REACTIVATE' | 'REVOKE' | null>(null);
  const [isSubmittingAction, setIsSubmittingAction] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const canMutate =
    operator?.role === 'PLATFORM_SUPER_ADMIN' ||
    operator?.role === 'COMMERCIAL_OPERATOR';

  const fetchData = useCallback(async () => {
    if (!licenseId) return;
    setIsLoading(true);
    setError(null);

    try {
      const [licData, histData, depData] = await Promise.all([
        controlPlaneApi.getLicense(licenseId),
        controlPlaneApi.getLicenseHistory(licenseId).catch(() => []),
        controlPlaneApi.listDeployments().catch(() => []),
      ]);

      setLicense(licData);
      setHistory(histData || []);
      setAllDeployments(depData || []);

      // If associated deployment exists, fetch signed artifact metadata safely
      if (licData.deployments && licData.deployments.length > 0) {
        controlPlaneApi
          .getSignedArtifact(licenseId, licData.deployments[0].id)
          .then(setSignedArtifact)
          .catch(() => setSignedArtifact(null));
      } else {
        setSignedArtifact(null);
      }
    } catch (err: any) {
      if (err instanceof ControlPlaneApiError) {
        setError(err);
      } else {
        setError(
          new ControlPlaneApiError(
            500,
            err.message || `Failed to fetch license ${licenseId}`,
          ),
        );
      }
    } finally {
      setIsLoading(false);
    }
  }, [licenseId]);

  useEffect(() => {
    if (!isAuthLoading && isAuthenticated) {
      fetchData();
    }
  }, [isAuthLoading, isAuthenticated, fetchData]);

  useEffect(() => {
    if (license && isUpdateModalOpen) {
      setUpdateStartsAt(new Date(license.startsAt).toISOString().slice(0, 16));
      setUpdateExpiresAt(new Date(license.expiresAt).toISOString().slice(0, 16));
      setUpdateMaxDeployments(license.maxDeployments);
      setUpdateReason('');
      setUpdateError(null);
    }
  }, [license, isUpdateModalOpen]);

  if (isAuthLoading || (isLoading && !license && !error)) {
    return (
      <div className="flex h-64 items-center justify-center">
        <RefreshCw className="h-6 w-6 animate-spin text-aravBlue-400" />
      </div>
    );
  }

  if (error && error.statusCode === 403) {
    return (
      <AccessDenied
        resource={`Commercial License ${licenseId}`}
        requiredRole="Authorized Commercial Control Operator"
      />
    );
  }

  if (error && error.statusCode === 404) {
    return (
      <div className="space-y-4">
        <Link
          href="/licensing"
          className="inline-flex items-center gap-1.5 text-xs text-aravBlue-400 hover:underline"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>Back to Licensing List</span>
        </Link>
        <div className="rounded-lg border border-cpDark-800 bg-cpDark-900 p-8 text-center">
          <CreditCard className="mx-auto h-10 w-10 text-gray-500" />
          <h2 className="mt-2 text-lg font-bold text-white">License Not Discovered</h2>
          <p className="mt-1 text-xs text-gray-400">
            No commercial license record exists for ID &quot;{licenseId}&quot;.
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <Link
          href="/licensing"
          className="inline-flex items-center gap-1.5 text-xs text-aravBlue-400 hover:underline"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>Back to Licensing List</span>
        </Link>
        <ErrorState
          statusCode={error.statusCode}
          title="Failed to load license detail"
          message={error.message}
          correlationId={error.correlationId}
          onRetry={fetchData}
        />
      </div>
    );
  }

  if (!license) return null;

  const isExpired = new Date().getTime() > new Date(license.expiresAt).getTime();

  const handleUpdateLicenseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmittingUpdate(true);
    setUpdateError(null);

    try {
      await controlPlaneApi.updateLicense(licenseId, {
        startsAt: new Date(updateStartsAt).toISOString(),
        expiresAt: new Date(updateExpiresAt).toISOString(),
        maxDeployments: Number(updateMaxDeployments),
        reason: updateReason.trim() || 'Commercial metadata updated',
      });
      setIsUpdateModalOpen(false);
      await fetchData();
    } catch (err: any) {
      setUpdateError(err.message || 'Failed to update license metadata');
    } finally {
      setIsSubmittingUpdate(false);
    }
  };

  const handleGrantEntitlementSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmittingEntitlement(true);
    setEntitlementError(null);

    const fullCode = entVersion.trim() ? `${entCode}:${entVersion.trim()}` : entCode;
    const frameworkObj = VALID_FRAMEWORKS.find((f) => f.code === entCode);
    const name = frameworkObj ? `${frameworkObj.name}${entVersion ? ` (${entVersion})` : ''}` : fullCode;

    try {
      await controlPlaneApi.grantOrUpdateEntitlement(licenseId, {
        code: fullCode,
        name,
        enabled: entEnabled,
      });
      setIsEntitlementModalOpen(false);
      await fetchData();
    } catch (err: any) {
      setEntitlementError(err.message || 'Failed to grant entitlement');
    } finally {
      setIsSubmittingEntitlement(false);
    }
  };

  const handleToggleEntitlement = async (ent: EntitlementDto) => {
    if (!canMutate) return;
    try {
      if (ent.enabled) {
        await controlPlaneApi.suspendEntitlement(licenseId, ent.code);
      } else {
        await controlPlaneApi.reactivateEntitlement(licenseId, ent.code);
      }
      await fetchData();
    } catch (err: any) {
      alert(`Entitlement state toggle failed: ${err.message || 'Unknown error'}`);
    }
  };

  const handleRevokeEntitlement = async (code: string) => {
    if (!canMutate) return;
    if (!confirm(`Are you sure you want to revoke entitlement "${code}"?`)) return;
    try {
      await controlPlaneApi.revokeEntitlement(licenseId, code);
      await fetchData();
    } catch (err: any) {
      alert(`Entitlement revocation failed: ${err.message || 'Unknown error'}`);
    }
  };

  const handleAssociateDeploymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDeploymentId) return;
    setIsSubmittingAssociate(true);
    setAssociateError(null);

    try {
      await controlPlaneApi.associateDeployment(licenseId, selectedDeploymentId);
      setIsAssociateModalOpen(false);
      await fetchData();
    } catch (err: any) {
      setAssociateError(err.message || 'Failed to associate deployment');
    } finally {
      setIsSubmittingAssociate(false);
    }
  };

  const handleDisassociateDeployment = async (depId: string) => {
    if (!canMutate) return;
    if (!confirm(`Are you sure you want to disassociate deployment "${depId}" from this license?`)) return;
    try {
      await controlPlaneApi.disassociateDeployment(licenseId, depId);
      await fetchData();
    } catch (err: any) {
      alert(`Deployment disassociation failed: ${err.message || 'Unknown error'}`);
    }
  };

  const handleIssueArtifact = async () => {
    if (!license.deployments || license.deployments.length === 0) {
      alert('Cannot issue artifact: No deployment associated with this license. Associate a deployment first.');
      return;
    }
    try {
      const artifact = await controlPlaneApi.getSignedArtifact(licenseId, license.deployments[0].id);
      setSignedArtifact(artifact);
      await fetchData();
    } catch (err: any) {
      alert(`Artifact issuance failed: ${err.message || 'Unknown error'}`);
    }
  };

  const handleExecuteLifecycleAction = async (reason?: string) => {
    if (!actionType) return;
    setIsSubmittingAction(true);
    setActionError(null);

    try {
      if (actionType === 'SUSPEND') {
        await controlPlaneApi.suspendLicense(licenseId, reason);
      } else if (actionType === 'REACTIVATE') {
        await controlPlaneApi.reactivateLicense(licenseId, reason);
      } else if (actionType === 'REVOKE') {
        await controlPlaneApi.revokeLicense(licenseId, reason);
      }
      setActionType(null);
      await fetchData();
    } catch (err: any) {
      setActionError(err.message || 'Action failed');
    } finally {
      setIsSubmittingAction(false);
    }
  };

  const getActionModalProps = () => {
    if (!actionType) return { title: '', explanation: '', consequence: '', confirmPhrase: undefined, confirmVariant: 'danger' as const, confirmButtonText: 'Confirm' };
    switch (actionType) {
      case 'SUSPEND':
        return {
          title: `Suspend License ${licenseId}`,
          explanation: `Transitioning license state to SUSPENDED. Entitlements will be suspended in signed artifacts.`,
          consequence: 'Data Plane runtime checks will reject unlicensed functionality.',
          confirmPhrase: undefined,
          confirmVariant: 'warning' as const,
          confirmButtonText: 'Suspend License',
        };
      case 'REACTIVATE':
        return {
          title: `Reactivate License ${licenseId}`,
          explanation: `Reactivating commercial license state.`,
          consequence: 'NOTE: Reactivating a license does NOT automatically reactivate a DISABLED or DECOMMISSIONED organization.',
          confirmPhrase: undefined,
          confirmVariant: 'primary' as const,
          confirmButtonText: 'Reactivate License',
        };
      case 'REVOKE':
        return {
          title: `Revoke License ${licenseId}`,
          explanation: `PERMANENT TERMINAL ACTION: Revoking license ${licenseId}.`,
          consequence: 'All bound deployments will fail verification. Action cannot be reversed.',
          confirmPhrase: `REVOKE ${licenseId}`,
          confirmVariant: 'danger' as const,
          confirmButtonText: 'Revoke License',
        };
      default:
        return { title: 'Confirm', explanation: '', consequence: '', confirmPhrase: undefined, confirmVariant: 'danger' as const, confirmButtonText: 'Confirm' };
    }
  };

  const actionModalProps = getActionModalProps();

  return (
    <div className="space-y-6">
      {/* Navigation link */}
      <div>
        <Link
          href="/licensing"
          className="inline-flex items-center gap-1.5 text-xs text-aravBlue-400 hover:underline"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>Back to Commercial Licensing</span>
        </Link>
      </div>

      {/* Header Banner */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between rounded-lg border border-cpDark-800 bg-cpDark-900 p-6 shadow-xl">
        <div className="flex items-center gap-4">
          <div className="rounded-lg bg-aravBlue-950/80 p-3 border border-aravBlue-800/60 text-aravBlue-400">
            <CreditCard className="h-8 w-8" aria-hidden="true" />
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-bold font-mono text-white">
                {license.id}
              </h1>
              <StatusBadge status={isExpired && license.status !== 'REVOKED' ? 'EXPIRED' : license.status} />
            </div>
            <p className="mt-1 text-xs text-gray-400 font-mono">
              Product: {license.product} &bull; Agreement: {license.commercialAgreementId} &bull; Updated: {new Date(license.updatedAt).toLocaleString()}
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          {canMutate && (
            <button
              onClick={() => setIsUpdateModalOpen(true)}
              className="inline-flex items-center gap-1.5 rounded border border-cpDark-700 bg-cpDark-800 px-3 py-1.5 text-xs font-medium text-gray-300 hover:bg-cpDark-700 hover:text-white focus-ring"
            >
              <Edit className="h-3.5 w-3.5" />
              <span>Edit Metadata</span>
            </button>
          )}

          {canMutate && license.status === 'ACTIVE' && (
            <>
              <button
                onClick={() => setActionType('SUSPEND')}
                className="inline-flex items-center gap-1.5 rounded bg-amber-950/80 border border-amber-800 text-amber-300 px-3 py-1.5 text-xs font-semibold hover:bg-amber-900 focus-ring"
              >
                <PauseCircle className="h-3.5 w-3.5" />
                <span>Suspend</span>
              </button>
              <button
                onClick={() => setActionType('REVOKE')}
                className="inline-flex items-center gap-1.5 rounded bg-rose-950/80 border border-rose-800 text-rose-300 px-3 py-1.5 text-xs font-semibold hover:bg-rose-900 focus-ring"
              >
                <Ban className="h-3.5 w-3.5" />
                <span>Revoke</span>
              </button>
            </>
          )}

          {canMutate && license.status === 'SUSPENDED' && (
            <>
              <button
                onClick={() => setActionType('REACTIVATE')}
                className="inline-flex items-center gap-1.5 rounded bg-emerald-950/80 border border-emerald-800 text-emerald-300 px-3 py-1.5 text-xs font-semibold hover:bg-emerald-900 focus-ring"
              >
                <PlayCircle className="h-3.5 w-3.5" />
                <span>Reactivate</span>
              </button>
              <button
                onClick={() => setActionType('REVOKE')}
                className="inline-flex items-center gap-1.5 rounded bg-rose-950/80 border border-rose-800 text-rose-300 px-3 py-1.5 text-xs font-semibold hover:bg-rose-900 focus-ring"
              >
                <Ban className="h-3.5 w-3.5" />
                <span>Revoke</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Grid Section: Metadata & Lifecycle */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">

        {/* Section 1: License Identity */}
        <div className="rounded-lg border border-cpDark-800 bg-cpDark-900 p-5 space-y-4">
          <div className="flex items-center gap-2 border-b border-cpDark-800 pb-3">
            <Shield className="h-4 w-4 text-aravBlue-400" />
            <h2 className="text-sm font-bold text-white uppercase tracking-wider">
              1. Commercial Identity &amp; Agreement
            </h2>
          </div>

          <div className="space-y-3 font-mono text-xs">
            <div className="flex justify-between border-b border-cpDark-800/50 pb-2">
              <span className="text-gray-400">License ID</span>
              <span className="text-white font-bold">{license.id}</span>
            </div>
            <div className="flex justify-between border-b border-cpDark-800/50 pb-2">
              <span className="text-gray-400">Commercial Agreement ID</span>
              <span className="text-aravBlue-400">{license.commercialAgreementId}</span>
            </div>
            <div className="flex justify-between border-b border-cpDark-800/50 pb-2">
              <span className="text-gray-400">Product Code</span>
              <span className="text-white font-bold">{license.product}</span>
            </div>
            <div className="flex justify-between border-b border-cpDark-800/50 pb-2">
              <span className="text-gray-400">Issued At</span>
              <span className="text-gray-300">{new Date(license.issuedAt).toLocaleString()}</span>
            </div>
            <div className="flex justify-between border-b border-cpDark-800/50 pb-2">
              <span className="text-gray-400">Created At</span>
              <span className="text-gray-300">{new Date(license.createdAt).toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Last Updated At</span>
              <span className="text-gray-300">{new Date(license.updatedAt).toLocaleString()}</span>
            </div>
          </div>
        </div>

        {/* Section 2: Lifecycle & Validity */}
        <div className="rounded-lg border border-cpDark-800 bg-cpDark-900 p-5 space-y-4">
          <div className="flex items-center gap-2 border-b border-cpDark-800 pb-3">
            <Activity className="h-4 w-4 text-aravBlue-400" />
            <h2 className="text-sm font-bold text-white uppercase tracking-wider">
              2. Lifecycle &amp; Validity Range
            </h2>
          </div>

          <div className="space-y-3 font-mono text-xs">
            <div className="flex justify-between items-center border-b border-cpDark-800/50 pb-2">
              <span className="text-gray-400">License Status</span>
              <StatusBadge status={isExpired && license.status !== 'REVOKED' ? 'EXPIRED' : license.status} />
            </div>
            <div className="flex justify-between border-b border-cpDark-800/50 pb-2">
              <span className="text-gray-400">Starts At</span>
              <span className="text-gray-300">{new Date(license.startsAt).toLocaleString()}</span>
            </div>
            <div className="flex justify-between border-b border-cpDark-800/50 pb-2">
              <span className="text-gray-400">Expires At</span>
              <span className={`font-bold ${isExpired ? 'text-rose-400' : 'text-emerald-400'}`}>
                {new Date(license.expiresAt).toLocaleString()}
              </span>
            </div>
            <div className="flex justify-between border-b border-cpDark-800/50 pb-2">
              <span className="text-gray-400">Max Deployment Quota</span>
              <span className="text-amber-400 font-bold">{license.maxDeployments} deployment(s)</span>
            </div>

            <div className="rounded bg-cpDark-950 p-3 border border-cpDark-800 text-[11px] font-sans text-gray-300 flex items-start gap-2">
              <Info className="h-4 w-4 text-aravBlue-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold text-white block mb-0.5">Authoritative Expiry Rule</span>
                Effective license status is evaluated server-side. Local browser time does not decide commercial validity.
              </div>
            </div>
          </div>
        </div>

      </div>

      {/* Section 3: Framework Entitlements Management */}
      <div className="rounded-lg border border-cpDark-800 bg-cpDark-900 p-5 space-y-4 shadow-xl">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-cpDark-800 pb-3">
          <div className="flex items-center gap-2">
            <Layers className="h-5 w-5 text-aravBlue-400" />
            <h2 className="text-sm font-bold text-white uppercase tracking-wider">
              3. Framework Entitlements Control
            </h2>
          </div>

          {canMutate && (
            <button
              onClick={() => {
                setIsEntitlementModalOpen(true);
                setEntitlementError(null);
              }}
              className="inline-flex items-center gap-1.5 rounded bg-aravBlue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-aravBlue-700 focus-ring"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Grant / Update Entitlement</span>
            </button>
          )}
        </div>

        {/* Informational callout on version-specific precedence */}
        <div className="rounded bg-aravBlue-950/20 border border-aravBlue-900/40 p-3 text-xs text-gray-300 flex items-start gap-2">
          <Info className="h-4 w-4 text-aravBlue-400 shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold text-aravBlue-300 block mb-0.5">Entitlement Precedence Architecture</span>
            Framework-wide entitlements (e.g. <code className="text-amber-300 font-mono">ISO27001:*</code>) grant access to all versions of that framework. Specific version entries (e.g. <code className="text-amber-300 font-mono">ISO27001:2022</code>) override framework-wide defaults.
          </div>
        </div>

        {/* Entitlement Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-cpDark-800 bg-cpDark-950 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
              <tr>
                <th scope="col" className="px-4 py-2.5">Entitlement Code</th>
                <th scope="col" className="px-4 py-2.5">Framework Name</th>
                <th scope="col" className="px-4 py-2.5">Scope / Type</th>
                <th scope="col" className="px-4 py-2.5">Status</th>
                <th scope="col" className="px-4 py-2.5">Last Updated</th>
                <th scope="col" className="px-4 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-cpDark-800/60 font-mono text-gray-300">
              {license.entitlements.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-gray-500 italic">
                    No framework entitlements granted to this license yet.
                  </td>
                </tr>
              ) : (
                license.entitlements.map((ent) => {
                  const isVersionSpecific = ent.code.includes(':') && !ent.code.endsWith(':*');
                  return (
                    <tr key={ent.id} className="hover:bg-cpDark-800/40">
                      <td className="px-4 py-2.5 font-bold text-amber-300">
                        {ent.code}
                      </td>
                      <td className="px-4 py-2.5 text-white">
                        {ent.name}
                      </td>
                      <td className="px-4 py-2.5 text-[11px]">
                        {isVersionSpecific ? (
                          <span className="rounded bg-cpDark-800 border border-cpDark-700 px-2 py-0.5 text-amber-300">
                            Version-Specific Override
                          </span>
                        ) : (
                          <span className="rounded bg-cpDark-800 border border-cpDark-700 px-2 py-0.5 text-gray-400">
                            Framework-Wide Default
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        <StatusBadge status={ent.enabled ? 'ACTIVE' : 'SUSPENDED'} size="sm" />
                      </td>
                      <td className="px-4 py-2.5 text-gray-400 text-[11px]">
                        {new Date(ent.updatedAt).toLocaleString()}
                      </td>
                      <td className="px-4 py-2.5 text-right whitespace-nowrap">
                        {canMutate && (
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => handleToggleEntitlement(ent)}
                              className={`rounded px-2 py-0.5 text-[11px] font-semibold border ${
                                ent.enabled
                                  ? 'bg-amber-950 text-amber-300 border-amber-800 hover:bg-amber-900'
                                  : 'bg-emerald-950 text-emerald-300 border-emerald-800 hover:bg-emerald-900'
                              }`}
                            >
                              {ent.enabled ? 'Suspend' : 'Reactivate'}
                            </button>
                            <button
                              onClick={() => handleRevokeEntitlement(ent.code)}
                              className="rounded bg-rose-950 text-rose-300 border border-rose-800 px-2 py-0.5 text-[11px] hover:bg-rose-900"
                            >
                              Revoke
                            </button>
                          </div>
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

      {/* Section 4: Deployment Association & Quota */}
      <div className="rounded-lg border border-cpDark-800 bg-cpDark-900 p-5 space-y-4 shadow-xl">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-cpDark-800 pb-3">
          <div className="flex items-center gap-2">
            <Server className="h-5 w-5 text-aravBlue-400" />
            <h2 className="text-sm font-bold text-white uppercase tracking-wider">
              4. Associated Deployments &amp; Quota
            </h2>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs font-mono text-gray-300">
              Quota: <span className="font-bold text-emerald-400">{license.deploymentsCount || 0}</span> / <span className="text-amber-400 font-bold">{license.maxDeployments}</span>
            </span>

            {canMutate && (
              <button
                onClick={() => {
                  setIsAssociateModalOpen(true);
                  setAssociateError(null);
                }}
                className="inline-flex items-center gap-1.5 rounded bg-cpDark-800 border border-cpDark-700 px-3 py-1.5 text-xs font-medium text-gray-200 hover:bg-cpDark-700 hover:text-white"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Associate Deployment</span>
              </button>
            )}
          </div>
        </div>

        {/* Deployment Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-cpDark-800 bg-cpDark-950 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
              <tr>
                <th scope="col" className="px-4 py-2.5">Deployment ID</th>
                <th scope="col" className="px-4 py-2.5">Organization ID</th>
                <th scope="col" className="px-4 py-2.5">Model</th>
                <th scope="col" className="px-4 py-2.5">Environment</th>
                <th scope="col" className="px-4 py-2.5">State</th>
                <th scope="col" className="px-4 py-2.5">Last Check-In</th>
                <th scope="col" className="px-4 py-2.5 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-cpDark-800/60 font-mono text-gray-300">
              {!license.deployments || license.deployments.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-gray-500 italic">
                    No deployments associated with this license record yet.
                  </td>
                </tr>
              ) : (
                license.deployments.map((dep) => (
                  <tr key={dep.id} className="hover:bg-cpDark-800/40">
                    <td className="px-4 py-2.5 font-bold text-white">
                      {dep.id}
                    </td>
                    <td className="px-4 py-2.5 text-aravBlue-400">
                      <Link href={`/organizations/${encodeURIComponent(dep.organizationId)}`} className="hover:underline">
                        {dep.organizationId}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 text-gray-300">
                      {dep.deploymentModel}
                    </td>
                    <td className="px-4 py-2.5 text-gray-400">
                      {dep.environment}
                    </td>
                    <td className="px-4 py-2.5">
                      <StatusBadge status={dep.activationState} size="sm" />
                    </td>
                    <td className="px-4 py-2.5 text-gray-400 text-[11px]">
                      {dep.lastCheckInAt ? new Date(dep.lastCheckInAt).toLocaleString() : 'Never'}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {canMutate && (
                        <button
                          onClick={() => handleDisassociateDeployment(dep.id)}
                          className="rounded bg-rose-950 text-rose-300 border border-rose-800 px-2 py-0.5 text-[11px] hover:bg-rose-900"
                        >
                          Disassociate
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Section 5: Signed License Artifact Metadata */}
      <div className="rounded-lg border border-cpDark-800 bg-cpDark-900 p-5 space-y-4 shadow-xl">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-cpDark-800 pb-3">
          <div className="flex items-center gap-2">
            <FileCheck2 className="h-5 w-5 text-aravBlue-400" />
            <h2 className="text-sm font-bold text-white uppercase tracking-wider">
              5. Signed License Artifact Metadata (Ed25519)
            </h2>
          </div>

          <button
            onClick={handleIssueArtifact}
            className="inline-flex items-center gap-1.5 rounded bg-aravBlue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-aravBlue-700 focus-ring"
          >
            <Key className="h-3.5 w-3.5" />
            <span>Issue / Re-Sign Artifact</span>
          </button>
        </div>

        {signedArtifact ? (
          <div className="space-y-3 font-mono text-xs bg-cpDark-950 p-4 rounded border border-cpDark-800">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 border-b border-cpDark-800 pb-3">
              <div>
                <span className="text-gray-400 block text-[11px]">Format Version:</span>
                <span className="text-white font-bold">{signedArtifact.formatVersion}</span>
              </div>
              <div>
                <span className="text-gray-400 block text-[11px]">Signing Key ID:</span>
                <span className="text-aravBlue-300 font-bold">{signedArtifact.keyId}</span>
              </div>
              <div>
                <span className="text-gray-400 block text-[11px]">Signature Algorithm:</span>
                <span className="text-emerald-400 font-bold">{signedArtifact.algorithm}</span>
              </div>
              <div>
                <span className="text-gray-400 block text-[11px]">Artifact Sequence:</span>
                <span className="text-amber-400 font-bold">#{signedArtifact.payload?.sequence || license.id}</span>
              </div>
            </div>

            <div>
              <span className="text-gray-400 block text-[11px] mb-1">Ed25519 Cryptographic Signature Hash (Metadata View):</span>
              <div className="bg-cpDark-900 p-2.5 rounded border border-cpDark-800 text-[11px] text-gray-300 break-all font-mono">
                {signedArtifact.signature}
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded bg-cpDark-950 p-6 text-center text-xs text-gray-400 italic border border-cpDark-800">
            No signed artifact issued yet for this license. Click &quot;Issue / Re-Sign Artifact&quot; to generate an Ed25519 signed payload.
          </div>
        )}
      </div>

      {/* Section 6: Commercial History Audit Log */}
      <div className="rounded-lg border border-cpDark-800 bg-cpDark-900 p-5 space-y-4 shadow-xl">
        <div className="flex items-center justify-between border-b border-cpDark-800 pb-3">
          <div className="flex items-center gap-2">
            <History className="h-5 w-5 text-aravBlue-400" />
            <h2 className="text-sm font-bold text-white uppercase tracking-wider">
              6. Commercial Audit History Log
            </h2>
          </div>
          <span className="text-xs text-gray-400 font-mono">{history.length} event(s)</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-cpDark-800 bg-cpDark-950 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
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
                    No commercial audit logs found for this license record.
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

      {/* Edit Metadata Modal */}
      {isUpdateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-lg border border-cpDark-700 bg-cpDark-900 p-6 shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-white border-b border-cpDark-800 pb-2">Update License Metadata</h3>
            <form onSubmit={handleUpdateLicenseSubmit} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-300 mb-1">Starts At</label>
                <input
                  type="datetime-local"
                  value={updateStartsAt}
                  onChange={(e) => setUpdateStartsAt(e.target.value)}
                  className="w-full rounded border border-cpDark-700 bg-cpDark-950 p-2 text-xs text-white font-mono"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-300 mb-1">Expires At</label>
                <input
                  type="datetime-local"
                  value={updateExpiresAt}
                  onChange={(e) => setUpdateExpiresAt(e.target.value)}
                  className="w-full rounded border border-cpDark-700 bg-cpDark-950 p-2 text-xs text-white font-mono"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-300 mb-1">Max Deployments Quota</label>
                <input
                  type="number"
                  min="1"
                  value={updateMaxDeployments}
                  onChange={(e) => setUpdateMaxDeployments(Number(e.target.value))}
                  className="w-full rounded border border-cpDark-700 bg-cpDark-950 p-2 text-xs text-white font-mono"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-300 mb-1">Operational Audit Reason</label>
                <input
                  type="text"
                  value={updateReason}
                  onChange={(e) => setUpdateReason(e.target.value)}
                  placeholder="Operational reason for update..."
                  className="w-full rounded border border-cpDark-700 bg-cpDark-950 p-2 text-xs text-white font-mono"
                />
              </div>

              {updateError && (
                <div className="rounded border border-rose-800 bg-rose-950 p-2.5 text-xs text-rose-200">{updateError}</div>
              )}

              <div className="flex justify-end gap-2 border-t border-cpDark-800 pt-3">
                <button type="button" onClick={() => setIsUpdateModalOpen(false)} className="px-3 py-1.5 text-xs text-gray-400">Cancel</button>
                <button type="submit" disabled={isSubmittingUpdate} className="rounded bg-aravBlue-600 px-4 py-1.5 text-xs text-white font-semibold">
                  {isSubmittingUpdate ? 'Updating...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Grant / Update Entitlement Modal */}
      {isEntitlementModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-lg border border-cpDark-700 bg-cpDark-900 p-6 shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-white border-b border-cpDark-800 pb-2">Grant / Update Framework Entitlement</h3>
            <form onSubmit={handleGrantEntitlementSubmit} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-300 mb-1">Framework Code</label>
                <select
                  value={entCode}
                  onChange={(e) => setEntCode(e.target.value)}
                  className="w-full rounded border border-cpDark-700 bg-cpDark-950 p-2 text-xs text-white font-mono"
                >
                  {VALID_FRAMEWORKS.map((f) => (
                    <option key={f.code} value={f.code}>{f.code} - {f.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-300 mb-1">Framework Version (Optional, e.g. 2022)</label>
                <input
                  type="text"
                  value={entVersion}
                  onChange={(e) => setEntVersion(e.target.value)}
                  placeholder="Leave empty for Framework-Wide Default (*)"
                  className="w-full rounded border border-cpDark-700 bg-cpDark-950 p-2 text-xs text-white font-mono"
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="ent-enabled-toggle"
                  checked={entEnabled}
                  onChange={(e) => setEntEnabled(e.target.checked)}
                  className="rounded border-cpDark-700"
                />
                <label htmlFor="ent-enabled-toggle" className="text-xs text-gray-300">Enabled Initial State</label>
              </div>

              {entitlementError && (
                <div className="rounded border border-rose-800 bg-rose-950 p-2.5 text-xs text-rose-200">{entitlementError}</div>
              )}

              <div className="flex justify-end gap-2 border-t border-cpDark-800 pt-3">
                <button type="button" onClick={() => setIsEntitlementModalOpen(false)} className="px-3 py-1.5 text-xs text-gray-400">Cancel</button>
                <button type="submit" disabled={isSubmittingEntitlement} className="rounded bg-aravBlue-600 px-4 py-1.5 text-xs text-white font-semibold">
                  {isSubmittingEntitlement ? 'Granting...' : 'Grant Entitlement'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Associate Deployment Modal */}
      {isAssociateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-lg border border-cpDark-700 bg-cpDark-900 p-6 shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-white border-b border-cpDark-800 pb-2">Associate Deployment to License</h3>
            <form onSubmit={handleAssociateDeploymentSubmit} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-300 mb-1">Select Deployment ID</label>
                <select
                  value={selectedDeploymentId}
                  onChange={(e) => setSelectedDeploymentId(e.target.value)}
                  className="w-full rounded border border-cpDark-700 bg-cpDark-950 p-2 text-xs text-white font-mono"
                  required
                >
                  <option value="">-- Select Deployment --</option>
                  {allDeployments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.id} ({d.organizationId} &bull; {d.deploymentModel})
                    </option>
                  ))}
                </select>
              </div>

              {associateError && (
                <div className="rounded border border-rose-800 bg-rose-950 p-2.5 text-xs text-rose-200">{associateError}</div>
              )}

              <div className="flex justify-end gap-2 border-t border-cpDark-800 pt-3">
                <button type="button" onClick={() => setIsAssociateModalOpen(false)} className="px-3 py-1.5 text-xs text-gray-400">Cancel</button>
                <button type="submit" disabled={isSubmittingAssociate || !selectedDeploymentId} className="rounded bg-aravBlue-600 px-4 py-1.5 text-xs text-white font-semibold">
                  {isSubmittingAssociate ? 'Associating...' : 'Associate Deployment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Action Confirmation Dialog for License Lifecycle */}
      <ConfirmationDialog
        isOpen={!!actionType}
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
        onCancel={() => setActionType(null)}
      />
    </div>
  );
}
