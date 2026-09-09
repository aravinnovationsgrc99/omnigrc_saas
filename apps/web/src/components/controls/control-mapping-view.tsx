'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { ControlDto, PaginatedControlsDto, MappingStatus } from '@omnigrc/shared';
import { apiRequest } from '@/lib/api-client';
import { useToast } from '@/context/toast-context';
import { SkeletonTable } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { InlineErrorState } from '@/components/ui/inline-error-state';
import { ControlDrawer } from './control-drawer';
import { ControlDetailView } from './control-detail-view';
import { Plus, Search, Filter, GitMerge, ChevronRight } from 'lucide-react';



export function ControlMappingView() {
  const { showToast } = useToast();
  const [controls, setControls] = useState<ControlDto[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Active Selected Control ID for Detail View
  const [selectedControlId, setSelectedControlId] = useState<string | null>(null);

  // Filters & Search
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');

  // Drawer state (Create Mode)
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const fetchControls = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set('search', search.trim());
      if (categoryFilter) params.set('category', categoryFilter);
      if (statusFilter) params.set('status', statusFilter);

      const queryString = params.toString() ? `?${params.toString()}` : '';
      const data = await apiRequest<PaginatedControlsDto>(`/controls${queryString}`);
      setControls(data.items);
      setTotalCount(data.total);
    } catch (err: any) {
      setControls([]);
      setTotalCount(0);
      setError(err?.message || 'Failed to fetch controls from server. Check connection or pod status and try again.');
    } finally {
      setLoading(false);
    }
  }, [search, categoryFilter, statusFilter]);

  useEffect(() => {
    fetchControls();
  }, [fetchControls]);

  // If user selected a control, render Detail View
  if (selectedControlId) {
    return (
      <ControlDetailView
        controlId={selectedControlId}
        onBack={() => {
          setSelectedControlId(null);
          fetchControls();
        }}
      />
    );
  }

  const getMappingSummaryBadgeClass = (control: ControlDto) => {
    if (!control.mappings || control.mappings.length === 0) {
      return { label: 'Unmapped', className: 'omni-badge-amber' };
    }
    const approved = control.mappings.filter((m) => m.status === MappingStatus.APPROVED || m.status === MappingStatus.OVERRIDDEN).length;
    const pending = control.mappings.filter((m) => m.status === MappingStatus.SUGGESTED).length;

    if (approved > 0 && pending > 0) {
      return { label: `${approved} approved · ${pending} pending`, className: 'omni-badge-amber' };
    } else if (approved > 0) {
      return { label: `${approved} approved`, className: 'omni-badge-teal' };
    } else {
      return { label: `${pending} pending review`, className: 'omni-badge-amber' };
    }
  };

  return (
    <div className="omni-fade-in" style={{ padding: '28px 32px', maxWidth: 1140, margin: '0 auto' }}>
      {/* Top Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 21, fontWeight: 600, color: '#1B2430' }}>Control Mapping & Framework Library</h1>
          <p style={{ fontSize: 13.5, color: '#5B6672', marginTop: 3 }}>
            Map operational security controls to ISO 27001, ISO 42001, SOC 2, GDPR, DPDP, and HIPAA standards using AI suggestions.
          </p>
        </div>
        <button
          onClick={() => setIsDrawerOpen(true)}
          className="omni-btn-primary"
          style={{ display: 'flex', alignItems: 'center', gap: 6 }}
        >
          <Plus size={15} /> New Control
        </button>
      </div>

      {/* Filter Strip */}
      <div style={{
        display: 'flex', gap: 12, alignItems: 'center', marginBottom: 20,
        background: '#FFFFFF', padding: '12px 16px', border: '1px solid #E2E6E4', borderRadius: 8,
      }}>
        {/* Search */}
        <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
          <Search size={15} color="#8B95A1" style={{ position: 'absolute', left: 10, top: 11 }} />
          <input
            className="omni-input"
            placeholder="Search control name, description, category..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ paddingLeft: 32 }}
            aria-label="Search controls"
          />
        </div>

        {/* Status Filter */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Filter size={14} color="#5B6672" />
          <select
            className="omni-input"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{ width: 160 }}
            aria-label="Filter by mapping status"
          >
            <option value="">All Mapping Statuses</option>
            <option value={MappingStatus.APPROVED}>APPROVED</option>
            <option value={MappingStatus.SUGGESTED}>SUGGESTED</option>
            <option value={MappingStatus.OVERRIDDEN}>OVERRIDDEN</option>
          </select>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <InlineErrorState
          title="Failed to fetch controls"
          message={error}
          onRetry={fetchControls}
        />
      )}

      {/* Control Table / Skeleton / Empty State */}
      {loading ? (
        <SkeletonTable rows={5} cols={5} />
      ) : controls.length === 0 && !error ? (
        <EmptyState
          icon={GitMerge}
          title="No security controls created"
          description={
            search || statusFilter
              ? 'No controls match your search or filter criteria. Clear filters or add a new control.'
              : 'Add your security controls and policies to generate AI-assisted framework mappings.'
          }
          actionLabel="New Control"
          onAction={() => setIsDrawerOpen(true)}
        />
      ) : !error ? (
        <div style={{
          background: '#FFFFFF', border: '1px solid #E2E6E4', borderRadius: 10,
          overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
        }} className="overflow-x-auto">
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#F6F7F6', borderBottom: '1px solid #E2E6E4', color: '#5B6672' }}>
                <th style={{ padding: '12px 16px', fontWeight: 600 }}>Control Name</th>
                <th style={{ padding: '12px 16px', fontWeight: 600 }}>Category</th>
                <th style={{ padding: '12px 16px', fontWeight: 600 }}>Mapping Status</th>
                <th style={{ padding: '12px 16px', fontWeight: 600 }}>Updated</th>
                <th style={{ padding: '12px 16px', fontWeight: 600, textAlign: 'right' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {controls.map((control, index) => {
                const summary = getMappingSummaryBadgeClass(control);
                const isLast = index === controls.length - 1;

                return (
                  <tr
                    key={control.id}
                    onClick={() => setSelectedControlId(control.id)}
                    tabIndex={0}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setSelectedControlId(control.id); }}
                    style={{
                      borderBottom: isLast ? 'none' : '1px solid #EDEFED',
                      cursor: 'pointer', transition: 'background .12s ease',
                    }}
                    className="hover:bg-gray-50/80 focus:bg-gray-50 focus:outline-none"
                  >
                    <td style={{ padding: '14px 16px', fontWeight: 600, color: '#1B2430' }}>
                      {control.name}
                      <div style={{ fontSize: 11.5, fontWeight: 400, color: '#5B6672', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 420 }}>
                        {control.description}
                      </div>
                    </td>
                    <td style={{ padding: '14px 16px' }}>
                      <span className="omni-mono" style={{ fontSize: 11.5, background: '#EDEFED', padding: '3px 8px', borderRadius: 4, color: '#5B6672' }}>
                        {control.category || 'General'}
                      </span>
                    </td>
                    <td style={{ padding: '14px 16px' }}>
                      <span className={summary.className}>
                        {summary.label}
                      </span>
                    </td>
                    <td style={{ padding: '14px 16px', color: '#8B95A1', fontSize: 12 }}>
                      {new Date(control.updatedAt).toLocaleDateString()}
                    </td>
                    <td style={{ padding: '14px 16px', textAlign: 'right', color: '#0F6E6A', fontWeight: 600 }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2, fontSize: 12.5 }}>
                        Map <ChevronRight size={14} />
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div style={{
            padding: '12px 16px', background: '#F6F7F6', borderTop: '1px solid #E2E6E4',
            fontSize: 12, color: '#5B6672', display: 'flex', justifyContent: 'space-between',
          }}>
            <span>Showing {controls.length} of {totalCount} controls</span>
            <span>Tenant scoped</span>
          </div>
        </div>
      ) : null}

      {/* Slide-over Drawer for Create */}
      <ControlDrawer
        control={null}
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        onSuccess={fetchControls}
      />
    </div>
  );
}

