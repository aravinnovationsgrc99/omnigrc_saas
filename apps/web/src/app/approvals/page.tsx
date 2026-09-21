'use client';

import React from 'react';
import { ToastProvider } from '@/context/toast-context';
import { ApprovalCenterView } from '@/components/approval/approval-center-view';

export const dynamic = 'force-dynamic';

export default function ApprovalsPage() {
  return (
    <ToastProvider>
      <ApprovalCenterView />
    </ToastProvider>
  );
}
