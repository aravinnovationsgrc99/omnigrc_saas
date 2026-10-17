'use client';

import React, { useState, useEffect } from 'react';
import {
  Building2,
  Plus,
  AlertTriangle,
  Calendar,
  ExternalLink,
  ShieldCheck,
  CheckCircle2,
  Paperclip,
  FileText,
  Download,
  Trash2,
  Upload,
  X,
  FileSpreadsheet,
  File as FileIcon,
  Search,
} from 'lucide-react';
import { apiRequest, getStoredTokens } from '@/lib/api-client';
import {
  VendorDto,
  VendorCriticality,
  VendorStatus,
  PaginatedVendorsDto,
  VendorDocumentDto,
  PaginatedVendorDocumentsDto,
} from '@omnigrc/shared';
import { useToast } from '@/context/toast-context';
import { RagStatusBadge, getVendorRag } from '@/components/ui/rag-status-badge';

const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_URL ||
  (process.env.NODE_ENV === 'production' ? 'https://api.omnigrc.co' : 'http://localhost:3001')
).replace(/\/+$/, '');

const ALLOWED_EXTENSIONS = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'csv'];
const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024; // 25 MB

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function getFileIcon(fileName: string) {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  if (ext === 'pdf') {
    return <FileText className="w-4 h-4 text-rose-600 shrink-0" />;
  }
  if (['xls', 'xlsx', 'csv'].includes(ext)) {
    return <FileSpreadsheet className="w-4 h-4 text-emerald-600 shrink-0" />;
  }
  if (['doc', 'docx'].includes(ext)) {
    return <FileText className="w-4 h-4 text-blue-600 shrink-0" />;
  }
  return <FileIcon className="w-4 h-4 text-slate-500 shrink-0" />;
}

