'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Search, Calendar, AlertCircle, Clock, CheckCircle2, Shield, MoreHorizontal, User, Filter } from 'lucide-react';
import { ComplianceTaskDto, TaskStatus, ComplianceTaskSummaryDto, PaginatedComplianceTasksDto } from '@omnigrc/shared';
import { apiRequest } from '@/lib/api-client';
import { TaskDrawer } from './task-drawer';

const KANBAN_COLUMNS: Array<{ status: TaskStatus; title: string; color: string; border: string }> = [
  { status: TaskStatus.NOT_STARTED, title: 'Not Started', color: '#5B6672', border: '#D2D7D5' },
  { status: TaskStatus.IN_PROGRESS, title: 'In Progress', color: '#1E40AF', border: '#93C5FD' },
  { status: TaskStatus.UNDER_REVIEW, title: 'Under Review', color: '#B5750A', border: '#F8E2BC' },
  { status: TaskStatus.COMPLETE, title: 'Complete', color: '#0F6E6A', border: '#BEE3E0' },
];

function getOwnerInitials(name: string): string {
  if (!name) return 'U';
  const parts = name.trim().split(' ');
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }
  return name.substring(0, 2).toUpperCase();
}

function getDueDateBadge(dueDateStr?: string | null, status?: TaskStatus) {
  if (!dueDateStr) return null;
  if (status === TaskStatus.COMPLETE) {
    return { label: new Date(dueDateStr).toLocaleDateString(), color: '#5B6672', bg: '#EDEFED', isOverdue: false };
  }

  const due = new Date(dueDateStr);
  const now = new Date();
  const diffDays = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    return { label: `Overdue ${Math.abs(diffDays)}d`, color: '#B23A48', bg: '#F8E6E8', isOverdue: true };
  } else if (diffDays <= 7) {
    return { label: `Due in ${diffDays}d`, color: '#B5750A', bg: '#FCEFD9', isOverdue: false };
  } else {
    return { label: due.toLocaleDateString(), color: '#5B6672', bg: '#EDEFED', isOverdue: false };
  }
}

