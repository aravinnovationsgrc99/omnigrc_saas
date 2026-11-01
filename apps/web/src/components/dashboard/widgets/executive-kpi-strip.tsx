'use client';

import React from 'react';
import { OverviewMetricsDto } from '@omnigrc/shared';
import {
  FileCheck,
  ShieldAlert,
  AlertCircle,
  BookCheck,
  ChevronRight,
} from 'lucide-react';
import { AnimatedCountUp } from '@/components/ui/animated-count-up';

interface ExecutiveKpiStripProps {
  metrics: OverviewMetricsDto;
  onNavigateToView?: (view: string, params?: Record<string, any>) => void;
}

export function ExecutiveKpiStrip({ metrics, onNavigateToView }: ExecutiveKpiStripProps) {
  const isAuditsAvailable = metrics.audits?.isAvailable !== false;
  const isRisksAvailable = metrics.risks?.isAvailable !== false;
  const isTasksAvailable = metrics.obligations?.isAvailable !== false;
  const isPoliciesAvailable = metrics.policies?.isAvailable !== false;

  // Card 1: Audit Readiness Data
  const auditScore = isAuditsAvailable ? (metrics.audits?.overallAuditScore || 0) : 0;
  const assessmentCount = isAuditsAvailable ? (metrics.audits?.assessmentCount || 0) : 0;

  // Card 2: High-Severity Risks Data
  const highRisksCount = isRisksAvailable ? (metrics.risks?.byScoreBand?.HIGH || 0) : 0;
  const totalOpenRisks = isRisksAvailable ? (metrics.risks?.totalOpen || 0) : 0;

  // Card 3: Overdue Exceptions Data
  const totalOverdue =
    (isTasksAvailable ? (metrics.obligations?.overdueCount || 0) : 0) +
    (metrics.vulnerabilities?.overdueCount || 0) +
    (isAuditsAvailable ? (metrics.audits?.findingsOverdueCount || 0) : 0) +
    (isPoliciesAvailable ? (metrics.policies?.overdueReviewCount || 0) : 0);

  // Card 4: Governance Coverage Data
  const publishedPolicies = isPoliciesAvailable ? (metrics.policies?.publishedCount || 0) : 0;
  const totalPolicies = isPoliciesAvailable ? (metrics.policies?.total || 0) : 0;
  const policyRate = (isPoliciesAvailable && totalPolicies > 0) ? Math.round((publishedPolicies / totalPolicies) * 100) : 0;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
      {/* KPI Card 1: Audit Readiness */}
      <div
        tabIndex={0}
        role="button"
        onClick={() => onNavigateToView?.('audits', { status: 'ACTIVE' })}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onNavigateToView?.('audits', { status: 'ACTIVE' })}
        className="omni-card p-4 sm:p-5 flex flex-col justify-between cursor-pointer hover:border-teal-500 hover:shadow-md transition-all group focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2"
        aria-label="Navigate to Audits view"
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
        onClick={() => onNavigateToView?.('risk', { band: 'HIGH' })}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onNavigateToView?.('risk', { band: 'HIGH' })}
        className="omni-card p-4 sm:p-5 flex flex-col justify-between cursor-pointer hover:border-rose-400 hover:shadow-md transition-all group focus:outline-none focus:ring-2 focus:ring-rose-500 focus:ring-offset-2"
        aria-label="Navigate to High-Severity Risks view"
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
        onClick={() => onNavigateToView?.('board', { filter: 'overdue' })}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onNavigateToView?.('board', { filter: 'overdue' })}
        className="omni-card p-4 sm:p-5 flex flex-col justify-between cursor-pointer hover:border-amber-400 hover:shadow-md transition-all group focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2"
        aria-label="Navigate to Overdue Tasks view"
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
            Across tasks, vulnerabilities & audits
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
        onClick={() => onNavigateToView?.('policies', { status: 'PUBLISHED' })}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onNavigateToView?.('policies', { status: 'PUBLISHED' })}
        className="omni-card p-4 sm:p-5 flex flex-col justify-between cursor-pointer hover:border-teal-500 hover:shadow-md transition-all group focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2"
        aria-label="Navigate to Published Policies view"
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
  );
}
