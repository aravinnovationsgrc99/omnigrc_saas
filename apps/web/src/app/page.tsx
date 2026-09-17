'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/context/auth-context';
import { LoginScreen } from '@/components/auth/login-screen';
import { Sidebar, NAV_SECTIONS } from '@/components/layout/sidebar';
import { Topbar } from '@/components/layout/topbar';
import { DashboardView } from '@/components/dashboard/dashboard-view';
import { SettingsView } from '@/components/settings/settings-view';
import { AssetListView } from '@/components/assets/asset-list-view';
import { RiskListView } from '@/components/risks/risk-list-view';
import { ControlMappingView } from '@/components/controls/control-mapping-view';
import { ComplianceBoardView } from '@/components/compliance-board/compliance-board-view';
import { AuditLogView } from '@/components/audit-logs/audit-log-view';
import { PolicyListView } from '@/components/policies/policy-list-view';
import { VendorListView } from '@/components/vendors/vendor-list-view';
import { VulnerabilityListView } from '@/components/vulnerabilities/vulnerability-list-view';
import { AuditListView } from '@/components/audits/audit-list-view';
import { ReportsView } from '@/components/reports/reports-view';

import { RemediationView } from '@/components/remediation/remediation-view';
import { EvidenceVaultView } from '@/components/evidence/evidence-vault-view';
import { IncidentListView } from '@/components/incidents/incident-list-view';
import { FrameworkLibraryView } from '@/components/frameworks/framework-library-view';
import { IntegrationsView } from '@/components/integrations/integrations-view';
import { GrcIntelligenceView } from '@/components/intelligence/grc-intelligence-view';
import { MsspPartnerPortalView } from '@/components/mssp/mssp-partner-portal-view';

import { ComingSoon } from '@/components/dashboard/coming-soon';
import { OnboardingWizard } from '@/components/onboarding/onboarding-wizard';
import { ToastProvider } from '@/context/toast-context';

export default function MainPage() {
  const { user, organization, loading } = useAuth();
  const [view, setView] = useState('dashboard');
  const [showWizard, setShowWizard] = useState<boolean>(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  useEffect(() => {
    if (organization && organization.onboardingCompleted === false) {
      setShowWizard(true);
    } else {
      setShowWizard(false);
    }
  }, [organization]);

  if (loading) {
    return (
      <div className="omni-root" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: '#0F6E6A', fontWeight: 600 }}>Loading OMNiGRC...</div>
      </div>
    );
  }

  if (!user) {
    return <LoginScreen />;
  }

  const activeItem = NAV_SECTIONS.flatMap((s) => s.items).find((i) => i.key === view);

  return (
    <ToastProvider>
      <div className="omni-root" style={{ height: '100vh', display: 'flex', position: 'relative', overflow: 'hidden' }}>
        <Sidebar
          view={view}
          setView={(v) => {
            setView(v);
            setMobileSidebarOpen(false);
          }}
          mobileOpen={mobileSidebarOpen}
          onCloseMobile={() => setMobileSidebarOpen(false)}
        />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
          <Topbar onToggleMobileSidebar={() => setMobileSidebarOpen((v) => !v)} />
          <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }} className="omni-scroll w-full max-w-full p-6">
            {view === 'dashboard' && <DashboardView onNavigateToView={(v) => setView(v)} />}
            {view === 'reports' && <ReportsView />}
            {view === 'risk' && <RiskListView />}
            {view === 'assets' && <AssetListView />}
            {view === 'vulnerabilities' && <VulnerabilityListView />}
            {view === 'incidents' && <IncidentListView />}
            {view === 'remediation' && <RemediationView />}
            {view === 'controls' && <ControlMappingView />}
            {view === 'frameworks' && <FrameworkLibraryView />}
            {view === 'policies' && <PolicyListView />}
            {view === 'audits' && <AuditListView />}
            {view === 'vendors' && <VendorListView />}
            {view === 'evidence' && <EvidenceVaultView />}
            {view === 'board' && <ComplianceBoardView />}
            {view === 'intelligence' && <GrcIntelligenceView />}
            {view === 'integrations' && <IntegrationsView />}
            {view === 'mssp' && <MsspPartnerPortalView />}
            {view === 'settings' && <SettingsView />}
            {view === 'audit' && <AuditLogView />}
            {activeItem && !activeItem.enabled && (
              <ComingSoon label={activeItem.label} phase={activeItem.phase || 'Phase N'} />
            )}
          </div>
        </div>

        {showWizard && (
          <OnboardingWizard onComplete={() => setShowWizard(false)} />
        )}
      </div>
    </ToastProvider>
  );
}
