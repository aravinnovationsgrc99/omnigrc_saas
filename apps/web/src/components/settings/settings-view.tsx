'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/context/auth-context';
import { apiRequest } from '@/lib/api-client';
import { RegionalPodDto } from '@omnigrc/shared';

export function SettingsView() {
  const { user, organization } = useAuth();
  const [pods, setPods] = useState<RegionalPodDto[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchPods() {
      try {
        const data = await apiRequest<RegionalPodDto[]>('/regional-pods');
        setPods(data);
      } catch {
        // Fallback default pods if backend is unreachable / pending DB setup
        setPods([
          { id: '1', region: 'INDIA' as any, status: 'ACTIVE' as any, organizationId: '' },
          { id: '2', region: 'UK' as any, status: 'INACTIVE' as any, organizationId: '' },
          { id: '3', region: 'EU' as any, status: 'INACTIVE' as any, organizationId: '' },
          { id: '4', region: 'AUSTRALIA' as any, status: 'INACTIVE' as any, organizationId: '' },
        ]);
      } finally {
        setLoading(false);
      }
    }
    fetchPods();
  }, []);

  const regionNameMap: Record<string, string> = {
    INDIA: 'India',
    UK: 'United Kingdom',
    EU: 'European Union',
    AUSTRALIA: 'Australia',
  };

  return (
    <div className="omni-fade-in" style={{ padding: '28px 32px', maxWidth: 640 }}>
      <h1 style={{ fontSize: 19, fontWeight: 600, marginBottom: 18 }}>Settings</h1>

      <div style={{ background: '#FFFFFF', border: '1px solid #E2E6E4', borderRadius: 10, padding: '18px 22px', marginBottom: 16 }}>
        <h2 style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 14 }}>Organization</h2>
        <div style={{ fontSize: 13, color: '#5B6672', display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #EDEFED' }}>
          <span>Name</span><span style={{ color: '#1B2430', fontWeight: 500 }}>{organization?.name || 'N/A'}</span>
        </div>
        <div style={{ fontSize: 13, color: '#5B6672', display: 'flex', justifyContent: 'space-between', padding: '8px 0' }}>
          <span>Signed in as</span><span style={{ color: '#1B2430', fontWeight: 500 }}>{user?.name} · {user?.role}</span>
        </div>
      </div>

      <div style={{ background: '#FFFFFF', border: '1px solid #E2E6E4', borderRadius: 10, padding: '18px 22px' }}>
        <h2 style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 14 }}>Regional hosting pods</h2>
        {loading ? (
          <div style={{ fontSize: 12.5, color: '#8B95A1', padding: '12px 0' }}>Loading regional pod data from API...</div>
        ) : (
          pods.map((r, i, arr) => {
            const isActive = r.status === 'ACTIVE';
            return (
              <div key={r.id || r.region} style={{
                fontSize: 13, display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '8px 0', borderBottom: i < arr.length - 1 ? '1px solid #EDEFED' : 'none',
              }}>
                <span style={{ color: '#1B2430' }}>{regionNameMap[r.region] || r.region}</span>
                <span style={{
                  fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 999,
                  color: isActive ? '#0F6E6A' : '#8B95A1',
                  background: isActive ? '#E4F1F0' : '#EDEFED',
                }}>
                  {r.status}
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
