'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  ClipboardList, Plus, CheckCircle, AlertOctagon, Clock, ShieldCheck,
  FileText, Play, CheckCircle2, XCircle, HelpCircle, Layers, Search, Filter, X, Loader2,
  AlertCircle, CheckSquare, Wrench, ArrowRight, Check, Eye, Tag
} from 'lucide-react';
import { apiRequest } from '@/lib/api-client';
import {
  AuditPlanDto,
  AuditAssessmentDto,
  AuditFindingDto,
  AuditCapaDto,
  AuditPlanStatus,
  AuditAssessmentStatus,
  AuditCheckResult,
  FindingStatus,
  CapaStatus,
  VulnerabilitySeverity,
  PaginatedAuditPlansDto,
  PaginatedAuditFindingsDto,
  calculateAuditScore,
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

export function AuditListView() {
  const { addToast } = useToast();
  const [activeTab, setActiveTab] = useState<'plans' | 'assessments' | 'findings'>('plans');
  const [plans, setPlans] = useState<AuditPlanDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [showPlanModal, setShowPlanModal] = useState(false);
  const [showAssessmentModal, setShowAssessmentModal] = useState(false);
  const [showFindingModal, setShowFindingModal] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<AuditPlanDto | null>(null);
  const [selectedAssessment, setSelectedAssessment] = useState<AuditAssessmentDto | null>(null);

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

  // Form State - Finding
  const [findingTitle, setFindingTitle] = useState('');
  const [severity, setSeverity] = useState<VulnerabilitySeverity>(VulnerabilitySeverity.HIGH);
  const [findingOwner, setFindingOwner] = useState('Compliance Team');
  const [submitting, setSubmitting] = useState(false);

  // Findings Tab State
  const [findings, setFindings] = useState<AuditFindingDto[]>([]);
  const [loadingFindings, setLoadingFindings] = useState(false);
  const [findingFilterStatus, setFindingFilterStatus] = useState<string>('');
  const [findingFilterSeverity, setFindingFilterSeverity] = useState<string>('');
  const [findingSearch, setFindingSearch] = useState<string>('');

  // CAPA Management Modal State
  const [showCapaModal, setShowCapaModal] = useState(false);
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
  const [showVerifyModal, setShowVerifyModal] = useState(false);
  const [verifyTarget, setVerifyTarget] = useState<AuditFindingDto | null>(null);
  const [verifyStatus, setVerifyStatus] = useState<FindingStatus.VERIFIED | FindingStatus.CLOSED>(FindingStatus.VERIFIED);
  const [verifyNotes, setVerifyNotes] = useState('');
  const [submittingVerify, setSubmittingVerify] = useState(false);

  // Log Finding from Check Item Modal State
  const [showLogFindingModal, setShowLogFindingModal] = useState(false);
  const [targetCheckItem, setTargetCheckItem] = useState<{ id: string; title: string; assessmentId: string } | null>(null);
  const [logFindingForm, setLogFindingForm] = useState({
    title: '',
    description: '',
    severity: VulnerabilitySeverity.HIGH,
    remediationPlan: '',
    ownerId: 'Compliance Lead',
  });
  const [submittingFinding, setSubmittingFinding] = useState(false);

  // Audit Completion State
  const [completingPlanId, setCompletingPlanId] = useState<string | null>(null);

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
      addToast(`Failed to load audit plans: ${err.message}`, 'error');
    } finally {
      setLoading(false);
    }
  }, [filterFrameworkId, filterStatus, filterSearch, addToast]);

  useEffect(() => {
    fetchPlans();
  }, [fetchPlans]);

  // Fetch findings
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
      addToast(`Failed to load audit findings: ${err.message}`, 'error');
    } finally {
      setLoadingFindings(false);
    }
  }, [findingFilterStatus, findingFilterSeverity, findingSearch, addToast]);

  useEffect(() => {
    if (activeTab === 'findings') {
      fetchFindings();
    }
  }, [activeTab, fetchFindings]);

  // Check audit completion eligibility
  const checkCompletionEligibility = (plan: AuditPlanDto) => {
    if (plan.status !== AuditPlanStatus.IN_PROGRESS) {
      return {
        eligible: false,
        reason: 'Audit plan must be IN_PROGRESS before it can be completed.',
      };
    }
    const assessments = plan.assessments || [];
    if (assessments.length === 0) {
      return {
        eligible: false,
        reason: 'At least one assessment run must be executed before completing the audit.',
      };
    }
    const checkItems = assessments.flatMap((a) => a.checkItems || []);
    if (checkItems.length === 0) {
      return {
        eligible: false,
        reason: 'No checklist items configured for this audit.',
      };
    }
    const unevaluated = checkItems.filter((ci) => ci.result === AuditCheckResult.NOT_EVALUATED);
    if (unevaluated.length > 0) {
      return {
        eligible: false,
        reason: `${unevaluated.length} checklist item(s) remain unevaluated. All items must be evaluated.`,
      };
    }
    const allFindings = assessments.flatMap((a) => a.findings || []);
    const unresolved = allFindings.filter(
      (f) => f.status === FindingStatus.OPEN || f.status === FindingStatus.IN_REMEDIATION,
    );
    if (unresolved.length > 0) {
      return {
        eligible: false,
        reason: `${unresolved.length} finding(s) remain open or in remediation. Findings must be resolved or verified.`,
      };
    }
    return {
      eligible: true,
      reason: 'All checklist items are evaluated and all findings are resolved.',
    };
  };

  async function handleCompleteAudit(planId: string) {
    setCompletingPlanId(planId);
    try {
      await apiRequest(`/business-audits/plans/${planId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: AuditPlanStatus.COMPLETED }),
      });
      addToast('Audit Plan marked as COMPLETED and all execution runs finalized!', 'success');
      await fetchPlans();
      if (selectedPlan && selectedPlan.id === planId) {
        const updated = await apiRequest<AuditPlanDto>(`/business-audits/plans/${planId}`);
        setSelectedPlan(updated);
      }
    } catch (err: any) {
      addToast(`Audit completion failed: ${err.message}`, 'error');
    } finally {
      setCompletingPlanId(null);
    }
  }

  async function refreshActiveFinding(findingId: string) {
    try {
      const res = await apiRequest<PaginatedAuditFindingsDto>(`/business-audits/findings?limit=50`);
      const updated = res.items.find((f) => f.id === findingId);
      if (updated) {
        setActiveFindingForCapa(updated);
      }
      setFindings(res.items);
      if (selectedPlan) {
        const updatedPlan = await apiRequest<AuditPlanDto>(`/business-audits/plans/${selectedPlan.id}`);
        setSelectedPlan(updatedPlan);
      }
    } catch {
      // quiet refresh
    }
  }

  async function handleCreateCapa(e: React.FormEvent) {
    e.preventDefault();
    if (!activeFindingForCapa) return;
    setSubmittingCapa(true);
    try {
      await apiRequest('/business-audits/capas', {
        method: 'POST',
        body: JSON.stringify({
          findingId: activeFindingForCapa.id,
          title: capaForm.title,
          correctiveAction: capaForm.correctiveAction,
          preventiveAction: capaForm.preventiveAction || undefined,
          ownerId: capaForm.ownerId || 'Remediation Lead',
          dueDate: capaForm.dueDate || undefined,
        }),
      });
      addToast('CAPA created successfully. Finding transitioned to IN_REMEDIATION.', 'success');
      setCapaForm({
        title: '',
        correctiveAction: '',
        preventiveAction: '',
        ownerId: 'Remediation Lead',
        dueDate: '',
      });
      await refreshActiveFinding(activeFindingForCapa.id);
      await fetchPlans();
    } catch (err: any) {
      addToast(`Failed to create CAPA: ${err.message}`, 'error');
    } finally {
      setSubmittingCapa(false);
    }
  }

  async function handleUpdateCapaStatus(capaId: string, newStatus: CapaStatus) {
    setUpdatingCapaId(capaId);
    try {
      await apiRequest(`/business-audits/capas/${capaId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: newStatus }),
      });
      addToast(`CAPA status updated to ${newStatus}.`, 'success');
      if (activeFindingForCapa) {
        await refreshActiveFinding(activeFindingForCapa.id);
      }
      await fetchPlans();
    } catch (err: any) {
      addToast(`Failed to update CAPA: ${err.message}`, 'error');
    } finally {
      setUpdatingCapaId(null);
    }
  }

  function handleOpenVerifyModal(finding: AuditFindingDto) {
    setVerifyTarget(finding);
    setVerifyStatus(FindingStatus.VERIFIED);
    setVerifyNotes('');
    setShowVerifyModal(true);
  }

  async function handleSubmitVerification(e: React.FormEvent) {
    e.preventDefault();
    if (!verifyTarget) return;
    setSubmittingVerify(true);
    try {
      await apiRequest(`/business-audits/findings/${verifyTarget.id}/verify`, {
        method: 'POST',
        body: JSON.stringify({
          status: verifyStatus,
          verificationNotes: verifyNotes || undefined,
        }),
      });
      addToast(`Finding verified and marked as ${verifyStatus}!`, 'success');
      setShowVerifyModal(false);
      setVerifyTarget(null);
      setVerifyNotes('');
      if (activeFindingForCapa && activeFindingForCapa.id === verifyTarget.id) {
        await refreshActiveFinding(verifyTarget.id);
      }
      if (selectedPlan) {
        const updated = await apiRequest<AuditPlanDto>(`/business-audits/plans/${selectedPlan.id}`);
        setSelectedPlan(updated);
      }
      await fetchPlans();
      if (activeTab === 'findings') await fetchFindings();
    } catch (err: any) {
      addToast(`Verification failed: ${err.message}`, 'error');
    } finally {
      setSubmittingVerify(false);
    }
  }

  function handleOpenLogFindingModal(checkItem: { id: string; title: string; assessmentId: string }) {
    setTargetCheckItem(checkItem);
    setLogFindingForm({
      title: `Non-compliant: ${checkItem.title}`,
      description: `Evaluation failed for checklist item "${checkItem.title}". Requires corrective action.`,
      severity: VulnerabilitySeverity.HIGH,
      remediationPlan: '',
      ownerId: 'Compliance Lead',
    });
    setShowLogFindingModal(true);
  }

  async function handleCreateFindingFromCheckItem(e: React.FormEvent) {
    e.preventDefault();
    if (!targetCheckItem || !selectedPlan) return;
    setSubmittingFinding(true);
    try {
      await apiRequest('/business-audits/findings', {
        method: 'POST',
        body: JSON.stringify({
          assessmentId: targetCheckItem.assessmentId,
          checkItemId: targetCheckItem.id,
          title: logFindingForm.title,
          description: logFindingForm.description,
          severity: logFindingForm.severity,
          remediationPlan: logFindingForm.remediationPlan || undefined,
          ownerId: logFindingForm.ownerId || 'Compliance Lead',
        }),
      });
      addToast(`Audit finding logged for "${targetCheckItem.title}".`, 'success');
      setShowLogFindingModal(false);
      setTargetCheckItem(null);
      const updated = await apiRequest<AuditPlanDto>(`/business-audits/plans/${selectedPlan.id}`);
      setSelectedPlan(updated);
      await fetchPlans();
      if (activeTab === 'findings') await fetchFindings();
    } catch (err: any) {
      addToast(`Failed to log finding: ${err.message}`, 'error');
    } finally {
      setSubmittingFinding(false);
    }
  }

  // Load Frameworks when Create Plan modal opens
  useEffect(() => {
    if (!showPlanModal) return;

    let isMounted = true;
    async function loadFws() {
      setLoadingFrameworks(true);
      try {
        const fws = await apiRequest<FrameworkOption[]>('/frameworks');
        if (isMounted) {
          setAvailableFrameworks(fws || []);
          if (fws && fws.length > 0 && !selectedFrameworkId) {
            setSelectedFrameworkId(fws[0].id);
          }
        }
      } catch (err: any) {
        if (isMounted) {
          addToast(err?.message || 'Failed to load entitled frameworks', 'error');
        }
      } finally {
        if (isMounted) setLoadingFrameworks(false);
      }
    }
    loadFws();

    return () => {
      isMounted = false;
    };
  }, [showPlanModal, addToast]);

  // Fetch Versions when Framework changes
  useEffect(() => {
    if (!selectedFrameworkId || !showPlanModal) {
      setAvailableVersions([]);
      setSelectedVersionId('');
      setAvailableReferences([]);
      setSelectedReferenceIds([]);
      return;
    }

    let isMounted = true;
    async function loadVersions() {
      setLoadingVersions(true);
      try {
        const vers = await apiRequest<VersionOption[]>(`/frameworks/${selectedFrameworkId}/versions`);
        if (isMounted) {
          setAvailableVersions(vers || []);
          // Reset clause selection on framework change
          setSelectedReferenceIds([]);
          if (vers && vers.length > 0) {
            setSelectedVersionId(vers[0].id);
          } else {
            setSelectedVersionId('');
          }
        }
      } catch {
        if (isMounted) {
          setAvailableVersions([]);
          setSelectedVersionId('');
          setSelectedReferenceIds([]);
        }
      } finally {
        if (isMounted) setLoadingVersions(false);
      }
    }
    loadVersions();

    return () => {
      isMounted = false;
    };
  }, [selectedFrameworkId, showPlanModal]);

  // Fetch References when Version changes
  useEffect(() => {
    if (!selectedVersionId || !showPlanModal) {
      setAvailableReferences([]);
      setSelectedReferenceIds([]);
      return;
    }

    let isMounted = true;
    async function loadRefs() {
      setLoadingReferences(true);
      try {
        const refs = await apiRequest<ReferenceOption[]>(`/frameworks/versions/${selectedVersionId}/references`);
        if (isMounted) {
          setAvailableReferences(refs || []);
          // Reset clause selection when version changes
          setSelectedReferenceIds([]);
        }
      } catch {
        if (isMounted) {
          setAvailableReferences([]);
          setSelectedReferenceIds([]);
        }
      } finally {
        if (isMounted) setLoadingReferences(false);
      }
    }
    loadRefs();

    return () => {
      isMounted = false;
    };
  }, [selectedVersionId, showPlanModal]);

  const toggleReferenceSelection = (refId: string) => {
    setSelectedReferenceIds((prev) =>
      prev.includes(refId) ? prev.filter((id) => id !== refId) : [...prev, refId]
    );
  };

  const selectAllReferences = () => {
    setSelectedReferenceIds(availableReferences.map((r) => r.id));
  };

  const clearAllReferences = () => {
    setSelectedReferenceIds([]);
  };

  async function handleCreatePlan(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedFrameworkId) {
      addToast('Please select a valid compliance framework', 'error');
      return;
    }

    const selectedFw = availableFrameworks.find((f) => f.id === selectedFrameworkId);

    setSubmitting(true);
    try {
      await apiRequest('/business-audits/plans', {
        method: 'POST',
        body: JSON.stringify({
          title: planTitle,
          objective,
          frameworkId: selectedFrameworkId,
          frameworkVersionId: selectedVersionId || undefined,
          frameworkCode: selectedFw?.code,
          frameworkReferenceIds: selectedReferenceIds,
          ownerId,
        }),
      });
      addToast(`Audit Plan "${planTitle}" created with ${selectedReferenceIds.length} scoped clause(s).`, 'success');
      setShowPlanModal(false);
      setPlanTitle('');
      setObjective('');
      setSelectedReferenceIds([]);
      fetchPlans();
    } catch (err: any) {
      addToast(`Failed to create plan: ${err.message}`, 'error');
    } finally {
      setSubmitting(false);
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
      addToast('Audit Assessment execution started.', 'success');
      fetchPlans();
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
      addToast(`Item result updated to ${result}`, 'success');
      if (selectedPlan) {
        const updated = await apiRequest<AuditPlanDto>(`/business-audits/plans/${selectedPlan.id}`);
        setSelectedPlan(updated);
      }
    } catch (err: any) {
      addToast(`Failed to evaluate item: ${err.message}`, 'error');
    }
  }

  async function handleVerifyFinding(findingId: string) {
    try {
      await apiRequest(`/business-audits/findings/${findingId}/verify`, {
        method: 'POST',
        body: JSON.stringify({ status: 'VERIFIED', verificationNotes: 'Verified during audit review.' }),
      });
      addToast('Finding successfully verified!', 'success');
      if (selectedPlan) {
        const updated = await apiRequest<AuditPlanDto>(`/business-audits/plans/${selectedPlan.id}`);
        setSelectedPlan(updated);
      }
    } catch (err: any) {
      addToast(`Verification failed: ${err.message}`, 'error');
    }
  }

  const filteredClauses = availableReferences.filter(
    (r) =>
      r.identifier.toLowerCase().includes(clauseSearch.toLowerCase()) ||
      r.title.toLowerCase().includes(clauseSearch.toLowerCase())
  );

  return (
    <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 py-6 omni-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2">
            <ClipboardList size={22} className="text-teal-700" />
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Business Audit Management</h1>
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

      {/* Workspace Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 mb-6 overflow-x-auto pb-1">
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

      {/* Tab: Audit Plans */}
      {activeTab === 'plans' && (
        <div className="space-y-4">
          {/* Filter Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3 rounded-xl border border-slate-200 shadow-xs">
            <div className="flex flex-wrap items-center gap-3">
              <ComplianceScopeFilter
                selectedFrameworkId={filterFrameworkId}
                onFrameworkChange={(fwId) => setFilterFrameworkId(fwId)}
                allOptionLabel="All Audit Frameworks"
              />

              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                aria-label="Filter by Audit Plan Status"
                className="bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm hover:border-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-600"
              >
                <option value="">All Statuses</option>
                <option value="DRAFT">Draft</option>
                <option value="PLANNED">Planned</option>
                <option value="IN_PROGRESS">In Progress</option>
                <option value="COMPLETED">Completed</option>
                <option value="ARCHIVED">Archived</option>
              </select>

              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search plan title or objective..."
                  value={filterSearch}
                  onChange={(e) => setFilterSearch(e.target.value)}
                  className="pl-8 pr-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600 w-52 sm:w-64"
                />
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
            <div className="bg-white border border-slate-200 rounded-xl p-12 text-center text-slate-500">
              <ClipboardList className="w-8 h-8 text-slate-400 mx-auto mb-2" />
              <div className="font-semibold text-slate-700">No audit plans match the selected criteria.</div>
              <p className="text-xs text-slate-400 mt-1">Try resetting filters or create a new scoped audit plan.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {plans.map((p) => {
                const scopeCount = p.scopeReferences?.length || 0;
                return (
                  <div
                    key={p.id}
                    className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm hover:border-slate-300 transition-all flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span className="omni-mono text-xs font-bold text-teal-900 bg-teal-50 px-2.5 py-0.5 rounded border border-teal-200">
                          {p.frameworkName || p.frameworkCode || 'UNSPECIFIED'}
                        </span>
                        {(() => {
                          const rag = getAuditPlanRag(p.status, p.assessments);
                          return (
                            <RagStatusBadge
                              status={rag.status}
                              label={rag.label}
                              detail={rag.detail}
                              size="sm"
                            />
                          );
                        })()}
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

                      <div className="text-xs text-slate-600 space-y-1 pt-2 border-t border-slate-100">
                        <div><strong>Lead Owner:</strong> {p.ownerId}</div>
                        <div><strong>Execution Runs:</strong> {p.assessments?.length || 0}</div>
                      </div>
                    </div>

                    <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                      <button
                        onClick={() => setSelectedPlan(p)}
                        className="text-xs font-semibold text-teal-700 hover:text-teal-900"
                      >
                        View Details & Execution
                      </button>
                      {p.status === 'DRAFT' && (
                        <button
                          onClick={() => handleStartAssessment(p.id)}
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

      {/* Tab: Active Execution Runs */}
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
            const allRuns = plans.flatMap((p) =>
              (p.assessments || []).map((a) => ({ ...a, plan: p }))
            );

            if (allRuns.length === 0) {
              return (
                <div className="bg-white border border-slate-200 rounded-xl p-12 text-center text-slate-500">
                  <Play className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                  <div className="font-semibold text-slate-700">No active audit execution runs found.</div>
                  <p className="text-xs text-slate-400 mt-1">Start a run from an existing audit plan in the &quot;Audit Plans&quot; tab.</p>
                </div>
              );
            }

            return (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {allRuns.map((run) => {
                  const checkItems = run.checkItems || [];
                  const compliant = checkItems.filter((ci) => ci.result === 'COMPLIANT').length;
                  const nonCompliant = checkItems.filter((ci) => ci.result === 'NON_COMPLIANT').length;
                  const unevaluated = checkItems.filter((ci) => ci.result === 'NOT_EVALUATED').length;
                  const total = checkItems.length;

                  return (
                    <div
                      key={run.id}
                      className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs hover:border-slate-300 transition-all flex flex-col justify-between"
                    >
                      <div>
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <span className="omni-mono text-xs font-bold text-teal-900 bg-teal-50 px-2.5 py-0.5 rounded border border-teal-200">
                            {run.plan.frameworkName || run.plan.frameworkCode || 'FRAMEWORK'}
                          </span>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                            run.status === 'COMPLETED' ? 'bg-emerald-100 text-emerald-800' :
                            run.status === 'IN_PROGRESS' ? 'bg-blue-100 text-blue-800' : 'bg-slate-100 text-slate-700'
                          }`}>
                            {run.status}
                          </span>
                        </div>

                        <h3 className="font-semibold text-slate-900 text-sm mb-1">{run.plan.title}</h3>
                        <div className="text-xs text-slate-500 mb-3">Auditor: <span className="font-medium text-slate-700">{run.auditorId}</span></div>

                        {/* Authoritative Score & Progress */}
                        <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 mb-3">
                          <div className="flex items-center justify-between text-xs mb-1.5">
                            <span className="text-slate-600 font-medium">Authoritative Score</span>
                            <span className="font-mono font-bold text-teal-800">{run.score}%</span>
                          </div>
                          <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden flex">
                            <div
                              className="bg-teal-600 h-2 transition-all duration-500"
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
                          onClick={() => setSelectedPlan(run.plan)}
                          className="px-3 py-1.5 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg transition-colors flex items-center gap-1 shadow-xs"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>Evaluate Checklist</span>
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

      {/* Tab: Audit Findings & Verification */}
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
                aria-label="Filter by Severity"
                className="bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm hover:border-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-600"
              >
                <option value="">All Severities</option>
                <option value="CRITICAL">Critical</option>
                <option value="HIGH">High</option>
                <option value="MEDIUM">Medium</option>
                <option value="LOW">Low</option>
              </select>

              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search finding title or description..."
                  value={findingSearch}
                  onChange={(e) => setFindingSearch(e.target.value)}
                  className="pl-8 pr-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600 w-52 sm:w-64"
                />
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
            <div className="bg-white border border-slate-200 rounded-xl p-12 text-center text-slate-500">
              <ShieldCheck className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
              <div className="font-semibold text-slate-700">No findings matching criteria.</div>
              <p className="text-xs text-slate-400 mt-1">Audit findings logged during evaluation runs will appear here for remediation and verification.</p>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-slate-200 shadow-xs divide-y divide-slate-100 overflow-hidden">
              {findings.map((f) => {
                const capas = f.capas || [];
                const completedCapas = capas.filter((c) => c.status === 'COMPLETED').length;

                return (
                  <div key={f.id} className="p-4 hover:bg-slate-50 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${
                          f.severity === 'CRITICAL' ? 'bg-red-100 text-red-800 border border-red-200' :
                          f.severity === 'HIGH' ? 'bg-orange-100 text-orange-800 border border-orange-200' :
                          f.severity === 'MEDIUM' ? 'bg-amber-100 text-amber-800 border border-amber-200' :
                          'bg-slate-100 text-slate-700'
                        }`}>
                          {f.severity}
                        </span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                          f.status === 'VERIFIED' ? 'bg-emerald-100 text-emerald-800' :
                          f.status === 'READY_FOR_VERIFICATION' ? 'bg-blue-100 text-blue-800' :
                          f.status === 'IN_REMEDIATION' ? 'bg-amber-100 text-amber-800' :
                          'bg-red-100 text-red-800'
                        }`}>
                          {f.status}
                        </span>
                        <h4 className="text-sm font-semibold text-slate-900">{f.title}</h4>
                      </div>

                      {f.description && (
                        <p className="text-xs text-slate-500 line-clamp-1">{f.description}</p>
                      )}

                      <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-400 pt-1">
                        <span>Lead Owner: <strong className="text-slate-600">{f.ownerId || 'Unassigned'}</strong></span>
                        <span>•</span>
                        <span>CAPA: <strong className="text-teal-700">{capas.length}</strong> action(s) ({completedCapas} completed)</span>
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

      {/* Create Scoped Audit Plan Modal */}
      {showPlanModal && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-60 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4"
        >
          <div className="bg-white rounded-xl max-w-2xl w-full shadow-2xl max-h-[90dvh] flex flex-col overflow-hidden border border-slate-200">
            <div className="flex items-center justify-between border-b pb-3 p-5 sm:p-6 mb-0 shrink-0 bg-white">
              <h2 className="text-base sm:text-lg font-bold text-slate-900">Create Scoped Compliance Audit Plan</h2>
              <button
                type="button"
                onClick={() => setShowPlanModal(false)}
                className="text-slate-400 hover:text-slate-700 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreatePlan} className="flex-1 flex flex-col min-h-0 overflow-hidden">
              <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-4 omni-scroll">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Audit Title</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. FY26 Q3 ISO 27001 ISMS Compliance Audit"
                  value={planTitle}
                  onChange={(e) => setPlanTitle(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                />
              </div>

              {/* Dynamic Framework & Version Selectors */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Compliance Framework / Standard
                  </label>
                  <select
                    required
                    value={selectedFrameworkId}
                    onChange={(e) => setSelectedFrameworkId(e.target.value)}
                    disabled={loadingFrameworks}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600 disabled:opacity-50"
                  >
                    {availableFrameworks.length === 0 ? (
                      <option value="">{loadingFrameworks ? 'Loading frameworks...' : 'No frameworks available'}</option>
                    ) : (
                      availableFrameworks.map((fw) => (
                        <option key={fw.id} value={fw.id}>
                          {fw.code} — {fw.name}
                        </option>
                      ))
                    )}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Standard Revision / Version
                  </label>
                  <select
                    value={selectedVersionId}
                    onChange={(e) => setSelectedVersionId(e.target.value)}
                    disabled={loadingVersions || availableVersions.length === 0}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600 disabled:opacity-50"
                  >
                    {availableVersions.length === 0 ? (
                      <option value="">{loadingVersions ? 'Loading revisions...' : 'Standard Revision'}</option>
                    ) : (
                      availableVersions.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.version} ({v.name})
                        </option>
                      ))
                    )}
                  </select>
                </div>
              </div>

              {/* Clause / Reference Multi-Selection Section */}
              <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/50">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
                  <div>
                    <label className="block text-xs font-bold text-slate-800">
                      Scope To Specific Clauses & Requirements
                    </label>
                    <p className="text-[11px] text-slate-500">
                      Select specific normative references or leave empty to include the entire framework.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={selectAllReferences}
                      disabled={availableReferences.length === 0}
                      className="text-[11px] font-semibold text-teal-700 hover:text-teal-900 disabled:opacity-50"
                    >
                      Select All
                    </button>
                    <span className="text-slate-300">|</span>
                    <button
                      type="button"
                      onClick={clearAllReferences}
                      disabled={selectedReferenceIds.length === 0}
                      className="text-[11px] font-semibold text-slate-500 hover:text-slate-800 disabled:opacity-50"
                    >
                      Clear
                    </button>
                  </div>
                </div>

                {/* Clause Search */}
                <div className="relative mb-2">
                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search clauses by identifier or title (e.g. A.5, CC6.1)..."
                    value={clauseSearch}
                    onChange={(e) => setClauseSearch(e.target.value)}
                    className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                  />
                </div>

                {/* Selected Clauses Pills */}
                {selectedReferenceIds.length > 0 && (
                  <div className="mb-2 p-2 bg-white rounded-lg border border-teal-100 max-h-24 overflow-y-auto flex flex-wrap gap-1">
                    {selectedReferenceIds.map((refId) => {
                      const ref = availableReferences.find((r) => r.id === refId);
                      return (
                        <span
                          key={refId}
                          className="inline-flex items-center gap-1 text-[11px] font-mono bg-teal-50 text-teal-800 border border-teal-200 px-2 py-0.5 rounded-md"
                        >
                          <span>{ref ? `${ref.identifier}` : refId}</span>
                          <button
                            type="button"
                            onClick={() => toggleReferenceSelection(refId)}
                            className="hover:text-teal-950"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      );
                    })}
                  </div>
                )}

                {/* Clause Checklist */}
                <div className="bg-white border border-slate-200 rounded-lg max-h-48 overflow-y-auto p-2 divide-y divide-slate-100">
                  {loadingReferences ? (
                    <div className="py-6 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-teal-600" /> Loading normative clauses...
                    </div>
                  ) : availableReferences.length === 0 ? (
                    <div className="py-6 text-center text-xs text-slate-400">
                      No clauses found for the selected framework revision.
                    </div>
                  ) : filteredClauses.length === 0 ? (
                    <div className="py-4 text-center text-xs text-slate-400">
                      No clauses match &quot;{clauseSearch}&quot;.
                    </div>
                  ) : (
                    filteredClauses.map((r) => {
                      const isSelected = selectedReferenceIds.includes(r.id);
                      return (
                        <label
                          key={r.id}
                          className="flex items-start gap-2.5 py-1.5 px-2 hover:bg-slate-50 rounded cursor-pointer transition-colors"
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleReferenceSelection(r.id)}
                            className="mt-0.5 rounded text-teal-600 focus:ring-teal-500"
                          />
                          <div className="text-xs">
                            <span className="font-mono font-bold text-slate-800 mr-2">{r.identifier}</span>
                            <span className="text-slate-600">{r.title}</span>
                          </div>
                        </label>
                      );
                    })
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Lead Owner</label>
                  <input
                    type="text"
                    required
                    value={ownerId}
                    onChange={(e) => setOwnerId(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Objective</label>
                  <input
                    type="text"
                    placeholder="e.g. Annual Surveillance Audit"
                    value={objective}
                    onChange={(e) => setObjective(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                  />
                </div>
              </div>
              </div>

              <div className="sticky bottom-0 bg-white/95 backdrop-blur-xs px-5 sm:px-6 py-3 border-t border-slate-100 flex justify-end gap-2 shrink-0 z-10">
                <button
                  type="button"
                  onClick={() => setShowPlanModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg disabled:opacity-50 transition-colors shadow-sm"
                >
                  {submitting ? 'Creating Plan...' : 'Create Scoped Audit Plan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Detail / Execution Modal */}
      {selectedPlan && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-60 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4"
        >
          <div className="bg-white rounded-xl max-w-4xl w-full p-6 shadow-2xl max-h-[90dvh] overflow-y-auto omni-scroll border border-slate-200">
            <div className="flex items-center justify-between border-b pb-3 mb-4">
              <div>
                <span className="text-xs font-mono font-bold text-teal-800 bg-teal-100 px-2.5 py-0.5 rounded border border-teal-200">
                  {selectedPlan.frameworkName || selectedPlan.frameworkCode}
                </span>
                <h2 className="text-lg font-bold text-slate-900 mt-1">{selectedPlan.title}</h2>
              </div>
              <button
                onClick={() => setSelectedPlan(null)}
                className="text-xs font-semibold text-slate-500 hover:text-slate-800"
              >
                Close
              </button>
            </div>

            {/* Audit Completion Status & Action Card */}
            {(() => {
              const eligibility = checkCompletionEligibility(selectedPlan);
              return (
                <div className={`mb-6 p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                  selectedPlan.status === 'COMPLETED'
                    ? 'bg-emerald-50 border-emerald-200'
                    : eligibility.eligible
                    ? 'bg-teal-50 border-teal-200'
                    : 'bg-amber-50 border-amber-200'
                }`}>
                  <div>
                    <div className="flex items-center gap-2">
                      {selectedPlan.status === 'COMPLETED' ? (
                        <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                      ) : eligibility.eligible ? (
                        <CheckCircle className="w-5 h-5 text-teal-600 shrink-0" />
                      ) : (
                        <AlertOctagon className="w-5 h-5 text-amber-600 shrink-0" />
                      )}
                      <span className="font-bold text-sm text-slate-900">
                        {selectedPlan.status === 'COMPLETED'
                          ? 'Audit Plan Completed & Verified'
                          : eligibility.eligible
                          ? 'Eligible for Final Audit Completion'
                          : 'Audit In Progress — Completion Blocked'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 mt-1">
                      {selectedPlan.status === 'COMPLETED'
                        ? `This compliance audit was successfully completed on ${new Date(selectedPlan.updatedAt).toLocaleDateString()}. All assessment runs are finalized.`
                        : eligibility.reason}
                    </p>
                  </div>

                  {selectedPlan.status !== 'COMPLETED' && (
                    <button
                      type="button"
                      disabled={!eligibility.eligible || completingPlanId === selectedPlan.id}
                      onClick={() => handleCompleteAudit(selectedPlan.id)}
                      className={`px-4 py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 shrink-0 shadow-sm ${
                        eligibility.eligible
                          ? 'bg-emerald-700 hover:bg-emerald-800 text-white cursor-pointer'
                          : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                      }`}
                    >
                      {completingPlanId === selectedPlan.id ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>Completing Audit...</span>
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="w-4 h-4" />
                          <span>Complete Audit</span>
                        </>
                      )}
                    </button>
                  )}
                </div>
              );
            })()}

            {/* Scoped Clauses Detail Panel */}
            <div className="mb-6 p-4 rounded-xl border border-slate-200 bg-slate-50">
              <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-teal-700" />
                <span>Normative Compliance Scope ({selectedPlan.scopeReferences?.length || 0} Clauses)</span>
              </h3>
              {selectedPlan.scopeReferences && selectedPlan.scopeReferences.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                  {selectedPlan.scopeReferences.map((sr) => (
                    <div
                      key={sr.id}
                      className="p-2.5 bg-white rounded-lg border border-slate-200 text-xs shadow-xs"
                    >
                      <div className="font-mono font-bold text-teal-900">{sr.identifier}</div>
                      <div className="text-slate-600 line-clamp-2 mt-0.5">{sr.title}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-500 italic">
                  This audit covers the complete normative framework baseline without clause-specific exclusions.
                </p>
              )}
            </div>

            {selectedPlan.assessments && selectedPlan.assessments.length > 0 ? (
              <div className="space-y-6">
                {selectedPlan.assessments.map((a) => (
                  <div key={a.id} className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <div className="text-xs font-bold text-slate-700">Audit Assessment Run</div>
                        <div className="text-[10px] text-slate-600 omni-mono">Auditor: {a.auditorId}</div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <div className="text-[10px] text-slate-500 uppercase font-semibold">Authoritative Score</div>
                          <div className="text-base font-bold text-teal-700 omni-mono">{a.score}%</div>
                        </div>
                      </div>
                    </div>

                    {/* Checklists */}
                    <div className="space-y-2 mt-4">
                      <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Evaluation Checklist</h4>
                      {a.checkItems && a.checkItems.length > 0 ? (
                        a.checkItems.map((ci) => (
                          <div key={ci.id} className="bg-white p-3 rounded-lg border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div>
                              <div className="text-xs font-semibold text-slate-900">{ci.title}</div>
                              {ci.description && <div className="text-[11px] text-slate-500">{ci.description}</div>}
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <div className="flex items-center gap-1">
                                {[
                                  { key: 'COMPLIANT', label: 'Pass', bg: 'bg-emerald-100 text-emerald-800' },
                                  { key: 'NON_COMPLIANT', label: 'Fail', bg: 'bg-red-100 text-red-800' },
                                  { key: 'NOT_APPLICABLE', label: 'N/A', bg: 'bg-slate-100 text-slate-600' },
                                ].map((btn) => (
                                  <button
                                    key={btn.key}
                                    onClick={() => handleEvaluateCheckItem(ci.id, btn.key as AuditCheckResult)}
                                    className={`px-2 py-1 text-[10px] font-bold rounded transition-all ${
                                      ci.result === btn.key ? btn.bg : 'bg-slate-50 text-slate-500 hover:bg-slate-100'
                                    }`}
                                  >
                                    {btn.label}
                                  </button>
                                ))}
                              </div>

                              {ci.result === 'NON_COMPLIANT' && (
                                <button
                                  type="button"
                                  onClick={() => handleOpenLogFindingModal({ id: ci.id, title: ci.title, assessmentId: a.id })}
                                  className="px-2 py-1 text-[10px] font-semibold text-red-700 bg-red-50 hover:bg-red-100 rounded border border-red-200 transition-colors flex items-center gap-1"
                                >
                                  <AlertCircle className="w-3 h-3" />
                                  <span>Log Finding</span>
                                </button>
                              )}
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="text-xs text-slate-400 py-2">No check items configured.</div>
                      )}
                    </div>

                    {/* Associated Findings Section */}
                    {a.findings && a.findings.length > 0 && (
                      <div className="mt-4 pt-4 border-t border-slate-200">
                        <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                          <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
                          <span>Audit Findings & CAPA Remediation ({a.findings.length})</span>
                        </h4>
                        <div className="space-y-2">
                          {a.findings.map((f) => (
                            <div key={f.id} className="p-3 bg-white rounded-lg border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                              <div>
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase ${
                                    f.severity === 'CRITICAL' ? 'bg-red-100 text-red-800 border border-red-200' :
                                    f.severity === 'HIGH' ? 'bg-orange-100 text-orange-800 border border-orange-200' :
                                    f.severity === 'MEDIUM' ? 'bg-amber-100 text-amber-800 border border-amber-200' :
                                    'bg-slate-100 text-slate-700'
                                  }`}>
                                    {f.severity}
                                  </span>
                                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                                    f.status === 'VERIFIED' ? 'bg-emerald-100 text-emerald-800' :
                                    f.status === 'READY_FOR_VERIFICATION' ? 'bg-blue-100 text-blue-800' :
                                    f.status === 'IN_REMEDIATION' ? 'bg-amber-100 text-amber-800' :
                                    'bg-red-100 text-red-800'
                                  }`}>
                                    {f.status}
                                  </span>
                                  <span className="text-xs font-semibold text-slate-900">{f.title}</span>
                                </div>
                                {f.description && <p className="text-[11px] text-slate-500 mt-1 line-clamp-1">{f.description}</p>}
                                <div className="text-[10px] text-slate-400 mt-1">
                                  CAPA Actions: <strong className="text-slate-700">{f.capas?.length || 0}</strong> • Owner: {f.ownerId || 'Unassigned'}
                                </div>
                              </div>

                              <div className="flex items-center gap-1.5 shrink-0">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setActiveFindingForCapa(f);
                                    setShowCapaModal(true);
                                  }}
                                  className="px-2.5 py-1 text-xs font-semibold text-teal-800 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded transition-colors flex items-center gap-1"
                                >
                                  <Wrench className="w-3 h-3" />
                                  <span>Manage CAPA ({f.capas?.length || 0})</span>
                                </button>

                                {(f.status === FindingStatus.READY_FOR_VERIFICATION || f.status === FindingStatus.IN_REMEDIATION) && (
                                  <button
                                    type="button"
                                    onClick={() => handleOpenVerifyModal(f)}
                                    className="px-2.5 py-1 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded transition-colors flex items-center gap-1 shadow-xs"
                                  >
                                    <Check className="w-3 h-3" />
                                    <span>Verify</span>
                                  </button>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-xs text-slate-500">
                No active assessment runs for this plan. Click &quot;Start Run&quot; to begin execution.
              </div>
            )}
          </div>
        </div>
      )}

      {/* CAPA Creation & Management Modal */}
      {showCapaModal && activeFindingForCapa && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-70 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4"
        >
          <div className="bg-white rounded-xl max-w-3xl w-full shadow-2xl max-h-[90dvh] flex flex-col overflow-hidden border border-slate-200">
            <div className="flex items-center justify-between border-b pb-3 p-5 sm:p-6 shrink-0 bg-white">
              <div>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-teal-50 text-teal-800 border border-teal-200 uppercase">
                  CAPA Remediation Workflow
                </span>
                <h3 className="text-base font-bold text-slate-900 mt-1">
                  Actions for: {activeFindingForCapa.title}
                </h3>
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
              {/* Finding Summary Banner */}
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-slate-700">Finding Status:</span>
                  <span className="font-bold text-teal-800 uppercase">{activeFindingForCapa.status}</span>
                  <span>•</span>
                  <span className="font-semibold text-slate-700">Severity:</span>
                  <span className="font-bold text-red-700">{activeFindingForCapa.severity}</span>
                </div>
                {activeFindingForCapa.description && (
                  <p className="text-slate-600">{activeFindingForCapa.description}</p>
                )}
                {activeFindingForCapa.remediationPlan && (
                  <p className="text-slate-500 italic">Plan: {activeFindingForCapa.remediationPlan}</p>
                )}
              </div>

              {/* Existing CAPAs List */}
              <div>
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2">
                  Corrective & Preventive Action Items ({activeFindingForCapa.capas?.length || 0})
                </h4>
                {activeFindingForCapa.capas && activeFindingForCapa.capas.length > 0 ? (
                  <div className="space-y-3">
                    {activeFindingForCapa.capas.map((capa) => (
                      <div key={capa.id} className="p-4 bg-white border border-slate-200 rounded-lg shadow-xs space-y-2">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <span className="font-bold text-slate-900 text-sm">{capa.title}</span>
                          <div className="flex items-center gap-2">
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                              capa.status === 'COMPLETED' ? 'bg-emerald-100 text-emerald-800' :
                              capa.status === 'IN_PROGRESS' ? 'bg-blue-100 text-blue-800' :
                              'bg-amber-100 text-amber-800'
                            }`}>
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

                        <div className="text-xs text-slate-600 grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                          <div>
                            <strong className="text-slate-700">Corrective Action:</strong> {capa.correctiveAction}
                          </div>
                          {capa.preventiveAction && (
                            <div>
                              <strong className="text-slate-700">Preventive Action:</strong> {capa.preventiveAction}
                            </div>
                          )}
                        </div>

                        <div className="text-[11px] text-slate-400 pt-1 border-t border-slate-100 flex items-center justify-between">
                          <span>Owner: {capa.ownerId}</span>
                          {capa.dueDate && <span>Due: {new Date(capa.dueDate).toLocaleDateString()}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-6 text-center text-xs text-slate-400 bg-slate-50 border border-slate-200 rounded-lg">
                    No CAPA items registered yet for this finding. Add one below to transition status into remediation.
                  </div>
                )}
              </div>

              {/* Add New CAPA Form */}
              <form onSubmit={handleCreateCapa} className="border-t border-slate-200 pt-4 space-y-3">
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                  Add New Action Item
                </h4>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Action Title *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Implement MFA enforcement policy across AWS IAM"
                    value={capaForm.title}
                    onChange={(e) => setCapaForm({ ...capaForm, title: e.target.value })}
                    className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Corrective Action *</label>
                    <textarea
                      required
                      rows={2}
                      placeholder="Immediate fix for existing non-compliance..."
                      value={capaForm.correctiveAction}
                      onChange={(e) => setCapaForm({ ...capaForm, correctiveAction: e.target.value })}
                      className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Preventive Action</label>
                    <textarea
                      rows={2}
                      placeholder="Long-term control / guardrail to prevent recurrence..."
                      value={capaForm.preventiveAction}
                      onChange={(e) => setCapaForm({ ...capaForm, preventiveAction: e.target.value })}
                      className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Assigned Owner *</label>
                    <input
                      type="text"
                      required
                      value={capaForm.ownerId}
                      onChange={(e) => setCapaForm({ ...capaForm, ownerId: e.target.value })}
                      className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Due Date</label>
                    <input
                      type="date"
                      value={capaForm.dueDate}
                      onChange={(e) => setCapaForm({ ...capaForm, dueDate: e.target.value })}
                      className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                    />
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    type="submit"
                    disabled={submittingCapa}
                    className="px-4 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg disabled:opacity-50 transition-colors shadow-sm flex items-center gap-1.5"
                  >
                    {submittingCapa ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Creating CAPA...</span>
                      </>
                    ) : (
                      <>
                        <Plus className="w-3.5 h-3.5" />
                        <span>Create CAPA Item</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Formal Verification Modal */}
      {showVerifyModal && verifyTarget && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-70 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4"
        >
          <div className="bg-white rounded-xl max-w-md w-full shadow-2xl p-5 sm:p-6 border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-bold text-slate-900 text-base">Formal Audit Finding Verification</h3>
              <button
                type="button"
                onClick={() => {
                  setShowVerifyModal(false);
                  setVerifyTarget(null);
                }}
                className="text-slate-400 hover:text-slate-700 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="text-xs text-slate-600 space-y-1">
              <div>Target Finding: <strong className="text-slate-800">{verifyTarget.title}</strong></div>
              <div>Current Status: <strong className="text-teal-800">{verifyTarget.status}</strong></div>
            </div>

            <form onSubmit={handleSubmitVerification} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Target Verification Status</label>
                <select
                  value={verifyStatus}
                  onChange={(e) => setVerifyStatus(e.target.value as any)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                >
                  <option value={FindingStatus.VERIFIED}>VERIFIED — Evidence and remediation validated</option>
                  <option value={FindingStatus.CLOSED}>CLOSED — Fully remediated & signed off</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Verification Notes / Evidence Signoff</label>
                <textarea
                  rows={3}
                  required
                  placeholder="Record auditor verification remarks, evidence inspected, and rationale..."
                  value={verifyNotes}
                  onChange={(e) => setVerifyNotes(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowVerifyModal(false)}
                  className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingVerify}
                  className="px-4 py-1.5 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg disabled:opacity-50 transition-colors shadow-sm flex items-center gap-1.5"
                >
                  {submittingVerify ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Verifying...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>Confirm Verification</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Log Finding Modal */}
      {showLogFindingModal && targetCheckItem && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-70 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4"
        >
          <div className="bg-white rounded-xl max-w-md w-full shadow-2xl p-5 sm:p-6 border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-bold text-slate-900 text-base">Log Audit Finding</h3>
              <button
                type="button"
                onClick={() => {
                  setShowLogFindingModal(false);
                  setTargetCheckItem(null);
                }}
                className="text-slate-400 hover:text-slate-700 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateFindingFromCheckItem} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Finding Title *</label>
                <input
                  type="text"
                  required
                  value={logFindingForm.title}
                  onChange={(e) => setLogFindingForm({ ...logFindingForm, title: e.target.value })}
                  className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Severity *</label>
                <select
                  value={logFindingForm.severity}
                  onChange={(e) => setLogFindingForm({ ...logFindingForm, severity: e.target.value as any })}
                  className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                >
                  <option value={VulnerabilitySeverity.CRITICAL}>Critical</option>
                  <option value={VulnerabilitySeverity.HIGH}>High</option>
                  <option value={VulnerabilitySeverity.MEDIUM}>Medium</option>
                  <option value={VulnerabilitySeverity.LOW}>Low</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Description *</label>
                <textarea
                  rows={2}
                  required
                  value={logFindingForm.description}
                  onChange={(e) => setLogFindingForm({ ...logFindingForm, description: e.target.value })}
                  className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Remediation Plan</label>
                <textarea
                  rows={2}
                  placeholder="Recommended corrective steps..."
                  value={logFindingForm.remediationPlan}
                  onChange={(e) => setLogFindingForm({ ...logFindingForm, remediationPlan: e.target.value })}
                  className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Lead Owner *</label>
                <input
                  type="text"
                  required
                  value={logFindingForm.ownerId}
                  onChange={(e) => setLogFindingForm({ ...logFindingForm, ownerId: e.target.value })}
                  className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowLogFindingModal(false)}
                  className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingFinding}
                  className="px-4 py-1.5 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg disabled:opacity-50 transition-colors shadow-sm flex items-center gap-1.5"
                >
                  {submittingFinding ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Logging Finding...</span>
                    </>
                  ) : (
                    <>
                      <AlertCircle className="w-3.5 h-3.5" />
                      <span>Create Finding</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
