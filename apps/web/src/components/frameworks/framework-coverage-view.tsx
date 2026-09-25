'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  FrameworkItemDto,
  FrameworkCoverageResultDto,
  FrameworkReferenceCoverageDto,
  CoverageStatus,
} from '@omnigrc/shared';
import {
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Search,
  Filter,
  Layers,
  FileText,
  CheckSquare,
  FileArchive,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Lock,
} from 'lucide-react';

interface VersionItem {
  id: string;
  version: string;
  name: string;
}

export function FrameworkCoverageView() {
  const [frameworks, setFrameworks] = useState<FrameworkItemDto[]>([]);
  const [selectedFrameworkId, setSelectedFrameworkId] = useState<string>('');
  const [versions, setVersions] = useState<VersionItem[]>([]);
  const [selectedVersionId, setSelectedVersionId] = useState<string>('');
  
  const [coverageData, setCoverageData] = useState<FrameworkCoverageResultDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [typeFilter, setTypeFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [expandedRefId, setExpandedRefId] = useState<string | null>(null);

  const getAuthHeader = () => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    return { Authorization: token ? `Bearer ${token}` : '' };
  };

  // 1. Fetch Entitled Frameworks
  const fetchEntitledFrameworks = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/frameworks', { headers: getAuthHeader() });
      if (!res.ok) throw new Error('Failed to fetch entitled framework catalog.');
      const list: FrameworkItemDto[] = await res.json();
      setFrameworks(list);

      if (list.length > 0) {
        setSelectedFrameworkId(list[0].id);
      } else {
        setLoading(false);
      }
    } catch (err: any) {
      setError(err.message || 'Error loading frameworks.');
      setLoading(false);
    }
  };

  // 2. Fetch Versions for Selected Framework
  const fetchVersions = useCallback(async (fwId: string) => {
    if (!fwId) return;
    try {
      const res = await fetch(`/api/frameworks/${fwId}/versions`, { headers: getAuthHeader() });
      if (res.ok) {
        const vList: VersionItem[] = await res.json();
        setVersions(vList);
        if (vList.length > 0) {
          setSelectedVersionId(vList[0].id);
        } else {
          setSelectedVersionId('');
        }
      } else {
        setVersions([]);
        setSelectedVersionId('');
      }
    } catch (err) {
      console.error('Error fetching framework versions:', err);
      setVersions([]);
      setSelectedVersionId('');
    }
  }, []);

  // 3. Fetch Coverage Data
  const fetchCoverage = useCallback(async (fwId: string, verId?: string) => {
    if (!fwId) return;
    setLoading(true);
    setError(null);
    try {
      let url = `/api/frameworks/${fwId}/coverage`;
      if (verId) {
        url += `?versionId=${encodeURIComponent(verId)}`;
      }

      const res = await fetch(url, { headers: getAuthHeader() });
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.message || 'Failed to calculate framework coverage.');
      }

      const data: FrameworkCoverageResultDto = await res.json();
      setCoverageData(data);
    } catch (err: any) {
      setError(err.message || 'Error fetching coverage analysis.');
      setCoverageData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEntitledFrameworks();
  }, []);

  useEffect(() => {
    if (selectedFrameworkId) {
      fetchVersions(selectedFrameworkId);
    }
  }, [selectedFrameworkId, fetchVersions]);

  useEffect(() => {
    if (selectedFrameworkId) {
      fetchCoverage(selectedFrameworkId, selectedVersionId || undefined);
    }
  }, [selectedFrameworkId, selectedVersionId, fetchCoverage]);

  // Handle filter changes
  const handleFrameworkChange = (fwId: string) => {
    setSelectedFrameworkId(fwId);
    setSelectedVersionId('');
    setExpandedRefId(null);
  };

  const handleVersionChange = (vId: string) => {
    setSelectedVersionId(vId);
    setExpandedRefId(null);
  };

  // Filter references for local UI display if query not sent to API
  const displayedReferences = (coverageData?.references || []).filter((ref) => {
    if (statusFilter !== 'ALL' && ref.status !== statusFilter) return false;
    if (typeFilter !== 'ALL' && ref.type.toUpperCase() !== typeFilter.toUpperCase()) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      const matchesCode = ref.code.toLowerCase().includes(q);
      const matchesTitle = ref.title.toLowerCase().includes(q);
      if (!matchesCode && !matchesTitle) return false;
    }
    return true;
  });

  const referenceTypes = Array.from(
    new Set((coverageData?.references || []).map((r) => r.type.toUpperCase())),
  );

  return (
    <div className="w-full space-y-6 omni-fade-in">
      {/* Header Controls */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-6 h-6 text-teal-700" />
              <h2 className="text-xl font-bold text-slate-900">Framework Coverage & Gap Analysis</h2>
            </div>
            <p className="text-xs text-slate-600 mt-1">
              Real-time audit coverage measurement linking licensed framework references to controls, evidence, and approvals.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => fetchCoverage(selectedFrameworkId, selectedVersionId)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition"
              title="Refresh Coverage Analysis"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
            </button>
          </div>
        </div>

        {/* Framework & Version Selector Bar */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-3 border-t border-slate-100">
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Entitled Framework
            </label>
            <select
              value={selectedFrameworkId}
              onChange={(e) => handleFrameworkChange(e.target.value)}
              disabled={frameworks.length === 0}
              className="w-full px-3.5 py-2 text-sm font-semibold bg-white border border-slate-300 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600 transition"
            >
              {frameworks.length === 0 ? (
                <option value="">No Licensed Frameworks Available</option>
              ) : (
                frameworks.map((fw) => (
                  <option key={fw.id} value={fw.id}>
                    {fw.code} — {fw.name}
                  </option>
                ))
              )}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Framework Version
            </label>
            <select
              value={selectedVersionId}
              onChange={(e) => handleVersionChange(e.target.value)}
              disabled={versions.length === 0}
              className="w-full px-3.5 py-2 text-sm font-semibold bg-white border border-slate-300 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600 transition"
            >
              {versions.length === 0 ? (
                <option value="">Default Active Version</option>
              ) : (
                versions.map((v) => (
                  <option key={v.id} value={v.id}>
                    Version {v.version} — {v.name}
                  </option>
                ))
              )}
            </select>
          </div>
        </div>
      </div>

      {/* Summary KPI Cards */}
      {coverageData && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-1">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total References</span>
            <div className="text-2xl font-black text-slate-900">{coverageData.summary.totalReferences}</div>
            <div className="text-[11px] text-slate-500 font-medium">Standard requirements</div>
          </div>

          <div className="p-4 rounded-2xl bg-emerald-50/60 border border-emerald-200/80 shadow-sm space-y-1">
            <span className="text-xs font-bold text-emerald-800 uppercase tracking-wider flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Covered
            </span>
            <div className="text-2xl font-black text-emerald-950">{coverageData.summary.covered}</div>
            <div className="text-[11px] text-emerald-700 font-medium">Control + Evidence + Approval</div>
          </div>

          <div className="p-4 rounded-2xl bg-amber-50/60 border border-amber-200/80 shadow-sm space-y-1">
            <span className="text-xs font-bold text-amber-800 uppercase tracking-wider flex items-center gap-1">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-600" /> Partial
            </span>
            <div className="text-2xl font-black text-amber-950">{coverageData.summary.partial}</div>
            <div className="text-[11px] text-amber-700 font-medium">Incomplete sign-off/proof</div>
          </div>

          <div className="p-4 rounded-2xl bg-rose-50/60 border border-rose-200/80 shadow-sm space-y-1">
            <span className="text-xs font-bold text-rose-800 uppercase tracking-wider flex items-center gap-1">
              <XCircle className="w-3.5 h-3.5 text-rose-600" /> Not Covered
            </span>
            <div className="text-2xl font-black text-rose-950">{coverageData.summary.notCovered}</div>
            <div className="text-[11px] text-rose-700 font-medium">Zero active controls mapped</div>
          </div>

          <div className="p-4 rounded-2xl bg-teal-900 text-white shadow-sm space-y-1 col-span-2 sm:col-span-1">
            <span className="text-xs font-bold text-teal-200 uppercase tracking-wider">Coverage Rate</span>
            <div className="text-2xl font-black text-white">{coverageData.summary.coveragePercentage}%</div>
            <div className="w-full bg-teal-950 rounded-full h-1.5 mt-1 overflow-hidden">
              <div
                className="bg-teal-400 h-1.5 rounded-full transition-all duration-500"
                style={{ width: `${Math.min(100, Math.max(0, coverageData.summary.coveragePercentage))}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-2.5 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Filter by reference code (e.g. A.5.1) or title..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 text-sm bg-white border border-slate-300 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600 transition"
          />
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5">
            <Filter className="w-3.5 h-3.5 text-slate-500" />
            <span className="text-xs font-bold text-slate-600 uppercase">Status:</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-2.5 py-1.5 text-xs font-semibold bg-white border border-slate-300 rounded-lg text-slate-800 focus:outline-none focus:ring-1 focus:ring-teal-600"
            >
              <option value="ALL">All Statuses ({coverageData?.references.length || 0})</option>
              <option value="COVERED">Covered Only ({coverageData?.summary.covered || 0})</option>
              <option value="PARTIAL">Partial Only ({coverageData?.summary.partial || 0})</option>
              <option value="NOT_COVERED">Not Covered (Gaps) ({coverageData?.summary.notCovered || 0})</option>
            </select>
          </div>

          {referenceTypes.length > 1 && (
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold text-slate-600 uppercase">Type:</span>
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="px-2.5 py-1.5 text-xs font-semibold bg-white border border-slate-300 rounded-lg text-slate-800 focus:outline-none focus:ring-1 focus:ring-teal-600"
              >
                <option value="ALL">All Types</option>
                {referenceTypes.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* Main Results Table & Drill Down */}
      {loading ? (
        <div className="py-20 text-center text-slate-500 font-medium bg-white border border-slate-200 rounded-2xl">
          Calculating framework reference coverage...
        </div>
      ) : error ? (
        <div className="p-6 rounded-2xl bg-rose-50 border border-rose-200 text-rose-900 space-y-2">
          <div className="font-bold text-base flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-rose-600" /> Access or Entitlement Error
          </div>
          <p className="text-xs text-rose-700 font-medium">{error}</p>
        </div>
      ) : frameworks.length === 0 ? (
        <div className="py-16 text-center rounded-2xl bg-white border border-slate-200 p-8 space-y-3">
          <Lock className="w-10 h-10 text-slate-400 mx-auto" />
          <h3 className="text-base font-bold text-slate-900">No Licensed Framework Entitlements</h3>
          <p className="text-xs text-slate-600 max-w-md mx-auto">
            Your organization does not have an active commercial framework entitlement license for standard coverage analytics.
          </p>
        </div>
      ) : displayedReferences.length === 0 ? (
        <div className="py-12 text-center rounded-2xl bg-white border border-slate-200 p-8 text-slate-500 font-medium text-sm">
          No framework references match the active filters or search criteria.
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
          <div className="divide-y divide-slate-100">
            {displayedReferences.map((ref) => {
              const isExpanded = expandedRefId === ref.referenceId;
              return (
                <div key={ref.referenceId} className="transition hover:bg-slate-50/80">
                  {/* Summary Line Row */}
                  <div
                    onClick={() => setExpandedRefId(isExpanded ? null : ref.referenceId)}
                    className="p-4 cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                  >
                    <div className="flex items-start sm:items-center gap-3 min-w-0">
                      <span className="font-mono text-xs font-bold text-teal-900 bg-teal-100/80 border border-teal-300 px-2.5 py-1 rounded-md shrink-0">
                        {ref.code}
                      </span>
                      <div className="min-w-0">
                        <div className="font-semibold text-sm text-slate-900 truncate">{ref.title}</div>
                        <div className="text-[11px] text-slate-500 font-medium flex items-center gap-2 mt-0.5">
                          <span className="uppercase tracking-wider font-bold text-[10px] text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded">
                            {ref.type}
                          </span>
                          <span>•</span>
                          <span>{ref.mappedControlsCount} Controls</span>
                          <span>•</span>
                          <span>{ref.evidenceSummary.cleanActiveCount} Clean Evidence</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-4 shrink-0 justify-between sm:justify-end">
                      {/* Status Badge */}
                      {ref.status === 'COVERED' ? (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-900 border border-emerald-300">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> COVERED
                        </span>
                      ) : ref.status === 'PARTIAL' ? (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-900 border border-amber-300">
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-600" /> PARTIAL
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-900 border border-rose-300">
                          <XCircle className="w-3.5 h-3.5 text-rose-600" /> NOT COVERED
                        </span>
                      )}

                      <button className="text-slate-400 hover:text-slate-700 transition p-1">
                        {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                      </button>
                    </div>
                  </div>

                  {/* Expanded Drill Down Section */}
                  {isExpanded && (
                    <div className="px-5 pb-5 pt-2 bg-slate-50 border-t border-slate-100 space-y-4">
                      {/* Mapped Controls Details */}
                      <div>
                        <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                          <CheckSquare className="w-3.5 h-3.5 text-teal-700" /> Mapped Controls ({ref.mappedControls.length})
                        </h4>
                        {ref.mappedControls.length === 0 ? (
                          <p className="text-xs text-slate-500 italic">No active control mapped to this reference.</p>
                        ) : (
                          <div className="space-y-1.5">
                            {ref.mappedControls.map((c) => (
                              <div
                                key={c.controlId}
                                className="p-2.5 bg-white border border-slate-200 rounded-lg flex items-center justify-between text-xs"
                              >
                                <div>
                                  <span className="font-bold text-slate-900">{c.name}</span>
                                  {c.category && (
                                    <span className="ml-2 text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                                      {c.category}
                                    </span>
                                  )}
                                </div>
                                <span
                                  className={`font-semibold px-2 py-0.5 rounded text-[10px] ${
                                    c.mappingStatus === 'APPROVED' || c.mappingStatus === 'OVERRIDDEN'
                                      ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                      : 'bg-amber-100 text-amber-800 border border-amber-200'
                                  }`}
                                >
                                  Mapping: {c.mappingStatus}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Supporting Evidence Details */}
                      <div>
                        <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                          <FileArchive className="w-3.5 h-3.5 text-teal-700" /> Supporting Evidence Vault Proofs ({ref.evidenceSummary.totalCount})
                        </h4>
                        {ref.evidenceSummary.evidences.length === 0 ? (
                          <p className="text-xs text-slate-500 italic">No evidence uploaded or attached for mapped controls.</p>
                        ) : (
                          <div className="space-y-1.5">
                            {ref.evidenceSummary.evidences.map((ev) => (
                              <div
                                key={ev.id}
                                className="p-2.5 bg-white border border-slate-200 rounded-lg flex items-center justify-between text-xs"
                              >
                                <div className="flex items-center gap-2">
                                  <FileText className="w-4 h-4 text-slate-400" />
                                  <span className="font-semibold text-slate-900">{ev.title}</span>
                                  <span className="text-[11px] text-slate-500 font-mono">({ev.fileName})</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700">
                                    {ev.status}
                                  </span>
                                  <span
                                    className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                      ev.scanStatus === 'CLEAN'
                                        ? 'bg-emerald-100 text-emerald-800'
                                        : 'bg-amber-100 text-amber-800'
                                    }`}
                                  >
                                    Scan: {ev.scanStatus}
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Approval Status */}
                      <div>
                        <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                          <ShieldCheck className="w-3.5 h-3.5 text-teal-700" /> Lifecycle Approval Sign-Off State
                        </h4>
                        {ref.approvalSummary.instances.length === 0 ? (
                          <p className="text-xs text-slate-500 italic">No formal approval workflow instance associated.</p>
                        ) : (
                          <div className="space-y-1.5">
                            {ref.approvalSummary.instances.map((app) => (
                              <div
                                key={app.id}
                                className="p-2.5 bg-white border border-slate-200 rounded-lg flex items-center justify-between text-xs"
                              >
                                <span className="font-semibold text-slate-900">{app.title}</span>
                                <span
                                  className={`px-2.5 py-0.5 rounded text-[10px] font-bold ${
                                    app.status === 'APPROVED'
                                      ? 'bg-emerald-100 text-emerald-800'
                                      : app.status === 'REJECTED'
                                      ? 'bg-rose-100 text-rose-800'
                                      : 'bg-amber-100 text-amber-800'
                                  }`}
                                >
                                  {app.status}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
