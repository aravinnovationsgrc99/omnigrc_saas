'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { RiskDto, PaginatedRisksDto, RiskStatus, RiskScoreBand } from '@omnigrc/shared';
import { apiRequest } from '@/lib/api-client';
import { useToast } from '@/context/toast-context';
import { SkeletonTable } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { InlineErrorState } from '@/components/ui/inline-error-state';
import { RiskHeatmap } from './risk-heatmap';
import { RiskDrawer } from './risk-drawer';
import { Plus, List, LayoutGrid, Search, X, ShieldAlert } from 'lucide-react';


export function RiskListView() {
  const { showToast } = useToast();
  const [risks, setRisks] = useState<RiskDto[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Tab State
  const [activeTab, setActiveTab] = useState<'list' | 'heatmap'>('list');

  // Filters & Search
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [scoreBandFilter, setScoreBandFilter] = useState<string>('');
  const [cellLikelihood, setCellLikelihood] = useState<number | null>(null);
  const [cellImpact, setCellImpact] = useState<number | null>(null);

  // Drawer state
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [selectedRisk, setSelectedRisk] = useState<RiskDto | null>(null);

  const fetchRisks = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set('search', search.trim());
      if (statusFilter) params.set('status', statusFilter);
      if (scoreBandFilter) params.set('scoreBand', scoreBandFilter);
      if (cellLikelihood) params.set('likelihood', cellLikelihood.toString());
      if (cellImpact) params.set('impact', cellImpact.toString());

      const queryString = params.toString() ? `?${params.toString()}` : '';
      const data = await apiRequest<PaginatedRisksDto>(`/risks${queryString}`);
      setRisks(data.items);
      setTotalCount(data.total);
    } catch (err: any) {
      setRisks([]);
      setTotalCount(0);
      setError(err?.message || 'Failed to fetch risk register from server. Check your connection or pod status and try again.');
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter, scoreBandFilter, cellLikelihood, cellImpact]);

  useEffect(() => {
    fetchRisks();
  }, [fetchRisks]);

  const handleHeatmapCellSelect = (likelihood: number, impact: number) => {
    setCellLikelihood(likelihood);
    setCellImpact(impact);
    setActiveTab('list'); // Automatically switch to list view filtered by this cell
  };

  const clearCellFilter = () => {
    setCellLikelihood(null);
    setCellImpact(null);
  };

  const handleOpenCreate = () => {
    setSelectedRisk(null);
    setIsDrawerOpen(true);
  };

  const handleOpenEdit = (risk: RiskDto) => {
    setSelectedRisk(risk);
    setIsDrawerOpen(true);
  };

  const getScoreBadgeClass = (scoreBand: RiskScoreBand) => {
    switch (scoreBand) {
      case RiskScoreBand.HIGH:
        return 'omni-badge-rose';
      case RiskScoreBand.MEDIUM:
        return 'omni-badge-amber';
      case RiskScoreBand.LOW:
      default:
        return 'omni-badge-teal';
    }
  };

  const getStatusBadgeClass = (status: RiskStatus) => {
    switch (status) {
      case RiskStatus.OPEN:
        return 'omni-badge-rose';
      case RiskStatus.IN_TREATMENT:
        return 'omni-badge-amber';
      case RiskStatus.ACCEPTED:
        return 'omni-badge-teal';
      case RiskStatus.CLOSED:
      default:
        return 'omni-badge-teal';
    }
  };

  return (
    <div className="omni-fade-in w-full max-w-7xl mx-auto px-4 sm:px-6 py-4 sm:py-8 overflow-x-hidden">
      {/* Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3 mb-5">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Risk Register</h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Identify, assess likelihood × impact, track treatment plans, and accept organizational risks.
          </p>
        </div>
        <button
          onClick={handleOpenCreate}
          className="omni-btn-primary w-full md:w-auto justify-center shrink-0 flex items-center gap-1.5"
        >
          <Plus size={15} /> New Risk
        </button>
      </div>

      {/* Tabs & Filters Control Bar */}
      <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between mb-5 bg-white p-3.5 border border-slate-200 rounded-xl shadow-sm w-full max-w-full overflow-hidden">
        {/* Tab Buttons */}
        <div className="flex bg-slate-100 p-1 rounded-lg gap-1 shrink-0 w-full md:w-auto">
          <button
            onClick={() => setActiveTab('list')}
            style={{
              padding: '6px 14px', borderRadius: 6, border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer',
              background: activeTab === 'list' ? '#FFFFFF' : 'transparent',
              color: activeTab === 'list' ? '#1B2430' : '#5B6672',
              boxShadow: activeTab === 'list' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
              display: 'flex', alignItems: 'center', gap: 6, flex: 1, justifyContent: 'center',
            }}
          >
            <List size={14} /> List View
          </button>
          <button
            onClick={() => setActiveTab('heatmap')}
            style={{
              padding: '6px 14px', borderRadius: 6, border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer',
              background: activeTab === 'heatmap' ? '#FFFFFF' : 'transparent',
              color: activeTab === 'heatmap' ? '#1B2430' : '#5B6672',
              boxShadow: activeTab === 'heatmap' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
              display: 'flex', alignItems: 'center', gap: 6, flex: 1, justifyContent: 'center',
            }}
          >
            <LayoutGrid size={14} /> Heatmap View
          </button>
        </div>

        {/* Filters */}
        <div className="flex flex-col md:flex-row gap-2.5 items-stretch md:items-center w-full md:w-auto flex-1 md:justify-end">
          {/* Search */}
          <div className="relative w-full md:w-52">
            <Search size={15} color="#8B95A1" className="absolute left-2.5 top-3" />
            <input
              className="omni-input w-full"
              placeholder="Search risk title, owner..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ paddingLeft: 32 }}
              aria-label="Search risks"
            />
          </div>

          {/* Status Filter */}
          <select
            className="omni-input w-full md:w-36"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            aria-label="Filter by risk status"
          >
            <option value="">All Statuses</option>
            <option value={RiskStatus.OPEN}>OPEN</option>
            <option value={RiskStatus.IN_TREATMENT}>IN TREATMENT</option>
            <option value={RiskStatus.ACCEPTED}>ACCEPTED</option>
            <option value={RiskStatus.CLOSED}>CLOSED</option>
          </select>

          {/* Score Band Filter */}
          <select
            className="omni-input w-full md:w-36"
            value={scoreBandFilter}
            onChange={(e) => setScoreBandFilter(e.target.value)}
            aria-label="Filter by severity band"
          >
            <option value="">All Severities</option>
            <option value={RiskScoreBand.HIGH}>HIGH (15–25)</option>
            <option value={RiskScoreBand.MEDIUM}>MEDIUM (8–12)</option>
            <option value={RiskScoreBand.LOW}>LOW (1–6)</option>
          </select>
        </div>
      </div>

      {/* Heatmap Matrix View */}
      {activeTab === 'heatmap' && (
        <RiskHeatmap
          onCellSelect={handleHeatmapCellSelect}
          selectedLikelihood={cellLikelihood}
          selectedImpact={cellImpact}
        />
      )}

      {/* Cell Filter Pill Indicator */}
      {cellLikelihood && cellImpact && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, padding: '8px 14px',
          background: '#E4F1F0', border: '1px solid #BEE3E0', borderRadius: 6, fontSize: 12.5, color: '#0F6E6A',
        }}>
          <span>Filtered by Heatmap Cell: Likelihood {cellLikelihood} × Impact {cellImpact} (Score {cellLikelihood * cellImpact})</span>
          <button
            onClick={clearCellFilter}
            style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#0F6E6A', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}
          >
            <X size={14} /> Clear filter
          </button>
        </div>
      )}

      {/* Error State */}
      {error && (
        <InlineErrorState
          title="Failed to fetch risks"
          message={error}
          onRetry={fetchRisks}
        />
      )}

      {/* List Table / Skeleton / Empty State */}
      {loading ? (
        <SkeletonTable rows={5} cols={6} />
      ) : risks.length === 0 && !error ? (
        <EmptyState
          icon={ShieldAlert}
          title="No risks recorded"
          description={
            search || statusFilter || scoreBandFilter || cellLikelihood
              ? 'No risks match your search or filter criteria. Clear filters or record a new risk.'
              : 'Establish your risk log by logging security, operational, compliance, or vendor risks.'
          }
          actionLabel="New Risk"
          onAction={handleOpenCreate}
        />
      ) : !error ? (
        <div style={{
          background: '#FFFFFF', border: '1px solid #E2E6E4', borderRadius: 10,
          overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
        }} className="overflow-x-auto">
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#F6F7F6', borderBottom: '1px solid #E2E6E4', color: '#5B6672' }}>
                <th style={{ padding: '12px 16px', fontWeight: 600 }}>Risk Title</th>
                <th style={{ padding: '12px 16px', fontWeight: 600 }}>Score</th>
                <th style={{ padding: '12px 16px', fontWeight: 600 }}>Status</th>
                <th style={{ padding: '12px 16px', fontWeight: 600 }}>Owner</th>
                <th style={{ padding: '12px 16px', fontWeight: 600 }}>Linked Asset</th>
                <th style={{ padding: '12px 16px', fontWeight: 600 }}>Updated</th>
              </tr>
            </thead>
            <tbody>
              {risks.map((risk: RiskDto, index: number) => {
                const scoreBadgeClass = getScoreBadgeClass(risk.scoreBand);
                const statusBadgeClass = getStatusBadgeClass(risk.status);
                const isLast = index === risks.length - 1;

                return (
                  <tr
                    key={risk.id}
                    onClick={() => handleOpenEdit(risk)}
                    tabIndex={0}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleOpenEdit(risk); }}
                    style={{
                      borderBottom: isLast ? 'none' : '1px solid #EDEFED',
                    }}
                    className="omni-table-row focus:outline-none"
                  >
                    <td style={{ padding: '14px 16px', fontWeight: 600, color: '#1B2430' }}>
                      {risk.title}
                      {risk.treatmentPlan && (
                        <div style={{ fontSize: 11.5, fontWeight: 400, color: '#5B6672', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 380 }}>
                          📋 {risk.treatmentPlan}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '14px 16px' }}>
                      <span className={`${scoreBadgeClass} omni-mono`}>
                        {risk.scoreBand} ({risk.score})
                      </span>
                    </td>
                    <td style={{ padding: '14px 16px' }}>
                      <span className={statusBadgeClass}>
                        {risk.status}
                      </span>
                    </td>
                    <td style={{ padding: '14px 16px', color: '#1B2430' }}>{risk.owner}</td>
                    <td style={{ padding: '14px 16px', color: '#5B6672' }}>{risk.assetName || '—'}</td>
                    <td style={{ padding: '14px 16px', color: '#8B95A1', fontSize: 12 }}>
                      {new Date(risk.updatedAt).toLocaleDateString()}
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
            <span>Showing {risks.length} of {totalCount} risks</span>
            <span>Tenant scoped</span>
          </div>
        </div>
      ) : null}

      {/* Slide-over Drawer */}
      <RiskDrawer
        risk={selectedRisk}
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        onSuccess={() => {
          fetchRisks();
        }}
      />
    </div>
  );
}

