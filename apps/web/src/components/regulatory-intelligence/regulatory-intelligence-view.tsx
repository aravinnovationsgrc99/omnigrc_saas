'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { apiRequest } from '@/lib/api-client';
import { useToast } from '@/context/toast-context';
import { useAuth } from '@/context/auth-context';
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
  Sparkles,
  Link2,
  Plus,
  UploadCloud,
  Check,
  X,
  ExternalLink,
  FileSpreadsheet,
  Layers,
  ShieldAlert,
  Eye,
  History,
} from 'lucide-react';

// ─── Data Types ─────────────────────────────────────────────────────────────────

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

interface ManualIntake {
  id: string;
  title: string;
  instrumentIdentifier: string | null;
  sourceUrl: string | null;
  fileName: string;
  fileSize: number;
  mimeType: string;
  checksum: string;
  reviewStatus: string;
  reviewNotes: string | null;
  provenanceNotes: string | null;
  createdAt: string;
  catalogueEntry?: { code: string; displayName: string; jurisdiction: string } | null;
}

interface PublicationVersion {
  id: string;
  versionNumber: number;
  changeSummary: string | null;
  isDocumentBytesVerified: boolean;
  detectedAt: string;
  documentChecksum: string;
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
  versions?: PublicationVersion[];
}

interface RegulatoryObligation {
  id: string;
  publicationId: string | null;
  title: string;
  fullText: string;
  status: string;
  obligationType: string | null;
  jurisdiction: string | null;
  affectedActor: string | null;
  isHumanReviewed: boolean;
  extractionMethod: string;
  complianceDeadline: string | null;
  sourceClauseRef: string | null;
  legalBasis: string | null;
  reviewNotes?: string | null;
}

interface ApplicabilityAssessment {
  id: string;
  outcome: string;
  confidence: string;
  determinationType: string;
  isHumanReviewed: boolean;
  rationale: string | null;
  obligationId: string;
  obligation?: RegulatoryObligation;
  matchedAttributes?: Record<string, any>;
  reviewNotes?: string | null;
}

interface ObligationControlMapping {
  id: string;
  obligationId: string;
  controlId: string;
  mappingType: string;
  status: string;
  confidenceScore: number;
  suggestedBy: string;
  isHumanReviewed: boolean;
  reviewNotes: string | null;
  obligation?: RegulatoryObligation;
  control?: { id: string; name: string; category?: string };
}

interface MappingCoverage {
  totalApplicableObligations: number;
  mappedObligations: number;
  unmappedObligations: number;
  coveragePercentage: number;
  unmappedObligationIds: string[];
}

interface GapAssessment {
  id: string;
  gapOutcome: string;
  evidenceOutcome: string;
  isHumanReviewed: boolean;
  obligationId: string;
  controlId: string | null;
  riskScore: number | null;
  reviewNotes: string | null;
  defectExplanation?: string;
  obligation?: RegulatoryObligation;
  control?: { id: string; name: string };
}

interface RemediationTask {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  targetDate: string | null;
  legalDeadline: string | null;
  isHumanApproved: boolean;
  assessmentId: string;
  assignedToId: string | null;
  assignedById: string | null;
  resolutionSummary: string | null;
  completionNotes: string | null;
  evidenceReferences: string[];
  history?: Array<{ id: string; previousStatus: string; newStatus: string; notes: string; changedAt: string }>;
}

interface ImpactAnalysisFinding {
  id: string;
  findingTitle: string;
  impactType: string;
  severity: string;
  affectedControlIds: string[];
  affectedFunctionalAreas: string[];
  suggestedAction: string;
  sourceExcerpt: string;
  confidenceScore: number;
  humanReviewRequired: boolean;
  reviewDecision: string;
  reviewNotes?: string | null;
}

interface ImpactAnalysisReport {
  publicationId: string;
  publicationTitle: string;
  overallRiskSeverity: string;
  overallComplianceRisk?: string;
  aiProviderUsed?: string;
  isFallback?: boolean;
  executiveSummary: string;
  immediateActionsRequired: string[];
  findings: ImpactAnalysisFinding[];
  evaluatedControlsCount: number;
  humanReviewRequired: boolean;
  disclaimer?: string;
  analyzedAt: string;
  modelIdentifier?: string;
}

interface ComplianceProfile {
  id?: string;
  industrySector: string;
  isRegulatedFinancialEntity: boolean;
  holdsSensitiveUserData: boolean;
  processesHealthData: boolean;
  crossBorderDataTransfer: boolean;
  cloudInfrastructureProvider: string;
  operatingJurisdictions: string[];
  employeeCountRange: string;
}

// ─── Tabs Navigation ────────────────────────────────────────────────────────────

type TabKey = 'overview' | 'sources' | 'catalogue' | 'publications' | 'obligations' | 'applicability' | 'mappings' | 'gaps' | 'remediation';

const TABS: { key: TabKey; label: string; icon: React.ElementType }[] = [
  { key: 'overview', label: 'Overview', icon: BarChart3 },
  { key: 'sources', label: 'Sources & Intake', icon: Globe2 },
  { key: 'catalogue', label: 'Coverage Catalogue', icon: BookOpen },
  { key: 'publications', label: 'Publications & AI', icon: FileText },
  { key: 'obligations', label: 'Obligations', icon: ShieldCheck },
  { key: 'applicability', label: 'Applicability', icon: Layers },
  { key: 'mappings', label: 'Control Mapping', icon: Link2 },
  { key: 'gaps', label: 'Control Gaps', icon: AlertTriangle },
  { key: 'remediation', label: 'Remediation', icon: CheckCircle },
];

// ─── Status Badges & Helpers ────────────────────────────────────────────────────

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
    <span style={{ display: 'inline-flex', alignItems: 'center', fontSize: 11, fontWeight: 600, color, background: bg, borderRadius: 20, padding: '2px 9px', whiteSpace: 'nowrap' }}>
      {label}
    </span>
  );
}

function outcomeColor(outcome: string): { color: string; bg: string } {
  if (['APPLICABLE', 'IMPLEMENTED', 'SUFFICIENT', 'VERIFIED_CLOSED', 'APPROVED', 'HEALTHY', 'SATISFIED'].includes(outcome)) {
    return { color: '#059669', bg: 'rgba(5,150,105,0.1)' };
  }
  if (['NOT_APPLICABLE', 'REJECTED', 'RISK_ACCEPTED', 'SUPERSEDED'].includes(outcome)) {
    return { color: '#6B7280', bg: 'rgba(107,114,128,0.1)' };
  }
  if (['GAP_IDENTIFIED', 'INSUFFICIENT', 'PARTIALLY_IMPLEMENTED', 'FAILING', 'CRITICAL', 'HIGH'].includes(outcome)) {
    return { color: '#DC2626', bg: 'rgba(220,38,38,0.1)' };
  }
  if (['REQUIRES_REVIEW', 'IN_PROGRESS', 'PENDING_APPROVAL', 'UNDER_REVIEW', 'CANDIDATE', 'PENDING_REVIEW', 'PAUSED', 'MEDIUM', 'PARTIALLY_SATISFIED'].includes(outcome)) {
    return { color: '#D97706', bg: 'rgba(217,119,6,0.1)' };
  }
  return { color: '#6B7280', bg: 'rgba(107,114,128,0.08)' };
}

function priorityColor(priority: string) {
  if (priority === 'CRITICAL') return { color: '#DC2626', bg: 'rgba(220,38,38,0.12)' };
  if (priority === 'HIGH') return { color: '#D97706', bg: 'rgba(217,119,6,0.12)' };
  if (priority === 'MEDIUM') return { color: '#1E40AF', bg: 'rgba(30,64,175,0.12)' };
  return { color: '#6B7280', bg: 'rgba(107,114,128,0.1)' };
}

function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} style={{ height: 44, borderRadius: 8, background: 'linear-gradient(90deg, #F4F6F5 0%, #E8EBEA 50%, #F4F6F5 100%)', backgroundSize: '200% 100%', animation: 'shimmer 1.5s infinite' }} />
      ))}
    </div>
  );
}

