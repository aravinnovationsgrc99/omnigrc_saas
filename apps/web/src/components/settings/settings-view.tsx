'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/context/auth-context';
import { apiRequest } from '@/lib/api-client';
import { RegionalPodDto, PodStatus, Role } from '@omnigrc/shared';
import { Globe2, ShieldAlert, CheckCircle2, Lock, AlertTriangle, Send, Mail, Link, Layers, Check } from 'lucide-react';

export function SettingsView() {
  const { user, organization } = useAuth();
  const [pods, setPods] = useState<RegionalPodDto[]>([]);
  const [loading, setLoading] = useState(true);
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
  const [slackFeedback, setSlackFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const isAdmin = user?.role === Role.ADMIN;

  const fetchPods = async () => {
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
    } catch (err: any) {
      setModalError(err.message || 'Failed to update regional pod status.');
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
    } catch {
      setEmailNotifs(!nextVal); // Revert on failure
    } finally {
      setSavingEmailPref(false);
    }
  };

  const handleSaveSlackWebhook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) return;
    setSavingSlack(true);
    setSlackFeedback(null);
    try {
      const res = await apiRequest<{ message: string; configured: boolean }>('/integrations/slack/webhook-url', {
        method: 'POST',
        body: JSON.stringify({ webhookUrl: slackWebhook }),
      });
      setSlackConfigured(res.configured);
      setSlackFeedback({ type: 'success', message: 'Slack webhook URL saved successfully.' });
    } catch (err: any) {
      setSlackFeedback({ type: 'error', message: err.message || 'Failed to save Slack webhook URL.' });
    } finally {
      setSavingSlack(false);
    }
  };

  const handleTestSlack = async () => {
    if (!isAdmin) return;
    setTestingSlack(true);
    setSlackFeedback(null);
    try {
      await apiRequest<{ success: boolean; message: string }>('/integrations/slack/test', {
        method: 'POST',
      });
      setSlackFeedback({ type: 'success', message: 'Test message successfully sent to Slack channel!' });
    } catch (err: any) {
      setSlackFeedback({ type: 'error', message: err.message || 'Failed to deliver test message to Slack webhook.' });
    } finally {
      setTestingSlack(false);
    }
  };

  return (
    <div className="omni-fade-in" style={{ padding: '28px 32px', maxWidth: 720 }}>
      <h1 style={{ fontSize: 19, fontWeight: 600, marginBottom: 18, color: '#1B2430' }}>Settings</h1>

      {/* Organization Info Card */}
      <div style={{ background: '#FFFFFF', border: '1px solid #E2E6E4', borderRadius: 10, padding: '18px 22px', marginBottom: 20 }}>
        <h2 style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 14, color: '#1B2430' }}>Organization Context</h2>
        <div style={{ fontSize: 13, color: '#5B6672', display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #EDEFED' }}>
          <span>Organization Name</span>
          <span style={{ color: '#1B2430', fontWeight: 500 }}>{organization?.name || 'N/A'}</span>
        </div>
        <div style={{ fontSize: 13, color: '#5B6672', display: 'flex', justifyContent: 'space-between', padding: '8px 0' }}>
          <span>Current Session User</span>
          <span style={{ color: '#1B2430', fontWeight: 500 }}>
            {user?.name} · <span className="omni-mono" style={{ fontSize: 11.5, background: '#EDEFED', padding: '2px 6px', borderRadius: 4 }}>{user?.role}</span>
          </span>
        </div>
      </div>

      {/* User Preferences Card */}
      <div style={{ background: '#FFFFFF', border: '1px solid #E2E6E4', borderRadius: 10, padding: '18px 22px', marginBottom: 20 }}>
        <h2 style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 14, color: '#1B2430' }}>User Preferences</h2>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Mail size={16} color="#0F6E6A" />
            <div>
              <span style={{ fontSize: 13, fontWeight: 500, color: '#1B2430' }}>Resend Email Notifications</span>
              <p style={{ fontSize: 12, color: '#5B6672', margin: 0 }}>Receive email alerts for task assignments and due-date reminders</p>
            </div>
          </div>
          <button
            onClick={handleToggleEmailPref}
            disabled={savingEmailPref}
            style={{
              padding: '4px 12px', borderRadius: 999, fontSize: 11.5, fontWeight: 700,
              border: '1px solid', cursor: 'pointer', transition: 'all 0.15s ease',
              color: emailNotifs ? '#0F6E6A' : '#5B6672',
              background: emailNotifs ? '#E4F1F0' : '#EDEFED',
              borderColor: emailNotifs ? '#BCE3E0' : '#D5DCD8',
            }}
          >
            {emailNotifs ? 'ENABLED' : 'DISABLED'}
          </button>
        </div>
      </div>

      {/* Integrations Card */}
      <div style={{ background: '#FFFFFF', border: '1px solid #E2E6E4', borderRadius: 10, padding: '18px 22px', marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div>
            <h2 style={{ fontSize: 13.5, fontWeight: 600, color: '#1B2430' }}>Platform Integrations</h2>
            <p style={{ fontSize: 12, color: '#5B6672', marginTop: 2 }}>
              Connect external messaging platforms, issue trackers, and identity directories
            </p>
          </div>
          {!isAdmin && (
            <span style={{ fontSize: 11, color: '#8493A5', display: 'flex', alignItems: 'center', gap: 4, background: '#FAFBFB', padding: '4px 8px', borderRadius: 6, border: '1px solid #E2E6E4' }}>
              <Lock size={12} /> Read-only (ANALYST)
            </span>
          )}
        </div>

        {/* Feedback Alert Banner */}
        {slackFeedback && (
          <div style={{
            padding: '10px 14px', borderRadius: 8, fontSize: 12.5, marginBottom: 14,
            display: 'flex', alignItems: 'center', gap: 8,
            background: slackFeedback.type === 'success' ? '#E4F1F0' : '#F8E6E8',
            color: slackFeedback.type === 'success' ? '#0F6E6A' : '#B23A48',
            border: `1px solid ${slackFeedback.type === 'success' ? '#BCE3E0' : '#ECA8B0'}`,
          }}>
            {slackFeedback.type === 'success' ? <CheckCircle2 size={16} /> : <ShieldAlert size={16} />}
            <span>{slackFeedback.message}</span>
          </div>
        )}

        {/* Slack Integration Block */}
        <div style={{ border: '1px solid #EDEFED', borderRadius: 8, padding: 14, marginBottom: 12, background: '#FAFBFB' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 16 }}>💬</span>
              <div>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#1B2430' }}>Slack Incoming Webhook</span>
                <span style={{ fontSize: 11, color: '#5B6672', marginLeft: 8 }}>Org-level critical alerts (`MAPPING_OVERRIDDEN`, `POD_STATUS_CHANGED`)</span>
              </div>
            </div>
            <span style={{
              fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 999,
              color: slackConfigured ? '#0F6E6A' : '#8B95A1',
              background: slackConfigured ? '#E4F1F0' : '#EDEFED',
            }}>
              {slackConfigured ? 'CONNECTED' : 'NOT CONFIGURED'}
            </span>
          </div>

          <form onSubmit={handleSaveSlackWebhook} style={{ display: 'flex', gap: 8 }}>
            <input
              type="text"
              placeholder="https://hooks.slack.com/services/T00/B00/XXXX"
              value={slackWebhook}
              onChange={(e) => setSlackWebhook(e.target.value)}
              disabled={!isAdmin || savingSlack}
              className="omni-input"
              style={{ flex: 1, height: 34, fontSize: 12 }}
            />
            {isAdmin && (
              <>
                <button
                  type="submit"
                  disabled={savingSlack}
                  className="omni-btn-secondary"
                  style={{ height: 34, padding: '0 12px', fontSize: 12 }}
                >
                  {savingSlack ? 'Saving...' : 'Save Webhook'}
                </button>
                {slackConfigured && (
                  <button
                    type="button"
                    onClick={handleTestSlack}
                    disabled={testingSlack}
                    className="omni-btn-primary"
                    style={{ height: 34, padding: '0 12px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}
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
        <div style={{ border: '1px solid #EDEFED', borderRadius: 8, padding: 14, marginBottom: 12, background: '#FAFBFB', opacity: 0.8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 16 }}>🔷</span>
              <div>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#1B2430' }}>Jira Software Cloud</span>
                <span style={{ fontSize: 11, color: '#5B6672', marginLeft: 8 }}>Bidirectional issue & compliance task sync</span>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="omni-mono" style={{ fontSize: 9.5, color: '#6E7A8A', background: '#EDEFED', padding: '2px 6px', borderRadius: 4 }}>Coming soon</span>
              <button disabled className="omni-btn-secondary" style={{ opacity: 0.5, cursor: 'not-allowed', height: 28, fontSize: 11.5 }}>
                Connect
              </button>
            </div>
          </div>
        </div>

        {/* Google Workspace Card (Structured Stub) */}
        <div style={{ border: '1px solid #EDEFED', borderRadius: 8, padding: 14, background: '#FAFBFB', opacity: 0.8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 16 }}>📁</span>
              <div>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#1B2430' }}>Google Workspace</span>
                <span style={{ fontSize: 11, color: '#5B6672', marginLeft: 8 }}>Directory user sync & Google Drive audit evidence</span>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="omni-mono" style={{ fontSize: 9.5, color: '#6E7A8A', background: '#EDEFED', padding: '2px 6px', borderRadius: 4 }}>Coming soon</span>
              <button disabled className="omni-btn-secondary" style={{ opacity: 0.5, cursor: 'not-allowed', height: 28, fontSize: 11.5 }}>
                Connect
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Regional Hosting Pods Card */}
      <div style={{ background: '#FFFFFF', border: '1px solid #E2E6E4', borderRadius: 10, padding: '18px 22px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div>
            <h2 style={{ fontSize: 13.5, fontWeight: 600, color: '#1B2430' }}>Regional Hosting Pods</h2>
            <p style={{ fontSize: 12, color: '#5B6672', marginTop: 2 }}>
              Multi-region cloud infrastructure tenancy & data residency options
            </p>
          </div>
          {!isAdmin && (
            <span style={{ fontSize: 11, color: '#8493A5', display: 'flex', alignItems: 'center', gap: 4, background: '#FAFBFB', padding: '4px 8px', borderRadius: 6, border: '1px solid #E2E6E4' }}>
              <Lock size={12} /> Read-only (ANALYST)
            </span>
          )}
        </div>

        {loading ? (
          <div style={{ fontSize: 12.5, color: '#8B95A1', padding: '12px 0' }}>Loading regional pod data from API...</div>
        ) : (
          pods.map((r, i, arr) => {
            const isActive = r.status === PodStatus.ACTIVE;
            return (
              <div key={r.id || r.region} style={{
                fontSize: 13, display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '12px 0', borderBottom: i < arr.length - 1 ? '1px solid #EDEFED' : 'none',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Globe2 size={16} color={isActive ? '#0F6E6A' : '#8B95A1'} />
                  <div>
                    <span style={{ color: '#1B2430', fontWeight: 500 }}>{regionNameMap[r.region] || r.region}</span>
                    {r.region === 'INDIA' && (
                      <span style={{ marginLeft: 8, fontSize: 10, color: '#0F6E6A', background: '#E4F1F0', padding: '1px 6px', borderRadius: 4, fontWeight: 600 }}>Primary</span>
                    )}
                  </div>
                </div>

                {isAdmin ? (
                  <button
                    onClick={() => handleToggleClick(r)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      fontSize: 11.5, fontWeight: 700, padding: '4px 12px', borderRadius: 999,
                      border: '1px solid', cursor: 'pointer', transition: 'all 0.15s ease',
                      color: isActive ? '#0F6E6A' : '#5B6672',
                      background: isActive ? '#E4F1F0' : '#EDEFED',
                      borderColor: isActive ? '#BCE3E0' : '#D5DCD8',
                    }}
                  >
                    <span>{r.status}</span>
                    <span style={{ fontSize: 10, opacity: 0.75 }}> (Click to toggle)</span>
                  </button>
                ) : (
                  <span style={{
                    fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 999,
                    color: isActive ? '#0F6E6A' : '#8B95A1',
                    background: isActive ? '#E4F1F0' : '#EDEFED',
                  }}>
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
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.45)', backdropFilter: 'blur(3px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        }}>
          <div className="omni-fade-in" style={{
            background: '#FFFFFF', borderRadius: 12, width: '100%', maxWidth: 480,
            padding: 24, boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
            border: '1px solid #E2E6E4',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <div style={{
                width: 36, height: 36, borderRadius: 9, background: '#FCEFD9',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <AlertTriangle size={20} color="#B5750A" />
              </div>
              <div>
                <h3 style={{ fontSize: 15, fontWeight: 600, color: '#1B2430', margin: 0 }}>
                  Confirm Pod Status Toggle
                </h3>
                <span style={{ fontSize: 12, color: '#5B6672' }}>
                  {regionNameMap[selectedPod.region]} · <span className="omni-mono">{selectedPod.status}</span> → <span className="omni-mono">{selectedPod.status === PodStatus.ACTIVE ? PodStatus.INACTIVE : PodStatus.ACTIVE}</span>
                </span>
              </div>
            </div>

            {/* Cost Projection & Manual Provisioning Notice (Cost Projection doc §6) */}
            <div style={{
              background: '#FAFBFB', border: '1px solid #E2E6E4', borderRadius: 8,
              padding: '12px 14px', fontSize: 12.5, color: '#5B6672', lineHeight: 1.5, marginBottom: 16,
            }}>
              <strong style={{ color: '#1B2430', display: 'block', marginBottom: 4 }}>
                Billing & Cloud Infrastructure Decision Notice:
              </strong>
              Activating or deactivating a regional hosting pod is a billing and cloud infrastructure decision requiring manual cloud provisioning. This action updates the platform status record in the database only and does not automatically provision or de-provision cloud resources.
            </div>

            {/* Modal Error State (e.g. Active Pod Guard violation) */}
            {modalError && (
              <div style={{
                background: '#F8E6E8', border: '1px solid #ECA8B0', borderRadius: 8,
                padding: '10px 14px', color: '#B23A48', fontSize: 12.5, marginBottom: 16,
                display: 'flex', alignItems: 'center', gap: 8,
              }}>
                <ShieldAlert size={16} style={{ flexShrink: 0 }} />
                <span>{modalError}</span>
              </div>
            )}

            {/* Actions */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button
                disabled={updating}
                onClick={() => setSelectedPod(null)}
                className="omni-btn-secondary"
                style={{ fontSize: 12.5 }}
              >
                Cancel
              </button>
              <button
                disabled={updating}
                onClick={handleConfirmToggle}
                className="omni-btn-primary"
                style={{ fontSize: 12.5, background: selectedPod.status === PodStatus.ACTIVE ? '#B23A48' : '#0F6E6A' }}
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
