'use client';

import React, { useState, useEffect } from 'react';
import {
  FileCheck,
  Plus,
  CheckCircle2,
  Clock,
  ShieldAlert,
  FileText,
  Download,
  Edit2,
  Save,
  X,
  RefreshCw,
  FolderKanban,
  Check,
} from 'lucide-react';
import { apiRequest } from '@/lib/api-client';
import {
  PolicyDto,
  PolicyStatus,
  PaginatedPoliciesDto,
  PolicyCategoryDto,
} from '@omnigrc/shared';
import { useToast } from '@/context/toast-context';
import { PolicyEditor } from './policy-editor';

export function PolicyListView() {
  const { addToast } = useToast();
  const [policies, setPolicies] = useState<PolicyDto[]>([]);
  const [categories, setCategories] = useState<PolicyCategoryDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingCategories, setLoadingCategories] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedPolicy, setSelectedPolicy] = useState<PolicyDto | null>(null);

  // Create Form State
  const [code, setCode] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('Information Security');
  const [ownerId, setOwnerId] = useState('CISO');
  const [initialContent, setInitialContent] = useState(
    '# Policy Title\n\n1. Objective & Purpose\n2. Scope\n3. Compliance Rules and Controls\n4. Enforcement & Violations',
  );
  const [reviewCadenceDays, setReviewCadenceDays] = useState(365);
  const [submitting, setSubmitting] = useState(false);

  // Acknowledgement Summary & Approval State
  const [ackSummary, setAckSummary] = useState<any | null>(null);
  const [loadingAckSummary, setLoadingAckSummary] = useState(false);
  const [submittingApproval, setSubmittingApproval] = useState(false);

  // Edit Draft State
  const [isEditingDraft, setIsEditingDraft] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editCode, setEditCode] = useState('');
  const [editCategory, setEditCategory] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editContent, setEditContent] = useState('');
  const [savingDraft, setSavingDraft] = useState(false);

  useEffect(() => {
    fetchPolicies();
    fetchCategories();
  }, [filterStatus]);

  async function fetchPolicies() {
    setLoading(true);
    try {
      const queryParam = filterStatus !== 'ALL' ? `?status=${filterStatus}` : '';
      const res = await apiRequest<PaginatedPoliciesDto>(`/policies${queryParam}`);
      setPolicies(res.items || []);
    } catch (err: any) {
      addToast(`Failed to load policies: ${err.message}`, 'error');
    } finally {
      setLoading(false);
    }
  }

  async function fetchCategories() {
    setLoadingCategories(true);
    try {
      const data = await apiRequest<PolicyCategoryDto[]>('/policies/categories');
      setCategories(data || []);
      if (data && data.length > 0 && !category) {
        setCategory(data[0].name);
      }
    } catch {
      // Fallback to default if endpoint unavailable
      setCategories([
        { id: '1', name: 'Information Security', isDefault: true, policyCount: 0 },
        { id: '2', name: 'Data Privacy', isDefault: true, policyCount: 0 },
        { id: '3', name: 'Access Control', isDefault: true, policyCount: 0 },
        { id: '4', name: 'Acceptable Use', isDefault: true, policyCount: 0 },
        { id: '5', name: 'Incident Response', isDefault: true, policyCount: 0 },
        { id: '6', name: 'Business Continuity', isDefault: true, policyCount: 0 },
        { id: '7', name: 'Vendor Management', isDefault: true, policyCount: 0 },
        { id: '8', name: 'Compliance', isDefault: true, policyCount: 0 },
      ]);
    } finally {
      setLoadingCategories(false);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await apiRequest('/policies', {
        method: 'POST',
        body: JSON.stringify({
          code,
          title,
          description,
          category,
          ownerId,
          reviewCadenceDays: Number(reviewCadenceDays),
          initialContent,
        }),
      });
      addToast(`Policy "${title}" created as DRAFT.`, 'success');
      setShowCreateModal(false);
      setCode('');
      setTitle('');
      setDescription('');
      setReviewCadenceDays(365);
      setInitialContent(
        '# Policy Title\n\n1. Objective & Purpose\n2. Scope\n3. Compliance Rules and Controls\n4. Enforcement & Violations',
      );
      fetchPolicies();
      fetchCategories();
    } catch (err: any) {
      addToast(`Failed to create policy: ${err.message}`, 'error');
    } finally {
      setSubmitting(false);
    }
  }

  function handleOpenPolicy(policy: PolicyDto) {
    setSelectedPolicy(policy);
    setIsEditingDraft(false);
    setEditTitle(policy.title);
    setEditCode(policy.code);
    setEditCategory(policy.category);
    setEditDescription(policy.description || '');

    const currentContent =
      policy.versions && policy.versions.length > 0
        ? policy.versions[0].content
        : policy.publishedVersion?.content || '';
    setEditContent(currentContent);

    // Fetch acknowledgement summary for attestation metrics
    setLoadingAckSummary(true);
    apiRequest<any>(`/policies/${policy.id}/acknowledgement-summary`)
      .then((data) => setAckSummary(data))
      .catch(() => setAckSummary(null))
      .finally(() => setLoadingAckSummary(false));
  }

  async function handleSubmitApproval() {
    if (!selectedPolicy) return;
    setSubmittingApproval(true);
    try {
      await apiRequest(`/policies/${selectedPolicy.id}/submit-approval`, {
        method: 'POST',
        body: JSON.stringify({
          title: `Formal Approval for Policy: ${selectedPolicy.title}`,
          dueDays: 14,
        }),
      });
      addToast('Submitted policy for formal approval.', 'success');
      fetchPolicies();
    } catch (err: any) {
      addToast(`Failed to submit approval: ${err.message}`, 'error');
    } finally {
      setSubmittingApproval(false);
    }
  }

  async function handleSaveDraft() {
    if (!selectedPolicy) return;
    setSavingDraft(true);
    try {
      const updated = await apiRequest<PolicyDto>(`/policies/${selectedPolicy.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          title: editTitle,
          code: editCode,
          category: editCategory,
          description: editDescription,
          content: editContent,
        }),
      });
      setSelectedPolicy(updated);
      setIsEditingDraft(false);
      addToast(`Draft policy "${editTitle}" updated successfully.`, 'success');
      fetchPolicies();
      fetchCategories();
    } catch (err: any) {
      addToast(`Failed to save draft: ${err.message}`, 'error');
    } finally {
      setSavingDraft(false);
    }
  }

  async function handleStatusTransition(policyId: string, action: string) {
    try {
      await apiRequest(`/policies/${policyId}/${action}`, { method: 'POST' });
      addToast(`Policy status updated.`, 'success');
      fetchPolicies();
      if (selectedPolicy && selectedPolicy.id === policyId) {
        const updated = await apiRequest<PolicyDto>(`/policies/${policyId}`);
        setSelectedPolicy(updated);
      }
    } catch (err: any) {
      addToast(`Action failed: ${err.message}`, 'error');
    }
  }

  async function handleAttest(versionId: string) {
    try {
      await apiRequest(`/policies/versions/${versionId}/attest`, { method: 'POST' });
      addToast('Policy version successfully attested!', 'success');
    } catch (err: any) {
      addToast(`Attestation failed: ${err.message}`, 'error');
    }
  }

  function downloadPolicyContent(p: PolicyDto, content: string) {
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${p.code || 'policy'}_${p.title.replace(/\s+/g, '_')}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    addToast('Downloaded policy document (.md).', 'success');
  }

  return (
    <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 py-6 omni-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2">
            <FileCheck size={22} className="text-teal-700" />
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Policy Management</h1>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Controlled policy lifecycle (Draft → Review → Published → Retired) & version attestation.
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg transition-colors shadow-sm"
        >
          <Plus size={16} /> Create Policy Draft
        </button>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 mb-6 overflow-x-auto pb-1">
        {['ALL', 'DRAFT', 'UNDER_REVIEW', 'APPROVED', 'PUBLISHED', 'RETIRED'].map((st) => (
          <button
            key={st}
            onClick={() => setFilterStatus(st)}
            className={`px-3 py-1.5 text-xs font-semibold rounded-t-md transition-colors whitespace-nowrap ${
              filterStatus === st
                ? 'bg-white border border-slate-200 border-b-white text-teal-800 -mb-px'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {st.replace('_', ' ')}
          </button>
        ))}
      </div>

      {/* Policy List */}
      {loading ? (
        <div className="p-8 text-center text-sm text-slate-500">Loading policies...</div>
      ) : policies.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-slate-500">
          No policies found for state "{filterStatus}".
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {policies.map((p) => (
            <div
              key={p.id}
              className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm hover:border-slate-300 transition-all flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="omni-mono text-xs font-bold text-slate-500">{p.code}</span>
                  <span
                    className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${
                      p.status === 'PUBLISHED'
                        ? 'bg-emerald-100 text-emerald-800'
                        : p.status === 'APPROVED'
                        ? 'bg-blue-100 text-blue-800'
                        : p.status === 'UNDER_REVIEW'
                        ? 'bg-amber-100 text-amber-800'
                        : 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    {p.status}
                  </span>
                </div>
                <h3 className="font-semibold text-slate-900 text-base mb-1">{p.title}</h3>
                <p className="text-xs text-slate-500 line-clamp-2 mb-3">
                  {p.description || 'No description'}
                </p>
                <div className="text-xs text-slate-600 space-y-1">
                  <div>
                    <strong>Category:</strong> {p.category}
                  </div>
                  <div>
                    <strong>Owner:</strong> {p.ownerId}
                  </div>
                  {p.publishedVersion && (
                    <div>
                      <strong>Version:</strong> v{p.publishedVersion.versionNumber}
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                <button
                  onClick={() => handleOpenPolicy(p)}
                  className="text-xs font-semibold text-teal-700 hover:text-teal-900"
                >
                  View Details & Content
                </button>
                <div className="flex items-center gap-1">
                  {p.status === 'DRAFT' && (
                    <button
                      onClick={() => handleStatusTransition(p.id, 'submit-for-review')}
                      className="px-2 py-1 text-xs font-semibold bg-amber-50 text-amber-800 hover:bg-amber-100 rounded"
                    >
                      Submit Review
                    </button>
                  )}
                  {p.status === 'UNDER_REVIEW' && (
                    <button
                      onClick={() => handleStatusTransition(p.id, 'approve')}
                      className="px-2 py-1 text-xs font-semibold bg-blue-50 text-blue-800 hover:bg-blue-100 rounded"
                    >
                      Approve
                    </button>
                  )}
                  {p.status === 'APPROVED' && (
                    <button
                      onClick={() => handleStatusTransition(p.id, 'publish')}
                      className="px-2 py-1 text-xs font-semibold bg-emerald-50 text-emerald-800 hover:bg-emerald-100 rounded"
                    >
                      Publish
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 omni-fade-in">
          <div className="bg-white rounded-xl max-w-3xl w-full p-6 shadow-xl max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b pb-3 mb-4">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Create New Policy Draft</h2>
                <p className="text-xs text-slate-500">
                  Standardized GRC policy document with Markdown authoring, document import, and category assignment.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreate} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Policy Code
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. POL-SEC-001"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600 omni-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Category
                  </label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600 bg-white"
                  >
                    {categories.map((c) => (
                      <option key={c.id || c.name} value={c.name}>
                        {c.name} {c.isDefault ? '(Default)' : ''}
                      </option>
                    ))}
                    {!categories.some((c) => c.name === category) && category && (
                      <option value={category}>{category}</option>
                    )}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Title</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Information Security & Acceptable Use Policy"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Summary / Scope Description
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Mandatory user obligations and security rules"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Review Cadence (Days)
                  </label>
                  <input
                    type="number"
                    min="30"
                    max="730"
                    value={reviewCadenceDays}
                    onChange={(e) => setReviewCadenceDays(Number(e.target.value))}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Policy Content & Clauses
                </label>
                <PolicyEditor
                  content={initialContent}
                  onChange={setInitialContent}
                  documentTitle={title || code || 'new-policy-draft'}
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg disabled:opacity-50"
                >
                  {submitting ? 'Creating...' : 'Create Policy Draft'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Policy Details & Editor Modal */}
      {selectedPolicy && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 omni-fade-in">
          <div className="bg-white rounded-xl max-w-3xl w-full p-6 shadow-xl max-h-[92vh] overflow-y-auto flex flex-col">
            <div className="flex items-center justify-between border-b pb-3 mb-4">
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono font-bold text-teal-800 bg-teal-100 px-2 py-0.5 rounded border border-teal-200">
                  {selectedPolicy.code}
                </span>
                <span
                  className={`text-xs font-semibold px-2 py-0.5 rounded ${
                    selectedPolicy.status === 'PUBLISHED'
                      ? 'bg-emerald-100 text-emerald-800'
                      : selectedPolicy.status === 'APPROVED'
                      ? 'bg-blue-100 text-blue-800'
                      : selectedPolicy.status === 'UNDER_REVIEW'
                      ? 'bg-amber-100 text-amber-800'
                      : 'bg-slate-100 text-slate-700'
                  }`}
                >
                  {selectedPolicy.status}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {selectedPolicy.status === 'DRAFT' && !isEditingDraft && (
                  <button
                    onClick={() => setIsEditingDraft(true)}
                    className="px-3 py-1 text-xs font-semibold text-teal-700 bg-teal-50 hover:bg-teal-100 rounded flex items-center gap-1"
                  >
                    <Edit2 size={13} /> Edit Draft
                  </button>
                )}
                <button
                  onClick={() => setSelectedPolicy(null)}
                  className="text-slate-400 hover:text-slate-700 p-1"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* DRAFT EDIT MODE */}
            {selectedPolicy.status === 'DRAFT' && isEditingDraft ? (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Policy Code
                    </label>
                    <input
                      type="text"
                      value={editCode}
                      onChange={(e) => setEditCode(e.target.value)}
                      className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Category
                    </label>
                    <select
                      value={editCategory}
                      onChange={(e) => setEditCategory(e.target.value)}
                      className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded bg-white"
                    >
                      {categories.map((c) => (
                        <option key={c.id || c.name} value={c.name}>
                          {c.name}
                        </option>
                      ))}
                      {!categories.some((c) => c.name === editCategory) && editCategory && (
                        <option value={editCategory}>{editCategory}</option>
                      )}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Title</label>
                  <input
                    type="text"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Description
                  </label>
                  <input
                    type="text"
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Content Editor
                  </label>
                  <PolicyEditor
                    content={editContent}
                    onChange={setEditContent}
                    documentTitle={editTitle || editCode}
                  />
                </div>

                <div className="flex justify-end gap-2 pt-3 border-t">
                  <button
                    type="button"
                    onClick={() => setIsEditingDraft(false)}
                    className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveDraft}
                    disabled={savingDraft}
                    className="px-4 py-1.5 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded flex items-center gap-1.5"
                  >
                    <Save size={13} />
                    {savingDraft ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              </div>
            ) : (
              /* VIEW / READER MODE */
              <div>
                <h2 className="text-xl font-bold text-slate-900 mb-1">{selectedPolicy.title}</h2>
                <p className="text-xs text-slate-500 mb-4">{selectedPolicy.description}</p>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-3 bg-slate-50 rounded-lg text-xs mb-4">
                  <div>
                    <span className="text-slate-500 block">Category:</span>
                    <strong className="text-slate-800">{selectedPolicy.category}</strong>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Owner:</span>
                    <strong className="text-slate-800">{selectedPolicy.ownerId}</strong>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Cadence:</span>
                    <strong className="text-slate-800">
                      {selectedPolicy.reviewCadenceDays} days
                    </strong>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Status:</span>
                    <strong className="text-slate-800">{selectedPolicy.status}</strong>
                  </div>
                </div>

                {/* Acknowledgement Tracking & Formal Approval Panel */}
                <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl mb-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                      Attestation & Acknowledgement Tracking
                    </span>
                    <button
                      onClick={handleSubmitApproval}
                      disabled={submittingApproval}
                      className="px-3 py-1 text-xs font-bold bg-slate-900 hover:bg-slate-800 text-white rounded-lg flex items-center gap-1.5 transition"
                    >
                      <CheckCircle2 size={13} />
                      {submittingApproval ? 'Submitting...' : 'Submit for Formal Approval'}
                    </button>
                  </div>

                  {loadingAckSummary ? (
                    <div className="text-xs text-slate-500 py-1">Loading acknowledgement metrics...</div>
                  ) : ackSummary ? (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                      <div className="p-2 bg-white rounded-lg border border-slate-200">
                        <span className="text-slate-500 block text-[11px]">Compliance Rate</span>
                        <span className="text-sm font-bold text-teal-800">{ackSummary.compliancePercentage || 0}%</span>
                      </div>
                      <div className="p-2 bg-white rounded-lg border border-slate-200">
                        <span className="text-slate-500 block text-[11px]">Acknowledged</span>
                        <span className="text-sm font-bold text-emerald-800">{ackSummary.attestedUsersCount || 0} users</span>
                      </div>
                      <div className="p-2 bg-white rounded-lg border border-slate-200">
                        <span className="text-slate-500 block text-[11px]">Pending</span>
                        <span className="text-sm font-bold text-amber-800">{ackSummary.pendingUsersCount || 0} users</span>
                      </div>
                      <div className="p-2 bg-white rounded-lg border border-slate-200">
                        <span className="text-slate-500 block text-[11px]">Eligible Total</span>
                        <span className="text-sm font-bold text-slate-800">{ackSummary.totalEligibleUsers || 0}</span>
                      </div>
                    </div>
                  ) : (
                    <div className="text-xs text-slate-500">No active attestation campaign recorded.</div>
                  )}
                </div>

                {selectedPolicy.publishedVersion ? (
                  <div>
                    <div className="flex items-center justify-between text-xs text-slate-500 mb-3 bg-teal-50/50 border border-teal-100 p-3 rounded-lg">
                      <div>
                        Published Version: <strong>v{selectedPolicy.publishedVersion.versionNumber}</strong>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() =>
                            downloadPolicyContent(
                              selectedPolicy,
                              selectedPolicy.publishedVersion?.content || '',
                            )
                          }
                          className="px-2.5 py-1 text-xs text-slate-700 bg-white border border-slate-300 rounded hover:bg-slate-50 flex items-center gap-1"
                        >
                          <Download size={13} /> Export .md
                        </button>
                        <button
                          onClick={() => handleAttest(selectedPolicy.publishedVersion!.id)}
                          className="px-3 py-1 bg-teal-700 text-white font-semibold rounded hover:bg-teal-800"
                        >
                          Attest Policy Compliance
                        </button>
                      </div>
                    </div>
                    <PolicyEditor
                      content={selectedPolicy.publishedVersion.content}
                      onChange={() => {}}
                      readOnly={true}
                    />
                  </div>
                ) : selectedPolicy.versions && selectedPolicy.versions.length > 0 ? (
                  <div>
                    <div className="flex items-center justify-between text-xs text-slate-500 mb-3 bg-amber-50 border border-amber-100 p-2.5 rounded-lg">
                      <span>
                        Draft Version <strong>v{selectedPolicy.versions[0].versionNumber}</strong> ({selectedPolicy.status})
                      </span>
                      <button
                        onClick={() =>
                          downloadPolicyContent(
                            selectedPolicy,
                            selectedPolicy.versions?.[0]?.content || '',
                          )
                        }
                        className="px-2.5 py-1 text-xs text-slate-700 bg-white border border-slate-300 rounded hover:bg-slate-50 flex items-center gap-1"
                      >
                        <Download size={13} /> Export .md
                      </button>
                    </div>
                    <PolicyEditor
                      content={selectedPolicy.versions[0].content}
                      onChange={() => {}}
                      readOnly={true}
                    />
                  </div>
                ) : (
                  <div className="text-xs text-slate-500 py-6 text-center">
                    No content recorded for this policy document yet.
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
