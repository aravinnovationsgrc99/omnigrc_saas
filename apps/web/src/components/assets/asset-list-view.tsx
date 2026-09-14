'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { AssetDto, PaginatedAssetsDto, AssetType, AssetCriticality } from '@omnigrc/shared';
import { apiRequest } from '@/lib/api-client';
import { useToast } from '@/context/toast-context';
import { SkeletonTable } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { InlineErrorState } from '@/components/ui/inline-error-state';
import { AssetDrawer } from './asset-drawer';
import { Plus, Search, Filter, Boxes } from 'lucide-react';


export function AssetListView() {
  const { showToast } = useToast();
  const [assets, setAssets] = useState<AssetDto[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters & Search
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('');
  const [criticalityFilter, setCriticalityFilter] = useState<string>('');

  // Drawer state
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [selectedAsset, setSelectedAsset] = useState<AssetDto | null>(null);

  const fetchAssets = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set('search', search.trim());
      if (typeFilter) params.set('type', typeFilter);
      if (criticalityFilter) params.set('criticality', criticalityFilter);

      const queryString = params.toString() ? `?${params.toString()}` : '';
      const data = await apiRequest<PaginatedAssetsDto>(`/assets${queryString}`);
      setAssets(data.items);
      setTotalCount(data.total);
    } catch (err: any) {
      setAssets([]);
      setTotalCount(0);
      setError(err?.message || 'Failed to fetch asset inventory from server. Check your connection or pod status and try again.');
    } finally {
      setLoading(false);
    }
  }, [search, typeFilter, criticalityFilter]);

  useEffect(() => {
    fetchAssets();
  }, [fetchAssets]);

  const handleOpenCreate = () => {
    setSelectedAsset(null);
    setIsDrawerOpen(true);
  };

  const handleOpenEdit = (asset: AssetDto) => {
    setSelectedAsset(asset);
    setIsDrawerOpen(true);
  };

  const getCriticalityBadgeClass = (criticality: AssetCriticality) => {
    switch (criticality) {
      case AssetCriticality.HIGH:
        return 'omni-badge-rose';
      case AssetCriticality.MEDIUM:
        return 'omni-badge-amber';
      case AssetCriticality.LOW:
      default:
        return 'omni-badge-teal';
    }
  };

  return (
    <div className="omni-fade-in w-full max-w-7xl mx-auto px-4 sm:px-6 py-4 sm:py-8 overflow-x-hidden">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3 mb-5">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Asset & Inventory</h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Track software, hardware, vendors, and data stores across your organization.
          </p>
        </div>
        <button
          onClick={handleOpenCreate}
          className="omni-btn-primary w-full md:w-auto justify-center shrink-0 flex items-center gap-1.5"
        >
          <Plus size={15} /> New Asset
        </button>
      </div>

      {/* Filter Strip */}
      <div className="flex flex-col md:flex-row gap-2.5 sm:gap-3 items-stretch md:items-center mb-5 bg-white p-3.5 border border-slate-200 rounded-xl shadow-sm w-full max-w-full overflow-hidden">
        {/* Search */}
        <div className="relative flex-1 w-full">
          <Search size={15} color="#8B95A1" className="absolute left-2.5 top-3" />
          <input
            className="omni-input w-full"
            placeholder="Search assets by name, owner, vendor..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ paddingLeft: 32 }}
            aria-label="Search assets"
          />
        </div>

        {/* Type Filter */}
        <div className="flex items-center gap-2 w-full md:w-auto">
          <Filter size={14} color="#5B6672" className="shrink-0 hidden md:inline" />
          <select
            className="omni-input w-full md:w-36"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            aria-label="Filter by asset type"
          >
            <option value="">All Types</option>
            <option value={AssetType.SOFTWARE}>SOFTWARE</option>
            <option value={AssetType.HARDWARE}>HARDWARE</option>
            <option value={AssetType.VENDOR}>VENDOR</option>
            <option value={AssetType.DATA_STORE}>DATA STORE</option>
            <option value={AssetType.OTHER}>OTHER</option>
          </select>
        </div>

        {/* Criticality Filter */}
        <div className="flex items-center gap-2 w-full md:w-auto">
          <select
            className="omni-input w-full md:w-36"
            value={criticalityFilter}
            onChange={(e) => setCriticalityFilter(e.target.value)}
            aria-label="Filter by criticality"
          >
            <option value="">All Criticality</option>
            <option value={AssetCriticality.HIGH}>HIGH</option>
            <option value={AssetCriticality.MEDIUM}>MEDIUM</option>
            <option value={AssetCriticality.LOW}>LOW</option>
          </select>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <InlineErrorState
          title="Failed to fetch assets"
          message={error}
          onRetry={fetchAssets}
        />
      )}

      {/* Loading Skeleton / Table / Empty State */}
      {loading ? (
        <SkeletonTable rows={5} cols={6} />
      ) : assets.length === 0 && !error ? (
        <EmptyState
          icon={Boxes}
          title="No assets tracked yet"
          description={
            search || typeFilter || criticalityFilter
              ? 'No assets match your search or filter criteria. Clear filters or add a new asset.'
              : 'Add your infrastructure, software applications, data stores, and vendors to establish your GRC asset inventory.'
          }
          actionLabel="New Asset"
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
                <th style={{ padding: '12px 16px', fontWeight: 600 }}>Asset Name</th>
                <th style={{ padding: '12px 16px', fontWeight: 600 }}>Type</th>
                <th style={{ padding: '12px 16px', fontWeight: 600 }}>Criticality</th>
                <th style={{ padding: '12px 16px', fontWeight: 600 }}>Owner</th>
                <th style={{ padding: '12px 16px', fontWeight: 600 }}>Vendor</th>
                <th style={{ padding: '12px 16px', fontWeight: 600 }}>Updated</th>
              </tr>
            </thead>
            <tbody>
              {assets.map((asset, index) => {
                const badgeClass = getCriticalityBadgeClass(asset.criticality);
                const isLast = index === assets.length - 1;
                return (
                  <tr
                    key={asset.id}
                    onClick={() => handleOpenEdit(asset)}
                    tabIndex={0}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleOpenEdit(asset); }}
                    style={{
                      borderBottom: isLast ? 'none' : '1px solid #EDEFED',
                    }}
                    className="omni-table-row focus:outline-none"
                  >
                    <td style={{ padding: '14px 16px', fontWeight: 600, color: '#1B2430' }}>
                      {asset.name}
                      {asset.dataResidencyRegion && (
                        <div style={{ fontSize: 11, fontWeight: 400, color: '#8B95A1', marginTop: 2 }}>
                          📍 {asset.dataResidencyRegion}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '14px 16px', color: '#5B6672' }}>
                      <span className="omni-mono" style={{ fontSize: 11.5, background: '#EDEFED', padding: '3px 8px', borderRadius: 4 }}>
                        {asset.type}
                      </span>
                    </td>
                    <td style={{ padding: '14px 16px' }}>
                      <span className={badgeClass}>
                        {asset.criticality}
                      </span>
                    </td>
                    <td style={{ padding: '14px 16px', color: '#1B2430' }}>{asset.owner}</td>
                    <td style={{ padding: '14px 16px', color: '#5B6672' }}>{asset.vendorName || '—'}</td>
                    <td style={{ padding: '14px 16px', color: '#8B95A1', fontSize: 12 }}>
                      {new Date(asset.updatedAt).toLocaleDateString()}
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
            <span>Showing {assets.length} of {totalCount} assets</span>
            <span>Tenant scoped</span>
          </div>
        </div>
      ) : null}

      {/* Slide-over Drawer */}
      <AssetDrawer
        asset={selectedAsset}
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        onSuccess={() => {
          fetchAssets();
        }}
      />
    </div>
  );
}

