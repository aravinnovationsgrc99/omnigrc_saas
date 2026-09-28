import React from 'react';
import { Clock, Shield } from 'lucide-react';
import { StatusBadge } from './status-badge';

interface PlaceholderPageProps {
  title: string;
  description: string;
  phaseLabel?: string;
}

export function PlaceholderPage({ title, description, phaseLabel = 'CP-6.2+' }: PlaceholderPageProps) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between border-b border-cpDark-800 pb-4">
        <div>
          <h1 className="text-xl font-bold text-white tracking-tight">{title}</h1>
          <p className="text-xs text-gray-400 font-mono mt-0.5">{description}</p>
        </div>
        <StatusBadge status="PENDING" label={`Target Phase: ${phaseLabel}`} />
      </div>

      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-cpDark-700 bg-cpDark-900/40 p-12 text-center">
        <div className="rounded-full bg-cpDark-800 border border-cpDark-700 p-4 text-aravBlue-400 mb-4">
          <Clock className="w-8 h-8" aria-hidden="true" />
        </div>
        <h2 className="text-lg font-bold text-white mb-2">{title} Management Foundation</h2>
        <p className="max-w-md text-sm text-gray-400 mb-6">
          This Control Panel interface will be activated in a subsequent Control Panel implementation phase.
          All underlying platform APIs in <code className="text-gray-300 font-mono text-xs">apps/control-plane-api</code> are fully secured and authoritative.
        </p>

        <div className="flex items-center gap-2 rounded-md border border-cpDark-800 bg-cpDark-950 px-4 py-2 font-mono text-xs text-gray-400">
          <Shield className="w-4 h-4 text-emerald-400" aria-hidden="true" />
          <span>No unverified frontend mock data. Real API integration pending CP-6.2 release.</span>
        </div>
      </div>
    </div>
  );
}
