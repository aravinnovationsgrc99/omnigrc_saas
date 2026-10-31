'use client';

import React, { useState, useEffect } from 'react';
import {
  Building2,
  X,
  Shield,
  FileText,
  AlertTriangle,
  CheckCircle2,
  Calendar,
  ExternalLink,
  ClipboardList,
  Upload,
  Download,
  Trash2,
  Check,
  Ban,
  Clock,
  RotateCcw,
  Archive,
  ArrowRight,
  TrendingDown,
  ShieldAlert,
  Percent,
  Layers,
  Search,
  Paperclip,
} from 'lucide-react';
import {
  VendorDto,
  VendorDocumentDto,
  VendorCriticality,
  VendorStatus,
} from '@omnigrc/shared';
import { apiRequest, getStoredTokens } from '@/lib/api-client';
import { useToast } from '@/context/toast-context';

const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_URL ||
  (process.env.NODE_ENV === 'production' ? 'https://api.omnigrc.co' : 'http://localhost:3001')
).replace(/\/+$/, '');

const ALLOWED_EXTENSIONS = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'csv'];
const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024;

interface VendorTprmWorkspaceModalProps {
  vendor: VendorDto;
  initialTab?: string;
  onClose: () => void;
  onUpdated: () => void;
}

export function VendorTprmWorkspaceModal({
  vendor: initialVendor,
  initialTab = 'overview',
  onClose,
  onUpdated,
}: VendorTprmWorkspaceModalProps) {
  const { addToast } = useToast();
  const [vendor, setVendor] = useState<VendorDto>(initialVendor);
  const [activeTab, setActiveTab] = useState<string>(initialTab);
  const [loading, setLoading] = useState(false);

  // Tab 2: Inherent Risk Calculator State
  const [dataSensitivity, setDataSensitivity] = useState(70);
  const [systemAccess, setSystemAccess] = useState(60);
  const [businessCriticality, setBusinessCriticality] = useState(80);
  const [dataVolume, setDataVolume] = useState(50);
  const [financialExposure, setFinancialExposure] = useState(40);
  const [regulatoryExposure, setRegulatoryExposure] = useState(70);
  const [subcontractorReliance, setSubcontractorReliance] = useState(40);
  const [inherentRiskNotes, setInherentRiskNotes] = useState('');
  const [evaluatingInherent, setEvaluatingInherent] = useState(false);

  // Tab 3: Due Diligence State
  const [triggeringDueDiligence, setTriggeringDueDiligence] = useState(false);
  const [selectedTemplateKey, setSelectedTemplateKey] = useState('');
  const [questionnaireSubmissions, setQuestionnaireSubmissions] = useState<any[]>([]);
  const [loadingSubmissions, setLoadingSubmissions] = useState(false);
  const [reviewingSubId, setReviewingSubId] = useState<string | null>(null);

  // Tab 4: Documents State
  const [documents, setDocuments] = useState<VendorDocumentDto[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [docFile, setDocFile] = useState<File | null>(null);
  const [docType, setDocType] = useState('SOC 2 Type II');
  const [docDescription, setDocDescription] = useState('');
  const [docExpiryDate, setDocExpiryDate] = useState('');
  const [verifyingDocId, setVerifyingDocId] = useState<string | null>(null);

  // Tab 5: Residual Risk State
  const [evaluatingResidual, setEvaluatingResidual] = useState(false);

  // Tab 6: Remediation Findings State
  const [assessments, setAssessments] = useState<any[]>([]);
  const [selectedAssessmentId, setSelectedAssessmentId] = useState<string>('');
  const [actions, setActions] = useState<any[]>([]);
  const [loadingActions, setLoadingActions] = useState(false);
  const [newActionTitle, setNewActionTitle] = useState('');
  const [newActionOwner, setNewActionOwner] = useState('');
  const [newActionDueDate, setNewActionDueDate] = useState('');
  const [newActionSeverity, setNewActionSeverity] = useState('HIGH');
  const [creatingAction, setCreatingAction] = useState(false);
  const [verifyingActionId, setVerifyingActionId] = useState<string | null>(null);

  // Tab 7: Approval State
  const [approverName, setApproverName] = useState('Chief Information Security Officer');
  const [approvalDecision, setApprovalDecision] = useState<'APPROVED' | 'CONDITIONALLY_APPROVED' | 'REJECTED'>('APPROVED');
  const [approvalNotes, setApprovalNotes] = useState('');
  const [submittingApproval, setSubmittingApproval] = useState(false);
  const [triggeringReassessment, setTriggeringReassessment] = useState(false);

  // Tab 8: Offboarding State
  const [checklistAccessRevoked, setChecklistAccessRevoked] = useState(false);
  const [checklistDataDestroyed, setChecklistDataDestroyed] = useState(false);
  const [checklistContractTerminated, setChecklistContractTerminated] = useState(false);
  const [checklistAuditArchived, setChecklistAuditArchived] = useState(false);
  const [offboardingReason, setOffboardingReason] = useState('Contract Expiration / Non-Renewal');
  const [offboardingNotes, setOffboardingNotes] = useState('');
  const [submittingOffboarding, setSubmittingOffboarding] = useState(false);

  useEffect(() => {
    refreshVendorDetails();
    fetchDocuments();
  }, [initialVendor.id]);

  async function refreshVendorDetails() {
    setLoading(true);
    try {
      const data = await apiRequest<VendorDto>(`/vendors/${initialVendor.id}`);
      setVendor(data);
      if (data.assessments && data.assessments.length > 0) {
        setAssessments(data.assessments);
        if (!selectedAssessmentId) {
          setSelectedAssessmentId(data.assessments[0].id);
          fetchActions(data.assessments[0].id);
        }
      }
      fetchSubmissions();
    } catch {
      // fallback
    } finally {
      setLoading(false);
    }
  }

  async function fetchDocuments() {
    setLoadingDocs(true);
    try {
      const res = await apiRequest<{ items: VendorDocumentDto[] }>(`/vendors/${initialVendor.id}/documents`);
      setDocuments(res.items || []);
    } catch {
      setDocuments([]);
    } finally {
      setLoadingDocs(false);
    }
  }

  async function fetchSubmissions() {
    setLoadingSubmissions(true);
    try {
      const subs = await apiRequest<any[]>(`/vendors/${initialVendor.id}/questionnaires/submissions`);
      setQuestionnaireSubmissions(subs || []);
    } catch {
      setQuestionnaireSubmissions([]);
    } finally {
      setLoadingSubmissions(false);
    }
  }

  async function fetchActions(assessmentId: string) {
    if (!assessmentId) return;
    setLoadingActions(true);
    try {
      const acts = await apiRequest<any[]>(`/vendors/${initialVendor.id}/assessments/${assessmentId}/actions`);
      setActions(acts || []);
    } catch {
      setActions([]);
    } finally {
      setLoadingActions(false);
    }
  }

  // --- Handlers ---

  async function handleEvaluateInherentRisk() {
    setEvaluatingInherent(true);
    try {
      const res = await apiRequest<any>(`/vendors/${vendor.id}/inherent-risk`, {
        method: 'POST',
        body: JSON.stringify({
          dataSensitivity: Number(dataSensitivity),
          systemAccess: Number(systemAccess),
          businessCriticality: Number(businessCriticality),
          dataVolume: Number(dataVolume),
          financialExposure: Number(financialExposure),
          regulatoryExposure: Number(regulatoryExposure),
          subcontractorReliance: Number(subcontractorReliance),
          notes: inherentRiskNotes || undefined,
        }),
      });
      addToast(
        `Inherent risk computed: Score ${res.score} (${res.tier} Tier). Review cadence: ${res.reviewCadenceDays} days.`,
        'success'
      );
      await refreshVendorDetails();
      onUpdated();
      setActiveTab('due-diligence');
    } catch (err: any) {
      addToast(`Failed to evaluate inherent risk: ${err.message}`, 'error');
    } finally {
      setEvaluatingInherent(false);
    }
  }

  async function handleTriggerDueDiligence() {
    setTriggeringDueDiligence(true);
    try {
      const res = await apiRequest<any>(`/vendors/${vendor.id}/trigger-due-diligence`, {
        method: 'POST',
        body: JSON.stringify({
          templateKey: selectedTemplateKey || undefined,
        }),
      });
      addToast(
        `Due Diligence initiated with template "${res.questionnaire?.title || 'TPRM Questionnaire'}".`,
        'success'
      );
      await refreshVendorDetails();
      onUpdated();
    } catch (err: any) {
      addToast(`Failed to trigger due diligence: ${err.message}`, 'error');
    } finally {
      setTriggeringDueDiligence(false);
    }
  }

  async function handleReviewSubmission(subId: string, status: string) {
    setReviewingSubId(subId);
    try {
      await apiRequest(`/vendors/${vendor.id}/questionnaires/submissions/${subId}/review`, {
        method: 'PATCH',
        body: JSON.stringify({
          status,
          score: status === 'ACCEPTED' ? 90 : 35,
          reviewNotes:
            status === 'ACCEPTED'
              ? 'Security answers verified and aligned with enterprise security baseline.'
              : 'Deficiencies identified. Revisions or additional evidence requested.',
        }),
      });
      addToast(`Questionnaire submission marked as ${status}.`, 'success');
      fetchSubmissions();
      refreshVendorDetails();
      onUpdated();
    } catch (err: any) {
      addToast(`Failed to review submission: ${err.message}`, 'error');
    } finally {
      setReviewingSubId(null);
    }
  }

  async function handleUploadDocument(e: React.FormEvent) {
    e.preventDefault();
    if (!docFile) {
      addToast('Please select a file to upload.', 'error');
      return;
    }
    const ext = docFile.name.split('.').pop()?.toLowerCase() || '';
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      addToast(`Unsupported file type (.${ext}).`, 'error');
      return;
    }
    if (docFile.size > MAX_FILE_SIZE_BYTES) {
      addToast('File exceeds 25MB limit.', 'error');
      return;
    }

    setUploadingDoc(true);
    try {
      const formData = new FormData();
      formData.append('file', docFile);
      if (docDescription.trim()) {
        formData.append('description', `[${docType}] ${docDescription.trim()}`);
      } else {
        formData.append('description', `[${docType}]`);
      }

      await apiRequest(`/vendors/${vendor.id}/documents`, {
        method: 'POST',
        body: formData,
      });

      addToast(`Document "${docFile.name}" attached successfully.`, 'success');
      setDocFile(null);
      setDocDescription('');
      setDocExpiryDate('');
      fetchDocuments();
      refreshVendorDetails();
      onUpdated();
    } catch (err: any) {
      addToast(`Upload failed: ${err.message}`, 'error');
    } finally {
      setUploadingDoc(false);
    }
  }

  async function handleVerifyDocument(evidenceId: string, verificationStatus: 'VERIFIED' | 'REJECTED') {
    let rejectionReason: string | undefined = undefined;
    if (verificationStatus === 'REJECTED') {
      const input = window.prompt('Please provide the reason for document rejection:');
      if (!input || !input.trim()) {
        addToast('Rejection reason is required.', 'error');
        return;
      }
      rejectionReason = input.trim();
    }

    setVerifyingDocId(evidenceId);
    try {
      await apiRequest(`/vendors/${vendor.id}/documents/${evidenceId}/verify`, {
        method: 'PATCH',
        body: JSON.stringify({
          verificationStatus,
          documentType: docType,
          expirationDate: docExpiryDate ? new Date(docExpiryDate).toISOString() : undefined,
          reviewerNotes: `Reviewed by compliance officer on ${new Date().toLocaleDateString()}`,
          rejectionReason,
        }),
      });
      addToast(`Document status updated to ${verificationStatus}.`, 'success');
      fetchDocuments();
      refreshVendorDetails();
      onUpdated();
    } catch (err: any) {
      addToast(`Failed to update document: ${err.message}`, 'error');
    } finally {
      setVerifyingDocId(null);
    }
  }

  async function handleDownloadDoc(doc: VendorDocumentDto) {
    try {
      const { accessToken } = getStoredTokens();
      const res = await fetch(`${API_BASE_URL}/vendors/${vendor.id}/documents/${doc.evidenceId}/download`, {
        headers: { ...(accessToken && { Authorization: `Bearer ${accessToken}` }) },
      });
      if (!res.ok) throw new Error('Download failed');
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = doc.fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      addToast(`Download failed: ${err.message}`, 'error');
    }
  }

  async function handleDeleteDoc(evidenceId: string) {
    if (!window.confirm('Delete this compliance document?')) return;
    try {
      await apiRequest(`/vendors/${vendor.id}/documents/${evidenceId}`, { method: 'DELETE' });
      addToast('Document deleted.', 'success');
      fetchDocuments();
      refreshVendorDetails();
      onUpdated();
    } catch (err: any) {
      addToast(`Delete failed: ${err.message}`, 'error');
    }
  }

  async function handleCalculateResidualRisk() {
    setEvaluatingResidual(true);
    try {
      const res = await apiRequest<any>(`/vendors/${vendor.id}/residual-risk`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      addToast(
        `Residual risk evaluated: Score ${res.residualRiskScore} (${res.residualRiskTier}). Control effectiveness: ${res.controlEffectivenessScore}%.`,
        'success'
      );
      await refreshVendorDetails();
      onUpdated();
      setActiveTab('approval');
    } catch (err: any) {
      addToast(`Failed to calculate residual risk: ${err.message}`, 'error');
    } finally {
      setEvaluatingResidual(false);
    }
  }

  async function handleCreateAction(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedAssessmentId || !newActionTitle.trim() || !newActionOwner.trim()) return;
    setCreatingAction(true);
    try {
      await apiRequest(`/vendors/${vendor.id}/assessments/${selectedAssessmentId}/actions`, {
        method: 'POST',
        body: JSON.stringify({
          title: `[${newActionSeverity}] ${newActionTitle.trim()}`,
          owner: newActionOwner.trim(),
          dueDate: newActionDueDate ? new Date(newActionDueDate).toISOString() : undefined,
          status: 'OPEN',
        }),
      });
      addToast('Remediation finding created.', 'success');
      setNewActionTitle('');
      setNewActionOwner('');
      setNewActionDueDate('');
      fetchActions(selectedAssessmentId);
      refreshVendorDetails();
      onUpdated();
    } catch (err: any) {
      addToast(`Failed to create finding: ${err.message}`, 'error');
    } finally {
      setCreatingAction(false);
    }
  }

  async function handleVerifyAction(actionId: string, decision: 'VERIFY_RESOLVED' | 'REJECT_REOPEN') {
    let rejectionReason: string | undefined = undefined;
    if (decision === 'REJECT_REOPEN') {
      const reason = window.prompt('Specify deficiency or why evidence was rejected:');
      if (!reason || !reason.trim()) {
        addToast('Feedback reason is required to reject remediation.', 'error');
        return;
      }
      rejectionReason = reason.trim();
    }

    setVerifyingActionId(actionId);
    try {
      await apiRequest(
        `/vendors/${vendor.id}/assessments/${selectedAssessmentId}/actions/${actionId}/verify`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            decision,
            verificationNotes:
              decision === 'VERIFY_RESOLVED'
                ? 'Remediation verified by compliance officer. Controls confirmed operational.'
                : rejectionReason,
            rejectionReason,
          }),
        }
      );
      addToast(
        decision === 'VERIFY_RESOLVED'
          ? 'Finding marked RESOLVED and closed.'
          : 'Remediation rejected with feedback and reopened to IN_PROGRESS.',
        'success'
      );
      fetchActions(selectedAssessmentId);
      refreshVendorDetails();
      onUpdated();
    } catch (err: any) {
      addToast(`Action verification failed: ${err.message}`, 'error');
    } finally {
      setVerifyingActionId(null);
    }
  }

  async function handleApproveRelationship() {
    setSubmittingApproval(true);
    try {
      await apiRequest(`/vendors/${vendor.id}/approve-relationship`, {
        method: 'POST',
        body: JSON.stringify({
          decision: approvalDecision,
          approverName: approverName.trim() || 'CISO',
          notes: approvalNotes.trim() || 'Vendor formal risk sign-off executed.',
        }),
      });
      addToast(`Vendor relationship signed off as ${approvalDecision}.`, 'success');
      await refreshVendorDetails();
      onUpdated();
    } catch (err: any) {
      addToast(`Approval failed: ${err.message}`, 'error');
    } finally {
      setSubmittingApproval(false);
    }
  }

  async function handleTriggerReassessment() {
    setTriggeringReassessment(true);
    try {
      await apiRequest(`/vendors/${vendor.id}/trigger-reassessment`, {
        method: 'POST',
        body: JSON.stringify({
          reason: 'Periodic review cadence reached. Updating third-party risk evaluation.',
        }),
      });
      addToast('Periodic reassessment cycle initiated.', 'success');
      await refreshVendorDetails();
      onUpdated();
    } catch (err: any) {
      addToast(`Failed to trigger reassessment: ${err.message}`, 'error');
    } finally {
      setTriggeringReassessment(false);
    }
  }

  async function handleExecuteOffboarding() {
    if (
      !checklistAccessRevoked ||
      !checklistDataDestroyed ||
      !checklistContractTerminated ||
      !checklistAuditArchived
    ) {
      addToast('All 4 decommissioning checklist items must be verified before offboarding.', 'error');
      return;
    }

    setSubmittingOffboarding(true);
    try {
      await apiRequest(`/vendors/${vendor.id}/offboard`, {
        method: 'POST',
        body: JSON.stringify({
          reason: offboardingReason,
          notes: offboardingNotes.trim() || 'Vendor decommissioned and all access revoked.',
          accessRevoked: checklistAccessRevoked,
          dataDestroyedOrReturned: checklistDataDestroyed,
          contractTerminated: checklistContractTerminated,
          auditArchived: checklistAuditArchived,
        }),
      });
      addToast(`Vendor "${vendor.name}" has been decommissioned.`, 'success');
      await refreshVendorDetails();
      onUpdated();
    } catch (err: any) {
      addToast(`Failed to offboard vendor: ${err.message}`, 'error');
    } finally {
      setSubmittingOffboarding(false);
    }
  }

  const currentStage = vendor.dueDiligenceStatus || (vendor.tprmData as any)?.lifecycleStage || 'DRAFT';
  const isDecommissioned = currentStage === 'DECOMMISSIONED';

  const lifecycleTabs = [
    { id: 'overview', label: '1. Overview & Intake' },
    { id: 'inherent-risk', label: '2. Inherent Risk' },
    { id: 'due-diligence', label: '3. Due Diligence' },
    { id: 'documents', label: `4. Documents (${documents.length})` },
    { id: 'residual-risk', label: '5. Risk Evaluation' },
    { id: 'remediation', label: `6. Remediation (${actions.length})` },
    { id: 'approval', label: '7. Approval & Monitoring' },
    { id: 'offboarding', label: '8. Offboarding' },
  ];

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-60 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4"
    >
      <div className="bg-white rounded-xl max-w-5xl w-full shadow-2xl max-h-[94dvh] flex flex-col border border-slate-200 overflow-hidden">
        {/* Modal Header */}
        <div className="px-5 sm:px-6 py-4 border-b border-slate-200 bg-slate-50/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Building2 className="w-5 h-5 text-teal-700 shrink-0" />
              <h2 className="text-base sm:text-lg font-bold text-slate-900">{vendor.name}</h2>
              {vendor.websiteUrl && (
                <a
                  href={vendor.websiteUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-slate-400 hover:text-teal-700"
                  title="Visit Website"
                >
                  <ExternalLink size={13} />
                </a>
              )}
              {/* Lifecycle Stage Badge */}
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                  isDecommissioned
                    ? 'bg-slate-200 text-slate-700'
                    : currentStage === 'APPROVED' || currentStage === 'ACTIVE_MONITORING'
                    ? 'bg-emerald-100 text-emerald-800'
                    : currentStage === 'DUE_DILIGENCE' || currentStage === 'INHERENT_RISK_ASSESSED'
                    ? 'bg-blue-100 text-blue-800'
                    : 'bg-amber-100 text-amber-800'
                }`}
              >
                {currentStage}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Enterprise Third-Party Risk Management (TPRM) Lifecycle Workspace
            </p>
          </div>

          {/* Quick Metrics Pills */}
          <div className="flex items-center gap-2">
            <div className="bg-white border border-slate-200 rounded-lg px-2.5 py-1 text-center shadow-xs">
              <span className="text-[9px] text-slate-400 uppercase block font-semibold">Inherent Tier</span>
              <span
                className={`text-xs font-bold ${
                  vendor.inherentRiskTier === 'CRITICAL'
                    ? 'text-rose-600'
                    : vendor.inherentRiskTier === 'HIGH'
                    ? 'text-orange-600'
                    : 'text-teal-700'
                }`}
              >
                {vendor.inherentRiskTier || vendor.criticality || 'PENDING'}
                {vendor.inherentRiskScore !== undefined ? ` (${vendor.inherentRiskScore})` : ''}
              </span>
            </div>

            <div className="bg-white border border-slate-200 rounded-lg px-2.5 py-1 text-center shadow-xs">
              <span className="text-[9px] text-slate-400 uppercase block font-semibold">Residual Risk</span>
              <span
                className={`text-xs font-bold ${
                  vendor.residualRiskTier === 'CRITICAL'
                    ? 'text-rose-600'
                    : vendor.residualRiskTier === 'HIGH'
                    ? 'text-orange-600'
                    : vendor.residualRiskTier
                    ? 'text-emerald-700'
                    : 'text-slate-500'
                }`}
              >
                {vendor.residualRiskTier || 'PENDING'}
                {vendor.residualRiskScore !== undefined ? ` (${vendor.residualRiskScore})` : ''}
              </span>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition-colors ml-1"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Horizontal Navigation Stepper */}
        <div className="flex border-b border-slate-200 bg-slate-50 px-3 sm:px-6 overflow-x-auto text-xs font-semibold shrink-0">
          {lifecycleTabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`py-2.5 px-3 border-b-2 whitespace-nowrap transition-colors flex items-center gap-1.5 ${
                  isActive
                    ? 'border-teal-700 text-teal-800 font-bold bg-white'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Modal Scrollable Body */}
        <div className="p-5 sm:p-6 overflow-y-auto omni-scroll flex-1 space-y-6">
          {/* TAB 1: OVERVIEW & INTAKE */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-slate-50 border border-slate-200 p-3.5 rounded-xl">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">
                    Category
                  </span>
                  <span className="text-sm font-semibold text-slate-800">{vendor.category || 'General'}</span>
                </div>
                <div className="bg-slate-50 border border-slate-200 p-3.5 rounded-xl">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">
                    Internal Owner
                  </span>
                  <span className="text-sm font-semibold text-slate-800">{vendor.owner || 'Security Team'}</span>
                </div>
                <div className="bg-slate-50 border border-slate-200 p-3.5 rounded-xl">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">
                    Review Cadence
                  </span>
                  <span className="text-sm font-semibold text-slate-800">
                    {vendor.reviewCadenceDays ? `${vendor.reviewCadenceDays} Days` : '365 Days'}
                  </span>
                </div>
                <div className="bg-slate-50 border border-slate-200 p-3.5 rounded-xl">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">
                    Next Due Date
                  </span>
                  <span className="text-sm font-semibold text-slate-800">
                    {vendor.nextReviewDate ? new Date(vendor.nextReviewDate).toLocaleDateString() : 'Pending'}
                  </span>
                </div>
              </div>

              {/* Enterprise Intake Details Card */}
              <div className="border border-slate-200 rounded-xl p-4 bg-white shadow-xs space-y-4">
                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                  <Shield className="w-4 h-4 text-teal-700" />
                  <span>Enterprise Security & Data Profile</span>
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                  <div>
                    <span className="font-semibold text-slate-500 block mb-0.5">Data Classification</span>
                    <span className="inline-block px-2 py-0.5 rounded bg-blue-50 text-blue-800 font-bold border border-blue-200">
                      {(vendor.tprmData as any)?.intake?.dataClassification || 'CONFIDENTIAL'}
                    </span>
                  </div>
                  <div>
                    <span className="font-semibold text-slate-500 block mb-0.5">System Access Level</span>
                    <span className="inline-block px-2 py-0.5 rounded bg-slate-100 text-slate-800 font-bold border border-slate-200">
                      {(vendor.tprmData as any)?.intake?.systemAccessLevel || 'READ_ONLY'}
                    </span>
                  </div>
                  <div>
                    <span className="font-semibold text-slate-500 block mb-0.5">4th-Party Reliance</span>
                    <span className="inline-block px-2 py-0.5 rounded bg-amber-50 text-amber-800 font-bold border border-amber-200">
                      {(vendor.tprmData as any)?.intake?.subcontractorReliance || 'LOW'}
                    </span>
                  </div>
                </div>

                <div>
                  <span className="font-semibold text-slate-500 text-xs block mb-1">
                    Countries of Operation / Data Hosting
                  </span>
                  <p className="text-xs text-slate-700 bg-slate-50 p-2 rounded border border-slate-200">
                    {Array.isArray((vendor.tprmData as any)?.intake?.countriesOfOperation)
                      ? (vendor.tprmData as any)?.intake?.countriesOfOperation.join(', ')
                      : 'United States, India'}
                  </p>
                </div>

                <div>
                  <span className="font-semibold text-slate-500 text-xs block mb-1">
                    Business Purpose & Scope
                  </span>
                  <p className="text-xs text-slate-700 bg-slate-50 p-2.5 rounded border border-slate-200 leading-relaxed">
                    {(vendor.tprmData as any)?.intake?.businessPurpose ||
                      vendor.description ||
                      'Operational SaaS integration for cloud infrastructure compliance and logging.'}
                  </p>
                </div>
              </div>

              {/* Progress Callout */}
              <div className="p-4 bg-teal-50/60 border border-teal-200 rounded-xl flex items-center justify-between gap-4">
                <div className="text-xs text-teal-900">
                  <span className="font-bold block mb-0.5">Next Recommended Stage</span>
                  <span>
                    Proceed to <strong>2. Inherent Risk Assessment</strong> to compute the objective risk tier and determine required due diligence depth.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab('inherent-risk')}
                  className="px-3.5 py-1.5 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg shadow-xs flex items-center gap-1 shrink-0"
                >
                  <span>Evaluate Inherent Risk</span>
                  <ArrowRight size={13} />
                </button>
              </div>
            </div>
          )}

          {/* TAB 2: INHERENT RISK EVALUATION */}
          {activeTab === 'inherent-risk' && (
            <div className="space-y-6">
              <div className="border border-teal-200 rounded-xl p-4 bg-teal-50/20 space-y-2">
                <h3 className="text-xs font-bold text-teal-950 uppercase tracking-wider flex items-center gap-1.5">
                  <Percent className="w-4 h-4 text-teal-700" />
                  <span>Objective 7-Factor Inherent Risk Model</span>
                </h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Inherent risk evaluates the unmitigated risk exposure of the vendor relationship prior to controls.
                  Weights: Data Sensitivity (20%), System Access (20%), Business Criticality (20%), Data Volume (10%),
                  Financial Exposure (10%), Regulatory Exposure (10%), Subcontractor Reliance (10%).
                </p>
              </div>

              {/* Factor Sliders */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-white border border-slate-200 rounded-xl p-3.5 space-y-1.5">
                  <div className="flex justify-between text-xs font-semibold text-slate-800">
                    <span>1. Data Sensitivity (Weight: 20%)</span>
                    <span className="text-teal-700 font-bold">{dataSensitivity}/100</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={dataSensitivity}
                    onChange={(e) => setDataSensitivity(Number(e.target.value))}
                    className="w-full accent-teal-700 cursor-pointer"
                  />
                  <span className="text-[10px] text-slate-400 block">PII, financial records, health data, or secret keys</span>
                </div>

                <div className="bg-white border border-slate-200 rounded-xl p-3.5 space-y-1.5">
                  <div className="flex justify-between text-xs font-semibold text-slate-800">
                    <span>2. System Access Level (Weight: 20%)</span>
                    <span className="text-teal-700 font-bold">{systemAccess}/100</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={systemAccess}
                    onChange={(e) => setSystemAccess(Number(e.target.value))}
                    className="w-full accent-teal-700 cursor-pointer"
                  />
                  <span className="text-[10px] text-slate-400 block">Privilege depth (Admin, DB, API vs Read-only)</span>
                </div>

                <div className="bg-white border border-slate-200 rounded-xl p-3.5 space-y-1.5">
                  <div className="flex justify-between text-xs font-semibold text-slate-800">
                    <span>3. Business Criticality (Weight: 20%)</span>
                    <span className="text-teal-700 font-bold">{businessCriticality}/100</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={businessCriticality}
                    onChange={(e) => setBusinessCriticality(Number(e.target.value))}
                    className="w-full accent-teal-700 cursor-pointer"
                  />
                  <span className="text-[10px] text-slate-400 block">Disruption impact on core company operations</span>
                </div>

                <div className="bg-white border border-slate-200 rounded-xl p-3.5 space-y-1.5">
                  <div className="flex justify-between text-xs font-semibold text-slate-800">
                    <span>4. Volume of Data (Weight: 10%)</span>
                    <span className="text-teal-700 font-bold">{dataVolume}/100</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={dataVolume}
                    onChange={(e) => setDataVolume(Number(e.target.value))}
                    className="w-full accent-teal-700 cursor-pointer"
                  />
                  <span className="text-[10px] text-slate-400 block">Number of customer/employee records transferred</span>
                </div>

                <div className="bg-white border border-slate-200 rounded-xl p-3.5 space-y-1.5">
                  <div className="flex justify-between text-xs font-semibold text-slate-800">
                    <span>5. Financial Exposure (Weight: 10%)</span>
                    <span className="text-teal-700 font-bold">{financialExposure}/100</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={financialExposure}
                    onChange={(e) => setFinancialExposure(Number(e.target.value))}
                    className="w-full accent-teal-700 cursor-pointer"
                  />
                  <span className="text-[10px] text-slate-400 block">Contract value and direct financial operational risk</span>
                </div>

                <div className="bg-white border border-slate-200 rounded-xl p-3.5 space-y-1.5">
                  <div className="flex justify-between text-xs font-semibold text-slate-800">
                    <span>6. Regulatory Exposure (Weight: 10%)</span>
                    <span className="text-teal-700 font-bold">{regulatoryExposure}/100</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={regulatoryExposure}
                    onChange={(e) => setRegulatoryExposure(Number(e.target.value))}
                    className="w-full accent-teal-700 cursor-pointer"
                  />
                  <span className="text-[10px] text-slate-400 block">Applicability of RBI, HIPAA, GDPR, SOC 2, or ISO</span>
                </div>

                <div className="bg-white border border-slate-200 rounded-xl p-3.5 space-y-1.5 md:col-span-2">
                  <div className="flex justify-between text-xs font-semibold text-slate-800">
                    <span>7. Subcontractor Reliance / 4th-Party Risk (Weight: 10%)</span>
                    <span className="text-teal-700 font-bold">{subcontractorReliance}/100</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={subcontractorReliance}
                    onChange={(e) => setSubcontractorReliance(Number(e.target.value))}
                    className="w-full accent-teal-700 cursor-pointer"
                  />
                  <span className="text-[10px] text-slate-400 block">Extent to which vendor subcontracts key deliverables</span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Inherent Risk Assessment Notes & Justification
                </label>
                <textarea
                  rows={2}
                  placeholder="Record rationale for assigned factor scores..."
                  value={inherentRiskNotes}
                  onChange={(e) => setInherentRiskNotes(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-teal-600 bg-white"
                />
              </div>

              <div className="flex items-center justify-between pt-2">
                <div className="text-xs text-slate-500">
                  Current Inherent Score:{' '}
                  <strong className="text-slate-800">
                    {Math.round(
                      dataSensitivity * 0.2 +
                        systemAccess * 0.2 +
                        businessCriticality * 0.2 +
                        dataVolume * 0.1 +
                        financialExposure * 0.1 +
                        regulatoryExposure * 0.1 +
                        subcontractorReliance * 0.1
                    )}
                    /100
                  </strong>
                </div>
                <button
                  type="button"
                  disabled={evaluatingInherent}
                  onClick={handleEvaluateInherentRisk}
                  className="px-4 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg disabled:opacity-50 transition-colors shadow-xs flex items-center gap-1.5"
                >
                  <Percent size={13} />
                  <span>{evaluatingInherent ? 'Computing...' : 'Record Inherent Risk & Derive Tier'}</span>
                </button>
              </div>
            </div>
          )}

          {/* TAB 3: DUE DILIGENCE */}
          {activeTab === 'due-diligence' && (
            <div className="space-y-6">
              {/* Trigger Due Diligence Card */}
              <div className="border border-blue-200 rounded-xl p-4 bg-blue-50/30 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-blue-950 uppercase tracking-wider flex items-center gap-1.5">
                    <ClipboardList className="w-4 h-4 text-blue-700" />
                    <span>Tiered Due Diligence Assessment</span>
                  </h3>
                  <span className="text-[11px] font-bold text-blue-800 bg-blue-100 px-2 py-0.5 rounded-full">
                    Recommended Scope: {vendor.inherentRiskTier || vendor.criticality || 'STANDARD'} Tier
                  </span>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Trigger standardized security due diligence matching the vendor's inherent risk tier.
                  Critical tier vendors undergo comprehensive 25-point assessment; Standard vendors receive a 15-point cloud questionnaire.
                </p>

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pt-1">
                  <select
                    value={selectedTemplateKey}
                    onChange={(e) => setSelectedTemplateKey(e.target.value)}
                    className="text-xs border border-slate-300 rounded-lg px-3 py-2 bg-white flex-1 focus:ring-1 focus:ring-blue-600 cursor-pointer"
                  >
                    <option value="">Auto-Assign Based on Inherent Risk Tier</option>
                    <option value="tprm-critical-v1">Comprehensive TPRM Due Diligence (Critical Tier - 25 Qs)</option>
                    <option value="tprm-standard-v1">Standard Cloud & SaaS Security Assessment (Standard Tier - 15 Qs)</option>
                    <option value="tprm-low-v1">Basic Vendor Information & Privacy Assessment (Low Risk - 8 Qs)</option>
                  </select>

                  <button
                    type="button"
                    disabled={triggeringDueDiligence}
                    onClick={handleTriggerDueDiligence}
                    className="px-4 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg disabled:opacity-50 transition-colors shadow-xs flex items-center justify-center gap-1.5 shrink-0"
                  >
                    <ClipboardList size={13} />
                    <span>{triggeringDueDiligence ? 'Initiating...' : 'Trigger Due Diligence'}</span>
                  </button>
                </div>
              </div>

              {/* Questionnaire Submissions */}
              <div>
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-3">
                  Questionnaire Submissions ({questionnaireSubmissions.length})
                </h4>

                {loadingSubmissions ? (
                  <div className="text-xs text-slate-500 py-6 text-center">Loading submissions...</div>
                ) : questionnaireSubmissions.length === 0 ? (
                  <div className="p-6 bg-slate-50 border border-dashed border-slate-300 rounded-xl text-center text-xs text-slate-500">
                    No questionnaire submissions recorded yet. Trigger due diligence above to begin.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {questionnaireSubmissions.map((sub) => (
                      <div
                        key={sub.id}
                        className="p-4 rounded-xl border border-slate-200 bg-white shadow-xs flex flex-col sm:flex-row sm:items-start justify-between gap-4"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-900 text-xs sm:text-sm">
                              {sub.questionnaireTitle || 'TPRM Questionnaire'}
                            </span>
                            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-100 text-slate-600">
                              v{sub.questionnaireVersion || '1.0'}
                            </span>
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                sub.status === 'ACCEPTED'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : sub.status === 'REJECTED'
                                  ? 'bg-rose-100 text-rose-800'
                                  : 'bg-amber-100 text-amber-800'
                              }`}
                            >
                              {sub.status}
                            </span>
                          </div>
                          <div className="text-xs text-slate-500">
                            {sub.submittedAt ? `Submitted: ${new Date(sub.submittedAt).toLocaleDateString()}` : 'Initiated'}
                            {sub.score !== undefined && ` | Score: ${sub.score}%`}
                          </div>
                          {sub.reviewNotes && (
                            <p className="text-xs text-slate-600 bg-slate-50 p-2 rounded border border-slate-200 mt-2">
                              {sub.reviewNotes}
                            </p>
                          )}
                        </div>

                        {sub.status === 'PENDING_REVIEW' && (
                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              type="button"
                              disabled={reviewingSubId === sub.id}
                              onClick={() => handleReviewSubmission(sub.id, 'ACCEPTED')}
                              className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white shadow-xs"
                            >
                              Accept & Score
                            </button>
                            <button
                              type="button"
                              disabled={reviewingSubId === sub.id}
                              onClick={() => handleReviewSubmission(sub.id, 'REJECTED')}
                              className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-rose-700 hover:bg-rose-800 text-white shadow-xs"
                            >
                              Reject
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 4: EVIDENCE & DOCUMENTS */}
          {activeTab === 'documents' && (
            <div className="space-y-6">
              {/* Document Upload Form */}
              <div className="border border-teal-100 rounded-xl p-4 bg-teal-50/30">
                <h3 className="text-xs font-bold text-teal-900 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <Upload className="w-4 h-4 text-teal-700" />
                  <span>Attach Compliance Evidence / Audit Certification</span>
                </h3>
                <form onSubmit={handleUploadDocument} className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Document Classification *
                      </label>
                      <select
                        value={docType}
                        onChange={(e) => setDocType(e.target.value)}
                        className="w-full text-xs border border-slate-300 rounded-lg p-2 bg-white cursor-pointer"
                      >
                        <option value="SOC 2 Type II">SOC 2 Type II Report</option>
                        <option value="ISO 27001 Certification">ISO 27001 Certificate</option>
                        <option value="Penetration Test Report">Penetration Test Executive Summary</option>
                        <option value="Cyber Insurance (COI)">Cybersecurity Insurance (COI)</option>
                        <option value="DPA / Privacy Agreement">Data Processing Addendum (DPA)</option>
                        <option value="Business Continuity Plan">BCP / Disaster Recovery Plan</option>
                        <option value="Master Services Agreement (MSA)">Master Services Agreement (MSA)</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Expiration / Valid Until Date
                      </label>
                      <input
                        type="date"
                        value={docExpiryDate}
                        onChange={(e) => setDocExpiryDate(e.target.value)}
                        className="w-full text-xs border border-slate-300 rounded-lg p-1.5 bg-white"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        File (PDF, DOCX, XLSX, CSV — Max 25MB) *
                      </label>
                      <input
                        type="file"
                        accept=".pdf,.doc,.docx,.xls,.xlsx,.csv"
                        onChange={(e) => setDocFile(e.target.files?.[0] || null)}
                        disabled={uploadingDoc}
                        className="w-full text-xs text-slate-600 file:mr-2 file:py-1 file:px-2.5 file:rounded file:border-0 file:text-xs file:font-semibold file:bg-teal-700 file:text-white cursor-pointer border border-slate-300 rounded-lg p-1 bg-white"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <input
                      type="text"
                      placeholder="Optional notes or audit period (e.g. FY26 Audit by EY)..."
                      value={docDescription}
                      onChange={(e) => setDocDescription(e.target.value)}
                      className="text-xs border border-slate-300 rounded-lg px-3 py-1.5 w-2/3 bg-white"
                    />
                    <button
                      type="submit"
                      disabled={!docFile || uploadingDoc}
                      className="px-4 py-1.5 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg disabled:opacity-50 transition-colors shadow-xs flex items-center gap-1.5"
                    >
                      <Upload size={13} />
                      <span>{uploadingDoc ? 'Uploading...' : 'Attach & Record'}</span>
                    </button>
                  </div>
                </form>
              </div>

              {/* Documents List */}
              <div>
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-3">
                  Attached Documents ({documents.length})
                </h4>

                {loadingDocs ? (
                  <div className="text-xs text-slate-500 py-6 text-center">Loading documents...</div>
                ) : documents.length === 0 ? (
                  <div className="p-6 bg-slate-50 border border-dashed border-slate-300 rounded-xl text-center text-xs text-slate-500">
                    No documents attached yet. Upload SOC 2, ISO 27001, or insurance certificates above.
                  </div>
                ) : (
                  <div className="border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100 bg-white">
                    {documents.map((doc) => {
                      const isExpired = doc.expirationDate && new Date(doc.expirationDate).getTime() < Date.now();
                      const isExpiringSoon =
                        doc.expirationDate &&
                        !isExpired &&
                        (new Date(doc.expirationDate).getTime() - Date.now()) / (1000 * 3600 * 24) <= 30;

                      return (
                        <div key={doc.id || doc.evidenceId} className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50">
                          <div className="space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-xs font-bold text-slate-900">{doc.fileName}</span>
                              {doc.documentType && (
                                <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200">
                                  {doc.documentType}
                                </span>
                              )}
                              {/* Verification status pill */}
                              <span
                                className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                                  doc.verificationStatus === 'VERIFIED'
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : doc.verificationStatus === 'REJECTED'
                                    ? 'bg-rose-100 text-rose-800'
                                    : 'bg-amber-100 text-amber-800'
                                }`}
                              >
                                {doc.verificationStatus || 'PENDING_REVIEW'}
                              </span>

                              {/* Expiry Pill */}
                              {isExpired && (
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-red-100 text-red-800 flex items-center gap-0.5">
                                  <AlertTriangle size={10} /> Expired
                                </span>
                              )}
                              {isExpiringSoon && (
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-orange-100 text-orange-800 flex items-center gap-0.5">
                                  <Clock size={10} /> Expiring Soon
                                </span>
                              )}
                            </div>

                            <div className="text-[11px] text-slate-500 flex flex-wrap items-center gap-2">
                              <span>Uploaded: {new Date(doc.attachedAt).toLocaleDateString()}</span>
                              {doc.expirationDate && (
                                <span>• Valid Until: {new Date(doc.expirationDate).toLocaleDateString()}</span>
                              )}
                              {doc.verifiedByName && <span>• Verified by: {doc.verifiedByName}</span>}
                            </div>

                            {doc.rejectionReason && (
                              <p className="text-[11px] text-rose-700 bg-rose-50 p-1.5 rounded border border-rose-200 mt-1">
                                Rejection Reason: {doc.rejectionReason}
                              </p>
                            )}
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            {doc.verificationStatus !== 'VERIFIED' && (
                              <button
                                type="button"
                                disabled={verifyingDocId === doc.evidenceId}
                                onClick={() => handleVerifyDocument(doc.evidenceId, 'VERIFIED')}
                                className="px-2.5 py-1 text-xs font-semibold rounded bg-emerald-700 hover:bg-emerald-800 text-white shadow-xs"
                              >
                                Verify
                              </button>
                            )}
                            {doc.verificationStatus !== 'REJECTED' && (
                              <button
                                type="button"
                                disabled={verifyingDocId === doc.evidenceId}
                                onClick={() => handleVerifyDocument(doc.evidenceId, 'REJECTED')}
                                className="px-2.5 py-1 text-xs font-semibold rounded bg-rose-700 hover:bg-rose-800 text-white shadow-xs"
                              >
                                Reject
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => handleDownloadDoc(doc)}
                              className="p-1.5 text-slate-500 hover:text-teal-700 rounded hover:bg-slate-100"
                              title="Download"
                            >
                              <Download size={14} />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteDoc(doc.evidenceId)}
                              className="p-1.5 text-slate-400 hover:text-rose-600 rounded hover:bg-slate-100"
                              title="Delete"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 5: RESIDUAL RISK EVALUATION */}
          {activeTab === 'residual-risk' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs text-center space-y-1">
                  <span className="text-[10px] uppercase font-bold text-slate-400">Inherent Risk Score</span>
                  <div className="text-2xl font-bold text-slate-900">
                    {vendor.inherentRiskScore ?? 'N/A'}
                  </div>
                  <span className="text-xs font-semibold text-slate-500">
                    Tier: {vendor.inherentRiskTier || vendor.criticality || 'PENDING'}
                  </span>
                </div>

                <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs text-center space-y-1">
                  <span className="text-[10px] uppercase font-bold text-slate-400">Control Effectiveness</span>
                  <div className="text-2xl font-bold text-teal-700">
                    {vendor.controlEffectivenessScore ?? 'Pending'}%
                  </div>
                  <span className="text-xs font-semibold text-slate-500">
                    Due Diligence & Verified Docs
                  </span>
                </div>

                <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs text-center space-y-1">
                  <span className="text-[10px] uppercase font-bold text-slate-400">Residual Risk Level</span>
                  <div
                    className={`text-2xl font-bold ${
                      vendor.residualRiskTier === 'CRITICAL'
                        ? 'text-rose-700'
                        : vendor.residualRiskTier === 'HIGH'
                        ? 'text-orange-700'
                        : vendor.residualRiskTier
                        ? 'text-emerald-700'
                        : 'text-slate-500'
                    }`}
                  >
                    {vendor.residualRiskTier || 'PENDING'}
                  </div>
                  <span className="text-xs font-semibold text-slate-500">
                    {vendor.residualRiskScore !== undefined ? `Score: ${vendor.residualRiskScore}/100` : 'Not computed'}
                  </span>
                </div>
              </div>

              {/* Formula & Explanation Card */}
              <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/70 space-y-2">
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                  <TrendingDown className="w-4 h-4 text-teal-700" />
                  <span>Residual Risk Computation Formula</span>
                </h4>
                <div className="p-3 bg-white border border-slate-200 rounded-lg text-xs font-mono text-slate-800">
                  Residual Risk = Inherent Risk × [1 − (Control Effectiveness × 0.70)]
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Controls evaluated during due diligence (questionnaire answers at 70% weight, verified audit certifications at 30% weight) reduce the inherent risk exposure up to 70%, yielding the operational residual risk.
                </p>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  disabled={evaluatingResidual}
                  onClick={handleCalculateResidualRisk}
                  className="px-4 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg disabled:opacity-50 transition-colors shadow-xs flex items-center gap-1.5"
                >
                  <TrendingDown size={13} />
                  <span>{evaluatingResidual ? 'Computing...' : 'Compute & Record Residual Risk'}</span>
                </button>
              </div>
            </div>
          )}

          {/* TAB 6: REMEDIATION FINDINGS */}
          {activeTab === 'remediation' && (
            <div className="space-y-6">
              {/* Create Finding Form */}
              <div className="border border-amber-200 rounded-xl p-4 bg-amber-50/20">
                <h3 className="text-xs font-bold text-amber-950 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <ShieldAlert className="w-4 h-4 text-amber-700" />
                  <span>Log Remediation Finding / Corrective Action</span>
                </h3>
                <form onSubmit={handleCreateAction} className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Finding Description *
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. Missing MFA on production staging endpoints"
                        value={newActionTitle}
                        onChange={(e) => setNewActionTitle(e.target.value)}
                        className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-amber-600 bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Severity</label>
                      <select
                        value={newActionSeverity}
                        onChange={(e) => setNewActionSeverity(e.target.value)}
                        className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-white cursor-pointer"
                      >
                        <option value="CRITICAL">Critical</option>
                        <option value="HIGH">High</option>
                        <option value="MEDIUM">Medium</option>
                        <option value="LOW">Low</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Assignee / Owner *</label>
                      <input
                        type="text"
                        required
                        placeholder="Vendor Security Lead"
                        value={newActionOwner}
                        onChange={(e) => setNewActionOwner(e.target.value)}
                        className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-amber-600 bg-white"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <div className="flex items-center gap-2">
                      <label className="text-xs font-semibold text-slate-700">Due Date:</label>
                      <input
                        type="date"
                        value={newActionDueDate}
                        onChange={(e) => setNewActionDueDate(e.target.value)}
                        className="px-2.5 py-1 text-xs border border-slate-300 rounded-lg bg-white"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={creatingAction || !newActionTitle.trim() || !newActionOwner.trim()}
                      className="px-4 py-1.5 text-xs font-semibold text-white bg-amber-700 hover:bg-amber-800 rounded-lg disabled:opacity-50 transition-colors shadow-xs flex items-center gap-1.5"
                    >
                      <ShieldAlert size={13} />
                      <span>{creatingAction ? 'Adding...' : 'Add Remediation Finding'}</span>
                    </button>
                  </div>
                </form>
              </div>

              {/* Actions List */}
              <div>
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-3">
                  Active Findings & Remediation Items ({actions.length})
                </h4>

                {loadingActions ? (
                  <div className="text-xs text-slate-500 py-6 text-center">Loading findings...</div>
                ) : actions.length === 0 ? (
                  <div className="p-6 bg-slate-50 border border-dashed border-slate-300 rounded-xl text-center text-xs text-slate-500">
                    No open findings recorded for this vendor.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {actions.map((act) => (
                      <div
                        key={act.id}
                        className="p-3.5 rounded-xl border border-slate-200 bg-white shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-slate-900">{act.title}</span>
                            <span
                              className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                                act.status === 'RESOLVED'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : act.status === 'UNDER_REVIEW'
                                  ? 'bg-blue-100 text-blue-800'
                                  : 'bg-amber-100 text-amber-800'
                              }`}
                            >
                              {act.status}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-500 flex items-center gap-2">
                            <span>Owner: {act.owner}</span>
                            {act.dueDate && <span>• Due: {new Date(act.dueDate).toLocaleDateString()}</span>}
                            {act.verifiedByName && <span>• Verified by: {act.verifiedByName}</span>}
                          </div>
                        </div>

                        {/* Closure verification actions */}
                        <div className="flex items-center gap-2 shrink-0">
                          {act.status !== 'RESOLVED' && (
                            <button
                              type="button"
                              disabled={verifyingActionId === act.id}
                              onClick={() => handleVerifyAction(act.id, 'VERIFY_RESOLVED')}
                              className="px-3 py-1.5 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg shadow-xs flex items-center gap-1"
                            >
                              <CheckCircle2 size={12} />
                              <span>Verify Closure</span>
                            </button>
                          )}
                          {act.status !== 'OPEN' && act.status !== 'IN_PROGRESS' && (
                            <button
                              type="button"
                              disabled={verifyingActionId === act.id}
                              onClick={() => handleVerifyAction(act.id, 'REJECT_REOPEN')}
                              className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg border border-slate-300 flex items-center gap-1"
                            >
                              <RotateCcw size={12} />
                              <span>Reject & Reopen</span>
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 7: APPROVAL & CONTINUOUS MONITORING */}
          {activeTab === 'approval' && (
            <div className="space-y-6">
              {/* Formal Sign-off Card */}
              <div className="border border-slate-200 rounded-xl p-4 bg-white shadow-xs space-y-4">
                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-teal-700" />
                  <span>Executive Relationship Sign-Off</span>
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Relationship Decision *
                    </label>
                    <select
                      value={approvalDecision}
                      onChange={(e) =>
                        setApprovalDecision(
                          e.target.value as 'APPROVED' | 'CONDITIONALLY_APPROVED' | 'REJECTED'
                        )
                      }
                      className="w-full text-xs border border-slate-300 rounded-lg p-2 bg-white cursor-pointer"
                    >
                      <option value="APPROVED">APPROVED — Vendor meets enterprise security criteria</option>
                      <option value="CONDITIONALLY_APPROVED">
                        CONDITIONALLY APPROVED — Accepted pending remediation closure
                      </option>
                      <option value="REJECTED">REJECTED — Vendor fails mandatory compliance thresholds</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Approving Authority *
                    </label>
                    <input
                      type="text"
                      required
                      value={approverName}
                      onChange={(e) => setApproverName(e.target.value)}
                      className="w-full text-xs border border-slate-300 rounded-lg p-2 bg-white"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Sign-off Notes & Conditions
                  </label>
                  <textarea
                    rows={2}
                    value={approvalNotes}
                    onChange={(e) => setApprovalNotes(e.target.value)}
                    placeholder="Record formal conditions or risk acceptance rationale..."
                    className="w-full text-xs border border-slate-300 rounded-lg p-2 bg-white"
                  />
                </div>

                <div className="flex justify-end">
                  <button
                    type="button"
                    disabled={submittingApproval}
                    onClick={handleApproveRelationship}
                    className="px-4 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg disabled:opacity-50 transition-colors shadow-xs flex items-center gap-1.5"
                  >
                    <CheckCircle2 size={13} />
                    <span>{submittingApproval ? 'Submitting...' : 'Execute Relationship Sign-Off'}</span>
                  </button>
                </div>
              </div>

              {/* Continuous Monitoring & Periodic Reassessment */}
              <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/70 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                    <RotateCcw className="w-4 h-4 text-blue-700" />
                    <span>Continuous Monitoring & Review Cadence</span>
                  </h4>
                  <span className="text-xs font-bold text-slate-700">
                    Cadence: {vendor.reviewCadenceDays || 365} Days
                  </span>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Next scheduled audit:{' '}
                  <strong>
                    {vendor.nextReviewDate ? new Date(vendor.nextReviewDate).toLocaleDateString() : 'Annual cycle'}
                  </strong>
                  . Triggering periodic reassessment updates questionnaire submissions and requests updated audit reports.
                </p>

                <div className="flex justify-end pt-1">
                  <button
                    type="button"
                    disabled={triggeringReassessment}
                    onClick={handleTriggerReassessment}
                    className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 rounded-lg disabled:opacity-50 transition-colors shadow-xs flex items-center gap-1.5"
                  >
                    <RotateCcw size={13} />
                    <span>{triggeringReassessment ? 'Initiating...' : 'Trigger Periodic Reassessment'}</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 8: STRUCTURED OFFBOARDING */}
          {activeTab === 'offboarding' && (
            <div className="space-y-6">
              {isDecommissioned ? (
                <div className="p-4 bg-slate-100 border border-slate-300 rounded-xl text-center space-y-2">
                  <Archive className="w-8 h-8 text-slate-500 mx-auto" />
                  <h3 className="text-sm font-bold text-slate-800">Vendor Fully Decommissioned</h3>
                  <p className="text-xs text-slate-600 max-w-md mx-auto">
                    All administrative access has been revoked, company data certified destroyed, and compliance documentation archived.
                  </p>
                </div>
              ) : (
                <div className="border border-rose-200 rounded-xl p-5 bg-rose-50/20 space-y-4">
                  <div>
                    <h3 className="text-xs font-bold text-rose-950 uppercase tracking-wider flex items-center gap-1.5">
                      <Archive className="w-4 h-4 text-rose-700" />
                      <span>Formal Vendor Offboarding & Decommissioning Checklist</span>
                    </h3>
                    <p className="text-xs text-slate-600 mt-1">
                      Complete all 4 verification controls before terminating relationship and archiving vendor records.
                    </p>
                  </div>

                  {/* 4 Mandatory Checkboxes */}
                  <div className="space-y-2.5 bg-white border border-rose-100 rounded-xl p-4">
                    <label className="flex items-start gap-2.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={checklistAccessRevoked}
                        onChange={(e) => setChecklistAccessRevoked(e.target.checked)}
                        className="mt-0.5 rounded text-rose-700 focus:ring-rose-600 cursor-pointer"
                      />
                      <div>
                        <span className="text-xs font-bold text-slate-900 block">
                          1. Access Revoked (Mandatory)
                        </span>
                        <span className="text-[11px] text-slate-500">
                          SSO, VPN, API keys, database credentials, and service accounts terminated.
                        </span>
                      </div>
                    </label>

                    <label className="flex items-start gap-2.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={checklistDataDestroyed}
                        onChange={(e) => setChecklistDataDestroyed(e.target.checked)}
                        className="mt-0.5 rounded text-rose-700 focus:ring-rose-600 cursor-pointer"
                      />
                      <div>
                        <span className="text-xs font-bold text-slate-900 block">
                          2. Data Destruction / Return Certified (Mandatory)
                        </span>
                        <span className="text-[11px] text-slate-500">
                          Certificate of data sanitization received or customer data returned.
                        </span>
                      </div>
                    </label>

                    <label className="flex items-start gap-2.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={checklistContractTerminated}
                        onChange={(e) => setChecklistContractTerminated(e.target.checked)}
                        className="mt-0.5 rounded text-rose-700 focus:ring-rose-600 cursor-pointer"
                      />
                      <div>
                        <span className="text-xs font-bold text-slate-900 block">
                          3. Contract Terminated & Financial Settlement (Mandatory)
                        </span>
                        <span className="text-[11px] text-slate-500">
                          MSA terminated without outstanding financial liability or ongoing subscriptions.
                        </span>
                      </div>
                    </label>

                    <label className="flex items-start gap-2.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={checklistAuditArchived}
                        onChange={(e) => setChecklistAuditArchived(e.target.checked)}
                        className="mt-0.5 rounded text-rose-700 focus:ring-rose-600 cursor-pointer"
                      />
                      <div>
                        <span className="text-xs font-bold text-slate-900 block">
                          4. Audit Trail & Records Archived (Mandatory)
                        </span>
                        <span className="text-[11px] text-slate-500">
                          Retain security assessments and evidence for statutory compliance period.
                        </span>
                      </div>
                    </label>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Offboarding Reason *
                      </label>
                      <select
                        value={offboardingReason}
                        onChange={(e) => setOffboardingReason(e.target.value)}
                        className="w-full text-xs border border-slate-300 rounded-lg p-2 bg-white cursor-pointer"
                      >
                        <option value="Contract Expiration / Non-Renewal">Contract Expiration / Non-Renewal</option>
                        <option value="Service Discontinuation / Migration">Service Discontinuation / Migration</option>
                        <option value="Security / Compliance Breach">Security / Compliance Breach</option>
                        <option value="Vendor Insolvency / M&A">Vendor Insolvency / M&A</option>
                        <option value="Other">Other</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Decommissioning Notes
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Migration to internal service completed"
                        value={offboardingNotes}
                        onChange={(e) => setOffboardingNotes(e.target.value)}
                        className="w-full text-xs border border-slate-300 rounded-lg p-2 bg-white"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end pt-2">
                    <button
                      type="button"
                      disabled={
                        submittingOffboarding ||
                        !checklistAccessRevoked ||
                        !checklistDataDestroyed ||
                        !checklistContractTerminated ||
                        !checklistAuditArchived
                      }
                      onClick={handleExecuteOffboarding}
                      className="px-4 py-2 text-xs font-semibold text-white bg-rose-700 hover:bg-rose-800 rounded-lg disabled:opacity-50 transition-colors shadow-xs flex items-center gap-1.5"
                    >
                      <Archive size={13} />
                      <span>{submittingOffboarding ? 'Decommissioning...' : 'Complete Formal Decommissioning'}</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-5 sm:px-6 py-3 border-t border-slate-200 bg-slate-50/80 flex items-center justify-between shrink-0">
          <span className="text-xs text-slate-500">
            Vendor ID: <span className="font-mono text-slate-700">{vendor.id}</span>
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 rounded-lg transition-colors shadow-xs"
          >
            Close Workspace
          </button>
        </div>
      </div>
    </div>
  );
}
