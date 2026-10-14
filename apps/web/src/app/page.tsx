'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/context/auth-context';
import { LoginScreen } from '@/components/auth/login-screen';
import { OrganizationNotLicensedScreen } from '@/components/auth/organization-not-licensed-screen';
import { ProductAccessRevokedScreen } from '@/components/auth/product-access-revoked-screen';
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
import { ApprovalCenterView } from '@/components/approval/approval-center-view';

import { ComingSoon } from '@/components/dashboard/coming-soon';
import { OnboardingWizard } from '@/components/onboarding/onboarding-wizard';
import { ToastProvider } from '@/context/toast-context';
import { FloatingSupportChat } from '@/components/intelligence/floating-support-chat';
import { ModuleNotLicensedView } from '@/components/ui/module-not-licensed-view';
import { Lock, ShieldAlert } from 'lucide-react';

export default function MainPage() {
  const { user, organization, loading, licenseError, clearLicenseError, hasCapability, getCapabilityState } = useAuth();
  const [view, setView] = useState('dashboard');
  const [viewParams, setViewParams] = useState<Record<string, any>>({});
  const [showWizard, setShowWizard] = useState<boolean>(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  const navigateToView = (nextView: string, params?: Record<string, any>) => {
    setView(nextView);
    setViewParams(params || {});
    setMobileSidebarOpen(false);
  };

  // Sync view from URL search param if present on initial mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const urlView = params.get('view');
      if (urlView) {
        setView(urlView);
      }
    }
  }, []);

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

  if (licenseError === 'ORGANIZATION_NOT_LICENSED') {
    return <OrganizationNotLicensedScreen onReturnToLogin={clearLicenseError} />;
  }

  if (licenseError === 'PRODUCT_ACCESS_REVOKED') {
    return <ProductAccessRevokedScreen onReturnToLogin={clearLicenseError} />;
  }

  if (!user) {
    return <LoginScreen />;
  }

  const activeItem = NAV_SECTIONS.flatMap((s) => s.items).find((i) => i.key === view);
  const isReadOnly = organization?.isReadOnly || organization?.licenseState === 'EXPIRED';
  const isLicensed = !activeItem?.capabilityCode || hasCapability(activeItem.capabilityCode);

  return (
    <ToastProvider>
      <div className="omni-root" style={{ height: '100vh', display: 'flex', position: 'relative', overflow: 'hidden' }}>
        <Sidebar
          view={view}
          setView={(v) => navigateToView(v)}
          mobileOpen={mobileSidebarOpen}
          onCloseMobile={() => setMobileSidebarOpen(false)}
        />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
          {isReadOnly && (
            <div className="bg-amber-500/90 text-slate-950 font-bold px-4 py-2 text-xs flex items-center justify-center gap-2 shadow-md shrink-0 border-b border-amber-600">
              <Lock size={14} className="shrink-0" />
              <span>Software License Expired — Operating in Read-Only Mode. Data exports and viewing remain available.</span>
            </div>
          )}
          <Topbar onToggleMobileSidebar={() => setMobileSidebarOpen((v) => !v)} />
          <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }} className="omni-scroll w-full max-w-full p-3.5 sm:p-6">
            {!isLicensed && activeItem?.capabilityCode ? (
              <ModuleNotLicensedView
                moduleName={activeItem.label}
                capabilityCode={activeItem.capabilityCode}
                reason={getCapabilityState(activeItem.capabilityCode)?.reason}
                onNavigateHome={() => navigateToView('dashboard')}
              />
            ) : (
              <>
                {view === 'dashboard' && <DashboardView onNavigateToView={(v) => navigateToView(v)} />}
                {view === 'reports' && <ReportsView />}
                {view === 'risk' && (
                  <RiskListView
                    initialAssetId={viewParams?.assetId}
                    onClearAssetFilter={() => setViewParams((prev) => ({ ...prev, assetId: undefined }))}
                    onNavigateToView={(v) => navigateToView(v)}
                  />
                )}
                {view === 'assets' && (
                  <AssetListView
                    onNavigateToRisk={(assetId) => navigateToView('risk', { assetId })}
                  />
                )}
                {view === 'vulnerabilities' && <VulnerabilityListView />}
                {view === 'incidents' && <IncidentListView />}
                {view === 'remediation' && <RemediationView />}
                {view === 'controls' && <ControlMappingView onNavigateToView={(v) => navigateToView(v)} />}
                {view === 'frameworks' && <FrameworkLibraryView />}
                {view === 'policies' && <PolicyListView />}
                {view === 'approvals' && <ApprovalCenterView />}
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
              </>
            )}
          </div>
        </div>

        {showWizard && (
          <OnboardingWizard onComplete={() => setShowWizard(false)} />
        )}

        {hasCapability('AI_GRC_CHAT') && <FloatingSupportChat />}
      </div>
    </ToastProvider>
  );
}
