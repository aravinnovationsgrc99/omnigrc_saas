'use client';

import React from 'react';
import { Lock, Mail, ArrowRight, ShieldAlert } from 'lucide-react';

interface Props {
  onReturnToLogin: () => void;
}

export function OrganizationNotLicensedScreen({ onReturnToLogin }: Props) {
  return (
    <div className="min-h-screen bg-[#0A111F] text-white flex flex-col items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-md bg-[#16233F] border border-amber-500/40 rounded-2xl p-8 shadow-2xl text-center">
        {/* Icon */}
        <div className="w-16 h-16 rounded-2xl bg-amber-500/20 text-amber-400 flex items-center justify-center mx-auto mb-6 border border-amber-500/30 shadow-lg">
          <Lock size={32} />
        </div>

        {/* Title */}
        <h2 className="text-xl font-bold text-white mb-3 tracking-tight">Organization Not Licensed</h2>

        {/* Safe User-Facing Message */}
        <p className="text-xs text-slate-300 mb-6 leading-relaxed bg-[#0A111F] border border-[#2B3A5A] p-4 rounded-xl text-left">
          Your organization is not currently licensed for OMNiGRC. Please contact your organization's administrator or Arav Innovations.
        </p>

        {/* Action Buttons */}
        <div className="space-y-3">
          <a
            href="mailto:support@aravinnovations.com?subject=OMNiGRC%20Organization%20License%20Inquiry"
            className="w-full py-3 bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-500 hover:to-amber-600 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 transition-all shadow-lg"
          >
            <Mail size={15} />
            <span>Contact Administrator / Arav Innovations</span>
          </a>

          <button
            type="button"
            onClick={onReturnToLogin}
            className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white font-semibold rounded-xl text-xs flex items-center justify-center gap-1.5 transition-all border border-slate-700"
          >
            <span>Return to Sign In</span>
            <ArrowRight size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
