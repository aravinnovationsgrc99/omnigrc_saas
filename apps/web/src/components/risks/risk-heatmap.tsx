'use client';

import React, { useEffect, useState } from 'react';
import { HeatmapSummaryDto, HeatmapCellDto, RiskScoreBand } from '@omnigrc/shared';
import { apiRequest } from '@/lib/api-client';

interface RiskHeatmapProps {
  onCellSelect: (likelihood: number, impact: number) => void;
  selectedLikelihood?: number | null;
  selectedImpact?: number | null;
}

const LIKELIHOOD_NAMES: Record<number, string> = {
  5: '5 · Almost Certain',
  4: '4 · Likely',
  3: '3 · Possible',
  2: '2 · Unlikely',
  1: '1 · Rare',
};

const IMPACT_NAMES: Record<number, string> = {
  1: '1 · Negligible',
  2: '2 · Minor',
  3: '3 · Moderate',
  4: '4 · Major',
  5: '5 · Severe',
};

export function RiskHeatmap({ onCellSelect, selectedLikelihood, selectedImpact }: RiskHeatmapProps) {
  const [heatmapData, setHeatmapData] = useState<HeatmapSummaryDto | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadHeatmap() {
      try {
        const data = await apiRequest<HeatmapSummaryDto>('/risks/heatmap-summary');
        setHeatmapData(data);
      } catch {
        setHeatmapData(null);
      } finally {
        setLoading(false);
      }
    }
    loadHeatmap();
  }, []);

  if (loading) {
    return (
      <div style={{
        padding: '40px 20px', background: '#FFFFFF', border: '1px solid #E2E6E4',
        borderRadius: 10, textAlign: 'center', color: '#8B95A1', fontSize: 13,
      }}>
        Loading risk heatmap matrix...
      </div>
    );
  }

  const getCellData = (likelihood: number, impact: number): HeatmapCellDto => {
    const score = likelihood * impact;
    const band = score >= 15 ? RiskScoreBand.HIGH : score >= 8 ? RiskScoreBand.MEDIUM : RiskScoreBand.LOW;
    const cell = heatmapData?.matrix?.find((c) => c.likelihood === likelihood && c.impact === impact);
    return {
      likelihood,
      impact,
      count: cell ? cell.count : 0,
      score,
      scoreBand: band,
    };
  };

  const getCellStyles = (scoreBand: RiskScoreBand, isSelected: boolean) => {
    let bg = '#E4F1F0';
    let text = '#0F6E6A';
    let border = '#BEE3E0';

    if (scoreBand === RiskScoreBand.HIGH) {
      bg = '#F8E6E8';
      text = '#B23A48';
      border = '#F1C7CC';
    } else if (scoreBand === RiskScoreBand.MEDIUM) {
      bg = '#FCEFD9';
      text = '#B5750A';
      border = '#F8E2BC';
    }

    return {
      background: isSelected ? text : bg,
      color: isSelected ? '#FFFFFF' : text,
      border: `2px solid ${isSelected ? text : border}`,
    };
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-6 mb-6 shadow-sm w-full max-w-full overflow-hidden">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
        <div>
          <h2 className="text-base font-bold text-slate-900">Likelihood × Impact Risk Heatmap</h2>
          <p className="text-xs text-slate-500 mt-1">
            Click any cell to filter the Risk Register table below to that specific risk level.
          </p>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap gap-3 text-xs font-semibold shrink-0">
          <div className="flex items-center gap-1.5">
            <span style={{ width: 12, height: 12, borderRadius: 3, background: '#E4F1F0', border: '1px solid #BEE3E0' }} />
            <span style={{ color: '#0F6E6A' }}>Low (1–6)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span style={{ width: 12, height: 12, borderRadius: 3, background: '#FCEFD9', border: '1px solid #F8E2BC' }} />
            <span style={{ color: '#B5750A' }}>Medium (8–12)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span style={{ width: 12, height: 12, borderRadius: 3, background: '#F8E6E8', border: '1px solid #F1C7CC' }} />
            <span style={{ color: '#B23A48' }}>High (15–25)</span>
          </div>
        </div>
      </div>

      <div className="w-full overflow-x-auto pb-2">
        <div style={{ minWidth: 540 }} className="flex gap-4">
          {/* Y-Axis Label */}
          <div style={{
            writingMode: 'vertical-rl', transform: 'rotate(180deg)', textAlign: 'center',
            fontSize: 12, fontWeight: 600, color: '#5B6672', textTransform: 'uppercase', letterSpacing: 1,
          }}>
            Likelihood →
          </div>

          <div style={{ flex: 1 }}>
            {/* 5x5 Grid */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[5, 4, 3, 2, 1].map((l) => (
                <div key={l} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{ width: 120, fontSize: 12, fontWeight: 500, color: '#5B6672', textAlign: 'right', paddingRight: 8 }} className="truncate shrink-0">
                    {LIKELIHOOD_NAMES[l]}
                  </span>
                  <div style={{ flex: 1, display: 'flex', gap: 8 }}>
                    {[1, 2, 3, 4, 5].map((imp) => {
                      const cell = getCellData(l, imp);
                      const isSelected = selectedLikelihood === l && selectedImpact === imp;
                      const styles = getCellStyles(cell.scoreBand, isSelected);

                      return (
                        <div
                          key={imp}
                          onClick={() => onCellSelect(l, imp)}
                          style={{
                            flex: 1, height: 56, borderRadius: 8, ...styles,
                            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                            cursor: 'pointer', transition: 'all .15s ease', padding: 4,
                          }}
                          title={`Likelihood: ${l}, Impact: ${imp} — ${cell.count} risks`}
                        >
                          <span className="omni-mono" style={{ fontSize: 13, fontWeight: 700 }}>
                            {cell.score}
                          </span>
                          <span style={{ fontSize: 10.5, opacity: 0.9, fontWeight: cell.count > 0 ? 700 : 400 }}>
                            {cell.count > 0 ? `${cell.count} risk${cell.count > 1 ? 's' : ''}` : '0'}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}

              {/* X-Axis Labels */}
              <div style={{ display: 'flex', gap: 8, marginTop: 4, paddingLeft: 128 }}>
                {[1, 2, 3, 4, 5].map((imp) => (
                  <div key={imp} style={{ flex: 1, textAlign: 'center', fontSize: 11, fontWeight: 500, color: '#5B6672' }} className="truncate">
                    {IMPACT_NAMES[imp]}
                  </div>
                ))}
              </div>
            </div>
            <div style={{ textAlign: 'center', fontSize: 12, fontWeight: 600, color: '#5B6672', textTransform: 'uppercase', letterSpacing: 1, marginTop: 12 }}>
              Impact →
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
