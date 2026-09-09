'use client';

import React, { useState, useEffect } from 'react';
import { X, Search, CheckCircle2 } from 'lucide-react';
import { FrameworkClauseDto, FrameworkCode } from '@omnigrc/shared';
import { apiRequest } from '@/lib/api-client';

interface OverrideClauseModalProps {
  isOpen: boolean;
  targetFrameworkCode: FrameworkCode | string;
  onClose: () => void;
  onSelectClause: (clauseId: string) => void;
}

export function OverrideClauseModal({ isOpen, targetFrameworkCode, onClose, onSelectClause }: OverrideClauseModalProps) {
  const [clauses, setClauses] = useState<FrameworkClauseDto[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isOpen) {
      setLoading(true);
      apiRequest<FrameworkClauseDto[]>('/controls/framework-clauses')
        .then((data) => {
          const filtered = data.filter((c) => c.frameworkCode === targetFrameworkCode);
          setClauses(filtered);
        })
        .catch(() => setClauses([]))
        .finally(() => setLoading(false));
    }
  }, [isOpen, targetFrameworkCode]);

  if (!isOpen) return null;

  const filteredClauses = clauses.filter((c) => {
    if (!search.trim()) return true;
    const s = search.toLowerCase().trim();
    return c.code.toLowerCase().includes(s) || c.title.toLowerCase().includes(s);
  });

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(15, 26, 46, 0.45)', backdropFilter: 'blur(2px)',
    }}>
      <div className="omni-fade-in" style={{
        width: 540, maxWidth: '92vw', background: '#FFFFFF', borderRadius: 10,
        display: 'flex', flexDirection: 'column', maxHeight: '80vh', boxShadow: '0 12px 32px rgba(0,0,0,0.15)',
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          padding: '16px 20px', borderBottom: '1px solid #E2E6E4',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#F6F7F6',
        }}>
          <div>
            <h3 style={{ fontSize: 15, fontWeight: 600, color: '#1B2430' }}>
              Override Mapping — Select {targetFrameworkCode} Clause
            </h3>
            <p style={{ fontSize: 12, color: '#5B6672', marginTop: 2 }}>
              Choose the exact framework clause to map for human override compliance.
            </p>
          </div>
          <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#5B6672' }}>
            <X size={18} />
          </button>
        </div>

        {/* Search Bar */}
        <div style={{ padding: '12px 20px', borderBottom: '1px solid #E2E6E4' }}>
          <div style={{ position: 'relative' }}>
            <Search size={15} color="#8B95A1" style={{ position: 'absolute', left: 10, top: 10 }} />
            <input
              className="omni-input"
              placeholder={`Search ${targetFrameworkCode} clause number or title...`}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ paddingLeft: 32 }}
            />
          </div>
        </div>

        {/* Clauses List */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 20px' }} className="omni-scroll">
          {loading ? (
            <div style={{ padding: '24px 0', textAlign: 'center', color: '#8B95A1', fontSize: 13 }}>
              Loading framework clauses...
            </div>
          ) : filteredClauses.length === 0 ? (
            <div style={{ padding: '24px 0', textAlign: 'center', color: '#8B95A1', fontSize: 13 }}>
              No clauses found matching "{search}".
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {filteredClauses.map((clause) => (
                <div
                  key={clause.id}
                  onClick={() => onSelectClause(clause.id)}
                  style={{
                    padding: '10px 14px', borderRadius: 6, border: '1px solid #E2E6E4',
                    background: '#FFFFFF', cursor: 'pointer', transition: 'all .12s ease',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = '#F6F7F6';
                    e.currentTarget.style.borderColor = '#0F6E6A';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = '#FFFFFF';
                    e.currentTarget.style.borderColor = '#E2E6E4';
                  }}
                >
                  <div>
                    <span className="omni-mono" style={{ fontSize: 12, fontWeight: 700, color: '#0F6E6A', marginRight: 8 }}>
                      {clause.code}
                    </span>
                    <span style={{ fontSize: 13, color: '#1B2430', fontWeight: 500 }}>
                      {clause.title}
                    </span>
                  </div>
                  <CheckCircle2 size={15} color="#8B95A1" />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '12px 20px', borderTop: '1px solid #E2E6E4', background: '#FAFAFA',
          display: 'flex', justifyContent: 'flex-end',
        }}>
          <button onClick={onClose} className="omni-btn-ghost">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
