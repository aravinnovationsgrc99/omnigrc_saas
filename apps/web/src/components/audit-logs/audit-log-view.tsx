'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/context/auth-context';
import { apiRequest } from '@/lib/api-client';
import { AuditLogEntryDto, PaginatedAuditLogsDto, Role } from '@omnigrc/shared';
import { Search, FileText, ChevronRight, ChevronDown, ShieldAlert, RefreshCw, Lock, Filter } from 'lucide-react';

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
      setError(err.message || 'Failed to fetch audit log entries');
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
          <Lock size={24} color="#B23A48" />
        </div>
        <h2 style={{ fontSize: 18, fontWeight: 600, color: '#1B2430' }}>Access Denied</h2>
        <p style={{ fontSize: 13, color: '#5B6672', marginTop: 6, maxWidth: 360 }}>
          The Global Audit Log Explorer is restricted to Organization Administrators (<span className="omni-mono">ADMIN</span> role).
        </p>
      </div>
    );
  }

  const getActionColor = (actionName: string) => {
    if (actionName.includes('CREATED') || actionName.includes('ACTIVATED') || actionName.includes('APPROVED')) {
      return { bg: '#E4F1F0', color: '#0F6E6A' };
    }
    if (actionName.includes('UPDATED') || actionName.includes('CHANGED') || actionName.includes('OVERRIDDEN')) {
      return { bg: '#FCEFD9', color: '#B5750A' };
    }
    if (actionName.includes('DELETED') || actionName.includes('DEACTIVATED') || actionName.includes('REJECTED')) {
      return { bg: '#F8E6E8', color: '#B23A48' };
    }
    return { bg: '#EDEFED', color: '#5B6672' };
  };

  return (
    <div className="omni-fade-in" style={{ padding: '24px 32px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <FileText size={20} color="#0F6E6A" />
            <h1 style={{ fontSize: 19, fontWeight: 600, color: '#1B2430' }}>Audit Log Explorer</h1>
            <span style={{
              fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 999,
              background: '#E4F1F0', color: '#0F6E6A', border: '1px solid #BCE3E0',
            }}>ADMIN ONLY</span>
          </div>
          <p style={{ fontSize: 12.5, color: '#5B6672', marginTop: 3 }}>
            Immutable event audit trail across all organization entities and system activities
          </p>
        </div>

        <button
          onClick={() => fetchLogs(page)}
          className="omni-btn-secondary"
          style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5 }}
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
            />
          </div>
          <button type="submit" className="omni-btn-secondary" style={{ height: 34, padding: '0 14px', fontSize: 12 }}>
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
        <div style={{
          background: '#F8E6E8', border: '1px solid #ECA8B0', borderRadius: 8,
          padding: '12px 16px', color: '#B23A48', fontSize: 13, marginBottom: 16,
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <ShieldAlert size={16} />
          <span>{error}</span>
        </div>
      )}

      {/* Table */}
      <div style={{ background: '#FFFFFF', border: '1px solid #E2E6E4', borderRadius: 10, overflow: 'hidden' }}>
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
            {loading && !data ? (
              <tr>
                <td colSpan={6} style={{ padding: '32px', textAlign: 'center', color: '#8B95A1' }}>
                  Loading audit logs...
                </td>
              </tr>
            ) : !data || data.items.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ padding: '32px', textAlign: 'center', color: '#8B95A1' }}>
                  No audit log entries matching criteria.
                </td>
              </tr>
            ) : (
              data.items.map((log) => {
                const isExpanded = expandedId === log.id;
                const actStyle = getActionColor(log.action);
                return (
                  <React.Fragment key={log.id}>
                    <tr
                      onClick={() => setExpandedId(isExpanded ? null : log.id)}
                      style={{
                        borderBottom: '1px solid #EDEFED', cursor: 'pointer',
                        background: isExpanded ? '#FAFBFB' : 'transparent',
                        transition: 'background 0.15s ease',
                      }}
                    >
                      <td style={{ padding: '10px 16px', textAlign: 'center' }}>
                        {isExpanded ? <ChevronDown size={15} color="#5B6672" /> : <ChevronRight size={15} color="#8B95A1" />}
                      </td>
                      <td style={{ padding: '10px 16px', color: '#5B6672' }} className="omni-mono">
                        {new Date(log.createdAt).toLocaleString()}
                      </td>
                      <td style={{ padding: '10px 16px' }}>
                        <span style={{
                          fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 999,
                          background: actStyle.bg, color: actStyle.color,
                        }} className="omni-mono">
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
              })
            )}
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
                className="omni-btn-secondary"
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
                className="omni-btn-secondary"
                style={{ height: 30, padding: '0 10px', fontSize: 12 }}
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
