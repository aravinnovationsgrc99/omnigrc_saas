'use client';

import React, { useState, useEffect } from 'react';
import { X, Trash2, GitMerge, History, Clock } from 'lucide-react';
import { ControlDto, CreateControlDto, UpdateControlDto, AuditLogEntryDto } from '@omnigrc/shared';
import { apiRequest } from '@/lib/api-client';

interface ControlDrawerProps {
  control: ControlDto | null; // null = Create Mode, ControlDto = Edit Mode
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function ControlDrawer({ control, isOpen, onClose, onSuccess }: ControlDrawerProps) {
  const isEdit = Boolean(control);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');

  const [auditLogs, setAuditLogs] = useState<AuditLogEntryDto[]>([]);
  const [loadingAudit, setLoadingAudit] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (control) {
      setName(control.name || '');
      setDescription(control.description || '');
      setCategory(control.category || '');

      setLoadingAudit(true);
      apiRequest<AuditLogEntryDto[]>(`/controls/${control.id}/audit-log`)
        .then((data) => setAuditLogs(data))
        .catch(() => setAuditLogs([]))
        .finally(() => setLoadingAudit(false));
    } else {
      setName('');
      setDescription('');
      setCategory('');
      setAuditLogs([]);
    }
    setErrorMsg(null);
  }, [control, isOpen]);

  if (!isOpen) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !description.trim() || saving) return;

    setSaving(true);
    setErrorMsg(null);

    try {
      if (isEdit && control) {
        const payload: UpdateControlDto = {
          name: name.trim(),
          description: description.trim(),
          category: category.trim() || undefined,
        };
        await apiRequest(`/controls/${control.id}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
      } else {
        const payload: CreateControlDto = {
          name: name.trim(),
          description: description.trim(),
          category: category.trim() || undefined,
        };
        await apiRequest('/controls', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      }
      onSuccess();
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to save control');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!control || deleting) return;
    if (!confirm(`Are you sure you want to delete control "${control.name}"?`)) return;

    setDeleting(true);
    setErrorMsg(null);

    try {
      await apiRequest(`/controls/${control.id}`, { method: 'DELETE' });
      onSuccess();
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to delete control');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 50, display: 'flex', justifyContent: 'flex-end',
      background: 'rgba(15, 26, 46, 0.4)', backdropFilter: 'blur(2px)',
    }}>
      <div className="omni-fade-in" style={{
        width: 480, maxWidth: '100%', background: '#FFFFFF', height: '100%',
        display: 'flex', flexDirection: 'column', boxShadow: '-8px 0 24px rgba(0,0,0,0.12)',
      }}>
        {/* Header */}
        <div style={{
          height: 60, borderBottom: '1px solid #E2E6E4', padding: '0 20px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 32, height: 32, borderRadius: 8, background: '#E4F1F0', color: '#0F6E6A',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <GitMerge size={16} />
            </div>
            <h2 style={{ fontSize: 16, fontWeight: 600, color: '#1B2430' }}>
              {isEdit ? 'Control Details' : 'New Security Control'}
            </h2>
          </div>
          <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#5B6672' }}>
            <X size={18} />
          </button>
        </div>

        {/* Content Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 20 }} className="omni-scroll">
          {errorMsg && (
            <div style={{
              padding: '10px 12px', background: '#F8E6E8', border: '1px solid #B23A48',
              borderRadius: 6, color: '#B23A48', fontSize: 13, marginBottom: 16,
            }}>
              {errorMsg}
            </div>
          )}

          <form id="control-form" onSubmit={handleSave}>
            <label style={{ fontSize: 12.5, fontWeight: 600, color: '#5B6672', display: 'block', marginBottom: 6 }}>
              Control Name *
            </label>
            <input
              className="omni-input"
              placeholder="e.g. Mandatory TLS 1.3 Data Encryption In-Transit"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              style={{ marginBottom: 16 }}
            />

            <label style={{ fontSize: 12.5, fontWeight: 600, color: '#5B6672', display: 'block', marginBottom: 6 }}>
              Category
            </label>
            <input
              className="omni-input"
              placeholder="e.g. Data Protection & Cryptography"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              style={{ marginBottom: 16 }}
            />

            <label style={{ fontSize: 12.5, fontWeight: 600, color: '#5B6672', display: 'block', marginBottom: 6 }}>
              Description & Operational Safeguards *
            </label>
            <textarea
              className="omni-input"
              rows={4}
              placeholder="Detailed description of operational security procedure or technical enforcement..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
              style={{ marginBottom: 20, resize: 'vertical' }}
            />
          </form>

          {/* Audit History (Edit mode only) */}
          {isEdit && (
            <div style={{ borderTop: '1px solid #E2E6E4', paddingTop: 20, marginTop: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
                <History size={15} color="#0F6E6A" />
                <h3 style={{ fontSize: 13.5, fontWeight: 600, color: '#1B2430' }}>Audit History</h3>
              </div>

              {loadingAudit ? (
                <div style={{ fontSize: 12, color: '#8B95A1' }}>Loading history...</div>
              ) : auditLogs.length === 0 ? (
                <div style={{ fontSize: 12, color: '#8B95A1' }}>No audit log entries recorded yet.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {auditLogs.map((log) => (
                    <div key={log.id} style={{
                      padding: '10px 12px', background: '#F6F7F6', borderRadius: 6,
                      fontSize: 12, border: '1px solid #E2E6E4',
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                        <span style={{ fontWeight: 600, color: '#0F6E6A' }}>{log.action}</span>
                        <span style={{ fontSize: 11, color: '#8B95A1', display: 'flex', alignItems: 'center', gap: 3 }}>
                          <Clock size={11} /> {new Date(log.createdAt).toLocaleString()}
                        </span>
                      </div>
                      <div style={{ color: '#5B6672', fontSize: 11.5 }}>
                        Metadata: {JSON.stringify(log.metadata)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          height: 64, borderTop: '1px solid #E2E6E4', padding: '0 20px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#FAFAFA',
        }}>
          {isEdit ? (
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting}
              className="omni-btn-ghost"
              style={{ color: '#B23A48', borderColor: '#F8E6E8', display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <Trash2 size={14} /> {deleting ? 'Deleting...' : 'Delete'}
            </button>
          ) : (
            <div />
          )}

          <div style={{ display: 'flex', gap: 10 }}>
            <button type="button" onClick={onClose} className="omni-btn-ghost">
              Cancel
            </button>
            <button
              type="submit"
              form="control-form"
              disabled={saving}
              className="omni-btn-primary"
            >
              {saving ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Control'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
