'use client';

import React from 'react';
import { useAuth } from '@/context/auth-context';
import { Role, hasRole, OMNIGRC_VERSION } from '@omnigrc/shared';
import {
  LayoutDashboard, ShieldAlert, Boxes, GitMerge, KanbanSquare,
  Settings, Globe2, FileText, Lock, FileCheck, Building2, Bug, ClipboardList, FileSpreadsheet,
  CheckSquare, FileArchive, ShieldCheck, Library, Layers, Sparkles, Building, CheckCircle2, type LucideIcon
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
  enabled: boolean;
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
      { key: 'reports', label: 'Reports & Exports', icon: FileSpreadsheet, enabled: true },
    ],
  },
  {
    label: 'Risk & Operations',
    items: [
      { key: 'risk', label: 'Risk Register', icon: ShieldAlert, enabled: true },
      { key: 'assets', label: 'Asset & Inventory', icon: Boxes, enabled: true },
      { key: 'vulnerabilities', label: 'Vulnerabilities', icon: Bug, enabled: true },
      { key: 'incidents', label: 'Incidents', icon: ShieldCheck, enabled: true },
      { key: 'remediation', label: 'Remediation & Actions', icon: CheckSquare, enabled: true },
    ],
  },
  {
    label: 'Governance & Audits',
    items: [
      { key: 'controls', label: 'Control Mapping', icon: GitMerge, enabled: true },
      { key: 'frameworks', label: 'Framework Library', icon: Library, enabled: true },
      { key: 'policies', label: 'Policy Mgmt', icon: FileCheck, enabled: true },
      { key: 'approvals', label: 'Approval Center', icon: CheckCircle2, enabled: true },
      { key: 'audits', label: 'Business Audits', icon: ClipboardList, enabled: true },
      { key: 'vendors', label: 'Vendor Risk', icon: Building2, enabled: true },
      { key: 'evidence', label: 'Evidence Vault', icon: FileArchive, enabled: true },
      { key: 'board', label: 'Compliance Board', icon: KanbanSquare, enabled: true },
    ],
  },
  {
    label: 'Intelligence & MSSP',
    items: [
      { key: 'intelligence', label: 'GRC Intelligence', icon: Sparkles, enabled: true },
      { key: 'integrations', label: 'Integrations Hub', icon: Layers, enabled: true },
      { key: 'mssp', label: 'MSSP Partner Portal', icon: Building, enabled: true, roles: [Role.MSSP_ADMIN, Role.MSSP_ANALYST, Role.ADMIN] },
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
  const { user } = useAuth();
  const userRole = user?.role || Role.ANALYST;

  return (
    <>
      {/* Backdrop overlay for mobile drawer */}
      {mobileOpen && (
        <div
          onClick={onCloseMobile}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15,23,42,0.5)',
            backdropFilter: 'blur(2px)',
            zIndex: 40,
          }}
          className="lg:hidden"
          aria-hidden="true"
        />
      )}

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
          zIndex: 50,
          transition: 'transform 0.2s ease-in-out',
        }}
        className={`fixed lg:relative inset-y-0 left-0 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
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
        </div>

        <div style={{ flex: 1, overflowY: 'auto' }} className="omni-scroll">
          {NAV_SECTIONS.map((section) => {
            const visibleItems = section.items.filter(
              (item) => !item.roles || hasRole(userRole, item.roles),
            );
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
                  const isDisabled = !item.enabled || !isPermitted;

                  return (
                    <button
                      key={item.key}
                      type="button"
                      className={`omni-navitem w-full text-left ${isActive ? 'active' : ''} ${isDisabled ? 'disabled' : ''}`}
                      onClick={() => item.enabled && isPermitted && setView(item.key)}
                      disabled={isDisabled}
                      aria-current={isActive ? 'page' : undefined}
                      aria-label={`${item.label}${!isPermitted ? ' (Restricted)' : !item.enabled ? ` (${item.phase})` : ''}`}
                      title={!isPermitted ? 'Restricted role' : !item.enabled ? `Opens in ${item.phase}` : undefined}
                      style={{
                        opacity: !isPermitted ? 0.55 : 1,
                        cursor: isDisabled ? 'not-allowed' : 'pointer',
                      }}
                    >
                      <Icon size={16} strokeWidth={2} />
                      <span style={{ flex: 1 }}>{item.label}</span>
                      {!isPermitted && (
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
                      )}
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
