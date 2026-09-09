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
    <div className="omni-fade-in" style={{ padding: '24px 32px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <FileText size={20} color="#0F6E6A" />
            <h1 style={{ fontSize: 19, fontWeight: 600, color: '#1B2430' }}>Audit Log Explorer</h1>
            <span className="omni-badge-teal">ADMIN ONLY</span>
          </div>
          <p style={{ fontSize: 12.5, color: '#5B6672', marginTop: 3 }}>
            Immutable event audit trail across all organization entities and system activities
          </p>
        </div>

        <button
          onClick={() => fetchLogs(page)}
          className="omni-btn-ghost"
          style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5 }}
          aria-label="Refresh audit log"
        >
          <RefreshCw size={14} className={loading ? 'spin' : ''} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Filter Bar */}
      <div style={{
        background: '#FFFFFF', border: '1px solid #E2E6E4', borderRadius: 10,
        padding: '12px 16px', marginBottom: 20, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap',
      }}>
        <form onSubmit={handleSearchSubmit} style={{ display: 'flex', flex: 1, gap: 8, minWidth: 240 }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <Search size={15} color="#8B95A1" style={{ position: 'absolute', left: 10, top: 10 }} />
            <input
              type="text"
              placeholder="Search action, actor ID, or entity ID..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="omni-input"
              style={{ paddingLeft: 32, height: 34, fontSize: 12.5 }}
              aria-label="Search audit logs"
            />
          </div>
          <button type="submit" className="omni-btn-ghost" style={{ height: 34, padding: '0 14px', fontSize: 12 }}>
            Search
          </button>
        </form>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Filter size={14} color="#5B6672" />
          <span style={{ fontSize: 12, fontWeight: 500, color: '#5B6672' }}>Entity:</span>
          <select
            value={entityType}
            onChange={(e) => { setEntityType(e.target.value); setPage(1); }}
            className="omni-input"
            style={{ height: 34, fontSize: 12, padding: '0 8px', width: 140 }}
            aria-label="Filter by entity type"
          >
            <option value="">All Entities</option>
            <option value="ASSET">Asset</option>
            <option value="RISK">Risk</option>
            <option value="CONTROL">Control</option>
            <option value="COMPLIANCE_TASK">Compliance Task</option>
            <option value="REGIONAL_POD">Regional Pod</option>
            <option value="MAPPING">Mapping</option>
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
                        borderBottom: '1px solid #EDEFED', cursor: 'pointer',
                        background: isExpanded ? '#FAFBFB' : 'transparent',
                        transition: 'background 0.15s ease',
                      }}
                      className="hover:bg-gray-50/80 focus:bg-gray-50 focus:outline-none"
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

