'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Building2,
  KeyRound,
  Sliders,
  Server,
  Activity,
  ShieldCheck,
  ShieldAlert,
  MessageSquare,
  Settings,
  X,
} from 'lucide-react';
import { OperatorRoleType } from '../../types/control-plane';

interface SidebarProps {
  operatorRole?: OperatorRoleType;
  isOpen: boolean;
  onClose: () => void;
}

interface NavItem {
  name: string;
  href: string;
  icon: React.ElementType;
  roles?: OperatorRoleType[];
}

const NAV_ITEMS: NavItem[] = [
  {
    name: 'Overview',
    href: '/overview',
    icon: LayoutDashboard,
  },
  {
    name: 'Organizations',
    href: '/organizations',
    icon: Building2,
  },
  {
    name: 'Licensing',
    href: '/licensing',
    icon: KeyRound,
    roles: ['PLATFORM_SUPER_ADMIN', 'COMMERCIAL_OPERATOR', 'SECURITY_AUDIT', 'READ_ONLY_AUDITOR', 'OPERATIONS_ENGINEER'],
  },
  {
    name: 'Services',
    href: '/services',
    icon: Sliders,
    roles: ['PLATFORM_SUPER_ADMIN', 'OPERATIONS_ENGINEER', 'SECURITY_AUDIT', 'READ_ONLY_AUDITOR'],
  },
  {
    name: 'Deployments',
    href: '/deployments',
    icon: Server,
    roles: ['PLATFORM_SUPER_ADMIN', 'COMMERCIAL_OPERATOR', 'OPERATIONS_ENGINEER', 'SUPPORT_ENGINEER', 'SECURITY_AUDIT', 'READ_ONLY_AUDITOR'],
  },
  {
    name: 'Break-Glass Ops',
    href: '/operations/break-glass',
    icon: ShieldAlert,
    roles: ['PLATFORM_SUPER_ADMIN', 'OPERATIONS_ENGINEER', 'SECURITY_AUDIT', 'READ_ONLY_AUDITOR', 'SUPPORT_ENGINEER', 'COMMERCIAL_OPERATOR'],
  },
  {
    name: 'Operations',
    href: '/operations',
    icon: Activity,
    roles: ['PLATFORM_SUPER_ADMIN', 'OPERATIONS_ENGINEER', 'SUPPORT_ENGINEER'],
  },
  {
    name: 'Audit & Security',
    href: '/audit',
    icon: ShieldCheck,
    roles: ['PLATFORM_SUPER_ADMIN', 'SECURITY_AUDIT', 'READ_ONLY_AUDITOR'],
  },
  {
    name: 'Communications',
    href: '/communications',
    icon: MessageSquare,
    roles: ['PLATFORM_SUPER_ADMIN', 'SUPPORT_ENGINEER', 'COMMERCIAL_OPERATOR'],
  },
  {
    name: 'System',
    href: '/system',
    icon: Settings,
    roles: ['PLATFORM_SUPER_ADMIN'],
  },
];

export function Sidebar({ operatorRole, isOpen, onClose }: SidebarProps) {
  const pathname = usePathname();

  const isRoleAllowed = (allowedRoles?: OperatorRoleType[]) => {
    if (!allowedRoles || !operatorRole) return true;
    return allowedRoles.includes(operatorRole);
  };

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 transform border-r border-cpDark-800 bg-cpDark-950 transition-transform duration-200 ease-in-out lg:static lg:translate-x-0 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
        aria-label="Control Panel Sidebar Navigation"
      >
        <div className="flex h-16 items-center justify-between border-b border-cpDark-800 px-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-aravBlue-700 text-white font-mono font-bold text-sm">
              CP
            </div>
            <div className="flex flex-col">
              <span className="font-bold text-sm tracking-wide text-white">ARAV CONTROL PANEL</span>
              <span className="font-mono text-[10px] text-gray-400">Platform Authority</span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded p-1 text-gray-400 hover:text-white lg:hidden"
            aria-label="Close Sidebar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 space-y-1 p-3">
          {NAV_ITEMS.filter((item) => isRoleAllowed(item.roles)).map((item) => {
            const isActive = pathname === item.href || pathname?.startsWith(`${item.href}/`);
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClose}
                className={`flex items-center gap-3 rounded-md px-3 py-2.5 text-xs font-medium transition-colors ${
                  isActive
                    ? 'bg-aravBlue-900/60 text-white border border-aravBlue-700/60 font-semibold'
                    : 'text-gray-300 hover:bg-cpDark-900 hover:text-white'
                }`}
                aria-current={isActive ? 'page' : undefined}
              >
                <Icon className={`h-4 w-4 ${isActive ? 'text-aravBlue-400' : 'text-gray-400'}`} aria-hidden="true" />
                <span>{item.name}</span>
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-cpDark-800 p-4 font-mono text-[11px] text-gray-400">
          <div>Authority: CP-6.1 Active</div>
          <div className="text-gray-400">Environment: Production Control</div>
        </div>
      </aside>
    </>
  );
}
