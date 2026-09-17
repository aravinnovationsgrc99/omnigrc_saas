'use client';

import React, { useState, useEffect } from 'react';
import {
  ClipboardList, Plus, CheckCircle, AlertOctagon, Clock, ShieldCheck,
  FileText, Play, CheckCircle2, XCircle, HelpCircle, Layers
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

  // Form State - Audit Plan
  const [planTitle, setPlanTitle] = useState('');
  const [objective, setObjective] = useState('');
  const [frameworkCode, setFrameworkCode] = useState('ISO27001');
  const [ownerId, setOwnerId] = useState('Lead Auditor');

  // Form State - Finding
  const [findingTitle, setFindingTitle] = useState('');
  const [severity, setSeverity] = useState<VulnerabilitySeverity>(VulnerabilitySeverity.HIGH);
  const [findingOwner, setFindingOwner] = useState('Compliance Team');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchPlans();
  }, []);

  async function fetchPlans() {
    setLoading(true);
    try {
      const res = await apiRequest<PaginatedAuditPlansDto>('/business-audits/plans');
      setPlans(res.items || []);
    } catch (err: any) {
      addToast(`Failed to load audit plans: ${err.message}`, 'error');
    } finally {
      setLoading(false);
    }
  }

  async function handleCreatePlan(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await apiRequest('/business-audits/plans', {
        method: 'POST',
        body: JSON.stringify({
          title: planTitle,
          objective,
          frameworkCode,
          ownerId,
        }),
      });
      addToast(`Audit Plan "${planTitle}" created.`, 'success');
      setShowPlanModal(false);
      setPlanTitle('');
      setObjective('');
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

  return (
    <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 py-6 omni-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2">
            <ClipboardList size={22} className="text-teal-700" />
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Business Audit Management</h1>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Audit Plans, Execution Assessments, Checklists, Findings & Verification Workflows.
          </p>
        </div>
        <button
          onClick={() => setShowPlanModal(true)}
          className="inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg transition-colors shadow-sm"
        >
          <Plus size={16} /> Create Audit Plan
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
        <div>
          {loading ? (
            <div className="p-8 text-center text-sm text-slate-500">Loading audit plans...</div>
          ) : plans.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-slate-500">
              No audit plans created yet.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {plans.map((p) => (
                <div key={p.id} className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm hover:border-slate-300 transition-all flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <span className="omni-mono text-xs font-bold text-slate-500">{p.frameworkCode || 'INTERNAL'}</span>
                      <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${
                        p.status === 'COMPLETED' ? 'bg-emerald-100 text-emerald-800' :
                        p.status === 'IN_PROGRESS' ? 'bg-blue-100 text-blue-800' :
                        'bg-slate-100 text-slate-700'
                      }`}>
                        {p.status}
                      </span>
                    </div>
                    <h3 className="font-semibold text-slate-900 text-base mb-1">{p.title}</h3>
                    <p className="text-xs text-slate-500 line-clamp-2 mb-3">{p.objective || 'No objective set.'}</p>
                    <div className="text-xs text-slate-600 space-y-1">
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
              ))}
            </div>
          )}
        </div>
      )}

      {/* Create Plan Modal */}
      {showPlanModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-lg w-full p-6 shadow-xl">
            <h2 className="text-lg font-bold text-slate-900 mb-4">Create Audit Plan</h2>
            <form onSubmit={handleCreatePlan} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Audit Title</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. FY26 Q3 ISO27001 Internal Security Audit"
                  value={planTitle}
                  onChange={(e) => setPlanTitle(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Framework / Standard</label>
                  <input
                    type="text"
                    required
                    value={frameworkCode}
                    onChange={(e) => setFrameworkCode(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                  />
                </div>
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
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Objective & Scope</label>
                <textarea
                  rows={3}
                  value={objective}
                  onChange={(e) => setObjective(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
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
                  {submitting ? 'Creating...' : 'Create Plan'}
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
                <span className="text-xs font-mono font-bold text-teal-800 bg-teal-100 px-2 py-0.5 rounded border border-teal-200">{selectedPlan.frameworkCode}</span>
                <h2 className="text-lg font-bold text-slate-900">{selectedPlan.title}</h2>
              </div>
              <button
                onClick={() => setSelectedPlan(null)}
                className="text-xs font-semibold text-slate-500 hover:text-slate-800"
              >
                Close
              </button>
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
                No active assessment runs for this plan. Click "Start Run" to begin execution.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
