'use client';

import React from 'react';
import { OverviewMetricsDto } from '@omnigrc/shared';
import { ShieldCheck, ShieldAlert, AlertTriangle, ArrowRight, CheckCircle2 } from 'lucide-react';

interface ExecutivePostureBannerProps {
  metrics: OverviewMetricsDto;
  onNavigateToView?: (view: string) => void;
}

export function ExecutivePostureBanner({ metrics, onNavigateToView }: ExecutivePostureBannerProps) {
  const auditScore = metrics.audits.overallAuditScore || 0;
  const highRisks = metrics.risks.byScoreBand.HIGH || 0;
  const overdueTotal =
    (metrics.obligations.overdueCount || 0) +
    (metrics.vulnerabilities.overdueCount || 0) +
    (metrics.audits.findingsOverdueCount || 0);

  // Fact-Based Posture Model derived from actual presence/absence of risk alerts & SLA breaches
  let posture: 'CRITICAL' | 'NEEDS ATTENTION' | 'HEALTHY' = 'HEALTHY';
  let postureColor = 'bg-emerald-50 text-emerald-900 border-emerald-200';
  let badgeColor = 'bg-emerald-700 text-white';
  let Icon = ShieldCheck;
  let explanation = '';

  if (highRisks > 0 && overdueTotal > 0) {
    posture = 'CRITICAL';
    postureColor = 'bg-rose-50 text-rose-900 border-rose-200';
    badgeColor = 'bg-rose-700 text-white';
    Icon = ShieldAlert;
    explanation = `Critical Risk Exposure: Active High-Severity risk alerts (${highRisks} item(s)) coincide with overdue SLA/compliance breaches (${overdueTotal} item(s)).`;
  } else if (highRisks > 0 || overdueTotal > 0) {
    posture = 'NEEDS ATTENTION';
    postureColor = 'bg-amber-50 text-amber-900 border-amber-200';
    badgeColor = 'bg-amber-600 text-white';
    Icon = AlertTriangle;
    explanation = `Attention Required: ${highRisks > 0 ? `${highRisks} High-Severity risk alert(s) active.` : ''}${
      highRisks > 0 && overdueTotal > 0 ? ' ' : ''
    }${overdueTotal > 0 ? `${overdueTotal} overdue SLA breach(es) pending response.` : ''}`;
  } else {
    posture = 'HEALTHY';
    postureColor = 'bg-emerald-50 text-emerald-900 border-emerald-200';
    badgeColor = 'bg-emerald-700 text-white';
    Icon = ShieldCheck;
    explanation = `Optimal Operational Posture: Zero High-Severity risk alerts and zero overdue compliance SLA breaches across all 7 GRC domains.`;
  }

  // Factual, deterministic readings (no LLM)
  const readings = [
    {
      title: 'Audit Readiness',
      status: auditScore >= 80 ? 'Optimal' : auditScore >= 60 ? 'Moderate' : 'Low',
      detail: `${auditScore}% composite score across ${metrics.audits.totalPlans} audit plans and ${metrics.audits.assessmentCount} active assessments.`,
    },
    {
      title: 'Risk SLA Exposure',
      status: highRisks === 0 ? 'Within SLA' : 'SLA Alert',
      detail: `${highRisks} High-Severity risk(s) and ${metrics.risks.totalOpen} total open risk item(s) in current register.`,
    },
    {
      title: 'SLA Exceptions',
      status: overdueTotal === 0 ? 'Clean' : `${overdueTotal} Overdue`,
      detail: `${metrics.vulnerabilities.overdueCount} overdue vulns, ${metrics.obligations.overdueCount} overdue tasks, ${metrics.audits.findingsOverdueCount} overdue findings.`,
    },
  ];

  return (
    <div className={`p-5 rounded-xl border shadow-2xs transition-all ${postureColor}`}>
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-black/5 pb-4 mb-4">
        <div className="flex items-start gap-3">
          <div className="p-2.5 rounded-xl bg-white/80 shadow-2xs backdrop-blur-xs shrink-0 mt-0.5">
            <Icon size={24} className="text-current" />
          </div>
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h2 className="text-base sm:text-lg font-bold">Executive Posture Summary</h2>
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider ${badgeColor}`}>
                {posture}
              </span>
            </div>
            <p className="text-xs sm:text-sm opacity-90 mt-1 max-w-3xl leading-relaxed">
              {explanation}
            </p>
          </div>
        </div>

        {overdueTotal > 0 && onNavigateToView && (
          <button
            onClick={() => onNavigateToView('vulnerabilities')}
            className="px-3.5 py-2 bg-white/90 hover:bg-white text-slate-900 border border-black/10 rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-2xs transition-colors shrink-0"
          >
            Review Exceptions <ArrowRight size={14} />
          </button>
        )}
      </div>

      {/* Deterministic Executive Readings Strip */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {readings.map((reading, idx) => (
          <div key={idx} className="bg-white/70 backdrop-blur-xs p-3.5 rounded-lg border border-black/5">
            <div className="flex items-center justify-between gap-2 mb-1">
              <span className="text-xs font-bold text-slate-900">{reading.title}</span>
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-white text-slate-700 border border-slate-200">
                {reading.status}
              </span>
            </div>
            <p className="text-xs text-slate-600 leading-snug">{reading.detail}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
