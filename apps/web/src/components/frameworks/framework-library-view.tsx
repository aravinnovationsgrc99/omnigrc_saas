'use client';

import React, { useState, useEffect } from 'react';
import { FrameworkItemDto, CustomFrameworkImportDto } from '@omnigrc/shared';
import { Library, Search, Shield, X, Upload } from 'lucide-react';

export function FrameworkLibraryView() {
  const [frameworks, setFrameworks] = useState<FrameworkItemDto[]>([]);
  const [selectedFramework, setSelectedFramework] = useState<FrameworkItemDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Search & Import
  const [searchClause, setSearchClause] = useState('');
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [importJson, setImportJson] = useState('');
  const [importing, setImporting] = useState(false);

  const fetchFrameworks = async () => {
    setLoading(true);
    setError(null);
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
      const res = await fetch('/api/frameworks', {
        headers: {
          Authorization: token ? `Bearer ${token}` : '',
        },
      });

      if (!res.ok) throw new Error('Failed to fetch framework library.');
      const list: FrameworkItemDto[] = await res.json();
      setFrameworks(list);

      if (list.length > 0 && !selectedFramework) {
        fetchFrameworkDetails(list[0].id);
      }
    } catch (err: any) {
      setError(err.message || 'Error loading frameworks.');
    } finally {
      setLoading(false);
    }
  };

  const fetchFrameworkDetails = async (idOrCode: string) => {
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
      const res = await fetch(`/api/frameworks/${idOrCode}`, {
        headers: {
          Authorization: token ? `Bearer ${token}` : '',
        },
      });
      if (res.ok) {
        const fw: FrameworkItemDto = await res.json();
        setSelectedFramework(fw);
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchFrameworks();
  }, []);

  const handleImportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!importJson.trim()) return;

    setImporting(true);
    try {
      const parsed: CustomFrameworkImportDto = JSON.parse(importJson);
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;

      const res = await fetch('/api/frameworks/import', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: token ? `Bearer ${token}` : '',
        },
        body: JSON.stringify(parsed),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.message || 'Failed to import framework.');
      }

      setIsImportOpen(false);
      setImportJson('');
      fetchFrameworks();
    } catch (err: any) {
      alert(err.message || 'Invalid JSON format or framework code already exists.');
    } finally {
      setImporting(false);
    }
  };

  const filteredClauses = selectedFramework?.clauses?.filter(
    (c) =>
      c.code.toLowerCase().includes(searchClause.toLowerCase()) ||
      c.title.toLowerCase().includes(searchClause.toLowerCase()),
  );

  return (
    <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 py-6 omni-fade-in space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <Library size={22} className="text-teal-700" />
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Compliance Framework Library</h1>
          </div>
          <p className="text-xs sm:text-sm text-slate-600 mt-1">
            Browse standard reference frameworks, inspect clause hierarchies, and manage framework control mappings.
          </p>
        </div>
        <button
          onClick={() => setIsImportOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg bg-teal-700 hover:bg-teal-800 text-white shadow-sm transition"
        >
          <Upload className="w-4 h-4" /> Import Custom Framework
        </button>
      </div>

      {loading ? (
        <div className="py-16 text-center text-slate-500 font-medium">Loading framework catalog...</div>
      ) : error ? (
        <div className="p-4 rounded-lg bg-red-50 border border-red-200 text-red-900 text-sm font-medium">{error}</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Framework List Sidebar */}
          <div className="lg:col-span-4 space-y-3">
            <h3 className="text-xs font-bold text-slate-600 uppercase tracking-wider px-1">Frameworks Catalog</h3>
            <div className="space-y-2">
              {frameworks.map((fw) => {
                const isSelected = selectedFramework?.id === fw.id;
                return (
                  <button
                    key={fw.id}
                    onClick={() => fetchFrameworkDetails(fw.id)}
                    className={`w-full text-left p-4 rounded-xl border transition shadow-sm ${
                      isSelected
                        ? 'bg-white border-2 border-teal-700 text-slate-900 shadow-md ring-2 ring-teal-600/10'
                        : 'bg-white border-slate-200 text-slate-800 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="font-bold text-base flex items-center gap-2 text-slate-900">
                        <Shield className={`w-4 h-4 ${isSelected ? 'text-teal-700' : 'text-slate-400'}`} />
                        {fw.code}
                      </div>
                      <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-800 border border-slate-200">
                        {fw.clausesCount} Clauses
                      </span>
                    </div>
                    <div className="text-xs text-slate-600 font-medium mt-1 line-clamp-1">{fw.name}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Clause Details Viewer */}
          <div className="lg:col-span-8 space-y-4">
            {selectedFramework ? (
              <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-5">
                <div className="flex items-center justify-between border-b border-slate-200 pb-4">
                  <div>
                    <span className="text-xs font-bold text-teal-700 uppercase tracking-wider">
                      {selectedFramework.isSystem ? 'System Reference Framework' : 'Custom Framework'}
                    </span>
                    <h2 className="text-xl font-bold text-slate-900 mt-0.5">
                      {selectedFramework.code} — {selectedFramework.name}
                    </h2>
                  </div>
                  <div className="text-xs text-slate-600 font-mono font-bold">
                    Total Clauses: {selectedFramework.clausesCount}
                  </div>
                </div>

                {/* Clause Search */}
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search clause code or title..."
                    value={searchClause}
                    onChange={(e) => setSearchClause(e.target.value)}
                    className="w-full pl-9 pr-4 py-2 text-sm bg-white border border-slate-300 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-teal-600 transition"
                  />
                </div>

                {/* Clauses Table */}
                <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
                  {filteredClauses && filteredClauses.length > 0 ? (
                    filteredClauses.map((clause) => (
                      <div
                        key={clause.id}
                        className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 hover:border-slate-300 transition"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-xs font-bold text-teal-900 bg-teal-100 px-2 py-0.5 rounded border border-teal-200">
                            {clause.code}
                          </span>
                        </div>
                        <div className="font-semibold text-sm text-slate-900 mt-1.5">{clause.title}</div>
                      </div>
                    ))
                  ) : (
                    <div className="py-8 text-center text-slate-500 text-sm font-medium">No clauses found matching your search.</div>
                  )}
                </div>
              </div>
            ) : (
              <div className="p-12 text-center rounded-2xl bg-white border border-slate-200 shadow-sm text-slate-500 font-medium">
                Select a framework from the catalog to inspect clauses.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Import Modal */}
      {isImportOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg bg-white border border-slate-200 rounded-2xl p-6 shadow-2xl space-y-4 text-slate-800">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="text-lg font-bold text-slate-900">Import Custom Framework (JSON)</h3>
              <button onClick={() => setIsImportOpen(false)} className="text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleImportSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  JSON Definition (Code, Name, Clauses Array)
                </label>
                <textarea
                  rows={8}
                  placeholder={`{\n  "code": "CUSTOM_ISO",\n  "name": "Custom ISO Standard",\n  "clauses": [\n    { "code": "A.5.1", "title": "Policies for information security" }\n  ]\n}`}
                  value={importJson}
                  onChange={(e) => setImportJson(e.target.value)}
                  className="w-full font-mono text-xs px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-teal-600"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsImportOpen(false)}
                  className="px-4 py-2 text-sm font-semibold bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 rounded-lg shadow-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={importing}
                  className="px-4 py-2 text-sm font-semibold bg-teal-700 hover:bg-teal-800 text-white rounded-lg shadow-sm disabled:opacity-50"
                >
                  {importing ? 'Importing...' : 'Validate & Import'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
