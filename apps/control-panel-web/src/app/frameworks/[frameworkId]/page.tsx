'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  Library,
  ArrowLeft,
  RefreshCw,
  Search,
  Filter,
  ExternalLink,
  Shield,
  Layers,
  Building2,
  Calendar,
  Globe,
  CheckCircle2,
  BookOpen,
  Info,
  Scale,
  FileCheck,
  Tag,
  Clock,
} from 'lucide-react';
import { useAuth } from '../../../lib/auth-context';
import { controlPlaneApi, ControlPlaneApiError } from '../../../lib/control-plane-api';
import {
  RegulatoryFrameworkDto,
  FrameworkReferenceDto,
  FrameworkEntitlementDto,
} from '../../../types/control-plane';
import { StatusBadge } from '../../../components/ui/status-badge';
import { ErrorState } from '../../../components/ui/error-state';
import { AccessDenied } from '../../../components/ui/access-denied';
import { useDebounce } from '../../../lib/use-debounce';

type ActiveTab = 'references' | 'entitlements' | 'metadata';

export default function FrameworkDetailPage() {
  const params = useParams();
  const frameworkIdOrCode = decodeURIComponent((params.frameworkId as string) || '');

  const { operator, isAuthenticated, isLoading: isAuthLoading } = useAuth();

  const [framework, setFramework] = useState<RegulatoryFrameworkDto | null>(null);
  const [references, setReferences] = useState<FrameworkReferenceDto[]>([]);
  const [totalReferences, setTotalReferences] = useState<number>(0);
  const [entitlements, setEntitlements] = useState<FrameworkEntitlementDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefLoading, setIsRefLoading] = useState(false);
  const [error, setError] = useState<ControlPlaneApiError | null>(null);

  // Active Tab
  const [activeTab, setActiveTab] = useState<ActiveTab>('references');

  // References filtering & pagination
  const [selectedVersionId, setSelectedVersionId] = useState<string>('');
  const [refSearch, setRefSearch] = useState('');
  const debouncedRefSearch = useDebounce(refSearch, 200);
  const [refTypeFilter, setRefTypeFilter] = useState<string>('ALL');
  const [refPage, setRefPage] = useState(1);
  const refPageSize = 25;

  // Entitlements search
  const [entitlementSearch, setEntitlementSearch] = useState('');
  const debouncedEntitlementSearch = useDebounce(entitlementSearch, 200);

  // Fetch Framework Summary and Entitlements
  const fetchFrameworkData = useCallback(async () => {
    if (!frameworkIdOrCode) return;
    setIsLoading(true);
    setError(null);

    try {
      const [fwData, entData] = await Promise.all([
        controlPlaneApi.getFramework(frameworkIdOrCode),
        controlPlaneApi.listFrameworkEntitlements(frameworkIdOrCode).catch(() => []),
      ]);

      setFramework(fwData);
      setEntitlements(entData || []);

      if (fwData.versions && fwData.versions.length > 0) {
        setSelectedVersionId((prev) => prev || fwData.versions![0].id);
      }
    } catch (err: any) {
      if (err instanceof ControlPlaneApiError) {
        setError(err);
      } else {
        setError(
          new ControlPlaneApiError(
            500,
            err.message || `Failed to fetch regulatory framework ${frameworkIdOrCode}`,
          ),
        );
      }
    } finally {
      setIsLoading(false);
    }
  }, [frameworkIdOrCode]);

  // Fetch Paginated References
  const fetchReferences = useCallback(async () => {
    if (!frameworkIdOrCode) return;
    setIsRefLoading(true);

    try {
      const res = await controlPlaneApi.listFrameworkReferences(frameworkIdOrCode, {
        versionId: selectedVersionId || undefined,
        search: debouncedRefSearch || undefined,
        type: refTypeFilter !== 'ALL' ? refTypeFilter : undefined,
        page: refPage,
        limit: refPageSize,
      });

      setReferences(res.data || []);
      setTotalReferences(res.total || 0);
    } catch {
      setReferences([]);
      setTotalReferences(0);
    } finally {
      setIsRefLoading(false);
    }
  }, [frameworkIdOrCode, selectedVersionId, debouncedRefSearch, refTypeFilter, refPage, refPageSize]);

  useEffect(() => {
    if (!isAuthLoading && isAuthenticated) {
      fetchFrameworkData();
    }
  }, [isAuthLoading, isAuthenticated, fetchFrameworkData]);

  useEffect(() => {
    if (!isAuthLoading && isAuthenticated && framework) {
      fetchReferences();
    }
  }, [isAuthLoading, isAuthenticated, framework, fetchReferences]);

  // Reset page when ref filters change
  useEffect(() => {
    setRefPage(1);
  }, [debouncedRefSearch, refTypeFilter, selectedVersionId]);

  // Filter Entitlements
  const filteredEntitlements = useMemo(() => {
    if (!debouncedEntitlementSearch) return entitlements;
    const q = debouncedEntitlementSearch.trim().toLowerCase();
    return entitlements.filter(
      (e) =>
        e.organizationName.toLowerCase().includes(q) ||
        e.organizationId.toLowerCase().includes(q) ||
        e.status.toLowerCase().includes(q),
    );
  }, [entitlements, debouncedEntitlementSearch]);

  if (isAuthLoading || (isLoading && !framework && !error)) {
    return (
      <div className="flex h-64 items-center justify-center">
        <RefreshCw className="h-6 w-6 animate-spin text-aravBlue-400" />
      </div>
    );
  }

  if (error && error.statusCode === 403) {
    return (
      <AccessDenied
        resource={`Framework ${frameworkIdOrCode}`}
        requiredRole="Authorized Control Plane Operator"
      />
    );
  }

  if (error && error.statusCode === 404) {
    return (
      <div className="space-y-4">
        <Link
          href="/frameworks"
          className="inline-flex items-center gap-1.5 text-xs text-aravBlue-400 hover:underline"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>Back to Frameworks</span>
        </Link>
        <div className="rounded-lg border border-cpDark-800 bg-cpDark-900 p-8 text-center">
          <Library className="mx-auto h-10 w-10 text-gray-500" />
          <h2 className="mt-2 text-lg font-bold text-white">Framework Not Found</h2>
          <p className="mt-1 text-xs text-gray-400">
            No regulatory framework found with identifier &quot;{frameworkIdOrCode}&quot;.
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <Link
          href="/frameworks"
          className="inline-flex items-center gap-1.5 text-xs text-aravBlue-400 hover:underline"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>Back to Frameworks</span>
        </Link>
        <ErrorState
          statusCode={error.statusCode}
          title="Failed to load framework details"
          message={error.message}
          correlationId={error.correlationId}
          onRetry={fetchFrameworkData}
        />
      </div>
    );
  }

  if (!framework) return null;

  const totalRefPages = Math.ceil(totalReferences / refPageSize) || 1;

  return (
    <div className="space-y-6">
      {/* Navigation Breadcrumb */}
      <div>
        <Link
          href="/frameworks"
          className="inline-flex items-center gap-1.5 text-xs text-aravBlue-400 hover:underline font-medium"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>Back to Frameworks Catalog</span>
        </Link>
      </div>

      {/* Hero Header Card */}
      <div className="rounded-lg border border-cpDark-800 bg-cpDark-900 p-6 shadow-xl space-y-4">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="flex items-start gap-4">
            <div className="rounded-lg bg-aravBlue-950/80 p-3 border border-aravBlue-800/80 text-aravBlue-400">
              <Scale className="h-8 w-8" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono bg-cpDark-800 border border-cpDark-700 px-2 py-0.5 rounded text-xs font-bold text-amber-400">
                  {framework.code}
                </span>
                <h1 className="text-xl font-bold text-white tracking-tight">{framework.name}</h1>
                <StatusBadge status="ACTIVE" size="sm" />
              </div>
              <p className="mt-1 text-xs text-gray-400 font-sans">
                {framework.category} &bull; {framework.instrumentType}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {framework.officialReferenceUrl && (
              <a
                href={framework.officialReferenceUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-md border border-cpDark-700 bg-cpDark-800 px-3 py-1.5 text-xs font-medium text-gray-300 hover:text-white hover:bg-cpDark-700 transition-colors"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                <span>Official Documentation</span>
              </a>
            )}
            <button
              onClick={() => {
                fetchFrameworkData();
                fetchReferences();
              }}
              disabled={isLoading || isRefLoading}
              className="inline-flex items-center gap-1.5 rounded-md border border-cpDark-700 bg-cpDark-800 px-3 py-1.5 text-xs font-medium text-gray-300 hover:text-white hover:bg-cpDark-700 focus-ring"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isLoading || isRefLoading ? 'animate-spin' : ''}`} />
              <span>Refetch</span>
            </button>
          </div>
        </div>

        {/* Quick Facts Grid */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 font-mono text-xs border-t border-cpDark-800/70 pt-4">
          <div className="rounded border border-cpDark-800 bg-cpDark-950 p-2.5">
            <span className="text-[10px] text-gray-400 block font-sans">ISSUING AUTHORITY</span>
            <span className="text-white font-semibold truncate block mt-0.5" title={framework.issuingAuthority}>
              {framework.issuingAuthority}
            </span>
          </div>

          <div className="rounded border border-cpDark-800 bg-cpDark-950 p-2.5">
            <span className="text-[10px] text-gray-400 block font-sans">JURISDICTION</span>
            <span className="text-aravBlue-300 font-semibold block mt-0.5 flex items-center gap-1">
              <Globe className="h-3.5 w-3.5" />
              <span>{framework.jurisdiction}</span>
            </span>
          </div>

          <div className="rounded border border-cpDark-800 bg-cpDark-950 p-2.5">
            <span className="text-[10px] text-gray-400 block font-sans">PUBLISHED EDITIONS</span>
            <span className="text-purple-300 font-semibold block mt-0.5">
              {framework.versionsCount} version(s)
            </span>
          </div>

          <div className="rounded border border-cpDark-800 bg-cpDark-950 p-2.5">
            <span className="text-[10px] text-gray-400 block font-sans">ORGANIZATION ENROLLED</span>
            <span className="text-emerald-300 font-semibold block mt-0.5">
              {framework.entitledOrganizationsCount} tenant(s)
            </span>
          </div>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="border-b border-cpDark-800 flex items-center gap-2">
        <button
          onClick={() => setActiveTab('references')}
          className={`pb-3 px-3 text-xs font-medium border-b-2 transition-colors ${
            activeTab === 'references'
              ? 'border-aravBlue-500 text-white font-bold'
              : 'border-transparent text-gray-400 hover:text-white'
          }`}
        >
          1. Reference Clauses &amp; Requirements ({totalReferences || framework.totalReferencesCount})
        </button>
        <button
          onClick={() => setActiveTab('entitlements')}
          className={`pb-3 px-3 text-xs font-medium border-b-2 transition-colors ${
            activeTab === 'entitlements'
              ? 'border-aravBlue-500 text-white font-bold'
              : 'border-transparent text-gray-400 hover:text-white'
          }`}
        >
          2. Entitled Organizations ({entitlements.length})
        </button>
        <button
          onClick={() => setActiveTab('metadata')}
          className={`pb-3 px-3 text-xs font-medium border-b-2 transition-colors ${
            activeTab === 'metadata'
              ? 'border-aravBlue-500 text-white font-bold'
              : 'border-transparent text-gray-400 hover:text-white'
          }`}
        >
          3. Governance &amp; Regulatory Taxonomy
        </button>
      </div>

      {/* TAB 1: Reference Clauses & Requirements */}
      {activeTab === 'references' && (
        <div className="space-y-4">
          {/* Controls toolbar */}
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between rounded-lg border border-cpDark-800 bg-cpDark-900 p-3">
            {/* Version dropdown */}
            <div className="flex items-center gap-2">
              <label htmlFor="version-select" className="text-xs text-gray-400 font-mono">
                Version Edition:
              </label>
              <select
                id="version-select"
                value={selectedVersionId}
                onChange={(e) => setSelectedVersionId(e.target.value)}
                className="rounded-md border border-cpDark-700 bg-cpDark-950 px-2.5 py-1 text-xs text-white focus-ring font-mono"
              >
                {framework.versions?.map((v) => (
                  <option key={v.id} value={v.id}>
                    v{v.version} — {v.name} ({v.referencesCount || 0} reqs)
                  </option>
                ))}
              </select>
            </div>

            {/* Search within clauses */}
            <div className="flex items-center gap-2 flex-1 max-w-sm">
              <div className="relative w-full">
                <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-gray-500" />
                <input
                  type="text"
                  placeholder="Filter clauses by code or title..."
                  value={refSearch}
                  onChange={(e) => setRefSearch(e.target.value)}
                  className="w-full rounded-md border border-cpDark-700 bg-cpDark-950 pl-8 pr-2.5 py-1 text-xs text-white placeholder-gray-500 focus-ring"
                />
              </div>
            </div>
          </div>

          {/* References Table */}
          <div className="rounded-lg border border-cpDark-800 bg-cpDark-900 shadow-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-cpDark-800 bg-cpDark-950 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                  <tr>
                    <th scope="col" className="px-4 py-3 w-32">Identifier</th>
                    <th scope="col" className="px-4 py-3 w-28">Type</th>
                    <th scope="col" className="px-4 py-3">Clause Title &amp; Description</th>
                    <th scope="col" className="px-4 py-3 w-40">Normative Text</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-cpDark-800/60 font-mono text-gray-300">
                  {isRefLoading ? (
                    Array.from({ length: 6 }).map((_, idx) => (
                      <tr key={`skel-ref-${idx}`} className="animate-pulse">
                        <td className="px-4 py-3">
                          <div className="h-4 w-16 bg-cpDark-800 rounded" />
                        </td>
                        <td className="px-4 py-3">
                          <div className="h-4 w-14 bg-cpDark-800 rounded" />
                        </td>
                        <td className="px-4 py-3">
                          <div className="h-4 w-64 bg-cpDark-800 rounded mb-1" />
                          <div className="h-3 w-40 bg-cpDark-850 rounded" />
                        </td>
                        <td className="px-4 py-3">
                          <div className="h-3 w-20 bg-cpDark-800 rounded" />
                        </td>
                      </tr>
                    ))
                  ) : references.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-4 py-8 text-center text-gray-500 font-sans">
                        No reference clauses match the selected criteria.
                      </td>
                    </tr>
                  ) : (
                    references.map((ref) => (
                      <tr key={ref.id} className="hover:bg-cpDark-800/40">
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className="font-bold text-amber-400 bg-cpDark-950 px-2 py-0.5 rounded border border-cpDark-800">
                            {ref.identifier}
                          </span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className="rounded bg-cpDark-800 px-1.5 py-0.5 text-[10px] text-gray-300 border border-cpDark-700">
                            {ref.type}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-sans">
                          <div className="font-semibold text-white">{ref.title}</div>
                          {ref.description && (
                            <p className="text-gray-400 text-xs mt-0.5 line-clamp-2">{ref.description}</p>
                          )}
                        </td>
                        <td className="px-4 py-3 font-sans text-xs text-gray-400">
                          {ref.normativeText ? (
                            <span className="italic text-gray-300 truncate max-w-xs block" title={ref.normativeText}>
                              {ref.normativeText}
                            </span>
                          ) : (
                            <span className="text-gray-600">N/A</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            {totalReferences > 0 && (
              <div className="flex items-center justify-between border-t border-cpDark-800 bg-cpDark-950 px-4 py-2.5 text-xs text-gray-400 font-sans">
                <div>
                  Showing <span className="font-bold text-white">{(refPage - 1) * refPageSize + 1}</span> to{' '}
                  <span className="font-bold text-white">
                    {Math.min(refPage * refPageSize, totalReferences)}
                  </span>{' '}
                  of <span className="font-bold text-white">{totalReferences}</span> clauses
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setRefPage((p) => Math.max(1, p - 1))}
                    disabled={refPage === 1}
                    className="rounded border border-cpDark-700 bg-cpDark-900 px-2.5 py-0.5 text-xs text-gray-300 hover:bg-cpDark-800 disabled:opacity-40"
                  >
                    Previous
                  </button>
                  <span className="font-mono text-gray-400">
                    Page {refPage} of {totalRefPages}
                  </span>
                  <button
                    onClick={() => setRefPage((p) => Math.min(totalRefPages, p + 1))}
                    disabled={refPage >= totalRefPages}
                    className="rounded border border-cpDark-700 bg-cpDark-900 px-2.5 py-0.5 text-xs text-gray-300 hover:bg-cpDark-800 disabled:opacity-40"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: Entitled Organizations */}
      {activeTab === 'entitlements' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between rounded-lg border border-cpDark-800 bg-cpDark-900 p-3">
            <div className="relative w-full max-w-sm">
              <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-gray-500" />
              <input
                type="text"
                placeholder="Search entitled organizations..."
                value={entitlementSearch}
                onChange={(e) => setEntitlementSearch(e.target.value)}
                className="w-full rounded-md border border-cpDark-700 bg-cpDark-950 pl-8 pr-2.5 py-1 text-xs text-white placeholder-gray-500 focus-ring font-sans"
              />
            </div>
            <span className="text-xs text-gray-400 font-mono">
              {filteredEntitlements.length} organization grant(s)
            </span>
          </div>

          <div className="rounded-lg border border-cpDark-800 bg-cpDark-900 shadow-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-sans">
                <thead className="border-b border-cpDark-800 bg-cpDark-950 text-[11px] font-semibold uppercase tracking-wider text-gray-400 font-mono">
                  <tr>
                    <th scope="col" className="px-4 py-3">Organization Name &amp; ID</th>
                    <th scope="col" className="px-4 py-3">Tenant Type</th>
                    <th scope="col" className="px-4 py-3">Version Scope</th>
                    <th scope="col" className="px-4 py-3 text-center">Status</th>
                    <th scope="col" className="px-4 py-3">Granted Date</th>
                    <th scope="col" className="px-4 py-3">Source Authority</th>
                    <th scope="col" className="px-4 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-cpDark-800/60 font-mono text-gray-300">
                  {filteredEntitlements.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-gray-500 font-sans">
                        No organization entitlement records found.
                      </td>
                    </tr>
                  ) : (
                    filteredEntitlements.map((ent) => (
                      <tr key={ent.id} className="hover:bg-cpDark-800/40">
                        <td className="px-4 py-3">
                          <Link
                            href={`/organizations/${ent.organizationId}`}
                            className="font-bold text-white hover:text-aravBlue-300 hover:underline font-sans"
                          >
                            {ent.organizationName}
                          </Link>
                          <div className="text-[11px] text-gray-400 font-mono">{ent.organizationId}</div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="rounded bg-cpDark-800 px-1.5 py-0.5 text-[10px] text-gray-300">
                            {ent.organizationType}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-mono text-xs">
                          <span className="text-purple-300">{ent.versionName}</span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <StatusBadge status={ent.status} size="sm" />
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-400">
                          {ent.grantedAt ? new Date(ent.grantedAt).toLocaleDateString() : 'N/A'}
                        </td>
                        <td className="px-4 py-3 text-[11px] text-aravBlue-400">
                          {ent.source}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Link
                            href={`/organizations/${ent.organizationId}`}
                            className="text-xs text-aravBlue-400 hover:underline font-sans"
                          >
                            Inspect Org
                          </Link>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: Governance & Regulatory Taxonomy */}
      {activeTab === 'metadata' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Card 1: Regulatory Taxonomy */}
          <div className="rounded-lg border border-cpDark-800 bg-cpDark-900 p-5 space-y-4">
            <div className="flex items-center gap-2 border-b border-cpDark-800 pb-3">
              <Shield className="h-4 w-4 text-aravBlue-400" />
              <h2 className="text-sm font-bold text-white uppercase tracking-wider font-mono">
                Regulatory Architecture Distinction
              </h2>
            </div>

            <div className="space-y-3 text-xs font-sans text-gray-300">
              <div className="border-b border-cpDark-800/50 pb-2">
                <span className="text-gray-400 block font-mono text-[11px]">1. REGULATORY AUTHORITY / ISSUING BODY</span>
                <span className="text-white font-semibold mt-0.5 block">{framework.issuingAuthority}</span>
              </div>

              <div className="border-b border-cpDark-800/50 pb-2">
                <span className="text-gray-400 block font-mono text-[11px]">2. LEGAL INSTRUMENT TYPE</span>
                <span className="text-white font-semibold mt-0.5 block">{framework.instrumentType}</span>
              </div>

              <div className="border-b border-cpDark-800/50 pb-2">
                <span className="text-gray-400 block font-mono text-[11px]">3. COMPLIANCE FRAMEWORK CODE</span>
                <span className="text-amber-400 font-mono font-bold mt-0.5 block">{framework.code}</span>
              </div>

              <div className="border-b border-cpDark-800/50 pb-2">
                <span className="text-gray-400 block font-mono text-[11px]">4. ACTIVE PUBLISHED EDITIONS</span>
                <div className="mt-1 flex flex-wrap gap-1.5 font-mono">
                  {framework.versions?.map((v) => (
                    <span
                      key={v.id}
                      className="rounded bg-cpDark-800 px-2 py-0.5 border border-cpDark-700 text-purple-300 text-[11px]"
                    >
                      v{v.version} ({v.referencesCount || 0} reqs)
                    </span>
                  ))}
                </div>
              </div>

              <div>
                <span className="text-gray-400 block font-mono text-[11px]">5. APPLICABLE JURISDICTION</span>
                <span className="text-aravBlue-400 font-semibold mt-0.5 block">{framework.jurisdiction}</span>
              </div>
            </div>
          </div>

          {/* Card 2: Legal Verification & Crosswalk Integrity */}
          <div className="rounded-lg border border-cpDark-800 bg-cpDark-900 p-5 space-y-4">
            <div className="flex items-center gap-2 border-b border-cpDark-800 pb-3">
              <Info className="h-4 w-4 text-emerald-400" />
              <h2 className="text-sm font-bold text-white uppercase tracking-wider font-mono">
                Verification &amp; Crosswalk Integrity
              </h2>
            </div>

            <div className="space-y-3 text-xs text-gray-300 leading-relaxed font-sans">
              <p>
                This compliance framework specification is maintained in the authoritative OMNiGRC catalog. All
                underlying clauses map to enterprise control templates and AI crosswalk models.
              </p>

              <div className="rounded-md border border-amber-900/60 bg-amber-950/30 p-3 text-amber-200">
                <div className="flex items-center gap-2 font-bold mb-1">
                  <Shield className="h-4 w-4 text-amber-400" />
                  <span>Regulatory Legal Verification Notice</span>
                </div>
                <p className="text-[11px] leading-normal text-amber-300/90">
                  OMNiGRC provides structured compliance management controls and automated evidence crosswalking.
                  Neither software metadata nor AI mappings constitute formal legal counsel. Official gazetted
                  statutory instruments must be referenced for legal proceedings.
                </p>
              </div>

              <div className="rounded-md border border-cpDark-800 bg-cpDark-950 p-3 font-mono text-[11px] space-y-1 text-gray-400">
                <div>Framework ID: <span className="text-white">{framework.id}</span></div>
                <div>Created At: <span className="text-white">{new Date(framework.createdAt).toLocaleString()}</span></div>
                <div>System Maintained: <span className="text-emerald-400">YES (Authoritative)</span></div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

