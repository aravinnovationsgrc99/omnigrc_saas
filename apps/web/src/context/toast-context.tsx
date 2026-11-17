'use client';

import React, { createContext, useContext, useState, useCallback } from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export type ToastInput =
  | string
  | {
      message?: string;
      text?: string;
      msg?: string;
      title?: string;
      type?: ToastType | string;
      [key: string]: any;
    };

export interface ToastItem {
  id: string;
  message: string;
  type: ToastType;
}

interface ToastContextType {
  showToast: (messageOrOptions: ToastInput, type?: ToastType | string) => void;
  addToast: (messageOrOptions: ToastInput, type?: ToastType | string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const showToast = useCallback((messageOrOptions: ToastInput, typeArg?: ToastType | string) => {
    let resolvedMessage = '';
    let resolvedType: ToastType = 'success';

    if (typeof messageOrOptions === 'string') {
      resolvedMessage = messageOrOptions;
      if (typeArg) {
        resolvedType = (typeArg === 'warning' ? 'warning' : typeArg) as ToastType;
      }
    } else if (messageOrOptions && typeof messageOrOptions === 'object') {
      resolvedMessage =
        messageOrOptions.message ||
        messageOrOptions.text ||
        messageOrOptions.msg ||
        messageOrOptions.title ||
        JSON.stringify(messageOrOptions);
      const objType = messageOrOptions.type || typeArg || 'success';
      resolvedType = objType as ToastType;
    } else {
      resolvedMessage = String(messageOrOptions || '');
    }

    if (!['success', 'error', 'info', 'warning'].includes(resolvedType)) {
      resolvedType = 'info';
    }

    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, message: String(resolvedMessage), type: resolvedType }]);

    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3500);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ showToast, addToast: showToast }}>

      {children}
      {/* Toast Render Portal Container */}
      <div
        style={{
          position: 'fixed',
          bottom: 24,
          right: 24,
          zIndex: 9999,
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          pointerEvents: 'none',
        }}
        aria-live="polite"
        aria-atomic="true"
      >
        {toasts.map((toast) => {
          const isSuccess = toast.type === 'success';
          const isError = toast.type === 'error';
          const isWarning = toast.type === 'warning';

          const bgColor = isSuccess ? '#E4F1F0' : isError ? '#F8E6E8' : isWarning ? '#FEF3C7' : '#EDEFED';
          const borderColor = isSuccess ? '#0F6E6A' : isError ? '#B23A48' : isWarning ? '#D97706' : '#8B95A1';
          const textColor = isSuccess ? '#0C5A56' : isError ? '#801F2B' : isWarning ? '#92400E' : '#1B2430';

          return (
            <div
              key={toast.id}
              className="omni-fade-in"
              style={{
                pointerEvents: 'auto',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '10px 16px',
                borderRadius: 8,
                background: bgColor,
                border: `1px solid ${borderColor}`,
                color: textColor,
                fontSize: 13.5,
                fontWeight: 600,
                boxShadow: '0 8px 24px rgba(15,23,42,0.12)',
                minWidth: 260,
                maxWidth: 420,
              }}
            >
              {isSuccess && <CheckCircle2 size={18} color="#0F6E6A" className="shrink-0" />}
              {isError && <AlertCircle size={18} color="#B23A48" className="shrink-0" />}
              {isWarning && <AlertCircle size={18} color="#D97706" className="shrink-0" />}
              {!isSuccess && !isError && !isWarning && <Info size={18} color="#5B6672" className="shrink-0" />}
              <span style={{ flex: 1 }}>{toast.message}</span>
              <button
                onClick={() => removeToast(toast.id)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, display: 'flex' }}
                aria-label="Dismiss toast"
              >
                <X size={14} color={textColor} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}
