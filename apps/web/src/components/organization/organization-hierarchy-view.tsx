'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/context/auth-context';
import { useToast } from '@/context/toast-context';
import { apiRequest } from '@/lib/api-client';
import { DepartmentDto, ProjectDto, OrganizationMemberDto, Role, ProductAccessStatus } from '@omnigrc/shared';
import { Building2, FolderKanban, Users, Plus, Shield, Lock, AlertTriangle, CheckCircle2, UserX, UserCheck, Settings, ShieldAlert, Edit2, Trash2, ArrowRight } from 'lucide-react';
import { SkeletonLine } from '@/components/ui/skeleton';

export function OrganizationHierarchyView() {
  const { user, organization } = useAuth();
  const { addToast } = useToast();
  const isAdmin = user?.role === Role.ADMIN;
  const isAuditor = user?.role === Role.EXTERNAL_AUDITOR;

  const [activeTab, setActiveTab] = useState<'departments' | 'projects' | 'members'>('departments');

  // Data states
  const [departments, setDepartments] = useState<DepartmentDto[]>([]);
  const [projects, setProjects] = useState<ProjectDto[]>([]);
  const [members, setMembers] = useState<OrganizationMemberDto[]>([]);
  const [loading, setLoading] = useState(true);

  // Modals & Forms
  const [showDeptModal, setShowDeptModal] = useState(false);
  const [deptName, setDeptName] = useState('');
  const [deptCode, setDeptCode] = useState('');
  const [deptDesc, setDeptDesc] = useState('');
  const [submittingDept, setSubmittingDept] = useState(false);

  const [showProjModal, setShowProjModal] = useState(false);
  const [projName, setProjName] = useState('');
  const [projCode, setProjCode] = useState('');
  const [projDesc, setProjDesc] = useState('');
  const [projDeptId, setProjDeptId] = useState('');
  const [submittingProj, setSubmittingProj] = useState(false);

  // Member Access Edit Modal
  const [selectedMember, setSelectedMember] = useState<OrganizationMemberDto | null>(null);
  const [memberRole, setMemberRole] = useState<Role>(Role.ANALYST);
  const [memberStatus, setMemberStatus] = useState<ProductAccessStatus>(ProductAccessStatus.ACTIVE);
  const [memberDeptIds, setMemberDeptIds] = useState<string[]>([]);
  const [memberProjIds, setMemberProjIds] = useState<string[]>([]);
  const [reason, setReason] = useState('');
  const [submittingMember, setSubmittingMember] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [deptRes, projRes, membRes] = await Promise.all([
        apiRequest<DepartmentDto[]>('/departments').catch(() => []),
        apiRequest<ProjectDto[]>('/projects').catch(() => []),
        apiRequest<OrganizationMemberDto[]>('/organization-members').catch(() => []),
      ]);
      setDepartments(deptRes);
      setProjects(projRes);
      setMembers(membRes);
    } catch {
      addToast('Failed to load organization hierarchy data', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Handlers
  const handleCreateDepartment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deptName.trim() || submittingDept) return;
    setSubmittingDept(true);
    try {
      const newDept = await apiRequest<DepartmentDto>('/departments', {
        method: 'POST',
        body: JSON.stringify({ name: deptName, code: deptCode, description: deptDesc }),
      });
      setDepartments((prev) => [...prev, newDept]);
      setShowDeptModal(false);
      setDeptName('');
      setDeptCode('');
      setDeptDesc('');
      addToast(`Department '${newDept.name}' created`, 'success');
    } catch (err: any) {
      addToast(err.message || 'Failed to create department', 'error');
    } finally {
      setSubmittingDept(false);
    }
  };

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projName.trim() || !projDeptId || submittingProj) return;
    setSubmittingProj(true);
    try {
      const newProj = await apiRequest<ProjectDto>('/projects', {
        method: 'POST',
        body: JSON.stringify({ name: projName, code: projCode, description: projDesc, departmentId: projDeptId }),
      });
      setProjects((prev) => [...prev, newProj]);
      setShowProjModal(false);
      setProjName('');
      setProjCode('');
      setProjDesc('');
      setProjDeptId('');
      addToast(`Project '${newProj.name}' created`, 'success');
    } catch (err: any) {
      addToast(err.message || 'Failed to create project', 'error');
    } finally {
      setSubmittingProj(false);
    }
  };

  const handleOpenMemberEdit = (m: OrganizationMemberDto) => {
    setSelectedMember(m);
    setMemberRole(m.role as Role);
    setMemberStatus(m.status);
    setMemberDeptIds(m.departments.map((d) => d.id));
    setMemberProjIds(m.projects.map((p) => p.id));
    setReason('');
  };

  const handleUpdateMemberAccess = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMember || submittingMember) return;
    setSubmittingMember(true);
    try {
      const updated = await apiRequest<OrganizationMemberDto>(`/organization-members/${selectedMember.id}/access`, {
        method: 'PATCH',
        body: JSON.stringify({
          role: memberRole,
          status: memberStatus,
          departmentIds: memberDeptIds,
          projectIds: memberProjIds,
          reason: reason.trim() || undefined,
        }),
      });
      setMembers((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
      setSelectedMember(null);
      addToast(`Updated member access for ${updated.user.email}`, 'success');
    } catch (err: any) {
      addToast(err.message || 'Failed to update member access', 'error');
    } finally {
      setSubmittingMember(false);
    }
  };

  const getStatusBadge = (status: ProductAccessStatus) => {
    switch (status) {
      case ProductAccessStatus.ACTIVE:
        return <span className="omni-badge bg-emerald-100 text-emerald-800 border-emerald-300">ACTIVE</span>;
      case ProductAccessStatus.SUSPENDED:
        return <span className="omni-badge bg-amber-100 text-amber-800 border-amber-300">SUSPENDED</span>;
      case ProductAccessStatus.REVOKED:
        return <span className="omni-badge bg-rose-100 text-rose-800 border-rose-300">REVOKED</span>;
      default:
        return <span className="omni-badge">{status}</span>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white border border-[#E2E6E4] rounded-lg p-5 shadow-sm">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-lg font-bold text-[#1B2430] flex items-center gap-2">
              <Building2 className="text-teal-700" size={20} /> Organization Hierarchy & Access Control
            </h1>
            <p className="text-xs text-[#5B6672] mt-1">
              Structure organization scopes (Organization → Department → Project), manage selective product access, and assign membership RBAC.
            </p>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => setActiveTab('departments')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                activeTab === 'departments' ? 'bg-teal-700 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Departments ({departments.length})
            </button>
            <button
              onClick={() => setActiveTab('projects')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                activeTab === 'projects' ? 'bg-teal-700 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Projects ({projects.length})
            </button>
            <button
              onClick={() => setActiveTab('members')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                activeTab === 'members' ? 'bg-teal-700 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Members & Selective Access ({members.length})
            </button>
          </div>
        </div>

        {/* Auditor & Role Notice */}
        {isAuditor && (
          <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-center gap-2 text-xs text-amber-800">
            <ShieldAlert size={16} className="text-amber-600 shrink-0" />
            <span>
              <strong>EXTERNAL_AUDITOR Scoping Active:</strong> You have read-only access to assigned department and project scopes. Member administration and settings mutations are blocked server-side.
            </span>
          </div>
        )}
      </div>

      {/* Main Content Area */}
      {loading ? (
        <div className="bg-white border border-[#E2E6E4] rounded-lg p-6 space-y-3">
          <SkeletonLine height="24px" width="40%" />
          <SkeletonLine height="100px" width="100%" />
        </div>
      ) : (
        <>
          {/* DEPARTMENTS TAB */}
          {activeTab === 'departments' && (
            <div className="bg-white border border-[#E2E6E4] rounded-lg p-5 shadow-sm space-y-4">
              <div className="flex justify-between items-center">
                <h2 className="text-sm font-semibold text-[#1B2430] flex items-center gap-2">
                  <Building2 size={16} className="text-teal-700" /> Departments
                </h2>
                {isAdmin && (
                  <button
                    onClick={() => setShowDeptModal(true)}
                    className="omni-btn-primary text-xs h-8 px-3 flex items-center gap-1.5"
                  >
                    <Plus size={14} /> Create Department
                  </button>
                )}
              </div>

              {departments.length === 0 ? (
                <div className="text-center py-8 border border-dashed border-[#EDEFED] rounded-lg bg-[#FAFBFB]">
                  <Building2 size={24} className="mx-auto text-gray-400 mb-2" />
                  <p className="text-xs text-[#5B6672]">No departments created yet.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-[#EDEFED] bg-[#FAFBFB] text-[#5B6672] font-semibold">
                        <th className="py-2.5 px-3">Name</th>
                        <th className="py-2.5 px-3">Code</th>
                        <th className="py-2.5 px-3">Description</th>
                        <th className="py-2.5 px-3">Created</th>
                      </tr>
                    </thead>
                    <tbody>
                      {departments.map((d) => (
                        <tr key={d.id} className="border-b border-[#EDEFED] hover:bg-slate-50/50">
                          <td className="py-2.5 px-3 font-semibold text-[#1B2430]">{d.name}</td>
                          <td className="py-2.5 px-3 omni-mono text-[11px]">{d.code || '-'}</td>
                          <td className="py-2.5 px-3 text-[#5B6672]">{d.description || '-'}</td>
                          <td className="py-2.5 px-3 text-[#5B6672] omni-mono text-[11px]">
                            {new Date(d.createdAt).toLocaleDateString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* PROJECTS TAB */}
          {activeTab === 'projects' && (
            <div className="bg-white border border-[#E2E6E4] rounded-lg p-5 shadow-sm space-y-4">
              <div className="flex justify-between items-center">
                <h2 className="text-sm font-semibold text-[#1B2430] flex items-center gap-2">
                  <FolderKanban size={16} className="text-teal-700" /> Projects
                </h2>
                {isAdmin && (
                  <button
                    onClick={() => setShowProjModal(true)}
                    className="omni-btn-primary text-xs h-8 px-3 flex items-center gap-1.5"
                  >
                    <Plus size={14} /> Create Project
                  </button>
                )}
              </div>

              {projects.length === 0 ? (
                <div className="text-center py-8 border border-dashed border-[#EDEFED] rounded-lg bg-[#FAFBFB]">
                  <FolderKanban size={24} className="mx-auto text-gray-400 mb-2" />
                  <p className="text-xs text-[#5B6672]">No projects created yet.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-[#EDEFED] bg-[#FAFBFB] text-[#5B6672] font-semibold">
                        <th className="py-2.5 px-3">Project Name</th>
                        <th className="py-2.5 px-3">Department</th>
                        <th className="py-2.5 px-3">Code</th>
                        <th className="py-2.5 px-3">Description</th>
                      </tr>
                    </thead>
                    <tbody>
                      {projects.map((p) => {
                        const dept = departments.find((d) => d.id === p.departmentId);
                        return (
                          <tr key={p.id} className="border-b border-[#EDEFED] hover:bg-slate-50/50">
                            <td className="py-2.5 px-3 font-semibold text-[#1B2430]">{p.name}</td>
                            <td className="py-2.5 px-3 font-medium text-teal-800">{dept?.name || p.departmentId}</td>
                            <td className="py-2.5 px-3 omni-mono text-[11px]">{p.code || '-'}</td>
                            <td className="py-2.5 px-3 text-[#5B6672]">{p.description || '-'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* MEMBERS & SELECTIVE ACCESS TAB */}
          {activeTab === 'members' && (
            <div className="bg-white border border-[#E2E6E4] rounded-lg p-5 shadow-sm space-y-4">
              <div className="flex justify-between items-center">
                <div>
                  <h2 className="text-sm font-semibold text-[#1B2430] flex items-center gap-2">
                    <Users size={16} className="text-teal-700" /> Organization Membership & Selective Access
                  </h2>
                  <p className="text-xs text-[#5B6672] mt-0.5">
                    Product access and roles are strictly membership-scoped. Revoking access preserves all historical GRC records.
                  </p>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-[#EDEFED] bg-[#FAFBFB] text-[#5B6672] font-semibold">
                      <th className="py-2.5 px-3">User</th>
                      <th className="py-2.5 px-3">Role</th>
                      <th className="py-2.5 px-3">Access Status</th>
                      <th className="py-2.5 px-3">Assigned Departments</th>
                      <th className="py-2.5 px-3">Assigned Projects</th>
                      {isAdmin && <th className="py-2.5 px-3 text-right">Actions</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {members.map((m) => (
                      <tr key={m.id} className="border-b border-[#EDEFED] hover:bg-slate-50/50">
                        <td className="py-2.5 px-3 font-medium text-[#1B2430]">
                          <div>{m.user.email}</div>
                          {m.user.firstName && (
                            <div className="text-[11px] text-[#5B6672]">
                              {m.user.firstName} {m.user.lastName}
                            </div>
                          )}
                        </td>
                        <td className="py-2.5 px-3">
                          <span className="omni-mono text-[11px] bg-slate-100 border border-slate-200 px-2 py-0.5 rounded font-semibold text-slate-800">
                            {m.role}
                          </span>
                        </td>
                        <td className="py-2.5 px-3">{getStatusBadge(m.status)}</td>
                        <td className="py-2.5 px-3 text-[#5B6672]">
                          {m.departments.length === 0 ? (
                            <span className="italic text-gray-400">All (Org-wide)</span>
                          ) : (
                            m.departments.map((d) => d.name).join(', ')
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-[#5B6672]">
                          {m.projects.length === 0 ? (
                            <span className="italic text-gray-400">All (Org-wide)</span>
                          ) : (
                            m.projects.map((p) => p.name).join(', ')
                          )}
                        </td>
                        {isAdmin && (
                          <td className="py-2.5 px-3 text-right">
                            <button
                              onClick={() => handleOpenMemberEdit(m)}
                              className="omni-btn-ghost text-xs py-1 px-2 text-teal-700 hover:text-teal-800 flex items-center gap-1 ml-auto"
                            >
                              <Edit2 size={12} /> Manage Access
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* CREATE DEPARTMENT MODAL */}
      {showDeptModal && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-md p-6 shadow-2xl border border-slate-200 space-y-4">
            <h3 className="text-base font-bold text-slate-900 m-0 flex items-center gap-2">
              <Building2 size={18} className="text-teal-700" /> Create Department
            </h3>
            <form onSubmit={handleCreateDepartment} className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-700">Department Name</label>
                <input
                  type="text"
                  required
                  value={deptName}
                  onChange={(e) => setDeptName(e.target.value)}
                  placeholder="e.g., Engineering, Finance, Compliance"
                  className="w-full text-xs p-2.5 border border-slate-300 rounded-lg mt-1"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-700">Code (Optional)</label>
                <input
                  type="text"
                  value={deptCode}
                  onChange={(e) => setDeptCode(e.target.value)}
                  placeholder="e.g., ENG, FIN, COMP"
                  className="w-full text-xs p-2.5 border border-slate-300 rounded-lg mt-1"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-700">Description</label>
                <textarea
                  rows={2}
                  value={deptDesc}
                  onChange={(e) => setDeptDesc(e.target.value)}
                  className="w-full text-xs p-2.5 border border-slate-300 rounded-lg mt-1"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowDeptModal(false)}
                  className="px-3 py-1.5 text-xs text-slate-600 hover:text-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingDept}
                  className="omni-btn-primary text-xs px-4 py-1.5"
                >
                  {submittingDept ? 'Creating...' : 'Create Department'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CREATE PROJECT MODAL */}
      {showProjModal && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-md p-6 shadow-2xl border border-slate-200 space-y-4">
            <h3 className="text-base font-bold text-slate-900 m-0 flex items-center gap-2">
              <FolderKanban size={18} className="text-teal-700" /> Create Project
            </h3>
            <form onSubmit={handleCreateProject} className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-700">Parent Department</label>
                <select
                  required
                  value={projDeptId}
                  onChange={(e) => setProjDeptId(e.target.value)}
                  className="w-full text-xs p-2.5 border border-slate-300 rounded-lg mt-1 bg-white"
                >
                  <option value="">Select Department...</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-700">Project Name</label>
                <input
                  type="text"
                  required
                  value={projName}
                  onChange={(e) => setProjName(e.target.value)}
                  placeholder="e.g., Cloud Security Migration, SOC2 Audit Prep"
                  className="w-full text-xs p-2.5 border border-slate-300 rounded-lg mt-1"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-700">Code (Optional)</label>
                <input
                  type="text"
                  value={projCode}
                  onChange={(e) => setProjCode(e.target.value)}
                  placeholder="e.g., PRJ-01"
                  className="w-full text-xs p-2.5 border border-slate-300 rounded-lg mt-1"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-700">Description</label>
                <textarea
                  rows={2}
                  value={projDesc}
                  onChange={(e) => setProjDesc(e.target.value)}
                  className="w-full text-xs p-2.5 border border-slate-300 rounded-lg mt-1"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowProjModal(false)}
                  className="px-3 py-1.5 text-xs text-slate-600 hover:text-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingProj}
                  className="omni-btn-primary text-xs px-4 py-1.5"
                >
                  {submittingProj ? 'Creating...' : 'Create Project'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MANAGE MEMBER ACCESS MODAL */}
      {selectedMember && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-lg p-6 shadow-2xl border border-slate-200 space-y-4">
            <h3 className="text-base font-bold text-slate-900 m-0 flex items-center gap-2">
              <Shield size={18} className="text-teal-700" /> Manage Member Access & RBAC
            </h3>
            <p className="text-xs text-slate-500">
              User: <strong className="text-slate-800">{selectedMember.user.email}</strong>
            </p>

            <form onSubmit={handleUpdateMemberAccess} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-700">Organization Role</label>
                  <select
                    value={memberRole}
                    onChange={(e) => setMemberRole(e.target.value as Role)}
                    className="w-full text-xs p-2 border border-slate-300 rounded-lg mt-1 bg-white font-medium"
                  >
                    <option value={Role.ADMIN}>ADMIN (Full Control)</option>
                    <option value={Role.ANALYST}>ANALYST (Operational GRC)</option>
                    <option value={Role.EXTERNAL_AUDITOR}>EXTERNAL_AUDITOR (Read-Only Audit)</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-700">Product Access Status</label>
                  <select
                    value={memberStatus}
                    onChange={(e) => setMemberStatus(e.target.value as ProductAccessStatus)}
                    className="w-full text-xs p-2 border border-slate-300 rounded-lg mt-1 bg-white font-medium"
                  >
                    <option value={ProductAccessStatus.ACTIVE}>ACTIVE (Normal Access)</option>
                    <option value={ProductAccessStatus.SUSPENDED}>SUSPENDED (Access Denied)</option>
                    <option value={ProductAccessStatus.REVOKED}>REVOKED (Product Revoked)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700">Reason for Status / Role Change</label>
                <input
                  type="text"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g., Audit engagement completed, Offboarding employee"
                  className="w-full text-xs p-2 border border-slate-300 rounded-lg mt-1"
                />
              </div>

              {/* Department Scoping */}
              <div>
                <label className="text-xs font-semibold text-slate-700">Department Scoping (Multi-select)</label>
                <p className="text-[11px] text-slate-500 mb-1">Leave unchecked for organization-wide access.</p>
                <div className="max-h-28 overflow-y-auto border border-slate-200 rounded-lg p-2 space-y-1 bg-slate-50">
                  {departments.map((d) => (
                    <label key={d.id} className="flex items-center gap-2 text-xs text-slate-700">
                      <input
                        type="checkbox"
                        checked={memberDeptIds.includes(d.id)}
                        onChange={(e) => {
                          if (e.target.checked) setMemberDeptIds([...memberDeptIds, d.id]);
                          else setMemberDeptIds(memberDeptIds.filter((id) => id !== d.id));
                        }}
                      />
                      <span>{d.name}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Project Scoping */}
              <div>
                <label className="text-xs font-semibold text-slate-700">Project Scoping (Multi-select)</label>
                <p className="text-[11px] text-slate-500 mb-1">Leave unchecked for organization-wide access.</p>
                <div className="max-h-28 overflow-y-auto border border-slate-200 rounded-lg p-2 space-y-1 bg-slate-50">
                  {projects.map((p) => (
                    <label key={p.id} className="flex items-center gap-2 text-xs text-slate-700">
                      <input
                        type="checkbox"
                        checked={memberProjIds.includes(p.id)}
                        onChange={(e) => {
                          if (e.target.checked) setMemberProjIds([...memberProjIds, p.id]);
                          else setMemberProjIds(memberProjIds.filter((id) => id !== p.id));
                        }}
                      />
                      <span>{p.name} ({departments.find((d) => d.id === p.departmentId)?.name})</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setSelectedMember(null)}
                  className="px-3 py-1.5 text-xs text-slate-600 hover:text-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingMember}
                  className="omni-btn-primary text-xs px-4 py-1.5"
                >
                  {submittingMember ? 'Saving...' : 'Save Access Settings'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
