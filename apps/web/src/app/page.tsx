'use client';

import React, { useState } from 'react';
import { useAuth } from '@/context/auth-context';
import { LoginScreen } from '@/components/auth/login-screen';
import { Sidebar, NAV_SECTIONS } from '@/components/layout/sidebar';
import { Topbar } from '@/components/layout/topbar';
import { DashboardView } from '@/components/dashboard/dashboard-view';
import { SettingsView } from '@/components/settings/settings-view';
import { AssetListView } from '@/components/assets/asset-list-view';
import { ComingSoon } from '@/components/dashboard/coming-soon';

export default function MainPage() {
  const { user, loading } = useAuth();
  const [view, setView] = useState('dashboard');

  if (loading) {
    return <div className="omni-root" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ color: '#0F6E6A', fontWeight: 600 }}>Loading OMNiGRC...</div>
    </div>;
  }

  if (!user) {
    return <LoginScreen />;
  }

  const activeItem = NAV_SECTIONS.flatMap((s) => s.items).find((i) => i.key === view);

  return (
    <div className="omni-root" style={{ height: '100vh', display: 'flex' }}>
      <Sidebar view={view} setView={setView} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <Topbar />
        <div style={{ flex: 1, overflowY: 'auto' }} className="omni-scroll">
          {view === 'dashboard' && <DashboardView />}
          {view === 'assets' && <AssetListView />}
          {view === 'settings' && <SettingsView />}
          {activeItem && !activeItem.enabled && (
            <ComingSoon label={activeItem.label} phase={activeItem.phase || 'Phase N'} />
          )}
        </div>
      </div>
    </div>
  );
}
