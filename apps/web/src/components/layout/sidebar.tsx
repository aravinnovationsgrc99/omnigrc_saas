'use client';

import React from 'react';
import {
  LayoutDashboard, ShieldAlert, Boxes, GitMerge, KanbanSquare,
  Settings, Globe2
} from 'lucide-react';

interface SidebarProps {
  view: string;
  setView: (v: string) => void;
  orgName?: string;
}

export const NAV_SECTIONS = [
  {
    label: 'Overview',
    items: [{ key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, enabled: true }],
  },
  {
    label: 'Workspaces',
    items: [
      { key: 'risk', label: 'Risk Register', icon: ShieldAlert, enabled: false, phase: 'Phase 3' },
      { key: 'assets', label: 'Asset & Inventory', icon: Boxes, enabled: false, phase: 'Phase 2' },
      { key: 'controls', label: 'Control Mapping', icon: GitMerge, enabled: false, phase: 'Phase 4' },
      { key: 'board', label: 'Compliance Board', icon: KanbanSquare, enabled: false, phase: 'Phase 5' },
    ],
  },
  {
    label: 'System',
    items: [{ key: 'settings', label: 'Settings', icon: Settings, enabled: true }],
  },
];

export function Sidebar({ view, setView }: SidebarProps) {
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
              return (
                <div
                  key={item.key}
                  className={`omni-navitem ${isActive ? 'active' : ''} ${!item.enabled ? 'disabled' : ''}`}
                  onClick={() => item.enabled && setView(item.key)}
                  title={!item.enabled ? `Opens in ${item.phase}` : undefined}
                >
                  <Icon size={16} strokeWidth={2} />
                  <span style={{ flex: 1 }}>{item.label}</span>
                  {!item.enabled && (
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
