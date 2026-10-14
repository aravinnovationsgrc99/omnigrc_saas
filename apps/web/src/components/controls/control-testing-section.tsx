'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  PaginatedControlTestsDto,
  ControlTestExecutionDto,
  ControlTestingSummaryDto,
  CreateControlTestDto,
  AuditCheckResult,
  ControlEffectivenessStatus,
  Role,
  AuditPlanStatus,
} from '@omnigrc/shared';
import { apiRequest } from '@/lib/api-client';
import { useToast } from '@/context/toast-context';
import { useAuth } from '@/context/auth-context';
import {
  ClipboardCheck,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  RotateCw,
  Search,
  Plus,
  Lock,
  ChevronDown,
  ChevronUp,
  FileCheck,
  FileText,
  ShieldAlert,
  X,
  ExternalLink,
} from 'lucide-react';

interface ControlTestingSectionProps {
  controlId: string;
  controlName: string;
  controlDescription?: string | null;
}

export function getEffectivenessBadgeStyle(status: ControlEffectivenessStatus | string) {
  switch (status) {
    case 'EFFECTIVE':
      return {
        bg: '#E6F4EA',
        color: '#137333',
        border: '#CEEAD6',
        label: 'Effective (Compliant)',
      };
    case 'PARTIALLY_EFFECTIVE':
      return {
        bg: '#FEF7E0',
        color: '#B06000',
        border: '#FEEFC3',
        label: 'Partially Effective',
      };
    case 'INEFFECTIVE':
      return {
        bg: '#F8E6E8',
        color: '#801F2B',
        border: '#B23A48',
        label: 'Ineffective (Failed)',
      };
    case 'NOT_APPLICABLE':
      return {
        bg: '#F1F3F4',
        color: '#5F6368',
        border: '#DADCE0',
        label: 'Not Applicable',
      };
    case 'NOT_TESTED':
    default:
      return {
        bg: '#F1F3F4',
        color: '#5F6368',
        border: '#DADCE0',
        label: 'Not Tested',
      };
  }
}

export function getTestResultBadgeStyle(result: AuditCheckResult | string) {
  switch (result) {
    case AuditCheckResult.COMPLIANT:
      return {
        bg: '#E6F4EA',
        color: '#137333',
        border: '#CEEAD6',
        label: 'COMPLIANT',
      };
    case AuditCheckResult.PARTIALLY_COMPLIANT:
      return {
        bg: '#FEF7E0',
        color: '#B06000',
        border: '#FEEFC3',
        label: 'PARTIALLY COMPLIANT',
      };
    case AuditCheckResult.NON_COMPLIANT:
      return {
        bg: '#F8E6E8',
        color: '#801F2B',
        border: '#B23A48',
        label: 'NON-COMPLIANT',
      };
    case AuditCheckResult.NOT_APPLICABLE:
      return {
        bg: '#F1F3F4',
        color: '#5F6368',
        border: '#DADCE0',
        label: 'NOT APPLICABLE',
      };
    case AuditCheckResult.NOT_EVALUATED:
    default:
      return {
        bg: '#E8F0FE',
        color: '#1A73E8',
        border: '#D2E3FC',
        label: 'NOT EVALUATED',
      };
  }
}

