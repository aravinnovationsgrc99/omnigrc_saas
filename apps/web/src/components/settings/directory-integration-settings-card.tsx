'use client';

import React, { useState, useEffect } from 'react';
import {
  Shield,
  Layers,
  Key,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Lock,
  Eye,
  EyeOff,
  Users,
  Plus,
  Trash2,
  Clock,
  ExternalLink,
  ShieldAlert,
  Server,
  Zap,
  X,
} from 'lucide-react';
import { apiRequest } from '@/lib/api-client';
import {
  DirectoryIntegrationConfigDto,
  DirectoryGroupMappingDto,
  DirectoryTestConnectionResultDto,
  DirectorySyncLogDto,
  PaginatedDirectorySyncLogsDto,
  Role,
  DirectoryProvider,
  DirectorySyncSchedule,
} from '@omnigrc/shared';
import { useToast } from '@/context/toast-context';
import { useAuth } from '@/context/auth-context';

export function DirectoryIntegrationSettingsCard() {
  const { addToast } = useToast();
  const { user } = useAuth();
  const isAdmin = user?.role === Role.ADMIN || user?.role === Role.MSSP_ADMIN;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [syncing, setSyncing] = useState(false);

  // Configuration state
  const [config, setConfig] = useState<DirectoryIntegrationConfigDto | null>(null);
  const [tenantId, setTenantId] = useState('');
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [showSecret, setShowSecret] = useState(false);
  const [domain, setDomain] = useState('');
  const [enabled, setEnabled] = useState(false);
  const [defaultRole, setDefaultRole] = useState<Role>(Role.ANALYST);
  const [syncSchedule, setSyncSchedule] = useState<DirectorySyncSchedule>(DirectorySyncSchedule.MANUAL);
  const [autoDeactivate, setAutoDeactivate] = useState(true);
  const [deactThreshold, setDeactThreshold] = useState(20);

  // Diagnostics state
  const [testResult, setTestResult] = useState<DirectoryTestConnectionResultDto | null>(null);

  // Group mappings state
  const [groupMappings, setGroupMappings] = useState<DirectoryGroupMappingDto[]>([]);
  const [showAddMappingModal, setShowAddMappingModal] = useState(false);
  const [newGroupId, setNewGroupId] = useState('');
  const [newGroupName, setNewGroupName] = useState('');
  const [newTargetRole, setNewTargetRole] = useState<Role>(Role.ANALYST);
  const [newPriority, setNewPriority] = useState(100);
  const [savingMapping, setSavingMapping] = useState(false);

  // Sync logs modal state
  const [showLogsModal, setShowLogsModal] = useState(false);
  const [syncLogs, setSyncLogs] = useState<DirectorySyncLogDto[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [selectedLog, setSelectedLog] = useState<DirectorySyncLogDto | null>(null);

  useEffect(() => {
    fetchConfig();
  }, []);

  async function fetchConfig() {
    setLoading(true);
    try {
      const data = await apiRequest<DirectoryIntegrationConfigDto | null>('/directory/config');
      if (data) {
        setConfig(data);
        setTenantId(data.tenantId || '');
        setClientId(data.clientId || '');
        setDomain(data.domain || '');
        setEnabled(data.enabled);
        setDefaultRole(data.defaultRole);
        setSyncSchedule(data.syncSchedule);
        setAutoDeactivate(data.autoDeactivateUsers);
        setDeactThreshold(data.deactivationThresholdPct);
        setGroupMappings(data.groupMappings || []);
      } else {
        setConfig(null);
      }
    } catch (err: any) {
      // Gracefully treat 404 or unconfigured endpoints as Not Configured without throwing intrusive error alerts
      if (
        err.statusCode === 404 ||
        err.status === 404 ||
        err.message?.includes('Cannot GET /directory/config') ||
        err.message?.includes('Not Found')
      ) {
        setConfig(null);
      } else {
        addToast(err.message || 'Failed to load directory configuration.', 'error');
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveConfig(e: React.FormEvent) {
    e.preventDefault();
    if (!isAdmin) {
      addToast('Only administrators can modify directory integration settings.', 'error');
      return;
    }
    if (!tenantId?.trim() || !clientId?.trim()) {
      addToast('Tenant ID and Client ID are required.', 'error');
      return;
    }

    setSaving(true);
    try {
      const payload: any = {
        tenantId: tenantId.trim(),
        clientId: clientId.trim(),
        domain: domain.trim() || undefined,
        enabled,
        defaultRole,
        syncSchedule,
        autoDeactivateUsers: autoDeactivate,
        deactivationThresholdPct: Number(deactThreshold),
      };
      if (clientSecret.trim()) {
        payload.clientSecret = clientSecret.trim();
      }

      const updated = await apiRequest<DirectoryIntegrationConfigDto>('/directory/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      setConfig(updated);
      setGroupMappings(updated.groupMappings || []);
      setClientSecret('');
      addToast('Directory integration settings saved successfully.', 'success');
    } catch (err: any) {
      addToast(err.message || 'Failed to save configuration.', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleTestConnection() {
    if (!tenantId?.trim() || !clientId?.trim()) {
      addToast('Please provide Tenant ID and Client ID first.', 'error');
      return;
    }

    setTesting(true);
    setTestResult(null);
    try {
      const res = await apiRequest<DirectoryTestConnectionResultDto>('/directory/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId: tenantId.trim(),
          clientId: clientId.trim(),
          ...(clientSecret.trim() && { clientSecret: clientSecret.trim() }),
        }),
      });
      setTestResult(res);
      if (res.success) {
        addToast(res.message, 'success');
      } else {
        addToast(res.message, 'error');
      }
    } catch (err: any) {
      setTestResult({
        success: false,
        message: err.message || 'Test connection failed.',
        latencyMs: 0,
      });
      addToast(err.message || 'Connection test failed.', 'error');
    } finally {
      setTesting(false);
    }
  }

  async function handleAddGroupMapping(e: React.FormEvent) {
    e.preventDefault();
    if (!newGroupId.trim() || !newGroupName.trim()) {
      addToast('Directory Group ID and Name are required.', 'error');
      return;
    }

    setSavingMapping(true);
    try {
      const mapping = await apiRequest<DirectoryGroupMappingDto>('/directory/group-mappings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          directoryGroupId: newGroupId.trim(),
          directoryGroupName: newGroupName.trim(),
          targetRole: newTargetRole,
          priority: Number(newPriority),
        }),
      });

      setGroupMappings((prev) => {
        const filtered = prev.filter((m) => m.directoryGroupId !== mapping.directoryGroupId);
        return [...filtered, mapping].sort((a, b) => a.priority - b.priority);
      });

      setShowAddMappingModal(false);
      setNewGroupId('');
      setNewGroupName('');
      setNewTargetRole(Role.ANALYST);
      setNewPriority(100);
      addToast(`Mapped group "${mapping.directoryGroupName}" to ${mapping.targetRole}.`, 'success');
    } catch (err: any) {
      addToast(err.message || 'Failed to save group mapping.', 'error');
    } finally {
      setSavingMapping(false);
    }
  }

  async function handleDeleteGroupMapping(id: string) {
    try {
      await apiRequest(`/directory/group-mappings/${id}`, { method: 'DELETE' });
      setGroupMappings((prev) => prev.filter((m) => m.id !== id));
      addToast('Group mapping removed.', 'success');
    } catch (err: any) {
      addToast(err.message || 'Failed to delete group mapping.', 'error');
    }
  }

  async function handleTriggerSync() {
    setSyncing(true);
    try {
      const log = await apiRequest<DirectorySyncLogDto>('/directory/sync', {
        method: 'POST',
      });
      addToast(
        `Directory synchronized: ${log.createdCount} created, ${log.updatedCount} updated, ${log.deactivatedCount} deactivated.`,
        log.status === 'SUCCESS' ? 'success' : 'info',
      );
      fetchConfig();
    } catch (err: any) {
      addToast(err.message || 'Directory sync failed.', 'error');
    } finally {
      setSyncing(false);
    }
  }

  async function handleOpenLogs() {
    setShowLogsModal(true);
    setLoadingLogs(true);
    try {
      const data = await apiRequest<PaginatedDirectorySyncLogsDto>('/directory/sync-logs');
      setSyncLogs(data.items || []);
    } catch (err: any) {
      addToast(err.message || 'Failed to load sync logs.', 'error');
    } finally {
      setLoadingLogs(false);
    }
  }

  if (loading) {
    return (
      <div className="omni-card p-6 animate-pulse space-y-4">
        <div className="h-5 bg-slate-200 rounded w-1/3"></div>
        <div className="h-4 bg-slate-100 rounded w-2/3"></div>
        <div className="h-24 bg-slate-100 rounded"></div>
      </div>
    );
  }

  return (
    <div className="omni-card p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-blue-100 text-blue-800 rounded-xl">
            <Server className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-slate-900">Microsoft Entra ID / Active Directory Integration</h2>
              {config?.enabled ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800">
                  <CheckCircle2 className="w-3 h-3" /> Active
                </span>
              ) : (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-600">
                  Not Configured
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Automated user provisioning, stable object ID tracking, group-to-role assignment, and controlled account deactivation.
            </p>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2">
          {config?.enabled && (
            <>
              <button
                type="button"
                onClick={handleOpenLogs}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-lg shadow-xs transition"
              >
                <Clock className="w-3.5 h-3.5 text-slate-500" /> Sync Logs
              </button>
              <button
                type="button"
                disabled={syncing}
                onClick={handleTriggerSync}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold text-white bg-teal-700 hover:bg-teal-800 rounded-lg shadow-xs transition disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
                {syncing ? 'Syncing...' : 'Sync Now'}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Secret Security Banner */}
      <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-700 flex items-center gap-2.5">
        <Lock className="w-4 h-4 text-emerald-700 shrink-0" />
        <span>
          <strong className="text-slate-900">Zero-Plaintext Vault Storage:</strong> Entra ID application client secrets are encrypted at rest with authenticated AES-256-GCM and never returned over public APIs.
        </span>
      </div>

      {/* Configuration Form */}
      <form onSubmit={handleSaveConfig} className="space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Entra ID Tenant ID (Directory ID) *
            </label>
            <input
              type="text"
              required
              disabled={!isAdmin || saving}
              value={tenantId}
              onChange={(e) => setTenantId(e.target.value)}
              placeholder="e.g. 00000000-0000-0000-0000-000000000000"
              className="w-full text-xs font-mono px-3 py-2 rounded-lg border border-slate-300 focus:outline-hidden focus:ring-1 focus:ring-teal-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Application (Client) ID *
            </label>
            <input
              type="text"
              required
              disabled={!isAdmin || saving}
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              placeholder="e.g. 11111111-1111-1111-1111-111111111111"
              className="w-full text-xs font-mono px-3 py-2 rounded-lg border border-slate-300 focus:outline-hidden focus:ring-1 focus:ring-teal-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Application Client Secret {config ? '(Leave blank to retain current secret)' : '*'}
            </label>
            <div className="relative">
              <input
                type={showSecret ? 'text' : 'password'}
                disabled={!isAdmin || saving}
                value={clientSecret}
                onChange={(e) => setClientSecret(e.target.value)}
                placeholder={config?.clientSecretMasked || 'Enter Entra ID client secret'}
                className="w-full text-xs font-mono px-3 py-2 pr-9 rounded-lg border border-slate-300 focus:outline-hidden focus:ring-1 focus:ring-teal-500"
              />
              <button
                type="button"
                onClick={() => setShowSecret(!showSecret)}
                className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
              >
                {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Default Domain (Optional)
            </label>
            <input
              type="text"
              disabled={!isAdmin || saving}
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              placeholder="e.g. omnicorp.onmicrosoft.com"
              className="w-full text-xs px-3 py-2 rounded-lg border border-slate-300 focus:outline-hidden focus:ring-1 focus:ring-teal-500"
            />
          </div>
        </div>

        {/* Sync Settings */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 border-t border-slate-100">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Default Fallback Role
            </label>
            <select
              value={defaultRole}
              onChange={(e) => setDefaultRole(e.target.value as Role)}
              disabled={!isAdmin || saving}
              className="w-full text-xs px-3 py-2 rounded-lg border border-slate-300 bg-white focus:outline-hidden focus:ring-1 focus:ring-teal-500"
            >
              <option value={Role.ANALYST}>ANALYST (Standard User)</option>
              <option value={Role.EXTERNAL_AUDITOR}>EXTERNAL_AUDITOR (Read-Only)</option>
              <option value={Role.MSSP_ANALYST}>MSSP_ANALYST (Managed Analyst)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Sync Schedule
            </label>
            <select
              value={syncSchedule}
              onChange={(e) => setSyncSchedule(e.target.value as DirectorySyncSchedule)}
              disabled={!isAdmin || saving}
              className="w-full text-xs px-3 py-2 rounded-lg border border-slate-300 bg-white focus:outline-hidden focus:ring-1 focus:ring-teal-500"
            >
              <option value={DirectorySyncSchedule.MANUAL}>Manual Trigger Only</option>
              <option value={DirectorySyncSchedule.HOURLY}>Hourly Periodic Sync</option>
              <option value={DirectorySyncSchedule.DAILY}>Daily Periodic Sync</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Deactivation Circuit Breaker (%)
            </label>
            <input
              type="number"
              min="5"
              max="100"
              value={deactThreshold}
              onChange={(e) => setDeactThreshold(Number(e.target.value))}
              disabled={!isAdmin || saving}
              className="w-full text-xs px-3 py-2 rounded-lg border border-slate-300 focus:outline-hidden focus:ring-1 focus:ring-teal-500"
            />
            <span className="text-[10px] text-slate-400 mt-0.5 block">
              Halts sync if &gt;{deactThreshold}% accounts deleted at once.
            </span>
          </div>
        </div>

        {/* Toggles */}
        <div className="flex flex-wrap items-center gap-6 pt-2">
          <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-800">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              disabled={!isAdmin || saving}
              className="rounded text-teal-600 focus:ring-teal-500"
            />
            Enable Active Directory Integration
          </label>

          <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-800">
            <input
              type="checkbox"
              checked={autoDeactivate}
              onChange={(e) => setAutoDeactivate(e.target.checked)}
              disabled={!isAdmin || saving}
              className="rounded text-teal-600 focus:ring-teal-500"
            />
            Controlled Deactivation (Suspend accounts disabled in Entra ID)
          </label>
        </div>

        {/* Diagnostic Result Banner */}
        {testResult && (
          <div
            className={`p-3.5 rounded-lg border text-xs flex items-start gap-2.5 ${
              testResult.success
                ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                : 'bg-rose-50 border-rose-200 text-rose-900'
            }`}
          >
            {testResult.success ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-rose-700 shrink-0 mt-0.5" />
            )}
            <div className="space-y-1">
              <span className="font-bold">{testResult.message}</span>
              {testResult.tenantDetails && (
                <div className="text-[11px] text-emerald-800">
                  Tenant: {testResult.tenantDetails.displayName} ({testResult.tenantDetails.defaultDomainName}) • {testResult.discoveredUsersCount} users, {testResult.discoveredGroupsCount} groups discovered • Latency: {testResult.latencyMs}ms
                </div>
              )}
            </div>
          </div>
        )}

        {/* Form Action Buttons */}
        {isAdmin && (
          <div className="flex items-center justify-between pt-3 border-t border-slate-200">
            <button
              type="button"
              disabled={testing || saving || !tenantId?.trim() || !clientId?.trim()}
              onClick={handleTestConnection}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-lg shadow-xs transition disabled:opacity-50"
            >
              <Zap className={`w-3.5 h-3.5 ${testing ? 'animate-spin text-teal-600' : 'text-amber-600'}`} />
              {testing ? 'Testing Diagnostics...' : 'Test Connection'}
            </button>

            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-teal-700 hover:bg-teal-800 rounded-lg shadow-xs transition disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save Configuration'}
            </button>
          </div>
        )}
      </form>

      {/* Group-to-Role Mapping Section */}
      <div className="pt-6 border-t border-slate-200 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Users className="w-4 h-4 text-teal-700" /> Entra ID Group-to-Role Mappings
            </h3>
            <p className="text-xs text-slate-500">
              Users belonging to these Entra groups are automatically assigned corresponding OMNiGRC roles.
            </p>
          </div>
          {isAdmin && (
            <button
              type="button"
              onClick={() => setShowAddMappingModal(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-teal-800 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-lg transition"
            >
              <Plus className="w-3.5 h-3.5" /> Add Group Mapping
            </button>
          )}
        </div>

        {groupMappings.length === 0 ? (
          <div className="py-6 text-center text-xs text-slate-400 border border-dashed border-slate-200 rounded-lg bg-slate-50/50">
            No group-to-role mappings defined. Discovered users will be provisioned with the fallback role ({defaultRole}).
          </div>
        ) : (
          <div className="border border-slate-200 rounded-lg overflow-hidden">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-100 text-slate-600 font-semibold border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-3">Priority</th>
                  <th className="py-2.5 px-3">Entra Group Name</th>
                  <th className="py-2.5 px-3">Directory Group ID (OID)</th>
                  <th className="py-2.5 px-3">Assigned Role</th>
                  {isAdmin && <th className="py-2.5 px-3 text-right">Action</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white">
                {groupMappings.map((m) => (
                  <tr key={m.id} className="hover:bg-slate-50 transition">
                    <td className="py-2.5 px-3 font-mono text-slate-500">{m.priority}</td>
                    <td className="py-2.5 px-3 font-semibold text-slate-800">{m.directoryGroupName}</td>
                    <td className="py-2.5 px-3 font-mono text-slate-500 text-[11px]">{m.directoryGroupId}</td>
                    <td className="py-2.5 px-3">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          m.targetRole === Role.ADMIN || m.targetRole === Role.MSSP_ADMIN
                            ? 'bg-rose-100 text-rose-800 border border-rose-200'
                            : 'bg-blue-50 text-blue-800 border border-blue-200'
                        }`}
                      >
                        {m.targetRole}
                      </span>
                    </td>
                    {isAdmin && (
                      <td className="py-2.5 px-3 text-right">
                        <button
                          type="button"
                          onClick={() => handleDeleteGroupMapping(m.id)}
                          className="text-slate-400 hover:text-rose-600 p-1 rounded hover:bg-slate-100 transition"
                          title="Delete Mapping"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add Group Mapping Modal */}
      {showAddMappingModal && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 bg-slate-50">
              <h3 className="text-sm font-bold text-slate-900">Map Entra Group to Role</h3>
              <button
                onClick={() => setShowAddMappingModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddGroupMapping} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Directory Group Object ID (GUID) *
                </label>
                <input
                  type="text"
                  required
                  value={newGroupId}
                  onChange={(e) => setNewGroupId(e.target.value)}
                  placeholder="e.g. entra-grp-sec-admins or GUID"
                  className="w-full text-xs font-mono px-3 py-2 rounded-lg border border-slate-300 focus:outline-hidden focus:ring-1 focus:ring-teal-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Group Display Name *
                </label>
                <input
                  type="text"
                  required
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  placeholder="e.g. Entra Security Administrators"
                  className="w-full text-xs px-3 py-2 rounded-lg border border-slate-300 focus:outline-hidden focus:ring-1 focus:ring-teal-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Target OMNiGRC Role *
                </label>
                <select
                  value={newTargetRole}
                  onChange={(e) => setNewTargetRole(e.target.value as Role)}
                  className="w-full text-xs px-3 py-2 rounded-lg border border-slate-300 bg-white focus:outline-hidden focus:ring-1 focus:ring-teal-500"
                >
                  <option value={Role.ANALYST}>ANALYST (Standard User)</option>
                  <option value={Role.EXTERNAL_AUDITOR}>EXTERNAL_AUDITOR (Read-Only)</option>
                  <option value={Role.ADMIN}>ADMIN (Full Organization Administrator)</option>
                  <option value={Role.MSSP_ANALYST}>MSSP_ANALYST (Managed Analyst)</option>
                  <option value={Role.MSSP_ADMIN}>MSSP_ADMIN (Platform Administrator)</option>
                </select>
              </div>

              {/* Security Warning on ADMIN target role */}
              {(newTargetRole === Role.ADMIN || newTargetRole === Role.MSSP_ADMIN) && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-900 flex items-start gap-2">
                  <ShieldAlert className="w-4 h-4 text-rose-700 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold">Privilege Escalation Warning:</span> Users synced from this directory group will receive full administrative access to your tenant.
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Priority (Lower number = Higher priority)
                </label>
                <input
                  type="number"
                  min="1"
                  max="1000"
                  value={newPriority}
                  onChange={(e) => setNewPriority(Number(e.target.value))}
                  className="w-full text-xs px-3 py-2 rounded-lg border border-slate-300 focus:outline-hidden focus:ring-1 focus:ring-teal-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowAddMappingModal(false)}
                  className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingMapping}
                  className="px-4 py-1.5 text-xs font-bold text-white bg-teal-700 hover:bg-teal-800 rounded-lg shadow-xs"
                >
                  {savingMapping ? 'Saving...' : 'Add Mapping'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Sync Logs Modal */}
      {showLogsModal && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
              <div className="flex items-center gap-2.5">
                <Clock className="w-5 h-5 text-teal-700" />
                <h3 className="text-base font-bold text-slate-900">Active Directory Sync Execution Logs</h3>
              </div>
              <button
                onClick={() => setShowLogsModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {loadingLogs ? (
                <div className="py-12 text-center text-xs text-slate-500 flex flex-col items-center gap-2">
                  <RefreshCw className="w-5 h-5 animate-spin text-teal-700" />
                  Loading synchronization logs...
                </div>
              ) : syncLogs.length === 0 ? (
                <div className="py-12 text-center text-xs text-slate-400">
                  No directory synchronization events recorded yet.
                </div>
              ) : (
                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-slate-100 text-slate-600 font-semibold border-b border-slate-200">
                      <tr>
                        <th className="py-2.5 px-3">Started</th>
                        <th className="py-2.5 px-3">Type</th>
                        <th className="py-2.5 px-3 text-center">Discovered</th>
                        <th className="py-2.5 px-3 text-center">Created</th>
                        <th className="py-2.5 px-3 text-center">Updated</th>
                        <th className="py-2.5 px-3 text-center">Deactivated</th>
                        <th className="py-2.5 px-3 text-center">Errors</th>
                        <th className="py-2.5 px-3">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 bg-white">
                      {syncLogs.map((l) => (
                        <tr
                          key={l.id}
                          onClick={() => setSelectedLog(l)}
                          className="hover:bg-slate-50 cursor-pointer transition"
                        >
                          <td className="py-2.5 px-3 font-mono text-slate-500">
                            {new Date(l.startedAt).toLocaleDateString()}{' '}
                            {new Date(l.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </td>
                          <td className="py-2.5 px-3 font-semibold text-slate-800">{l.syncType}</td>
                          <td className="py-2.5 px-3 text-center font-mono">{l.discoveredCount}</td>
                          <td className="py-2.5 px-3 text-center font-mono text-emerald-700 font-bold">{l.createdCount}</td>
                          <td className="py-2.5 px-3 text-center font-mono text-blue-700 font-bold">{l.updatedCount}</td>
                          <td className="py-2.5 px-3 text-center font-mono text-amber-700 font-bold">{l.deactivatedCount}</td>
                          <td className="py-2.5 px-3 text-center font-mono text-rose-700 font-bold">{l.errorCount}</td>
                          <td className="py-2.5 px-3">
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                l.status === 'SUCCESS'
                                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                                  : l.status === 'PARTIAL'
                                  ? 'bg-amber-50 text-amber-800 border border-amber-200'
                                  : 'bg-rose-50 text-rose-800 border border-rose-200'
                              }`}
                            >
                              {l.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {selectedLog && (
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2 mt-4 text-xs">
                  <div className="flex items-center justify-between font-bold text-slate-800">
                    <span>Log Detail: {selectedLog.id}</span>
                    <button onClick={() => setSelectedLog(null)} className="text-slate-400 hover:text-slate-600">
                      Close Detail
                    </button>
                  </div>
                  {selectedLog.errorMessage && (
                    <div className="p-2.5 bg-rose-50 border border-rose-200 rounded text-rose-900 font-medium">
                      {selectedLog.errorMessage}
                    </div>
                  )}
                  {selectedLog.errorDetails && Array.isArray(selectedLog.errorDetails) && (
                    <div className="space-y-1 max-h-32 overflow-y-auto">
                      {selectedLog.errorDetails.map((e: any, i: number) => (
                        <div key={i} className="text-rose-800">
                          {e.email || e.userId}: {e.error}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="px-6 py-3 border-t border-slate-200 bg-slate-50 flex justify-end">
              <button
                onClick={() => setShowLogsModal(false)}
                className="px-4 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 rounded-lg shadow-xs"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
