'use client';

import React from 'react';
import { useAuth } from '@/context/auth-context';
import { Role, OrgType, hasRole, OMNIGRC_VERSION } from '@omnigrc/shared';
import {
  LayoutDashboard, ShieldAlert, Boxes, GitMerge, KanbanSquare,
  Settings, Globe2, FileText, Lock, FileCheck, Building2, Bug, ClipboardList, FileSpreadsheet,
  CheckSquare, FileArchive, ShieldCheck, Library, Layers, Sparkles, Building, CheckCircle2, X, Scale, type LucideIcon
} from 'lucide-react';

interface SidebarProps {
  view: string;
  setView: (v: string) => void;
  orgName?: string;
  mobileOpen?: boolean;
  onCloseMobile?: () => void;
}

export interface NavItem {
  key: string;
  label: string;
  icon: LucideIcon;
  enabled?: boolean;
  capabilityCode?: string;
  phase?: string;
  roles?: Role[];
}

export interface NavSection {
  label: string;
  items: NavItem[];
}

export const NAV_SECTIONS: NavSection[] = [
  {
    label: 'Overview',
    items: [
      { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, enabled: true },
      { key: 'reports', label: 'Reports & Exports', icon: FileSpreadsheet, capabilityCode: 'REPORTING_MODULE', enabled: true },
    ],
  },
  {
    label: 'Risk & Operations',
    items: [
      { key: 'risk', label: 'Risk Register', icon: ShieldAlert, capabilityCode: 'GRC_CORE_RISKS', enabled: true },
      { key: 'assets', label: 'Asset & Inventory', icon: Boxes, capabilityCode: 'GRC_CORE_ASSETS', enabled: true },
      { key: 'vulnerabilities', label: 'Vulnerabilities', icon: Bug, capabilityCode: 'VULNERABILITY_MGMT', enabled: true },
      { key: 'incidents', label: 'Incidents', icon: ShieldCheck, capabilityCode: 'INCIDENT_MGMT', enabled: true },
      { key: 'remediation', label: 'Remediation & Actions', icon: CheckSquare, capabilityCode: 'GRC_CORE_TASKS', enabled: true },
    ],
  },
  {
    label: 'Governance & Audits',
    items: [
      { key: 'controls', label: 'Control Mapping', icon: GitMerge, capabilityCode: 'GRC_CORE_CONTROLS', enabled: true },
      { key: 'frameworks', label: 'Framework Library', icon: Library, capabilityCode: 'FRAMEWORK_LIBRARY', enabled: true },
      { key: 'policies', label: 'Policy Mgmt', icon: FileCheck, capabilityCode: 'POLICIES_MODULE', enabled: true },
      { key: 'approvals', label: 'Approval Center', icon: CheckCircle2, capabilityCode: 'APPROVAL_ENGINE', enabled: true },
      { key: 'audits', label: 'Audit Management', icon: ClipboardList, capabilityCode: 'BUSINESS_AUDITS', enabled: true },
      { key: 'vendors', label: 'Vendor Risk', icon: Building2, capabilityCode: 'VENDOR_RISK', enabled: true },
      { key: 'evidence', label: 'Evidence Vault', icon: FileArchive, capabilityCode: 'EVIDENCE_VAULT', enabled: true },
      { key: 'board', label: 'Compliance Board', icon: KanbanSquare, capabilityCode: 'GRC_CORE_TASKS', enabled: true },
    ],
  },
  {
    label: 'Intelligence & MSSP',
    items: [
      { key: 'intelligence', label: 'GRC Intelligence', icon: Sparkles, capabilityCode: 'AI_GRC_CHAT', enabled: true },
      { key: 'regulatory-intelligence', label: 'Regulatory Intelligence', icon: Scale, capabilityCode: 'REGULATORY_INTELLIGENCE', enabled: true },
      { key: 'integrations', label: 'Integrations Hub', icon: Layers, capabilityCode: 'INTEGRATIONS_HUB', enabled: true },
      { key: 'mssp', label: 'MSSP Partner Portal', icon: Building, capabilityCode: 'MSSP_PORTAL', enabled: true, roles: [Role.MSSP_ADMIN, Role.MSSP_ANALYST, Role.ADMIN] },
    ],
  },
  {
    label: 'System',
    items: [
      { key: 'settings', label: 'Settings', icon: Settings, enabled: true },
      { key: 'audit', label: 'Audit Log', icon: FileText, enabled: true, roles: [Role.ADMIN] },
    ],
  },
];