export function VendorListView() {
  const { addToast } = useToast();
  const [vendors, setVendors] = useState<VendorDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterCriticality, setFilterCriticality] = useState<string>('ALL');
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showAssessmentModal, setShowAssessmentModal] = useState(false);
  const [selectedVendor, setSelectedVendor] = useState<VendorDto | null>(null);

  // Vendor Documents Management State
  const [selectedVendorForDocs, setSelectedVendorForDocs] = useState<VendorDto | null>(null);
  const [vendorDocuments, setVendorDocuments] = useState<VendorDocumentDto[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [docFile, setDocFile] = useState<File | null>(null);
  const [docDescription, setDocDescription] = useState('');
  const [docSearch, setDocSearch] = useState('');
  const [deletingDocId, setDeletingDocId] = useState<string | null>(null);

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

  async function fetchVendorDocuments(vendorId: string) {
    setLoadingDocs(true);
    try {
      const res = await apiRequest<PaginatedVendorDocumentsDto>(`/vendors/${vendorId}/documents`);
      setVendorDocuments(res.items || []);
    } catch (err: any) {
      addToast(`Failed to load vendor documents: ${err.message}`, 'error');
    } finally {
      setLoadingDocs(false);
    }
  }

  function handleOpenDocuments(v: VendorDto) {
    setSelectedVendorForDocs(v);
    setDocFile(null);
    setDocDescription('');
    setDocSearch('');
    fetchVendorDocuments(v.id);
  }

  async function handleUploadDocument(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedVendorForDocs) return;
    if (!docFile) {
      addToast('Please select a file to upload.', 'error');
      return;
    }

    // Client-side extension validation
    const ext = docFile.name.split('.').pop()?.toLowerCase() || '';
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      addToast(`Invalid file type (.${ext}). Supported formats: ${ALLOWED_EXTENSIONS.join(', ')}`, 'error');
      return;
    }

    // Client-side size validation
    if (docFile.size > MAX_FILE_SIZE_BYTES) {
      addToast(`File size exceeds 25 MB limit (${formatFileSize(docFile.size)}).`, 'error');
      return;
    }

    setUploadingDoc(true);
    try {
      const formData = new FormData();
      formData.append('file', docFile);
      if (docDescription.trim()) {
        formData.append('description', docDescription.trim());
      }

      const uploaded = await apiRequest<VendorDocumentDto>(`/vendors/${selectedVendorForDocs.id}/documents`, {
        method: 'POST',
        body: formData,
      });

      addToast(`Document "${uploaded.fileName}" attached successfully.`, 'success');
      setDocFile(null);
      setDocDescription('');
      fetchVendorDocuments(selectedVendorForDocs.id);

      // Increment local count in vendor list
      setVendors((prev) =>
        prev.map((v) =>
          v.id === selectedVendorForDocs.id
            ? { ...v, documentCount: (v.documentCount || 0) + 1 }
            : v,
        ),
      );
    } catch (err: any) {
      addToast(`Upload failed: ${err.message}`, 'error');
    } finally {
      setUploadingDoc(false);
    }
  }

  async function handleDownloadDocument(doc: VendorDocumentDto) {
    try {
      const { accessToken } = getStoredTokens();
      const response = await fetch(`${API_BASE_URL}/evidence/${doc.evidenceId}/download`, {
        headers: {
          ...(accessToken && { Authorization: `Bearer ${accessToken}` }),
        },
      });

      if (!response.ok) {
        throw new Error(`Download failed with status ${response.status}`);
      }

      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = doc.fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(downloadUrl);
      addToast(`Downloaded "${doc.fileName}"`, 'success');
    } catch (err: any) {
      addToast(`Failed to download: ${err.message}`, 'error');
    }
  }

  async function handleRemoveDocument(doc: VendorDocumentDto) {
    if (!selectedVendorForDocs) return;
    const confirmDelete = window.confirm(`Remove attachment "${doc.fileName}" from ${selectedVendorForDocs.name}?`);
    if (!confirmDelete) return;

    setDeletingDocId(doc.evidenceId);
    try {
      await apiRequest(`/vendors/${selectedVendorForDocs.id}/documents/${doc.evidenceId}`, {
        method: 'DELETE',
      });
      addToast(`Removed document "${doc.fileName}".`, 'success');
      setVendorDocuments((prev) => prev.filter((d) => d.evidenceId !== doc.evidenceId));

      // Decrement local count in vendor list
      setVendors((prev) =>
        prev.map((v) =>
          v.id === selectedVendorForDocs.id
            ? { ...v, documentCount: Math.max(0, (v.documentCount || 1) - 1) }
            : v,
        ),
      );
    } catch (err: any) {
      addToast(`Failed to remove document: ${err.message}`, 'error');
    } finally {
      setDeletingDocId(null);
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

  const filteredDocuments = vendorDocuments.filter((d) => {
    if (!docSearch.trim()) return true;
    const term = docSearch.toLowerCase();
    return (
      d.fileName.toLowerCase().includes(term) ||
      d.title.toLowerCase().includes(term) ||
      (d.description && d.description.toLowerCase().includes(term))
    );
  });

  return (
    <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 py-6 omni-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2">
            <Building2 size={22} className="text-teal-700" />
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Vendor Risk Management</h1>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Track third-party vendor risk profiles, document attachments, review cadences, and security assessments.
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
                  <th className="py-3 px-4">Risk Posture</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Documents</th>
                  <th className="py-3 px-4">Owner</th>
                  <th className="py-3 px-4">Next Review</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {vendors.map((v) => {
                  const latestScore = v.assessments && v.assessments.length > 0 ? v.assessments[0].score : undefined;
                  const rag = getVendorRag(latestScore);
                  return (
                    <tr key={v.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-4 font-semibold text-slate-900">
                        <div className="flex items-center gap-2">
                          {v.name}
                          {v.websiteUrl && (
                            <a
                              href={v.websiteUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="text-slate-400 hover:text-teal-700"
                              title="Visit Vendor Website"
                            >
                              <ExternalLink size={12} />
                            </a>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-slate-600">{v.category || 'General'}</td>
                      <td className="py-3 px-4">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            v.criticality === 'CRITICAL'
                              ? 'bg-red-100 text-red-800'
                              : v.criticality === 'HIGH'
                              ? 'bg-orange-100 text-orange-800'
                              : v.criticality === 'MEDIUM'
                              ? 'bg-yellow-100 text-yellow-800'
                              : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {v.criticality}
                        </span>
                      </td>
                      {/* Contextual RAG Status */}
                      <td className="py-3 px-4">
                        <RagStatusBadge
                          status={rag.status}
                          label={rag.label}
                          detail={rag.detail}
                          size="sm"
                        />
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            v.status === 'ACTIVE'
                              ? 'bg-emerald-100 text-emerald-800'
                              : v.status === 'UNDER_REVIEW'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {v.status}
                        </span>
                      </td>
                      {/* Document Attachments Column */}
                      <td className="py-3 px-4">
                        <button
                          onClick={() => handleOpenDocuments(v)}
                          className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 text-[11px] font-semibold transition-colors"
                          title="View and attach vendor evidence & agreements"
                        >
                          <Paperclip className="w-3 h-3 text-slate-500" />
                          <span>{v.documentCount || 0}</span>
                        </button>
                      </td>
                      <td className="py-3 px-4 text-slate-600">{v.owner}</td>
                      <td className="py-3 px-4 text-slate-600">
                        {v.nextReviewDate ? new Date(v.nextReviewDate).toLocaleDateString() : 'N/A'}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => handleOpenDocuments(v)}
                            className="px-2.5 py-1 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded transition-colors inline-flex items-center gap-1"
                          >
                            <Paperclip size={12} />
                            <span>Documents</span>
                          </button>
                          <button
                            onClick={() => {
                              setSelectedVendor(v);
                              setShowAssessmentModal(true);
                            }}
                            className="px-2.5 py-1 text-xs font-semibold text-teal-700 bg-teal-50 hover:bg-teal-100 rounded transition-colors"
                          >
                            Record Assessment
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Vendor Document Attachments Modal */}
      {selectedVendorForDocs && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-60 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4"
        >
          <div className="bg-white rounded-xl max-w-3xl w-full shadow-2xl max-h-[90dvh] flex flex-col border border-slate-200 overflow-hidden">
            {/* Modal Header */}
            <div className="px-5 sm:px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/70 shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-teal-50 text-teal-700 border border-teal-200">
                  <Paperclip className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-bold text-slate-900">{selectedVendorForDocs.name}</h2>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-200 text-slate-700 font-semibold">
                      {selectedVendorForDocs.category || 'Vendor'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Manage contracts, SOC 2 reports, SLA agreements, and compliance evidence.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedVendorForDocs(null)}
                className="p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Scrollable Body */}
            <div className="p-5 sm:p-6 overflow-y-auto omni-scroll flex-1 space-y-6">
              {/* Document Upload Section */}
              <div className="border border-teal-100 rounded-xl p-4 bg-teal-50/30">
                <h3 className="text-xs font-bold text-teal-900 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <Upload className="w-4 h-4 text-teal-700" />
                  <span>Attach New Business Document</span>
                </h3>
                <form onSubmit={handleUploadDocument} className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Select File (PDF, DOCX, XLSX, CSV — Max 25MB)
                      </label>
                      <input
                        type="file"
                        accept=".pdf,.doc,.docx,.xls,.xlsx,.csv"
                        onChange={(e) => setDocFile(e.target.files?.[0] || null)}
                        disabled={uploadingDoc}
                        className="w-full text-xs text-slate-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-teal-700 file:text-white hover:file:bg-teal-800 cursor-pointer border border-slate-300 rounded-lg p-1 bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Description / Notes</label>
                      <input
                        type="text"
                        placeholder="e.g. FY26 SOC 2 Type II"
                        value={docDescription}
                        onChange={(e) => setDocDescription(e.target.value)}
                        disabled={uploadingDoc}
                        className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-teal-600 bg-white"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <div className="text-[11px] text-slate-500">
                      {docFile ? (
                        <span className="font-medium text-teal-800">
                          Selected: {docFile.name} ({formatFileSize(docFile.size)})
                        </span>
                      ) : (
                        <span>Files are scanned and encrypted in tenant evidence storage.</span>
                      )}
                    </div>
                    <button
                      type="submit"
                      disabled={!docFile || uploadingDoc}
                      className="px-4 py-1.5 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg disabled:opacity-50 transition-colors shadow-sm inline-flex items-center gap-1.5"
                    >
                      <Upload size={13} />
                      <span>{uploadingDoc ? 'Uploading & Scanning...' : 'Upload & Attach'}</span>
                    </button>
                  </div>
                </form>
              </div>

              {/* Attached Documents List */}
              <div>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2">
                    <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                      Attached Documents ({vendorDocuments.length})
                    </h3>
                  </div>
                  {vendorDocuments.length > 3 && (
                    <div className="relative">
                      <Search className="w-3 h-3 absolute left-2.5 top-2.5 text-slate-400" />
                      <input
                        type="text"
                        placeholder="Filter attachments..."
                        value={docSearch}
                        onChange={(e) => setDocSearch(e.target.value)}
                        className="pl-7 pr-3 py-1 text-xs border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-teal-600 w-44"
                      />
                    </div>
                  )}
                </div>

                {loadingDocs ? (
                  <div className="p-8 text-center text-xs text-slate-500">Loading attachments...</div>
                ) : vendorDocuments.length === 0 ? (
                  <div className="bg-slate-50 border border-dashed border-slate-300 rounded-xl p-8 text-center">
                    <Paperclip className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                    <p className="text-xs font-semibold text-slate-700">No documents attached yet</p>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Upload audit certifications, contracts, or security disclosures above.
                    </p>
                  </div>
                ) : filteredDocuments.length === 0 ? (
                  <div className="p-4 text-center text-xs text-slate-500 bg-slate-50 rounded-lg">
                    No documents matching &quot;{docSearch}&quot;.
                  </div>
                ) : (
                  <div className="border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100 bg-white">
                    {filteredDocuments.map((doc) => (
                      <div
                        key={doc.id}
                        className="p-3 sm:px-4 sm:py-3 flex items-center justify-between gap-3 hover:bg-slate-50/80 transition-colors"
                      >
                        <div className="flex items-start gap-3 min-w-0">
                          <div className="p-2 rounded bg-slate-100 border border-slate-200 mt-0.5">
                            {getFileIcon(doc.fileName)}
                          </div>
                          <div className="min-w-0">
                            <div className="text-xs font-semibold text-slate-900 truncate flex items-center gap-2">
                              <span>{doc.fileName}</span>
                              {doc.scanStatus === 'CLEAN' && (
                                <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200">
                                  <CheckCircle2 size={10} /> Clean
                                </span>
                              )}
                              {doc.scanStatus === 'PENDING_SCAN' && (
                                <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-amber-700 bg-amber-50 px-1.5 py-0.2 rounded border border-amber-200">
                                  Scanning
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-500 flex flex-wrap items-center gap-2 mt-0.5">
                              <span>{formatFileSize(doc.fileSize)}</span>
                              <span>•</span>
                              <span>{new Date(doc.attachedAt).toLocaleDateString()}</span>
                              <span>•</span>
                              <span>Uploaded by: {doc.uploaderName || 'Auditor'}</span>
                            </div>
                            {doc.description && (
                              <p className="text-[11px] text-slate-600 italic mt-0.5">{doc.description}</p>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleDownloadDocument(doc)}
                            className="p-1.5 text-slate-600 hover:text-teal-700 hover:bg-teal-50 rounded transition-colors"
                            title="Download document"
                          >
                            <Download size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemoveDocument(doc)}
                            disabled={deletingDocId === doc.evidenceId}
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors disabled:opacity-50"
                            title="Remove attachment"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-5 sm:px-6 py-3 border-t border-slate-200 bg-slate-50/70 flex justify-end shrink-0">
              <button
                type="button"
                onClick={() => setSelectedVendorForDocs(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 rounded-lg transition-colors shadow-xs"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Vendor Modal */}
      {showCreateModal && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-60 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4"
        >
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
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-60 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4"
        >
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
