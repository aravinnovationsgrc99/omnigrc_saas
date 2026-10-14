'use client';

import React, { useState, useEffect } from 'react';
import { apiRequest } from '@/lib/api-client';
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
  GitMerge,
  KanbanSquare,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Lock,
  ArrowUpRight,
  ClipboardCheck,
  MinusCircle,
} from 'lucide-react';

interface WorkflowLifecyclePanelProps {
  resourceType: string;
  resourceId: string;
  onNavigateView?: (view: string) => void;
  onNavigateToView?: (view: string) => void;
  collapsible?: boolean;
  defaultExpanded?: boolean;
  titleOverride?: string;
}

export function WorkflowLifecyclePanel({
  resourceType,
  resourceId,
  onNavigateView,
  onNavigateToView,
  collapsible = false,
  defaultExpanded = true,
  titleOverride,
}: WorkflowLifecyclePanelProps) {
  const navigate = onNavigateToView || onNavigateView;
  const [lifecycle, setLifecycle] = useState<GrcLifecycleDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  const fetchLifecycle = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiRequest<GrcLifecycleDto>(`/api/v1/workflow/lifecycle/${resourceType}/${resourceId}`);
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
      <div className="p-6 text-center text-slate-400 dark:text-slate-500 animate-pulse bg-slate-900/60 border border-slate-800 rounded-xl">
        <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-teal-600 dark:text-teal-400" />
        Synchronizing GRC Workflow Lifecycle...
      </div>
    );
  }

  if (error || !lifecycle) {
    return (
      <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center justify-between">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
          <span>{error || 'Lifecycle data unavailable for this resource.'}</span>
        </div>
        <button
          onClick={fetchLifecycle}
          className="text-xs px-2.5 py-1 rounded bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 font-semibold transition"
        >
          Retry
        </button>
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
      case 'NOT_APPLICABLE':
        return <MinusCircle className="w-4 h-4 text-slate-500 dark:text-slate-400 flex-shrink-0 ml-0.5" />;
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
    <div
      data-testid="workflow-lifecycle-panel"
      className="bg-slate-900/70 border border-slate-800 rounded-xl p-5 backdrop-blur-md shadow-xl text-slate-100 space-y-5"
    >
      {/* Header Banner */}
      <div className="flex items-center justify-between pb-4 border-b border-slate-800 gap-3">
        <div className="flex items-center space-x-3 min-w-0">
          <div className="w-10 h-10 rounded-lg bg-teal-500/10 border border-teal-500/20 flex items-center justify-center text-teal-400 font-bold shrink-0">
            GRC
          </div>
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-white flex items-center gap-2 truncate">
              <span className="truncate">{titleOverride || lifecycle.resourceTitle}</span>
              <span className="text-xs px-2 py-0.5 rounded-full font-mono bg-slate-800 text-slate-300 border border-slate-700 shrink-0">
                {lifecycle.resourceType}
              </span>
            </h3>
            <p className="text-xs text-slate-400 flex items-center gap-1.5 mt-0.5">
              <span>Authoritative Status:</span>
              <span className="font-semibold text-teal-400">{lifecycle.authoritativeStatus}</span>
              {lifecycle.isBlocked && (
                <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30">
                  BLOCKED
                </span>
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={fetchLifecycle}
            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors text-xs flex items-center gap-1 cursor-pointer"
            title="Refresh Lifecycle Status"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Sync</span>
          </button>
          {collapsible && (
            <button
              onClick={() => setIsExpanded((prev) => !prev)}
              className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors text-xs flex items-center gap-1 cursor-pointer"
              title={isExpanded ? 'Collapse panel' : 'Expand panel'}
            >
              {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          )}
        </div>
      </div>

      {/* Collapsed Compact Strip */}
      {collapsible && !isExpanded && (
        <div className="flex items-center justify-between text-xs py-1 text-slate-300">
          <div className="flex items-center gap-2">
            {lifecycle.isBlocked ? (
              <span className="text-rose-400 flex items-center gap-1 font-semibold">
                <AlertTriangle className="w-3.5 h-3.5" /> Blocked: {lifecycle.blockedReason}
              </span>
            ) : lifecycle.nextAction ? (
              <span className="text-teal-300 flex items-center gap-1 font-semibold">
                <Clock className="w-3.5 h-3.5" /> Next Action: {lifecycle.nextAction.title}
              </span>
            ) : (
              <span className="text-emerald-400 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" /> Lifecycle Operating Authoritatively
              </span>
            )}
          </div>
          <button
            onClick={() => setIsExpanded(true)}
            className="text-teal-400 hover:underline text-xs flex items-center gap-1 cursor-pointer"
          >
            View Details <ChevronDown className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Expanded Main Panel Content */}
      {(!collapsible || isExpanded) && (
        <>
          {/* 1. Authoritative Next Action Banner */}
          {lifecycle.nextAction && (
            <div
              data-testid="lifecycle-next-action-card"
              className={`p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-all shadow-md ${
                lifecycle.nextAction.isBlocked || lifecycle.nextAction.priority === 'CRITICAL'
                  ? 'bg-gradient-to-r from-rose-950/60 to-rose-900/40 border-rose-500/40 text-rose-100'
                  : lifecycle.nextAction.actionType === 'LIFECYCLE_COMPLETE'
                  ? 'bg-gradient-to-r from-emerald-950/60 to-emerald-900/40 border-emerald-500/40 text-emerald-100'
                  : 'bg-gradient-to-r from-teal-950/60 to-cyan-950/40 border-teal-500/40 text-teal-100'
              }`}
            >
              <div className="space-y-1.5 flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider font-mono border ${
                      lifecycle.nextAction.isBlocked || lifecycle.nextAction.priority === 'CRITICAL'
                        ? 'bg-rose-500/20 text-rose-300 border-rose-500/30'
                        : lifecycle.nextAction.actionType === 'LIFECYCLE_COMPLETE'
                        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                        : 'bg-teal-500/20 text-teal-300 border-teal-500/30'
                    }`}
                  >
                    {lifecycle.nextAction.isBlocked ? 'ACTION REQUIRED • BLOCKER' : `NEXT ACTION • ${lifecycle.nextAction.priority}`}
                  </span>

                  {lifecycle.nextAction.responsibleParty && (
                    <span className="text-[10px] text-slate-300 bg-slate-800/80 border border-slate-700 px-2 py-0.5 rounded-full flex items-center gap-1">
                      <span>Responsible:</span>
                      <strong className="text-white">{lifecycle.nextAction.responsibleParty}</strong>
                    </span>
                  )}
                </div>

                <h4 className="text-sm font-bold text-white flex items-center gap-1.5">
                  {lifecycle.nextAction.isBlocked ? (
                    <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                  ) : lifecycle.nextAction.actionType === 'LIFECYCLE_COMPLETE' ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  ) : (
                    <Clock className="w-4 h-4 text-teal-400 shrink-0" />
                  )}
                  {lifecycle.nextAction.title}
                </h4>

                <p className="text-xs text-slate-300/90 leading-relaxed max-w-2xl">
                  {lifecycle.nextAction.description}
                </p>
              </div>

              {lifecycle.nextAction.targetView && navigate && lifecycle.nextAction.actionType !== 'LIFECYCLE_COMPLETE' && (
                <button
                  onClick={() => {
                    if (lifecycle.nextAction?.targetView && navigate) {
                      navigate(lifecycle.nextAction.targetView);
                    }
                  }}
                  className={`px-3.5 py-2 text-xs font-bold rounded-lg transition-all shrink-0 flex items-center gap-1.5 shadow-sm cursor-pointer ${
                    lifecycle.nextAction.isBlocked
                      ? 'bg-rose-600 hover:bg-rose-500 text-white'
                      : 'bg-teal-600 hover:bg-teal-500 text-white'
                  }`}
                >
                  <span>{lifecycle.nextAction.buttonLabel || 'Take Action'}</span>
                  <ArrowUpRight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}

          {/* 2. Prerequisites Checklist */}
          {lifecycle.prerequisites && (
            <div
              data-testid="lifecycle-prerequisites-card"
              className="p-4 rounded-xl bg-slate-800/40 border border-slate-700/60 space-y-3"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ClipboardCheck className="w-4 h-4 text-teal-400" />
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                    Workflow Prerequisites Checklist
                  </h4>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <span className="font-mono text-slate-300">
                    {lifecycle.prerequisites.satisfiedCount} / {lifecycle.prerequisites.totalCount} Satisfied
                  </span>
                  <div className="w-16 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-teal-400 transition-all duration-300"
                      style={{
                        width: `${Math.round((lifecycle.prerequisites.satisfiedCount / lifecycle.prerequisites.totalCount) * 100)}%`,
                      }}
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                {lifecycle.prerequisites.items.map((item) => (
                  <div
                    key={item.id}
                    className={`p-2.5 rounded-lg border text-xs flex items-start gap-2.5 ${
                      item.isSatisfied
                        ? 'bg-slate-900/60 border-slate-700 text-slate-300'
                        : 'bg-rose-500/10 border-rose-500/30 text-rose-200'
                    }`}
                  >
                    {item.isSatisfied ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    ) : (
                      <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-white flex items-center justify-between gap-1">
                        <span className="truncate">{item.title}</span>
                        {item.responsibleParty && (
                          <span className="text-[10px] text-slate-400 font-normal shrink-0">
                            {item.responsibleParty}
                          </span>
                        )}
                      </div>
                      {item.reason && (
                        <p className={`text-[11px] mt-0.5 leading-snug ${item.isSatisfied ? 'text-slate-400' : 'text-rose-300 font-medium'}`}>
                          {item.reason}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 3. Blocker Alert Banner (Preserved for backward-compat) */}
          {lifecycle.isBlocked && !lifecycle.nextAction && (
            <div className="p-3.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-2.5">
              <Lock className="w-4 h-4 text-rose-400 flex-shrink-0 mt-0.5" />
              <div>
                <span className="font-bold text-rose-200">Lifecycle Currently Blocked: </span>
                {lifecycle.blockedReason || 'Action required to proceed to authoritative completion.'}
              </div>
            </div>
          )}

          {/* 4. Framework Reference Link */}
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
                  className="text-xs text-teal-400 hover:underline flex items-center gap-0.5 cursor-pointer"
                >
                  Library <ArrowUpRight className="w-3 h-3" />
                </button>
              )}
            </div>
          )}

          {/* 5. End-to-End Workflow Timeline */}
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
                    {stage.blockerReason && (
                      <p className="text-[10px] text-rose-300 font-medium mt-1 flex items-center gap-1 bg-rose-500/10 border border-rose-500/30 px-2 py-0.5 rounded w-fit">
                        <AlertTriangle className="w-3 h-3 text-rose-400 flex-shrink-0" />
                        <span>Blocker: {stage.blockerReason}</span>
                      </p>
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

          {/* 6. Subsystem Integration Cards */}
          <div className={`grid grid-cols-1 md:grid-cols-2 ${lifecycle.testing ? 'lg:grid-cols-4' : 'lg:grid-cols-3'} gap-3 pt-2`}>
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
                  <ShieldCheck className="w-3.5 h-3.5 text-cyan-400" /> Governance Approvals
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

            {/* Action Plans / Remediation */}
            <div className="p-3 rounded-lg bg-slate-800/40 border border-slate-700/60 space-y-2">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-300">
                <span className="flex items-center gap-1.5">
                  <KanbanSquare className="w-3.5 h-3.5 text-amber-400" /> Action Plans & Remediation
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

            {/* Control Testing & Effectiveness Subsystem Card */}
            {lifecycle.testing && (
              <div className="p-3 rounded-lg bg-slate-800/40 border border-slate-700/60 space-y-2">
                <div className="flex items-center justify-between text-xs font-semibold text-slate-300">
                  <span className="flex items-center gap-1.5">
                    <ClipboardCheck className="w-3.5 h-3.5 text-teal-400" /> Control Testing
                  </span>
                  <span className="text-[10px] text-slate-400">
                    {!lifecycle.testing.isAvailable ? 'Disabled' : `${lifecycle.testing.totalTests} Tests`}
                  </span>
                </div>

                {!lifecycle.testing.isAvailable ? (
                  <div className="text-[11px] text-slate-500 italic p-1.5 rounded bg-slate-900/60 border border-slate-800 flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                    Audits capability disabled
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <div className="text-[11px] p-1.5 rounded bg-slate-900/60 border border-slate-800 flex items-center justify-between">
                      <span className="text-slate-400">Effectiveness:</span>
                      <span
                        className={`text-[9px] px-1.5 py-0.5 rounded font-mono font-semibold ${
                          lifecycle.testing.effectivenessStatus === 'EFFECTIVE'
                            ? 'bg-emerald-500/20 text-emerald-300'
                            : lifecycle.testing.effectivenessStatus === 'PARTIALLY_EFFECTIVE'
                            ? 'bg-amber-500/20 text-amber-300'
                            : lifecycle.testing.effectivenessStatus === 'INEFFECTIVE'
                            ? 'bg-rose-500/20 text-rose-300'
                            : 'bg-slate-700 text-slate-300'
                        }`}
                      >
                        {lifecycle.testing.effectivenessStatus}
                      </span>
                    </div>

                    <div className="text-[11px] p-1.5 rounded bg-slate-900/60 border border-slate-800 flex items-center justify-between">
                      <span className="text-slate-400">Latest Test:</span>
                      <span className="text-slate-200 font-mono text-[10px]">
                        {lifecycle.testing.latestResult || 'None'}
                      </span>
                    </div>

                    {lifecycle.testing.unresolvedFindingsCount > 0 && (
                      <div className="text-[10px] p-1 rounded bg-rose-500/10 border border-rose-500/30 text-rose-300 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3 text-rose-400 flex-shrink-0" />
                        <span>{lifecycle.testing.unresolvedFindingsCount} Open Findings</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