export function Sidebar({ view, setView, mobileOpen = false, onCloseMobile }: SidebarProps) {
  const { user, organization, hasCapability, capabilities, capabilitiesStatus, loading } = useAuth();
  const userRole = user?.role || Role.ANALYST;

  // Task 1: Handle body-scroll lock and Escape dismissal when mobile drawer is open
  React.useEffect(() => {
    if (mobileOpen) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';

      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape' && onCloseMobile) {
          onCloseMobile();
        }
      };
      window.addEventListener('keydown', handleKeyDown);

      return () => {
        document.body.style.overflow = originalOverflow;
        window.removeEventListener('keydown', handleKeyDown);
      };
    }
  }, [mobileOpen, onCloseMobile]);

  return (
    <>
      {/* Backdrop overlay for mobile drawer - z-index 70 to sit above all page content and drawers */}
      {mobileOpen && (
        <div
          onClick={onCloseMobile}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15,23,42,0.6)',
            backdropFilter: 'blur(3px)',
            WebkitBackdropFilter: 'blur(3px)',
            zIndex: 70,
          }}
          className="lg:hidden transition-opacity duration-200"
          aria-hidden="true"
        />
      )}

      {/* Mobile Drawer / Desktop Sidebar - z-index 75 on mobile so it is always on top */}
      <div
        style={{
          width: 232,
          minWidth: 232,
          background: '#16233F',
          display: 'flex',
          flexDirection: 'column',
          padding: '18px 12px',
          color: '#fff',
          height: '100%',
          zIndex: 75,
          transition: 'transform 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
        className={`fixed lg:relative inset-y-0 left-0 lg:z-auto ${
          mobileOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full lg:translate-x-0'
        }`}
        aria-label="Main Navigation"
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 8px 22px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: 7,
                background: '#0F6E6A',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 700,
                fontSize: 13,
              }}
            >
              Ω
            </div>
            <span style={{ fontSize: 15, fontWeight: 600 }}>OMNiGRC</span>
          </div>
          {mobileOpen && (
            <button
              onClick={onCloseMobile}
              className="lg:hidden text-slate-400 hover:text-white p-1 rounded-md transition-colors"
              aria-label="Close navigation menu"
            >
              <X size={18} />
            </button>
          )}
        </div>

        <div style={{ flex: 1, overflowY: 'auto' }} className="omni-scroll">
          {NAV_SECTIONS.map((section) => {
            const visibleItems = section.items.filter((item) => {
              if (item.roles && !hasRole(userRole, item.roles)) return false;
              if (item.key === 'mssp') {
                const isMsspRole = userRole === Role.MSSP_ADMIN || userRole === Role.MSSP_ANALYST;
                const isMsspOrg = organization?.type === OrgType.MSSP_PROVIDER;
                if (!isMsspRole && !isMsspOrg) return false;
              }
              return true;
            });
            if (visibleItems.length === 0) return null;

            return (
              <div key={section.label} style={{ marginBottom: 18 }}>
                <div
                  style={{
                    fontSize: 10.5,
                    fontWeight: 600,
                    color: '#6E7A8A',
                    textTransform: 'uppercase',
                    letterSpacing: 0.6,
                    padding: '0 12px 6px',
                  }}
                >
                  {section.label}
                </div>
                {visibleItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = view === item.key;
                  const isPermitted = !item.roles || hasRole(userRole, item.roles);

                  // Finding 4: Distinguish loading, error/unavailable, confirmed licensed, confirmed unlicensed states
                  const isCapabilityRequired = !!item.capabilityCode;
                  const isCapabilityLoading =
                    isCapabilityRequired &&
                    (loading || capabilitiesStatus === 'loading' || (capabilities === null && capabilitiesStatus !== 'error'));
                  const isCapabilityError =
                    isCapabilityRequired && !loading && (capabilitiesStatus === 'error' || capabilities === null);
                  const isConfirmedLicensed =
                    item.capabilityCode ? (capabilities ? hasCapability(item.capabilityCode) : false) : true;
                  const isConfirmedUnlicensed =
                    isCapabilityRequired && !isCapabilityLoading && !isCapabilityError && !isConfirmedLicensed;

                  // Fail closed: Unknown or null capabilities are NEVER treated as licensed.
                  const isLicensed = !isCapabilityRequired || isConfirmedLicensed;
                  const isDisabled = !item.enabled || !isPermitted;

                  return (
                    <button
                      key={item.key}
                      type="button"
                      className={`omni-navitem w-full text-left ${isActive ? 'active' : ''} ${isDisabled ? 'disabled' : ''} ${!isLicensed && !isCapabilityLoading ? 'unlicensed' : ''}`}
                      onClick={() => {
                        if (isPermitted && item.enabled !== false) {
                          setView(item.key);
                        }
                      }}
                      disabled={isDisabled}
                      aria-current={isActive ? 'page' : undefined}
                      aria-label={`${item.label}${!isPermitted ? ' (Restricted)' : isCapabilityLoading ? ' (Verifying license)' : isCapabilityError ? ' (Unavailable)' : !isLicensed ? ' (Unlicensed)' : !item.enabled ? ` (${item.phase})` : ''}`}
                      title={!isPermitted ? 'Restricted role' : isCapabilityLoading ? 'Verifying module license...' : isCapabilityError ? 'Service capability unavailable' : !isLicensed ? 'Commercial module not licensed' : !item.enabled ? `Opens in ${item.phase}` : undefined}
                      style={{
                        opacity: !isPermitted ? 0.55 : !isLicensed && !isCapabilityLoading ? 0.75 : 1,
                        cursor: isDisabled ? 'not-allowed' : 'pointer',
                      }}
                    >
                      <Icon size={16} strokeWidth={2} />
                      <span style={{ flex: 1 }}>{item.label}</span>
                      {!isPermitted ? (
                        <span
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 3,
                            fontSize: 9.5,
                            color: '#8493A5',
                            background: 'rgba(255,255,255,0.06)',
                            padding: '2px 5px',
                            borderRadius: 4,
                          }}
                        >
                          <Lock size={10} /> RESTRICTED
                        </span>
                      ) : isCapabilityLoading ? (
                        <span
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 3,
                            fontSize: 9.5,
                            color: '#8493A5',
                            padding: '2px 5px',
                            borderRadius: 4,
                            opacity: 0.7,
                          }}
                        >
                          ...
                        </span>
                      ) : isCapabilityError ? (
                        <span
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 3,
                            fontSize: 9.5,
                            color: '#EF4444',
                            background: 'rgba(239,68,68,0.12)',
                            border: '1px solid rgba(239,68,68,0.3)',
                            padding: '2px 5px',
                            borderRadius: 4,
                            fontWeight: 600,
                          }}
                        >
                          <Lock size={10} /> UNAVAILABLE
                        </span>
                      ) : isConfirmedUnlicensed ? (
                        <span
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 3,
                            fontSize: 9.5,
                            color: '#F59E0B',
                            background: 'rgba(245,158,11,0.12)',
                            border: '1px solid rgba(245,158,11,0.3)',
                            padding: '2px 5px',
                            borderRadius: 4,
                            fontWeight: 600,
                          }}
                        >
                          <Lock size={10} /> UNLICENSED
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>

        <div
          style={{
            borderTop: '1px solid rgba(255,255,255,0.08)',
            paddingTop: 12,
            marginTop: 8,
            fontSize: 11.5,
            color: '#8493A5',
            padding: '12px 8px 0',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Globe2 size={12} />
              <span>India pod · active</span>
            </div>
            <span style={{ fontSize: 10, opacity: 0.7 }} className="omni-mono">v{OMNIGRC_VERSION}</span>
          </div>
        </div>
      </div>
    </>
  );
}
