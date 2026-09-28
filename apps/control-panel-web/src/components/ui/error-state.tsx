import React from 'react';
import { AlertCircle, Lock, RefreshCw, ShieldAlert, WifiOff } from 'lucide-react';

interface ErrorStateProps {
  statusCode?: number;
  title?: string;
  message: string;
  correlationId?: string;
  onRetry?: () => void;
}

export function ErrorState({ statusCode, title, message, correlationId, onRetry }: ErrorStateProps) {
  let IconComponent = AlertCircle;
  let defaultTitle = 'An Error Occurred';
  let badgeText = statusCode ? `HTTP ${statusCode}` : 'Error';

  if (statusCode === 403) {
    IconComponent = Lock;
    defaultTitle = 'Access Denied';
  } else if (statusCode === 409) {
    IconComponent = ShieldAlert;
    defaultTitle = 'State Conflict / Sequence Skew';
  } else if (statusCode === 503) {
    IconComponent = WifiOff;
    defaultTitle = 'Control Plane Service Unavailable';
  }

  return (
    <div
      className="rounded-lg border border-rose-900/60 bg-rose-950/30 p-6 text-gray-200"
      role="alert"
      aria-live="assertive"
    >
      <div className="flex items-start gap-4">
        <div className="rounded-md bg-rose-900/40 p-2.5 text-rose-400">
          <IconComponent className="w-6 h-6" aria-hidden="true" />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-semibold text-white">{title || defaultTitle}</h3>
            <span className="rounded bg-rose-950 border border-rose-800 px-2 py-0.5 text-xs font-mono text-rose-300">
              {badgeText}
            </span>
          </div>
          <p className="mt-1.5 text-sm text-gray-300 leading-relaxed">{message}</p>

          {correlationId && (
            <div className="mt-3 font-mono text-xs text-gray-400 flex items-center gap-1.5">
              <span className="text-gray-500">Request Correlation ID:</span>
              <code className="rounded bg-cpDark-900 px-1.5 py-0.5 border border-cpDark-700 text-gray-300">
                {correlationId}
              </code>
            </div>
          )}

          {onRetry && (
            <button
              onClick={onRetry}
              className="mt-4 inline-flex items-center gap-2 rounded-md bg-cpDark-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-cpDark-700 focus-ring border border-cpDark-700 transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Retry Operation</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
