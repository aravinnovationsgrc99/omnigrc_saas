'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { FrameworkItemDto, CustomFrameworkImportDto, FrameworkVersionDto, FrameworkReferenceDto } from '@omnigrc/shared';
import { Library, Search, Shield, X, Upload, ShieldCheck, ChevronDown, Filter, FileText, CheckCircle2 } from 'lucide-react';
import { FrameworkCoverageView } from './framework-coverage-view';
import { PageHeader } from '@/components/layout/page-header';
import { StatusBadge } from '@/components/ui/status-badge';
import { apiRequest } from '@/lib/api-client';

export function FrameworkLibraryView() {
  const [activeTab, setActiveTab] = useState<'catalog' | 'coverage'>('catalog');
  const [frameworks, setFrameworks] = useState<FrameworkItemDto[]>([]);
  const [selectedFramework, setSelectedFramework] = useState<FrameworkItemDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Versioning state
  const [versions, setVersions] = useState<FrameworkVersionDto[]>([]);
  const [selectedVersionId, setSelectedVersionId] = useState<string>('');
  const [loadingVersions, setLoadingVersions] = useState(false);

  // Clauses/References state for active version
  const [clauses, setClauses] = useState<FrameworkReferenceDto[]>([]);
  const [loadingClauses, setLoadingClauses] = useState(false);
  const [clausesError, setClausesError] = useState<string | null>(null);

  // Filters & Search
  const [searchClause, setSearchClause] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [importJson, setImportJson] = useState('');
  const [importing, setImporting] = useState(false);

  const fetchFrameworks = async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await apiRequest<FrameworkItemDto[]>('/frameworks');
      setFrameworks(list);

      if (list.length > 0 && !selectedFramework) {
        handleSelectFramework(list[0]);
      }
    } catch (err: any) {
      setError(err.message || 'Error loading frameworks.');
    } finally {
      setLoading(false);
    }
  };

  const loadVersionClauses = async (frameworkIdOrCode: string, versionId: string) => {
    setLoadingClauses(true);
    setClausesError(null);
    try {
      const data = await apiRequest<FrameworkReferenceDto[]>(
        `/frameworks/${frameworkIdOrCode}/versions/${versionId}/clauses`
      );
      setClauses(data);
    } catch (err: any) {
      console.error('Failed to load version clauses:', err);
      setClausesError(err.message || 'Failed to load version clauses.');
      setClauses([]);
    } finally {
      setLoadingClauses(false);
    }
  };

  const handleSelectFramework = async (fw: FrameworkItemDto) => {
    setSelectedFramework(fw);
    setSelectedVersionId('');
    setClauses([]);
    setSearchClause('');
    setTypeFilter('');
    setLoadingVersions(true);

    try {
      const versionList = await apiRequest<FrameworkVersionDto[]>(`/frameworks/${fw.code || fw.id}/versions`);
      setVersions(versionList);

      if (versionList.length > 0) {
        const activeVer = versionList.find((v) => v.status === 'ACTIVE') || versionList[0];
        setSelectedVersionId(activeVer.id);
        loadVersionClauses(fw.code || fw.id, activeVer.id);
      } else {
        // Fallback to legacy framework details
        const details = await apiRequest<FrameworkItemDto>(`/frameworks/${fw.code || fw.id}`);
        if (details.clauses) {
          setClauses(
            details.clauses.map((c) => ({
              id: c.id,
              frameworkVersionId: '',
              parentRefId: null,
              type: 'CLAUSE' as any,
              identifier: c.code,
              title: c.title,
              description: c.description || null,
              normativeText: null,
              sortOrder: 0,
              createdAt: details.createdAt as any,
              updatedAt: details.createdAt as any,
            }))
          );
        }
      }
    } catch (err: any) {
      console.error('Failed to load framework versions:', err);
      setVersions([]);
    } finally {
      setLoadingVersions(false);
    }
  };

  const handleVersionChange = (newVersionId: string) => {
    setSelectedVersionId(newVersionId);
    setSearchClause('');
    if (selectedFramework && newVersionId) {
      loadVersionClauses(selectedFramework.code || selectedFramework.id, newVersionId);
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

      await apiRequest('/frameworks/import', {
        method: 'POST',
        body: JSON.stringify(parsed),
      });

      setIsImportOpen(false);
      setImportJson('');
      fetchFrameworks();
    } catch (err: any) {
      alert(err.message || 'Invalid JSON format or framework code already exists.');
    } finally {
      setImporting(false);
    }
  };

  // Distinct types available in current clauses
  const availableTypes = Array.from(new Set(clauses.map((c) => c.type).filter(Boolean)));

  const filteredClauses = clauses.filter((c) => {
    const matchesSearch =
      c.identifier.toLowerCase().includes(searchClause.toLowerCase()) ||
      c.title.toLowerCase().includes(searchClause.toLowerCase()) ||
      (c.description && c.description.toLowerCase().includes(searchClause.toLowerCase()));
    const matchesType = !typeFilter || c.type === typeFilter;
    return matchesSearch && matchesType;
  });

  const activeVersion = versions.find((v) => v.id === selectedVersionId);

  return (
    <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 py-6 omni-fade-in space-y-6">
      {/* Standardized Page Header */}
      <PageHeader
        title="Compliance Frameworks"
        description="Authoritative regulatory baselines, versioned clause hierarchies, and coverage gap assessments."
        icon={Library}
        currentView="frameworks"
        actions={
          <button
            type="button"
            onClick={() => setIsImportOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs sm:text-sm font-semibold rounded-lg bg-teal-700 hover:bg-teal-800 text-white shadow-sm transition"
          >
            <Upload className="w-4 h-4" /> Import Custom Framework
          </button>
        }
      />

      {/* Tab Navigation */}
      <div className="flex border-b border-slate-200 gap-4 sm:gap-6 overflow-x-auto omni-scroll no-scrollbar">
        <button
          type="button"
          onClick={() => setActiveTab('catalog')}
          className={`pb-3 text-sm font-bold border-b-2 transition flex items-center gap-2 ${
            activeTab === 'catalog'
              ? 'border-teal-700 text-teal-800'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Library className="w-4 h-4" /> Framework Catalog & Clauses
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('coverage')}
          className={`pb-3 text-sm font-bold border-b-2 transition flex items-center gap-2 ${
            activeTab === 'coverage'
              ? 'border-teal-700 text-teal-800'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <ShieldCheck className="w-4 h-4" /> Coverage & Gap Analysis
        </button>
      </div>

      {activeTab === 'coverage' ? (
        <FrameworkCoverageView />
      ) : loading ? (
        <div className="py-16 text-center text-slate-500 font-medium">Loading framework catalog...</div>
      ) : error ? (
        <div className="p-4 rounded-lg bg-red-50 border border-red-200 text-red-900 text-sm font-medium">{error}</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Framework List Sidebar */}
          <div className="lg:col-span-4 space-y-3">
            <div className="flex items-center justify-between px-1">
              <h3 className="text-xs font-bold text-slate-600 uppercase tracking-wider">Entitled Frameworks</h3>
              <span className="text-[11px] font-semibold text-slate-400">{frameworks.length} available</span>
            </div>

            <div className="space-y-2">
              {frameworks.map((fw) => {
                const isSelected = selectedFramework?.id === fw.id || selectedFramework?.code === fw.code;
                return (
                  <button
                    key={fw.id}
                    type="button"
                    onClick={() => handleSelectFramework(fw)}
                    className={`w-full text-left p-4 rounded-xl border transition shadow-sm cursor-pointer ${
                      isSelected
                        ? 'bg-white border-2 border-teal-700 text-slate-900 shadow-md ring-2 ring-teal-600/10'
                        : 'bg-white border-slate-200 text-slate-800 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-bold text-base flex items-center gap-2 text-slate-900 min-w-0">
                        <Shield className={`w-4 h-4 shrink-0 ${isSelected ? 'text-teal-700' : 'text-slate-400'}`} />
                        <span className="truncate">{fw.code}</span>
                      </div>
                      <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-800 border border-slate-200 shrink-0 font-mono">
                        {fw.clausesCount} items
                      </span>
                    </div>
                    <div className="text-xs text-slate-600 font-medium mt-1 line-clamp-1">{fw.name}</div>
                    {fw.version && (
                      <div className="text-[10px] text-teal-800 font-mono mt-1 font-semibold">
                        Version {fw.version} · Active
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Clause Details Viewer */}
          <div className="lg:col-span-8 space-y-4">
            {selectedFramework ? (
              <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-5">
                {/* Framework & Version Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <StatusBadge
                        label={selectedFramework.isSystem ? 'Authoritative Standard' : 'Custom Framework'}
                        variant={selectedFramework.isSystem ? 'teal' : 'purple'}
                        size="sm"
                      />
                      {activeVersion?.status && (
                        <StatusBadge
                          label={activeVersion.status}
                          variant={activeVersion.status === 'ACTIVE' ? 'teal' : 'amber'}
                          size="sm"
                          dot
                        />
                      )}
                    </div>
                    <h2 className="text-xl font-bold text-slate-900 mt-1">
                      {selectedFramework.code} — {selectedFramework.name}
                    </h2>
                  </div>

                  {/* Version Selector Dropdown */}
                  {versions.length > 0 && (
                    <div className="flex items-center gap-2 shrink-0">
                      <label htmlFor="framework-version-select" className="text-xs font-semibold text-slate-500 whitespace-nowrap">
                        Version:
                      </label>
                      <select
                        id="framework-version-select"
                        value={selectedVersionId}
                        onChange={(e) => handleVersionChange(e.target.value)}
                        disabled={loadingVersions}
                        className="text-xs font-bold text-slate-800 bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-teal-600"
                      >
                        {versions.map((v) => (
                          <option key={v.id} value={v.id}>
                            v{v.version} ({v.name || v.version})
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>

                {/* Search & Filter Bar */}
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Search clause identifier, title, or requirements..."
                      value={searchClause}
                      onChange={(e) => setSearchClause(e.target.value)}
                      className="w-full pl-9 pr-4 py-2 text-xs bg-white border border-slate-300 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-teal-600 transition"
                    />
                  </div>

                  {availableTypes.length > 1 && (
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Filter size={14} className="text-slate-400" />
                      <select
                        value={typeFilter}
                        onChange={(e) => setTypeFilter(e.target.value)}
                        className="text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg px-2.5 py-2 focus:outline-none focus:ring-1 focus:ring-teal-600"
                      >
                        <option value="">All Types ({clauses.length})</option>
                        {availableTypes.map((t) => (
                          <option key={t} value={t}>
                            {t} ({clauses.filter((c) => c.type === t).length})
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>

                {/* Clauses Count Indicator */}
                <div className="flex items-center justify-between text-xs font-semibold text-slate-500 px-1">
                  <span>
                    Showing {filteredClauses.length} of {clauses.length} normative references
                  </span>
                  {(searchClause || typeFilter) && (
                    <button
                      type="button"
                      onClick={() => {
                        setSearchClause('');
                        setTypeFilter('');
                      }}
                      className="text-teal-700 hover:text-teal-800 font-medium"
                    >
                      Clear filters
                    </button>
                  )}
                </div>

                {/* Clauses Table / Cards List */}
                {loadingClauses ? (
                  <div className="py-16 text-center text-slate-500 font-medium flex items-center justify-center gap-2">
                    <div className="w-5 h-5 border-2 border-teal-700 border-t-transparent rounded-full animate-spin" />
                    <span>Loading authoritative clauses...</span>
                  </div>
                ) : clausesError ? (
                  <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-800 text-xs font-medium">
                    {clausesError}
                  </div>
                ) : (
                  <div className="space-y-2 max-h-[520px] overflow-y-auto omni-scroll pr-1">
                    {filteredClauses.length > 0 ? (
                      filteredClauses.map((clause) => (
                        <div
                          key={clause.id}
                          className="p-3.5 rounded-lg bg-slate-50/80 border border-slate-200 hover:border-slate-300 hover:bg-white transition"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-mono text-xs font-bold text-teal-900 bg-teal-100/80 px-2 py-0.5 rounded border border-teal-200 shrink-0">
                              {clause.identifier}
                            </span>
                            {clause.type && (
                              <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500 bg-white px-1.5 py-0.5 rounded border border-slate-200">
                                {clause.type}
                              </span>
                            )}
                          </div>
                          <div className="font-semibold text-sm text-slate-900 mt-1.5">{clause.title}</div>
                          {clause.description && clause.description !== clause.title && (
                            <p className="text-xs text-slate-600 mt-1 line-clamp-2 leading-relaxed">
                              {clause.description}
                            </p>
                          )}
                        </div>
                      ))
                    ) : (
                      <div className="py-12 text-center text-slate-500 text-xs font-medium">
                        No clauses found matching your filter criteria.
                      </div>
                    )}
                  </div>
                )}
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
              <button
                type="button"
                onClick={() => setIsImportOpen(false)}
                className="text-slate-400 hover:text-slate-700"
              >
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
