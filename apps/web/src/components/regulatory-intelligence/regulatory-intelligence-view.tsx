'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { apiRequest } from '@/lib/api-client';
import { useToast } from '@/context/toast-context';
import { EmptyState } from '@/components/ui/empty-state';
import { InlineErrorState } from '@/components/ui/inline-error-state';
import {
  Scale,
  Globe2,
  BookOpen,
  RefreshCw,
  ChevronRight,
  CheckCircle,
  AlertTriangle,
  Clock,
  XCircle,
  FileText,
  ShieldCheck,
  ArrowRight,
  Search,
  ListFilter,
  BarChart3,
  Loader2,
  Circle,
  Info,
} from 'lucide-react';

// ─── Types ─────────────────────────────────────────────────────────────────────

interface RegulatorySource {
  id: string;
  regulatorCode: string;
  displayName: string;
  isEnabled: boolean;
  healthStatus: string;
  consecutiveFailures: number;
  lastSuccessfulFetchAt: string | null;
  nextScheduledFetchAt: string | null;
  configuredEndpoint: string;
  catalogueEntry?: { code: string; displayName: string; jurisdiction: string } | null;
  _count?: { publications: number };
}

interface CatalogueEntry {
  id: string;
  code: string;
  displayName: string;
  jurisdiction: string;
  issuingAuthority: string | null;
  instrumentType: string | null;
  verificationStatus: string;
  connectorStatus: string;
  ingestionMethod: string;
  _count?: { sources: number; publications: number; manualIntakes: number };
}

interface Publication {
  id: string;
  title: string;
  publicationNumber: string | null;
  publicationDate: string | null;
  processingState: string;
  currentVersionNumber: number;
  isDocumentBytesVerified: boolean;
  source?: { regulatorCode: string; displayName: string };
  catalogueEntry?: { code: string; displayName: string; jurisdiction: string } | null;
  externalId: string | null;
  canonicalUrl: string | null;
}

interface RegulatoryObligation {
  id: string;
  title: string;
  status: string;
  obligationType: string | null;
  jurisdiction: string | null;
  affectedActor: string | null;
  isHumanReviewed: boolean;
  extractionMethod: string;
  complianceDeadline: string | null;
}

interface ApplicabilityAssessment {
  id: string;
  outcome: string;
  confidence: string;
  determinationType: string;
  isHumanReviewed: boolean;
  rationale: string | null;
  obligationId: string;
}

interface GapAssessment {
  id: string;
  gapOutcome: string;
  evidenceOutcome: string;
  isHumanReviewed: boolean;
  obligationId: string;
  controlId: string | null;
  riskScore: number | null;
}

interface RemediationTask {
  id: string;
  title: string;
  status: string;
  priority: string;
  targetDate: string | null;
  legalDeadline: string | null;
  isHumanApproved: boolean;
  assessmentId: string;
}

// ─── Tabs ───────────────────────────────────────────────────────────────────────

type TabKey = 'overview' | 'sources' | 'catalogue' | 'publications' | 'obligations' | 'applicability' | 'gaps' | 'remediation';

const TABS: { key: TabKey; label: string; icon: React.ElementType }[] = [
  { key: 'overview', label: 'Overview', icon: BarChart3 },
  { key: 'catalogue', label: 'Coverage Catalogue', icon: Globe2 },
  { key: 'sources', label: 'Regulatory Sources', icon: Globe2 },
  { key: 'publications', label: 'Publications', icon: FileText },
  { key: 'obligations', label: 'Obligations', icon: BookOpen },
  { key: 'applicability', label: 'Applicability', icon: ShieldCheck },
  { key: 'gaps', label: 'Control Gaps', icon: AlertTriangle },
  { key: 'remediation', label: 'Remediation', icon: CheckCircle },
];

// ─── Status Badges ──────────────────────────────────────────────────────────────

function HealthBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; color: string; bg: string; dot: string }> = {
    HEALTHY:   { label: 'Healthy',   color: '#059669', bg: 'rgba(5,150,105,0.1)',   dot: '#059669' },
    FAILING:   { label: 'Failing',   color: '#DC2626', bg: 'rgba(220,38,38,0.1)',   dot: '#DC2626' },
    PAUSED:    { label: 'Paused',    color: '#D97706', bg: 'rgba(217,119,6,0.1)',   dot: '#D97706' },
    UNTESTED:  { label: 'Untested',  color: '#6B7280', bg: 'rgba(107,114,128,0.1)', dot: '#6B7280' },
  };
  const s = map[status] || map.UNTESTED;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 600, color: s.color, background: s.bg, borderRadius: 20, padding: '2px 9px' }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: s.dot, flexShrink: 0 }} />
      {s.label}
    </span>
  );
}

function StatusBadge({ label, color, bg }: { label: string; color: string; bg: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', fontSize: 11, fontWeight: 600, color, background: bg, borderRadius: 20, padding: '2px 9px' }}>
      {label}
    </span>
  );
}

