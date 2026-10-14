'use client';

import React from 'react';
import { ReportsView } from '@/components/reports/reports-view';
import { useAuth } from '@/context/auth-context';
import { ModuleNotLicensedView } from '@/components/ui/module-not-licensed-view';

export default function ReportsPage() {
  const { hasCapability, getCapabilityState, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-teal-700 font-semibold">
        Loading...
      </div>
    );
  }

  if (!hasCapability('REPORTING_MODULE')) {
    return (
      <ModuleNotLicensedView
        moduleName="Reports & Exports"
        capabilityCode="REPORTING_MODULE"
        reason={getCapabilityState('REPORTING_MODULE')?.reason}
        onNavigateHome={() => {
          if (typeof window !== 'undefined') window.location.href = '/';
        }}
      />
    );
  }

  return <ReportsView />;
}
