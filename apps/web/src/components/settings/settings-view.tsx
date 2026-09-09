'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/context/auth-context';
import { apiRequest } from '@/lib/api-client';
import { RegionalPodDto, PodStatus, Role } from '@omnigrc/shared';
import { Globe2, ShieldAlert, CheckCircle2, Lock, AlertTriangle } from 'lucide-react';

export function SettingsView() {
  const { user, organization } = useAuth();
  const [pods, setPods] = useState<RegionalPodDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPod, setSelectedPod] = useState<RegionalPodDto | null>(null);
  const [updating, setUpdating] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

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

  useEffect(() => {
    fetchPods();
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

  return (
    <div className="omni-fade-in" style={{ padding: '28px 32px', maxWidth: 680 }}>
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
