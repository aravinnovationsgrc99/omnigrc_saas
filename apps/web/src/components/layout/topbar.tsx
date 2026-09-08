'use client';

import React, { useState } from 'react';
import { Building2, ChevronDown, LogOut } from 'lucide-react';
import { useAuth } from '@/context/auth-context';

export function Topbar() {
  const { user, organization, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  const userName = user?.name || 'User';
  const orgName = organization?.name || 'Workspace';
  const roleName = user?.role || 'ANALYST';

  const initials = userName
    .split(' ')
    .map((s) => s[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <div style={{
      height: 56, minHeight: 56, borderBottom: '1px solid #E2E6E4', background: '#FFFFFF',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 22px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, fontWeight: 500, color: '#1B2430' }}>
        <Building2 size={15} color="#5B6672" />
        {orgName}
        <span style={{ color: '#8B95A1', fontWeight: 400 }}>· Pilot workspace</span>
      </div>

      <div style={{ position: 'relative' }}>
        <div
          onClick={() => setMenuOpen((v) => !v)}
          style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', padding: '6px 8px', borderRadius: 6 }}
        >
          <div style={{
            width: 28, height: 28, borderRadius: '50%', background: '#E4F1F0', color: '#0F6E6A',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11.5, fontWeight: 700,
          }}>
            {initials}
          </div>
          <div style={{ lineHeight: 1.2 }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{userName}</div>
            <div style={{ fontSize: 11, color: '#8B95A1' }}>{roleName}</div>
          </div>
          <ChevronDown size={14} color="#8B95A1" />
        </div>

        {menuOpen && (
          <div style={{
            position: 'absolute', right: 0, top: 44, background: '#fff', border: '1px solid #E2E6E4',
            borderRadius: 8, boxShadow: '0 6px 20px rgba(20,30,40,0.10)', width: 172, overflow: 'hidden', zIndex: 20,
          }}>
            <div
              onClick={logout}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', fontSize: 13,
                color: '#B23A48', cursor: 'pointer',
              }}
            >
              <LogOut size={14} /> Sign out
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