export function ComplianceBoardView() {
  const [tasks, setTasks] = useState<ComplianceTaskDto[]>([]);
  const [summary, setSummary] = useState<ComplianceTaskSummaryDto>({ overdue: 0, due30: 0, due60: 0, due90: 0, totalOpen: 0 });
  const [loading, setLoading] = useState(true);

  // Filters & Search
  const [search, setSearch] = useState('');
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);

  // Drawer state
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<ComplianceTaskDto | null>(null);

  const fetchTasksAndSummary = useCallback(async () => {
    setLoading(true);
    try {
      const [tasksRes, summaryRes] = await Promise.all([
        apiRequest<PaginatedComplianceTasksDto>('/compliance-tasks?limit=150'),
        apiRequest<ComplianceTaskSummaryDto>('/compliance-tasks/dashboard-summary'),
      ]);
      setTasks(tasksRes.items);
      setSummary(summaryRes);
    } catch {
      setTasks([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTasksAndSummary();
  }, [fetchTasksAndSummary]);

  // Drag and Drop Handlers
  const handleDragStart = (e: React.DragEvent, taskId: string) => {
    setDraggedTaskId(taskId);
    e.dataTransfer.setData('text/plain', taskId);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = async (e: React.DragEvent, targetStatus: TaskStatus) => {
    e.preventDefault();
    const taskId = draggedTaskId || e.dataTransfer.getData('text/plain');
    if (!taskId) return;

    // Optimistic UI update
    setTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, status: targetStatus } : t))
    );
    setDraggedTaskId(null);

    try {
      await apiRequest(`/compliance-tasks/${taskId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: targetStatus }),
      });
      fetchTasksAndSummary();
    } catch {
      fetchTasksAndSummary(); // Revert on failure
    }
  };

  // Accessible Keyboard Move Handler
  const handleKeyboardMoveStatus = async (taskId: string, targetStatus: TaskStatus) => {
    setTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, status: targetStatus } : t))
    );

    try {
      await apiRequest(`/compliance-tasks/${taskId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: targetStatus }),
      });
      fetchTasksAndSummary();
    } catch {
      fetchTasksAndSummary();
    }
  };

  const handleOpenCreate = () => {
    setSelectedTask(null);
    setIsDrawerOpen(true);
  };

  const handleOpenEdit = (task: ComplianceTaskDto) => {
    setSelectedTask(task);
    setIsDrawerOpen(true);
  };

  const filteredTasks = tasks.filter((t) => {
    if (!search.trim()) return true;
    const s = search.toLowerCase().trim();
    return (
      t.title.toLowerCase().includes(s) ||
      t.owner.toLowerCase().includes(s) ||
      (t.description && t.description.toLowerCase().includes(s)) ||
      (t.controlName && t.controlName.toLowerCase().includes(s))
    );
  });

  return (
    <div className="omni-fade-in" style={{ padding: '28px 32px', maxWidth: 1240, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 21, fontWeight: 600, color: '#1B2430' }}>Compliance Board</h1>
          <p style={{ fontSize: 13.5, color: '#5B6672', marginTop: 3 }}>
            Track compliance tasks, drag-and-drop workflow status, link Phase 4 Controls, and monitor 30/60/90 day rolling deadlines.
          </p>
        </div>
        <button
          onClick={handleOpenCreate}
          className="omni-btn-primary"
          style={{ display: 'flex', alignItems: 'center', gap: 6 }}
        >
          <Plus size={15} /> New Task
        </button>
      </div>

      {/* 30/60/90 Day Dashboard Strip */}
      <div style={{
        display: 'flex', gap: 16, marginBottom: 24, flexWrap: 'wrap',
      }}>
        <div style={{
          flex: 1, minWidth: 160, background: '#FFFFFF', border: '1px solid #F1C7CC', borderRadius: 10, padding: '16px 20px',
        }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#B23A48', textTransform: 'uppercase', letterSpacing: 0.5 }}>
            Overdue Tasks
          </div>
          <div className="omni-mono" style={{ fontSize: 26, fontWeight: 700, color: '#B23A48', marginTop: 4 }}>
            {summary.overdue}
          </div>
          <div style={{ fontSize: 11.5, color: '#8B95A1', marginTop: 2 }}>Requires immediate action</div>
        </div>

        <div style={{
          flex: 1, minWidth: 160, background: '#FFFFFF', border: '1px solid #F8E2BC', borderRadius: 10, padding: '16px 20px',
        }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#B5750A', textTransform: 'uppercase', letterSpacing: 0.5 }}>
            Due in 30 Days
          </div>
          <div className="omni-mono" style={{ fontSize: 26, fontWeight: 700, color: '#B5750A', marginTop: 4 }}>
            {summary.due30}
          </div>
          <div style={{ fontSize: 11.5, color: '#8B95A1', marginTop: 2 }}>Short-term deliverables</div>
        </div>

        <div style={{
          flex: 1, minWidth: 160, background: '#FFFFFF', border: '1px solid #E2E6E4', borderRadius: 10, padding: '16px 20px',
        }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#5B6672', textTransform: 'uppercase', letterSpacing: 0.5 }}>
            Due in 60 Days
          </div>
          <div className="omni-mono" style={{ fontSize: 26, fontWeight: 700, color: '#1B2430', marginTop: 4 }}>
            {summary.due60}
          </div>
          <div style={{ fontSize: 11.5, color: '#8B95A1', marginTop: 2 }}>Medium-term roadmap</div>
        </div>

        <div style={{
          flex: 1, minWidth: 160, background: '#FFFFFF', border: '1px solid #BEE3E0', borderRadius: 10, padding: '16px 20px',
        }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#0F6E6A', textTransform: 'uppercase', letterSpacing: 0.5 }}>
            Due in 90 Days
          </div>
          <div className="omni-mono" style={{ fontSize: 26, fontWeight: 700, color: '#0F6E6A', marginTop: 4 }}>
            {summary.due90}
          </div>
          <div style={{ fontSize: 11.5, color: '#8B95A1', marginTop: 2 }}>Quarterly targets</div>
        </div>
      </div>

      {/* Search Bar */}
      <div style={{
        display: 'flex', gap: 12, alignItems: 'center', marginBottom: 20,
        background: '#FFFFFF', padding: '12px 16px', border: '1px solid #E2E6E4', borderRadius: 8,
      }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
          <Search size={15} color="#8B95A1" style={{ position: 'absolute', left: 10, top: 11 }} />
          <input
            className="omni-input"
            placeholder="Filter tasks by title, owner, or linked control..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ paddingLeft: 32 }}
          />
        </div>
      </div>

      {/* 4-Column Kanban Board */}
      {loading ? (
        <div style={{
          background: '#FFFFFF', border: '1px solid #E2E6E4', borderRadius: 10,
          padding: '40px 20px', textAlign: 'center', color: '#8B95A1', fontSize: 13,
        }}>
          Loading compliance board...
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, alignItems: 'flex-start' }}>
          {KANBAN_COLUMNS.map((col) => {
            const colTasks = filteredTasks.filter((t) => t.status === col.status);

            return (
              <div
                key={col.status}
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, col.status)}
                style={{
                  background: '#F6F7F6', border: '1px solid #E2E6E4', borderRadius: 10,
                  padding: 14, minHeight: 480, display: 'flex', flexDirection: 'column',
                }}
              >
                {/* Column Header */}
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14,
                  paddingBottom: 10, borderBottom: `2px solid ${col.border}`,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 13.5, fontWeight: 700, color: col.color }}>{col.title}</span>
                    <span className="omni-mono" style={{
                      fontSize: 11, fontWeight: 700, background: '#FFFFFF', color: col.color,
                      padding: '2px 7px', borderRadius: 999, border: '1px solid #E2E6E4',
                    }}>
                      {colTasks.length}
                    </span>
                  </div>
                </div>

                {/* Column Task Cards */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {colTasks.map((task) => {
                    const dueBadge = getDueDateBadge(task.dueDate, task.status);

                    return (
                      <div
                        key={task.id}
                        draggable
                        onDragStart={(e) => handleDragStart(e, task.id)}
                        onClick={() => handleOpenEdit(task)}
                        style={{
                          background: '#FFFFFF', border: '1px solid #E2E6E4', borderRadius: 8,
                          padding: 14, cursor: 'grab', boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
                          transition: 'all .15s ease', position: 'relative',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.borderColor = '#0F6E6A';
                          e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.06)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.borderColor = '#E2E6E4';
                          e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.02)';
                        }}
                      >
                        {/* Task Title */}
                        <div style={{ fontSize: 13.5, fontWeight: 600, color: '#1B2430', marginBottom: 8, lineHeight: 1.4 }}>
                          {task.title}
                        </div>

                        {/* Linked Control Pill */}
                        {task.controlName && (
                          <div style={{
                            display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600,
                            color: '#0F6E6A', background: '#E4F1F0', padding: '3px 8px', borderRadius: 4, marginBottom: 10,
                            maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          }}>
                            <Shield size={11} /> {task.controlName}
                          </div>
                        )}

                        {/* Card Footer: Owner Initials + Due Date + Keyboard Accessibility Move Menu */}
                        <div style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 4,
                          paddingTop: 8, borderTop: '1px solid #EDEFED',
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            {/* Owner Avatar Badge */}
                            <div style={{
                              width: 24, height: 24, borderRadius: 999, background: '#16233F', color: '#FFFFFF',
                              display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 10.5,
                            }} title={`Owner: ${task.owner}`}>
                              {getOwnerInitials(task.owner)}
                            </div>

                            {/* Due Date Badge */}
                            {dueBadge && (
                              <span style={{
                                fontSize: 10.5, fontWeight: 700, padding: '2px 7px', borderRadius: 999,
                                background: dueBadge.bg, color: dueBadge.color, display: 'flex', alignItems: 'center', gap: 3,
                              }}>
                                <Calendar size={10} /> {dueBadge.label}
                              </span>
                            )}
                          </div>

                          {/* Keyboard Move Column Select (Accessibility) */}
                          <select
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => {
                              e.stopPropagation();
                              handleKeyboardMoveStatus(task.id, e.target.value as TaskStatus);
                            }}
                            value={task.status}
                            title="Move column via keyboard"
                            style={{
                              fontSize: 10.5, background: '#F6F7F6', border: '1px solid #E2E6E4', borderRadius: 4,
                              color: '#5B6672', cursor: 'pointer', padding: '1px 3px',
                            }}
                          >
                            <option value={TaskStatus.NOT_STARTED}>Not Started</option>
                            <option value={TaskStatus.IN_PROGRESS}>In Progress</option>
                            <option value={TaskStatus.UNDER_REVIEW}>Under Review</option>
                            <option value={TaskStatus.COMPLETE}>Complete</option>
                          </select>
                        </div>
                      </div>
                    );
                  })}

                  {colTasks.length === 0 && (
                    <div style={{
                      padding: '28px 12px', border: '1px dashed #D2D7D5', borderRadius: 8,
                      textAlign: 'center', color: '#8B95A1', fontSize: 12, background: '#FFFFFF',
                    }}>
                      No tasks in this stage
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Slide-over Drawer */}
      <TaskDrawer
        task={selectedTask}
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        onSuccess={fetchTasksAndSummary}
      />
    </div>
  );
}
