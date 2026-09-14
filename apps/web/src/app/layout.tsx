import type { Metadata, Viewport } from 'next';
import './globals.css';
import { AuthProvider } from '@/context/auth-context';

export const metadata: Metadata = {
  title: 'OMNiGRC — Enterprise GRC Platform',
  description: 'Risk, assets, and controls — one register, four frameworks, no spreadsheets.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="omni-root">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}

