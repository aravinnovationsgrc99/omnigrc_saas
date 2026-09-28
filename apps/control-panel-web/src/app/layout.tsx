import React from 'react';
import type { Metadata } from 'next';
import './globals.css';
import { AuthProvider } from '../lib/auth-context';
import { ControlPanelShell } from '../components/layout/control-panel-shell';

export const metadata: Metadata = {
  title: 'Arav Control Panel — OMNiGRC Platform Authority',
  description: 'Authoritative internal management console for Arav Innovations platform operators.',
  robots: 'noindex, nofollow',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="bg-cpDark-950 text-gray-100 antialiased">
        <AuthProvider>
          <ControlPanelShell>{children}</ControlPanelShell>
        </AuthProvider>
      </body>
    </html>
  );
}
