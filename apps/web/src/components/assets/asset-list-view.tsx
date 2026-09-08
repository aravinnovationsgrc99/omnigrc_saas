'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Search, Plus, Boxes, Filter } from 'lucide-react';
import { AssetDto, AssetType, AssetCriticality, PaginatedAssetsDto } from '@omnigrc/shared';
import { apiRequest } from '@/lib/api-client';
import { AssetDrawer } from './asset-drawer';

export function AssetListView() {
  const [assets, setAssets] = useState<AssetDto[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);

  // Filters & Search
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('');
  const [criticalityFilter, setCriticalityFilter] = useState<string>('');

  // Drawer state
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [selectedAsset, setSelectedAsset] = useState<AssetDto | null>(null);

  const fetchAssets = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set('search', search.trim());
      if (typeFilter) params.set('type', typeFilter);
      if (criticalityFilter) params.set('criticality', criticalityFilter);

      const queryString = params.toString() ? `?${params.toString()}` : '';
      const data = await apiRequest<PaginatedAssetsDto>(`/assets${queryString}`);
      setAssets(data.items);
      setTotalCount(data.total);
    } catch {
      setAssets([]);
      setTotalCount(0);
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

  const getCriticalityBadge = (criticality: AssetCriticality) => {
    switch (criticality) {
      case AssetCriticality.HIGH:
        return { color: '#B23A48', bg: '#F8E6E8' };
      case AssetCriticality.MEDIUM:
        return { color: '#B5750A', bg: '#FCEFD9' };
      case AssetCriticality.LOW:
      default:
        return { color: '#0F6E6A', bg: '#E4F1F0' };
    }
  };

  return (
    <div className="omni-fade-in" style={{ padding: '28px 32px', maxWidth: 1140, margin: '0 auto' }}>
      {/* Top Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 21, fontWeight: 600, color: '#1B2430' }}>Asset & Inventory</h1>
          <p style={{ fontSize: 13.5, color: '#5B6672', marginTop: 3 }}>
            Track software, hardware, vendors, and data stores across your organization.
          </p>
        </div>
        <button
          onClick={handleOpenCreate}
          className="omni-btn-primary"
          style={{ display: 'flex', alignItems: 'center', gap: 6 }}
        >
          <Plus size={15} /> New Asset
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
            placeholder="Search assets by name, owner, vendor..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ paddingLeft: 32 }}
          />
        </div>

        {/* Type Filter */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Filter size={14} color="#5B6672" />
          <select
            className="omni-input"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            style={{ width: 140 }}
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <select
            className="omni-input"
            value={criticalityFilter}
            onChange={(e) => setCriticalityFilter(e.target.value)}
            style={{ width: 150 }}
          >
            <option value="">All Criticality</option>
            <option value={AssetCriticality.HIGH}>HIGH</option>
            <option value={AssetCriticality.MEDIUM}>MEDIUM</option>
            <option value={AssetCriticality.LOW}>LOW</option>
          </select>
        </div>
      </div>

      {/* Asset Table / Empty State */}
      {loading ? (
        <div style={{
          background: '#FFFFFF', border: '1px solid #E2E6E4', borderRadius: 10,
          padding: '40px 20px', textAlign: 'center', color: '#8B95A1', fontSize: 13,
        }}>
          Loading asset inventory...
        </div>
      ) : assets.length === 0 ? (
        <div style={{
          background: '#FFFFFF', border: '1px solid #E2E6E4', borderRadius: 10,
          padding: '56px 24px', textAlign: 'center', display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            width: 48, height: 48, borderRadius: 12, background: '#E4F1F0', color: '#0F6E6A',
            display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16,
          }}>
            <Boxes size={22} />
          </div>
          <h3 style={{ fontSize: 16, fontWeight: 600, color: '#1B2430' }}>No assets tracked yet</h3>
          <p style={{ fontSize: 13, color: '#5B6672', marginTop: 6, maxWidth: 360, lineHeight: 1.5 }}>
            {search || typeFilter || criticalityFilter
              ? 'No assets match your current search or filter criteria. Try clearing filters.'
              : 'Add your infrastructure, software applications, data stores, and vendors to establish your GRC asset inventory.'}
          </p>
          <button
            onClick={handleOpenCreate}
            className="omni-btn-primary"
            style={{ marginTop: 20, display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <Plus size={15} /> New Asset
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
                const badge = getCriticalityBadge(asset.criticality);
                const isLast = index === assets.length - 1;
                return (
                  <tr
                    key={asset.id}
                    onClick={() => handleOpenEdit(asset)}
                    style={{
                      borderBottom: isLast ? 'none' : '1px solid #EDEFED',
                      cursor: 'pointer', transition: 'background .12s ease',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = '#F6F7F6')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
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
                      <span style={{
                        fontSize: 10.5, fontWeight: 700, padding: '3px 8px', borderRadius: 999,
                        color: badge.color, background: badge.bg, letterSpacing: 0.4,
                      }}>
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
      )}

      {/* Slide-over Drawer */}
      <AssetDrawer
        asset={selectedAsset}
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        onSuccess={fetchAssets}
      />
    </div>
  );
}
