'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  RiskDto,
  RiskStatus,
  RiskScoreBand,
  AssetDto,
  PaginatedAssetsDto,
  AuditLogEntryDto,
  CreateRiskDto,
  UpdateRiskDto,
  RiskControlAssociationDto,
  PaginatedRiskControlAssociationsDto,
  RiskControlMitigationType,
  ControlDto,
  PaginatedControlsDto,
  Role,
} from '@omnigrc/shared';

import { apiRequest } from '@/lib/api-client';
import { useToast } from '@/context/toast-context';
import { useAuth } from '@/context/auth-context';
import { ShieldAlert, X, Trash2, History, Clock, GitMerge, Plus, Lock, ShieldCheck } from 'lucide-react';
import { WorkflowLifecyclePanel } from '@/components/workflow/workflow-lifecycle-panel';
import { ComplianceScopeFilter } from '@/components/ui/compliance-scope-filter';

export const getMitigationBadgeStyle = (type: RiskControlMitigationType) => {
  switch (type) {
    case RiskControlMitigationType.PREVENTATIVE:
      return { bg: '#E6F4EA', color: '#137333', border: '#CEEAD6', label: 'Preventative' };
    case RiskControlMitigationType.DETECTIVE:
      return { bg: '#E8F0FE', color: '#1A73E8', border: '#D2E3FC', label: 'Detective' };
    case RiskControlMitigationType.CORRECTIVE:
      return { bg: '#FEF7E0', color: '#B06000', border: '#FEEFC3', label: 'Corrective' };
    case RiskControlMitigationType.COMPENSATING:
      return { bg: '#F3E8FD', color: '#7B1FA2', border: '#E9D2FD', label: 'Compensating' };
    default:
      return { bg: '#F1F3F4', color: '#5F6368', border: '#DADCE0', label: type };
  }
};

