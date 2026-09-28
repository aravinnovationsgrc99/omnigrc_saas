import React from 'react';
import { ShieldAlert, Lock } from 'lucide-react';
import { OperatorRoleType } from '../../types/control-plane';

interface AccessDeniedProps {
  requiredRoles?: OperatorRoleType[];
  currentRole?: OperatorRoleType;
  message?: string;
}

export function AccessDenied({ requiredRoles, currentRole, message }: AccessDeniedProps) {
  return (
    <div className="flex flex-col items-center justify-center p-12 text-center border border-amber-900/50 bg-amber-950/20 rounded-lg">
      <div className="rounded-full bg-amber-900/40 p-4 text-amber-400 mb-4">
        <Lock className="w-8 h-8" aria-hidden="true" />
      </div>
      <h2 className="text-xl font-bold text-white mb-2">403 — Operator Access Restricted</h2>
      <p className="max-w-md text-sm text-gray-300 mb-4">
        {message ||
          'You do not have the required Control Plane operator role authorization to perform this operation or view this section.'}
      </p>

      {requiredRoles && requiredRoles.length > 0 && (
        <div className="rounded border border-cpDark-700 bg-cpDark-900 p-3 text-left font-mono text-xs max-w-sm w-full">
          <div className="text-gray-400 mb-1 flex items-center gap-1">
            <ShieldAlert className="w-3.5 h-3.5 text-amber-400" aria-hidden="true" />
            <span>Required Operator Role(s):</span>
          </div>
          <div className="text-amber-300 font-semibold mb-2">{requiredRoles.join(' | ')}</div>
          {currentRole && (
            <div className="text-gray-400">
              Your Current Role: <span className="text-gray-200">{currentRole}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
