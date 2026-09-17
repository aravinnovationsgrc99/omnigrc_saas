'use client';

import React, { useState, useEffect } from 'react';
import { IntegrationConnectorDto } from '@omnigrc/shared';
import { Layers, CheckCircle2, AlertCircle, Cpu, Mail, MessageSquare, RefreshCw, Lock } from 'lucide-react';

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
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-full bg-slate-800 text-slate-400 border border-slate-700">
          Future Roadmap
        </span>
      );
    }
    switch (c.status) {
      case 'CONFIGURED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <CheckCircle2 className="w-3.5 h-3.5" /> Configured & Active
          </span>
        );
      case 'AVAILABLE':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">
            Available Infrastructure
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-full bg-slate-500/10 text-slate-400 border border-slate-500/20">
            Not Configured
          </span>
        );
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'EMAIL':
        return <Mail className="w-5 h-5 text-purple-400" />;
      case 'COLLABORATION':
        return <MessageSquare className="w-5 h-5 text-cyan-400" />;
      case 'AI_LLM':
        return <Cpu className="w-5 h-5 text-amber-400" />;
      default:
        return <Layers className="w-5 h-5 text-slate-400" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Integrations Hub</h1>
          <p className="text-sm text-slate-400 mt-1">
            Connect OMNiGRC with external communications, ticketing systems, and AI intelligence providers.
          </p>
        </div>
        <button
          onClick={fetchConnectors}
          className="inline-flex items-center gap-2 px-3.5 py-2 text-sm font-medium rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
        >
          <RefreshCw className="w-4 h-4" /> Refresh Status
        </button>
      </div>

      {/* Secret Security Banner */}
      <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 text-xs text-slate-400 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Lock className="w-4 h-4 text-emerald-400 flex-shrink-0" />
          <span>Integration API keys and secrets are securely vault-stored on backend environment runtime and never exposed to client applications.</span>
        </div>
      </div>

      {loading ? (
        <div className="py-16 text-center text-slate-400 animate-pulse">Checking integration statuses...</div>
      ) : error ? (
        <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">{error}</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {connectors.map((c) => (
            <div
              key={c.id}
              className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800/80 hover:border-slate-700 transition space-y-4 flex flex-col justify-between"
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="p-2.5 rounded-xl bg-slate-800/80 border border-slate-700/50">
                    {getCategoryIcon(c.category)}
                  </div>
                  {getStatusBadge(c)}
                </div>

                <div>
                  <h3 className="text-base font-bold text-white">{c.name}</h3>
                  <p className="text-xs text-slate-400 mt-1 line-clamp-2 leading-relaxed">{c.description}</p>
                </div>
              </div>

              {c.details && (
                <div className="pt-3 border-t border-slate-800/80 text-xs text-slate-400 font-mono space-y-1">
                  {Object.entries(c.details).map(([key, value]) => (
                    <div key={key} className="flex justify-between">
                      <span className="text-slate-500">{key}:</span>
                      <span className="text-slate-300">{String(value)}</span>
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
