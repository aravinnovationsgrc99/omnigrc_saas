'use client';

import React, { useState, useEffect } from 'react';
import { Building2, Plus, AlertTriangle, Calendar, ExternalLink, ShieldCheck, CheckCircle2 } from 'lucide-react';
import { apiRequest } from '@/lib/api-client';
import {
  VendorDto,
  VendorCriticality,
  VendorStatus,
  PaginatedVendorsDto,
} from '@omnigrc/shared';
import { useToast } from '@/context/toast-context';

export function VendorListView() {
  const { addToast } = useToast();
  const [vendors, setVendors] = useState<VendorDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterCriticality, setFilterCriticality] = useState<string>('ALL');
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showAssessmentModal, setShowAssessmentModal] = useState(false);
  const [selectedVendor, setSelectedVendor] = useState<VendorDto | null>(null);

  // New Vendor Form
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('SaaS Provider');
  const [criticality, setCriticality] = useState<VendorCriticality>(VendorCriticality.HIGH);
  const [owner, setOwner] = useState('Security Team');
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [reviewCadenceDays, setReviewCadenceDays] = useState(365);
  const [submitting, setSubmitting] = useState(false);

  // New Assessment Form
  const [assessmentTitle, setAssessmentTitle] = useState('');
  const [assessmentScore, setAssessmentScore] = useState(85);

  useEffect(() => {
    fetchVendors();
  }, [filterCriticality, filterStatus]);

  async function fetchVendors() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterCriticality !== 'ALL') params.set('criticality', filterCriticality);
      if (filterStatus !== 'ALL') params.set('status', filterStatus);

      const queryString = params.toString() ? `?${params.toString()}` : '';
      const res = await apiRequest<PaginatedVendorsDto>(`/vendors${queryString}`);
      setVendors(res.items || []);
    } catch (err: any) {
      addToast(`Failed to load vendors: ${err.message}`, 'error');
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateVendor(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await apiRequest('/vendors', {
        method: 'POST',
        body: JSON.stringify({
          name,
          description,
          category,
          criticality,
          owner,
          websiteUrl: websiteUrl || undefined,
          reviewCadenceDays: Number(reviewCadenceDays),
        }),
      });
      addToast(`Vendor "${name}" created successfully.`, 'success');
      setShowCreateModal(false);
      setName('');
      setDescription('');
      fetchVendors();
    } catch (err: any) {
      addToast(`Failed to create vendor: ${err.message}`, 'error');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCreateAssessment(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedVendor) return;
    setSubmitting(true);
    try {
      await apiRequest(`/vendors/${selectedVendor.id}/assessments`, {
        method: 'POST',
        body: JSON.stringify({
          title: assessmentTitle || `Annual Risk Assessment - ${new Date().getFullYear()}`,
          score: Number(assessmentScore),
          evaluatorId: owner || 'Security Team',
        }),
      });
      addToast('Vendor assessment logged.', 'success');
      setShowAssessmentModal(false);
      setAssessmentTitle('');
      fetchVendors();
    } catch (err: any) {
      addToast(`Failed to record assessment: ${err.message}`, 'error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 py-6 omni-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2">
            <Building2 size={22} className="text-teal-700" />
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Vendor Risk Management</h1>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Track third-party vendor risk profiles, review cadences, and security assessments.
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg transition-colors shadow-sm"
        >
          <Plus size={16} /> Add Vendor
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-6 bg-slate-50 p-3 rounded-lg border border-slate-200">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-600">Criticality:</span>
          <select
            value={filterCriticality}
            onChange={(e) => setFilterCriticality(e.target.value)}
            className="text-xs border border-slate-300 rounded px-2.5 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-teal-600"
          >
            <option value="ALL">All Criticalities</option>
            <option value="CRITICAL">Critical</option>
            <option value="HIGH">High</option>
            <option value="MEDIUM">Medium</option>
            <option value="LOW">Low</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-600">Status:</span>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="text-xs border border-slate-300 rounded px-2.5 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-teal-600"
          >
            <option value="ALL">All Statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="UNDER_REVIEW">Under Review</option>
            <option value="INACTIVE">Inactive</option>
          </select>
        </div>
      </div>

      {/* Vendor Table */}
      {loading ? (
        <div className="p-8 text-center text-sm text-slate-500">Loading vendors...</div>
      ) : vendors.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-slate-500">
          No vendors found matching criteria.
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider">
                  <th className="py-3 px-4">Vendor Name</th>
                  <th className="py-3 px-4">Category</th>
                  <th className="py-3 px-4">Criticality</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Owner</th>
                  <th className="py-3 px-4">Next Review</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {vendors.map((v) => (
                  <tr key={v.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3 px-4 font-semibold text-slate-900">
                      <div className="flex items-center gap-2">
                        {v.name}
                        {v.websiteUrl && (
                          <a href={v.websiteUrl} target="_blank" rel="noreferrer" className="text-slate-400 hover:text-teal-700">
                            <ExternalLink size={12} />
                          </a>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-slate-600">{v.category || 'General'}</td>
                    <td className="py-3 px-4">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        v.criticality === 'CRITICAL' ? 'bg-red-100 text-red-800' :
                        v.criticality === 'HIGH' ? 'bg-orange-100 text-orange-800' :
                        v.criticality === 'MEDIUM' ? 'bg-yellow-100 text-yellow-800' :
                        'bg-slate-100 text-slate-700'
                      }`}>
                        {v.criticality}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        v.status === 'ACTIVE' ? 'bg-emerald-100 text-emerald-800' :
                        v.status === 'UNDER_REVIEW' ? 'bg-amber-100 text-amber-800' :
                        'bg-slate-100 text-slate-600'
                      }`}>
                        {v.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-slate-600">{v.owner}</td>
                    <td className="py-3 px-4 text-slate-600">
                      {v.nextReviewDate ? new Date(v.nextReviewDate).toLocaleDateString() : 'N/A'}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={() => {
                          setSelectedVendor(v);
                          setShowAssessmentModal(true);
                        }}
                        className="px-2.5 py-1 text-xs font-semibold text-teal-700 bg-teal-50 hover:bg-teal-100 rounded transition-colors"
                      >
                        Record Assessment
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Create Vendor Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-lg w-full p-6 shadow-xl max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-bold text-slate-900 mb-4">Add Third-Party Vendor</h2>
            <form onSubmit={handleCreateVendor} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Vendor Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. AWS / CrowdStrike / Salesforce"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
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
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Criticality</label>
                  <select
                    value={criticality}
                    onChange={(e) => setCriticality(e.target.value as VendorCriticality)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600 bg-white"
                  >
                    <option value="CRITICAL">Critical</option>
                    <option value="HIGH">High</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="LOW">Low</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Owner</label>
                  <input
                    type="text"
                    required
                    value={owner}
                    onChange={(e) => setOwner(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Review Cadence (Days)</label>
                  <input
                    type="number"
                    required
                    value={reviewCadenceDays}
                    onChange={(e) => setReviewCadenceDays(Number(e.target.value))}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Website URL</label>
                <input
                  type="url"
                  placeholder="https://vendor.com"
                  value={websiteUrl}
                  onChange={(e) => setWebsiteUrl(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Description / Services Provided</label>
                <textarea
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
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
                  {submitting ? 'Adding...' : 'Add Vendor'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Record Assessment Modal */}
      {showAssessmentModal && selectedVendor && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl">
            <h2 className="text-lg font-bold text-slate-900 mb-1">Record Security Assessment</h2>
            <p className="text-xs text-slate-500 mb-4">Vendor: <strong>{selectedVendor.name}</strong></p>
            <form onSubmit={handleCreateAssessment} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Assessment Title</label>
                <input
                  type="text"
                  required
                  placeholder={`SOC 2 Type II Review - ${new Date().getFullYear()}`}
                  value={assessmentTitle}
                  onChange={(e) => setAssessmentTitle(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Security Score (0–100)</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  required
                  value={assessmentScore}
                  onChange={(e) => setAssessmentScore(Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAssessmentModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg disabled:opacity-50"
                >
                  {submitting ? 'Saving...' : 'Save Assessment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
