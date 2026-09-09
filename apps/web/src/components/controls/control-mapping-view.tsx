'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Search, Plus, GitMerge, Filter, ChevronRight, CheckCircle2, AlertCircle, Clock } from 'lucide-react';
import { ControlDto, PaginatedControlsDto, MappingStatus } from '@omnigrc/shared';
import { apiRequest } from '@/lib/api-client';
import { ControlDrawer } from './control-drawer';
import { ControlDetailView } from './control-detail-view';

export function ControlMappingView() {
  const [controls, setControls] = useState<ControlDto[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);

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
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set('search', search.trim());
      if (categoryFilter) params.set('category', categoryFilter);
      if (statusFilter) params.set('status', statusFilter);

      const queryString = params.toString() ? `?${params.toString()}` : '';
      const data = await apiRequest<PaginatedControlsDto>(`/controls${queryString}`);
      setControls(data.items);
      setTotalCount(data.total);
    } catch {
      setControls([]);
      setTotalCount(0);
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

  const getMappingSummaryText = (control: ControlDto) => {
    if (!control.mappings || control.mappings.length === 0) {
      return { label: 'Unmapped', color: '#8B95A1', bg: '#EDEFED' };
    }
    const approved = control.mappings.filter((m) => m.status === MappingStatus.APPROVED || m.status === MappingStatus.OVERRIDDEN).length;
    const pending = control.mappings.filter((m) => m.status === MappingStatus.SUGGESTED).length;

    if (approved > 0 && pending > 0) {
      return { label: `${approved} approved · ${pending} pending`, color: '#B5750A', bg: '#FCEFD9' };
    } else if (approved > 0) {
      return { label: `${approved} approved`, color: '#0F6E6A', bg: '#E4F1F0' };
    } else {
      return { label: `${pending} pending review`, color: '#B5750A', bg: '#FCEFD9' };
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
          >
            <option value="">All Mapping Statuses</option>
            <option value={MappingStatus.APPROVED}>APPROVED</option>
            <option value={MappingStatus.SUGGESTED}>SUGGESTED</option>
            <option value={MappingStatus.OVERRIDDEN}>OVERRIDDEN</option>
          </select>
        </div>
      </div>

      {/* Control Table / Empty State */}
      {loading ? (
        <div style={{
          background: '#FFFFFF', border: '1px solid #E2E6E4', borderRadius: 10,
          padding: '40px 20px', textAlign: 'center', color: '#8B95A1', fontSize: 13,
        }}>
          Loading control mappings...
        </div>
      ) : controls.length === 0 ? (
        <div style={{
          background: '#FFFFFF', border: '1px solid #E2E6E4', borderRadius: 10,
          padding: '56px 24px', textAlign: 'center', display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            width: 48, height: 48, borderRadius: 12, background: '#E4F1F0', color: '#0F6E6A',
            display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16,
          }}>
            <GitMerge size={22} />
          </div>
          <h3 style={{ fontSize: 16, fontWeight: 600, color: '#1B2430' }}>No security controls created</h3>
          <p style={{ fontSize: 13, color: '#5B6672', marginTop: 6, maxWidth: 360, lineHeight: 1.5 }}>
            {search || statusFilter
              ? 'No controls match your current search or filter criteria. Try clearing filters.'
              : 'Add your security controls and policies to generate AI-assisted framework mappings.'}
          </p>
          <button
            onClick={() => setIsDrawerOpen(true)}
            className="omni-btn-primary"
            style={{ marginTop: 20, display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <Plus size={15} /> New Control
          </button>
        </div>
      ) : (
        <div style={{
          background: '#FFFFFF', border: '1px solid #E2E6E4', borderRadius: 10,
          overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
        }}>
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
                const summary = getMappingSummaryText(control);
                const isLast = index === controls.length - 1;

                return (
                  <tr
                    key={control.id}
                    onClick={() => setSelectedControlId(control.id)}
                    style={{
                      borderBottom: isLast ? 'none' : '1px solid #EDEFED',
                      cursor: 'pointer', transition: 'background .12s ease',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = '#F6F7F6')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
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
                      <span style={{
                        fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 999,
                        color: summary.color, background: summary.bg, letterSpacing: 0.3,
                      }}>
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
      )}

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
