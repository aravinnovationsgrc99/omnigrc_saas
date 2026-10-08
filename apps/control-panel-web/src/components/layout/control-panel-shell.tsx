'use client';

import React, { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '../../lib/auth-context';
import { Sidebar } from './sidebar';
import { Header } from './header';
import { LoadingSpinner } from '../ui/loading-spinner';

export function ControlPanelShell({ children }: { children: React.ReactNode }) {
  const { operator, isLoading, isAuthenticated } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!isLoading && !isAuthenticated && pathname !== '/login') {
      router.replace('/login');
    }
  }, [isLoading, isAuthenticated, pathname, router]);

  if (pathname === '/login') {
    return <main className="min-h-screen bg-cpDark-950">{children}</main>;
  }

  if (isLoading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-cpDark-950">
        <LoadingSpinner label="Authenticating Operator Session..." size="lg" />
      </div>
    );
  }

  if (!operator) {
    return null;
  }

  return (
    <div className="flex min-h-screen bg-cpDark-950 text-gray-100">
      <Sidebar
        operatorRole={operator.role}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      <div className="flex flex-1 flex-col min-w-0">
        <Header onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} />

        <main className="flex-1 p-3.5 sm:p-6 overflow-y-auto">
          <div className="mx-auto max-w-7xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
