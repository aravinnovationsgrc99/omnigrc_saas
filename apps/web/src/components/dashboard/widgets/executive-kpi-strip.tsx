'use client';

import React, { useState } from 'react';
import { OverviewMetricsDto } from '@omnigrc/shared';
import {
  FileCheck,
  ShieldAlert,
  AlertCircle,
  BookCheck,
  ChevronRight,
  ExternalLink,
  X,
  AlertTriangle,
  CheckCircle2,
  Clock,
  User,
  Box,
} from 'lucide-react';
import { AnimatedCountUp } from '@/components/ui/animated-count-up';

interface ExecutiveKpiStripProps {
  metrics: OverviewMetricsDto;
  onNavigateToView?: (view: string) => void;
}

export function ExecutiveKpiStrip({ metrics, onNavigateToView }: ExecutiveKpiStripProps) {
  const [activeModal, setActiveModal] = useState<'audits' | 'risks' | 'exceptions' | 'governance' | null>(null);

  // Card 1: Audit Readiness Data
  const auditScore = metrics.audits?.overallAuditScore || 0;
  const assessmentCount = metrics.audits?.assessmentCount || 0;
  const activeAssessments = metrics.audits?.activeAssessments || [];

  // Card 2: High-Severity Risks Data
  const highRisksCount = metrics.risks?.byScoreBand?.HIGH || 0;
  const totalOpenRisks = metrics.risks?.totalOpen || 0;
  const highRiskItems = metrics.risks?.highSeverityRisks || [];

  // Card 3: Overdue Exceptions Data
  const totalOverdue =
    (metrics.obligations?.overdueCount || 0) +
    (metrics.vulnerabilities?.overdueCount || 0) +
    (metrics.audits?.findingsOverdueCount || 0) +
    (metrics.policies?.overdueReviewCount || 0);

  const attentionItems = metrics.attentionRequired || [];

  // Card 4: Governance Coverage Data
  const publishedPolicies = metrics.policies?.publishedCount || 0;
  const totalPolicies = metrics.policies?.total || 0;
  const policyRate = totalPolicies > 0 ? Math.round((publishedPolicies / totalPolicies) * 100) : 0;
  const pendingExceptions = metrics.policies?.pendingExceptionsCount || 0;
  const policyStatusMap = metrics.policies?.byStatus || {};

  return (
    <>
      {/* 4 Equal-width & Equal-height Top KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
        {/* KPI Card 1: Audit Readiness */}
        <div
          tabIndex={0}
          role="button"
          onClick={() => setActiveModal('audits')}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setActiveModal('audits')}
          className="omni-card p-4 sm:p-5 flex flex-col justify-between cursor-pointer hover:border-teal-500 hover:shadow-md transition-all group focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2"
          aria-label="View Audit Readiness details"
        >
          <div>
            <div className="flex items-start justify-between gap-2 mb-3">
              <div className="flex items-center gap-2">
                <div
                  className={`p-2 rounded-lg ${
                    auditScore >= 80 ? 'text-teal-700 bg-teal-50 border border-teal-100' : 'text-amber-700 bg-amber-50 border border-amber-100'
                  }`}
                >
                  <FileCheck size={18} />
                </div>
                <span className="text-xs font-semibold text-slate-700">Audit Readiness</span>
              </div>
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                  auditScore >= 80 ? 'bg-teal-100 text-teal-800' : 'bg-amber-100 text-amber-800'
                }`}
              >
                {auditScore >= 80 ? 'Target Met' : 'Review Needed'}
              </span>
            </div>

            <div className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight omni-mono">
              <AnimatedCountUp value={auditScore} suffix="%" />
            </div>
            <div className="text-xs text-slate-500 font-medium mt-1">
              {assessmentCount} active assessments
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs font-semibold text-teal-700 group-hover:text-teal-800">
            <span>Inspect Audits</span>
            <ChevronRight size={14} className="group-hover:translate-x-0.5 transition-transform" />
          </div>
        </div>

        {/* KPI Card 2: High-Severity Risks */}
        <div
          tabIndex={0}
          role="button"
          onClick={() => setActiveModal('risks')}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setActiveModal('risks')}
          className="omni-card p-4 sm:p-5 flex flex-col justify-between cursor-pointer hover:border-rose-400 hover:shadow-md transition-all group focus:outline-none focus:ring-2 focus:ring-rose-500 focus:ring-offset-2"
          aria-label="View High-Severity Risks details"
        >
          <div>
            <div className="flex items-start justify-between gap-2 mb-3">
              <div className="flex items-center gap-2">
                <div
                  className={`p-2 rounded-lg ${
                    highRisksCount > 0 ? 'text-rose-700 bg-rose-50 border border-rose-100' : 'text-teal-700 bg-teal-50 border border-teal-100'
                  }`}
                >
                  <ShieldAlert size={18} />
                </div>
                <span className="text-xs font-semibold text-slate-700">High-Severity Risks</span>
              </div>
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                  highRisksCount > 0 ? 'bg-rose-100 text-rose-800' : 'bg-teal-100 text-teal-800'
                }`}
              >
                {highRisksCount > 0 ? 'SLA Alert' : 'Compliant'}
              </span>
            </div>

            <div className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight omni-mono">
              <AnimatedCountUp value={highRisksCount} />
            </div>
            <div className="text-xs text-slate-500 font-medium mt-1">
              {totalOpenRisks} total open risks
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs font-semibold text-rose-700 group-hover:text-rose-800">
            <span>Inspect High Risks</span>
            <ChevronRight size={14} className="group-hover:translate-x-0.5 transition-transform" />
          </div>
        </div>

        {/* KPI Card 3: Overdue Exceptions */}
        <div
          tabIndex={0}
          role="button"
          onClick={() => setActiveModal('exceptions')}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setActiveModal('exceptions')}
          className="omni-card p-4 sm:p-5 flex flex-col justify-between cursor-pointer hover:border-amber-400 hover:shadow-md transition-all group focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2"
          aria-label="View Overdue Exceptions details"
        >
          <div>
            <div className="flex items-start justify-between gap-2 mb-3">
              <div className="flex items-center gap-2">
                <div
                  className={`p-2 rounded-lg ${
                    totalOverdue > 0 ? 'text-rose-700 bg-rose-50 border border-rose-100' : 'text-teal-700 bg-teal-50 border border-teal-100'
                  }`}
                >
                  <AlertCircle size={18} />
                </div>
                <span className="text-xs font-semibold text-slate-700">Overdue GRC Items</span>
              </div>
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                  totalOverdue > 0 ? 'bg-rose-100 text-rose-800' : 'bg-teal-100 text-teal-800'
                }`}
              >
                {totalOverdue > 0 ? 'Action Required' : 'Zero Breaches'}
              </span>
            </div>

            <div className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight omni-mono">
              <AnimatedCountUp value={totalOverdue} />
            </div>
            <div className="text-xs text-slate-500 font-medium mt-1">
              Across tasks, vulnerabilities, audits & governance
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs font-semibold text-amber-700 group-hover:text-amber-800">
            <span>Inspect Overdue Items</span>
            <ChevronRight size={14} className="group-hover:translate-x-0.5 transition-transform" />
          </div>
        </div>

        {/* KPI Card 4: Governance Coverage */}
        <div
          tabIndex={0}
          role="button"
          onClick={() => setActiveModal('governance')}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setActiveModal('governance')}
          className="omni-card p-4 sm:p-5 flex flex-col justify-between cursor-pointer hover:border-teal-500 hover:shadow-md transition-all group focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2"
          aria-label="View Governance Coverage details"
        >
          <div>
            <div className="flex items-start justify-between gap-2 mb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-teal-50 border border-teal-100 rounded-lg text-teal-700">
                  <BookCheck size={18} />
                </div>
                <span className="text-xs font-semibold text-slate-700">Governance Coverage</span>
              </div>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                {metrics.vendors?.total || 0} Vendors
              </span>
            </div>

            <div className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight omni-mono">
              <AnimatedCountUp value={policyRate} suffix="%" />
            </div>
            <div className="text-xs text-slate-500 font-medium mt-1">
              {publishedPolicies}/{totalPolicies} policies published
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs font-semibold text-teal-700 group-hover:text-teal-800">
            <span>Inspect Policies</span>
            <ChevronRight size={14} className="group-hover:translate-x-0.5 transition-transform" />
          </div>
        </div>
      </div>

      {/* Drill-down Modals / Panels */}

      {/* Modal 1: Audit Readiness Detail */}
      {activeModal === 'audits' && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-50 flex items-center justify-center p-4 omni-fade-in">
          <div className="bg-white rounded-xl max-w-lg w-full border border-slate-200 shadow-xl overflow-hidden">
            <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-teal-50 text-teal-700 rounded-lg border border-teal-100">
                  <FileCheck size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Audit Readiness Drill-down</h3>
                  <p className="text-xs text-slate-500">Contributing active audit assessments</p>
                </div>
              </div>
              <button
                onClick={() => setActiveModal(null)}
                className="p-1 rounded-md text-slate-400 hover:text-slate-700 transition-colors"
                aria-label="Close modal"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-center">
                  <div className="text-xs text-slate-500 font-medium">Overall Audit Score</div>
                  <div className="text-2xl font-bold text-teal-700 mt-1 omni-mono">{auditScore}%</div>
                </div>
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-center">
                  <div className="text-xs text-slate-500 font-medium">Active Assessments</div>
                  <div className="text-2xl font-bold text-slate-900 mt-1 omni-mono">{assessmentCount}</div>
                </div>
              </div>

              <div>
                <h4 className="text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
                  Active Audit Assessments ({activeAssessments.length})
                </h4>
                {activeAssessments.length > 0 ? (
                  <div className="space-y-2 max-h-56 overflow-y-auto omni-scroll pr-1">
                    {activeAssessments.map((item) => (
                      <div
                        key={item.id}
                        className="p-3 bg-white border border-slate-200 rounded-lg flex items-center justify-between gap-3"
                      >
                        <div>
                          <p className="text-xs font-semibold text-slate-800">{item.planTitle}</p>
                          <span className="text-[10px] font-medium text-slate-500 uppercase">
                            Status: {item.status}
                          </span>
                        </div>
                        <span className="text-xs font-bold px-2 py-1 bg-teal-50 text-teal-800 rounded-md border border-teal-200 omni-mono">
                          {item.score}% Score
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-500 text-center">
                    No active audit assessments currently running.
                  </div>
                )}
              </div>
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
              <button
                onClick={() => setActiveModal(null)}
                className="px-4 py-2 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-100"
              >
                Close
              </button>
              <button
                onClick={() => {
                  setActiveModal(null);
                  onNavigateToView?.('audits');
                }}
                className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5"
              >
                <span>Manage Business Audits</span>
                <ExternalLink size={14} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal 2: High-Severity Risks Detail */}
      {activeModal === 'risks' && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-50 flex items-center justify-center p-4 omni-fade-in">
          <div className="bg-white rounded-xl max-w-lg w-full border border-slate-200 shadow-xl overflow-hidden">
            <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-rose-50 text-rose-700 rounded-lg border border-rose-100">
                  <ShieldAlert size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">High-Severity Risks Drill-down</h3>
                  <p className="text-xs text-slate-500">
                    Reconciled: Showing {highRiskItems.length} of {highRisksCount} High-Severity Risks
                  </p>
                </div>
              </div>
              <button
                onClick={() => setActiveModal(null)}
                className="p-1 rounded-md text-slate-400 hover:text-slate-700 transition-colors"
                aria-label="Close modal"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-5 space-y-3">
              {highRiskItems.length > 0 ? (
                <div className="space-y-2 max-h-64 overflow-y-auto omni-scroll pr-1">
                  {highRiskItems.map((r) => (
                    <div
                      key={r.id}
                      onClick={() => {
                        setActiveModal(null);
                        onNavigateToView?.('risk');
                      }}
                      className="p-3 bg-white border border-slate-200 rounded-lg hover:border-rose-400 cursor-pointer transition-all flex items-start justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-slate-900 truncate">{r.title}</p>
                        <div className="flex items-center gap-3 text-[11px] text-slate-500 mt-1">
                          <span className="flex items-center gap-1">
                            <User size={11} /> {r.owner}
                          </span>
                          {r.assetName && (
                            <span className="flex items-center gap-1 truncate">
                              <Box size={11} /> {r.assetName}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="px-2 py-0.5 bg-rose-100 text-rose-800 text-[10px] font-bold rounded-full omni-mono">
                          Score {r.score}
                        </span>
                        <div className="text-[10px] text-slate-400 uppercase font-medium mt-1">
                          {r.status}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-6 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-500 text-center">
                  Zero high-severity open risks currently registered. All risks within acceptable threshold.
                </div>
              )}
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
              <button
                onClick={() => setActiveModal(null)}
                className="px-4 py-2 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-100"
              >
                Close
              </button>
              <button
                onClick={() => {
                  setActiveModal(null);
                  onNavigateToView?.('risk');
                }}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5"
              >
                <span>Open Risk Register</span>
                <ExternalLink size={14} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal 3: Overdue Exceptions Detail */}
      {activeModal === 'exceptions' && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-50 flex items-center justify-center p-4 omni-fade-in">
          <div className="bg-white rounded-xl max-w-lg w-full border border-slate-200 shadow-xl overflow-hidden">
            <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-amber-50 text-amber-700 rounded-lg border border-amber-100">
                  <AlertCircle size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Overdue GRC Items Drill-down</h3>
                  <p className="text-xs text-slate-500">
                    Reconciled: Total {totalOverdue} overdue items across all GRC domains
                  </p>
                </div>
              </div>
              <button
                onClick={() => setActiveModal(null)}
                className="p-1 rounded-md text-slate-400 hover:text-slate-700 transition-colors"
                aria-label="Close modal"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-5 space-y-3">
              {attentionItems.length > 0 ? (
                <div className="space-y-2 max-h-64 overflow-y-auto omni-scroll pr-1">
                  {attentionItems.map((item) => (
                    <div
                      key={item.id}
                      onClick={() => {
                        setActiveModal(null);
                        onNavigateToView?.(item.targetView || 'remediation');
                      }}
                      className="p-3 bg-white border border-slate-200 rounded-lg hover:border-amber-400 cursor-pointer transition-all flex items-start justify-between gap-3"
                    >
                      <div>
                        <span className="text-[10px] font-bold px-1.5 py-0.5 bg-amber-50 text-amber-800 border border-amber-200 rounded-xs uppercase tracking-wider">
                          {item.domain}
                        </span>
                        <p className="text-xs font-semibold text-slate-900 mt-1">{item.title}</p>
                      </div>
                      <div className="text-right shrink-0">
                        {item.dueDate && (
                          <div className="text-[10px] font-medium text-rose-600 flex items-center gap-1 justify-end">
                            <Clock size={10} /> {new Date(item.dueDate).toLocaleDateString()}
                          </div>
                        )}
                        <span className="text-[10px] text-slate-400 uppercase font-medium mt-0.5 block">
                          {item.severityOrPriority}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-6 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-500 text-center">
                  Zero overdue exceptions or task breaches detected across any domain.
                </div>
              )}
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
              <button
                onClick={() => setActiveModal(null)}
                className="px-4 py-2 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-100"
              >
                Close
              </button>
              <button
                onClick={() => {
                  setActiveModal(null);
                  onNavigateToView?.('remediation');
                }}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5"
              >
                <span>Remediation Center</span>
                <ExternalLink size={14} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal 4: Governance Coverage Detail */}
      {activeModal === 'governance' && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-50 flex items-center justify-center p-4 omni-fade-in">
          <div className="bg-white rounded-xl max-w-lg w-full border border-slate-200 shadow-xl overflow-hidden">
            <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-teal-50 text-teal-700 rounded-lg border border-teal-100">
                  <BookCheck size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Governance & Policy Breakdown</h3>
                  <p className="text-xs text-slate-500">
                    Lifecycle breakdown behind {policyRate}% publication rate
                  </p>
                </div>
              </div>
              <button
                onClick={() => setActiveModal(null)}
                className="p-1 rounded-md text-slate-400 hover:text-slate-700 transition-colors"
                aria-label="Close modal"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3 text-center">
                <div className="p-3 bg-teal-50/60 border border-teal-100 rounded-lg">
                  <div className="text-xs text-teal-800 font-medium">Published Policies</div>
                  <div className="text-2xl font-bold text-teal-900 mt-1 omni-mono">
                    {publishedPolicies}/{totalPolicies}
                  </div>
                </div>
                <div className="p-3 bg-amber-50/60 border border-amber-100 rounded-lg">
                  <div className="text-xs text-amber-800 font-medium">Pending Exceptions</div>
                  <div className="text-2xl font-bold text-amber-900 mt-1 omni-mono">
                    {pendingExceptions}
                  </div>
                </div>
              </div>

              <div>
                <h4 className="text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
                  Policy Status Distribution
                </h4>
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(policyStatusMap).map(([st, count]) => (
                    <div
                      key={st}
                      className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between text-xs"
                    >
                      <span className="font-medium text-slate-700 capitalize">
                        {st.replace(/_/g, ' ').toLowerCase()}
                      </span>
                      <span className="font-bold text-slate-900 omni-mono">{count}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
              <button
                onClick={() => setActiveModal(null)}
                className="px-4 py-2 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-100"
              >
                Close
              </button>
              <button
                onClick={() => {
                  setActiveModal(null);
                  onNavigateToView?.('policies');
                }}
                className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5"
              >
                <span>Policy Management</span>
                <ExternalLink size={14} />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
