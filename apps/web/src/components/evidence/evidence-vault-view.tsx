'use client';

import React, { useState, useEffect } from 'react';
import { EvidenceDto, PaginatedEvidenceDto, EvidenceType, EvidenceStatus } from '@omnigrc/shared';
import { Search, FileText, Download, Info, RefreshCw, FileArchive, Upload, ShieldCheck, Tag, Trash2, Link } from 'lucide-react';
import { apiRequest } from '@/lib/api-client';
import { useToast } from '@/context/toast-context';

export function EvidenceVaultView() {
  const { addToast } = useToast();
  const [data, setData] = useState<PaginatedEvidenceDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [evidenceType, setEvidenceType] = useState<string>('');
  const [page, setPage] = useState(1);

  // Upload Modal State
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [targetResourceType, setTargetResourceType] = useState<string>('');
  const [targetResourceId, setTargetResourceId] = useState<string>('');
  const [uploading, setUploading] = useState(false);

  const fetchVault = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.append('page', page.toString());
      params.append('limit', '15');
      if (search) params.append('search', search);
      if (evidenceType) params.append('evidenceType', evidenceType);

      const result = await apiRequest<PaginatedEvidenceDto>(`/evidence/vault?${params.toString()}`);
      setData(result);
    } catch (err: any) {
      setError(err.message || 'An error occurred loading evidence vault.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchVault();
  }, [page, evidenceType]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchVault();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setSelectedFile(file);
      if (!title) setTitle(file.name.replace(/\.[^/.]+$/, ''));
    }
  };

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile || !title.trim() || uploading) return;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('title', title.trim());
      if (description.trim()) formData.append('description', description.trim());
      if (targetResourceType) formData.append('targetResourceType', targetResourceType);
      if (targetResourceId.trim()) formData.append('targetResourceId', targetResourceId.trim());

      const token = localStorage.getItem('token');
      const res = await fetch('/api/v1/evidence/upload', {
        method: 'POST',
        headers: {
          Authorization: token ? `Bearer ${token}` : '',
        },
        body: formData,
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.message || 'Failed to upload proof evidence.');
      }

      addToast(`Evidence '${title}' uploaded and verified successfully`, 'success');
      setShowUploadModal(false);
      setSelectedFile(null);
      setTitle('');
      setDescription('');
      setTargetResourceType('');
      setTargetResourceId('');
      fetchVault();
    } catch (err: any) {
      addToast(err.message || 'Upload failed', 'error');
    } finally {
      setUploading(false);
    }
  };

  const handleDownload = async (evidence: EvidenceDto) => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/v1/evidence/${evidence.id}/download`, {
        headers: { Authorization: token ? `Bearer ${token}` : '' },
      });

      if (!res.ok) throw new Error('Download unauthorized or evidence unavailable.');

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = evidence.fileName;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err: any) {
      addToast(err.message || 'Download failed', 'error');
    }
  };

  const formatFileSize = (bytes?: number | null) => {
    if (!bytes) return 'N/A';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 py-6 omni-fade-in space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <FileArchive size={22} className="text-teal-700" />
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Universal Evidence & Proof Vault</h1>
          </div>
          <p className="text-xs sm:text-sm text-slate-600 mt-1">
            Production proof repository for PDF, spreadsheets, images, and config exports with cryptographic SHA-256 verification and GRC resource attachment.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowUploadModal(true)}
            className="omni-btn-primary text-xs h-9 px-3.5 flex items-center gap-1.5"
          >
            <Upload size={14} /> Upload Proof Evidence
          </button>
          <button
            onClick={fetchVault}
            className="inline-flex items-center gap-2 px-3 py-2 text-xs font-semibold rounded-lg bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 transition shadow-sm"
          >
            <RefreshCw className="w-3.5 h-3.5 text-slate-500" />
            Refresh
          </button>
        </div>
      </div>

      {/* Security Banner */}
      <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs flex items-start gap-3 shadow-sm">
        <ShieldCheck className="w-4 h-4 text-emerald-700 flex-shrink-0 mt-0.5" />
        <div>
          <span className="font-bold text-emerald-950">Cryptographic Integrity Active:</span> Proof files are validated via magic signature headers, assigned randomized keys, SHA-256 checksummed, and scoped to your organization.
        </div>
      </div>

      {/* Filter Bar */}
      <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 shadow-sm space-y-4 sm:space-y-0 sm:flex sm:items-center sm:justify-between gap-4">
        <form onSubmit={handleSearchSubmit} className="flex-1 flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search evidence file name, description, or resource attachment..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-xs bg-white border border-slate-300 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-teal-600 transition"
            />
          </div>
          <button
            type="submit"
            className="px-4 py-2 text-xs font-semibold bg-teal-700 hover:bg-teal-800 text-white rounded-lg transition shadow-sm"
          >
            Filter
          </button>
        </form>

        <div className="flex items-center gap-3">
          <select
            value={evidenceType}
            onChange={(e) => {
              setEvidenceType(e.target.value);
              setPage(1);
            }}
            className="px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg text-slate-800 focus:outline-none focus:ring-1 focus:ring-teal-600 font-medium"
          >
            <option value="">All Evidence Types</option>
            <option value="DOCUMENT">Document (PDF/DOC)</option>
            <option value="SPREADSHEET">Spreadsheet (XLS/CSV)</option>
            <option value="IMAGE">Image (PNG/JPG)</option>
            <option value="CONFIG_EXPORT">Config Export</option>
            <option value="SYSTEM_LOG">System Log</option>
          </select>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="py-16 text-center text-slate-500 font-medium text-xs">Loading evidence index...</div>
      ) : error ? (
        <div className="p-4 rounded-lg bg-red-50 border border-red-200 text-red-900 text-xs font-medium">{error}</div>
      ) : !data || data.items.length === 0 ? (
        <div className="p-12 text-center rounded-xl bg-white border border-slate-200 shadow-sm text-slate-500">
          <FileText className="w-10 h-10 mx-auto mb-3 text-slate-400" />
          <h3 className="text-base font-bold text-slate-800">No Evidence Found</h3>
          <p className="text-xs text-slate-600 mt-1">Upload binary proof files or adjust search filters.</p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full text-left text-xs text-slate-800">
              <thead className="bg-slate-50 text-slate-700 font-bold text-[11px] border-b border-slate-200 uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-4">Proof Title & File</th>
                  <th className="py-3 px-4">Evidence Type</th>
                  <th className="py-3 px-4">Associated Resources</th>
                  <th className="py-3 px-4">Size & Hash</th>
                  <th className="py-3 px-4">Uploader</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.items.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/80 transition">
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4 text-teal-700 flex-shrink-0" />
                        <div>
                          <span className="font-bold text-slate-900">{item.title}</span>
                          <div className="text-[11px] text-slate-500 omni-mono">{item.fileName}</div>
                        </div>
                      </div>
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="px-2 py-0.5 text-[10px] font-semibold rounded bg-slate-100 text-slate-800 border border-slate-200">
                        {item.evidenceType}
                      </span>
                    </td>
                    <td className="py-3.5 px-4">
                      {item.associations.length === 0 ? (
                        <span className="italic text-slate-400">Unattached</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {item.associations.map((a, idx) => (
                            <span key={idx} className="px-1.5 py-0.5 bg-teal-50 text-teal-800 border border-teal-200 text-[10px] rounded">
                              {a.resourceType}: {a.resourceTitle || a.resourceId.slice(0, 8)}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-xs">
                      <div className="font-mono text-slate-700">{formatFileSize(item.fileSize)}</div>
                      {item.checksum && (
                        <div className="text-[10px] text-slate-400 font-mono truncate max-w-[120px]" title={item.checksum}>
                          SHA: {item.checksum.slice(0, 10)}...
                        </div>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-xs font-medium text-slate-600">
                      <div>{item.uploaderName}</div>
                      <div className="text-[10px] text-slate-400">{new Date(item.createdAt).toLocaleDateString()}</div>
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <button
                        onClick={() => handleDownload(item)}
                        className="inline-flex items-center gap-1 text-xs text-teal-700 hover:text-teal-800 font-bold transition px-2 py-1 bg-teal-50 hover:bg-teal-100 rounded"
                      >
                        <Download className="w-3.5 h-3.5" /> Download Stream
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* UPLOAD MODAL */}
      {showUploadModal && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-lg p-6 shadow-2xl border border-slate-200 space-y-4">
            <h3 className="text-base font-bold text-slate-900 m-0 flex items-center gap-2">
              <Upload size={18} className="text-teal-700" /> Upload Proof Evidence
            </h3>

            <form onSubmit={handleUploadSubmit} className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-700">Proof File (PDF, DOCX, XLSX, PNG, CSV max 25MB)</label>
                <input
                  type="file"
                  required
                  onChange={handleFileChange}
                  className="w-full text-xs p-2 border border-slate-300 rounded-lg mt-1 bg-slate-50"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700">Evidence Title</label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g., Q3 Firewall Rule Audit Log, AWS Config Export"
                  className="w-full text-xs p-2.5 border border-slate-300 rounded-lg mt-1"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700">Description / Context</label>
                <textarea
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Optional description of verification method"
                  className="w-full text-xs p-2.5 border border-slate-300 rounded-lg mt-1"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-700">Target GRC Resource</label>
                  <select
                    value={targetResourceType}
                    onChange={(e) => setTargetResourceType(e.target.value)}
                    className="w-full text-xs p-2 border border-slate-300 rounded-lg mt-1 bg-white font-medium"
                  >
                    <option value="">None (Unattached)</option>
                    <option value="CONTROL">Control</option>
                    <option value="RISK">Risk</option>
                    <option value="POLICY">Policy</option>
                    <option value="VENDOR">Vendor</option>
                    <option value="VULNERABILITY">Vulnerability</option>
                    <option value="INCIDENT">Incident</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-700">Target Resource ID</label>
                  <input
                    type="text"
                    disabled={!targetResourceType}
                    value={targetResourceId}
                    onChange={(e) => setTargetResourceId(e.target.value)}
                    placeholder="Enter Resource UUID"
                    className="w-full text-xs p-2 border border-slate-300 rounded-lg mt-1"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowUploadModal(false)}
                  className="px-3 py-1.5 text-xs text-slate-600 hover:text-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={uploading || !selectedFile}
                  className="omni-btn-primary text-xs px-4 py-1.5"
                >
                  {uploading ? 'Uploading & Verifying...' : 'Upload & Verify'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
