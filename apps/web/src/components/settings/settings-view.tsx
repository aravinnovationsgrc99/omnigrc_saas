'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/context/auth-context';
import { useToast } from '@/context/toast-context';
import { apiRequest } from '@/lib/api-client';
import { RegionalPodDto, PodStatus, Role } from '@omnigrc/shared';
import { Globe2, ShieldAlert, CheckCircle2, Lock, AlertTriangle, Send, Mail, Link, Layers, Check } from 'lucide-react';
import { SkeletonLine } from '@/components/ui/skeleton';
import { InlineErrorState } from '@/components/ui/inline-error-state';

export function SettingsView() {
  const { user, organization } = useAuth();
  const { addToast } = useToast();
  const [pods, setPods] = useState<RegionalPodDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [selectedPod, setSelectedPod] = useState<RegionalPodDto | null>(null);
  const [updating, setUpdating] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  // Email Notification Preference
  const [emailNotifs, setEmailNotifs] = useState(user?.emailNotifications ?? true);
  const [savingEmailPref, setSavingEmailPref] = useState(false);

  // Slack Integration state
  const [slackWebhook, setSlackWebhook] = useState('');
  const [slackConfigured, setSlackConfigured] = useState(false);
  const [savingSlack, setSavingSlack] = useState(false);
  const [testingSlack, setTestingSlack] = useState(false);

  const isAdmin = user?.role === Role.ADMIN;

  const fetchPods = async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const data = await apiRequest<RegionalPodDto[]>('/regional-pods');
      setPods(data);
    } catch {
      // Fallback default pods if backend is unreachable
      setPods([
        { id: '1', region: 'INDIA' as any, status: 'ACTIVE' as any, organizationId: '' },
        { id: '2', region: 'UK' as any, status: 'INACTIVE' as any, organizationId: '' },
        { id: '3', region: 'EU' as any, status: 'INACTIVE' as any, organizationId: '' },
        { id: '4', region: 'AUSTRALIA' as any, status: 'INACTIVE' as any, organizationId: '' },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const fetchSlackStatus = async () => {
    try {
      const res = await apiRequest<{ configured: boolean; webhookUrl: string | null }>('/integrations/slack');
      setSlackConfigured(res.configured);
      if (res.webhookUrl) setSlackWebhook(res.webhookUrl);
    } catch {
      // Ignore fallback
    }
  };

  useEffect(() => {
    fetchPods();
    fetchSlackStatus();
  }, []);

  const regionNameMap: Record<string, string> = {
    INDIA: 'India (ap-south-1)',
    UK: 'United Kingdom (eu-west-2)',
    EU: 'European Union (eu-central-1)',
    AUSTRALIA: 'Australia (ap-southeast-2)',
  };

  const handleToggleClick = (pod: RegionalPodDto) => {
    if (!isAdmin) return;
    setSelectedPod(pod);
    setModalError(null);
  };

  const handleConfirmToggle = async () => {
    if (!selectedPod) return;
    const nextStatus = selectedPod.status === PodStatus.ACTIVE ? PodStatus.INACTIVE : PodStatus.ACTIVE;
    setUpdating(true);
    setModalError(null);

    try {
      const updatedPod = await apiRequest<RegionalPodDto>(`/regional-pods/${selectedPod.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: nextStatus }),
      });

      setPods((prev) => prev.map((p) => (p.id === updatedPod.id ? updatedPod : p)));
      setSelectedPod(null);
      addToast(`Updated pod status for ${selectedPod.region} to ${nextStatus}`, 'success');
    } catch (err: any) {
      const errMsg = err.message || 'Failed to update regional pod status.';
      setModalError(errMsg);
      addToast(errMsg, 'error');
    } finally {
      setUpdating(false);
    }
  };

  const handleToggleEmailPref = async () => {
    const nextVal = !emailNotifs;
    setEmailNotifs(nextVal);
    setSavingEmailPref(true);
    try {
      await apiRequest('/auth/me/preferences', {
        method: 'PATCH',
        body: JSON.stringify({ emailNotifications: nextVal }),
      });
      addToast(`Email notifications ${nextVal ? 'enabled' : 'disabled'}`, 'success');
    } catch {
      setEmailNotifs(!nextVal); // Revert on failure
      addToast('Failed to update email preferences', 'error');
    } finally {
      setSavingEmailPref(false);
    }
  };

  const handleSaveSlackWebhook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) return;
    setSavingSlack(true);
    try {
      const res = await apiRequest<{ message: string; configured: boolean }>('/integrations/slack/webhook-url', {
        method: 'POST',
        body: JSON.stringify({ webhookUrl: slackWebhook }),
      });
      setSlackConfigured(res.configured);
      addToast('Slack webhook URL configured successfully', 'success');
    } catch (err: any) {
      addToast(err.message || 'Failed to save Slack webhook URL.', 'error');
    } finally {
      setSavingSlack(false);
    }
  };

  const handleTestSlack = async () => {
    if (!isAdmin) return;
    setTestingSlack(true);
    try {
      await apiRequest<{ success: boolean; message: string }>('/integrations/slack/test', {
        method: 'POST',
      });
      addToast('Test message sent to Slack channel!', 'success');
    } catch (err: any) {
      addToast(err.message || 'Failed to deliver test message to Slack webhook.', 'error');
    } finally {
      setTestingSlack(false);
    }
  };

  return (
    <div className="omni-fade-in px-4 py-6 md:px-8 max-w-3xl">
      <h1 className="text-xl font-semibold text-[#1B2430] mb-5">Settings</h1>

      {/* Organization Info Card */}
      <div className="bg-white border border-[#E2E6E4] rounded-lg p-5 mb-5 shadow-sm">
        <h2 className="text-sm font-semibold text-[#1B2430] mb-3.5">Organization Context</h2>
        <div className="text-xs text-[#5B6672] flex justify-between py-2 border-b border-[#EDEFED]">
          <span>Organization Name</span>
          <span className="text-[#1B2430] font-medium">{organization?.name || 'N/A'}</span>
        </div>
        <div className="text-xs text-[#5B6672] flex justify-between py-2">
          <span>Current Session User</span>
          <span className="text-[#1B2430] font-medium">
            {user?.name} · <span className="omni-mono text-[11px] bg-[#EDEFED] px-1.5 py-0.5 rounded">{user?.role}</span>
          </span>
        </div>
      </div>

      {/* User Preferences Card */}
      <div className="bg-white border border-[#E2E6E4] rounded-lg p-5 mb-5 shadow-sm">
        <h2 className="text-sm font-semibold text-[#1B2430] mb-3.5">User Preferences</h2>
        <div className="flex justify-between items-center py-2">
          <div className="flex items-center gap-2.5">
            <Mail size={16} className="text-teal-700" />
            <div>
              <span className="text-xs font-medium text-[#1B2430]">Resend Email Notifications</span>
              <p className="text-[11.5px] text-[#5B6672] m-0">Receive email alerts for task assignments and due-date reminders</p>
            </div>
          </div>
          <button
            onClick={handleToggleEmailPref}
            disabled={savingEmailPref}
            className={`omni-badge transition-all cursor-pointer ${
              emailNotifs ? 'omni-badge-teal' : 'bg-gray-100 text-gray-600 border-gray-300'
            }`}
            aria-label={`Toggle email notifications, currently ${emailNotifs ? 'enabled' : 'disabled'}`}
          >
            {emailNotifs ? 'ENABLED' : 'DISABLED'}
          </button>
        </div>
      </div>

      {/* Integrations Card */}
      <div className="bg-white border border-[#E2E6E4] rounded-lg p-5 mb-5 shadow-sm">
        <div className="flex justify-between items-center mb-3.5">
          <div>
            <h2 className="text-sm font-semibold text-[#1B2430]">Platform Integrations</h2>
            <p className="text-xs text-[#5B6672] mt-0.5">
              Connect external messaging platforms, issue trackers, and identity directories
            </p>
          </div>
          {!isAdmin && (
            <span className="text-[11px] text-[#8493A5] flex items-center gap-1 bg-[#FAFBFB] px-2 py-1 rounded border border-[#E2E6E4]">
              <Lock size={12} /> Read-only (ANALYST)
            </span>
          )}
        </div>

        {/* Slack Integration Block */}
        <div className="border border-[#EDEFED] rounded-lg p-3.5 mb-3 bg-[#FAFBFB]">
          <div className="flex justify-between items-center mb-2.5">
            <div className="flex items-center gap-2">
              <span className="text-base">💬</span>
              <div>
                <span className="text-xs font-semibold text-[#1B2430]">Slack Incoming Webhook</span>
                <span className="text-[11px] text-[#5B6672] ml-2">Org-level critical alerts (<code className="omni-mono">MAPPING_OVERRIDDEN</code>, <code className="omni-mono">POD_STATUS_CHANGED</code>)</span>
              </div>
            </div>
            <span className={`omni-badge ${slackConfigured ? 'omni-badge-teal' : 'bg-gray-100 text-gray-500 border-gray-200'}`}>
              {slackConfigured ? 'CONNECTED' : 'NOT CONFIGURED'}
            </span>
          </div>

          <form onSubmit={handleSaveSlackWebhook} className="flex gap-2 flex-wrap sm:flex-nowrap">
            <input
              type="text"
              placeholder="https://hooks.slack.com/services/T00/B00/XXXX"
              value={slackWebhook}
              onChange={(e) => setSlackWebhook(e.target.value)}
              disabled={!isAdmin || savingSlack}
              className="omni-input flex-1 h-8 text-xs"
              aria-label="Slack Webhook URL"
            />
            {isAdmin && (
              <>
                <button
                  type="submit"
                  disabled={savingSlack}
                  className="omni-btn-secondary text-xs h-8 px-3 whitespace-nowrap"
                >
                  {savingSlack ? 'Saving...' : 'Save Webhook'}
                </button>
                {slackConfigured && (
                  <button
                    type="button"
                    onClick={handleTestSlack}
                    disabled={testingSlack}
                    className="omni-btn-primary text-xs h-8 px-3 flex items-center gap-1 whitespace-nowrap"
                    aria-label="Send test notification to Slack"
                  >
                    <Send size={12} />
                    {testingSlack ? 'Sending...' : 'Test Alert'}
                  </button>
                )}
              </>
            )}
          </form>
        </div>

        {/* Jira Software Card (Structured Stub) */}
        <div className="border border-[#EDEFED] rounded-lg p-3.5 mb-3 bg-[#FAFBFB] opacity-75">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2">
              <span className="text-base">🔷</span>
              <div>
                <span className="text-xs font-semibold text-[#1B2430]">Jira Software Cloud</span>
                <span className="text-[11px] text-[#5B6672] ml-2">Bidirectional issue & compliance task sync</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="omni-mono text-[9.5px] text-[#6E7A8A] bg-[#EDEFED] px-1.5 py-0.5 rounded">Coming soon</span>
              <button disabled className="omni-btn-secondary opacity-50 cursor-not-allowed h-7 text-[11.5px] px-2.5">
                Connect
              </button>
            </div>
          </div>
        </div>

        {/* Google Workspace Card (Structured Stub) */}
        <div className="border border-[#EDEFED] rounded-lg p-3.5 bg-[#FAFBFB] opacity-75">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2">
              <span className="text-base">📁</span>
              <div>
                <span className="text-xs font-semibold text-[#1B2430]">Google Workspace</span>
                <span className="text-[11px] text-[#5B6672] ml-2">Directory user sync & Google Drive audit evidence</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="omni-mono text-[9.5px] text-[#6E7A8A] bg-[#EDEFED] px-1.5 py-0.5 rounded">Coming soon</span>
              <button disabled className="omni-btn-secondary opacity-50 cursor-not-allowed h-7 text-[11.5px] px-2.5">
                Connect
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Regional Hosting Pods Card */}
      <div className="bg-white border border-[#E2E6E4] rounded-lg p-5 shadow-sm">
        <div className="flex justify-between items-center mb-3.5">
          <div>
            <h2 className="text-sm font-semibold text-[#1B2430]">Regional Hosting Pods</h2>
            <p className="text-xs text-[#5B6672] mt-0.5">
              Multi-region cloud infrastructure tenancy & data residency options
            </p>
          </div>
          {!isAdmin && (
            <span className="text-[11px] text-[#8493A5] flex items-center gap-1 bg-[#FAFBFB] px-2 py-1 rounded border border-[#E2E6E4]">
              <Lock size={12} /> Read-only (ANALYST)
            </span>
          )}
        </div>

        {fetchError && (
          <div className="mb-3">
            <InlineErrorState message={fetchError} onRetry={fetchPods} />
          </div>
        )}

        {loading ? (
          <div className="space-y-3 py-2">
            <SkeletonLine height="24px" width="100%" />
            <SkeletonLine height="24px" width="100%" />
            <SkeletonLine height="24px" width="100%" />
          </div>
        ) : (
          pods.map((r, i, arr) => {
            const isActive = r.status === PodStatus.ACTIVE;
            return (
              <div key={r.id || r.region} className={`text-xs flex justify-between items-center py-3 ${
                i < arr.length - 1 ? 'border-b border-[#EDEFED]' : ''
              }`}>
                <div className="flex items-center gap-2.5">
                  <Globe2 size={16} className={isActive ? 'text-teal-700' : 'text-gray-400'} />
                  <div>
                    <span className="text-[#1B2430] font-medium">{regionNameMap[r.region] || r.region}</span>
                    {r.region === 'INDIA' && (
                      <span className="ml-2 omni-badge omni-badge-teal text-[10px] py-0 px-1.5">Primary</span>
                    )}
                  </div>
                </div>

                {isAdmin ? (
                  <button
                    onClick={() => handleToggleClick(r)}
                    className={`omni-badge transition-all cursor-pointer ${
                      isActive ? 'omni-badge-teal' : 'omni-badge-rose'
                    }`}
                    aria-label={`Toggle pod status for ${r.region}, currently ${r.status}`}
                  >
                    <span>{r.status}</span>
                    <span className="text-[10px] opacity-75 ml-1">(Toggle)</span>
                  </button>
                ) : (
                  <span className={`omni-badge ${isActive ? 'omni-badge-teal' : 'omni-badge-rose'}`}>
                    {r.status}
                  </span>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Infrastructure & Billing Confirmation Modal */}
      {selectedPod && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="omni-fade-in bg-white rounded-xl w-full max-w-md p-6 shadow-xl border border-[#E2E6E4]">
            <div className="flex items-center gap-2.5 mb-3.5">
              <div className="w-9 h-9 rounded-lg bg-amber-50 flex items-center justify-center flex-shrink-0">
                <AlertTriangle size={20} className="text-amber-600" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-[#1B2430] m-0">
                  Confirm Pod Status Toggle
                </h3>
                <span className="text-xs text-[#5B6672]">
                  {regionNameMap[selectedPod.region]} · <span className="omni-mono">{selectedPod.status}</span> → <span className="omni-mono">{selectedPod.status === PodStatus.ACTIVE ? PodStatus.INACTIVE : PodStatus.ACTIVE}</span>
                </span>
              </div>
            </div>

            {/* Cost Projection & Manual Provisioning Notice (Cost Projection doc §6) */}
            <div className="bg-[#FAFBFB] border border-[#E2E6E4] rounded-lg p-3 text-xs text-[#5B6672] leading-relaxed mb-4">
              <strong className="text-[#1B2430] block mb-1">
                Billing & Cloud Infrastructure Decision Notice:
              </strong>
              Activating or deactivating a regional hosting pod is a billing and cloud infrastructure decision requiring manual cloud provisioning. This action updates the platform status record in the database only and does not automatically provision or de-provision cloud resources.
            </div>

            {/* Modal Error State (e.g. Active Pod Guard violation) */}
            {modalError && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-700 text-xs mb-4 flex items-center gap-2">
                <ShieldAlert size={16} className="flex-shrink-0" />
                <span>{modalError}</span>
              </div>
            )}

            {/* Actions */}
            <div className="flex justify-end gap-2.5">
              <button
                disabled={updating}
                onClick={() => setSelectedPod(null)}
                className="omni-btn-secondary text-xs"
              >
                Cancel
              </button>
              <button
                disabled={updating}
                onClick={handleConfirmToggle}
                className={`omni-btn-primary text-xs ${
                  selectedPod.status === PodStatus.ACTIVE ? 'bg-red-700 hover:bg-red-800' : 'bg-teal-700 hover:bg-teal-800'
                }`}
              >
                {updating ? 'Updating Status...' : selectedPod.status === PodStatus.ACTIVE ? 'Confirm Deactivation' : 'Confirm Activation'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

