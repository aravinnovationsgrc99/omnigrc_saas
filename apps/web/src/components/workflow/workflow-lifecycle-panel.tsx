'use client';

import React, { useState, useEffect } from 'react';
import {
  GrcLifecycleDto,
  GrcLifecycleStageDto,
} from '@omnigrc/shared';
import {
  CheckCircle2,
  Clock,
  AlertTriangle,
  XCircle,
  ShieldCheck,
  FileArchive,
  Sparkles,
  GitMerge,
  KanbanSquare,
  ChevronRight,
  RefreshCw,
  Lock,
  ArrowUpRight,
} from 'lucide-react';

interface WorkflowLifecyclePanelProps {
  resourceType: string;
  resourceId: string;
  onNavigateView?: (view: string) => void;
}

export function WorkflowLifecyclePanel({
  resourceType,
  resourceId,
  onNavigateView,
}: WorkflowLifecyclePanelProps) {
  const [lifecycle, setLifecycle] = useState<GrcLifecycleDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchLifecycle = async () => {
    setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem('omnigrc_token') || '';
      const res = await fetch(`/api/v1/workflow/lifecycle/${resourceType}/${resourceId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        throw new Error(`Failed to load lifecycle status (${res.status})`);
      }
      const data = await res.json();
      setLifecycle(data);
    } catch (err: any) {
      setError(err.message || 'Error fetching lifecycle');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLifecycle();
  }, [resourceType, resourceId]);

  if (loading) {
    return (
      <div className="p-6 text-center text-slate-400 dark:text-slate-500 animate-pulse">
        <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-teal-600 dark:text-teal-400" />
        Synchronizing GRC Workflow Lifecycle...
      </div>
    );
  }

  if (error || !lifecycle) {
    return (
      <div className="p-4 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-sm">
        <AlertTriangle className="w-4 h-4 inline mr-2" />
        {error || 'Lifecycle data unavailable'}
      </div>
    );
  }

  const getStageIcon = (status: GrcLifecycleStageDto['status']) => {
    switch (status) {
      case 'COMPLETED':
        return <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />;
      case 'IN_PROGRESS':
        return <Clock className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 animate-pulse" />;
      case 'BLOCKED':
        return <XCircle className="w-5 h-5 text-rose-600 dark:text-rose-400 flex-shrink-0" />;
      case 'WARNING':
        return <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0" />;
      default:
        return <div className="w-2.5 h-2.5 rounded-full bg-slate-400 dark:bg-slate-600 flex-shrink-0 ml-1.5" />;
    }
  };

  const getStageBadgeClass = (status: GrcLifecycleStageDto['status']) => {
    switch (status) {
      case 'COMPLETED':
        return 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30';
      case 'IN_PROGRESS':
        return 'bg-cyan-500/10 text-cyan-700 dark:text-cyan-300 border-cyan-500/30';
      case 'BLOCKED':
        return 'bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/30';
      case 'WARNING':
        return 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30';
      default:
        return 'bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20';
    }
  };

  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5 backdrop-blur-md shadow-xl text-slate-100 space-y-6">
      {/* Header Banner */}
      <div className="flex items-center justify-between pb-4 border-b border-slate-800">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-lg bg-teal-500/10 border border-teal-500/20 flex items-center justify-center text-teal-400 font-bold">
            GRC
          </div>
          <div>
            <h3 className="text-base font-semibold text-white flex items-center gap-2">
              {lifecycle.resourceTitle}
              <span className="text-xs px-2 py-0.5 rounded-full font-mono bg-slate-800 text-slate-300 border border-slate-700">
                {lifecycle.resourceType}
              </span>
            </h3>
            <p className="text-xs text-slate-400">
              Authoritative Status:{' '}
              <span className="font-semibold text-teal-400">{lifecycle.authoritativeStatus}</span>
            </p>
          </div>
        </div>
        <button
          onClick={fetchLifecycle}
          className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors text-xs flex items-center gap-1"
          title="Refresh Lifecycle Status"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Sync
        </button>
      </div>

      {/* Blocker Alert Banner */}
      {lifecycle.isBlocked && (
        <div className="p-3.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-2.5">
          <Lock className="w-4 h-4 text-rose-400 flex-shrink-0 mt-0.5" />
          <div>
            <span className="font-bold text-rose-200">Lifecycle Currently Blocked: </span>
            {lifecycle.blockedReason || 'Action required to proceed to authoritative completion.'}
          </div>
        </div>
      )}

      {/* Framework Reference Link */}
      {lifecycle.frameworkReference && (
        <div className="p-3 rounded-lg bg-slate-800/80 border border-slate-700 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <GitMerge className="w-4 h-4 text-teal-400" />
            <div>
              <span className="font-semibold text-teal-300">
                {lifecycle.frameworkReference.frameworkCode} {lifecycle.frameworkReference.identifier}:
              </span>{' '}
              <span className="text-slate-300">{lifecycle.frameworkReference.title}</span>
            </div>
          </div>
          {onNavigateView && (
            <button
              onClick={() => onNavigateView('frameworks')}
              className="text-xs text-teal-400 hover:underline flex items-center gap-0.5"
            >
              Library <ArrowUpRight className="w-3 h-3" />
            </button>
          )}
        </div>
      )}

      {/* Lifecycle Timeline */}
      <div className="space-y-3">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
          End-to-End Workflow Lifecycle
        </h4>
        <div className="relative pl-6 space-y-4 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-800">
          {lifecycle.stages.map((stage, idx) => (
            <div key={idx} className="relative flex items-start justify-between group">
              {/* Timeline Node Icon */}
              <div className="absolute -left-6 top-0.5 bg-slate-900 rounded-full p-0.5">
                {getStageIcon(stage.status)}
              </div>

              <div className="flex-1 pr-4">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-slate-200">{stage.label}</span>
                </div>
                {stage.details && (
                  <p className="text-[11px] text-slate-400 mt-0.5">{stage.details}</p>
                )}
              </div>

              <span
                className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${getStageBadgeClass(
                  stage.status,
                )}`}
              >
                {stage.status.replace('_', ' ')}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Subsystem Integration Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
        {/* Evidence Vault Status */}
        <div className="p-3 rounded-lg bg-slate-800/40 border border-slate-700/60 space-y-2">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-300">
            <span className="flex items-center gap-1.5">
              <FileArchive className="w-3.5 h-3.5 text-teal-400" /> Evidence Vault
            </span>
            <span className="text-[10px] text-slate-400">{lifecycle.evidences.length} Attached</span>
          </div>
          {lifecycle.evidences.length === 0 ? (
            <p className="text-[11px] text-slate-500 italic">No evidence items linked</p>
          ) : (
            <div className="space-y-1 max-h-24 overflow-y-auto omni-scroll pr-1">
              {lifecycle.evidences.map((ev) => (
                <div
                  key={ev.id}
                  className="text-[11px] p-1.5 rounded bg-slate-900/60 border border-slate-800 flex items-center justify-between"
                >
                  <span className="truncate max-w-[110px] text-slate-300">{ev.title}</span>
                  <span
                    className={`text-[9px] px-1.5 py-0.5 rounded font-mono ${
                      ev.scanStatus === 'CLEAN'
                        ? 'bg-emerald-500/20 text-emerald-300'
                        : 'bg-rose-500/20 text-rose-300'
                    }`}
                  >
                    {ev.scanStatus}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Approvals Engine */}
        <div className="p-3 rounded-lg bg-slate-800/40 border border-slate-700/60 space-y-2">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-300">
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-cyan-400" /> Approvals Engine
            </span>
            <span className="text-[10px] text-slate-400">{lifecycle.approvals.length} Workflows</span>
          </div>
          {lifecycle.approvals.length === 0 ? (
            <p className="text-[11px] text-slate-500 italic">No approval instance triggered</p>
          ) : (
            <div className="space-y-1 max-h-24 overflow-y-auto omni-scroll pr-1">
              {lifecycle.approvals.map((app) => (
                <div
                  key={app.id}
                  className="text-[11px] p-1.5 rounded bg-slate-900/60 border border-slate-800 flex items-center justify-between"
                >
                  <span className="truncate max-w-[110px] text-slate-300">{app.title}</span>
                  <span className="text-[9px] px-1.5 py-0.5 rounded font-mono bg-cyan-500/20 text-cyan-300">
                    {app.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Action Items / Remediation */}
        <div className="p-3 rounded-lg bg-slate-800/40 border border-slate-700/60 space-y-2">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-300">
            <span className="flex items-center gap-1.5">
              <KanbanSquare className="w-3.5 h-3.5 text-amber-400" /> Action Plans
            </span>
            <span className="text-[10px] text-slate-400">{lifecycle.remediations.length} Actions</span>
          </div>
          {lifecycle.remediations.length === 0 ? (
            <p className="text-[11px] text-slate-500 italic">No action plan items</p>
          ) : (
            <div className="space-y-1 max-h-24 overflow-y-auto omni-scroll pr-1">
              {lifecycle.remediations.map((rem) => (
                <div
                  key={rem.id}
                  className="text-[11px] p-1.5 rounded bg-slate-900/60 border border-slate-800 flex items-center justify-between"
                >
                  <span className="truncate max-w-[110px] text-slate-300">{rem.title}</span>
                  <span
                    className={`text-[9px] px-1.5 py-0.5 rounded font-mono ${
                      rem.isOverdue ? 'bg-rose-500/20 text-rose-300 animate-pulse' : 'bg-amber-500/20 text-amber-300'
                    }`}
                  >
                    {rem.isOverdue ? 'OVERDUE' : rem.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
