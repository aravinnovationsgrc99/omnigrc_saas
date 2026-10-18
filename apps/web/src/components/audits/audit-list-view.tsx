'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  ClipboardList, Plus, CheckCircle, AlertOctagon, Clock, ShieldCheck,
  FileText, Play, CheckCircle2, XCircle, HelpCircle, Layers, Search, Filter, X, Loader2,
  AlertCircle, CheckSquare, Wrench, ArrowRight, ArrowLeft, Check, Eye, Tag,
  History, Paperclip, UploadCloud, User, Users, Calendar, Building2, Download
} from 'lucide-react';
import { apiRequest } from '@/lib/api-client';
import {
  AuditPlanDto,
  AuditAssessmentDto,
  AuditFindingDto,
  AuditCapaDto,
  AuditEvidenceDto,
  AuditPlanStatus,
  AuditAssessmentStatus,
  AuditCheckResult,
  FindingStatus,
  CapaStatus,
  VulnerabilitySeverity,
  PaginatedAuditPlansDto,
  PaginatedAuditFindingsDto,
  calculateAuditScore,
  formatOwnerDisplay,
} from '@omnigrc/shared';
import { useToast } from '@/context/toast-context';
import { ComplianceScopeFilter } from '@/components/ui/compliance-scope-filter';
import { RagStatusBadge, getAuditPlanRag } from '@/components/ui/rag-status-badge';

interface FrameworkOption {
  id: string;
  code: string;
  name: string;
}

interface VersionOption {
  id: string;
  version: string;
  name: string;
}

interface ReferenceOption {
  id: string;
  identifier: string;
  title: string;
}

interface OrgMemberOption {
  id: string;
  name: string;
  email: string;
  role?: string;
}