export function ControlTestingSection({
  controlId,
  controlName,
  controlDescription,
}: ControlTestingSectionProps) {
  const { showToast } = useToast();
  const { user, organization, hasCapability } = useAuth();

  const canAccessBusinessAudits = hasCapability('BUSINESS_AUDITS');
  const canMutateControlTests = Boolean(
    canAccessBusinessAudits &&
      hasCapability('GRC_CORE_CONTROLS') &&
      !organization?.isReadOnly &&
      user?.role &&
      [Role.ADMIN, Role.ANALYST, Role.MSSP_ADMIN, Role.MSSP_ANALYST].includes(
        user.role as Role,
      ),
  );

  // Test History State
  const [tests, setTests] = useState<ControlTestExecutionDto[]>([]);
  const [summary, setSummary] = useState<ControlTestingSummaryDto | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Pagination & Filtering
  const [page, setPage] = useState(1);
  const [limit] = useState(10);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');
  const [resultFilter, setResultFilter] = useState<string>('ALL');
  const [expandedTestId, setExpandedTestId] = useState<string | null>(null);

  // Add Test Modal State
  const [showAddModal, setShowAddModal] = useState(false);
  const [availableAssessments, setAvailableAssessments] = useState<
    Array<{
      id: string;
      title: string;
      planTitle: string;
      status: string;
      frameworkCode?: string | null;
    }>
  >([]);
  const [loadingAssessments, setLoadingAssessments] = useState(false);
  const [selectedAssessmentId, setSelectedAssessmentId] = useState('');
  const [testTitle, setTestTitle] = useState('');
  const [testDescription, setTestDescription] = useState('');
  const [testResult, setTestResult] = useState<AuditCheckResult>(
    AuditCheckResult.NOT_EVALUATED,
  );
  const [testNotes, setTestNotes] = useState('');
  const [submittingTest, setSubmittingTest] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  // Fetch Tests
  const fetchTests = useCallback(async () => {
    if (!controlId || !canAccessBusinessAudits) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.append('page', page.toString());
      params.append('limit', limit.toString());
      if (searchQuery.trim()) {
        params.append('search', searchQuery.trim());
      }
      if (resultFilter !== 'ALL') {
        params.append('result', resultFilter);
      }

      const res = await apiRequest<PaginatedControlTestsDto>(
        `/controls/${controlId}/tests?${params.toString()}`,
      );

      setTests(res.items || []);
      setTotal(res.total || 0);
      setTotalPages(res.totalPages || 1);
      setSummary(res.summary || null);
    } catch (err: any) {
      setError(err?.message || 'Failed to load control test history');
    } finally {
      setLoading(false);
    }
  }, [controlId, canAccessBusinessAudits, page, limit, searchQuery, resultFilter]);

  useEffect(() => {
    if (controlId && canAccessBusinessAudits) {
      fetchTests();
    } else {
      setTests([]);
      setSummary(null);
    }
  }, [controlId, canAccessBusinessAudits, fetchTests]);

  // Fetch Active Assessments for Modal Picker
  const fetchEligibleAssessments = async () => {
    if (!canAccessBusinessAudits) return;
    setLoadingAssessments(true);
    setModalError(null);
    try {
      const plansRes = await apiRequest<any>('/business-audits/plans?limit=100');
      const plans = plansRes?.items || [];
      const eligible: Array<{
        id: string;
        title: string;
        planTitle: string;
        status: string;
        frameworkCode?: string | null;
      }> = [];

      for (const p of plans) {
        if (p.assessments && Array.isArray(p.assessments)) {
          for (const a of p.assessments) {
            // Assessment must not be COMPLETED or CANCELLED to accept new check items
            if (a.status !== 'COMPLETED' && a.status !== 'CANCELLED') {
              eligible.push({
                id: a.id,
                title: a.summary || a.title || `Assessment #${a.id.substring(0, 8)}`,
                planTitle: p.title,
                status: a.status,
                frameworkCode: p.frameworkCode,
              });
            }
          }
        }
      }

      setAvailableAssessments(eligible);
      if (eligible.length > 0 && !selectedAssessmentId) {
        setSelectedAssessmentId(eligible[0].id);
      }
    } catch (err: any) {
      console.warn('Failed to load eligible assessments:', err);
      setModalError('Could not retrieve active audit assessments.');
    } finally {
      setLoadingAssessments(false);
    }
  };

  const handleOpenAddModal = () => {
    setShowAddModal(true);
    setTestTitle(`${controlName} - Operational Check`);
    setTestDescription(controlDescription || '');
    setTestResult(AuditCheckResult.NOT_EVALUATED);
    setTestNotes('');
    setModalError(null);
    fetchEligibleAssessments();
  };

  const handleCreateTest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!controlId || !selectedAssessmentId || submittingTest) return;
    setSubmittingTest(true);
    setModalError(null);

    try {
      const payload: CreateControlTestDto = {
        assessmentId: selectedAssessmentId,
        title: testTitle.trim() || undefined,
        description: testDescription.trim() || undefined,
        result: testResult,
        notes: testNotes.trim() || undefined,
      };

      await apiRequest(`/controls/${controlId}/tests`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      showToast('Control check item registered to audit assessment');
      setShowAddModal(false);
      await fetchTests();
    } catch (err: any) {
      setModalError(err?.message || 'Failed to add control test check item');
    } finally {
      setSubmittingTest(false);
    }
  };

  // 1. UNLICENSED / CAPABILITY DISABLED STATE
  if (!canAccessBusinessAudits) {
    return (
      <div
        data-testid="control-testing-unlicensed"
        style={{
          background: '#FFFFFF',
          border: '1px solid #E2E6E4',
          borderRadius: 12,
          padding: '24px 28px',
          marginTop: 24,
          boxShadow: '0 2px 6px rgba(0,0,0,0.02)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <ClipboardCheck size={20} color="#8B95A1" />
          <div>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: '#1B2430', margin: 0 }}>
              Operational Control Testing & Audit Executions
            </h3>
            <p style={{ fontSize: 12, color: '#5B6672', margin: '2px 0 0' }}>
              Evaluation records verifying operational design and implementation effectiveness.
            </p>
          </div>
        </div>

        <div
          style={{
            background: '#F8F9FA',
            border: '1px dashed #D2D7D5',
            borderRadius: 10,
            padding: '32px 24px',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: '50%',
              background: '#F1F3F4',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#5F6368',
            }}
          >
            <Lock size={20} />
          </div>
          <div>
            <h4 style={{ fontSize: 14, fontWeight: 600, color: '#1B2430', margin: '0 0 4px' }}>
              Business Audits Capability Disabled
            </h4>
            <p style={{ fontSize: 13, color: '#5B6672', margin: 0, maxWidth: 540 }}>
              Control testing and audit assessment features require the <strong>Business Audits</strong> service capability, which is currently unentitled or disabled for this organization.
            </p>
          </div>
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              padding: '4px 10px',
              borderRadius: 4,
              background: '#F1F3F4',
              color: '#5F6368',
              border: '1px solid #DADCE0',
            }}
          >
            Module Status: NOT APPLICABLE / UNLICENSED
          </span>
        </div>
      </div>
    );
  }

  const effBadge = getEffectivenessBadgeStyle(summary?.overallEffectiveness || 'NOT_TESTED');

  return (
    <div
      data-testid="control-testing-section"
      style={{
        background: '#FFFFFF',
        border: '1px solid #E2E6E4',
        borderRadius: 12,
        padding: '24px 28px',
        marginTop: 24,
        boxShadow: '0 2px 6px rgba(0,0,0,0.02)',
      }}
    >
      {/* Section Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <ClipboardCheck size={20} color="#0F6E6A" />
          <div>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: '#1B2430', margin: 0 }}>
              Operational Control Testing & Audit Executions
            </h3>
            <p style={{ fontSize: 12, color: '#5B6672', margin: '2px 0 0' }}>
              Operational audit check-items, test results, and deficiency tracking evaluating control effectiveness.
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {canMutateControlTests && (
            <button
              onClick={handleOpenAddModal}
              data-testid="add-control-test-btn"
              className="omni-btn-primary"
              style={{ fontSize: 12, height: 32, padding: '0 12px', display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <Plus size={13} />
              Add Test to Assessment
            </button>
          )}
          <button
            onClick={fetchTests}
            className="omni-btn-ghost"
            style={{ fontSize: 12, height: 32, padding: '0 10px', display: 'flex', alignItems: 'center', gap: 6 }}
            title="Refresh test history"
          >
            <RotateCw size={13} />
          </button>
        </div>
      </div>

      {/* Summary KPI Strip */}
      {summary && (
        <div
          data-testid="control-testing-summary-strip"
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            padding: '12px 16px',
            background: '#F8F9FA',
            borderRadius: 8,
            marginBottom: 18,
            fontSize: 12,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <span style={{ color: '#5B6672' }}>
              Total Tests: <strong style={{ color: '#1B2430' }}>{summary.totalTests}</strong>
            </span>
            <span style={{ color: '#D2D7D5' }}>|</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              Effectiveness Posture:
              <span
                data-testid="effectiveness-posture-badge"
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  padding: '2px 8px',
                  borderRadius: 4,
                  background: effBadge.bg,
                  color: effBadge.color,
                  border: `1px solid ${effBadge.border}`,
                }}
              >
                {effBadge.label}
              </span>
            </span>
            <span style={{ color: '#D2D7D5' }}>|</span>
            <span style={{ color: '#5B6672' }}>
              Latest Tested:{' '}
              <strong style={{ color: '#1B2430' }}>
                {summary.latestTestedAt
                  ? new Date(summary.latestTestedAt).toLocaleDateString()
                  : 'Never'}
              </strong>
            </span>
          </div>

          {/* Counts pill breakdown */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            {summary.effectiveCount > 0 && (
              <span style={{ fontSize: 10, fontWeight: 600, padding: '1px 6px', borderRadius: 4, background: '#E6F4EA', color: '#137333' }}>
                {summary.effectiveCount} Effective
              </span>
            )}
            {summary.partiallyEffectiveCount > 0 && (
              <span style={{ fontSize: 10, fontWeight: 600, padding: '1px 6px', borderRadius: 4, background: '#FEF7E0', color: '#B06000' }}>
                {summary.partiallyEffectiveCount} Partial
              </span>
            )}
            {summary.ineffectiveCount > 0 && (
              <span style={{ fontSize: 10, fontWeight: 600, padding: '1px 6px', borderRadius: 4, background: '#F8E6E8', color: '#801F2B' }}>
                {summary.ineffectiveCount} Ineffective
              </span>
            )}
            {summary.notEvaluatedCount > 0 && (
              <span style={{ fontSize: 10, fontWeight: 600, padding: '1px 6px', borderRadius: 4, background: '#E8F0FE', color: '#1A73E8' }}>
                {summary.notEvaluatedCount} In Progress
              </span>
            )}
            {summary.notApplicableCount > 0 && (
              <span style={{ fontSize: 10, fontWeight: 600, padding: '1px 6px', borderRadius: 4, background: '#F1F3F4', color: '#5F6368' }}>
                {summary.notApplicableCount} N/A
              </span>
            )}
          </div>
        </div>
      )}

      {/* Search & Filter Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, maxWidth: 360 }}>
          <div style={{ position: 'relative', width: '100%' }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: 9, color: '#8B95A1' }} />
            <input
              type="text"
              placeholder="Search tests, assessments, plans..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setPage(1);
              }}
              className="omni-input"
              style={{ paddingLeft: 30, fontSize: 12, height: 32 }}
            />
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <label style={{ fontSize: 12, color: '#5B6672' }}>Result Filter:</label>
          <select
            value={resultFilter}
            onChange={(e) => {
              setResultFilter(e.target.value);
              setPage(1);
            }}
            className="omni-input"
            style={{ fontSize: 12, height: 32, padding: '0 8px' }}
          >
            <option value="ALL">All Outcomes</option>
            <option value={AuditCheckResult.COMPLIANT}>Compliant Only</option>
            <option value={AuditCheckResult.PARTIALLY_COMPLIANT}>Partially Compliant</option>
            <option value={AuditCheckResult.NON_COMPLIANT}>Non-Compliant (Failed)</option>
            <option value={AuditCheckResult.NOT_EVALUATED}>Not Evaluated (In Progress)</option>
            <option value={AuditCheckResult.NOT_APPLICABLE}>Not Applicable</option>
          </select>
        </div>
      </div>

      {/* Loading & Error States */}
      {loading ? (
        <div data-testid="control-testing-loading" style={{ padding: '32px', textAlign: 'center', color: '#8B95A1', fontSize: 13 }}>
          <RotateCw size={18} className="animate-spin" style={{ margin: '0 auto 8px', color: '#0F6E6A' }} />
          Loading control test executions and audit history...
        </div>
      ) : error ? (
        <div
          data-testid="control-testing-error"
          style={{
            padding: '14px 18px',
            background: '#F8E6E8',
            border: '1px solid #B23A48',
            borderRadius: 8,
            color: '#801F2B',
            fontSize: 13,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <span>{error}</span>
          <button
            onClick={fetchTests}
            className="omni-btn-ghost"
            style={{ fontSize: 12, color: '#801F2B', borderColor: '#B23A48' }}
          >
            Retry
          </button>
        </div>
      ) : tests.length === 0 ? (
        /* Empty State */
        <div
          data-testid="control-testing-empty"
          style={{
            background: '#FFFFFF',
            border: '1px dashed #D2D7D5',
            borderRadius: 10,
            padding: '36px 24px',
            textAlign: 'center',
            color: '#8B95A1',
            fontSize: 13,
            marginBottom: 12,
          }}
        >
          <ClipboardCheck size={28} style={{ margin: '0 auto 10px', color: '#A0ABA6' }} />
          <h4 style={{ fontSize: 14, fontWeight: 600, color: '#1B2430', margin: '0 0 4px' }}>
            No Operational Tests Registered
          </h4>
          <p style={{ fontSize: 12, color: '#5B6672', margin: '0 auto 16px', maxWidth: 480 }}>
            This control has not yet been included in an audit assessment execution. Register it to an active audit plan to begin verifying operational effectiveness.
          </p>
          {canMutateControlTests && (
            <button
              onClick={handleOpenAddModal}
              className="omni-btn-primary"
              style={{ fontSize: 12, height: 32, padding: '0 12px', display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              <Plus size={13} />
              Register Test Check-Item
            </button>
          )}
        </div>
      ) : (
        /* Populated Test Execution History List */
        <div data-testid="control-testing-list" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {tests.map((t) => {
            const resBadge = getTestResultBadgeStyle(t.result);
            const isExpanded = expandedTestId === t.id;
            const hasFindings = t.findingsCount > 0;

            return (
              <div
                key={t.id}
                data-testid={`test-item-${t.id}`}
                style={{
                  background: '#FFFFFF',
                  border: t.result === AuditCheckResult.NON_COMPLIANT ? '1px solid #F8B4B4' : '1px solid #E2E6E4',
                  borderRadius: 10,
                  padding: '16px 20px',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10,
                }}
              >
                {/* Header Row */}
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                      <span
                        data-testid="test-result-badge"
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          padding: '2px 8px',
                          borderRadius: 4,
                          background: resBadge.bg,
                          color: resBadge.color,
                          border: `1px solid ${resBadge.border}`,
                        }}
                      >
                        {resBadge.label}
                      </span>

                      <span style={{ fontSize: 12, fontWeight: 600, color: '#0F6E6A' }}>
                        Plan: {t.auditPlanTitle}
                      </span>
                      {t.frameworkCode && (
                        <span style={{ fontSize: 10, background: '#EDEFED', padding: '1px 6px', borderRadius: 4, color: '#5B6672', fontWeight: 600 }}>
                          {t.frameworkCode}
                        </span>
                      )}
                      <span style={{ fontSize: 11, color: '#8B95A1' }}>
                        • Assessment: {t.assessmentTitle || 'Execution'} ({t.assessmentStatus})
                      </span>
                    </div>

                    <h4 style={{ fontSize: 14, fontWeight: 600, color: '#1B2430', margin: '4px 0 2px' }}>
                      {t.title}
                    </h4>
                    {t.description && (
                      <p style={{ fontSize: 12, color: '#5B6672', margin: '2px 0 0', lineHeight: 1.4 }}>
                        {t.description}
                      </p>
                    )}
                  </div>

                  <button
                    onClick={() => setExpandedTestId(isExpanded ? null : t.id)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#5B6672',
                      cursor: 'pointer',
                      padding: 4,
                      display: 'flex',
                      alignItems: 'center',
                    }}
                    title={isExpanded ? 'Collapse test details' : 'Expand test details'}
                  >
                    {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </button>
                </div>

                {/* Metadata & Tag Badges Bar */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    fontSize: 11,
                    color: '#5B6672',
                    borderTop: '1px solid #F0F2F1',
                    paddingTop: 8,
                    flexWrap: 'wrap',
                    gap: 8,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span>
                      Tested/Updated: <strong>{new Date(t.updatedAt).toLocaleDateString()}</strong>
                    </span>
                    {t.createdByName && (
                      <span>
                        Auditor/Author: <strong>{t.createdByName}</strong>
                      </span>
                    )}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {hasFindings ? (
                      <span
                        data-testid="test-findings-badge"
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          padding: '2px 6px',
                          borderRadius: 4,
                          background: '#FEF7E0',
                          color: '#B06000',
                          border: '1px solid #FEEFC3',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4,
                        }}
                      >
                        <ShieldAlert size={11} /> {t.findingsCount} Deficiencies / Findings
                      </span>
                    ) : (
                      <span style={{ fontSize: 10, color: '#137333', display: 'flex', alignItems: 'center', gap: 3 }}>
                        <CheckCircle2 size={11} /> 0 Findings
                      </span>
                    )}

                    {t.evidenceCount > 0 && (
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 600,
                          padding: '2px 6px',
                          borderRadius: 4,
                          background: '#E8F0FE',
                          color: '#1A73E8',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4,
                        }}
                      >
                        <FileCheck size={11} /> {t.evidenceCount} Test Proofs
                      </span>
                    )}
                  </div>
                </div>

                {/* Expanded Details Drawer */}
                {isExpanded && (
                  <div
                    style={{
                      background: '#F8F9FA',
                      borderRadius: 8,
                      padding: '12px 16px',
                      marginTop: 4,
                      fontSize: 12,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 10,
                    }}
                  >
                    {t.notes && (
                      <div>
                        <strong style={{ color: '#1B2430', display: 'block', marginBottom: 2 }}>Auditor Notes:</strong>
                        <p style={{ margin: 0, color: '#5B6672', fontStyle: 'italic' }}>{t.notes}</p>
                      </div>
                    )}

                    {/* Linked Findings */}
                    {t.findings && t.findings.length > 0 && (
                      <div>
                        <strong style={{ color: '#1B2430', display: 'block', marginBottom: 6 }}>
                          Identified Findings & Deficiencies ({t.findings.length}):
                        </strong>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          {t.findings.map((f) => (
                            <div
                              key={f.id}
                              style={{
                                background: '#FFFFFF',
                                border: '1px solid #E2E6E4',
                                borderRadius: 6,
                                padding: '6px 10px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                              }}
                            >
                              <span style={{ fontWeight: 600, color: '#1B2430' }}>{f.title}</span>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <span
                                  style={{
                                    fontSize: 10,
                                    fontWeight: 700,
                                    padding: '1px 6px',
                                    borderRadius: 4,
                                    background: f.severity === 'CRITICAL' || f.severity === 'HIGH' ? '#F8E6E8' : '#FEF7E0',
                                    color: f.severity === 'CRITICAL' || f.severity === 'HIGH' ? '#801F2B' : '#B06000',
                                  }}
                                >
                                  {f.severity}
                                </span>
                                <span style={{ fontSize: 10, fontWeight: 600, color: '#5B6672' }}>
                                  {f.status}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Linked Proof Evidence */}
                    {t.evidence && t.evidence.length > 0 && (
                      <div>
                        <strong style={{ color: '#1B2430', display: 'block', marginBottom: 6 }}>
                          Attached Audit Test Proofs ({t.evidence.length}):
                        </strong>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          {t.evidence.map((ev) => (
                            <div
                              key={ev.id}
                              style={{
                                background: '#FFFFFF',
                                border: '1px solid #E2E6E4',
                                borderRadius: 6,
                                padding: '6px 10px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                              }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <FileText size={14} color="#0F6E6A" />
                                <span style={{ fontWeight: 600, color: '#1B2430' }}>{ev.title}</span>
                                <span style={{ fontSize: 11, color: '#8B95A1' }}>({ev.fileName})</span>
                              </div>
                              <span
                                style={{
                                  fontSize: 10,
                                  fontWeight: 600,
                                  padding: '1px 6px',
                                  borderRadius: 4,
                                  background: ev.scanStatus === 'CLEAN' ? '#E6F4EA' : '#F8E6E8',
                                  color: ev.scanStatus === 'CLEAN' ? '#137333' : '#801F2B',
                                }}
                              >
                                {ev.scanStatus}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginTop: 8,
                paddingTop: 12,
                borderTop: '1px solid #E2E6E4',
                fontSize: 12,
                color: '#5B6672',
              }}
            >
              <span>
                Showing page {page} of {totalPages} ({total} total tests)
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="omni-btn-ghost"
                  style={{ fontSize: 11, height: 28, padding: '0 8px' }}
                >
                  Previous
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="omni-btn-ghost"
                  style={{ fontSize: 11, height: 28, padding: '0 8px' }}
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL: ADD TEST CHECK-ITEM TO AUDIT ASSESSMENT          */}
      {/* ======================================================== */}
      {showAddModal && (
        <div
          data-testid="add-test-modal"
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: 20,
          }}
        >
          <div
            style={{
              background: '#FFFFFF',
              borderRadius: 12,
              width: '100%',
              maxWidth: 540,
              padding: 24,
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <ClipboardCheck size={18} color="#0F6E6A" />
                <h3 style={{ fontSize: 16, fontWeight: 700, color: '#1B2430', margin: 0 }}>
                  Add Control Test to Audit Assessment
                </h3>
              </div>
              <button
                onClick={() => setShowAddModal(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#5B6672' }}
              >
                <X size={18} />
              </button>
            </div>

            <p style={{ fontSize: 12, color: '#5B6672', margin: '0 0 16px' }}>
              Register this control as an authoritative check-item under an active audit assessment execution.
            </p>

            {modalError && (
              <div
                style={{
                  padding: '8px 12px',
                  background: '#F8E6E8',
                  border: '1px solid #B23A48',
                  borderRadius: 6,
                  color: '#801F2B',
                  fontSize: 12,
                  marginBottom: 14,
                }}
              >
                {modalError}
              </div>
            )}

            <form onSubmit={handleCreateTest} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#1B2430', marginBottom: 4 }}>
                  Target Audit Assessment *
                </label>
                {loadingAssessments ? (
                  <div style={{ fontSize: 12, color: '#8B95A1' }}>Loading active audit plans and assessments...</div>
                ) : availableAssessments.length === 0 ? (
                  <div style={{ fontSize: 12, color: '#801F2B', background: '#F8E6E8', padding: '8px 12px', borderRadius: 6 }}>
                    No active audit assessments found. Create an active assessment under an audit plan first.
                  </div>
                ) : (
                  <select
                    required
                    value={selectedAssessmentId}
                    onChange={(e) => setSelectedAssessmentId(e.target.value)}
                    className="omni-input w-full"
                  >
                    {availableAssessments.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.planTitle} — {a.title} ({a.status})
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#1B2430', marginBottom: 4 }}>
                  Check-Item Title
                </label>
                <input
                  type="text"
                  placeholder="Operational test check title..."
                  value={testTitle}
                  onChange={(e) => setTestTitle(e.target.value)}
                  className="omni-input w-full"
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#1B2430', marginBottom: 4 }}>
                  Initial Evaluation Result
                </label>
                <select
                  value={testResult}
                  onChange={(e) => setTestResult(e.target.value as AuditCheckResult)}
                  className="omni-input w-full"
                >
                  <option value={AuditCheckResult.NOT_EVALUATED}>NOT EVALUATED (In Progress)</option>
                  <option value={AuditCheckResult.COMPLIANT}>COMPLIANT (Effective)</option>
                  <option value={AuditCheckResult.PARTIALLY_COMPLIANT}>PARTIALLY COMPLIANT</option>
                  <option value={AuditCheckResult.NON_COMPLIANT}>NON COMPLIANT (Failed)</option>
                  <option value={AuditCheckResult.NOT_APPLICABLE}>NOT APPLICABLE (Exempt)</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#1B2430', marginBottom: 4 }}>
                  Evaluation Notes (Optional)
                </label>
                <textarea
                  rows={2}
                  placeholder="Testing methodology, sample size, or observations..."
                  value={testNotes}
                  onChange={(e) => setTestNotes(e.target.value)}
                  className="omni-input w-full"
                  style={{ resize: 'vertical' }}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="omni-btn-ghost"
                  style={{ fontSize: 13 }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!selectedAssessmentId || submittingTest}
                  className="omni-btn-primary"
                  style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}
                >
                  <ClipboardCheck size={14} />
                  {submittingTest ? 'Registering Test...' : 'Register Control Test'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
