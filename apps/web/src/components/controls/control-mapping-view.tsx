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
import { ControlImportModal } from './control-import-modal';
import { FrameworkClausesModal, FrameworkClauseItem, FrameworkSummary } from './framework-clauses-modal';
import { ComplianceScopeFilter } from '@/components/ui/compliance-scope-filter';
import { Plus, Search, Filter, GitMerge, ChevronRight, Sparkles } from 'lucide-react';



interface FrameworkApiDto {
  id: string;
  code: string;
  name: string;
  clauseCount?: number;
}

const FRAMEWORK_ACCENTS: Record<string, { bg: string; color: string; border: string; label: string }> = {
  ISO27001: { bg: '#E4F1F0', color: '#0C5A56', border: '#B8DFDB', label: 'ISO 27001' },
  SOC2: { bg: '#EFF6FF', color: '#1E40AF', border: '#BFDBFE', label: 'SOC 2' },
  GDPR: { bg: '#F3E8FF', color: '#7C3AED', border: '#DDD6FE', label: 'GDPR' },
  DPDP: { bg: '#FEF3C7', color: '#B5750A', border: '#FDE68A', label: 'DPDP' },
  ISO42001: { bg: '#ECFDF5', color: '#059669', border: '#A7F3D0', label: 'ISO 42001' },
  HIPAA: { bg: '#FFE4E6', color: '#E11D48', border: '#FECDD3', label: 'HIPAA' },
};

function getFrameworkAccent(code?: string): { bg: string; color: string; border: string; label: string } {
  if (!code) {
    return { bg: '#F8FAFC', color: '#475569', border: '#E2E8F0', label: 'Unspecified' };
  }
  const clean = code.toUpperCase();
  if (FRAMEWORK_ACCENTS[clean]) {
    return FRAMEWORK_ACCENTS[clean];
  }
  return {
    bg: '#F0FDFA',
    color: '#0F766E',
    border: '#99F6E4',
    label: code,
  };
}

interface ControlMappingViewProps {
  onNavigateToView?: (view: string) => void;
}