export function AuditListView() {
  const { addToast } = useToast();
  const toastRef = React.useRef(addToast);
  toastRef.current = addToast;
  const [activeTab, setActiveTab] = useState<'plans' | 'assessments' | 'findings'>('plans');
  const [workspaceTab, setWorkspaceTab] = useState<'overview' | 'execution' | 'findings' | 'capas' | 'evidence' | 'completion'>('overview');
  const [plans, setPlans] = useState<AuditPlanDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPlan, setSelectedPlan] = useState<AuditPlanDto | null>(null);

  // Organization members for owner selection dropdowns
  const [orgMembers, setOrgMembers] = useState<OrgMemberOption[]>([]);

  // Modals state
  const [showPlanModal, setShowPlanModal] = useState(false);
  const [showCapaModal, setShowCapaModal] = useState(false);
  const [showVerifyModal, setShowVerifyModal] = useState(false);
  const [showLogFindingModal, setShowLogFindingModal] = useState(false);
  const [showAddEvidenceModal, setShowAddEvidenceModal] = useState(false);

  // List Filters
  const [filterFrameworkId, setFilterFrameworkId] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [filterSearch, setFilterSearch] = useState<string>('');

  // Form State - Audit Plan (Dynamic Scope)
  const [planTitle, setPlanTitle] = useState('');
  const [objective, setObjective] = useState('');
  const [ownerId, setOwnerId] = useState('Lead Auditor');

  // Dynamic Catalog Options for Plan Modal
  const [availableFrameworks, setAvailableFrameworks] = useState<FrameworkOption[]>([]);
  const [availableVersions, setAvailableVersions] = useState<VersionOption[]>([]);
  const [availableReferences, setAvailableReferences] = useState<ReferenceOption[]>([]);
  const [selectedFrameworkId, setSelectedFrameworkId] = useState<string>('');
  const [selectedVersionId, setSelectedVersionId] = useState<string>('');
  const [selectedReferenceIds, setSelectedReferenceIds] = useState<string[]>([]);
  const [loadingFrameworks, setLoadingFrameworks] = useState(false);
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [loadingReferences, setLoadingReferences] = useState(false);
  const [clauseSearch, setClauseSearch] = useState('');

  // Findings Tab State
  const [findings, setFindings] = useState<AuditFindingDto[]>([]);
  const [loadingFindings, setLoadingFindings] = useState(false);
  const [findingFilterStatus, setFindingFilterStatus] = useState<string>('');
  const [findingFilterSeverity, setFindingFilterSeverity] = useState<string>('');
  const [findingSearch, setFindingSearch] = useState<string>('');

  // CAPA Management Modal State
  const [activeFindingForCapa, setActiveFindingForCapa] = useState<AuditFindingDto | null>(null);
  const [capaForm, setCapaForm] = useState({
    title: '',
    correctiveAction: '',
    preventiveAction: '',
    ownerId: 'Remediation Lead',
    dueDate: '',
  });
  const [submittingCapa, setSubmittingCapa] = useState(false);
  const [updatingCapaId, setUpdatingCapaId] = useState<string | null>(null);

  // Finding Verification Modal State
  const [verifyTarget, setVerifyTarget] = useState<AuditFindingDto | null>(null);
  const [verifyStatus, setVerifyStatus] = useState<FindingStatus.VERIFIED | FindingStatus.CLOSED>(FindingStatus.VERIFIED);
  const [verifyNotes, setVerifyNotes] = useState('');
  const [submittingVerify, setSubmittingVerify] = useState(false);

  // Log Finding from Check Item Modal State
  const [targetCheckItem, setTargetCheckItem] = useState<{ id: string; title: string; assessmentId: string } | null>(null);
  const [logFindingForm, setLogFindingForm] = useState({
    title: '',
    description: '',
    severity: VulnerabilitySeverity.HIGH,
    remediationPlan: '',
    ownerId: 'Compliance Lead',
  });
  const [submittingFinding, setSubmittingFinding] = useState(false);

  // Evidence Attachment Modal State
  const [evidenceTarget, setEvidenceTarget] = useState<{ checkItemId?: string; findingId?: string; title?: string } | null>(null);
  const [evidenceForm, setEvidenceForm] = useState({
    fileName: '',
    fileUrl: '',
    fileSize: '',
    mimeType: 'application/pdf',
  });
  const [submittingEvidence, setSubmittingEvidence] = useState(false);

  // Audit Completion State
  const [completingPlanId, setCompletingPlanId] = useState<string | null>(null);

  // Audit History State
  const [planHistory, setPlanHistory] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Load organization members
  useEffect(() => {
    apiRequest<any[]>('/organization-members')
      .then((res) => {
        if (Array.isArray(res)) {
          setOrgMembers(res);
        }
      })
      .catch(() => {
        // Optional if user has limited permission
      });
  }, []);

  // Fetch plans with server-side filters
  const fetchPlans = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterFrameworkId) params.set('frameworkId', filterFrameworkId);
      if (filterStatus) params.set('status', filterStatus);
      if (filterSearch.trim()) params.set('search', filterSearch.trim());

      const qs = params.toString() ? `?${params.toString()}` : '';
      const res = await apiRequest<PaginatedAuditPlansDto>(`/business-audits/plans${qs}`);
      setPlans(res.items || []);
    } catch (err: any) {
      toastRef.current(`Failed to load audit plans: ${err.message}`, 'error');
    } finally {
      setLoading(false);
    }
  }, [filterFrameworkId, filterStatus, filterSearch]);

  useEffect(() => {
    fetchPlans();
  }, [fetchPlans]);

  // Fetch all findings
  const fetchFindings = useCallback(async () => {
    setLoadingFindings(true);
    try {
      const params = new URLSearchParams();
      if (findingFilterStatus) params.set('status', findingFilterStatus);
      if (findingFilterSeverity) params.set('severity', findingFilterSeverity);
      if (findingSearch.trim()) params.set('search', findingSearch.trim());

      const qs = params.toString() ? `?${params.toString()}` : '';
      const res = await apiRequest<PaginatedAuditFindingsDto>(`/business-audits/findings${qs}`);
      setFindings(res.items || []);
    } catch (err: any) {
      toastRef.current(`Failed to load audit findings: ${err.message}`, 'error');
    } finally {
      setLoadingFindings(false);
    }
  }, [findingFilterStatus, findingFilterSeverity, findingSearch]);

  useEffect(() => {
    if (activeTab === 'findings' || selectedPlan) {
      fetchFindings();
    }
  }, [activeTab, selectedPlan?.id, fetchFindings]);

  useEffect(() => {
    if (selectedPlan?.id) {
      apiRequest<AuditPlanDto>(`/business-audits/plans/${selectedPlan.id}`)
        .then((full) => {
          if (full && full.id === selectedPlan.id) {
            setSelectedPlan((prev) => (prev?.id === full.id ? { ...prev, ...full } : prev));
          }
        })
        .catch(() => {});
    }
  }, [selectedPlan?.id]);

  // Fetch audit history for selected plan
  const fetchPlanHistory = useCallback(async (planId: string) => {
    setLoadingHistory(true);
    try {
      const history = await apiRequest<any[]>(`/business-audits/plans/${planId}/history`);
      setPlanHistory(Array.isArray(history) ? history : []);
    } catch {
      setPlanHistory([]);
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  useEffect(() => {
    if (selectedPlan) {
      fetchPlanHistory(selectedPlan.id);
    }
  }, [selectedPlan?.id, fetchPlanHistory]);

  // Check audit completion eligibility
  const checkCompletionEligibility = (plan: AuditPlanDto) => {
    const blockers: string[] = [];
    const prerequisites = [
      {
        id: 'framework',
        title: 'Authoritative Framework Baseline Configured',
        passed: Boolean(
          plan.frameworkCode &&
            plan.frameworkCode !== 'UNSPECIFIED' &&
            (plan.frameworkId || plan.frameworkCode),
        ),
        details:
          plan.frameworkCode === 'UNSPECIFIED' || !plan.frameworkCode
            ? 'Framework is unspecified. An authoritative compliance framework baseline is required.'
            : `Configured for ${plan.frameworkName || plan.frameworkCode}`,
      },
      {
        id: 'status',
        title: 'Audit In Active Execution',
        passed: plan.status === AuditPlanStatus.IN_PROGRESS || plan.status === AuditPlanStatus.COMPLETED,
        details:
          plan.status === AuditPlanStatus.DRAFT
            ? 'Audit is in DRAFT. Start an execution run before completion.'
            : `Current lifecycle status: ${plan.status}`,
      },
      {
        id: 'runs',
        title: 'At Least One Assessment Executed',
        passed: (plan.assessments || []).length > 0,
        details:
          (plan.assessments || []).length === 0
            ? 'At least one execution run must be conducted.'
            : `${plan.assessments?.length} execution run(s) recorded.`,
      },
      {
        id: 'checklists',
        title: 'All Checklist Items Evaluated',
        passed: false,
        details: '',
      },
      {
        id: 'findings',
        title: 'All Audit Findings Remediated & Ready/Verified',
        passed: false,
        details: '',
      },
    ];

    if (!prerequisites[0].passed) blockers.push(prerequisites[0].details);
    if (!prerequisites[1].passed) blockers.push(prerequisites[1].details);
    if (!prerequisites[2].passed) blockers.push(prerequisites[2].details);

    const assessments = plan.assessments || [];
    const checkItems = assessments.flatMap((a) => a.checkItems || []);
    if (checkItems.length === 0) {
      prerequisites[3].passed = false;
      prerequisites[3].details = 'No checklist items configured for evaluation.';
      blockers.push('No checklist items configured for evaluation.');
    } else {
      const unevaluated = checkItems.filter((ci) => ci.result === AuditCheckResult.NOT_EVALUATED);
      if (unevaluated.length > 0) {
        prerequisites[3].passed = false;
        prerequisites[3].details = `${unevaluated.length} checklist item(s) remain unevaluated. All items must be evaluated.`;
        blockers.push(`${unevaluated.length} checklist item(s) remain unevaluated.`);
      } else {
        prerequisites[3].passed = true;
        prerequisites[3].details = `All ${checkItems.length} checklist item(s) evaluated.`;
      }
    }

    const allFindings = assessments.flatMap((a) => a.findings || []);
    const unresolved = allFindings.filter(
      (f) => f.status === FindingStatus.OPEN || f.status === FindingStatus.IN_REMEDIATION,
    );
    if (unresolved.length > 0) {
      prerequisites[4].passed = false;
      prerequisites[4].details = `${unresolved.length} finding(s) remain open or in remediation. Findings must be ready for verification, verified, or closed.`;
      blockers.push(`${unresolved.length} finding(s) remain open or in remediation.`);
    } else {
      prerequisites[4].passed = true;
      prerequisites[4].details =
        allFindings.length === 0
          ? 'No audit findings logged.'
          : `All ${allFindings.length} finding(s) are resolved, verified, or closed.`;
    }

    const eligible = blockers.length === 0;
    return {
      eligible,
      reason: eligible
        ? 'All completion requirements satisfied: framework baseline verified, check items evaluated, and findings remediated.'
        : blockers[0],
      blockers,
      prerequisites,
    };
  };

  async function handleCompleteAudit(planId: string) {
    setCompletingPlanId(planId);
    try {
      await apiRequest(`/business-audits/plans/${planId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: AuditPlanStatus.COMPLETED }),
      });
      addToast('Audit Plan successfully marked as COMPLETED and finalized!', 'success');
      await fetchPlans();
      if (selectedPlan && selectedPlan.id === planId) {
        const updated = await apiRequest<AuditPlanDto>(`/business-audits/plans/${planId}`);
        setSelectedPlan(updated);
        fetchPlanHistory(planId);
      }
    } catch (err: any) {
      addToast(`Audit completion failed: ${err.message}`, 'error');
    } finally {
      setCompletingPlanId(null);
    }
  }

  // Load Frameworks for Create Modal
  useEffect(() => {
    if (showPlanModal && availableFrameworks.length === 0) {
      setLoadingFrameworks(true);
      apiRequest<any[]>('/frameworks')
        .then((data) => {
          setAvailableFrameworks(data.map((f) => ({ id: f.id, code: f.code, name: f.name })));
        })
        .catch((err) => addToast(`Failed to load frameworks: ${err.message}`, 'error'))
        .finally(() => setLoadingFrameworks(false));
    }
  }, [showPlanModal, availableFrameworks.length, addToast]);

  // Load Versions when Framework is chosen
  useEffect(() => {
    if (selectedFrameworkId) {
      setLoadingVersions(true);
      setSelectedVersionId('');
      setSelectedReferenceIds([]);
      setAvailableReferences([]);
      apiRequest<any[]>(`/frameworks/${selectedFrameworkId}/versions`)
        .then((data) => {
          setAvailableVersions(data.map((v) => ({ id: v.id, version: v.version, name: v.name || v.version })));
        })
        .catch((err) => addToast(`Failed to load versions: ${err.message}`, 'error'))
        .finally(() => setLoadingVersions(false));
    } else {
      setAvailableVersions([]);
      setSelectedVersionId('');
      setAvailableReferences([]);
      setSelectedReferenceIds([]);
    }
  }, [selectedFrameworkId, addToast]);

  // Load References when Version is chosen
  useEffect(() => {
    if (selectedFrameworkId && selectedVersionId) {
      setLoadingReferences(true);
      setSelectedReferenceIds([]);
      apiRequest<any[]>(`/frameworks/${selectedFrameworkId}/versions/${selectedVersionId}/clauses`)
        .then((data) => {
          setAvailableReferences(
            data.map((r) => ({
              id: r.id,
              identifier: r.identifier || r.id,
              title: r.title || r.name || r.identifier,
            }))
          );
        })
        .catch((err) => addToast(`Failed to load framework clauses: ${err.message}`, 'error'))
        .finally(() => setLoadingReferences(false));
    } else {
      setAvailableReferences([]);
      setSelectedReferenceIds([]);
    }
  }, [selectedFrameworkId, selectedVersionId, addToast]);

  const toggleClauseSelection = (refId: string) => {
    setSelectedReferenceIds((prev) =>
      prev.includes(refId) ? prev.filter((id) => id !== refId) : [...prev, refId]
    );
  };

  const selectAllClauses = () => {
    setSelectedReferenceIds(availableReferences.map((r) => r.id));
  };

  const clearAllClauses = () => {
    setSelectedReferenceIds([]);
  };

  async function handleCreatePlan(e: React.FormEvent) {
    e.preventDefault();
    if (!planTitle.trim()) {
      addToast('Audit Title is required', 'error');
      return;
    }

    try {
      const selectedFw = availableFrameworks.find((f) => f.id === selectedFrameworkId);
      const payload: any = {
        title: planTitle.trim(),
        objective: objective.trim() || undefined,
        ownerId: ownerId.trim() || 'Lead Auditor',
      };

      if (selectedFrameworkId) {
        payload.frameworkId = selectedFrameworkId;
        payload.frameworkCode = selectedFw?.code;
      }
      if (selectedVersionId) {
        payload.frameworkVersionId = selectedVersionId;
      }
      if (selectedReferenceIds.length > 0) {
        payload.frameworkReferenceIds = selectedReferenceIds;
      }

      await apiRequest('/business-audits/plans', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      addToast('Scoped audit plan created successfully!', 'success');
      setShowPlanModal(false);
      setPlanTitle('');
      setObjective('');
      setSelectedFrameworkId('');
      setSelectedVersionId('');
      setSelectedReferenceIds([]);
      fetchPlans();
    } catch (err: any) {
      addToast(`Failed to create plan: ${err.message}`, 'error');
    }
  }

  async function handleStartAssessment(planId: string) {
    try {
      await apiRequest('/business-audits/assessments', {
        method: 'POST',
        body: JSON.stringify({
          auditPlanId: planId,
          auditorId: ownerId || 'Lead Auditor',
        }),
      });
      addToast('Audit Assessment execution run started.', 'success');
      await fetchPlans();
      if (selectedPlan && selectedPlan.id === planId) {
        const updated = await apiRequest<AuditPlanDto>(`/business-audits/plans/${planId}`);
        setSelectedPlan(updated);
        fetchPlanHistory(planId);
      }
    } catch (err: any) {
      addToast(`Failed to start assessment: ${err.message}`, 'error');
    }
  }

  async function handleEvaluateCheckItem(checkItemId: string, result: AuditCheckResult) {
    try {
      await apiRequest(`/business-audits/check-items/${checkItemId}`, {
        method: 'PATCH',
        body: JSON.stringify({ result }),
      });
      addToast(`Check item evaluated as ${result}`, 'success');
      if (selectedPlan) {
        const updated = await apiRequest<AuditPlanDto>(`/business-audits/plans/${selectedPlan.id}`);
        setSelectedPlan(updated);
      }
      await fetchPlans();
    } catch (err: any) {
      addToast(`Failed to evaluate item: ${err.message}`, 'error');
    }
  }

  async function handleCreateCapa(e: React.FormEvent) {
    e.preventDefault();
    if (!activeFindingForCapa) return;
    if (!capaForm.title.trim() || !capaForm.correctiveAction.trim()) {
      addToast('Action title and corrective action are required', 'error');
      return;
    }

    setSubmittingCapa(true);
    try {
      await apiRequest('/business-audits/capas', {
        method: 'POST',
        body: JSON.stringify({
          findingId: activeFindingForCapa.id,
          title: capaForm.title.trim(),
          correctiveAction: capaForm.correctiveAction.trim(),
          preventiveAction: capaForm.preventiveAction.trim() || undefined,
          ownerId: capaForm.ownerId.trim() || 'Remediation Lead',
          dueDate: capaForm.dueDate ? new Date(capaForm.dueDate).toISOString() : undefined,
        }),
      });

      addToast('CAPA action created and finding updated to IN_REMEDIATION!', 'success');
      setCapaForm({
        title: '',
        correctiveAction: '',
        preventiveAction: '',
        ownerId: 'Remediation Lead',
        dueDate: '',
      });

      if (selectedPlan) {
        const updated = await apiRequest<AuditPlanDto>(`/business-audits/plans/${selectedPlan.id}`);
        setSelectedPlan(updated);
        const refetchedFinding = (updated.assessments || [])
          .flatMap((a) => a.findings || [])
          .find((f) => f.id === activeFindingForCapa.id);
        if (refetchedFinding) {
          setActiveFindingForCapa(refetchedFinding);
        }
      }
      fetchFindings();
      fetchPlans();
    } catch (err: any) {
      addToast(`Failed to create CAPA: ${err.message}`, 'error');
    } finally {
      setSubmittingCapa(false);
    }
  }

  async function handleUpdateCapaStatus(capaId: string, status: CapaStatus) {
    setUpdatingCapaId(capaId);
    try {
      await apiRequest(`/business-audits/capas/${capaId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });

      addToast(`CAPA status updated to ${status}`, 'success');

      if (selectedPlan) {
        const updated = await apiRequest<AuditPlanDto>(`/business-audits/plans/${selectedPlan.id}`);
        setSelectedPlan(updated);
        if (activeFindingForCapa) {
          const refetched = (updated.assessments || [])
            .flatMap((a) => a.findings || [])
            .find((f) => f.id === activeFindingForCapa.id);
          if (refetched) setActiveFindingForCapa(refetched);
        }
      }
      fetchFindings();
      fetchPlans();
    } catch (err: any) {
      addToast(`Failed to update CAPA status: ${err.message}`, 'error');
    } finally {
      setUpdatingCapaId(null);
    }
  }

  function handleOpenVerifyModal(finding: AuditFindingDto) {
    setVerifyTarget(finding);
    setVerifyStatus(FindingStatus.VERIFIED);
    setVerifyNotes(finding.verificationNotes || '');
    setShowVerifyModal(true);
  }

  async function handleConfirmVerification(e: React.FormEvent) {
    e.preventDefault();
    if (!verifyTarget) return;

    setSubmittingVerify(true);
    try {
      await apiRequest(`/business-audits/findings/${verifyTarget.id}/verify`, {
        method: 'POST',
        body: JSON.stringify({
          status: verifyStatus,
          verificationNotes: verifyNotes.trim() || undefined,
        }),
      });

      addToast(`Finding successfully ${verifyStatus === FindingStatus.VERIFIED ? 'verified' : 'closed'}!`, 'success');
      setShowVerifyModal(false);
      setVerifyTarget(null);

      if (selectedPlan) {
        const updated = await apiRequest<AuditPlanDto>(`/business-audits/plans/${selectedPlan.id}`);
        setSelectedPlan(updated);
      }
      fetchFindings();
      fetchPlans();
    } catch (err: any) {
      addToast(`Verification failed: ${err.message}`, 'error');
    } finally {
      setSubmittingVerify(false);
    }
  }

  function handleOpenLogFindingModal(checkItem: { id: string; title: string; assessmentId: string }) {
    setTargetCheckItem(checkItem);
    setLogFindingForm({
      title: `Deficiency detected: ${checkItem.title}`,
      description: '',
      severity: VulnerabilitySeverity.HIGH,
      remediationPlan: '',
      ownerId: 'Compliance Lead',
    });
    setShowLogFindingModal(true);
  }

  async function handleLogFindingSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!targetCheckItem) return;
    if (!logFindingForm.title.trim()) {
      addToast('Finding title is required', 'error');
      return;
    }

    setSubmittingFinding(true);
    try {
      await apiRequest('/business-audits/findings', {
        method: 'POST',
        body: JSON.stringify({
          assessmentId: targetCheckItem.assessmentId,
          checkItemId: targetCheckItem.id,
          title: logFindingForm.title.trim(),
          description: logFindingForm.description.trim() || undefined,
          severity: logFindingForm.severity,
          remediationPlan: logFindingForm.remediationPlan.trim() || undefined,
          ownerId: logFindingForm.ownerId.trim() || 'Compliance Lead',
        }),
      });

      addToast('Deficiency finding successfully logged and linked!', 'success');
      setShowLogFindingModal(false);
      setTargetCheckItem(null);

      if (selectedPlan) {
        const updated = await apiRequest<AuditPlanDto>(`/business-audits/plans/${selectedPlan.id}`);
        setSelectedPlan(updated);
      }
      fetchFindings();
      fetchPlans();
    } catch (err: any) {
      addToast(`Failed to log finding: ${err.message}`, 'error');
    } finally {
      setSubmittingFinding(false);
    }
  }

  async function handleAttachEvidence(e: React.FormEvent) {
    e.preventDefault();
    if (!evidenceForm.fileName.trim()) {
      addToast('Filename is required', 'error');
      return;
    }

    setSubmittingEvidence(true);
    try {
      await apiRequest('/business-audits/evidence', {
        method: 'POST',
        body: JSON.stringify({
          checkItemId: evidenceTarget?.checkItemId || undefined,
          findingId: evidenceTarget?.findingId || undefined,
          fileName: evidenceForm.fileName.trim(),
          fileUrl:
            evidenceForm.fileUrl.trim() ||
            `https://vault.omnigrc.internal/evidence/${Date.now()}_${encodeURIComponent(evidenceForm.fileName.trim())}`,
          fileSize: evidenceForm.fileSize ? Number(evidenceForm.fileSize) : 2048,
          mimeType: evidenceForm.mimeType || 'application/pdf',
        }),
      });

      addToast('Evidence artifact successfully attached!', 'success');
      setShowAddEvidenceModal(false);
      setEvidenceForm({ fileName: '', fileUrl: '', fileSize: '', mimeType: 'application/pdf' });
      setEvidenceTarget(null);

      if (selectedPlan) {
        const updated = await apiRequest<AuditPlanDto>(`/business-audits/plans/${selectedPlan.id}`);
        setSelectedPlan(updated);
        fetchPlanHistory(selectedPlan.id);
      }
      fetchPlans();
    } catch (err: any) {
      addToast(`Failed to attach evidence: ${err.message}`, 'error');
    } finally {
      setSubmittingEvidence(false);
    }
  }

  const filteredClauses = availableReferences.filter(
    (r) =>
      r.identifier.toLowerCase().includes(clauseSearch.toLowerCase()) ||
      r.title.toLowerCase().includes(clauseSearch.toLowerCase())
  );

  // Aggregated artifacts for workspace view
  const allPlanAssessments = selectedPlan?.assessments || [];
  const allPlanCheckItems = allPlanAssessments.flatMap((a) => a.checkItems || []);
  const allPlanFindings = [
    ...allPlanAssessments.flatMap((a) => a.findings || []),
    ...findings.filter(
      (f) =>
        (f.planId && f.planId === selectedPlan?.id) ||
        (f.assessmentId && allPlanAssessments.some((a) => a.id === f.assessmentId)),
    ),
  ].filter((f, idx, arr) => arr.findIndex((x) => x.id === f.id) === idx);
  const allPlanCapas = allPlanFindings.flatMap((f) => (f.capas || []).map((c) => ({ ...c, finding: f })));
  const allPlanEvidence = [
    ...allPlanAssessments.flatMap((a) =>
      ((a as any).evidence || []).map((e: any) => ({
        ...e,
        contextType: 'Assessment',
        contextTitle: a.title || a.summary || 'Assessment Run',
        assessmentId: a.id,
      })),
    ),
    ...allPlanCheckItems.flatMap((c) =>
      (c.evidence || []).map((e) => ({
        ...e,
        contextType: 'Check Item',
        contextTitle: c.title,
        checkItemId: c.id,
      })),
    ),
    ...allPlanFindings.flatMap((f) =>
      (f.evidence || []).map((e) => ({
        ...e,
        contextType: 'Finding',
        contextTitle: f.title,
        findingId: f.id,
      })),
    ),
  ];

  // ----------------------------------------------------
  // RENDER: Full Audit Management Workspace (when selectedPlan != null)
  // ----------------------------------------------------
  if (selectedPlan) {
    const rag = getAuditPlanRag(selectedPlan.status, selectedPlan.assessments, {
      frameworkCode: selectedPlan.frameworkCode,
      frameworkId: selectedPlan.frameworkId,
      frameworkName: selectedPlan.frameworkName,
      scopeReferences: selectedPlan.scopeReferences,
    });
    const eligibility = checkCompletionEligibility(selectedPlan);

    return (
      <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 py-6 omni-fade-in space-y-6">
        {/* Breadcrumb & Navigation */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
          <div>
            <div className="flex items-center gap-2 text-xs text-slate-500 mb-2">
              <button
                onClick={() => setSelectedPlan(null)}
                className="hover:text-teal-700 flex items-center gap-1 font-semibold transition-colors"
              >
                <ArrowLeft size={14} /> Audit Management
              </button>
              <span>/</span>
              <span className="font-mono text-teal-800 bg-teal-50 px-2 py-0.5 rounded border border-teal-200 font-bold">
                {selectedPlan.frameworkName || selectedPlan.frameworkCode || 'UNSPECIFIED'}
              </span>
              <span>/</span>
              <span className="font-semibold text-slate-800 line-clamp-1">{selectedPlan.title}</span>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-xl sm:text-2xl font-bold text-slate-900">{selectedPlan.title}</h1>
              <RagStatusBadge status={rag.status} label={rag.label} detail={rag.detail} size="md" />
              <span className="text-xs px-2.5 py-0.5 rounded-full font-bold uppercase bg-slate-100 text-slate-700 border border-slate-200">
                {selectedPlan.status}
              </span>
            </div>
            <p className="text-xs sm:text-sm text-slate-500 mt-1">
              {selectedPlan.objective || 'Complete compliance audit scope, execution checklists, deficiency findings & CAPA verification.'}
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {selectedPlan.status === 'DRAFT' && (
              <button
                onClick={() => handleStartAssessment(selectedPlan.id)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-white bg-teal-700 hover:bg-teal-800 rounded-lg shadow-sm transition-colors"
              >
                <Play size={14} /> Start Execution Run
              </button>
            )}
            <button
              onClick={() => setSelectedPlan(null)}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors"
            >
              <ArrowLeft size={14} /> Back to Audits
            </button>
          </div>
        </div>

        {/* Workspace Sub-Tabs */}
        <div className="flex items-center gap-2 border-b border-slate-200 overflow-x-auto pb-1 omni-scroll">
          {[
            { id: 'overview', label: 'A. Overview & Scope' },
            { id: 'execution', label: `B. Execution Runs (${allPlanAssessments.length})` },
            { id: 'findings', label: `C. Findings (${allPlanFindings.length})` },
            { id: 'capas', label: `D. CAPA Actions (${allPlanCapas.length})` },
            { id: 'evidence', label: `E. Evidence (${allPlanEvidence.length})` },
            { id: 'completion', label: 'F. Completion & History' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setWorkspaceTab(tab.id as any)}
              className={`px-4 py-2 text-xs font-bold rounded-t-lg transition-colors whitespace-nowrap flex items-center gap-2 ${
                workspaceTab === tab.id
                  ? 'bg-white border border-slate-200 border-b-white text-teal-800 -mb-px shadow-xs'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* TAB A: OVERVIEW & SCOPE */}
        {workspaceTab === 'overview' && (
          <div className="space-y-6">
            {/* Metadata Summary Card */}
            <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="space-y-1">
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                  <User size={13} className="text-teal-700" /> Accountable Owner
                </span>
                <div className="text-sm font-bold text-slate-900">
                  {formatOwnerDisplay({
                    ownerId: selectedPlan.ownerId,
                    ownerName: selectedPlan.ownerName,
                    ownerEmail: selectedPlan.ownerEmail,
                    teamName: selectedPlan.teamName,
                  })}
                </div>
                {selectedPlan.ownerRole && (
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-600">
                    Role: {selectedPlan.ownerRole}
                  </span>
                )}
              </div>

              <div className="space-y-1">
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                  <Building2 size={13} className="text-teal-700" /> Assigned Team / Dept
                </span>
                <div className="text-sm font-bold text-slate-900">
                  {selectedPlan.teamName || 'Organization-wide Governance'}
                </div>
                <div className="text-[11px] text-slate-500">Business Scope: {selectedPlan.scope || 'Standard'}</div>
              </div>

              <div className="space-y-1">
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                  <ShieldCheck size={13} className="text-teal-700" /> Framework Baseline
                </span>
                <div className="text-sm font-bold text-teal-900">
                  {selectedPlan.frameworkName || selectedPlan.frameworkCode || 'UNSPECIFIED'}
                </div>
                <div className="text-[11px] text-slate-500">Version: {selectedPlan.versionName || 'Standard'}</div>
              </div>

              <div className="space-y-1">
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                  <Calendar size={13} className="text-teal-700" /> Audit Schedule
                </span>
                <div className="text-xs font-semibold text-slate-800">
                  {selectedPlan.plannedStartDate
                    ? new Date(selectedPlan.plannedStartDate).toLocaleDateString()
                    : 'Immediate'}{' '}
                  -{' '}
                  {selectedPlan.plannedEndDate
                    ? new Date(selectedPlan.plannedEndDate).toLocaleDateString()
                    : 'Open-ended'}
                </div>
                <div className="text-[10px] text-slate-400">Created {new Date(selectedPlan.createdAt).toLocaleDateString()}</div>
              </div>
            </div>

            {/* Next Recommended Action Banner */}
            <div className="bg-teal-50/70 border border-teal-200/80 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
              <div className="flex items-start gap-3">
                <Clock className="w-5 h-5 text-teal-700 shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-xs font-bold text-teal-950 uppercase tracking-wider">Next Recommended Workflow Action</h4>
                  <p className="text-xs text-teal-900 mt-0.5">
                    {selectedPlan.status === 'DRAFT'
                      ? 'Audit plan awaiting execution. Click "Start Execution Run" to initiate auditor checklists.'
                      : selectedPlan.status === 'COMPLETED'
                      ? 'This audit is finalized and marked COMPLETED. Records are preserved in the immutable audit log.'
                      : eligibility.eligible
                      ? 'All check items are evaluated and findings resolved! Proceed to "Completion & History" to perform final sign-off.'
                      : `In Execution: ${eligibility.reason}`}
                  </p>
                </div>
              </div>

              {selectedPlan.status === 'DRAFT' ? (
                <button
                  onClick={() => handleStartAssessment(selectedPlan.id)}
                  className="px-3.5 py-1.5 text-xs font-bold text-white bg-teal-700 hover:bg-teal-800 rounded-lg shrink-0 transition-colors"
                >
                  Start Execution Run
                </button>
              ) : selectedPlan.status !== 'COMPLETED' && eligibility.eligible ? (
                <button
                  onClick={() => setWorkspaceTab('completion')}
                  className="px-3.5 py-1.5 text-xs font-bold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg shrink-0 transition-colors flex items-center gap-1.5"
                >
                  <CheckCircle2 size={14} /> Review & Sign Off
                </button>
              ) : null}
            </div>

            {/* Normative Compliance Scope Clauses */}
            <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs">
              <div className="flex items-center justify-between mb-3 border-b border-slate-100 pb-3">
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <ShieldCheck size={18} className="text-teal-700" />
                  <span>Normative Scoped Clauses ({selectedPlan.scopeReferences?.length || 0})</span>
                </h3>
                <span className="text-xs text-slate-500">
                  {selectedPlan.scopeReferences && selectedPlan.scopeReferences.length > 0
                    ? 'Clause-specific scoping applied'
                    : 'Full normative baseline'}
                </span>
              </div>

              {selectedPlan.scopeReferences && selectedPlan.scopeReferences.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {selectedPlan.scopeReferences.map((sr) => (
                    <div key={sr.id} className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-mono font-bold text-teal-900 bg-white px-2 py-0.5 rounded border border-slate-200">
                          {sr.identifier}
                        </span>
                        {sr.type && <span className="text-[10px] text-slate-400 uppercase">{sr.type}</span>}
                      </div>
                      <div className="font-semibold text-slate-800 pt-1">{sr.title}</div>
                      {sr.description && <div className="text-slate-500 line-clamp-2">{sr.description}</div>}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-6 text-center text-xs text-slate-500 italic bg-slate-50 border border-slate-200 rounded-lg">
                  This audit plan evaluates the complete baseline of framework {selectedPlan.frameworkName || selectedPlan.frameworkCode} without clause-specific exclusions.
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB B: ASSESSMENTS & EXECUTION */}
        {workspaceTab === 'execution' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Execution Runs & Checklist Items</h3>
                <p className="text-xs text-slate-500">Auditor evaluations, checklist scoring, and non-conformance detection.</p>
              </div>
              <button
                onClick={() => handleStartAssessment(selectedPlan.id)}
                className="px-3.5 py-1.5 text-xs font-bold text-teal-800 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-lg transition-colors flex items-center gap-1.5"
              >
                <Plus size={14} /> Start Another Run
              </button>
            </div>

            {allPlanAssessments.length > 0 ? (
              <div className="space-y-6">
                {allPlanAssessments.map((a) => (
                  <div key={a.id} className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-slate-900">{a.title || 'Execution Assessment Run'}</span>
                          <span className="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase bg-slate-100 text-slate-700">
                            {a.status}
                          </span>
                        </div>
                        {a.scopeDescription && (
                          <div className="text-xs text-slate-500 mt-0.5">{a.scopeDescription}</div>
                        )}
                        <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-2">
                          <span>
                            Auditor:{' '}
                            <strong className="text-slate-700">
                              {formatOwnerDisplay({
                                ownerId: a.auditorId,
                                ownerName: a.auditorName,
                                ownerEmail: a.auditorEmail,
                                fallback: 'Lead Auditor',
                              })}
                            </strong>
                          </span>
                          <span>•</span>
                          <span>Started: {new Date(a.startedAt || (a as any).createdAt || Date.now()).toLocaleDateString()}</span>
                        </div>
                      </div>

                      <div className="text-right">
                        <div className="text-[10px] text-slate-500 uppercase font-semibold">Authoritative Score</div>
                        <div className="text-lg font-bold text-teal-700 omni-mono">{a.score}%</div>
                      </div>
                    </div>

                    {/* Evaluation Checklists */}
                    <div className="space-y-2">
                      <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Evaluation Checklist</h4>
                      {a.checkItems && a.checkItems.length > 0 ? (
                        a.checkItems.map((ci) => (
                          <div
                            key={ci.id}
                            className="bg-slate-50 p-3.5 rounded-lg border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                          >
                            <div className="space-y-1">
                              <div className="text-xs font-semibold text-slate-900">{ci.title}</div>
                              {ci.description && <div className="text-[11px] text-slate-500">{ci.description}</div>}
                              {ci.evidence && ci.evidence.length > 0 && (
                                <div className="text-[10px] text-teal-800 flex items-center gap-1 font-medium">
                                  <Paperclip size={11} /> {ci.evidence.length} evidence attachment(s)
                                </div>
                              )}
                            </div>

                            <div className="flex flex-wrap items-center gap-2 shrink-0">
                              <div className="flex items-center gap-1">
                                {[
                                  { key: 'COMPLIANT', label: 'Pass', bg: 'bg-emerald-100 text-emerald-800' },
                                  { key: 'NON_COMPLIANT', label: 'Fail', bg: 'bg-red-100 text-red-800' },
                                  { key: 'NOT_APPLICABLE', label: 'N/A', bg: 'bg-slate-100 text-slate-600' },
                                ].map((btn) => (
                                  <button
                                    key={btn.key}
                                    onClick={() => handleEvaluateCheckItem(ci.id, btn.key as AuditCheckResult)}
                                    className={`px-2.5 py-1 text-[11px] font-bold rounded transition-all ${
                                      ci.result === btn.key ? btn.bg : 'bg-white text-slate-500 hover:bg-slate-100 border border-slate-200'
                                    }`}
                                  >
                                    {btn.label}
                                  </button>
                                ))}
                              </div>

                              <button
                                type="button"
                                onClick={() => {
                                  setEvidenceTarget({ checkItemId: ci.id, title: ci.title });
                                  setShowAddEvidenceModal(true);
                                }}
                                className="px-2 py-1 text-[10px] font-semibold text-slate-700 bg-white hover:bg-slate-100 border border-slate-200 rounded transition-colors flex items-center gap-1"
                                title="Attach evidence"
                              >
                                <Paperclip size={12} />
                                <span>Attach Proof</span>
                              </button>

                              {ci.result === 'NON_COMPLIANT' && (
                                <button
                                  type="button"
                                  onClick={() => handleOpenLogFindingModal({ id: ci.id, title: ci.title, assessmentId: a.id })}
                                  className="px-2.5 py-1 text-[11px] font-semibold text-red-700 bg-red-50 hover:bg-red-100 rounded border border-red-200 transition-colors flex items-center gap-1"
                                >
                                  <AlertCircle size={12} />
                                  <span>Log Finding</span>
                                </button>
                              )}
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="text-xs text-slate-400 py-3 text-center bg-slate-50 rounded-lg border border-slate-200">
                          No checklist items configured for this execution run.
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12 bg-white rounded-xl border border-slate-200 text-slate-500 space-y-3">
                <Play className="w-10 h-10 text-teal-600 mx-auto" />
                <h4 className="text-sm font-bold text-slate-800">No Execution Runs Started Yet</h4>
                <p className="text-xs text-slate-400 max-w-sm mx-auto">
                  Audit execution runs instantiate controls from the framework into evaluable checklist items.
                </p>
                <button
                  onClick={() => handleStartAssessment(selectedPlan.id)}
                  className="px-4 py-2 text-xs font-bold text-white bg-teal-700 hover:bg-teal-800 rounded-lg shadow-sm"
                >
                  Start First Assessment Run
                </button>
              </div>
            )}
          </div>
        )}

        {/* TAB C: AUDIT FINDINGS */}
        {workspaceTab === 'findings' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Deficiency Findings & Verification</h3>
                <p className="text-xs text-slate-500">Track severity, remediation plans, and formal closure sign-off.</p>
              </div>
              <span className="text-xs font-semibold text-slate-600">
                Total: <strong className="text-slate-900">{allPlanFindings.length}</strong> Finding(s)
              </span>
            </div>

            {allPlanFindings.length > 0 ? (
              <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-100 shadow-xs overflow-hidden">
                {allPlanFindings.map((f) => {
                  const fCapas = f.capas || [];
                  const completedCapas = fCapas.filter((c) => c.status === CapaStatus.COMPLETED).length;

                  return (
                    <div key={f.id} className="p-4 hover:bg-slate-50/60 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div className="space-y-1.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${
                              f.severity === 'CRITICAL'
                                ? 'bg-red-100 text-red-800 border border-red-200'
                                : f.severity === 'HIGH'
                                ? 'bg-orange-100 text-orange-800 border border-orange-200'
                                : f.severity === 'MEDIUM'
                                ? 'bg-amber-100 text-amber-800 border border-amber-200'
                                : 'bg-slate-100 text-slate-700'
                            }`}
                          >
                            {f.severity}
                          </span>
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                              f.status === 'VERIFIED'
                                ? 'bg-emerald-100 text-emerald-800'
                                : f.status === 'READY_FOR_VERIFICATION'
                                ? 'bg-blue-100 text-blue-800'
                                : f.status === 'IN_REMEDIATION'
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-red-100 text-red-800'
                            }`}
                          >
                            {f.status}
                          </span>
                          <h4 className="text-sm font-semibold text-slate-900">{f.title}</h4>
                        </div>

                        {f.description && <p className="text-xs text-slate-600 line-clamp-1">{f.description}</p>}
                        {f.remediationPlan && (
                          <p className="text-[11px] text-slate-500 italic">Plan: {f.remediationPlan}</p>
                        )}

                        <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-400 pt-1">
                          <span>
                            Remediation Owner:{' '}
                            <strong className="text-slate-700">
                              {formatOwnerDisplay({
                                ownerId: f.ownerId,
                                ownerName: f.ownerName,
                                ownerEmail: f.ownerEmail,
                                fallback: 'Remediation Lead',
                              })}
                            </strong>
                          </span>
                          <span>•</span>
                          <span>
                            CAPA Actions: <strong className="text-teal-700">{fCapas.length}</strong> ({completedCapas} completed)
                          </span>
                          {f.verifiedByName && (
                            <>
                              <span>•</span>
                              <span className="text-emerald-700 font-semibold">
                                Verified by {f.verifiedByName} on {f.verifiedAt ? new Date(f.verifiedAt).toLocaleDateString() : ''}
                              </span>
                            </>
                          )}
                          {f.verificationNotes && (
                            <>
                              <span>•</span>
                              <span className="text-slate-500 italic">Notes: {f.verificationNotes}</span>
                            </>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            setEvidenceTarget({ findingId: f.id, title: f.title });
                            setShowAddEvidenceModal(true);
                          }}
                          className="px-2.5 py-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors flex items-center gap-1"
                        >
                          <Paperclip size={13} />
                          <span>Attach Evidence</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setActiveFindingForCapa(f);
                            setShowCapaModal(true);
                          }}
                          className="px-3 py-1.5 text-xs font-semibold text-teal-800 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-lg transition-colors flex items-center gap-1.5"
                        >
                          <Wrench size={13} />
                          <span>Manage CAPA ({fCapas.length})</span>
                        </button>

                        {(f.status === FindingStatus.READY_FOR_VERIFICATION || f.status === FindingStatus.IN_REMEDIATION) && (
                          <button
                            type="button"
                            onClick={() => handleOpenVerifyModal(f)}
                            className="px-3 py-1.5 text-xs font-bold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg transition-colors flex items-center gap-1.5 shadow-xs"
                          >
                            <Check size={13} />
                            <span>Verify & Close</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="p-12 text-center bg-white rounded-xl border border-slate-200 text-slate-500">
                <CheckCircle2 className="w-10 h-10 text-emerald-600 mx-auto mb-2" />
                <h4 className="font-bold text-slate-800 text-sm">Zero Non-Conformance Findings Logged</h4>
                <p className="text-xs text-slate-400 mt-1">Checklist evaluations have not uncovered any deficiencies for this audit plan.</p>
              </div>
            )}
          </div>
        )}

        {/* TAB D: CAPA ACTIONS */}
        {workspaceTab === 'capas' && (
          <div className="space-y-4">
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Corrective and Preventive Action (CAPA) Registry</h3>
                <p className="text-xs text-slate-500">
                  Track mitigation milestones. Completing all CAPAs automatically promotes findings to Ready for Verification.
                </p>
              </div>
              <span className="text-xs font-semibold text-slate-600">
                Total: <strong className="text-slate-900">{allPlanCapas.length}</strong> Action(s)
              </span>
            </div>

            {allPlanCapas.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {allPlanCapas.map((capa) => (
                  <div key={capa.id} className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs space-y-3">
                    <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-2">
                      <span className="text-[11px] font-bold text-teal-800 bg-teal-50 px-2 py-0.5 rounded border border-teal-200 line-clamp-1">
                        Finding: {capa.finding?.title}
                      </span>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                          capa.status === 'COMPLETED' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {capa.status}
                      </span>
                    </div>

                    <div>
                      <h4 className="text-sm font-semibold text-slate-900">{capa.title}</h4>
                      <div className="text-xs text-slate-600 mt-1 space-y-1">
                        <div>
                          <strong>Corrective Action:</strong> {capa.correctiveAction || (capa as any).action || (capa as any).description}
                        </div>
                        {capa.preventiveAction && (
                          <div>
                            <strong>Preventive Action:</strong> {capa.preventiveAction}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                      <div>
                        Responsible:{' '}
                        <strong className="text-slate-700">
                          {formatOwnerDisplay({
                            ownerId: capa.ownerId,
                            ownerName: capa.ownerName,
                            ownerEmail: capa.ownerEmail,
                            fallback: 'Remediation Lead',
                          })}
                        </strong>
                      </div>
                      {capa.status !== 'COMPLETED' ? (
                        <button
                          type="button"
                          disabled={updatingCapaId === capa.id}
                          onClick={() => handleUpdateCapaStatus(capa.id, CapaStatus.COMPLETED)}
                          className="px-2.5 py-1 text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded transition-colors disabled:opacity-50"
                        >
                          {updatingCapaId === capa.id ? 'Marking...' : 'Mark Completed'}
                        </button>
                      ) : (
                        <span className="text-[11px] text-emerald-700 font-bold flex items-center gap-1">
                          <CheckCircle2 size={12} /> Completed
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-12 text-center bg-white rounded-xl border border-slate-200 text-slate-500">
                <CheckSquare className="w-10 h-10 text-slate-400 mx-auto mb-2" />
                <h4 className="font-bold text-slate-800 text-sm">No CAPA Action Items Registered</h4>
                <p className="text-xs text-slate-400 mt-1">CAPAs are added from the Audit Findings tab to remediate identified gaps.</p>
              </div>
            )}
          </div>
        )}

        {/* TAB E: EVIDENCE & ARTIFACTS */}
        {workspaceTab === 'evidence' && (
          <div className="space-y-4">
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Audit Evidence & Normative Proof Vault</h3>
                <p className="text-xs text-slate-500">Proof artifacts attached to checklist evaluations and deficiency findings.</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setEvidenceTarget(null);
                  setShowAddEvidenceModal(true);
                }}
                className="px-3.5 py-1.5 text-xs font-bold text-white bg-teal-700 hover:bg-teal-800 rounded-lg shadow-sm transition-colors flex items-center gap-1.5"
              >
                <UploadCloud size={14} /> Attach Evidence
              </button>
            </div>

            {allPlanEvidence.length > 0 ? (
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
                    <tr>
                      <th className="p-3">File / Artifact</th>
                      <th className="p-3">Linked Context</th>
                      <th className="p-3">Uploader</th>
                      <th className="p-3">Size / Type</th>
                      <th className="p-3">Attached Date</th>
                      <th className="p-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {allPlanEvidence.map((ev) => (
                      <tr key={ev.id} className="hover:bg-slate-50 transition-colors">
                        <td className="p-3 font-semibold text-slate-900 flex items-center gap-2">
                          <Paperclip size={14} className="text-teal-700 shrink-0" />
                          <span className="line-clamp-1">{ev.fileName}</span>
                        </td>
                        <td className="p-3">
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-700 mr-1.5">
                            {ev.contextType}
                          </span>
                          <span className="text-slate-600 font-medium">{ev.contextTitle}</span>
                        </td>
                        <td className="p-3 text-slate-600">
                          {formatOwnerDisplay({ ownerId: ev.uploadedById, fallback: 'Auditor' })}
                        </td>
                        <td className="p-3 text-slate-500">
                          {ev.fileSize ? `${Math.round(ev.fileSize / 1024)} KB` : 'Unknown'} • {ev.mimeType || 'Document'}
                        </td>
                        <td className="p-3 text-slate-500">{new Date(ev.createdAt).toLocaleDateString()}</td>
                        <td className="p-3 text-right">
                          <a
                            href={ev.fileUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-teal-700 hover:text-teal-900 font-semibold"
                          >
                            <Download size={13} />
                            <span>Download</span>
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-12 text-center bg-white rounded-xl border border-slate-200 text-slate-500 space-y-2">
                <Paperclip className="w-10 h-10 text-slate-400 mx-auto" />
                <h4 className="font-bold text-slate-800 text-sm">No Evidence Documents Attached</h4>
                <p className="text-xs text-slate-400 max-w-sm mx-auto">
                  Attach documentation artifacts to prove compliance against checklists or demonstrate remediation for findings.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setEvidenceTarget(null);
                    setShowAddEvidenceModal(true);
                  }}
                  className="px-3.5 py-1.5 text-xs font-bold text-teal-800 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-lg transition-colors"
                >
                  Attach First Artifact
                </button>
              </div>
            )}
          </div>
        )}

        {/* TAB F: COMPLETION & HISTORY */}
        {workspaceTab === 'completion' && (
          <div className="space-y-6">
            {/* Completion Prerequisites Scorecard */}
            <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Audit Completion & Formal Sign-Off Readiness</h3>
                  <p className="text-xs text-slate-500">
                    Mandatory prerequisites derived from authoritative backend validation rules.
                  </p>
                </div>
                <div
                  className={`px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1.5 ${
                    selectedPlan.status === 'COMPLETED'
                      ? 'bg-emerald-100 text-emerald-800'
                      : eligibility.eligible
                      ? 'bg-teal-100 text-teal-800'
                      : 'bg-amber-100 text-amber-800'
                  }`}
                >
                  {selectedPlan.status === 'COMPLETED' ? (
                    <CheckCircle2 size={14} />
                  ) : eligibility.eligible ? (
                    <CheckCircle size={14} />
                  ) : (
                    <AlertOctagon size={14} />
                  )}
                  <span>
                    {selectedPlan.status === 'COMPLETED'
                      ? 'Completed & Finalized'
                      : eligibility.eligible
                      ? 'Eligible for Final Sign-Off'
                      : 'Completion Blocked'}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {eligibility.prerequisites.map((p) => (
                  <div
                    key={p.id}
                    className={`p-3.5 rounded-lg border text-xs flex items-start gap-3 ${
                      p.passed ? 'bg-emerald-50/60 border-emerald-200' : 'bg-rose-50/60 border-rose-200'
                    }`}
                  >
                    {p.passed ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    ) : (
                      <XCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                    )}
                    <div>
                      <div className="font-bold text-slate-900">{p.title}</div>
                      <div className={p.passed ? 'text-slate-600 mt-0.5' : 'text-rose-800 font-semibold mt-0.5'}>
                        {p.details}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Completion Action Button */}
              {selectedPlan.status !== 'COMPLETED' && (
                <div className="pt-4 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="text-xs text-slate-500">
                    {eligibility.eligible
                      ? 'All prerequisites satisfied. Clicking sign-off finalizes execution runs and records completion in the audit trail.'
                      : `Blocker: ${eligibility.reason}`}
                  </div>
                  <button
                    type="button"
                    disabled={!eligibility.eligible || completingPlanId === selectedPlan.id}
                    onClick={() => handleCompleteAudit(selectedPlan.id)}
                    className={`px-5 py-2.5 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-2 shrink-0 shadow-sm ${
                      eligibility.eligible
                        ? 'bg-emerald-700 hover:bg-emerald-800 text-white cursor-pointer'
                        : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                    }`}
                  >
                    {completingPlanId === selectedPlan.id ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Signing Off Audit...</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-4 h-4" />
                        <span>Complete & Sign Off Audit</span>
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>

            {/* Audit History Timeline */}
            <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <History size={16} className="text-teal-700" />
                  <span>Audit Lifecycle History & Event Trail</span>
                </h3>
                <span className="text-xs text-slate-400 font-medium">{planHistory.length} Recorded Event(s)</span>
              </div>

              {loadingHistory ? (
                <div className="p-8 text-center text-xs text-slate-500 flex items-center justify-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-teal-700" /> Loading lifecycle history from audit trail...
                </div>
              ) : planHistory.length > 0 ? (
                <div className="relative pl-6 space-y-4 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
                  {planHistory.map((item) => (
                    <div key={item.id} className="relative text-xs space-y-1">
                      <div className="absolute -left-6 top-1 w-2.5 h-2.5 rounded-full bg-teal-700 ring-4 ring-white" />
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded font-mono text-[10px]">
                          {item.action}
                        </span>
                        <span className="text-slate-400">•</span>
                        <span className="text-slate-600 font-semibold">{item.actorName}</span>
                        <span className="text-slate-400">•</span>
                        <span className="text-slate-400">{new Date(item.createdAt).toLocaleString()}</span>
                      </div>
                      {item.metadata && Object.keys(item.metadata).length > 0 && (
                        <div className="text-[11px] text-slate-500 bg-slate-50 p-2 rounded border border-slate-100">
                          {JSON.stringify(item.metadata)}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-8 text-center text-xs text-slate-400 bg-slate-50 rounded-lg">
                  No lifecycle events recorded for this audit plan yet.
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ----------------------------------------------------
  // RENDER: Catalog View (Audit Plans, Execution Runs, Findings)
  // ----------------------------------------------------
  return (
    <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 py-6 omni-fade-in space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <ClipboardList size={22} className="text-teal-700" />
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Audit Management</h1>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Authoritative framework audit plans, clause scoping, execution checklists & verified CAPA remediation.
          </p>
        </div>
        <button
          onClick={() => setShowPlanModal(true)}
          className="inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg transition-colors shadow-sm"
        >
          <Plus size={16} /> Create Scoped Audit Plan
        </button>
      </div>

      {/* Catalog Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 overflow-x-auto pb-1 omni-scroll">
        {[
          { id: 'plans', label: 'Audit Plans' },
          { id: 'assessments', label: 'Active Execution Runs' },
          { id: 'findings', label: 'Audit Findings & Verification' },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id as any)}
            className={`px-4 py-2 text-xs font-semibold rounded-t-md transition-colors whitespace-nowrap ${
              activeTab === t.id
                ? 'bg-white border border-slate-200 border-b-white text-teal-800 -mb-px shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* TAB 1: AUDIT PLANS */}
      {activeTab === 'plans' && (
        <div className="space-y-4">
          {/* Filter Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3 rounded-xl border border-slate-200 shadow-xs">
            <div className="flex flex-wrap items-center gap-3">
              <ComplianceScopeFilter
                selectedFrameworkId={filterFrameworkId}
                onFrameworkChange={(id) => setFilterFrameworkId(id)}
              />

              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                aria-label="Filter by Audit Status"
                className="bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm hover:border-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-600"
              >
                <option value="">All Lifecycle Statuses</option>
                <option value="DRAFT">Draft</option>
                <option value="IN_PROGRESS">In Progress</option>
                <option value="COMPLETED">Completed</option>
                <option value="ARCHIVED">Archived</option>
              </select>

              <div className="relative">
                <input
                  type="text"
                  placeholder="Search plans or frameworks..."
                  value={filterSearch}
                  onChange={(e) => setFilterSearch(e.target.value)}
                  className="bg-white border border-slate-300 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-600 w-52 sm:w-64"
                />
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                {filterSearch && (
                  <button
                    onClick={() => setFilterSearch('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
            </div>

            <div className="text-xs text-slate-500 font-medium">
              Showing <span className="font-bold text-slate-800">{plans.length}</span> plan(s)
            </div>
          </div>

          {loading ? (
            <div className="p-12 text-center text-sm text-slate-500 flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-teal-700" /> Loading authoritative audit plans...
            </div>
          ) : plans.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-xl p-12 text-center text-slate-500 space-y-2">
              <ClipboardList className="w-8 h-8 text-slate-400 mx-auto" />
              <div className="font-semibold text-slate-700">No audit plans match the selected criteria.</div>
              <p className="text-xs text-slate-400">Try resetting filters or create a new scoped audit plan.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {plans.map((p) => {
                const scopeCount = p.scopeReferences?.length || 0;
                const rag = getAuditPlanRag(p.status, p.assessments, {
                  frameworkCode: p.frameworkCode,
                  frameworkId: p.frameworkId,
                  frameworkName: p.frameworkName,
                  scopeReferences: p.scopeReferences,
                });

                return (
                  <div
                    key={p.id}
                    onClick={() => {
                      setSelectedPlan(p);
                      setWorkspaceTab('overview');
                    }}
                    role="button"
                    tabIndex={0}
                    aria-label={`Open workspace for ${p.title}`}
                    className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm hover:border-slate-300 hover:shadow-md cursor-pointer transition-all flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span className="omni-mono text-xs font-bold text-teal-900 bg-teal-50 px-2.5 py-0.5 rounded border border-teal-200">
                          {p.frameworkName || p.frameworkCode || 'UNSPECIFIED'}
                        </span>
                        <RagStatusBadge status={rag.status} label={rag.label} detail={rag.detail} size="sm" />
                      </div>

                      <h3 className="font-semibold text-slate-900 text-base mb-1">{p.title}</h3>
                      <p className="text-xs text-slate-500 line-clamp-2 mb-3">{p.objective || 'No objective specified.'}</p>

                      {/* Scoped Clauses Badge */}
                      <div className="mb-3">
                        <div className="text-[11px] font-bold text-slate-600 mb-1 flex items-center gap-1">
                          <ShieldCheck className="w-3.5 h-3.5 text-teal-600" />
                          <span>Scope: {scopeCount} Clause(s) / Reference(s)</span>
                        </div>
                        {scopeCount > 0 ? (
                          <div className="flex flex-wrap gap-1 max-h-14 overflow-hidden">
                            {p.scopeReferences?.slice(0, 4).map((sr) => (
                              <span
                                key={sr.id}
                                className="inline-block text-[10px] font-mono font-medium bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded border border-slate-200"
                              >
                                {sr.identifier}
                              </span>
                            ))}
                            {scopeCount > 4 && (
                              <span className="text-[10px] text-slate-500 font-medium px-1 py-0.5">
                                +{scopeCount - 4} more
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-[11px] text-slate-400 italic">Entire framework baseline</span>
                        )}
                      </div>

                      <div className="text-xs text-slate-600 space-y-1.5 pt-2 border-t border-slate-100">
                        <div className="flex items-center justify-between">
                          <span className="text-slate-500 font-medium">Lead Owner:</span>
                          <span className="font-semibold text-slate-800">
                            {formatOwnerDisplay({
                              ownerId: p.ownerId,
                              ownerName: p.ownerName,
                              ownerEmail: p.ownerEmail,
                              teamName: p.teamName,
                            })}
                          </span>
                        </div>
                        {p.teamName && (
                          <div className="flex items-center justify-between">
                            <span className="text-slate-500 font-medium">Assigned Team:</span>
                            <span className="font-semibold text-slate-700">{p.teamName}</span>
                          </div>
                        )}
                        <div className="flex items-center justify-between">
                          <span className="text-slate-500 font-medium">Execution Runs:</span>
                          <span className="font-semibold text-slate-800">{p.assessments?.length || 0}</span>
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedPlan(p);
                          setWorkspaceTab('overview');
                        }}
                        className="text-xs font-semibold text-teal-700 hover:text-teal-900 flex items-center gap-1"
                      >
                        Manage Audit Workspace <ArrowRight size={13} />
                      </button>
                      {p.status === 'DRAFT' && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleStartAssessment(p.id);
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold bg-teal-50 text-teal-700 hover:bg-teal-100 rounded"
                        >
                          <Play size={12} /> Start Run
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: ACTIVE EXECUTION RUNS */}
      {activeTab === 'assessments' && (
        <div className="space-y-4">
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-slate-800">Compliance Audit Execution Runs</h2>
              <p className="text-xs text-slate-500">Live assessments, checklist progress, and authoritative score recalculations.</p>
            </div>
            <div className="text-xs text-slate-500 font-medium">
              Total Runs: <span className="font-bold text-slate-800">{plans.reduce((acc, p) => acc + (p.assessments?.length || 0), 0)}</span>
            </div>
          </div>

          {(() => {
            const allRuns = plans.flatMap((p) => (p.assessments || []).map((a) => ({ ...a, plan: p })));

            if (allRuns.length === 0) {
              return (
                <div className="bg-white border border-slate-200 rounded-xl p-12 text-center text-slate-500">
                  <Play className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                  <div className="font-semibold text-slate-700">No active execution runs exist.</div>
                  <p className="text-xs text-slate-400 mt-1">Start a run on any DRAFT audit plan to initiate auditor evaluation.</p>
                </div>
              );
            }

            return (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {allRuns.map((run) => {
                  const checkItems = run.checkItems || [];
                  const total = checkItems.length;
                  const compliant = checkItems.filter((i) => i.result === 'COMPLIANT').length;
                  const nonCompliant = checkItems.filter((i) => i.result === 'NON_COMPLIANT').length;
                  const unevaluated = checkItems.filter((i) => i.result === 'NOT_EVALUATED').length;

                  return (
                    <div
                      key={run.id}
                      className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm hover:border-slate-300 transition-all flex flex-col justify-between"
                    >
                      <div>
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <span className="omni-mono text-xs font-bold text-teal-900 bg-teal-50 px-2.5 py-0.5 rounded border border-teal-200">
                            {run.plan.frameworkName || run.plan.frameworkCode || 'UNSPECIFIED'}
                          </span>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded uppercase bg-slate-100 text-slate-700">
                            {run.status}
                          </span>
                        </div>

                        <h3 className="font-semibold text-slate-900 text-base mb-1">{run.plan.title}</h3>
                        <div className="text-xs text-slate-500 mb-3 flex items-center gap-1">
                          <User size={13} className="text-teal-700" />
                          <span>
                            Auditor:{' '}
                            <strong className="text-slate-700">
                              {formatOwnerDisplay({
                                ownerId: run.auditorId,
                                ownerName: run.auditorName,
                                ownerEmail: run.auditorEmail,
                                fallback: 'Lead Auditor',
                              })}
                            </strong>
                          </span>
                        </div>

                        {/* Authoritative Score Indicator */}
                        <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 mb-3">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-semibold text-slate-700">Authoritative Score</span>
                            <span className="text-sm font-bold text-teal-800 omni-mono">{run.score}%</span>
                          </div>
                          <div className="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden">
                            <div
                              className="bg-teal-600 h-1.5 rounded-full transition-all"
                              style={{ width: `${Math.min(100, Math.max(0, run.score))}%` }}
                            />
                          </div>

                          <div className="flex items-center justify-between text-[11px] text-slate-500 mt-2 pt-2 border-t border-slate-200/60">
                            <span>Check Items: {total}</span>
                            <span className="text-emerald-700 font-semibold">{compliant} Pass</span>
                            <span className="text-red-700 font-semibold">{nonCompliant} Fail</span>
                            <span className="text-slate-500">{unevaluated} Unevaluated</span>
                          </div>
                        </div>
                      </div>

                      <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                        <div className="text-[11px] text-slate-400">
                          Findings: <span className="font-bold text-slate-700">{run.findings?.length || 0}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedPlan(run.plan);
                            setWorkspaceTab('execution');
                          }}
                          className="px-3 py-1.5 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg transition-colors flex items-center gap-1 shadow-xs"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>Open Workspace</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>
      )}

      {/* TAB 3: AUDIT FINDINGS & VERIFICATION */}
      {activeTab === 'findings' && (
        <div className="space-y-4">
          {/* Finding Filter Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3 rounded-xl border border-slate-200 shadow-xs">
            <div className="flex flex-wrap items-center gap-3">
              <select
                value={findingFilterStatus}
                onChange={(e) => setFindingFilterStatus(e.target.value)}
                aria-label="Filter by Finding Status"
                className="bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm hover:border-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-600"
              >
                <option value="">All Finding Statuses</option>
                <option value="OPEN">Open</option>
                <option value="IN_REMEDIATION">In Remediation</option>
                <option value="READY_FOR_VERIFICATION">Ready for Verification</option>
                <option value="VERIFIED">Verified</option>
                <option value="CLOSED">Closed</option>
              </select>

              <select
                value={findingFilterSeverity}
                onChange={(e) => setFindingFilterSeverity(e.target.value)}
                aria-label="Filter by Finding Severity"
                className="bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm hover:border-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-600"
              >
                <option value="">All Severities</option>
                <option value="CRITICAL">Critical</option>
                <option value="HIGH">High</option>
                <option value="MEDIUM">Medium</option>
                <option value="LOW">Low</option>
              </select>

              <div className="relative">
                <input
                  type="text"
                  placeholder="Search findings..."
                  value={findingSearch}
                  onChange={(e) => setFindingSearch(e.target.value)}
                  className="bg-white border border-slate-300 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-600 w-52 sm:w-64"
                />
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                {findingSearch && (
                  <button
                    onClick={() => setFindingSearch('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
            </div>

            <div className="text-xs text-slate-500 font-medium">
              Showing <span className="font-bold text-slate-800">{findings.length}</span> finding(s)
            </div>
          </div>

          {loadingFindings ? (
            <div className="p-12 text-center text-sm text-slate-500 flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-teal-700" /> Loading audit findings...
            </div>
          ) : findings.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-xl p-12 text-center text-slate-500 space-y-2">
              <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto" />
              <div className="font-semibold text-slate-700">No audit findings match the selected criteria.</div>
              <p className="text-xs text-slate-400">All evaluated controls are conformant, or try broadening your filters.</p>
            </div>
          ) : (
            <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-100 shadow-xs overflow-hidden">
              {findings.map((f) => {
                const capas = f.capas || [];
                const completedCapas = capas.filter((c) => c.status === CapaStatus.COMPLETED).length;

                return (
                  <div key={f.id} className="p-4 hover:bg-slate-50 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${
                            f.severity === 'CRITICAL'
                              ? 'bg-red-100 text-red-800 border border-red-200'
                              : f.severity === 'HIGH'
                              ? 'bg-orange-100 text-orange-800 border border-orange-200'
                              : f.severity === 'MEDIUM'
                              ? 'bg-amber-100 text-amber-800 border border-amber-200'
                              : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {f.severity}
                        </span>
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                            f.status === 'VERIFIED'
                              ? 'bg-emerald-100 text-emerald-800'
                              : f.status === 'READY_FOR_VERIFICATION'
                              ? 'bg-blue-100 text-blue-800'
                              : f.status === 'IN_REMEDIATION'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-red-100 text-red-800'
                          }`}
                        >
                          {f.status}
                        </span>
                        <h4 className="text-sm font-semibold text-slate-900">{f.title}</h4>
                      </div>

                      {f.description && <p className="text-xs text-slate-500 line-clamp-1">{f.description}</p>}

                      <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-400 pt-1">
                        <span>
                          Lead Owner:{' '}
                          <strong className="text-slate-600">
                            {formatOwnerDisplay({
                              ownerId: f.ownerId,
                              ownerName: f.ownerName,
                              ownerEmail: f.ownerEmail,
                              fallback: 'Unassigned',
                            })}
                          </strong>
                        </span>
                        <span>•</span>
                        <span>
                          CAPA: <strong className="text-teal-700">{capas.length}</strong> action(s) ({completedCapas} completed)
                        </span>
                        {f.verificationNotes && (
                          <>
                            <span>•</span>
                            <span className="text-emerald-700 italic">Notes: {f.verificationNotes}</span>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          setActiveFindingForCapa(f);
                          setShowCapaModal(true);
                        }}
                        className="px-3 py-1.5 text-xs font-semibold text-teal-800 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-lg transition-colors flex items-center gap-1.5"
                      >
                        <Wrench className="w-3.5 h-3.5" />
                        <span>Manage CAPA ({capas.length})</span>
                      </button>

                      {(f.status === FindingStatus.READY_FOR_VERIFICATION || f.status === FindingStatus.IN_REMEDIATION) && (
                        <button
                          type="button"
                          onClick={() => handleOpenVerifyModal(f)}
                          className="px-3 py-1.5 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg transition-colors flex items-center gap-1.5 shadow-xs"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>Verify</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* CREATE AUDIT PLAN MODAL */}
      {showPlanModal && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-60 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white rounded-xl max-w-2xl w-full p-5 sm:p-6 shadow-2xl max-h-[90dvh] overflow-y-auto omni-scroll border border-slate-200">
            <div className="flex items-center justify-between border-b pb-3 mb-4">
              <h2 className="text-base font-bold text-slate-900">Create Scoped Audit Plan</h2>
              <button
                type="button"
                onClick={() => setShowPlanModal(false)}
                className="text-slate-400 hover:text-slate-700"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreatePlan} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Audit Plan Title *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Q4 SOC2 Security & Access Controls Audit"
                  value={planTitle}
                  onChange={(e) => setPlanTitle(e.target.value)}
                  className="w-full text-xs border rounded-lg p-2.5 bg-white border-slate-300 focus:outline-none focus:ring-2 focus:ring-teal-600"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Audit Objective</label>
                <textarea
                  rows={2}
                  placeholder="e.g. Evaluate operational effectiveness of MFA and privileged identity management."
                  value={objective}
                  onChange={(e) => setObjective(e.target.value)}
                  className="w-full text-xs border rounded-lg p-2.5 bg-white border-slate-300 focus:outline-none focus:ring-2 focus:ring-teal-600"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Lead Audit Owner</label>
                {orgMembers.length > 0 ? (
                  <select
                    value={ownerId}
                    onChange={(e) => setOwnerId(e.target.value)}
                    className="w-full text-xs border rounded-lg p-2.5 bg-white border-slate-300 focus:outline-none focus:ring-2 focus:ring-teal-600"
                  >
                    {orgMembers.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name || m.email} ({m.role || 'Member'})
                      </option>
                    ))}
                    <option value="Lead Auditor">Lead Auditor (Default Role)</option>
                  </select>
                ) : (
                  <input
                    type="text"
                    value={ownerId}
                    onChange={(e) => setOwnerId(e.target.value)}
                    className="w-full text-xs border rounded-lg p-2.5 bg-white border-slate-300"
                  />
                )}
              </div>

              {/* Dynamic Catalog Scoping */}
              <div className="border border-slate-200 rounded-lg p-4 bg-slate-50 space-y-3">
                <div className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                  <ShieldCheck size={14} className="text-teal-700" />
                  <span>Authoritative Framework Baseline Scoping</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Framework</label>
                    <select
                      value={selectedFrameworkId}
                      onChange={(e) => setSelectedFrameworkId(e.target.value)}
                      disabled={loadingFrameworks}
                      className="w-full text-xs border rounded-lg p-2 bg-white border-slate-300"
                    >
                      <option value="">Select Framework...</option>
                      {availableFrameworks.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.name} ({f.code})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Version</label>
                    <select
                      value={selectedVersionId}
                      onChange={(e) => setSelectedVersionId(e.target.value)}
                      disabled={!selectedFrameworkId || loadingVersions}
                      className="w-full text-xs border rounded-lg p-2 bg-white border-slate-300 disabled:bg-slate-100"
                    >
                      <option value="">Select Version...</option>
                      {availableVersions.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {selectedVersionId && (
                  <div className="pt-2 border-t border-slate-200 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-slate-700">
                        Normative Clauses ({selectedReferenceIds.length} selected of {availableReferences.length})
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={selectAllClauses}
                          className="text-[11px] font-semibold text-teal-700 hover:underline"
                        >
                          Select All
                        </button>
                        <span>•</span>
                        <button
                          type="button"
                          onClick={clearAllClauses}
                          className="text-[11px] font-semibold text-slate-500 hover:underline"
                        >
                          Clear
                        </button>
                      </div>
                    </div>

                    <input
                      type="text"
                      placeholder="Search clauses..."
                      value={clauseSearch}
                      onChange={(e) => setClauseSearch(e.target.value)}
                      className="w-full text-xs border rounded p-1.5 bg-white border-slate-300"
                    />

                    <div className="max-h-40 overflow-y-auto border border-slate-200 rounded bg-white p-2 divide-y divide-slate-100 omni-scroll">
                      {filteredClauses.map((r) => {
                        const checked = selectedReferenceIds.includes(r.id);
                        return (
                          <label key={r.id} className="flex items-start gap-2 py-1.5 cursor-pointer hover:bg-slate-50 text-xs">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleClauseSelection(r.id)}
                              className="mt-0.5 rounded text-teal-600 focus:ring-teal-500"
                            />
                            <div>
                              <span className="font-mono font-bold text-teal-900 mr-1.5">{r.identifier}</span>
                              <span className="text-slate-700">{r.title}</span>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowPlanModal(false)}
                  className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-bold text-white bg-teal-700 hover:bg-teal-800 rounded-lg shadow-sm"
                >
                  Create Plan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CAPA CREATION & MANAGEMENT MODAL */}
      {showCapaModal && activeFindingForCapa && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-70 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white rounded-xl max-w-3xl w-full shadow-2xl max-h-[90dvh] flex flex-col overflow-hidden border border-slate-200">
            <div className="flex items-center justify-between border-b pb-3 p-5 sm:p-6 shrink-0 bg-white">
              <div>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-teal-50 text-teal-800 border border-teal-200 uppercase">
                  CAPA Remediation Workflow
                </span>
                <h3 className="text-base font-bold text-slate-900 mt-1">Actions for: {activeFindingForCapa.title}</h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowCapaModal(false);
                  setActiveFindingForCapa(null);
                }}
                className="text-slate-400 hover:text-slate-700 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-6 omni-scroll">
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-slate-700">Finding Status:</span>
                  <span className="font-bold text-teal-800 uppercase">{activeFindingForCapa.status}</span>
                  <span>•</span>
                  <span className="font-semibold text-slate-700">Severity:</span>
                  <span className="font-bold text-red-700">{activeFindingForCapa.severity}</span>
                </div>
                {activeFindingForCapa.description && <p className="text-slate-600">{activeFindingForCapa.description}</p>}
              </div>

              {/* Registered Actions */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                  Associated CAPA Action Items ({(activeFindingForCapa.capas || []).length})
                </h4>
                {(activeFindingForCapa.capas || []).length > 0 ? (
                  <div className="space-y-2">
                    {activeFindingForCapa.capas?.map((capa) => (
                      <div key={capa.id} className="p-3 bg-white rounded-lg border border-slate-200 text-xs space-y-2 shadow-xs">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-slate-900">{capa.title}</span>
                          <div className="flex items-center gap-2">
                            <span
                              className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                                capa.status === 'COMPLETED' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                              }`}
                            >
                              {capa.status}
                            </span>
                            {capa.status !== 'COMPLETED' && (
                              <button
                                type="button"
                                disabled={updatingCapaId === capa.id}
                                onClick={() => handleUpdateCapaStatus(capa.id, CapaStatus.COMPLETED)}
                                className="px-2 py-1 text-[10px] font-bold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 rounded transition-colors disabled:opacity-50"
                              >
                                {updatingCapaId === capa.id ? 'Marking...' : 'Mark Completed'}
                              </button>
                            )}
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-slate-600">
                          <div>
                            <strong>Corrective Action:</strong> {capa.correctiveAction}
                          </div>
                          {capa.preventiveAction && (
                            <div>
                              <strong>Preventive Action:</strong> {capa.preventiveAction}
                            </div>
                          )}
                        </div>

                        <div className="pt-1 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
                          <span>
                            Owner:{' '}
                            {formatOwnerDisplay({
                              ownerId: capa.ownerId,
                              ownerName: capa.ownerName,
                              ownerEmail: capa.ownerEmail,
                              fallback: 'Remediation Lead',
                            })}
                          </span>
                          {capa.dueDate && <span>Due: {new Date(capa.dueDate).toLocaleDateString()}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-6 text-center text-xs text-slate-400 bg-slate-50 border border-slate-200 rounded-lg">
                    No CAPA items registered yet for this finding. Add an action below to advance finding into remediation.
                  </div>
                )}
              </div>

              {/* Add New CAPA Form */}
              <form onSubmit={handleCreateCapa} className="border-t border-slate-200 pt-4 space-y-3">
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Add New Action Item</h4>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Action Title *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Enforce MFA across identity directory"
                    value={capaForm.title}
                    onChange={(e) => setCapaForm({ ...capaForm, title: e.target.value })}
                    className="w-full text-xs border rounded-lg p-2.5 bg-white border-slate-300"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Corrective Action *</label>
                  <textarea
                    rows={2}
                    required
                    placeholder="Immediate steps taken to eliminate non-compliance..."
                    value={capaForm.correctiveAction}
                    onChange={(e) => setCapaForm({ ...capaForm, correctiveAction: e.target.value })}
                    className="w-full text-xs border rounded-lg p-2 bg-white border-slate-300"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Preventive Action</label>
                  <textarea
                    rows={2}
                    placeholder="Systemic adjustments to prevent recurrence..."
                    value={capaForm.preventiveAction}
                    onChange={(e) => setCapaForm({ ...capaForm, preventiveAction: e.target.value })}
                    className="w-full text-xs border rounded-lg p-2 bg-white border-slate-300"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Responsible Owner</label>
                    {orgMembers.length > 0 ? (
                      <select
                        value={capaForm.ownerId}
                        onChange={(e) => setCapaForm({ ...capaForm, ownerId: e.target.value })}
                        className="w-full text-xs border rounded-lg p-2 bg-white border-slate-300"
                      >
                        {orgMembers.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.name || m.email}
                          </option>
                        ))}
                        <option value="Remediation Lead">Remediation Lead (Default)</option>
                      </select>
                    ) : (
                      <input
                        type="text"
                        value={capaForm.ownerId}
                        onChange={(e) => setCapaForm({ ...capaForm, ownerId: e.target.value })}
                        className="w-full text-xs border rounded-lg p-2 bg-white border-slate-300"
                      />
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Due Date</label>
                    <input
                      type="date"
                      value={capaForm.dueDate}
                      onChange={(e) => setCapaForm({ ...capaForm, dueDate: e.target.value })}
                      className="w-full text-xs border rounded-lg p-2 bg-white border-slate-300"
                    />
                  </div>
                </div>

                <div className="pt-2 flex justify-end">
                  <button
                    type="submit"
                    disabled={submittingCapa}
                    className="px-4 py-2 text-xs font-bold text-white bg-teal-700 hover:bg-teal-800 rounded-lg shadow-sm disabled:opacity-50"
                  >
                    {submittingCapa ? 'Creating Action...' : 'Add CAPA Action'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* FORMAL VERIFICATION MODAL */}
      {showVerifyModal && verifyTarget && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-70 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white rounded-xl max-w-lg w-full p-5 sm:p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between border-b pb-3 mb-4">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Check className="w-5 h-5 text-emerald-600" />
                <span>Formal Finding Verification Sign-Off</span>
              </h3>
              <button type="button" onClick={() => setShowVerifyModal(false)} className="text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleConfirmVerification} className="space-y-4">
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs">
                <div className="font-bold text-slate-900">{verifyTarget.title}</div>
                <div className="text-slate-500 mt-1">Severity: {verifyTarget.severity} • Status: {verifyTarget.status}</div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Verification Status *</label>
                <select
                  value={verifyStatus}
                  onChange={(e) => setVerifyStatus(e.target.value as any)}
                  className="w-full text-xs border rounded-lg p-2.5 bg-white border-slate-300"
                >
                  <option value={FindingStatus.VERIFIED}>VERIFIED — Remediation inspected and confirmed effective</option>
                  <option value={FindingStatus.CLOSED}>CLOSED — Fully verified and formally archived</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Auditor Verification Notes</label>
                <textarea
                  rows={3}
                  placeholder="Record formal verification observations, evidence links, or compliance conclusions..."
                  value={verifyNotes}
                  onChange={(e) => setVerifyNotes(e.target.value)}
                  className="w-full text-xs border rounded-lg p-2.5 bg-white border-slate-300"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowVerifyModal(false)}
                  className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingVerify}
                  className="px-4 py-2 text-xs font-bold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg shadow-sm disabled:opacity-50"
                >
                  {submittingVerify ? 'Verifying...' : 'Sign Off Verification'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* LOG FINDING FROM CHECK ITEM MODAL */}
      {showLogFindingModal && targetCheckItem && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-70 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white rounded-xl max-w-lg w-full p-5 sm:p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between border-b pb-3 mb-4">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-red-600" />
                <span>Log Non-Conformance Finding</span>
              </h3>
              <button type="button" onClick={() => setShowLogFindingModal(false)} className="text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleLogFindingSubmit} className="space-y-4">
              <div className="p-3 bg-red-50 rounded-lg border border-red-200 text-xs">
                <div className="font-bold text-red-950">Failed Evaluation Item</div>
                <div className="text-red-800 mt-0.5">{targetCheckItem.title}</div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Finding Title *</label>
                <input
                  type="text"
                  required
                  value={logFindingForm.title}
                  onChange={(e) => setLogFindingForm({ ...logFindingForm, title: e.target.value })}
                  className="w-full text-xs border rounded-lg p-2.5 bg-white border-slate-300"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Deficiency Description</label>
                <textarea
                  rows={2}
                  placeholder="Explain the non-conformance observation..."
                  value={logFindingForm.description}
                  onChange={(e) => setLogFindingForm({ ...logFindingForm, description: e.target.value })}
                  className="w-full text-xs border rounded-lg p-2.5 bg-white border-slate-300"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Severity</label>
                  <select
                    value={logFindingForm.severity}
                    onChange={(e) => setLogFindingForm({ ...logFindingForm, severity: e.target.value as any })}
                    className="w-full text-xs border rounded-lg p-2.5 bg-white border-slate-300"
                  >
                    <option value={VulnerabilitySeverity.CRITICAL}>Critical</option>
                    <option value={VulnerabilitySeverity.HIGH}>High</option>
                    <option value={VulnerabilitySeverity.MEDIUM}>Medium</option>
                    <option value={VulnerabilitySeverity.LOW}>Low</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Remediation Owner</label>
                  {orgMembers.length > 0 ? (
                    <select
                      value={logFindingForm.ownerId}
                      onChange={(e) => setLogFindingForm({ ...logFindingForm, ownerId: e.target.value })}
                      className="w-full text-xs border rounded-lg p-2.5 bg-white border-slate-300"
                    >
                      {orgMembers.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name || m.email}
                        </option>
                      ))}
                      <option value="Compliance Lead">Compliance Lead (Default)</option>
                    </select>
                  ) : (
                    <input
                      type="text"
                      value={logFindingForm.ownerId}
                      onChange={(e) => setLogFindingForm({ ...logFindingForm, ownerId: e.target.value })}
                      className="w-full text-xs border rounded-lg p-2.5 bg-white border-slate-300"
                    />
                  )}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Target Remediation Plan</label>
                <textarea
                  rows={2}
                  placeholder="Outline expected remediation milestones..."
                  value={logFindingForm.remediationPlan}
                  onChange={(e) => setLogFindingForm({ ...logFindingForm, remediationPlan: e.target.value })}
                  className="w-full text-xs border rounded-lg p-2.5 bg-white border-slate-300"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowLogFindingModal(false)}
                  className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingFinding}
                  className="px-4 py-2 text-xs font-bold text-white bg-red-700 hover:bg-red-800 rounded-lg shadow-sm disabled:opacity-50"
                >
                  {submittingFinding ? 'Logging...' : 'Log Finding'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ATTACH EVIDENCE MODAL */}
      {showAddEvidenceModal && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-70 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white rounded-xl max-w-lg w-full p-5 sm:p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between border-b pb-3 mb-4">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Paperclip className="w-5 h-5 text-teal-700" />
                <span>Attach Audit Evidence Artifact</span>
              </h3>
              <button type="button" onClick={() => setShowAddEvidenceModal(false)} className="text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAttachEvidence} className="space-y-4">
              {evidenceTarget?.title ? (
                <div className="p-3 bg-teal-50 rounded-lg border border-teal-200 text-xs">
                  <span className="font-bold text-teal-950">Attaching to:</span>{' '}
                  <span className="text-teal-900">{evidenceTarget.title}</span>
                </div>
              ) : selectedPlan && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Target Context Item</label>
                  <select
                    onChange={(e) => {
                      const val = e.target.value;
                      if (!val) {
                        setEvidenceTarget(null);
                      } else if (val.startsWith('ci:')) {
                        const id = val.replace('ci:', '');
                        const item = allPlanCheckItems.find((c) => c.id === id);
                        setEvidenceTarget({ checkItemId: id, title: item?.title });
                      } else if (val.startsWith('find:')) {
                        const id = val.replace('find:', '');
                        const item = allPlanFindings.find((f) => f.id === id);
                        setEvidenceTarget({ findingId: id, title: item?.title });
                      }
                    }}
                    className="w-full text-xs border rounded-lg p-2.5 bg-white border-slate-300"
                  >
                    <option value="">Select target checklist or finding...</option>
                    <optgroup label="Checklist Items">
                      {allPlanCheckItems.map((c) => (
                        <option key={c.id} value={`ci:${c.id}`}>
                          {c.title}
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="Deficiency Findings">
                      {allPlanFindings.map((f) => (
                        <option key={f.id} value={`find:${f.id}`}>
                          {f.title}
                        </option>
                      ))}
                    </optgroup>
                  </select>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Evidence Artifact Filename *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. mfa_directory_policy_signed.pdf"
                  value={evidenceForm.fileName}
                  onChange={(e) => setEvidenceForm({ ...evidenceForm, fileName: e.target.value })}
                  className="w-full text-xs border rounded-lg p-2.5 bg-white border-slate-300"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Evidence URL / Storage URI</label>
                <input
                  type="text"
                  placeholder="e.g. https://vault.omnigrc.internal/evidence/mfa_policy.pdf"
                  value={evidenceForm.fileUrl}
                  onChange={(e) => setEvidenceForm({ ...evidenceForm, fileUrl: e.target.value })}
                  className="w-full text-xs border rounded-lg p-2.5 bg-white border-slate-300"
                />
                <span className="text-[10px] text-slate-400 mt-1 block">
                  Leave blank to auto-generate a secure vault reference.
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">MIME Type</label>
                  <select
                    value={evidenceForm.mimeType}
                    onChange={(e) => setEvidenceForm({ ...evidenceForm, mimeType: e.target.value })}
                    className="w-full text-xs border rounded-lg p-2.5 bg-white border-slate-300"
                  >
                    <option value="application/pdf">PDF Document (application/pdf)</option>
                    <option value="image/png">PNG Screenshot (image/png)</option>
                    <option value="application/json">JSON Telemetry (application/json)</option>
                    <option value="text/csv">CSV Export (text/csv)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">File Size (Bytes)</label>
                  <input
                    type="number"
                    placeholder="2048"
                    value={evidenceForm.fileSize}
                    onChange={(e) => setEvidenceForm({ ...evidenceForm, fileSize: e.target.value })}
                    className="w-full text-xs border rounded-lg p-2.5 bg-white border-slate-300"
                  />
                </div>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddEvidenceModal(false)}
                  className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingEvidence}
                  className="px-4 py-2 text-xs font-bold text-white bg-teal-700 hover:bg-teal-800 rounded-lg shadow-sm disabled:opacity-50"
                >
                  {submittingEvidence ? 'Attaching...' : 'Attach Evidence'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
