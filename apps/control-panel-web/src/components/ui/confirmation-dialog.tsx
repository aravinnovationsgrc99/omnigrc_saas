'use client';

import React, { useState, useEffect, useRef } from 'react';
import { AlertOctagon, X, Loader2 } from 'lucide-react';

export interface ConfirmationDialogProps {
  isOpen: boolean;
  title: string;
  explanation: string;
  consequence?: string;
  confirmationPhrase?: string;
  reasonRequired?: boolean;
  confirmButtonText?: string;
  confirmVariant?: 'danger' | 'warning' | 'primary';
  isLoading?: boolean;
  errorMessage?: string | null;
  onConfirm: (reason?: string) => Promise<void> | void;
  onCancel: () => void;
}

export function ConfirmationDialog({
  isOpen,
  title,
  explanation,
  consequence,
  confirmationPhrase,
  reasonRequired = false,
  confirmButtonText = 'Confirm Action',
  confirmVariant = 'danger',
  isLoading = false,
  errorMessage = null,
  onConfirm,
  onCancel,
}: ConfirmationDialogProps) {
  const [typedPhrase, setTypedPhrase] = useState('');
  const [reason, setReason] = useState('');
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (isOpen) {
      setTypedPhrase('');
      setReason('');
      cancelButtonRef.current?.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isOpen && e.key === 'Escape') {
        onCancel();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  const isPhraseValid = !confirmationPhrase || typedPhrase.trim().toUpperCase() === confirmationPhrase.toUpperCase();
  const isReasonValid = !reasonRequired || reason.trim().length >= 10;
  const canSubmit = isPhraseValid && isReasonValid && !isLoading;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (canSubmit) {
      onConfirm(reasonRequired ? reason.trim() : undefined);
    }
  };

  const buttonStyle =
    confirmVariant === 'danger'
      ? 'bg-rose-600 hover:bg-rose-700 text-white disabled:bg-rose-950 disabled:text-rose-700'
      : confirmVariant === 'warning'
      ? 'bg-amber-600 hover:bg-amber-700 text-white disabled:bg-amber-950 disabled:text-amber-700'
      : 'bg-aravBlue-600 hover:bg-aravBlue-700 text-white disabled:bg-cpDark-800 disabled:text-gray-500';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="dialog-title"
    >
      <div
        ref={dialogRef}
        className="w-full max-w-lg rounded-lg border border-cpDark-700 bg-cpDark-900 p-6 shadow-2xl"
      >
        <div className="flex items-start justify-between border-b border-cpDark-800 pb-4">
          <div className="flex items-center gap-3">
            <div
              className={`rounded-md p-2 ${
                confirmVariant === 'danger'
                  ? 'bg-rose-950 text-rose-400 border border-rose-800'
                  : 'bg-amber-950 text-amber-400 border border-amber-800'
              }`}
            >
              <AlertOctagon className="h-5 w-5" aria-hidden="true" />
            </div>
            <h3 id="dialog-title" className="text-lg font-bold text-white">
              {title}
            </h3>
          </div>
          <button
            onClick={onCancel}
            disabled={isLoading}
            className="rounded p-1 text-gray-400 hover:bg-cpDark-800 hover:text-white focus-ring"
            aria-label="Close confirmation dialog"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <p className="text-sm leading-relaxed text-gray-300">{explanation}</p>

          {consequence && (
            <div className="rounded-md border border-rose-900/60 bg-rose-950/30 p-3 text-xs text-rose-300">
              <span className="font-semibold uppercase tracking-wider text-rose-400 block mb-1">Consequence:</span>
              {consequence}
            </div>
          )}

          {reasonRequired && (
            <div>
              <label htmlFor="action-reason" className="block text-xs font-medium text-gray-300 mb-1">
                Operational Audit Reason <span className="text-rose-400">*</span>
              </label>
              <textarea
                id="action-reason"
                rows={2}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Provide documented reason for audit logs..."
                required
                disabled={isLoading}
                className="w-full rounded-md border border-cpDark-700 bg-cpDark-950 p-2.5 text-xs text-white placeholder-gray-500 focus-ring font-mono"
              />
              {reasonRequired && reason.trim().length > 0 && reason.trim().length < 10 && (
                <span className="text-[11px] text-amber-400">Reason must be at least 10 characters.</span>
              )}
            </div>
          )}

          {confirmationPhrase && (
            <div>
              <label htmlFor="confirm-phrase" className="block text-xs font-medium text-gray-300 mb-1">
                Type <code className="rounded bg-cpDark-800 px-1 py-0.5 font-mono text-amber-300">{confirmationPhrase}</code> to confirm:
              </label>
              <input
                id="confirm-phrase"
                type="text"
                value={typedPhrase}
                onChange={(e) => setTypedPhrase(e.target.value)}
                placeholder={`Type "${confirmationPhrase}"`}
                disabled={isLoading}
                className="w-full rounded-md border border-cpDark-700 bg-cpDark-950 p-2.5 text-xs font-mono text-white placeholder-gray-500 focus-ring"
              />
            </div>
          )}

          {errorMessage && (
            <div className="rounded-md border border-rose-800 bg-rose-950/80 p-3 text-xs text-rose-200">
              {errorMessage}
            </div>
          )}

          <div className="mt-6 flex justify-end gap-3 border-t border-cpDark-800 pt-4">
            <button
              ref={cancelButtonRef}
              type="button"
              onClick={onCancel}
              disabled={isLoading}
              className="rounded-md border border-cpDark-700 bg-cpDark-800 px-4 py-2 text-xs font-medium text-gray-300 hover:bg-cpDark-700 focus-ring"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!canSubmit}
              className={`inline-flex items-center gap-2 rounded-md px-4 py-2 text-xs font-semibold focus-ring transition-colors ${buttonStyle}`}
            >
              {isLoading && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
              <span>{confirmButtonText}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
