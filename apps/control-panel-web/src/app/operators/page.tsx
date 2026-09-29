'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Users,
  UserPlus,
  Search,
  RefreshCw,
  Shield,
  ShieldAlert,
  ShieldCheck,
  UserX,
  UserCheck,
  LogOut,
  CheckCircle2,
  AlertTriangle,
  Key,
} from 'lucide-react';
import { useAuth } from '../../lib/auth-context';
import {
  controlPlaneApi,
  ControlPlaneApiError,
} from '../../lib/control-plane-api';
import {
  OperatorProfile,
  OperatorRoleType,
  OperatorStatusType,
} from '../../types/control-plane';
import { StatusBadge } from '../../components/ui/status-badge';
import { ConfirmationDialog } from '../../components/ui/confirmation-dialog';
import { ErrorState } from '../../components/ui/error-state';
import { AccessDenied } from '../../components/ui/access-denied';

const OPERATOR_ROLES: { value: OperatorRoleType; label: string; description: string }[] = [
  { value: 'PLATFORM_SUPER_ADMIN', label: 'Platform Super Admin', description: 'Full administrative access over control plane & operator management' },
  { value: 'COMMERCIAL_OPERATOR', label: 'Commercial Operator', description: 'Manages customer accounts, agreements, and licenses' },
  { value: 'OPERATIONS_ENGINEER', label: 'Operations Engineer', description: 'Manages deployments, organization states, and break-glass ops' },
  { value: 'SUPPORT_ENGINEER', label: 'Support Engineer', description: 'Customer support operations and break-glass requests' },
  { value: 'SECURITY_AUDIT', label: 'Security & Audit', description: 'Security audit, audit log review, and operator oversight' },
  { value: 'READ_ONLY_AUDITOR', label: 'Read-Only Auditor', description: 'Read-only access to control plane telemetry and audit logs' },
];

