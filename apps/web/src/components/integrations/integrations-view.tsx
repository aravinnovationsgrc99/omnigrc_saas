'use client';

import React, { useState, useEffect } from 'react';
import { IntegrationConnectorDto } from '@omnigrc/shared';
import { Layers, CheckCircle2, Cpu, Mail, MessageSquare, RefreshCw, Lock } from 'lucide-react';

export function IntegrationsView() {
  const [connectors, setConnectors] = useState<IntegrationConnectorDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchConnectors = async () => {
    setLoading(true);
    setError(null);
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
      const res = await fetch('/api/integrations/connectors', {
        headers: {
          Authorization: token ? `Bearer ${token}` : '',
        },
      });

      if (!res.ok) throw new Error('Failed to fetch integration status.');
      const data: IntegrationConnectorDto[] = await res.json();
      setConnectors(data);
    } catch (err: any) {
      setError(err.message || 'Error loading integrations.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchConnectors();
  }, []);

  const getStatusBadge = (c: IntegrationConnectorDto) => {
    if (c.details?.capability === 'Future Architecture Item') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-full bg-slate-100 text-slate-700 border border-slate-200">
          Future Roadmap
        </span>
      );
    }
    switch (c.status) {
      case 'CONFIGURED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-full bg-emerald-100 text-emerald-900 border border-emerald-200">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" /> Configured & Active
          </span>
        );
      case 'AVAILABLE':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-900 border border-blue-200">
            Available Infrastructure
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-full bg-slate-100 text-slate-700 border border-slate-200">
            Not Configured
          </span>
        );
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'EMAIL':
        return <Mail className="w-5 h-5 text-purple-700" />;
      case 'COLLABORATION':
        return <MessageSquare className="w-5 h-5 text-teal-700" />;
      case 'AI_LLM':
        return <Cpu className="w-5 h-5 text-amber-700" />;
      default:
        return <Layers className="w-5 h-5 text-slate-600" />;
    }
  };

  return (
    <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 py-6 omni-fade-in space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <Layers size={22} className="text-teal-700" />
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Integrations Hub</h1>
          </div>
          <p className="text-xs sm:text-sm text-slate-600 mt-1">
            Connect OMNiGRC with external communications, ticketing systems, and AI intelligence providers.
          </p>
        </div>
        <button
          onClick={fetchConnectors}
          className="inline-flex items-center gap-2 px-3.5 py-2 text-sm font-semibold rounded-lg bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 transition shadow-sm"
        >
          <RefreshCw className="w-4 h-4 text-slate-500" /> Refresh Status
        </button>
      </div>

      {/* Secret Security Banner */}
      <div className="p-4 rounded-xl bg-slate-100 border border-slate-200 text-xs text-slate-800 flex items-center justify-between gap-4 shadow-sm">
        <div className="flex items-center gap-2">
          <Lock className="w-4 h-4 text-emerald-700 flex-shrink-0" />
          <span className="font-medium text-slate-700">Integration API keys and secrets are securely vault-stored on backend environment runtime and never exposed to client applications.</span>
        </div>
      </div>

      {loading ? (
        <div className="py-16 text-center text-slate-500 font-medium">Checking integration statuses...</div>
      ) : error ? (
        <div className="p-4 rounded-lg bg-red-50 border border-red-200 text-red-900 text-sm font-medium">{error}</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {connectors.map((c) => (
            <div
              key={c.id}
              className="p-5 rounded-2xl bg-white border border-slate-200 hover:border-slate-300 shadow-sm transition space-y-4 flex flex-col justify-between"
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                    {getCategoryIcon(c.category)}
                  </div>
                  {getStatusBadge(c)}
                </div>

                <div>
                  <h3 className="text-base font-bold text-slate-900">{c.name}</h3>
                  <p className="text-xs text-slate-600 mt-1 line-clamp-2 leading-relaxed font-medium">{c.description}</p>
                </div>
              </div>

              {c.details && (
                <div className="pt-3 border-t border-slate-100 text-xs text-slate-600 font-mono space-y-1">
                  {Object.entries(c.details).map(([key, value]) => (
                    <div key={key} className="flex justify-between">
                      <span className="text-slate-500 font-medium">{key}:</span>
                      <span className="text-slate-800 font-semibold">{String(value)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
