'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ShieldCheck,
  Search,
  Filter,
  RefreshCw,
  FileText,
  Lock,
  ChevronLeft,
  ChevronRight,
  Info,
  X,
  Building2,
  Sliders,
  CheckCircle2,
  AlertTriangle,
  XCircle,
} from 'lucide-react';
import { useAuth } from '../../lib/auth-context';
import { controlPlaneApi, ControlPlaneApiError } from '../../lib/control-plane-api';
import {
  ControlPlaneAuditLogEntry,
  AuditLogsResponse,
  OrganizationControlState,
} from '../../types/control-plane';
import { StatusBadge } from '../../components/ui/status-badge';
import { ErrorState } from '../../components/ui/error-state';
import { AccessDenied } from '../../components/ui/access-denied';

export default function AuditPage() {
  const { operator, isAuthenticated, isLoading: isAuthLoading } = useAuth();

  // Core Data States
  const [auditData, setAuditData] = useState<AuditLogsResponse | null>(null);
  const [organizations, setOrganizations] = useState<OrganizationControlState[]>([]);

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<ControlPlaneApiError | null>(null);

  // Filter & Search States
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState<string>('ALL');
  const [resultFilter, setResultFilter] = useState<string>('ALL');
  const [selectedOrgId, setSelectedOrgId] = useState<string>('');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(20);

  // Detail Modal State
  const [selectedLog, setSelectedLog] = useState<ControlPlaneAuditLogEntry | null>(null);

  // RBAC Permission Check
  const canViewAudit =
    operator?.role === 'PLATFORM_SUPER_ADMIN' ||
    operator?.role === 'SECURITY_AUDIT' ||
    operator?.role === 'READ_ONLY_AUDITOR';

  // Fetch Authoritative Audit Log Records
  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const [response, orgList] = await Promise.all([
        controlPlaneApi.listAuditLogs({
          search: search.trim() || undefined,
          action: actionFilter !== 'ALL' ? actionFilter : undefined,
          result: resultFilter !== 'ALL' ? resultFilter : undefined,
          organizationId: selectedOrgId || undefined,
          page: currentPage,
          limit: pageSize,
        }),
        controlPlaneApi.listOrganizations().catch(() => []),
      ]);

      setAuditData(response);
      setOrganizations(orgList || []);
    } catch (err: any) {
      if (err instanceof ControlPlaneApiError) {
        setError(err);
      } else {
        setError(new ControlPlaneApiError(500, err.message || 'Failed to load Control Plane audit log explorer'));
      }
    } finally {
      setIsLoading(false);
    }
  }, [search, actionFilter, resultFilter, selectedOrgId, currentPage, pageSize]);

  useEffect(() => {
    if (isAuthenticated) {
      fetchData();
    }
  }, [isAuthenticated, fetchData]);

  // Unique Action Types Extracted from Records or Standard Enums
  const standardActionTypes = [
    'OPERATOR_LOGIN_SUCCESS',
    'OPERATOR_LOGIN_FAILED',
    'OPERATOR_LOGOUT',
    'OPERATOR_CREATED',
    'OPERATOR_ROLE_UPDATED',
    'ORGANIZATION_CONTROL_STATE_CHANGED',
    'SERVICE_GLOBAL_STATE_CHANGED',
    'ORGANIZATION_SERVICE_OVERRIDE_SET',
    'ORGANIZATION_SERVICE_OVERRIDE_CLEARED',
    'DEPLOYMENT_CREATED',
    'DEPLOYMENT_ACTIVATION_STATE_CHANGED',
    'LICENSE_CREATED',
    'LICENSE_UPDATED',
    'LICENSE_REVOKED',
    'ENTITLEMENT_GRANTED',
    'ENTITLEMENT_REVOKED',
    'BREAK_GLASS_SESSION_REQUESTED',
    'BREAK_GLASS_SESSION_APPROVED',
    'BREAK_GLASS_ACTION_EXECUTED',
    'BREAK_GLASS_SESSION_REVOKED',
    'BREAK_GLASS_POST_EVENT_REVIEWED',
  ];

  const renderResultBadge = (result?: string | null) => {
    switch (result) {
      case 'SUCCESS':
        return <StatusBadge status="ACTIVE" label="SUCCESS" size="sm" />;
      case 'FAILURE':
        return <StatusBadge status="DISABLED" label="FAILURE" size="sm" />;
      case 'DENIED':
        return <StatusBadge status="REVOKED" label="DENIED" size="sm" />;
      default:
        return <StatusBadge status="SUSPENDED" label={result || 'UNKNOWN'} size="sm" />;
    }
  };

  if (isAuthLoading || (isLoading && !auditData && !error)) {
    return (
      <div className="flex h-64 items-center justify-center">
        <RefreshCw className="h-6 w-6 animate-spin text-aravBlue-400" />
      </div>
    );
  }

  if (error && error.statusCode === 403) {
    return (
      <AccessDenied
        resource="Global Control Plane Audit Explorer API"
        requiredRole="PLATFORM_SUPER_ADMIN / SECURITY_AUDIT / READ_ONLY_AUDITOR"
      />
    );
  }

  if (!canViewAudit) {
    return (
      <AccessDenied
        resource="Global Control Plane Audit Explorer"
        requiredRole="PLATFORM_SUPER_ADMIN / SECURITY_AUDIT / READ_ONLY_AUDITOR"
      />
    );
  }

  if (error) {
    return (
      <ErrorState
        statusCode={error.statusCode}
        title="Failed to load Control Plane Audit Explorer"
        message={error.message}
        correlationId={error.correlationId}
        onRetry={fetchData}
      />
    );
  }

  const logs = auditData?.data || [];
  const meta = auditData?.meta || { total: 0, page: 1, limit: 20, totalPages: 1, hasNextPage: false, hasPreviousPage: false };

  return (
    <div className="space-y-6 font-mono">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between border-b border-cpDark-800 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-6 w-6 text-emerald-400" />
            <h1 className="text-xl font-bold text-white tracking-tight">Audit & Security Explorer</h1>
          </div>
          <p className="mt-1 text-xs text-gray-400">
            Control Plane administrative and security activity audit log.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 rounded-md border border-cpDark-700 bg-cpDark-900 px-3 py-1 text-xs text-gray-300">
            <Lock className="h-3.5 w-3.5 text-emerald-400" />
            <span>Auditor Access ({operator?.role})</span>
          </div>

          <button
            onClick={fetchData}
            disabled={isLoading}
            className="inline-flex items-center gap-2 rounded border border-cpDark-700 bg-cpDark-800 px-3.5 py-1.5 text-xs font-medium text-gray-300 hover:bg-cpDark-700 hover:text-white transition-colors focus-ring"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin text-aravBlue-400' : ''}`} />
            <span>Refresh Log</span>
          </button>
        </div>
      </div>

      {/* Scope & Distinction Notice */}
      <div className="rounded-lg border border-cpDark-800 bg-cpDark-950 p-4 text-xs text-gray-300 space-y-2">
        <div className="flex items-center gap-2 font-bold text-emerald-400">
          <Info className="h-4 w-4 shrink-0" />
          <span>Control Plane Audit Authority Scope</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1 text-[11px] text-gray-400">
          <div className="rounded border border-cpDark-800 bg-cpDark-900/60 p-2.5">
            <span className="font-bold text-emerald-300 block mb-1">Control Plane Audit Log (This Page)</span>
            Records administrative mutations, operator authentication, organization state transitions, capability kill switches, license signing, and break-glass emergency actions.
          </div>
          <div className="rounded border border-cpDark-800 bg-cpDark-900/60 p-2.5">
            <span className="font-bold text-aravBlue-300 block mb-1">Tenant / Data Plane Audit Logs</span>
            Customer end-user interactions, risk assessments, and asset modifications are processed within isolated Data Plane deployments and are not stored in the Control Plane database.
          </div>
        </div>
      </div>

      {/* KPI Stats Strip */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-lg border border-cpDark-800 bg-cpDark-900 p-4 shadow-md">
          <span className="text-[11px] font-medium uppercase tracking-wider text-gray-400">Total Recorded Events</span>
          <div className="mt-1 text-2xl font-bold text-white">{meta.total}</div>
        </div>

        <div className="rounded-lg border border-cpDark-800 bg-cpDark-900 p-4 shadow-md">
          <span className="text-[11px] font-medium uppercase tracking-wider text-emerald-400">Current Page</span>
          <div className="mt-1 text-2xl font-bold text-emerald-400">Page {meta.page} / {meta.totalPages || 1}</div>
        </div>

        <div className="rounded-lg border border-cpDark-800 bg-cpDark-900 p-4 shadow-md">
          <span className="text-[11px] font-medium uppercase tracking-wider text-aravBlue-400">Page Size Bound</span>
          <div className="mt-1 text-2xl font-bold text-aravBlue-300">{meta.limit} per page</div>
        </div>

        <div className="rounded-lg border border-cpDark-800 bg-cpDark-900 p-4 shadow-md">
          <span className="text-[11px] font-medium uppercase tracking-wider text-amber-400">Redaction Engine</span>
          <div className="mt-1 text-xs font-bold text-amber-300 pt-2">Zero Raw Secrets / JWTs / Keys</div>
        </div>
      </div>

      {/* Server-Side Filters Bar */}
      <div className="flex flex-col gap-3 rounded-lg border border-cpDark-800 bg-cpDark-900 p-4 shadow-lg">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setCurrentPage(1);
              }}
              placeholder="Search action, entity ID, correlation ID, actor ID..."
              className="w-full rounded-md border border-cpDark-700 bg-cpDark-950 pl-9 pr-4 py-2 text-xs text-white placeholder-gray-500 focus-ring"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Filter className="h-4 w-4 text-gray-400 shrink-0" />

            {/* Event Action Filter */}
            <select
              value={actionFilter}
              onChange={(e) => {
                setActionFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="rounded-md border border-cpDark-700 bg-cpDark-950 px-3 py-2 text-xs text-gray-300 focus-ring"
            >
              <option value="ALL">All Event Actions</option>
              {standardActionTypes.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>

            {/* Result Filter */}
            <select
              value={resultFilter}
              onChange={(e) => {
                setResultFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="rounded-md border border-cpDark-700 bg-cpDark-950 px-3 py-2 text-xs text-gray-300 focus-ring"
            >
              <option value="ALL">All Results</option>
              <option value="SUCCESS">SUCCESS</option>
              <option value="FAILURE">FAILURE</option>
              <option value="DENIED">DENIED</option>
            </select>

            {/* Organization Selector */}
            <select
              value={selectedOrgId}
              onChange={(e) => {
                setSelectedOrgId(e.target.value);
                setCurrentPage(1);
              }}
              className="rounded-md border border-cpDark-700 bg-cpDark-950 px-3 py-2 text-xs text-gray-300 focus-ring"
            >
              <option value="">All Target Organizations</option>
              {organizations.map((o) => (
                <option key={o.organizationId} value={o.organizationId}>
                  {o.organizationId} ({o.state})
                </option>
              ))}
            </select>

            {/* Page Size Bounded Selector */}
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setCurrentPage(1);
              }}
              className="rounded-md border border-cpDark-700 bg-cpDark-950 px-3 py-2 text-xs text-gray-300 focus-ring"
            >
              <option value={10}>10 / page</option>
              <option value={20}>20 / page</option>
              <option value={50}>50 / page</option>
              <option value={100}>100 / page</option>
            </select>
          </div>
        </div>
      </div>

      {/* Audit Log Table */}
      <div className="rounded-lg border border-cpDark-800 bg-cpDark-900 shadow-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-cpDark-800 bg-cpDark-950 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
              <tr>
                <th scope="col" className="px-4 py-3">Timestamp</th>
                <th scope="col" className="px-4 py-3">Event Action</th>
                <th scope="col" className="px-4 py-3">Entity Type / Target ID</th>
                <th scope="col" className="px-4 py-3">Actor (ID / Role)</th>
                <th scope="col" className="px-4 py-3">Result</th>
                <th scope="col" className="px-4 py-3">Correlation ID</th>
                <th scope="col" className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-cpDark-800/60 text-gray-300">
              {logs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-gray-500 italic">
                    No Control Plane audit records match the selected filter criteria.
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr key={log.id} className="hover:bg-cpDark-800/40 transition-colors">
                    <td className="px-4 py-3 whitespace-nowrap text-[11px] text-gray-400">
                      <div>{new Date(log.createdAt).toLocaleString()}</div>
                    </td>
                    <td className="px-4 py-3 font-bold text-aravBlue-300 whitespace-nowrap">
                      {log.action}
                    </td>
                    <td className="px-4 py-3 text-[11px]">
                      <div className="text-white font-semibold">{log.entityType}</div>
                      <div className="text-gray-400 font-mono">{log.entityId}</div>
                    </td>
                    <td className="px-4 py-3 text-[11px]">
                      <div className="text-gray-200 font-semibold">{log.actorId || 'SYSTEM'}</div>
                      <div className="text-gray-500 font-mono">{log.actorRole || 'N/A'}</div>
                    </td>
                    <td className="px-4 py-3">
                      {renderResultBadge(log.result)}
                    </td>
                    <td className="px-4 py-3 font-mono text-[11px] text-gray-400 truncate max-w-xs" title={log.correlationId || 'N/A'}>
                      {log.correlationId || '—'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => setSelectedLog(log)}
                        className="rounded bg-cpDark-800 text-gray-300 border border-cpDark-700 px-2.5 py-1 text-[11px] font-semibold hover:bg-cpDark-700 hover:text-white transition-colors"
                      >
                        Inspect Details
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Server-Side Bounded Pagination Controls */}
        <div className="flex items-center justify-between border-t border-cpDark-800 bg-cpDark-950 px-4 py-3 text-xs text-gray-400">
          <div>
            Showing <strong className="text-white">{logs.length}</strong> of <strong className="text-white">{meta.total}</strong> total audit records
            (Page {meta.page} of {meta.totalPages || 1})
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
              disabled={!meta.hasPreviousPage || isLoading}
              className="inline-flex items-center gap-1 rounded border border-cpDark-700 bg-cpDark-900 px-3 py-1.5 text-xs text-gray-300 hover:bg-cpDark-800 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="h-4 w-4" />
              <span>Previous</span>
            </button>

            <button
              onClick={() => setCurrentPage((prev) => prev + 1)}
              disabled={!meta.hasNextPage || isLoading}
              className="inline-flex items-center gap-1 rounded border border-cpDark-700 bg-cpDark-900 px-3 py-1.5 text-xs text-gray-300 hover:bg-cpDark-800 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <span>Next</span>
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Forensic Detail Modal */}
      {selectedLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-lg border border-cpDark-700 bg-cpDark-900 p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-cpDark-800 pb-3">
              <div className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-emerald-400" />
                <h3 className="text-base font-bold text-white">Forensic Audit Log Entry: {selectedLog.id}</h3>
              </div>
              <button onClick={() => setSelectedLog(null)} className="text-gray-400 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4 text-xs text-gray-300 bg-cpDark-950 p-4 rounded border border-cpDark-800">
              <div>
                <span className="text-gray-500 block text-[10px] uppercase font-bold">Event Action</span>
                <span className="font-bold text-aravBlue-300">{selectedLog.action}</span>
              </div>
              <div>
                <span className="text-gray-500 block text-[10px] uppercase font-bold">Result Status</span>
                <div>{renderResultBadge(selectedLog.result)}</div>
              </div>
              <div>
                <span className="text-gray-500 block text-[10px] uppercase font-bold">Actor ID</span>
                <span className="font-bold text-white">{selectedLog.actorId || 'SYSTEM'}</span>
              </div>
              <div>
                <span className="text-gray-500 block text-[10px] uppercase font-bold">Actor Role</span>
                <span>{selectedLog.actorRole || 'N/A'}</span>
              </div>
              <div>
                <span className="text-gray-500 block text-[10px] uppercase font-bold">Entity Type</span>
                <span>{selectedLog.entityType}</span>
              </div>
              <div>
                <span className="text-gray-500 block text-[10px] uppercase font-bold">Entity ID</span>
                <span>{selectedLog.entityId}</span>
              </div>
              <div>
                <span className="text-gray-500 block text-[10px] uppercase font-bold">Originating IP Address</span>
                <span>{selectedLog.ipAddress || 'N/A'}</span>
              </div>
              <div>
                <span className="text-gray-500 block text-[10px] uppercase font-bold">Correlation ID</span>
                <span className="font-mono">{selectedLog.correlationId || 'N/A'}</span>
              </div>
              <div className="col-span-2">
                <span className="text-gray-500 block text-[10px] uppercase font-bold">Timestamp (UTC)</span>
                <span>{new Date(selectedLog.createdAt).toUTCString()} ({selectedLog.createdAt})</span>
              </div>
            </div>

            {/* Redacted Metadata Viewer */}
            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-gray-300 font-bold">Safe Metadata Payload (Server-Redacted):</span>
                <span className="text-[10px] text-amber-400">Redaction Engine Active</span>
              </div>
              <pre className="p-3 bg-cpDark-950 border border-cpDark-800 rounded text-emerald-400 overflow-x-auto text-[11px] max-h-64">
                {JSON.stringify(selectedLog.metadata || {}, null, 2)}
              </pre>
            </div>

            <div className="flex justify-end border-t border-cpDark-800 pt-3">
              <button
                onClick={() => setSelectedLog(null)}
                className="rounded border border-cpDark-700 bg-cpDark-800 px-4 py-1.5 text-xs text-gray-300 hover:text-white"
              >
                Close Record
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
