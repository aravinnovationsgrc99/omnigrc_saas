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
  RiskControlMitigationType,
  ControlRiskAssociationDto,
  PaginatedControlRiskAssociationsDto,
  RiskDto,
  PaginatedRisksDto,
  RiskScoreBand,
  Role,
  ControlEvidenceAssociationDto,
  PaginatedControlEvidenceAssociationsDto,
  EvidenceDto,
  PaginatedEvidenceDto,
  EvidenceType,
  EvidenceStatus,
  EvidenceScanStatus,
} from '@omnigrc/shared';

import { apiRequest, getStoredTokens } from '@/lib/api-client';
import { useToast } from '@/context/toast-context';
import { useAuth } from '@/context/auth-context';
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
  ShieldAlert,
  Search,
  Trash2,
  Plus,
  Lock,
  FileArchive,
  FileCheck,
  FileText,
  Download,
  Upload,
  AlertTriangle,
  X,
} from 'lucide-react';
import { OverrideClauseModal } from './override-clause-modal';
import { ControlTestingSection } from './control-testing-section';
import { WorkflowLifecyclePanel } from '../workflow/workflow-lifecycle-panel';

export const formatFileSize = (bytes?: number | null) => {
  if (!bytes) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export const getEvidenceScanBadgeStyle = (scanStatus: EvidenceScanStatus, status: EvidenceStatus) => {
  if (status === EvidenceStatus.QUARANTINED || scanStatus === EvidenceScanStatus.QUARANTINED) {
    return { bg: '#F8E6E8', color: '#801F2B', border: '#B23A48', label: 'Quarantined - Malware Risk' };
  }
  if (scanStatus === EvidenceScanStatus.PENDING_SCAN) {
    return { bg: '#FEF7E0', color: '#B06000', border: '#FEEFC3', label: 'Pending Scan' };
  }
  if (scanStatus === EvidenceScanStatus.SCAN_FAILED) {
    return { bg: '#F8E6E8', color: '#801F2B', border: '#B23A48', label: 'Scan Failed' };
  }
  return { bg: '#E6F4EA', color: '#137333', border: '#CEEAD6', label: 'Clean / Verified' };
};

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

interface ControlDetailViewProps {
  controlId: string;
  onBack: () => void;
  onNavigateToView?: (view: string) => void;
}

export function ControlDetailView({ controlId, onBack, onNavigateToView }: ControlDetailViewProps) {
  const { showToast } = useToast();
  const { user, organization, hasCapability } = useAuth();
  const canUseAiMapping = hasCapability('AI_CONTROL_MAPPING');
  const canAccessRisks = hasCapability('GRC_CORE_RISKS');
  const canMutateRiskControls = Boolean(
    canAccessRisks &&
    hasCapability('GRC_CORE_CONTROLS') &&
    !organization?.isReadOnly &&
    user?.role &&
    [Role.ADMIN, Role.ANALYST, Role.MSSP_ADMIN, Role.MSSP_ANALYST].includes(user.role as Role)
  );

  const canAccessEvidenceVault = hasCapability('EVIDENCE_VAULT');
  const canMutateControlEvidence = Boolean(
    canAccessEvidenceVault &&
    hasCapability('GRC_CORE_CONTROLS') &&
    !organization?.isReadOnly &&
    user?.role &&
    [Role.ADMIN, Role.ANALYST, Role.MSSP_ADMIN, Role.MSSP_ANALYST].includes(user.role as Role)
  );

  const [control, setControl] = useState<ControlDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Associated Risks State
  const [associatedRisks, setAssociatedRisks] = useState<ControlRiskAssociationDto[]>([]);
  const [loadingRisks, setLoadingRisks] = useState(false);
  const [risksError, setRisksError] = useState<string | null>(null);
  const [availableRisks, setAvailableRisks] = useState<RiskDto[]>([]);
  const [selectedRiskId, setSelectedRiskId] = useState<string>('');
  const [selectedMitigationType, setSelectedMitigationType] = useState<RiskControlMitigationType>(RiskControlMitigationType.PREVENTATIVE);
  const [mitigationNotes, setMitigationNotes] = useState<string>('');
  const [linkingRisk, setLinkingRisk] = useState(false);
  const [unlinkingRiskId, setUnlinkingRiskId] = useState<string | null>(null);
  const [linkRiskError, setLinkRiskError] = useState<string | null>(null);

  // Associated Evidence State
  const [associatedEvidence, setAssociatedEvidence] = useState<ControlEvidenceAssociationDto[]>([]);
  const [loadingEvidence, setLoadingEvidence] = useState(false);
  const [evidenceError, setEvidenceError] = useState<string | null>(null);
  const [availableVaultEvidence, setAvailableVaultEvidence] = useState<EvidenceDto[]>([]);
  const [selectedEvidenceIdToAttach, setSelectedEvidenceIdToAttach] = useState<string>('');
  const [attachingEvidence, setAttachingEvidence] = useState(false);
  const [detachingEvidenceId, setDetachingEvidenceId] = useState<string | null>(null);
  const [attachEvidenceError, setAttachEvidenceError] = useState<string | null>(null);

  // Upload Proof Modal State
  const [showUploadEvidenceModal, setShowUploadEvidenceModal] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadTitle, setUploadTitle] = useState('');
  const [uploadDescription, setUploadDescription] = useState('');
  const [uploadEvidenceType, setUploadEvidenceType] = useState<EvidenceType>(EvidenceType.DOCUMENT);
  const [uploadingEvidence, setUploadingEvidence] = useState(false);
  const [uploadEvidenceError, setUploadEvidenceError] = useState<string | null>(null);


  // Fetch Associated Risks
  const fetchAssociatedRisks = useCallback(async () => {
    if (!controlId || !canAccessRisks) return;
    setLoadingRisks(true);
    setRisksError(null);
    try {
      const res = await apiRequest<PaginatedControlRiskAssociationsDto>(`/controls/${controlId}/risks?limit=50`);
      setAssociatedRisks(res.items || []);
    } catch (err: any) {
      setRisksError(err.message || 'Failed to load associated risks');
    } finally {
      setLoadingRisks(false);
    }
  }, [controlId, canAccessRisks]);

  useEffect(() => {
    if (controlId && canAccessRisks) {
      fetchAssociatedRisks();
    } else {
      setAssociatedRisks([]);
      setRisksError(null);
    }
  }, [controlId, canAccessRisks, fetchAssociatedRisks]);

  useEffect(() => {
    if (canAccessRisks) {
      apiRequest<PaginatedRisksDto>('/risks?limit=100')
        .then((res) => setAvailableRisks(res.items || []))
        .catch(() => setAvailableRisks([]));
    }
  }, [canAccessRisks]);

  const handleLinkRisk = async (e?: React.FormEvent | React.MouseEvent) => {
    if (e) e.preventDefault();
    if (!controlId || !selectedRiskId || linkingRisk) return;
    setLinkingRisk(true);
    setLinkRiskError(null);
    try {
      await apiRequest(`/controls/${controlId}/risks`, {
        method: 'POST',
        body: JSON.stringify({
          riskId: selectedRiskId,
          mitigationType: selectedMitigationType,
          notes: mitigationNotes.trim() || undefined,
        }),
      });
      showToast('Risk associated with control');
      setSelectedRiskId('');
      setMitigationNotes('');
      setSelectedMitigationType(RiskControlMitigationType.PREVENTATIVE);
      await fetchAssociatedRisks();
    } catch (err: any) {
      setLinkRiskError(err.message || 'Failed to associate risk');
    } finally {
      setLinkingRisk(false);
    }
  };

  const handleUnlinkRisk = async (riskId: string, riskTitle: string) => {
    if (!controlId || unlinkingRiskId) return;
    if (!confirm(`Are you sure you want to disassociate risk "${riskTitle}" from this control?`)) return;
    setUnlinkingRiskId(riskId);
    try {
      await apiRequest(`/controls/${controlId}/risks/${riskId}`, {
        method: 'DELETE',
      });
      showToast('Risk disassociated');
      await fetchAssociatedRisks();
    } catch (err: any) {
      showToast(err.message || 'Failed to disassociate risk', 'error');
    } finally {
      setUnlinkingRiskId(null);
    }
  };

  // Fetch Associated Evidence
  const fetchAssociatedEvidence = useCallback(async () => {
    if (!controlId) return;
    setLoadingEvidence(true);
    setEvidenceError(null);
    try {
      const res = await apiRequest<PaginatedControlEvidenceAssociationsDto>(`/controls/${controlId}/evidence?limit=50`);
      setAssociatedEvidence(res.items || []);
    } catch (err: any) {
      setEvidenceError(err.message || 'Failed to load associated compliance evidence');
    } finally {
      setLoadingEvidence(false);
    }
  }, [controlId]);

  useEffect(() => {
    if (controlId) {
      fetchAssociatedEvidence();
    }
  }, [controlId, fetchAssociatedEvidence]);

  useEffect(() => {
    if (canAccessEvidenceVault) {
      apiRequest<PaginatedEvidenceDto>('/evidence/vault?limit=100')
        .then((res) => setAvailableVaultEvidence(res.items || []))
        .catch(() => setAvailableVaultEvidence([]));
    } else {
      setAvailableVaultEvidence([]);
    }
  }, [canAccessEvidenceVault]);

  const handleAttachEvidence = async (e?: React.FormEvent | React.MouseEvent) => {
    if (e) e.preventDefault();
    if (!controlId || !selectedEvidenceIdToAttach || attachingEvidence) return;
    setAttachingEvidence(true);
    setAttachEvidenceError(null);
    try {
      await apiRequest(`/controls/${controlId}/evidence`, {
        method: 'POST',
        body: JSON.stringify({
          evidenceId: selectedEvidenceIdToAttach,
        }),
      });
      showToast('Evidence attached to control');
      setSelectedEvidenceIdToAttach('');
      await fetchAssociatedEvidence();
    } catch (err: any) {
      setAttachEvidenceError(err.message || 'Failed to attach evidence');
    } finally {
      setAttachingEvidence(false);
    }
  };

  const handleDetachEvidence = async (evidenceId: string, evidenceTitle: string) => {
    if (!controlId || detachingEvidenceId) return;
    if (!confirm(`Are you sure you want to detach evidence "${evidenceTitle}" from this control? The evidence file will remain in the vault.`)) return;
    setDetachingEvidenceId(evidenceId);
    try {
      await apiRequest(`/controls/${controlId}/evidence/${evidenceId}`, {
        method: 'DELETE',
      });
      showToast('Evidence detached from control');
      await fetchAssociatedEvidence();
    } catch (err: any) {
      showToast(err.message || 'Failed to detach evidence', 'error');
    } finally {
      setDetachingEvidenceId(null);
    }
  };

  const handleUploadNewEvidence = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!controlId || !uploadFile || !uploadTitle.trim() || uploadingEvidence) return;
    setUploadingEvidence(true);
    setUploadEvidenceError(null);
    try {
      const formData = new FormData();
      formData.append('file', uploadFile);
      formData.append('title', uploadTitle.trim());
      if (uploadDescription.trim()) formData.append('description', uploadDescription.trim());
      formData.append('evidenceType', uploadEvidenceType);
      formData.append('targetResourceType', 'CONTROL');
      formData.append('targetResourceId', controlId);

      const API_BASE_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001').replace(/\/+$/, '');
      const { accessToken } = getStoredTokens();
      const res = await fetch(`${API_BASE_URL}/evidence/upload`, {
        method: 'POST',
        headers: {
          Authorization: accessToken ? `Bearer ${accessToken}` : '',
        },
        body: formData,
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.message || 'Failed to upload compliance proof.');
      }

      showToast(`Proof '${uploadTitle}' uploaded and attached successfully`);
      setShowUploadEvidenceModal(false);
      setUploadFile(null);
      setUploadTitle('');
      setUploadDescription('');
      await fetchAssociatedEvidence();
    } catch (err: any) {
      setUploadEvidenceError(err.message || 'Upload failed');
    } finally {
      setUploadingEvidence(false);
    }
  };

  const handleDownloadEvidence = async (evidence: { id: string; fileName: string; scanStatus?: string; status?: string }) => {
    if (evidence.status === EvidenceStatus.QUARANTINED || evidence.scanStatus === EvidenceScanStatus.QUARANTINED) {
      showToast('Downloading quarantined evidence is blocked due to security scan policy', 'error');
      return;
    }
    try {
      const API_BASE_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001').replace(/\/+$/, '');
      const { accessToken } = getStoredTokens();
      const res = await fetch(`${API_BASE_URL}/evidence/${evidence.id}/download`, {
        headers: { Authorization: accessToken ? `Bearer ${accessToken}` : '' },
      });

      if (!res.ok) {
        if (res.status === 403) {
          throw new Error('Evidence file is quarantined or access forbidden.');
        }
        throw new Error('Download unauthorized or evidence unavailable.');
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = evidence.fileName;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      showToast('Evidence downloaded successfully');
    } catch (err: any) {
      showToast(err.message || 'Download failed', 'error');
    }
  };


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
    const code = mapping.frameworkCode || (mapping as any).frameworkReference?.frameworkVersion?.framework?.code;
    if (!code) {
      showToast('Cannot override mapping: target framework code is undefined.', 'error');
      return;
    }
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
        {canUseAiMapping ? (
          <button
            onClick={handleTriggerSuggestMappings}
            disabled={Boolean(activeJobId)}
            className="omni-btn-primary"
            style={{ display: 'flex', alignItems: 'center', gap: 8, background: activeJobId ? '#6E7A8A' : '#0F6E6A' }}
          >
            <Sparkles size={16} />
            {activeJobId ? 'Analyzing Control...' : 'Suggest Mappings (AI)'}
          </button>
        ) : (
          <div
            title="AI Control Mapping capability is not licensed for this organization"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed"
          >
            <Sparkles size={14} className="text-slate-300" />
            <span>AI Mapping (Unlicensed)</span>
          </div>
        )}
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

      {/* End-to-End Workflow Lifecycle & Next Actions */}
      <div style={{ marginBottom: 24 }}>
        <WorkflowLifecyclePanel
          resourceType="CONTROL"
          resourceId={controlId}
          collapsible={true}
          defaultExpanded={true}
          onNavigateView={onNavigateToView}
        />
      </div>

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

      {/* Mitigated Organizational Risks (Risk Associations) */}
      <div style={{ marginBottom: 16, marginTop: 36, borderTop: '1px solid #E2E6E4', paddingTop: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{
              width: 28, height: 28, borderRadius: 6, background: '#FCEFD9', color: '#8F5900',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <ShieldAlert size={15} />
            </div>
            <h2 style={{ fontSize: 16, fontWeight: 600, color: '#1B2430', margin: 0 }}>
              Mitigated Organizational Risks
            </h2>
            {canAccessRisks && (
              <span style={{
                fontSize: 11, background: '#EDEFED', color: '#5B6672',
                padding: '1px 8px', borderRadius: 10, fontWeight: 600,
              }}>
                {associatedRisks.length}
              </span>
            )}
          </div>
        </div>
        <p style={{ fontSize: 13, color: '#5B6672', marginBottom: 20 }}>
          Risks addressed and mitigated by this control. Associations establish bi-directional traceability across your GRC posture.
        </p>

        {!canAccessRisks ? (
          <div style={{
            background: '#FFFFFF', border: '1px dashed #D2D7D5', borderRadius: 10,
            padding: '24px', display: 'flex', alignItems: 'center', gap: 12, color: '#5B6672', fontSize: 13,
          }}>
            <Lock size={18} color="#8B95A1" />
            <div>
              <span style={{ fontWeight: 600, color: '#1B2430' }}>Risks Module Not Licensed</span>
              <p style={{ margin: '2px 0 0', fontSize: 12, color: '#8B95A1' }}>
                Viewing and associating organizational risks requires the <code>GRC_CORE_RISKS</code> capability.
              </p>
            </div>
          </div>
        ) : loadingRisks ? (
          <div style={{ padding: '24px', textAlign: 'center', color: '#8B95A1', fontSize: 13 }}>
            Loading associated risks...
          </div>
        ) : risksError ? (
          <div style={{
            padding: '12px 16px', background: '#F8E6E8', border: '1px solid #B23A48',
            borderRadius: 8, color: '#801F2B', fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <span>{risksError}</span>
            <button
              onClick={fetchAssociatedRisks}
              className="omni-btn-ghost"
              style={{ fontSize: 12, color: '#801F2B', borderColor: '#B23A48' }}
            >
              Retry
            </button>
          </div>
        ) : (
          <div>
            {associatedRisks.length === 0 ? (
              <div style={{
                background: '#FFFFFF', border: '1px dashed #D2D7D5', borderRadius: 10,
                padding: '32px 24px', textAlign: 'center', color: '#8B95A1', fontSize: 13, marginBottom: 20,
              }}>
                No organizational risks currently associated with this control.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
                {associatedRisks.map((ar) => {
                  const badge = getMitigationBadgeStyle(ar.mitigationType);
                  const scoreBandClass = ar.riskScoreBand === RiskScoreBand.HIGH
                    ? 'omni-badge-rose'
                    : ar.riskScoreBand === RiskScoreBand.MEDIUM
                    ? 'omni-badge-amber'
                    : 'omni-badge-teal';

                  return (
                    <div
                      key={ar.id}
                      style={{
                        background: '#FFFFFF', border: '1px solid #E2E6E4', borderRadius: 10,
                        padding: '16px 20px', boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
                        display: 'flex', flexDirection: 'column', gap: 10,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <span style={{ fontSize: 14, fontWeight: 600, color: '#1B2430' }}>
                            {ar.riskTitle}
                          </span>
                          <span className={scoreBandClass}>
                            Score: {ar.riskScore} ({ar.riskScoreBand})
                          </span>
                          <span style={{ fontSize: 11, background: '#F1F3F4', color: '#5F6368', padding: '2px 7px', borderRadius: 4, fontWeight: 500 }}>
                            {ar.riskStatus}
                          </span>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <span style={{
                            fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 4,
                            background: badge.bg, color: badge.color, border: `1px solid ${badge.border}`,
                          }}>
                            {badge.label}
                          </span>
                          {canMutateRiskControls && (
                            <button
                              onClick={() => handleUnlinkRisk(ar.riskId, ar.riskTitle)}
                              disabled={unlinkingRiskId === ar.riskId}
                              aria-label={`Unlink risk ${ar.riskTitle}`}
                              title="Disassociate risk"
                              style={{
                                background: 'none', border: 'none', color: '#B23A48', cursor: 'pointer',
                                padding: 4, borderRadius: 4, display: 'flex', alignItems: 'center',
                              }}
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12, color: '#5B6672', borderTop: '1px solid #F0F2F1', paddingTop: 8 }}>
                        <span>Owner: <strong style={{ color: '#1B2430' }}>{ar.riskOwner}</strong></span>
                        {ar.notes && (
                          <span style={{ fontStyle: 'italic', maxWidth: '60%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={ar.notes}>
                            Note: {ar.notes}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Associate New Risk Form */}
            {canMutateRiskControls ? (
              <div style={{
                background: '#F8F9FA', border: '1px solid #E2E6E4', borderRadius: 10,
                padding: '16px 20px', marginBottom: 28,
              }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#1B2430', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Plus size={14} color="#0F6E6A" /> Associate a Risk
                </div>

                {linkRiskError && (
                  <div style={{
                    padding: '8px 12px', background: '#F8E6E8', border: '1px solid #B23A48',
                    borderRadius: 6, color: '#801F2B', fontSize: 12, marginBottom: 12,
                  }}>
                    {linkRiskError}
                  </div>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 2fr auto', gap: 10, alignItems: 'center' }}>
                  <select
                    className="omni-input"
                    value={selectedRiskId}
                    onChange={(e) => setSelectedRiskId(e.target.value)}
                  >
                    <option value="">-- Select Risk to Mitigate --</option>
                    {availableRisks
                      .filter((r) => !associatedRisks.some((ar) => ar.riskId === r.id))
                      .map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.title} (Score: {r.likelihood * r.impact}, {r.status})
                        </option>
                      ))}
                  </select>

                  <select
                    className="omni-input"
                    value={selectedMitigationType}
                    onChange={(e) => setSelectedMitigationType(e.target.value as RiskControlMitigationType)}
                  >
                    <option value={RiskControlMitigationType.PREVENTATIVE}>Preventative</option>
                    <option value={RiskControlMitigationType.DETECTIVE}>Detective</option>
                    <option value={RiskControlMitigationType.CORRECTIVE}>Corrective</option>
                    <option value={RiskControlMitigationType.COMPENSATING}>Compensating</option>
                  </select>

                  <input
                    className="omni-input"
                    placeholder="Mitigation notes (optional)..."
                    value={mitigationNotes}
                    onChange={(e) => setMitigationNotes(e.target.value)}
                  />

                  <button
                    onClick={handleLinkRisk}
                    disabled={!selectedRiskId || linkingRisk}
                    className="omni-btn-primary"
                    style={{ display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}
                  >
                    <ShieldCheck size={14} />
                    {linkingRisk ? 'Associating...' : 'Associate Risk'}
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ fontSize: 12, color: '#8B95A1', fontStyle: 'italic', marginBottom: 28 }}>
                Risk associations are view-only under your current role or license status.
              </div>
            )}
          </div>
        )}
      </div>

      {/* ======================================================== */}
      {/* SECTION 4: COMPLIANCE EVIDENCE & PROOF ARTIFACTS         */}
      {/* ======================================================== */}
      <div style={{
        background: '#FFFFFF',
        border: '1px solid #E2E6E4',
        borderRadius: 12,
        padding: '24px 28px',
        marginTop: 24,
        boxShadow: '0 2px 6px rgba(0,0,0,0.02)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <FileArchive size={20} color="#0F6E6A" />
            <div>
              <h3 style={{ fontSize: 16, fontWeight: 700, color: '#1B2430', margin: 0 }}>
                Compliance Evidence & Proof Artifacts
              </h3>
              <p style={{ fontSize: 12, color: '#5B6672', margin: '2px 0 0' }}>
                Operational proof documents, logs, and configurations validating this control's implementation.
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {canMutateControlEvidence && (
              <button
                onClick={() => {
                  setShowUploadEvidenceModal(true);
                  setUploadEvidenceError(null);
                }}
                className="omni-btn-primary"
                style={{ fontSize: 12, height: 32, padding: '0 12px', display: 'flex', alignItems: 'center', gap: 6 }}
              >
                <Upload size={13} />
                Upload New Proof
              </button>
            )}
            <button
              onClick={fetchAssociatedEvidence}
              className="omni-btn-ghost"
              style={{ fontSize: 12, height: 32, padding: '0 10px', display: 'flex', alignItems: 'center', gap: 6 }}
              title="Refresh evidence list"
            >
              <RotateCw size={13} />
            </button>
          </div>
        </div>

        {/* Evidence Status Summary Bar */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '10px 14px',
          background: '#F8F9FA',
          borderRadius: 8,
          marginBottom: 18,
          fontSize: 12,
        }}>
          <span style={{ color: '#5B6672' }}>
            Attached Proof Files: <strong style={{ color: '#1B2430' }}>{associatedEvidence.length}</strong>
          </span>
          <span style={{ color: '#D2D7D5' }}>|</span>
          <span style={{ color: '#137333', display: 'flex', alignItems: 'center', gap: 4 }}>
            <FileCheck size={14} />
            Valid Compliance Proof: <strong>{associatedEvidence.filter((e) => e.isValidComplianceEvidence).length}</strong>
          </span>
          {associatedEvidence.some((e) => !e.isValidComplianceEvidence) && (
            <>
              <span style={{ color: '#D2D7D5' }}>|</span>
              <span style={{ color: '#801F2B', display: 'flex', alignItems: 'center', gap: 4, fontWeight: 600 }}>
                <AlertTriangle size={14} />
                Quarantined / Unclean: {associatedEvidence.filter((e) => !e.isValidComplianceEvidence).length}
              </span>
            </>
          )}
        </div>

        {/* Quarantine Security Banner (if any quarantined items exist) */}
        {associatedEvidence.some((e) => e.status === EvidenceStatus.QUARANTINED || e.scanStatus === EvidenceScanStatus.QUARANTINED) && (
          <div style={{
            background: '#FDF2F2',
            border: '1px solid #F8B4B4',
            borderRadius: 8,
            padding: '12px 16px',
            marginBottom: 18,
            display: 'flex',
            alignItems: 'flex-start',
            gap: 10,
            color: '#9B1C1C',
            fontSize: 12,
          }}>
            <ShieldAlert size={18} style={{ flexShrink: 0, marginTop: 1 }} />
            <div>
              <strong>Security Policy Alert: Quarantined Proof Detected</strong>
              <div style={{ marginTop: 2, color: '#771D1D' }}>
                One or more files attached to this control failed malware verification. Quarantined files are excluded from compliance scoring, blocked from binary download, and block approval workflows.
              </div>
            </div>
          </div>
        )}

        {loadingEvidence ? (
          <div style={{ padding: '24px', textAlign: 'center', color: '#8B95A1', fontSize: 13 }}>
            Loading associated compliance evidence...
          </div>
        ) : evidenceError ? (
          <div style={{
            padding: '12px 16px', background: '#F8E6E8', border: '1px solid #B23A48',
            borderRadius: 8, color: '#801F2B', fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <span>{evidenceError}</span>
            <button
              onClick={fetchAssociatedEvidence}
              className="omni-btn-ghost"
              style={{ fontSize: 12, color: '#801F2B', borderColor: '#B23A48' }}
            >
              Retry
            </button>
          </div>
        ) : (
          <div>
            {associatedEvidence.length === 0 ? (
              <div style={{
                background: '#FFFFFF', border: '1px dashed #D2D7D5', borderRadius: 10,
                padding: '32px 24px', textAlign: 'center', color: '#8B95A1', fontSize: 13, marginBottom: 20,
              }}>
                No compliance proof documents or artifacts currently attached to this control.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
                {associatedEvidence.map((ev) => {
                  const scanBadge = getEvidenceScanBadgeStyle(ev.scanStatus, ev.status);
                  const isQuarantined = ev.status === EvidenceStatus.QUARANTINED || ev.scanStatus === EvidenceScanStatus.QUARANTINED;

                  return (
                    <div
                      key={ev.id}
                      style={{
                        background: '#FFFFFF',
                        border: isQuarantined ? '1px solid #F8B4B4' : '1px solid #E2E6E4',
                        borderRadius: 10,
                        padding: '16px 20px',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 10,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <FileText size={18} color={isQuarantined ? '#B23A48' : '#0F6E6A'} />
                          <div>
                            <span style={{ fontSize: 14, fontWeight: 600, color: '#1B2430' }}>
                              {ev.title}
                            </span>
                            <span style={{ fontSize: 12, color: '#5B6672', marginLeft: 8 }}>
                              ({ev.fileName} • {formatFileSize(ev.fileSize)})
                            </span>
                          </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{
                            fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 4,
                            background: scanBadge.bg, color: scanBadge.color, border: `1px solid ${scanBadge.border}`,
                          }}>
                            {scanBadge.label}
                          </span>

                          <span style={{
                            fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 4,
                            background: ev.isValidComplianceEvidence ? '#E6F4EA' : '#F1F3F4',
                            color: ev.isValidComplianceEvidence ? '#137333' : '#5F6368',
                            border: ev.isValidComplianceEvidence ? '1px solid #CEEAD6' : '1px solid #DADCE0',
                          }}>
                            {ev.isValidComplianceEvidence ? 'Compliance Verified' : 'Unclean / Excluded'}
                          </span>

                          {/* Download Button */}
                          <button
                            onClick={() => handleDownloadEvidence(ev)}
                            disabled={isQuarantined}
                            title={isQuarantined ? 'Download blocked due to malware quarantine policy' : 'Download evidence file'}
                            style={{
                              background: 'none',
                              border: 'none',
                              color: isQuarantined ? '#9AA0A6' : '#0F6E6A',
                              cursor: isQuarantined ? 'not-allowed' : 'pointer',
                              padding: 4,
                              borderRadius: 4,
                              display: 'flex',
                              alignItems: 'center',
                            }}
                          >
                            {isQuarantined ? <Lock size={15} /> : <Download size={15} />}
                          </button>

                          {/* Detach Button */}
                          {canMutateControlEvidence && (
                            <button
                              onClick={() => handleDetachEvidence(ev.evidenceId, ev.title)}
                              disabled={detachingEvidenceId === ev.evidenceId}
                              aria-label={`Detach evidence ${ev.title}`}
                              title="Detach evidence from control (preserves file in vault)"
                              style={{
                                background: 'none',
                                border: 'none',
                                color: '#B23A48',
                                cursor: 'pointer',
                                padding: 4,
                                borderRadius: 4,
                                display: 'flex',
                                alignItems: 'center',
                              }}
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12, color: '#5B6672', borderTop: '1px solid #F0F2F1', paddingTop: 8 }}>
                        <span>Uploaded by: <strong style={{ color: '#1B2430' }}>{ev.uploaderName || 'Unknown'}</strong> • Attached: {new Date(ev.attachedAt).toLocaleDateString()}</span>
                        {ev.description && (
                          <span style={{ fontStyle: 'italic', maxWidth: '50%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={ev.description}>
                            {ev.description}
                          </span>
                        )}
                        {ev.checksum && (
                          <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#8B95A1' }} title={`SHA-256 Checksum: ${ev.checksum}`}>
                            SHA-256: {ev.checksum.substring(0, 12)}...
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Attach Existing Evidence from Vault Form */}
            {canMutateControlEvidence ? (
              <div style={{
                background: '#F8F9FA', border: '1px solid #E2E6E4', borderRadius: 10,
                padding: '16px 20px', marginBottom: 12,
              }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#1B2430', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Plus size={14} color="#0F6E6A" /> Attach Proof from Vault
                </div>

                {attachEvidenceError && (
                  <div style={{
                    padding: '8px 12px', background: '#F8E6E8', border: '1px solid #B23A48',
                    borderRadius: 6, color: '#801F2B', fontSize: 12, marginBottom: 12,
                  }}>
                    {attachEvidenceError}
                  </div>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 10, alignItems: 'center' }}>
                  <select
                    className="omni-input"
                    value={selectedEvidenceIdToAttach}
                    onChange={(e) => setSelectedEvidenceIdToAttach(e.target.value)}
                  >
                    <option value="">-- Select Existing Vault Proof Artifact --</option>
                    {availableVaultEvidence
                      .filter((v) => !associatedEvidence.some((ae) => ae.evidenceId === v.id))
                      .map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.title} ({v.fileName} • {v.evidenceType} • {v.scanStatus})
                        </option>
                      ))}
                  </select>

                  <button
                    onClick={handleAttachEvidence}
                    disabled={!selectedEvidenceIdToAttach || attachingEvidence}
                    className="omni-btn-primary"
                    style={{ display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}
                  >
                    <FileCheck size={14} />
                    {attachingEvidence ? 'Attaching...' : 'Attach Proof'}
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ fontSize: 12, color: '#8B95A1', fontStyle: 'italic', marginBottom: 12 }}>
                Evidence attachments are view-only under your current role, organization state, or license entitlement.
              </div>
            )}
          </div>
        )}
      </div>

      {/* ======================================================== */}
      {/* SECTION 5: OPERATIONAL CONTROL TESTING & AUDIT EXECUTIONS */}
      {/* ======================================================== */}
      <ControlTestingSection
        controlId={controlId}
        controlName={control.name}
        controlDescription={control.description}
      />

      {/* ======================================================== */}
      {/* MODAL: DIRECT EVIDENCE UPLOAD & ATTACH                  */}
      {/* ======================================================== */}
      {showUploadEvidenceModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: 20,
        }}>
          <div style={{
            background: '#FFFFFF',
            borderRadius: 12,
            width: '100%',
            maxWidth: 520,
            padding: 24,
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Upload size={18} color="#0F6E6A" />
                <h3 style={{ fontSize: 16, fontWeight: 700, color: '#1B2430', margin: 0 }}>
                  Upload & Attach Compliance Proof
                </h3>
              </div>
              <button
                onClick={() => setShowUploadEvidenceModal(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#5B6672' }}
              >
                <X size={18} />
              </button>
            </div>

            <p style={{ fontSize: 12, color: '#5B6672', margin: '0 0 16px' }}>
              Upload proof artifacts (PDF, spreadsheet, screenshot, or configuration export). The file will be SHA-256 verified, scanned for malware, and directly attached to this control.
            </p>

            {uploadEvidenceError && (
              <div style={{
                padding: '8px 12px', background: '#F8E6E8', border: '1px solid #B23A48',
                borderRadius: 6, color: '#801F2B', fontSize: 12, marginBottom: 14,
              }}>
                {uploadEvidenceError}
              </div>
            )}

            <form onSubmit={handleUploadNewEvidence} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#1B2430', marginBottom: 4 }}>
                  Select Proof File *
                </label>
                <input
                  type="file"
                  required
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      const file = e.target.files[0];
                      setUploadFile(file);
                      if (!uploadTitle) {
                        setUploadTitle(file.name.replace(/\.[^/.]+$/, ''));
                      }
                    }
                  }}
                  className="omni-input"
                  style={{ padding: '6px' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#1B2430', marginBottom: 4 }}>
                  Evidence Title *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Q3 SOC 2 Type II Final Report"
                  value={uploadTitle}
                  onChange={(e) => setUploadTitle(e.target.value)}
                  className="omni-input"
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#1B2430', marginBottom: 4 }}>
                  Evidence Classification
                </label>
                <select
                  value={uploadEvidenceType}
                  onChange={(e) => setUploadEvidenceType(e.target.value as EvidenceType)}
                  className="omni-input"
                >
                  <option value={EvidenceType.DOCUMENT}>Document (PDF, Word, Text)</option>
                  <option value={EvidenceType.SPREADSHEET}>Spreadsheet (Excel, CSV)</option>
                  <option value={EvidenceType.IMAGE}>Image / Screenshot</option>
                  <option value={EvidenceType.CONFIG_EXPORT}>Configuration Export (JSON, YAML)</option>
                  <option value={EvidenceType.SYSTEM_LOG}>System Log / Audit Trail</option>
                  <option value={EvidenceType.CERTIFICATE}>Certificate</option>
                  <option value={EvidenceType.OTHER}>Other Artifact</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#1B2430', marginBottom: 4 }}>
                  Description (Optional)
                </label>
                <textarea
                  rows={2}
                  placeholder="Notes explaining how this file demonstrates control effectiveness..."
                  value={uploadDescription}
                  onChange={(e) => setUploadDescription(e.target.value)}
                  className="omni-input"
                  style={{ resize: 'vertical' }}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
                <button
                  type="button"
                  onClick={() => setShowUploadEvidenceModal(false)}
                  className="omni-btn-ghost"
                  style={{ fontSize: 13 }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!uploadFile || !uploadTitle.trim() || uploadingEvidence}
                  className="omni-btn-primary"
                  style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}
                >
                  <Upload size={14} />
                  {uploadingEvidence ? 'Uploading & Scanning...' : 'Upload & Attach'}
                </button>
              </div>
            </form>
          </div>
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
