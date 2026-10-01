'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  ControlDto,
  ControlFrameworkMappingDto,
  MappingJobStatusDto,
  MappingStatus,
  ModelTier,
  FrameworkItemDto,
  FrameworkVersionDto,
  FrameworkReferenceDto,
} from '@omnigrc/shared';

import { apiRequest } from '@/lib/api-client';
import { useToast } from '@/context/toast-context';
import { InlineErrorState } from '@/components/ui/inline-error-state';
import {
  ArrowLeft,
  Sparkles,
  RotateCw,
  CheckCircle2,
  GitMerge,
  Layers,
  ChevronRight,
  ShieldCheck,
  Search,
} from 'lucide-react';
import { OverrideClauseModal } from './override-clause-modal';

interface ControlDetailViewProps {
  controlId: string;
  onBack: () => void;
}

export function ControlDetailView({ controlId, onBack }: ControlDetailViewProps) {
  const { showToast } = useToast();
  const [control, setControl] = useState<ControlDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Cascading Selector State
  const [frameworks, setFrameworks] = useState<FrameworkItemDto[]>([]);
  const [selectedFrameworkId, setSelectedFrameworkId] = useState<string>('');
  const [versions, setVersions] = useState<FrameworkVersionDto[]>([]);
  const [selectedVersionId, setSelectedVersionId] = useState<string>('');
  const [references, setReferences] = useState<FrameworkReferenceDto[]>([]);
  const [selectedReferenceId, setSelectedReferenceId] = useState<string>('');
  const [referenceSearch, setReferenceSearch] = useState<string>('');
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [loadingReferences, setLoadingReferences] = useState(false);
  const [mappingSubmitting, setMappingSubmitting] = useState(false);

  // Job Polling State
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [jobProgress, setJobProgress] = useState<number>(0);
  const [jobStatus, setJobStatus] = useState<string | null>(null);

  // Override Modal State
  const [overrideModalOpen, setOverrideModalOpen] = useState(false);
  const [overrideTargetFw, setOverrideTargetFw] = useState<string>('');
  const [overrideMappingId, setOverrideMappingId] = useState<string | null>(null);

  // Fetch Control Details
  const fetchControl = useCallback(async () => {
    setErrorMsg(null);
    try {
      const data = await apiRequest<ControlDto>(`/controls/${controlId}`);
      setControl(data);
    } catch (err: any) {
      setControl(null);
      setErrorMsg(err?.message || 'Failed to fetch control details. Check connection or retry.');
    } finally {
      setLoading(false);
    }
  }, [controlId]);

  useEffect(() => {
    fetchControl();
  }, [fetchControl]);

  // Fetch Frameworks for Step 1
  useEffect(() => {
    apiRequest<FrameworkItemDto[]>('/frameworks')
      .then((data) => setFrameworks(data))
      .catch(() => setFrameworks([]));
  }, []);

  // Fetch Versions when Framework selected for Step 2
  useEffect(() => {
    if (selectedFrameworkId) {
      setLoadingVersions(true);
      setVersions([]);
      setSelectedVersionId('');
      setReferences([]);
      setSelectedReferenceId('');

      apiRequest<FrameworkVersionDto[]>(`/frameworks/${selectedFrameworkId}/versions`)
        .then((data) => {
          setVersions(data);
          const active = data.find((v) => v.status === 'ACTIVE') || data[0];
          if (active) setSelectedVersionId(active.id);
        })
        .catch((err: any) => {
          setVersions([]);
          setErrorMsg(err?.message || 'Failed to load framework versions.');
        })
        .finally(() => setLoadingVersions(false));
    } else {
      setVersions([]);
      setSelectedVersionId('');
      setReferences([]);
      setSelectedReferenceId('');
    }
  }, [selectedFrameworkId]);

  // Fetch References when Version selected for Step 3
  useEffect(() => {
    if (selectedVersionId) {
      setLoadingReferences(true);
      setReferences([]);
      setSelectedReferenceId('');

      apiRequest<FrameworkReferenceDto[]>(`/frameworks/versions/${selectedVersionId}/references`)
        .then((data) => setReferences(data))
        .catch((err: any) => {
          setReferences([]);
          setErrorMsg(err?.message || 'Failed to load framework references.');
        })
        .finally(() => setLoadingReferences(false));
    } else {
      setReferences([]);
      setSelectedReferenceId('');
    }
  }, [selectedVersionId]);

  // Polling for async AI job
  useEffect(() => {
    if (!activeJobId) return;

    const interval = setInterval(async () => {
      try {
        const res = await apiRequest<MappingJobStatusDto>(`/controls/${controlId}/mapping-jobs/${activeJobId}`);
        setJobStatus(res.status);
        setJobProgress(res.progress || 0);

        if (res.status === 'done') {
          clearInterval(interval);
          setActiveJobId(null);
          showToast('Generated AI mapping suggestions');
          fetchControl();
        } else if (res.status === 'failed') {
          clearInterval(interval);
          setActiveJobId(null);
          setErrorMsg(`AI suggestion job failed: ${res.error || 'Provider execution error'}`);
        }
      } catch {
        clearInterval(interval);
        setActiveJobId(null);
      }
    }, 1500);

    return () => clearInterval(interval);
  }, [activeJobId, controlId, fetchControl, showToast]);

  // Direct Manual Mapping Submission
  const handleMapControl = async () => {
    if (!selectedReferenceId) {
      setErrorMsg('Please select a specific Framework Reference before mapping.');
      return;
    }
    setMappingSubmitting(true);
    setErrorMsg(null);
    try {
      await apiRequest(`/controls/${controlId}/mappings`, {
        method: 'POST',
        body: JSON.stringify({ frameworkReferenceId: selectedReferenceId }),
      });
      showToast('Successfully mapped control to framework reference');
      setSelectedReferenceId('');
      fetchControl();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to map control to framework reference');
    } finally {
      setMappingSubmitting(false);
    }
  };

  // AI Suggestion Trigger
  const handleTriggerSuggestMappings = async () => {
    if (activeJobId) return;
    setErrorMsg(null);
    try {
      const payload: any = {};
      if (selectedFrameworkId) payload.frameworkId = selectedFrameworkId;
      if (selectedVersionId) payload.frameworkVersionId = selectedVersionId;
      if (selectedReferenceId) payload.frameworkReferenceId = selectedReferenceId;

      const res = await apiRequest<{ jobId: string }>(`/controls/${controlId}/suggest-mappings`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      setActiveJobId(res.jobId);
      setJobStatus('queued');
      setJobProgress(10);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to trigger AI suggestions');
    }
  };

  // Approve Mapping Action
  const handleApproveMapping = async (mappingId: string) => {
    setErrorMsg(null);
    try {
      await apiRequest(`/controls/${controlId}/mappings/${mappingId}/sign-off`, {
        method: 'POST',
        body: JSON.stringify({ decision: 'APPROVE' }),
      });
      showToast('Approved control mapping');
      fetchControl();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to approve mapping');
    }
  };

  // Open Override Modal
  const handleOpenOverride = (mapping: ControlFrameworkMappingDto) => {
    const code = mapping.frameworkCode || 'ISO27001';
    setOverrideTargetFw(code);
    setOverrideMappingId(mapping.id);
    setOverrideModalOpen(true);
  };

  // Confirm Human Override with selected FrameworkReference ID
  const handleConfirmOverrideReference = async (referenceId: string) => {
    if (!overrideMappingId) return;
    setErrorMsg(null);
    try {
      await apiRequest(`/controls/${controlId}/mappings/${overrideMappingId}/sign-off`, {
        method: 'POST',
        body: JSON.stringify({
          decision: 'OVERRIDE',
          overrideReferenceId: referenceId,
        }),
      });
      showToast('Mapping overridden to authoritative reference');
      setOverrideModalOpen(false);
      setOverrideMappingId(null);
      fetchControl();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to override mapping');
    }
  };

  const getConfidenceBadgeClass = (score?: number | null) => {
    if (score === null || score === undefined) {
      return { className: 'omni-badge-teal', text: 'Human Authoritative' };
    }
    const percent = Math.round(score * 100);
    if (percent >= 85) {
      return { className: 'omni-badge-teal', text: `${percent}% Confidence` };
    } else if (percent >= 60) {
      return { className: 'omni-badge-amber', text: `${percent}% Confidence` };
    } else {
      return { className: 'omni-badge-rose', text: `${percent}% Confidence` };
    }
  };

  if (loading) {
    return (
      <div style={{ padding: '40px 32px', color: '#8B95A1', fontSize: 13, textAlign: 'center' }}>
        Loading control mapping details...
      </div>
    );
  }

  if (!control) {
    return (
      <div style={{ padding: '40px 32px' }}>
        <button onClick={onBack} className="omni-btn-ghost" style={{ marginBottom: 16 }}>
          <ArrowLeft size={14} /> Back to controls
        </button>
        <div style={{ color: '#B23A48', fontWeight: 600 }}>Control not found.</div>
      </div>
    );
  }

  const activeMappings = control.mappings || [];
  const filteredReferences = references.filter((r) => {
    if (!referenceSearch.trim()) return true;
    const s = referenceSearch.toLowerCase().trim();
    return (
      r.identifier.toLowerCase().includes(s) ||
      r.title.toLowerCase().includes(s) ||
      (r.type && r.type.toLowerCase().includes(s))
    );
  });

  return (
    <div className="omni-fade-in" style={{ padding: '28px 32px', maxWidth: 1140, margin: '0 auto' }}>
      {/* Top Back Navigation */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <button
          onClick={onBack}
          className="omni-btn-ghost"
          style={{ display: 'flex', alignItems: 'center', gap: 6 }}
        >
          <ArrowLeft size={15} /> Back to Control Register
        </button>

        {/* Suggest Mappings Action */}
        <button
          onClick={handleTriggerSuggestMappings}
          disabled={Boolean(activeJobId)}
          className="omni-btn-primary"
          style={{ display: 'flex', alignItems: 'center', gap: 8, background: activeJobId ? '#6E7A8A' : '#0F6E6A' }}
        >
          <Sparkles size={16} />
          {activeJobId ? 'Analyzing Control...' : 'Suggest Mappings (AI)'}
        </button>
      </div>

      {/* Control Title & Info Card */}
      <div style={{
        background: '#FFFFFF', border: '1px solid #E2E6E4', borderRadius: 10,
        padding: '24px 28px', marginBottom: 24, boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <span className="omni-mono" style={{ fontSize: 12, fontWeight: 700, background: '#EDEFED', padding: '3px 9px', borderRadius: 4, color: '#5B6672' }}>
            {control.category || 'General Security Control'}
          </span>
          <span style={{ fontSize: 12, color: '#8B95A1' }}>
            ID: {control.id.substring(0, 8)}...
          </span>
        </div>

        <h1 style={{ fontSize: 20, fontWeight: 600, color: '#1B2430', marginBottom: 8 }}>
          {control.name}
        </h1>
        <p style={{ fontSize: 13.5, color: '#5B6672', lineHeight: 1.6, maxWidth: 900 }}>
          {control.description}
        </p>

        {/* Async Job Loading Bar */}
        {activeJobId && (
          <div style={{
            marginTop: 20, paddingTop: 16, borderTop: '1px solid #EDEFED',
            display: 'flex', flexDirection: 'column', gap: 8,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, fontWeight: 600, color: '#0F6E6A' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <RotateCw size={14} className="animate-spin" /> AI Background Worker: {jobStatus || 'processing'}...
              </span>
              <span>{jobProgress}%</span>
            </div>
            <div style={{ width: '100%', height: 6, background: '#E4F1F0', borderRadius: 999, overflow: 'hidden' }}>
              <div style={{
                height: '100%', width: `${jobProgress}%`, background: '#0F6E6A',
                transition: 'width 0.3s ease',
              }} />
            </div>
          </div>
        )}
      </div>

      {/* Inline Error State */}
      {errorMsg && (
        <div style={{ marginBottom: 20 }}>
          <InlineErrorState
            title="Mapping Action Failed"
            message={errorMsg}
            onRetry={fetchControl}
          />
        </div>
      )}

      {/* Dynamic Framework -> Version -> Reference Cascading Selector */}
      <div style={{
        background: '#FFFFFF', border: '1px solid #E2E6E4', borderRadius: 10,
        padding: '24px 28px', marginBottom: 24, boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <GitMerge size={18} color="#0F6E6A" />
          <h2 style={{ fontSize: 16, fontWeight: 600, color: '#1B2430' }}>
            Authoritative Framework Reference Mapping
          </h2>
        </div>
        <p style={{ fontSize: 13, color: '#5B6672', marginBottom: 20 }}>
          Select a Framework, its Framework Version, and exact Framework Reference to map this operational control.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16, marginBottom: 20 }}>
          {/* STEP 1: Framework Dropdown */}
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#5B6672', marginBottom: 6 }}>
              STEP 1 — Select Framework
            </label>
            <select
              className="omni-input w-full"
              value={selectedFrameworkId}
              onChange={(e) => setSelectedFrameworkId(e.target.value)}
            >
              <option value="">-- Choose Framework --</option>
              {frameworks.map((fw) => (
                <option key={fw.id} value={fw.id}>
                  {fw.name} ({fw.code})
                </option>
              ))}
            </select>
          </div>

          {/* STEP 2: Framework Version Dropdown */}
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#5B6672', marginBottom: 6 }}>
              STEP 2 — Select Framework Version
            </label>
            <select
              className="omni-input w-full"
              value={selectedVersionId}
              disabled={!selectedFrameworkId || loadingVersions}
              onChange={(e) => setSelectedVersionId(e.target.value)}
            >
              <option value="">
                {loadingVersions ? 'Loading versions...' : '-- Choose Version --'}
              </option>
              {versions.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name || `v${v.version}`} ({v.status})
                </option>
              ))}
            </select>
          </div>

          {/* STEP 3: Reference Filter / Selector */}
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#5B6672', marginBottom: 6 }}>
              STEP 3 — Filter Reference
            </label>
            <div style={{ position: 'relative' }}>
              <Search size={14} color="#8B95A1" style={{ position: 'absolute', left: 10, top: 10 }} />
              <input
                className="omni-input w-full"
                placeholder={!selectedVersionId ? 'Select version first...' : 'Filter reference code or title...'}
                disabled={!selectedVersionId || loadingReferences}
                value={referenceSearch}
                onChange={(e) => setReferenceSearch(e.target.value)}
                style={{ paddingLeft: 30 }}
              />
            </div>
          </div>
        </div>

        {/* STEP 3: Reference Selection List */}
        {selectedVersionId && (
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#5B6672', marginBottom: 8 }}>
              Select Specific Reference ({filteredReferences.length} available):
            </label>
            <div style={{
              maxHeight: 220, overflowY: 'auto', border: '1px solid #E2E6E4', borderRadius: 8, padding: 8, background: '#FAFAFA',
            }} className="omni-scroll">
              {loadingReferences ? (
                <div style={{ padding: '16px 0', textAlign: 'center', color: '#8B95A1', fontSize: 12.5 }}>
                  Loading framework references...
                </div>
              ) : filteredReferences.length === 0 ? (
                <div style={{ padding: '16px 0', textAlign: 'center', color: '#8B95A1', fontSize: 12.5 }}>
                  No references match criteria.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {filteredReferences.map((ref) => {
                    const isSelected = selectedReferenceId === ref.id;
                    return (
                      <div
                        key={ref.id}
                        onClick={() => setSelectedReferenceId(ref.id)}
                        style={{
                          padding: '8px 12px', borderRadius: 6, border: isSelected ? '1px solid #0F6E6A' : '1px solid #E2E6E4',
                          background: isSelected ? '#E4F1F0' : '#FFFFFF', cursor: 'pointer',
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          transition: 'all 0.12s ease',
                        }}
                      >
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span className="omni-mono" style={{ fontSize: 12, fontWeight: 700, color: '#0F6E6A' }}>
                              {ref.identifier}
                            </span>
                            {ref.type && (
                              <span style={{ fontSize: 10, background: '#EDEFED', color: '#5B6672', padding: '1px 6px', borderRadius: 4 }}>
                                {ref.type}
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: 12.5, fontWeight: 500, color: '#1B2430', marginTop: 2 }}>
                            {ref.title}
                          </div>
                        </div>
                        {isSelected && <CheckCircle2 size={16} color="#0F6E6A" />}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Map Button */}
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            onClick={handleMapControl}
            disabled={!selectedReferenceId || mappingSubmitting}
            className="omni-btn-primary"
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <ShieldCheck size={15} />
            {mappingSubmitting ? 'Mapping Control...' : 'Map Control to Selected Reference'}
          </button>
        </div>
      </div>

      {/* Active Framework Compliance Mappings List */}
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, color: '#1B2430', marginBottom: 4 }}>
          Mapped Framework Compliance References
        </h2>
        <p style={{ fontSize: 13, color: '#5B6672', marginBottom: 20 }}>
          Authoritative framework references linked to this control. Human review (Approve / Override) governs Phase C coverage.
        </p>
      </div>

      {activeMappings.length === 0 ? (
        <div style={{
          background: '#FFFFFF', border: '1px dashed #D2D7D5', borderRadius: 10,
          padding: '32px 24px', textAlign: 'center', color: '#8B95A1', fontSize: 13, marginBottom: 32,
        }}>
          No framework references mapped to this control yet. Use the cascading selector above or click "Suggest Mappings (AI)".
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 32 }}>
          {activeMappings.map((mapping) => {
            const badge = getConfidenceBadgeClass(mapping.confidenceScore);
            const refCode = mapping.referenceIdentifier || mapping.clauseCode || 'N/A';
            const refTitle = mapping.referenceTitle || mapping.clauseTitle || 'Framework Reference';
            const fwCode = mapping.frameworkCode || 'FRAMEWORK';

            return (
              <div
                key={mapping.id}
                style={{
                  background: '#FFFFFF', border: '1px solid #E2E6E4', borderRadius: 10,
                  padding: '20px 22px', boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
                  display: 'flex', flexDirection: 'column', gap: 12,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{
                      background: '#0F6E6A', color: '#FFFFFF', padding: '4px 10px', borderRadius: 6,
                      fontSize: 11.5, fontWeight: 700,
                    }}>
                      {fwCode}
                    </div>
                    <div>
                      <span className="omni-mono" style={{ fontSize: 13, fontWeight: 700, color: '#0F6E6A', marginRight: 8 }}>
                        {refCode}
                      </span>
                      {mapping.referenceType && (
                        <span style={{ fontSize: 10.5, background: '#EDEFED', color: '#5B6672', padding: '2px 7px', borderRadius: 4 }}>
                          {mapping.referenceType}
                        </span>
                      )}
                    </div>
                  </div>

                  <span className={`omni-badge ${badge.className}`}>
                    {badge.text}
                  </span>
                </div>

                <div style={{ fontSize: 14, fontWeight: 600, color: '#1B2430' }}>
                  {refTitle}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 10, borderTop: '1px solid #EDEFED' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#5B6672' }}>
                    <span>Status:</span>
                    <span className="omni-mono" style={{
                      fontWeight: 700,
                      color: mapping.status === MappingStatus.APPROVED ? '#0F6E6A' : mapping.status === MappingStatus.OVERRIDDEN ? '#B5750A' : '#5B6672',
                    }}>
                      {mapping.status}
                    </span>
                    {mapping.modelTier && (
                      <span style={{ fontSize: 10.5, color: '#8B95A1', background: '#F6F7F6', padding: '2px 6px', borderRadius: 4 }}>
                        {mapping.modelTier === ModelTier.TIER_2 ? 'Tier 2 AI' : 'Tier 1 AI'}
                      </span>
                    )}
                  </div>

                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      onClick={() => handleOpenOverride(mapping)}
                      className="omni-btn-ghost"
                      style={{ fontSize: 12, padding: '5px 12px' }}
                    >
                      Override Reference
                    </button>
                    {mapping.status !== MappingStatus.APPROVED && (
                      <button
                        onClick={() => handleApproveMapping(mapping.id)}
                        className="omni-btn-primary"
                        style={{ fontSize: 12, padding: '5px 12px', display: 'flex', alignItems: 'center', gap: 4 }}
                      >
                        <CheckCircle2 size={13} /> Approve
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Override Framework Reference Modal */}
      <OverrideClauseModal
        isOpen={overrideModalOpen}
        targetFrameworkCode={overrideTargetFw}
        onClose={() => setOverrideModalOpen(false)}
        onSelectReference={handleConfirmOverrideReference}
      />
    </div>
  );
}
