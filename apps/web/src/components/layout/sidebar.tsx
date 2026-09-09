'use client';

import React from 'react';
import { useAuth } from '@/context/auth-context';
import { Role, hasRole } from '@omnigrc/shared';
import {
  LayoutDashboard, ShieldAlert, Boxes, GitMerge, KanbanSquare,
  Settings, Globe2, FileText, Lock, type LucideIcon
} from 'lucide-react';

interface SidebarProps {
  view: string;
  setView: (v: string) => void;
  orgName?: string;
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
    items: [{ key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, enabled: true }],
  },
  {
    label: 'Workspaces',
    items: [
      { key: 'risk', label: 'Risk Register', icon: ShieldAlert, enabled: true },
      { key: 'assets', label: 'Asset & Inventory', icon: Boxes, enabled: true },
      { key: 'controls', label: 'Control Mapping', icon: GitMerge, enabled: true },
      { key: 'board', label: 'Compliance Board', icon: KanbanSquare, enabled: true },
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

export function Sidebar({ view, setView }: SidebarProps) {
  const { user } = useAuth();
  const userRole = user?.role || Role.ANALYST;

  return (
    <div style={{
      width: 232, minWidth: 232, background: '#16233F', display: 'flex', flexDirection: 'column',
      padding: '18px 12px', color: '#fff', height: '100%',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '6px 8px 22px' }}>
        <div style={{
          width: 28, height: 28, borderRadius: 7, background: '#0F6E6A',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 13,
        }}>Ω</div>
        <span style={{ fontSize: 15, fontWeight: 600 }}>OMNiGRC</span>
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }} className="omni-scroll">
        {NAV_SECTIONS.map((section) => (
          <div key={section.label} style={{ marginBottom: 18 }}>
            <div style={{
              fontSize: 10.5, fontWeight: 600, color: '#6E7A8A', textTransform: 'uppercase',
              letterSpacing: 0.6, padding: '0 12px 6px',
            }}>
              {section.label}
            </div>
            {section.items.map((item) => {
              const Icon = item.icon;
              const isActive = view === item.key;
              const isPermitted = !item.roles || hasRole(userRole, item.roles);
              const isDisabled = !item.enabled || !isPermitted;

              return (
                <div
                  key={item.key}
                  className={`omni-navitem ${isActive ? 'active' : ''} ${isDisabled ? 'disabled' : ''}`}
                  onClick={() => item.enabled && isPermitted && setView(item.key)}
                  title={!isPermitted ? 'Restricted to ADMIN role' : !item.enabled ? `Opens in ${item.phase}` : undefined}
                  style={{
                    opacity: !isPermitted ? 0.55 : 1,
                    cursor: isDisabled ? 'not-allowed' : 'pointer',
                  }}
                >
                  <Icon size={16} strokeWidth={2} />
                  <span style={{ flex: 1 }}>{item.label}</span>
                  {!isPermitted && (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 9.5, color: '#8493A5', background: 'rgba(255,255,255,0.06)', padding: '2px 5px', borderRadius: 4 }}>
                      <Lock size={10} /> ADMIN
                    </span>
                  )}
                  {isPermitted && !item.enabled && (
                    <span className="omni-mono" style={{ fontSize: 9.5, color: '#6E7A8A' }}>{item.phase}</span>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <div style={{
        borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 12, marginTop: 8,
        fontSize: 11.5, color: '#8493A5', padding: '12px 8px 0',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Globe2 size={12} />
          <span>India pod · active</span>
        </div>
      </div>
    </div>
  );
}