interface RiskDrawerProps {
  risk: RiskDto | null; // null = Create Mode, RiskDto = Edit/Detail Mode
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  defaultAssetId?: string;
  zIndex?: number;
  onNavigateToView?: (view: string) => void;
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

export function RiskDrawer({ risk, isOpen, onClose, onSuccess, defaultAssetId, zIndex = 50, onNavigateToView }: RiskDrawerProps) {
  const { showToast } = useToast();
  const { user, organization, hasCapability } = useAuth();
  const isEdit = Boolean(risk);

  const canAccessControls = hasCapability('GRC_CORE_CONTROLS');
  const canMutateRiskControls = Boolean(
    canAccessControls &&
    hasCapability('GRC_CORE_RISKS') &&
    !organization?.isReadOnly &&
    user?.role &&
    [Role.ADMIN, Role.ANALYST, Role.MSSP_ADMIN, Role.MSSP_ANALYST].includes(user.role as Role)
  );

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [likelihood, setLikelihood] = useState<number>(3);
  const [impact, setImpact] = useState<number>(3);
  const [status, setStatus] = useState<RiskStatus>(RiskStatus.OPEN);
  const [owner, setOwner] = useState('');
  const [assetId, setAssetId] = useState<string>('');
  const [frameworkId, setFrameworkId] = useState<string>('');
  const [frameworkVersionId, setFrameworkVersionId] = useState<string>('');
  const [frameworkReferenceId, setFrameworkReferenceId] = useState<string>('');
  const [treatmentPlan, setTreatmentPlan] = useState('');

  const [availableAssets, setAvailableAssets] = useState<AssetDto[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntryDto[]>([]);
  const [loadingAudit, setLoadingAudit] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Associated Controls State
  const [associatedControls, setAssociatedControls] = useState<RiskControlAssociationDto[]>([]);
  const [loadingControls, setLoadingControls] = useState(false);
  const [controlsError, setControlsError] = useState<string | null>(null);
  const [availableControls, setAvailableControls] = useState<ControlDto[]>([]);
  const [selectedControlId, setSelectedControlId] = useState<string>('');
  const [selectedMitigationType, setSelectedMitigationType] = useState<RiskControlMitigationType>(RiskControlMitigationType.PREVENTATIVE);
  const [mitigationNotes, setMitigationNotes] = useState<string>('');
  const [isLinking, setIsLinking] = useState(false);
  const [unlinkingControlId, setUnlinkingControlId] = useState<string | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);

  // Form Validation State
  const [titleTouched, setTitleTouched] = useState(false);
  const [ownerTouched, setOwnerTouched] = useState(false);

  // Fetch associated controls
  const fetchAssociatedControls = useCallback(async () => {
    if (!risk?.id || !canAccessControls) return;
    setLoadingControls(true);
    setControlsError(null);
    try {
      const res = await apiRequest<PaginatedRiskControlAssociationsDto>(`/risks/${risk.id}/controls?limit=50`);
      setAssociatedControls(res.items || []);
    } catch (err: any) {
      setControlsError(err.message || 'Failed to load associated controls');
    } finally {
      setLoadingControls(false);
    }
  }, [risk?.id, canAccessControls]);

  // Fetch controls when drawer is open in edit mode
  useEffect(() => {
    if (risk && isOpen && canAccessControls) {
      fetchAssociatedControls();
    } else {
      setAssociatedControls([]);
      setControlsError(null);
    }
  }, [risk, isOpen, canAccessControls, fetchAssociatedControls]);

  useEffect(() => {
    if (isOpen && isEdit && canAccessControls) {
      apiRequest<PaginatedControlsDto>('/controls?limit=100')
        .then((res) => setAvailableControls(res.items || []))
        .catch(() => setAvailableControls([]));
    }
  }, [isOpen, isEdit, canAccessControls]);

  const handleLinkControl = async (e?: React.FormEvent | React.MouseEvent) => {
    if (e) e.preventDefault();
    if (!risk || !selectedControlId || isLinking) return;
    setIsLinking(true);
    setLinkError(null);
    try {
      await apiRequest(`/risks/${risk.id}/controls`, {
        method: 'POST',
        body: JSON.stringify({
          controlId: selectedControlId,
          mitigationType: selectedMitigationType,
          notes: mitigationNotes.trim() || undefined,
        }),
      });
      showToast('Control associated with risk');
      setSelectedControlId('');
      setMitigationNotes('');
      setSelectedMitigationType(RiskControlMitigationType.PREVENTATIVE);
      await fetchAssociatedControls();
    } catch (err: any) {
      setLinkError(err.message || 'Failed to associate control');
    } finally {
      setIsLinking(false);
    }
  };

  const handleUnlinkControl = async (controlId: string, controlName: string) => {
    if (!risk || unlinkingControlId) return;
    if (!confirm(`Are you sure you want to disassociate control "${controlName}" from this risk?`)) return;
    setUnlinkingControlId(controlId);
    try {
      await apiRequest(`/risks/${risk.id}/controls/${controlId}`, {
        method: 'DELETE',
      });
      showToast('Control disassociated');
      await fetchAssociatedControls();
    } catch (err: any) {
      showToast(err.message || 'Failed to disassociate control', 'error');
    } finally {
      setUnlinkingControlId(null);
    }
  };

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
      setFrameworkId(risk.frameworkId || '');
      setFrameworkVersionId('');
      setFrameworkReferenceId(risk.frameworkReferenceId || '');
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
      setAssetId(defaultAssetId || '');
      setFrameworkId('');
      setFrameworkVersionId('');
      setFrameworkReferenceId('');
      setTreatmentPlan('');
      setAuditLogs([]);
    }
    setErrorMsg(null);
    setTitleTouched(false);
    setOwnerTouched(false);
  }, [risk, isOpen, defaultAssetId]);

  if (!isOpen) return null;

  const currentScore = likelihood * impact;
  const currentScoreBand = currentScore >= 15 ? RiskScoreBand.HIGH : currentScore >= 8 ? RiskScoreBand.MEDIUM : RiskScoreBand.LOW;
  const badgeClass = currentScoreBand === RiskScoreBand.HIGH
    ? 'omni-badge-rose'
    : currentScoreBand === RiskScoreBand.MEDIUM
    ? 'omni-badge-amber'
    : 'omni-badge-teal';

  const isTitleInvalid = titleTouched && !title.trim();
  const isOwnerInvalid = ownerTouched && !owner.trim();

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setTitleTouched(true);
    setOwnerTouched(true);

    if (!title.trim() || !owner.trim() || saving) return;

    setSaving(true);
    setErrorMsg(null);

    try {
      if (isEdit && risk) {
        const payload: UpdateRiskDto = {
          title: title.trim(),
          description: description.trim() || undefined,
          likelihood,
          impact,
          status,
          owner: owner.trim(),
          assetId: assetId || null,
          frameworkId: frameworkId || null,
          frameworkReferenceId: frameworkReferenceId || null,
          treatmentPlan: treatmentPlan.trim() || undefined,
        };
        await apiRequest(`/risks/${risk.id}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
        showToast('Risk updated');
      } else {
        const payload: CreateRiskDto = {
          title: title.trim(),
          description: description.trim() || undefined,
          likelihood,
          impact,
          status,
          owner: owner.trim(),
          assetId: assetId || undefined,
          frameworkId: frameworkId || undefined,
          frameworkReferenceId: frameworkReferenceId || undefined,
          treatmentPlan: treatmentPlan.trim() || undefined,
        };
        await apiRequest('/risks', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        showToast('Risk created');
      }
      onSuccess();
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to save risk. Check entries and network connection.');
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
      showToast('Risk deleted');
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
      position: 'fixed', inset: 0, zIndex: zIndex || 50, display: 'flex', justifyContent: 'flex-end',
      background: 'rgba(15, 26, 46, 0.4)', backdropFilter: 'blur(2px)',
    }}>
      <div className="omni-fade-in w-full sm:max-w-xl h-full bg-white flex flex-col shadow-2xl">
        {/* Header */}
        <div style={{
          height: 60, borderBottom: '1px solid #E2E6E4', padding: '0 20px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 32, height: 32, borderRadius: 8, background: '#FCEFD9', color: '#8F5900',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <ShieldAlert size={16} />
            </div>
            <div>
              <h2 style={{ fontSize: 16, fontWeight: 600, color: '#1B2430' }}>
                {isEdit ? 'Risk Details' : 'New Risk Entry'}
              </h2>
              <p style={{ fontSize: 11.5, color: '#5B6672' }}>
                {isEdit ? 'Update score, likelihood × impact matrix, or treatment plan' : 'Log a risk event and assign severity rating'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close drawer"
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
              borderRadius: 6, color: '#801F2B', fontSize: 13, marginBottom: 16,
            }}>
              {errorMsg}
            </div>
          )}

          <form id="risk-form" onSubmit={handleSave}>
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12.5, fontWeight: 600, color: '#5B6672', display: 'block', marginBottom: 6 }}>
                Risk Title *
              </label>
              <input
                className={`omni-input ${isTitleInvalid ? 'border-rose-500' : ''}`}
                placeholder="e.g. Unencrypted Patient Health Data in Transit"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onBlur={() => setTitleTouched(true)}
                required
              />
              {isTitleInvalid && (
                <span className="text-xs text-rose-600 font-medium mt-1 block">Risk title is required.</span>
              )}
            </div>

            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              background: '#F6F7F6', padding: '12px 14px', borderRadius: 8, border: '1px solid #E2E6E4', marginBottom: 16,
            }}>
              <span style={{ fontSize: 12.5, fontWeight: 600, color: '#5B6672' }}>Calculated Risk Score</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="omni-mono" style={{ fontSize: 16, fontWeight: 700 }}>
                  {currentScore}
                </span>
                <span className={badgeClass}>
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
                  className={`omni-input ${isOwnerInvalid ? 'border-rose-500' : ''}`}
                  placeholder="e.g. SecOps Team"
                  value={owner}
                  onChange={(e) => setOwner(e.target.value)}
                  onBlur={() => setOwnerTouched(true)}
                  required
                />
                {isOwnerInvalid && (
                  <span className="text-xs text-rose-600 font-medium mt-1 block">Risk owner team or person is required.</span>
                )}
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

            <div style={{ marginBottom: 16 }}>
              <ComplianceScopeFilter
                frameworkId={frameworkId}
                versionId={frameworkVersionId}
                frameworkReferenceId={frameworkReferenceId}
                onFrameworkChange={(fwId) => {
                  setFrameworkId(fwId);
                  setFrameworkVersionId('');
                  setFrameworkReferenceId('');
                }}
                onVersionChange={(vId) => {
                  setFrameworkVersionId(vId);
                  setFrameworkReferenceId('');
                }}
                onReferenceChange={(refId) => setFrameworkReferenceId(refId)}
                showReferenceFilter={true}
                showVersionFilter={true}
                frameworkPlaceholder="-- Select Target Framework (Optional) --"
                versionPlaceholder="-- Select Version --"
                clausePlaceholder="-- No Specific Reference / Clause (Optional) --"
                layout="form"
              />
            </div>

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

          {/* Workflow Lifecycle, Next Actions & Prerequisites (Edit mode only) */}
          {isEdit && risk && (
            <div style={{ borderTop: '1px solid #E2E6E4', paddingTop: 16, marginTop: 10, marginBottom: 16 }}>
              <WorkflowLifecyclePanel
                resourceType="RISK"
                resourceId={risk.id}
                collapsible={true}
                defaultExpanded={false}
                onNavigateToView={(v) => {
                  if (onNavigateToView) {
                    onClose();
                    onNavigateToView(v);
                  }
                }}
              />
            </div>
          )}

          {/* Associated Controls (Edit mode only) */}
          {isEdit && (
            <div style={{ borderTop: '1px solid #E2E6E4', paddingTop: 20, marginTop: 10, marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <ShieldCheck size={16} color="#0F6E6A" />
                  <h3 style={{ fontSize: 13.5, fontWeight: 600, color: '#1B2430' }}>Associated Controls</h3>
                  {canAccessControls && (
                    <span style={{
                      fontSize: 11, background: '#EDEFED', color: '#5B6672',
                      padding: '1px 7px', borderRadius: 10, fontWeight: 600,
                    }}>
                      {associatedControls.length}
                    </span>
                  )}
                </div>
              </div>

              {!canAccessControls ? (
                <div style={{
                  padding: '12px 14px', background: '#F8F9FA', border: '1px solid #E2E6E4', borderRadius: 8,
                  display: 'flex', alignItems: 'center', gap: 10, color: '#5B6672', fontSize: 12,
                }}>
                  <Lock size={15} color="#8B95A1" />
                  <div>
                    <span style={{ fontWeight: 600, color: '#1B2430' }}>Controls Module Not Licensed</span>
                    <p style={{ margin: 0, fontSize: 11.5, color: '#8B95A1' }}>
                      Viewing and linking controls requires the <code>GRC_CORE_CONTROLS</code> capability.
                    </p>
                  </div>
                </div>
              ) : loadingControls ? (
                <div style={{ fontSize: 12, color: '#8B95A1', padding: '12px 0' }}>Loading associated controls...</div>
              ) : controlsError ? (
                <div style={{
                  padding: '10px 12px', background: '#F8E6E8', border: '1px solid #B23A48',
                  borderRadius: 6, color: '#801F2B', fontSize: 12, marginBottom: 12,
                }}>
                  {controlsError}
                  <button
                    onClick={fetchAssociatedControls}
                    type="button"
                    style={{ marginLeft: 8, textDecoration: 'underline', background: 'none', border: 'none', color: '#801F2B', cursor: 'pointer', fontSize: 12 }}
                  >
                    Retry
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {associatedControls.length === 0 ? (
                    <div style={{
                      padding: '16px', background: '#FAFAFA', border: '1px dashed #D2D7D5', borderRadius: 8,
                      textAlign: 'center', color: '#8B95A1', fontSize: 12,
                    }}>
                      No controls associated with this risk yet.
                    </div>
                  ) : (
                    associatedControls.map((ac) => {
                      const badge = getMitigationBadgeStyle(ac.mitigationType);
                      return (
                        <div
                          key={ac.id}
                          style={{
                            padding: '12px', background: '#FFFFFF', border: '1px solid #E2E6E4', borderRadius: 8,
                            boxShadow: '0 1px 2px rgba(0,0,0,0.02)', display: 'flex', flexDirection: 'column', gap: 6,
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                            <div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <span style={{ fontSize: 13, fontWeight: 600, color: '#1B2430' }}>
                                  {ac.controlName}
                                </span>
                                {ac.controlCategory && (
                                  <span style={{ fontSize: 10, background: '#EDEFED', color: '#5B6672', padding: '1px 5px', borderRadius: 4 }}>
                                    {ac.controlCategory}
                                  </span>
                                )}
                              </div>
                              {ac.controlDescription && (
                                <p style={{ fontSize: 11.5, color: '#5B6672', margin: '3px 0 0', lineHeight: 1.4 }}>
                                  {ac.controlDescription}
                                </p>
                              )}
                            </div>
                            {canMutateRiskControls && (
                              <button
                                type="button"
                                onClick={() => handleUnlinkControl(ac.controlId, ac.controlName)}
                                disabled={unlinkingControlId === ac.controlId}
                                aria-label={`Unlink control ${ac.controlName}`}
                                title="Disassociate control"
                                style={{
                                  background: 'none', border: 'none', color: '#B23A48', cursor: 'pointer',
                                  padding: 4, borderRadius: 4, display: 'flex', alignItems: 'center',
                                }}
                              >
                                <Trash2 size={13} />
                              </button>
                            )}
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 4, paddingTop: 6, borderTop: '1px solid #F0F2F1' }}>
                            <span style={{
                              fontSize: 10.5, fontWeight: 600, padding: '2px 8px', borderRadius: 4,
                              background: badge.bg, color: badge.color, border: `1px solid ${badge.border}`,
                            }}>
                              {badge.label}
                            </span>
                            {ac.notes && (
                              <span style={{ fontSize: 11, color: '#717D8A', fontStyle: 'italic', maxWidth: '60%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={ac.notes}>
                                Note: {ac.notes}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}

                  {/* Associate New Control Form */}
                  {canMutateRiskControls ? (
                    <div style={{
                      marginTop: 8, padding: '12px', background: '#F8F9FA', borderRadius: 8,
                      border: '1px solid #E2E6E4',
                    }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: '#1B2430', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 5 }}>
                        <Plus size={13} color="#0F6E6A" /> Link a Control
                      </div>

                      {linkError && (
                        <div style={{
                          padding: '6px 8px', background: '#F8E6E8', border: '1px solid #B23A48',
                          borderRadius: 4, color: '#801F2B', fontSize: 11.5, marginBottom: 8,
                        }}>
                          {linkError}
                        </div>
                      )}

                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <select
                          className="omni-input"
                          style={{ fontSize: 12, padding: '6px 8px', height: 'auto' }}
                          value={selectedControlId}
                          onChange={(e) => setSelectedControlId(e.target.value)}
                        >
                          <option value="">-- Select Control to Associate --</option>
                          {availableControls
                            .filter((c) => !associatedControls.some((ac) => ac.controlId === c.id))
                            .map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.name} {c.category ? `(${c.category})` : ''}
                              </option>
                            ))}
                        </select>

                        <div style={{ display: 'flex', gap: 8 }}>
                          <div style={{ flex: 1 }}>
                            <select
                              className="omni-input"
                              style={{ fontSize: 12, padding: '6px 8px', height: 'auto' }}
                              value={selectedMitigationType}
                              onChange={(e) => setSelectedMitigationType(e.target.value as RiskControlMitigationType)}
                            >
                              <option value={RiskControlMitigationType.PREVENTATIVE}>Preventative</option>
                              <option value={RiskControlMitigationType.DETECTIVE}>Detective</option>
                              <option value={RiskControlMitigationType.CORRECTIVE}>Corrective</option>
                              <option value={RiskControlMitigationType.COMPENSATING}>Compensating</option>
                            </select>
                          </div>
                          <div style={{ flex: 1.5 }}>
                            <input
                              className="omni-input"
                              style={{ fontSize: 12, padding: '6px 8px', height: 'auto' }}
                              placeholder="Mitigation notes (optional)..."
                              value={mitigationNotes}
                              onChange={(e) => setMitigationNotes(e.target.value)}
                            />
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={handleLinkControl}
                          disabled={!selectedControlId || isLinking}
                          className="omni-btn-primary"
                          style={{
                            fontSize: 12, padding: '6px 12px', alignSelf: 'flex-end',
                            display: 'flex', alignItems: 'center', gap: 5,
                          }}
                        >
                          <ShieldCheck size={13} />
                          {isLinking ? 'Linking...' : 'Link Control'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ fontSize: 11, color: '#8B95A1', fontStyle: 'italic', marginTop: 4 }}>
                      Control associations are view-only under your current role or license.
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

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

