'use client';

import React, { useState, useEffect } from 'react';
import { X, Trash2, Shield, History, Clock } from 'lucide-react';
import { AssetDto, AssetType, AssetCriticality, CreateAssetDto, UpdateAssetDto, AuditLogEntryDto } from '@omnigrc/shared';
import { apiRequest } from '@/lib/api-client';

interface AssetDrawerProps {
  asset: AssetDto | null; // null = Create Mode, AssetDto = Edit/Detail Mode
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function AssetDrawer({ asset, isOpen, onClose, onSuccess }: AssetDrawerProps) {
  const isEdit = Boolean(asset);

  const [name, setName] = useState('');
  const [type, setType] = useState<AssetType>(AssetType.SOFTWARE);
  const [criticality, setCriticality] = useState<AssetCriticality>(AssetCriticality.MEDIUM);
  const [owner, setOwner] = useState('');
  const [vendorName, setVendorName] = useState('');
  const [dataResidencyRegion, setDataResidencyRegion] = useState('');
  const [description, setDescription] = useState('');

  const [auditLogs, setAuditLogs] = useState<AuditLogEntryDto[]>([]);
  const [loadingAudit, setLoadingAudit] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (asset) {
      setName(asset.name || '');
      setType(asset.type || AssetType.SOFTWARE);
      setCriticality(asset.criticality || AssetCriticality.MEDIUM);
      setOwner(asset.owner || '');
      setVendorName(asset.vendorName || '');
      setDataResidencyRegion(asset.dataResidencyRegion || '');
      setDescription(asset.description || '');

      // Fetch audit logs for asset
      setLoadingAudit(true);
      apiRequest<AuditLogEntryDto[]>(`/assets/${asset.id}/audit-log`)
        .then((data) => setAuditLogs(data))
        .catch(() => setAuditLogs([]))
        .finally(() => setLoadingAudit(false));
    } else {
      setName('');
      setType(AssetType.SOFTWARE);
      setCriticality(AssetCriticality.MEDIUM);
      setOwner('');
      setVendorName('');
      setDataResidencyRegion('');
      setDescription('');
      setAuditLogs([]);
    }
    setErrorMsg(null);
  }, [asset, isOpen]);

  if (!isOpen) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !owner.trim() || saving) return;

    setSaving(true);
    setErrorMsg(null);

    try {
      if (isEdit && asset) {
        const payload: UpdateAssetDto = {
          name: name.trim(),
          type,
          criticality,
          owner: owner.trim(),
          vendorName: vendorName.trim() || undefined,
          dataResidencyRegion: dataResidencyRegion.trim() || undefined,
          description: description.trim() || undefined,
        };
        await apiRequest(`/assets/${asset.id}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
      } else {
        const payload: CreateAssetDto = {
          name: name.trim(),
          type,
          criticality,
          owner: owner.trim(),
          vendorName: vendorName.trim() || undefined,
          dataResidencyRegion: dataResidencyRegion.trim() || undefined,
          description: description.trim() || undefined,
        };
        await apiRequest('/assets', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      }
      onSuccess();
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to save asset');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!asset || deleting) return;
    if (!confirm(`Are you sure you want to delete asset "${asset.name}"?`)) return;

    setDeleting(true);
    setErrorMsg(null);

    try {
      await apiRequest(`/assets/${asset.id}`, { method: 'DELETE' });
      onSuccess();
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to delete asset');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 50, display: 'flex', justifyContent: 'flex-end',
      background: 'rgba(15, 26, 46, 0.4)', backdropFilter: 'blur(2px)',
    }}>
      <div className="omni-fade-in" style={{
        width: 480, maxWidth: '100%', background: '#FFFFFF', height: '100%',
        display: 'flex', flexDirection: 'column', boxShadow: '-8px 0 24px rgba(0,0,0,0.12)',
      }}>
        {/* Header */}
        <div style={{
          height: 60, borderBottom: '1px solid #E2E6E4', padding: '0 20px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 32, height: 32, borderRadius: 8, background: '#E4F1F0', color: '#0F6E6A',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Shield size={16} />
            </div>
            <h2 style={{ fontSize: 16, fontWeight: 600, color: '#1B2430' }}>
              {isEdit ? 'Asset Details' : 'New Asset'}
            </h2>
          </div>
          <button
            onClick={onClose}
            style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#5B6672' }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Content Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 20 }} className="omni-scroll">
          {errorMsg && (
            <div style={{
              padding: '10px 12px', background: '#F8E6E8', border: '1px solid #B23A48',
              borderRadius: 6, color: '#B23A48', fontSize: 13, marginBottom: 16,
            }}>
              {errorMsg}
            </div>
          )}

          <form id="asset-form" onSubmit={handleSave}>
            <label style={{ fontSize: 12.5, fontWeight: 600, color: '#5B6672', display: 'block', marginBottom: 6 }}>
              Asset Name *
            </label>
            <input
              className="omni-input"
              placeholder="e.g. AWS Production Cloud Infrastructure"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              style={{ marginBottom: 16 }}
            />

            <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 12.5, fontWeight: 600, color: '#5B6672', display: 'block', marginBottom: 6 }}>
                  Asset Type *
                </label>
                <select
                  className="omni-input"
                  value={type}
                  onChange={(e) => setType(e.target.value as AssetType)}
                >
                  <option value={AssetType.SOFTWARE}>SOFTWARE</option>
                  <option value={AssetType.HARDWARE}>HARDWARE</option>
                  <option value={AssetType.VENDOR}>VENDOR</option>
                  <option value={AssetType.DATA_STORE}>DATA STORE</option>
                  <option value={AssetType.OTHER}>OTHER</option>
                </select>
              </div>

              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 12.5, fontWeight: 600, color: '#5B6672', display: 'block', marginBottom: 6 }}>
                  Criticality *
                </label>
                <select
                  className="omni-input"
                  value={criticality}
                  onChange={(e) => setCriticality(e.target.value as AssetCriticality)}
                >
                  <option value={AssetCriticality.HIGH}>HIGH</option>
                  <option value={AssetCriticality.MEDIUM}>MEDIUM</option>
                  <option value={AssetCriticality.LOW}>LOW</option>
                </select>
              </div>
            </div>

            <label style={{ fontSize: 12.5, fontWeight: 600, color: '#5B6672', display: 'block', marginBottom: 6 }}>
              Owner (Team / Individual) *
            </label>
            <input
              className="omni-input"
              placeholder="e.g. DevOps Team or Priya Nair"
              value={owner}
              onChange={(e) => setOwner(e.target.value)}
              required
              style={{ marginBottom: 16 }}
            />

            <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 12.5, fontWeight: 600, color: '#5B6672', display: 'block', marginBottom: 6 }}>
                  Vendor Name
                </label>
                <input
                  className="omni-input"
                  placeholder="e.g. Amazon Web Services"
                  value={vendorName}
                  onChange={(e) => setVendorName(e.target.value)}
                />
              </div>

              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 12.5, fontWeight: 600, color: '#5B6672', display: 'block', marginBottom: 6 }}>
                  Data Residency Region
                </label>
                <input
                  className="omni-input"
                  placeholder="e.g. India (ap-south-1)"
                  value={dataResidencyRegion}
                  onChange={(e) => setDataResidencyRegion(e.target.value)}
                />
              </div>
            </div>

            <label style={{ fontSize: 12.5, fontWeight: 600, color: '#5B6672', display: 'block', marginBottom: 6 }}>
              Description & Notes
            </label>
            <textarea
              className="omni-input"
              rows={3}
              placeholder="Brief description of the asset, purpose, or security requirements..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              style={{ marginBottom: 20, resize: 'vertical' }}
            />
          </form>

          {/* Audit History (Edit mode only) */}
          {isEdit && (
            <div style={{ borderTop: '1px solid #E2E6E4', paddingTop: 20, marginTop: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
                <History size={15} color="#0F6E6A" />
                <h3 style={{ fontSize: 13.5, fontWeight: 600, color: '#1B2430' }}>Audit History</h3>
              </div>

              {loadingAudit ? (
                <div style={{ fontSize: 12, color: '#8B95A1' }}>Loading history...</div>
              ) : auditLogs.length === 0 ? (
                <div style={{ fontSize: 12, color: '#8B95A1' }}>No audit log entries recorded yet.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {auditLogs.map((log) => (
                    <div key={log.id} style={{
                      padding: '10px 12px', background: '#F6F7F6', borderRadius: 6,
                      fontSize: 12, border: '1px solid #E2E6E4',
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                        <span style={{ fontWeight: 600, color: '#0F6E6A' }}>{log.action}</span>
                        <span style={{ fontSize: 11, color: '#8B95A1', display: 'flex', alignItems: 'center', gap: 3 }}>
                          <Clock size={11} /> {new Date(log.createdAt).toLocaleString()}
                        </span>
                      </div>
                      <div style={{ color: '#5B6672', fontSize: 11.5 }}>
                        Metadata: {JSON.stringify(log.metadata)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div style={{
          height: 64, borderTop: '1px solid #E2E6E4', padding: '0 20px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#FAFAFA',
        }}>
          {isEdit ? (
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting}
              className="omni-btn-ghost"
              style={{ color: '#B23A48', borderColor: '#F8E6E8', display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <Trash2 size={14} /> {deleting ? 'Deleting...' : 'Delete'}
            </button>
          ) : (
            <div />
          )}

          <div style={{ display: 'flex', gap: 10 }}>
            <button type="button" onClick={onClose} className="omni-btn-ghost">
              Cancel
            </button>
            <button
              type="submit"
              form="asset-form"
              disabled={saving}
              className="omni-btn-primary"
            >
              {saving ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Asset'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