export default function OperatorsPage() {
  const { operator, isAuthenticated, isLoading: isAuthLoading } = useAuth();

  const [operators, setOperators] = useState<OperatorProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<ControlPlaneApiError | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'SUSPENDED'>('ALL');

  // Add Operator Modal
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [addForm, setAddForm] = useState({
    email: '',
    fullName: '',
    password: '',
    role: 'OPERATIONS_ENGINEER' as OperatorRoleType,
  });
  const [isSubmittingAdd, setIsSubmittingAdd] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  // Change Role Modal
  const [roleModalOperator, setRoleModalOperator] = useState<OperatorProfile | null>(null);
  const [selectedNewRole, setSelectedNewRole] = useState<OperatorRoleType>('OPERATIONS_ENGINEER');
  const [isSubmittingRole, setIsSubmittingRole] = useState(false);
  const [roleError, setRoleError] = useState<string | null>(null);

  // Suspend / Reactivate / Revoke Dialogs
  const [confirmTarget, setConfirmTarget] = useState<{
    operator: OperatorProfile;
    action: 'SUSPEND' | 'REACTIVATE' | 'REVOKE_SESSIONS';
  } | null>(null);
  const [isSubmittingConfirm, setIsSubmittingConfirm] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  const isViewPermitted =
    operator?.role === 'PLATFORM_SUPER_ADMIN' ||
    operator?.role === 'SECURITY_AUDIT' ||
    operator?.role === 'READ_ONLY_AUDITOR';

  const canCreateOrManage =
    operator?.role === 'PLATFORM_SUPER_ADMIN' ||
    operator?.role === 'SECURITY_AUDIT';

  const fetchOperators = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await controlPlaneApi.listOperators();
      setOperators(data || []);
    } catch (err: any) {
      if (err instanceof ControlPlaneApiError) {
        setError(err);
      } else {
        setError(new ControlPlaneApiError(500, err.message || 'Failed to load operators'));
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated && isViewPermitted) {
      fetchOperators();
    }
  }, [isAuthenticated, isViewPermitted, fetchOperators]);

  if (isAuthLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <RefreshCw className="h-8 w-8 animate-spin text-aravBlue-500" />
      </div>
    );
  }

  if (!isViewPermitted) {
    return (
      <AccessDenied
        requiredRoles={['PLATFORM_SUPER_ADMIN', 'SECURITY_AUDIT', 'READ_ONLY_AUDITOR']}
        message="Only authorized Control Plane Administrators and Security Auditors may manage operators."
      />
    );
  }

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddError(null);

    if (!addForm.email.trim() || !addForm.fullName.trim() || !addForm.password.trim()) {
      setAddError('All fields (Email, Full Name, Password) are required.');
      return;
    }

    if (addForm.password.length < 10) {
      setAddError('Operator password must be at least 10 characters long.');
      return;
    }

    setIsSubmittingAdd(true);
    try {
      const newOp = await controlPlaneApi.createOperator({
        email: addForm.email.trim(),
        fullName: addForm.fullName.trim(),
        password: addForm.password,
        role: addForm.role,
      });

      setActionSuccess(`Operator ${newOp.email} successfully created with role ${newOp.role}.`);
      setIsAddModalOpen(false);
      setAddForm({
        email: '',
        fullName: '',
        password: '',
        role: 'OPERATIONS_ENGINEER',
      });
      fetchOperators();
    } catch (err: any) {
      setAddError(err.message || 'Failed to create operator');
    } finally {
      setIsSubmittingAdd(false);
    }
  };

  const handleRoleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!roleModalOperator) return;

    setRoleError(null);
    setIsSubmittingRole(true);
    try {
      const updated = await controlPlaneApi.updateOperatorRole(roleModalOperator.id, {
        role: selectedNewRole,
      });

      setActionSuccess(`Role for operator ${updated.email} updated to ${updated.role}.`);
      setRoleModalOperator(null);
      fetchOperators();
    } catch (err: any) {
      setRoleError(err.message || 'Failed to update operator role');
    } finally {
      setIsSubmittingRole(false);
    }
  };

  const handleConfirmAction = async () => {
    if (!confirmTarget) return;
    setConfirmError(null);
    setIsSubmittingConfirm(true);

    try {
      if (confirmTarget.action === 'SUSPEND') {
        const res = await controlPlaneApi.suspendOperator(confirmTarget.operator.id);
        setActionSuccess(`Operator ${res.email} suspended. All active sessions were revoked.`);
      } else if (confirmTarget.action === 'REACTIVATE') {
        const res = await controlPlaneApi.reactivateOperator(confirmTarget.operator.id);
        setActionSuccess(`Operator ${res.email} reactivated.`);
      } else if (confirmTarget.action === 'REVOKE_SESSIONS') {
        const res = await controlPlaneApi.revokeOperatorSessions(confirmTarget.operator.id);
        setActionSuccess(`Revoked ${res.revokedSessionsCount} session(s) for operator ${confirmTarget.operator.email}.`);
      }

      setConfirmTarget(null);
      fetchOperators();
    } catch (err: any) {
      setConfirmError(err.message || 'Action failed');
    } finally {
      setIsSubmittingConfirm(false);
    }
  };

  const filteredOperators = operators.filter((op) => {
    const matchesSearch =
      op.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      op.fullName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      op.role.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus =
      statusFilter === 'ALL' || op.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-cpDark-800 pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-3">
            <Users className="h-7 w-7 text-aravBlue-400" />
            Control Plane Operators
          </h1>
          <p className="mt-1 text-sm text-gray-400">
            Manage administrative operator identities, RBAC roles, and access control across the Control Plane.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={fetchOperators}
            disabled={isLoading}
            className="flex items-center gap-2 rounded-md border border-cpDark-700 bg-cpDark-900 px-3 py-2 text-xs font-medium text-gray-300 hover:bg-cpDark-800 hover:text-white transition-colors"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </button>

          {canCreateOrManage && (
            <button
              onClick={() => {
                setAddError(null);
                setIsAddModalOpen(true);
              }}
              className="flex items-center gap-2 rounded-md bg-aravBlue-600 px-4 py-2 text-xs font-semibold text-white shadow hover:bg-aravBlue-500 transition-colors"
            >
              <UserPlus className="h-4 w-4" />
              Add Operator
            </button>
          )}
        </div>
      </div>

      {/* Success Notification Banner */}
      {actionSuccess && (
        <div className="flex items-center justify-between rounded-lg border border-emerald-500/30 bg-emerald-950/40 p-4 text-emerald-300 text-xs">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0" />
            <span>{actionSuccess}</span>
          </div>
          <button
            onClick={() => setActionSuccess(null)}
            className="text-emerald-400 hover:text-emerald-200 text-xs underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Error state */}
      {error && (
        <ErrorState
          statusCode={error.statusCode}
          message={error.message}
          correlationId={error.correlationId}
          onRetry={fetchOperators}
        />
      )}

      {/* Filters and Controls */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search by email, name, or role..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-md border border-cpDark-800 bg-cpDark-950 py-2 left-9 pl-9 pr-4 text-xs text-white placeholder-gray-500 focus:border-aravBlue-500 focus:outline-none"
          />
        </div>

        <div className="flex items-center gap-2">
          {(['ALL', 'ACTIVE', 'SUSPENDED'] as const).map((status) => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                statusFilter === status
                  ? 'bg-aravBlue-900/60 text-white border border-aravBlue-600'
                  : 'bg-cpDark-900 text-gray-400 hover:text-white border border-cpDark-800'
              }`}
            >
              {status}
            </button>
          ))}
        </div>
      </div>

      {/* Operators Table */}
      <div className="overflow-hidden rounded-lg border border-cpDark-800 bg-cpDark-950 shadow">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-gray-300">
            <thead className="border-b border-cpDark-800 bg-cpDark-900 text-[11px] uppercase tracking-wider text-gray-400">
              <tr>
                <th className="px-4 py-3">Operator</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">MFA</th>
                <th className="px-4 py-3">Provisioned</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-cpDark-800/60">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-gray-400">
                    <RefreshCw className="mx-auto h-6 w-6 animate-spin text-aravBlue-500 mb-2" />
                    Loading Control Plane operators...
                  </td>
                </tr>
              ) : filteredOperators.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-gray-400">
                    No operators found matching the filters.
                  </td>
                </tr>
              ) : (
                filteredOperators.map((op) => {
                  const isCurrentSelf = op.id === operator?.id;
                  const isSuperAdminRole = op.role === 'PLATFORM_SUPER_ADMIN';

                  return (
                    <tr key={op.id} className="hover:bg-cpDark-900/50 transition-colors">
                      <td className="px-4 py-3 font-medium text-white">
                        <div className="flex items-center gap-3">
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-aravBlue-950 border border-aravBlue-800 text-aravBlue-300 font-bold text-xs">
                            {op.fullName.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-white">{op.fullName}</span>
                              {isCurrentSelf && (
                                <span className="rounded bg-aravBlue-900/80 px-1.5 py-0.5 text-[10px] text-aravBlue-300 font-mono">
                                  You
                                </span>
                              )}
                            </div>
                            <div className="font-mono text-[11px] text-gray-400">{op.email}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium ${
                          isSuperAdminRole
                            ? 'bg-purple-950 text-purple-300 border border-purple-800'
                            : 'bg-cpDark-900 text-gray-300 border border-cpDark-700'
                        }`}>
                          <Shield className="h-3 w-3" />
                          {op.role}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={op.status} />
                      </td>
                      <td className="px-4 py-3">
                        {op.mfaEnabled ? (
                          <span className="inline-flex items-center gap-1 text-emerald-400 text-[11px]">
                            <ShieldCheck className="h-3.5 w-3.5" /> Enforced
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-amber-400/80 text-[11px]">
                            <ShieldAlert className="h-3.5 w-3.5" /> Optional
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 font-mono text-[11px] text-gray-400">
                        {op.createdAt ? new Date(op.createdAt).toLocaleDateString() : 'N/A'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {canCreateOrManage && (
                            <>
                              <button
                                onClick={() => {
                                  setRoleModalOperator(op);
                                  setSelectedNewRole(op.role);
                                  setRoleError(null);
                                }}
                                disabled={isCurrentSelf} // Anti-self-escalation policy
                                title={isCurrentSelf ? "You cannot modify your own role" : "Change Role"}
                                className="rounded border border-cpDark-700 bg-cpDark-900 px-2.5 py-1 text-[11px] text-gray-300 hover:bg-cpDark-800 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed"
                              >
                                Change Role
                              </button>

                              {op.status === 'ACTIVE' ? (
                                <button
                                  onClick={() => {
                                    setConfirmTarget({ operator: op, action: 'SUSPEND' });
                                    setConfirmError(null);
                                  }}
                                  disabled={isCurrentSelf}
                                  title={isCurrentSelf ? "You cannot suspend yourself" : "Suspend Operator"}
                                  className="rounded border border-red-900/60 bg-red-950/40 px-2.5 py-1 text-[11px] text-red-300 hover:bg-red-900/60 disabled:opacity-40 disabled:cursor-not-allowed"
                                >
                                  Suspend
                                </button>
                              ) : (
                                <button
                                  onClick={() => {
                                    setConfirmTarget({ operator: op, action: 'REACTIVATE' });
                                    setConfirmError(null);
                                  }}
                                  className="rounded border border-emerald-900/60 bg-emerald-950/40 px-2.5 py-1 text-[11px] text-emerald-300 hover:bg-emerald-900/60"
                                >
                                  Reactivate
                                </button>
                              )}

                              <button
                                onClick={() => {
                                  setConfirmTarget({ operator: op, action: 'REVOKE_SESSIONS' });
                                  setConfirmError(null);
                                }}
                                title="Revoke Sessions"
                                className="rounded border border-amber-900/60 bg-amber-950/30 p-1 text-amber-400 hover:bg-amber-900/50"
                              >
                                <LogOut className="h-3.5 w-3.5" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Operator Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg rounded-lg border border-cpDark-800 bg-cpDark-950 p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-cpDark-800 pb-3">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <UserPlus className="h-5 w-5 text-aravBlue-400" />
                Add New Control Plane Operator
              </h2>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="text-gray-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            {addError && (
              <div className="rounded border border-red-500/30 bg-red-950/50 p-3 text-xs text-red-300 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-red-400 shrink-0" />
                <span>{addError}</span>
              </div>
            )}

            <form onSubmit={handleAddSubmit} className="space-y-4 text-xs">
              <div>
                <label className="block font-medium text-gray-300 mb-1">
                  Operator Email Address <span className="text-red-400">*</span>
                </label>
                <input
                  type="email"
                  required
                  placeholder="operator@omnigrc.co"
                  value={addForm.email}
                  onChange={(e) => setAddForm({ ...addForm, email: e.target.value })}
                  className="w-full rounded border border-cpDark-700 bg-cpDark-900 px-3 py-2 text-white placeholder-gray-500 focus:border-aravBlue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-medium text-gray-300 mb-1">
                  Full Name <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="First & Last Name"
                  value={addForm.fullName}
                  onChange={(e) => setAddForm({ ...addForm, fullName: e.target.value })}
                  className="w-full rounded border border-cpDark-700 bg-cpDark-900 px-3 py-2 text-white placeholder-gray-500 focus:border-aravBlue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-medium text-gray-300 mb-1">
                  Initial Password <span className="text-red-400">*</span> (min 10 chars)
                </label>
                <input
                  type="password"
                  required
                  placeholder="••••••••••••"
                  value={addForm.password}
                  onChange={(e) => setAddForm({ ...addForm, password: e.target.value })}
                  className="w-full rounded border border-cpDark-700 bg-cpDark-900 px-3 py-2 text-white focus:border-aravBlue-500 focus:outline-none font-mono"
                />
              </div>

              <div>
                <label className="block font-medium text-gray-300 mb-1">
                  Operator Role <span className="text-red-400">*</span>
                </label>
                <select
                  value={addForm.role}
                  onChange={(e) => setAddForm({ ...addForm, role: e.target.value as OperatorRoleType })}
                  className="w-full rounded border border-cpDark-700 bg-cpDark-900 px-3 py-2 text-white focus:border-aravBlue-500 focus:outline-none"
                >
                  {OPERATOR_ROLES.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label} — {r.description}
                    </option>
                  ))}
                </select>
              </div>

              <div className="rounded border border-cpDark-800 bg-cpDark-900/60 p-3 text-[11px] text-gray-400">
                <p className="font-semibold text-gray-300 mb-1">Internal Provisioning Rule:</p>
                <p>Email verification is not required for this internal operator release phase. Every operator creation event is immutably logged to Control Plane Audit Logs.</p>
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-cpDark-800">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="rounded border border-cpDark-700 bg-cpDark-900 px-4 py-2 text-gray-300 hover:bg-cpDark-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingAdd}
                  className="flex items-center gap-2 rounded bg-aravBlue-600 px-4 py-2 font-semibold text-white hover:bg-aravBlue-500 disabled:opacity-50"
                >
                  {isSubmittingAdd && <RefreshCw className="h-4 w-4 animate-spin" />}
                  Create Operator
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Change Role Modal */}
      {roleModalOperator && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-lg border border-cpDark-800 bg-cpDark-950 p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-cpDark-800 pb-3">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Key className="h-5 w-5 text-aravBlue-400" />
                Change Operator Role
              </h2>
              <button onClick={() => setRoleModalOperator(null)} className="text-gray-400 hover:text-white">
                ✕
              </button>
            </div>

            {roleError && (
              <div className="rounded border border-red-500/30 bg-red-950/50 p-3 text-xs text-red-300">
                {roleError}
              </div>
            )}

            <div className="text-xs text-gray-300">
              Target Operator: <span className="font-semibold text-white">{roleModalOperator.email}</span>
            </div>

            <form onSubmit={handleRoleSubmit} className="space-y-4 text-xs">
              <div>
                <label className="block font-medium text-gray-300 mb-1">Select New Role</label>
                <select
                  value={selectedNewRole}
                  onChange={(e) => setSelectedNewRole(e.target.value as OperatorRoleType)}
                  className="w-full rounded border border-cpDark-700 bg-cpDark-900 px-3 py-2 text-white focus:border-aravBlue-500 focus:outline-none"
                >
                  {OPERATOR_ROLES.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-cpDark-800">
                <button
                  type="button"
                  onClick={() => setRoleModalOperator(null)}
                  className="rounded border border-cpDark-700 bg-cpDark-900 px-4 py-2 text-gray-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingRole}
                  className="rounded bg-aravBlue-600 px-4 py-2 font-semibold text-white hover:bg-aravBlue-500 disabled:opacity-50"
                >
                  {isSubmittingRole ? 'Updating...' : 'Update Role'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirmation Dialog for Suspend / Reactivate / Revoke */}
      {confirmTarget && (
        <ConfirmationDialog
          isOpen={true}
          title={`${confirmTarget.action.replace('_', ' ')} Operator`}
          explanation={`Are you sure you want to ${confirmTarget.action.toLowerCase()} operator "${confirmTarget.operator.email}" (${confirmTarget.operator.fullName})?`}
          confirmButtonText={confirmTarget.action}
          confirmVariant={confirmTarget.action === 'SUSPEND' ? 'danger' : 'warning'}
          onConfirm={handleConfirmAction}
          onCancel={() => setConfirmTarget(null)}
          isLoading={isSubmittingConfirm}
          errorMessage={confirmError}
        />
      )}
    </div>
  );
}
