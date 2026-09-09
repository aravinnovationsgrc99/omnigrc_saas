'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { ArrowLeft, Sparkles, CheckCircle2, RotateCw, ShieldCheck, Layers, GitMerge } from 'lucide-react';
import { ControlDto, ControlFrameworkMappingDto, FrameworkCode, MappingStatus, ModelTier, MappingJobStatusDto } from '@omnigrc/shared';
import { apiRequest } from '@/lib/api-client';
import { OverrideClauseModal } from './override-clause-modal';

interface ControlDetailViewProps {
  controlId: string;
  onBack: () => void;
}

const FRAMEWORK_DISPLAY: Record<FrameworkCode, { name: string; subtitle: string; iconBg: string }> = {
  [FrameworkCode.ISO27001]: { name: 'ISO/IEC 27001:2022', subtitle: 'Information Security Management System', iconBg: '#0F6E6A' },
  [FrameworkCode.ISO42001]: { name: 'ISO/IEC 42001:2023', subtitle: 'Artificial Intelligence Management System (AIMS)', iconBg: '#6B21A8' },
  [FrameworkCode.SOC2]: { name: 'SOC 2 Type II', subtitle: 'Trust Services Criteria (Security & Confidentiality)', iconBg: '#1E40AF' },
  [FrameworkCode.GDPR]: { name: 'EU GDPR', subtitle: 'General Data Protection Regulation', iconBg: '#0369A1' },
  [FrameworkCode.DPDP]: { name: 'India DPDP 2023', subtitle: 'Digital Personal Data Protection Act', iconBg: '#B45309' },
  [FrameworkCode.HIPAA]: { name: 'HIPAA Security Rule', subtitle: 'Health Insurance Portability & Accountability Act', iconBg: '#047857' },
};

