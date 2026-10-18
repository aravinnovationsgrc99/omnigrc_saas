'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { apiRequest } from '@/lib/api-client';
import { ShieldCheck, Filter, X, Loader2, RefreshCw } from 'lucide-react';

export interface FrameworkOption {
  id: string;
  code: string;
  name: string;
}

export interface VersionOption {
  id: string;
  frameworkId: string;
  version: string;
  name: string;
  status?: string;
  referencesCount?: number;
}

export interface ReferenceOption {
  id: string;
  identifier: string;
  title: string;
}

export interface ComplianceScopeFilterProps {
  selectedFrameworkId?: string;
  selectedVersionId?: string;
  selectedReferenceId?: string;
  frameworkId?: string;
  versionId?: string;
  frameworkReferenceId?: string;
  onFrameworkChange: (frameworkId: string, framework?: FrameworkOption | null) => void;
  onVersionChange?: (versionId: string, version?: VersionOption | null) => void;
  onReferenceChange?: (referenceId: string, reference?: ReferenceOption | null) => void;
  showReferenceFilter?: boolean;
  showVersionFilter?: boolean;
  className?: string;
  allOptionLabel?: string;
  frameworkPlaceholder?: string;
  versionPlaceholder?: string;
  clausePlaceholder?: string;
  hideClauseSelect?: boolean;
  layout?: 'inline' | 'form';
}

