'use client';

import React, { useState, useEffect } from 'react';
import { X, Trash2, ShieldAlert, History, Clock } from 'lucide-react';
import { RiskDto, RiskStatus, RiskScoreBand, CreateRiskDto, UpdateRiskDto, AuditLogEntryDto, AssetDto, PaginatedAssetsDto } from '@omnigrc/shared';
import { apiRequest } from '@/lib/api-client';

interface RiskDrawerProps {
  risk: RiskDto | null; // null = Create Mode, RiskDto = Edit/Detail Mode
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const LIKELIHOOD_LABELS: Record<number, string> = {
  1: '1 - Rare',
  2: '2 - Unlikely',
  3: '3 - Possible',
  4: '4 - Likely',
  5: '5 - Almost Certain',
};

export const IMPACT_LABELS: Record<number, string> = {
  1: '1 - Negligible',
  2: '2 - Minor',
  3: '3 - Moderate',
  4: '4 - Major',
  5: '5 - Severe',
};

export function RiskDrawer({ risk, isOpen, onClose, onSuccess }: RiskDrawerProps) {
  const isEdit = Boolean(risk);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [likelihood, setLikelihood] = useState<number>(3);
  const [impact, setImpact] = useState<number>(3);
  const [status, setStatus] = useState<RiskStatus>(RiskStatus.OPEN);
  const [owner, setOwner] = useState('');
  const [assetId, setAssetId] = useState<string>('');
  const [treatmentPlan, setTreatmentPlan] = useState('');

  const [availableAssets, setAvailableAssets] = useState<AssetDto[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntryDto[]>([]);
  const [loadingAudit, setLoadingAudit] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Fetch available assets for dropdown selection
  useEffect(() => {
    if (isOpen) {
      apiRequest<PaginatedAssetsDto>('/assets?limit=100')
        .then((res) => setAvailableAssets(res.items))
        .catch(() => setAvailableAssets([]));
    }
  }, [isOpen]);

  useEffect(() => {
    if (risk) {
      setTitle(risk.title || '');
      setDescription(risk.description || '');
      setLikelihood(risk.likelihood || 3);
      setImpact(risk.impact || 3);
      setStatus(risk.status || RiskStatus.OPEN);
      setOwner(risk.owner || '');
      setAssetId(risk.assetId || '');
      setTreatmentPlan(risk.treatmentPlan || '');

      setLoadingAudit(true);
      apiRequest<AuditLogEntryDto[]>(`/risks/${risk.id}/audit-log`)
        .then((data) => setAuditLogs(data))
        .catch(() => setAuditLogs([]))
        .finally(() => setLoadingAudit(false));
    } else {
      setTitle('');
      setDescription('');
      setLikelihood(3);
      setImpact(3);
      setStatus(RiskStatus.OPEN);
      setOwner('');
      setAssetId('');
      setTreatmentPlan('');
      setAuditLogs([]);
    }
    setErrorMsg(null);
  }, [risk, isOpen]);

  if (!isOpen) return null;

  const currentScore = likelihood * impact;
  const currentScoreBand = currentScore >= 15 ? RiskScoreBand.HIGH : currentScore >= 8 ? RiskScoreBand.MEDIUM : RiskScoreBand.LOW;
  const badgeColors = currentScoreBand === RiskScoreBand.HIGH
    ? { bg: '#F8E6E8', color: '#B23A48' }
    : currentScoreBand === RiskScoreBand.MEDIUM
    ? { bg: '#FCEFD9', color: '#B5750A' }
    : { bg: '#E4F1F0', color: '#0F6E6A' };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !owner.trim() || saving) return;

    setSaving(true);
    setErrorMsg(null);

    try {
      if (isEdit && risk) {
        const payload: UpdateAssetDto & UpdateRiskDto = {
          title: title.trim(),
          description: description.trim() || undefined,
          likelihood,
          impact,
          status,
          owner: owner.trim(),
          assetId: assetId || null,
          treatmentPlan: treatmentPlan.trim() || undefined,
        };
        await apiRequest(`/risks/${risk.id}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
      } else {
        const payload: CreateRiskDto = {
          title: title.trim(),
          description: description.trim() || undefined,
          likelihood,
          impact,
          status,
          owner: owner.trim(),
          assetId: assetId || undefined,
          treatmentPlan: treatmentPlan.trim() || undefined,
        };
        await apiRequest('/risks', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      }
      onSuccess();
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to save risk');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!risk || deleting) return;
    if (!confirm(`Are you sure you want to delete risk "${risk.title}"?`)) return;

    setDeleting(true);
    setErrorMsg(null);

    try {
      await apiRequest(`/risks/${risk.id}`, { method: 'DELETE' });
      onSuccess();
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to delete risk');
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
        width: 500, maxWidth: '100%', background: '#FFFFFF', height: '100%',
        display: 'flex', flexDirection: 'column', boxShadow: '-8px 0 24px rgba(0,0,0,0.12)',
      }}>
        {/* Header */}
        <div style={{
          height: 60, borderBottom: '1px solid #E2E6E4', padding: '0 20px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 32, height: 32, borderRadius: 8, background: '#FCEFD9', color: '#B5750A',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <ShieldAlert size={16} />
            </div>
            <h2 style={{ fontSize: 16, fontWeight: 600, color: '#1B2430' }}>
              {isEdit ? 'Risk Details' : 'New Risk Entry'}
            </h2>
          </div>
          <button
            onClick={onClose}
            style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#5B6672' }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Form Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 20 }} className="omni-scroll">
          {errorMsg && (
            <div style={{
              padding: '10px 12px', background: '#F8E6E8', border: '1px solid #B23A48',
              borderRadius: 6, color: '#B23A48', fontSize: 13, marginBottom: 16,
            }}>
              {errorMsg}
            </div>
          )}

          <form id="risk-form" onSubmit={handleSave}>
            <label style={{ fontSize: 12.5, fontWeight: 600, color: '#5B6672', display: 'block', marginBottom: 6 }}>
              Risk Title *
            </label>
            <input
              className="omni-input"
              placeholder="e.g. Unencrypted Patient Health Data in Transit"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              style={{ marginBottom: 16 }}
            />

            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              background: '#F6F7F6', padding: '12px 14px', borderRadius: 8, border: '1px solid #E2E6E4', marginBottom: 16,
            }}>
              <span style={{ fontSize: 12.5, fontWeight: 600, color: '#5B6672' }}>Calculated Risk Score</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="omni-mono" style={{ fontSize: 16, fontWeight: 700, color: badgeColors.color }}>
                  {currentScore}
                </span>
                <span style={{
                  fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 999,
                  background: badgeColors.bg, color: badgeColors.color,
                }}>
                  {currentScoreBand}
                </span>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 12.5, fontWeight: 600, color: '#5B6672', display: 'block', marginBottom: 6 }}>
                  Likelihood (1–5) *
                </label>
                <select
                  className="omni-input"
                  value={likelihood}
                  onChange={(e) => setLikelihood(Number(e.target.value))}
                >
                  {[1, 2, 3, 4, 5].map((val) => (
                    <option key={val} value={val}>{LIKELIHOOD_LABELS[val]}</option>
                  ))}
                </select>
              </div>

              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 12.5, fontWeight: 600, color: '#5B6672', display: 'block', marginBottom: 6 }}>
                  Impact (1–5) *
                </label>
                <select
                  className="omni-input"
                  value={impact}
                  onChange={(e) => setImpact(Number(e.target.value))}
                >
                  {[1, 2, 3, 4, 5].map((val) => (
                    <option key={val} value={val}>{IMPACT_LABELS[val]}</option>
                  ))}
                </select>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 12.5, fontWeight: 600, color: '#5B6672', display: 'block', marginBottom: 6 }}>
                  Status *
                </label>
                <select
                  className="omni-input"
                  value={status}
                  onChange={(e) => setStatus(e.target.value as RiskStatus)}
                >
                  <option value={RiskStatus.OPEN}>OPEN</option>
                  <option value={RiskStatus.IN_TREATMENT}>IN TREATMENT</option>
                  <option value={RiskStatus.ACCEPTED}>ACCEPTED</option>
                  <option value={RiskStatus.CLOSED}>CLOSED</option>
                </select>
              </div>

              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 12.5, fontWeight: 600, color: '#5B6672', display: 'block', marginBottom: 6 }}>
                  Risk Owner *
                </label>
                <input
                  className="omni-input"
                  placeholder="e.g. SecOps Team"
                  value={owner}
                  onChange={(e) => setOwner(e.target.value)}
                  required
                />
              </div>
            </div>

            <label style={{ fontSize: 12.5, fontWeight: 600, color: '#5B6672', display: 'block', marginBottom: 6 }}>
              Linked Asset (Optional)
            </label>
            <select
              className="omni-input"
              value={assetId}
              onChange={(e) => setAssetId(e.target.value)}
              style={{ marginBottom: 16 }}
            >
              <option value="">-- No Linked Asset --</option>
              {availableAssets.map((asset) => (
                <option key={asset.id} value={asset.id}>
                  {asset.name} ({asset.type})
                </option>
              ))}
            </select>

            <label style={{ fontSize: 12.5, fontWeight: 600, color: '#5B6672', display: 'block', marginBottom: 6 }}>
              Description
            </label>
            <textarea
              className="omni-input"
              rows={2}
              placeholder="Background context, vulnerability details, or impact analysis..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              style={{ marginBottom: 16, resize: 'vertical' }}
            />

            <label style={{ fontSize: 12.5, fontWeight: 600, color: '#5B6672', display: 'block', marginBottom: 6 }}>
              Treatment & Mitigation Plan
            </label>
            <textarea
              className="omni-input"
              rows={3}
              placeholder="Action plan, control steps, target dates, or acceptance rationale..."
              value={treatmentPlan}
              onChange={(e) => setTreatmentPlan(e.target.value)}
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
              form="risk-form"
              disabled={saving}
              className="omni-btn-primary"
            >
              {saving ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Risk'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