export function ControlDetailView({ controlId, onBack }: ControlDetailViewProps) {
  const [control, setControl] = useState<ControlDto | null>(null);
  const [loading, setLoading] = useState(true);

  // Job Polling State
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [jobProgress, setJobProgress] = useState<number>(0);
  const [jobStatus, setJobStatus] = useState<string | null>(null);

  // Override Modal State
  const [overrideModalOpen, setOverrideModalOpen] = useState(false);
  const [overrideTargetFw, setOverrideTargetFw] = useState<FrameworkCode>(FrameworkCode.ISO27001);
  const [overrideMappingId, setOverrideMappingId] = useState<string | null>(null);

  const fetchControl = useCallback(async () => {
    try {
      const data = await apiRequest<ControlDto>(`/controls/${controlId}`);
      setControl(data);
    } catch {
      setControl(null);
    } finally {
      setLoading(false);
    }
  }, [controlId]);

  useEffect(() => {
    fetchControl();
  }, [fetchControl]);

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
          fetchControl();
        } else if (res.status === 'failed') {
          clearInterval(interval);
          setActiveJobId(null);
          alert(`AI Suggestion job failed: ${res.error || 'Unknown error'}`);
        }
      } catch {
        clearInterval(interval);
        setActiveJobId(null);
      }
    }, 1500);

    return () => clearInterval(interval);
  }, [activeJobId, controlId, fetchControl]);

  const handleTriggerSuggestMappings = async () => {
    if (activeJobId) return;
    try {
      const res = await apiRequest<{ jobId: string }>(`/controls/${controlId}/suggest-mappings`, {
        method: 'POST',
      });
      setActiveJobId(res.jobId);
      setJobStatus('queued');
      setJobProgress(10);
    } catch (err: any) {
      alert(err.message || 'Failed to trigger AI suggestions');
    }
  };

  const handleApproveMapping = async (mappingId: string) => {
    try {
      await apiRequest(`/controls/${controlId}/mappings/${mappingId}`, {
        method: 'PATCH',
        body: JSON.stringify({ decision: 'APPROVE' }),
      });
      fetchControl();
    } catch (err: any) {
      alert(err.message || 'Failed to approve mapping');
    }
  };

  const handleOpenOverride = (mapping: ControlFrameworkMappingDto) => {
    if (mapping.frameworkCode) {
      setOverrideTargetFw(mapping.frameworkCode);
    }
    setOverrideMappingId(mapping.id);
    setOverrideModalOpen(true);
  };

  const handleConfirmOverrideClause = async (clauseId: string) => {
    if (!overrideMappingId) return;
    try {
      await apiRequest(`/controls/${controlId}/mappings/${overrideMappingId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          decision: 'OVERRIDE',
          overrideClauseId: clauseId,
        }),
      });
      setOverrideModalOpen(false);
      setOverrideMappingId(null);
      fetchControl();
    } catch (err: any) {
      alert(err.message || 'Failed to override mapping');
    }
  };

  const getConfidenceBadge = (score?: number | null) => {
    if (score === null || score === undefined) {
      return { bg: '#EDEFED', color: '#5B6672', text: 'Human Override' };
    }
    const percent = Math.round(score * 100);
    if (percent >= 85) {
      return { bg: '#E4F1F0', color: '#0F6E6A', text: `${percent}% Confidence` };
    } else if (percent >= 60) {
      return { bg: '#FCEFD9', color: '#B5750A', text: `${percent}% Confidence` };
    } else {
      return { bg: '#F8E6E8', color: '#B23A48', text: `${percent}% Confidence` };
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

  // Map candidates to all 6 framework cards
  const mappingsByFw = new Map<FrameworkCode, ControlFrameworkMappingDto>();
  if (control.mappings) {
    for (const m of control.mappings) {
      if (m.frameworkCode) {
        mappingsByFw.set(m.frameworkCode, m);
      }
    }
  }

  const allFrameworks: FrameworkCode[] = [
    FrameworkCode.ISO27001,
    FrameworkCode.ISO42001,
    FrameworkCode.SOC2,
    FrameworkCode.GDPR,
    FrameworkCode.DPDP,
    FrameworkCode.HIPAA,
  ];

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

      {/* Candidate Framework Cards (6 Framework Cards) */}
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, color: '#1B2430', marginBottom: 4 }}>
          Framework Compliance Mapping Cards
        </h2>
        <p style={{ fontSize: 13, color: '#5B6672', marginBottom: 20 }}>
          AI-suggested clause matches across pilot-scope standards. Review and approve or override.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(500px, 1fr))', gap: 20 }}>
        {allFrameworks.map((fwCode) => {
          const info = FRAMEWORK_DISPLAY[fwCode];
          const mapping = mappingsByFw.get(fwCode);
          const badge = getConfidenceBadge(mapping?.confidenceScore);

          return (
            <div
              key={fwCode}
              style={{
                background: '#FFFFFF', border: '1px solid #E2E6E4', borderRadius: 10,
                padding: '20px 22px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
                boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
              }}
            >
              <div>
                {/* Framework Card Header */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{
                      width: 32, height: 32, borderRadius: 8, background: info.iconBg, color: '#FFFFFF',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 11,
                    }}>
                      {fwCode.substring(0, 3)}
                    </div>
                    <div>
                      <div style={{ fontSize: 14.5, fontWeight: 600, color: '#1B2430' }}>{info.name}</div>
                      <div style={{ fontSize: 11.5, color: '#8B95A1' }}>{info.subtitle}</div>
                    </div>
                  </div>

                  {mapping && (
                    <span style={{
                      fontSize: 10.5, fontWeight: 700, padding: '3px 9px', borderRadius: 999,
                      background: badge.bg, color: badge.color, letterSpacing: 0.4,
                    }}>
                      {badge.text}
                    </span>
                  )}
                </div>

                {/* Suggested Clause Content */}
                {mapping ? (
                  <div style={{
                    background: '#F6F7F6', border: '1px solid #E2E6E4', borderRadius: 8, padding: '14px 16px', marginBottom: 16,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                      <span className="omni-mono" style={{ fontSize: 13, fontWeight: 700, color: '#0F6E6A' }}>
                        {mapping.clauseCode}
                      </span>
                      <span style={{ fontSize: 10.5, color: '#8B95A1', background: '#FFFFFF', padding: '2px 7px', borderRadius: 4, border: '1px solid #E2E6E4' }}>
                        {mapping.modelTier === ModelTier.TIER_2 ? 'Tier 2 Escalated' : 'Tier 1 Routine'}
                      </span>
                    </div>

                    <div style={{ fontSize: 13.5, fontWeight: 600, color: '#1B2430', marginBottom: 6 }}>
                      {mapping.clauseTitle}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5 }}>
                      <span style={{ color: '#5B6672' }}>Status:</span>
                      <span style={{
                        fontWeight: 700,
                        color: mapping.status === MappingStatus.APPROVED ? '#0F6E6A' : mapping.status === MappingStatus.OVERRIDDEN ? '#B5750A' : '#5B6672',
                      }}>
                        {mapping.status}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div style={{
                    background: '#FAFAFA', border: '1px dashed #D2D7D5', borderRadius: 8, padding: '20px 16px',
                    textAlign: 'center', color: '#8B95A1', fontSize: 12.5, marginBottom: 16,
                  }}>
                    No mapping generated for this framework yet. Click "Suggest Mappings" above to analyze.
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              {mapping && (
                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 10, borderTop: '1px solid #EDEFED' }}>
                  <button
                    onClick={() => handleOpenOverride(mapping)}
                    className="omni-btn-ghost"
                    style={{ fontSize: 12, padding: '6px 12px' }}
                  >
                    Override Clause
                  </button>
                  {mapping.status !== MappingStatus.APPROVED && (
                    <button
                      onClick={() => handleApproveMapping(mapping.id)}
                      className="omni-btn-primary"
                      style={{ fontSize: 12, padding: '6px 14px', display: 'flex', alignItems: 'center', gap: 4 }}
                    >
                      <CheckCircle2 size={13} /> Approve
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Override Clause Modal */}
      <OverrideClauseModal
        isOpen={overrideModalOpen}
        targetFrameworkCode={overrideTargetFw}
        onClose={() => setOverrideModalOpen(false)}
        onSelectClause={handleConfirmOverrideClause}
      />
    </div>
  );
}
