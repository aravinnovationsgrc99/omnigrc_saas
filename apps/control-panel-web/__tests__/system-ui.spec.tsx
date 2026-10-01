import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import SystemPage from '../src/app/system/page';
import { useAuth } from '../src/lib/auth-context';
import { controlPlaneApi } from '../src/lib/control-plane-api';
import { SystemOverview, KeyRegistryMetadata } from '../src/types/control-plane';

// Mock Auth Context
jest.mock('../src/lib/auth-context', () => ({
  useAuth: jest.fn(),
}));

// Mock Control Plane API
jest.mock('../src/lib/control-plane-api', () => {
  const original = jest.requireActual('../src/lib/control-plane-api');
  return {
    ...original,
    controlPlaneApi: {
      getSystemOverview: jest.fn(),
      getKeyRegistry: jest.fn(),
    },
  };
});

// Mock Next.js router
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  usePathname: () => '/system',
}));

describe('CP-7 System Observatory & Key Registry UI Surface', () => {
  const superAdminOperator = {
    id: 'op_admin_1',
    email: 'admin@arav.io',
    fullName: 'Platform Super Admin',
    role: 'PLATFORM_SUPER_ADMIN' as const,
    status: 'ACTIVE' as const,
    mfaEnabled: true,
  };

  const sampleOverview: SystemOverview = {
    version: '1.0.0',
    environment: 'test',
    databaseMigrationCount: 11,
    latestMigration: '20261001000000_add_cp_platform_announcements',
    health: {
      database: { status: 'healthy', latencyMs: 3 },
      redis: { status: 'configured' },
      resend: { status: 'configured' },
      aiProviders: { gemini: 'configured', anthropic: 'configured' },
    },
  };

  const sampleKeyRegistry: KeyRegistryMetadata = {
    keyId: 'arav-license-v1-2026',
    algorithm: 'Ed25519',
    purpose: 'LICENSE_ARTIFACT_SIGNING',
    status: 'ACTIVE',
    publicKeyFingerprint: 'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    canonicalization: 'RFC 8785 JCS',
    formatVersion: '1.0',
    securityNotes: 'Private signing key material is held in infrastructure secrets and never exposed via API.',
  };

  beforeEach(() => {
    jest.clearAllMocks();

    (useAuth as jest.Mock).mockReturnValue({
      operator: superAdminOperator,
      isAuthenticated: true,
      isLoading: false,
    });

    (controlPlaneApi.getSystemOverview as jest.Mock).mockResolvedValue(sampleOverview);
    (controlPlaneApi.getKeyRegistry as jest.Mock).mockResolvedValue(sampleKeyRegistry);
  });

  it('renders real system overview metadata and health cards', async () => {
    render(<SystemPage />);

    await waitFor(() => {
      expect(screen.getByText('System Overview & Key Registry')).toBeInTheDocument();
    });

    expect(screen.getByText('v1.0.0')).toBeInTheDocument();
    expect(screen.getByText('test')).toBeInTheDocument();
    expect(screen.getByText('11 Applied')).toBeInTheDocument();
    expect(screen.getByText('PostgreSQL DB')).toBeInTheDocument();
  });

  it('renders cryptographic key metadata and security boundary note', async () => {
    render(<SystemPage />);

    await waitFor(() => {
      expect(screen.getByText('arav-license-v1-2026')).toBeInTheDocument();
    });

    expect(screen.getByText('Ed25519')).toBeInTheDocument();
    expect(screen.getByText('LICENSE_ARTIFACT_SIGNING')).toBeInTheDocument();
    expect(screen.getByText('sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')).toBeInTheDocument();
    expect(screen.getByText('Private signing key material is held in infrastructure secrets and never exposed via API.')).toBeInTheDocument();
  });

  it('renders authority directory links without mutation controls', async () => {
    render(<SystemPage />);

    await waitFor(() => {
      expect(screen.getByText('Licensing & Artifacts')).toBeInTheDocument();
    });

    expect(screen.getByText('Service Control')).toBeInTheDocument();
    expect(screen.getByText('Organization Control')).toBeInTheDocument();
    expect(screen.getByText('Break-Glass Operations')).toBeInTheDocument();
    expect(screen.getByText('Communications')).toBeInTheDocument();
    expect(screen.getByText('Operators & MFA')).toBeInTheDocument();

    // Verify zero secret fields or secret reveal buttons exist
    expect(screen.queryByText(/reveal/i)).not.toBeInTheDocument();
    expect(screen.queryAllByText(/secret/i).length).toBeGreaterThan(0); // Security notes banners
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument(); // Read-only dashboard
  });
});
