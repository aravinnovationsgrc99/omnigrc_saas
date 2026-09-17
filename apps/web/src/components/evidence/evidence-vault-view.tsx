'use client';

import React, { useState, useEffect } from 'react';
import { EvidenceVaultItemDto, PaginatedEvidenceVaultDto } from '@omnigrc/shared';
import { Search, FileText, Download, ShieldCheck, Info, RefreshCw } from 'lucide-react';

export function EvidenceVaultView() {
  const [data, setData] = useState<PaginatedEvidenceVaultDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [domain, setDomain] = useState<string>('');
  const [page, setPage] = useState(1);

  const fetchVault = async () => {
    setLoading(true);
    setError(null);
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
      const params = new URLSearchParams();
      params.append('page', page.toString());
      params.append('limit', '15');
      if (search) params.append('search', search);
      if (domain) params.append('domain', domain);

      const res = await fetch(`/api/evidence/vault?${params.toString()}`, {
        headers: {
          Authorization: token ? `Bearer ${token}` : '',
        },
      });

      if (!res.ok) throw new Error('Failed to fetch evidence vault items.');
      const result = await res.json();
      setData(result);
    } catch (err: any) {
      setError(err.message || 'An error occurred loading evidence vault.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchVault();
  }, [page, domain]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchVault();
  };

  const formatFileSize = (bytes?: number | null) => {
    if (!bytes) return 'N/A';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Central Evidence Vault</h1>
          <p className="text-sm text-slate-400 mt-1">
            Centralized index of audit artifacts, control verification evidence, and compliance documentation.
          </p>
        </div>
        <button
          onClick={fetchVault}
          className="inline-flex items-center gap-2 px-3.5 py-2 text-sm font-medium rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      {/* Integrity Notice */}
      <div className="p-4 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-300 text-xs flex items-start gap-3">
        <Info className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
        <div>
          <span className="font-semibold text-blue-200">Architecture Integrity Notice:</span> OMNiGRC currently indexes evidence file URLs and artifact metadata. True cryptographic byte hashing is reserved for native binary blob storage layers in enterprise pods.
        </div>
      </div>

      {/* Filter Bar */}
      <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800/80 backdrop-blur-sm space-y-4 sm:space-y-0 sm:flex sm:items-center sm:justify-between gap-4">
        <form onSubmit={handleSearchSubmit} className="flex-1 flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
            <input
              type="text"
              placeholder="Search file name, description, or association..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm bg-slate-950/80 border border-slate-800 rounded-lg text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition"
            />
          </div>
          <button
            type="submit"
            className="px-4 py-2 text-sm font-medium bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg transition"
          >
            Filter
          </button>
        </form>

        <div className="flex items-center gap-3">
          <select
            value={domain}
            onChange={(e) => {
              setDomain(e.target.value);
              setPage(1);
            }}
            className="px-3 py-2 text-sm bg-slate-950 border border-slate-800 rounded-lg text-slate-300 focus:outline-none focus:border-cyan-500"
          >
            <option value="">All Source Domains</option>
            <option value="AUDIT">Audit Evidence</option>
            <option value="CONTROL">Control Evidence</option>
            <option value="POLICY">Policy Attestation</option>
            <option value="TASK">Task Evidence</option>
          </select>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="py-16 text-center text-slate-400 animate-pulse">Loading evidence index...</div>
      ) : error ? (
        <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">{error}</div>
      ) : !data || data.items.length === 0 ? (
        <div className="p-12 text-center rounded-xl bg-slate-900/40 border border-slate-800 text-slate-400">
          <FileText className="w-10 h-10 mx-auto mb-3 text-slate-600" />
          <h3 className="text-base font-semibold text-slate-300">No Evidence Found</h3>
          <p className="text-sm text-slate-500 mt-1">No evidence items match your selected filter criteria.</p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900/40">
            <table className="w-full text-left text-sm text-slate-300">
              <thead className="bg-slate-950/80 text-slate-400 font-medium text-xs border-b border-slate-800 uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-4">Artifact / File Name</th>
                  <th className="py-3 px-4">Source Domain</th>
                  <th className="py-3 px-4">Associated Entity</th>
                  <th className="py-3 px-4">File Size</th>
                  <th className="py-3 px-4">Uploaded</th>
                  <th className="py-3 px-4 text-right">Access</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {data.items.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-800/30 transition">
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4 text-cyan-400 flex-shrink-0" />
                        <span className="font-semibold text-slate-100">{item.title}</span>
                      </div>
                      {item.description && (
                        <div className="text-xs text-slate-400 line-clamp-1 mt-0.5 ml-6">{item.description}</div>
                      )}
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                        {item.sourceDomain}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-xs text-slate-300">
                      {item.associatedReference || 'Direct Upload'}
                    </td>
                    <td className="py-3.5 px-4 text-xs font-mono text-slate-400">
                      {formatFileSize(item.fileSize)}
                    </td>
                    <td className="py-3.5 px-4 text-xs text-slate-400">
                      {new Date(item.createdAt).toLocaleDateString()}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <a
                        href={item.evidenceUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-cyan-400 hover:text-cyan-300 font-medium transition"
                      >
                        <Download className="w-3.5 h-3.5" /> Open / Download
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between text-xs text-slate-400 px-1">
            <div>
              Showing {data.items.length} of {data.total} total items
            </div>
            <div className="flex gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="px-3 py-1.5 rounded bg-slate-800 text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-700"
              >
                Previous
              </button>
              <button
                disabled={page * data.limit >= data.total}
                onClick={() => setPage((p) => p + 1)}
                className="px-3 py-1.5 rounded bg-slate-800 text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-700"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
