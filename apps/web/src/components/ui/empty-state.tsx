'use client';

import React from 'react';
import { LucideIcon, Inbox } from 'lucide-react';

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  actionLabel,
  onAction,
}: EmptyStateProps) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '48px 24px',
        textAlign: 'center',
        background: '#FFFFFF',
        border: '1px border-dashed #D6DAD7',
        borderRadius: 10,
        margin: '16px 0',
      }}
    >
      <div
        style={{
          width: 48,
          height: 48,
          borderRadius: '50%',
          background: '#F4F6F5',
          color: '#0F6E6A',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 14,
        }}
      >
        <Icon size={24} />
      </div>
      <h3 style={{ fontSize: 16, fontWeight: 600, color: '#1B2430', marginBottom: 6 }}>{title}</h3>
      <p style={{ fontSize: 13.5, color: '#5B6672', maxWidth: 380, lineHeight: 1.5, marginBottom: actionLabel && onAction ? 18 : 0 }}>
        {description}
      </p>
      {actionLabel && onAction && (
        <button className="omni-btn-primary" onClick={onAction}>
          {actionLabel}
        </button>
      )}
    </div>
  );
}
