'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/context/auth-context';
import { apiRequest } from '@/lib/api-client';
import { PaginatedAuditLogsDto, Role } from '@omnigrc/shared';
import { Lock, FileText, RefreshCw, Search, Filter, ChevronDown, ChevronRight } from 'lucide-react';
import { SkeletonTable } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { InlineErrorState } from '@/components/ui/inline-error-state';


export function AuditLogView() {
  const { user } = useAuth();
  const [data, setData] = useState<PaginatedAuditLogsDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState('');
  const [entityType, setEntityType] = useState('');
  const [action, setAction] = useState('');
  const [page, setPage] = useState(1);

  const isAdmin = user?.role === Role.ADMIN;

  const fetchLogs = async (currentPage = 1) => {
    if (!isAdmin) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set('page', String(currentPage));
      params.set('limit', '15');
      if (search) params.set('search', search);
      if (entityType) params.set('entityType', entityType);
      if (action) params.set('action', action);

      const res = await apiRequest<PaginatedAuditLogsDto>(`/audit-log?${params.toString()}`);
      setData(res);
    } catch (err: any) {
      setError(err?.message || 'Failed to fetch audit log entries from server. Check network connection or pod status.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs(page);
  }, [page, entityType]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchLogs(1);
  };

  if (!isAdmin) {
    return (
      <div className="omni-fade-in" style={{
        padding: '32px', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', height: '70vh', textAlign: 'center',
      }}>
        <div style={{
          width: 52, height: 52, borderRadius: 12, background: '#F8E6E8',
          display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16,
        }}>
          <Lock size={24} color="#801F2B" />
        </div>
        <h2 style={{ fontSize: 18, fontWeight: 600, color: '#1B2430' }}>Access Denied</h2>
        <p style={{ fontSize: 13, color: '#5B6672', marginTop: 6, maxWidth: 360 }}>
          The Global Audit Log Explorer is restricted to Organization Administrators (<span className="omni-mono">ADMIN</span> role).
        </p>
      </div>
    );
  }

  const getActionBadgeClass = (actionName: string) => {
    if (actionName.includes('CREATED') || actionName.includes('ACTIVATED') || actionName.includes('APPROVED')) {
      return 'omni-badge-teal';
    }
    if (actionName.includes('UPDATED') || actionName.includes('CHANGED') || actionName.includes('OVERRIDDEN')) {
      return 'omni-badge-amber';
    }
    if (actionName.includes('DELETED') || actionName.includes('DEACTIVATED') || actionName.includes('REJECTED')) {
      return 'omni-badge-rose';
    }
    return 'omni-badge-teal';
  };

  return (
    <div className="omni-fade-in w-full max-w-7xl mx-auto px-4 sm:px-6 py-4 sm:py-8 overflow-x-hidden">
      {/* Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3 mb-5">
        <div>
          <div className="flex items-center gap-2">
            <FileText size={20} color="#0F6E6A" />
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Audit Log Explorer</h1>
            <span className="omni-badge-teal">ADMIN ONLY</span>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Immutable event audit trail across all organization entities and system activities
          </p>
        </div>

        <button
          onClick={() => fetchLogs(page)}
          className="omni-btn-ghost flex items-center gap-1.5 text-xs w-full md:w-auto justify-center"
          aria-label="Refresh audit log"
        >
          <RefreshCw size={14} className={loading ? 'spin' : ''} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Filter Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-3.5 mb-5 flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between w-full max-w-full overflow-hidden shadow-sm">
        <form onSubmit={handleSearchSubmit} className="flex flex-col md:flex-row flex-1 gap-2 w-full">
          <div className="relative flex-1 w-full">
            <Search size={15} color="#8B95A1" className="absolute left-2.5 top-2.5" />
            <input
              type="text"
              placeholder="Search action, actor ID, or entity ID..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="omni-input w-full"
              style={{ paddingLeft: 32, height: 36, fontSize: 13 }}
              aria-label="Search audit logs"
            />
          </div>
          <button type="submit" className="omni-btn-ghost w-full md:w-auto" style={{ height: 36, padding: '0 16px', fontSize: 12.5 }}>
            Search
          </button>
        </form>

        <div className="flex items-center gap-2 w-full md:w-auto">
          <Filter size={14} color="#5B6672" className="shrink-0 hidden md:inline" />
          <span className="text-xs font-medium text-slate-500 shrink-0">Entity:</span>
          <select
            value={entityType}
            onChange={(e) => { setEntityType(e.target.value); setPage(1); }}
            className="omni-input w-full md:w-36"
            style={{ height: 36, fontSize: 12.5 }}
            aria-label="Filter by entity type"
          >
            <option value="">All Entities</option>
            <option value="Asset">Asset</option>
            <option value="Risk">Risk</option>
            <option value="Control">Control</option>
            <option value="ComplianceTask">Compliance Task</option>
            <option value="Organization">Organization</option>
            <option value="User">User</option>
            <option value="REGIONAL_POD">Regional Pod</option>
            <option value="MAPPING">Mapping / Overrides</option>
          </select>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <InlineErrorState
          title="Failed to fetch audit log"
          message={error}
          onRetry={() => fetchLogs(page)}
        />
      )}

      {/* Loading Skeleton / Table / Empty State */}
      {loading && !data ? (
        <SkeletonTable rows={8} cols={6} />
      ) : !data || data.items.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No audit events recorded"
          description="No system audit events match your current search or filter criteria."
        />
      ) : !error ? (
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E6E4', borderRadius: 10, overflow: 'hidden' }} className="overflow-x-auto">
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, textAlign: 'left' }}>
            <thead>
              <tr style={{ background: '#FAFBFB', borderBottom: '1px solid #E2E6E4', color: '#5B6672', fontWeight: 600 }}>
                <th style={{ padding: '10px 16px', width: 36 }}></th>
                <th style={{ padding: '10px 16px', width: 170 }}>Timestamp</th>
                <th style={{ padding: '10px 16px' }}>Action</th>
                <th style={{ padding: '10px 16px' }}>Entity Type</th>
                <th style={{ padding: '10px 16px' }}>Entity ID</th>
                <th style={{ padding: '10px 16px' }}>Actor ID</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((log) => {
                const isExpanded = expandedId === log.id;
                const actBadgeClass = getActionBadgeClass(log.action);
                return (
                  <React.Fragment key={log.id}>
                    <tr
                      onClick={() => setExpandedId(isExpanded ? null : log.id)}
                      tabIndex={0}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setExpandedId(isExpanded ? null : log.id); }}
                      style={{
                        borderBottom: '1px solid #EDEFED',
                        background: isExpanded ? '#FAFBFB' : undefined,
                      }}
                      className="omni-table-row focus:outline-none"
                    >
                      <td style={{ padding: '10px 16px', textAlign: 'center' }}>
                        {isExpanded ? <ChevronDown size={15} color="#5B6672" /> : <ChevronRight size={15} color="#8B95A1" />}
                      </td>
                      <td style={{ padding: '10px 16px', color: '#5B6672' }} className="omni-mono">
                        {new Date(log.createdAt).toLocaleString()}
                      </td>
                      <td style={{ padding: '10px 16px' }}>
                        <span className={`${actBadgeClass} omni-mono`}>
                          {log.action}
                        </span>
                      </td>
                      <td style={{ padding: '10px 16px', fontWeight: 500, color: '#1B2430' }}>
                        {log.entityType}
                      </td>
                      <td style={{ padding: '10px 16px', color: '#5B6672', fontFamily: 'monospace', fontSize: 11 }}>
                        {log.entityId}
                      </td>
                      <td style={{ padding: '10px 16px', color: '#5B6672', fontFamily: 'monospace', fontSize: 11 }}>
                        {log.actorId}
                      </td>
                    </tr>

                    {/* Expanded JSON Metadata Viewer */}
                    {isExpanded && (
                      <tr style={{ background: '#FAFBFB', borderBottom: '1px solid #E2E6E4' }}>
                        <td colSpan={6} style={{ padding: '12px 16px 16px 52px' }}>
                          <div style={{
                            background: '#16233F', color: '#A0AEC0', borderRadius: 8, padding: '12px 16px',
                            fontFamily: 'monospace', fontSize: 11.5, overflowX: 'auto',
                          }}>
                            <div style={{ color: '#0F6E6A', fontWeight: 600, marginBottom: 6, fontSize: 11 }}>
                              // AUDIT EVENT METADATA (NO SENSITIVE/PII PAYLOAD STORED)
                            </div>
                            <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
                              {JSON.stringify(
                                {
                                  id: log.id,
                                  organizationId: log.organizationId,
                                  actorId: log.actorId,
                                  action: log.action,
                                  entityType: log.entityType,
                                  entityId: log.entityId,
                                  metadata: log.metadata,
                                  timestamp: log.createdAt,
                                },
                                null,
                                2,
                              )}
                            </pre>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>

          {/* Pagination Bar */}
          {data && data.totalPages > 1 && (
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '12px 16px', borderTop: '1px solid #E2E6E4', background: '#FAFBFB',
            }}>
              <span style={{ fontSize: 12, color: '#5B6672' }}>
                Showing {((data.page - 1) * data.limit) + 1} – {Math.min(data.page * data.limit, data.total)} of {data.total} entries
              </span>
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  disabled={page <= 1}
                  onClick={() => setPage(page - 1)}
                  className="omni-btn-ghost"
                  style={{ height: 30, padding: '0 10px', fontSize: 12 }}
                >
                  Previous
                </button>
                <span style={{ fontSize: 12, display: 'flex', alignItems: 'center', padding: '0 8px', color: '#1B2430' }}>
                  Page {data.page} of {data.totalPages}
                </span>
                <button
                  disabled={page >= data.totalPages}
                  onClick={() => setPage(page + 1)}
                  className="omni-btn-ghost"
                  style={{ height: 30, padding: '0 10px', fontSize: 12 }}
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

