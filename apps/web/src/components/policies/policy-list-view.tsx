'use client';

import React, { useState, useEffect } from 'react';
import { FileCheck, Plus, CheckCircle2, Clock, ShieldAlert, FileText } from 'lucide-react';
import { apiRequest } from '@/lib/api-client';
import { PolicyDto, PolicyStatus, PaginatedPoliciesDto } from '@omnigrc/shared';
import { useToast } from '@/context/toast-context';

export function PolicyListView() {
  const { addToast } = useToast();
  const [policies, setPolicies] = useState<PolicyDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedPolicy, setSelectedPolicy] = useState<PolicyDto | null>(null);

  // Form State
  const [code, setCode] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('Information Security');
  const [ownerId, setOwnerId] = useState('CISO');
  const [initialContent, setInitialContent] = useState('# Policy Title\n\n1. Objective\n2. Scope\n3. Compliance Rules');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchPolicies();
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
          initialContent,
        }),
      });
      addToast(`Policy "${title}" created as DRAFT.`, 'success');
      setShowCreateModal(false);
      setCode('');
      setTitle('');
      setDescription('');
      fetchPolicies();
    } catch (err: any) {
      addToast(`Failed to create policy: ${err.message}`, 'error');
    } finally {
      setSubmitting(false);
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
            <div key={p.id} className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm hover:border-slate-300 transition-all flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="omni-mono text-xs font-bold text-slate-500">{p.code}</span>
                  <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${
                    p.status === 'PUBLISHED' ? 'bg-emerald-100 text-emerald-800' :
                    p.status === 'APPROVED' ? 'bg-blue-100 text-blue-800' :
                    p.status === 'UNDER_REVIEW' ? 'bg-amber-100 text-amber-800' :
                    'bg-slate-100 text-slate-700'
                  }`}>
                    {p.status}
                  </span>
                </div>
                <h3 className="font-semibold text-slate-900 text-base mb-1">{p.title}</h3>
                <p className="text-xs text-slate-500 line-clamp-2 mb-3">{p.description || 'No description'}</p>
                <div className="text-xs text-slate-600 space-y-1">
                  <div><strong>Category:</strong> {p.category}</div>
                  <div><strong>Owner:</strong> {p.ownerId}</div>
                  {p.publishedVersion && (
                    <div><strong>Version:</strong> v{p.publishedVersion.versionNumber}</div>
                  )}
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                <button
                  onClick={() => setSelectedPolicy(p)}
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
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-lg w-full p-6 shadow-xl max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-bold text-slate-900 mb-4">Create New Policy Draft</h2>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Policy Code</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. POL-SEC-001"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Title</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Information Security Policy"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Category</label>
                <input
                  type="text"
                  required
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Initial Content (Markdown)</label>
                <textarea
                  rows={5}
                  required
                  value={initialContent}
                  onChange={(e) => setInitialContent(e.target.value)}
                  className="w-full px-3 py-2 text-sm omni-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
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
                  {submitting ? 'Creating...' : 'Create Draft'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Policy Reader Modal */}
      {selectedPolicy && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-2xl w-full p-6 shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b pb-3 mb-4">
              <div>
                <span className="text-xs font-bold text-slate-400 omni-mono">{selectedPolicy.code}</span>
                <h2 className="text-lg font-bold text-slate-900">{selectedPolicy.title}</h2>
              </div>
              <button
                onClick={() => setSelectedPolicy(null)}
                className="text-xs font-semibold text-slate-500 hover:text-slate-800"
              >
                Close
              </button>
            </div>
            {selectedPolicy.publishedVersion ? (
              <div>
                <div className="flex items-center justify-between text-xs text-slate-500 mb-4 bg-slate-50 p-3 rounded-lg">
                  <div>Published Version: <strong>v{selectedPolicy.publishedVersion.versionNumber}</strong></div>
                  <button
                    onClick={() => handleAttest(selectedPolicy.publishedVersion!.id)}
                    className="px-3 py-1.5 bg-teal-700 text-white font-semibold rounded hover:bg-teal-800"
                  >
                    Attest Policy Compliance
                  </button>
                </div>
                <div className="prose max-w-none text-xs text-slate-700 whitespace-pre-wrap omni-mono bg-slate-50/50 p-4 rounded-lg border">
                  {selectedPolicy.publishedVersion.content}
                </div>
              </div>
            ) : (
              <div className="text-xs text-slate-500 py-4 text-center">
                This policy has not been published yet. Current status: <strong>{selectedPolicy.status}</strong>.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
