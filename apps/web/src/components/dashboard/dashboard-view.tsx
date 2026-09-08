'use client';

import React, { useState, useEffect } from 'react';
import { Sparkles, ArrowRight, CheckCircle2, Circle } from 'lucide-react';
import { useAuth } from '@/context/auth-context';
import { apiRequest } from '@/lib/api-client';

export const BUILD_PHASES = [
  { id: 1, name: 'Foundation', desc: 'Shell, navigation, auth, design system', done: true },
  { id: 2, name: 'Asset & Inventory', desc: 'Assets and vendors that risks & controls reference', done: true },
  { id: 3, name: 'Risk Register', desc: 'Risk log, likelihood × impact heatmap, treatment plans', done: true },
  { id: 4, name: 'Control Mapping', desc: 'AI-assisted mapping, framework citations, sign-off', done: false },
  { id: 5, name: 'Compliance Board', desc: 'Kanban, due-dates, 30/60/90 dashboard', done: false },
  { id: 6, name: 'Cross-cutting', desc: 'Audit log, RBAC, regional settings, live metrics', done: false },
  { id: 7, name: 'Polish', desc: 'Search, notifications, empty/error states, mobile', done: false },
];

function StatStripItem({ label, value, last }: { label: string; value: string | number; last?: boolean }) {
  return (
    <div style={{
      flex: 1, padding: '16px 22px', borderRight: last ? 'none' : '1px solid #E2E6E4',
    }}>
      <div className="omni-mono" style={{ fontSize: 24, fontWeight: 600, color: '#16233F' }}>{value}</div>
      <div style={{ fontSize: 12, color: '#5B6672', marginTop: 3 }}>{label}</div>
    </div>
  );
}

function RoadmapRow({ phase, isCurrent }: { phase: (typeof BUILD_PHASES)[0]; isCurrent: boolean }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 0',
      borderBottom: '1px solid #EDEFED',
    }}>
      {phase.done ? (
        <CheckCircle2 size={17} color="#0F6E6A" style={{ marginTop: 1, flexShrink: 0 }} />
      ) : (
        <Circle size={17} color={isCurrent ? '#B5750A' : '#8B95A1'} style={{ marginTop: 1, flexShrink: 0 }} />
      )}
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13.5, fontWeight: 600, color: phase.done ? '#1B2430' : '#5B6672' }}>
            Phase {phase.id} — {phase.name}
          </span>
          {isCurrent && (
            <span style={{
              fontSize: 10, fontWeight: 700, color: '#B5750A', background: '#FCEFD9',
              padding: '2px 7px', borderRadius: 999, textTransform: 'uppercase', letterSpacing: 0.4,
            }}>
              Next
            </span>
          )}
        </div>
        <div style={{ fontSize: 12.5, color: '#8B95A1', marginTop: 2 }}>{phase.desc}</div>
      </div>
    </div>
  );
}

export function DashboardView() {
  const { user } = useAuth();
  const firstName = user?.name?.split(' ')[0] || 'User';
  const [assetCount, setAssetCount] = useState<number | string>(0);
  const [openRiskCount, setOpenRiskCount] = useState<number | string>(0);
  const nextPhase = BUILD_PHASES.find((p) => !p.done);

  useEffect(() => {
    async function fetchCounts() {
      try {
        const [assetRes, riskRes] = await Promise.all([
          apiRequest<{ count: number }>('/assets/count').catch(() => ({ count: 0 })),
          apiRequest<{ count: number }>('/risks/open-count').catch(() => ({ count: 0 })),
        ]);
        setAssetCount(assetRes.count);
        setOpenRiskCount(riskRes.count);
      } catch {
        setAssetCount(0);
        setOpenRiskCount(0);
      }
    }
    fetchCounts();
  }, []);

  return (
    <div className="omni-fade-in" style={{ padding: '28px 32px', maxWidth: 1080 }}>
      <div style={{ marginBottom: 22 }}>
        <h1 style={{ fontSize: 21, fontWeight: 600 }}>Welcome, {firstName}</h1>
        <p style={{ fontSize: 13.5, color: '#5B6672', marginTop: 3 }}>
          This is the foundation build — the workspaces below come online as each phase ships.
        </p>
      </div>

      {/* stat strip */}
      <div style={{
        display: 'flex', background: '#FFFFFF', border: '1px solid #E2E6E4', borderRadius: 10,
        marginBottom: 24, overflow: 'hidden',
      }}>
        <StatStripItem label="Open risks" value={openRiskCount} />
        <StatStripItem label="Assets tracked" value={assetCount} />
        <StatStripItem label="Controls mapped" value="0" />
        <StatStripItem label="Tasks due this week" value="0" last />
      </div>

      <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
        {/* build roadmap */}
        <div style={{
          flex: 1.4, background: '#FFFFFF', border: '1px solid #E2E6E4', borderRadius: 10, padding: '18px 22px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <Sparkles size={15} color="#0F6E6A" />
            <h2 style={{ fontSize: 14.5, fontWeight: 600 }}>Build roadmap</h2>
          </div>
          <p style={{ fontSize: 12.5, color: '#8B95A1', marginBottom: 6 }}>
            Live status of this foundation build, phase by phase.
          </p>
          <div>
            {BUILD_PHASES.map((p) => (
              <RoadmapRow key={p.id} phase={p} isCurrent={Boolean(nextPhase && p.id === nextPhase.id)} />
            ))}
          </div>
        </div>

        {/* getting started / what's next */}
        <div style={{
          flex: 1, background: '#16233F', borderRadius: 10, padding: '20px 22px', color: '#fff',
        }}>
          <h2 style={{ fontSize: 14.5, fontWeight: 600, marginBottom: 6 }}>What's next</h2>
          <p style={{ fontSize: 12.5, color: '#B9C2CE', lineHeight: 1.6, marginBottom: 16 }}>
            {nextPhase
              ? `Phase ${nextPhase.id} adds ${nextPhase.name} — ${nextPhase.desc.toLowerCase()}.`
              : 'All phases shipped.'}
          </p>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, fontWeight: 600,
            color: '#0F6E6A', cursor: 'default',
          }}>
            Ask to continue building <ArrowRight size={13} />
          </div>
        </div>
      </div>
    </div>
  );
}
