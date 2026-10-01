'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  Server,
  ShieldCheck,
  Key,
  RefreshCw,
  Lock,
  Database,
  Cpu,
  Mail,
  Bot,
  ExternalLink,
  Info,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Building2,
  Sliders,
  Megaphone,
  Users,
  Shield,
  FileCode,
  Activity,
} from 'lucide-react';
import { useAuth } from '../../lib/auth-context';
import { controlPlaneApi, ControlPlaneApiError } from '../../lib/control-plane-api';
import { SystemOverview, KeyRegistryMetadata } from '../../types/control-plane';
import { StatusBadge } from '../../components/ui/status-badge';
import { ErrorState } from '../../components/ui/error-state';
import { AccessDenied } from '../../components/ui/access-denied';

export default function SystemPage() {
  const { operator, isAuthenticated, isLoading: isAuthLoading } = useAuth();

  const [overview, setOverview] = useState<SystemOverview | null>(null);
  const [keyRegistry, setKeyRegistry] = useState<KeyRegistryMetadata | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<ControlPlaneApiError | null>(null);

  // RBAC Permission Check
  const canViewSystem =
    operator?.role === 'PLATFORM_SUPER_ADMIN' ||
    operator?.role === 'SECURITY_AUDIT' ||
    operator?.role === 'READ_ONLY_AUDITOR';

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const [overviewData, keyData] = await Promise.all([
        controlPlaneApi.getSystemOverview(),
        controlPlaneApi.getKeyRegistry(),
      ]);

      setOverview(overviewData);
      setKeyRegistry(keyData);
    } catch (err: any) {
      if (err instanceof ControlPlaneApiError) {
        setError(err);
      } else {
        setError(new ControlPlaneApiError(500, err.message || 'Failed to load Control Plane system dashboard'));
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      fetchData();
    }
  }, [isAuthenticated, fetchData]);

  if (isAuthLoading || (isLoading && !overview && !error)) {
    return (
      <div className="flex h-64 items-center justify-center">
        <RefreshCw className="h-6 w-6 animate-spin text-aravBlue-400" />
      </div>
    );
  }

  if (error && error.statusCode === 403) {
    return (
      <AccessDenied
        resource="Control Plane System Observatory API"
        requiredRole="PLATFORM_SUPER_ADMIN / SECURITY_AUDIT / READ_ONLY_AUDITOR"
      />
    );
  }

  if (!canViewSystem) {
    return (
      <AccessDenied
        resource="System Overview & Key Registry"
        requiredRole="PLATFORM_SUPER_ADMIN / SECURITY_AUDIT / READ_ONLY_AUDITOR"
      />
    );
  }

  if (error) {
    return (
      <ErrorState
        statusCode={error.statusCode}
        title="Failed to load System Observatory"
        message={error.message}
        correlationId={error.correlationId}
        onRetry={fetchData}
      />
    );
  }

  const renderConfiguredBadge = (status: 'configured' | 'unconfigured') => {
    if (status === 'configured') {
      return <span className="inline-flex items-center gap-1 rounded bg-emerald-500/10 px-2 py-0.5 text-[11px] font-bold text-emerald-400 border border-emerald-500/20"><CheckCircle2 className="h-3 w-3" /> Configured</span>;
    }
    return <span className="inline-flex items-center gap-1 rounded bg-gray-500/10 px-2 py-0.5 text-[11px] font-medium text-gray-400 border border-gray-500/20"><Info className="h-3 w-3" /> Unconfigured</span>;
  };

  return (
    <div className="space-y-6 font-mono">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between border-b border-cpDark-800 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <Server className="h-6 w-6 text-aravBlue-400" />
            <h1 className="text-xl font-bold text-white tracking-tight">System Overview & Key Registry</h1>
          </div>
          <p className="mt-1 text-xs text-gray-400">
            Control Plane platform health observability, database migration status, and cryptographic key metadata.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 rounded-md border border-cpDark-700 bg-cpDark-900 px-3 py-1 text-xs text-gray-300">
            <Lock className="h-3.5 w-3.5 text-emerald-400" />
            <span>Auditor Access ({operator?.role})</span>
          </div>

          <button
            onClick={fetchData}
            disabled={isLoading}
            className="inline-flex items-center gap-2 rounded border border-cpDark-700 bg-cpDark-800 px-3.5 py-1.5 text-xs font-medium text-gray-300 hover:bg-cpDark-700 hover:text-white transition-colors focus-ring"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin text-aravBlue-400' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Security Scope Banner */}
      <div className="rounded-lg border border-cpDark-800 bg-cpDark-950 p-4 text-xs text-gray-300 space-y-2">
        <div className="flex items-center gap-2 font-bold text-emerald-400">
          <ShieldCheck className="h-4 w-4 shrink-0" />
          <span>Control Plane Read-Only Observability Boundary</span>
        </div>
        <p className="text-[11px] text-gray-400 leading-relaxed">
          Private key material, AES encryption keys, JWT signing secrets, database credentials, and third-party API keys are held strictly inside infrastructure environment secrets. They are never rendered or transmitted to browser endpoints.
        </p>
      </div>

      {/* SECTION 1: SYSTEM OVERVIEW */}
      <div className="space-y-4">
        <h2 className="text-sm font-bold uppercase tracking-wider text-aravBlue-300 flex items-center gap-2">
          <Activity className="h-4 w-4" />
          <span>1. Platform System Overview & Health</span>
        </h2>

        {/* Overview KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="rounded-lg border border-cpDark-800 bg-cpDark-900 p-4 shadow-md">
            <span className="text-[11px] font-medium uppercase tracking-wider text-gray-400">Software Version</span>
            <div className="mt-1 text-xl font-bold text-white">v{overview?.version}</div>
            <span className="text-[10px] text-gray-500">OMNiGRC Core Engine</span>
          </div>

          <div className="rounded-lg border border-cpDark-800 bg-cpDark-900 p-4 shadow-md">
            <span className="text-[11px] font-medium uppercase tracking-wider text-emerald-400">Environment Mode</span>
            <div className="mt-1 text-xl font-bold uppercase text-emerald-300">{overview?.environment}</div>
            <span className="text-[10px] text-gray-500">Execution Runtime Profile</span>
          </div>

          <div className="rounded-lg border border-cpDark-800 bg-cpDark-900 p-4 shadow-md">
            <span className="text-[11px] font-medium uppercase tracking-wider text-aravBlue-400">Database Migrations</span>
            <div className="mt-1 text-xl font-bold text-aravBlue-300">{overview?.databaseMigrationCount} Applied</div>
            <span className="text-[10px] text-gray-400 truncate block font-mono" title={overview?.latestMigration}>
              Latest: {overview?.latestMigration}
            </span>
          </div>
        </div>

        {/* Health Component Status Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* PostgreSQL */}
          <div className="rounded-lg border border-cpDark-800 bg-cpDark-900 p-4 shadow-md space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 font-bold text-xs text-white">
                <Database className="h-4 w-4 text-aravBlue-400" />
                <span>PostgreSQL DB</span>
              </div>
              <StatusBadge
                status={overview?.health.database.status === 'healthy' ? 'ACTIVE' : 'SUSPENDED'}
                label={overview?.health.database.status === 'healthy' ? 'HEALTHY' : 'UNHEALTHY'}
                size="sm"
              />
            </div>
            <div className="text-[11px] text-gray-400">
              Latency: <span className="text-white font-bold">{overview?.health.database.latencyMs ?? 'N/A'} ms</span>
            </div>
          </div>

          {/* Redis */}
          <div className="rounded-lg border border-cpDark-800 bg-cpDark-900 p-4 shadow-md space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 font-bold text-xs text-white">
                <Cpu className="h-4 w-4 text-red-400" />
                <span>Redis Cache</span>
              </div>
              {renderConfiguredBadge(overview?.health.redis.status || 'unconfigured')}
            </div>
            <div className="text-[11px] text-gray-400">
              Upstash TLS Connection
            </div>
          </div>

          {/* Resend Mailer */}
          <div className="rounded-lg border border-cpDark-800 bg-cpDark-900 p-4 shadow-md space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 font-bold text-xs text-white">
                <Mail className="h-4 w-4 text-amber-400" />
                <span>Resend Mailer</span>
              </div>
              {renderConfiguredBadge(overview?.health.resend.status || 'unconfigured')}
            </div>
            <div className="text-[11px] text-gray-400">
              Server-Side Mail API
            </div>
          </div>

          {/* AI Providers */}
          <div className="rounded-lg border border-cpDark-800 bg-cpDark-900 p-4 shadow-md space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 font-bold text-xs text-white">
                <Bot className="h-4 w-4 text-purple-400" />
                <span>AI Providers</span>
              </div>
              {renderConfiguredBadge(overview?.health.aiProviders.gemini || 'unconfigured')}
            </div>
            <div className="text-[11px] text-gray-400">
              Gemini / Anthropic Models
            </div>
          </div>
        </div>
      </div>

      {/* SECTION 2: CRYPTOGRAPHIC KEY REGISTRY */}
      <div className="space-y-4 pt-2">
        <h2 className="text-sm font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-2">
          <Key className="h-4 w-4" />
          <span>2. Cryptographic Key Registry (Derived Metadata)</span>
        </h2>

        <div className="rounded-lg border border-cpDark-800 bg-cpDark-900 p-5 shadow-xl space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-gray-300 bg-cpDark-950 p-4 rounded border border-cpDark-800">
            <div>
              <span className="text-gray-500 block text-[10px] uppercase font-bold">Active License Key ID</span>
              <span className="font-bold text-aravBlue-300 text-sm">{keyRegistry?.keyId}</span>
            </div>

            <div>
              <span className="text-gray-500 block text-[10px] uppercase font-bold">Cryptographic Algorithm</span>
              <span className="font-bold text-emerald-300">{keyRegistry?.algorithm}</span>
            </div>

            <div>
              <span className="text-gray-500 block text-[10px] uppercase font-bold">Key Purpose</span>
              <span className="font-semibold text-white">{keyRegistry?.purpose}</span>
            </div>

            <div>
              <span className="text-gray-500 block text-[10px] uppercase font-bold">Canonicalization Standard</span>
              <span className="font-semibold text-white">{keyRegistry?.canonicalization}</span>
            </div>

            <div>
              <span className="text-gray-500 block text-[10px] uppercase font-bold">Format Version</span>
              <span>v{keyRegistry?.formatVersion}</span>
            </div>

            <div>
              <span className="text-gray-500 block text-[10px] uppercase font-bold">Registry Status</span>
              <StatusBadge status="ACTIVE" label={keyRegistry?.status || 'ACTIVE'} size="sm" />
            </div>

            <div className="col-span-1 md:col-span-2">
              <span className="text-gray-500 block text-[10px] uppercase font-bold mb-1">Public Key SHA-256 Fingerprint</span>
              <div className="p-2.5 bg-cpDark-900 border border-cpDark-800 rounded font-mono text-[11px] text-emerald-400 break-all select-all">
                {keyRegistry?.publicKeyFingerprint}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between text-[11px] text-gray-400 bg-cpDark-950/60 p-3 rounded border border-cpDark-800">
            <div className="flex items-center gap-2 text-amber-300 font-medium">
              <Shield className="h-4 w-4 shrink-0 text-amber-400" />
              <span>{keyRegistry?.securityNotes}</span>
            </div>
          </div>
        </div>
      </div>

      {/* SECTION 3: CONTROL PLANE AUTHORITY DIRECTORY */}
      <div className="space-y-4 pt-2">
        <h2 className="text-sm font-bold uppercase tracking-wider text-gray-300 flex items-center gap-2">
          <FileCode className="h-4 w-4 text-aravBlue-400" />
          <span>3. Control Plane Subsystem Authority Directory</span>
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Link
            href="/licensing"
            className="rounded-lg border border-cpDark-800 bg-cpDark-900 p-4 shadow-md hover:border-aravBlue-500/50 transition-colors group block space-y-2"
          >
            <div className="flex items-center justify-between">
              <span className="font-bold text-xs text-white group-hover:text-aravBlue-300">Licensing & Artifacts</span>
              <ExternalLink className="h-3.5 w-3.5 text-gray-500 group-hover:text-aravBlue-400" />
            </div>
            <p className="text-[11px] text-gray-400">Authoritative commercial licenses & signed JCS artifacts.</p>
          </Link>

          <Link
            href="/services"
            className="rounded-lg border border-cpDark-800 bg-cpDark-900 p-4 shadow-md hover:border-aravBlue-500/50 transition-colors group block space-y-2"
          >
            <div className="flex items-center justify-between">
              <span className="font-bold text-xs text-white group-hover:text-aravBlue-300">Service Control</span>
              <ExternalLink className="h-3.5 w-3.5 text-gray-500 group-hover:text-aravBlue-400" />
            </div>
            <p className="text-[11px] text-gray-400">Global service capability kill switches & org overrides.</p>
          </Link>

          <Link
            href="/organizations"
            className="rounded-lg border border-cpDark-800 bg-cpDark-900 p-4 shadow-md hover:border-aravBlue-500/50 transition-colors group block space-y-2"
          >
            <div className="flex items-center justify-between">
              <span className="font-bold text-xs text-white group-hover:text-aravBlue-300">Organization Control</span>
              <ExternalLink className="h-3.5 w-3.5 text-gray-500 group-hover:text-aravBlue-400" />
            </div>
            <p className="text-[11px] text-gray-400">Organization state transitions (ACTIVE, SUSPENDED, DISABLED).</p>
          </Link>

          <Link
            href="/operations/break-glass"
            className="rounded-lg border border-cpDark-800 bg-cpDark-900 p-4 shadow-md hover:border-aravBlue-500/50 transition-colors group block space-y-2"
          >
            <div className="flex items-center justify-between">
              <span className="font-bold text-xs text-white group-hover:text-aravBlue-300">Break-Glass Operations</span>
              <ExternalLink className="h-3.5 w-3.5 text-gray-500 group-hover:text-aravBlue-400" />
            </div>
            <p className="text-[11px] text-gray-400">Emergency two-person approval & post-event reviews.</p>
          </Link>

          <Link
            href="/communications"
            className="rounded-lg border border-cpDark-800 bg-cpDark-900 p-4 shadow-md hover:border-aravBlue-500/50 transition-colors group block space-y-2"
          >
            <div className="flex items-center justify-between">
              <span className="font-bold text-xs text-white group-hover:text-aravBlue-300">Communications</span>
              <ExternalLink className="h-3.5 w-3.5 text-gray-500 group-hover:text-aravBlue-400" />
            </div>
            <p className="text-[11px] text-gray-400">Platform announcements & operational email notices.</p>
          </Link>

          <Link
            href="/operators"
            className="rounded-lg border border-cpDark-800 bg-cpDark-900 p-4 shadow-md hover:border-aravBlue-500/50 transition-colors group block space-y-2"
          >
            <div className="flex items-center justify-between">
              <span className="font-bold text-xs text-white group-hover:text-aravBlue-300">Operators & MFA</span>
              <ExternalLink className="h-3.5 w-3.5 text-gray-500 group-hover:text-aravBlue-400" />
            </div>
            <p className="text-[11px] text-gray-400">Control Plane operator identities, RBAC, and TOTP MFA.</p>
          </Link>

          <Link
            href="/deployments"
            className="rounded-lg border border-cpDark-800 bg-cpDark-900 p-4 shadow-md hover:border-aravBlue-500/50 transition-colors group block space-y-2"
          >
            <div className="flex items-center justify-between">
              <span className="font-bold text-xs text-white group-hover:text-aravBlue-300">Deployments</span>
              <ExternalLink className="h-3.5 w-3.5 text-gray-500 group-hover:text-aravBlue-400" />
            </div>
            <p className="text-[11px] text-gray-400">Data Plane deployment registrations & activation state.</p>
          </Link>

          <Link
            href="/audit"
            className="rounded-lg border border-cpDark-800 bg-cpDark-900 p-4 shadow-md hover:border-aravBlue-500/50 transition-colors group block space-y-2"
          >
            <div className="flex items-center justify-between">
              <span className="font-bold text-xs text-white group-hover:text-aravBlue-300">Global Audit Explorer</span>
              <ExternalLink className="h-3.5 w-3.5 text-gray-500 group-hover:text-aravBlue-400" />
            </div>
            <p className="text-[11px] text-gray-400">Immutable administrative & security audit log explorer.</p>
          </Link>
        </div>
      </div>
    </div>
  );
}
