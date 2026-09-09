'use client';

import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface InlineErrorStateProps {
  title?: string;
  message: string;
  onRetry?: () => void;
}

export function InlineErrorState({
  title = 'Failed to load data',
  message,
  onRetry,
}: InlineErrorStateProps) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 12,
        padding: '14px 18px',
        borderRadius: 8,
        background: '#FDF2F4',
        border: '1px solid #F3C6CB',
        color: '#801F2B',
        margin: '16px 0',
      }}
      role="alert"
    >
      <AlertTriangle size={20} color="#B23A48" style={{ marginTop: 2, flexShrink: 0 }} />
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: '#801F2B', marginBottom: 3 }}>
          {title}
        </div>
        <div style={{ fontSize: 13, color: '#5B6672', lineHeight: 1.4 }}>{message}</div>
      </div>
      {onRetry && (
        <button
          onClick={onRetry}
          className="omni-btn-ghost"
          style={{
            borderColor: '#F3C6CB',
            color: '#801F2B',
            padding: '6px 12px',
            fontSize: 12.5,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <RefreshCw size={13} /> Retry
        </button>
      )}
    </div>
  );
}
