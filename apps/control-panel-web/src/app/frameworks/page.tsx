'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import {
  Library,
  Search,
  Filter,
  RefreshCw,
  ExternalLink,
  Shield,
  Layers,
  Building2,
  Calendar,
  Globe,
  CheckCircle2,
  ChevronRight,
  BookOpen,
  ArrowUpDown,
} from 'lucide-react';
import { useAuth } from '../../lib/auth-context';
import { controlPlaneApi, ControlPlaneApiError } from '../../lib/control-plane-api';
import { RegulatoryFrameworkDto } from '../../types/control-plane';
import { StatusBadge } from '../../components/ui/status-badge';
import { ErrorState } from '../../components/ui/error-state';
import { AccessDenied } from '../../components/ui/access-denied';
import { useDebounce } from '../../lib/use-debounce';

export default function FrameworksPage() {
  const { operator, isAuthenticated, isLoading: isAuthLoading } = useAuth();

  const [frameworks, setFrameworks] = useState<RegulatoryFrameworkDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<ControlPlaneApiError | null>(null);

  // Filters & Search
  const [searchInput, setSearchInput] = useState('');
  const debouncedSearch = useDebounce(searchInput, 200);
  const [selectedJurisdiction, setSelectedJurisdiction] = useState<string>('ALL');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  const fetchFrameworks = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await controlPlaneApi.listFrameworks({
        page: 1,
        limit: 100,
      });
      setFrameworks(res.data || []);
    } catch (err: any) {
      if (err instanceof ControlPlaneApiError) {
        setError(err);
      } else {
        setError(
          new ControlPlaneApiError(
            500,
            err.message || 'Failed to load regulatory compliance frameworks',
          ),
        );
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isAuthLoading && isAuthenticated) {
      fetchFrameworks();
    }
  }, [isAuthLoading, isAuthenticated, fetchFrameworks]);

  // Aggregate Metrics
  const metrics = useMemo(() => {
    const totalFrameworks = frameworks.length;
    const totalVersions = frameworks.reduce((acc, f) => acc + (f.versionsCount || 0), 0);
    const totalReferences = frameworks.reduce((acc, f) => acc + (f.totalReferencesCount || 0), 0);
    const totalEntitlements = frameworks.reduce(
      (acc, f) => acc + (f.entitledOrganizationsCount || 0),
      0,
    );
    return { totalFrameworks, totalVersions, totalReferences, totalEntitlements };
  }, [frameworks]);

  // Filtering
  const filteredFrameworks = useMemo(() => {
    return frameworks.filter((fw) => {
      // Search filter
      if (debouncedSearch) {
        const q = debouncedSearch.trim().toLowerCase();
        const matchesName = fw.name.toLowerCase().includes(q);
        const matchesCode = fw.code.toLowerCase().includes(q);
        const matchesAuthority = fw.issuingAuthority.toLowerCase().includes(q);
        const matchesJurisdiction = fw.jurisdiction.toLowerCase().includes(q);
        if (!matchesName && !matchesCode && !matchesAuthority && !matchesJurisdiction) {
          return false;
        }
      }

      // Jurisdiction filter
      if (selectedJurisdiction !== 'ALL') {
        if (!fw.jurisdiction.toLowerCase().includes(selectedJurisdiction.toLowerCase())) {
          return false;
        }
      }

      // Category filter
      if (selectedCategory !== 'ALL') {
        if (!fw.category.toLowerCase().includes(selectedCategory.toLowerCase())) {
          return false;
        }
      }

      return true;
    });
  }, [frameworks, debouncedSearch, selectedJurisdiction, selectedCategory]);

  // Paginated Slice
  const totalPages = Math.ceil(filteredFrameworks.length / pageSize) || 1;
  const paginatedFrameworks = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredFrameworks.slice(start, start + pageSize);
  }, [filteredFrameworks, currentPage, pageSize]);

  // Reset page when search or filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearch, selectedJurisdiction, selectedCategory]);

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
        resource="Regulatory Frameworks"
        requiredRole="Authorized Control Plane Operator"
      />
    );
  }

  if (error) {
    return (
      <ErrorState
        statusCode={error.statusCode}
        title="Failed to load regulatory frameworks"
        message={error.message}
        correlationId={error.correlationId}
        onRetry={fetchFrameworks}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-cpDark-800 pb-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-white tracking-tight">Regulatory Frameworks</h1>
            <span className="rounded-full bg-aravBlue-950/80 border border-aravBlue-800/80 px-2.5 py-0.5 text-[11px] font-semibold text-aravBlue-300 font-mono">
              Canonical Architecture
            </span>
          </div>
          <p className="text-xs text-gray-400 mt-1">
            Authoritative regulatory instruments, security standards, and cross-framework compliance requirements.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => fetchFrameworks()}
            disabled={isLoading}
            className="inline-flex items-center gap-1.5 rounded-md border border-cpDark-700 bg-cpDark-800 px-3 py-1.5 text-xs font-medium text-gray-300 hover:bg-cpDark-700 hover:text-white focus-ring transition-colors"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-cpDark-800 bg-cpDark-900 p-4 shadow-lg">
          <div className="flex items-center justify-between text-gray-400">
            <span className="text-xs font-mono font-medium uppercase tracking-wider">Active Frameworks</span>
            <Library className="h-4 w-4 text-aravBlue-400" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-white font-mono">{metrics.totalFrameworks}</span>
            <span className="text-xs text-emerald-400 font-medium">Authoritative</span>
          </div>
        </div>

        <div className="rounded-lg border border-cpDark-800 bg-cpDark-900 p-4 shadow-lg">
          <div className="flex items-center justify-between text-gray-400">
            <span className="text-xs font-mono font-medium uppercase tracking-wider">Version Editions</span>
            <Layers className="h-4 w-4 text-purple-400" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-white font-mono">{metrics.totalVersions}</span>
            <span className="text-xs text-gray-400">Published</span>
          </div>
        </div>

        <div className="rounded-lg border border-cpDark-800 bg-cpDark-900 p-4 shadow-lg">
          <div className="flex items-center justify-between text-gray-400">
            <span className="text-xs font-mono font-medium uppercase tracking-wider">Normative Clauses</span>
            <BookOpen className="h-4 w-4 text-emerald-400" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-white font-mono">{metrics.totalReferences}</span>
            <span className="text-xs text-emerald-400">Mapped</span>
          </div>
        </div>

        <div className="rounded-lg border border-cpDark-800 bg-cpDark-900 p-4 shadow-lg">
          <div className="flex items-center justify-between text-gray-400">
            <span className="text-xs font-mono font-medium uppercase tracking-wider">Organization Entitlements</span>
            <Building2 className="h-4 w-4 text-amber-400" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-white font-mono">{metrics.totalEntitlements}</span>
            <span className="text-xs text-gray-400">Active Grants</span>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="rounded-lg border border-cpDark-800 bg-cpDark-900 p-4 space-y-3 shadow-md">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          {/* Search Input */}
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-500" />
            <input
              type="text"
              placeholder="Search by framework name, code, authority, or jurisdiction..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="w-full rounded-md border border-cpDark-700 bg-cpDark-950 pl-9 pr-3 py-2 text-xs text-white placeholder-gray-500 focus-ring"
            />
          </div>

          {/* Quick Jurisdiction Filters */}
          <div className="flex items-center gap-1.5 overflow-x-auto text-xs">
            <span className="text-gray-400 font-mono text-[11px] mr-1">Jurisdiction:</span>
            {['ALL', 'Global', 'United States', 'European Union', 'India'].map((jur) => {
              const isActive = selectedJurisdiction === jur;
              return (
                <button
                  key={jur}
                  onClick={() => setSelectedJurisdiction(jur)}
                  className={`rounded-md px-2.5 py-1 font-medium transition-colors ${
                    isActive
                      ? 'bg-aravBlue-600 text-white font-semibold'
                      : 'bg-cpDark-800 text-gray-400 hover:text-white hover:bg-cpDark-700'
                  }`}
                >
                  {jur === 'ALL' ? 'All Jurisdictions' : jur}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Frameworks Master Table */}
      <div className="rounded-lg border border-cpDark-800 bg-cpDark-900 shadow-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-cpDark-800 bg-cpDark-950 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
              <tr>
                <th scope="col" className="px-4 py-3">Framework Identifier</th>
                <th scope="col" className="px-4 py-3">Category &amp; Instrument</th>
                <th scope="col" className="px-4 py-3">Issuing Authority &amp; Jurisdiction</th>
                <th scope="col" className="px-4 py-3">Latest Version</th>
                <th scope="col" className="px-4 py-3 text-center">Clauses / Refs</th>
                <th scope="col" className="px-4 py-3 text-center">Entitled Orgs</th>
                <th scope="col" className="px-4 py-3 text-center">Status</th>
                <th scope="col" className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-cpDark-800/60 font-mono text-gray-300">
              {isLoading ? (
                // Skeleton loading rows
                Array.from({ length: 5 }).map((_, idx) => (
                  <tr key={`skeleton-${idx}`} className="animate-pulse">
                    <td className="px-4 py-3">
                      <div className="h-4 w-28 bg-cpDark-800 rounded mb-1" />
                      <div className="h-3 w-44 bg-cpDark-850 rounded" />
                    </td>
                    <td className="px-4 py-3">
                      <div className="h-4 w-32 bg-cpDark-800 rounded" />
                    </td>
                    <td className="px-4 py-3">
                      <div className="h-4 w-36 bg-cpDark-800 rounded" />
                    </td>
                    <td className="px-4 py-3">
                      <div className="h-4 w-20 bg-cpDark-800 rounded" />
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="h-4 w-12 bg-cpDark-800 rounded mx-auto" />
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="h-4 w-12 bg-cpDark-800 rounded mx-auto" />
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="h-4 w-16 bg-cpDark-800 rounded mx-auto" />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="h-4 w-14 bg-cpDark-800 rounded ml-auto" />
                    </td>
                  </tr>
                ))
              ) : paginatedFrameworks.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-gray-500 font-sans">
                    <Library className="mx-auto h-8 w-8 text-gray-600 mb-2" />
                    <p className="font-semibold text-gray-300">No regulatory frameworks found</p>
                    <p className="text-xs text-gray-500 mt-1">
                      Try clearing search filters or checking jurisdiction criteria.
                    </p>
                  </td>
                </tr>
              ) : (
                paginatedFrameworks.map((fw) => (
                  <tr key={fw.id} className="hover:bg-cpDark-800/50 transition-colors">
                    {/* Identifier & Name */}
                    <td className="px-4 py-3">
                      <div className="font-sans">
                        <Link
                          href={`/frameworks/${fw.code}`}
                          className="font-bold text-white hover:text-aravBlue-300 transition-colors inline-flex items-center gap-1.5"
                        >
                          <span className="font-mono bg-cpDark-800 border border-cpDark-700 px-1.5 py-0.5 rounded text-[11px] text-amber-400">
                            {fw.code}
                          </span>
                          <span>{fw.name}</span>
                        </Link>
                      </div>
                    </td>

                    {/* Category & Instrument Type */}
                    <td className="px-4 py-3 whitespace-nowrap font-sans">
                      <div className="text-gray-200 font-medium">{fw.category}</div>
                      <div className="text-[11px] text-gray-400 font-mono">{fw.instrumentType}</div>
                    </td>

                    {/* Authority & Jurisdiction */}
                    <td className="px-4 py-3 font-sans">
                      <div className="text-gray-300 text-xs truncate max-w-xs" title={fw.issuingAuthority}>
                        {fw.issuingAuthority}
                      </div>
                      <div className="text-[11px] text-aravBlue-400 font-mono inline-flex items-center gap-1 mt-0.5">
                        <Globe className="h-3 w-3" />
                        <span>{fw.jurisdiction}</span>
                      </div>
                    </td>

                    {/* Latest Version & Effective Date */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      {fw.latestVersion ? (
                        <div>
                          <span className="rounded bg-cpDark-800 border border-cpDark-700 px-2 py-0.5 text-xs text-purple-300 font-bold">
                            v{fw.latestVersion.version}
                          </span>
                          {fw.latestVersion.effectiveDate && (
                            <div className="text-[10px] text-gray-400 mt-1 font-mono">
                              Effective: {new Date(fw.latestVersion.effectiveDate).toLocaleDateString()}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-gray-500 italic">No published version</span>
                      )}
                    </td>

                    {/* Clauses / Reference Count */}
                    <td className="px-4 py-3 text-center whitespace-nowrap">
                      <span className="font-bold text-emerald-400">
                        {fw.totalReferencesCount || fw.clausesCount}
                      </span>
                      <span className="text-[10px] text-gray-400 block font-sans">requirements</span>
                    </td>

                    {/* Entitled Organizations */}
                    <td className="px-4 py-3 text-center whitespace-nowrap">
                      <span className="rounded-full bg-cpDark-800 border border-cpDark-700 px-2.5 py-0.5 text-xs text-white font-bold">
                        {fw.entitledOrganizationsCount}
                      </span>
                      <span className="text-[10px] text-gray-400 block font-sans">tenants</span>
                    </td>

                    {/* Status */}
                    <td className="px-4 py-3 text-center whitespace-nowrap">
                      <StatusBadge status="ACTIVE" size="sm" />
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <Link
                        href={`/frameworks/${fw.code}`}
                        className="inline-flex items-center gap-1 text-xs text-aravBlue-400 hover:text-aravBlue-300 hover:underline font-sans"
                      >
                        <span>View Details</span>
                        <ChevronRight className="h-3.5 w-3.5" />
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        {filteredFrameworks.length > 0 && (
          <div className="flex items-center justify-between border-t border-cpDark-800 bg-cpDark-950 px-4 py-3 text-xs text-gray-400">
            <div>
              Showing <span className="font-bold text-white">{(currentPage - 1) * pageSize + 1}</span> to{' '}
              <span className="font-bold text-white">
                {Math.min(currentPage * pageSize, filteredFrameworks.length)}
              </span>{' '}
              of <span className="font-bold text-white">{filteredFrameworks.length}</span> frameworks
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="rounded-md border border-cpDark-700 bg-cpDark-900 px-3 py-1 text-xs font-medium text-gray-300 hover:bg-cpDark-800 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <span className="font-mono text-gray-400">
                Page {currentPage} of {totalPages}
              </span>
              <button
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage >= totalPages}
                className="rounded-md border border-cpDark-700 bg-cpDark-900 px-3 py-1 text-xs font-medium text-gray-300 hover:bg-cpDark-800 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

