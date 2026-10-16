'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { apiRequest } from '@/lib/api-client';
import { ShieldCheck, Filter, X, Loader2 } from 'lucide-react';

export interface FrameworkOption {
  id: string;
  code: string;
  name: string;
}

export interface ReferenceOption {
  id: string;
  identifier: string;
  title: string;
}

export interface ComplianceScopeFilterProps {
  selectedFrameworkId?: string;
  selectedReferenceId?: string;
  frameworkId?: string;
  frameworkReferenceId?: string;
  onFrameworkChange: (frameworkId: string, framework?: FrameworkOption | null) => void;
  onReferenceChange?: (referenceId: string, reference?: ReferenceOption | null) => void;
  showReferenceFilter?: boolean;
  className?: string;
  allOptionLabel?: string;
  frameworkPlaceholder?: string;
  clausePlaceholder?: string;
  hideClauseSelect?: boolean;
}

export function ComplianceScopeFilter({
  selectedFrameworkId,
  selectedReferenceId,
  frameworkId,
  frameworkReferenceId,
  onFrameworkChange,
  onReferenceChange,
  showReferenceFilter,
  className = '',
  allOptionLabel = 'All Frameworks',
  frameworkPlaceholder,
  clausePlaceholder,
  hideClauseSelect = false,
}: ComplianceScopeFilterProps) {
  const activeFrameworkId = selectedFrameworkId ?? frameworkId ?? '';
  const activeReferenceId = selectedReferenceId ?? frameworkReferenceId ?? '';
  const shouldShowReferenceFilter = (showReferenceFilter ?? Boolean(onReferenceChange)) && !hideClauseSelect;

  const [frameworks, setFrameworks] = useState<FrameworkOption[]>([]);
  const [references, setReferences] = useState<ReferenceOption[]>([]);
  const [loadingFrameworks, setLoadingFrameworks] = useState(false);
  const [loadingReferences, setLoadingReferences] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  // Fetch references when activeFrameworkId changes and reference filtering is enabled
  useEffect(() => {
    if (!shouldShowReferenceFilter || !activeFrameworkId) {
      setReferences([]);
      return;
    }

    let isMounted = true;
    async function loadReferences() {
      setLoadingReferences(true);
      try {
        const versions = await apiRequest<{ id: string }[]>(`/frameworks/${activeFrameworkId}/versions`);
        if (isMounted && versions && versions.length > 0) {
          const refs = await apiRequest<ReferenceOption[]>(`/frameworks/versions/${versions[0].id}/references`);
          if (isMounted) {
            setReferences(refs || []);
          }
        } else if (isMounted) {
          setReferences([]);
        }
      } catch {
        if (isMounted) setReferences([]);
      } finally {
        if (isMounted) setLoadingReferences(false);
      }
    }
    loadReferences();
    return () => {
      isMounted = false;
    };
  }, [activeFrameworkId, shouldShowReferenceFilter]);

  const handleFrameworkSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    const fw = frameworks.find((f) => f.id === val) || null;
    onFrameworkChange(val, fw);
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
    if (onReferenceChange) {
      onReferenceChange('', null);
    }
  };

  const frameworkLabel = frameworkPlaceholder || allOptionLabel;
  const clauseLabel = clausePlaceholder || 'All Clauses / References';

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

      {/* Clause / Reference Dropdown (Optional Cascading) */}
      {shouldShowReferenceFilter && activeFrameworkId && (
        <div className="relative inline-flex items-center">
          <select
            value={activeReferenceId}
            onChange={handleReferenceSelect}
            disabled={loadingReferences || references.length === 0}
            aria-label="Filter by Clause or Reference"
            className="appearance-none bg-white border border-slate-300 rounded-lg px-3 py-1.5 pr-8 text-xs font-semibold text-slate-700 shadow-sm hover:border-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-600 focus:border-transparent disabled:opacity-50 cursor-pointer max-w-xs truncate"
          >
            <option value="">
              {loadingReferences
                ? 'Loading clauses...'
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
      {(selectedFrameworkId || selectedReferenceId) && (
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

      {error && <span className="text-xs text-rose-600 font-medium">{error}</span>}
    </div>
  );
}
