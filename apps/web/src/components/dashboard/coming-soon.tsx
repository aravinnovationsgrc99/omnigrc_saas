'use client';

import React from 'react';
import { GitMerge } from 'lucide-react';

interface ComingSoonProps {
  label: string;
  phase: string;
}

export function ComingSoon({ label, phase }: ComingSoonProps) {
  return (
    <div className="omni-fade-in" style={{
      padding: '28px 32px', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', height: '70vh', textAlign: 'center',
    }}>
      <div style={{
        width: 52, height: 52, borderRadius: 12, background: '#E4F1F0',
        display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16,
      }}>
        <GitMerge size={22} color="#0F6E6A" />
      </div>
      <h2 style={{ fontSize: 16, fontWeight: 600 }}>{label} opens in {phase}</h2>
      <p style={{ fontSize: 13, color: '#5B6672', marginTop: 6, maxWidth: 320 }}>
        This workspace is scaffolded in the navigation but not yet built.
      </p>
    </div>
  );
}
