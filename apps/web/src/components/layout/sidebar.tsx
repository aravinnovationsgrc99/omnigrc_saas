'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/context/auth-context';
import { Role, OrgType, hasRole, OMNIGRC_VERSION } from '@omnigrc/shared';
import {
  LayoutDashboard, ShieldAlert, Boxes, GitMerge, KanbanSquare,
  Settings, Globe2, FileText, Lock, FileCheck, Building2, Bug, ClipboardList, FileSpreadsheet,
  CheckSquare, FileArchive, ShieldCheck, Library, Layers, Sparkles, Building, CheckCircle2,
  X, Scale, ChevronLeft, ChevronRight, type LucideIcon
} from 'lucide-react';

interface SidebarProps {
  view: string;
  setView: (v: string) => void;
  orgName?: string;
  mobileOpen?: boolean;
  onCloseMobile?: () => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
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

export function Sidebar({
  view,
  setView,
  mobileOpen = false,
  onCloseMobile,
  collapsed = false,
  onToggleCollapse,
}: SidebarProps) {
  const { user, organization, hasCapability, capabilities, capabilitiesStatus, loading } = useAuth();
  const userRole = user?.role || Role.ANALYST;

  // Floating tooltip state for collapsed mode
  const [tooltip, setTooltip] = useState<{
    label: string;
    sublabel?: string;
    top: number;
  } | null>(null);

  // Handle body-scroll lock and Escape dismissal when mobile drawer is open
  useEffect(() => {
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

  // Keyboard shortcut Ctrl+B or Cmd+B to toggle sidebar collapse
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b' && onToggleCollapse) {
        e.preventDefault();
        onToggleCollapse();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onToggleCollapse]);

  // Width calculation: On mobile, always expanded drawer (240px). On desktop, 240px expanded or 68px collapsed.
  const desktopWidth = collapsed ? 68 : 240;

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

      {/* Mobile Drawer / Desktop Sidebar */}
      <aside
        style={{
          width: mobileOpen ? 240 : desktopWidth,
          minWidth: mobileOpen ? 240 : desktopWidth,
          background: '#16233F',
          display: 'flex',
          flexDirection: 'column',
          padding: collapsed && !mobileOpen ? '16px 8px' : '18px 12px',
          color: '#fff',
          height: '100%',
          zIndex: 75,
          transition: 'width 0.22s cubic-bezier(0.16, 1, 0.3, 1), transform 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
        className={`fixed lg:relative inset-y-0 left-0 lg:z-auto shrink-0 select-none ${
          mobileOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full lg:translate-x-0'
        }`}
        aria-label="Main Navigation"
      >
        {/* Header: Logo, Brand Name & Collapse / Close Controls */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: collapsed && !mobileOpen ? 'center' : 'space-between',
            padding: collapsed && !mobileOpen ? '4px 0 16px' : '6px 8px 20px',
            borderBottom: '1px solid rgba(255,255,255,0.08)',
            marginBottom: 12,
          }}
        >
          {collapsed && !mobileOpen ? (
            /* Collapsed Header */
            <div className="flex flex-col items-center gap-2.5">
              <img
                src="/brand/omnigrc-logo.png"
                alt="OMNiGRC Logo"
                width={32}
                height={32}
                className="w-8 h-8 rounded-lg object-contain shadow-sm shrink-0"
              />
              {onToggleCollapse && (
                <button
                  type="button"
                  onClick={onToggleCollapse}
                  className="hidden lg:flex items-center justify-center p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-white/10 transition-colors focus-visible:outline-2 focus-visible:outline-teal-500"
                  aria-label="Expand sidebar (Ctrl+B)"
                  title="Expand sidebar (Ctrl+B)"
                >
                  <ChevronRight size={16} />
                </button>
              )}
            </div>
          ) : (
            /* Expanded Header */
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                <img
                  src="/brand/omnigrc-logo.png"
                  alt="OMNiGRC Logo"
                  width={30}
                  height={30}
                  className="w-7.5 h-7.5 rounded-lg object-contain shrink-0 shadow-sm"
                />
                <div className="flex flex-col min-w-0">
                  <span style={{ fontSize: 16, fontWeight: 700, color: '#FFFFFF', letterSpacing: '-0.02em', lineHeight: 1.2 }}>
                    OMNiGRC
                  </span>
                  <span style={{ fontSize: 10, color: '#8493A5', fontWeight: 500, letterSpacing: '0.04em' }}>
                    Enterprise GRC
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-1">
                {/* Desktop Collapse Button */}
                {onToggleCollapse && (
                  <button
                    type="button"
                    onClick={onToggleCollapse}
                    className="hidden lg:flex items-center justify-center p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-white/10 transition-colors focus-visible:outline-2 focus-visible:outline-teal-500"
                    aria-label="Collapse sidebar (Ctrl+B)"
                    title="Collapse sidebar (Ctrl+B)"
                  >
                    <ChevronLeft size={17} />
                  </button>
                )}

                {/* Mobile Close Button */}
                {mobileOpen && (
                  <button
                    onClick={onCloseMobile}
                    className="lg:hidden text-slate-400 hover:text-white p-1 rounded-md transition-colors focus-visible:outline-2 focus-visible:outline-teal-500"
                    aria-label="Close navigation menu"
                  >
                    <X size={18} />
                  </button>
                )}
              </div>
            </>
          )}
        </div>

        {/* Scrollable Navigation Items */}
        <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }} className="omni-scroll">
          {NAV_SECTIONS.map((section, sIdx) => {
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
              <div key={section.label} style={{ marginBottom: collapsed && !mobileOpen ? 10 : 16 }}>
                {collapsed && !mobileOpen ? (
                  sIdx > 0 ? (
                    <div className="my-2 border-t border-white/10 mx-2" aria-hidden="true" />
                  ) : null
                ) : (
                  <div
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      color: '#6E7A8A',
                      textTransform: 'uppercase',
                      letterSpacing: 0.8,
                      padding: '0 10px 6px',
                    }}
                  >
                    {section.label}
                  </div>
                )}

                <div className="space-y-1">
                  {visibleItems.map((item) => {
                    const Icon = item.icon;
                    const isActive = view === item.key;
                    const isPermitted = !item.roles || hasRole(userRole, item.roles);

                    const isCapabilityRequired = !!item.capabilityCode;
                    const isCapabilityLoading =
                      isCapabilityRequired &&
                      (loading || capabilitiesStatus === 'loading' || (capabilities === null && capabilitiesStatus !== 'error'));
                    const isCapabilityError =
                      isCapabilityRequired && !loading && (capabilitiesStatus === 'error' || capabilities === null);
                    const isConfirmedLicensed =
                      item.capabilityCode === 'REGULATORY_INTELLIGENCE'
                        ? true
                        : item.capabilityCode ? (capabilities ? hasCapability(item.capabilityCode) : false) : true;
                    const isConfirmedUnlicensed =
                      isCapabilityRequired && !isCapabilityLoading && !isCapabilityError && !isConfirmedLicensed;

                    const isLicensed = !isCapabilityRequired || isConfirmedLicensed;
                    const isDisabled = !item.enabled || !isPermitted;

                    const sublabel = !isPermitted
                      ? 'Restricted Role'
                      : isCapabilityLoading
                      ? 'Verifying License...'
                      : isCapabilityError
                      ? 'License Unavailable'
                      : isConfirmedUnlicensed
                      ? 'Commercial Unlicensed'
                      : !item.enabled
                      ? `Opens in ${item.phase}`
                      : undefined;

                    return (
                      <button
                        key={item.key}
                        type="button"
                        className={`omni-navitem w-full ${
                          collapsed && !mobileOpen ? 'justify-center !px-0 !py-2.5 !gap-0' : 'text-left'
                        } ${isActive ? 'active' : ''} ${isDisabled ? 'disabled' : ''} ${
                          !isLicensed && !isCapabilityLoading ? 'unlicensed' : ''
                        }`}
                        onClick={() => {
                          if (isPermitted && item.enabled !== false) {
                            setView(item.key);
                            if (mobileOpen && onCloseMobile) {
                              onCloseMobile();
                            }
                          }
                        }}
                        onMouseEnter={(e) => {
                          if (collapsed && !mobileOpen) {
                            const rect = e.currentTarget.getBoundingClientRect();
                            setTooltip({
                              label: item.label,
                              sublabel,
                              top: rect.top + rect.height / 2,
                            });
                          }
                        }}
                        onMouseLeave={() => {
                          if (collapsed && !mobileOpen) {
                            setTooltip(null);
                          }
                        }}
                        onFocus={(e) => {
                          if (collapsed && !mobileOpen) {
                            const rect = e.currentTarget.getBoundingClientRect();
                            setTooltip({
                              label: item.label,
                              sublabel,
                              top: rect.top + rect.height / 2,
                            });
                          }
                        }}
                        onBlur={() => {
                          if (collapsed && !mobileOpen) {
                            setTooltip(null);
                          }
                        }}
                        disabled={isDisabled}
                        aria-current={isActive ? 'page' : undefined}
                        aria-label={`${item.label}${sublabel ? ` (${sublabel})` : ''}`}
                        title={
                          collapsed && !mobileOpen
                            ? undefined
                            : !isPermitted
                            ? 'Restricted role'
                            : isCapabilityLoading
                            ? 'Verifying module license...'
                            : isCapabilityError
                            ? 'Service capability unavailable'
                            : !isLicensed
                            ? 'Commercial module not licensed'
                            : !item.enabled
                            ? `Opens in ${item.phase}`
                            : undefined
                        }
                        style={{
                          opacity: !isPermitted ? 0.55 : !isLicensed && !isCapabilityLoading ? 0.75 : 1,
                          cursor: isDisabled ? 'not-allowed' : 'pointer',
                        }}
                      >
                        <Icon size={17} strokeWidth={2} className="shrink-0" />

                        {(!collapsed || mobileOpen) && (
                          <>
                            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {item.label}
                            </span>

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
                          </>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer: Region & Version Info */}
        <div
          className="pb-safe"
          style={{
            borderTop: '1px solid rgba(255,255,255,0.08)',
            paddingTop: 10,
            marginTop: 6,
            fontSize: 11,
            color: '#8493A5',
            padding: collapsed && !mobileOpen ? '10px 0 4px' : '10px 6px 4px',
          }}
        >
          {collapsed && !mobileOpen ? (
            <div
              className="flex justify-center cursor-default"
              title={`India pod · active (v${OMNIGRC_VERSION})`}
              onMouseEnter={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                setTooltip({
                  label: 'India Pod · Active',
                  sublabel: `v${OMNIGRC_VERSION}`,
                  top: rect.top + rect.height / 2,
                });
              }}
              onMouseLeave={() => setTooltip(null)}
            >
              <Globe2 size={15} className="text-teal-400" />
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Globe2 size={13} className="text-teal-400" />
                <span>India pod · active</span>
              </div>
              <span style={{ fontSize: 10, opacity: 0.75 }} className="omni-mono">v{OMNIGRC_VERSION}</span>
            </div>
          )}
        </div>
      </aside>

      {/* Floating Accessible Tooltip for Collapsed Sidebar Items (immune to overflow clipping) */}
      {collapsed && !mobileOpen && tooltip && (
        <div
          role="tooltip"
          style={{
            position: 'fixed',
            left: 74,
            top: tooltip.top,
            transform: 'translateY(-50%)',
            zIndex: 9999,
            background: '#0F1A2E',
            border: '1px solid rgba(255,255,255,0.18)',
            borderRadius: 7,
            padding: '5px 9px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.45)',
            pointerEvents: 'none',
          }}
          className="omni-fade-in flex flex-col gap-0.5"
        >
          <span style={{ fontSize: 12, fontWeight: 600, color: '#FFFFFF', whiteSpace: 'nowrap' }}>
            {tooltip.label}
          </span>
          {tooltip.sublabel && (
            <span style={{ fontSize: 10, color: '#F59E0B', fontWeight: 500, whiteSpace: 'nowrap' }}>
              {tooltip.sublabel}
            </span>
          )}
        </div>
      )}
    </>
  );
}
