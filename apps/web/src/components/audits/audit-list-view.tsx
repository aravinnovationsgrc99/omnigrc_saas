'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  ClipboardList, Plus, CheckCircle, AlertOctagon, Clock, ShieldCheck,
  FileText, Play, CheckCircle2, XCircle, HelpCircle, Layers, Search, Filter, X, Loader2
} from 'lucide-react';
import { apiRequest } from '@/lib/api-client';
import {
  AuditPlanDto,
  AuditAssessmentDto,
  AuditFindingDto,
  AuditPlanStatus,
  AuditCheckResult,
  FindingStatus,
  VulnerabilitySeverity,
  PaginatedAuditPlansDto,
  calculateAuditScore,
} from '@omnigrc/shared';
import { useToast } from '@/context/toast-context';
import { ComplianceScopeFilter } from '@/components/ui/compliance-scope-filter';

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
                        <span
                          className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full ${
                            p.status === 'COMPLETED'
                              ? 'bg-emerald-100 text-emerald-800'
                              : p.status === 'IN_PROGRESS'
                              ? 'bg-blue-100 text-blue-800'
                              : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {p.status}
                        </span>
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

      {/* Create Scoped Audit Plan Modal */}
      {showPlanModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-2xl w-full p-6 shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b pb-3 mb-4">
              <h2 className="text-lg font-bold text-slate-900">Create Scoped Compliance Audit Plan</h2>
              <button
                type="button"
                onClick={() => setShowPlanModal(false)}
                className="text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreatePlan} className="space-y-4">
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

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowPlanModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg disabled:opacity-50"
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
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-4xl w-full p-6 shadow-xl max-h-[90vh] overflow-y-auto">
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
                          <div key={ci.id} className="bg-white p-3 rounded-lg border border-slate-200 flex items-center justify-between gap-3">
                            <div>
                              <div className="text-xs font-semibold text-slate-900">{ci.title}</div>
                              {ci.description && <div className="text-[11px] text-slate-500">{ci.description}</div>}
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
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
                          </div>
                        ))
                      ) : (
                        <div className="text-xs text-slate-400 py-2">No check items configured.</div>
                      )}
                    </div>
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
    </div>
  );
}
