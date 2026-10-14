'use client';

import React from 'react';
import { ToastProvider } from '@/context/toast-context';
import { ApprovalCenterView } from '@/components/approval/approval-center-view';
import { useAuth } from '@/context/auth-context';
import { ModuleNotLicensedView } from '@/components/ui/module-not-licensed-view';

export const dynamic = 'force-dynamic';

export default function ApprovalsPage() {
  const { hasCapability, getCapabilityState, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-teal-700 font-semibold">
        Loading...
      </div>
    );
  }

  if (!hasCapability('APPROVAL_ENGINE')) {
    return (
      <ModuleNotLicensedView
        moduleName="Approval Center"
        capabilityCode="APPROVAL_ENGINE"
        reason={getCapabilityState('APPROVAL_ENGINE')?.reason}
        onNavigateHome={() => {
          if (typeof window !== 'undefined') window.location.href = '/';
        }}
      />
    );
  }

  return (
    <ToastProvider>
      <ApprovalCenterView />
    </ToastProvider>
  );
}
