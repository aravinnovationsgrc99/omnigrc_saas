'use client';

import React from 'react';
import { Menu, LogOut, ShieldCheck, User } from 'lucide-react';
import { useAuth } from '../../lib/auth-context';
import { StatusBadge } from '../ui/status-badge';

interface HeaderProps {
  onToggleSidebar: () => void;
}

export function Header({ onToggleSidebar }: HeaderProps) {
  const { operator, logout } = useAuth();

  return (
    <header className="sticky top-0 z-30 flex h-16 w-full items-center justify-between border-b border-cpDark-800 bg-cpDark-900/90 px-4 backdrop-blur-md">
      <div className="flex items-center gap-3">
        <button
          onClick={onToggleSidebar}
          className="rounded p-1.5 text-gray-400 hover:bg-cpDark-800 hover:text-white focus-ring lg:hidden"
          aria-label="Open Sidebar"
        >
          <Menu className="h-5 w-5" />
        </button>

        <div className="flex items-center gap-2 font-mono text-xs text-gray-400">
          <span className="hidden sm:inline">Arav Innovations</span>
          <span className="hidden sm:inline text-gray-400">/</span>
          <span className="text-white font-medium">Control Panel Shell</span>
        </div>
      </div>

      {operator && (
        <div className="flex items-center gap-4">
          {/* Real Operator Identity Display */}
          <div className="flex items-center gap-3 border-l border-cpDark-800 pl-4">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-cpDark-800 border border-cpDark-700 text-aravBlue-400">
              <User className="h-4 w-4" aria-hidden="true" />
            </div>

            <div className="flex flex-col text-left">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-white">{operator.fullName || operator.email}</span>
                {operator.mfaEnabled && (
                  <span className="inline-flex items-center text-emerald-400" title="MFA Protection Active">
                    <ShieldCheck className="h-3.5 w-3.5" aria-label="MFA Active" />
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="font-mono text-[10px] text-gray-400">{operator.email}</span>
                <StatusBadge status={operator.role} size="sm" />
              </div>
            </div>
          </div>

          <button
            onClick={logout}
            className="flex items-center gap-1.5 rounded-md border border-cpDark-700 bg-cpDark-800 px-3 py-1.5 text-xs font-medium text-gray-300 hover:bg-rose-950/60 hover:text-rose-300 hover:border-rose-800 focus-ring transition-colors"
            title="Sign Out of Operator Session"
          >
            <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="hidden sm:inline">Sign Out</span>
          </button>
        </div>
      )}
    </header>
  );
}