export function ControlMappingView({ onNavigateToView }: ControlMappingViewProps = {}) {
  const { showToast } = useToast();
  const [controls, setControls] = useState<ControlDto[]>([]);
  const [frameworks, setFrameworks] = useState<FrameworkApiDto[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Active Selected Control ID for Detail View
  const [selectedControlId, setSelectedControlId] = useState<string | null>(null);

  // Filters & Search
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [frameworkFilter, setFrameworkFilter] = useState<string>('');
  const [referenceFilter, setReferenceFilter] = useState<string>('');

  // Drawer state (Create Mode)
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);

  // Framework Clauses Popup State (Instant In-Memory Cache)
  const [selectedFrameworkForClauses, setSelectedFrameworkForClauses] = useState<FrameworkApiDto | null>(null);
  const [allClauses, setAllClauses] = useState<FrameworkClauseItem[]>([]);
  const [clausesLoading, setClausesLoading] = useState(false);

  // Pre-selected mapping for ControlDrawer
  const [preselectedFrameworkId, setPreselectedFrameworkId] = useState<string>('');
  const [preselectedClauseId, setPreselectedClauseId] = useState<string>('');

  const handleFrameworkChange = (fwId: string) => {
    setFrameworkFilter(fwId);
    setReferenceFilter('');
  };

  const fetchControls = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set('search', search.trim());
      if (categoryFilter) params.set('category', categoryFilter);
      if (statusFilter) params.set('status', statusFilter);
      if (frameworkFilter) params.set('frameworkId', frameworkFilter);
      if (referenceFilter) params.set('frameworkReferenceId', referenceFilter);

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
  }, [search, categoryFilter, statusFilter, frameworkFilter, referenceFilter]);

  useEffect(() => {
    fetchControls();
  }, [fetchControls]);

  useEffect(() => {
    async function fetchFrameworks() {
      try {
        const data = await apiRequest<FrameworkApiDto[]>('/frameworks');
        setFrameworks(data || []);
      } catch (err: any) {
        setFrameworks([]);
        console.warn('Could not load entitled frameworks for controls view:', err?.message);
      }
    }
    fetchFrameworks();
  }, []);

  // Pre-load all clauses in background so opening any framework popup is 0ms instant with zero lag
  useEffect(() => {
    async function fetchAllClauses() {
      try {
        const data = await apiRequest<FrameworkClauseItem[]>('/controls/framework-clauses');
        setAllClauses(data || []);
      } catch (err) {
        console.warn('Could not pre-load framework clauses:', err);
      }
    }
    fetchAllClauses();
  }, []);

  const handleFrameworkBadgeClick = async (fw: FrameworkApiDto) => {
    setSelectedFrameworkForClauses(fw);
    const hasClauses = allClauses.some(
      (c) => c.frameworkId === fw.id || c.frameworkCode === fw.code
    );
    if (!hasClauses) {
      setClausesLoading(true);
      try {
        const details = await apiRequest<{ clauses?: { id: string; code: string; title: string }[] }>(
          `/frameworks/${fw.code || fw.id}`
        );
        if (details && details.clauses) {
          const mapped: FrameworkClauseItem[] = details.clauses.map((c) => ({
            id: c.id,
            frameworkId: fw.id,
            frameworkCode: fw.code,
            code: c.code,
            title: c.title,
          }));
          setAllClauses((prev) => [...prev, ...mapped]);
        }
      } catch (err) {
        console.warn('Failed fallback fetch for framework clauses:', err);
      } finally {
        setClausesLoading(false);
      }
    }
  };

  const handleSelectMapClause = (
    fw: FrameworkSummary,
    clause: FrameworkClauseItem
  ) => {
    setSelectedFrameworkForClauses(null);
    setPreselectedFrameworkId(fw.id);
    setPreselectedClauseId(clause.id);
    setIsDrawerOpen(true);
  };

  // If user selected a control, render Detail View
  if (selectedControlId) {
    return (
      <ControlDetailView
        controlId={selectedControlId}
        onBack={() => {
          setSelectedControlId(null);
          fetchControls();
        }}
        onNavigateToView={onNavigateToView}
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
    <div className="omni-fade-in w-full max-w-7xl mx-auto px-4 sm:px-6 py-4 sm:py-8 overflow-x-hidden">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3 mb-5">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Control Mapping & Framework Library</h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Map operational security controls to ISO 27001, ISO 42001, SOC 2, GDPR, DPDP, and HIPAA standards using AI suggestions.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full md:w-auto">
          <button
            onClick={() => setIsImportModalOpen(true)}
            className="omni-btn-secondary w-full sm:w-auto justify-center shrink-0 flex items-center gap-1.5 text-xs sm:text-sm font-semibold"
            aria-label="Import and map controls from file"
          >
            <Sparkles size={15} className="text-teal-600" />
            Import & Map File
          </button>
          <button
            onClick={() => {
              setPreselectedFrameworkId('');
              setPreselectedClauseId('');
              setIsDrawerOpen(true);
            }}
            className="omni-btn-primary w-full sm:w-auto justify-center shrink-0 flex items-center gap-1.5 text-xs sm:text-sm"
          >
            <Plus size={15} /> New Control
          </button>
        </div>
      </div>

      {/* Dynamic Framework Badge Strip (Data-Driven from Framework API) */}
      {frameworks.length > 0 && (
        <div className="flex flex-wrap gap-2 sm:gap-2.5 mb-5 bg-white p-3.5 border border-slate-200 rounded-xl shadow-sm items-center w-full max-w-full overflow-hidden">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider mr-1 w-full sm:w-auto">
            Supported Frameworks:
          </span>
          {frameworks.map((fw) => {
            const accent = getFrameworkAccent(fw.code);
            return (
              <button
                type="button"
                key={fw.id || fw.code}
                onClick={() => handleFrameworkBadgeClick(fw)}
                style={{
                  background: accent.bg,
                  color: accent.color,
                  border: `1px solid ${accent.border}`,
                  padding: '4px 10px',
                  borderRadius: 6,
                  fontSize: 12,
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  transition: 'all 0.15s ease',
                  cursor: 'pointer',
                }}
                className="hover:scale-105 active:scale-95 transition-transform hover:shadow-xs focus:outline-none focus:ring-2 focus:ring-teal-600/30"
                title={`Click to inspect clauses and map controls for ${fw.name}`}
              >
                <span>{accent.label || fw.code}</span>
                {fw.clauseCount ? (
                  <span style={{ opacity: 0.75, fontSize: 10, fontWeight: 500 }} className="omni-mono">
                    {fw.clauseCount} clauses
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      )}

      {/* Filter Strip */}
      <div className="flex flex-col md:flex-row gap-2.5 sm:gap-3 items-stretch md:items-center mb-5 bg-white p-3.5 border border-slate-200 rounded-xl shadow-sm w-full max-w-full overflow-hidden">
        {/* Search */}
        <div className="relative flex-1 w-full">
          <Search size={15} color="#8B95A1" className="absolute left-2.5 top-3" />
          <input
            className="omni-input w-full"
            placeholder="Search control name, description, category..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ paddingLeft: 32 }}
            aria-label="Search controls"
          />
        </div>

        {/* Status Filter */}
        <div className="flex items-center gap-2 w-full md:w-auto">
          <Filter size={14} color="#5B6672" className="shrink-0 hidden md:inline" />
          <select
            className="omni-input w-full md:w-44"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            aria-label="Filter by mapping status"
          >
            <option value="">All Mapping Statuses</option>
            <option value={MappingStatus.APPROVED}>APPROVED</option>
            <option value={MappingStatus.SUGGESTED}>SUGGESTED</option>
            <option value={MappingStatus.OVERRIDDEN}>OVERRIDDEN</option>
          </select>
        </div>

        {/* Compliance Scope Filter (Framework & Cascading Reference) */}
        <div className="flex items-center gap-2 w-full md:w-auto">
          <ComplianceScopeFilter
            selectedFrameworkId={frameworkFilter}
            selectedReferenceId={referenceFilter}
            onFrameworkChange={handleFrameworkChange}
            onReferenceChange={(refId) => setReferenceFilter(refId)}
            allOptionLabel="All Frameworks"
            showReferenceFilter={true}
          />
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
        <>
          {/* Mobile Cards (< md) */}
          <div className="md:hidden space-y-3">
            {controls.map((control) => {
              const summary = getMappingSummaryBadgeClass(control);
              return (
                <div
                  key={control.id}
                  onClick={() => setSelectedControlId(control.id)}
                  tabIndex={0}
                  role="button"
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setSelectedControlId(control.id); }}
                  className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs hover:border-teal-500 hover:shadow-xs transition cursor-pointer space-y-2.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5 mb-1">
                        <span className="omni-mono text-[10px] bg-slate-100 text-slate-700 px-2 py-0.5 rounded font-semibold">
                          {control.category || 'General'}
                        </span>
                        <span className={summary.className}>
                          {summary.label}
                        </span>
                      </div>
                      <h4 className="font-bold text-slate-900 text-sm break-words">{control.name}</h4>
                    </div>
                    <span className="text-teal-700 inline-flex items-center gap-1 text-xs font-semibold shrink-0 pt-0.5">
                      Map <ChevronRight size={14} />
                    </span>
                  </div>

                  {control.description && (
                    <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed">
                      {control.description}
                    </p>
                  )}

                  <div className="flex items-center justify-between text-[11px] text-slate-400 pt-2 border-t border-slate-100">
                    <span>Updated {new Date(control.updatedAt).toLocaleDateString()}</span>
                    <span className="font-semibold text-teal-800">Tap to edit mappings</span>
                  </div>
                </div>
              );
            })}
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-500 text-center font-medium">
              Showing {controls.length} of {totalCount} controls · Tenant scoped
            </div>
          </div>

          {/* Desktop Table (>= md) */}
          <div style={{
            background: '#FFFFFF', border: '1px solid #E2E6E4', borderRadius: 10,
            overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
          }} className="hidden md:block overflow-x-auto">
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
                      }}
                      className="omni-table-row focus:outline-none"
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
        </>
      ) : null}

      {/* Slide-over Drawer for Create */}
      <ControlDrawer
        control={null}
        isOpen={isDrawerOpen}
        onClose={() => {
          setIsDrawerOpen(false);
          setPreselectedFrameworkId('');
          setPreselectedClauseId('');
        }}
        onSuccess={fetchControls}
        initialFrameworkId={preselectedFrameworkId}
        initialFrameworkClauseId={preselectedClauseId}
        onOpenImport={() => {
          setIsDrawerOpen(false);
          setIsImportModalOpen(true);
        }}
      />

      {/* Framework Clauses Inspection & Mapping Popup Modal */}
      <FrameworkClausesModal
        isOpen={Boolean(selectedFrameworkForClauses)}
        onClose={() => setSelectedFrameworkForClauses(null)}
        framework={selectedFrameworkForClauses}
        clauses={
          selectedFrameworkForClauses
            ? allClauses.filter(
                (c) =>
                  c.frameworkId === selectedFrameworkForClauses.id ||
                  c.frameworkCode === selectedFrameworkForClauses.code
              )
            : []
        }
        loading={clausesLoading}
        onSelectMapClause={handleSelectMapClause}
      />

      {/* AI Control Import Modal */}
      <ControlImportModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        onSuccess={fetchControls}
        initialFrameworkId={frameworkFilter}
      />
    </div>
  );
}

