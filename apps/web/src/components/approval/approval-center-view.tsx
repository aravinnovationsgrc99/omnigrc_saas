'use client';

import React, { useState, useEffect } from 'react';
import {
  CheckCircle2,
  XCircle,
  Clock,
  RotateCcw,
  ShieldCheck,
  ShieldAlert,
  FileCheck2,
  Plus,
  UserCheck,
  Building2,
  Briefcase,
  User,
  GitCommit,
  Check,
  AlertCircle,
  Send,
  Eye,
  ListFilter,
  Lock,
} from 'lucide-react';
import { apiRequest } from '@/lib/api-client';
import {
  ApprovalInstanceDto,
  ApprovalWorkflowDto,
  ApprovalInstanceStatus,
  ApprovalStepStatus,
  DecisionAction,
  ApproverType,
  Role,
  PaginatedApprovalsDto,
} from '@omnigrc/shared';
import { useToast } from '@/context/toast-context';

export function ApprovalCenterView() {
  const { addToast } = useToast();
  const [activeTab, setActiveTab] = useState<'assigned' | 'my_requests' | 'workflows' | 'history'>('assigned');
  const [loading, setLoading] = useState(true);
  const [approvals, setApprovals] = useState<ApprovalInstanceDto[]>([]);
  const [workflows, setWorkflows] = useState<ApprovalWorkflowDto[]>([]);
  const [selectedApproval, setSelectedApproval] = useState<ApprovalInstanceDto | null>(null);
  const [showWorkflowModal, setShowWorkflowModal] = useState(false);
  const [decisionComment, setDecisionComment] = useState('');
  const [submittingDecision, setSubmittingDecision] = useState(false);

  // Workflow Form State
  const [wfName, setWfName] = useState('');
  const [wfDescription, setWfDescription] = useState('');
  const [wfResourceType, setWfResourceType] = useState('POLICY');
  const [wfAllowSelf, setWfAllowSelf] = useState(false);
  const [wfSteps, setWfSteps] = useState<
    Array<{ stepNumber: number; name: string; approverType: ApproverType; targetRole: Role }>
  >([
    { stepNumber: 1, name: 'Initial Review', approverType: ApproverType.ROLE, targetRole: Role.ANALYST },
    { stepNumber: 2, name: 'Executive Sign-off', approverType: ApproverType.ROLE, targetRole: Role.ADMIN },
  ]);
  const [submittingWf, setSubmittingWf] = useState(false);

  useEffect(() => {
    fetchData();
  }, [activeTab]);

  async function fetchData() {
    setLoading(true);
    try {
      if (activeTab === 'workflows') {
        const wfRes = await apiRequest<ApprovalWorkflowDto[]>('/approval-workflows');
        setWorkflows(wfRes || []);
      } else {
        const query =
          activeTab === 'assigned'
            ? '?assignedToMe=true'
            : activeTab === 'my_requests'
            ? '?mySubmissions=true'
            : '';
        const res = await apiRequest<PaginatedApprovalsDto>(`/approvals${query}`);
        setApprovals(res.items || []);
      }
    } catch (err: any) {
      addToast(`Failed to load data: ${err.message}`, 'error');
    } finally {
      setLoading(false);
    }
  }

  async function handleDecision(action: DecisionAction) {
    if (!selectedApproval) return;
    setSubmittingDecision(true);
    try {
      const endpoint =
        action === DecisionAction.APPROVE
          ? 'approve'
          : action === DecisionAction.REJECT
          ? 'reject'
          : 'request-changes';
      const updated = await apiRequest<ApprovalInstanceDto>(`/approvals/${selectedApproval.id}/${endpoint}`, {
        method: 'POST',
        body: JSON.stringify({ action, comment: decisionComment }),
      });
      addToast(`Decision recorded: ${action}`, 'success');
      setSelectedApproval(updated);
      setDecisionComment('');
      fetchData();
    } catch (err: any) {
      addToast(`Decision failed: ${err.message}`, 'error');
    } finally {
      setSubmittingDecision(false);
    }
  }

  async function handleCancelRequest(id: string) {
    try {
      await apiRequest(`/approvals/${id}/cancel`, { method: 'POST' });
      addToast('Approval request cancelled.', 'success');
      setSelectedApproval(null);
      fetchData();
    } catch (err: any) {
      addToast(`Cancel failed: ${err.message}`, 'error');
    }
  }

  async function handleCreateWorkflow(e: React.FormEvent) {
    e.preventDefault();
    setSubmittingWf(true);
    try {
      await apiRequest('/approval-workflows', {
        method: 'POST',
        body: JSON.stringify({
          name: wfName,
          description: wfDescription,
          applicableResourceType: wfResourceType,
          allowSelfApproval: wfAllowSelf,
          steps: wfSteps,
        }),
      });
      addToast(`Approval workflow "${wfName}" created.`, 'success');
      setShowWorkflowModal(false);
      setWfName('');
      setWfDescription('');
      fetchData();
    } catch (err: any) {
      addToast(`Failed to create workflow: ${err.message}`, 'error');
    } finally {
      setSubmittingWf(false);
    }
  }

  function renderStatusBadge(status: ApprovalInstanceStatus) {
    switch (status) {
      case ApprovalInstanceStatus.APPROVED:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCircle2 size={13} /> APPROVED
          </span>
        );
      case ApprovalInstanceStatus.REJECTED:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
            <XCircle size={13} /> REJECTED
          </span>
        );
      case ApprovalInstanceStatus.CHANGES_REQUESTED:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
            <RotateCcw size={13} /> CHANGES REQUESTED
          </span>
        );
      case ApprovalInstanceStatus.CANCELLED:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-600 border border-slate-200">
            <XCircle size={13} /> CANCELLED
          </span>
        );
      case ApprovalInstanceStatus.IN_REVIEW:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
            <Clock size={13} /> IN REVIEW
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-sky-50 text-sky-700 border border-sky-200">
            <Clock size={13} /> PENDING
          </span>
        );
    }
  }

  return (
    <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 py-6 omni-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck size={26} className="text-teal-700" />
            <h1 className="text-2xl font-bold text-slate-900">Approval & Review Center</h1>
          </div>
          <p className="text-sm text-slate-600 mt-1">
            Universal, auditable multi-step governance approval engine across OMNiGRC resources.
          </p>
        </div>

        <button
          onClick={() => setShowWorkflowModal(true)}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-teal-700 hover:bg-teal-800 rounded-lg shadow-sm transition-colors"
        >
          <Plus size={16} /> Configure Workflow
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 mb-6 space-x-6">
        {[
          { id: 'assigned', label: 'Assigned to Me', icon: UserCheck },
          { id: 'my_requests', label: 'My Submissions', icon: Send },
          { id: 'history', label: 'All Approvals', icon: ListFilter },
          { id: 'workflows', label: 'Workflow Definitions', icon: GitCommit },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 pb-3 text-sm font-medium border-b-2 transition-colors ${
                isActive
                  ? 'border-teal-700 text-teal-800'
                  : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
              }`}
            >
              <Icon size={16} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Main Content Area */}
      {loading ? (
        <div className="p-12 text-center text-slate-500">
          <Clock className="w-8 h-8 mx-auto animate-spin mb-2 text-teal-600" />
          Loading governance approval records...
        </div>
      ) : activeTab === 'workflows' ? (
        /* Workflows List */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {workflows.map((wf) => (
            <div key={wf.id} className="p-5 bg-white rounded-xl border border-slate-200 shadow-sm hover:border-teal-300 transition-all">
              <div className="flex items-start justify-between">
                <div>
                  <span className="text-xs font-semibold uppercase tracking-wider text-teal-700 bg-teal-50 px-2 py-0.5 rounded border border-teal-100">
                    {wf.applicableResourceType}
                  </span>
                  <h3 className="font-semibold text-slate-900 mt-2 text-base">{wf.name}</h3>
                </div>
                <span className="text-xs px-2 py-1 rounded bg-slate-100 text-slate-700 font-medium">
                  {wf.status}
                </span>
              </div>
              <p className="text-xs text-slate-600 mt-2 line-clamp-2">{wf.description || 'No description provided.'}</p>
              
              <div className="mt-4 border-t border-slate-100 pt-3">
                <div className="text-xs font-semibold text-slate-500 mb-2">SEQUENTIAL STEPS ({wf.steps.length})</div>
                <div className="space-y-1.5">
                  {wf.steps.map((st) => (
                    <div key={st.id} className="flex items-center justify-between text-xs bg-slate-50 px-2.5 py-1.5 rounded text-slate-700">
                      <span>Step {st.stepNumber}: {st.name}</span>
                      <span className="font-medium text-slate-900">{st.targetRole || st.approverType}</span>
                    </div>
                  ))}
                </div>
              </div>

              {wf.allowSelfApproval && (
                <div className="mt-3 flex items-center gap-1.5 text-xs text-amber-700 bg-amber-50 px-2 py-1 rounded">
                  <AlertCircle size={13} /> Self-approval permitted
                </div>
              )}
            </div>
          ))}
          {workflows.length === 0 && (
            <div className="col-span-full p-8 text-center text-slate-500 bg-white rounded-xl border border-slate-200">
              No workflow definitions created yet. Click "Configure Workflow" to define a reusable approval process.
            </div>
          )}
        </div>
      ) : (
        /* Approvals List & Detail View */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* List Table */}
          <div className={`${selectedApproval ? 'lg:col-span-6' : 'lg:col-span-12'} transition-all`}>
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <table className="w-full text-left text-sm text-slate-600">
                <thead className="bg-slate-50 text-xs font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3">Resource / Title</th>
                    <th className="px-4 py-3">Requester</th>
                    <th className="px-4 py-3">Step</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {approvals.map((appr) => {
                    const isSelected = selectedApproval?.id === appr.id;
                    return (
                      <tr
                        key={appr.id}
                        className={`hover:bg-slate-50 transition-colors ${isSelected ? 'bg-teal-50/50' : ''}`}
                      >
                        <td className="px-4 py-3">
                          <div className="font-semibold text-slate-900">{appr.title}</div>
                          <div className="text-xs text-slate-400 font-mono">
                            {appr.resourceType} · {appr.resourceId.slice(0, 8)}...
                          </div>
                        </td>
                        <td className="px-4 py-3 text-slate-700 text-xs font-medium">
                          {appr.requesterName}
                        </td>
                        <td className="px-4 py-3 text-xs font-semibold text-slate-700">
                          Step {appr.currentStepNumber} / {appr.steps.length}
                        </td>
                        <td className="px-4 py-3">{renderStatusBadge(appr.status)}</td>
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={() => setSelectedApproval(appr)}
                            className="inline-flex items-center gap-1 px-3 py-1 text-xs font-medium text-teal-700 bg-teal-50 hover:bg-teal-100 rounded border border-teal-200 transition-colors"
                          >
                            <Eye size={13} /> View
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {approvals.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                        No approval requests found for this filter.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Drawer / Detail View */}
          {selectedApproval && (
            <div className="lg:col-span-6 bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-6 omni-fade-in">
              <div className="flex items-start justify-between border-b border-slate-200 pb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                      {selectedApproval.resourceType}
                    </span>
                    {renderStatusBadge(selectedApproval.status)}
                  </div>
                  <h2 className="text-lg font-bold text-slate-900 mt-2">{selectedApproval.title}</h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Requested by <span className="font-semibold text-slate-700">{selectedApproval.requesterName}</span> on{' '}
                    {new Date(selectedApproval.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <button
                  onClick={() => setSelectedApproval(null)}
                  className="text-slate-400 hover:text-slate-600 p-1"
                >
                  <XCircle size={18} />
                </button>
              </div>

              {/* Sequential Steps Progress Bar */}
              <div>
                <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
                  Sequential Review Pipeline
                </h3>
                <div className="space-y-2">
                  {selectedApproval.steps.map((st) => {
                    const isCurrent = st.stepNumber === selectedApproval.currentStepNumber;
                    return (
                      <div
                        key={st.id}
                        className={`flex items-center justify-between p-3 rounded-lg border text-xs transition-all ${
                          st.status === ApprovalStepStatus.APPROVED
                            ? 'bg-emerald-50/50 border-emerald-200 text-emerald-900'
                            : st.status === ApprovalStepStatus.ACTIVE
                            ? 'bg-sky-50 border-sky-300 text-sky-900 font-medium shadow-sm'
                            : st.status === ApprovalStepStatus.REJECTED
                            ? 'bg-rose-50 border-rose-200 text-rose-900'
                            : 'bg-slate-50 border-slate-200 text-slate-500'
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <span
                            className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-xs ${
                              st.status === ApprovalStepStatus.APPROVED
                                ? 'bg-emerald-600 text-white'
                                : st.status === ApprovalStepStatus.ACTIVE
                                ? 'bg-sky-600 text-white'
                                : 'bg-slate-200 text-slate-600'
                            }`}
                          >
                            {st.stepNumber}
                          </span>
                          <div>
                            <div className="font-semibold">{st.name}</div>
                            <div className="text-[11px] opacity-75">
                              Target: {st.targetRole || st.approverType}
                            </div>
                          </div>
                        </div>
                        <span className="font-semibold uppercase tracking-wider">{st.status}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Decision History Log */}
              <div>
                <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
                  Immutable Decision Log
                </h3>
                <div className="space-y-3 max-h-48 overflow-y-auto pr-1">
                  {selectedApproval.decisions.map((dec) => (
                    <div key={dec.id} className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs">
                      <div className="flex items-center justify-between font-medium">
                        <span className="text-slate-900 font-semibold">{dec.actorName}</span>
                        <span
                          className={`font-semibold ${
                            dec.action === DecisionAction.APPROVE
                              ? 'text-emerald-700'
                              : dec.action === DecisionAction.REJECT
                              ? 'text-rose-700'
                              : 'text-amber-700'
                          }`}
                        >
                          {dec.action}
                        </span>
                      </div>
                      {dec.comment && (
                        <p className="text-slate-600 mt-1 italic font-sans">"{dec.comment}"</p>
                      )}
                      <div className="text-[10px] text-slate-400 mt-1">
                        {new Date(dec.createdAt).toLocaleString()}
                      </div>
                    </div>
                  ))}
                  {selectedApproval.decisions.length === 0 && (
                    <div className="text-xs text-slate-400 italic p-3 text-center bg-slate-50 rounded">
                      No decision records submitted yet.
                    </div>
                  )}
                </div>
              </div>

              {/* Action Box for Authorized Approvers */}
              {selectedApproval.canUserApprove ? (
                <div className="p-4 bg-teal-50 border border-teal-200 rounded-xl space-y-3">
                  <h3 className="text-xs font-bold text-teal-900 uppercase tracking-wider flex items-center gap-1.5">
                    <ShieldCheck size={16} className="text-teal-700" /> Authorized Reviewer Action
                  </h3>
                  <textarea
                    value={decisionComment}
                    onChange={(e) => setDecisionComment(e.target.value)}
                    placeholder="Enter review decision notes, audit comments, or required changes..."
                    className="w-full text-xs p-2.5 rounded-lg border border-teal-300 focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white"
                    rows={2}
                  />
                  <div className="flex items-center gap-2">
                    <button
                      disabled={submittingDecision}
                      onClick={() => handleDecision(DecisionAction.APPROVE)}
                      className="flex-1 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors flex items-center justify-center gap-1"
                    >
                      <Check size={14} /> Approve Step
                    </button>
                    <button
                      disabled={submittingDecision}
                      onClick={() => handleDecision(DecisionAction.REQUEST_CHANGES)}
                      className="flex-1 py-2 text-xs font-semibold text-amber-900 bg-amber-200 hover:bg-amber-300 rounded-lg transition-colors flex items-center justify-center gap-1"
                    >
                      <RotateCcw size={14} /> Request Changes
                    </button>
                    <button
                      disabled={submittingDecision}
                      onClick={() => handleDecision(DecisionAction.REJECT)}
                      className="flex-1 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-lg transition-colors flex items-center justify-center gap-1"
                    >
                      <XCircle size={14} /> Reject Request
                    </button>
                  </div>
                </div>
              ) : (
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-600 flex items-center gap-2">
                  <Lock size={15} className="text-slate-400 shrink-0" />
                  <span>
                    You are not authorized to act on this step, or the request has been finalized.
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Create Workflow Modal */}
      {showWorkflowModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6 space-y-4 omni-fade-in border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <GitCommit size={18} className="text-teal-700" /> Create Approval Workflow Definition
              </h2>
              <button onClick={() => setShowWorkflowModal(false)} className="text-slate-400 hover:text-slate-600">
                <XCircle size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateWorkflow} className="space-y-4 text-xs">
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Workflow Name</label>
                <input
                  type="text"
                  required
                  value={wfName}
                  onChange={(e) => setWfName(e.target.value)}
                  placeholder="e.g. Standard Policy Review Workflow"
                  className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Applicable Resource Type</label>
                <select
                  value={wfResourceType}
                  onChange={(e) => setWfResourceType(e.target.value)}
                  className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:outline-none"
                >
                  <option value="POLICY">Policy</option>
                  <option value="POLICY_EXCEPTION">Policy Exception</option>
                  <option value="CONTROL">Control</option>
                  <option value="RISK">Risk</option>
                  <option value="AUDIT_FINDING">Audit Finding</option>
                  <option value="VENDOR_ASSESSMENT">Vendor Assessment</option>
                  <option value="EVIDENCE">Evidence</option>
                </select>
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Description</label>
                <textarea
                  value={wfDescription}
                  onChange={(e) => setWfDescription(e.target.value)}
                  placeholder="Workflow governance objectives..."
                  rows={2}
                  className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:outline-none"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="selfAppr"
                  checked={wfAllowSelf}
                  onChange={(e) => setWfAllowSelf(e.target.checked)}
                  className="rounded text-teal-600 focus:ring-teal-500"
                />
                <label htmlFor="selfAppr" className="font-medium text-slate-700">
                  Allow Requester Self-Approval (Disabled by default for separation of duties)
                </label>
              </div>

              <div className="border-t border-slate-200 pt-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-semibold text-slate-700">Sequential Steps</span>
                  <button
                    type="button"
                    onClick={() =>
                      setWfSteps([
                        ...wfSteps,
                        {
                          stepNumber: wfSteps.length + 1,
                          name: `Step ${wfSteps.length + 1} Review`,
                          approverType: ApproverType.ROLE,
                          targetRole: Role.ADMIN,
                        },
                      ])
                    }
                    className="text-teal-700 hover:text-teal-800 font-semibold text-[11px] flex items-center gap-1"
                  >
                    <Plus size={12} /> Add Step
                  </button>
                </div>

                <div className="space-y-2 max-h-36 overflow-y-auto pr-1">
                  {wfSteps.map((st, idx) => (
                    <div key={idx} className="flex items-center gap-2 bg-slate-50 p-2 rounded border border-slate-200">
                      <span className="font-bold text-slate-500 text-[11px]">#{st.stepNumber}</span>
                      <input
                        type="text"
                        value={st.name}
                        onChange={(e) => {
                          const updated = [...wfSteps];
                          updated[idx].name = e.target.value;
                          setWfSteps(updated);
                        }}
                        className="flex-1 p-1 text-[11px] border border-slate-300 rounded"
                      />
                      <select
                        value={st.targetRole}
                        onChange={(e) => {
                          const updated = [...wfSteps];
                          updated[idx].targetRole = e.target.value as Role;
                          setWfSteps(updated);
                        }}
                        className="p-1 text-[11px] border border-slate-300 rounded"
                      >
                        <option value="ANALYST">ANALYST</option>
                        <option value="ADMIN">ADMIN</option>
                        <option value="MSSP_ADMIN">MSSP_ADMIN</option>
                        <option value="EXTERNAL_AUDITOR">EXTERNAL_AUDITOR</option>
                      </select>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-slate-200 pt-3">
                <button
                  type="button"
                  onClick={() => setShowWorkflowModal(false)}
                  className="px-3 py-1.5 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingWf}
                  className="px-4 py-1.5 rounded-lg bg-teal-700 hover:bg-teal-800 text-white font-medium shadow-sm"
                >
                  Save Workflow
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
