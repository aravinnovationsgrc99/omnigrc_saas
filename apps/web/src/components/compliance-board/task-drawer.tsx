'use client';

import React, { useState, useEffect } from 'react';
import { X, Trash2, KanbanSquare, History, Clock, Calendar, Shield } from 'lucide-react';
import { ComplianceTaskDto, TaskStatus, CreateComplianceTaskDto, UpdateComplianceTaskDto, AuditLogEntryDto, ControlDto, PaginatedControlsDto } from '@omnigrc/shared';
import { apiRequest } from '@/lib/api-client';

interface TaskDrawerProps {
  task: ComplianceTaskDto | null; // null = Create Mode, ComplianceTaskDto = Edit Mode
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function TaskDrawer({ task, isOpen, onClose, onSuccess }: TaskDrawerProps) {
  const isEdit = Boolean(task);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<TaskStatus>(TaskStatus.NOT_STARTED);
  const [owner, setOwner] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [controlId, setControlId] = useState('');

  const [availableControls, setAvailableControls] = useState<ControlDto[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntryDto[]>([]);
  const [loadingAudit, setLoadingAudit] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Fetch Phase 4 Controls for searchable select dropdown
  useEffect(() => {
    if (isOpen) {
      apiRequest<PaginatedControlsDto>('/controls?limit=100')
        .then((res) => setAvailableControls(res.items))
        .catch(() => setAvailableControls([]));
    }
  }, [isOpen]);

  useEffect(() => {
    if (task) {
      setTitle(task.title || '');
      setDescription(task.description || '');
      setStatus(task.status || TaskStatus.NOT_STARTED);
      setOwner(task.owner || '');
      setDueDate(task.dueDate ? new Date(task.dueDate).toISOString().substring(0, 10) : '');
      setControlId(task.controlId || '');

      setLoadingAudit(true);
      apiRequest<AuditLogEntryDto[]>(`/compliance-tasks/${task.id}/audit-log`)
        .then((data) => setAuditLogs(data))
        .catch(() => setAuditLogs([]))
        .finally(() => setLoadingAudit(false));
    } else {
      setTitle('');
      setDescription('');
      setStatus(TaskStatus.NOT_STARTED);
      setOwner('');
      setDueDate('');
      setControlId('');
      setAuditLogs([]);
    }
    setErrorMsg(null);
  }, [task, isOpen]);

  if (!isOpen) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !owner.trim() || saving) return;

    setSaving(true);
    setErrorMsg(null);

    try {
      if (isEdit && task) {
        const payload: UpdateComplianceTaskDto = {
          title: title.trim(),
          description: description.trim() || undefined,
          status,
          owner: owner.trim(),
          dueDate: dueDate ? new Date(dueDate).toISOString() : null,
          controlId: controlId || null,
        };
        await apiRequest(`/compliance-tasks/${task.id}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
      } else {
        const payload: CreateComplianceTaskDto = {
          title: title.trim(),
          description: description.trim() || undefined,
          status,
          owner: owner.trim(),
          dueDate: dueDate ? new Date(dueDate).toISOString() : undefined,
          controlId: controlId || undefined,
        };
        await apiRequest('/compliance-tasks', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      }
      onSuccess();
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to save compliance task');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!task || deleting) return;
    if (!confirm(`Are you sure you want to delete compliance task "${task.title}"?`)) return;

    setDeleting(true);
    setErrorMsg(null);

    try {
      await apiRequest(`/compliance-tasks/${task.id}`, { method: 'DELETE' });
      onSuccess();
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to delete task');
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
        width: 490, maxWidth: '100%', background: '#FFFFFF', height: '100%',
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
              <KanbanSquare size={16} />
            </div>
            <h2 style={{ fontSize: 16, fontWeight: 600, color: '#1B2430' }}>
              {isEdit ? 'Task Details' : 'New Compliance Task'}
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

          <form id="task-form" onSubmit={handleSave}>
            <label style={{ fontSize: 12.5, fontWeight: 600, color: '#5B6672', display: 'block', marginBottom: 6 }}>
              Task Title *
            </label>
            <input
              className="omni-input"
              placeholder="e.g. Conduct Q2 Quarterly RBAC User Access Audit"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              style={{ marginBottom: 16 }}
            />

            <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 12.5, fontWeight: 600, color: '#5B6672', display: 'block', marginBottom: 6 }}>
                  Status *
                </label>
                <select
                  className="omni-input"
                  value={status}
                  onChange={(e) => setStatus(e.target.value as TaskStatus)}
                >
                  <option value={TaskStatus.NOT_STARTED}>Not Started</option>
                  <option value={TaskStatus.IN_PROGRESS}>In Progress</option>
                  <option value={TaskStatus.UNDER_REVIEW}>Under Review</option>
                  <option value={TaskStatus.COMPLETE}>Complete</option>
                </select>
              </div>

              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 12.5, fontWeight: 600, color: '#5B6672', display: 'block', marginBottom: 6 }}>
                  Task Owner *
                </label>
                <input
                  className="omni-input"
                  placeholder="e.g. SecOps Lead or Priya Nair"
                  value={owner}
                  onChange={(e) => setOwner(e.target.value)}
                  required
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 12.5, fontWeight: 600, color: '#5B6672', display: 'block', marginBottom: 6 }}>
                  Due Date
                </label>
                <input
                  type="date"
                  className="omni-input"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                />
              </div>

              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 12.5, fontWeight: 600, color: '#5B6672', display: 'block', marginBottom: 6 }}>
                  Linked Phase 4 Control
                </label>
                <select
                  className="omni-input"
                  value={controlId}
                  onChange={(e) => setControlId(e.target.value)}
                >
                  <option value="">-- No Linked Control --</option>
                  {availableControls.map((ctrl) => (
                    <option key={ctrl.id} value={ctrl.id}>
                      {ctrl.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <label style={{ fontSize: 12.5, fontWeight: 600, color: '#5B6672', display: 'block', marginBottom: 6 }}>
              Description & Action Steps
            </label>
            <textarea
              className="omni-input"
              rows={3}
              placeholder="Action items, required compliance deliverables, or audit notes..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
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
              form="task-form"
              disabled={saving}
              className="omni-btn-primary"
            >
              {saving ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Task'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
