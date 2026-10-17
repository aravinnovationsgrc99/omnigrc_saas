'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { X, Search, GitMerge, Shield, Layers } from 'lucide-react';

export interface FrameworkClauseItem {
  id: string;
  frameworkId: string;
  frameworkCode?: string;
  frameworkName?: string;
  code: string;
  title: string;
}

export interface FrameworkSummary {
  id: string;
  code: string;
  name: string;
  clauseCount?: number;
}

const FRAMEWORK_ACCENTS: Record<string, { bg: string; color: string; border: string; label: string }> = {
  ISO27001: { bg: '#E4F1F0', color: '#0C5A56', border: '#B8DFDB', label: 'ISO 27001' },
  SOC2: { bg: '#EFF6FF', color: '#1E40AF', border: '#BFDBFE', label: 'SOC 2' },
  GDPR: { bg: '#F3E8FF', color: '#7C3AED', border: '#DDD6FE', label: 'GDPR' },
  DPDP: { bg: '#FEF3C7', color: '#B5750A', border: '#FDE68A', label: 'DPDP' },
  ISO42001: { bg: '#ECFDF5', color: '#059669', border: '#A7F3D0', label: 'ISO 42001' },
  HIPAA: { bg: '#FFE4E6', color: '#E11D48', border: '#FECDD3', label: 'HIPAA' },
};

function getFrameworkAccent(code?: string): { bg: string; color: string; border: string; label: string } {
  if (!code) {
    return { bg: '#F8FAFC', color: '#475569', border: '#E2E8F0', label: 'Unspecified' };
  }
  const clean = code.toUpperCase();
  return FRAMEWORK_ACCENTS[clean] || {
    bg: '#F0FDFA',
    color: '#0F766E',
    border: '#99F6E4',
    label: code,
  };
}

interface FrameworkClausesModalProps {
  isOpen: boolean;
  onClose: () => void;
  framework: FrameworkSummary | null;
  clauses: FrameworkClauseItem[];
  loading?: boolean;
  onSelectMapClause: (framework: FrameworkSummary, clause: FrameworkClauseItem) => void;
}

export function FrameworkClausesModal({
  isOpen,
  onClose,
  framework,
  clauses,
  loading = false,
  onSelectMapClause,
}: FrameworkClausesModalProps) {
  const [search, setSearch] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Focus search input on open
  useEffect(() => {
    if (isOpen) {
      setSearch('');
      const timer = setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isOpen, framework?.id]);

  // Keyboard shortcut: Escape to close
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const filteredClauses = useMemo(() => {
    if (!search.trim()) return clauses;
    const q = search.toLowerCase().trim();
    return clauses.filter(
      (c) => c.code.toLowerCase().includes(q) || c.title.toLowerCase().includes(q)
    );
  }, [clauses, search]);

  if (!isOpen || !framework) return null;

  const accent = getFrameworkAccent(framework.code);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="framework-clauses-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-3 sm:p-4 omni-fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-2xl bg-white border border-slate-200 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[88vh] animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-200 bg-slate-50/70 flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div
              style={{
                background: accent.bg,
                color: accent.color,
                border: `1px solid ${accent.border}`,
              }}
              className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 shadow-xs mt-0.5"
            >
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 id="framework-clauses-title" className="text-base sm:text-lg font-bold text-slate-900">
                  {accent.label || framework.code} Clauses
                </h2>
                <span
                  style={{
                    background: accent.bg,
                    color: accent.color,
                    border: `1px solid ${accent.border}`,
                  }}
                  className="text-xs font-semibold px-2 py-0.5 rounded-full omni-mono"
                >
                  {clauses.length} {clauses.length === 1 ? 'Clause' : 'Clauses'}
                </span>
              </div>
              <p className="text-xs text-slate-600 mt-1 line-clamp-1 sm:line-clamp-none font-medium">
                {framework.name}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close modal"
            className="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg hover:bg-slate-200/60 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search Bar & Stats */}
        <div className="p-3 sm:p-4 border-b border-slate-100 bg-white space-y-2">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              ref={searchInputRef}
              type="text"
              placeholder={`Search ${framework.code} clause code or title...`}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-9 py-2 text-xs sm:text-sm bg-white border border-slate-300 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-teal-600 focus:border-teal-600 transition shadow-xs"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          <div className="flex items-center justify-between text-xs text-slate-500 font-medium px-1">
            <span>
              Showing {filteredClauses.length} of {clauses.length} clauses
            </span>
            <span className="text-teal-700 font-semibold flex items-center gap-1">
              <Layers className="w-3.5 h-3.5" /> Click &ldquo;Map&rdquo; to attach to a new control
            </span>
          </div>
        </div>

        {/* Clauses List */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-2.5 omni-scroll max-h-[50vh]">
          {loading ? (
            <div className="py-12 text-center text-slate-500 text-sm font-medium flex items-center justify-center gap-2">
              <div className="w-4 h-4 border-2 border-teal-700 border-t-transparent rounded-full animate-spin" />
              <span>Loading clauses...</span>
            </div>
          ) : filteredClauses.length > 0 ? (
            filteredClauses.map((clause) => (
              <div
                key={clause.id}
                className="p-3 sm:p-3.5 rounded-xl border border-slate-200 hover:border-teal-500/50 hover:bg-teal-50/15 transition flex items-center justify-between gap-3 shadow-xs bg-white"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      style={{
                        background: accent.bg,
                        color: accent.color,
                        border: `1px solid ${accent.border}`,
                      }}
                      className="font-mono text-xs font-bold px-2 py-0.5 rounded shadow-2xs shrink-0"
                    >
                      {clause.code}
                    </span>
                  </div>
                  <div className="text-xs sm:text-sm font-semibold text-slate-800 mt-1 line-clamp-2">
                    {clause.title}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => onSelectMapClause(framework, clause)}
                  className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-teal-700 hover:bg-teal-800 text-white shadow-xs transition hover:scale-[1.03] active:scale-[0.97]"
                  title={`Map ${clause.code} to a new control`}
                >
                  <GitMerge className="w-3.5 h-3.5" />
                  <span>Map</span>
                </button>
              </div>
            ))
          ) : (
            <div className="py-10 text-center text-slate-500 text-xs sm:text-sm font-medium">
              No clauses found matching &ldquo;{search}&rdquo;.
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3.5 border-t border-slate-200 bg-slate-50/80 flex items-center justify-between text-xs text-slate-500">
          <span>{framework.code} standard reference</span>
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-100 font-semibold transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