function outcomeColor(outcome: string): { color: string; bg: string } {
  if (outcome === 'APPLICABLE' || outcome === 'IMPLEMENTED' || outcome === 'SUFFICIENT' || outcome === 'VERIFIED_CLOSED') {
    return { color: '#059669', bg: 'rgba(5,150,105,0.1)' };
  }
  if (outcome === 'NOT_APPLICABLE' || outcome === 'REJECTED' || outcome === 'RISK_ACCEPTED') {
    return { color: '#6B7280', bg: 'rgba(107,114,128,0.1)' };
  }
  if (outcome === 'GAP_IDENTIFIED' || outcome === 'INSUFFICIENT' || outcome === 'PARTIALLY_IMPLEMENTED') {
    return { color: '#DC2626', bg: 'rgba(220,38,38,0.1)' };
  }
  if (outcome === 'REQUIRES_REVIEW' || outcome === 'IN_PROGRESS' || outcome === 'PENDING_APPROVAL' || outcome === 'UNDER_REVIEW') {
    return { color: '#D97706', bg: 'rgba(217,119,6,0.1)' };
  }
  return { color: '#6B7280', bg: 'rgba(107,114,128,0.08)' };
}

// ─── Loading Skeleton ───────────────────────────────────────────────────────────

function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} style={{ height: 44, borderRadius: 8, background: 'linear-gradient(90deg, #F4F6F5 0%, #E8EBEA 50%, #F4F6F5 100%)', backgroundSize: '200% 100%', animation: 'shimmer 1.5s infinite' }} />
      ))}
    </div>
  );
}

// ─── Section Card ───────────────────────────────────────────────────────────────

