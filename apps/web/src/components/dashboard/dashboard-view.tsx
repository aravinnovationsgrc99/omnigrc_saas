'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/context/auth-context';
import { apiRequest } from '@/lib/api-client';
import {
  OverviewMetricsDto,
  UserDashboardPreferenceDto,
  WidgetLayoutItem,
  DEFAULT_WIDGET_LAYOUT,
} from '@omnigrc/shared';
import { reconcileLayout } from './widget-registry';
import { RiskOverviewWidget } from './widgets/risk-overview-widget';
import { ComplianceObligationsWidget } from './widgets/compliance-obligations-widget';
import { AuditReadinessWidget } from './widgets/audit-readiness-widget';
import { VulnerabilityPostureWidget } from './widgets/vulnerability-posture-widget';
import { PolicyGovernanceWidget } from './widgets/policy-governance-widget';
import { VendorRiskWidget } from './widgets/vendor-risk-widget';
import { AssetInventoryWidget } from './widgets/asset-inventory-widget';
import { LayoutCustomizerModal } from './layout-customizer-modal';
import { SlidersHorizontal, RefreshCw, AlertCircle, Sparkles } from 'lucide-react';

export function DashboardView() {
  const { user } = useAuth();
  const firstName = user?.name?.split(' ')[0] || 'User';

  const [metrics, setMetrics] = useState<OverviewMetricsDto | null>(null);
  const [layout, setLayout] = useState<WidgetLayoutItem[]>(DEFAULT_WIDGET_LAYOUT);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isCustomizerOpen, setIsCustomizerOpen] = useState(false);

  const fetchDashboardData = async (isManualRefresh = false) => {
    try {
      if (isManualRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);

      const [metricsData, prefData] = await Promise.all([
        apiRequest<OverviewMetricsDto>('/metrics/overview'),
        apiRequest<UserDashboardPreferenceDto>('/dashboard/preferences').catch(() => null),
      ]);

      setMetrics(metricsData);

      const rawLayout = prefData?.configJson?.layout || DEFAULT_WIDGET_LAYOUT;
      const reconciled = reconcileLayout(rawLayout);
      setLayout(reconciled);
    } catch (err: any) {
      setError(err?.message || 'Failed to load executive metrics');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const handleSaveLayout = async (newLayout: WidgetLayoutItem[]) => {
    await apiRequest<UserDashboardPreferenceDto>('/dashboard/preferences', {
      method: 'PUT',
      body: JSON.stringify({ layout: newLayout }),
    });
    setLayout(newLayout);
  };

  const visibleWidgets = layout
    .filter((item) => item.visible)
    .sort((a, b) => a.position - b.position);

  const renderWidget = (id: string) => {
    if (!metrics) return null;
    switch (id) {
      case 'risk_overview':
        return <RiskOverviewWidget key={id} metrics={metrics.risks} />;
      case 'compliance_obligations':
        return <ComplianceObligationsWidget key={id} metrics={metrics.obligations} />;
      case 'audit_readiness':
        return <AuditReadinessWidget key={id} metrics={metrics.audits} />;
      case 'vulnerability_posture':
        return <VulnerabilityPostureWidget key={id} metrics={metrics.vulnerabilities} />;
      case 'policy_governance':
        return <PolicyGovernanceWidget key={id} metrics={metrics.policies} />;
      case 'vendor_risk':
        return <VendorRiskWidget key={id} metrics={metrics.vendors} />;
      case 'asset_inventory':
        return <AssetInventoryWidget key={id} metrics={metrics.assets} />;
      default:
        return null;
    }
  };

  if (loading) {
    return (
      <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 py-12 text-center omni-fade-in">
        <div className="inline-flex items-center gap-2 px-4 py-2 bg-slate-100 rounded-full text-xs font-semibold text-slate-600 animate-pulse">
          <RefreshCw size={14} className="animate-spin text-teal-700" /> Loading Executive Metrics...
        </div>
      </div>
    );
  }

  return (
    <div className="omni-fade-in w-full max-w-7xl mx-auto px-4 sm:px-6 py-4 sm:py-8 overflow-x-hidden space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Executive Dashboard</h1>
            <span className="px-2.5 py-0.5 bg-teal-50 text-teal-700 border border-teal-100 text-[11px] font-semibold rounded-full uppercase tracking-wider">
              Authoritative
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Welcome back, {firstName}. Real-time posture synthesized across all GRC domains.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => fetchDashboardData(true)}
            disabled={refreshing}
            className="px-3.5 py-2 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors flex items-center gap-1.5 shadow-2xs"
            title="Refresh metrics"
          >
            <RefreshCw size={14} className={refreshing ? 'animate-spin text-teal-700' : 'text-slate-500'} />
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </button>

          <button
            onClick={() => setIsCustomizerOpen(true)}
            className="px-3.5 py-2 bg-teal-700 hover:bg-teal-800 text-white rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 shadow-2xs"
          >
            <SlidersHorizontal size={14} /> Customize Widgets
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-xs font-medium text-rose-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle size={16} className="text-rose-600" />
            <span>{error}</span>
          </div>
          <button
            onClick={() => fetchDashboardData()}
            className="underline font-semibold hover:text-rose-900"
          >
            Retry
          </button>
        </div>
      )}

      {/* Widget Grid */}
      {metrics && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 items-start">
          {visibleWidgets.map((w) => (
            <div key={w.id} className="w-full">
              {renderWidget(w.id)}
            </div>
          ))}
        </div>
      )}

      {/* Empty State when all widgets are hidden */}
      {visibleWidgets.length === 0 && (
        <div className="bg-slate-50 border border-dashed border-slate-300 rounded-xl p-8 text-center max-w-md mx-auto my-12">
          <Sparkles size={24} className="text-slate-400 mx-auto mb-2" />
          <h3 className="text-sm font-semibold text-slate-800">All Widgets Hidden</h3>
          <p className="text-xs text-slate-500 mt-1 mb-4">
            You have hidden all dashboard widgets. Open customizer to re-enable them.
          </p>
          <button
            onClick={() => setIsCustomizerOpen(true)}
            className="px-4 py-2 bg-teal-700 text-white text-xs font-semibold rounded-lg hover:bg-teal-800 transition-colors"
          >
            Customize Widgets
          </button>
        </div>
      )}

      {/* Customizer Modal */}
      <LayoutCustomizerModal
        isOpen={isCustomizerOpen}
        onClose={() => setIsCustomizerOpen(false)}
        currentLayout={layout}
        onSave={handleSaveLayout}
      />
    </div>
  );
}
