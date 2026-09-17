'use client';

import React from 'react';
import { OverviewMetricsDto } from '@omnigrc/shared';
import { FileCheck, ShieldAlert, AlertCircle, BookCheck } from 'lucide-react';

interface ExecutiveKpiStripProps {
  metrics: OverviewMetricsDto;
}

export function ExecutiveKpiStrip({ metrics }: ExecutiveKpiStripProps) {
  const auditScore = metrics.audits.overallAuditScore || 0;
  const highRisks = metrics.risks.byScoreBand.HIGH || 0;
  const totalOverdue =
    (metrics.obligations.overdueCount || 0) +
    (metrics.vulnerabilities.overdueCount || 0) +
    (metrics.audits.findingsOverdueCount || 0);

  const publishedPolicies = metrics.policies.publishedCount || 0;
  const totalPolicies = metrics.policies.total || 0;
  const policyRate = totalPolicies > 0 ? Math.round((publishedPolicies / totalPolicies) * 100) : 0;

  const kpis = [
    {
      title: 'Audit Readiness',
      value: `${auditScore}%`,
      subtitle: `${metrics.audits.assessmentCount} active assessments`,
      icon: FileCheck,
      color: auditScore >= 80 ? 'text-teal-700 bg-teal-50' : 'text-amber-700 bg-amber-50',
      badge: auditScore >= 80 ? 'Target Met' : 'Review Needed',
      badgeClass: auditScore >= 80 ? 'bg-teal-100 text-teal-800' : 'bg-amber-100 text-amber-800',
    },
    {
      title: 'High-Severity Risks',
      value: `${highRisks}`,
      subtitle: `${metrics.risks.totalOpen} total open risks`,
      icon: ShieldAlert,
      color: highRisks > 0 ? 'text-rose-700 bg-rose-50' : 'text-teal-700 bg-teal-50',
      badge: highRisks > 0 ? 'SLA Alert' : 'Compliant',
      badgeClass: highRisks > 0 ? 'bg-rose-100 text-rose-800' : 'bg-teal-100 text-teal-800',
    },
    {
      title: 'Overdue Exceptions',
      value: `${totalOverdue}`,
      subtitle: 'Across tasks, vulns & audits',
      icon: AlertCircle,
      color: totalOverdue > 0 ? 'text-rose-700 bg-rose-50' : 'text-teal-700 bg-teal-50',
      badge: totalOverdue > 0 ? 'Action Required' : 'Zero Breaches',
      badgeClass: totalOverdue > 0 ? 'bg-rose-100 text-rose-800' : 'bg-teal-100 text-teal-800',
    },
    {
      title: 'Governance Coverage',
      value: `${policyRate}%`,
      subtitle: `${publishedPolicies}/${totalPolicies} policies published`,
      icon: BookCheck,
      color: 'text-teal-700 bg-teal-50',
      badge: `${metrics.vendors.total} Active Vendors`,
      badgeClass: 'bg-slate-100 text-slate-700 border border-slate-200',
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {kpis.map((kpi, idx) => {
        const Icon = kpi.icon;
        return (
          <div key={idx} className="omni-card p-4 flex flex-col justify-between">
            <div className="flex items-start justify-between gap-2 mb-2">
              <div className="flex items-center gap-2">
                <div className={`p-2 rounded-lg ${kpi.color}`}>
                  <Icon size={18} />
                </div>
                <span className="text-xs font-semibold text-slate-600">{kpi.title}</span>
              </div>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${kpi.badgeClass}`}>
                {kpi.badge}
              </span>
            </div>
            <div>
              <div className="text-2xl font-extrabold text-slate-900 tracking-tight">{kpi.value}</div>
              <div className="text-[11px] text-slate-500 font-medium mt-0.5">{kpi.subtitle}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