function SectionCard({ title, subtitle, children, action }: { title: string; subtitle?: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #E5EAE8', borderRadius: 12, overflow: 'hidden', marginBottom: 20 }}>
      <div style={{ padding: '16px 20px 14px', borderBottom: '1px solid #F0F3F2', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#1B2430' }}>{title}</div>
          {subtitle && <div style={{ fontSize: 12, color: '#8493A5', marginTop: 2 }}>{subtitle}</div>}
        </div>
        {action}
      </div>
      <div style={{ padding: '16px 20px' }}>{children}</div>
    </div>
  );
}

// ─── Stat Card ──────────────────────────────────────────────────────────────────

function StatCard({ label, value, icon: Icon, color }: { label: string; value: number | string; icon: React.ElementType; color: string }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #E5EAE8', borderRadius: 12, padding: '18px 20px', display: 'flex', alignItems: 'center', gap: 14 }}>
      <div style={{ width: 40, height: 40, borderRadius: 10, background: `${color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Icon size={20} color={color} />
      </div>
      <div>
        <div style={{ fontSize: 22, fontWeight: 700, color: '#1B2430', lineHeight: 1.2 }}>{value}</div>
        <div style={{ fontSize: 12, color: '#8493A5', marginTop: 2 }}>{label}</div>
      </div>
    </div>
  );
}

// ─── Overview Tab ───────────────────────────────────────────────────────────────

function OverviewTab() {
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);

    const fetchAll = async () => {
      try {
        const [sources, publications, obligations, gaps, remediationSummary] = await Promise.all([
          apiRequest<{ total: number }>('/regulatory/sources'),
          apiRequest<{ total: number }>('/regulatory/publications'),
          apiRequest<{ total: number }>('/regulatory/obligations'),
          apiRequest<any>('/regulatory/gaps/summary').catch(() => null),
          apiRequest<any>('/regulatory/remediation/summary').catch(() => null),
        ]);
        setSummary({ sources, publications, obligations, gaps, remediationSummary });
      } catch (err: any) {
        setError(err?.message || 'Failed to load overview data.');
      } finally {
        setLoading(false);
      }
    };

    fetchAll();
  }, []);

  if (loading) {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16 }}>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} style={{ height: 90, borderRadius: 12, background: 'linear-gradient(90deg, #F4F6F5 0%, #E8EBEA 50%, #F4F6F5 100%)', backgroundSize: '200% 100%', animation: 'shimmer 1.5s infinite' }} />
        ))}
      </div>
    );
  }

  if (error) return <InlineErrorState message={error} />;
  if (!summary) return null;

  const totalGaps = summary.gaps?.total ?? '—';
  const openRemediation = summary.remediationSummary?.totalOpen ?? '—';

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16, marginBottom: 24 }}>
        <StatCard label="Regulatory Sources" value={summary.sources.total} icon={Globe2} color="#0F6E6A" />
        <StatCard label="Publications Tracked" value={summary.publications.total} icon={FileText} color="#1E40AF" />
        <StatCard label="Extracted Obligations" value={summary.obligations.total} icon={BookOpen} color="#7C3AED" />
        <StatCard label="Control Gaps Found" value={totalGaps} icon={AlertTriangle} color="#DC2626" />
        <StatCard label="Open Remediation Tasks" value={openRemediation} icon={CheckCircle} color="#D97706" />
        <StatCard label="RBI Connector" value="Live" icon={ShieldCheck} color="#059669" />
      </div>

      <div style={{ background: 'linear-gradient(135deg, #0F6E6A 0%, #1E40AF 100%)', borderRadius: 14, padding: '20px 24px', color: '#fff', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
          <Scale size={28} style={{ flexShrink: 0, marginTop: 2 }} />
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>Regulatory Intelligence — End-to-End Coverage</div>
            <div style={{ fontSize: 13, opacity: 0.9, lineHeight: 1.6 }}>
              Monitor regulatory publications → extract obligations → assess applicability → map controls → identify gaps → track remediation. All data is organization-scoped with full audit trails.
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
              {['Source Registry', 'Publication Versioning', 'Obligation Extraction', 'Applicability Assessment', 'Control Mapping', 'Gap Analysis', 'Remediation Tracking'].map((s) => (
                <span key={s} style={{ fontSize: 11, fontWeight: 600, background: 'rgba(255,255,255,0.18)', borderRadius: 20, padding: '3px 10px' }}>{s}</span>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div style={{ background: '#FFF8E7', border: '1px solid #F6C752', borderRadius: 10, padding: '12px 16px', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <Info size={16} color="#D97706" style={{ flexShrink: 0, marginTop: 1 }} />
        <div style={{ fontSize: 12.5, color: '#7A4F00', lineHeight: 1.6 }}>
          <strong>Production note:</strong> The RBI connector uses an RSS feed. Durable object storage, distributed ingestion locking across multiple API instances, and malware scanning for untrusted documents require external infrastructure configuration before production deployment. See Regulatory Intelligence Release Report for details.
        </div>
      </div>
    </div>
  );
}

// ─── Sources Tab ────────────────────────────────────────────────────────────────

function SourcesTab({ showToast }: { showToast: Function }) {
  const [sources, setSources] = useState<RegulatorySource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiRequest<{ items: RegulatorySource[]; total: number }>('/regulatory/sources?limit=100');
      setSources(res.items || []);
    } catch (err: any) {
      setError(err?.message || 'Failed to load regulatory sources.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const triggerSync = async (sourceId: string, name: string) => {
    setSyncing(sourceId);
    try {
      await apiRequest(`/regulatory/sources/${sourceId}/sync`, { method: 'POST' });
      showToast({ type: 'success', message: `Sync triggered for "${name}".` });
      setTimeout(load, 2000);
    } catch (err: any) {
      showToast({ type: 'error', message: err?.message || 'Sync trigger failed.' });
    } finally {
      setSyncing(null);
    }
  };

  const filtered = sources.filter(s => {
    const q = search.toLowerCase();
    return !q || s.displayName.toLowerCase().includes(q) || s.regulatorCode.toLowerCase().includes(q);
  });

  return (
    <SectionCard
      title="Regulatory Sources"
      subtitle="Live-feed and connector-tested regulatory data sources"
      action={
        <button className="omni-btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }} onClick={load}>
          <RefreshCw size={13} />
          Refresh
        </button>
      }
    >
      <div style={{ marginBottom: 14 }}>
        <div style={{ position: 'relative', maxWidth: 320 }}>
          <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#8493A5' }} />
          <input
            type="text"
            placeholder="Search sources..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ width: '100%', padding: '7px 12px 7px 30px', border: '1px solid #D6DAD7', borderRadius: 7, fontSize: 13, color: '#1B2430', outline: 'none', background: '#FAFAFA' }}
          />
        </div>
      </div>

      {loading && <TableSkeleton rows={3} />}
      {error && <InlineErrorState message={error} onRetry={load} />}
      {!loading && !error && filtered.length === 0 && (
        <EmptyState icon={Globe2} title="No regulatory sources found" description="Regulatory sources are seeded automatically when the API service starts. Ensure the API is running." />
      )}
      {!loading && !error && filtered.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {/* Header */}
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr auto', gap: 12, padding: '8px 12px', background: '#F8FAFA', borderRadius: '8px 8px 0 0', borderBottom: '1px solid #E5EAE8' }}>
            {['Source', 'Regulator', 'Status', 'Publications', 'Actions'].map(h => (
              <div key={h} style={{ fontSize: 11, fontWeight: 600, color: '#8493A5', textTransform: 'uppercase', letterSpacing: 0.5 }}>{h}</div>
            ))}
          </div>
          {filtered.map((s) => (
            <div key={s.id} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr auto', gap: 12, padding: '12px', borderBottom: '1px solid #F0F3F2', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 500, color: '#1B2430', marginBottom: 2 }}>{s.displayName}</div>
                <div style={{ fontSize: 11, color: '#8493A5' }}>{s.configuredEndpoint}</div>
              </div>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#0F6E6A' }}>{s.regulatorCode}</div>
              <div><HealthBadge status={s.healthStatus} /></div>
              <div style={{ fontSize: 13, color: '#1B2430' }}>{s._count?.publications ?? '—'}</div>
              <div>
                <button
                  className="omni-btn-secondary"
                  style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, padding: '5px 10px' }}
                  onClick={() => triggerSync(s.id, s.displayName)}
                  disabled={!s.isEnabled || syncing === s.id}
                  title={!s.isEnabled ? 'Source is disabled' : 'Trigger manual sync'}
                >
                  {syncing === s.id ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                  Sync
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  );
}

// ─── Catalogue Tab ───────────────────────────────────────────────────────────────

function CatalogueTab() {
  const [entries, setEntries] = useState<CatalogueEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    setLoading(true);
    apiRequest<{ items: CatalogueEntry[] }>('/regulatory/catalogue?limit=100')
      .then(res => { setEntries(res.items || []); setLoading(false); })
      .catch(err => { setError(err?.message || 'Failed to load catalogue.'); setLoading(false); });
  }, []);

  const filtered = entries.filter(e => {
    const q = search.toLowerCase();
    return !q || e.displayName.toLowerCase().includes(q) || e.jurisdiction.toLowerCase().includes(q) || e.code.toLowerCase().includes(q);
  });

  const statusColor = (v: string) => v === 'VERIFIED' ? { color: '#059669', bg: 'rgba(5,150,105,0.1)' } : { color: '#D97706', bg: 'rgba(217,119,6,0.1)' };
  const connectorColor = (v: string) => v === 'LIVE' ? { color: '#059669', bg: 'rgba(5,150,105,0.1)' } : v === 'CATALOGUE_ONLY' ? { color: '#6B7280', bg: 'rgba(107,114,128,0.1)' } : { color: '#D97706', bg: 'rgba(217,119,6,0.1)' };

  return (
    <SectionCard title="Coverage Catalogue" subtitle={`${entries.length} regulatory instruments catalogued across jurisdictions`}>
      <div style={{ marginBottom: 14 }}>
        <div style={{ position: 'relative', maxWidth: 320 }}>
          <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#8493A5' }} />
          <input
            type="text"
            placeholder="Search catalogue..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ width: '100%', padding: '7px 12px 7px 30px', border: '1px solid #D6DAD7', borderRadius: 7, fontSize: 13, color: '#1B2430', outline: 'none', background: '#FAFAFA' }}
          />
        </div>
      </div>

      {loading && <TableSkeleton rows={5} />}
      {error && <InlineErrorState message={error} />}
      {!loading && !error && filtered.length === 0 && (
        <EmptyState icon={Globe2} title="No catalogue entries" description="Regulatory coverage catalogue is seeded automatically when the API service starts." />
      )}
      {!loading && !error && filtered.length > 0 && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr', gap: 12, padding: '8px 12px', background: '#F8FAFA', borderRadius: '8px 8px 0 0', borderBottom: '1px solid #E5EAE8' }}>
            {['Instrument', 'Jurisdiction', 'Connector', 'Verification', 'Publications'].map(h => (
              <div key={h} style={{ fontSize: 11, fontWeight: 600, color: '#8493A5', textTransform: 'uppercase', letterSpacing: 0.5 }}>{h}</div>
            ))}
          </div>
          {filtered.map(e => {
            const sc = statusColor(e.verificationStatus);
            const cc = connectorColor(e.connectorStatus);
            return (
              <div key={e.id} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr', gap: 12, padding: '12px', borderBottom: '1px solid #F0F3F2', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: '#1B2430' }}>{e.displayName}</div>
                  <div style={{ fontSize: 11, color: '#8493A5', fontFamily: 'monospace' }}>{e.code}</div>
                </div>
                <div style={{ fontSize: 12, color: '#5B6672' }}>{e.jurisdiction}</div>
                <StatusBadge label={e.connectorStatus.replace('_', ' ')} color={cc.color} bg={cc.bg} />
                <StatusBadge label={e.verificationStatus} color={sc.color} bg={sc.bg} />
                <div style={{ fontSize: 13, color: '#1B2430' }}>{e._count?.publications ?? 0}</div>
              </div>
            );
          })}
        </div>
      )}
    </SectionCard>
  );
}

// ─── Publications Tab ────────────────────────────────────────────────────────────

function PublicationsTab() {
  const [pubs, setPubs] = useState<Publication[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const load = useCallback(async (q?: string) => {
    setLoading(true);
    setError(null);
    try {
      const qs = q ? `&search=${encodeURIComponent(q)}` : '';
      const res = await apiRequest<{ items: Publication[]; total: number }>(`/regulatory/publications?limit=50${qs}`);
      setPubs(res.items || []);
      setTotal(res.total || 0);
    } catch (err: any) {
      setError(err?.message || 'Failed to load publications.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const procState = (s: string) => {
    const m: Record<string, { label: string; color: string; bg: string }> = {
      DISCOVERED:  { label: 'Discovered',  color: '#6B7280', bg: 'rgba(107,114,128,0.1)' },
      PROCESSING:  { label: 'Processing',  color: '#D97706', bg: 'rgba(217,119,6,0.1)'   },
      OBLIGATIONS_EXTRACTED: { label: 'Obligations Extracted', color: '#1E40AF', bg: 'rgba(30,64,175,0.1)' },
      REVIEWED:    { label: 'Reviewed',    color: '#059669', bg: 'rgba(5,150,105,0.1)'   },
    };
    return m[s] || { label: s, color: '#6B7280', bg: 'rgba(107,114,128,0.1)' };
  };

  return (
    <SectionCard title="Regulatory Publications" subtitle={`${total} publications tracked with full version history`}
      action={
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div style={{ position: 'relative' }}>
            <Search size={13} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: '#8493A5' }} />
            <input
              type="text"
              placeholder="Search..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && load(search)}
              style={{ padding: '6px 10px 6px 26px', border: '1px solid #D6DAD7', borderRadius: 7, fontSize: 12, outline: 'none', background: '#FAFAFA', width: 180 }}
            />
          </div>
          <button className="omni-btn-secondary" style={{ fontSize: 12, padding: '6px 12px' }} onClick={() => load(search)}>Search</button>
        </div>
      }
    >
      {loading && <TableSkeleton rows={6} />}
      {error && <InlineErrorState message={error} onRetry={() => load()} />}
      {!loading && !error && pubs.length === 0 && (
        <EmptyState icon={FileText} title="No publications found" description="Publications are automatically discovered when a regulatory source is synced for the first time." />
      )}
      {!loading && !error && pubs.length > 0 && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: '3fr 1fr 1fr 1fr auto', gap: 12, padding: '8px 12px', background: '#F8FAFA', borderRadius: '8px 8px 0 0', borderBottom: '1px solid #E5EAE8' }}>
            {['Publication', 'Regulator', 'Date', 'State', 'Version'].map(h => (
              <div key={h} style={{ fontSize: 11, fontWeight: 600, color: '#8493A5', textTransform: 'uppercase', letterSpacing: 0.5 }}>{h}</div>
            ))}
          </div>
          {pubs.map(p => {
            const ps = procState(p.processingState);
            return (
              <div key={p.id} style={{ display: 'grid', gridTemplateColumns: '3fr 1fr 1fr 1fr auto', gap: 12, padding: '12px', borderBottom: '1px solid #F0F3F2', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: '#1B2430', lineHeight: 1.4 }}>{p.title}</div>
                  {p.publicationNumber && <div style={{ fontSize: 11, color: '#8493A5', fontFamily: 'monospace' }}>{p.publicationNumber}</div>}
                </div>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#0F6E6A' }}>{p.source?.regulatorCode || '—'}</div>
                <div style={{ fontSize: 12, color: '#5B6672' }}>{p.publicationDate ? new Date(p.publicationDate).toLocaleDateString() : '—'}</div>
                <StatusBadge label={ps.label} color={ps.color} bg={ps.bg} />
                <div style={{ fontSize: 12, fontWeight: 600, color: '#1B2430', textAlign: 'center' }}>v{p.currentVersionNumber}</div>
              </div>
            );
          })}
        </div>
      )}
    </SectionCard>
  );
}

// ─── Obligations Tab ─────────────────────────────────────────────────────────────

function ObligationsTab({ showToast }: { showToast: Function }) {
  const [items, setItems] = useState<RegulatoryObligation[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [reviewingId, setReviewingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = [
        search ? `search=${encodeURIComponent(search)}` : '',
        statusFilter ? `status=${statusFilter}` : '',
        'limit=50',
      ].filter(Boolean).join('&');
      const res = await apiRequest<{ items: RegulatoryObligation[]; total: number }>(`/regulatory/obligations?${qs}`);
      setItems(res.items || []);
      setTotal(res.total || 0);
    } catch (err: any) {
      setError(err?.message || 'Failed to load obligations.');
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter]);

  useEffect(() => { load(); }, []);

  const approve = async (id: string) => {
    setReviewingId(id);
    try {
      await apiRequest(`/regulatory/obligations/${id}/review`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'APPROVED', reviewNotes: 'Approved via Regulatory Intelligence UI' }),
      });
      showToast({ type: 'success', message: 'Obligation approved.' });
      load();
    } catch (err: any) {
      showToast({ type: 'error', message: err?.message || 'Approval failed.' });
    } finally {
      setReviewingId(null);
    }
  };

  const statusColor = (s: string) => {
    const m: Record<string, { color: string; bg: string }> = {
      CANDIDATE:       { color: '#D97706', bg: 'rgba(217,119,6,0.1)' },
      UNDER_REVIEW:    { color: '#1E40AF', bg: 'rgba(30,64,175,0.1)' },
      APPROVED:        { color: '#059669', bg: 'rgba(5,150,105,0.1)' },
      REJECTED:        { color: '#DC2626', bg: 'rgba(220,38,38,0.1)' },
      SUPERSEDED:      { color: '#6B7280', bg: 'rgba(107,114,128,0.1)' },
    };
    return m[s] || { color: '#6B7280', bg: 'rgba(107,114,128,0.08)' };
  };

  return (
    <SectionCard title="Regulatory Obligations" subtitle={`${total} obligations — CANDIDATE obligations require human review before applicability assessment`}
      action={
        <div style={{ display: 'flex', gap: 8 }}>
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            style={{ padding: '6px 10px', border: '1px solid #D6DAD7', borderRadius: 7, fontSize: 12, outline: 'none', background: '#FAFAFA', color: '#1B2430' }}
          >
            <option value="">All Statuses</option>
            <option value="CANDIDATE">Candidate</option>
            <option value="UNDER_REVIEW">Under Review</option>
            <option value="APPROVED">Approved</option>
            <option value="REJECTED">Rejected</option>
          </select>
          <button className="omni-btn-secondary" style={{ fontSize: 12, padding: '6px 12px' }} onClick={load}>Apply</button>
        </div>
      }
    >
      {loading && <TableSkeleton rows={5} />}
      {error && <InlineErrorState message={error} onRetry={load} />}
      {!loading && !error && items.length === 0 && (
        <EmptyState icon={BookOpen} title="No obligations found" description="Obligations are extracted from regulatory publications. Trigger extraction via Publications tab or the API endpoint." />
      )}
      {!loading && !error && items.length > 0 && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: '3fr 1fr 1fr 1fr auto', gap: 12, padding: '8px 12px', background: '#F8FAFA', borderRadius: '8px 8px 0 0', borderBottom: '1px solid #E5EAE8' }}>
            {['Obligation', 'Status', 'Jurisdiction', 'Reviewed', 'Action'].map(h => (
              <div key={h} style={{ fontSize: 11, fontWeight: 600, color: '#8493A5', textTransform: 'uppercase', letterSpacing: 0.5 }}>{h}</div>
            ))}
          </div>
          {items.map(ob => {
            const sc = statusColor(ob.status);
            return (
              <div key={ob.id} style={{ display: 'grid', gridTemplateColumns: '3fr 1fr 1fr 1fr auto', gap: 12, padding: '12px', borderBottom: '1px solid #F0F3F2', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: '#1B2430', lineHeight: 1.4 }}>{ob.title}</div>
                  {ob.affectedActor && <div style={{ fontSize: 11, color: '#8493A5' }}>Actor: {ob.affectedActor}</div>}
                </div>
                <StatusBadge label={ob.status} color={sc.color} bg={sc.bg} />
                <div style={{ fontSize: 12, color: '#5B6672' }}>{ob.jurisdiction || 'GLOBAL'}</div>
                <div style={{ fontSize: 12 }}>
                  {ob.isHumanReviewed
                    ? <CheckCircle size={14} color="#059669" />
                    : <Circle size={14} color="#D97706" />}
                </div>
                <div>
                  {ob.status === 'CANDIDATE' && (
                    <button
                      className="omni-btn-primary"
                      style={{ fontSize: 11, padding: '4px 10px', display: 'flex', alignItems: 'center', gap: 4 }}
                      onClick={() => approve(ob.id)}
                      disabled={reviewingId === ob.id}
                    >
                      {reviewingId === ob.id ? <Loader2 size={11} className="animate-spin" /> : <CheckCircle size={11} />}
                      Approve
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </SectionCard>
  );
}

// ─── Applicability Tab ───────────────────────────────────────────────────────────

function ApplicabilityTab() {
  const [items, setItems] = useState<ApplicabilityAssessment[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [outcomeFilter, setOutcomeFilter] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = outcomeFilter ? `outcome=${outcomeFilter}&limit=50` : 'limit=50';
      const res = await apiRequest<{ items: ApplicabilityAssessment[]; total: number }>(`/regulatory/applicability?${qs}`);
      setItems(res.items || []);
      setTotal(res.total || 0);
    } catch (err: any) {
      setError(err?.message || 'Failed to load applicability assessments.');
    } finally {
      setLoading(false);
    }
  }, [outcomeFilter]);

  useEffect(() => { load(); }, []);

  return (
    <SectionCard title="Applicability Assessments" subtitle={`${total} organization-scoped assessments — must be human-reviewed for gap analysis eligibility`}
      action={
        <div style={{ display: 'flex', gap: 8 }}>
          <select
            value={outcomeFilter}
            onChange={e => setOutcomeFilter(e.target.value)}
            style={{ padding: '6px 10px', border: '1px solid #D6DAD7', borderRadius: 7, fontSize: 12, outline: 'none', background: '#FAFAFA', color: '#1B2430' }}
          >
            <option value="">All Outcomes</option>
            <option value="APPLICABLE">Applicable</option>
            <option value="NOT_APPLICABLE">Not Applicable</option>
            <option value="REQUIRES_REVIEW">Requires Review</option>
            <option value="INSUFFICIENT_INFORMATION">Insufficient Information</option>
          </select>
          <button className="omni-btn-secondary" style={{ fontSize: 12, padding: '6px 12px' }} onClick={load}>Apply</button>
        </div>
      }
    >
      {loading && <TableSkeleton rows={5} />}
      {error && <InlineErrorState message={error} onRetry={load} />}
      {!loading && !error && items.length === 0 && (
        <EmptyState
          icon={ShieldCheck}
          title="No applicability assessments"
          description="Run applicability assessment via the API: POST /regulatory/applicability/assess with your organizationId and obligationId. Only APPROVED obligations qualify."
        />
      )}
      {!loading && !error && items.length > 0 && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 1fr 1fr', gap: 12, padding: '8px 12px', background: '#F8FAFA', borderRadius: '8px 8px 0 0', borderBottom: '1px solid #E5EAE8' }}>
            {['Obligation ID', 'Outcome', 'Confidence', 'Reviewed'].map(h => (
              <div key={h} style={{ fontSize: 11, fontWeight: 600, color: '#8493A5', textTransform: 'uppercase', letterSpacing: 0.5 }}>{h}</div>
            ))}
          </div>
          {items.map(a => {
            const oc = outcomeColor(a.outcome);
            const cc = outcomeColor(a.confidence === 'HIGH' ? 'APPLICABLE' : a.confidence === 'MEDIUM' ? 'REQUIRES_REVIEW' : 'NOT_APPLICABLE');
            return (
              <div key={a.id} style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 1fr 1fr', gap: 12, padding: '12px', borderBottom: '1px solid #F0F3F2', alignItems: 'center' }}>
                <div style={{ fontSize: 12, color: '#5B6672', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.obligationId}</div>
                <StatusBadge label={a.outcome.replace(/_/g, ' ')} color={oc.color} bg={oc.bg} />
                <StatusBadge label={a.confidence} color={cc.color} bg={cc.bg} />
                <div>{a.isHumanReviewed ? <CheckCircle size={14} color="#059669" /> : <Circle size={14} color="#D97706" />}</div>
              </div>
            );
          })}
        </div>
      )}
    </SectionCard>
  );
}

// ─── Gaps Tab ────────────────────────────────────────────────────────────────────

function GapsTab() {
  const [items, setItems] = useState<GapAssessment[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    apiRequest<{ items: GapAssessment[]; total: number }>('/regulatory/gaps?limit=50')
      .then(res => { setItems(res.items || []); setTotal(res.total || 0); setLoading(false); })
      .catch(err => { setError(err?.message || 'Failed to load gap assessments.'); setLoading(false); });
  }, []);

  return (
    <SectionCard title="Control Gap Assessments" subtitle={`${total} gap assessments — GAP_IDENTIFIED items should have an associated remediation task`}>
      {loading && <TableSkeleton rows={5} />}
      {error && <InlineErrorState message={error} />}
      {!loading && !error && items.length === 0 && (
        <EmptyState
          icon={AlertTriangle}
          title="No gap assessments"
          description="Gap assessments are generated for APPLICABLE obligations that have APPROVED control mappings. Run POST /regulatory/gaps/assess to evaluate control implementation state."
        />
      )}
      {!loading && !error && items.length > 0 && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 2fr 1fr 1fr', gap: 12, padding: '8px 12px', background: '#F8FAFA', borderRadius: '8px 8px 0 0', borderBottom: '1px solid #E5EAE8' }}>
            {['Obligation', 'Gap Outcome', 'Evidence', 'Risk', 'Reviewed'].map(h => (
              <div key={h} style={{ fontSize: 11, fontWeight: 600, color: '#8493A5', textTransform: 'uppercase', letterSpacing: 0.5 }}>{h}</div>
            ))}
          </div>
          {items.map(g => {
            const gc = outcomeColor(g.gapOutcome);
            const ec = outcomeColor(g.evidenceOutcome);
            return (
              <div key={g.id} style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 2fr 1fr 1fr', gap: 12, padding: '12px', borderBottom: '1px solid #F0F3F2', alignItems: 'center' }}>
                <div style={{ fontSize: 12, color: '#5B6672', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.obligationId}</div>
                <StatusBadge label={g.gapOutcome.replace(/_/g, ' ')} color={gc.color} bg={gc.bg} />
                <StatusBadge label={g.evidenceOutcome.replace(/_/g, ' ')} color={ec.color} bg={ec.bg} />
                <div style={{ fontSize: 13, fontWeight: 600, color: g.riskScore !== null && g.riskScore >= 7 ? '#DC2626' : '#1B2430' }}>{g.riskScore ?? '—'}</div>
                <div>{g.isHumanReviewed ? <CheckCircle size={14} color="#059669" /> : <Circle size={14} color="#D97706" />}</div>
              </div>
            );
          })}
        </div>
      )}
    </SectionCard>
  );
}

// ─── Remediation Tab ─────────────────────────────────────────────────────────────

function RemediationTab({ showToast }: { showToast: Function }) {
  const [items, setItems] = useState<RemediationTask[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = statusFilter ? `status=${statusFilter}&limit=50` : 'limit=50';
      const res = await apiRequest<{ items: RemediationTask[]; total: number }>(`/regulatory/remediation?${qs}`);
      setItems(res.items || []);
      setTotal(res.total || 0);
    } catch (err: any) {
      setError(err?.message || 'Failed to load remediation tasks.');
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => { load(); }, []);

  const priorityColor = (p: string) => ({
    CRITICAL: { color: '#DC2626', bg: 'rgba(220,38,38,0.1)' },
    HIGH:     { color: '#D97706', bg: 'rgba(217,119,6,0.1)' },
    MEDIUM:   { color: '#1E40AF', bg: 'rgba(30,64,175,0.1)' },
    LOW:      { color: '#6B7280', bg: 'rgba(107,114,128,0.1)' },
  }[p] || { color: '#6B7280', bg: 'rgba(107,114,128,0.1)' });

  return (
    <SectionCard title="Regulatory Remediation Tasks" subtitle={`${total} tasks — VERIFIED_CLOSED tasks confirm independent verification and closure`}
      action={
        <div style={{ display: 'flex', gap: 8 }}>
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            style={{ padding: '6px 10px', border: '1px solid #D6DAD7', borderRadius: 7, fontSize: 12, outline: 'none', background: '#FAFAFA', color: '#1B2430' }}
          >
            <option value="">All Statuses</option>
            <option value="PROPOSED">Proposed</option>
            <option value="IN_PROGRESS">In Progress</option>
            <option value="PENDING_APPROVAL">Pending Approval</option>
            <option value="COMPLETED">Completed</option>
            <option value="VERIFIED_CLOSED">Verified Closed</option>
            <option value="REJECTED">Rejected</option>
            <option value="RISK_ACCEPTED">Risk Accepted</option>
          </select>
          <button className="omni-btn-secondary" style={{ fontSize: 12, padding: '6px 12px' }} onClick={load}>Apply</button>
        </div>
      }
    >
      {loading && <TableSkeleton rows={5} />}
      {error && <InlineErrorState message={error} onRetry={load} />}
      {!loading && !error && items.length === 0 && (
        <EmptyState
          icon={CheckCircle}
          title="No remediation tasks"
          description="Remediation tasks are proposed from human-reviewed GAP_IDENTIFIED assessments. A concurrent unique constraint ensures one active task per gap finding."
        />
      )}
      {!loading && !error && items.length > 0 && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: '3fr 1fr 1fr 1fr 1fr', gap: 12, padding: '8px 12px', background: '#F8FAFA', borderRadius: '8px 8px 0 0', borderBottom: '1px solid #E5EAE8' }}>
            {['Task', 'Status', 'Priority', 'Target Date', 'Approved'].map(h => (
              <div key={h} style={{ fontSize: 11, fontWeight: 600, color: '#8493A5', textTransform: 'uppercase', letterSpacing: 0.5 }}>{h}</div>
            ))}
          </div>
          {items.map(t => {
            const sc = outcomeColor(t.status);
            const pc = priorityColor(t.priority);
            const isOverdue = t.legalDeadline && new Date(t.legalDeadline) < new Date() && t.status !== 'VERIFIED_CLOSED';
            return (
              <div key={t.id} style={{ display: 'grid', gridTemplateColumns: '3fr 1fr 1fr 1fr 1fr', gap: 12, padding: '12px', borderBottom: '1px solid #F0F3F2', alignItems: 'center', background: isOverdue ? 'rgba(220,38,38,0.03)' : undefined }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: '#1B2430', lineHeight: 1.4 }}>{t.title}</div>
                  {t.legalDeadline && (
                    <div style={{ fontSize: 11, color: isOverdue ? '#DC2626' : '#8493A5', display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                      {isOverdue && <AlertTriangle size={10} />}
                      Legal deadline: {new Date(t.legalDeadline).toLocaleDateString()}
                    </div>
                  )}
                </div>
                <StatusBadge label={t.status.replace(/_/g, ' ')} color={sc.color} bg={sc.bg} />
                <StatusBadge label={t.priority} color={pc.color} bg={pc.bg} />
                <div style={{ fontSize: 12, color: '#5B6672' }}>{t.targetDate ? new Date(t.targetDate).toLocaleDateString() : '—'}</div>
                <div>{t.isHumanApproved ? <CheckCircle size={14} color="#059669" /> : <Circle size={14} color="#D97706" />}</div>
              </div>
            );
          })}
        </div>
      )}
    </SectionCard>
  );
}

// ─── Main View ───────────────────────────────────────────────────────────────────

export function RegulatoryIntelligenceView() {
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState<TabKey>('overview');

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 22, flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 42, height: 42, borderRadius: 11, background: 'linear-gradient(135deg, #0F6E6A 0%, #1E40AF 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Scale size={22} color="#fff" />
          </div>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: '#1B2430', margin: 0 }}>Regulatory Intelligence</h1>
            <div style={{ fontSize: 13, color: '#8493A5', marginTop: 2 }}>Source registry · Publication tracking · Obligation review · Applicability · Gap analysis · Remediation</div>
          </div>
        </div>
      </div>

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 2, marginBottom: 20, borderBottom: '2px solid #E5EAE8', overflowX: 'auto' }}>
        {TABS.map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '9px 16px',
                background: 'none',
                border: 'none',
                borderBottom: isActive ? '2px solid #0F6E6A' : '2px solid transparent',
                color: isActive ? '#0F6E6A' : '#5B6672',
                fontWeight: isActive ? 700 : 500,
                fontSize: 13,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                marginBottom: -2,
                borderRadius: '6px 6px 0 0',
                transition: 'color 0.15s, border-color 0.15s',
              }}
            >
              <Icon size={14} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      {activeTab === 'overview'     && <OverviewTab />}
      {activeTab === 'catalogue'    && <CatalogueTab />}
      {activeTab === 'sources'      && <SourcesTab showToast={showToast} />}
      {activeTab === 'publications' && <PublicationsTab />}
      {activeTab === 'obligations'  && <ObligationsTab showToast={showToast} />}
      {activeTab === 'applicability'&& <ApplicabilityTab />}
      {activeTab === 'gaps'         && <GapsTab />}
      {activeTab === 'remediation'  && <RemediationTab showToast={showToast} />}
    </div>
  );
}
