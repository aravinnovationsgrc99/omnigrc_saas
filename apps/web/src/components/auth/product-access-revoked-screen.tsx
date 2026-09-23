'use client';

import React from 'react';
import { ShieldAlert, ArrowRight } from 'lucide-react';

interface Props {
  onReturnToLogin: () => void;
}

export function ProductAccessRevokedScreen({ onReturnToLogin }: Props) {
  return (
    <div className="min-h-screen bg-[#0A111F] text-white flex flex-col items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-md bg-[#16233F] border border-red-500/40 rounded-2xl p-8 shadow-2xl text-center">
        <div className="w-16 h-16 rounded-2xl bg-red-500/20 text-red-400 flex items-center justify-center mx-auto mb-6 border border-red-500/30 shadow-lg">
          <ShieldAlert size={32} />
        </div>

        <h2 className="text-xl font-bold text-white mb-3 tracking-tight">Access Suspended or Revoked</h2>

        <p className="text-xs text-slate-300 mb-6 leading-relaxed bg-[#0A111F] border border-[#2B3A5A] p-4 rounded-xl text-left">
          Product access for this organization has been suspended or revoked by an Organization Administrator.
        </p>

        <button
          type="button"
          onClick={onReturnToLogin}
          className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-white font-semibold rounded-xl text-xs flex items-center justify-center gap-1.5 transition-all border border-slate-700"
        >
          <span>Return to Sign In</span>
          <ArrowRight size={14} />
        </button>
      </div>
    </div>
  );
}