export function ComplianceScopeFilter({
  selectedFrameworkId,
  selectedVersionId,
  selectedReferenceId,
  frameworkId,
  versionId,
  frameworkReferenceId,
  onFrameworkChange,
  onVersionChange,
  onReferenceChange,
  showReferenceFilter,
  showVersionFilter = false,
  className = '',
  allOptionLabel = 'All Frameworks',
  frameworkPlaceholder,
  versionPlaceholder,
  clausePlaceholder,
  hideClauseSelect = false,
  layout = 'inline',
}: ComplianceScopeFilterProps) {
  const activeFrameworkId = selectedFrameworkId ?? frameworkId ?? '';
  const activeVersionId = selectedVersionId ?? versionId ?? '';
  const activeReferenceId = selectedReferenceId ?? frameworkReferenceId ?? '';
  const shouldShowReferenceFilter = (showReferenceFilter ?? Boolean(onReferenceChange)) && !hideClauseSelect;

  const [frameworks, setFrameworks] = useState<FrameworkOption[]>([]);
  const [versions, setVersions] = useState<VersionOption[]>([]);
  const [resolvedVersionId, setResolvedVersionId] = useState<string>(activeVersionId);
  const [references, setReferences] = useState<ReferenceOption[]>([]);

  const [loadingFrameworks, setLoadingFrameworks] = useState(false);
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [loadingReferences, setLoadingReferences] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [referenceError, setReferenceError] = useState<string | null>(null);

  // Sync external versionId change
  useEffect(() => {
    if (activeVersionId !== resolvedVersionId) {
      setResolvedVersionId(activeVersionId);
    }
  }, [activeVersionId]);

  // Fetch available entitled frameworks
  useEffect(() => {
    let isMounted = true;
    async function loadFrameworks() {
      setLoadingFrameworks(true);
      setError(null);
      try {
        const data = await apiRequest<FrameworkOption[]>('/frameworks');
        if (isMounted) {
          setFrameworks(data || []);
        }
      } catch (err: any) {
        if (isMounted) {
          setError(err?.message || 'Failed to load frameworks');
          setFrameworks([]);
        }
      } finally {
        if (isMounted) setLoadingFrameworks(false);
      }
    }
    loadFrameworks();
    return () => {
      isMounted = false;
    };
  }, []);

  // Fetch versions when activeFrameworkId changes
  useEffect(() => {
    if (!activeFrameworkId) {
      setVersions([]);
      setResolvedVersionId('');
      setReferences([]);
      setReferenceError(null);
      return;
    }

    let isMounted = true;
    async function loadVersions() {
      setLoadingVersions(true);
      setReferenceError(null);
      try {
        const data = await apiRequest<VersionOption[]>(`/frameworks/${activeFrameworkId}/versions`);
        if (!isMounted) return;

        const versionList = data || [];
        setVersions(versionList);

        if (versionList.length > 0) {
          let targetVersion: VersionOption | undefined;

          // 1. If activeVersionId is provided and matches a version in the list, use it
          if (activeVersionId) {
            targetVersion = versionList.find((v) => v.id === activeVersionId);
          }

          // 2. If activeVersionId is not valid or empty, but activeReferenceId is present,
          // resolve the reference's authoritative version
          if (!targetVersion && activeReferenceId) {
            try {
              const refData = await apiRequest<{ frameworkVersionId?: string }>(`/frameworks/references/${activeReferenceId}`);
              if (refData?.frameworkVersionId) {
                targetVersion = versionList.find((v) => v.id === refData.frameworkVersionId);
              }
            } catch {
              // Ignore lookup failure and fall back
            }
          }

          // 3. Fallback to version with references > 0, else first version
          const bestVersion = targetVersion || versionList.find((v) => (v.referencesCount ?? 0) > 0) || versionList[0];
          setResolvedVersionId(bestVersion.id);
          if (onVersionChange && (!activeVersionId || activeVersionId !== bestVersion.id)) {
            onVersionChange(bestVersion.id, bestVersion);
          }
        } else {
          setResolvedVersionId('');
          setReferences([]);
          if (onVersionChange) {
            onVersionChange('', null);
          }
        }
      } catch (err: any) {
        if (isMounted) {
          setVersions([]);
          setResolvedVersionId('');
          setReferences([]);
          setReferenceError(err?.message || 'Failed to load framework versions.');
        }
      } finally {
        if (isMounted) setLoadingVersions(false);
      }
    }

    loadVersions();
    return () => {
      isMounted = false;
    };
  }, [activeFrameworkId, activeReferenceId]);

  // Fetch references when resolvedVersionId changes
  const loadReferencesForVersion = useCallback(async (vId: string) => {
    if (!shouldShowReferenceFilter || !vId) {
      setReferences([]);
      return;
    }

    setLoadingReferences(true);
    setReferenceError(null);
    try {
      const refs = await apiRequest<ReferenceOption[]>(`/frameworks/versions/${vId}/references`);
      setReferences(refs || []);
    } catch (err: any) {
      setReferences([]);
      setReferenceError(err?.message || 'Failed to load references.');
    } finally {
      setLoadingReferences(false);
    }
  }, [shouldShowReferenceFilter]);

  useEffect(() => {
    if (resolvedVersionId) {
      loadReferencesForVersion(resolvedVersionId);
    } else {
      setReferences([]);
    }
  }, [resolvedVersionId, loadReferencesForVersion]);

  const handleFrameworkSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    const fw = frameworks.find((f) => f.id === val) || null;
    onFrameworkChange(val, fw);
    setResolvedVersionId('');
    setReferences([]);
    if (onVersionChange) {
      onVersionChange('', null);
    }
    if (shouldShowReferenceFilter && onReferenceChange) {
      onReferenceChange('', null);
    }
  };

  const handleVersionSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    const ver = versions.find((v) => v.id === val) || null;
    setResolvedVersionId(val);
    if (onVersionChange) {
      onVersionChange(val, ver);
    }
    // Changing framework version refreshes the available references and clears stale selections
    if (shouldShowReferenceFilter && onReferenceChange) {
      onReferenceChange('', null);
    }
  };

  const handleReferenceSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    const ref = references.find((r) => r.id === val) || null;
    if (onReferenceChange) {
      onReferenceChange(val, ref);
    }
  };

  const clearFilter = () => {
    onFrameworkChange('', null);
    setResolvedVersionId('');
    setReferences([]);
    if (onVersionChange) {
      onVersionChange('', null);
    }
    if (onReferenceChange) {
      onReferenceChange('', null);
    }
  };

  const frameworkLabel = frameworkPlaceholder || allOptionLabel;
  const versionLabel = versionPlaceholder || 'Select Version';
  const clauseLabel = clausePlaceholder || 'All Clauses / References';

  if (layout === 'form') {
    return (
      <div className={`space-y-3 ${className}`}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Target Framework Field */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Target Framework
            </label>
            <div className="relative">
              <select
                value={activeFrameworkId}
                onChange={handleFrameworkSelect}
                disabled={loadingFrameworks}
                aria-label="Target Framework"
                className="w-full appearance-none bg-white border border-slate-300 rounded-lg px-3 py-2 pr-8 text-xs font-medium text-slate-800 shadow-sm hover:border-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-600 focus:border-transparent disabled:opacity-50 cursor-pointer"
              >
                <option value="">{loadingFrameworks ? 'Loading frameworks...' : frameworkLabel}</option>
                {frameworks.map((fw) => (
                  <option key={fw.id} value={fw.id}>
                    {fw.code} — {fw.name}
                  </option>
                ))}
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2.5 text-slate-400">
                {loadingFrameworks ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Filter className="w-3.5 h-3.5" />}
              </div>
            </div>
          </div>

          {/* Framework Version Field (Visible when versions exist) */}
          {(showVersionFilter || versions.length > 1) && activeFrameworkId && (
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Framework Version
              </label>
              <div className="relative">
                <select
                  value={resolvedVersionId}
                  onChange={handleVersionSelect}
                  disabled={loadingVersions || versions.length === 0}
                  aria-label="Framework Version"
                  className="w-full appearance-none bg-white border border-slate-300 rounded-lg px-3 py-2 pr-8 text-xs font-medium text-slate-800 shadow-sm hover:border-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-600 focus:border-transparent disabled:opacity-50 cursor-pointer"
                >
                  <option value="">{loadingVersions ? 'Loading versions...' : versionLabel}</option>
                  {versions.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.version} {v.name ? `(${v.name})` : ''} {v.referencesCount !== undefined ? `[${v.referencesCount} refs]` : ''}
                    </option>
                  ))}
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2.5 text-slate-400">
                  {loadingVersions ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
                </div>
              </div>
            </div>
          )}

          {/* Framework Reference / Clause Field */}
          {shouldShowReferenceFilter && (
            <div className={versions.length > 1 || showVersionFilter ? 'sm:col-span-2' : ''}>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-semibold text-slate-700">
                  Framework Reference / Clause (Optional)
                </label>
                {loadingReferences && (
                  <span className="text-[11px] text-teal-600 flex items-center gap-1 font-medium">
                    <Loader2 className="w-3 h-3 animate-spin" /> Loading references...
                  </span>
                )}
              </div>
              <div className="relative">
                <select
                  value={activeReferenceId}
                  onChange={handleReferenceSelect}
                  disabled={!activeFrameworkId || loadingReferences || (references.length === 0 && !referenceError)}
                  aria-label="Framework Reference or Clause"
                  className="w-full appearance-none bg-white border border-slate-300 rounded-lg px-3 py-2 pr-8 text-xs font-medium text-slate-800 shadow-sm hover:border-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-600 focus:border-transparent disabled:opacity-50 cursor-pointer"
                >
                  <option value="">
                    {!activeFrameworkId
                      ? '-- Select Target Framework First --'
                      : loadingReferences
                      ? 'Loading clauses...'
                      : referenceError
                      ? 'Error loading references'
                      : references.length === 0
                      ? 'No references configured for this version'
                      : clauseLabel}
                  </option>
                  {references.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.identifier} — {r.title}
                    </option>
                  ))}
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2.5 text-slate-400">
                  {loadingReferences ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <ShieldCheck className="w-3.5 h-3.5 text-slate-400" />
                  )}
                </div>
              </div>

              {referenceError && (
                <div className="flex items-center justify-between mt-1 text-xs text-rose-600 font-medium">
                  <span>{referenceError}</span>
                  <button
                    type="button"
                    onClick={() => resolvedVersionId && loadReferencesForVersion(resolvedVersionId)}
                    className="inline-flex items-center gap-1 text-teal-700 hover:text-teal-800 underline text-[11px]"
                  >
                    <RefreshCw className="w-3 h-3" /> Retry
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      {/* Framework Dropdown */}
      <div className="relative inline-flex items-center">
        <select
          value={activeFrameworkId}
          onChange={handleFrameworkSelect}
          disabled={loadingFrameworks}
          aria-label="Filter by Compliance Framework"
          className="appearance-none bg-white border border-slate-300 rounded-lg px-3 py-1.5 pr-8 text-xs font-semibold text-slate-700 shadow-sm hover:border-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-600 focus:border-transparent disabled:opacity-50 cursor-pointer"
        >
          <option value="">{loadingFrameworks ? 'Loading frameworks...' : frameworkLabel}</option>
          {frameworks.map((fw) => (
            <option key={fw.id} value={fw.id}>
              {fw.code} — {fw.name}
            </option>
          ))}
        </select>
        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-slate-400">
          {loadingFrameworks ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Filter className="w-3 h-3 text-slate-400" />
          )}
        </div>
      </div>

      {/* Framework Version Dropdown (Optional Cascading) */}
      {showVersionFilter && activeFrameworkId && versions.length > 0 && (
        <div className="relative inline-flex items-center">
          <select
            value={resolvedVersionId}
            onChange={handleVersionSelect}
            disabled={loadingVersions}
            aria-label="Filter by Framework Version"
            className="appearance-none bg-white border border-slate-300 rounded-lg px-3 py-1.5 pr-8 text-xs font-semibold text-slate-700 shadow-sm hover:border-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-600 focus:border-transparent disabled:opacity-50 cursor-pointer"
          >
            <option value="">{loadingVersions ? 'Loading...' : versionLabel}</option>
            {versions.map((v) => (
              <option key={v.id} value={v.id}>
                {v.version} {v.referencesCount !== undefined ? `(${v.referencesCount})` : ''}
              </option>
            ))}
          </select>
          <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-slate-400">
            {loadingVersions ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <ShieldCheck className="w-3 h-3 text-slate-400" />
            )}
          </div>
        </div>
      )}

      {/* Clause / Reference Dropdown (Optional Cascading) */}
      {shouldShowReferenceFilter && activeFrameworkId && (
        <div className="relative inline-flex items-center">
          <select
            value={activeReferenceId}
            onChange={handleReferenceSelect}
            disabled={loadingReferences || (references.length === 0 && !referenceError)}
            aria-label="Filter by Clause or Reference"
            className="appearance-none bg-white border border-slate-300 rounded-lg px-3 py-1.5 pr-8 text-xs font-semibold text-slate-700 shadow-sm hover:border-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-600 focus:border-transparent disabled:opacity-50 cursor-pointer max-w-xs truncate"
          >
            <option value="">
              {loadingReferences
                ? 'Loading clauses...'
                : referenceError
                ? 'Error loading references'
                : references.length === 0
                ? 'No clauses available'
                : clauseLabel}
            </option>
            {references.map((r) => (
              <option key={r.id} value={r.id}>
                {r.identifier} — {r.title}
              </option>
            ))}
          </select>
          <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-slate-400">
            {loadingReferences ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <ShieldCheck className="w-3 h-3 text-slate-400" />
            )}
          </div>
        </div>
      )}

      {/* Clear active filter button */}
      {(selectedFrameworkId || selectedReferenceId || selectedVersionId) && (
        <button
          type="button"
          onClick={clearFilter}
          title="Clear Compliance Filter"
          className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-slate-500 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
        >
          <X className="w-3 h-3" />
          <span>Reset</span>
        </button>
      )}

      {referenceError && (
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-rose-600 font-medium">{referenceError}</span>
          <button
            type="button"
            onClick={() => resolvedVersionId && loadReferencesForVersion(resolvedVersionId)}
            className="text-xs text-teal-700 underline flex items-center gap-0.5"
          >
            <RefreshCw className="w-2.5 h-2.5" /> Retry
          </button>
        </div>
      )}

      {error && <span className="text-xs text-rose-600 font-medium">{error}</span>}
    </div>
  );
}
