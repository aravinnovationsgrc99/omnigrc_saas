'use client';

import React, { useState } from 'react';
import { OverviewMetricsDto, RiskHeatmapItemDto, HeatmapCellDto, HeatmapCellDetailsDto } from '@omnigrc/shared';
import { apiRequest } from '@/lib/api-client';
import { ShieldAlert, ExternalLink, ChevronRight, AlertTriangle, CheckCircle2, User, Box, Loader2 } from 'lucide-react';
import { AnimatedCountUp } from '@/components/ui/animated-count-up';

interface RiskHeatmapWidgetProps {
  metrics: OverviewMetricsDto;
  onNavigateToView?: (view: string) => void;
}

export function RiskHeatmapWidget({ metrics, onNavigateToView }: RiskHeatmapWidgetProps) {
  const heatmapData = metrics.risks?.heatmap;
  const matrix = heatmapData?.matrix || [];

  const [selectedCell, setSelectedCell] = useState<HeatmapCellDto | null>(null);
  const [cellDetails, setCellDetails] = useState<HeatmapCellDetailsDto | null>(null);
  const [loadingDetails, setLoadingDetails] = useState<boolean>(false);

  // Helper to find matrix cell for given Likelihood (1..5) and Impact (1..5)
  const getCell = (likelihood: number, impact: number): HeatmapCellDto | undefined => {
    return matrix.find((c) => c.likelihood === likelihood && c.impact === impact);
  };

  const handleSelectCell = async (cell: HeatmapCellDto) => {
    setSelectedCell(cell);
    if (cell.count === 0) {
      setCellDetails(null);
      return;
    }

    try {
      setLoadingDetails(true);
      const res = await apiRequest<HeatmapCellDetailsDto>(
        `/metrics/risks/heatmap-cell?likelihood=${cell.likelihood}&impact=${cell.impact}`,
      );
      setCellDetails(res);
    } catch {
      setCellDetails(null);
    } finally {
      setLoadingDetails(false);
    }
  };

  // Helper for cell color styling based on Likelihood x Impact score
  const getCellBg = (likelihood: number, impact: number, count: number, isSelected: boolean) => {
    const score = likelihood * impact;
    if (isSelected) {
      return 'ring-2 ring-teal-600 ring-offset-1 z-10 font-bold bg-slate-900 text-white shadow-md';
    }
    if (count === 0) {
      return 'bg-slate-50 text-slate-400 hover:bg-slate-100 border-slate-200/80';
    }
    if (score >= 15) {
      return 'bg-rose-500 text-white font-bold hover:bg-rose-600 border-rose-600 shadow-2xs';
    }
    if (score >= 8) {
      return 'bg-amber-400 text-slate-950 font-bold hover:bg-amber-500 border-amber-500 shadow-2xs';
    }
    return 'bg-emerald-500 text-white font-bold hover:bg-emerald-600 border-emerald-600 shadow-2xs';
  };

  const activeRisks = cellDetails?.items || selectedCell?.risks || [];
  const displayTotal = cellDetails?.total ?? selectedCell?.count ?? 0;

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-2xs hover:shadow-md transition-shadow flex flex-col justify-between h-full">
      <div>
        {/* Header */}
        <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-rose-50 border border-rose-100 rounded-lg text-rose-600 shrink-0">
              <ShieldAlert size={18} />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Risk Heatmap</h3>
              <p className="text-xs text-slate-500">5×5 Likelihood vs Impact Matrix</p>
            </div>
          </div>
          <button
            onClick={() => onNavigateToView?.('risk')}
            className="text-xs font-semibold text-teal-700 hover:text-teal-800 flex items-center gap-1 hover:underline shrink-0"
            title="Open Risk Register"
          >
            <span>Register</span>
            <ChevronRight size={14} />
          </button>
        </div>

        {/* 5x5 Matrix Container */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-[11px] font-semibold text-slate-500 px-1">
            <span>Likelihood ↑</span>
            <span className="text-[10px] uppercase tracking-wider text-slate-400">Impact →</span>
          </div>

          <div className="grid grid-cols-6 gap-1.5 text-center">
            {/* Header row for Impact scale 1 to 5 */}
            <div className="text-[10px] font-bold text-slate-400 flex items-center justify-center"></div>
            {[1, 2, 3, 4, 5].map((imp) => (
              <div key={imp} className="text-[10px] font-bold text-slate-500 omni-mono">
                I{imp}
              </div>
            ))}

            {/* Matrix rows: Likelihood 5 down to 1 */}
            {[5, 4, 3, 2, 1].map((l) => (
              <React.Fragment key={l}>
                <div className="text-[10px] font-bold text-slate-500 flex items-center justify-center omni-mono">
                  L{l}
                </div>
                {[1, 2, 3, 4, 5].map((i) => {
                  const cell = getCell(l, i);
                  const count = cell?.count || 0;
                  const isSelected =
                    selectedCell?.likelihood === l && selectedCell?.impact === i;

                  return (
                    <button
                      key={`${l}-${i}`}
                      type="button"
                      onClick={() => cell && handleSelectCell(cell)}
                      className={`h-8 sm:h-9 rounded-md border text-xs flex items-center justify-center transition-all cursor-pointer ${getCellBg(
                        l,
                        i,
                        count,
                        isSelected,
                      )}`}
                      title={`Likelihood ${l} × Impact ${i} (Score ${l * i}): ${count} risks`}
                      aria-label={`Likelihood ${l} Impact ${i}, ${count} risks`}
                    >
                      {count > 0 ? count : '·'}
                    </button>
                  );
                })}
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* Legend */}
        <div className="flex items-center justify-around gap-2 mt-4 pt-3 border-t border-slate-100 text-[10px] text-slate-600 font-medium">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-xs bg-rose-500"></span>
            <span>High (15-25)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-xs bg-amber-400"></span>
            <span>Medium (8-14)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-xs bg-emerald-500"></span>
            <span>Low (1-7)</span>
          </div>
        </div>
      </div>

      {/* Cell Drill-down Panel */}
      <div className="mt-4">
        {loadingDetails ? (
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs text-center text-slate-600 flex items-center justify-center gap-2">
            <Loader2 size={14} className="animate-spin text-teal-700" />
            <span>Fetching risk details for cell...</span>
          </div>
        ) : selectedCell && selectedCell.count > 0 ? (
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs space-y-2 omni-fade-in">
            <div className="flex items-center justify-between border-b border-slate-200 pb-2">
              <span className="font-semibold text-slate-900 flex items-center gap-1.5">
                <AlertTriangle size={13} className="text-amber-600" />
                Likelihood {selectedCell.likelihood} × Impact {selectedCell.impact} (Score {selectedCell.score})
              </span>
              <span className="px-2 py-0.5 bg-slate-200 text-slate-800 font-bold text-[10px] rounded-full omni-mono">
                {displayTotal} {displayTotal === 1 ? 'Risk' : 'Risks'}
              </span>
            </div>

            <div className="max-h-36 overflow-y-auto space-y-1.5 pr-1 omni-scroll">
              {activeRisks.map((r) => (
                <div
                  key={r.id}
                  onClick={() => onNavigateToView?.('risk')}
                  className="p-2 bg-white border border-slate-200 rounded-md hover:border-teal-400 hover:shadow-2xs transition-all cursor-pointer flex items-start justify-between gap-2"
                >
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-800 truncate text-[11px]">{r.title}</p>
                    <div className="flex items-center gap-2 text-[10px] text-slate-500 mt-0.5">
                      <span className="flex items-center gap-0.5">
                        <User size={10} /> {r.owner}
                      </span>
                      {r.assetName && (
                        <span className="flex items-center gap-0.5 truncate">
                          <Box size={10} /> {r.assetName}
                        </span>
                      )}
                    </div>
                  </div>
                  <span className="shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-sm bg-rose-50 text-rose-700 border border-rose-200 omni-mono">
                    Score {r.score}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : selectedCell && selectedCell.count === 0 ? (
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs text-center text-slate-500 omni-fade-in">
            Zero risks registered at Likelihood {selectedCell.likelihood} × Impact {selectedCell.impact}.
          </div>
        ) : (
          <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-[11px] text-slate-500 text-center">
            Click any matrix cell above to view underlying risk records.
          </div>
        )}
      </div>
    </div>
  );
}