function SectionCard({ title, subtitle, children, action }: { title: string; subtitle?: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #E5EAE8', borderRadius: 12, overflow: 'hidden', marginBottom: 20 }}>
      <div style={{ padding: '16px 20px 14px', borderBottom: '1px solid #F0F3F2', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
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

function StatCard({ label, value, icon: Icon, color, subtext, onClick }: { label: string; value: number | string; icon: React.ElementType; color: string; subtext?: string; onClick?: () => void }) {
  return (
    <div
      onClick={onClick}
      style={{
        background: '#fff',
        border: '1px solid #E5EAE8',
        borderRadius: 12,
        padding: '16px 18px',
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        cursor: onClick ? 'pointer' : 'default',
        transition: 'transform 0.15s, box-shadow 0.15s',
      }}
    >
      <div style={{ width: 42, height: 42, borderRadius: 10, background: `${color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Icon size={20} color={color} />
      </div>
      <div style={{ overflow: 'hidden' }}>
        <div style={{ fontSize: 22, fontWeight: 700, color: '#1B2430', lineHeight: 1.2 }}>{value}</div>
        <div style={{ fontSize: 12, color: '#8493A5', marginTop: 2, whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>{label}</div>
        {subtext && <div style={{ fontSize: 11, color: color, marginTop: 1, fontWeight: 500 }}>{subtext}</div>}
      </div>
    </div>
  );
}

// ─── Modal Dialog Shell ─────────────────────────────────────────────────────────

function Modal({ isOpen, onClose, title, subtitle, children, maxWidth = 640 }: { isOpen: boolean; onClose: () => void; title: string; subtitle?: string; children: React.ReactNode; maxWidth?: number }) {
  if (!isOpen) return null;
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(15, 23, 42, 0.45)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '12px 10px' }}>
      <div style={{ background: '#fff', borderRadius: 14, width: '100%', maxWidth, maxHeight: '92vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 40px rgba(0,0,0,0.18)', overflow: 'hidden' }}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid #E5EAE8', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <div style={{ overflow: 'hidden' }}>
            <div style={{ fontSize: 14.5, fontWeight: 700, color: '#1B2430', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>{title}</div>
            {subtitle && <div style={{ fontSize: 11.5, color: '#8493A5', marginTop: 2, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>{subtitle}</div>}
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#8493A5', cursor: 'pointer', padding: 6, borderRadius: 6, display: 'flex', flexShrink: 0 }}>
            <X size={18} />
          </button>
        </div>
        <div style={{ padding: '16px', overflowY: 'auto' }}>
          {children}
        </div>
      </div>
    </div>
  );
}

// ─── OVERVIEW TAB ───────────────────────────────────────────────────────────────

function OverviewTab({ onNavigateTab }: { onNavigateTab: (tab: TabKey) => void }) {
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    const fetchAll = async () => {
      try {
        const [sources, publications, obligations, coverage, gaps, remediationSummary] = await Promise.all([
          apiRequest<{ total: number }>('/regulatory/sources').catch(() => ({ total: 0 })),
          apiRequest<{ total: number }>('/regulatory/publications').catch(() => ({ total: 0 })),
          apiRequest<{ total: number }>('/regulatory/obligations').catch(() => ({ total: 0 })),
          apiRequest<MappingCoverage>('/regulatory/mappings/coverage').catch(() => null),
          apiRequest<any>('/regulatory/gaps/summary').catch(() => null),
          apiRequest<any>('/regulatory/remediation/summary').catch(() => null),
        ]);
        setSummary({ sources, publications, obligations, coverage, gaps, remediationSummary });
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

  const totalGaps = summary.gaps?.totalGaps ?? summary.gaps?.total ?? 0;
  const openRemediations = summary.remediationSummary?.totalOpen ?? 0;
  const coveragePercent = summary.coverage?.coveragePercentage ?? 0;

  const WORKFLOW_STEPS = [
    { num: '01', title: 'Source Registry', desc: 'RBI & standards feeds with health checks', tab: 'sources' as TabKey, icon: Globe2 },
    { num: '02', title: 'Publications & AI', desc: 'Versioned gazettes & automated impact analysis', tab: 'publications' as TabKey, icon: FileText },
    { num: '03', title: 'Obligations Review', desc: 'Extracted regulatory clauses & human approval', tab: 'obligations' as TabKey, icon: BookOpen },
    { num: '04', title: 'Applicability', desc: 'Scope evaluation & organization profile matching', tab: 'applicability' as TabKey, icon: Layers },
    { num: '05', title: 'Control Mapping', desc: 'Cross-walk to internal controls & coverage gaps', tab: 'mappings' as TabKey, icon: Link2 },
    { num: '06', title: 'Control Gaps', desc: 'Defect discovery & evidence sufficiency checks', tab: 'gaps' as TabKey, icon: AlertTriangle },
    { num: '07', title: 'Remediation', desc: 'Task ownership, evidence submission & independent sign-off', tab: 'remediation' as TabKey, icon: CheckCircle },
  ];

  return (
    <div>
      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16, marginBottom: 24 }}>
        <StatCard label="Regulatory Sources" value={summary.sources.total} icon={Globe2} color="#0F6E6A" subtext="RBI Feed Live" onClick={() => onNavigateTab('sources')} />
        <StatCard label="Publications Tracked" value={summary.publications.total} icon={FileText} color="#1E40AF" subtext="With AI Impact Analysis" onClick={() => onNavigateTab('publications')} />
        <StatCard label="Extracted Obligations" value={summary.obligations.total} icon={BookOpen} color="#7C3AED" subtext="Human-Reviewed Workflow" onClick={() => onNavigateTab('obligations')} />
        <StatCard label="Mapping Coverage" value={`${coveragePercent}%`} icon={Link2} color="#059669" subtext="Internal Controls Mapped" onClick={() => onNavigateTab('mappings')} />
        <StatCard label="Control Gaps" value={totalGaps} icon={AlertTriangle} color="#DC2626" subtext="Actionable Deficiencies" onClick={() => onNavigateTab('gaps')} />
        <StatCard label="Open Remediations" value={openRemediations} icon={CheckCircle} color="#D97706" subtext="Under Independent Verification" onClick={() => onNavigateTab('remediation')} />
      </div>

      {/* Hero Lifecycle Banner */}
      <div style={{ background: 'linear-gradient(135deg, #0F6E6A 0%, #1E40AF 100%)', borderRadius: 14, padding: '22px 26px', color: '#fff', marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 18 }}>
          <Scale size={32} style={{ flexShrink: 0, marginTop: 4 }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 6 }}>Traceable Regulatory Compliance Lifecycle</div>
            <div style={{ fontSize: 13.5, opacity: 0.92, lineHeight: 1.6, maxWidth: 900 }}>
              End-to-end regulatory compliance from official authority ingestion through human-reviewed obligations, applicability assessment, control mapping, gap analysis, and segregated remediation verification.
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
              <button
                onClick={() => onNavigateTab('publications')}
                style={{ background: '#fff', color: '#0F6E6A', border: 'none', padding: '7px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
              >
                <Sparkles size={14} /> Run AI Impact Analysis
              </button>
              <button
                onClick={() => onNavigateTab('mappings')}
                style={{ background: 'rgba(255,255,255,0.2)', color: '#fff', border: '1px solid rgba(255,255,255,0.4)', padding: '7px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
              >
                <Link2 size={14} /> Check Control Mappings
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Visual End-to-End Workflow Stepper */}
      <SectionCard title="Compliance Workflow Pipeline" subtitle="Click any stage below to jump directly to its active operations">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
          {WORKFLOW_STEPS.map((step) => {
            const Icon = step.icon;
            return (
              <div
                key={step.num}
                onClick={() => onNavigateTab(step.tab)}
                style={{
                  border: '1px solid #E5EAE8',
                  borderRadius: 10,
                  padding: '14px 16px',
                  background: '#FAFAFA',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  display: 'flex',
                  gap: 12,
                  alignItems: 'flex-start',
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = '#0F6E6A'; (e.currentTarget as HTMLElement).style.background = '#F0F9F8'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = '#E5EAE8'; (e.currentTarget as HTMLElement).style.background = '#FAFAFA'; }}
              >
                <div style={{ width: 34, height: 34, borderRadius: 8, background: '#0F6E6A15', color: '#0F6E6A', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Icon size={17} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#1B2430' }}>{step.num}. {step.title}</div>
                    <ChevronRight size={14} color="#8493A5" />
                  </div>
                  <div style={{ fontSize: 11.5, color: '#5B6672', marginTop: 3, lineHeight: 1.4 }}>{step.desc}</div>
                </div>
              </div>
            );
          })}
        </div>
      </SectionCard>

      {/* Advisory & Security Disclaimer */}
      <div style={{ background: '#FFF8E7', border: '1px solid #F6C752', borderRadius: 10, padding: '14px 18px', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <Info size={18} color="#D97706" style={{ flexShrink: 0, marginTop: 2 }} />
        <div style={{ fontSize: 12.5, color: '#7A4F00', lineHeight: 1.6 }}>
          <strong>Compliance Advisory:</strong> Regulatory intelligence features assist organizations in tracking and complying with statutory mandates. AI-generated analyses and extractions are strictly advisory and require human review. Remediation tasks enforce segregation of duties: independent closure verification cannot be performed by the task creator or assignee.
        </div>
      </div>
    </div>
  );
}

// ─── SOURCES TAB (Includes RBI & Manual Intake) ─────────────────────────────────

function SourcesTab({ showToast }: { showToast: Function }) {
  const [sources, setSources] = useState<RegulatorySource[]>([]);
  const [manualIntakes, setManualIntakes] = useState<ManualIntake[]>([]);
  const [catalogue, setCatalogue] = useState<CatalogueEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [intakeModalOpen, setIntakeModalOpen] = useState(false);

  // Manual Intake Form State
  const [intakeTitle, setIntakeTitle] = useState('');
  const [intakeCatId, setIntakeCatId] = useState('');
  const [intakeIdentifier, setIntakeIdentifier] = useState('');
  const [intakeUrl, setIntakeUrl] = useState('');
  const [intakeNotes, setIntakeNotes] = useState('');
  const [intakeFile, setIntakeFile] = useState<File | null>(null);
  const [submittingIntake, setSubmittingIntake] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [srcRes, intakeRes, catRes] = await Promise.all([
        apiRequest<{ items: RegulatorySource[] }>('/regulatory/sources?limit=100').catch(() => ({ items: [] })),
        apiRequest<ManualIntake[]>('/regulatory/manual-intake').catch(() => []),
        apiRequest<{ items: CatalogueEntry[] }>('/regulatory/catalogue?limit=100').catch(() => ({ items: [] })),
      ]);
      setSources(srcRes.items || []);
      setManualIntakes(intakeRes || []);
      setCatalogue(catRes.items || []);
      if (catRes.items && catRes.items.length > 0 && !intakeCatId) {
        setIntakeCatId(catRes.items[0].id);
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to load source data.');
    } finally {
      setLoading(false);
    }
  }, [intakeCatId]);

  useEffect(() => { loadData(); }, [loadData]);

  const triggerSync = async (sourceId: string, name: string) => {
    setSyncing(sourceId);
    try {
      await apiRequest(`/regulatory/sources/${sourceId}/sync`, { method: 'POST' });
      showToast({ type: 'success', message: `Sync initiated for "${name}". Feed update will reflect shortly.` });
      setTimeout(loadData, 2000);
    } catch (err: any) {
      showToast({ type: 'error', message: err?.message || 'Sync trigger failed.' });
    } finally {
      setSyncing(null);
    }
  };

  const handleManualIntakeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!intakeTitle || !intakeCatId || !intakeFile) {
      showToast({ type: 'error', message: 'Please provide title, catalogue entry, and document file.' });
      return;
    }

    setSubmittingIntake(true);
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const base64Data = (reader.result as string).split(',')[1];
          await apiRequest('/regulatory/manual-intake', {
            method: 'POST',
            body: JSON.stringify({
              catalogueEntryId: intakeCatId,
              title: intakeTitle,
              instrumentIdentifier: intakeIdentifier || undefined,
              sourceUrl: intakeUrl || undefined,
              fileName: intakeFile.name,
              mimeType: intakeFile.type || 'application/pdf',
              fileContentBase64: base64Data,
              provenanceNotes: intakeNotes || undefined,
            }),
          });
          showToast({ type: 'success', message: 'Document ingested successfully and queued for verification.' });
          setIntakeModalOpen(false);
          setIntakeTitle('');
          setIntakeFile(null);
          setIntakeIdentifier('');
          setIntakeUrl('');
          setIntakeNotes('');
          loadData();
        } catch (err: any) {
          showToast({ type: 'error', message: err?.message || 'Failed to submit document intake.' });
        } finally {
          setSubmittingIntake(false);
        }
      };
      reader.readAsDataURL(intakeFile);
    } catch (err: any) {
      setSubmittingIntake(false);
      showToast({ type: 'error', message: err?.message || 'File processing error.' });
    }
  };

  const filtered = sources.filter(s => {
    const q = search.toLowerCase();
    return !q || s.displayName.toLowerCase().includes(q) || s.regulatorCode.toLowerCase().includes(q);
  });

  const rbiSource = sources.find(s => s.regulatorCode === 'RBI');

  return (
    <div>
      {/* Featured Authority Card: Reserve Bank of India */}
      <div style={{ background: '#fff', border: '1px solid #0F6E6A30', borderRadius: 12, padding: '18px 20px', marginBottom: 20, boxShadow: '0 2px 6px rgba(15,110,106,0.06)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: 14 }}>
            <div style={{ width: 44, height: 44, borderRadius: 10, background: '#0F6E6A15', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <ShieldCheck size={24} color="#0F6E6A" />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 16, fontWeight: 700, color: '#1B2430' }}>Reserve Bank of India (RBI)</span>
                <span style={{ fontSize: 11, fontWeight: 600, background: '#0F6E6A15', color: '#0F6E6A', padding: '2px 8px', borderRadius: 12 }}>Primary Connector</span>
              </div>
              <div style={{ fontSize: 12.5, color: '#5B6672', marginTop: 3 }}>
                Official Jurisdiction: <strong>IN (India)</strong> · Authority: <strong>Central Bank & Financial Regulator</strong>
              </div>
              <div style={{ fontSize: 12, color: '#8493A5', marginTop: 3, display: 'flex', alignItems: 'center', gap: 6 }}>
                Official Portal:{' '}
                <a href="https://www.rbi.org.in" target="_blank" rel="noopener noreferrer" style={{ color: '#0F6E6A', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 3, fontWeight: 500 }}>
                  www.rbi.org.in <ExternalLink size={11} />
                </a>
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {rbiSource && <HealthBadge status={rbiSource.healthStatus} />}
            <button
              className="omni-btn-primary"
              style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, padding: '7px 14px' }}
              onClick={() => rbiSource && triggerSync(rbiSource.id, 'Reserve Bank of India')}
              disabled={syncing !== null}
            >
              {syncing === rbiSource?.id ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
              Sync RBI Feed
            </button>
          </div>
        </div>
      </div>

      {/* Sources List Card */}
      <SectionCard
        title="Configured Regulatory Sources"
        subtitle="Automated ingestion connectors with immutable document verification"
        action={
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className="omni-btn-secondary"
              style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}
              onClick={() => setIntakeModalOpen(true)}
            >
              <UploadCloud size={13} />
              Manual Document Intake
            </button>
            <button className="omni-btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }} onClick={loadData}>
              <RefreshCw size={13} />
            </button>
          </div>
        }
      >
        <div style={{ marginBottom: 14 }}>
          <div style={{ position: 'relative', maxWidth: 320 }}>
            <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#8493A5' }} />
            <input
              type="text"
              placeholder="Search sources or regulators..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ width: '100%', padding: '7px 12px 7px 30px', border: '1px solid #D6DAD7', borderRadius: 7, fontSize: 13, color: '#1B2430', outline: 'none', background: '#FAFAFA' }}
            />
          </div>
        </div>

        {loading && <TableSkeleton rows={4} />}
        {error && <InlineErrorState message={error} onRetry={loadData} />}
        {!loading && !error && filtered.length === 0 && (
          <EmptyState icon={Globe2} title="No regulatory sources found" description="Sources are seeded automatically on system initialization." />
        )}
        {!loading && !error && filtered.length > 0 && (
          <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
            <div style={{ minWidth: 560, display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr auto', gap: 12, padding: '8px 12px', background: '#F8FAFA', borderRadius: '8px 8px 0 0', borderBottom: '1px solid #E5EAE8' }}>
                {['Source', 'Regulator', 'Health', 'Publications', 'Action'].map(h => (
                  <div key={h} style={{ fontSize: 11, fontWeight: 600, color: '#8493A5', textTransform: 'uppercase', letterSpacing: 0.5 }}>{h}</div>
                ))}
              </div>
              {filtered.map(s => (
                <div key={s.id} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr auto', gap: 12, padding: '12px', borderBottom: '1px solid #F0F3F2', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#1B2430' }}>{s.displayName}</div>
                    <div style={{ fontSize: 11, color: '#8493A5', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.configuredEndpoint}</div>
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#0F6E6A' }}>{s.regulatorCode}</div>
                  <div><HealthBadge status={s.healthStatus} /></div>
                  <div style={{ fontSize: 13, color: '#1B2430' }}>{s._count?.publications ?? '—'}</div>
                  <div>
                    <button
                      className="omni-btn-secondary"
                      style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, padding: '5px 10px' }}
                      onClick={() => triggerSync(s.id, s.displayName)}
                      disabled={!s.isEnabled || syncing === s.id}
                    >
                      {syncing === s.id ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                      Sync
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </SectionCard>

      {/* Manual Intakes Section */}
      <SectionCard title="Manual Document Intake Register" subtitle="Un-syndicated circulars, whitepapers, and statutory notices awaiting compliance verification">
        {manualIntakes.length === 0 ? (
          <div style={{ padding: '16px 0', textAlign: 'center', color: '#8493A5', fontSize: 13 }}>
            No manual documents uploaded. Use the "Manual Document Intake" button above to ingest statutory guidelines directly.
          </div>
        ) : (
          <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
            <div style={{ minWidth: 560 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr auto', gap: 12, padding: '8px 12px', background: '#F8FAFA', borderRadius: '8px 8px 0 0', borderBottom: '1px solid #E5EAE8' }}>
                {['Document Title', 'Identifier', 'Status', 'Uploaded', 'File'].map(h => (
                  <div key={h} style={{ fontSize: 11, fontWeight: 600, color: '#8493A5', textTransform: 'uppercase', letterSpacing: 0.5 }}>{h}</div>
                ))}
              </div>
              {manualIntakes.map(m => {
                const sc = outcomeColor(m.reviewStatus);
                return (
                  <div key={m.id} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr auto', gap: 12, padding: '12px', borderBottom: '1px solid #F0F3F2', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#1B2430' }}>{m.title}</div>
                      <div style={{ fontSize: 11, color: '#8493A5', marginTop: 2 }}>{m.fileName} ({(m.fileSize / 1024).toFixed(1)} KB)</div>
                    </div>
                    <div style={{ fontSize: 12, fontFamily: 'monospace', color: '#5B6672' }}>{m.instrumentIdentifier || '—'}</div>
                    <div><StatusBadge label={m.reviewStatus.replace(/_/g, ' ')} color={sc.color} bg={sc.bg} /></div>
                    <div style={{ fontSize: 12, color: '#8493A5' }}>{new Date(m.createdAt).toLocaleDateString()}</div>
                    <div>
                      <a
                        href={`/api/regulatory/manual-intake/${m.id}/file`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="omni-btn-secondary"
                        style={{ fontSize: 11, padding: '4px 8px', display: 'flex', alignItems: 'center', gap: 4, textDecoration: 'none', color: 'inherit' }}
                      >
                        <FileText size={12} /> Download
                      </a>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </SectionCard>

      {/* Manual Intake Modal */}
      <Modal isOpen={intakeModalOpen} onClose={() => setIntakeModalOpen(false)} title="Manual Document Intake" subtitle="Submit non-feed statutory publications or proprietary standards">
        <form onSubmit={handleManualIntakeSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#1B2430', display: 'block', marginBottom: 5 }}>Document Title *</label>
            <input
              type="text"
              required
              placeholder="e.g. RBI Master Direction on Information Technology Framework"
              value={intakeTitle}
              onChange={e => setIntakeTitle(e.target.value)}
              style={{ width: '100%', padding: '8px 12px', border: '1px solid #D6DAD7', borderRadius: 7, fontSize: 13 }}
            />
          </div>

          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#1B2430', display: 'block', marginBottom: 5 }}>Regulatory Framework / Catalogue Entry *</label>
            <select
              value={intakeCatId}
              onChange={e => setIntakeCatId(e.target.value)}
              style={{ width: '100%', padding: '8px 12px', border: '1px solid #D6DAD7', borderRadius: 7, fontSize: 13 }}
            >
              {catalogue.map(c => (
                <option key={c.id} value={c.id}>{c.displayName} ({c.jurisdiction})</option>
              ))}
            </select>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#1B2430', display: 'block', marginBottom: 5 }}>Circular / Gazette Number</label>
              <input
                type="text"
                placeholder="e.g. RBI/2026-27/12"
                value={intakeIdentifier}
                onChange={e => setIntakeIdentifier(e.target.value)}
                style={{ width: '100%', padding: '8px 12px', border: '1px solid #D6DAD7', borderRadius: 7, fontSize: 13 }}
              />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#1B2430', display: 'block', marginBottom: 5 }}>Official Source URL</label>
              <input
                type="url"
                placeholder="https://www.rbi.org.in/..."
                value={intakeUrl}
                onChange={e => setIntakeUrl(e.target.value)}
                style={{ width: '100%', padding: '8px 12px', border: '1px solid #D6DAD7', borderRadius: 7, fontSize: 13 }}
              />
            </div>
          </div>

          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#1B2430', display: 'block', marginBottom: 5 }}>Document File (PDF / DOCX) *</label>
            <input
              type="file"
              required
              accept=".pdf,.doc,.docx,.txt"
              onChange={e => setIntakeFile(e.target.files?.[0] || null)}
              style={{ width: '100%', padding: '8px 12px', border: '1px dashed #0F6E6A', borderRadius: 7, fontSize: 12, background: '#F8FAFA' }}
            />
          </div>

          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#1B2430', display: 'block', marginBottom: 5 }}>Provenance / Sourcing Notes</label>
            <textarea
              rows={2}
              placeholder="e.g. Downloaded from official RBI gazette portal on 2026-10-30 by Lead Auditor"
              value={intakeNotes}
              onChange={e => setIntakeNotes(e.target.value)}
              style={{ width: '100%', padding: '8px 12px', border: '1px solid #D6DAD7', borderRadius: 7, fontSize: 13 }}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 10 }}>
            <button type="button" className="omni-btn-secondary" onClick={() => setIntakeModalOpen(false)}>Cancel</button>
            <button type="submit" className="omni-btn-primary" disabled={submittingIntake} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {submittingIntake && <Loader2 size={13} className="animate-spin" />} Ingest Document
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

// ─── CATALOGUE TAB ──────────────────────────────────────────────────────────────

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
    <SectionCard title="Coverage Catalogue" subtitle={`${entries.length} regulatory instruments catalogued across global & regional jurisdictions`}>
      <div style={{ marginBottom: 14 }}>
        <div style={{ position: 'relative', maxWidth: 320 }}>
          <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#8493A5' }} />
          <input
            type="text"
            placeholder="Search instruments or jurisdictions..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ width: '100%', padding: '7px 12px 7px 30px', border: '1px solid #D6DAD7', borderRadius: 7, fontSize: 13, color: '#1B2430', outline: 'none', background: '#FAFAFA' }}
          />
        </div>
      </div>

      {loading && <TableSkeleton rows={5} />}
      {error && <InlineErrorState message={error} />}
      {!loading && !error && filtered.length === 0 && (
        <EmptyState icon={Globe2} title="No catalogue entries" description="Catalogue entries are seeded on system start." />
      )}
      {!loading && !error && filtered.length > 0 && (
        <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
          <div style={{ minWidth: 580 }}>
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
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#1B2430' }}>{e.displayName}</div>
                    <div style={{ fontSize: 11, color: '#8493A5', fontFamily: 'monospace' }}>{e.code}</div>
                  </div>
                  <div style={{ fontSize: 12, color: '#5B6672' }}>{e.jurisdiction}</div>
                  <div><StatusBadge label={e.connectorStatus.replace('_', ' ')} color={cc.color} bg={cc.bg} /></div>
                  <div><StatusBadge label={e.verificationStatus} color={sc.color} bg={sc.bg} /></div>
                  <div style={{ fontSize: 13, color: '#1B2430' }}>{e._count?.publications ?? 0}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </SectionCard>
  );
}

// ─── PUBLICATIONS TAB (Includes AI Impact Analysis) ─────────────────────────────

function PublicationsTab({ showToast }: { showToast: Function }) {
  const [pubs, setPubs] = useState<Publication[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  // Selected Publication & AI Impact State
  const [selectedPub, setSelectedPub] = useState<Publication | null>(null);
  const [aiReport, setAiReport] = useState<ImpactAnalysisReport | null>(null);
  const [loadingAi, setLoadingAi] = useState(false);
  const [aiModalOpen, setAiModalOpen] = useState(false);
  const [versionsModalOpen, setVersionsModalOpen] = useState(false);
  const [extractingId, setExtractingId] = useState<string | null>(null);

  // Review Finding State
  const [reviewingFindingId, setReviewingFindingId] = useState<string | null>(null);
  const [reviewDecision, setReviewDecision] = useState<'ACCEPTED' | 'REJECTED' | 'MODIFIED'>('ACCEPTED');
  const [reviewNotes, setReviewNotes] = useState('');

  const loadPubs = useCallback(async (q?: string) => {
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

  useEffect(() => { loadPubs(); }, [loadPubs]);

  const openAiImpactModal = async (pub: Publication) => {
    setSelectedPub(pub);
    setAiModalOpen(true);
    setLoadingAi(true);
    setAiReport(null);
    try {
      // First check if an existing report exists
      const report = await apiRequest<ImpactAnalysisReport>(`/regulatory/publications/${pub.id}/ai-impact-analysis`);
      setAiReport(report);
    } catch {
      // No cached report found; user can trigger generation manually
      setAiReport(null);
    } finally {
      setLoadingAi(false);
    }
  };

  const triggerAiImpactAnalysis = async () => {
    if (!selectedPub) return;
    setLoadingAi(true);
    try {
      const report = await apiRequest<ImpactAnalysisReport>(`/regulatory/publications/${selectedPub.id}/ai-impact-analysis`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      setAiReport(report);
      showToast({ type: 'success', message: 'AI Impact Analysis generated successfully with citations.' });
    } catch (err: any) {
      showToast({ type: 'error', message: err?.message || 'AI Impact Analysis generation failed.' });
    } finally {
      setLoadingAi(false);
    }
  };

  const handleReviewFinding = async (findingId: string) => {
    if (!selectedPub) return;
    try {
      await apiRequest(`/regulatory/publications/${selectedPub.id}/ai-impact-analysis/review-finding`, {
        method: 'PATCH',
        body: JSON.stringify({
          findingId,
          decision: reviewDecision,
          reviewNotes: reviewNotes || 'Human compliance reviewer verified',
        }),
      });
      showToast({ type: 'success', message: 'Finding review decision saved to audit log.' });
      setReviewingFindingId(null);
      setReviewNotes('');
      // Reload report
      const updated = await apiRequest<ImpactAnalysisReport>(`/regulatory/publications/${selectedPub.id}/ai-impact-analysis`);
      setAiReport(updated);
    } catch (err: any) {
      showToast({ type: 'error', message: err?.message || 'Failed to submit review finding.' });
    }
  };

  const openVersionsModal = async (pub: Publication) => {
    try {
      const full = await apiRequest<Publication>(`/regulatory/publications/${pub.id}`);
      setSelectedPub(full);
      setVersionsModalOpen(true);
    } catch (err: any) {
      showToast({ type: 'error', message: err?.message || 'Failed to load publication version history.' });
    }
  };

  const extractObligations = async (pubId: string) => {
    setExtractingId(pubId);
    try {
      const res = await apiRequest(`/regulatory/publications/${pubId}/extract-obligations`, {
        method: 'POST',
        body: JSON.stringify({ forceReextract: false }),
      });
      showToast({ type: 'success', message: `Extracted ${res.totalExtracted || 0} candidate obligations for human review.` });
      loadPubs();
    } catch (err: any) {
      showToast({ type: 'error', message: err?.message || 'Obligation extraction failed.' });
    } finally {
      setExtractingId(null);
    }
  };

  const procState = (s: string) => {
    const m: Record<string, { label: string; color: string; bg: string }> = {
      DISCOVERED:            { label: 'Discovered',            color: '#6B7280', bg: 'rgba(107,114,128,0.1)' },
      PROCESSING:            { label: 'Processing',            color: '#D97706', bg: 'rgba(217,119,6,0.1)'   },
      OBLIGATIONS_EXTRACTED: { label: 'Obligations Extracted', color: '#1E40AF', bg: 'rgba(30,64,175,0.1)' },
      REVIEWED:              { label: 'Reviewed',              color: '#059669', bg: 'rgba(5,150,105,0.1)'   },
    };
    return m[s] || { label: s, color: '#6B7280', bg: 'rgba(107,114,128,0.1)' };
  };

  return (
    <div>
      <SectionCard
        title="Regulatory Publications & Gazettes"
        subtitle={`${total} publications tracked with immutable hash integrity and AI impact analysis`}
        action={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <div style={{ position: 'relative' }}>
              <Search size={13} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: '#8493A5' }} />
              <input
                type="text"
                placeholder="Search publications..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && loadPubs(search)}
                style={{ padding: '6px 10px 6px 26px', border: '1px solid #D6DAD7', borderRadius: 7, fontSize: 12, outline: 'none', background: '#FAFAFA', width: 200 }}
              />
            </div>
            <button className="omni-btn-secondary" style={{ fontSize: 12, padding: '6px 12px' }} onClick={() => loadPubs(search)}>Search</button>
          </div>
        }
      >
        {loading && <TableSkeleton rows={5} />}
        {error && <InlineErrorState message={error} onRetry={() => loadPubs()} />}
        {!loading && !error && pubs.length === 0 && (
          <EmptyState icon={FileText} title="No publications found" description="Publications will appear as automated sources are synced or manual intakes are verified." />
        )}
        {!loading && !error && pubs.length > 0 && (
          <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
            <div style={{ minWidth: 680 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '3fr 1fr 1fr 1fr auto', gap: 12, padding: '8px 12px', background: '#F8FAFA', borderRadius: '8px 8px 0 0', borderBottom: '1px solid #E5EAE8' }}>
                {['Publication', 'Regulator', 'Date', 'State', 'Actions'].map(h => (
                  <div key={h} style={{ fontSize: 11, fontWeight: 600, color: '#8493A5', textTransform: 'uppercase', letterSpacing: 0.5 }}>{h}</div>
                ))}
              </div>
              {pubs.map(p => {
                const ps = procState(p.processingState);
                return (
                  <div key={p.id} style={{ display: 'grid', gridTemplateColumns: '3fr 1fr 1fr 1fr auto', gap: 12, padding: '12px', borderBottom: '1px solid #F0F3F2', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#1B2430', lineHeight: 1.4 }}>{p.title}</div>
                      <div style={{ display: 'flex', gap: 10, marginTop: 3 }}>
                        {p.publicationNumber && <span style={{ fontSize: 11, color: '#8493A5', fontFamily: 'monospace' }}>{p.publicationNumber}</span>}
                        {p.canonicalUrl && (
                          <a href={p.canonicalUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: '#0F6E6A', display: 'inline-flex', alignItems: 'center', gap: 2, textDecoration: 'none' }}>
                            Official Gazette <ExternalLink size={10} />
                          </a>
                        )}
                      </div>
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#0F6E6A' }}>{p.source?.regulatorCode || '—'}</div>
                    <div style={{ fontSize: 12, color: '#5B6672' }}>{p.publicationDate ? new Date(p.publicationDate).toLocaleDateString() : '—'}</div>
                    <div><StatusBadge label={ps.label} color={ps.color} bg={ps.bg} /></div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'nowrap' }}>
                      <button
                        className="omni-btn-secondary"
                        style={{ fontSize: 11, padding: '5px 8px', display: 'flex', alignItems: 'center', gap: 4, background: '#F0F9F8', color: '#0F6E6A', borderColor: '#0F6E6A40' }}
                        onClick={() => openAiImpactModal(p)}
                        title="Run AI Regulatory Impact Analysis"
                      >
                        <Sparkles size={12} color="#0F6E6A" /> AI Impact
                      </button>
                      <button
                        className="omni-btn-secondary"
                        style={{ fontSize: 11, padding: '5px 8px', display: 'flex', alignItems: 'center', gap: 4 }}
                        onClick={() => openVersionsModal(p)}
                        title="View immutable versions and checksums"
                      >
                        <History size={12} /> v{p.currentVersionNumber}
                      </button>
                      {p.processingState !== 'OBLIGATIONS_EXTRACTED' && p.processingState !== 'REVIEWED' && (
                        <button
                          className="omni-btn-secondary"
                          style={{ fontSize: 11, padding: '5px 8px', display: 'flex', alignItems: 'center', gap: 4 }}
                          onClick={() => extractObligations(p.id)}
                          disabled={extractingId === p.id}
                          title="Extract candidate obligations"
                        >
                          {extractingId === p.id ? <Loader2 size={12} className="animate-spin" /> : <BookOpen size={12} />}
                          Extract
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </SectionCard>

      {/* AI Regulatory Impact Analysis Modal */}
      <Modal
        isOpen={aiModalOpen}
        onClose={() => setAiModalOpen(false)}
        title="AI-Assisted Regulatory Impact Analysis"
        subtitle={selectedPub?.title}
        maxWidth={760}
      >
        <div style={{ background: '#FFF8E7', border: '1px solid #F6C752', borderRadius: 8, padding: '10px 14px', marginBottom: 16, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <Info size={16} color="#D97706" style={{ flexShrink: 0, marginTop: 1 }} />
          <div style={{ fontSize: 12, color: '#7A4F00', lineHeight: 1.5 }}>
            <strong>Advisory Notice:</strong> This AI impact assessment evaluates the publication against your organization's registered controls and obligations. It provides exact source citations but does not constitute official legal advice. Human review is mandatory.
          </div>
        </div>

        {loadingAi && (
          <div style={{ padding: '30px 0', textAlign: 'center' }}>
            <Loader2 size={28} className="animate-spin" style={{ margin: '0 auto 10px', color: '#0F6E6A' }} />
            <div style={{ fontSize: 13, color: '#5B6672' }}>Analyzing document text against organizational controls and obligations...</div>
          </div>
        )}

        {!loadingAi && !aiReport && (
          <div style={{ padding: '30px 20px', textAlign: 'center', background: '#FAFAFA', borderRadius: 10, border: '1px dashed #D6DAD7' }}>
            <Sparkles size={28} color="#0F6E6A" style={{ margin: '0 auto 10px' }} />
            <div style={{ fontSize: 14, fontWeight: 600, color: '#1B2430' }}>No Impact Analysis Generated Yet</div>
            <div style={{ fontSize: 12, color: '#8493A5', marginTop: 4, maxWidth: 450, margin: '4px auto 16px' }}>
              Evaluate this regulatory publication against your organization's controls, identify compliance mandates, and generate human-reviewable findings.
            </div>
            <button className="omni-btn-primary" onClick={triggerAiImpactAnalysis} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, margin: '0 auto' }}>
              <Sparkles size={14} /> Run AI Impact Analysis Now
            </button>
          </div>
        )}

        {!loadingAi && aiReport && (
          <div>
            {/* Report Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px', background: '#F8FAFA', borderRadius: 8, marginBottom: 16, border: '1px solid #E5EAE8', flexWrap: 'wrap', gap: 10 }}>
              <div>
                <div style={{ fontSize: 11, color: '#8493A5', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600 }}>Overall Impact Severity</div>
                <div style={{ marginTop: 3 }}>
                  <StatusBadge
                    label={aiReport.overallRiskSeverity || aiReport.overallComplianceRisk || 'HIGH'}
                    color={priorityColor(aiReport.overallRiskSeverity || aiReport.overallComplianceRisk || 'HIGH').color}
                    bg={priorityColor(aiReport.overallRiskSeverity || aiReport.overallComplianceRisk || 'HIGH').bg}
                  />
                </div>
                <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                  {aiReport.isFallback ? (
                    <span style={{ fontSize: 11, fontWeight: 600, color: '#D97706', background: 'rgba(217,119,6,0.12)', padding: '2px 8px', borderRadius: 12, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <Info size={11} /> Deterministic Heuristic Engine (Rule-Based Fallback)
                    </span>
                  ) : (
                    <span style={{ fontSize: 11, fontWeight: 600, color: '#059669', background: 'rgba(5,150,105,0.12)', padding: '2px 8px', borderRadius: 12, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <Sparkles size={11} /> Gemini 3.8 Flash (Live AI Model)
                    </span>
                  )}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 11, color: '#8493A5' }}>Analyzed: {new Date(aiReport.analyzedAt).toLocaleDateString()}</div>
                <div style={{ fontSize: 11, color: '#0F6E6A', fontWeight: 600, marginTop: 2 }}>Evaluated against {aiReport.evaluatedControlsCount || 5} internal controls</div>
                <div style={{ fontSize: 10.5, color: '#64748B', marginTop: 2 }}>Engine: {aiReport.aiProviderUsed || (aiReport.isFallback ? 'DeterministicEngine' : 'GeminiProvider')}</div>
              </div>
            </div>

            {aiReport.isFallback && (
              <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 8, padding: '10px 12px', fontSize: 11.5, color: '#92400E', marginBottom: 16, lineHeight: 1.5, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <Info size={15} color="#D97706" style={{ flexShrink: 0, marginTop: 1 }} />
                <div>
                  <strong>Analysis Engine Notice:</strong> Generated using OMNiGRC's deterministic compliance rules and control matching heuristics. Live Gemini API execution is in fallback mode or billing quota is unconfigured.
                </div>
              </div>
            )}

            {/* Executive Summary */}
            <div style={{ marginBottom: 18 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#1B2430', marginBottom: 6 }}>Executive Summary</div>
              <div style={{ fontSize: 12.5, color: '#334155', lineHeight: 1.6, background: '#FAFAFA', padding: '12px 14px', borderRadius: 8, border: '1px solid #E5EAE8' }}>
                {aiReport.executiveSummary}
              </div>
            </div>

            {/* Immediate Actions */}
            {aiReport.immediateActionsRequired?.length > 0 && (
              <div style={{ marginBottom: 18 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#1B2430', marginBottom: 6 }}>Immediate Directives</div>
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, color: '#334155', lineHeight: 1.6 }}>
                  {aiReport.immediateActionsRequired.map((action, idx) => (
                    <li key={idx} style={{ marginBottom: 4 }}>{action}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Impact Findings */}
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#1B2430', marginBottom: 10 }}>
                Specific Impact Findings ({aiReport.findings?.length || 0})
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {aiReport.findings?.map((f) => (
                  <div key={f.id} style={{ border: '1px solid #E5EAE8', borderRadius: 8, padding: '12px 14px', background: '#fff' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#1B2430' }}>{f.findingTitle}</div>
                        <div style={{ fontSize: 11, color: '#5B6672', marginTop: 2 }}>Type: {f.impactType.replace(/_/g, ' ')}</div>
                      </div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <StatusBadge label={f.severity} color={priorityColor(f.severity).color} bg={priorityColor(f.severity).bg} />
                        <StatusBadge
                          label={f.reviewDecision || 'PENDING_REVIEW'}
                          color={f.reviewDecision === 'ACCEPTED' ? '#059669' : f.reviewDecision === 'REJECTED' ? '#DC2626' : '#D97706'}
                          bg={f.reviewDecision === 'ACCEPTED' ? 'rgba(5,150,105,0.1)' : f.reviewDecision === 'REJECTED' ? 'rgba(220,38,38,0.1)' : 'rgba(217,119,6,0.1)'}
                        />
                      </div>
                    </div>

                    {/* Source Citation */}
                    {f.sourceExcerpt && (
                      <div style={{ marginTop: 8, padding: '8px 10px', background: '#F8FAFA', borderLeft: '3px solid #0F6E6A', fontSize: 11.5, color: '#475569', fontStyle: 'italic', borderRadius: '0 6px 6px 0' }}>
                        "{f.sourceExcerpt}"
                      </div>
                    )}

                    <div style={{ fontSize: 12, color: '#334155', marginTop: 8 }}>
                      <strong>Suggested Action:</strong> {f.suggestedAction}
                    </div>

                    {f.affectedControlIds?.length > 0 && (
                      <div style={{ fontSize: 11, color: '#8493A5', marginTop: 6 }}>
                        Affected Control IDs: {f.affectedControlIds.join(', ')}
                      </div>
                    )}

                    {/* Review Finding Form */}
                    {reviewingFindingId === f.id ? (
                      <div style={{ marginTop: 12, padding: '10px 12px', background: '#F0F9F8', borderRadius: 6, border: '1px solid #0F6E6A30' }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: '#0F6E6A', marginBottom: 6 }}>Human Compliance Review</div>
                        <div style={{ display: 'flex', gap: 12, marginBottom: 8 }}>
                          {(['ACCEPTED', 'REJECTED', 'MODIFIED'] as const).map(dec => (
                            <label key={dec} style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                              <input
                                type="radio"
                                name="reviewDec"
                                value={dec}
                                checked={reviewDecision === dec}
                                onChange={() => setReviewDecision(dec)}
                              />
                              {dec}
                            </label>
                          ))}
                        </div>
                        <input
                          type="text"
                          placeholder="Reviewer notes (optional)..."
                          value={reviewNotes}
                          onChange={e => setReviewNotes(e.target.value)}
                          style={{ width: '100%', padding: '6px 10px', border: '1px solid #D6DAD7', borderRadius: 6, fontSize: 12, marginBottom: 8 }}
                        />
                        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                          <button className="omni-btn-secondary" style={{ fontSize: 11, padding: '4px 8px' }} onClick={() => setReviewingFindingId(null)}>Cancel</button>
                          <button className="omni-btn-primary" style={{ fontSize: 11, padding: '4px 10px' }} onClick={() => handleReviewFinding(f.id)}>Save Decision</button>
                        </div>
                      </div>
                    ) : (
                      <div style={{ marginTop: 8, display: 'flex', justifyContent: 'flex-end' }}>
                        <button
                          className="omni-btn-secondary"
                          style={{ fontSize: 11, padding: '3px 8px' }}
                          onClick={() => { setReviewingFindingId(f.id); setReviewDecision((f.reviewDecision as any) || 'ACCEPTED'); }}
                        >
                          Review Finding
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* Version History Modal */}
      <Modal
        isOpen={versionsModalOpen}
        onClose={() => setVersionsModalOpen(false)}
        title="Publication Version History"
        subtitle={selectedPub?.title}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {selectedPub?.versions?.map((v) => (
            <div key={v.id} style={{ border: '1px solid #E5EAE8', borderRadius: 8, padding: '12px 14px', background: '#FAFAFA' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#1B2430' }}>Version {v.versionNumber}</div>
                <div style={{ fontSize: 11, color: '#8493A5' }}>{new Date(v.detectedAt).toLocaleString()}</div>
              </div>
              <div style={{ fontSize: 12, color: '#5B6672', marginTop: 4 }}>
                {v.changeSummary || 'Original ingested version.'}
              </div>
              <div style={{ fontSize: 11, color: '#8493A5', fontFamily: 'monospace', marginTop: 6, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                SHA-256: {v.documentChecksum}
              </div>
              <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: v.isDocumentBytesVerified ? '#059669' : '#D97706' }}>
                <CheckCircle size={12} /> {v.isDocumentBytesVerified ? 'Bytes Verified' : 'Unverified Bytes'}
              </div>
            </div>
          ))}
        </div>
      </Modal>
    </div>
  );
}

// ─── OBLIGATIONS TAB ────────────────────────────────────────────────────────────

function ObligationsTab({ showToast }: { showToast: Function }) {
  const [items, setItems] = useState<RegulatoryObligation[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Obligation Detail / Review Modal State
  const [selectedObligation, setSelectedObligation] = useState<RegulatoryObligation | null>(null);
  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [reviewStatusChoice, setReviewStatusChoice] = useState<'APPROVED' | 'REJECTED'>('APPROVED');
  const [reviewNotes, setReviewNotes] = useState('');
  const [reviewingId, setReviewingId] = useState<string | null>(null);

  const loadObligations = useCallback(async () => {
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

  useEffect(() => { loadObligations(); }, [loadObligations]);

  const submitReview = async () => {
    if (!selectedObligation) return;
    setReviewingId(selectedObligation.id);
    try {
      await apiRequest(`/regulatory/obligations/${selectedObligation.id}/review`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: reviewStatusChoice,
          reviewNotes: reviewNotes || 'Human compliance review completed',
        }),
      });
      showToast({ type: 'success', message: `Obligation marked as ${reviewStatusChoice}.` });
      setReviewModalOpen(false);
      loadObligations();
    } catch (err: any) {
      showToast({ type: 'error', message: err?.message || 'Review submission failed.' });
    } finally {
      setReviewingId(null);
    }
  };

  const statusColor = (s: string) => {
    const m: Record<string, { color: string; bg: string }> = {
      CANDIDATE:    { color: '#D97706', bg: 'rgba(217,119,6,0.1)' },
      UNDER_REVIEW: { color: '#1E40AF', bg: 'rgba(30,64,175,0.1)' },
      APPROVED:     { color: '#059669', bg: 'rgba(5,150,105,0.1)' },
      REJECTED:     { color: '#DC2626', bg: 'rgba(220,38,38,0.1)' },
      SUPERSEDED:   { color: '#6B7280', bg: 'rgba(107,114,128,0.1)' },
    };
    return m[s] || { color: '#6B7280', bg: 'rgba(107,114,128,0.08)' };
  };

  return (
    <div>
      <SectionCard
        title="Regulatory Obligations"
        subtitle={`${total} obligations extracted from official publications — CANDIDATE obligations require human approval before applicability assessment`}
        action={
          <div style={{ display: 'flex', gap: 8 }}>
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              style={{ padding: '6px 10px', border: '1px solid #D6DAD7', borderRadius: 7, fontSize: 12, outline: 'none', background: '#FAFAFA', color: '#1B2430' }}
            >
              <option value="">All Statuses</option>
              <option value="CANDIDATE">Candidate (Requires Review)</option>
              <option value="UNDER_REVIEW">Under Review</option>
              <option value="APPROVED">Approved</option>
              <option value="REJECTED">Rejected</option>
            </select>
            <button className="omni-btn-secondary" style={{ fontSize: 12, padding: '6px 12px' }} onClick={loadObligations}>Filter</button>
          </div>
        }
      >
        <div style={{ marginBottom: 14 }}>
          <div style={{ position: 'relative', maxWidth: 320 }}>
            <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#8493A5' }} />
            <input
              type="text"
              placeholder="Search obligations by title..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && loadObligations()}
              style={{ width: '100%', padding: '7px 12px 7px 30px', border: '1px solid #D6DAD7', borderRadius: 7, fontSize: 13, color: '#1B2430', outline: 'none', background: '#FAFAFA' }}
            />
          </div>
        </div>

        {loading && <TableSkeleton rows={5} />}
        {error && <InlineErrorState message={error} onRetry={loadObligations} />}
        {!loading && !error && items.length === 0 && (
          <EmptyState icon={ShieldCheck} title="No obligations found" description="Extract obligations from publications or ingest new regulatory documents." />
        )}
        {!loading && !error && items.length > 0 && (
          <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
            <div style={{ minWidth: 640 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '3fr 1fr 1fr 1fr auto', gap: 12, padding: '8px 12px', background: '#F8FAFA', borderRadius: '8px 8px 0 0', borderBottom: '1px solid #E5EAE8' }}>
                {['Obligation & Clause', 'Status', 'Jurisdiction', 'Reviewed', 'Actions'].map(h => (
                  <div key={h} style={{ fontSize: 11, fontWeight: 600, color: '#8493A5', textTransform: 'uppercase', letterSpacing: 0.5 }}>{h}</div>
                ))}
              </div>
              {items.map(ob => {
                const sc = statusColor(ob.status);
                return (
                  <div key={ob.id} style={{ display: 'grid', gridTemplateColumns: '3fr 1fr 1fr 1fr auto', gap: 12, padding: '12px', borderBottom: '1px solid #F0F3F2', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#1B2430', lineHeight: 1.4 }}>{ob.title}</div>
                      <div style={{ display: 'flex', gap: 10, marginTop: 2 }}>
                        {ob.sourceClauseRef && <span style={{ fontSize: 11, color: '#8493A5' }}>Clause: {ob.sourceClauseRef}</span>}
                        {ob.affectedActor && <span style={{ fontSize: 11, color: '#8493A5' }}>Actor: {ob.affectedActor}</span>}
                      </div>
                    </div>
                    <div><StatusBadge label={ob.status.replace(/_/g, ' ')} color={sc.color} bg={sc.bg} /></div>
                    <div style={{ fontSize: 12, color: '#5B6672' }}>{ob.jurisdiction || 'GLOBAL'}</div>
                    <div>{ob.isHumanReviewed ? <CheckCircle size={14} color="#059669" /> : <Circle size={14} color="#D97706" />}</div>
                    <div>
                      <button
                        className="omni-btn-secondary"
                        style={{ fontSize: 11, padding: '4px 10px', display: 'flex', alignItems: 'center', gap: 4 }}
                        onClick={() => {
                          setSelectedObligation(ob);
                          setReviewStatusChoice(ob.status === 'APPROVED' ? 'APPROVED' : 'APPROVED');
                          setReviewNotes(ob.reviewNotes || '');
                          setReviewModalOpen(true);
                        }}
                      >
                        <Eye size={12} /> Details / Review
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </SectionCard>

      {/* Obligation Detail & Review Modal */}
      <Modal
        isOpen={reviewModalOpen}
        onClose={() => setReviewModalOpen(false)}
        title="Regulatory Obligation Review"
        subtitle={selectedObligation?.title}
        maxWidth={640}
      >
        {selectedObligation && (
          <div>
            <div style={{ background: '#F8FAFA', border: '1px solid #E5EAE8', borderRadius: 8, padding: '12px 14px', marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#8493A5', textTransform: 'uppercase' }}>Full Obligation Text</div>
              <div style={{ fontSize: 13, color: '#1B2430', lineHeight: 1.6, marginTop: 4 }}>
                {selectedObligation.fullText}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
              <div>
                <span style={{ fontSize: 11, color: '#8493A5' }}>Source Clause:</span>
                <div style={{ fontSize: 12.5, fontWeight: 500, color: '#1B2430' }}>{selectedObligation.sourceClauseRef || 'General Statutory Direction'}</div>
              </div>
              <div>
                <span style={{ fontSize: 11, color: '#8493A5' }}>Affected Actor:</span>
                <div style={{ fontSize: 12.5, fontWeight: 500, color: '#1B2430' }}>{selectedObligation.affectedActor || 'Regulated Entity'}</div>
              </div>
              <div>
                <span style={{ fontSize: 11, color: '#8493A5' }}>Extraction Method:</span>
                <div style={{ fontSize: 12.5, fontWeight: 500, color: '#1B2430' }}>{selectedObligation.extractionMethod}</div>
              </div>
              <div>
                <span style={{ fontSize: 11, color: '#8493A5' }}>Compliance Deadline:</span>
                <div style={{ fontSize: 12.5, fontWeight: 500, color: '#1B2430' }}>
                  {selectedObligation.complianceDeadline ? new Date(selectedObligation.complianceDeadline).toLocaleDateString() : 'Statutory / Ongoing'}
                </div>
              </div>
            </div>

            {/* Human Review Form */}
            <div style={{ borderTop: '1px solid #E5EAE8', paddingTop: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#1B2430', marginBottom: 8 }}>Human Compliance Sign-Off</div>
              <div style={{ display: 'flex', gap: 16, marginBottom: 10 }}>
                <label style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name="obReviewChoice"
                    value="APPROVED"
                    checked={reviewStatusChoice === 'APPROVED'}
                    onChange={() => setReviewStatusChoice('APPROVED')}
                  />
                  Approve (Eligible for Applicability Assessment)
                </label>
                <label style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name="obReviewChoice"
                    value="REJECTED"
                    checked={reviewStatusChoice === 'REJECTED'}
                    onChange={() => setReviewStatusChoice('REJECTED')}
                  />
                  Reject (Non-binding or duplicate)
                </label>
              </div>

              <textarea
                rows={2}
                placeholder="Compliance reviewer notes..."
                value={reviewNotes}
                onChange={e => setReviewNotes(e.target.value)}
                style={{ width: '100%', padding: '8px 12px', border: '1px solid #D6DAD7', borderRadius: 7, fontSize: 12, marginBottom: 12 }}
              />

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button className="omni-btn-secondary" onClick={() => setReviewModalOpen(false)}>Cancel</button>
                <button className="omni-btn-primary" onClick={submitReview} disabled={reviewingId !== null} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {reviewingId !== null && <Loader2 size={13} className="animate-spin" />} Submit Review
                </button>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

// ─── APPLICABILITY TAB ──────────────────────────────────────────────────────────

function ApplicabilityTab({ showToast }: { showToast: Function }) {
  const [items, setItems] = useState<ApplicabilityAssessment[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [outcomeFilter, setOutcomeFilter] = useState('');
  const [assessing, setAssessing] = useState(false);

  // Profile Modal
  const [profile, setProfile] = useState<ComplianceProfile | null>(null);
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);

  // Review / Override Modal
  const [selectedAssessment, setSelectedAssessment] = useState<ApplicabilityAssessment | null>(null);
  const [overrideOutcome, setOverrideOutcome] = useState<'APPLICABLE' | 'NOT_APPLICABLE'>('APPLICABLE');
  const [overrideNotes, setOverrideNotes] = useState('');
  const [overrideModalOpen, setOverrideModalOpen] = useState(false);

  const loadAssessments = useCallback(async () => {
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

  useEffect(() => { loadAssessments(); }, [loadAssessments]);

  const triggerAssessment = async () => {
    setAssessing(true);
    try {
      const res = await apiRequest('/regulatory/applicability/assess', {
        method: 'POST',
        body: JSON.stringify({ forceReassess: true }),
      });
      showToast({ type: 'success', message: `Assessed ${res.totalEvaluated || 'all'} approved obligations against organization profile.` });
      loadAssessments();
    } catch (err: any) {
      showToast({ type: 'error', message: err?.message || 'Assessment failed.' });
    } finally {
      setAssessing(false);
    }
  };

  const loadProfile = async () => {
    try {
      const p = await apiRequest<ComplianceProfile>('/regulatory/organization-profile');
      setProfile(p);
      setProfileModalOpen(true);
    } catch (err: any) {
      showToast({ type: 'error', message: err?.message || 'Failed to load organization compliance profile.' });
    }
  };

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    setSavingProfile(true);
    try {
      await apiRequest('/regulatory/organization-profile', {
        method: 'PUT',
        body: JSON.stringify(profile),
      });
      showToast({ type: 'success', message: 'Organization compliance profile updated.' });
      setProfileModalOpen(false);
    } catch (err: any) {
      showToast({ type: 'error', message: err?.message || 'Failed to update compliance profile.' });
    } finally {
      setSavingProfile(false);
    }
  };

  const submitOverride = async () => {
    if (!selectedAssessment) return;
    try {
      await apiRequest(`/regulatory/applicability/${selectedAssessment.id}/review`, {
        method: 'PATCH',
        body: JSON.stringify({
          outcome: overrideOutcome,
          reviewNotes: overrideNotes || 'Manual override by compliance officer',
        }),
      });
      showToast({ type: 'success', message: 'Applicability assessment updated.' });
      setOverrideModalOpen(false);
      loadAssessments();
    } catch (err: any) {
      showToast({ type: 'error', message: err?.message || 'Override failed.' });
    }
  };

  return (
    <div>
      <SectionCard
        title="Applicability Assessments"
        subtitle={`${total} assessments evaluated against organization profile — APPLICABLE obligations proceed to control mapping`}
        action={
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="omni-btn-secondary" style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 5 }} onClick={loadProfile}>
              <Layers size={13} /> Organization Profile
            </button>
            <button className="omni-btn-primary" style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 5 }} onClick={triggerAssessment} disabled={assessing}>
              {assessing ? <Loader2 size={13} className="animate-spin" /> : <ShieldCheck size={13} />}
              Run Applicability Assessment
            </button>
          </div>
        }
      >
        <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
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
          <button className="omni-btn-secondary" style={{ fontSize: 12, padding: '6px 12px' }} onClick={loadAssessments}>Filter</button>
        </div>

        {loading && <TableSkeleton rows={5} />}
        {error && <InlineErrorState message={error} onRetry={loadAssessments} />}
        {!loading && !error && items.length === 0 && (
          <EmptyState
            icon={Layers}
            title="No applicability assessments"
            description="Run applicability assessment to evaluate approved regulatory obligations against your organization profile."
          />
        )}
        {!loading && !error && items.length > 0 && (
          <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
            <div style={{ minWidth: 580 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr auto', gap: 12, padding: '8px 12px', background: '#F8FAFA', borderRadius: '8px 8px 0 0', borderBottom: '1px solid #E5EAE8' }}>
                {['Obligation Ref', 'Outcome', 'Confidence', 'Determination', 'Action'].map(h => (
                  <div key={h} style={{ fontSize: 11, fontWeight: 600, color: '#8493A5', textTransform: 'uppercase', letterSpacing: 0.5 }}>{h}</div>
                ))}
              </div>
              {items.map(a => {
                const oc = outcomeColor(a.outcome);
                const cc = outcomeColor(a.confidence === 'HIGH' ? 'APPLICABLE' : a.confidence === 'MEDIUM' ? 'REQUIRES_REVIEW' : 'NOT_APPLICABLE');
                return (
                  <div key={a.id} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr auto', gap: 12, padding: '12px', borderBottom: '1px solid #F0F3F2', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontSize: 12, color: '#1B2430', fontWeight: 600 }}>{a.obligation?.title || a.obligationId}</div>
                      {a.rationale && <div style={{ fontSize: 11, color: '#8493A5', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.rationale}</div>}
                    </div>
                    <div><StatusBadge label={a.outcome.replace(/_/g, ' ')} color={oc.color} bg={oc.bg} /></div>
                    <div><StatusBadge label={a.confidence} color={cc.color} bg={cc.bg} /></div>
                    <div style={{ fontSize: 12, color: '#5B6672' }}>{a.determinationType.replace(/_/g, ' ')}</div>
                    <div>
                      <button
                        className="omni-btn-secondary"
                        style={{ fontSize: 11, padding: '4px 8px' }}
                        onClick={() => {
                          setSelectedAssessment(a);
                          setOverrideOutcome(a.outcome === 'APPLICABLE' ? 'APPLICABLE' : 'APPLICABLE');
                          setOverrideNotes(a.reviewNotes || '');
                          setOverrideModalOpen(true);
                        }}
                      >
                        Review / Override
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </SectionCard>

      {/* Override Modal */}
      <Modal
        isOpen={overrideModalOpen}
        onClose={() => setOverrideModalOpen(false)}
        title="Applicability Determination Override"
        subtitle={selectedAssessment?.obligation?.title || selectedAssessment?.obligationId}
      >
        {selectedAssessment && (
          <div>
            <div style={{ background: '#F8FAFA', border: '1px solid #E5EAE8', borderRadius: 8, padding: '12px 14px', marginBottom: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#8493A5', textTransform: 'uppercase' }}>Current Determination Rationale</div>
              <div style={{ fontSize: 12.5, color: '#1B2430', marginTop: 4 }}>{selectedAssessment.rationale || 'Rule-matched against profile attributes.'}</div>
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#1B2430', display: 'block', marginBottom: 6 }}>Override Outcome</label>
              <div style={{ display: 'flex', gap: 14 }}>
                <label style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                  <input type="radio" name="appOverride" value="APPLICABLE" checked={overrideOutcome === 'APPLICABLE'} onChange={() => setOverrideOutcome('APPLICABLE')} />
                  Applicable
                </label>
                <label style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                  <input type="radio" name="appOverride" value="NOT_APPLICABLE" checked={overrideOutcome === 'NOT_APPLICABLE'} onChange={() => setOverrideOutcome('NOT_APPLICABLE')} />
                  Not Applicable
                </label>
              </div>
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#1B2430', display: 'block', marginBottom: 5 }}>Review Justification *</label>
              <textarea
                rows={3}
                placeholder="Document reason for override..."
                value={overrideNotes}
                onChange={e => setOverrideNotes(e.target.value)}
                style={{ width: '100%', padding: '8px 12px', border: '1px solid #D6DAD7', borderRadius: 7, fontSize: 12 }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button className="omni-btn-secondary" onClick={() => setOverrideModalOpen(false)}>Cancel</button>
              <button className="omni-btn-primary" onClick={submitOverride}>Save Override</button>
            </div>
          </div>
        )}
      </Modal>

      {/* Compliance Profile Modal */}
      <Modal
        isOpen={profileModalOpen}
        onClose={() => setProfileModalOpen(false)}
        title="Organization Compliance Profile"
        subtitle="Configures organization attributes used by the rule-based applicability engine"
      >
        {profile && (
          <form onSubmit={saveProfile} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#1B2430', display: 'block', marginBottom: 4 }}>Industry Sector</label>
              <input
                type="text"
                value={profile.industrySector || ''}
                onChange={e => setProfile({ ...profile, industrySector: e.target.value })}
                style={{ width: '100%', padding: '7px 10px', border: '1px solid #D6DAD7', borderRadius: 6, fontSize: 12 }}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                <input
                  type="checkbox"
                  checked={profile.isRegulatedFinancialEntity}
                  onChange={e => setProfile({ ...profile, isRegulatedFinancialEntity: e.target.checked })}
                />
                Regulated Financial Entity (RBI / Banking)
              </label>
              <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                <input
                  type="checkbox"
                  checked={profile.holdsSensitiveUserData}
                  onChange={e => setProfile({ ...profile, holdsSensitiveUserData: e.target.checked })}
                />
                Processes Sensitive Personal Data
              </label>
              <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                <input
                  type="checkbox"
                  checked={profile.processesHealthData}
                  onChange={e => setProfile({ ...profile, processesHealthData: e.target.checked })}
                />
                Processes Health / Medical Data
              </label>
              <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                <input
                  type="checkbox"
                  checked={profile.crossBorderDataTransfer}
                  onChange={e => setProfile({ ...profile, crossBorderDataTransfer: e.target.checked })}
                />
                Cross-Border Data Transfers
              </label>
            </div>

            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#1B2430', display: 'block', marginBottom: 4 }}>Primary Cloud Infrastructure</label>
              <input
                type="text"
                placeholder="e.g. AWS (ap-south-1 Mumbai)"
                value={profile.cloudInfrastructureProvider || ''}
                onChange={e => setProfile({ ...profile, cloudInfrastructureProvider: e.target.value })}
                style={{ width: '100%', padding: '7px 10px', border: '1px solid #D6DAD7', borderRadius: 6, fontSize: 12 }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
              <button type="button" className="omni-btn-secondary" onClick={() => setProfileModalOpen(false)}>Cancel</button>
              <button type="submit" className="omni-btn-primary" disabled={savingProfile}>
                {savingProfile ? 'Saving...' : 'Save Profile'}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}

// ─── CONTROL MAPPING TAB (NEW WORKFLOW VIEW) ───────────────────────────────────

function MappingsTab({ showToast }: { showToast: Function }) {
  const [mappings, setMappings] = useState<ObligationControlMapping[]>([]);
  const [coverage, setCoverage] = useState<MappingCoverage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [suggesting, setSuggesting] = useState(false);

  // Manual Mapping Modal
  const [mappingModalOpen, setMappingModalOpen] = useState(false);
  const [obligations, setObligations] = useState<RegulatoryObligation[]>([]);
  const [mapObId, setMapObId] = useState('');
  const [mapControlId, setMapControlId] = useState('');
  const [mapType, setMapType] = useState('DIRECT');
  const [mapNotes, setMapNotes] = useState('');
  const [submittingMap, setSubmittingMap] = useState(false);

  const loadMappingsData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [mapsRes, covRes, obsRes] = await Promise.all([
        apiRequest<{ items: ObligationControlMapping[] }>('/regulatory/mappings?limit=100').catch(() => ({ items: [] })),
        apiRequest<MappingCoverage>('/regulatory/mappings/coverage').catch(() => null),
        apiRequest<{ items: RegulatoryObligation[] }>('/regulatory/obligations?status=APPROVED&limit=100').catch(() => ({ items: [] })),
      ]);
      setMappings(mapsRes.items || []);
      setCoverage(covRes);
      setObligations(obsRes.items || []);
      if (obsRes.items?.length > 0 && !mapObId) {
        setMapObId(obsRes.items[0].id);
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to load control mappings.');
    } finally {
      setLoading(false);
    }
  }, [mapObId]);

  useEffect(() => { loadMappingsData(); }, [loadMappingsData]);

  const triggerSuggestions = async () => {
    setSuggesting(true);
    try {
      const res = await apiRequest('/regulatory/mappings/suggest', {
        method: 'POST',
        body: JSON.stringify({ minConfidence: 0.5 }),
      });
      showToast({ type: 'success', message: `Mapping engine generated ${res.totalSuggested || 0} candidate mappings.` });
      loadMappingsData();
    } catch (err: any) {
      showToast({ type: 'error', message: err?.message || 'Mapping suggestion failed.' });
    } finally {
      setSuggesting(false);
    }
  };

  const handleReviewMapping = async (id: string, status: 'APPROVED' | 'REJECTED') => {
    try {
      await apiRequest(`/regulatory/mappings/${id}/review`, {
        method: 'PATCH',
        body: JSON.stringify({ status, reviewNotes: `Reviewed via Mapping UI` }),
      });
      showToast({ type: 'success', message: `Mapping ${status.toLowerCase()}.` });
      loadMappingsData();
    } catch (err: any) {
      showToast({ type: 'error', message: err?.message || 'Review failed.' });
    }
  };

  const handleCreateMapping = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mapObId || !mapControlId) {
      showToast({ type: 'error', message: 'Please select an obligation and specify a control ID.' });
      return;
    }
    setSubmittingMap(true);
    try {
      await apiRequest('/regulatory/mappings', {
        method: 'POST',
        body: JSON.stringify({
          obligationId: mapObId,
          controlId: mapControlId,
          mappingType: mapType,
          notes: mapNotes || undefined,
        }),
      });
      showToast({ type: 'success', message: 'Control mapping established.' });
      setMappingModalOpen(false);
      setMapControlId('');
      setMapNotes('');
      loadMappingsData();
    } catch (err: any) {
      showToast({ type: 'error', message: err?.message || 'Failed to create control mapping.' });
    } finally {
      setSubmittingMap(false);
    }
  };

  return (
    <div>
      {/* Coverage Progress Card */}
      {coverage && (
        <div style={{ background: '#fff', border: '1px solid #E5EAE8', borderRadius: 12, padding: '16px 20px', marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div>
              <span style={{ fontSize: 14, fontWeight: 700, color: '#1B2430' }}>Obligation-to-Control Coverage</span>
              <span style={{ fontSize: 12, color: '#8493A5', marginLeft: 8 }}>
                ({coverage.mappedObligations} of {coverage.totalApplicableObligations} applicable obligations mapped)
              </span>
            </div>
            <div style={{ fontSize: 18, fontWeight: 800, color: coverage.coveragePercentage >= 80 ? '#059669' : coverage.coveragePercentage >= 50 ? '#D97706' : '#DC2626' }}>
              {coverage.coveragePercentage}%
            </div>
          </div>
          <div style={{ height: 8, background: '#E5EAE8', borderRadius: 4, overflow: 'hidden' }}>
            <div
              style={{
                height: '100%',
                width: `${coverage.coveragePercentage}%`,
                background: coverage.coveragePercentage >= 80 ? '#059669' : coverage.coveragePercentage >= 50 ? '#D97706' : '#DC2626',
                transition: 'width 0.4s ease',
              }}
            />
          </div>
        </div>
      )}

      {/* Main Mappings Card */}
      <SectionCard
        title="Control Mapping Workflow"
        subtitle="Cross-reference statutory obligations to internal security & governance controls"
        action={
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="omni-btn-secondary" style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 5 }} onClick={() => setMappingModalOpen(true)}>
              <Plus size={13} /> Add Manual Mapping
            </button>
            <button className="omni-btn-primary" style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 5 }} onClick={triggerSuggestions} disabled={suggesting}>
              {suggesting ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
              Suggest Mappings with AI
            </button>
          </div>
        }
      >
        {loading && <TableSkeleton rows={5} />}
        {error && <InlineErrorState message={error} onRetry={loadMappingsData} />}
        {!loading && !error && mappings.length === 0 && (
          <EmptyState
            icon={Link2}
            title="No control mappings found"
            description="Run 'Suggest Mappings with AI' or manually connect applicable obligations to organizational controls."
          />
        )}
        {!loading && !error && mappings.length > 0 && (
          <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
            <div style={{ minWidth: 640 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 1fr 1fr auto', gap: 12, padding: '8px 12px', background: '#F8FAFA', borderRadius: '8px 8px 0 0', borderBottom: '1px solid #E5EAE8' }}>
                {['Obligation', 'Mapped Control', 'Type', 'Status', 'Review'].map(h => (
                  <div key={h} style={{ fontSize: 11, fontWeight: 600, color: '#8493A5', textTransform: 'uppercase', letterSpacing: 0.5 }}>{h}</div>
                ))}
              </div>
              {mappings.map(m => {
                const sc = outcomeColor(m.status);
                return (
                  <div key={m.id} style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 1fr 1fr auto', gap: 12, padding: '12px', borderBottom: '1px solid #F0F3F2', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#1B2430' }}>{m.obligation?.title || m.obligationId}</div>
                      <div style={{ fontSize: 11, color: '#8493A5', marginTop: 2 }}>Confidence: {Math.round((m.confidenceScore || 0) * 100)}%</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 500, color: '#0F6E6A' }}>{m.control?.name || m.controlId}</div>
                      {m.control?.category && <div style={{ fontSize: 11, color: '#8493A5' }}>Category: {m.control.category}</div>}
                    </div>
                    <div style={{ fontSize: 12, color: '#5B6672' }}>{m.mappingType}</div>
                    <div><StatusBadge label={m.status.replace(/_/g, ' ')} color={sc.color} bg={sc.bg} /></div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {m.status !== 'APPROVED' && (
                        <button className="omni-btn-secondary" style={{ fontSize: 11, padding: '4px 8px', color: '#059669' }} onClick={() => handleReviewMapping(m.id, 'APPROVED')}>
                          Approve
                        </button>
                      )}
                      {m.status !== 'REJECTED' && (
                        <button className="omni-btn-secondary" style={{ fontSize: 11, padding: '4px 8px', color: '#DC2626' }} onClick={() => handleReviewMapping(m.id, 'REJECTED')}>
                          Reject
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </SectionCard>

      {/* Manual Mapping Modal */}
      <Modal isOpen={mappingModalOpen} onClose={() => setMappingModalOpen(false)} title="Create Obligation-to-Control Mapping" subtitle="Map an approved statutory obligation directly to an internal control">
        <form onSubmit={handleCreateMapping} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#1B2430', display: 'block', marginBottom: 5 }}>Select Approved Obligation *</label>
            <select
              value={mapObId}
              onChange={e => setMapObId(e.target.value)}
              style={{ width: '100%', padding: '8px 12px', border: '1px solid #D6DAD7', borderRadius: 7, fontSize: 12 }}
            >
              {obligations.map(ob => (
                <option key={ob.id} value={ob.id}>{ob.title} ({ob.jurisdiction || 'GLOBAL'})</option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#1B2430', display: 'block', marginBottom: 5 }}>Internal Control ID *</label>
            <input
              type="text"
              required
              placeholder="e.g. CTRL-SEC-01 or control UUID"
              value={mapControlId}
              onChange={e => setMapControlId(e.target.value)}
              style={{ width: '100%', padding: '8px 12px', border: '1px solid #D6DAD7', borderRadius: 7, fontSize: 12 }}
            />
          </div>

          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#1B2430', display: 'block', marginBottom: 5 }}>Mapping Type</label>
            <select
              value={mapType}
              onChange={e => setMapType(e.target.value)}
              style={{ width: '100%', padding: '8px 12px', border: '1px solid #D6DAD7', borderRadius: 7, fontSize: 12 }}
            >
              <option value="DIRECT">Direct Satisfaction</option>
              <option value="PARTIAL">Partial Satisfaction</option>
              <option value="COMPENSATING">Compensating Control</option>
            </select>
          </div>

          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#1B2430', display: 'block', marginBottom: 5 }}>Mapping Notes</label>
            <textarea
              rows={2}
              placeholder="Describe how control satisfies this obligation..."
              value={mapNotes}
              onChange={e => setMapNotes(e.target.value)}
              style={{ width: '100%', padding: '8px 12px', border: '1px solid #D6DAD7', borderRadius: 7, fontSize: 12 }}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
            <button type="button" className="omni-btn-secondary" onClick={() => setMappingModalOpen(false)}>Cancel</button>
            <button type="submit" className="omni-btn-primary" disabled={submittingMap}>
              {submittingMap ? 'Saving...' : 'Establish Mapping'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

// ─── CONTROL GAPS TAB ──────────────────────────────────────────────────────────

function GapsTab({ showToast, onInitiateRemediation }: { showToast: Function; onInitiateRemediation: (gap: GapAssessment) => void }) {
  const [items, setItems] = useState<GapAssessment[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [evaluating, setEvaluating] = useState(false);

  // Review Gap Modal
  const [selectedGap, setSelectedGap] = useState<GapAssessment | null>(null);
  const [gapReviewOutcome, setGapReviewOutcome] = useState('GAP_IDENTIFIED');
  const [gapReviewNotes, setGapReviewNotes] = useState('');
  const [gapModalOpen, setGapModalOpen] = useState(false);

  const loadGaps = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiRequest<{ items: GapAssessment[]; total: number }>('/regulatory/gaps?limit=50');
      setItems(res.items || []);
      setTotal(res.total || 0);
    } catch (err: any) {
      setError(err?.message || 'Failed to load gap assessments.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadGaps(); }, [loadGaps]);

  const triggerGapAssessment = async () => {
    setEvaluating(true);
    try {
      const res = await apiRequest('/regulatory/gaps/assess', {
        method: 'POST',
        body: JSON.stringify({ forceReassess: true }),
      });
      showToast({ type: 'success', message: `Control gaps evaluated across ${res.totalEvaluated || 'all'} mapped obligations.` });
      loadGaps();
    } catch (err: any) {
      showToast({ type: 'error', message: err?.message || 'Gap evaluation failed.' });
    } finally {
      setEvaluating(false);
    }
  };

  const submitGapReview = async () => {
    if (!selectedGap) return;
    try {
      await apiRequest(`/regulatory/gaps/${selectedGap.id}/review`, {
        method: 'PATCH',
        body: JSON.stringify({
          gapOutcome: gapReviewOutcome,
          reviewNotes: gapReviewNotes || 'Compliance officer reviewed gap defect',
        }),
      });
      showToast({ type: 'success', message: 'Gap finding updated.' });
      setGapModalOpen(false);
      loadGaps();
    } catch (err: any) {
      showToast({ type: 'error', message: err?.message || 'Failed to update gap finding.' });
    }
  };

  return (
    <div>
      <SectionCard
        title="Control Gap Assessments"
        subtitle={`${total} gap assessments — GAP_IDENTIFIED findings reveal unmapped controls or missing/expired audit evidence`}
        action={
          <button className="omni-btn-primary" style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 5 }} onClick={triggerGapAssessment} disabled={evaluating}>
            {evaluating ? <Loader2 size={13} className="animate-spin" /> : <AlertTriangle size={13} />}
            Evaluate Control Gaps
          </button>
        }
      >
        {loading && <TableSkeleton rows={5} />}
        {error && <InlineErrorState message={error} onRetry={loadGaps} />}
        {!loading && !error && items.length === 0 && (
          <EmptyState
            icon={AlertTriangle}
            title="No gap assessments found"
            description="Run 'Evaluate Control Gaps' to identify compliance shortfalls between regulatory obligations and current control implementation."
          />
        )}
        {!loading && !error && items.length > 0 && (
          <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
            <div style={{ minWidth: 620 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr auto', gap: 12, padding: '8px 12px', background: '#F8FAFA', borderRadius: '8px 8px 0 0', borderBottom: '1px solid #E5EAE8' }}>
                {['Obligation / Control', 'Gap State', 'Evidence', 'Risk', 'Actions'].map(h => (
                  <div key={h} style={{ fontSize: 11, fontWeight: 600, color: '#8493A5', textTransform: 'uppercase', letterSpacing: 0.5 }}>{h}</div>
                ))}
              </div>
              {items.map(g => {
                const gc = outcomeColor(g.gapOutcome);
                const ec = outcomeColor(g.evidenceOutcome);
                const isGap = g.gapOutcome === 'GAP_IDENTIFIED' || g.evidenceOutcome === 'INSUFFICIENT' || g.evidenceOutcome === 'EXPIRED';
                return (
                  <div key={g.id} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr auto', gap: 12, padding: '12px', borderBottom: '1px solid #F0F3F2', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#1B2430' }}>{g.obligation?.title || g.obligationId}</div>
                      <div style={{ fontSize: 11, color: '#0F6E6A', marginTop: 2 }}>Control: {g.control?.name || g.controlId || 'No Control Mapped'}</div>
                    </div>
                    <div><StatusBadge label={g.gapOutcome.replace(/_/g, ' ')} color={gc.color} bg={gc.bg} /></div>
                    <div><StatusBadge label={g.evidenceOutcome.replace(/_/g, ' ')} color={ec.color} bg={ec.bg} /></div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: g.riskScore && g.riskScore >= 7 ? '#DC2626' : '#1B2430' }}>
                      {g.riskScore ?? '—'}
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        className="omni-btn-secondary"
                        style={{ fontSize: 11, padding: '4px 8px' }}
                        onClick={() => {
                          setSelectedGap(g);
                          setGapReviewOutcome(g.gapOutcome);
                          setGapReviewNotes(g.reviewNotes || '');
                          setGapModalOpen(true);
                        }}
                      >
                        Review
                      </button>
                      {isGap && (
                        <button
                          className="omni-btn-primary"
                          style={{ fontSize: 11, padding: '4px 8px', background: '#DC2626', borderColor: '#DC2626' }}
                          onClick={() => onInitiateRemediation(g)}
                        >
                          Remediate
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </SectionCard>

      {/* Review Gap Modal */}
      <Modal isOpen={gapModalOpen} onClose={() => setGapModalOpen(false)} title="Review Control Gap Finding" subtitle={selectedGap?.obligation?.title || selectedGap?.obligationId}>
        {selectedGap && (
          <div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#1B2430', display: 'block', marginBottom: 5 }}>Gap Status</label>
              <select
                value={gapReviewOutcome}
                onChange={e => setGapReviewOutcome(e.target.value)}
                style={{ width: '100%', padding: '8px 12px', border: '1px solid #D6DAD7', borderRadius: 7, fontSize: 12 }}
              >
                <option value="SATISFIED">SATISFIED (Fully Met)</option>
                <option value="PARTIALLY_SATISFIED">PARTIALLY SATISFIED</option>
                <option value="GAP_IDENTIFIED">GAP IDENTIFIED (Action Required)</option>
              </select>
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#1B2430', display: 'block', marginBottom: 5 }}>Auditor Review Notes</label>
              <textarea
                rows={3}
                placeholder="Compliance findings and deficiency rationale..."
                value={gapReviewNotes}
                onChange={e => setGapReviewNotes(e.target.value)}
                style={{ width: '100%', padding: '8px 12px', border: '1px solid #D6DAD7', borderRadius: 7, fontSize: 12 }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button className="omni-btn-secondary" onClick={() => setGapModalOpen(false)}>Cancel</button>
              <button className="omni-btn-primary" onClick={submitGapReview}>Save Finding</button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

// ─── REMEDIATION TAB (Enforces Independent Verification & Rejection) ────────────

function RemediationTab({ showToast, initialGap }: { showToast: Function; initialGap?: GapAssessment | null }) {
  const { user } = useAuth();
  const [items, setItems] = useState<RemediationTask[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('');

  // Create Task Modal
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDesc, setTaskDesc] = useState('');
  const [taskAssessmentId, setTaskAssessmentId] = useState('');
  const [taskPriority, setTaskPriority] = useState('HIGH');
  const [taskTargetDate, setTaskTargetDate] = useState('');
  const [taskLegalDeadline, setTaskLegalDeadline] = useState('');
  const [submittingCreate, setSubmittingCreate] = useState(false);

  // Task Detail & Lifecycle Action Modal
  const [selectedTask, setSelectedTask] = useState<RemediationTask | null>(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);

  // Complete Task Form
  const [compSummary, setCompSummary] = useState('');
  const [compNotes, setCompNotes] = useState('');
  const [compEvidenceUrl, setCompEvidenceUrl] = useState('');

  // Verification Form
  const [isVerifying, setIsVerifying] = useState(true);
  const [verifNotes, setVerifNotes] = useState('');
  const [verifRejectionReason, setVerifRejectionReason] = useState('');

  // Risk Acceptance Form
  const [riskJustification, setRiskJustification] = useState('');
  const [riskOwner, setRiskOwner] = useState('');

  const loadTasks = useCallback(async () => {
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

  useEffect(() => { loadTasks(); }, [loadTasks]);

  useEffect(() => {
    if (initialGap) {
      setTaskAssessmentId(initialGap.id);
      setTaskTitle(`Remediate Gap for Obligation ${initialGap.obligation?.title || initialGap.obligationId}`);
      setTaskPriority(initialGap.riskScore && initialGap.riskScore >= 7 ? 'CRITICAL' : 'HIGH');
      setCreateModalOpen(true);
    }
  }, [initialGap]);

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskTitle || !taskAssessmentId) {
      showToast({ type: 'error', message: 'Title and Gap Assessment ID are required.' });
      return;
    }
    setSubmittingCreate(true);
    try {
      await apiRequest('/regulatory/remediation', {
        method: 'POST',
        body: JSON.stringify({
          assessmentId: taskAssessmentId,
          title: taskTitle,
          description: taskDesc || undefined,
          priority: taskPriority,
          targetDate: taskTargetDate ? new Date(taskTargetDate).toISOString() : undefined,
          legalDeadline: taskLegalDeadline ? new Date(taskLegalDeadline).toISOString() : undefined,
        }),
      });
      showToast({ type: 'success', message: 'Remediation task created in PROPOSED status.' });
      setCreateModalOpen(false);
      setTaskTitle('');
      setTaskDesc('');
      setTaskAssessmentId('');
      loadTasks();
    } catch (err: any) {
      showToast({ type: 'error', message: err?.message || 'Failed to create remediation task.' });
    } finally {
      setSubmittingCreate(false);
    }
  };

  const handleApproveProposed = async (id: string) => {
    try {
      await apiRequest(`/regulatory/remediation/${id}/approval`, {
        method: 'POST',
        body: JSON.stringify({ decision: 'APPROVED', notes: 'Approved for execution' }),
      });
      showToast({ type: 'success', message: 'Task approved.' });
      setDetailModalOpen(false);
      loadTasks();
    } catch (err: any) {
      showToast({ type: 'error', message: err?.message || 'Approval failed.' });
    }
  };

  const handleStartWork = async (id: string) => {
    try {
      await apiRequest(`/regulatory/remediation/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'IN_PROGRESS', notes: 'Commenced remediation implementation' }),
      });
      showToast({ type: 'success', message: 'Task moved to IN_PROGRESS.' });
      setDetailModalOpen(false);
      loadTasks();
    } catch (err: any) {
      showToast({ type: 'error', message: err?.message || 'Status update failed.' });
    }
  };

  const handleCompleteTask = async (id: string) => {
    if (!compSummary) {
      showToast({ type: 'error', message: 'Please provide a resolution summary.' });
      return;
    }
    try {
      await apiRequest(`/regulatory/remediation/${id}/complete`, {
        method: 'POST',
        body: JSON.stringify({
          resolutionSummary: compSummary,
          completionNotes: compNotes || undefined,
          evidenceReferences: compEvidenceUrl ? [compEvidenceUrl] : [],
        }),
      });
      showToast({ type: 'success', message: 'Remediation completed. Ready for independent verification.' });
      setDetailModalOpen(false);
      setCompSummary('');
      setCompNotes('');
      setCompEvidenceUrl('');
      loadTasks();
    } catch (err: any) {
      showToast({ type: 'error', message: err?.message || 'Completion failed.' });
    }
  };

  const handleVerifyTask = async (id: string) => {
    try {
      await apiRequest(`/regulatory/remediation/${id}/verify`, {
        method: 'POST',
        body: JSON.stringify({
          verified: isVerifying,
          notes: verifNotes || 'Independent verification completed',
          rejectionReason: !isVerifying ? (verifRejectionReason || 'Evidence did not satisfy closure requirement') : undefined,
          triggerReassessment: true,
        }),
      });
      showToast({
        type: isVerifying ? 'success' : 'warning',
        message: isVerifying ? 'Task verified and closed.' : 'Verification failed: task returned to IN_PROGRESS with feedback.',
      });
      setDetailModalOpen(false);
      setVerifNotes('');
      setVerifRejectionReason('');
      loadTasks();
    } catch (err: any) {
      showToast({ type: 'error', message: err?.message || 'Verification failed.' });
    }
  };

  const handleRiskAccept = async (id: string) => {
    if (!riskJustification) {
      showToast({ type: 'error', message: 'Documented risk justification is required.' });
      return;
    }
    try {
      await apiRequest(`/regulatory/remediation/${id}/risk-accept`, {
        method: 'POST',
        body: JSON.stringify({
          justification: riskJustification,
          acceptedByRole: riskOwner || 'CISO',
          riskExpiryDate: new Date(Date.now() + 90 * 86400000).toISOString(),
        }),
      });
      showToast({ type: 'success', message: 'Risk documented and accepted.' });
      setDetailModalOpen(false);
      setRiskJustification('');
      loadTasks();
    } catch (err: any) {
      showToast({ type: 'error', message: err?.message || 'Risk acceptance failed.' });
    }
  };

  // Segregation of duties check: creator/assignee cannot verify their own task
  const isAssigneeOrCreator = Boolean(selectedTask && user && (selectedTask.assignedToId === user.id || selectedTask.assignedById === user.id));

  return (
    <div>
      <SectionCard
        title="Regulatory Remediation Tasks"
        subtitle={`${total} tasks — Enforces independent closure verification (task creator or assignee cannot verify their own work)`}
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
              <option value="COMPLETED">Completed (Awaiting Verification)</option>
              <option value="VERIFIED_CLOSED">Verified Closed</option>
              <option value="RISK_ACCEPTED">Risk Accepted</option>
            </select>
            <button className="omni-btn-primary" style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 5 }} onClick={() => setCreateModalOpen(true)}>
              <Plus size={13} /> Create Remediation Task
            </button>
          </div>
        }
      >
        {loading && <TableSkeleton rows={5} />}
        {error && <InlineErrorState message={error} onRetry={loadTasks} />}
        {!loading && !error && items.length === 0 && (
          <EmptyState
            icon={CheckCircle}
            title="No remediation tasks"
            description="Remediation tasks are proposed from identified control gaps. Click 'Create Remediation Task' to initiate corrective action."
          />
        )}
        {!loading && !error && items.length > 0 && (
          <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
            <div style={{ minWidth: 640 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '3fr 1fr 1fr 1fr auto', gap: 12, padding: '8px 12px', background: '#F8FAFA', borderRadius: '8px 8px 0 0', borderBottom: '1px solid #E5EAE8' }}>
                {['Task Title', 'Status', 'Priority', 'Legal Deadline', 'Actions'].map(h => (
                  <div key={h} style={{ fontSize: 11, fontWeight: 600, color: '#8493A5', textTransform: 'uppercase', letterSpacing: 0.5 }}>{h}</div>
                ))}
              </div>
              {items.map(t => {
                const sc = outcomeColor(t.status);
                const pc = priorityColor(t.priority);
                const isOverdue = t.legalDeadline && new Date(t.legalDeadline) < new Date() && t.status !== 'VERIFIED_CLOSED';
                return (
                  <div key={t.id} style={{ display: 'grid', gridTemplateColumns: '3fr 1fr 1fr 1fr auto', gap: 12, padding: '12px', borderBottom: '1px solid #F0F3F2', alignItems: 'center', background: isOverdue ? 'rgba(220,38,38,0.03)' : undefined }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#1B2430' }}>{t.title}</div>
                      {t.description && <div style={{ fontSize: 11, color: '#8493A5', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.description}</div>}
                    </div>
                    <div><StatusBadge label={t.status.replace(/_/g, ' ')} color={sc.color} bg={sc.bg} /></div>
                    <div><StatusBadge label={t.priority} color={pc.color} bg={pc.bg} /></div>
                    <div>
                      {t.legalDeadline ? (
                        <span style={{ fontSize: 12, color: isOverdue ? '#DC2626' : '#5B6672', fontWeight: isOverdue ? 700 : 400, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          {isOverdue && <AlertTriangle size={11} />} {new Date(t.legalDeadline).toLocaleDateString()}
                        </span>
                      ) : '—'}
                    </div>
                    <div>
                      <button
                        className="omni-btn-secondary"
                        style={{ fontSize: 11, padding: '4px 8px' }}
                        onClick={async () => {
                          try {
                            const full = await apiRequest<RemediationTask>(`/regulatory/remediation/${t.id}`);
                            setSelectedTask(full);
                          } catch {
                            setSelectedTask(t);
                          }
                          setDetailModalOpen(true);
                        }}
                      >
                        Lifecycle / Verify
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </SectionCard>

      {/* Create Remediation Modal */}
      <Modal isOpen={createModalOpen} onClose={() => setCreateModalOpen(false)} title="Create Remediation Task" subtitle="Assign corrective actions with target deadlines and statutory accountability">
        <form onSubmit={handleCreateTask} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#1B2430', display: 'block', marginBottom: 4 }}>Task Title *</label>
            <input
              type="text"
              required
              placeholder="e.g. Implement MFA on all RBI Core Banking Gateways"
              value={taskTitle}
              onChange={e => setTaskTitle(e.target.value)}
              style={{ width: '100%', padding: '8px 12px', border: '1px solid #D6DAD7', borderRadius: 7, fontSize: 13 }}
            />
          </div>

          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#1B2430', display: 'block', marginBottom: 4 }}>Gap Assessment ID *</label>
            <input
              type="text"
              required
              placeholder="UUID of associated gap finding"
              value={taskAssessmentId}
              onChange={e => setTaskAssessmentId(e.target.value)}
              style={{ width: '100%', padding: '8px 12px', border: '1px solid #D6DAD7', borderRadius: 7, fontSize: 12, fontFamily: 'monospace' }}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#1B2430', display: 'block', marginBottom: 4 }}>Priority</label>
              <select
                value={taskPriority}
                onChange={e => setTaskPriority(e.target.value)}
                style={{ width: '100%', padding: '7px 10px', border: '1px solid #D6DAD7', borderRadius: 6, fontSize: 12 }}
              >
                <option value="CRITICAL">Critical</option>
                <option value="HIGH">High</option>
                <option value="MEDIUM">Medium</option>
                <option value="LOW">Low</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#1B2430', display: 'block', marginBottom: 4 }}>Target Date</label>
              <input
                type="date"
                value={taskTargetDate}
                onChange={e => setTaskTargetDate(e.target.value)}
                style={{ width: '100%', padding: '6px 8px', border: '1px solid #D6DAD7', borderRadius: 6, fontSize: 12 }}
              />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#1B2430', display: 'block', marginBottom: 4 }}>Legal Deadline</label>
              <input
                type="date"
                value={taskLegalDeadline}
                onChange={e => setTaskLegalDeadline(e.target.value)}
                style={{ width: '100%', padding: '6px 8px', border: '1px solid #D6DAD7', borderRadius: 6, fontSize: 12 }}
              />
            </div>
          </div>

          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#1B2430', display: 'block', marginBottom: 4 }}>Remediation Strategy / Description</label>
            <textarea
              rows={3}
              placeholder="Describe technical implementation plan, control changes, and required evidence..."
              value={taskDesc}
              onChange={e => setTaskDesc(e.target.value)}
              style={{ width: '100%', padding: '8px 12px', border: '1px solid #D6DAD7', borderRadius: 7, fontSize: 12 }}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
            <button type="button" className="omni-btn-secondary" onClick={() => setCreateModalOpen(false)}>Cancel</button>
            <button type="submit" className="omni-btn-primary" disabled={submittingCreate}>
              {submittingCreate ? 'Creating...' : 'Create Task'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Task Lifecycle / Verification Modal */}
      <Modal
        isOpen={detailModalOpen}
        onClose={() => setDetailModalOpen(false)}
        title="Remediation Task Lifecycle & Verification"
        subtitle={selectedTask?.title}
        maxWidth={680}
      >
        {selectedTask && (
          <div>
            {/* Task Info Banner */}
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 14px', background: '#F8FAFA', borderRadius: 8, marginBottom: 16, border: '1px solid #E5EAE8' }}>
              <div>
                <div style={{ fontSize: 11, color: '#8493A5', textTransform: 'uppercase', fontWeight: 600 }}>Current Status</div>
                <div style={{ marginTop: 3 }}>
                  <StatusBadge
                    label={selectedTask.status.replace(/_/g, ' ')}
                    color={outcomeColor(selectedTask.status).color}
                    bg={outcomeColor(selectedTask.status).bg}
                  />
                </div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: '#8493A5', textTransform: 'uppercase', fontWeight: 600 }}>Priority</div>
                <div style={{ marginTop: 3 }}>
                  <StatusBadge
                    label={selectedTask.priority}
                    color={priorityColor(selectedTask.priority).color}
                    bg={priorityColor(selectedTask.priority).bg}
                  />
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 11, color: '#8493A5', textTransform: 'uppercase', fontWeight: 600 }}>Legal Deadline</div>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#1B2430', marginTop: 3 }}>
                  {selectedTask.legalDeadline ? new Date(selectedTask.legalDeadline).toLocaleDateString() : 'None Specified'}
                </div>
              </div>
            </div>

            {selectedTask.description && (
              <div style={{ marginBottom: 16, fontSize: 12.5, color: '#334155', lineHeight: 1.5, background: '#FAFAFA', padding: '10px 12px', borderRadius: 6 }}>
                <strong>Implementation Plan:</strong> {selectedTask.description}
              </div>
            )}

            {/* Evidence References */}
            {selectedTask.evidenceReferences?.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#1B2430', marginBottom: 4 }}>Submitted Evidence References</div>
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: '#0F6E6A' }}>
                  {selectedTask.evidenceReferences.map((ref, i) => (
                    <li key={i}>
                      <a href={ref} target="_blank" rel="noopener noreferrer" style={{ color: '#0F6E6A', wordBreak: 'break-all' }}>{ref}</a>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Stage 1: PROPOSED -> Approve or Start Work */}
            {selectedTask.status === 'PROPOSED' && (
              <div style={{ borderTop: '1px solid #E5EAE8', paddingTop: 14 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#1B2430', marginBottom: 8 }}>Governance Actions</div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button className="omni-btn-primary" onClick={() => handleApproveProposed(selectedTask.id)}>
                    Approve Task Proposal
                  </button>
                  <button className="omni-btn-secondary" onClick={() => handleStartWork(selectedTask.id)}>
                    Directly Move to IN_PROGRESS
                  </button>
                </div>
              </div>
            )}

            {/* Stage 2: IN_PROGRESS -> Complete with Evidence */}
            {selectedTask.status === 'IN_PROGRESS' && (
              <div style={{ borderTop: '1px solid #E5EAE8', paddingTop: 14 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#1B2430', marginBottom: 8 }}>Submit Remediation Completion</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <input
                    type="text"
                    required
                    placeholder="Resolution summary (e.g. Upgraded firewall rules and enabled MFA)... *"
                    value={compSummary}
                    onChange={e => setCompSummary(e.target.value)}
                    style={{ width: '100%', padding: '7px 10px', border: '1px solid #D6DAD7', borderRadius: 6, fontSize: 12 }}
                  />
                  <input
                    type="text"
                    placeholder="Evidence reference URL / document link (optional)..."
                    value={compEvidenceUrl}
                    onChange={e => setCompEvidenceUrl(e.target.value)}
                    style={{ width: '100%', padding: '7px 10px', border: '1px solid #D6DAD7', borderRadius: 6, fontSize: 12 }}
                  />
                  <textarea
                    rows={2}
                    placeholder="Completion notes and technical test results..."
                    value={compNotes}
                    onChange={e => setCompNotes(e.target.value)}
                    style={{ width: '100%', padding: '7px 10px', border: '1px solid #D6DAD7', borderRadius: 6, fontSize: 12 }}
                  />
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                    <button className="omni-btn-primary" onClick={() => handleCompleteTask(selectedTask.id)}>
                      Submit for Independent Verification
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Stage 3: COMPLETED -> Independent Verification */}
            {selectedTask.status === 'COMPLETED' && (
              <div style={{ borderTop: '1px solid #E5EAE8', paddingTop: 14 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#1B2430', marginBottom: 4 }}>Independent Closure Verification</div>
                <div style={{ fontSize: 11.5, color: '#5B6672', marginBottom: 12 }}>
                  Must be performed by an independent compliance officer or lead auditor. Segregation of duties prevents self-verification.
                </div>

                {isAssigneeOrCreator && (
                  <div style={{ background: '#FEE2E2', border: '1px solid #FCA5A5', borderRadius: 6, padding: '8px 12px', fontSize: 12, color: '#991B1B', marginBottom: 12 }}>
                    <strong>Segregation of Duties Alert:</strong> You are recorded as the creator or assignee of this task. Production security policy requires an independent authorized user to perform closure verification.
                  </div>
                )}

                <div style={{ display: 'flex', gap: 16, marginBottom: 10 }}>
                  <label style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                    <input type="radio" name="verifDec" checked={isVerifying} onChange={() => setIsVerifying(true)} />
                    Verify & Close (Requirement fully satisfied)
                  </label>
                  <label style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                    <input type="radio" name="verifDec" checked={!isVerifying} onChange={() => setIsVerifying(false)} />
                    Reject / Return to IN_PROGRESS (Deficiencies remain)
                  </label>
                </div>

                {!isVerifying ? (
                  <div style={{ marginBottom: 10 }}>
                    <label style={{ fontSize: 12, fontWeight: 600, color: '#DC2626', display: 'block', marginBottom: 4 }}>Rejection Feedback *</label>
                    <textarea
                      rows={2}
                      placeholder="Explain why evidence is insufficient so the assignee can correct it..."
                      value={verifRejectionReason}
                      onChange={e => setVerifRejectionReason(e.target.value)}
                      style={{ width: '100%', padding: '7px 10px', border: '1px solid #DC2626', borderRadius: 6, fontSize: 12 }}
                    />
                  </div>
                ) : (
                  <div style={{ marginBottom: 10 }}>
                    <label style={{ fontSize: 12, fontWeight: 600, color: '#1B2430', display: 'block', marginBottom: 4 }}>Verification Audit Notes</label>
                    <textarea
                      rows={2}
                      placeholder="Document verification method and sign-off rationale..."
                      value={verifNotes}
                      onChange={e => setVerifNotes(e.target.value)}
                      style={{ width: '100%', padding: '7px 10px', border: '1px solid #D6DAD7', borderRadius: 6, fontSize: 12 }}
                    />
                  </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                  <button
                    className="omni-btn-primary"
                    style={{ background: isVerifying ? '#059669' : '#DC2626', borderColor: isVerifying ? '#059669' : '#DC2626' }}
                    onClick={() => handleVerifyTask(selectedTask.id)}
                    disabled={isAssigneeOrCreator}
                  >
                    {isVerifying ? 'Confirm Closure' : 'Reject Back to In Progress'}
                  </button>
                </div>
              </div>
            )}

            {/* Risk Acceptance Option */}
            {selectedTask.status !== 'VERIFIED_CLOSED' && selectedTask.status !== 'RISK_ACCEPTED' && (
              <details style={{ marginTop: 18, borderTop: '1px solid #E5EAE8', paddingTop: 10, fontSize: 12, color: '#8493A5' }}>
                <summary style={{ cursor: 'pointer', fontWeight: 600, color: '#D97706' }}>Document Formal Risk Acceptance (Alternative to Remediation)</summary>
                <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <input
                    type="text"
                    placeholder="Risk Accepting Officer (e.g. CISO, Chief Risk Officer)..."
                    value={riskOwner}
                    onChange={e => setRiskOwner(e.target.value)}
                    style={{ width: '100%', padding: '7px 10px', border: '1px solid #D6DAD7', borderRadius: 6, fontSize: 12 }}
                  />
                  <textarea
                    rows={2}
                    placeholder="Document business justification, compensating controls, and risk rationale..."
                    value={riskJustification}
                    onChange={e => setRiskJustification(e.target.value)}
                    style={{ width: '100%', padding: '7px 10px', border: '1px solid #D6DAD7', borderRadius: 6, fontSize: 12 }}
                  />
                  <button className="omni-btn-secondary" style={{ color: '#D97706', alignSelf: 'flex-end' }} onClick={() => handleRiskAccept(selectedTask.id)}>
                    Accept Risk & Document Audit Trail
                  </button>
                </div>
              </details>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}

// ─── MAIN REGULATORY INTELLIGENCE VIEW ───────────────────────────────────────────

export function RegulatoryIntelligenceView() {
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState<TabKey>('overview');
  const [initialGapForRemediation, setInitialGapForRemediation] = useState<GapAssessment | null>(null);

  const handleInitiateRemediationFromGap = (gap: GapAssessment) => {
    setInitialGapForRemediation(gap);
    setActiveTab('remediation');
  };

  return (
    <div>
      {/* Top Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 44, height: 44, borderRadius: 11, background: 'linear-gradient(135deg, #0F6E6A 0%, #1E40AF 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: '0 4px 12px rgba(15,110,106,0.2)' }}>
            <Scale size={24} color="#fff" />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <h1 style={{ fontSize: 20, fontWeight: 700, color: '#1B2430', margin: 0 }}>Regulatory Intelligence</h1>
              <span style={{ fontSize: 11, fontWeight: 600, color: '#059669', background: 'rgba(5,150,105,0.1)', padding: '2px 8px', borderRadius: 12 }}>
                Stage 1 End-to-End
              </span>
            </div>
            <div style={{ fontSize: 12.5, color: '#8493A5', marginTop: 3 }}>
              Source ingestion · Publications & AI Impact · Obligations · Applicability · Control Mapping · Gaps · Independent Remediation
            </div>
          </div>
        </div>
      </div>

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 2, marginBottom: 22, borderBottom: '2px solid #E5EAE8', overflowX: 'auto', paddingBottom: 1 }}>
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
                padding: '9px 15px',
                background: 'none',
                border: 'none',
                borderBottom: isActive ? '2px solid #0F6E6A' : '2px solid transparent',
                color: isActive ? '#0F6E6A' : '#5B6672',
                fontWeight: isActive ? 700 : 500,
                fontSize: 13,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                marginBottom: -3,
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

      {/* Tab Body */}
      {activeTab === 'overview'      && <OverviewTab onNavigateTab={(tab) => setActiveTab(tab)} />}
      {activeTab === 'sources'       && <SourcesTab showToast={showToast} />}
      {activeTab === 'catalogue'     && <CatalogueTab />}
      {activeTab === 'publications'  && <PublicationsTab showToast={showToast} />}
      {activeTab === 'obligations'   && <ObligationsTab showToast={showToast} />}
      {activeTab === 'applicability' && <ApplicabilityTab showToast={showToast} />}
      {activeTab === 'mappings'      && <MappingsTab showToast={showToast} />}
      {activeTab === 'gaps'          && <GapsTab showToast={showToast} onInitiateRemediation={handleInitiateRemediationFromGap} />}
      {activeTab === 'remediation'   && <RemediationTab showToast={showToast} initialGap={initialGapForRemediation} />}
    </div>
  );
}
