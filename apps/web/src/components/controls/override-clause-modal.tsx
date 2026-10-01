'use client';

import React, { useState, useEffect } from 'react';
import { X, Search, CheckCircle2, Layers } from 'lucide-react';
import { FrameworkReferenceDto, FrameworkVersionDto, FrameworkCode } from '@omnigrc/shared';
import { apiRequest } from '@/lib/api-client';

interface OverrideClauseModalProps {
  isOpen: boolean;
  targetFrameworkCode: FrameworkCode | string;
  onClose: () => void;
  onSelectClause?: (referenceId: string) => void;
  onSelectReference?: (referenceId: string) => void;
}

export function OverrideClauseModal({
  isOpen,
  targetFrameworkCode,
  onClose,
  onSelectClause,
  onSelectReference,
}: OverrideClauseModalProps) {
  const [versions, setVersions] = useState<FrameworkVersionDto[]>([]);
  const [selectedVersionId, setSelectedVersionId] = useState<string>('');
  const [references, setReferences] = useState<FrameworkReferenceDto[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  const handleSelect = (refId: string) => {
    if (onSelectReference) onSelectReference(refId);
    else if (onSelectClause) onSelectClause(refId);
  };

  useEffect(() => {
    if (isOpen && targetFrameworkCode) {
      setLoading(true);
      setVersions([]);
      setReferences([]);
      setSelectedVersionId('');

      apiRequest<FrameworkVersionDto[]>(`/frameworks/${targetFrameworkCode}/versions`)
        .then((verData) => {
          setVersions(verData);
          const activeVer = verData.find((v) => v.status === 'ACTIVE') || verData[0];
          if (activeVer) {
            setSelectedVersionId(activeVer.id);
          } else {
            setLoading(false);
          }
        })
        .catch(() => {
          setVersions([]);
          setLoading(false);
        });
    }
  }, [isOpen, targetFrameworkCode]);

  useEffect(() => {
    if (selectedVersionId) {
      setLoading(true);
      apiRequest<FrameworkReferenceDto[]>(`/frameworks/versions/${selectedVersionId}/references`)
        .then((refData) => {
          setReferences(refData);
        })
        .catch(() => {
          setReferences([]);
        })
        .finally(() => setLoading(false));
    }
  }, [selectedVersionId]);

  if (!isOpen) return null;

  const filteredReferences = references.filter((r) => {
    if (!search.trim()) return true;
    const s = search.toLowerCase().trim();
    return (
      r.identifier.toLowerCase().includes(s) ||
      r.title.toLowerCase().includes(s) ||
      (r.type && r.type.toLowerCase().includes(s))
    );
  });

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(15, 26, 46, 0.45)', backdropFilter: 'blur(2px)',
    }}>
      <div className="omni-fade-in" style={{
        width: 600, maxWidth: '92vw', background: '#FFFFFF', borderRadius: 10,
        display: 'flex', flexDirection: 'column', maxHeight: '85vh', boxShadow: '0 12px 32px rgba(0,0,0,0.15)',
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          padding: '16px 20px', borderBottom: '1px solid #E2E6E4',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#F6F7F6',
        }}>
          <div>
            <h3 style={{ fontSize: 15, fontWeight: 600, color: '#1B2430' }}>
              Override Mapping — Select {targetFrameworkCode} Framework Reference
            </h3>
            <p style={{ fontSize: 12, color: '#5B6672', marginTop: 2 }}>
              Choose the exact framework reference to map for human override compliance.
            </p>
          </div>
          <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#5B6672' }}>
            <X size={18} />
          </button>
        </div>

        {/* Version Selector Header */}
        {versions.length > 0 && (
          <div style={{ padding: '10px 20px', background: '#FAFAFA', borderBottom: '1px solid #E2E6E4', display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#5B6672', display: 'flex', alignItems: 'center', gap: 4 }}>
              <Layers size={13} /> Version:
            </span>
            <select
              className="omni-input"
              style={{ fontSize: 12, padding: '4px 8px', height: 32 }}
              value={selectedVersionId}
              onChange={(e) => setSelectedVersionId(e.target.value)}
            >
              {versions.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name || `v${v.version}`} ({v.status})
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Search Bar */}
        <div style={{ padding: '12px 20px', borderBottom: '1px solid #E2E6E4' }}>
          <div style={{ position: 'relative' }}>
            <Search size={15} color="#8B95A1" style={{ position: 'absolute', left: 10, top: 10 }} />
            <input
              className="omni-input"
              placeholder={`Search ${targetFrameworkCode} reference code or title...`}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ paddingLeft: 32 }}
            />
          </div>
        </div>

        {/* References List */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 20px' }} className="omni-scroll">
          {loading ? (
            <div style={{ padding: '24px 0', textAlign: 'center', color: '#8B95A1', fontSize: 13 }}>
              Loading framework references...
            </div>
          ) : filteredReferences.length === 0 ? (
            <div style={{ padding: '24px 0', textAlign: 'center', color: '#8B95A1', fontSize: 13 }}>
              No framework references found matching "{search}".
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {filteredReferences.map((ref) => (
                <div
                  key={ref.id}
                  onClick={() => handleSelect(ref.id)}
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
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span className="omni-mono" style={{ fontSize: 12, fontWeight: 700, color: '#0F6E6A' }}>
                        {ref.identifier}
                      </span>
                      {ref.type && (
                        <span style={{ fontSize: 10, background: '#EDEFED', color: '#5B6672', padding: '1px 6px', borderRadius: 4 }}>
                          {ref.type}
                        </span>
                      )}
                    </div>
                    <span style={{ fontSize: 13, color: '#1B2430', fontWeight: 500, display: 'block', marginTop: 2 }}>
                      {ref.title}
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
