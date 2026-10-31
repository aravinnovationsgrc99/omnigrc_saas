'use client';

import React from 'react';
import {
  Building2,
  AlertTriangle,
  ClipboardCheck,
  FileWarning,
  ShieldAlert,
  Archive,
  Layers,
} from 'lucide-react';
import { VendorDto } from '@omnigrc/shared';

interface VendorMetricsHeaderProps {
  vendors: VendorDto[];
  activeStageFilter: string;
  onSelectStageFilter: (stage: string) => void;
}

export function VendorMetricsHeader({
  vendors,
  activeStageFilter,
  onSelectStageFilter,
}: VendorMetricsHeaderProps) {
  // Aggregate KPI stats
  const totalVendors = vendors.length;
  const criticalVendors = vendors.filter(
    (v) => v.inherentRiskTier === 'CRITICAL' || v.criticality === 'CRITICAL'
  ).length;

  const dueDiligenceActive = vendors.filter((v) => {
    const stage = v.dueDiligenceStatus || (v.tprmData as any)?.lifecycleStage;
    return (
      stage === 'DUE_DILIGENCE' ||
      stage === 'INHERENT_RISK_ASSESSED' ||
      stage === 'RISK_EVALUATION' ||
      v.status === 'UNDER_REVIEW'
    );
  }).length;

  const openFindingsCount = vendors.reduce((acc, v) => {
    const findings = (v.tprmData as any)?.remediationActions || [];
    const openInMeta = findings.filter(
      (a: any) => a.status === 'OPEN' || a.status === 'IN_PROGRESS'
    ).length;
    return acc + openInMeta;
  }, 0);

  const expiringOrExpiredDocs = vendors.reduce((acc, v) => {
    const docs = (v.tprmData as any)?.documents || [];
    const now = new Date().getTime();
    const expiring = docs.filter((d: any) => {
      if (!d.expirationDate) return false;
      const diffDays = (new Date(d.expirationDate).getTime() - now) / (1000 * 3600 * 24);
      return diffDays <= 30; // expired or expiring in <= 30 days
    }).length;
    return acc + expiring;
  }, 0);

  const decommissionedCount = vendors.filter((v) => {
    const stage = v.dueDiligenceStatus || (v.tprmData as any)?.lifecycleStage;
    return stage === 'DECOMMISSIONED' || stage === 'OFFBOARDING';
  }).length;

  const stageTabs = [
    { id: 'ALL', label: 'All Lifecycle Stages', count: totalVendors },
    {
      id: 'DRAFT',
      label: 'Drafts & Intake',
      count: vendors.filter((v) => (v.dueDiligenceStatus || (v.tprmData as any)?.lifecycleStage) === 'DRAFT').length,
    },
    {
      id: 'DUE_DILIGENCE',
      label: 'Due Diligence',
      count: vendors.filter((v) => {
        const s = v.dueDiligenceStatus || (v.tprmData as any)?.lifecycleStage;
        return s === 'DUE_DILIGENCE' || s === 'INHERENT_RISK_ASSESSED' || s === 'RISK_EVALUATION';
      }).length,
    },
    {
      id: 'ACTIVE_MONITORING',
      label: 'Active & Monitored',
      count: vendors.filter((v) => {
        const s = v.dueDiligenceStatus || (v.tprmData as any)?.lifecycleStage;
        return s === 'APPROVED' || s === 'ACTIVE_MONITORING';
      }).length,
    },
    {
      id: 'REASSESSMENT',
      label: 'Periodic Reassessment',
      count: vendors.filter((v) => (v.dueDiligenceStatus || (v.tprmData as any)?.lifecycleStage) === 'REASSESSMENT').length,
    },
    {
      id: 'OFFBOARDING',
      label: 'Offboarded / Decommissioned',
      count: decommissionedCount,
    },
  ];

  return (
    <div className="space-y-4 mb-6">
      {/* 6-Card KPI Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 mb-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wider">Total Portfolio</span>
            <Building2 className="w-4 h-4 text-teal-600" />
          </div>
          <div className="text-xl font-bold text-slate-900">{totalVendors}</div>
          <span className="text-[10px] text-slate-400 mt-0.5">Tracked third parties</span>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 mb-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wider">Critical Tier</span>
            <AlertTriangle className="w-4 h-4 text-rose-600" />
          </div>
          <div className="text-xl font-bold text-rose-700">{criticalVendors}</div>
          <span className="text-[10px] text-slate-400 mt-0.5">Highest exposure & impact</span>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 mb-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wider">Due Diligence</span>
            <ClipboardCheck className="w-4 h-4 text-blue-600" />
          </div>
          <div className="text-xl font-bold text-blue-700">{dueDiligenceActive}</div>
          <span className="text-[10px] text-slate-400 mt-0.5">Assessing questionnaire / risk</span>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 mb-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wider">Open Findings</span>
            <ShieldAlert className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-xl font-bold text-amber-700">{openFindingsCount}</div>
          <span className="text-[10px] text-slate-400 mt-0.5">Remediation actions pending</span>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 mb-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wider">Expiring Docs</span>
            <FileWarning className="w-4 h-4 text-orange-600" />
          </div>
          <div className="text-xl font-bold text-orange-700">{expiringOrExpiredDocs}</div>
          <span className="text-[10px] text-slate-400 mt-0.5">Within 30d or expired</span>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 mb-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wider">Decommissioned</span>
            <Archive className="w-4 h-4 text-slate-500" />
          </div>
          <div className="text-xl font-bold text-slate-700">{decommissionedCount}</div>
          <span className="text-[10px] text-slate-400 mt-0.5">Access revoked & archived</span>
        </div>
      </div>

      {/* Lifecycle Stage Filter Bar */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
        <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider shrink-0 mr-1 flex items-center gap-1">
          <Layers size={13} className="text-teal-700" /> Lifecycle:
        </span>
        {stageTabs.map((tab) => {
          const isActive = activeStageFilter === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onSelectStageFilter(tab.id)}
              className={`px-3 py-1.5 rounded-lg font-medium whitespace-nowrap transition-colors shrink-0 flex items-center gap-1.5 ${
                isActive
                  ? 'bg-teal-700 text-white shadow-xs font-semibold'
                  : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <span>{tab.label}</span>
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                  isActive ? 'bg-teal-900 text-white' : 'bg-slate-100 text-slate-600'
                }`}
              >
                {tab.count}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
