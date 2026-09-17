'use client';

import React, { useState, useEffect } from 'react';
import { MsspClientSummaryDto } from '@omnigrc/shared';
import { Users, ShieldAlert, CheckCircle2, ArrowRightLeft, Building2, RefreshCw } from 'lucide-react';

export function MsspPartnerPortalView() {
  const [clients, setClients] = useState<MsspClientSummaryDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [switchingId, setSwitchingId] = useState<string | null>(null);

  const fetchClients = async () => {
    setLoading(true);
    setError(null);
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
      const res = await fetch('/api/mssp-admin/clients', {
        headers: {
          Authorization: token ? `Bearer ${token}` : '',
        },
      });

      if (!res.ok) throw new Error('Failed to fetch managed client tenants.');
      const data: MsspClientSummaryDto[] = await res.json();
      setClients(data);
    } catch (err: any) {
      setError(err.message || 'Error loading MSSP partner portal.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchClients();
  }, []);

  const handleContextSwitch = async (targetOrganizationId: string) => {
    setSwitchingId(targetOrganizationId);
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
      const res = await fetch('/api/auth/switch-context', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: token ? `Bearer ${token}` : '',
        },
        body: JSON.stringify({ targetOrganizationId }),
      });

      if (!res.ok) throw new Error('Failed to switch tenant context.');
      const result = await res.json();

      if (result.accessToken && typeof window !== 'undefined') {
        localStorage.setItem('token', result.accessToken);
        window.location.reload();
      }
    } catch (err: any) {
      alert(err.message || 'Error switching tenant context');
    } finally {
      setSwitchingId(null);
    }
  };

  return (
    <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 py-6 omni-fade-in space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <Building2 className="w-6 h-6 text-teal-700" />
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900">MSSP Partner Administration Surface</h1>
          </div>
          <p className="text-xs sm:text-sm text-slate-600 mt-1">
            Manage client organizations, monitor multi-tenant compliance posture, and launch authorized context switches.
          </p>
        </div>
        <button
          onClick={fetchClients}
          className="inline-flex items-center gap-2 px-3.5 py-2 text-sm font-semibold rounded-lg bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 transition shadow-sm"
        >
          <RefreshCw className="w-4 h-4 text-slate-500" /> Refresh Portfolio
        </button>
      </div>

      {loading ? (
        <div className="py-16 text-center text-slate-500 font-medium">Loading managed client tenants...</div>
      ) : error ? (
        <div className="p-4 rounded-lg bg-red-50 border border-red-200 text-red-900 text-sm font-medium">{error}</div>
      ) : clients.length === 0 ? (
        <div className="p-12 text-center rounded-xl bg-white border border-slate-200 shadow-sm text-slate-500 font-medium">
          <Building2 className="w-10 h-10 mx-auto mb-3 text-slate-400" />
          <h3 className="text-base font-bold text-slate-800">No Managed Clients Found</h3>
          <p className="text-sm text-slate-600 mt-1">No client organizations are associated under this MSSP Provider parent account.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {clients.map((c) => (
            <div
              key={c.id}
              className="p-6 rounded-2xl bg-white border border-slate-200 hover:border-slate-300 shadow-sm transition space-y-5 flex flex-col justify-between"
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold px-2.5 py-0.5 rounded bg-teal-100 text-teal-900 border border-teal-200">
                    {c.type}
                  </span>
                  <span className="text-xs font-semibold text-slate-600">{c.primaryRegion}</span>
                </div>

                <div>
                  <h3 className="text-lg font-bold text-slate-900">{c.name}</h3>
                  <div className="text-xs text-slate-600 font-medium mt-1">
                    Primary Framework: <span className="text-slate-900 font-bold">{c.primaryFramework || 'ISO 27001'}</span>
                  </div>
                </div>

                {/* Metrics Summary */}
                <div className="grid grid-cols-2 gap-3 pt-2">
                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                    <div className="text-xs font-semibold text-slate-600 flex items-center gap-1">
                      <Users className="w-3.5 h-3.5 text-slate-500" /> Users
                    </div>
                    <div className="text-lg font-bold text-slate-900 mt-1">{c.userCount}</div>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                    <div className="text-xs font-semibold text-slate-600 flex items-center gap-1">
                      <ShieldAlert className="w-3.5 h-3.5 text-rose-700" /> Open Risks
                    </div>
                    <div className="text-lg font-bold text-rose-800 mt-1">{c.openRiskCount}</div>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                    <div className="text-xs font-semibold text-slate-600 flex items-center gap-1">
                      <ShieldAlert className="w-3.5 h-3.5 text-amber-700" /> Incidents
                    </div>
                    <div className="text-lg font-bold text-amber-800 mt-1">{c.openIncidentCount}</div>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                    <div className="text-xs font-semibold text-slate-600 flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" /> Compliance
                    </div>
                    <div className="text-lg font-bold text-emerald-800 mt-1">{c.complianceCompletionRate}%</div>
                  </div>
                </div>
              </div>

              {/* Context Switch Action */}
              <button
                disabled={switchingId === c.id}
                onClick={() => handleContextSwitch(c.id)}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-bold rounded-xl bg-slate-900 hover:bg-slate-800 text-white border border-slate-800 disabled:opacity-50 transition shadow-sm"
              >
                <ArrowRightLeft className="w-4 h-4" />
                {switchingId === c.id ? 'Switching Context...' : 'Switch Context to Client'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
